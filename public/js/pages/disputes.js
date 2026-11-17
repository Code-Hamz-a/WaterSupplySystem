// Disputes: customers follow their own, Zone Officers resolve the ones in their zone.
import { post } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, fillSelect, renderTable, openDialog, field, toast, fmtDate, fmtDateTime, fmtGallons, fill } from '../ui.js';
import { validateForm, rules } from '../validation.js';
import { createList } from '../list.js';

boot(async () => {
  const { user, meta } = await initPage(['customer', 'officer', 'admin']);
  const form = $('#filters');
  const canResolve = user.role === 'officer' || user.role === 'admin';
  $('#page-sub').textContent = {
    customer: 'Problems you reported. To report a new one, open the booking and press "Raise dispute".',
    officer: `Disputes from ${user.zoneName}. Read the booking history, then record the outcome.`,
    admin: 'Disputes from every zone.'
  }[user.role];
  fillSelect(form.status, meta.disputeStatuses.map(s => ({ id: s, name: s })), { placeholder: 'All statuses' });

  async function resolve(d) {
    const schema = {
      outcome: [rules.required('Select an outcome')],
      resolution: [rules.required('Explain the decision'), rules.minLength(10), rules.maxLength(300)]
    };
    const done = await openDialog({
      title: `Resolve dispute #${d.id}`, submitLabel: 'Resolve',
      body: [
        h('p', { class: 'muted' }, `Booking #${d.bookingId} · ${d.customerName} · ${fmtGallons(d.capacity)} on ${fmtDate(d.deliveryDate)}`),
        h('blockquote', { class: 'alert alert-warn' }, `"${d.reason}"`),
        h('p', { class: 'small' }, h('a', { href: `booking.html?id=${d.bookingId}`, target: '_blank', rel: 'noopener' }, 'Open booking history in a new tab')),
        field({ label: 'Outcome', name: 'outcome', type: 'select', required: true, options: meta.disputeOutcomes.map(o => ({ value: o, label: o })), hint: '"Refund" marks the bill as refunded' }),
        field({ label: 'Decision', name: 'resolution', type: 'textarea', required: true, attrs: { maxlength: 300 } })
      ],
      onSubmit: async f => {
        const { valid, values } = validateForm(f, schema);
        if (!valid) return false;
        return (await post(`/disputes/${d.id}/resolve`, values)).data;
      }
    });
    if (done) { toast(`Dispute #${d.id} resolved`, 'success'); list.reload(); }
  }

  const columns = [
    { label: 'Dispute', render: d => `#${d.id}` },
    { label: 'Booking', render: d => h('a', { href: `booking.html?id=${d.bookingId}` }, `#${d.bookingId}`) },
    user.role !== 'customer' ? { label: 'Customer', render: d => d.customerName } : null,
    user.role === 'admin' ? { label: 'Zone', render: d => d.zoneName } : null,
    { label: 'Delivery', render: d => `${fmtDate(d.deliveryDate)} · ${fmtGallons(d.capacity)}` },
    { label: 'Problem', render: d => h('span', {}, d.reason, d.failReason ? h('div', { class: 'small muted' }, `Driver reported: ${d.failReason}`) : null) },
    { label: 'Raised', render: d => fmtDateTime(d.createdAt) },
    { label: 'Status', render: d => h('span', { class: `badge badge-${d.status.toLowerCase()}` }, d.status) },
    { label: 'Outcome', render: d => (d.outcome ? h('span', {}, h('strong', {}, d.outcome), h('div', { class: 'small muted' }, `${d.resolution} (${d.resolverName})`)) : '-') },
    canResolve ? { label: 'Action', render: d => (d.status === 'Open' ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => resolve(d) }, 'Resolve') : '-') } : null
  ].filter(Boolean);

  const list = createList({
    form, output: $('#list'), pager: $('#pager'), endpoint: '/disputes',
    render: rows => fill($('#list'), renderTable({ columns, rows, caption: 'Disputes', empty: 'No disputes found.' }))
  });
});
