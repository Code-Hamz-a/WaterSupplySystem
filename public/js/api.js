// Every request to the server goes through api(). Pages never call fetch() directly.
import { API_BASE, MOCK_MODE } from './config.js';
import { getToken, clearSession } from './session.js';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

const apiUrl = path => new URL(API_BASE + path, location.href);

/**
 * Makes sure an API is available before the first request.
 * On static hosting (GitHub Pages) there is no API server, so the mock API is
 * started inside the browser as a Service Worker (sw.js). It then answers the
 * normal fetch('api/...') calls, so the rest of the code does not change.
 */
let readyPromise = null;
export function apiReady() {
  if (!readyPromise) readyPromise = startApi();
  return readyPromise;
}

async function startApi() {
  if (MOCK_MODE === 'server' || !('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return; // in-browser API already running
  if (MOCK_MODE === 'auto') {
    try {
      const r = await fetch(apiUrl('/meta'));
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) return; // a real server answered
    } catch {
      /* no server: fall through */
    }
  }
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    // Wait until the worker controls this page (it claims pages when activated).
    await new Promise(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      (reg.active || navigator.serviceWorker.controller)?.postMessage('claim');
    });
  }
}

/** True when the API is running inside the browser (demo on static hosting). */
export const isBrowserMock = () => Boolean(navigator.serviceWorker?.controller);

export async function api(path, { method = 'GET', body, query } = {}) {
  await apiReady();
  const url = apiUrl(path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (res.status === 401 && token) {
    // Token no longer valid (logged out elsewhere or account deactivated).
    clearSession();
    location.href = 'index.html?expired=1';
  }
  if (!res.ok) {
    throw new ApiError(data?.error?.message || `Request failed (${res.status})`, res.status, data?.error?.details);
  }
  return data;
}

export const get = (path, query) => api(path, { query });
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = path => api(path, { method: 'DELETE' });

// Lookup lists (slots, statuses, reasons, workflow rules). Loaded once per page.
let metaPromise = null;
export function getMeta() {
  if (!metaPromise) metaPromise = get('/meta').then(r => r.data);
  return metaPromise;
}

// Fetches every row of a list endpoint (for dropdowns). Uses a large page size.
export async function getAll(path, query = {}) {
  const res = await get(path, { ...query, limit: 500 });
  return res.data;
}
