// PaaniLink mock API core: all routes and business rules, with no Node-only code.
// The same file runs in two places:
//  1. Node: mock-api/server.js wraps it in an HTTP server (local development, npm start)
//  2. Browser: public/sw.js (a Service Worker) runs it when the site is on static hosting
//     such as GitHub Pages, where no Node server exists. The pages still call fetch('api/...').
// In Phase 2 the real backend replaces this file.

(function (root) {
'use strict';

/**
 * @param {object} o
 * @param {object} o.META       lookup data from meta.js
 * @param {Function} o.buildSeed seed builder from seed.js
 * @param {object} o.storage    { load(): db|null, save(db) }
 */
function createMockApi({ META, buildSeed, storage }) {
  /* ---------------------------------------------------------------- */
  /* Storage                                                           */
  /* ---------------------------------------------------------------- */
  let db = storage.load();
  if (!db) { db = buildSeed(); storage.save(db); }
  const saveDb = () => storage.save(db);
  const nextId = coll => (db.counters[coll] = (db.counters[coll] || 0) + 1);
  const now = () => new Date().toISOString();
  const todayStr = () => new Date().toLocaleDateString('en-CA');
  const addDays = (dateString, n) => {
    const d = new Date(dateString + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA');
  };
  const byId = (coll, id) => db[coll].find(x => x.id === Number(id));

  /* ------------------------------------------------------------------ */
  /* Errors and validation helpers                                       */
  /* ------------------------------------------------------------------ */

  class ApiError extends Error {
    constructor(status, message, details) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }
  const fail = (status, message, details) => { throw new ApiError(status, message, details); };

  function findOr404(coll, id, label) {
    const item = byId(coll, id);
    if (!item) fail(404, `${label || coll} #${id} not found`);
    return item;
  }

  const RE = {
    cnic: /^\d{5}-\d{7}-\d$/,
    phone: /^03\d{2}-?\d{7}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    name: /^[A-Za-z][A-Za-z .'-]{2,59}$/,
    time: /^([01]\d|2[0-3]):[0-5]\d$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    regNo: /^[A-Z]{2,4}-\d{3,5}$/,
    password: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
  };

  // Collects field errors and throws one 422 with all of them.
  function validator() {
    const errors = {};
    return {
      check(cond, field, msg) { if (!cond && !errors[field]) errors[field] = msg; },
      done() { if (Object.keys(errors).length) fail(422, 'Please fix the highlighted fields', errors); }
    };
  }
  const str = v => (v === undefined || v === null ? '' : String(v).trim());
  const isInt = v => Number.isInteger(Number(v)) && str(v) !== '';

  /* ------------------------------------------------------------------ */
  /* Auth                                                                */
  /* ------------------------------------------------------------------ */

  const publicUser = u => {
    if (!u) return null;
    const { password, demo, ...rest } = u;
    const zone = rest.zoneId ? byId('zones', rest.zoneId) : null;
    const hydrant = rest.hydrantId ? byId('hydrants', rest.hydrantId) : null;
    return { ...rest, zoneName: zone ? zone.name : null, hydrantName: hydrant ? hydrant.name : null };
  };

  function authUser(authorization) {
    const m = (authorization || '').match(/^Bearer mock-token-(\d+)$/);
    if (!m) return null;
    const u = byId('users', m[1]);
    return u && u.active ? u : null;
  }

  /* ------------------------------------------------------------------ */
  /* Router                                                              */
  /* ------------------------------------------------------------------ */

  const routes = [];
  // roles: null = public, [] = any logged-in user, ['admin', ...] = only these roles
  function route(method, pattern, roles, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, roles, handler });
  }

  /* Search, filter, sort and paginate a list. Every list endpoint uses this. */
  function listResult(items, query, { search = [], filters = [], sortable = ['id'], defaultSort = 'id', defaultOrder = 'asc' } = {}) {
    let out = items;
    for (const f of filters) {
      if (query[f] === undefined || query[f] === '') continue;
      const values = String(query[f]).split(',');
      // Array fields (e.g. hydrant.zoneIds) match when any element matches.
      out = out.filter(i => (Array.isArray(i[f]) ? i[f].some(x => values.includes(String(x))) : values.includes(String(i[f]))));
    }
    if (query.q) {
      const q = String(query.q).toLowerCase();
      out = out.filter(i => search.some(s => String(i[s] ?? '').toLowerCase().includes(q)));
    }
    const sort = sortable.includes(query.sort) ? query.sort : defaultSort;
    const order = query.order === 'asc' || query.order === 'desc' ? query.order : defaultOrder;
    const dir = order === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const x = a[sort], y = b[sort];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
    const total = out.length;
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 500);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), totalPages);
    return { data: out.slice((page - 1) * limit, page * limit), page, limit, total, totalPages, sort, order };
  }

  /* ------------------------------------------------------------------ */
  /* Domain helpers                                                      */
  /* ------------------------------------------------------------------ */

  const slotById = id => META.slots.find(s => s.id === id);
  const slotOpenAt = (slot, hydrant) => slot.start >= hydrant.openTime && slot.end <= hydrant.closeTime;
  const rateFor = capacity => db.rates.find(r => r.capacity === Number(capacity));

  function hydrantReserved(hydrantId, date, excludeBookingId = null) {
    return db.bookings
      .filter(b => b.hydrantId === hydrantId && b.deliveryDate === date && b.id !== excludeBookingId && !META.quotaFreeStatuses.includes(b.status))
      .reduce((sum, b) => sum + b.capacity, 0);
  }

  function subsidyUsed(customerId, month, excludeBookingId = null) {
    return db.bookings
      .filter(b => b.customerId === customerId && b.type === 'Subsidised' && b.deliveryDate.startsWith(month) && b.id !== excludeBookingId && !META.subsidyFreeStatuses.includes(b.status))
      .reduce((sum, b) => sum + b.capacity, 0);
  }

  // A tanker or driver is busy if another live booking already holds them for the same date and slot.
  function isBusy(field, id, date, slot, excludeBookingId) {
    return db.bookings.some(b => b[field] === id && b.deliveryDate === date && b.slot === slot && b.id !== excludeBookingId && !['Cancelled', 'Rejected'].includes(b.status));
  }

  function canSeeBooking(b, u) {
    switch (u.role) {
      case 'admin': return true;
      case 'customer': return b.customerId === u.id;
      case 'officer': return b.zoneId === u.zoneId;
      case 'operator': return b.hydrantId === u.hydrantId && !['PendingApproval', 'Rejected'].includes(b.status);
      case 'driver': return b.driverId === u.id;
      default: return false;
    }
  }

  function enrichBooking(b, viewer) {
    const h = byId('hydrants', b.hydrantId), z = byId('zones', b.zoneId), c = byId('users', b.customerId);
    const t = b.tankerId ? byId('tankers', b.tankerId) : null;
    const d = b.driverId ? byId('users', b.driverId) : null;
    const bill = db.bills.find(x => x.bookingId === b.id);
    const dispute = db.disputes.find(x => x.bookingId === b.id);
    const out = {
      ...b,
      hydrantName: h ? h.name : null,
      hydrantLocation: h ? h.location : null,
      zoneName: z ? z.name : null,
      customerName: c ? c.name : null,
      customerPhone: c ? c.phone : null,
      tankerRegNo: t ? t.registrationNo : null,
      driverName: d ? d.name : null,
      driverPhone: d ? d.phone : null,
      slotLabel: (slotById(b.slot) || {}).label || b.slot,
      billId: bill ? bill.id : null,
      billStatus: bill ? bill.status : null,
      disputeId: dispute ? dispute.id : null,
      disputeStatus: dispute ? dispute.status : null
    };
    // Drivers do not need the full audit trail of who approved/billed.
    if (viewer && viewer.role === 'driver') delete out.billStatus;
    return out;
  }

  function addHistory(b, user, status, note = null) {
    b.history.push({ status, at: now(), byUserId: user ? user.id : null, byName: user ? user.name : 'System', byRole: user ? user.role : 'system', note });
    b.status = status;
    b.updatedAt = now();
  }

  const setBillStatus = (bookingId, status, extra = {}) => {
    const bill = db.bills.find(x => x.bookingId === bookingId);
    if (bill) Object.assign(bill, { status }, extra);
  };

  /* ------------------------------------------------------------------ */
  /* Routes: meta and auth                                               */
  /* ------------------------------------------------------------------ */

  route('GET', '/api/meta', null, () => ({ data: META }));

  // Mock-only helper used by the login page to list demo accounts. Not part of the real API.
  route('GET', '/api/demo-accounts', null, () => ({
    data: db.users.filter(u => u.demo).map(u => ({ name: u.name, email: u.email, password: u.password, role: u.role }))
  }));

  function validateUserFields(v, body, { role, existing }) {
    v.check(RE.name.test(str(body.name)), 'name', 'Name must be 3-60 letters');
    v.check(RE.email.test(str(body.email)), 'email', 'Enter a valid email address');
    v.check(RE.phone.test(str(body.phone)), 'phone', 'Phone must look like 0300-1234567');
    v.check(RE.cnic.test(str(body.cnic)), 'cnic', 'CNIC must look like 42101-1234567-1');
    const others = db.users.filter(u => !existing || u.id !== existing.id);
    v.check(!others.some(u => u.email.toLowerCase() === str(body.email).toLowerCase()), 'email', 'This email is already registered');
    v.check(!others.some(u => u.cnic === str(body.cnic)), 'cnic', 'This CNIC is already registered');
    v.check(!others.some(u => u.phone.replace('-', '') === str(body.phone).replace('-', '')), 'phone', 'This phone number is already registered');
    if (role === 'customer' || role === 'officer') v.check(!!byId('zones', body.zoneId), 'zoneId', 'Select a zone');
    if (role === 'customer') v.check(str(body.address).length >= 10, 'address', 'Address must be at least 10 characters');
    if (role === 'operator' || role === 'driver') v.check(!!byId('hydrants', body.hydrantId), 'hydrantId', 'Select a hydrant');
    if (role === 'driver') v.check(/^[A-Z]{2,4}-\d{4,6}$/.test(str(body.licenseNo)), 'licenseNo', 'Licence must look like LTV-12345');
  }

  route('POST', '/api/auth/register', null, ({ body }) => {
    const v = validator();
    validateUserFields(v, body, { role: 'customer' });
    v.check(RE.password.test(str(body.password)), 'password', 'Password needs 8+ characters with letters and numbers');
    v.done();
    const user = {
      id: nextId('users'), role: 'customer', name: str(body.name), email: str(body.email).toLowerCase(),
      phone: str(body.phone), cnic: str(body.cnic), password: str(body.password), active: true,
      zoneId: Number(body.zoneId), hydrantId: null, address: str(body.address),
      subsidy: { status: 'None', category: null, monthlyLimitGallons: 0 }, demo: false, createdAt: now()
    };
    db.users.push(user);
    saveDb();
    return { status: 201, data: { token: 'mock-token-' + user.id, user: publicUser(user) } };
  });

  route('POST', '/api/auth/login', null, ({ body }) => {
    const email = str(body.email).toLowerCase();
    const user = db.users.find(u => u.email.toLowerCase() === email);
    if (!user || user.password !== body.password) fail(401, 'Invalid email or password');
    if (!user.active) fail(403, 'This account has been deactivated. Please contact the Water Board.');
    return { data: { token: 'mock-token-' + user.id, user: publicUser(user) } };
  });

  route('GET', '/api/auth/me', [], ({ user }) => ({ data: publicUser(user) }));

  /* ------------------------------------------------------------------ */
  /* Routes: generic admin-managed resources                             */
  /* ------------------------------------------------------------------ */

  function registerCrud(coll, base, opts) {
    const { readRoles = [], writeRoles = ['admin'], validate, enrich = x => x, beforeDelete, scope, list = {} } = opts;
    route('GET', base, readRoles, ({ query, user }) => {
      const items = db[coll].filter(x => !scope || scope(x, user)).map(x => enrich(x, user));
      return listResult(items, query, list);
    });
    route('GET', base + '/:id', readRoles, ({ params, user }) => {
      const item = findOr404(coll, params.id);
      if (scope && !scope(item, user)) fail(403, 'You are not allowed to view this record');
      return { data: enrich(item, user) };
    });
    route('POST', base, writeRoles, ({ body }) => {
      const clean = validate(body, null);
      const item = { id: nextId(coll), ...clean, createdAt: now() };
      db[coll].push(item);
      saveDb();
      return { status: 201, data: enrich(item) };
    });
    route('PUT', base + '/:id', writeRoles, ({ params, body }) => {
      const item = findOr404(coll, params.id);
      Object.assign(item, validate(body, item), { updatedAt: now() });
      saveDb();
      return { data: enrich(item) };
    });
    route('DELETE', base + '/:id', writeRoles, ({ params }) => {
      const item = findOr404(coll, params.id);
      if (beforeDelete) beforeDelete(item);
      db[coll] = db[coll].filter(x => x !== item);
      saveDb();
      return { data: { id: item.id, deleted: true } };
    });
  }

  // Zones -------------------------------------------------------------
  registerCrud('zones', '/api/zones', {
    readRoles: null, // public: the registration form needs the zone list
    list: { search: ['name', 'description'], sortable: ['id', 'name'], defaultSort: 'name' },
    enrich: z => ({ ...z, hydrantNames: db.hydrants.filter(h => h.zoneIds.includes(z.id)).map(h => h.name) }),
    validate(body, existing) {
      const v = validator();
      v.check(str(body.name).length >= 3 && str(body.name).length <= 50, 'name', 'Zone name must be 3-50 characters');
      v.check(!db.zones.some(z => z !== existing && z.name.toLowerCase() === str(body.name).toLowerCase()), 'name', 'A zone with this name already exists');
      v.check(str(body.description).length <= 200, 'description', 'Description is too long (max 200)');
      v.done();
      return { name: str(body.name), description: str(body.description) };
    },
    beforeDelete(z) {
      if (db.hydrants.some(h => h.zoneIds.includes(z.id)) || db.users.some(u => u.zoneId === z.id) || db.bookings.some(b => b.zoneId === z.id)) {
        fail(409, 'This zone is still used by hydrants, users or bookings and cannot be deleted');
      }
    }
  });

  // Hydrants ----------------------------------------------------------
  registerCrud('hydrants', '/api/hydrants', {
    list: { search: ['name', 'location'], filters: ['status', 'zoneIds'], sortable: ['id', 'name', 'dailyQuotaGallons'], defaultSort: 'name' },
    enrich: h => ({
      ...h,
      zoneNames: h.zoneIds.map(id => (byId('zones', id) || {}).name).filter(Boolean),
      tankerCount: db.tankers.filter(t => t.hydrantId === h.id).length,
      reservedToday: hydrantReserved(h.id, todayStr())
    }),
    validate(body, existing) {
      const v = validator();
      const zoneIds = (Array.isArray(body.zoneIds) ? body.zoneIds : []).map(Number);
      v.check(str(body.name).length >= 3, 'name', 'Name must be at least 3 characters');
      v.check(!db.hydrants.some(h => h !== existing && h.name.toLowerCase() === str(body.name).toLowerCase()), 'name', 'A hydrant with this name already exists');
      v.check(str(body.location).length >= 5, 'location', 'Location must be at least 5 characters');
      v.check(isInt(body.dailyQuotaGallons) && Number(body.dailyQuotaGallons) >= 6000, 'dailyQuotaGallons', 'Daily quota must be a whole number of at least 6,000 gallons');
      v.check(RE.time.test(str(body.openTime)), 'openTime', 'Use HH:MM');
      v.check(RE.time.test(str(body.closeTime)), 'closeTime', 'Use HH:MM');
      v.check(str(body.openTime) < str(body.closeTime), 'closeTime', 'Closing time must be after opening time');
      v.check(zoneIds.length > 0 && zoneIds.every(id => byId('zones', id)), 'zoneIds', 'Select at least one zone');
      v.check(META.hydrantStatuses.includes(body.status || 'Available'), 'status', 'Invalid status');
      v.done();
      return {
        name: str(body.name), location: str(body.location), dailyQuotaGallons: Number(body.dailyQuotaGallons),
        openTime: str(body.openTime), closeTime: str(body.closeTime), zoneIds,
        status: body.status || 'Available', unavailableReason: body.status === 'Unavailable' ? str(body.unavailableReason) || 'Set by administrator' : null
      };
    },
    beforeDelete(h) {
      if (db.tankers.some(t => t.hydrantId === h.id) || db.bookings.some(b => b.hydrantId === h.id)) {
        fail(409, 'This hydrant has tankers or bookings and cannot be deleted. Mark it Unavailable instead.');
      }
    }
  });

  route('PATCH', '/api/hydrants/:id/status', ['operator', 'admin'], ({ params, body, user }) => {
    const h = findOr404('hydrants', params.id, 'Hydrant');
    if (user.role === 'operator' && user.hydrantId !== h.id) fail(403, 'You can only change your own hydrant');
    const v = validator();
    v.check(META.hydrantStatuses.includes(body.status), 'status', 'Invalid status');
    v.check(body.status !== 'Unavailable' || str(body.reason).length >= 5, 'reason', 'Give a reason (min 5 characters)');
    v.done();
    h.status = body.status;
    h.unavailableReason = body.status === 'Unavailable' ? str(body.reason) : null;
    h.updatedAt = now();
    saveDb();
    return { data: h };
  });

  route('GET', '/api/hydrants/:id/availability', [], ({ params, query }) => {
    const h = findOr404('hydrants', params.id, 'Hydrant');
    const date = RE.date.test(str(query.date)) ? query.date : todayStr();
    const reserved = hydrantReserved(h.id, date);
    return {
      data: {
        hydrantId: h.id, hydrantName: h.name, date, status: h.status, unavailableReason: h.unavailableReason,
        openTime: h.openTime, closeTime: h.closeTime,
        dailyQuotaGallons: h.dailyQuotaGallons, reservedGallons: reserved,
        remainingGallons: Math.max(h.dailyQuotaGallons - reserved, 0),
        slots: META.slots.map(s => ({ ...s, open: slotOpenAt(s, h) }))
      }
    };
  });

  // Tankers and drivers an operator can choose from for one booking.
  route('GET', '/api/hydrants/:id/resources', ['operator', 'admin'], ({ params, query, user }) => {
    const h = findOr404('hydrants', params.id, 'Hydrant');
    if (user.role === 'operator' && user.hydrantId !== h.id) fail(403, 'You can only see resources of your own hydrant');
    const { date, slot } = query;
    const exclude = query.bookingId ? Number(query.bookingId) : null;
    const tankers = db.tankers
      .filter(t => t.hydrantId === h.id && (!query.capacity || t.capacity === Number(query.capacity)))
      .map(t => ({ ...t, busy: isBusy('tankerId', t.id, date, slot, exclude) }));
    const drivers = db.users
      .filter(u => u.role === 'driver' && u.hydrantId === h.id)
      .map(u => ({ id: u.id, name: u.name, phone: u.phone, active: u.active, busy: isBusy('driverId', u.id, date, slot, exclude) }));
    return { data: { tankers, drivers } };
  });

  // Tankers -----------------------------------------------------------
  registerCrud('tankers', '/api/tankers', {
    readRoles: ['admin', 'operator', 'officer'],
    scope: (t, u) => u.role !== 'operator' || t.hydrantId === u.hydrantId,
    list: { search: ['registrationNo', 'hydrantName'], filters: ['status', 'hydrantId', 'capacity'], sortable: ['id', 'registrationNo', 'capacity', 'hydrantName', 'status'], defaultSort: 'registrationNo' },
    enrich: t => ({ ...t, hydrantName: (byId('hydrants', t.hydrantId) || {}).name || null }),
    validate(body, existing) {
      const v = validator();
      const reg = str(body.registrationNo).toUpperCase();
      v.check(RE.regNo.test(reg), 'registrationNo', 'Registration must look like KHT-1234');
      v.check(!db.tankers.some(t => t !== existing && t.registrationNo === reg), 'registrationNo', 'This registration number already exists');
      v.check(!!rateFor(body.capacity), 'capacity', 'Capacity must be one of the sizes in the rate list');
      v.check(!!byId('hydrants', body.hydrantId), 'hydrantId', 'Select a hydrant');
      v.check(META.tankerStatuses.includes(body.status || 'Available'), 'status', 'Invalid status');
      v.done();
      return { registrationNo: reg, capacity: Number(body.capacity), hydrantId: Number(body.hydrantId), status: body.status || 'Available' };
    },
    beforeDelete(t) {
      if (db.bookings.some(b => b.tankerId === t.id)) fail(409, 'This tanker has trip history and cannot be deleted. Mark it Unavailable instead.');
    }
  });

  route('PATCH', '/api/tankers/:id/status', ['operator', 'admin'], ({ params, body, user }) => {
    const t = findOr404('tankers', params.id, 'Tanker');
    if (user.role === 'operator' && user.hydrantId !== t.hydrantId) fail(403, 'You can only change tankers of your own hydrant');
    if (!META.tankerStatuses.includes(body.status)) fail(422, 'Invalid status', { status: 'Invalid status' });
    t.status = body.status;
    t.updatedAt = now();
    saveDb();
    return { data: t };
  });

  // Rates -------------------------------------------------------------
  registerCrud('rates', '/api/rates', {
    readRoles: [],
    list: { sortable: ['capacity'], defaultSort: 'capacity' },
    validate(body, existing) {
      const v = validator();
      v.check(isInt(body.capacity) && Number(body.capacity) >= 500, 'capacity', 'Capacity must be a whole number of at least 500 gallons');
      v.check(!db.rates.some(r => r !== existing && r.capacity === Number(body.capacity)), 'capacity', 'A rate for this capacity already exists');
      v.check(Number(body.commercialRate) > 0, 'commercialRate', 'Commercial rate must be more than 0');
      v.check(Number(body.subsidisedRate) > 0, 'subsidisedRate', 'Subsidised rate must be more than 0');
      v.check(Number(body.subsidisedRate) < Number(body.commercialRate), 'subsidisedRate', 'Subsidised rate must be lower than the commercial rate');
      v.done();
      return { capacity: Number(body.capacity), commercialRate: Number(body.commercialRate), subsidisedRate: Number(body.subsidisedRate) };
    },
    beforeDelete(r) {
      if (db.tankers.some(t => t.capacity === r.capacity)) fail(409, 'Tankers of this size exist, so this rate cannot be deleted');
    }
  });

  // Users (admin) -----------------------------------------------------
  registerCrud('users', '/api/users', {
    readRoles: ['admin'],
    list: { search: ['name', 'email', 'phone', 'cnic'], filters: ['role', 'zoneId', 'hydrantId', 'active'], sortable: ['id', 'name', 'role', 'createdAt'], defaultSort: 'id' },
    enrich: u => publicUser(u),
    validate(body, existing) {
      const v = validator();
      const role = existing ? existing.role : body.role;
      v.check(META.roles.includes(role), 'role', 'Select a role');
      validateUserFields(v, body, { role, existing });
      if (!existing || str(body.password)) v.check(RE.password.test(str(body.password)), 'password', 'Password needs 8+ characters with letters and numbers');
      v.done();
      const clean = {
        role, name: str(body.name), email: str(body.email).toLowerCase(), phone: str(body.phone), cnic: str(body.cnic),
        zoneId: ['customer', 'officer'].includes(role) ? Number(body.zoneId) : null,
        hydrantId: ['operator', 'driver'].includes(role) ? Number(body.hydrantId) : null,
        address: role === 'customer' ? str(body.address) : null,
        licenseNo: role === 'driver' ? str(body.licenseNo) : undefined,
        active: body.active === undefined ? (existing ? existing.active : true) : Boolean(body.active)
      };
      if (str(body.password)) clean.password = str(body.password);
      if (!existing) clean.subsidy = { status: 'None', category: null, monthlyLimitGallons: 0 };
      return clean;
    },
    beforeDelete(u) {
      if (db.bookings.some(b => b.customerId === u.id || b.driverId === u.id)) fail(409, 'This user has booking history. Deactivate the account instead.');
    }
  });

  route('PATCH', '/api/users/:id/status', ['admin'], ({ params, body, user }) => {
    const u = findOr404('users', params.id, 'User');
    if (u.id === user.id) fail(409, 'You cannot deactivate your own account');
    if (typeof body.active !== 'boolean') fail(422, 'active must be true or false', { active: 'Must be a boolean' });
    u.active = body.active;
    u.updatedAt = now();
    saveDb();
    return { data: publicUser(u) };
  });

  /* ------------------------------------------------------------------ */
  /* Routes: subsidy                                                     */
  /* ------------------------------------------------------------------ */

  const enrichApplication = a => {
    const c = byId('users', a.customerId), z = byId('zones', a.zoneId);
    return { ...a, customerName: c ? c.name : null, customerCnic: c ? c.cnic : null, customerPhone: c ? c.phone : null, customerAddress: c ? c.address : null, zoneName: z ? z.name : null };
  };
  const appScope = (a, u) => u.role === 'admin' || (u.role === 'officer' && a.zoneId === u.zoneId) || (u.role === 'customer' && a.customerId === u.id);

  route('GET', '/api/subsidy-applications', ['customer', 'officer', 'admin'], ({ query, user }) =>
    listResult(db.subsidyApplications.filter(a => appScope(a, user)).map(enrichApplication), query, {
      search: ['customerName', 'customerCnic', 'proofReference', 'institutionName'],
      filters: ['status', 'category', 'zoneId'],
      sortable: ['id', 'createdAt', 'customerName', 'status'], defaultSort: 'createdAt', defaultOrder: 'desc'
    }));

  route('POST', '/api/subsidy-applications', ['customer'], ({ body, user }) => {
    if (db.subsidyApplications.some(a => a.customerId === user.id && a.status === 'Pending')) fail(409, 'You already have an application waiting for review');
    if (user.subsidy.status === 'Approved') fail(409, 'Your subsidised status is already approved');
    const v = validator();
    const cat = META.subsidyCategories.find(c => c.id === body.category);
    v.check(!!cat, 'category', 'Select a category');
    v.check(META.proofTypes.includes(body.proofType), 'proofType', 'Select a proof type');
    v.check(/^[A-Za-z0-9-/]{4,30}$/.test(str(body.proofReference)), 'proofReference', 'Reference must be 4-30 letters, numbers or dashes');
    if (body.category === 'Household') {
      v.check(isInt(body.monthlyIncome) && Number(body.monthlyIncome) >= 0, 'monthlyIncome', 'Enter monthly income in rupees');
      v.check(Number(body.monthlyIncome) <= META.householdIncomeCeiling, 'monthlyIncome', `Household income must not exceed Rs ${META.householdIncomeCeiling.toLocaleString()}`);
      v.check(isInt(body.householdSize) && Number(body.householdSize) >= 1 && Number(body.householdSize) <= 30, 'householdSize', 'Household size must be 1-30');
    } else if (cat) {
      v.check(str(body.institutionName).length >= 3, 'institutionName', 'Enter the institution name');
    }
    v.check(str(body.details).length <= 300, 'details', 'Details are too long (max 300)');
    v.done();
    const app = {
      id: nextId('subsidyApplications'), customerId: user.id, zoneId: user.zoneId, category: body.category,
      proofType: body.proofType, proofReference: str(body.proofReference),
      monthlyIncome: body.category === 'Household' ? Number(body.monthlyIncome) : null,
      householdSize: body.category === 'Household' ? Number(body.householdSize) : null,
      institutionName: body.category === 'Household' ? null : str(body.institutionName),
      details: str(body.details), status: 'Pending', reviewedBy: null, reviewerName: null, remarks: null,
      monthlyLimitGallons: null, createdAt: now(), reviewedAt: null
    };
    db.subsidyApplications.push(app);
    user.subsidy = { status: 'Pending', category: null, monthlyLimitGallons: 0 };
    saveDb();
    return { status: 201, data: enrichApplication(app) };
  });

  function reviewApplication(id, user, approve, body) {
    const a = findOr404('subsidyApplications', id, 'Application');
    if (user.role === 'officer' && a.zoneId !== user.zoneId) fail(403, 'This application belongs to another zone');
    if (a.status !== 'Pending') fail(409, `Application is already ${a.status}`);
    const v = validator();
    if (approve) v.check(isInt(body.monthlyLimitGallons) && Number(body.monthlyLimitGallons) >= 1000 && Number(body.monthlyLimitGallons) <= 200000, 'monthlyLimitGallons', 'Monthly limit must be 1,000 - 200,000 gallons');
    else v.check(str(body.remarks).length >= 5, 'remarks', 'Give a reason (min 5 characters)');
    v.done();
    const customer = byId('users', a.customerId);
    Object.assign(a, { status: approve ? 'Approved' : 'Rejected', reviewedBy: user.id, reviewerName: user.name, remarks: str(body.remarks) || null, reviewedAt: now(), monthlyLimitGallons: approve ? Number(body.monthlyLimitGallons) : null });
    customer.subsidy = approve
      ? { status: 'Approved', category: a.category, monthlyLimitGallons: Number(body.monthlyLimitGallons), approvedAt: now() }
      : { status: 'Rejected', category: null, monthlyLimitGallons: 0 };
    saveDb();
    return { data: enrichApplication(a) };
  }
  route('POST', '/api/subsidy-applications/:id/approve', ['officer', 'admin'], ({ params, user, body }) => reviewApplication(params.id, user, true, body));
  route('POST', '/api/subsidy-applications/:id/reject', ['officer', 'admin'], ({ params, user, body }) => reviewApplication(params.id, user, false, body));

  route('GET', '/api/subsidy/usage', ['customer'], ({ query, user }) => {
    const month = /^\d{4}-\d{2}$/.test(str(query.month)) ? query.month : todayStr().slice(0, 7);
    const used = subsidyUsed(user.id, month);
    const limit = user.subsidy.monthlyLimitGallons || 0;
    return { data: { month, status: user.subsidy.status, category: user.subsidy.category, monthlyLimitGallons: limit, usedGallons: used, remainingGallons: Math.max(limit - used, 0) } };
  });

  /* ------------------------------------------------------------------ */
  /* Routes: bookings                                                    */
  /* ------------------------------------------------------------------ */

  route('GET', '/api/bookings', [], ({ query, user }) => {
    let items = db.bookings.filter(b => canSeeBooking(b, user));
    if (RE.date.test(str(query.dateFrom))) items = items.filter(b => b.deliveryDate >= query.dateFrom);
    if (RE.date.test(str(query.dateTo))) items = items.filter(b => b.deliveryDate <= query.dateTo);
    const enriched = items.map(b => {
      const e = enrichBooking(b, user);
      delete e.history; // lists do not need the full timeline
      return e;
    });
    return listResult(enriched, query, {
      search: ['id', 'customerName', 'deliveryAddress', 'hydrantName', 'tankerRegNo', 'driverName', 'zoneName'],
      filters: ['status', 'type', 'hydrantId', 'zoneId', 'deliveryDate', 'slot', 'capacity', 'customerId'],
      sortable: ['id', 'deliveryDate', 'createdAt', 'amount', 'status', 'capacity', 'customerName'],
      defaultSort: 'id', defaultOrder: 'desc'
    });
  });

  route('GET', '/api/bookings/:id', [], ({ params, user }) => {
    const b = findOr404('bookings', params.id, 'Booking');
    if (!canSeeBooking(b, user)) fail(403, 'You are not allowed to view this booking');
    return { data: enrichBooking(b, user) };
  });

  route('POST', '/api/bookings', ['customer'], ({ body, user }) => {
    const v = validator();
    const hydrant = byId('hydrants', body.hydrantId);
    const rate = rateFor(body.capacity);
    const slot = slotById(body.slot);
    const date = str(body.deliveryDate);
    const today = todayStr();
    v.check(META.bookingTypes.includes(body.type), 'type', 'Select a booking type');
    v.check(!!rate, 'capacity', 'Select a tanker size');
    v.check(!!hydrant, 'hydrantId', 'Select a hydrant');
    v.check(!hydrant || hydrant.zoneIds.includes(user.zoneId), 'hydrantId', 'This hydrant does not serve your zone');
    v.check(RE.date.test(date) && date >= today, 'deliveryDate', 'Delivery date cannot be in the past');
    v.check(!RE.date.test(date) || date <= addDays(today, META.maxAdvanceDays), 'deliveryDate', `You can book at most ${META.maxAdvanceDays} days ahead`);
    v.check(!!slot, 'slot', 'Select a delivery slot');
    v.check(!slot || !hydrant || slotOpenAt(slot, hydrant), 'slot', 'The hydrant is closed during this slot');
    const nowHM = new Date().toTimeString().slice(0, 5);
    v.check(!slot || date !== today || nowHM < slot.end, 'slot', 'This slot is already over for today');
    v.check(str(body.deliveryAddress || user.address).length >= 10, 'deliveryAddress', 'Address must be at least 10 characters');
    v.check(str(body.notes).length <= 200, 'notes', 'Notes are too long (max 200)');
    v.done();

    if (hydrant.status !== 'Available') fail(409, `${hydrant.name} is unavailable: ${hydrant.unavailableReason || 'no reason given'}`);
    const remaining = hydrant.dailyQuotaGallons - hydrantReserved(hydrant.id, date);
    if (rate.capacity > remaining) fail(409, `${hydrant.name} has only ${remaining.toLocaleString()} gallons of quota left on ${date}`);
    if (body.type === 'Subsidised') {
      if (user.subsidy.status !== 'Approved') fail(403, 'Only customers with approved subsidised status can make subsidised bookings');
      const left = user.subsidy.monthlyLimitGallons - subsidyUsed(user.id, date.slice(0, 7));
      if (rate.capacity > left) fail(409, `This booking exceeds your monthly subsidy limit. You have ${Math.max(left, 0).toLocaleString()} gallons left for ${date.slice(0, 7)}`);
    }

    const amount = body.type === 'Subsidised' ? rate.subsidisedRate : rate.commercialRate;
    const b = {
      id: nextId('bookings'), customerId: user.id, zoneId: user.zoneId, hydrantId: hydrant.id,
      capacity: rate.capacity, type: body.type, deliveryDate: date, slot: slot.id,
      deliveryAddress: str(body.deliveryAddress) || user.address, notes: str(body.notes) || null,
      status: null, amount, tankerId: null, driverId: null, failReason: null,
      createdAt: now(), updatedAt: now(), history: []
    };
    if (body.type === 'Commercial') addHistory(b, null, 'Approved', 'Commercial booking approved automatically');
    else addHistory(b, user, 'PendingApproval', 'Waiting for Zone Officer approval');
    db.bookings.push(b);
    db.bills.push({ id: nextId('bills'), bookingId: b.id, customerId: user.id, amount, status: body.type === 'Commercial' ? 'Unpaid' : 'AwaitingApproval', paymentMethod: null, issuedAt: now(), paidAt: null });
    saveDb();
    return { status: 201, data: enrichBooking(b, user) };
  });

  // All status changes go through one endpoint: POST /api/bookings/:id/:action
  route('POST', '/api/bookings/:id/:action', [], ({ params, body, user }) => {
    const action = META.actions[params.action];
    if (!action) fail(404, `Unknown action "${params.action}"`);
    const b = findOr404('bookings', params.id, 'Booking');
    if (!canSeeBooking(b, user)) fail(403, 'You are not allowed to change this booking');
    if (!action.roles.includes(user.role)) fail(403, `A ${META.roleLabels[user.role]} cannot ${action.label.toLowerCase()}`);
    if (!action.from.includes(b.status)) fail(409, `Cannot ${action.label.toLowerCase()} a booking that is ${META.statusLabels[b.status]}`);

    const hydrant = byId('hydrants', b.hydrantId);
    let note = null;
    switch (params.action) {
      case 'cancel':
        if (str(body.reason).length > 200) fail(422, 'Reason is too long', { reason: 'Max 200 characters' });
        note = str(body.reason) || 'Cancelled by customer';
        setBillStatus(b.id, 'Void');
        break;
      case 'approve': {
        const customer = byId('users', b.customerId);
        if (customer.subsidy.status !== 'Approved') fail(409, 'The customer no longer has approved subsidised status');
        const left = customer.subsidy.monthlyLimitGallons - subsidyUsed(customer.id, b.deliveryDate.slice(0, 7), b.id);
        if (b.capacity > left) fail(409, `Approving would exceed the customer's monthly limit (${Math.max(left, 0).toLocaleString()} gallons left)`);
        setBillStatus(b.id, 'Unpaid');
        note = str(body.note) || null;
        break;
      }
      case 'reject':
        if (str(body.reason).length < 5) fail(422, 'Give a reason', { reason: 'Min 5 characters' });
        note = str(body.reason);
        setBillStatus(b.id, 'Void');
        break;
      case 'assign': {
        if (hydrant.status !== 'Available') fail(409, 'The hydrant is marked unavailable');
        const tanker = byId('tankers', body.tankerId);
        const driver = byId('users', body.driverId);
        const v = validator();
        v.check(tanker && tanker.hydrantId === b.hydrantId, 'tankerId', 'Select a tanker of this hydrant');
        v.check(!tanker || tanker.capacity === b.capacity, 'tankerId', `Tanker must be ${b.capacity.toLocaleString()} gallons`);
        v.check(!tanker || tanker.status === 'Available', 'tankerId', 'This tanker is marked unavailable');
        v.check(driver && driver.role === 'driver' && driver.hydrantId === b.hydrantId, 'driverId', 'Select a driver of this hydrant');
        v.check(!driver || driver.active, 'driverId', 'This driver account is inactive');
        v.done();
        if (isBusy('tankerId', tanker.id, b.deliveryDate, b.slot, b.id)) fail(409, `Tanker ${tanker.registrationNo} is already booked for this slot`);
        if (isBusy('driverId', driver.id, b.deliveryDate, b.slot, b.id)) fail(409, `${driver.name} already has a trip in this slot`);
        note = `${b.status === 'Assigned' ? 'Reassigned: ' : ''}Tanker ${tanker.registrationNo}, driver ${driver.name}`;
        b.tankerId = tanker.id;
        b.driverId = driver.id;
        break;
      }
      case 'filled':
        if (hydrant.status !== 'Available') fail(409, 'The hydrant is marked unavailable');
        b.filledAt = now();
        break;
      case 'dispatch':
        b.leftAt = now();
        break;
      case 'arrive':
        b.arrivedAt = now();
        break;
      case 'deliver':
        b.deliveredAt = now();
        break;
      case 'fail': {
        const v = validator();
        v.check(META.failReasons.includes(body.reason), 'reason', 'Select a reason');
        v.check(body.reason !== 'Other' || str(body.details).length >= 5, 'details', 'Describe the problem (min 5 characters)');
        v.done();
        b.failReason = body.reason === 'Other' ? str(body.details) : body.reason;
        note = b.failReason + (body.reason !== 'Other' && str(body.details) ? ` - ${str(body.details)}` : '');
        break;
      }
      case 'confirm':
        b.confirmedAt = now();
        break;
      case 'dispute': {
        if (str(body.reason).length < 10) fail(422, 'Describe the problem', { reason: 'Min 10 characters' });
        note = str(body.reason);
        db.disputes.push({ id: nextId('disputes'), bookingId: b.id, customerId: b.customerId, zoneId: b.zoneId, reason: note, status: 'Open', outcome: null, resolution: null, resolvedBy: null, resolverName: null, createdAt: now(), resolvedAt: null });
        break;
      }
    }
    addHistory(b, user, action.to, note);
    saveDb();
    return { data: enrichBooking(b, user) };
  });

  /* ------------------------------------------------------------------ */
  /* Routes: disputes and bills                                          */
  /* ------------------------------------------------------------------ */

  const enrichDispute = d => {
    const b = byId('bookings', d.bookingId), c = byId('users', d.customerId), z = byId('zones', d.zoneId);
    return { ...d, customerName: c ? c.name : null, zoneName: z ? z.name : null, deliveryDate: b ? b.deliveryDate : null, capacity: b ? b.capacity : null, bookingType: b ? b.type : null, amount: b ? b.amount : null, failReason: b ? b.failReason : null };
  };
  const disputeScope = (d, u) => u.role === 'admin' || (u.role === 'officer' && d.zoneId === u.zoneId) || (u.role === 'customer' && d.customerId === u.id);

  route('GET', '/api/disputes', ['customer', 'officer', 'admin'], ({ query, user }) =>
    listResult(db.disputes.filter(d => disputeScope(d, user)).map(enrichDispute), query, {
      search: ['id', 'bookingId', 'customerName', 'reason'], filters: ['status', 'zoneId'],
      sortable: ['id', 'createdAt', 'status'], defaultSort: 'createdAt', defaultOrder: 'desc'
    }));

  route('POST', '/api/disputes/:id/resolve', ['officer', 'admin'], ({ params, body, user }) => {
    const d = findOr404('disputes', params.id, 'Dispute');
    if (!disputeScope(d, user)) fail(403, 'This dispute belongs to another zone');
    if (d.status !== 'Open') fail(409, 'This dispute is already resolved');
    const v = validator();
    v.check(META.disputeOutcomes.includes(body.outcome), 'outcome', 'Select an outcome');
    v.check(str(body.resolution).length >= 10, 'resolution', 'Explain the decision (min 10 characters)');
    v.done();
    Object.assign(d, { status: 'Resolved', outcome: body.outcome, resolution: str(body.resolution), resolvedBy: user.id, resolverName: user.name, resolvedAt: now() });
    const b = byId('bookings', d.bookingId);
    addHistory(b, user, 'Resolved', `${body.outcome}: ${str(body.resolution)}`);
    if (body.outcome === 'Refund') setBillStatus(b.id, 'Refunded');
    saveDb();
    return { data: enrichDispute(d) };
  });

  const enrichBill = bill => {
    const b = byId('bookings', bill.bookingId), c = byId('users', bill.customerId);
    return { ...bill, customerName: c ? c.name : null, deliveryDate: b ? b.deliveryDate : null, capacity: b ? b.capacity : null, bookingType: b ? b.type : null, bookingStatus: b ? b.status : null };
  };
  route('GET', '/api/bills', ['customer', 'admin'], ({ query, user }) =>
    listResult(db.bills.filter(x => user.role === 'admin' || x.customerId === user.id).map(enrichBill), query, {
      search: ['id', 'bookingId', 'customerName'], filters: ['status', 'bookingType'],
      sortable: ['id', 'issuedAt', 'amount', 'status'], defaultSort: 'issuedAt', defaultOrder: 'desc'
    }));

  route('POST', '/api/bills/:id/pay', ['customer'], ({ params, body, user }) => {
    const bill = findOr404('bills', params.id, 'Bill');
    if (bill.customerId !== user.id) fail(403, 'This is not your bill');
    if (bill.status !== 'Unpaid') fail(409, `This bill is ${bill.status} and cannot be paid`);
    if (!META.paymentMethods.includes(body.paymentMethod)) fail(422, 'Select a payment method', { paymentMethod: 'Select a payment method' });
    Object.assign(bill, { status: 'Paid', paymentMethod: body.paymentMethod, paidAt: now() });
    saveDb();
    return { data: enrichBill(bill) };
  });

  /* ------------------------------------------------------------------ */
  /* Routes: dashboard and reports                                       */
  /* ------------------------------------------------------------------ */

  const IN_PROGRESS = ['Assigned', 'Filled', 'Dispatched', 'Arrived'];

  route('GET', '/api/dashboard', [], ({ user }) => {
    const today = todayStr();
    const mine = db.bookings.filter(b => canSeeBooking(b, user));
    const count = fn => mine.filter(fn).length;
    let cards = [];
    if (user.role === 'customer') {
      const unpaid = db.bills.filter(x => x.customerId === user.id && x.status === 'Unpaid');
      const month = today.slice(0, 7);
      const used = subsidyUsed(user.id, month);
      cards = [
        { label: 'Active bookings', value: count(b => ['PendingApproval', 'Approved', ...IN_PROGRESS].includes(b.status)), link: 'bookings.html' },
        { label: 'Waiting for your confirmation', value: count(b => b.status === 'Delivered'), link: 'bookings.html?status=Delivered' },
        { label: 'Unpaid bills', value: unpaid.length, hint: 'Rs ' + unpaid.reduce((s, x) => s + x.amount, 0).toLocaleString(), link: 'bills.html?status=Unpaid' },
        user.subsidy.status === 'Approved'
          ? { label: 'Subsidy left this month', value: Math.max(user.subsidy.monthlyLimitGallons - used, 0).toLocaleString() + ' gal', hint: `of ${user.subsidy.monthlyLimitGallons.toLocaleString()} gal`, link: 'subsidy-apply.html' }
          : { label: 'Subsidised status', value: user.subsidy.status, link: 'subsidy-apply.html' }
      ];
    } else if (user.role === 'officer') {
      cards = [
        { label: 'Subsidised bookings to approve', value: count(b => b.status === 'PendingApproval'), link: 'bookings.html?status=PendingApproval' },
        { label: 'Subsidy applications', value: db.subsidyApplications.filter(a => a.zoneId === user.zoneId && a.status === 'Pending').length, link: 'subsidy-review.html?status=Pending' },
        { label: 'Open disputes', value: db.disputes.filter(d => d.zoneId === user.zoneId && d.status === 'Open').length, link: 'disputes.html?status=Open' },
        { label: 'Deliveries today', value: count(b => b.deliveryDate === today && !['Cancelled', 'Rejected'].includes(b.status)), link: `bookings.html?deliveryDate=${today}` }
      ];
    } else if (user.role === 'operator') {
      const h = byId('hydrants', user.hydrantId);
      const reserved = hydrantReserved(h.id, today);
      const tankers = db.tankers.filter(t => t.hydrantId === h.id);
      cards = [
        { label: 'Waiting for a tanker', value: count(b => b.status === 'Approved'), link: 'operator.html?status=Approved' },
        { label: 'Trips in progress', value: count(b => IN_PROGRESS.includes(b.status)), link: 'operator.html' },
        { label: 'Quota left today', value: Math.max(h.dailyQuotaGallons - reserved, 0).toLocaleString() + ' gal', hint: `of ${h.dailyQuotaGallons.toLocaleString()} gal`, link: 'operator.html' },
        { label: 'Tankers available', value: `${tankers.filter(t => t.status === 'Available').length} / ${tankers.length}`, hint: `Hydrant: ${h.status}`, link: 'fleet.html' }
      ];
    } else if (user.role === 'driver') {
      cards = [
        { label: 'Trips today', value: count(b => b.deliveryDate === today), link: 'driver.html' },
        { label: 'Active trips', value: count(b => ['Dispatched', 'Arrived'].includes(b.status)), link: 'driver.html' },
        { label: 'Upcoming (assigned)', value: count(b => ['Assigned', 'Filled'].includes(b.status)), link: 'driver.html' },
        { label: 'Delivered this month', value: count(b => ['Delivered', 'Confirmed', 'Disputed', 'Resolved'].includes(b.status) && b.deliveryDate.startsWith(today.slice(0, 7))), link: 'driver.html' }
      ];
    } else {
      cards = [
        { label: 'Bookings today', value: count(b => b.deliveryDate === today && !['Cancelled', 'Rejected'].includes(b.status)), link: `bookings.html?deliveryDate=${today}` },
        { label: 'Pending approvals', value: count(b => b.status === 'PendingApproval'), link: 'bookings.html?status=PendingApproval' },
        { label: 'Open disputes', value: db.disputes.filter(d => d.status === 'Open').length, link: 'disputes.html?status=Open' },
        { label: 'Active users', value: db.users.filter(u => u.active).length, link: 'admin-users.html' }
      ];
    }
    const recent = [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map(b => {
      const e = enrichBooking(b, user);
      delete e.history;
      return e;
    });
    return { data: { cards, recent } };
  });

  route('GET', '/api/reports', ['admin'], ({ query }) => {
    const from = RE.date.test(str(query.from)) ? query.from : addDays(todayStr(), -30);
    const to = RE.date.test(str(query.to)) ? query.to : addDays(todayStr(), META.maxAdvanceDays);
    const inRange = db.bookings.filter(b => b.deliveryDate >= from && b.deliveryDate <= to);
    const live = inRange.filter(b => !META.quotaFreeStatuses.includes(b.status));
    const group = (items, keyFn) => items.reduce((m, b) => { const k = keyFn(b); (m[k] = m[k] || []).push(b); return m; }, {});
    const sum = (items, f) => items.reduce((s, x) => s + f(x), 0);
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;

    const byStatus = META.bookingStatuses.map(s => ({ status: s, label: META.statusLabels[s], count: inRange.filter(b => b.status === s).length }));
    const byType = META.bookingTypes.map(t => {
      const items = live.filter(b => b.type === t);
      return { type: t, bookings: items.length, gallons: sum(items, b => b.capacity), billed: sum(items, b => b.amount) };
    });
    const byHydrant = db.hydrants.map(h => {
      const items = live.filter(b => b.hydrantId === h.id);
      const quota = h.dailyQuotaGallons * days;
      const gallons = sum(items, b => b.capacity);
      return { hydrantId: h.id, hydrantName: h.name, bookings: items.length, gallons, quotaGallons: quota, usagePercent: quota ? Math.round((gallons / quota) * 1000) / 10 : 0 };
    });
    const zoneGroups = group(live, b => b.zoneId);
    const byZone = db.zones.map(z => {
      const items = zoneGroups[z.id] || [];
      return { zoneId: z.id, zoneName: z.name, bookings: items.length, subsidised: items.filter(b => b.type === 'Subsidised').length, gallons: sum(items, b => b.capacity) };
    });
    const failGroups = group(inRange.filter(b => b.status === 'Failed' || b.failReason), b => b.failReason || 'Unknown');
    const failReasons = Object.entries(failGroups).map(([reason, items]) => ({ reason, count: items.length }));
    const billsInRange = db.bills.filter(x => inRange.some(b => b.id === x.bookingId));
    const revenue = {
      paid: sum(billsInRange.filter(x => x.status === 'Paid'), x => x.amount),
      unpaid: sum(billsInRange.filter(x => x.status === 'Unpaid'), x => x.amount),
      refunded: sum(billsInRange.filter(x => x.status === 'Refunded'), x => x.amount)
    };
    const disputes = {
      open: db.disputes.filter(d => d.status === 'Open').length,
      resolved: db.disputes.filter(d => d.status === 'Resolved').length
    };
    return { data: { from, to, days, totalBookings: inRange.length, byStatus, byType, byHydrant, byZone, failReasons, revenue, disputes } };
  });


  // Mock-only: restore the demo data (used by the login page on static hosting).
  route('POST', '/api/demo/reset', null, () => {
    db = buildSeed();
    saveDb();
    return { data: { reset: true } };
  });

  /* ---------------------------------------------------------------- */
  /* Request handler                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Handles one API request.
   * @returns {{ status: number, payload: object }}
   */
  function handle({ method, pathname, query = {}, body = {}, authorization = '' }) {
    try {
      const match = routes
        .filter(r => r.method === method)
        .map(r => ({ r, m: pathname.match(r.re) }))
        .find(x => x.m);
      if (!match) {
        const exists = routes.some(r => pathname.match(r.re));
        fail(exists ? 405 : 404, exists ? 'Method not allowed' : `No API route for ${method} ${pathname}`);
      }
      const { r, m } = match;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const user = authUser(authorization);
      if (r.roles !== null) {
        if (!user) fail(401, 'Please log in first');
        if (r.roles.length && !r.roles.includes(user.role)) fail(403, `This action is not available to a ${META.roleLabels[user.role]}`);
      }
      const result = r.handler({ params, query, body, user }) || {};
      const status = result.status || 200;
      delete result.status;
      return { status, payload: result };
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      if (status === 500) console.error(err);
      return { status, payload: { error: { status, message: status === 500 ? 'Internal server error' : err.message, details: err.details || null } } };
    }
  }

  return { handle, ApiError };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createMockApi };
else root.createMockApi = createMockApi;
})(typeof self !== 'undefined' ? self : this);
