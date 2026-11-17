// Admin: city-wide reports. All totals are calculated by the API (GET /api/reports);
// this page only draws them as stat cards, bar charts and tables.
import { get } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, showLoading, showError, renderTable, fmtDate, fmtGallons, fmtMoney, todayStr, addDays, typeBadge, statusBadge, fill } from '../ui.js';
import { validateForm, rules } from '../validation.js';

boot(async () => {
  const { meta } = await initPage(['admin']);
  const form = $('#range-form');
  const out = $('#report');

  // Default range: last 30 days up to the furthest bookable day.
  form.from.value = addDays(todayStr(), -30);
  form.to.value = addDays(todayStr(), meta.maxAdvanceDays);
  $('#print-btn').addEventListener('click', () => window.print());

  const schema = {
    from: [rules.required('Choose a start date')],
    to: [rules.required('Choose an end date'), (v, all) => (v && all.from && v < all.from ? 'End date must be on or after the start date' : null)]
  };

  const stat = (label, value, hint) => h('div', { class: 'stat' },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, String(value)),
    hint ? h('div', { class: 'stat-hint' }, hint) : null);

  // Simple horizontal bar chart. Bars are scaled to the largest value.
  function bars(items, labelOf, valueOf, title) {
    const max = Math.max(1, ...items.map(valueOf));
    const rows = items.filter(i => valueOf(i) > 0);
    if (!rows.length) return h('p', { class: 'muted' }, 'Nothing in this period.');
    return h('div', { class: 'bars', role: 'list', 'aria-label': title }, rows.map(i =>
      h('div', { class: 'bar-row', role: 'listitem' },
        h('span', {}, labelOf(i)),
        h('div', { class: 'bar-track', 'aria-hidden': 'true' }, h('div', { class: 'bar-fill', style: `width:${(valueOf(i) / max) * 100}%` })),
        h('span', { class: 'bar-val' }, String(valueOf(i))))));
  }

  const meter = pct => h('div', { class: `meter${pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': 'Quota used' },
    h('span', { style: `width:${Math.min(pct, 100)}%` }));

  function render(r) {
    $('#range-line').textContent = `${fmtDate(r.from)} to ${fmtDate(r.to)} (${r.days} days)`;
    fill(out, 
      h('section', { 'aria-label': 'Totals' },
        h('div', { class: 'grid grid-4' },
          stat('Bookings', r.totalBookings, 'all statuses'),
          stat('Paid', fmtMoney(r.revenue.paid), `Unpaid: ${fmtMoney(r.revenue.unpaid)}`),
          stat('Refunded', fmtMoney(r.revenue.refunded)),
          stat('Disputes', `${r.disputes.open} open`, `${r.disputes.resolved} resolved`))),

      h('div', { class: 'grid grid-2 mt' },
        h('section', { class: 'card' }, h('h2', {}, 'Bookings by status'),
          bars(r.byStatus, s => statusBadge(s.status, meta), s => s.count, 'Bookings by status')),
        h('section', { class: 'card' }, h('h2', {}, 'Failed delivery reasons'),
          bars(r.failReasons, f => f.reason, f => f.count, 'Failed delivery reasons'))),

      h('section', { class: 'card' }, h('h2', {}, 'Commercial vs subsidised'),
        renderTable({
          caption: 'Bookings by type', rows: r.byType,
          columns: [
            { label: 'Type', render: t => typeBadge(t.type) },
            { label: 'Bookings', render: t => String(t.bookings) },
            { label: 'Water', render: t => fmtGallons(t.gallons) },
            { label: 'Billed', render: t => fmtMoney(t.billed) }
          ]
        })),

      h('section', { class: 'card' }, h('h2', {}, 'Hydrant quota usage'),
        h('p', { class: 'small muted' }, `Quota = daily quota × ${r.days} days. Cancelled and rejected bookings are not counted.`),
        renderTable({
          caption: 'Quota usage by hydrant', rows: r.byHydrant,
          columns: [
            { label: 'Hydrant', render: x => x.hydrantName },
            { label: 'Bookings', render: x => String(x.bookings) },
            { label: 'Water booked', render: x => fmtGallons(x.gallons) },
            { label: 'Quota in period', render: x => fmtGallons(x.quotaGallons) },
            { label: 'Usage', render: x => h('div', {}, meter(x.usagePercent), h('span', { class: 'small' }, `${x.usagePercent}%`)) }
          ]
        })),

      h('section', { class: 'card' }, h('h2', {}, 'Bookings by zone'),
        renderTable({
          caption: 'Bookings by zone', rows: r.byZone,
          columns: [
            { label: 'Zone', render: z => z.zoneName },
            { label: 'Bookings', render: z => String(z.bookings) },
            { label: 'Subsidised', render: z => String(z.subsidised) },
            { label: 'Water', render: z => fmtGallons(z.gallons) }
          ]
        }))
    );
  }

  async function load() {
    const { valid, values } = validateForm(form, schema);
    if (!valid) return;
    showLoading(out);
    try {
      const res = await get('/reports', values);
      render(res.data);
    } catch (err) {
      showError(out, err, load);
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); load(); });
  await load();
});
