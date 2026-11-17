# PaaniLink API Contract (Phase 1)

This is the contract between the frontend and the server. In Phase 1 it is served by the
mock API (`mock-api/core.js`, run by `server.js` locally and by `public/sw.js` on GitHub Pages). In Phase 2 the real backend must implement **the same paths,
bodies and responses**, so the frontend keeps working by changing only `API_BASE` in
`public/js/config.js`.

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL (Phase 1) | `http://localhost:3000/api` (same origin as the frontend, `API_BASE = '/api'`) |
| Format | JSON in and out. Send `Content-Type: application/json` on POST/PUT/PATCH. |
| Dates | `deliveryDate` is `YYYY-MM-DD` (local date). Timestamps (`createdAt`, `at`, ...) are ISO 8601 UTC strings. |
| Times | Hydrant hours are `HH:MM` (24 hour). |
| Money | Whole Pakistani rupees (number). |
| Water | Gallons (number). |
| IDs | Positive integers. |

### 1.1 Authentication

1. `POST /api/auth/login` (or `/api/auth/register`) returns `{ token, user }`.
2. The frontend stores it in `localStorage` (`public/js/session.js`) and sends it on every request:

```
Authorization: Bearer <token>
```

* Mock token format is `mock-token-<userId>`. **This is mock-only.** Phase 2 will issue a signed JWT; the frontend treats the token as an opaque string, so nothing else changes.
* If a request with a token gets `401`, the frontend clears the session and goes to `index.html?expired=1`.
* A deactivated user (`active: false`) cannot log in (`403`) and any old token stops working (`401`).

Roles: `customer`, `officer` (Zone Officer), `operator` (Hydrant Operator), `driver`, `admin`.

In the tables below "Roles" means:
* **Public** – no token needed.
* **Any** – any logged-in user.
* A list such as `officer, admin` – only these roles; others get `403`.

### 1.2 Response envelope

**Single object**

```json
{ "data": { "id": 7, "status": "Failed" } }
```

**List (paginated)**

```json
{
  "data": [ { "id": 17 }, { "id": 16 } ],
  "page": 1,
  "limit": 10,
  "total": 17,
  "totalPages": 2,
  "sort": "id",
  "order": "desc"
}
```

**Error**

```json
{
  "error": {
    "status": 422,
    "message": "Please fix the highlighted fields",
    "details": { "cnic": "CNIC must look like 42101-1234567-1" }
  }
}
```

`details` is either `null` or an object of `fieldName -> message`. The frontend shows each
message under the matching form field (`showApiError()` in `public/js/validation.js`).

### 1.3 Common list query parameters

Every `GET` that returns a list accepts:

| Param | Meaning | Example |
|---|---|---|
| `q` | Case-insensitive text search over the endpoint's search fields | `q=gulshan` |
| *filter fields* | Exact match. Comma = OR. Listed per endpoint. | `status=Approved,Assigned` |
| `sort` | One of the endpoint's sortable fields (unknown values fall back to the default) | `sort=deliveryDate` |
| `order` | `asc` or `desc` | `order=asc` |
| `page` | Page number, starts at 1 (clamped to the last page) | `page=2` |
| `limit` | Page size, default 10, max 500 | `limit=20` |

### 1.4 Status codes

| Code | When |
|---|---|
| 200 | OK |
| 201 | Created (register, create booking, create record, create subsidy application) |
| 204 | CORS pre-flight (`OPTIONS`) |
| 400 | Body is not valid JSON |
| 401 | No / invalid token, or wrong email/password on login |
| 403 | Logged in but not allowed (wrong role, other zone/hydrant, not your record, account deactivated on login) |
| 404 | Record or route not found |
| 405 | Route exists but not for this HTTP method |
| 409 | Business rule conflict (quota full, tanker busy, wrong status, monthly limit, duplicate, still in use) |
| 413 | Body larger than 1 MB |
| 422 | Validation failed (`details` lists the fields) |
| 500 | Unexpected server error |

---

## 2. Meta and auth

### GET /api/meta — Public
Lookup lists and workflow rules. The frontend reads every dropdown and the action table from here (nothing hardcoded).

