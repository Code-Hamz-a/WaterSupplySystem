import { post, get, isBrowserMock } from '../api.js';
import { saveSession, getUser } from '../session.js';
import { homeFor } from '../layout.js';
import { h, $, queryParams, toast } from '../ui.js';
import { validateForm, liveValidate, showApiError, rules, patterns } from '../validation.js';

const params = queryParams();
const existing = getUser();
if (existing) location.href = homeFor(existing.role);

if (params.expired) {
  $('#notice').append(h('div', { class: 'alert alert-info' }, 'Your session has ended. Please log in again.'));
}

const form = $('#login-form');
const schema = {
  email: [rules.required('Enter your email'), rules.pattern(patterns.email, 'Enter a valid email address')],
  password: [rules.required('Enter your password')]
};
liveValidate(form, schema);

form.addEventListener('submit', async e => {
  e.preventDefault();
  const { valid, values } = validateForm(form, schema);
  if (!valid) return;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const res = await post('/auth/login', values);
    saveSession(res.data);
    const next = params.next && /^[\w-]+\.html/.test(params.next) ? params.next : homeFor(res.data.user.role);
    location.href = next;
  } catch (err) {
    showApiError(form, err);
  } finally {
    btn.disabled = false;
  }
});

// Demo accounts exist only on the mock API. If the endpoint is missing, the card stays hidden.
get('/demo-accounts')
  .then(res => {
    const list = $('#demo-list');
    res.data.forEach(acc => list.append(h('li', {},
      h('button', {
        type: 'button',
        onclick: () => {
          form.email.value = acc.email;
          form.password.value = acc.password;
          form.querySelector('[type=submit]').focus();
        }
      }, h('strong', {}, acc.role), ` · ${acc.name} · ${acc.email}`))));
    // On static hosting the mock API runs in this browser; let the visitor restore the demo data.
    if (isBrowserMock()) {
      $('#demo-card').append(
        h('p', { class: 'small muted mt' }, 'Demo mode: the API runs inside your browser and your changes are saved only on this device.'),
        h('button', {
          type: 'button', class: 'btn btn-sm btn-ghost',
          onclick: async () => { await post('/demo/reset'); toast('Demo data restored', 'success'); }
        }, 'Reset demo data'));
    }
    $('#demo-card').hidden = false;
  })
  .catch(() => {});
