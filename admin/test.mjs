import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-admin-test-"));
const live = path.join(temp, "source"),
  published = path.join(temp, "published");
fs.mkdirSync(live);
fs.mkdirSync(published);
for (const name of [
  "src",
  "public",
  "package.json",
  "package-lock.json",
  "astro.config.mjs",
  "tsconfig.json",
])
  fs.cpSync(path.join(root, name), path.join(live, name), { recursive: true });
fs.symlinkSync(
  path.join(root, "node_modules"),
  path.join(live, "node_modules"),
  "dir",
);
fs.writeFileSync(path.join(published, "sentinel.txt"), "unchanged");
let child;
async function start(previewOnly = false) {
  child = spawn(process.execPath, [path.join(root, "admin/server.js")], {
    env: {
      ...process.env,
      PORT: "4351",
      SITE_ROOT: live,
      ADMIN_DATA_DIR: path.join(temp, "data"),
      PUBLISH_DIR: published,
      ADMIN_BASE_PATH: "",
      ADMIN_PREVIEW_ONLY: previewOnly ? "1" : "0",
      npm_config_cache: path.join(temp, "npm-cache"),
      ASTRO_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (b) => (logs += b));
  child.stderr.on("data", (b) => (logs += b));
  for (let i = 0; i < 100; i++) {
    try {
      await fetch("http://127.0.0.1:4351/api/state");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw Error("Server did not start: " + logs);
}
async function stop() {
  child.kill();
  await new Promise((r) => child.once("exit", r));
}
async function request(url, method = "GET", body) {
  const res = await fetch("http://127.0.0.1:4351/api/" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
try {
  await start();
  const baseline = (await request("state")).data;
  const next = structuredClone(baseline.en);
  next.hero.line = "DRAFT ISOLATION CHECK";
  assert.equal(
    (await request("sections", "PUT", { en: next, ar: baseline.ar })).status,
    200,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(live, "src/data/en.json"))).hero.line,
    baseline.en.hero.line,
    "Saving must not change the live source",
  );
  assert.equal(
    fs.readFileSync(path.join(published, "sentinel.txt"), "utf8"),
    "unchanged",
  );
  const upload = new FormData();
  upload.append(
    "image",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "test.png",
  );
  const uploaded = await (
    await fetch("http://127.0.0.1:4351/api/image", {
      method: "POST",
      body: upload,
    })
  ).json();
  assert.ok(uploaded.path.startsWith("/images/"));
  const settings = {
    ...baseline.settings,
    email: "preview@example.com",
    showCv: false,
  };
  assert.equal((await request("settings", "PUT", settings)).status, 200);
  const entry = {
    slug: "integration-learning",
    title: "Learning fixture",
    summary: "Integration test entry",
    stack: ["JavaScript"],
    status: "in progress",
    kind: "learning",
    visible: true,
    order: 5,
    body: "## Notes\n\nA test fixture.",
    links: [{ label: 'Example \"quoted, link\"', url: "https://example.com" }],
    media: [{ src: uploaded.path, alt: 'Order screen: \"menu, receipts\"' }],
  };
  assert.equal((await request("projects", "POST", entry)).status, 200);
  const list = (await request("projects")).data;
  assert.equal(list.find((p) => p.slug === entry.slug).kind, "learning");
  assert.equal(
    list.find((p) => p.slug === entry.slug).links[0].url,
    "https://example.com",
  );
  assert.equal(
    list.find((p) => p.slug === entry.slug).media[0].alt,
    entry.media[0].alt,
  );
  assert.equal(
    (await request("files/image/" + uploaded.path.split("/").at(-1), "DELETE"))
      .status,
    409,
  );
  const invalid = {
    ...entry,
    links: [{ label: "Invalid", url: "javascript:alert(1)" }],
  };
  assert.equal(
    (await request("projects/" + entry.slug, "PUT", invalid)).status,
    400,
  );
  const hidden = {
    ...entry,
    slug: "integration-hidden",
    title: "HIDDEN TEST ENTRY",
    visible: false,
  };
  assert.equal((await request("projects", "POST", hidden)).status, 200);
  let preview = await request("preview", "POST");
  assert.equal(preview.data.ok, true, preview.data.build?.last?.log);
  const html = await (await fetch("http://127.0.0.1:4351/preview/")).text();
  assert.ok(html.includes("Learning fixture"));
  assert.ok(!html.includes("HIDDEN TEST ENTRY"));
  assert.ok(html.includes("DRAFT ISOLATION CHECK"));
  assert.ok(html.includes("preview@example.com"));
  assert.ok(
    !html.includes("download class="),
    "CV link visibility must be respected",
  );
  assert.ok(
    !html.includes("<script"),
    "Preview must not run website scripts or analytics",
  );
  assert.ok(html.includes('href="/preview/projects/'));
  assert.equal(
    fs.existsSync(
      path.join(temp, "data/draft/dist/projects/integration-hidden/index.html"),
    ),
    false,
  );
  assert.equal(
    fs.readFileSync(path.join(published, "sentinel.txt"), "utf8"),
    "unchanged",
    "Preview must never publish",
  );
  const publish = await request("publish", "POST");
  assert.equal(publish.status, 200, JSON.stringify(publish.data));
  assert.ok(
    fs
      .readFileSync(path.join(published, "index.html"), "utf8")
      .includes("DRAFT ISOLATION CHECK"),
  );
  assert.equal((await request("projects/" + entry.slug, "DELETE")).status, 200);
  assert.equal((await request("publish", "POST")).status, 200);
  assert.equal(
    fs.existsSync(
      path.join(live, "src/content/projects/integration-learning.md"),
    ),
    false,
    "Publication must also remove deleted source entries",
  );
  const revisions = (await request("revisions")).data;
  assert.ok(revisions.length >= 3);
  assert.equal(
    (await request("revisions/" + revisions.at(-1).id + "/restore", "POST"))
      .status,
    200,
  );
  assert.equal(
    (await request("state")).data.en.hero.line,
    baseline.en.hero.line,
  );
  assert.equal(
    (await request("projects")).data.some(
      (p) => p.slug === "integration-learning",
    ),
    false,
  );
  await stop();
  await start(true);
  assert.equal(
    (await request("publish", "POST")).status,
    403,
    "Review workspace must prohibit publishing",
  );
  console.log(
    "PASS: draft isolation, project creation and collections, links, validation, hidden routes, preview, explicit publish, revision restore, review publish block.",
  );
} finally {
  if (child && !child.killed) await stop();
  fs.rmSync(temp, { recursive: true, force: true });
}
