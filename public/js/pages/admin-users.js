// Admin: manage user accounts of every role.
// Which fields the form shows depends on the role:
//   customer -> zone + address      officer  -> zone
//   operator -> hydrant             driver   -> hydrant + licence number
import { getAll, patch } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, field, fillSelect, toast } from '../ui.js';
import { rules, patterns, maskCnic, maskPhone } from '../validation.js';
import { setupCrud } from '../crud.js';

// Role-specific fields: field name -> roles that use it
const ROLE_FIELDS = {
  zoneId: ['customer', 'officer'],
  hydrantId: ['operator', 'driver'],
  address: ['customer'],
  licenseNo: ['driver']
};

boot(async () => {
  const { user: me, meta } = await initPage(['admin']);
  const filters = $('#filters');

  const [zones, hydrants] = await Promise.all([getAll('/zones', { sort: 'name' }), getAll('/hydrants', { sort: 'name' })]);
  fillSelect(filters.role, meta.roles.map(r => ({ id: r, name: meta.roleLabels[r] })), { placeholder: 'All roles' });

  async function setActive(u, reload) {
    try {
      await patch(`/users/${u.id}/status`, { active: !u.active });
      toast(`${u.name} ${u.active ? 'deactivated' : 'activated'}`, 'success');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // On edit the role is fixed, on add it comes from the form.
  const roleOf = (values, item) => (item ? item.role : values.role);
  const usesField = (name, values, item) => ROLE_FIELDS[name].includes(roleOf(values, item));

  setupCrud({
    endpoint: '/users',
    noun: 'user',
    filterForm: filters,
    output: $('#list'),
    pager: $('#pager'),
    addButton: $('#add-btn'),
    label: u => u.name,
    columns: [
      { label: 'Name', render: u => h('span', {}, h('strong', {}, u.name), h('br'), h('span', { class: 'small muted' }, u.email)) },
      { label: 'Role', render: u => h('span', {}, meta.roleLabels[u.role], (u.zoneName || u.hydrantName) ? h('div', { class: 'small muted' }, u.zoneName || u.hydrantName) : null) },
      { label: 'Phone', render: u => u.phone },
      { label: 'CNIC', render: u => u.cnic },
      { label: 'Subsidy', render: u => (u.role === 'customer' ? h('span', { class: `badge badge-${u.subsidy.status.toLowerCase()}` }, u.subsidy.status) : '-') },
      { label: 'Account', render: u => h('span', { class: `badge badge-${u.active ? 'active' : 'inactive'}` }, u.active ? 'Active' : 'Deactivated') }
    ],
    rowActions: (u, reload) => (u.id === me.id ? [] : [
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => setActive(u, reload) }, u.active ? 'Deactivate' : 'Activate')
    ]),
    buildForm: u => [
      field({
        label: 'Role', name: 'role', type: 'select', required: true, value: u?.role,
        options: meta.roles.map(r => ({ value: r, label: meta.roleLabels[r] })),
        hint: u ? 'The role cannot be changed after the account is created' : null,
        attrs: u ? { disabled: true } : {}
      }),
      h('div', { class: 'form-grid cols-2' },
        field({ label: 'Full name', name: 'name', required: true, value: u?.name, attrs: { maxlength: 60 } }),
        field({ label: 'Email', name: 'email', type: 'email', required: true, value: u?.email }),
        field({ label: 'Mobile', name: 'phone', type: 'tel', required: true, value: u?.phone, attrs: { placeholder: '0300-1234567', inputmode: 'numeric' } }),
        field({ label: 'CNIC', name: 'cnic', required: true, value: u?.cnic, attrs: { placeholder: '42101-1234567-1', inputmode: 'numeric' } }),
        field({ label: 'Zone', name: 'zoneId', type: 'select', required: true, value: u?.zoneId, options: zones.map(z => ({ value: z.id, label: z.name })) }),
        field({ label: 'Hydrant', name: 'hydrantId', type: 'select', required: true, value: u?.hydrantId, options: hydrants.map(x => ({ value: x.id, label: x.name })) }),
        field({ label: 'Driving licence no.', name: 'licenseNo', required: true, value: u?.licenseNo, hint: 'e.g. LTV-12345', attrs: { maxlength: 12 } }),
        field({ label: u ? 'New password' : 'Password', name: 'password', type: 'password', required: !u, hint: u ? 'Leave empty to keep the current password' : '8+ characters with letters and numbers', attrs: { autocomplete: 'new-password' } })),
      field({ label: 'Address', name: 'address', required: true, value: u?.address, attrs: { maxlength: 200 } })
    ],
    afterBuild(container, u) {
      maskCnic(container.querySelector('[name=cnic]'));
      maskPhone(container.querySelector('[name=phone]'));
      const licence = container.querySelector('[name=licenseNo]');
      licence.addEventListener('input', () => { licence.value = licence.value.toUpperCase(); });
      const roleSelect = container.querySelector('[name=role]');
      // Show only the fields used by the selected role. Hidden fields are disabled so they are not sent.
      const sync = () => {
        const role = u ? u.role : roleSelect.value;
        for (const [name, roles] of Object.entries(ROLE_FIELDS)) {
          const input = container.querySelector(`[name=${name}]`);
          const show = roles.includes(role);
          input.closest('.field').hidden = !show;
          input.disabled = !show;
        }
      };
      roleSelect.addEventListener('change', sync);
      sync();
    },
    schema: u => ({
      role: u ? [] : [rules.required('Select a role'), rules.oneOf(meta.roles)],
      name: [rules.required('Enter the name'), rules.pattern(patterns.name, 'Use 3-60 letters')],
      email: [rules.required('Enter the email'), rules.pattern(patterns.email, 'Enter a valid email address')],
      phone: [rules.required('Enter the mobile number'), rules.pattern(patterns.phone, 'Must look like 0300-1234567')],
      cnic: [rules.required('Enter the CNIC'), rules.pattern(patterns.cnic, 'Must look like 42101-1234567-1')],
      zoneId: [rules.when((v) => usesField('zoneId', v, u), rules.required('Select a zone'))],
      hydrantId: [rules.when((v) => usesField('hydrantId', v, u), rules.required('Select a hydrant'))],
      address: [rules.when((v) => usesField('address', v, u), rules.required('Enter the address'), rules.minLength(10), rules.maxLength(200))],
      licenseNo: [rules.when((v) => usesField('licenseNo', v, u), rules.required('Enter the licence number'), rules.pattern(patterns.license, 'Must look like LTV-12345'))],
      // Required when adding; optional when editing (empty = keep old password).
      password: u
        ? [rules.pattern(patterns.password, '8+ characters with letters and numbers')]
        : [rules.required('Enter a password'), rules.pattern(patterns.password, '8+ characters with letters and numbers')]
    }),
    toBody: (v, u) => {
      const body = { ...v };
      if (u) body.role = u.role;
      if (body.zoneId) body.zoneId = Number(body.zoneId);
      if (body.hydrantId) body.hydrantId = Number(body.hydrantId);
      if (body.licenseNo) body.licenseNo = body.licenseNo.toUpperCase();
      if (!body.password) delete body.password;
      return body;
    }
  });
});
