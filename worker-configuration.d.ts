/**
 * Ambient Env for Worker handlers. Prefer importing { Env } from "./env" in modules.
 */
interface Env {
  PLANS: R2Bucket;
  META: KVNamespace;
  PLANHOST_TOKEN?: string;
  GITHUB_ALLOWLIST?: string;
  PUBLIC_BASE_URL?: string;
}
