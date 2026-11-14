"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
module.exports = function (liveRoot) {
  const home = process.env.ADMIN_DATA_DIR || path.join(liveRoot, ".admin-data");
  const draft = path.join(home, "draft");
  const revisions = path.join(home, "revisions");
  const editable = ["src/data", "src/content/projects", "public"];
  fs.mkdirSync(revisions, { recursive: true });
  function copyPaths(from, to, paths) {
    for (const name of paths) {
      fs.mkdirSync(path.dirname(path.join(to, name)), { recursive: true });
      fs.cpSync(path.join(from, name), path.join(to, name), {
        recursive: true,
      });
    }
  }
  if (!fs.existsSync(path.join(draft, "src")))
    copyPaths(liveRoot, draft, ["src", "public"]);
  // Refresh application templates after an admin upgrade while retaining content drafts.
  copyPaths(liveRoot, draft, [
    "src/components",
    "src/layouts",
    "src/pages",
    "src/styles",
    "src/i18n",
    "src/content/config.ts",
  ]);
  for (const name of [
    "package.json",
    "package-lock.json",
    "astro.config.mjs",
    "tsconfig.json",
  ]) {
    if (fs.existsSync(path.join(liveRoot, name)))
      fs.copyFileSync(path.join(liveRoot, name), path.join(draft, name));
  }
  function defaults(existing, fallback) {
    for (const [key, value] of Object.entries(fallback)) {
      if (!(key in existing)) existing[key] = value;
      else if (value && typeof value === "object" && !Array.isArray(value))
        defaults(existing[key], value);
    }
    return existing;
  }
  for (const name of ["en.json", "ar.json", "site.json"]) {
    const file = path.join(draft, "src/data", name);
    const fallback = JSON.parse(
      fs.readFileSync(path.join(liveRoot, "src/data", name), "utf8"),
    );
    const content = fs.existsSync(file)
      ? defaults(JSON.parse(fs.readFileSync(file, "utf8")), fallback)
      : fallback;
    fs.writeFileSync(file, JSON.stringify(content, null, 2) + "\n");
  }
  if (!fs.existsSync(path.join(draft, "node_modules")))
    fs.symlinkSync(
      path.join(liveRoot, "node_modules"),
      path.join(draft, "node_modules"),
      "dir",
    );
  function list() {
    return fs
      .readdirSync(revisions)
      .filter((id) => /^[0-9]+-[a-f0-9]+$/.test(id))
      .map((id) =>
        JSON.parse(
          fs.readFileSync(path.join(revisions, id, "meta.json"), "utf8"),
        ),
      )
      .sort((a, b) => b.id.localeCompare(a.id));
  }
  function snapshot(label) {
    const id = Date.now() + "-" + crypto.randomBytes(3).toString("hex");
    const dir = path.join(revisions, id);
    copyPaths(draft, dir, editable);
    fs.writeFileSync(
      path.join(dir, "meta.json"),
      JSON.stringify({ id, label, created: new Date().toISOString() }),
    );
    // Bound storage on the small VM. The newest forty checkpoints remain available.
    for (const old of list().slice(40))
      fs.rmSync(path.join(revisions, old.id), { recursive: true, force: true });
    return id;
  }
  function restore(id) {
    if (!list().some((revision) => revision.id === id))
      throw Error("Revision not found");
    const source = path.join(revisions, id);
    // Copy the target first: creating a checkpoint may expire an old target revision.
    const temporary = path.join(
      home,
      "restore-" + crypto.randomBytes(4).toString("hex"),
    );
    copyPaths(source, temporary, editable);
    snapshot("Before restore");
    for (const name of editable)
      fs.rmSync(path.join(draft, name), { recursive: true, force: true });
    copyPaths(temporary, draft, editable);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return { draft, snapshot, list, restore };
};
