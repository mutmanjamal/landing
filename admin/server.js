"use strict";
/**
 * mutman.tech admin server.
 * Runs on the VM behind Caddy (Basic Auth + reverse proxy at /admin/).
 * Edits: site text (src/data/*.json), projects (src/content/projects/*.md),
 * CV and images (public/) in an isolated draft. Only explicit publication
 * updates the live source and web root.
 */
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const PORT = Number(process.env.PORT || 3000);
const LIVE_ROOT = process.env.SITE_ROOT || path.resolve(__dirname, "..");
const workspace = require("./workspace")(LIVE_ROOT);
const SITE_ROOT = workspace.draft;
const PUBLISH_DIR = process.env.PUBLISH_DIR || "/var/www/mutman.tech";
const GC_URL = (
  process.env.GOATCOUNTER_URL || "https://mutman.goatcounter.com"
).replace(/\/$/, "");
const GC_TOKEN = process.env.GOATCOUNTER_TOKEN || "";
const PROJECTS_DIR = path.join(SITE_ROOT, "src", "content", "projects");
const DATA_DIR = path.join(SITE_ROOT, "src", "data");
const PUBLIC_DIR = path.join(SITE_ROOT, "public");
const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/fonts", express.static(path.join(LIVE_ROOT,"node_modules","@fontsource","ibm-plex-sans","files")));
app.use("/preview", (req, res, next) => {
  const base = process.env.ADMIN_BASE_PATH ?? "/admin";
  const relative = decodeURIComponent(req.path).replace(/^\/+/, "");
  const file = path.resolve(
    SITE_ROOT,
    "dist",
    !relative
      ? "index.html"
      : relative.endsWith("/") || !path.extname(relative)
        ? relative + "/index.html"
        : relative,
  );
  if (!file.startsWith(path.resolve(SITE_ROOT, "dist") + path.sep))
    return res.sendStatus(403);
  if (!file.endsWith(".html") || !fs.existsSync(file)) return next();
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(
    /(href|src)="\/(?!\/)/g,
    (_, attr) => `${attr}="${base}/preview/`,
  );
  html = html.replace(/location.replace\(/g, "void(");
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  res.set("Cache-Control", "no-store").type("html").send(html);
});
app.use("/preview", express.static(path.join(SITE_ROOT, "dist")));
app.use("/assets", express.static(PUBLIC_DIR));
app.use("/_astro", express.static(path.join(SITE_ROOT, "dist", "_astro")));
app.use((req, res, next) => {
  if (
    ["POST", "PUT", "DELETE"].includes(req.method) &&
    !["/api/preview", "/api/publish"].includes(req.path)
  ) {
    if (buildState.running || publishing)
      return res
        .status(409)
        .json({ error: "A build is running. Wait before editing." });
    workspace.snapshot(req.method + " " + req.path);
  }
  next();
});
/* ───────────────────────── build & publish ───────────────────────── */
const buildState = { running: false, last: null };
let publishing = false;
let chain = Promise.resolve();
function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
          ADMIN_VITE_CACHE: path.join(cwd, ".astro", "vite"),
          ADMIN_ASTRO_CACHE: path.join(cwd, ".astro", "cache"),
          NODE_OPTIONS:
            "--max-old-space-size=" +
            Math.max(
              128,
              Math.min(1024, Number(process.env.ADMIN_BUILD_HEAP_MB) || 192),
            ),
        },
      },
      (err, stdout, stderr) => {
        resolve({ ok: !err, out: ((stdout || "") + (stderr || "")).trim() });
      },
    );
  });
}
function scheduleRebuild() {
  chain = chain.then(async () => {
    buildState.running = true;
    const started = new Date().toISOString();
    const build = await run(
      process.execPath,
      [path.join(SITE_ROOT, "node_modules", "astro", "astro.js"), "build"],
      SITE_ROOT,
    );
    buildState.running = false;
    buildState.last = {
      ok: build.ok,
      started,
      finished: new Date().toISOString(),
      log: build.out.slice(-6000),
    };
  });
  return chain;
}
/* ───────────────────────── helpers ───────────────────────── */
function readJson(lang) {
  const file = path.join(DATA_DIR, `${lang}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(lang, obj) {
  const file = path.join(DATA_DIR, `${lang}.json`);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function parseScalar(v) {
  const s = (v == null ? "" : String(v)).trim();
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.replace(/^"|"$/g, "");
    }
  }
  return s;
}
function splitTopLevel(s) {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  const out = [];
  let cur = "";
  let depth = 0;
  let inQuote = false;
  let escaped = false;
  for (const ch of inner) {
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (inQuote && ch === "\\") {
      cur += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (ch === "{" || ch === "[")) depth++;
    else if (!inQuote && (ch === "}" || ch === "]")) depth--;
    if (ch === "," && !inQuote && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parseList(v) {
  const s = (v || "").trim();
  if (!s || !s.startsWith("[")) return [];
  return splitTopLevel(s).map((item) => {
    if (item.startsWith("{")) return item; // keep objects raw; handled by caller
    return parseScalar(item);
  });
}
function parseObjectList(v) {
  return parseList(v)
    .filter((x) => typeof x === "string" && x.startsWith("{"))
    .map((raw) => {
      const obj = {};
      const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
      for (const part of splitTopLevel(`[${inner}]`)) {
        const i = part.indexOf(":");
        if (i < 0) continue;
        obj[part.slice(0, i).trim()] = parseScalar(part.slice(i + 1).trim());
      }
      return obj;
    });
}
function parseMarkdown(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const fm = {};
  let body = src;
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    title: parseScalar(fm.title),
    title_ar: parseScalar(fm.title_ar),
    summary_ar: parseScalar(fm.summary_ar),
    kind: parseScalar(fm.kind) || "project",
    visible: parseScalar(fm.visible) !== "false",
    summary: parseScalar(fm.summary),
    stack: parseList(fm.stack),
    status: parseScalar(fm.status) || "shipped",
    role: parseScalar(fm.role),
    links: parseObjectList(fm.links),
    media: parseObjectList(fm.media),
    order: Number(parseScalar(fm.order)) || 1,
    featured: parseScalar(fm.featured) === "true",
    body: body.replace(/^\s+/, "").trim(),
  };
}
function toMarkdown(p) {
  const q = (v) => JSON.stringify(v == null ? "" : String(v));
  const list = (arr) => (arr || []).map((x) => q(x)).join(", ");
  const objs = (arr, keys) =>
    (arr || [])
      .filter(Boolean)
      .map((o) => `{ ${keys.map((k) => `${k}: ${q(o[k])}`).join(", ")} }`)
      .join(", ");
  const lines = [
    "---",
    `title: ${q(p.title)}`,
    `title_ar: ${q(p.title_ar)}`,
    `summary_ar: ${q(p.summary_ar)}`,
    `kind: ${p.kind === "learning" ? "learning" : "project"}`,
    `visible: ${p.visible !== false}`,
    `summary: ${q(p.summary)}`,
    `stack: [${list(p.stack)}]`,
    `status: ${p.status === "in progress" ? "in progress" : "shipped"}`,
    `role: ${q(p.role)}`,
    `links: [${objs(p.links, ["label", "url"])}]`,
    `media: [${objs(p.media, ["src", "alt"])}]`,
    `order: ${Number(p.order) || 1}`,
    `featured: ${p.featured ? "true" : "false"}`,
    "---",
    "",
    (p.body || "").trim(),
    "",
  ];
  return lines.join("\n");
}
function listProjects() {
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, f), "utf8");
      return { slug, ...parseMarkdown(raw) };
    })
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
/* ───────────────────────── API ───────────────────────── */
app.get("/api/state", (req, res) => {
  try {
    res.json({
      en: readJson("en"),
      ar: readJson("ar"),
      projects: listProjects(),
      build: buildState,
      settings: JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, "site.json"), "utf8"),
      ),
      previewOnly: process.env.ADMIN_PREVIEW_ONLY === "1",
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.put("/api/sections", async (req, res) => {
  try {
    const { en, ar } = req.body || {};
    if (!en || !ar)
      return res.status(400).json({ error: "en and ar are required" });
    writeJson("en", en);
    writeJson("ar", ar);
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.get("/api/projects", (req, res) => {
  try {
    res.json(listProjects());
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
function invalid(message) { return Object.assign(new Error(message), {status:400}); }
function saveProject(body, slug) {
  const clean = {
    title: String(body.title || "").trim(),
    title_ar: String(body.title_ar || "").trim(),
    summary_ar: String(body.summary_ar || "").trim(),
    kind: body.kind === "learning" ? "learning" : "project",
    visible: body.visible !== false,
    summary: String(body.summary || "").trim(),
    stack: Array.isArray(body.stack) ? body.stack.map(String) : [],
    status: body.status === "in progress" ? "in progress" : "shipped",
    role: String(body.role || "").trim(),
    links: Array.isArray(body.links) ? body.links : [],
    media: Array.isArray(body.media) ? body.media : [],
    order: Number(body.order) || 1,
    featured: Boolean(body.featured),
    body: String(body.body || ""),
  };
  if (!clean.title) throw invalid("Title is required");
  if (clean.order < 1 || !Number.isFinite(clean.order))
    throw invalid("Position must be a positive number");
  for (const link of clean.links) {
    try {
      const u = new URL(link.url);
      if (!["https:", "http:"].includes(u.protocol)) throw Error();
    } catch {
      throw invalid("Project links must use http or https");
    }
  }
  for (const media of clean.media) {
    if (!/^\/images\/[A-Za-z0-9._-]+$/.test(media.src))
      throw invalid("Choose an image from the media library");
    if (!String(media.alt || "").trim())
      throw invalid("Add a description for each image");
  }
  fs.writeFileSync(
    path.join(PROJECTS_DIR, `${slug}.md`),
    toMarkdown(clean),
    "utf8",
  );
  return clean;
}
app.post("/api/projects", async (req, res) => {
  try {
    const body = req.body || {};
    const slug = String(body.slug || "").trim();
    if (!SLUG_RE.test(slug)) {
      return res
        .status(400)
        .json({ error: "Slug must be lowercase letters, numbers and dashes" });
    }
    const file = path.join(PROJECTS_DIR, `${slug}.md`);
    if (fs.existsSync(file))
      return res
        .status(409)
        .json({ error: "A project with that slug already exists" });
    saveProject(body, slug);
    res.json({
      ok: buildState.last && buildState.last.ok,
      slug,
      build: buildState,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.put("/api/projects/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!SLUG_RE.test(slug))
      return res.status(400).json({ error: "Invalid slug" });
    const file = path.join(PROJECTS_DIR, `${slug}.md`);
    if (!fs.existsSync(file))
      return res.status(404).json({ error: "Project not found" });
    saveProject(req.body || {}, slug);
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.delete("/api/projects/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!SLUG_RE.test(slug))
      return res.status(400).json({ error: "Invalid slug" });
    const file = path.join(PROJECTS_DIR, `${slug}.md`);
    if (!fs.existsSync(file))
      return res.status(404).json({ error: "Project not found" });
    fs.unlinkSync(file);
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
app.post("/api/cv", upload.single("cv"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (req.file.mimetype !== "application/pdf")
      return res.status(400).json({ error: "PDF only" });
    fs.writeFileSync(path.join(PUBLIC_DIR, "Mutman_CV.pdf"), req.file.buffer);
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.post("/api/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const exts = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
    };
    const ext = exts[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: "PNG, JPG or WEBP only" });
    const base =
      String(req.body.name || req.file.originalname || "image")
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "image";
    const dir = path.join(PUBLIC_DIR, "images");
    fs.mkdirSync(dir, { recursive: true });
    const name = `${base}-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(dir, name), req.file.buffer);
    res.json({ ok: true, path: `/images/${name}`, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.get("/api/files", (req, res) => {
  try {
    const cvPath = path.join(PUBLIC_DIR, "Mutman_CV.pdf");
    let cv = null;
    if (fs.existsSync(cvPath)) {
      const st = fs.statSync(cvPath);
      cv = {
        name: "Mutman_CV.pdf",
        url: "/Mutman_CV.pdf",
        size: st.size,
        modified: st.mtime.toISOString(),
      };
    }
    const imgDir = path.join(PUBLIC_DIR, "images");
    let images = [];
    if (fs.existsSync(imgDir)) {
      images = fs
        .readdirSync(imgDir)
        .filter((f) => /^[A-Za-z0-9._-]+$/.test(f))
        .map((f) => {
          const st = fs.statSync(path.join(imgDir, f));
          return {
            name: f,
            url: `/images/${f}`,
            size: st.size,
            modified: st.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
    }
    res.json({ cv, images });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.delete("/api/files/cv", async (req, res) => {
  try {
    const p = path.join(PUBLIC_DIR, "Mutman_CV.pdf");
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.delete("/api/files/image/:name", async (req, res) => {
  try {
    const name = req.params.name;
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
      return res.status(400).json({ error: "Invalid file name" });
    }
    const used = listProjects().some((project) =>
      project.media.some((m) => m.src === "/images/" + name),
    );
    if (used)
      return res
        .status(409)
        .json({
          error:
            "This image is attached to a project. Remove it from the project first.",
        });
    const p = path.join(PUBLIC_DIR, "images", name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "Not found" });
    fs.unlinkSync(p);
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(e.status || 500).json({ error: String(e.message || e) });
  }
});
app.get("/api/stats", async (req, res) => {
  if (!GC_TOKEN) return res.json({ configured: false });
  const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365));
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${GC_TOKEN}` };
  try {
    const [tot, hits] = await Promise.all([
      fetch(
        `${GC_URL}/api/v0/stats/total?start=${fmt(start)}&end=${fmt(end)}`,
        { headers },
      ),
      fetch(
        `${GC_URL}/api/v0/stats/hits?start=${fmt(start)}&end=${fmt(end)}&limit=15`,
        { headers },
      ),
    ]);
    const data = {
      configured: true,
      days,
      total: null,
      hits: null,
      error: null,
    };
    if (!tot.ok) {
      data.error = `GoatCounter returned ${tot.status}`;
      return res.json(data);
    }
    data.total = await tot.json();
    data.hits = hits.ok ? await hits.json() : null;
    res.json(data);
  } catch (e) {
    res
      .status(500)
      .json({ configured: true, error: String((e && e.message) || e) });
  }
});
app.post("/api/preview", async (req, res) => {
  if (publishing || buildState.running)
    return res.status(409).json({ error: "Wait for the current build." });
  await scheduleRebuild();
  res.json({ ok: buildState.last.ok, build: buildState, url: "preview/" });
});
app.post("/api/publish", async (req, res) => {
  if (process.env.ADMIN_PREVIEW_ONLY === "1")
    return res
      .status(403)
      .json({ error: "Publishing is disabled in this review preview." });
  if (buildState.running || publishing)
    return res.status(409).json({ error: "Wait for the current build." });
  publishing = true;
  try {
    await scheduleRebuild();
    if (!buildState.last.ok)
      return res
        .status(422)
        .json({
          error: "Build failed. Live site was not changed.",
          build: buildState,
        });
    const result = await run(
      "rsync",
      ["-a", "--delete", path.join(SITE_ROOT, "dist") + "/", PUBLISH_DIR + "/"],
      SITE_ROOT,
    );
    if (!result.ok)
      return res.status(500).json({ error: "Publish failed", log: result.out });
    for (const directory of ["src", "public"]) {
      const sync = await run(
        "rsync",
        [
          "-a",
          "--delete",
          path.join(SITE_ROOT, directory) + "/",
          path.join(LIVE_ROOT, directory) + "/",
        ],
        SITE_ROOT,
      );
      if (!sync.ok)
        return res
          .status(500)
          .json({
            error: "Site published but source sync failed",
            log: sync.out,
          });
    }
    res.json({ ok: true, published: new Date().toISOString() });
  } finally {
    publishing = false;
  }
});
app.get("/api/revisions", (req, res) => res.json(workspace.list()));
app.post("/api/revisions/:id/restore", (req, res) => {
  try {
    workspace.restore(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.put("/api/settings", (req, res) => {
  const b = req.body;
  if (
    !/^#[0-9a-f]{6}$/i.test(b.accent) ||
    !/^#[0-9a-f]{6}$/i.test(b.background)
  )
    return res.status(400).json({ error: "Use six-digit hex colors." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))
    return res.status(400).json({ error: "Enter a valid contact email." });
  try {
    const url = new URL(b.github);
    if (!["https:", "http:"].includes(url.protocol)) throw Error();
  } catch {
    return res.status(400).json({ error: "Enter an https GitHub URL." });
  }
  const clean = {};
  for (const k of [
    "email",
    "phone",
    "location",
    "github",
    "title",
    "description",
    "title_ar",
    "description_ar",
    "accent",
    "background",
  ])
    clean[k] = String(b[k] || "").slice(0, 1000);
  clean.showCv = b.showCv !== false;
  clean.sections = {};
  for (const k of ["work", "learning", "stack", "contact"])
    clean.sections[k] = b.sections?.[k] !== false;
  clean.stack = {};
  for (const k of [
    "Languages",
    "Environments",
    "Infrastructure",
    "Data",
    "Tools",
  ])
    clean.stack[k] = String(b.stack?.[k] || "").slice(0, 2000);
  fs.writeFileSync(
    path.join(DATA_DIR, "site.json"),
    JSON.stringify(clean, null, 2) + "\n",
  );
  res.json({ ok: true });
});
app.get("/api/build", (req, res) => res.json(buildState));
app.listen(PORT, "127.0.0.1", () => {
  console.log(`mutman admin listening on http://127.0.0.1:${PORT}`);
  console.log(`site root: ${SITE_ROOT}`);
  console.log(`publish dir: ${PUBLISH_DIR}`);
});
