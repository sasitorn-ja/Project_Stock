import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (existsSync(process.env.SYNCDROP_REMOTE_ENV_FILE || ".env.remote.local")) {
  await import("./dev-remote.mjs");
} else {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)], { env: process.env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", error => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
