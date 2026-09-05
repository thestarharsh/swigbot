import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { messageOf } from "../lib/mcp/errors";

/**
 * Re-vendors the Swiggy Builders Club docs into `docs/swiggy/`. Swiggy serves
 * a `.md` twin of every page, and `llms.txt` is the only index of which pages
 * exist - the changelog is stale, so the link list is the source of truth.
 * No `./load-env` import: this script touches neither the database nor Swiggy
 * MCP itself, only the public docs site.
 */

const SITE = "https://mcp.swiggy.com/builders";
const INDEX_URL = `${SITE}/llms.txt`;
const OUT_DIR = "docs/swiggy";
/** Polite ceiling; the docs site is not a CDN we own. */
const CONCURRENCY = 4;

/**
 * Fetched by slug rather than read out of `llms.txt`: these two posts are the
 * authoritative description of the payments and address-GA behaviour the bot
 * codes against, and their vendored names carry the date for the same reason.
 */
const BLOG_POSTS = [
  { slug: "2026-07-10-mcp-payments-upi", file: "blog/2026-07-10-mcp-payments-upi.md" },
  { slug: "2026-08-24-create-address-ga", file: "blog/2026-08-24-create-address-ga.md" },
];

/**
 * Every documented page path, relative to `/builders/docs/` and without the
 * `.md` suffix (`reference/food/confirm_order`). Deduplicated and sorted, so
 * the fetch order - and the summary - is stable between runs.
 */
export function extractDocPaths(llmsText: string): string[] {
  const found = new Set<string>();
  const pattern = /https:\/\/mcp\.swiggy\.com\/builders\/docs\/([A-Za-z0-9._/-]+?)\.md/g;
  for (const match of llmsText.matchAll(pattern)) {
    const path = match[1];
    // A `..` segment would escape docs/swiggy/ when joined below.
    if (path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
      continue;
    }
    found.add(path);
  }
  return [...found].sort();
}

/** Where a documented page path is vendored, relative to the repo root. */
export function localPathFor(docPath: string): string {
  return join(OUT_DIR, `${docPath}.md`);
}

/** The `.md` twin Swiggy serves for a documented page path. */
export function remoteUrlFor(docPath: string): string {
  return `${SITE}/docs/${docPath}.md`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "text/markdown, text/plain, text/html" } });
  if (!res.ok) throw new Error(`GET ${url} returned HTTP ${res.status}`);
  const body = await res.text();
  // A markdown twin that silently fell back to the app shell is worse than a
  // hard failure: it would be vendored as if it were the real page.
  const contentType = res.headers.get("content-type") ?? "";
  return /html/i.test(contentType) ? stripTags(body) : body;
}

/** Last-resort readable text when a page has no markdown twin. */
export function stripTags(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Runs `worker` over `items`, at most `limit` in flight. */
async function pooled<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) await worker(items[i]);
  });
  await Promise.all(runners);
}

type Change = "added" | "updated" | "unchanged";

async function writeIfChanged(file: string, body: string): Promise<Change> {
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing === body) return "unchanged";
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body, "utf8");
  return existing == null ? "added" : "updated";
}

/** Every vendored file currently on disk, as repo-relative paths. */
async function vendoredFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(process.cwd(), join(e.parentPath, e.name)));
}

async function toolCount(server: string): Promise<number> {
  const files = await readdir(join(OUT_DIR, "reference", server)).catch(() => []);
  return files.filter((f) => f.endsWith(".md") && f !== "index.md").length;
}

async function main() {
  console.log(`Fetching ${INDEX_URL} …`);
  const llms = await fetchText(INDEX_URL);
  const docPaths = extractDocPaths(llms);
  console.log(`${docPaths.length} documented pages listed.`);

  const written = new Map<string, Change>();
  written.set(join(OUT_DIR, "llms.txt"), await writeIfChanged(join(OUT_DIR, "llms.txt"), llms));

  await pooled(docPaths, CONCURRENCY, async (docPath) => {
    const file = localPathFor(docPath);
    written.set(file, await writeIfChanged(file, await fetchText(remoteUrlFor(docPath))));
  });

  await pooled(BLOG_POSTS, CONCURRENCY, async ({ slug, file }) => {
    const out = join(OUT_DIR, file);
    // The blog serves `<slug>.md`; `<slug>/index.md` and the rendered HTML are
    // fallbacks for posts that predate the markdown twins.
    let body: string | null = null;
    for (const url of [`${SITE}/blog/${slug}.md`, `${SITE}/blog/${slug}/index.md`]) {
      body = await fetchText(url).catch(() => null);
      if (body) break;
    }
    body ??= await fetchText(`${SITE}/blog/${slug}`);
    written.set(out, await writeIfChanged(out, body));
  });

  const removed: string[] = [];
  for (const file of await vendoredFiles(OUT_DIR)) {
    if (written.has(file)) continue;
    await rm(file);
    removed.push(file);
  }

  const tally = (change: Change) => [...written.values()].filter((c) => c === change).length;
  console.log(
    `\nPages fetched: ${written.size} (added ${tally("added")}, updated ${tally("updated")}, ` +
      `unchanged ${tally("unchanged")}, removed ${removed.length})`,
  );
  for (const file of removed) console.log(`  removed ${file}`);

  const [food, instamart, dineout] = await Promise.all([
    toolCount("food"),
    toolCount("instamart"),
    toolCount("dineout"),
  ]);
  console.log(
    `Tools: Food ${food}, Instamart ${instamart}, Dineout ${dineout} - ` +
      `${food + instamart + dineout} total`,
  );
}

// Guarded, unlike the other scripts: the helpers above are unit-tested, and an
// unguarded main() would send the test run at the live docs site.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("✗ docs sync failed:", messageOf(err));
    process.exit(1);
  });
}
