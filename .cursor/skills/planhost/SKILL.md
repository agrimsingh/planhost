---
name: planhost
description: >-
  Upload HTML plans to planhost for shareable temporary URLs. Use when creating
  HTML plan docs, sharing plans externally, or when the user asks to host / push
  / publish a plan. Works for local agents and Cursor Cloud Agents.
---

# planhost

Share HTML plans via Agrim's planhost. Returns a public URL that expires in **7 days** (or **90** with keep). Not permanent storage — keep the markdown source if it must survive.

## Host

- **Primary:** `https://plans.agrimsingh.com`
- **Fallback:** `https://planhost.agrim-singh.workers.dev`

Do **not** paste `PLANHOST_TOKEN` or GitHub tokens into chat / commits.

## Auth

| Context | How |
|---------|-----|
| Local (Agrim's machine) | `gh auth token` via CLI, or `PLANHOST_TOKEN` / `.planhost-token` |
| Cursor Cloud / headless | **`PLANHOST_TOKEN` must be set** as a Cursor Cloud secret |

## Prefer CLI when available

If this repo is checked out and Node exists:

```bash
./bin/planhost.mjs push ./path/to/plan.html
./bin/planhost.mjs push ./path/to/plan.html --md ./path/to/plan.md --keep
```

- **Stdout** = share URL only → put that in the user-facing reply
- **Stderr** = expiry / auth method

## Cloud / portable upload (curl)

Use this when the CLI path is unavailable (typical Cloud Agent VM) or you only have the skill + secrets:

```bash
: "${PLANHOST_TOKEN:?PLANHOST_TOKEN missing — set it in Cursor Cloud secrets}"
BASE="${PLANHOST_URL:-https://plans.agrimsingh.com}"

curl -sS -X POST "${BASE}/upload" \
  -H "Authorization: Bearer ${PLANHOST_TOKEN}" \
  -F "html=@./path/to/plan.html;type=text/html" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);if(!j.url){console.error(d);process.exit(1)};console.log(j.url)})"
```

With markdown sidecar + 90d keep:

```bash
curl -sS -X POST "${BASE}/upload?keep=1" \
  -H "Authorization: Bearer ${PLANHOST_TOKEN}" \
  -F "html=@./path/to/plan.html;type=text/html" \
  -F "md=@./path/to/plan.md;type=text/markdown" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);if(!j.url){console.error(d);process.exit(1)};console.log(j.url)})"
```

Optional title: `-F "title=My plan title"`.

## When to use

1. Write the HTML plan (and ideally a sibling `.md`).
2. Upload with CLI or curl above.
3. Include the URL in your reply.

## Rules

- Default **7d** unless user asks for keep / longer → `?keep=1` / `--keep`.
- Prefer HTML **+** MD when you have both.
- Never commit tokens or print them.
- Don't invent a different host.
- After expiry: soft interstitial — re-upload / export if still needed.
