"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { execFile } = require("child_process");

function goatUrl(value) {
  const code = String(value || "mutman")
    .trim()
    .replace(/^https:\/\//, "")
    .replace(/\.goatcounter\.com\/?$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(code))
    throw Error("Enter your GoatCounter site code, for example mutman.");
  return `https://${code}.goatcounter.com`;
}
function normalize(total, hits) {
  const pages = Array.isArray(hits?.hits) ? hits.hits : [];
  return {
    visitors: Math.max(
      0,
      Number(total.total || 0) - Number(total.total_events || 0),
    ),
    events: Number(total.total_events || 0),
    daily: (total.stats || []).map((row) => ({
      day: row.day,
      visitors: Number(row.daily || 0),
    })),
    pages: pages.map((row) => ({
      path: row.path,
      title: row.title,
      visitors: Number(row.count || 0),
    })),
    morePages: !!hits?.more,
  };
}
module.exports = function (
  app,
  { draftRoot, publishDir, fetcher = fetch, checkWebsite },
) {
  const secretFile = path.join(path.dirname(draftRoot), "integrations.json");
  const cache = new Map();
  function credentials() {
    if (fs.existsSync(secretFile))
      return JSON.parse(fs.readFileSync(secretFile, "utf8"));
    return {
      url: goatUrl(process.env.GOATCOUNTER_URL || "mutman"),
      token: process.env.GOATCOUNTER_TOKEN || "",
    };
  }
  function report() {
    const c = credentials();
    return {
      goatcounter: { configured: !!c.token, url: c.url },
      github: { repository: "mutmanjamal/landing", configured: true },
      uptime: { provider: "GitHub Actions", independent: true },
    };
  }
  async function goat(c, endpoint) {
    const response = await fetcher(c.url + "/api/v0/" + endpoint, {
      headers: {
        Authorization: "Bearer " + c.token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const error = Error(
        response.status === 401
          ? "GoatCounter rejected this token."
          : response.status === 403
            ? "This token needs the Read statistics permission."
            : "GoatCounter returned HTTP " + response.status + ".",
      );
      error.status =
        response.status === 401 || response.status === 403 ? 400 : 502;
      throw error;
    }
    return response.json();
  }
  app.get("/api/integrations", (req, res) => res.json(report()));
  app.post("/api/integrations/goatcounter", async (req, res) => {
    try {
      const url = goatUrl(req.body.site),
        token = String(req.body.token || "").trim();
      if (token.length < 12 || token.length > 1000 || /[\r\n]/.test(token))
        return res
          .status(400)
          .json({ error: "Enter a valid read-statistics token." });
      const now = new Date(),
        start = new Date(now.getTime() - 86400000),
        fmt = (d) => d.toISOString().slice(0, 10);
      await goat(
        { url, token },
        "stats/total?start=" + fmt(start) + "&end=" + fmt(now),
      );
      const temp = secretFile + ".tmp";
      fs.writeFileSync(temp, JSON.stringify({ url, token }), { mode: 0o600 });
      fs.chmodSync(temp, 0o600);
      fs.renameSync(temp, secretFile);
      cache.clear();
      res.json({ ok: true, ...report() });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });
  app.get("/api/stats", async (req, res) => {
    const c = credentials();
    if (!c.token) return res.json({ configured: false, url: c.url });
    const days = Math.max(
        1,
        Math.min(365, Math.floor(Number(req.query.days) || 30)),
      ),
      key = "stats-" + days;
    if (cache.get(key)?.expires > Date.now())
      return res.json(cache.get(key).data);
    try {
      const end = new Date(),
        start = new Date(end.getTime() - (days - 1) * 86400000),
        fmt = (d) => d.toISOString().slice(0, 10);
      const query = "start=" + fmt(start) + "&end=" + fmt(end);
      const [total, hits] = await Promise.all([
        goat(c, "stats/total?" + query),
        goat(c, "stats/hits?" + query + "&limit=15&group=day"),
      ]);
      const data = {
        configured: true,
        days,
        start: fmt(start),
        end: fmt(end),
        checkedAt: new Date().toISOString(),
        ...normalize(total, hits),
      };
      cache.set(key, { expires: Date.now() + 60000, data });
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: error.message, configured: true });
    }
  });
  function siteCheck() {
    return new Promise((resolve) => {
      const started = Date.now();
      const request = https.get("https://mutman.tech/", (response) => {
        const cert = response.socket.getPeerCertificate?.();
        const expiry = cert?.valid_to
          ? new Date(cert.valid_to).toISOString()
          : null;
        response.resume();
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 400,
          status: response.statusCode,
          responseMs: Date.now() - started,
          tlsExpires: expiry,
        });
      });
      request.setTimeout(8000, () =>
        request.destroy(Error("Website check timed out")),
      );
      request.on("error", (error) =>
        resolve({
          ok: false,
          error: error.message,
          responseMs: Date.now() - started,
        }),
      );
    });
  }
  function active(name) {
    return new Promise((resolve) =>
      execFile(
        "systemctl",
        ["is-active", name],
        { timeout: 3000 },
        (err, out) => resolve(out.trim() || "unknown"),
      ),
    );
  }
  app.get("/api/health", async (req, res) => {
    if (cache.get("health")?.expires > Date.now())
      return res.json(cache.get("health").data);
    const memory = {};
    try {
      const raw = fs.readFileSync("/proc/meminfo", "utf8");
      for (const line of raw.split("\n")) {
        const match = line.match(
          /^(MemTotal|MemAvailable|SwapTotal|SwapFree):\s+(\d+)/,
        );
        if (match) memory[match[1]] = Number(match[2]) * 1024;
      }
    } catch {}
    let disk = null;
    try {
      const d = fs.statfsSync(publishDir);
      disk = { total: d.blocks * d.bsize, available: d.bavail * d.bsize };
    } catch {}
    const [website, caddy, admin] = await Promise.all([
      (checkWebsite || siteCheck)(),
      active("caddy"),
      active("mutman-admin"),
    ]);
    const data = {
      checkedAt: new Date().toISOString(),
      scope:
        "Detailed checks run from this VM and cannot detect a complete VM outage. External GitHub Actions availability checks run separately.",
      website,
      services: { caddy, admin },
      server: {
        uptimeSeconds: os.uptime(),
        load: os.loadavg()[0],
        cpuCount: os.cpus().length,
        memory,
        disk,
      },
    };
    cache.set("health", { expires: Date.now() + 30000, data });
    res.json(data);
  });
  app.get("/api/github-status", async (req, res) => {
    if (cache.get("github")?.expires > Date.now())
      return res.json(cache.get("github").data);
    try {
      const response = await fetcher(
        "https://api.github.com/repos/mutmanjamal/landing/actions/runs?branch=main&per_page=10",
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Mutman-Site-Studio",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok)
        throw Error(
          "GitHub status is temporarily unavailable (HTTP " +
            response.status +
            ").",
        );
      const body = await response.json();
      const data = {
        repository: "mutmanjamal/landing",
        checkedAt: new Date().toISOString(),
        note: "GitHub builds and external HTTPS availability checks. Availability is scheduled every 15 minutes but may be delayed; failure notifications depend on your GitHub settings.",
        runs: (body.workflow_runs || []).map((run) => ({
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          url: run.html_url,
          commit: String(run.head_sha || "").slice(0, 7),
          updated: run.updated_at,
        })),
      };
      cache.set("github", { expires: Date.now() + 120000, data });
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
};
module.exports.goatUrl = goatUrl;
module.exports.normalize = normalize;
