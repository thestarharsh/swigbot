/**
 * Self-contained HTML for the OAuth callback result pages. No external
 * assets (fonts, images, scripts) - these must render instantly and work
 * under any CSP, straight from the route handler.
 */

export interface AuthPageOptions {
  variant: "success" | "error";
  title: string;
  message: string;
  /** Ordered "what next" steps rendered in the inset panel. */
  steps?: string[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderAuthPage(opts: AuthPageOptions): string {
  const ok = opts.variant === "success";
  const steps = opts.steps ?? [];

  const disc = ok
    ? `<div class="halo ok-halo"><svg class="disc" viewBox="0 0 96 96" role="img" aria-label="Success">
        <circle class="ring ok-ring" cx="48" cy="48" r="42"/>
        <path class="mark ok-mark" d="M30 49.5 L43 62 L67 36"/>
      </svg></div>`
    : `<div class="halo err-halo"><svg class="disc" viewBox="0 0 96 96" role="img" aria-label="Error">
        <circle class="ring err-ring" cx="48" cy="48" r="42"/>
        <path class="mark err-mark" d="M35 35 L61 61 M61 35 L35 61"/>
      </svg></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} · SwigBot</title>
<style>
  :root{
    --brand:#FF5200; --brand-soft:#FF7A2F;
    --ground:#FFF7F1; --card:#FFFFFF; --ink:#1C140F; --muted:#8A7365;
    --line:#F0E2D8; --inset:#FFF3EA;
    --ok:#1FA35C; --ok-soft:#E4F6EC;
    --err:#D93E30; --err-soft:#FCEAE8;
    --shadow:0 32px 70px -28px rgba(255,82,0,.30), 0 6px 20px -10px rgba(28,20,15,.12),
             inset 0 1px 0 rgba(255,255,255,.85);
  }
  @media (prefers-color-scheme: dark){
    :root{
      --ground:#171310; --card:#221B16; --ink:#F5EDE7; --muted:#B49B8C;
      --line:#382C23; --inset:#2B211A;
      --ok:#3ECF82; --ok-soft:#173226;
      --err:#FF6B5E; --err-soft:#3A211E;
      --shadow:0 32px 70px -28px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.04);
    }
  }
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background:
      radial-gradient(640px 320px at 50% -80px, color-mix(in srgb, var(--brand) 16%, transparent), transparent 70%),
      radial-gradient(520px 380px at 8% 108%, color-mix(in srgb, var(--brand-soft) 9%, transparent), transparent 72%),
      var(--ground);
    color:var(--ink);
    display:flex; align-items:center; justify-content:center; padding:24px;
    -webkit-font-smoothing:antialiased;
  }
  .card{
    width:100%; max-width:432px; background:var(--card);
    border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow);
    padding:40px 36px 30px; text-align:center;
    animation:rise .5s cubic-bezier(.2,.7,.2,1) both;
  }
  .eyebrow{
    font-size:11px; font-weight:700; letter-spacing:.18em; color:var(--muted);
    text-transform:uppercase;
  }
  .wordmark{
    margin-top:6px; font-size:26px; font-weight:800; letter-spacing:-.02em;
  }
  .wordmark b{color:var(--brand); font-weight:800}
  .halo{
    width:132px; height:132px; margin:24px auto 14px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
  }
  .ok-halo{background:radial-gradient(closest-side, var(--ok-soft), transparent)}
  .err-halo{background:radial-gradient(closest-side, var(--err-soft), transparent)}
  .disc{width:92px; height:92px; display:block}
  .ring{fill:none; stroke-width:6; stroke-linecap:round;
    stroke-dasharray:264; stroke-dashoffset:264;
    animation:draw .55s .15s ease-out forwards;
    transform:rotate(-90deg); transform-origin:50% 50%;
  }
  .mark{fill:none; stroke-width:7; stroke-linecap:round; stroke-linejoin:round;
    stroke-dasharray:80; stroke-dashoffset:80;
    animation:draw .35s .6s ease-out forwards;
  }
  .ok-ring{stroke:var(--ok)} .ok-mark{stroke:var(--ok)}
  .err-ring{stroke:var(--err)} .err-mark{stroke:var(--err)}
  h1{font-size:26px; font-weight:800; letter-spacing:-.018em; text-wrap:balance}
  .msg{
    margin:10px auto 0; max-width:36ch; font-size:15px; line-height:1.55;
    color:var(--muted); text-wrap:pretty;
  }
  .steps{
    margin-top:22px; text-align:left; background:var(--inset);
    border:1px solid var(--line); border-radius:14px; padding:16px 18px;
  }
  .steps p{
    font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
    color:var(--muted); margin-bottom:10px;
  }
  .steps ol{padding-left:20px; display:grid; gap:7px}
  .steps li{font-size:14px; line-height:1.5}
  .steps li::marker{color:var(--brand); font-weight:700}
  .foot{
    margin-top:24px; padding-top:16px; border-top:1px solid var(--line);
    font-size:12px; color:var(--muted);
  }
  .badge{
    display:inline-block; margin-top:22px; padding:7px 16px; border-radius:999px;
    font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  }
  .badge.ok{background:var(--ok-soft); color:var(--ok)}
  .badge.err{background:var(--err-soft); color:var(--err)}
  @keyframes rise{from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:none}}
  @keyframes draw{to{stroke-dashoffset:0}}
  @media (prefers-reduced-motion: reduce){
    .card{animation:none}
    .ring,.mark{animation:none; stroke-dashoffset:0}
  }
</style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">Swiggy Builders Club · MCP</div>
    <div class="wordmark">swigbot<b>.</b></div>
    ${disc}
    <h1>${escapeHtml(opts.title)}</h1>
    <p class="msg">${escapeHtml(opts.message)}</p>
    ${
      steps.length
        ? `<div class="steps"><p>What next</p><ol>${steps
            .map((s) => `<li>${escapeHtml(s)}</li>`)
            .join("")}</ol></div>`
        : ""
    }
    <span class="badge ${ok ? "ok" : "err"}">${ok ? "Account linked" : "Not linked yet"}</span>
    <div class="foot">Unofficial demo on Swiggy MCP · SwigBot confirms with you before every order</div>
  </main>
</body>
</html>`;
}
