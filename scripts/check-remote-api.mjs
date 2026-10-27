import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";

const env = { ...parseEnv(readFileSync(process.argv[2] || ".env.remote.local", "utf8")), ...process.env };
assert.equal(env.Stock_API_MODE, "remote");
const base = new URL(env.Stock_API_BASE_URL.replace(/\/+$/, "") + "/");
assert.equal(base.protocol, "https:", "Remote API must use HTTPS");
assert.ok(env.Stock_API_TOKEN, "Missing Stock_API_TOKEN");

async function request(path, method, token, expected) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
  const body = await response.json();
  if (expected === 200) {
    assert.equal(body.ok, true);
    if (path === "system/token-check") {
      assert.equal(body.method, method);
      assert.deepEqual(body.permissions, { read: true, write: true });
      assert.equal(body.storageAccessed, false);
    }
  }
  console.log(`${method} ${path}: HTTP ${response.status}`);
}

await request("system/health", "GET", null, 200);
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
  await request("system/token-check", method, env.Stock_API_TOKEN, 200);
  await request("system/token-check", method, null, 401);
  await request("system/token-check", method, "invalid-probe-token", 401);
}
console.log("Health and token read/write authorization passed; no storage accessed.");
