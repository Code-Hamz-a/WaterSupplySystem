// Driver screen, designed for a phone: big buttons, one card per trip.
// The API only returns trips assigned to this driver.
import { get } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, $$, clear, showLoading, showError, statusBadge, fmtDate, fmtGallons, todayStr, addDays, renderPager, emptyState } from '../ui.js';
import { actionButtons } from '../booking-actions.js';

boot(async () => {
  const { user, meta } = await initPage(['driver']);
  $('#driver-line').textContent = `${user.name} · ${user.hydrantName}`;
  const ctx = { user, meta };
  const today = todayStr();

  // What each tab asks the API for.
  const TABS = {
    today: { deliveryDate: today, sort: 'id', order: 'asc', empty: 'No trips for today.' },
    upcoming: { dateFrom: addDays(today, 1), status: 'Assigned,Filled,Dispatched,Arrived', sort: 'deliveryDate', order: 'asc', empty: 'No upcoming trips.' },
    history: { status: 'Delivered,Failed,Confirmed,Disputed,Resolved', sort: 'deliveryDate', order: 'desc', empty: 'No finished trips yet.' }
  };
  let tab = 'today';
  let page = 1;

  function tripCard(b) {
    const active = ['Dispatched', 'Arrived'].includes(b.status);
    return h('article', { class: `trip${active ? ' trip-active' : ''}`, 'aria-label': `Trip ${b.id}` },
      h('div', { class: 'trip-head' },
        h('div', {}, h('strong', {}, `Trip #${b.id}`), h('div', { class: 'small muted' }, `${fmtDate(b.deliveryDate)} · ${b.slotLabel}`)),
        statusBadge(b.status, meta)),
      h('p', { class: 'trip-addr' }, `📍 ${b.deliveryAddress}`),
      h('div', { class: 'trip-meta' },
        h('span', {}, `👤 ${b.customerName}`),
        b.customerPhone ? h('a', { class: 'tel', href: `tel:${b.customerPhone.replace('-', '')}` }, `📞 ${b.customerPhone}`) : null,
        h('span', {}, `💧 ${fmtGallons(b.capacity)}`),
        h('span', {}, `🚚 ${b.tankerRegNo || '-'}`),
        h('span', {}, `🏭 ${b.hydrantName}`)),
      b.notes ? h('p', { class: 'small' }, h('strong', {}, 'Note: '), b.notes) : null,
      b.failReason ? h('p', { class: 'small' }, h('strong', {}, 'Failed: '), b.failReason) : null,
      ['Assigned', 'Filled'].includes(b.status) ? h('p', { class: 'small muted' }, 'Waiting for the operator to fill the tanker and send it out.') : null,
      h('div', { class: 'actions' }, actionButtons(b, ctx, () => load())));
  }

  async function load() {
    const box = $('#list');
    const { empty, ...query } = TABS[tab];
    showLoading(box);
    try {
      const res = await get('/bookings', { ...query, page, limit: 10 });
      clear(box);
      if (!res.data.length) box.append(emptyState(empty));
      // Put the trip the driver is doing right now at the top.
      const rows = [...res.data].sort((a, b) => Number(['Dispatched', 'Arrived'].includes(b.status)) - Number(['Dispatched', 'Arrived'].includes(a.status)));
      rows.forEach(b => box.append(tripCard(b)));
      renderPager($('#pager'), res, p => { page = p; load(); });
    } catch (err) {
      showError(box, err, load);
    }
  }

  $$('[role=tab]').forEach(btn => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    page = 1;
    $$('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    $('#panel').setAttribute('aria-labelledby', btn.id);
    load();
  }));
  $('#refresh').addEventListener('click', load);
  await load();
});
