const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "syncdrop-remote-test-"));
  let mock, child;
  let output = "";
  const calls = [];
  const token = "synthetic-test-token-never-used-in-production";
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", `${temp}/key.pem`, "-out", `${temp}/cert.pem`, "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"], { stdio: "ignore" });
    mock = https.createServer({ key: fs.readFileSync(`${temp}/key.pem`), cert: fs.readFileSync(`${temp}/cert.pem`) }, (req, res) => {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      assert.equal(req.headers.cookie, undefined);
      calls.push({ url: req.url, method: req.method });
      req.resume();
      res.setHeader("Content-Type", "application/json");
      const url = new URL(req.url, "https://mock.test");
      let data;
      if (url.pathname === "/api/system/token-check") data = { ok: true, method: req.method, permissions: { read: true, write: true }, storageAccessed: false };
      else if (["/api/jobs", "/api/jobs/history"].includes(url.pathname)) data = { jobs: [] };
      else if (url.pathname === "/api/po-registry") data = { records: [], total: 0, page: 1, pageSize: 20 };
      else if (url.pathname === "/api/system/storage-status") data = { mode: "postgres", shared: true, writable: true };
      else if (url.pathname === "/api/reports/jobs/export") {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", 'attachment; filename="test.xlsx"');
        return res.end(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      } else { res.statusCode = 404; data = { job: null }; }
      res.end(JSON.stringify(data));
    });
    await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    fs.writeFileSync(`${temp}/remote.env`, `Stock_API_MODE=remote\nStock_API_BASE_URL=https://127.0.0.1:${mock.address().port}/api\nStock_API_TOKEN=${token}\n`, { mode: 0o600 });
    child = spawn(process.execPath, ["scripts/dev.mjs", "--port", String(port)], {
      detached: true,
      env: { ...process.env, SYNCDROP_REMOTE_ENV_FILE: `${temp}/remote.env`, NODE_EXTRA_CA_CERTS: `${temp}/cert.pem`, DATABASE_URL: "postgres://test:test@127.0.0.1:9/test", MYSQL_URL: "mysql://test:test@127.0.0.1:9/test", NEXT_PUBLIC_BASE_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", d => { output = (output + d).slice(-12000); });
    child.stderr.on("data", d => { output = (output + d).slice(-12000); });
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 120000;
    while (true) {
      if (child.exitCode !== null) throw new Error("Remote dev process exited early");
      try {
        const r = await fetch(`${base}/api/system/health`, { signal: AbortSignal.timeout(2000) });
        if (r.status === 200) break;
      } catch {}
      if (Date.now() > deadline) throw new Error("Local test server startup timed out");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    async function request(url, expected = 200, options = {}) {
      const r = await fetch(base + url, { ...options, redirect: "manual", signal: AbortSignal.timeout(60000) });
      assert.equal(r.status, expected, `${options.method || "GET"} ${url}`);
      const body = Buffer.from(await r.arrayBuffer());
      assert.ok(!body.toString().includes(token), "Token leaked into response body");
      assert.ok(!JSON.stringify([...r.headers]).includes(token), "Token leaked into response headers");
      return { r, body };
    }
    const loginPreview = await request("/login");
    assert.ok(loginPreview.body.toString().includes("Sign in with RMC SSO"));
    const localLogout = await request("/api/auth/logout", 307);
    assert.equal(new URL(localLogout.r.headers.get("location"), base).pathname, "/login");
    const localSignIn = await request("/api/auth/rmc-sso/login", 307);
    assert.equal(new URL(localSignIn.r.headers.get("location"), base).pathname, "/po");
    const po = await request("/po");
    assert.ok(po.body.toString().includes("Remote API (local)"));
    assert.ok(po.body.toString().includes('aria-label="ออกจากระบบ"'));
    await request("/jobs");
    await request("/reports");
    assert.ok(calls.some(c => c.url === "/api/jobs"));
    assert.ok(calls.some(c => c.url.startsWith("/api/jobs/history")));
    await request("/api/po-registry?query=hello%20world", 200, { headers: { Cookie: "session=local-only" } });
    assert.ok(calls.some(c => {
      const u = new URL(c.url, "https://mock.test");
      return u.pathname === "/api/po-registry" && u.searchParams.get("query") === "hello world";
    }));
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const { body } = await request("/api/system/token-check", 200, { method, ...(method === "GET" ? {} : { body: '{"probe":true}', headers: { "Content-Type": "application/json" } }) });
      assert.equal(JSON.parse(body.toString()).method, method);
    }
    const binary = await request("/api/reports/jobs/export");
    assert.deepEqual([...binary.body], [0x50, 0x4b, 0x03, 0x04]);
    assert.equal(binary.r.headers.get("content-disposition"), 'attachment; filename="test.xlsx"');
    const beforeRejected = calls.length;
    await request("/api/jobs", 403, { method: "POST", headers: { Origin: "https://foreign.test" } });
    await request("/api/system/retention", 403, { method: "POST" });
    await request("/api/remote/system/retention", 403, { method: "POST" });
    // Node fetch normalizes Host, so use the HTTP API for this boundary check.
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const r = http.get(`${base}/api/jobs`, { headers: { Host: "foreign.test" } }, response => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      r.on("error", reject);
    });
    assert.equal(foreignHostStatus, 403, "Foreign Host must be rejected");
    assert.equal(calls.length, beforeRejected, "Rejected requests reached upstream");
    console.log("Passed: real local dev startup, no SSO redirect, PO/jobs/reports pages, server-rendered remote reads, GET/POST/PUT/PATCH/DELETE proxy, query and binary forwarding, no token/cookie leaks, loopback/origin/endpoint restrictions. Only synthetic API data used; production storage never accessed.");
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (child && child.exitCode === null) {
      process.kill(-child.pid, "SIGTERM");
      await new Promise(resolve => { child.once("exit", resolve); setTimeout(resolve, 10000).unref(); });
    }
    if (mock) { mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); }
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
