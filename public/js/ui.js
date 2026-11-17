// Small DOM helpers used by every page. All text goes in through textContent,
// never innerHTML, so data from the API cannot inject HTML.

/** Create an element: h('a', { href: '#', class: 'btn' }, 'Text', childNode) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected') el[k] = Boolean(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Replaces the content of el with the given children. null/false children are skipped
 *  (native append() would print them as the text "null"). */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  return el;
}

/* ---------- formatting ---------- */

export const fmtMoney = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
export const fmtGallons = n => Number(n || 0).toLocaleString('en-PK') + ' gal';

export function fmtDate(d) {
  if (!d) return '-';
  const date = d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const todayStr = () => new Date().toLocaleDateString('en-CA');
export function addDays(dateString, n) {
  const d = new Date(dateString + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

/* ---------- badges ---------- */

export function statusBadge(status, meta) {
  const label = meta?.statusLabels?.[status] || status;
  return h('span', { class: `badge badge-${String(status).toLowerCase()}` }, label);
}

export const typeBadge = type => h('span', { class: `badge badge-type-${String(type).toLowerCase()}` }, type);

/* ---------- feedback ---------- */

export function toast(message, type = 'info') {
  let box = $('#toasts');
  if (!box) {
    box = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast toast-${type}` }, message);
  box.append(t);
  setTimeout(() => t.classList.add('toast-hide'), 3500);
  setTimeout(() => t.remove(), 4000);
}

export function showLoading(container, text = 'Loading...') {
  fill(container, h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text));
}

export function showError(container, err, retry) {
  fill(container, 
    h('div', { class: 'alert alert-error', role: 'alert' },
      h('strong', {}, 'Something went wrong. '), err.message || String(err),
      retry ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: retry }, 'Try again') : null)
  );
}

export const emptyState = text => h('div', { class: 'empty' }, text);

/* ---------- table (turns into cards on small screens via CSS) ---------- */

/**
 * columns: [{ label, render: row => Node|string, class? }]
 */
export function renderTable({ columns, rows, empty = 'No records found.', caption, onRowClick }) {
  if (!rows.length) return emptyState(empty);
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      caption ? h('caption', { class: 'sr-only' }, caption) : null,
      h('thead', {}, h('tr', {}, columns.map(c => h('th', { scope: 'col', class: c.class }, c.label)))),
      h('tbody', {}, rows.map(row =>
        h('tr', { class: onRowClick ? 'clickable' : null, onclick: onRowClick ? e => { if (!e.target.closest('button,a,select,input')) onRowClick(row); } : null },
          columns.map(c => h('td', { 'data-label': c.label, class: c.class }, c.render(row) ?? '-')))
      ))
    )
  );
}

/* ---------- pagination ---------- */

export function renderPager(container, res, onPage) {
  clear(container);
  if (!res || res.total === 0) return;
  const from = (res.page - 1) * res.limit + 1;
  const to = Math.min(res.page * res.limit, res.total);
  container.append(
    h('nav', { class: 'pager', 'aria-label': 'Pagination' },
      h('span', { class: 'pager-info' }, `${from}-${to} of ${res.total}`),
      h('div', { class: 'pager-buttons' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', disabled: res.page <= 1, onclick: () => onPage(res.page - 1), 'aria-label': 'Previous page' }, '‹ Prev'),
        h('span', { class: 'pager-page' }, `Page ${res.page} / ${res.totalPages}`),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', disabled: res.page >= res.totalPages, onclick: () => onPage(res.page + 1), 'aria-label': 'Next page' }, 'Next ›'))
    )
  );
}

/* ---------- select options ---------- */

export function fillSelect(select, items, { value = 'id', label = 'name', placeholder, selected } = {}) {
  clear(select);
  if (placeholder !== undefined) select.append(h('option', { value: '' }, placeholder));
  for (const item of items) {
    const v = typeof value === 'function' ? value(item) : item[value];
    const l = typeof label === 'function' ? label(item) : item[label];
    select.append(h('option', { value: v, selected: selected !== undefined && String(selected) === String(v), disabled: item.disabled }, l));
  }
}

/* ---------- modal dialog ---------- */

/**
 * Opens a modal with a form. onSubmit(form) may throw; ApiError details are shown on fields.
 * Resolves with onSubmit's return value, or null if cancelled.
 */
export function openDialog({ title, body, submitLabel = 'Save', submitClass = 'btn-primary', onSubmit, cancelLabel = 'Cancel' }) {
  return new Promise(resolve => {
    const alertBox = h('div', { class: 'form-alert', role: 'alert', hidden: true });
    const submitBtn = h('button', { type: 'submit', class: `btn ${submitClass}` }, submitLabel);
    const form = h('form', { class: 'dialog-form', novalidate: true },
      h('header', { class: 'dialog-head' },
        h('h2', { id: 'dialog-title' }, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close(null) }, '×')),
      alertBox,
      h('div', { class: 'dialog-body' }, body),
      h('footer', { class: 'dialog-foot' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => close(null) }, cancelLabel),
        submitBtn));
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dialog-title' }, form);
    document.body.append(dlg);

    function close(result) {
      dlg.close();
      dlg.remove();
      resolve(result);
    }
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      alertBox.hidden = true;
      submitBtn.disabled = true;
      try {
        const result = onSubmit ? await onSubmit(form) : true;
        if (result !== false) close(result ?? true);
      } catch (err) {
        alertBox.textContent = err.message;
        alertBox.hidden = false;
        if (err.details) {
          const { showErrors } = await import('./validation.js');
          showErrors(form, err.details, { summary: false });
        }
      } finally {
        submitBtn.disabled = false;
      }
    });
    dlg.showModal();
    const first = form.querySelector('.dialog-body input, .dialog-body select, .dialog-body textarea');
    (first || submitBtn).focus();
  });
}

export function confirmDialog(message, { title = 'Please confirm', confirmLabel = 'Yes, continue', danger = false } = {}) {
  return openDialog({ title, body: h('p', {}, message), submitLabel: confirmLabel, submitClass: danger ? 'btn-danger' : 'btn-primary' });
}

/** Builds a labelled form field. */
export function field({ label, name, type = 'text', hint, required, options, value, attrs = {} }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  let control;
  if (type === 'select') {
    control = h('select', { id, name, required, ...attrs });
    fillSelect(control, options || [], { value: 'value', label: 'label', placeholder: attrs.placeholder ?? 'Select...', selected: value });
  } else if (type === 'textarea') {
    control = h('textarea', { id, name, rows: 3, required, ...attrs });
    if (value) control.value = value;
  } else {
    control = h('input', { id, name, type, required, value, ...attrs });
  }
  if (hint) control.setAttribute('aria-describedby', `${id}-hint`);
  return h('div', { class: 'field' },
    h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    hint ? h('small', { id: `${id}-hint`, class: 'hint' }, hint) : null);
}

/** Reads ?a=1&b=2 into an object. */
export const queryParams = () => Object.fromEntries(new URLSearchParams(location.search));