```json
{
  "data": {
    "roles": ["customer", "officer", "operator", "driver", "admin"],
    "roleLabels": { "customer": "Customer", "officer": "Zone Officer", "...": "..." },
    "bookingTypes": ["Commercial", "Subsidised"],
    "slots": [
      { "id": "MORNING", "label": "Morning (08:00 - 12:00)", "start": "08:00", "end": "12:00" },
      { "id": "AFTERNOON", "label": "Afternoon (12:00 - 16:00)", "start": "12:00", "end": "16:00" },
      { "id": "EVENING", "label": "Evening (16:00 - 20:00)", "start": "16:00", "end": "20:00" },
      { "id": "NIGHT", "label": "Night (20:00 - 23:59)", "start": "20:00", "end": "23:59" }
    ],
    "maxAdvanceDays": 7,
    "bookingStatuses": ["PendingApproval", "Approved", "Rejected", "Cancelled", "Assigned", "Filled", "Dispatched", "Arrived", "Delivered", "Failed", "Confirmed", "Disputed", "Resolved"],
    "statusLabels": { "PendingApproval": "Pending approval", "Dispatched": "On the way", "...": "..." },
    "quotaFreeStatuses": ["Cancelled", "Rejected"],
    "subsidyFreeStatuses": ["Cancelled", "Rejected", "Failed"],
    "failReasons": ["House locked", "Road blocked", "Wrong address", "Customer refused", "Vehicle breakdown", "Other"],
    "subsidyCategories": [
      { "id": "Household", "label": "Low-income household", "defaultLimitGallons": 12000 },
      { "id": "Hospital", "label": "Hospital", "defaultLimitGallons": 60000 },
      { "id": "Mosque", "label": "Mosque", "defaultLimitGallons": 36000 }
    ],
    "proofTypes": ["Income certificate", "BISP card", "Utility bill", "Registration certificate"],
    "householdIncomeCeiling": 50000,
    "applicationStatuses": ["Pending", "Approved", "Rejected"],
    "disputeStatuses": ["Open", "Resolved"],
    "disputeOutcomes": ["Refund", "Redelivery arranged", "No action"],
    "paymentMethods": ["Cash", "JazzCash", "EasyPaisa", "Bank transfer"],
    "billStatuses": ["AwaitingApproval", "Unpaid", "Paid", "Void", "Refunded"],
    "tankerStatuses": ["Available", "Unavailable"],
    "hydrantStatuses": ["Available", "Unavailable"],
    "actions": { "approve": { "label": "Approve", "roles": ["officer"], "from": ["PendingApproval"], "to": "Approved", "input": null, "style": "primary" }, "...": "..." }
  }
}
```

### GET /api/demo-accounts — Public — **MOCK ONLY**
Lists the demo logins shown on the login page. **Must not exist in Phase 2.** The login page hides the demo card if this call fails.

```json
{ "data": [ { "name": "Hamza Arif", "email": "admin@paanilink.pk", "password": "paani1234", "role": "admin" } ] }
```

### POST /api/demo/reset — Public — **MOCK ONLY**
Throws away all changes and rebuilds the seed data. Used by the "Reset demo data" button on the
login page when the site runs on GitHub Pages. **Must not exist in Phase 2.**

```json
{ "data": { "reset": true } }
```

### POST /api/auth/register — Public
Creates a **customer** account and logs it in.

| Field | Type | Rule |
|---|---|---|
| `name` | string | 3-60 letters, spaces, `.` `'` `-` |
| `cnic` | string | `^\d{5}-\d{7}-\d$` e.g. `42101-1234567-1`, unique |
| `phone` | string | `^03\d{2}-?\d{7}$` e.g. `0300-1234567`, unique |
| `email` | string | valid email, unique (case-insensitive) |
| `zoneId` | integer | existing zone |
| `address` | string | at least 10 characters |
| `password` | string | 8+ characters with at least one letter and one digit |

`201` → `{ "data": { "token": "mock-token-19", "user": { ...user } } }`

Errors: `422` with field details (format errors and "already registered").

### POST /api/auth/login — Public

