# planhost

**Live:** https://plans.agrimsingh.com  
**Fallback:** https://planhost.agrim-singh.workers.dev

Ephemeral HTML plan sharing. Upload → get a URL → it dies in 7 days (or 90 with `--keep`). Not an archive — export MD yourself if it matters.

## Auth (hybrid)

Upload allowed if **either**:

1. `Authorization: Bearer <PLANHOST_TOKEN>` — for Cursor Cloud / headless
2. `X-GitHub-Token: <token>` — must resolve to an allowlisted login (`GITHUB_ALLOWLIST`, default `agrimsingh`)

Anyone can **GET** `/p/:id`. `noindex`. Soft expiry interstitial (410), not hard 404.

Token lives locally at `.planhost-token` / `.dev.vars` (gitignored). Paste the same value into Cursor Cloud secrets as `PLANHOST_TOKEN` once.

## Setup (already done)

R2 `planhost-plans`, KV `planhost-meta`, secret `PLANHOST_TOKEN`, custom domain `plans.agrimsingh.com`.

```bash
cd "/Users/agrim/Downloads/ai fun projects/planhost"
# local: gh auth is enough; CLI defaults to plans.agrimsingh.com
./bin/planhost.mjs push ./fixtures/smoke.html
```

Redeploy after code changes:

```bash
npx wrangler deploy
```

Rotate upload token:

```bash
TOKEN=$(openssl rand -hex 32)
echo "$TOKEN" | tee .planhost-token | npx wrangler secret put PLANHOST_TOKEN
printf 'PLANHOST_TOKEN=%s\n' "$TOKEN" > .dev.vars
chmod 600 .planhost-token .dev.vars
```

## CLI

```bash
./bin/planhost.mjs push ./plan.html
./bin/planhost.mjs push ./plan.html --md ./plan.md --keep

PLANHOST_TOKEN=$(cat .planhost-token) ./bin/planhost.mjs push ./plan.html
```

Stdout is **only** the URL (pipe-friendly). Expiry info goes to stderr.

## HTTP

```
POST /upload?keep=1
  Authorization: Bearer …  OR  X-GitHub-Token: …
  multipart: html=File, md=File?, title=string?
  → { url, id, expiresAtIso, … }

GET /p/:id           → HTML (or 410 expired page)
GET /p/:id/source.md → markdown sidecar if uploaded
GET /health          → tokenAuth / allowlist (no secrets)
```

## Limits

| | |
|--|--|
| Default TTL | 7 days |
| `--keep` TTL | 90 days |
| Max HTML | 5 MB |
| Max MD | 2 MB |

## Cursor Cloud

Project skill at `.cursor/skills/planhost/SKILL.md` is picked up by Cloud Agents when this repo (or a copy of that skill folder) is in the workspace.

Required Cloud secret:

- `PLANHOST_TOKEN` — value from local `.planhost-token` (never commit)
- optional `PLANHOST_URL=https://plans.agrimsingh.com`

Cloud agents should prefer the curl upload path in the skill (CLI path may not exist on the VM).
