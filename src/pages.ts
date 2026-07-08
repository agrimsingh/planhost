import { htmlEscape, type PlanMeta } from "./lib";

function fmtWhen(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function expiredPage(meta: PlanMeta, hasMd: boolean): string {
  const title = htmlEscape(meta.title || meta.id);
  const mdBlock = hasMd
    ? `<p><a href="/p/${htmlEscape(meta.id)}/source.md">Download last markdown sidecar</a> (may still be available briefly).</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Expired — ${title}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      max-width: 40rem;
      margin: 4rem auto;
      padding: 0 1.25rem;
      color: CanvasText;
      background: Canvas;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0.5rem 0; color: color-mix(in oklab, CanvasText 75%, transparent); }
    code { font-size: 0.9em; }
    a { color: inherit; }
  </style>
</head>
<body>
  <h1>This plan link expired</h1>
  <p><strong>${title}</strong></p>
  <p>Created ${htmlEscape(fmtWhen(meta.createdAt))} · expired ${htmlEscape(fmtWhen(meta.expiresAt))}</p>
  <p>Planhost keeps shares temporary on purpose. If this still matters, ask Agrim for an export (markdown / PDF / repo), not a permanent URL.</p>
  ${mdBlock}
  <p><code>/p/${htmlEscape(meta.id)}</code></p>
</body>
</html>`;
}

export function notFoundPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not found</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      max-width: 40rem;
      margin: 4rem auto;
      padding: 0 1.25rem;
    }
  </style>
</head>
<body>
  <h1>Not found</h1>
  <p>No plan at this URL.</p>
</body>
</html>`;
}
