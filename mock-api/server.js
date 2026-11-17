// PaaniLink mock API server (Phase 1, local development).
// Zero dependencies: uses only Node's built-in modules.
//  - Serves the frontend from /public
//  - Serves the REST API under /api (routes and rules are in core.js, see docs/API_CONTRACT.md)
//  - Stores data in mock-api/db.json (delete it or run `npm run reset` to restore the seed)
// On static hosting (GitHub Pages) the same core.js runs inside public/sw.js instead.
// In Phase 2 the real backend replaces this.

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { META } = require('./meta');
const { buildSeed } = require('./seed');
const { createMockApi } = require('./core');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'db.json');
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 150); // fake network delay so loading states are visible

// The API keeps its data in a JSON file.
const api = createMockApi({
  META,
  buildSeed,
  storage: {
    load: () => (fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : null),
    save: db => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
  }
});

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// /mock-api/meta.js, seed.js and core.js are also served so the Service Worker
// (public/sw.js) can be tested locally. Everything else comes from /public.
function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  let base = PUBLIC_DIR;
  if (/^\/mock-api\/(meta|seed|core)\.js$/.test(rel)) base = ROOT_DIR;
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, content) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  });
  res.end(status === 204 ? undefined : JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) reject({ status: 413, message: 'Request body too large' });
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject({ status: 400, message: 'Request body is not valid JSON' }); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
  if (req.method === 'OPTIONS') return sendJson(res, 204, null);

  let result;
  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    result = api.handle({
      method: req.method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      authorization: req.headers.authorization
    });
  } catch (e) {
    result = { status: e.status || 400, payload: { error: { status: e.status || 400, message: e.message, details: null } } };
  }
  setTimeout(() => sendJson(res, result.status, result.payload), LATENCY_MS);
});

server.listen(PORT, () => {
  console.log(`PaaniLink mock API running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser. Demo password for all accounts: paani1234`);
});
