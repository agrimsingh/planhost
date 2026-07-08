#!/usr/bin/env node
/**
 * planhost CLI — upload HTML (+ optional MD) to your Worker.
 *
 * Auth (first match wins on the server):
 *   PLANHOST_TOKEN  → Authorization: Bearer …
 *   else `gh auth token` / GITHUB_TOKEN → X-GitHub-Token
 *
 * Usage:
 *   planhost push ./plan.html
 *   planhost push ./plan.html --md ./plan.md --keep
 *   planhost push ./plan.html --title "Q3 pricing"
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE =
  process.env.PLANHOST_URL?.replace(/\/$/, "") ||
  "https://plans.agrimsingh.com";

function usage(code = 1) {
  const msg = `planhost — share temporary HTML plans

Usage:
  planhost push <file.html> [--md file.md] [--keep] [--title "..."] [--url BASE]

Env:
  PLANHOST_URL     Worker origin (default: ${DEFAULT_BASE})
  PLANHOST_TOKEN   Upload bearer token (cloud agents / headless)
  GITHUB_TOKEN     Optional; else uses \`gh auth token\`

Examples:
  planhost push ./plans/foo.html
  planhost push ./plans/foo.html --md ./plans/foo.md --keep
`;
  console.error(msg);
  process.exit(code);
}

function ghToken() {
  if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
  const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout?.trim()) return r.stdout.trim();
  return null;
}

function parseArgs(argv) {
  const args = {
    cmd: null,
    file: null,
    md: null,
    keep: false,
    title: null,
    url: DEFAULT_BASE,
  };
  if (argv.length === 0) usage(0);
  args.cmd = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep") {
      args.keep = true;
    } else if (a === "--md") {
      args.md = argv[++i];
    } else if (a === "--title") {
      args.title = argv[++i];
    } else if (a === "--url") {
      args.url = argv[++i]?.replace(/\/$/, "") || args.url;
    } else if (a === "-h" || a === "--help") {
      usage(0);
    } else if (!a.startsWith("-") && !args.file) {
      args.file = a;
    } else {
      console.error(`unknown arg: ${a}`);
      usage(1);
    }
  }
  return args;
}

async function push(args) {
  if (!args.file) {
    console.error("missing <file.html>");
    usage(1);
  }
  const htmlPath = resolve(args.file);
  if (!existsSync(htmlPath)) {
    console.error(`not found: ${htmlPath}`);
    process.exit(1);
  }

  const token = process.env.PLANHOST_TOKEN?.trim() || null;
  const github = token ? null : ghToken();
  if (!token && !github) {
    console.error(
      "no auth: set PLANHOST_TOKEN or run `gh auth login` (or set GITHUB_TOKEN)",
    );
    process.exit(1);
  }

  const form = new FormData();
  const htmlBuf = readFileSync(htmlPath);
  form.append(
    "html",
    new Blob([htmlBuf], { type: "text/html" }),
    basename(htmlPath),
  );

  if (args.md) {
    const mdPath = resolve(args.md);
    if (!existsSync(mdPath)) {
      console.error(`md not found: ${mdPath}`);
      process.exit(1);
    }
    form.append(
      "md",
      new Blob([readFileSync(mdPath)], { type: "text/markdown" }),
      basename(mdPath),
    );
  }

  if (args.title) form.append("title", args.title);

  const qs = args.keep ? "?keep=1" : "";
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  else headers["x-github-token"] = github;

  const res = await fetch(`${args.url}/upload${qs}`, {
    method: "POST",
    headers,
    body: form,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`upload failed (${res.status}): ${text}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`upload failed (${res.status}): ${data.error || text}`);
    process.exit(1);
  }

  // Primary UX: URL on stdout for piping
  console.log(data.url);
  if (process.stderr.isTTY) {
    console.error(
      `expires ${data.expiresAtIso} · ${data.keep ? "keep/90d" : "7d"} · via ${data.uploadedBy}`,
    );
    if (data.mdUrl) console.error(`md ${data.mdUrl}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "push") {
    await push(args);
    return;
  }
  if (args.cmd === "help" || args.cmd === "--help" || args.cmd === "-h") {
    usage(0);
  }
  console.error(`unknown command: ${args.cmd}`);
  usage(1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
