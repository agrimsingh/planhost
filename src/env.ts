export interface Env {
  PLANS: R2Bucket;
  META: KVNamespace;
  PLANHOST_TOKEN?: string;
  GITHUB_ALLOWLIST?: string;
  PUBLIC_BASE_URL?: string;
}
