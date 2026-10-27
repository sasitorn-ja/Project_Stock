import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

// Next.js does not automatically load .env.remote.local. Load it before Next
// starts so remote settings also take precedence over a legacy .env.local.
const envFile = process.env.SYNCDROP_REMOTE_ENV_FILE || ".env.remote.local";
const env = { ...process.env, ...parseEnv(readFileSync(envFile, "utf8")), NODE_ENV: "development" };
if (env.Stock_API_MODE !== "remote" || !env.Stock_API_TOKEN || !env.Stock_API_BASE_URL) {
  throw new Error("Configure Stock_API_MODE, Stock_API_BASE_URL and Stock_API_TOKEN in .env.remote.local");
}
const base = new URL(env.Stock_API_BASE_URL.replace(/\/+$/, "") + "/");
if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !base.pathname.endsWith("/api/")) {
  throw new Error("Stock_API_BASE_URL must be an HTTPS API URL ending in /api");
}
const check = await fetch(new URL("system/token-check", base), {
  headers: { Authorization: `Bearer ${env.Stock_API_TOKEN}` },
  redirect: "manual", signal: AbortSignal.timeout(15000),
});
if (!check.ok) throw new Error(`Remote API token check failed: HTTP ${check.status}`);
const capability = await check.json();
if (!capability.ok || !capability.permissions?.read || !capability.permissions?.write) {
  throw new Error("Remote API token requires read and write permissions");
}
console.log("Remote API connected (read/write). Starting local development without SSO.");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], {
  env, stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
