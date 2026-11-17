import { post, getAll } from '../api.js';
import { saveSession } from '../session.js';
import { $, fillSelect } from '../ui.js';
import { validateForm, liveValidate, showApiError, rules, patterns, maskCnic, maskPhone } from '../validation.js';

const form = $('#register-form');
maskCnic(form.cnic);
maskPhone(form.phone);

const schema = {
  name: [rules.required('Enter your full name'), rules.pattern(patterns.name, 'Use 3-60 letters (spaces, dot and dash allowed)')],
  cnic: [rules.required('Enter your CNIC'), rules.pattern(patterns.cnic, 'CNIC must look like 42101-1234567-1')],
  phone: [rules.required('Enter your mobile number'), rules.pattern(patterns.phone, 'Mobile must look like 0300-1234567')],
  email: [rules.required('Enter your email'), rules.pattern(patterns.email, 'Enter a valid email address')],
  zoneId: [rules.required('Select your zone')],
  address: [rules.required('Enter your address'), rules.minLength(10, 'Address must be at least 10 characters'), rules.maxLength(200)],
  password: [rules.required('Choose a password'), rules.pattern(patterns.password, 'At least 8 characters with letters and numbers')],
  confirmPassword: [rules.required('Repeat the password'), rules.matches('password', 'Passwords do not match')]
};
liveValidate(form, schema);

getAll('/zones', { sort: 'name' })
  .then(zones => fillSelect(form.zoneId, zones, { placeholder: 'Select your zone' }))
  .catch(err => showApiError(form, err));

form.addEventListener('submit', async e => {
  e.preventDefault();
  const { valid, values } = validateForm(form, schema);
  if (!valid) return;
  const { confirmPassword, ...body } = values;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const res = await post('/auth/register', { ...body, zoneId: Number(body.zoneId) });
    saveSession(res.data);
    location.href = 'dashboard.html?welcome=1';
  } catch (err) {
    showApiError(form, err);
  } finally {
    btn.disabled = false;
  }
});
