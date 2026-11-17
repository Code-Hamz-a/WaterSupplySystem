// Admin: manage zones.
import { initPage, boot } from '../layout.js';
import { $, field } from '../ui.js';
import { rules } from '../validation.js';
import { setupCrud } from '../crud.js';

boot(async () => {
  await initPage(['admin']);

  setupCrud({
    endpoint: '/zones',
    noun: 'zone',
    filterForm: $('#filters'),
    output: $('#list'),
    pager: $('#pager'),
    addButton: $('#add-btn'),
    label: z => `"${z.name}"`,
    columns: [
      { label: 'ID', render: z => `#${z.id}` },
      { label: 'Name', render: z => z.name },
      { label: 'Description', render: z => z.description || '-' },
      { label: 'Served by', render: z => (z.hydrantNames.length ? z.hydrantNames.join(', ') : 'No hydrant yet') }
    ],
    buildForm: z => [
      field({ label: 'Zone name', name: 'name', required: true, value: z?.name, attrs: { maxlength: 50 } }),
      field({ label: 'Description', name: 'description', type: 'textarea', value: z?.description, attrs: { maxlength: 200 } })
    ],
    schema: () => ({
      name: [rules.required('Enter a zone name'), rules.minLength(3), rules.maxLength(50)],
      description: [rules.maxLength(200)]
    })
  });
});
