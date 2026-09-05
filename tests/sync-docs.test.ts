import { describe, expect, it } from "vitest";
import { extractDocPaths, localPathFor, remoteUrlFor, stripTags } from "../scripts/sync-docs";

/** A trimmed slice of the shape mcp.swiggy.com/builders/llms.txt actually serves. */
const SAMPLE = `# Swiggy Builders Club

> Build AI agents on top of Swiggy's MCP stack.

## Docs

- [Build](https://mcp.swiggy.com/builders/docs/build/index.md): Recipes and patterns.
- [Pay with UPI end-to-end](https://mcp.swiggy.com/builders/docs/build/recipes/pay-with-upi.md): The shared UPI Payment stage.
- [confirm_order](https://mcp.swiggy.com/builders/docs/reference/food/confirm_order.md):
- [cancel_booking](https://mcp.swiggy.com/builders/docs/reference/dineout/cancel_booking.md):
- [Build](https://mcp.swiggy.com/builders/docs/build/index.md): listed twice upstream.
- [Model Context Protocol](https://modelcontextprotocol.io): not a Swiggy page.
- [Rendered HTML](https://mcp.swiggy.com/builders/docs/operate/sla): no .md suffix.

## Blog

- [Pay in Chat](https://mcp.swiggy.com/builders/blog/2026-07-10-mcp-payments-upi.md): UPI payments.
`;

describe("extractDocPaths", () => {
  it("returns every documented page once, sorted, without the .md suffix", () => {
    expect(extractDocPaths(SAMPLE)).toEqual([
      "build/index",
      "build/recipes/pay-with-upi",
      "reference/dineout/cancel_booking",
      "reference/food/confirm_order",
    ]);
  });

  it("ignores blog posts, off-site links, and pages listed without a .md twin", () => {
    const paths = extractDocPaths(SAMPLE);
    expect(paths.some((p) => p.includes("blog"))).toBe(false);
    expect(paths).not.toContain("operate/sla");
  });

  it("refuses a path that would escape the vendored tree", () => {
    const evil = "- [x](https://mcp.swiggy.com/builders/docs/../../etc/passwd.md): no.";
    expect(extractDocPaths(evil)).toEqual([]);
  });

  it("finds nothing in text that lists no pages", () => {
    expect(extractDocPaths("# Swiggy\n\nNo links here.\n")).toEqual([]);
  });
});

describe("file mapping", () => {
  it("mirrors the upstream path under docs/swiggy/", () => {
    expect(localPathFor("reference/food/confirm_order")).toBe(
      "docs/swiggy/reference/food/confirm_order.md",
    );
    expect(localPathFor("build/recipes/pay-with-upi")).toBe(
      "docs/swiggy/build/recipes/pay-with-upi.md",
    );
  });

  it("fetches the .md twin of the rendered page", () => {
    expect(remoteUrlFor("start/authenticate")).toBe(
      "https://mcp.swiggy.com/builders/docs/start/authenticate.md",
    );
  });
});

describe("stripTags", () => {
  it("falls back to readable text when a page has no markdown twin", () => {
    const html =
      "<html><head><style>b{}</style></head><body><h1>Pay in Chat</h1>" +
      "<p>UPI &amp; QR<br>on any device</p><script>x()</script></body></html>";
    expect(stripTags(html)).toBe("Pay in Chat\nUPI & QR\non any device");
  });
});
