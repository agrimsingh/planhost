#!/usr/bin/env bash
# One-time Cloudflare bootstrap for planhost (free tier).
# Requires: npm i, `npx wrangler login`
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${PLANHOST_R2_BUCKET:-planhost-plans}"
KV_TITLE="${PLANHOST_KV_TITLE:-planhost-meta}"

echo "==> Creating R2 bucket: $BUCKET (ok if exists)"
npx wrangler r2 bucket create "$BUCKET" 2>/dev/null || true

echo "==> Creating KV namespace: $KV_TITLE"
set +e
KV_OUT="$(npx wrangler kv namespace create "$KV_TITLE" 2>&1)"
KV_STATUS=$?
set -e
echo "$KV_OUT"

KV_ID="$(echo "$KV_OUT" | grep -Eo '[a-f0-9]{32}' | head -1)"
if [[ -z "$KV_ID" ]]; then
  echo
  echo "Couldn't parse a new KV id (namespace may already exist)."
  echo "Run: npx wrangler kv namespace list"
  echo "Then put the id into wrangler.toml [[kv_namespaces]].id and uncomment R2/KV blocks."
  exit 1
fi

python3 - "$KV_ID" "$BUCKET" <<'PY'
import pathlib, sys
kv_id, bucket = sys.argv[1], sys.argv[2]
path = pathlib.Path("wrangler.toml")
text = f'''name = "planhost"
main = "src/index.ts"
compatibility_date = "2025-07-05"

[[r2_buckets]]
binding = "PLANS"
bucket_name = "{bucket}"

[[kv_namespaces]]
binding = "META"
id = "{kv_id}"

[vars]
PUBLIC_BASE_URL = "https://planhost.REPLACE.workers.dev"
GITHUB_ALLOWLIST = "agrimsingh"
'''
path.write_text(text)
print(f"Wrote {path} with R2={bucket} KV={kv_id}")
PY

echo
echo "Next:"
echo "  TOKEN=\$(openssl rand -hex 32)"
echo "  echo \"\$TOKEN\" | npx wrangler secret put PLANHOST_TOKEN"
echo "  # stash same TOKEN as Cursor Cloud secret PLANHOST_TOKEN"
echo "  npx wrangler deploy"
echo "  # copy workers.dev URL → PUBLIC_BASE_URL in wrangler.toml → redeploy"
echo "  export PLANHOST_URL=https://planhost.<sub>.workers.dev"