Body: `{ "email": "customer@paanilink.pk", "password": "paani1234" }`

`200` →

```json
{
  "data": {
    "token": "mock-token-14",
    "user": {
      "id": 14, "role": "customer", "name": "Ahmed Raza", "email": "customer@paanilink.pk",
      "phone": "0321-1234567", "cnic": "42201-1234567-1", "active": true,
      "zoneId": 3, "zoneName": "Gulshan-e-Iqbal", "hydrantId": null, "hydrantName": null,
      "address": "House B-112, Block 13-D, Gulshan-e-Iqbal",
      "subsidy": { "status": "None", "category": null, "monthlyLimitGallons": 0 },
      "createdAt": "2026-09-26T05:00:00.000Z"
    }
  }
}
```

Errors: `401` "Invalid email or password"; `403` account deactivated.

### GET /api/auth/me — Any
Returns the fresh profile of the logged-in user (same shape as `user` above). Every page calls it on load so subsidy status and zone are always current.

**User object** (returned by all user endpoints; `password` is never returned): `id, role, name, email, phone, cnic, active, zoneId, zoneName, hydrantId, hydrantName, address, licenseNo (drivers), subsidy { status: None|Pending|Approved|Rejected, category, monthlyLimitGallons, approvedAt? }, createdAt, updatedAt?`

---

## 3. Zones

**Zone object:** `{ id, name, description, createdAt, updatedAt?, hydrantNames: string[] }`

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/zones` | Public | List. Search: `name, description`. Sort: `id, name` (default `name asc`). |
| `GET /api/zones/:id` | Public | One zone. |
| `POST /api/zones` | admin | Body `{ name, description }`. `201`. |
| `PUT /api/zones/:id` | admin | Same body. |
| `DELETE /api/zones/:id` | admin | `{ "data": { "id": 4, "deleted": true } }` |

Rules: `name` 3-50 chars, unique (case-insensitive); `description` max 200.
Errors: `422` validation; `409` "This zone is still used by hydrants, users or bookings and cannot be deleted".

---

## 4. Hydrants

**Hydrant object:**

```json
{
  "id": 1, "name": "Safoora Hydrant", "location": "University Road, Safoora Chowrangi",
  "dailyQuotaGallons": 60000, "openTime": "06:00", "closeTime": "22:00",
  "zoneIds": [3, 1], "zoneNames": ["Gulshan-e-Iqbal", "Korangi"],
  "status": "Available", "unavailableReason": null,
  "tankerCount": 4, "reservedToday": 13000, "createdAt": "..."
}
```

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/hydrants` | Any | Search: `name, location`. Filters: `status`, `zoneIds` (hydrants serving that zone, e.g. `zoneIds=3`). Sort: `id, name, dailyQuotaGallons` (default `name asc`). |
| `GET /api/hydrants/:id` | Any | |
| `POST /api/hydrants` | admin | Body below. `201`. |
| `PUT /api/hydrants/:id` | admin | Body below. |
| `DELETE /api/hydrants/:id` | admin | `409` if it has tankers or bookings (mark Unavailable instead). |
| `PATCH /api/hydrants/:id/status` | operator (own hydrant), admin | Body `{ status, reason }` |
| `GET /api/hydrants/:id/availability?date=YYYY-MM-DD` | Any | Quota and slots for one day |
| `GET /api/hydrants/:id/resources?date&slot&capacity&bookingId` | operator (own), admin | Tankers and drivers for assigning |

**Create / update body**

| Field | Type | Rule |
|---|---|---|
| `name` | string | min 3, unique |
| `location` | string | min 5 |
| `dailyQuotaGallons` | integer | ≥ 6000 |
| `openTime`, `closeTime` | `HH:MM` | close must be after open |
| `zoneIds` | integer[] | at least one existing zone |
| `status` | `Available` \| `Unavailable` | optional, default `Available` |
| `unavailableReason` | string | used when `status` is `Unavailable` |

**PATCH status body:** `{ "status": "Unavailable", "reason": "Pump motor repair" }` – `reason` min 5 chars when Unavailable. Operator on another hydrant → `403`.

**Availability response**

