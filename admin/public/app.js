'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

let state = null;
let editingSlug = null; // null = creating a new project

/* ───────────── helpers ───────────── */

function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.background = bad ? 'var(--danger)' : '';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3000);
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = value;
      else { cur[p] = cur[p] || {}; cur = cur[p]; }
    });
  }
  return out;
}

function sectionTitle(key) {
  const first = key.split('.')[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function building() {
  toast('Building & publishing…');
}

function buildResult(build) {
  const last = build && build.last;
  if (!last) return;
  if (last.ok) toast('Published ✓');
  else {
    toast('Build failed — see log', true);
    console.error(last.log);
  }
}

/* ───────────── tabs ───────────── */

document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
    if (btn.dataset.tab === 'stats') loadStats();
  });
});

/* ───────────── sections ───────────── */

function renderSections() {
  const grid = $('#sections-grid');
  const en = flatten(state.en);
  const ar = flatten(state.ar);
  const keys = [...new Set([...Object.keys(en), ...Object.keys(ar)])];

  const groups = {};
  for (const key of keys) {
    const g = sectionTitle(key);
    (groups[g] = groups[g] || []).push(key);
  }

  grid.innerHTML = Object.entries(groups).map(([group, groupKeys]) => `
    <div class="panel">
      <h3>${esc(group)} <span>· EN / AR</span></h3>
      ${groupKeys.map((key) => {
        const enVal = en[key] ?? '';
        const arVal = ar[key] ?? '';
        const isLong = String(enVal).length > 60 || String(arVal).length > 60;
        const field = (lang, val) => isLong
          ? `<div class="field"><label>${lang}</label><textarea rows="2" data-lang="${lang}" data-key="${esc(key)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${esc(val)}</textarea></div>`
          : `<div class="field"><label>${lang}</label><input data-lang="${lang}" data-key="${esc(key)}" value="${esc(val)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"></div>`;
        return `
          <div class="field"><label>${esc(key)}</label></div>
          ${field('EN', enVal)}
          ${field('AR', arVal)}`;
      }).join('')}
    </div>
  `).join('');
}

$('#save-sections').addEventListener('click', async () => {
  try {
    const enFlat = {};
    const arFlat = {};
    document.querySelectorAll('#sections-grid [data-lang]').forEach((el) => {
      const target = el.dataset.lang === 'EN' ? enFlat : arFlat;
      target[el.dataset.key] = el.value;
    });
    building();
    const res = await api('api/sections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ en: unflatten(enFlat), ar: unflatten(arFlat) }),
    });
    buildResult(res.build);
  } catch (e) {
    toast(e.message, true);
  }
});

/* ───────────── projects ───────────── */

function renderProjects() {
  const list = $('#project-list');
  if (!state.projects.length) {
    list.innerHTML = '<p class="hint">No projects yet.</p>';
    return;
  }
  list.innerHTML = `
    <div class="plist">
      ${state.projects.map((p) => `
        <div class="prow">
          <span class="t">${esc(p.title)}</span>
          <span class="m">${esc(p.slug)}</span>
          <span class="m">${esc(p.status)}</span>
          <span class="m">#${esc(p.order)}</span>
          ${p.featured ? '<span class="m">featured</span>' : ''}
          <span class="spacer"></span>
          <button class="ghost" data-edit="${esc(p.slug)}">Edit</button>
        </div>`).join('')}
    </div>`;
  list.querySelectorAll('[data-edit]').forEach((b) => {
    b.addEventListener('click', () => openModal(state.projects.find((p) => p.slug === b.dataset.edit)));
  });
}

function openModal(project) {
  editingSlug = project ? project.slug : null;
  $('#modal-title').textContent = project ? `Edit: ${project.title}` : 'New project';
  $('#p-slug').value = project ? project.slug : '';
  $('#p-slug').disabled = Boolean(project);
  $('#p-title').value = project ? project.title : '';
  $('#p-summary').value = project ? project.summary : '';
  $('#p-stack').value = project ? project.stack.join(', ') : '';
  $('#p-status').value = project ? project.status : 'shipped';
  $('#p-order').value = project ? project.order : state.projects.length + 1;
  $('#p-featured').checked = project ? project.featured : false;
  $('#p-role').value = project ? project.role : '';
  $('#p-ai').value = project ? project.ai_note : '';
  $('#p-body').value = project ? project.body : '## Problem\n\n\n\n## What I built\n\n\n\n## Constraints\n';
  $('#p-delete').hidden = !project;
  $('#modal').hidden = false;
}

function closeModal() {
  $('#modal').hidden = true;
  editingSlug = null;
}

$('#new-project').addEventListener('click', () => openModal(null));
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

$('#p-save').addEventListener('click', async () => {
  const payload = {
    slug: $('#p-slug').value.trim(),
    title: $('#p-title').value,
    summary: $('#p-summary').value,
    stack: $('#p-stack').value.split(',').map((s) => s.trim()).filter(Boolean),
    status: $('#p-status').value,
    order: Number($('#p-order').value) || 1,
    featured: $('#p-featured').checked,
    role: $('#p-role').value,
    ai_note: $('#p-ai').value,
    body: $('#p-body').value,
  };
  try {
    building();
    let res;
    if (editingSlug) {
      res = await api(`api/projects/${editingSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await api('api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    closeModal();
    buildResult(res.build);
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

$('#p-delete').addEventListener('click', async () => {
  if (!editingSlug) return;
  if (!confirm(`Delete project "${editingSlug}"?`)) return;
  try {
    building();
    const res = await api(`api/projects/${editingSlug}`, { method: 'DELETE' });
    closeModal();
    buildResult(res.build);
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

/* ───────────── CV & images ───────────── */

$('#cv-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    building();
    const res = await api('api/cv', { method: 'POST', body: new FormData(form) });
    buildResult(res.build);
    form.reset();
    await loadFiles();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#image-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    building();
    const res = await api('api/image', { method: 'POST', body: new FormData(form) });
    $('#image-out').textContent = `Uploaded: ${res.path}`;
    toast('Image uploaded ✓');
    form.reset();
    await loadFiles();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ───────────── stats ───────────── */

async function loadStats() {
  const out = $('#stats-out');
  out.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const days = $('#stats-days').value;
    const data = await api(`api/stats?days=${days}`);
    if (!data.configured) {
      out.innerHTML = `<p class="hint">GoatCounter token not set. Add <span class="mono">GOATCOUNTER_TOKEN=...</span> to <span class="mono">/etc/mutman-admin.env</span> and restart the service.</p>`;
      return;
    }
    if (data.error) {
      out.innerHTML = `<p class="hint">${esc(data.error)}</p>`;
      return;
    }
    const total = sumCounts(data.total);
    const hits = (data.hits && (data.hits.hits || data.hits)) || [];
    out.innerHTML = `
      <p class="big">${total.toLocaleString()}</p>
      <p class="hint">page views in the last ${esc(data.days)} days</p>
      ${Array.isArray(hits) && hits.length ? `
        <table>
          <thead><tr><th>Path</th><th>Title</th><th>Views</th></tr></thead>
          <tbody>
            ${hits.map((h) => `<tr>
              <td class="mono">${esc(h.path || '')}</td>
              <td>${esc(h.title || '')}</td>
              <td>${esc(h.count ?? '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : ''}`;
  } catch (e) {
    out.innerHTML = `<p class="hint">${esc(e.message)}</p>`;
  }
}

function sumCounts(total) {
  if (!total) return 0;
  if (typeof total.total === 'number') return total.total;
  const arr = Array.isArray(total) ? total : Array.isArray(total.total) ? total.total : [];
  return arr.reduce((sum, row) => sum + (Number(row && row.count) || 0), 0);
}

$('#stats-days').addEventListener('change', loadStats);

/* ───────────── files (CV & images) ───────────── */

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString() : '';
}

async function loadFiles() {
  try {
    const files = await api('api/files');
    renderFiles(files);
  } catch (e) {
    /* the files tab may not be open; ignore */
  }
}

function renderFiles(files) {
  const cvEl = $('#cv-status');
  if (files.cv) {
    cvEl.innerHTML = `
      <span class="mono">${esc(files.cv.name)}</span> — ${fmtSize(files.cv.size)}
      · updated ${fmtDate(files.cv.modified)}
      <a href="${esc(files.cv.url)}" target="_blank" rel="noopener" style="margin-inline-start:8px">open</a>
      <button class="danger" id="del-cv" style="margin-inline-start:8px">Delete CV</button>`;
    $('#del-cv').addEventListener('click', async () => {
      if (!confirm('Delete the CV? The Download CV buttons will point to a missing file.')) return;
      try {
        building();
        const res = await api('api/files/cv', { method: 'DELETE' });
        buildResult(res.build);
        await loadFiles();
      } catch (err) {
        toast(err.message, true);
      }
    });
  } else {
    cvEl.innerHTML = '<span class="hint">No CV uploaded.</span>';
  }

  const list = $('#images-list');
  if (!files.images.length) {
    list.innerHTML = '<p class="hint">No images yet.</p>';
    return;
  }
  list.innerHTML = `
    <div class="plist">
      ${files.images.map((img) => `
        <div class="prow">
          <a class="mono" href="${esc(img.url)}" target="_blank" rel="noopener">${esc(img.url)}</a>
          <span class="m">${fmtSize(img.size)}</span>
          <span class="spacer"></span>
          <button class="danger" data-del-img="${esc(img.name)}">Delete</button>
        </div>`).join('')}
    </div>`;
  list.querySelectorAll('[data-del-img]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm(`Delete ${b.dataset.delImg}?`)) return;
      try {
        building();
        const res = await api('api/files/image/' + encodeURIComponent(b.dataset.delImg), { method: 'DELETE' });
        buildResult(res.build);
        await loadFiles();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

/* ───────────── boot ───────────── */

async function refresh() {
  state = await api('api/state');
  renderSections();
  renderProjects();
  await loadFiles();
}

refresh().catch((e) => toast(`Failed to load: ${e.message}`, true));
