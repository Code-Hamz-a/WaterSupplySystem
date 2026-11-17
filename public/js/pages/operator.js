// Hydrant Operator dispatch board for one day. Each column is its own API request
// filtered by status on the server.
import { get } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, showLoading, showError, statusBadge, typeBadge, fmtDate, fmtGallons, todayStr, emptyState, fill } from '../ui.js';
import { actionButtons } from '../booking-actions.js';

const COLUMNS = [
  { el: '#col-waiting', statuses: ['Approved'] },
  { el: '#col-hydrant', statuses: ['Assigned', 'Filled'] },
  { el: '#col-road', statuses: ['Dispatched', 'Arrived', 'Delivered', 'Failed', 'Confirmed', 'Disputed', 'Resolved'] }
];

boot(async () => {
  const { user, meta } = await initPage(['operator']);
  const dateInput = $('#date');
  dateInput.value = todayStr();
  $('#hydrant-line').textContent = user.hydrantName;
  const ctx = { user, meta };

  function card(b) {
    return h('article', { class: 'trip' },
      h('div', { class: 'trip-head' },
        h('div', {},
          h('a', { href: `booking.html?id=${b.id}` }, h('strong', {}, `#${b.id}`)),
          ' ', typeBadge(b.type)),
        statusBadge(b.status, meta)),
      h('div', { class: 'trip-meta' },
        h('span', {}, `🕑 ${b.slotLabel}`),
        h('span', {}, `💧 ${fmtGallons(b.capacity)}`)),
      h('div', { class: 'small' }, `${b.customerName} · ${b.deliveryAddress}`),
      b.tankerRegNo ? h('div', { class: 'small muted' }, `🚚 ${b.tankerRegNo} · ${b.driverName}`) : null,
      h('div', { class: 'actions mt' }, actionButtons(b, ctx, () => load(), { small: true })));
  }

  async function loadQuota(date) {
    const box = $('#quota');
    const a = (await get(`/hydrants/${user.hydrantId}/availability`, { date })).data;
    const pct = Math.min(100, Math.round((a.reservedGallons / a.dailyQuotaGallons) * 100));
    clear($('#hydrant-alert'));
    if (a.status !== 'Available') {
      $('#hydrant-alert').append(h('div', { class: 'alert alert-error' },
        h('strong', {}, 'Hydrant marked unavailable. '), a.unavailableReason || '', h('a', { href: 'fleet.html' }, 'Change')));
    }
    fill(box, 
      h('div', { class: 'row' },
        h('span', { class: 'stat-value' }, fmtGallons(a.remainingGallons)),
        h('span', { class: 'muted' }, `left of ${fmtGallons(a.dailyQuotaGallons)} on ${fmtDate(date)} · hours ${a.openTime}-${a.closeTime}`)),
      h('div', { class: `meter mt${pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': 'Quota used' },
        h('span', { style: `width:${pct}%` })));
  }

  async function loadColumn(col, date) {
    const box = $(col.el);
    showLoading(box);
    try {
      const res = await get('/bookings', { deliveryDate: date, status: col.statuses.join(','), sort: 'deliveryDate', order: 'asc', limit: 100 });
      clear(box);
      if (!res.data.length) box.append(emptyState('Nothing here.'));
      // Sort by slot order from meta so the earliest slot is on top.
      const order = meta.slots.map(s => s.id);
      res.data.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)).forEach(b => box.append(card(b)));
    } catch (err) {
      showError(box, err, () => loadColumn(col, date));
    }
  }

  async function load() {
    const date = dateInput.value || todayStr();
    await Promise.all([loadQuota(date).catch(err => showError($('#quota'), err)), ...COLUMNS.map(c => loadColumn(c, date))]);
  }

  dateInput.addEventListener('change', load);
  $('#refresh').addEventListener('click', load);
  await load();
});
