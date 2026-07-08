import { authorizeUpload } from "./auth";
import type { Env } from "./env";
import {
  MAX_HTML_BYTES,
  MAX_MD_BYTES,
  json,
  newPlanId,
  parseKeepFlag,
  textHtml,
  ttlMs,
  type PlanMeta,
} from "./lib";
import { expiredPage, notFoundPage } from "./pages";

const META_PREFIX = "plan:";

function metaKey(id: string): string {
  return `${META_PREFIX}${id}`;
}

function htmlObjectKey(id: string): string {
  return `plans/${id}/index.html`;
}

function mdObjectKey(id: string): string {
  return `plans/${id}/source.md`;
}

function publicBase(env: Env, req: Request): string {
  if (env.PUBLIC_BASE_URL?.startsWith("http")) {
    return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  return new URL(req.url).origin;
}

function cacheHeaders(expiresAt: number, now: number): HeadersInit {
  const remainingSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const maxAge = Math.min(remainingSec, 300);
  return {
    "cache-control": `public, max-age=${maxAge}, must-revalidate`,
    "x-robots-tag": "noindex, nofollow",
    "x-content-type-options": "nosniff",
  };
}

async function readMeta(env: Env, id: string): Promise<PlanMeta | null> {
  const raw = await env.META.get(metaKey(id), "json");
  if (!raw || typeof raw !== "object") return null;
  return raw as PlanMeta;
}

async function writeMeta(env: Env, meta: PlanMeta): Promise<void> {
  const ttlSeconds = Math.max(
    60,
    Math.ceil((meta.expiresAt - Date.now()) / 1000) + 7 * 24 * 60 * 60,
  );
  // Keep KV around a week past expiry so soft interstitial still works.
  await env.META.put(metaKey(meta.id), JSON.stringify(meta), {
    expirationTtl: ttlSeconds,
  });
}

function guessTitle(html: string, fallback: string): string {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t.slice(0, 200) : fallback;
}

async function handleUpload(req: Request, env: Env): Promise<Response> {
  if (!env.PLANS || !env.META) {
    return json(
      {
        error:
          "R2/KV bindings missing. Create bucket + KV and uncomment wrangler.toml bindings.",
      },
      503,
    );
  }

  const auth = await authorizeUpload(req, env);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const url = new URL(req.url);
  const keep = parseKeepFlag(url.searchParams.get("keep"));
  const now = Date.now();
  const expiresAt = now + ttlMs(keep);

  const contentType = req.headers.get("content-type") || "";
  let htmlBytes: ArrayBuffer;
  let mdBytes: ArrayBuffer | null = null;
  let titleOverride: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const htmlPart = form.get("html") ?? form.get("file");
    if (!(htmlPart instanceof File)) {
      return json(
        { error: "multipart field `html` (File) required" },
        400,
      );
    }
    if (htmlPart.size > MAX_HTML_BYTES) {
      return json({ error: `html exceeds ${MAX_HTML_BYTES} bytes` }, 413);
    }
    htmlBytes = await htmlPart.arrayBuffer();

    const mdPart = form.get("md") ?? form.get("markdown");
    if (mdPart instanceof File) {
      if (mdPart.size > MAX_MD_BYTES) {
        return json({ error: `md exceeds ${MAX_MD_BYTES} bytes` }, 413);
      }
      mdBytes = await mdPart.arrayBuffer();
    }

    const titleField = form.get("title");
    if (typeof titleField === "string" && titleField.trim()) {
      titleOverride = titleField.trim().slice(0, 200);
    }
  } else {
    // Raw body = HTML. Optional MD via X-Planhost-Markdown (base64) is too cursed;
    // use multipart for sidecar.
    const len = Number(req.headers.get("content-length") || "0");
    if (len > MAX_HTML_BYTES) {
      return json({ error: `html exceeds ${MAX_HTML_BYTES} bytes` }, 413);
    }
    htmlBytes = await req.arrayBuffer();
    if (htmlBytes.byteLength > MAX_HTML_BYTES) {
      return json({ error: `html exceeds ${MAX_HTML_BYTES} bytes` }, 413);
    }
    const t = req.headers.get("x-planhost-title");
    if (t?.trim()) titleOverride = t.trim().slice(0, 200);
  }

  if (htmlBytes.byteLength === 0) {
    return json({ error: "empty html body" }, 400);
  }

  const htmlText = new TextDecoder().decode(htmlBytes);
  const id = newPlanId();
  const title = titleOverride ?? guessTitle(htmlText, id);

  await env.PLANS.put(htmlObjectKey(id), htmlBytes, {
    httpMetadata: {
      contentType: "text/html; charset=utf-8",
    },
    customMetadata: {
      expiresAt: String(expiresAt),
    },
  });

  const hasMd = mdBytes != null && mdBytes.byteLength > 0;
  if (hasMd && mdBytes) {
    await env.PLANS.put(mdObjectKey(id), mdBytes, {
      httpMetadata: {
        contentType: "text/markdown; charset=utf-8",
      },
    });
  }

  const meta: PlanMeta = {
    id,
    title,
    createdAt: now,
    expiresAt,
    hasMd,
    uploadedBy: auth.actor,
  };
  await writeMeta(env, meta);

  const base = publicBase(env, req);
  const planUrl = `${base}/p/${id}`;

  return json(
    {
      id,
      url: planUrl,
      mdUrl: hasMd ? `${planUrl}/source.md` : null,
      title,
      keep,
      expiresAt,
      expiresAtIso: new Date(expiresAt).toISOString(),
      uploadedBy: auth.actor,
    },
    201,
  );
}

