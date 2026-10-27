const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(filename, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

async function main() {
  const auth = load("lib/remote-api-auth.ts");
  const remoteConfig = load("lib/remote-api-config.ts");
  const NextResponse = {
    next: () => ({ status: 200, next: true }),
    json: (body, init = {}) => ({ status: init.status || 200, body }),
    redirect: () => ({ status: 307 }),
    rewrite: url => ({ status: 200, rewrite: url.pathname }),
  };
  let session = null;
  const middleware = load("middleware.ts", {
    "next/server": { NextResponse },
    "@/lib/app-paths": { withBasePath: p => `/syncdrop${p}`, withoutBasePath: p => p.replace(/^\/syncdrop/, "") },
    "@/lib/rmc-session": { getSessionFromCookieValue: async () => session, sessionCookieName: "session" },
    "@/lib/remote-api-auth": auth,
    "@/lib/remote-api-config": remoteConfig,
  }).default;
  const routes = load("app/api/system/token-check/route.ts", {
    "next/server": { NextResponse }, "@/lib/remote-api-auth": auth,
  });
  function req(path, method = "GET", token = "test-only-credential") {
    const request = new Request(`https://example.test/syncdrop${path}`, {
      method, headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });
    request.nextUrl = new URL(request.url);
    request.cookies = { get: () => undefined };
    return request;
  }
  process.env.Stock_API_TOKEN = "test-only-credential";
  for (const enabled of [undefined, "false", "true"]) {
    if (enabled === undefined) delete process.env.Stock_API_WRITE_ENABLED;
    else process.env.Stock_API_WRITE_ENABLED = enabled;
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
      const expected = ["GET", "HEAD"].includes(method) || enabled === "true" ? 200 : 403;
      assert.equal(await auth.checkRemoteApiAccess(req("/api/jobs", method)), expected);
      assert.equal((await middleware(req("/api/jobs", method))).status, expected);
      for (const token of [null, "wrong-token"]) {
        assert.equal(await auth.checkRemoteApiAccess(req("/api/jobs", method, token)), 401);
        assert.equal((await middleware(req("/api/system/token-check", method, token))).status, 401);
      }
      if (method !== "HEAD") assert.equal((await routes[method](req("/api/system/token-check", method))).status, expected);
    }
  }
  session = { user: { id: "sso-user" } };
  process.env.Stock_API_WRITE_ENABLED = "false";
  assert.equal((await middleware(req("/api/jobs/driver-job/scan", "POST"))).status, 403);
  assert.equal((await middleware(req("/api/jobs/driver-job", "GET", "wrong-token"))).status, 401);
  assert.equal((await middleware(req("/api/jobs", "POST", null))).status, 200);
  assert.equal((await middleware(req("/api/system/token-check", "GET", null))).status, 401);
  session = null;
  assert.equal((await middleware(req("/api/system/health", "GET", null))).status, 200);
  assert.equal((await middleware(req("/api/jobs", "GET", null))).status, 401);
  assert.equal((await middleware(req("/api/system/retention", "POST", "existing-cron-token"))).status, 200);
  for (const path of ["/api/auth/logout", "/api/system/retention", "/api/jobs-other"]) assert.equal(auth.isRemoteApiPath(path), false);
  delete process.env.Stock_API_TOKEN;
  assert.equal(await auth.checkRemoteApiAccess(req("/api/jobs")), 401);
  const localRequest = (path, options = {}) => {
    const r = new Request(`http://localhost:3000${path}`, options);
    r.nextUrl = new URL(r.url);
    r.cookies = { get: () => undefined };
    return r;
  };
  process.env.Stock_API_MODE = "remote";
  process.env.Stock_API_BASE_URL = "https://api.example.test/syncdrop/api";
  process.env.Stock_API_TOKEN = "test-only-credential";
  process.env.NODE_ENV = "production";
  assert.equal(remoteConfig.isRemoteDevMode(), false, "Remote mode must not bypass production SSO");
  process.env.NODE_ENV = "development";
  assert.equal((await middleware(localRequest("/api/jobs"))).rewrite, "/syncdrop/api/remote/jobs");
  assert.equal((await middleware(localRequest("/api/po-registry"))).rewrite, "/syncdrop/api/remote/po-registry");
  assert.equal((await middleware(localRequest("/api/system/token-check"))).rewrite, "/syncdrop/api/remote/system/token-check");
  assert.equal((await middleware(localRequest("/api/system/retention", { method: "POST" }))).status, 403);
  assert.equal((await middleware(localRequest("/api/jobs", { method: "POST", headers: { Origin: "https://foreign.test" } }))).status, 403);
  assert.equal((await middleware(localRequest("/api/jobs", { headers: { Host: "foreign.test" } }))).status, 403);
  assert.equal((await middleware(req("/api/jobs"))).status, 403, "Non-loopback requests rejected");
  assert.equal((await middleware(localRequest("/login"))).status, 307);
  process.env.Stock_API_BASE_URL = "http://insecure.test/api";
  assert.equal((await middleware(localRequest("/api/jobs"))).status, 503);
  process.env.Stock_API_BASE_URL = "https://api.example.test/syncdrop/api";
  let forwarded;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    forwarded = { url: String(url), init };
    return Response.json({ jobs: [] });
  };
  const client = load("lib/remote-api-client.ts", {
    "@/lib/remote-api-config": remoteConfig, "@/lib/remote-api-auth": auth,
  });
  await client.remoteApiRequest("jobs?query=a%20b", { method: "POST", headers: { Cookie: "session=private", Authorization: "browser-value", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(forwarded.url, "https://api.example.test/syncdrop/api/jobs?query=a%20b");
  assert.equal(forwarded.init.headers.get("authorization"), "Bearer test-only-credential");
  assert.equal(forwarded.init.headers.has("cookie"), false);
  assert.equal(forwarded.init.redirect, "manual");
  await assert.rejects(client.remoteApiRequest("jobs/../system/retention"));
  await assert.rejects(client.remoteApiRequest("https://outside.test/api/jobs"));
  global.fetch = originalFetch;
  console.log("Passed: token validation, read/write gating, middleware ordering, SSO/driver/cron compatibility, diagnostic handlers; storage imports prohibited.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
