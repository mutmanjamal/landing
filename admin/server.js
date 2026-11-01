'use strict';

/**
 * mutman.tech admin server.
 * Runs on the VM behind Caddy (Basic Auth + reverse proxy at /admin/).
 * Edits: site text (src/data/*.json), projects (src/content/projects/*.md),
 * CV and images (public/). After every save it rebuilds the site and
 * rsyncs dist/ into the web root.
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 3000);
const SITE_ROOT = process.env.SITE_ROOT || path.resolve(__dirname, '..');
const PUBLISH_DIR = process.env.PUBLISH_DIR || '/var/www/mutman.tech';
const GC_URL = (process.env.GOATCOUNTER_URL || 'https://mutman.goatcounter.com').replace(/\/$/, '');
const GC_TOKEN = process.env.GOATCOUNTER_TOKEN || '';

const PROJECTS_DIR = path.join(SITE_ROOT, 'src', 'content', 'projects');
const DATA_DIR = path.join(SITE_ROOT, 'src', 'data');
const PUBLIC_DIR = path.join(SITE_ROOT, 'public');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ───────────────────────── build & publish ───────────────────────── */

const buildState = { running: false, last: null };
let chain = Promise.resolve();

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: ((stdout || '') + (stderr || '')).trim() });
    });
  });
}

function scheduleRebuild() {
  chain = chain.then(async () => {
    buildState.running = true;
    const started = new Date().toISOString();
    const build = await run('npm', ['run', 'build'], SITE_ROOT);
    let publish = { ok: false, out: 'skipped (build failed)' };
    if (build.ok) {
      publish = await run(
        'rsync',
        ['-a', '--delete', path.join(SITE_ROOT, 'dist') + '/', PUBLISH_DIR + '/'],
        SITE_ROOT
      );
    }
    buildState.running = false;
    buildState.last = {
      ok: build.ok && publish.ok,
      started,
      finished: new Date().toISOString(),
      log: (build.out + '\n' + publish.out).slice(-6000),
    };
  });
  return chain;
}

/* ───────────────────────── helpers ───────────────────────── */

