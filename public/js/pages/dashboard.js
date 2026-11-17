import { get } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, showLoading, renderTable, statusBadge, typeBadge, fmtDate, fmtGallons, queryParams, fill } from '../ui.js';

boot(async () => {
  const { user, meta } = await initPage(['customer', 'officer', 'operator', 'admin']);

  $('#greeting').textContent = `Welcome, ${user.name} (${meta.roleLabels[user.role]})`;
  if (queryParams().welcome) {
    $('#notice').append(h('div', { class: 'alert alert-success' }, 'Your account is ready. You can now book a tanker.'));
  }

  const quick = {
    customer: [['book.html', 'Book a tanker']],
    officer: [['bookings.html?status=PendingApproval', 'Review approvals']],
    operator: [['operator.html', 'Open dispatch board']],
    admin: [['reports.html', 'View reports']]
  }[user.role] || [];
  quick.forEach(([href, label]) => $('#quick-actions').append(h('a', { class: 'btn btn-primary', href }, label)));

  showLoading($('#cards'));
  const res = await get('/dashboard');
  const { cards, recent } = res.data;

  fill($('#cards'), ...cards.map(c =>
    h('a', { class: 'stat', href: c.link },
      h('div', { class: 'stat-label' }, c.label),
      h('div', { class: 'stat-value' }, String(c.value)),
      c.hint ? h('div', { class: 'stat-hint' }, c.hint) : null)));

  const columns = [
    { label: 'Booking', render: b => h('a', { href: `booking.html?id=${b.id}` }, `#${b.id}`) },
    { label: 'Delivery', render: b => `${fmtDate(b.deliveryDate)} · ${b.slotLabel}` },
    user.role === 'customer'
      ? { label: 'Hydrant', render: b => b.hydrantName }
      : { label: 'Customer', render: b => b.customerName },
    { label: 'Tanker', render: b => fmtGallons(b.capacity) },
    { label: 'Type', render: b => typeBadge(b.type) },
    { label: 'Status', render: b => statusBadge(b.status, meta) }
  ];
  fill($('#recent'), renderTable({
    columns, rows: recent, caption: 'Recently updated bookings',
    empty: user.role === 'customer' ? 'No bookings yet. Book your first tanker.' : 'No recent bookings.',
    onRowClick: b => { location.href = `booking.html?id=${b.id}`; }
  }));
});