async function handleGetPlan(
  _req: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const meta = await readMeta(env, id);
  const now = Date.now();

  if (!meta) {
    const obj = await env.PLANS.get(htmlObjectKey(id));
    if (!obj) {
      return textHtml(notFoundPage(), 404);
    }
    // Meta gone but object still there — treat as gone (shouldn't happen often)
    return textHtml(notFoundPage(), 404);
  }

  if (now >= meta.expiresAt) {
    const mdStillThere =
      meta.hasMd && (await env.PLANS.head(mdObjectKey(id))) != null;
    return textHtml(expiredPage(meta, Boolean(mdStillThere)), 410, {
      "cache-control": "no-store",
    });
  }

  const obj = await env.PLANS.get(htmlObjectKey(id));
  if (!obj) {
    return textHtml(notFoundPage(), 404);
  }

  const headers = new Headers(cacheHeaders(meta.expiresAt, now));
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("x-planhost-expires-at", new Date(meta.expiresAt).toISOString());
  return new Response(obj.body, { status: 200, headers });
}

async function handleGetMd(
  _req: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const meta = await readMeta(env, id);
  if (!meta || !meta.hasMd) {
    return json({ error: "not found" }, 404);
  }

  const obj = await env.PLANS.get(mdObjectKey(id));
  if (!obj) {
    return json({ error: "not found" }, 404);
  }

  const now = Date.now();
  const expired = now >= meta.expiresAt;
  const headers = new Headers(
    expired
      ? { "cache-control": "no-store" }
      : cacheHeaders(meta.expiresAt, now),
  );
  headers.set("content-type", "text/markdown; charset=utf-8");
  headers.set(
    "content-disposition",
    `attachment; filename="${id}.md"`,
  );
  // Allow MD download briefly after soft-expire for escape hatch
  return new Response(obj.body, {
    status: 200,
    headers,
  });
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers":
        "authorization, content-type, x-github-token, x-planhost-github-token, x-planhost-title",
      "access-control-max-age": "86400",
    },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", "*");
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return handleOptions();
    }

    if (url.pathname === "/" && req.method === "GET") {
      return json({
        service: "planhost",
        upload: "POST /upload",
        get: "GET /p/:id",
        md: "GET /p/:id/source.md",
        auth: "Bearer PLANHOST_TOKEN or X-GitHub-Token (allowlisted login)",
        defaultTtlDays: 7,
        keepTtlDays: 90,
      });
    }

    if (url.pathname === "/upload" && req.method === "POST") {
      return withCors(await handleUpload(req, env));
    }

    // Health that doesn't leak secrets (token configured? yes/no)
    if (url.pathname === "/health" && req.method === "GET") {
      return json({
        ok: true,
        tokenAuth: Boolean(env.PLANHOST_TOKEN),
        githubAllowlist: (env.GITHUB_ALLOWLIST || "")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
      });
    }

    const planMatch = /^\/p\/([a-f0-9]{24})(?:\/(source\.md))?$/.exec(
      url.pathname,
    );
    if (planMatch && req.method === "GET") {
      const id = planMatch[1]!;
      const rest = planMatch[2];
      if (rest === "source.md") {
        return handleGetMd(req, env, id);
      }
      return handleGetPlan(req, env, id);
    }

    return json({ error: "not found" }, 404);
  },
};
