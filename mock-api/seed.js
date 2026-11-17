// Builds the initial mock database. Dates are relative to "today" so the demo
// always has bookings for today, tomorrow and the last few days.
// Run `npm run reset` to delete db.json and regenerate this seed.

const DEMO_PASSWORD = 'paani1234';

function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function isoAt(offsetDays, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function buildSeed() {
  const zones = [
    { id: 1, name: 'Korangi', description: 'Korangi industrial and residential sectors' },
    { id: 2, name: 'Orangi Town', description: 'Orangi sectors 1 to 16' },
    { id: 3, name: 'Gulshan-e-Iqbal', description: 'Gulshan blocks 1 to 19' },
    { id: 4, name: 'Lyari', description: 'Lyari old city area' }
  ].map(z => ({ ...z, createdAt: isoAt(-60, 9) }));

  const hydrants = [
    { id: 1, name: 'Safoora Hydrant', location: 'University Road, Safoora Chowrangi', dailyQuotaGallons: 60000, openTime: '06:00', closeTime: '22:00', zoneIds: [3, 1], status: 'Available', unavailableReason: null },
    { id: 2, name: 'Sakhi Hassan Hydrant', location: 'Sakhi Hassan Chowrangi, North Nazimabad', dailyQuotaGallons: 48000, openTime: '08:00', closeTime: '20:00', zoneIds: [2, 4], status: 'Available', unavailableReason: null },
    { id: 3, name: 'Crown Hydrant', location: 'Crown Cinema Road, Korangi', dailyQuotaGallons: 36000, openTime: '08:00', closeTime: '16:00', zoneIds: [1, 4], status: 'Available', unavailableReason: null }
  ].map(h => ({ ...h, createdAt: isoAt(-60, 9) }));

  const tankers = [
    { id: 1, registrationNo: 'KHT-1001', capacity: 1000, hydrantId: 1, status: 'Available' },
    { id: 2, registrationNo: 'KHT-3001', capacity: 3000, hydrantId: 1, status: 'Available' },
    { id: 3, registrationNo: 'KHT-3002', capacity: 3000, hydrantId: 1, status: 'Available' },
    { id: 4, registrationNo: 'KHT-6001', capacity: 6000, hydrantId: 1, status: 'Available' },
    { id: 5, registrationNo: 'KHT-1002', capacity: 1000, hydrantId: 2, status: 'Available' },
    { id: 6, registrationNo: 'KHT-3003', capacity: 3000, hydrantId: 2, status: 'Available' },
    { id: 7, registrationNo: 'KHT-6002', capacity: 6000, hydrantId: 2, status: 'Available' },
    { id: 8, registrationNo: 'KHT-3004', capacity: 3000, hydrantId: 3, status: 'Available' },
    { id: 9, registrationNo: 'KHT-6003', capacity: 6000, hydrantId: 3, status: 'Unavailable' }
  ].map(t => ({ ...t, createdAt: isoAt(-60, 9) }));

  const rates = [
    { id: 1, capacity: 1000, commercialRate: 2500, subsidisedRate: 800 },
    { id: 2, capacity: 3000, commercialRate: 6000, subsidisedRate: 2000 },
    { id: 3, capacity: 6000, commercialRate: 10500, subsidisedRate: 3500 }
  ].map(r => ({ ...r, createdAt: isoAt(-60, 9) }));

  const noSubsidy = { status: 'None', category: null, monthlyLimitGallons: 0 };
  const u = (id, role, name, email, phone, cnic, extra = {}) => ({
    id, role, name, email, phone, cnic, password: DEMO_PASSWORD, active: true,
    zoneId: null, hydrantId: null, address: null, subsidy: { ...noSubsidy },
    demo: false, createdAt: isoAt(-50, 10), ...extra
  });

  const users = [
    u(1, 'admin', 'Hamza Arif', 'admin@paanilink.pk', '0300-1111111', '42101-1111111-1', { demo: true }),
    u(2, 'officer', 'Imran Qureshi', 'officer.gulshan@paanilink.pk', '0301-2222222', '42101-2222222-2', { zoneId: 3, demo: true }),
    u(3, 'officer', 'Nadia Hussain', 'officer.orangi@paanilink.pk', '0302-3333333', '42101-3333333-3', { zoneId: 2 }),
    u(4, 'officer', 'Tariq Mehmood', 'officer.korangi@paanilink.pk', '0303-4444444', '42101-4444444-4', { zoneId: 1 }),
    u(5, 'officer', 'Rubina Shah', 'officer.lyari@paanilink.pk', '0304-5555555', '42101-5555555-5', { zoneId: 4 }),
    u(6, 'operator', 'Kashif Ali', 'operator.safoora@paanilink.pk', '0305-6666666', '42101-6666666-6', { hydrantId: 1, demo: true }),
    u(7, 'operator', 'Waqar Ahmed', 'operator.sakhi@paanilink.pk', '0306-7777777', '42101-7777777-7', { hydrantId: 2 }),
    u(8, 'operator', 'Junaid Khan', 'operator.crown@paanilink.pk', '0307-8888888', '42101-8888888-8', { hydrantId: 3 }),
    u(9, 'driver', 'Asif Baloch', 'driver.asif@paanilink.pk', '0310-9999991', '42101-9999991-1', { hydrantId: 1, licenseNo: 'LTV-55821', demo: true }),
    u(10, 'driver', 'Bilal Raza', 'driver.bilal@paanilink.pk', '0310-9999992', '42101-9999992-2', { hydrantId: 1, licenseNo: 'LTV-55822' }),
    u(11, 'driver', 'Kamran Shaikh', 'driver.kamran@paanilink.pk', '0310-9999993', '42101-9999993-3', { hydrantId: 2, licenseNo: 'LTV-55823' }),
    u(12, 'driver', 'Danish Iqbal', 'driver.danish@paanilink.pk', '0310-9999994', '42101-9999994-4', { hydrantId: 2, licenseNo: 'LTV-55824' }),
    u(13, 'driver', 'Faisal Abbasi', 'driver.faisal@paanilink.pk', '0310-9999995', '42101-9999995-5', { hydrantId: 3, licenseNo: 'LTV-55825' }),
    u(14, 'customer', 'Ahmed Raza', 'customer@paanilink.pk', '0321-1234567', '42201-1234567-1', { zoneId: 3, address: 'House B-112, Block 13-D, Gulshan-e-Iqbal', demo: true }),
    u(15, 'customer', 'Ayesha Bibi', 'ayesha@paanilink.pk', '0333-7654321', '42201-7654321-2', {
      zoneId: 3, address: 'Flat 4, Building 22, Block 5, Gulshan-e-Iqbal',
      subsidy: { status: 'Approved', category: 'Household', monthlyLimitGallons: 12000, approvedAt: isoAt(-20, 11) }
    }),
    u(16, 'customer', 'Al-Shifa Clinic', 'alshifa@paanilink.pk', '0345-1112223', '42301-1112223-3', {
      zoneId: 2, address: 'Plot 7, Sector 11-1/2, Orangi Town',
      subsidy: { status: 'Approved', category: 'Hospital', monthlyLimitGallons: 60000, approvedAt: isoAt(-30, 11) }
    }),
    u(17, 'customer', 'Zara Khan', 'zara@paanilink.pk', '0312-4445556', '42301-4445556-4', {
      zoneId: 2, address: 'House 45, Sector 5-E, Orangi Town',
      subsidy: { status: 'Pending', category: null, monthlyLimitGallons: 0 }
    }),
    u(18, 'customer', 'Usman Ghani', 'usman@paanilink.pk', '0322-9998887', '42101-9998887-5', { zoneId: 1, address: 'House 9, Sector 33-A, Korangi' })
  ];

  const subsidyApplications = [
    { id: 1, customerId: 15, zoneId: 3, category: 'Household', proofType: 'BISP card', proofReference: 'BISP-778812', monthlyIncome: 28000, institutionName: null, householdSize: 7, details: 'Family of 7, piped water twice a week.', status: 'Approved', reviewedBy: 2, reviewerName: 'Imran Qureshi', remarks: 'BISP card verified.', monthlyLimitGallons: 12000, createdAt: isoAt(-22, 10), reviewedAt: isoAt(-20, 11) },
    { id: 2, customerId: 16, zoneId: 2, category: 'Hospital', proofType: 'Registration certificate', proofReference: 'SHCC-2019-4471', monthlyIncome: null, institutionName: 'Al-Shifa Clinic', householdSize: null, details: '20 bed clinic.', status: 'Approved', reviewedBy: 3, reviewerName: 'Nadia Hussain', remarks: 'Registration checked with Health Care Commission.', monthlyLimitGallons: 60000, createdAt: isoAt(-32, 10), reviewedAt: isoAt(-30, 11) },
    { id: 3, customerId: 17, zoneId: 2, category: 'Household', proofType: 'Income certificate', proofReference: 'IC-2025-09981', monthlyIncome: 35000, institutionName: null, householdSize: 5, details: 'Single earning member, daily wage.', status: 'Pending', reviewedBy: null, reviewerName: null, remarks: null, monthlyLimitGallons: null, createdAt: isoAt(-1, 15), reviewedAt: null }
  ];

  const rateFor = (capacity, type) => {
    const r = rates.find(x => x.capacity === capacity);
    return type === 'Subsidised' ? r.subsidisedRate : r.commercialRate;
  };
  const userById = id => users.find(x => x.id === id);
  const operatorOf = hydrantId => users.find(x => x.role === 'operator' && x.hydrantId === hydrantId);
  const officerOf = zoneId => users.find(x => x.role === 'officer' && x.zoneId === zoneId);

  // Works out the list of statuses a booking passed through to reach its final status.
  const CHAIN = ['Approved', 'Assigned', 'Filled', 'Dispatched', 'Arrived', 'Delivered'];
  function chainFor(type, status) {
    const start = type === 'Subsidised' ? ['PendingApproval'] : [];
    if (status === 'PendingApproval') return ['PendingApproval'];
    if (status === 'Rejected') return ['PendingApproval', 'Rejected'];
    if (status === 'Cancelled') return [...start, 'Approved', 'Cancelled'];
    if (status === 'Failed') return [...start, 'Approved', 'Assigned', 'Filled', 'Dispatched', 'Failed'];
    if (status === 'Confirmed' || status === 'Disputed') return [...start, ...CHAIN, status];
    if (status === 'Resolved') return [...start, ...CHAIN, 'Disputed', 'Resolved'];
    return [...start, ...CHAIN.slice(0, CHAIN.indexOf(status) + 1)];
  }

  const bookings = [];
  const bills = [];
  const disputes = [];

  function mk(id, spec) {
    const { customerId, hydrantId, capacity, type, day, slot, status, tankerId = null, driverId = null, failReason = null, disputeReason = null, resolution = null } = spec;
    const customer = userById(customerId);
    const createdAt = isoAt(day - 1, 9 + (id % 6), 10);
    const history = [];
    const steps = chainFor(type, status);
    let t = new Date(createdAt).getTime();
    steps.forEach((s, i) => {
      let actor;
      if (['PendingApproval', 'Cancelled', 'Confirmed', 'Disputed'].includes(s)) actor = customer;
      else if (s === 'Approved' && type === 'Subsidised') actor = officerOf(customer.zoneId);
      else if (s === 'Approved') actor = null; // auto-approved commercial
      else if (s === 'Rejected' || s === 'Resolved') actor = officerOf(customer.zoneId);
      else if (['Assigned', 'Filled', 'Dispatched'].includes(s)) actor = operatorOf(hydrantId);
      else actor = userById(driverId);
      if (i > 0) t += 40 * 60 * 1000;
      let note = null;
      if (s === 'Approved' && type === 'Commercial') note = 'Commercial booking approved automatically';
      if (s === 'Assigned') note = `Tanker ${tankers.find(x => x.id === tankerId).registrationNo}, driver ${userById(driverId).name}`;
      if (s === 'Failed') note = failReason;
      if (s === 'Disputed') note = disputeReason;
      if (s === 'Resolved') note = resolution;
      if (s === 'Rejected') note = 'Monthly limit already used by another booking';
      history.push({ status: s, at: new Date(t).toISOString(), byUserId: actor ? actor.id : null, byName: actor ? actor.name : 'System', byRole: actor ? actor.role : 'system', note });
    });

    const amount = rateFor(capacity, type);
    const booking = {
      id, customerId, zoneId: customer.zoneId, hydrantId, capacity, type,
      deliveryDate: dateStr(day), slot, deliveryAddress: customer.address, notes: null,
      status, amount, tankerId, driverId, failReason,
      createdAt, updatedAt: history[history.length - 1].at, history
    };
    bookings.push(booking);

    let billStatus = 'Unpaid';
    if (status === 'PendingApproval') billStatus = 'AwaitingApproval';
    if (status === 'Cancelled' || status === 'Rejected') billStatus = 'Void';
    if (['Confirmed', 'Resolved'].includes(status) || (status === 'Delivered' && id % 2 === 0)) billStatus = 'Paid';
    if (status === 'Resolved') billStatus = 'Refunded';
    bills.push({
      id, bookingId: id, customerId, amount, status: billStatus,
      paymentMethod: billStatus === 'Paid' || billStatus === 'Refunded' ? 'Cash' : null,
      issuedAt: createdAt, paidAt: billStatus === 'Paid' ? booking.updatedAt : null
    });

    if (status === 'Disputed' || status === 'Resolved') {
      const officer = officerOf(customer.zoneId);
      disputes.push({
        id: disputes.length + 1, bookingId: id, customerId, zoneId: customer.zoneId,
        reason: disputeReason, status: status === 'Resolved' ? 'Resolved' : 'Open',
        outcome: status === 'Resolved' ? 'Refund' : null, resolution: status === 'Resolved' ? resolution : null,
        resolvedBy: status === 'Resolved' ? officer.id : null, resolverName: status === 'Resolved' ? officer.name : null,
        createdAt: history.find(h => h.status === 'Disputed').at,
        resolvedAt: status === 'Resolved' ? booking.updatedAt : null
      });
    }
  }

  mk(1, { customerId: 15, hydrantId: 1, capacity: 3000, type: 'Subsidised', day: 1, slot: 'MORNING', status: 'PendingApproval' });
  mk(2, { customerId: 14, hydrantId: 1, capacity: 6000, type: 'Commercial', day: 0, slot: 'AFTERNOON', status: 'Approved' });
  mk(3, { customerId: 14, hydrantId: 1, capacity: 3000, type: 'Commercial', day: 0, slot: 'EVENING', status: 'Assigned', tankerId: 2, driverId: 9 });
  mk(4, { customerId: 15, hydrantId: 1, capacity: 1000, type: 'Subsidised', day: 0, slot: 'MORNING', status: 'Dispatched', tankerId: 1, driverId: 9 });
  mk(5, { customerId: 14, hydrantId: 1, capacity: 3000, type: 'Commercial', day: -1, slot: 'AFTERNOON', status: 'Delivered', tankerId: 3, driverId: 10 });
  mk(6, { customerId: 16, hydrantId: 2, capacity: 6000, type: 'Subsidised', day: -3, slot: 'MORNING', status: 'Confirmed', tankerId: 7, driverId: 11 });
  mk(7, { customerId: 14, hydrantId: 1, capacity: 1000, type: 'Commercial', day: -2, slot: 'MORNING', status: 'Failed', tankerId: 1, driverId: 10, failReason: 'House locked' });
  mk(8, { customerId: 17, hydrantId: 2, capacity: 3000, type: 'Commercial', day: 2, slot: 'AFTERNOON', status: 'Cancelled' });
  mk(9, { customerId: 16, hydrantId: 2, capacity: 6000, type: 'Subsidised', day: 1, slot: 'MORNING', status: 'PendingApproval' });
  mk(10, { customerId: 18, hydrantId: 3, capacity: 3000, type: 'Commercial', day: 1, slot: 'MORNING', status: 'Approved' });
  mk(11, { customerId: 15, hydrantId: 1, capacity: 3000, type: 'Subsidised', day: -4, slot: 'EVENING', status: 'Disputed', tankerId: 3, driverId: 10, disputeReason: 'Tanker delivered only about half the water. The tank level barely rose.' });
  mk(12, { customerId: 14, hydrantId: 1, capacity: 6000, type: 'Commercial', day: -8, slot: 'MORNING', status: 'Resolved', tankerId: 4, driverId: 9, disputeReason: 'Water was muddy and could not be used at all.', resolution: 'Hydrant filter was faulty that day. Full refund approved.' });
  mk(13, { customerId: 16, hydrantId: 2, capacity: 3000, type: 'Subsidised', day: 0, slot: 'AFTERNOON', status: 'Filled', tankerId: 6, driverId: 12 });
  mk(14, { customerId: 18, hydrantId: 3, capacity: 3000, type: 'Commercial', day: -5, slot: 'MORNING', status: 'Confirmed', tankerId: 8, driverId: 13 });
  mk(15, { customerId: 15, hydrantId: 1, capacity: 1000, type: 'Subsidised', day: -6, slot: 'AFTERNOON', status: 'Rejected' });
  mk(16, { customerId: 14, hydrantId: 1, capacity: 3000, type: 'Commercial', day: -10, slot: 'AFTERNOON', status: 'Confirmed', tankerId: 2, driverId: 9 });
  mk(17, { customerId: 18, hydrantId: 3, capacity: 3000, type: 'Commercial', day: 0, slot: 'MORNING', status: 'Arrived', tankerId: 8, driverId: 13 });

  return {
    counters: {
      zones: zones.length, hydrants: hydrants.length, tankers: tankers.length, rates: rates.length,
      users: users.length, subsidyApplications: subsidyApplications.length,
      bookings: bookings.length, bills: bills.length, disputes: disputes.length
    },
    zones, hydrants, tankers, rates, users, subsidyApplications, bookings, bills, disputes
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildSeed, DEMO_PASSWORD };
