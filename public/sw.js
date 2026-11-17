// Service Worker that runs the PaaniLink mock API inside the browser.
//
// Why: static hosting such as GitHub Pages cannot run mock-api/server.js (Node).
// When js/api.js sees that no API server answers, it registers this worker.
// From then on every fetch('api/...') made by the pages is answered here, using the
// SAME routes and rules as the Node server (mock-api/core.js).
// Data is saved in the browser's Cache Storage, so each visitor has their own demo data.

importScripts('../mock-api/meta.js', '../mock-api/seed.js', '../mock-api/core.js');

const DB_CACHE = 'paanilink-mock-db';
const DB_URL = new URL('mock-db.json', self.registration.scope).href;
const LATENCY_MS = 120; // small delay so loading states are visible, like the Node server

let apiPromise = null;
let saving = Promise.resolve();

// Creates the API once, with the saved database (or the seed on first visit).
function getApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      const cache = await caches.open(DB_CACHE);
      const saved = await cache.match(DB_URL);
      const initial = saved ? await saved.json() : null;
      return createMockApi({
        META,
        buildSeed,
        storage: {
          load: () => initial,
          // Writes are chained so they reach Cache Storage in order.
          save: db => {
            const text = JSON.stringify(db);
            saving = saving.then(() => cache.put(DB_URL, new Response(text, { headers: { 'Content-Type': 'application/json' } })));
          }
        }
      });
    })();
  }
  return apiPromise;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// js/api.js asks a waiting page to be taken over (e.g. after a hard reload).
self.addEventListener('message', event => {
  if (event.data === 'claim') self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const i = url.pathname.indexOf('/api/');
  if (i === -1) return; // pages, css and js load normally
  event.respondWith(handleApi(event.request, url, url.pathname.slice(i)));
});

const json = (status, payload) =>
  new Response(status === 204 ? null : JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

async function handleApi(request, url, pathname) {
  if (request.method === 'OPTIONS') return json(204, null);
  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: { status: 400, message: 'Request body is not valid JSON', details: null } });
      }
    }
  }
  const api = await getApi();
  const { status, payload } = api.handle({
    method: request.method,
    pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    authorization: request.headers.get('Authorization') || ''
  });
  await new Promise(r => setTimeout(r, LATENCY_MS));
  return json(status, payload);
}
