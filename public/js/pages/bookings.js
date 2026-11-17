// Booking list shared by customer, zone officer, operator and admin.
// The API only returns bookings the user may see; this page decides which
// columns, filters and buttons to show for the role.
import { getAll } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, $$, clear, fillSelect, renderTable, statusBadge, typeBadge, fmtDate, fmtGallons, fmtMoney, fill } from '../ui.js';
import { createList } from '../list.js';
import { actionButtons } from '../booking-actions.js';

boot(async () => {
  const { user, meta } = await initPage(['customer', 'officer', 'operator', 'admin']);
  const form = $('#filters');

  const titles = {
    customer: ['My bookings', 'All your tanker bookings and their status'],
    officer: [`Bookings in ${user.zoneName}`, 'You can approve subsidised bookings and view trips, but not dispatch'],
    operator: [`Bookings at ${user.hydrantName}`, 'Approved and later bookings for your hydrant'],
    admin: ['All bookings', 'Every booking in the city']
  }[user.role];
  $('#page-title').textContent = titles[0];
  $('#page-sub').textContent = titles[1];
  document.title = `${titles[0]} · PaaniLink`;
  if (user.role === 'customer') $('#head-actions').append(h('a', { class: 'btn btn-primary', href: 'book.html' }, 'Book a tanker'));

  // Hide filters that do not apply to this role (disabled fields are not sent).
  $$('[data-roles]', form).forEach(el => {
    if (!el.dataset.roles.split(' ').includes(user.role)) {
      el.hidden = true;
      el.querySelectorAll('select,input').forEach(c => { c.disabled = true; });
    }
  });

  // Fill dropdowns from the API before the list reads the URL filters.
  const statuses = user.role === 'operator' ? meta.bookingStatuses.filter(s => !['PendingApproval', 'Rejected'].includes(s)) : meta.bookingStatuses;
  fillSelect(form.status, statuses.map(s => ({ id: s, name: meta.statusLabels[s] })), { placeholder: 'All statuses' });
  fillSelect(form.type, meta.bookingTypes.map(t => ({ id: t, name: t })), { placeholder: 'All types' });
  if (!form.hydrantId.disabled) {
    const hydrants = await getAll('/hydrants', user.role === 'officer' ? { zoneIds: user.zoneId } : {});
    fillSelect(form.hydrantId, hydrants, { placeholder: 'All hydrants' });
  }
  if (!form.zoneId.disabled) fillSelect(form.zoneId, await getAll('/zones'), { placeholder: 'All zones' });

  const ctx = { user, meta };
  const columns = [
    { label: 'Booking', render: b => h('a', { href: `booking.html?id=${b.id}` }, `#${b.id}`) },
    { label: 'Delivery', render: b => h('span', {}, fmtDate(b.deliveryDate), h('br'), h('span', { class: 'small muted' }, b.slotLabel)) },
    user.role !== 'customer' ? { label: 'Customer', render: b => h('span', {}, b.customerName, h('br'), h('span', { class: 'small muted' }, b.deliveryAddress)) } : null,
    user.role !== 'operator' ? { label: 'Hydrant', render: b => b.hydrantName } : null,
    user.role === 'admin' ? { label: 'Zone', render: b => b.zoneName } : null,
    { label: 'Tanker', render: b => h('span', {}, fmtGallons(b.capacity), b.tankerRegNo ? h('span', { class: 'small muted' }, ` · ${b.tankerRegNo}`) : null) },
    { label: 'Type', render: b => typeBadge(b.type) },
    { label: 'Amount', render: b => fmtMoney(b.amount) },
    { label: 'Status', render: b => statusBadge(b.status, meta) },
    { label: 'Actions', render: b => {
      const btns = actionButtons(b, ctx, () => list.reload(), { small: true });
      return btns.length ? h('div', { class: 'actions' }, btns) : h('a', { href: `booking.html?id=${b.id}`, class: 'small' }, 'View');
    } }
  ].filter(Boolean);

  const list = createList({
    form,
    output: $('#list'),
    pager: $('#pager'),
    endpoint: '/bookings',
    render: rows => fill($('#list'), renderTable({
      columns, rows, caption: titles[0],
      empty: 'No bookings match these filters.',
      onRowClick: b => { location.href = `booking.html?id=${b.id}`; }
    }))
  });
});
