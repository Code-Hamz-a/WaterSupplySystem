// Bills: customers see and pay their own bills, the administrator sees all bills.
import { post } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, fillSelect, renderTable, openDialog, field, toast, typeBadge, fmtDate, fmtDateTime, fmtGallons, fmtMoney, fill } from '../ui.js';
import { validateForm, rules } from '../validation.js';
import { createList } from '../list.js';

const billStatusLabel = { AwaitingApproval: 'Awaiting approval', Unpaid: 'Unpaid', Paid: 'Paid', Void: 'Void', Refunded: 'Refunded' };

boot(async () => {
  const { user, meta } = await initPage(['customer', 'admin']);
  const form = $('#filters');
  $('#page-title').textContent = user.role === 'customer' ? 'My bills' : 'All bills';

  fillSelect(form.status, meta.billStatuses.map(s => ({ id: s, name: billStatusLabel[s] || s })), { placeholder: 'All statuses' });
  fillSelect(form.bookingType, meta.bookingTypes.map(t => ({ id: t, name: t })), { placeholder: 'All types' });

  async function pay(bill) {
    const schema = { paymentMethod: [rules.required('Select a payment method')] };
    const result = await openDialog({
      title: `Pay bill #${bill.id}`,
      submitLabel: `Pay ${fmtMoney(bill.amount)}`,
      submitClass: 'btn-success',
      body: [
        h('p', { class: 'muted' }, `Booking #${bill.bookingId} · ${fmtGallons(bill.capacity)} · ${fmtDate(bill.deliveryDate)}`),
        h('div', { class: 'alert alert-info' }, 'Payment is simulated in this version. No money is charged.'),
        field({ label: 'Payment method', name: 'paymentMethod', type: 'select', required: true, options: meta.paymentMethods.map(m => ({ value: m, label: m })) })
      ],
      onSubmit: async f => {
        const { valid, values } = validateForm(f, schema);
        if (!valid) return false;
        return (await post(`/bills/${bill.id}/pay`, values)).data;
      }
    });
    if (result) {
      toast(`Bill #${bill.id} paid`, 'success');
      list.reload();
    }
  }

  const columns = [
    { label: 'Bill', render: b => `#${b.id}` },
    { label: 'Booking', render: b => h('a', { href: `booking.html?id=${b.bookingId}` }, `#${b.bookingId}`) },
    user.role === 'admin' ? { label: 'Customer', render: b => b.customerName } : null,
    { label: 'Delivery', render: b => fmtDate(b.deliveryDate) },
    { label: 'Tanker', render: b => fmtGallons(b.capacity) },
    { label: 'Type', render: b => typeBadge(b.bookingType) },
    { label: 'Amount', render: b => h('strong', {}, fmtMoney(b.amount)) },
    { label: 'Status', render: b => h('span', { class: `badge badge-${b.status.toLowerCase()}` }, billStatusLabel[b.status] || b.status) },
    { label: 'Paid', render: b => (b.paidAt ? `${fmtDateTime(b.paidAt)} · ${b.paymentMethod}` : '-') },
    user.role === 'customer'
      ? { label: 'Action', render: b => (b.status === 'Unpaid' ? h('button', { type: 'button', class: 'btn btn-sm btn-success', onclick: () => pay(b) }, 'Pay now') : '-') }
      : null
  ].filter(Boolean);

  const list = createList({
    form, output: $('#list'), pager: $('#pager'), endpoint: '/bills',
    render: rows => fill($('#list'), renderTable({ columns, rows, caption: 'Bills', empty: 'No bills found.' }))
  });
});