```json
{
  "data": {
    "hydrantId": 1, "hydrantName": "Safoora Hydrant", "date": "2026-11-16",
    "status": "Available", "unavailableReason": null,
    "openTime": "06:00", "closeTime": "22:00",
    "dailyQuotaGallons": 60000, "reservedGallons": 3000, "remainingGallons": 57000,
    "slots": [
      { "id": "MORNING", "label": "Morning (08:00 - 12:00)", "start": "08:00", "end": "12:00", "open": true },
      { "id": "NIGHT", "label": "Night (20:00 - 23:59)", "start": "20:00", "end": "23:59", "open": false }
    ]
  }
}
```

`reservedGallons` = sum of `capacity` of that hydrant's bookings on that date whose status is **not** in `quotaFreeStatuses` (Cancelled, Rejected). A slot is `open` when `slot.start >= openTime` and `slot.end <= closeTime`. If `date` is missing/invalid, today is used.

**Resources response** (`capacity` filters tankers by size; `bookingId` excludes that booking when checking "busy", so re-assigning works):

```json
{
  "data": {
    "tankers": [ { "id": 2, "registrationNo": "KHT-3001", "capacity": 3000, "hydrantId": 1, "status": "Available", "busy": true } ],
    "drivers": [ { "id": 10, "name": "Bilal Raza", "phone": "0310-9999992", "active": true, "busy": false } ]
  }
}
```

---

## 5. Tankers

**Tanker object:** `{ id, registrationNo, capacity, hydrantId, hydrantName, status, createdAt, updatedAt? }`

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/tankers` | admin, operator (own hydrant only), officer | Search: `registrationNo, hydrantName`. Filters: `status, hydrantId, capacity`. Sort: `id, registrationNo, capacity, hydrantName, status` (default `registrationNo`). |
| `GET /api/tankers/:id` | same | Operator asking for another hydrant's tanker → `403`. |
| `POST /api/tankers` | admin | `201` |
| `PUT /api/tankers/:id` | admin | |
| `DELETE /api/tankers/:id` | admin | `409` if the tanker has any trip history. |
| `PATCH /api/tankers/:id/status` | operator (own hydrant), admin | Body `{ "status": "Available" \| "Unavailable" }` |

Body rules: `registrationNo` `^[A-Z]{2,4}-\d{3,5}$` (upper-cased, unique); `capacity` must equal a capacity in the rate list; `hydrantId` existing; `status` optional.

---

## 6. Rates

**Rate object:** `{ id, capacity, commercialRate, subsidisedRate, createdAt }`

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/rates` | Any | Sort: `capacity` (default). The list of capacities = the tanker sizes customers can book. |
| `GET /api/rates/:id` | Any | |
| `POST /api/rates` | admin | |
| `PUT /api/rates/:id` | admin | |
| `DELETE /api/rates/:id` | admin | `409` if tankers of that size exist. |

Rules: `capacity` integer ≥ 500 and unique; both rates > 0; `subsidisedRate < commercialRate`.

---

