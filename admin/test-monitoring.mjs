import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  express = require("express"),
  monitoring = require("./monitoring");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-test-"));
const app = express();
app.use(express.json());
let calls = 0;
const total = {
  total: 21,
  total_events: 3,
  stats: [{ day: "2026-11-14", daily: 21 }],
};
const hits = { hits: [{ path: "/", title: "Home", count: 18 }], more: false };
process.env.GOATCOUNTER_TOKEN = "";
monitoring(app, {
  draftRoot: path.join(temp, "draft"),
  publishDir: temp,
  checkWebsite: async () => ({
    ok: true,
    status: 200,
    responseMs: 35,
    tlsExpires: "2027-01-01T00:00:00.000Z",
  }),
  fetcher: async (url, options) => {
    calls++;
    if (url.startsWith("https://api.github.com"))
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              name: "Build",
              status: "completed",
              conclusion: "success",
              html_url: "https://github.com/mutmanjamal/landing/actions/runs/1",
              head_sha: "abcdef123456",
              updated_at: "2026-11-14T00:00:00Z",
            },
          ],
        }),
      };
    assert.ok(url.startsWith("https://mutman.goatcounter.com/api/v0/"));
    if (options.headers.Authorization.includes("invalid"))
      return { ok: false, status: 401 };
    return {
      ok: true,
      json: async () => (url.includes("/total") ? total : hits),
    };
  },
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port + "/api/";
async function request(url, body) {
  const response = await fetch(
    base + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  return { status: response.status, data: await response.json() };
}
try {
  assert.equal((await request("stats")).data.configured, false);
  assert.equal(
    (
      await request("integrations/goatcounter", {
        site: "http://127.0.0.1",
        token: "test-secret-value",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("integrations/goatcounter", {
        site: "mutman",
        token: "invalid-test-token",
      })
    ).status,
    400,
  );
  assert.equal(fs.existsSync(path.join(temp, "integrations.json")), false);
  const token = "integration-test-secret-value";
  const connected = await request("integrations/goatcounter", {
    site: "mutman",
    token,
  });
  assert.equal(connected.status, 200);
  assert.equal(JSON.stringify(connected.data).includes(token), false);
  assert.equal(
    fs.statSync(path.join(temp, "integrations.json")).mode & 0o777,
    0o600,
  );
  assert.equal(
    (await request("integrations")).data.goatcounter.configured,
    true,
  );
  assert.equal(
    JSON.stringify((await request("integrations")).data).includes(token),
    false,
  );
  const stats = (await request("stats?days=7")).data;
  assert.equal(stats.visitors, 18);
  assert.equal(stats.events, 3);
  assert.equal(stats.pages[0].visitors, 18);
  assert.equal(stats.daily[0].visitors, 21);
  const before = calls;
  await request("stats?days=7");
  assert.equal(calls, before, "Repeated stats must use cached results");
  const health = (await request("health")).data;
  assert.equal(health.website.status, 200);
  assert.ok(health.server.uptimeSeconds > 0);
  assert.ok(health.scope.includes("cannot detect"));
  assert.equal(
    (await request("github-status")).data.runs[0].conclusion,
    "success",
  );
  assert.equal(
    (
      await request("integrations/goatcounter", {
        site: "mutman",
        token: "invalid-replacement",
      })
    ).status,
    400,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(temp, "integrations.json"))).token,
    token,
    "Failed verification must retain working credentials",
  );
  console.log(
    "PASS: token validation, server-only credential storage, permissions, redaction, visitor metrics, caching, health checks, GitHub builds.",
  );
} finally {
  await new Promise((r) => server.close(r));
  fs.rmSync(temp, { recursive: true, force: true });
}
