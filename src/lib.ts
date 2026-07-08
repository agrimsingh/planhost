export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const KEEP_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_MD_BYTES = 2 * 1024 * 1024;

export type PlanMeta = {
  id: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  hasMd: boolean;
  uploadedBy: string;
};

export function htmlEscape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newPlanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseKeepFlag(value: string | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "keep";
}

export function ttlMs(keep: boolean): number {
  return keep ? KEEP_TTL_MS : DEFAULT_TTL_MS;
}

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

export function extractGithubToken(req: Request): string | null {
  return (
    req.headers.get("x-github-token")?.trim() ||
    req.headers.get("x-planhost-github-token")?.trim() ||
    null
  );
}

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

export function textHtml(body: string, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-content-type-options", "nosniff");
  return new Response(body, { status, headers });
}