## 7. Users (administration)

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/users` | admin | Search: `name, email, phone, cnic`. Filters: `role, zoneId, hydrantId, active` (`true`/`false`). Sort: `id, name, role, createdAt`. |
| `GET /api/users/:id` | admin | |
| `POST /api/users` | admin | Create any role (staff accounts). `201`. |
| `PUT /api/users/:id` | admin | Role cannot be changed (the existing role is kept). Password optional on update. |
| `DELETE /api/users/:id` | admin | `409` if the user has bookings as customer or driver (deactivate instead). |
| `PATCH /api/users/:id/status` | admin | Body `{ "active": false }`. `409` when deactivating yourself. |

Body: `role, name, email, phone, cnic, password` (+ by role: `zoneId` for customer/officer, `address` for customer, `hydrantId` for operator/driver, `licenseNo` for driver `^[A-Z]{2,4}-\d{4,6}$` e.g. `LTV-55821`), optional `active`. Same format/uniqueness rules as register.

---

## 8. Subsidy

**Application object:**

```json
{
  "id": 3, "customerId": 17, "zoneId": 2, "category": "Household",
  "proofType": "Income certificate", "proofReference": "IC-2025-09981",
  "monthlyIncome": 35000, "householdSize": 5, "institutionName": null,
  "details": "Single earning member, daily wage.",
  "status": "Pending", "reviewedBy": null, "reviewerName": null, "remarks": null,
  "monthlyLimitGallons": null, "createdAt": "...", "reviewedAt": null,
  "customerName": "Zara Khan", "customerCnic": "42301-4445556-4", "customerPhone": "0312-4445556",
  "customerAddress": "House 45, Sector 5-E, Orangi Town", "zoneName": "Orangi Town"
}
```

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/subsidy-applications` | customer (own), officer (own zone), admin | Search: `customerName, customerCnic, proofReference, institutionName`. Filters: `status, category, zoneId`. Sort: `id, createdAt, customerName, status` (default `createdAt desc`). |
| `POST /api/subsidy-applications` | customer | Apply. `201`. Sets the customer's `subsidy.status` to `Pending`. |
| `POST /api/subsidy-applications/:id/approve` | officer (same zone), admin | Body `{ monthlyLimitGallons, remarks? }` |
| `POST /api/subsidy-applications/:id/reject` | officer (same zone), admin | Body `{ remarks }` |
| `GET /api/subsidy/usage?month=YYYY-MM` | customer | Own usage for a month (default this month) |

**Apply body**

| Field | Rule |
|---|---|
| `category` | one of `subsidyCategories[].id` |
| `proofType` | one of `proofTypes` |
| `proofReference` | `^[A-Za-z0-9-/]{4,30}$` (certificate / card / registration number) |
| `monthlyIncome` | Household only: integer ≥ 0 and ≤ `householdIncomeCeiling` (50,000) |
| `householdSize` | Household only: integer 1-30 |
| `institutionName` | Hospital / Mosque only: min 3 chars |
| `details` | optional, max 300 |

Errors: `409` "You already have an application waiting for review"; `409` "Your subsidised status is already approved"; `422` field errors.

**Approve**: `monthlyLimitGallons` integer 1,000-200,000. Sets customer `subsidy = { status: Approved, category, monthlyLimitGallons, approvedAt }`.
**Reject**: `remarks` min 5. Sets customer `subsidy.status = Rejected` (they may apply again).
Both: `409` if the application is no longer `Pending`; `403` for an officer of another zone.

**Usage response**

```json
{ "data": { "month": "2026-11", "status": "Approved", "category": "Household", "monthlyLimitGallons": 12000, "usedGallons": 7000, "remainingGallons": 5000 } }
```

`usedGallons` = subsidised bookings of this customer with `deliveryDate` in that month and status **not** in `subsidyFreeStatuses` (Cancelled, Rejected, Failed).

---

## 9. Bookings

**Booking object** (detail; lists return the same without `history`):

```json
{
  "id": 3, "customerId": 14, "zoneId": 3, "hydrantId": 1,
  "capacity": 3000, "type": "Commercial",
  "deliveryDate": "2026-11-15", "slot": "EVENING", "slotLabel": "Evening (16:00 - 20:00)",
  "deliveryAddress": "House B-112, Block 13-D, Gulshan-e-Iqbal", "notes": null,
  "status": "Assigned", "amount": 6000,
  "tankerId": 2, "driverId": 9, "failReason": null,
  "filledAt": null, "leftAt": null, "arrivedAt": null, "deliveredAt": null, "confirmedAt": null,
  "createdAt": "...", "updatedAt": "...",
  "hydrantName": "Safoora Hydrant", "hydrantLocation": "University Road, Safoora Chowrangi",
  "zoneName": "Gulshan-e-Iqbal", "customerName": "Ahmed Raza", "customerPhone": "0321-1234567",
  "tankerRegNo": "KHT-3001", "driverName": "Asif Baloch", "driverPhone": "0310-9999991",
  "billId": 3, "billStatus": "Unpaid", "disputeId": null, "disputeStatus": null,
  "history": [
    { "status": "Approved", "at": "...", "byUserId": null, "byName": "System", "byRole": "system", "note": "Commercial booking approved automatically" },
    { "status": "Assigned", "at": "...", "byUserId": 6, "byName": "Kashif Ali", "byRole": "operator", "note": "Tanker KHT-3001, driver Asif Baloch" }
  ]
}
```

