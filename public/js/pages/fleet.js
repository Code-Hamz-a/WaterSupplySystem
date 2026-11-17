// Hydrant Operator: availability of their hydrant and its tankers.
import { get, patch, getAll } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, fillSelect, renderTable, openDialog, confirmDialog, field, toast, showLoading, fmtGallons, fill } from '../ui.js';
import { validateForm, rules } from '../validation.js';
import { createList } from '../list.js';

boot(async () => {
  const { user, meta } = await initPage(['operator']);
  const form = $('#filters');

  /* ----- hydrant ----- */
  async function loadHydrant() {
    const box = $('#hydrant');
    showLoading(box);
    const hy = (await get(`/hydrants/${user.hydrantId}`)).data;
    const available = hy.status === 'Available';
    fill(box, 
      h('dl', { class: 'details cols-2' },
        h('div', {}, h('dt', {}, 'Name'), h('dd', {}, hy.name)),
        h('div', {}, h('dt', {}, 'Status'), h('dd', {}, h('span', { class: `badge badge-${hy.status.toLowerCase()}` }, hy.status))),
        h('div', {}, h('dt', {}, 'Location'), h('dd', {}, hy.location)),
        h('div', {}, h('dt', {}, 'Hours'), h('dd', {}, `${hy.openTime} - ${hy.closeTime}`)),
        h('div', {}, h('dt', {}, 'Daily quota'), h('dd', {}, fmtGallons(hy.dailyQuotaGallons))),
        h('div', {}, h('dt', {}, 'Zones served'), h('dd', {}, hy.zoneNames.join(', '))),
        !available ? h('div', {}, h('dt', {}, 'Reason'), h('dd', {}, hy.unavailableReason)) : null),
      h('div', { class: 'actions mt' },
        available
          ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => setHydrant(hy, 'Unavailable') }, 'Mark hydrant unavailable')
          : h('button', { type: 'button', class: 'btn btn-success', onclick: () => setHydrant(hy, 'Available') }, 'Mark hydrant available')));
  }

  async function setHydrant(hy, status) {
    let done;
    if (status === 'Unavailable') {
      const schema = { reason: [rules.required('Give a reason'), rules.minLength(5), rules.maxLength(200)] };
      done = await openDialog({
        title: `Mark ${hy.name} unavailable`, submitLabel: 'Mark unavailable', submitClass: 'btn-danger',
        body: [
          h('p', { class: 'small muted' }, 'Customers will not be able to book this hydrant and you cannot fill tankers until it is available again.'),
          field({ label: 'Reason', name: 'reason', type: 'textarea', required: true, attrs: { maxlength: 200, placeholder: 'e.g. Pump repair' } })
        ],
        onSubmit: async f => {
          const { valid, values } = validateForm(f, schema);
          if (!valid) return false;
          return (await patch(`/hydrants/${hy.id}/status`, { status, reason: values.reason })).data;
        }
      });
    } else {
      done = await confirmDialog(`Mark ${hy.name} available again?`, { confirmLabel: 'Mark available' });
      if (done) await patch(`/hydrants/${hy.id}/status`, { status });
    }
    if (done) { toast(`Hydrant is now ${status}`, 'success'); loadHydrant(); }
  }

  /* ----- tankers ----- */
  fillSelect(form.status, meta.tankerStatuses.map(s => ({ id: s, name: s })), { placeholder: 'All' });
  fillSelect(form.capacity, await getAll('/rates', { sort: 'capacity' }), { value: 'capacity', label: r => fmtGallons(r.capacity), placeholder: 'All sizes' });

  async function toggleTanker(t) {
    const next = t.status === 'Available' ? 'Unavailable' : 'Available';
    const ok = await confirmDialog(`Mark tanker ${t.registrationNo} as ${next}?`, { confirmLabel: `Mark ${next.toLowerCase()}`, danger: next === 'Unavailable' });
    if (!ok) return;
    try {
      await patch(`/tankers/${t.id}/status`, { status: next });
      toast(`${t.registrationNo} is now ${next}`, 'success');
      list.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const columns = [
    { label: 'Registration', render: t => h('strong', {}, t.registrationNo) },
    { label: 'Size', render: t => fmtGallons(t.capacity) },
    { label: 'Status', render: t => h('span', { class: `badge badge-${t.status.toLowerCase()}` }, t.status) },
    { label: 'Action', render: t => h('button', {
      type: 'button', class: `btn btn-sm ${t.status === 'Available' ? 'btn-danger' : 'btn-success'}`, onclick: () => toggleTanker(t)
    }, t.status === 'Available' ? 'Mark unavailable' : 'Mark available') }
  ];
  const list = createList({
    form, output: $('#list'), pager: $('#pager'), endpoint: '/tankers',
    render: rows => fill($('#list'), renderTable({ columns, rows, caption: 'Tankers', empty: 'No tankers found.' }))
  });

  await loadHydrant();
});
