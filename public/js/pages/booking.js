// One booking: details, progress, full audit trail (booking -> confirmation)
// and the action buttons this user may use right now.
import { get } from '../api.js';
import { initPage, boot, homeFor } from '../layout.js';
import { h, $, clear, showLoading, showError, statusBadge, typeBadge, fmtDate, fmtDateTime, fmtGallons, fmtMoney, queryParams, fill } from '../ui.js';
import { actionButtons } from '../booking-actions.js';

// Normal path a booking goes through, used for the progress bar.
const PATH = ['PendingApproval', 'Approved', 'Assigned', 'Filled', 'Dispatched', 'Arrived', 'Delivered', 'Confirmed'];

boot(async () => {
  const { user, meta } = await initPage([]);
  const { id, created } = queryParams();
  const box = $('#booking');

  if (user.role === 'driver') $('#back-link').href = 'driver.html';
  if (user.role === 'operator') $('#back-link').href = 'operator.html';
  if (created) $('#notice').append(h('div', { class: 'alert alert-success' }, 'Booking created. You can follow its progress here.'));

  if (!/^\d+$/.test(id || '')) {
    showError(box, new Error('No booking number in the address.'), () => { location.href = homeFor(user.role); });
    return;
  }

  async function load() {
    showLoading(box);
    try {
      const res = await get(`/bookings/${id}`);
      render(res.data);
    } catch (err) {
      showError(box, err, load);
    }
  }

  // When did the booking reach a status? Read from the history (single source of truth).
  function timeOf(b, status) {
    const entry = [...b.history].reverse().find(e => e.status === status);
    return entry ? fmtDateTime(entry.at) : '-';
  }

  function row(label, value) {
    return h('div', {}, h('dt', {}, label), h('dd', {}, value ?? '-'));
  }

  function render(b) {
    document.title = `Booking #${b.id} · PaaniLink`;
    const visitedStatuses = b.history.map(x => x.status);
    const path = b.type === 'Commercial' ? PATH.filter(s => s !== 'PendingApproval') : PATH;
    const offPath = !path.includes(b.status);

    const buttons = actionButtons(b, { user, meta }, updated => render(updated));
    const readOnlyNote = !buttons.length && user.role === 'officer' && ['Approved', 'Assigned', 'Filled', 'Dispatched', 'Arrived'].includes(b.status)
      ? h('p', { class: 'small muted' }, 'Zone Officers can view trips but cannot dispatch or change the driver.')
      : null;

    fill(box, 
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, `Booking #${b.id} `, statusBadge(b.status, meta)),
          h('p', { class: 'muted' }, `${fmtGallons(b.capacity)} · ${fmtDate(b.deliveryDate)} · ${b.slotLabel}`)),
        buttons.length ? h('div', { class: 'actions' }, buttons) : null),

      h('ol', { class: 'steps', 'aria-label': 'Progress' }, path.map(s =>
        h('li', { class: s === b.status ? 'current' : visitedStatuses.includes(s) ? 'done' : null }, meta.statusLabels[s]))),
      offPath ? h('div', { class: `alert ${['Failed', 'Rejected', 'Disputed'].includes(b.status) ? 'alert-error' : 'alert-info'}` },
        h('strong', {}, `${meta.statusLabels[b.status]}. `), b.failReason ? `Reason: ${b.failReason}` : '') : null,
      readOnlyNote,

      h('div', { class: 'layout-side' },
        h('div', {},
          h('section', { class: 'card', 'aria-labelledby': 'd-title' },
            h('h2', { id: 'd-title' }, 'Details'),
            h('dl', { class: 'details cols-2' },
              row('Type', typeBadge(b.type)),
              row('Amount', fmtMoney(b.amount)),
              row('Tanker size', fmtGallons(b.capacity)),
              row('Delivery date', fmtDate(b.deliveryDate)),
              row('Slot', b.slotLabel),
              row('Zone', b.zoneName),
              row('Hydrant', b.hydrantName),
              row('Hydrant location', b.hydrantLocation),
              row('Delivery address', b.deliveryAddress),
              row('Notes', b.notes),
              user.role !== 'customer' ? row('Customer', `${b.customerName} · ${b.customerPhone}`) : null,
              b.billStatus ? row('Bill', h('span', { class: `badge badge-${b.billStatus.toLowerCase()}` }, b.billStatus)) : null,
              b.disputeId ? row('Dispute', h('a', { href: `disputes.html?q=${b.id}` }, `#${b.disputeId} (${b.disputeStatus})`)) : null)),

          h('section', { class: 'card', 'aria-labelledby': 't-title' },
            h('h2', { id: 't-title' }, 'Tanker & driver'),
            b.tankerId
              ? h('dl', { class: 'details' },
                row('Tanker', b.tankerRegNo),
                row('Driver', b.driverName),
                row('Driver phone', b.driverPhone ? h('a', { href: `tel:${b.driverPhone}` }, b.driverPhone) : '-'),
                row('Filled at hydrant', timeOf(b, 'Filled')),
                row('Left hydrant', timeOf(b, 'Dispatched')),
                row('Arrived', timeOf(b, 'Arrived')),
                row('Delivered', timeOf(b, 'Delivered')))
              : h('p', { class: 'muted' }, 'No tanker assigned yet.'))),

        h('section', { class: 'card', 'aria-labelledby': 'h-title' },
          h('h2', { id: 'h-title' }, 'History'),
          h('ol', { class: 'timeline' }, b.history.map(e =>
            h('li', {},
              h('div', {}, h('strong', {}, meta.statusLabels[e.status] || e.status)),
              h('div', { class: 'when' }, `${fmtDateTime(e.at)} · ${e.byName}${e.byRole !== 'system' ? ` (${meta.roleLabels[e.byRole]})` : ''}`),
              e.note ? h('div', { class: 'note' }, e.note) : null)))))
    );
  }

  await load();
});