function readJson(lang) {
  const file = path.join(DATA_DIR, `${lang}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(lang, obj) {
  const file = path.join(DATA_DIR, `${lang}.json`);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function parseScalar(v) {
  const s = (v == null ? '' : String(v)).trim();
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.replace(/^"|"$/g, '');
    }
  }
  return s;
}

function splitTopLevel(s) {
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  const out = [];
  let cur = '';
  let depth = 0;
  let inQuote = false;
  for (const ch of inner) {
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (ch === '{' || ch === '[')) depth++;
    else if (!inQuote && (ch === '}' || ch === ']')) depth--;
    if (ch === ',' && !inQuote && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseList(v) {
  const s = (v || '').trim();
  if (!s || !s.startsWith('[')) return [];
  return splitTopLevel(s).map((item) => {
    if (item.startsWith('{')) return item; // keep objects raw; handled by caller
    return parseScalar(item);
  });
}

function parseObjectList(v) {
  return parseList(v)
    .filter((x) => typeof x === 'string' && x.startsWith('{'))
    .map((raw) => {
      const obj = {};
      const inner = raw.replace(/^\{/, '').replace(/\}$/, '');
      for (const part of splitTopLevel(`[${inner}]`)) {
        const i = part.indexOf(':');
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
      const i = line.indexOf(':');
      if (i < 0) continue;
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    title: parseScalar(fm.title),
    summary: parseScalar(fm.summary),
    stack: parseList(fm.stack),
    status: parseScalar(fm.status) || 'shipped',
    role: parseScalar(fm.role),
    ai_note: parseScalar(fm.ai_note),
    links: parseObjectList(fm.links),
    media: parseObjectList(fm.media),
    order: Number(parseScalar(fm.order)) || 1,
    featured: parseScalar(fm.featured) === 'true',
    body: body.replace(/^\s+/, '').trim(),
  };
}

function toMarkdown(p) {
  const q = (v) => JSON.stringify(v == null ? '' : String(v));
  const list = (arr) => (arr || []).map((x) => q(x)).join(', ');
  const objs = (arr, keys) =>
    (arr || [])
      .filter(Boolean)
      .map((o) => `{ ${keys.map((k) => `${k}: ${q(o[k])}`).join(', ')} }`)
      .join(', ');
  const lines = [
    '---',
    `title: ${q(p.title)}`,
    `summary: ${q(p.summary)}`,
    `stack: [${list(p.stack)}]`,
    `status: ${p.status === 'in progress' ? 'in progress' : 'shipped'}`,
    `role: ${q(p.role)}`,
    `ai_note: ${q(p.ai_note)}`,
    `links: [${objs(p.links, ['label', 'url'])}]`,
    `media: [${objs(p.media, ['src', 'alt'])}]`,
    `order: ${Number(p.order) || 1}`,
    `featured: ${p.featured ? 'true' : 'false'}`,
    '---',
    '',
    (p.body || '').trim(),
    '',
  ];
  return lines.join('\n');
}

function listProjects() {
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8');
      return { slug, ...parseMarkdown(raw) };
    })
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/* ───────────────────────── API ───────────────────────── */

app.get('/api/state', (req, res) => {
  try {
    res.json({
      en: readJson('en'),
      ar: readJson('ar'),
      projects: listProjects(),
      build: buildState,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/sections', async (req, res) => {
  try {
    const { en, ar } = req.body || {};
    if (!en || !ar) return res.status(400).json({ error: 'en and ar are required' });
    writeJson('en', en);
    writeJson('ar', ar);
    await scheduleRebuild();
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    res.json(listProjects());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function saveProject(body, slug) {
  const clean = {
    title: String(body.title || '').trim(),
    summary: String(body.summary || '').trim(),
    stack: Array.isArray(body.stack) ? body.stack.map(String) : [],
    status: body.status === 'in progress' ? 'in progress' : 'shipped',
    role: String(body.role || '').trim(),
    ai_note: String(body.ai_note || '').trim(),
    links: Array.isArray(body.links) ? body.links : [],
    media: Array.isArray(body.media) ? body.media : [],
    order: Number(body.order) || 1,
    featured: Boolean(body.featured),
    body: String(body.body || ''),
  };
  if (!clean.title) throw new Error('Title is required');
  fs.writeFileSync(path.join(PROJECTS_DIR, `${slug}.md`), toMarkdown(clean), 'utf8');
  return clean;
}

app.post('/api/projects', async (req, res) => {
  try {
    const body = req.body || {};
    const slug = String(body.slug || '').trim();
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'Slug must be lowercase letters, numbers and dashes' });
    }
    const file = path.join(PROJECTS_DIR, `${slug}.md`);
    if (fs.existsSync(file)) return res.status(409).json({ error: 'A project with that slug already exists' });
    saveProject(body, slug);
    await scheduleRebuild();
    res.json({ ok: buildState.last && buildState.last.ok, slug, build: buildState });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/projects/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'Invalid slug' });
    const file = path.join(PROJECTS_DIR, `${slug}.md`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Project not found' });
    saveProject(req.body || {}, slug);
    await scheduleRebuild();
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/projects/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'Invalid slug' });
    const file = path.join(PROJECTS_DIR, `${slug}.md`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Project not found' });
    fs.unlinkSync(file);
    await scheduleRebuild();
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.post('/api/cv', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'PDF only' });
    fs.writeFileSync(path.join(PUBLIC_DIR, 'Mutman_CV.pdf'), req.file.buffer);
    await scheduleRebuild();
    res.json({ ok: buildState.last && buildState.last.ok, build: buildState });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const exts = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' };
    const ext = exts[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: 'PNG, JPG, WEBP or SVG only' });
    const base = String(req.body.name || req.file.originalname || 'image')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image';
    const dir = path.join(PUBLIC_DIR, 'images');
    fs.mkdirSync(dir, { recursive: true });
    const name = `${base}-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(dir, name), req.file.buffer);
    await scheduleRebuild();
    res.json({ ok: true, path: `/images/${name}`, build: buildState });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/stats', async (req, res) => {
  if (!GC_TOKEN) return res.json({ configured: false });
  const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365));
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${GC_TOKEN}` };
  try {
    const [tot, hits] = await Promise.all([
      fetch(`${GC_URL}/api/v0/stats/total?start=${fmt(start)}&end=${fmt(end)}`, { headers }),
      fetch(`${GC_URL}/api/v0/stats/hits?start=${fmt(start)}&end=${fmt(end)}&limit=15`, { headers }),
    ]);
    const data = { configured: true, days, total: null, hits: null, error: null };
    if (!tot.ok) {
      data.error = `GoatCounter returned ${tot.status}`;
      return res.json(data);
    }
    data.total = await tot.json();
    data.hits = hits.ok ? await hits.json() : null;
    res.json(data);
  } catch (e) {
    res.status(500).json({ configured: true, error: String((e && e.message) || e) });
  }
});

app.get('/api/build', (req, res) => res.json(buildState));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`mutman admin listening on http://127.0.0.1:${PORT}`);
  console.log(`site root: ${SITE_ROOT}`);
  console.log(`publish dir: ${PUBLISH_DIR}`);
});
