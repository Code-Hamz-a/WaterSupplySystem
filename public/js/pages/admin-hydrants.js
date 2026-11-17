// Admin: manage hydrants (quota, hours, zones served, availability).
import { getAll } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, field, fillSelect, statusBadge, fmtGallons } from '../ui.js';
import { rules, patterns } from '../validation.js';
import { setupCrud } from '../crud.js';

boot(async () => {
  const { meta } = await initPage(['admin']);
  const filters = $('#filters');

  // Dropdown data comes from the API (zones) and meta (statuses).
  const zones = await getAll('/zones', { sort: 'name' });
  const statusOptions = meta.hydrantStatuses.map(s => ({ value: s, label: s }));
  fillSelect(filters.status, meta.hydrantStatuses.map(s => ({ id: s, name: s })), { placeholder: 'All statuses' });
  fillSelect(filters.zoneIds, zones, { placeholder: 'All zones' });

  // Checkbox group for the zones a hydrant serves. data-group makes readForm() return an array.
  function zonesFieldset(selected = []) {
    return h('fieldset', { class: 'field' },
      h('legend', {}, 'Zones served ', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')),
      h('div', { class: 'check-group' }, zones.map(z =>
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', name: 'zoneIds', value: z.id, 'data-group': true, checked: selected.includes(z.id) }),
          z.name))));
  }

  setupCrud({
    endpoint: '/hydrants',
    noun: 'hydrant',
    filterForm: filters,
    output: $('#list'),
    pager: $('#pager'),
    addButton: $('#add-btn'),
    label: x => `"${x.name}"`,
    columns: [
      { label: 'Hydrant', render: x => h('span', {}, h('strong', {}, x.name), h('br'), h('span', { class: 'small muted' }, x.location)) },
      { label: 'Zones', render: x => x.zoneNames.join(', ') },
      { label: 'Hours', render: x => `${x.openTime} - ${x.closeTime}` },
      { label: 'Daily quota', render: x => fmtGallons(x.dailyQuotaGallons) },
      { label: 'Booked today', render: x => fmtGallons(x.reservedToday) },
      { label: 'Tankers', render: x => String(x.tankerCount) },
      { label: 'Status', render: x => h('span', {}, statusBadge(x.status), x.unavailableReason ? h('div', { class: 'small muted' }, x.unavailableReason) : null) }
    ],
    buildForm: x => [
      h('div', { class: 'form-grid cols-2' },
        field({ label: 'Name', name: 'name', required: true, value: x?.name, attrs: { maxlength: 60 } }),
        field({ label: 'Location', name: 'location', required: true, value: x?.location, attrs: { maxlength: 120 } }),
        field({ label: 'Daily quota (gallons)', name: 'dailyQuotaGallons', type: 'number', required: true, value: x?.dailyQuotaGallons, hint: 'At least 6,000', attrs: { min: 6000, step: 1000, inputmode: 'numeric' } }),
        field({ label: 'Status', name: 'status', type: 'select', required: true, options: statusOptions, value: x?.status || 'Available' }),
        field({ label: 'Opens at', name: 'openTime', type: 'time', required: true, value: x?.openTime }),
        field({ label: 'Closes at', name: 'closeTime', type: 'time', required: true, value: x?.closeTime })),
      field({ label: 'Reason unavailable', name: 'unavailableReason', value: x?.unavailableReason, hint: 'Required when status is Unavailable', attrs: { maxlength: 200 } }),
      zonesFieldset(x?.zoneIds || [])
    ],
    // Show the "reason" field only when status is Unavailable (disabled fields are not sent).
    afterBuild(container) {
      const status = container.querySelector('[name=status]');
      const reason = container.querySelector('[name=unavailableReason]');
      const sync = () => {
        const show = status.value === 'Unavailable';
        reason.closest('.field').hidden = !show;
        reason.disabled = !show;
      };
      status.addEventListener('change', sync);
      sync();
    },
    schema: () => ({
      name: [rules.required('Enter a name'), rules.minLength(3)],
      location: [rules.required('Enter the location'), rules.minLength(5)],
      dailyQuotaGallons: [rules.required('Enter the daily quota'), rules.integer(), rules.min(6000, 'Daily quota must be at least 6,000 gallons')],
      status: [rules.required(), rules.oneOf(meta.hydrantStatuses)],
      openTime: [rules.required('Enter opening time'), rules.pattern(patterns.time, 'Use HH:MM')],
      closeTime: [rules.required('Enter closing time'), rules.pattern(patterns.time, 'Use HH:MM'), (v, all) => (v && all.openTime && v <= all.openTime ? 'Closing time must be after opening time' : null)],
      unavailableReason: [rules.when(v => v.status === 'Unavailable', rules.required('Give a reason'), rules.minLength(5))],
      zoneIds: [rules.required('Select at least one zone')]
    }),
    toBody: v => ({ ...v, dailyQuotaGallons: Number(v.dailyQuotaGallons), zoneIds: v.zoneIds.map(Number) })
  });
});
