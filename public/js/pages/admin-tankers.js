// Admin: manage tankers. Sizes come from the rate list, hydrants from /hydrants.
import { getAll, patch } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, field, fillSelect, statusBadge, fmtGallons, toast } from '../ui.js';
import { rules, patterns } from '../validation.js';
import { setupCrud } from '../crud.js';

boot(async () => {
  const { meta } = await initPage(['admin']);
  const filters = $('#filters');

  const [hydrants, rates] = await Promise.all([getAll('/hydrants', { sort: 'name' }), getAll('/rates', { sort: 'capacity' })]);
  const sizeItems = rates.map(r => ({ id: r.capacity, name: fmtGallons(r.capacity) }));
  fillSelect(filters.hydrantId, hydrants, { placeholder: 'All hydrants' });
  fillSelect(filters.capacity, sizeItems, { placeholder: 'All sizes' });
  fillSelect(filters.status, meta.tankerStatuses.map(s => ({ id: s, name: s })), { placeholder: 'All statuses' });

  // Quick availability switch without opening the edit dialog.
  async function toggle(t, reload) {
    const status = t.status === 'Available' ? 'Unavailable' : 'Available';
    try {
      await patch(`/tankers/${t.id}/status`, { status });
      toast(`${t.registrationNo} is now ${status}`, 'success');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  setupCrud({
    endpoint: '/tankers',
    noun: 'tanker',
    filterForm: filters,
    output: $('#list'),
    pager: $('#pager'),
    addButton: $('#add-btn'),
    label: t => t.registrationNo,
    columns: [
      { label: 'Registration', render: t => h('strong', {}, t.registrationNo) },
      { label: 'Size', render: t => fmtGallons(t.capacity) },
      { label: 'Hydrant', render: t => t.hydrantName },
      { label: 'Status', render: t => statusBadge(t.status) }
    ],
    rowActions: (t, reload) => [
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => toggle(t, reload) },
        t.status === 'Available' ? 'Mark unavailable' : 'Mark available')
    ],
    buildForm: t => [
      field({ label: 'Registration number', name: 'registrationNo', required: true, value: t?.registrationNo, hint: 'e.g. KHT-1234', attrs: { maxlength: 12, autocapitalize: 'characters' } }),
      field({ label: 'Size', name: 'capacity', type: 'select', required: true, value: t?.capacity, options: rates.map(r => ({ value: r.capacity, label: fmtGallons(r.capacity) })) }),
      field({ label: 'Hydrant', name: 'hydrantId', type: 'select', required: true, value: t?.hydrantId, options: hydrants.map(x => ({ value: x.id, label: x.name })) }),
      field({ label: 'Status', name: 'status', type: 'select', required: true, value: t?.status || 'Available', options: meta.tankerStatuses.map(s => ({ value: s, label: s })) })
    ],
    // Upper-case the registration number while typing.
    afterBuild(container) {
      const reg = container.querySelector('[name=registrationNo]');
      reg.addEventListener('input', () => { reg.value = reg.value.toUpperCase(); });
    },
    schema: () => ({
      registrationNo: [rules.required('Enter the registration number'), rules.pattern(patterns.regNo, 'Must look like KHT-1234')],
      capacity: [rules.required('Select a size')],
      hydrantId: [rules.required('Select a hydrant')],
      status: [rules.required(), rules.oneOf(meta.tankerStatuses)]
    }),
    toBody: v => ({ ...v, registrationNo: v.registrationNo.toUpperCase(), capacity: Number(v.capacity), hydrantId: Number(v.hydrantId) })
  });
});