`history` is the audit trail: every status change with who, when and a note. It is how a delivery is traced from booking to confirmation. (`billStatus` is removed for drivers.)

### Who sees which bookings (applied to list, detail and actions)

| Role | Sees |
|---|---|
| customer | own bookings only |
| officer | all bookings in own zone (read-only except approve/reject) |
| operator | bookings at own hydrant, except `PendingApproval` and `Rejected` |
| driver | only bookings assigned to them |
| admin | all |

Opening a booking outside this scope → `403` "You are not allowed to view this booking".

### GET /api/bookings — Any
Search (`q`): `id, customerName, deliveryAddress, hydrantName, tankerRegNo, driverName, zoneName`.
Filters: `status, type, hydrantId, zoneId, deliveryDate, slot, capacity, customerId`, plus date range `dateFrom`, `dateTo` (inclusive, on `deliveryDate`).
Sort: `id, deliveryDate, createdAt, amount, status, capacity, customerName` (default `id desc`).

Example: `GET /api/bookings?status=PendingApproval&type=Subsidised&sort=deliveryDate&order=asc&page=1&limit=10`

### GET /api/bookings/:id — Any (scoped)

### POST /api/bookings — customer

| Field | Type | Rule |
|---|---|---|
| `type` | string | `Commercial` or `Subsidised` |
| `hydrantId` | integer | must serve the customer's zone and be `Available` |
| `capacity` | integer | a capacity from the rate list |
| `deliveryDate` | `YYYY-MM-DD` | today … today + `maxAdvanceDays` (7) |
| `slot` | string | slot id; must fit inside hydrant hours; if today, the slot must not be over |
| `deliveryAddress` | string | optional, defaults to profile address; min 10 chars |
| `notes` | string | optional, max 200 |

Business checks (in this order, after field validation):

1. Hydrant unavailable → `409`.
2. `capacity` > remaining hydrant quota for that date → `409`.
3. Subsidised and customer not Approved → `403`.
4. Subsidised and `capacity` > remaining monthly subsidy → `409`.

Result: Commercial → status `Approved` (history by "System"), bill `Unpaid`.
Subsidised → status `PendingApproval`, bill `AwaitingApproval`. `amount` = commercial or subsidised rate. `201` with the booking.

**Example 409**

```json
{
  "error": {
    "status": 409,
    "message": "Safoora Hydrant has only 2,000 gallons of quota left on 2026-11-16",
    "details": null
  }
}
```

**Example 422**

```json
{
  "error": {
    "status": 422,
    "message": "Please fix the highlighted fields",
    "details": {
      "hydrantId": "This hydrant does not serve your zone",
      "slot": "The hydrant is closed during this slot",
      "deliveryDate": "You can book at most 7 days ahead"
    }
  }
}
```

### POST /api/bookings/:id/:action — booking workflow

One endpoint for every status change. The allowed actions come from `meta.actions`:

| Action | Role | From status | To status | Body |
|---|---|---|---|---|
| `cancel` | customer | PendingApproval, Approved, Assigned | Cancelled | `{ reason? }` max 200 |
| `approve` | officer | PendingApproval | Approved | `{ note? }` |
| `reject` | officer | PendingApproval | Rejected | `{ reason }` min 5 |
| `assign` | operator | Approved, Assigned (re-assign) | Assigned | `{ tankerId, driverId }` |
| `filled` | operator | Assigned | Filled | – |
| `dispatch` | operator | Filled | Dispatched | – |
| `arrive` | driver | Dispatched | Arrived | – |
| `deliver` | driver | Arrived | Delivered | – |
| `fail` | driver | Dispatched, Arrived | Failed | `{ reason, details? }` reason from `failReasons`; `details` min 5 when reason is `Other` |
| `confirm` | customer | Delivered | Confirmed | – |
| `dispute` | customer | Delivered, Failed | Disputed | `{ reason }` min 10 |

