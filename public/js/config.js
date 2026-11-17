// The only place that knows where the API lives.
//
// API_BASE is relative ('api' -> same folder as the pages), so it works both on
// http://localhost:3000/ and on https://<user>.github.io/<repo>/public/.
// Phase 2: change it to the real backend URL, e.g. 'http://localhost:5000/api'.
export const API_BASE = 'api';

// Where the mock API runs:
//  'auto'    - use the Node server if it answers, otherwise run the mock API in the
//              browser (public/sw.js). Needed for GitHub Pages / static hosting.
//  'server'  - always use the server (set this in Phase 2).
//  'browser' - always use the in-browser mock API.
export const MOCK_MODE = 'auto';
