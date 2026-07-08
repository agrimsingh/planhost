import type { Env } from "./env";
import {
  extractBearer,
  extractGithubToken,
  parseAllowlist,
  sha256Hex,
} from "./lib";

export type AuthOk = {
  ok: true;
  via: "token" | "github";
  actor: string;
};

export type AuthFail = {
  ok: false;
  status: number;
  error: string;
};

export type AuthResult = AuthOk | AuthFail;

async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  // Compare digests so length differences don't leak via early return on raw tokens.
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  if (ha.length !== hb.length) return false;
  let mismatch = 0;
  for (let i = 0; i < ha.length; i++) {
    mismatch |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  }
  return mismatch === 0;
}

async function tryStaticToken(
  req: Request,
  env: Env,
): Promise<AuthResult | null> {
  const bearer = extractBearer(req);
  if (!bearer) return null;
  if (!env.PLANHOST_TOKEN) {
    return {
      ok: false,
      status: 401,
      error: "PLANHOST_TOKEN not configured on worker",
    };
  }
  const match = await timingSafeEqualHex(bearer, env.PLANHOST_TOKEN);
  if (!match) {
    return { ok: false, status: 401, error: "invalid upload token" };
  }
  return { ok: true, via: "token", actor: "token" };
}

async function tryGithub(req: Request, env: Env): Promise<AuthResult | null> {
  const ghToken = extractGithubToken(req);
  if (!ghToken) return null;

  const allow = parseAllowlist(env.GITHUB_ALLOWLIST);
  if (allow.length === 0) {
    return {
      ok: false,
      status: 401,
      error: "GITHUB_ALLOWLIST empty; GitHub auth disabled",
    };
  }

  const res = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${ghToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "planhost",
      "x-github-api-version": "2022-11-28",
    },
  });

  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: 401, error: "invalid GitHub token" };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: 502,
      error: `GitHub user lookup failed (${res.status})`,
    };
  }

  const body = (await res.json()) as { login?: unknown };
  if (typeof body.login !== "string" || !body.login) {
    return { ok: false, status: 502, error: "GitHub user missing login" };
  }

  const login = body.login.toLowerCase();
  if (!allow.includes(login)) {
    return {
      ok: false,
      status: 403,
      error: `GitHub user @${body.login} not allowlisted`,
    };
  }

  return { ok: true, via: "github", actor: `github:${login}` };
}

export async function authorizeUpload(
  req: Request,
  env: Env,
): Promise<AuthResult> {
  const tokenResult = await tryStaticToken(req, env);
  if (tokenResult) return tokenResult;

  const ghResult = await tryGithub(req, env);
  if (ghResult) return ghResult;

  return {
    ok: false,
    status: 401,
    error:
      "unauthorized: send Authorization: Bearer <PLANHOST_TOKEN> or X-GitHub-Token",
  };
}
