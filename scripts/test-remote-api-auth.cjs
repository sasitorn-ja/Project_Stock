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
  const NextResponse = {
    next: () => ({ status: 200, next: true }),
    json: (body, init = {}) => ({ status: init.status || 200, body }),
    redirect: () => ({ status: 307 }),
  };
  let session = null;
  const middleware = load("middleware.ts", {
    "next/server": { NextResponse },
    "@/lib/app-paths": { withBasePath: p => `/syncdrop${p}`, withoutBasePath: p => p.replace(/^\/syncdrop/, "") },
    "@/lib/rmc-session": { getSessionFromCookieValue: async () => session, sessionCookieName: "session" },
    "@/lib/remote-api-auth": auth,
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
  console.log("Passed: token validation, read/write gating, middleware ordering, SSO/driver/cron compatibility, diagnostic handlers; storage imports prohibited.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
