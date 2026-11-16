# PaaniLink – Water Tanker Booking and Dispatch System

**Phase 1: complete frontend on a mock API** (Web Engineering project, Frontend 15 marks).

PaaniLink lets the City Water Board take tanker bookings online, approve subsidised bookings,
dispatch tankers from hydrants and trace every delivery from booking to confirmation. It makes sure
that a tanker, a driver and hydrant water are never promised twice and that subsidy is not misused.

* Frontend: plain **HTML5, CSS3 (Grid/Flexbox, media queries) and JavaScript ES modules**. No framework.
* Data: every page loads its data with **`fetch()`** from the API. Nothing is hardcoded in the pages.
* Mock API: a small **Node.js** server with **no dependencies** (`mock-api/server.js`) that follows the
  [API contract](docs/API_CONTRACT.md). In Phase 2 the real backend replaces it.

---

## 1. How to run

Requirements: **Node.js 18 or newer** (nothing to `npm install`).

```bash
cd paanilink
npm start            # starts http://localhost:3000 (frontend + mock API)
```

Open **http://localhost:3000** in the browser and log in with a demo account.

If `npm` scripts are blocked on your PC (e.g. "The command prompt has been disabled"), run Node directly:

```bash
node mock-api/server.js                 # same as npm start
# reset: delete mock-api/db.json, then start again
```

```bash
npm run reset        # deletes mock-api/db.json; the seed data is rebuilt on the next start
```

Options: `PORT=4000 npm start` changes the port; `LATENCY_MS=0 npm start` removes the fake 150 ms network delay
(the delay is there so loading states are visible).

> Open the site through `http://localhost:3000`, not by double-clicking the HTML files – ES modules and
> `fetch()` need a web server.

## 2. Demo accounts

All demo passwords are **`paani1234`**. The login page lists the main ones (click to fill).

| Role | Email | Notes |
|---|---|---|
| Administrator | admin@paanilink.pk | Sana Malik |
| Zone Officer | officer.gulshan@paanilink.pk | Gulshan-e-Iqbal |
| Zone Officer | officer.orangi@paanilink.pk | Orangi Town (has a pending subsidy application) |
| Zone Officer | officer.korangi@paanilink.pk | Korangi |
| Zone Officer | officer.lyari@paanilink.pk | Lyari |
| Hydrant Operator | operator.safoora@paanilink.pk | Safoora Hydrant |
| Hydrant Operator | operator.sakhi@paanilink.pk | Sakhi Hassan Hydrant |
| Hydrant Operator | operator.crown@paanilink.pk | Crown Hydrant (closes 16:00) |
| Driver | driver.asif@paanilink.pk | Safoora – has a trip on the way today |
| Driver | driver.bilal@paanilink.pk | Safoora |
| Driver | driver.kamran@paanilink.pk | Sakhi Hassan |
| Driver | driver.danish@paanilink.pk | Sakhi Hassan |
| Driver | driver.faisal@paanilink.pk | Crown |
| Customer | customer@paanilink.pk | Ahmed Raza – commercial only, Gulshan |
| Customer | ayesha@paanilink.pk | Ayesha Bibi – approved subsidised household (12,000 gal/month) |
| Customer | alshifa@paanilink.pk | Al-Shifa Clinic – approved hospital (60,000 gal/month) |
| Customer | zara@paanilink.pk | Zara Khan – subsidy application pending |
| Customer | usman@paanilink.pk | Usman Ghani – Korangi |

Seed bookings are created relative to the day the server first starts, so there is always something
pending, something on the road today, something delivered, failed, disputed and resolved.

## 3. Folder structure

```
paanilink/
├─ package.json            npm start / npm run reset
├─ README.md
├─ docs/
│  ├─ API_CONTRACT.md      every endpoint, body, response and error
│  ├─ ASSUMPTIONS.md       decisions for every ambiguity in the brief
│  ├─ use-case-diagram.svg UML use case diagram
│  └─ use-case-diagram.md  use case descriptions + PlantUML source
├─ mock-api/               (Phase 1 only – replaced by the real backend in Phase 2)
│  ├─ server.js            HTTP server: static files + REST API, rules, role checks
│  ├─ meta.js              lookup lists + booking workflow table (served at /api/meta)
│  ├─ seed.js              demo data
│  └─ db.json              created on first start (git-ignored)
└─ public/                 the frontend
   ├─ *.html               one file per page (see section 5)
   ├─ css/styles.css       single responsive stylesheet
   └─ js/
      ├─ config.js         API_BASE – the only place that knows the server address
      ├─ api.js            fetch wrapper: token header, JSON, errors, getMeta()
      ├─ session.js        token + user in localStorage
      ├─ layout.js         initPage(): login/role guard, header & nav per role, boot()
      ├─ ui.js             DOM helpers: h(), tables, pager, dialogs, toasts, formatting
      ├─ validation.js     rules, validateForm(), live validation, server error display, CNIC/phone masks
      ├─ list.js           createList(): filters + search + sort + pagination via the API
      ├─ booking-actions.js role/status based workflow buttons and their dialogs
      ├─ crud.js           setupCrud(): shared add/edit/delete logic for admin pages
      ├─ variation.js      GROUP VARIATION hook (see section 6)
      └─ pages/*.js        one script per page
```