The last status, `Resolved`, is set by `POST /api/disputes/:id/resolve`.

```
                 (subsidised)                       (commercial)
 PendingApproval --approve--> Approved <---------- created
       |  \--reject--> Rejected      |
       |                           assign
     cancel                          v
       v                         Assigned --(re-assign)--+
   Cancelled <------cancel------ Assigned <--------------+
                                     | filled
                                     v
                                  Filled --dispatch--> Dispatched --arrive--> Arrived --deliver--> Delivered
                                                          |                     |                    |   \--confirm--> Confirmed
                                                          +-------fail----------+--> Failed          |
                                                                                       |  dispute    v dispute
                                                                                       +---------> Disputed --resolve--> Resolved
```

Checks for every action (in order):
`404` unknown action / booking → `403` booking outside the user's scope → `403` wrong role → `409` "Cannot … a booking that is …" when the status is not in `from`.

Extra checks per action:

| Action | Extra rule | Error |
|---|---|---|
| cancel | bill → `Void` | – |
| approve | customer still has Approved subsidy; capacity ≤ remaining monthly limit (this booking excluded); bill → `Unpaid` | `409` |
| reject | bill → `Void` | `422` no reason |
| assign | hydrant Available; tanker belongs to the hydrant, same capacity, `Available`; driver belongs to the hydrant and is active; neither is busy in the same `deliveryDate` + `slot` | `422` field errors, `409` "Tanker KHT-3001 is already booked for this slot" / "Asif Baloch already has a trip in this slot" / hydrant unavailable |
| filled | hydrant Available; records `filledAt` | `409` |
| dispatch / arrive / deliver / confirm | record `leftAt` / `arrivedAt` / `deliveredAt` / `confirmedAt` | – |
| fail | stores `failReason` | `422` |
| dispute | creates a dispute (status `Open`) | `422` |

Every action appends a `history` entry and returns `200` with the updated booking (detail shape).

---

## 10. Disputes

**Dispute object:** `{ id, bookingId, customerId, zoneId, reason, status: Open|Resolved, outcome, resolution, resolvedBy, resolverName, createdAt, resolvedAt, customerName, zoneName, deliveryDate, capacity, bookingType, amount, failReason }`

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/disputes` | customer (own), officer (own zone), admin | Search: `id, bookingId, customerName, reason`. Filters: `status, zoneId`. Sort: `id, createdAt, status` (default `createdAt desc`). |
| `POST /api/disputes/:id/resolve` | officer (same zone), admin | Body `{ outcome, resolution }` |

Resolve rules: `outcome` one of `disputeOutcomes`; `resolution` min 10 chars. Booking moves to `Resolved` (history note `"<outcome>: <resolution>"`). If outcome is `Refund` the bill becomes `Refunded`. `409` if already resolved; `403` other zone.

---

## 11. Bills

**Bill object:** `{ id, bookingId, customerId, amount, status, paymentMethod, issuedAt, paidAt, customerName, deliveryDate, capacity, bookingType, bookingStatus }`

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/bills` | customer (own), admin | Search: `id, bookingId, customerName`. Filters: `status, bookingType`. Sort: `id, issuedAt, amount, status` (default `issuedAt desc`). |
| `POST /api/bills/:id/pay` | customer (own) | Body `{ "paymentMethod": "JazzCash" }` (one of `paymentMethods`). Simulated payment. |

Pay errors: `403` not your bill; `409` bill not `Unpaid`; `422` no/invalid method.

Bill lifecycle: created with the booking → `AwaitingApproval` (subsidised) or `Unpaid` (commercial) → `Unpaid` after approval → `Paid` after payment. `Void` when the booking is cancelled or rejected. `Refunded` when a dispute is resolved with a refund.

---

## 12. Dashboard and reports

### GET /api/dashboard — Any
Role-specific summary cards plus the 5 most recently updated bookings the user can see.

```json
{
  "data": {
    "cards": [
      { "label": "Subsidised bookings to approve", "value": 1, "link": "bookings.html?status=PendingApproval" },
      { "label": "Quota left today", "value": "47,000 gal", "hint": "of 60,000 gal", "link": "operator.html" }
    ],
    "recent": [ { "id": 13, "status": "Filled", "...": "booking list fields" } ]
  }
}
```

