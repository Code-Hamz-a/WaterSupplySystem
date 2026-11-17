// Admin: commercial and subsidised price for each tanker size.
import { initPage, boot } from '../layout.js';
import { $, field, fmtGallons, fmtMoney } from '../ui.js';
import { rules } from '../validation.js';
import { setupCrud } from '../crud.js';

boot(async () => {
  await initPage(['admin']);

  setupCrud({
    endpoint: '/rates',
    noun: 'rate',
    filterForm: $('#filters'),
    output: $('#list'),
    pager: $('#pager'),
    addButton: $('#add-btn'),
    label: r => `for ${fmtGallons(r.capacity)}`,
    columns: [
      { label: 'Tanker size', render: r => fmtGallons(r.capacity) },
      { label: 'Commercial rate', render: r => fmtMoney(r.commercialRate) },
      { label: 'Subsidised rate', render: r => fmtMoney(r.subsidisedRate) },
      { label: 'Subsidy per tanker', render: r => fmtMoney(r.commercialRate - r.subsidisedRate) }
    ],
    buildForm: r => [
      field({ label: 'Tanker size (gallons)', name: 'capacity', type: 'number', required: true, value: r?.capacity, attrs: { min: 500, step: 500, inputmode: 'numeric' } }),
      field({ label: 'Commercial rate (Rs)', name: 'commercialRate', type: 'number', required: true, value: r?.commercialRate, attrs: { min: 1, inputmode: 'numeric' } }),
      field({ label: 'Subsidised rate (Rs)', name: 'subsidisedRate', type: 'number', required: true, value: r?.subsidisedRate, hint: 'Must be lower than the commercial rate', attrs: { min: 1, inputmode: 'numeric' } })
    ],
    schema: () => ({
      capacity: [rules.required('Enter the size'), rules.integer(), rules.min(500, 'At least 500 gallons')],
      commercialRate: [rules.required('Enter the commercial rate'), rules.min(1, 'Must be more than 0')],
      subsidisedRate: [
        rules.required('Enter the subsidised rate'),
        rules.min(1, 'Must be more than 0'),
        (v, all) => (Number(v) >= Number(all.commercialRate) ? 'Subsidised rate must be lower than the commercial rate' : null)
      ]
    }),
    toBody: v => ({ capacity: Number(v.capacity), commercialRate: Number(v.commercialRate), subsidisedRate: Number(v.subsidisedRate) })
  });
});