## 4. How the frontend talks to the API

```
page script (pages/*.js)
   └─> api.js  get()/post()/put()/patch()/del()
          ├─ builds URL from API_BASE (config.js) + path + query
          ├─ adds  Authorization: Bearer <token>  (session.js)
          ├─ fetch() → JSON
          └─ !res.ok → throws ApiError(message, status, details)
   <── { data } or { data, page, total, ... }
   └─> renders with ui.js (h(), renderTable(), renderPager(), ...)
```

* Every page starts with `boot(async () => { const { user, meta } = await initPage([...roles]); ... })`.
  `initPage` sends the user to the login page if not logged in, to their home page if the role is not allowed,
  loads `/api/meta` (all dropdown values and the workflow table) and `/api/auth/me` (fresh profile), and draws the
  role's navigation.
* Text is always inserted with `textContent` (via `h()`), never `innerHTML`, so API data cannot inject HTML.
* **Switching to the Phase 2 backend:** change one line in `public/js/config.js`, e.g.
  `export const API_BASE = 'http://localhost:5000/api';`. The backend must follow
  [docs/API_CONTRACT.md](docs/API_CONTRACT.md) and allow CORS if it runs on another port.
  `/api/demo-accounts` is mock-only; the login page simply hides the demo list if it is missing.

## 5. Pages

| Page | Who | What it does |
|---|---|---|
| `index.html` | everyone | Log in (email + password), demo account list, session-expired notice. |
| `register.html` | new customer | Register with name, CNIC, mobile, email, zone (from API), address, password. |
| `dashboard.html` | customer, officer, operator, admin | Role-specific summary cards (from `/api/dashboard`) and recent activity. |
| `book.html` | customer | Book a tanker: type, hydrant of own zone, date (≤ 7 days), slot, size with price; live quota and subsidy meters. |
| `bookings.html` | customer, officer, operator, admin | Booking list with search, status/type/hydrant/zone/date filters, sorting, pagination and inline action buttons. Each role only gets its own scope. |
| `booking.html?id=` | all roles | Booking detail, progress steps, tanker & driver, full history timeline, and the buttons allowed for this role + status. |
| `bills.html` | customer, admin | Bills with status filter; customer can pay an Unpaid bill (simulated). |
| `subsidy-apply.html` | customer | Apply for subsidised status (category, proof type + reference, income / institution) and see application history and monthly usage. |
| `subsidy-review.html` | officer, admin | Review applications of the zone: approve with a monthly gallon limit, or reject with remarks. |
| `disputes.html` | customer, officer, admin | Dispute list; officer/admin resolve with an outcome (Refund / Redelivery arranged / No action). |
| `operator.html` | operator | Dispatch board for the hydrant: quota meter, approved bookings to assign, Mark filled, Mark left hydrant. |
| `fleet.html` | operator | Mark own tankers Available/Unavailable and the hydrant Available/Unavailable (with reason). |
| `driver.html` | driver | Phone-first trip cards with big Arrived / Delivered / Failed buttons, call customer link. |
| `admin-zones.html` | admin | Manage zones. |
| `admin-hydrants.html` | admin | Manage hydrants: quota, hours, zones served, status. |
| `admin-tankers.html` | admin | Manage tankers: registration, size, hydrant, status. |
| `admin-rates.html` | admin | Manage commercial and subsidised rates per tanker size. |
| `admin-users.html` | admin | Manage user accounts and staff roles, activate/deactivate. |
| `reports.html` | admin | City reports for a date range: by status, type, hydrant quota usage, zone, revenue, fail reasons, disputes. |

## 6. Rubric checklist (Mid evaluation – Frontend)