Cards per role: **customer** – active bookings, waiting for confirmation, unpaid bills (+ total), subsidy left this month or subsidy status. **officer** – subsidised bookings to approve, pending applications, open disputes, deliveries today. **operator** – waiting for a tanker, trips in progress, quota left today, tankers available (+ hydrant status). **driver** – trips today, active, upcoming, delivered this month. **admin** – bookings today, pending approvals, open disputes, active users.

### GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD — admin
Defaults: `from` = today − 30 days, `to` = today + 7 days. Uses `deliveryDate`.

```json
{
  "data": {
    "from": "2026-10-16", "to": "2026-11-22", "days": 38, "totalBookings": 17,
    "byStatus": [ { "status": "Confirmed", "label": "Confirmed", "count": 3 } ],
    "byType": [ { "type": "Commercial", "bookings": 10, "gallons": 36000, "billed": 69500 } ],
    "byHydrant": [ { "hydrantId": 1, "hydrantName": "Safoora Hydrant", "bookings": 10, "gallons": 30000, "quotaGallons": 2280000, "usagePercent": 1.3 } ],
    "byZone": [ { "zoneId": 3, "zoneName": "Gulshan-e-Iqbal", "bookings": 11, "subsidised": 4, "gallons": 30000 } ],
    "failReasons": [ { "reason": "House locked", "count": 1 } ],
    "revenue": { "paid": 25500, "unpaid": 18000, "refunded": 10500 },
    "disputes": { "open": 1, "resolved": 1 }
  }
}
```

`byType`, `byHydrant`, `byZone` ignore Cancelled/Rejected bookings. `quotaGallons` = daily quota × number of days in the range. In Phase 2 these must be built with SQL aggregate queries (`GROUP BY`), not by loading rows into memory.

---

## 13. Endpoint index

| # | Method | Path | Roles |
|---|---|---|---|
| 1 | GET | /api/meta | Public |
| 2 | GET | /api/demo-accounts | Public (**mock only**) |
| 3 | POST | /api/auth/register | Public |
| 4 | POST | /api/auth/login | Public |
| 5 | GET | /api/auth/me | Any |
| 6-10 | GET, GET, POST, PUT, DELETE | /api/zones[/:id] | Public read, admin write |
| 11-15 | GET, GET, POST, PUT, DELETE | /api/hydrants[/:id] | Any read, admin write |
| 16 | PATCH | /api/hydrants/:id/status | operator (own), admin |
| 17 | GET | /api/hydrants/:id/availability | Any |
| 18 | GET | /api/hydrants/:id/resources | operator (own), admin |
| 19-23 | GET, GET, POST, PUT, DELETE | /api/tankers[/:id] | admin/operator/officer read, admin write |
| 24 | PATCH | /api/tankers/:id/status | operator (own), admin |
| 25-29 | GET, GET, POST, PUT, DELETE | /api/rates[/:id] | Any read, admin write |
| 30-34 | GET, GET, POST, PUT, DELETE | /api/users[/:id] | admin |
| 35 | PATCH | /api/users/:id/status | admin |
| 36 | GET | /api/subsidy-applications | customer, officer, admin |
| 37 | POST | /api/subsidy-applications | customer |
| 38 | POST | /api/subsidy-applications/:id/approve | officer, admin |
| 39 | POST | /api/subsidy-applications/:id/reject | officer, admin |
| 40 | GET | /api/subsidy/usage | customer |
| 41 | GET | /api/bookings | Any (scoped) |
| 42 | GET | /api/bookings/:id | Any (scoped) |
| 43 | POST | /api/bookings | customer |
| 44 | POST | /api/bookings/:id/:action | by action (see table) |
| 45 | GET | /api/disputes | customer, officer, admin |
| 46 | POST | /api/disputes/:id/resolve | officer, admin |
| 47 | GET | /api/bills | customer, admin |
| 48 | POST | /api/bills/:id/pay | customer |
| 49 | GET | /api/dashboard | Any |
| 50 | GET | /api/reports | admin |
