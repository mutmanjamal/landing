"use strict";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state,
  view = "overview",
  lang = "en",
  section = "hero",
  editing = null,
  files = { images: [] },
  dirty = false,
  busy = false;
const titles = {
  health: [
    "Website & server health",
    "Check website availability, memory, disk space, and build status.",
  ],
  visits: ["Visitor stats", "See recent visits to your website."],
  overview: ["Overview", "Manage the work you share and how you present it."],
  content: [
    "Page content",
    "Edit one section at a time, in English or Arabic.",
  ],
  projects: [
    "Portfolio projects",
    "Full case studies that show what you can build.",
  ],
  learning: [
    "Side projects & learning",
    "A home for experiments, small builds, and things you are learning.",
  ],
  files: [
    "Media & CV",
    "Keep your resume and project screenshots in one place.",
  ],
  settings: [
    "Site settings",
    "Control contact details, section visibility, colors, and technologies.",
  ],
  history: [
    "Revision history",
    "Restore an earlier draft. Your live website changes only when you publish.",
  ],
};
const names = {
  learning: "Learning section",
  hero: "Introduction",
  work: "Project labels",
  stack: "Skills labels",
  contact: "Contact",
  footer: "Footer",
  nav: "Navigation",
  project: "Case study labels",
  siteName: "Site name",
  langLabel: "Language switch",
  skip: "Skip link",
  line: "Description",
  intent: "Availability",
  name: "Name",
  downloadCv: "CV button",
  seeWork: "Work link",
  heading: "Heading",
  readMore: "Case study link",
  phone: "Phone label",
  location: "Location label",
  github: "GitHub label",
  education: "Education",
  built: "Footer credit",
  back: "Back link",
  myRole: "Role label",
  links: "Links label",
};
function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").className = "show" + (error ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").className = ""), 5000);
}
async function api(url, options = {}) {
  const response = await fetch("api/" + url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function markDirty() {
  dirty = true;
  $("#save-state").textContent = "Unsaved changes";
  $("#save-state").className = "dirty";
}
function saved() {
  dirty = false;
  $("#save-state").textContent = "Draft saved";
  $("#save-state").className = "";
  $("#build-state").textContent = "Ready to preview • live site unchanged";
}
function canLeave() {
  return !dirty || confirm("Discard unsaved changes?");
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function field(label, id, value, type = "text") {
  return `<label>${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}"></label>`;
}
async function refresh() {
  state = await api("state");
  files = await api("files");
  $("#publish-button").disabled = state.previewOnly;
  $("#publish-button").title = state.previewOnly
    ? "Publishing is disabled in this review preview."
    : "";
  saved();
  render();
}
function render() {
  $("#mobile-nav").value = view;
  const [title, description] = titles[view];
  $("#page-heading").textContent = title;
  $("#page-description").textContent = description;
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  });
  const functions = {
    overview: overview,
    content: content,
    projects: projects,
    learning: projects,
    files: media,
    settings: settings,
    history: history,
    visits: visits,
    health: health,
  };
  functions[view]();
  $("#view")
    .querySelectorAll("form input,form textarea,form select")
    .forEach((el) => el.addEventListener("input", markDirty));
}
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      if (canLeave()) {
        dirty = false;
        view = b.dataset.view;
        render();
      }
    }),
);
function overview() {
  const full = state.projects.filter((p) => p.kind !== "learning"),
    side = state.projects.filter((p) => p.kind === "learning");
  $("#view").innerHTML =
    `${state.previewOnly ? '<p class="notice">Review workspace: publishing is disabled. You can safely try the editors and build a preview.</p>' : ""}<div class="overview-grid"><div class="panel"><span>Portfolio projects</span><p class="metric">${full.length}</p><small>${full.filter((p) => p.visible).length} visible on the website</small></div><div class="panel"><span>Side projects & learning</span><p class="metric">${side.length}</p><small>Add experiments as your skills grow</small></div><div class="panel"><span>Media library</span><p class="metric">${files.images.length}</p><small>${files.cv ? "CV uploaded" : "No CV uploaded"}</small></div></div><div class="panel welcome"><div><p class="eyebrow">A clearer publishing flow</p><h2>Work on your website at your own pace.</h2><p>Save changes to your private draft, check the website preview, and publish when you are ready. Revision history keeps a copy before each edit.</p><button id="start-edit" class="primary">Edit introduction</button></div><ol class="steps"><li>Edit content or add a project</li><li>Save your draft</li><li>Build and review the preview</li><li>Publish the website</li></ol></div><div class="panel"><h3>Last preview build</h3><p>${state.build.last ? (state.build.last.ok ? "Built successfully" : "Build needs attention") + " • " + new Date(state.build.last.finished).toLocaleString() : "No preview built in this session."}</p>${state.build.last && !state.build.last.ok ? `<pre>${esc(state.build.last.log)}</pre>` : ""}</div>`;
  $("#start-edit").onclick = () => {
    view = "content";
    section = "hero";
    render();
  };
}
function flatten(o, p = "", out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? p + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
function setPath(o, key, value) {
  const parts = key.split(".");
  let cur = o;
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value;
    else cur = cur[p] ??= {};
  });
}
function content() {
  const groups = Object.keys(state[lang]);
  if (!groups.includes(section)) section = groups[0];
  const data =
    typeof state[lang][section] === "object"
      ? flatten(state[lang][section])
      : { value: state[lang][section] };
  $("#view").innerHTML =
    `<div class="language-tabs"><button data-lang="en" class="${lang === "en" ? "active" : ""}">English</button><button data-lang="ar" class="${lang === "ar" ? "active" : ""}">العربية</button></div><div class="content-layout"><nav class="section-nav" aria-label="Page sections">${groups.map((g) => `<button data-section="${g}" class="${g === section ? "active" : ""}">${esc(names[g] || g)}</button>`).join("")}</nav><form id="content-form" class="panel"><div class="section-line"><h2>${esc(names[section] || section)}</h2><button class="primary">Save draft</button></div><div class="fields" dir="${lang === "ar" ? "rtl" : "ltr"}">${Object.entries(
      data,
    )
      .map(
        ([key, value], i) =>
          `<label for="text-${i}">${esc(
            key
              .split(".")
              .map((k) => names[k] || k.replaceAll("-", " "))
              .join(" / "),
          )}<textarea id="text-${i}" data-key="${esc(key)}" rows="${String(value).length > 90 ? 3 : 2}">${esc(value)}</textarea></label>`,
      )
      .join("")}</div></form></div>`;
  document.querySelectorAll("[data-lang]").forEach(
    (b) =>
      (b.onclick = () => {
        if (canLeave()) {
          dirty = false;
          lang = b.dataset.lang;
          content();
        }
      }),
  );
  document.querySelectorAll("[data-section]").forEach(
    (b) =>
      (b.onclick = () => {
        if (canLeave()) {
          dirty = false;
          section = b.dataset.section;
          content();
        }
      }),
  );
  $("#content-form").oninput = markDirty;
  $("#content-form").onsubmit = async (e) => {
    e.preventDefault();
    const next = structuredClone(state[lang]);
    document.querySelectorAll("[data-key]").forEach((el) => {
      if (el.dataset.key === "value") next[section] = el.value;
      else setPath(next[section], el.dataset.key, el.value);
    });
    try {
      await api(
        "sections",
        json("PUT", {
          en: lang === "en" ? next : state.en,
          ar: lang === "ar" ? next : state.ar,
        }),
      );
      state[lang] = next;
      saved();
      toast("Content saved to draft");
    } catch (e) {
      toast(e.message, true);
    }
  };
}
function projects() {
  const kind = view === "learning" ? "learning" : "project";
  const items = state.projects.filter((p) => (p.kind || "project") === kind);
  $("#view").innerHTML =
    `<div class="toolbar"><input id="project-search" aria-label="Find a project" placeholder="Find a project…"><button id="new-project" class="primary">Add ${kind === "learning" ? "side project" : "project"}</button></div><div class="project-list">${items.length ? items.map((p) => `<article class="project-card" data-title="${esc(p.title.toLowerCase())}"><div><div class="meta"><span class="badge ${p.visible ? "" : "hidden"}">${p.visible ? "Visible" : "Hidden"}</span><span>${esc(p.status)}</span><span>Position ${p.order}</span>${p.featured ? "<span>Featured</span>" : ""}</div><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p><small>${esc(p.stack.join(", "))}</small></div><button data-edit="${esc(p.slug)}">Edit project</button></article>`).join("") : `<div class="empty"><h2>${kind === "learning" ? "Space for your next experiment" : "Add your first project"}</h2><p>Give it a title, explain what you built, and add a screenshot when you have one.</p></div>`}</div>`;
  $("#new-project").onclick = () => openEditor(null, kind);
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () =>
        openEditor(
          state.projects.find((p) => p.slug === b.dataset.edit),
          kind,
        )),
  );
  $("#project-search").oninput = (e) =>
    document
      .querySelectorAll(".project-card")
      .forEach(
        (c) =>
          (c.hidden = !c.dataset.title.includes(e.target.value.toLowerCase())),
      );
}
function addLink(value = {}) {
  const row = document.createElement("div");
  row.className = "repeat-row";
  row.innerHTML = `<label>Link label<input data-link-label value="${esc(value.label)}" placeholder="Source code"></label><label>URL<input data-link-url type="url" value="${esc(value.url)}" placeholder="https://…"></label><button type="button" aria-label="Remove link">Remove</button>`;
  row.querySelector("button").onclick = () => {
    row.remove();
    markDirty();
  };
  $("#link-rows").append(row);
}
function addMedia(value = {}) {
  const row = document.createElement("div");
  row.className = "repeat-row";
  row.innerHTML = `<label>Image<select data-media-src><option value="">Choose uploaded image</option>${files.images.map((i) => `<option value="${esc(i.url)}" ${value.src === i.url ? "selected" : ""}>${esc(i.name)}</option>`).join("")}${value.src && !files.images.some((i) => i.url === value.src) ? `<option selected value="${esc(value.src)}">${esc(value.src)}</option>` : ""}</select></label><label>Image description<input data-media-alt value="${esc(value.alt)}" placeholder="What does this image show?"></label><button type="button" aria-label="Remove image">Remove</button>`;
  row.querySelector("button").onclick = () => {
    row.remove();
    markDirty();
  };
  $("#media-rows").append(row);
}
function openEditor(project, kind) {
  editing = project?.slug || null;
  const form = $("#project-form");
  form.reset();
  $("#editor-heading").textContent = project
    ? "Edit " + project.title
    : "New " + (kind === "learning" ? "side project" : "project");
  for (const name of [
    "title",
    "title_ar",
    "summary",
    "summary_ar",
    "role",
    "body",
    "status",
    "order",
    "kind",
  ]) {
    const el = form.elements[name];
    el.value =
      project?.[name] ??
      (name === "kind"
        ? kind
        : name === "status"
          ? "in progress"
          : name === "order"
            ? state.projects.length + 1
            : "");
  }
  form.elements.slug.value = editing || "";
  form.elements.slug.disabled = !!editing;
  form.elements.stack.value = project?.stack.join(", ") || "";
  form.elements.visible.checked = project?.visible !== false;
  form.elements.featured.checked = !!project?.featured;
  $("#delete-project").hidden = !editing;
  $("#link-rows").innerHTML = "";
  $("#media-rows").innerHTML = "";
  (project?.links || []).forEach(addLink);
  (project?.media || []).forEach(addMedia);
  $("#project-dialog").showModal();
}
$("#add-link").onclick = () => {
  addLink();
  markDirty();
};
$("#add-media").onclick = () => {
  addMedia();
  markDirty();
};
$("#project-form").oninput = markDirty;
function closeEditor() {
  if (canLeave()) {
    dirty = false;
    $("#project-dialog").close();
    saved();
  }
}
$("#close-editor").onclick = closeEditor;
$("#project-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
$("#project-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target,
    p = {};
  for (const k of [
    "title",
    "title_ar",
    "summary",
    "summary_ar",
    "role",
    "body",
    "status",
    "kind",
  ])
    p[k] = f.elements[k].value;
  p.slug = f.elements.slug.value;
  p.order = Number(f.elements.order.value) || 1;
  p.visible = f.elements.visible.checked;
  p.featured = f.elements.featured.checked;
  p.stack = f.elements.stack.value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  p.links = [...document.querySelectorAll("#link-rows .repeat-row")]
    .map((r) => ({
      label: r.querySelector("[data-link-label]").value,
      url: r.querySelector("[data-link-url]").value,
    }))
    .filter((l) => l.url);
  p.media = [...document.querySelectorAll("#media-rows .repeat-row")]
    .map((r) => ({
      src: r.querySelector("[data-media-src]").value,
      alt: r.querySelector("[data-media-alt]").value,
    }))
    .filter((m) => m.src);
  try {
    await api(
      editing ? "projects/" + editing : "projects",
      json(editing ? "PUT" : "POST", p),
    );
    $("#project-dialog").close();
    await refresh();
    toast("Project saved to draft");
  } catch (e) {
    toast(e.message, true);
  }
};
$("#delete-project").onclick = async () => {
  if (
    !editing ||
    !confirm(
      "Delete this project from the draft? You can restore it in Revision history.",
    )
  )
    return;
  try {
    await api("projects/" + editing, { method: "DELETE" });
    $("#project-dialog").close();
    await refresh();
    toast("Project removed from draft");
  } catch (e) {
    toast(e.message, true);
  }
};
function media() {
  const cv = files.cv;
  $("#view").innerHTML =
    `<section class="panel"><div class="section-line"><div><h2>Resume / CV</h2><p class="muted">${cv ? `${esc(cv.name)} • ${Math.round(cv.size / 1024)} KB` : "Upload your current resume as a PDF."}</p></div>${cv ? '<a href="assets/Mutman_CV.pdf" target="_blank" rel="noopener">View draft CV ↗</a>' : ""}</div><form id="cv-upload" class="upload-row"><input aria-label="Choose CV PDF" type="file" name="cv" accept="application/pdf" required><button class="primary">Save CV to draft</button></form></section><section class="panel"><h2>Image library</h2><p class="muted">Upload screenshots here, then attach them in a project’s image editor.</p><form id="image-upload" class="upload-row"><input aria-label="Choose image" type="file" name="image" accept="image/png,image/jpeg,image/webp" required><button class="primary">Upload image</button></form><div class="media-grid">${files.images.map((i) => `<article class="image-tile"><img src="assets${esc(i.url)}" alt="${esc(i.name)}"><p>${esc(i.name)}</p><button data-copy="${esc(i.url)}">Copy path</button> <button class="danger" data-delete-image="${esc(i.name)}">Delete</button></article>`).join("") || '<p class="muted">No images yet. Add a screenshot of something you built.</p>'}</div></section>`;
  for (const [id, url] of [
    ["cv-upload", "cv"],
    ["image-upload", "image"],
  ])
    $("#" + id).onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(url, { method: "POST", body: new FormData(e.target) });
        await refresh();
        toast("File saved to draft");
      } catch (e) {
        toast(e.message, true);
      }
    };
  document.querySelectorAll("[data-copy]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          toast("Image path copied");
        } catch {
          toast(b.dataset.copy);
        }
      }),
  );
  document.querySelectorAll("[data-delete-image]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !confirm(
            "Remove this image from the draft library? Check that no projects use it first.",
          )
        )
          return;
        try {
          await api(
            "files/image/" + encodeURIComponent(b.dataset.deleteImage),
            { method: "DELETE" },
          );
          await refresh();
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
}
function settings() {
  const s = state.settings;
  $("#view").innerHTML =
    `<form id="settings-form"><section class="panel"><div class="section-line"><h2>Contact & search appearance</h2><button class="primary">Save settings draft</button></div><div class="form-grid">${field("Email", "setting-email", s.email, "email")}${field("Phone", "setting-phone", s.phone)}${field("Location", "setting-location", s.location)}${field("GitHub URL", "setting-github", s.github, "url")}${field("Page title", "setting-title", s.title)}${field("Search description", "setting-description", s.description)}${field("Arabic page title", "setting-title_ar", s.title_ar)}${field("Arabic search description", "setting-description_ar", s.description_ar)}</div></section><section class="panel"><h2>Website sections</h2><p class="muted">Hide a section without deleting its content.</p><div class="checks"><label><input id="show-cv" type="checkbox" ${s.showCv !== false ? "checked" : ""}>Show CV download links</label>${Object.entries(
      {
        work: "Portfolio projects",
        learning: "Side projects & learning",
        stack: "Skills & technologies",
        contact: "Contact",
      },
    )
      .map(
        ([k, label]) =>
          `<label><input data-visible-section="${k}" type="checkbox" ${s.sections[k] ? "checked" : ""}>${label}</label>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><h2>Colors</h2><p class="muted">Check readability in the preview after changing colors.</p><div class="form-grid">${field("Accent color", "setting-accent", s.accent, "color")}${field("Page background", "setting-background", s.background, "color")}</div></section><section class="panel"><h2>Skills & technologies</h2><div class="fields">${Object.entries(
      s.stack,
    )
      .map(
        ([k, v]) =>
          `<label>${esc(k)}<input data-stack="${k}" value="${esc(v)}"></label>`,
      )
      .join(
        "",
      )}</div></section><button class="primary">Save settings draft</button></form>`;
  $("#settings-form").onsubmit = async (e) => {
    e.preventDefault();
    const next = structuredClone(s);
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
      next[k] = $("#setting-" + k).value;
    next.showCv = $("#show-cv").checked;
    document
      .querySelectorAll("[data-visible-section]")
      .forEach((i) => (next.sections[i.dataset.visibleSection] = i.checked));
    document
      .querySelectorAll("[data-stack]")
      .forEach((i) => (next.stack[i.dataset.stack] = i.value));
    try {
      await api("settings", json("PUT", next));
      state.settings = next;
      saved();
      toast("Settings saved to draft");
    } catch (e) {
      toast(e.message, true);
    }
  };
}
async function history() {
  const el = $("#view");
  el.innerHTML = "<p>Loading revisions…</p>";
  try {
    const revisions = await api("revisions");
    if (view !== "history") return;
    el.innerHTML = `<section class="panel"><h2>Saved checkpoints</h2><p class="muted">A checkpoint is made before each saved change. Restoring creates another checkpoint first.</p>${revisions.map((r) => `<div class="revision"><div><strong>${esc(r.label.replace(/^PUT \/api\/sections$/, "Page content").replace(/^PUT \/api\/settings$/, "Site settings"))}</strong><p>${esc(new Date(r.created).toLocaleString())}</p></div><button data-restore="${r.id}">Restore draft</button></div>`).join("") || "<p>No revisions yet. Save an edit to create the first checkpoint.</p>"}</section>`;
    document.querySelectorAll("[data-restore]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            !confirm(
              "Restore this checkpoint to the draft? The current draft will be saved first.",
            )
          )
            return;
          try {
            await api("revisions/" + b.dataset.restore + "/restore", {
              method: "POST",
            });
            await refresh();
            toast("Earlier draft restored");
          } catch (e) {
            toast(e.message, true);
          }
        }),
    );
  } catch (e) {
    el.innerHTML = `<p class="error-panel">${esc(e.message)}</p>`;
  }
}
async function buildPreview() {
  if (dirty) {
    toast("Save your changes before building a preview.", true);
    return;
  }
  if (busy) return;
  busy = true;
  $("#preview-button").disabled = true;
  $("#build-state").textContent = "Building draft preview…";
  try {
    const result = await api("preview", { method: "POST" });
    state.build = result.build;
    if (!result.ok)
      throw Error(
        "Preview build failed. Open Overview to inspect the build log.",
      );
    $("#preview-frame").src = "preview/?v=" + Date.now();
    $("#preview-dialog").showModal();
    $("#build-state").textContent = "Preview ready";
    toast("Draft preview is ready");
  } catch (e) {
    toast(e.message, true);
    $("#build-state").textContent = "Preview build needs attention";
  } finally {
    busy = false;
    $("#preview-button").disabled = false;
  }
}
$("#preview-button").onclick = buildPreview;
$("#close-preview").onclick = () => $("#preview-dialog").close();
$("#preview-en").onclick = () => ($("#preview-frame").src = "preview/");
$("#preview-ar").onclick = () => ($("#preview-frame").src = "preview/ar/");
$("#preview-mobile").onclick = () =>
  $("#preview-frame").classList.toggle("phone");
$("#publish-button").onclick = async () => {
  if (dirty) return toast("Save your changes before publishing.", true);
  if (!confirm("Publish the saved draft to the live website?")) return;
  $("#publish-button").disabled = true;
  try {
    await api("publish", { method: "POST" });
    toast("Website published");
    $("#build-state").textContent = "Published just now";
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#publish-button").disabled = state.previewOnly;
  }
};
refresh().catch((e) => {
  $("#save-state").textContent = "Unable to load workspace";
  $("#view").innerHTML =
    `<div class="error-panel">${esc(e.message)}. Refresh to retry.</div>`;
});
async function visits() {
  const out = $("#view");
  out.innerHTML =
    '<section id="connection-card" class="panel">Checking GoatCounter connection…</section><section class="panel"><div class="section-line"><h2>Visitors</h2><select id="stats-days" aria-label="Visitor date range"><option value="1">Today (UTC)</option><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></div><div id="visit-details">Loading…</div></section>';
  try {
    const connections = await api("integrations");
    if (view !== "visits") return;
    const connected = connections.goatcounter.configured;
    const code = new URL(connections.goatcounter.url).hostname.split(".")[0];
    $("#connection-card").innerHTML =
      `<div class="section-line"><div><h2>GoatCounter</h2><p class="muted">${connected ? "A token is configured. Visitor data is fetched securely by your server." : "Connect a read-only token to show your visitor statistics here."}</p></div><a href="${esc(connections.goatcounter.url)}" target="_blank" rel="noopener">Open GoatCounter ↗</a></div><details ${connected ? "" : "open"}><summary>${connected ? "Update connection" : "Connect visitor statistics"}</summary><p class="muted">In your GoatCounter account, open your user menu → API and create a token with <strong>Read statistics</strong>. Enter it below. It stays on the server and is never included in website files or draft backups.</p><form id="goat-connect" class="form-grid"><label>GoatCounter site code<input id="goat-site" value="${esc(code)}" required autocomplete="off"></label><label>Read-statistics API token<input id="goat-token" type="password" required autocomplete="off" minlength="12"></label><div class="full"><button class="primary">Verify & connect</button><p id="connection-result" role="status" class="muted"></p></div></form></details>`;
    $("#goat-connect").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.target.querySelector("button");
      button.disabled = true;
      $("#connection-result").textContent = "Verifying your token…";
      try {
        await api(
          "integrations/goatcounter",
          json("POST", {
            site: $("#goat-site").value,
            token: $("#goat-token").value,
          }),
        );
        $("#goat-token").value = "";
        toast("GoatCounter connected");
        await visits();
      } catch (error) {
        $("#connection-result").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    async function load() {
      const target = $("#visit-details");
      target.textContent = "Loading visitor statistics…";
      try {
        const data = await api("stats?days=" + $("#stats-days").value);
        if (view !== "visits") return;
        if (!data.configured) {
          target.innerHTML =
            '<p class="muted">Complete the connection above to load your visitor numbers. The tracking script is already on your website.</p>';
          return;
        }
        const max = Math.max(1, ...data.daily.map((row) => row.visitors));
        target.innerHTML = `<div class="overview-grid"><div><p class="muted">Visitors in this period</p><p class="metric">${Number(data.visitors).toLocaleString()}</p></div><div><p class="muted">Tracked events</p><p class="metric">${Number(data.events).toLocaleString()}</p></div><div><p class="muted">Date range (UTC)</p><p>${esc(data.start)} – ${esc(data.end)}</p><small>Updated ${esc(new Date(data.checkedAt).toLocaleTimeString())}</small></div></div><p class="muted">Period statistics, not a count of people online right now. A visitor can appear on more than one page.</p><h3>Daily activity</h3><div class="activity-chart">${data.daily.map((row) => `<div class="activity-row"><time>${esc(row.day)}</time><meter min="0" max="${max}" value="${row.visitors}" aria-label="${esc(row.day)} visitors">${row.visitors}</meter><span>${row.visitors}</span></div>`).join("") || '<p class="muted">No activity recorded in this date range.</p>'}</div><h3>Most visited pages</h3>${data.pages.map((row) => `<div class="revision"><div><strong>${esc(row.title || row.path)}</strong><p>${esc(row.path)}</p></div><span>${row.visitors.toLocaleString()} visitors</span></div>`).join("") || '<p class="muted">No page visits recorded yet.</p>'}${data.morePages ? '<p class="muted">Showing the first 15 pages. Open GoatCounter for the full report.</p>' : ""}`;
      } catch (error) {
        target.innerHTML =
          '<p class="error-panel">' + esc(error.message) + "</p>";
      }
    }
    $("#stats-days").onchange = load;
    await load();
  } catch (error) {
    if (view === "visits")
      out.innerHTML = '<p class="error-panel">' + esc(error.message) + "</p>";
  }
}
function bytes(value) {
  return Number.isFinite(value)
    ? (value / 1024 / 1024 / 1024).toFixed(2) + " GB"
    : "Unavailable";
}
async function health() {
  const out = $("#view");
  out.innerHTML =
    '<div class="toolbar"><button id="refresh-health">Refresh checks</button><span class="muted">Checks are cached briefly to keep the server light.</span></div><div id="health-cards">Checking website and server…</div><section id="github-status" class="panel">Checking GitHub builds…</section>';
  $("#refresh-health").onclick = health;
  const checks = await Promise.allSettled([
    api("health"),
    api("github-status"),
  ]);
  if (view !== "health") return;
  if (checks[0].status === "fulfilled") {
    const d = checks[0].value,
      m = d.server.memory,
      disk = d.server.disk,
      expiry = d.website.tlsExpires ? new Date(d.website.tlsExpires) : null;
    $("#health-cards").innerHTML =
      `<p class="notice">${esc(d.scope)}</p><div class="overview-grid"><section class="panel"><h2>Website ${d.website.ok ? "responding" : "needs attention"}</h2><p class="metric">${d.website.status ? "HTTP " + d.website.status : "Unavailable"}</p><p class="muted">${d.website.error ? esc(d.website.error) : d.website.responseMs + " ms response time"}</p><small>${expiry ? "HTTPS certificate expires " + esc(expiry.toLocaleDateString()) : "Certificate information unavailable"}</small></section><section class="panel"><h2>RAM & virtual memory</h2><p>${bytes(m.MemAvailable)} RAM available of ${bytes(m.MemTotal)}</p><p>${bytes((m.SwapTotal || 0) - (m.SwapFree || 0))} swap used of ${bytes(m.SwapTotal)}</p><small>Disk-backed swap is slower than physical RAM.</small></section><section class="panel"><h2>Storage & uptime</h2><p>${disk ? bytes(disk.available) + " free of " + bytes(disk.total) : "Disk information unavailable"}</p><p>Host up ${Math.floor(d.server.uptimeSeconds / 86400)} days, ${Math.floor(d.server.uptimeSeconds / 3600) % 24} hours</p><small>1-minute load ${d.server.load.toFixed(2)} · ${d.server.cpuCount} CPU cores</small></section></div><section class="panel"><h2>Server services</h2>${Object.entries(
        d.services,
      )
        .map(
          ([name, status]) =>
            `<div class="revision"><strong>${name === "caddy" ? "Website server (Caddy)" : "Site studio admin"}</strong><span class="badge ${status === "active" ? "" : "hidden"}">${esc(status)}</span></div>`,
        )
        .join(
          "",
        )}<p class="muted">Checked ${esc(new Date(d.checkedAt).toLocaleString())}</p></section>`;
  } else
    $("#health-cards").innerHTML =
      '<p class="error-panel">' + esc(checks[0].reason.message) + "</p>";
  if (checks[1].status === "fulfilled") {
    const d = checks[1].value;
    $("#github-status").innerHTML =
      `<h2>GitHub builds & availability</h2><p class="muted">${esc(d.note)}</p><p class="notice">External website monitoring uses your existing GitHub repository. Open the Website availability run for its most recent result.</p>${d.runs.map((run) => `<div class="revision"><div><a href="${esc(run.url)}" target="_blank" rel="noopener">${esc(run.name)} ↗</a><p>Commit ${esc(run.commit)} · ${esc(new Date(run.updated).toLocaleString())}</p></div><span class="badge ${run.conclusion === "success" ? "" : "hidden"}">${esc(run.conclusion || run.status)}</span></div>`).join("") || "<p>No workflow runs found.</p>"}`;
  } else
    $("#github-status").innerHTML =
      '<h2>GitHub builds & availability</h2><p class="muted">' +
      esc(checks[1].reason.message) +
      "</p>";
}

$("#mobile-nav").onchange = (event) => {
  if (canLeave()) {
    dirty = false;
    view = event.target.value;
    render();
  } else event.target.value = view;
};