| Rubric point | Where it is done |
|---|---|
| All pages working and linked | Role-based navigation in `layout.js`; dashboard cards and table rows link to filtered lists and booking detail. |
| All data loaded with Fetch from the mock API, nothing hardcoded | Every list, dropdown, price, slot, status label and reason comes from the API (`/api/meta`, `/api/zones`, `/api/rates`, ...) through `api.js`. |
| Dynamic DOM | Pages render with `h()` / `renderTable()`; lists re-render on filter, sort and page change without reloading. |
| Validation on every form | `validation.js` schemas on login, register, booking, subsidy application, review, dispute, fail reason, assign, pay, and all admin forms; live validation on blur; server errors shown on the same fields. Booking form also checks quota, slot, monthly limit before sending. |
| Group variation | Hook `extraBookingRules()` in `public/js/variation.js`, already called by the booking form; variation name shown in the footer. Variation not yet assigned – see [ASSUMPTIONS.md](docs/ASSUMPTIONS.md#g-technical-phase-1). |
| Actions shown by role and status | `booking-actions.js` reads `meta.actions` (role + from-status table) and only shows allowed buttons; the server checks the same table. |
| Responsive (360 px and laptop) | Mobile-first `styles.css` with CSS Grid, Flexbox and media queries at 640 / 760 / 960 px; tables turn into cards on phones; collapsible nav. |
| Driver screen easy on a phone | `driver.html`: one card per trip, 52 px tall buttons, tap-to-call. |
| Accessible labels | Every input has a `<label for>`; hints and errors linked with `aria-describedby`, `aria-invalid`; `role="alert"` / `aria-live` for messages; skip link; visible focus ring; 44 px touch targets. |
| Documentation | [API contract](docs/API_CONTRACT.md), [use case diagram](docs/use-case-diagram.md), [assumptions](docs/ASSUMPTIONS.md), this README. |

## 7. Viva walkthrough: click → fetch → render

Example: **Zone Officer approves a subsidised booking** on `bookings.html`.

1. **Page load** – `pages/bookings.js` calls `initPage([...])` (`layout.js`), which loads `/api/meta` and `/api/auth/me`.
   Then `createList()` (`list.js`) reads the filter form and calls `get('/bookings', { status, page, sort, ... })`.
2. **Request** – `api.js` builds `GET /api/bookings?status=PendingApproval&page=1&limit=10`, adds
   `Authorization: Bearer mock-token-2` and calls `fetch()`.
3. **Server** – `mock-api/server.js` route `GET /api/bookings` keeps only bookings the officer may see
   (`canSeeBooking()`: same zone), filters, sorts and paginates (`listResult()`), and returns `{ data, page, total, ... }`.
4. **Render** – `bookings.js` builds the table with `renderTable()`. For each row the *Actions* column calls
   `actionButtons(booking, { user, meta })` in `booking-actions.js`, which keeps only actions whose `roles` include
   `officer` and whose `from` includes the booking's status → **Approve** and **Reject** buttons appear.
5. **Click Approve** – `runAction()` opens a confirmation dialog (`openDialog()` in `ui.js`). On confirm it calls
   `post('/bookings/1/approve', {})`.
6. **Server rules** – route `POST /api/bookings/:id/:action` checks: action exists → officer can see the booking →
   role allowed → status is `PendingApproval` → customer still subsidised and the monthly limit is not exceeded.
   It sets status `Approved`, marks the bill `Unpaid`, adds a history entry and returns the updated booking.
   If a rule fails it returns e.g. `409 { error: { message: "Approving would exceed the customer's monthly limit ..." } }`
   and the dialog shows that message.
7. **Re-render** – a toast says "Booking #1: Approved" and `list.reload()` fetches the list again; the row now shows
   the Approved badge and no buttons for the officer (the operator will now see it on the dispatch board).

**Doing a live change** (typical viva request), e.g. "add a *Vehicle stuck* fail reason": add it to `failReasons` in
`mock-api/meta.js` and restart – the driver's Failed dialog shows it automatically because the list comes from `/api/meta`.
Or "show the driver phone in the bookings list": add a column `{ label: 'Driver', render: b => b.driverPhone }` in
`pages/bookings.js`.

## 8. Phase 2 (backend) notes

The backend will replace `mock-api/` and keep the same contract. It must enforce every rule in
[ASSUMPTIONS.md](docs/ASSUMPTIONS.md) on the server, run booking creation and tanker/driver assignment inside one
transaction (no double booking when two requests arrive together), do search/filter/sort/pagination in the database,
avoid N+1 queries, and build the dashboard and reports from aggregate queries.
