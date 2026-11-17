// Form validation used by every form.
// A "schema" maps a field name to a list of rules. A rule is a function
// (value, allValues) => error message or null.
// The same patterns are enforced by the server (mock API now, real API in Phase 2).

export const patterns = {
  cnic: /^\d{5}-\d{7}-\d$/,
  phone: /^03\d{2}-?\d{7}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  name: /^[A-Za-z][A-Za-z .'-]{2,59}$/,
  password: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
  regNo: /^[A-Z]{2,4}-\d{3,5}$/,
  license: /^[A-Z]{2,4}-\d{4,6}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  proofRef: /^[A-Za-z0-9-/]{4,30}$/
};

const isEmpty = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export const rules = {
  required: (msg = 'This field is required') => v => (isEmpty(v) ? msg : null),
  pattern: (re, msg) => v => (!isEmpty(v) && !re.test(String(v).trim()) ? msg : null),
  minLength: (n, msg) => v => (!isEmpty(v) && String(v).trim().length < n ? msg || `Must be at least ${n} characters` : null),
  maxLength: (n, msg) => v => (!isEmpty(v) && String(v).trim().length > n ? msg || `Must be at most ${n} characters` : null),
  integer: (msg = 'Enter a whole number') => v => (!isEmpty(v) && !Number.isInteger(Number(v)) ? msg : null),
  min: (n, msg) => v => (!isEmpty(v) && Number(v) < n ? msg || `Must be at least ${n}` : null),
  max: (n, msg) => v => (!isEmpty(v) && Number(v) > n ? msg || `Must be at most ${n}` : null),
  matches: (otherField, msg) => (v, all) => (v !== all[otherField] ? msg : null),
  oneOf: (list, msg = 'Select a valid option') => v => (!isEmpty(v) && !list.map(String).includes(String(v)) ? msg : null),
  // Only check this field's rules when a condition on the other values is true.
  when: (cond, ...inner) => (v, all) => {
    if (!cond(all)) return null;
    for (const r of inner) {
      const m = r(v, all);
      if (m) return m;
    }
    return null;
  }
};

/** Reads all named controls of a form. Checkbox groups and multi-selects become arrays. */
export function readForm(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      const group = form.querySelectorAll(`input[type=checkbox][name="${el.name}"]`);
      if (group.length > 1 || el.dataset.group !== undefined) {
        values[el.name] = values[el.name] || [];
        if (el.checked) values[el.name].push(el.value);
      } else {
        values[el.name] = el.checked;
      }
    } else if (el.type === 'radio') {
      if (el.checked) values[el.name] = el.value;
      else if (!(el.name in values)) values[el.name] = '';
    } else if (el.tagName === 'SELECT' && el.multiple) {
      values[el.name] = [...el.selectedOptions].map(o => o.value);
    } else {
      values[el.name] = el.value.trim();
    }
  }
  return values;
}

function fieldContainer(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return null;
  return el.closest('.field') || el.parentElement;
}

export function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach(e => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
  const alert = form.querySelector(':scope > .form-alert');
  if (alert) alert.hidden = true;
}

function clearFieldError(form, name) {
  const box = fieldContainer(form, name);
  if (!box) return;
  box.querySelector('.field-error')?.remove();
  form.querySelectorAll(`[name="${name}"]`).forEach(el => el.removeAttribute('aria-invalid'));
}

/** Shows error messages under each field. errors = { fieldName: 'message' } */
export function showErrors(form, errors, { summary = true, focus = true } = {}) {
  let firstEl = null;
  for (const [name, msg] of Object.entries(errors)) {
    const box = fieldContainer(form, name);
    if (!box) continue;
    clearFieldError(form, name);
    const id = `${form.id || 'form'}-${name}-error`;
    box.append(Object.assign(document.createElement('small'), { className: 'field-error', id, textContent: msg }));
    form.querySelectorAll(`[name="${name}"]`).forEach(el => {
      el.setAttribute('aria-invalid', 'true');
      const described = (el.getAttribute('aria-describedby') || '').split(' ').filter(x => x && !x.endsWith('-error'));
      el.setAttribute('aria-describedby', [...described, id].join(' '));
      firstEl = firstEl || el;
    });
  }
  const alert = form.querySelector(':scope > .form-alert');
  if (summary && alert && Object.keys(errors).length) {
    alert.textContent = `Please fix ${Object.keys(errors).length} field(s) below.`;
    alert.hidden = false;
  }
  if (focus && firstEl) firstEl.focus();
}

function runRules(list, value, values) {
  for (const rule of list) {
    const msg = rule(value, values);
    if (msg) return msg;
  }
  return null;
}

/** Validates the whole form. Returns { valid, values, errors }. */
export function validateForm(form, schema, extra = () => ({})) {
  clearErrors(form);
  const values = readForm(form);
  const errors = {};
  for (const [name, list] of Object.entries(schema)) {
    const msg = runRules(list, values[name], values);
    if (msg) errors[name] = msg;
  }
  for (const [name, msg] of Object.entries(extra(values) || {})) {
    if (!errors[name]) errors[name] = msg;
  }
  showErrors(form, errors);
  return { valid: Object.keys(errors).length === 0, values, errors };
}

/**
 * Validates one field while the user works on the form, so mistakes show early:
 *  - change / blur: show or clear that field's error
 *  - typing: only clears the error once the value becomes valid
 * Errors are cleared as soon as a field is fixed (not on blur), so the page does not
 * jump when the user then clicks the submit button.
 */
export function liveValidate(form, schema) {
  const check = (name, showNew) => {
    if (!name || !schema[name]) return;
    const values = readForm(form);
    const msg = runRules(schema[name], values[name], values);
    const box = fieldContainer(form, name);
    const shown = box?.querySelector('.field-error');
    if (!msg) { if (shown) clearFieldError(form, name); return; }
    if (showNew && (!shown || shown.textContent !== msg)) showErrors(form, { [name]: msg }, { summary: false, focus: false });
  };
  form.addEventListener('change', e => check(e.target.name, true));
  form.addEventListener('input', e => check(e.target.name, false));
  form.addEventListener('focusout', e => check(e.target.name, true));
}

/** Shows an API error on a form: field errors from err.details plus a message at the top. */
export function showApiError(form, err) {
  if (err.details) showErrors(form, err.details, { summary: false });
  const alert = form.querySelector(':scope > .form-alert');
  if (alert) {
    alert.textContent = err.message;
    alert.hidden = false;
    alert.scrollIntoView({ block: 'nearest' });
  }
}

/** Auto-inserts dashes while typing a CNIC (42101-1234567-1). */
export function maskCnic(input) {
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 13);
    input.value = d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  });
}

/** Auto-inserts the dash in a mobile number (0300-1234567). */
export function maskPhone(input) {
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 11);
    input.value = d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
  });
}
