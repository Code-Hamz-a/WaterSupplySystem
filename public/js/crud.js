// Reusable helper for the admin pages (zones, hydrants, tankers, rates, users).
// It wires together:
//   - the list (filter form + search + sort + pagination) using createList()
//   - an "Add" button and "Edit" buttons that open a dialog with a form
//   - client-side validation before POST/PUT (server errors are shown on the fields too)
//   - "Delete" with a confirmation dialog
import { post, put, del } from './api.js';
import { h, clear, renderTable, openDialog, confirmDialog, toast, fill } from './ui.js';
import { validateForm } from './validation.js';
import { createList } from './list.js';

/**
 * @param {object}   o
 * @param {string}   o.endpoint     API path, e.g. '/zones'
 * @param {string}   o.noun         singular name shown in titles, e.g. 'zone'
 * @param {HTMLFormElement} o.filterForm  filter/search form
 * @param {HTMLElement} o.output    where the table goes
 * @param {HTMLElement} o.pager     where pagination goes
 * @param {HTMLElement} [o.addButton] button that opens the "Add" dialog
 * @param {Array}    o.columns      table columns [{ label, render }]
 * @param {Function} o.buildForm    (item|null) => Node[]  form fields for the dialog (item is null when adding)
 * @param {Function} o.schema       (item|null) => validation schema
 * @param {Function} [o.extraRules] (values, item) => { field: message } cross-field rules
 * @param {Function} [o.toBody]     (values, item) => request body (convert strings to numbers etc.)
 * @param {Function} [o.afterBuild] (container, item) => void  e.g. show/hide fields on change
 * @param {Function} [o.rowActions] (item, reload) => Node[]  extra buttons per row
 * @param {Function} [o.label]      item => text used in confirmations
 * @param {boolean}  [o.canDelete=true]
 */
export function setupCrud(o) {
  const {
    endpoint, noun, filterForm, output, pager, addButton, columns, buildForm, schema,
    extraRules = () => ({}), toBody = v => v, afterBuild, rowActions, label = item => `#${item.id}`, canDelete = true
  } = o;

  // Opens the add/edit dialog. item = null means "add".
  async function openEditor(item) {
    const body = h('div', {}, buildForm(item));
    if (afterBuild) afterBuild(body, item);
    const saved = await openDialog({
      title: item ? `Edit ${noun} ${label(item)}` : `Add ${noun}`,
      submitLabel: item ? 'Save changes' : `Add ${noun}`,
      body,
      onSubmit: async form => {
        const { valid, values } = validateForm(form, schema(item), v => extraRules(v, item));
        if (!valid) return false; // keep the dialog open
        const payload = toBody(values, item);
        const res = item ? await put(`${endpoint}/${item.id}`, payload) : await post(endpoint, payload);
        return res.data;
      }
    });
    if (saved) {
      toast(item ? `${capital(noun)} updated` : `${capital(noun)} added`, 'success');
      list.reload();
    }
  }

  async function remove(item) {
    const ok = await confirmDialog(`Delete ${noun} ${label(item)}? This cannot be undone.`, { title: `Delete ${noun}`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await del(`${endpoint}/${item.id}`);
      toast(`${capital(noun)} deleted`, 'success');
      list.reload();
    } catch (err) {
      // e.g. 409 "still used by bookings" from the server
      toast(err.message, 'error');
    }
  }

  const allColumns = [
    ...columns,
    {
      label: 'Actions',
      render: item => h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => openEditor(item) }, 'Edit'),
        rowActions ? rowActions(item, () => list.reload()) : null,
        canDelete ? h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => remove(item) }, 'Delete') : null)
    }
  ];

  if (addButton) addButton.addEventListener('click', () => openEditor(null));

  const list = createList({
    form: filterForm,
    output,
    pager,
    endpoint,
    render: rows => fill(output, renderTable({ columns: allColumns, rows, caption: `${capital(noun)} list`, empty: `No ${noun} records found.` }))
  });

  return { reload: () => list.reload(), openEditor };
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
