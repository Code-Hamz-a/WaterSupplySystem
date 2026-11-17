// Customer applies for subsidised status and follows their applications.
import { get, post } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, $$, clear, fillSelect, renderTable, toast, fmtDateTime, fmtGallons, fmtMoney, fill } from '../ui.js';
import { validateForm, liveValidate, showApiError, rules, patterns } from '../validation.js';
import { createList } from '../list.js';

boot(async () => {
  const { user, meta } = await initPage(['customer']);
  const form = $('#apply-form');
  const s = user.subsidy;

  /* ----- current status ----- */
  const statusBox = $('#status-box');
  statusBox.append(h('p', {}, h('span', { class: `badge badge-${s.status.toLowerCase()}` }, s.status)));
  if (s.status === 'Approved') {
    const usage = (await get('/subsidy/usage')).data;
    statusBox.append(
      h('dl', { class: 'details' },
        h('div', {}, h('dt', {}, 'Category'), h('dd', {}, s.category)),
        h('div', {}, h('dt', {}, 'Monthly limit'), h('dd', {}, fmtGallons(s.monthlyLimitGallons))),
        h('div', {}, h('dt', {}, `Used in ${usage.month}`), h('dd', {}, fmtGallons(usage.usedGallons))),
        h('div', {}, h('dt', {}, 'Left'), h('dd', {}, fmtGallons(usage.remainingGallons)))),
      h('a', { class: 'btn btn-primary btn-block mt', href: 'book.html' }, 'Book a subsidised tanker'));
  } else if (s.status === 'Pending') {
    statusBox.append(h('p', { class: 'small muted' }, 'Your application is waiting for the Zone Officer. You will be able to book subsidised tankers once it is approved.'));
  } else {
    statusBox.append(h('p', { class: 'small muted' }, s.status === 'Rejected' ? 'Your last application was rejected. You can apply again with correct proof.' : 'You have not applied yet.'));
  }

  /* ----- application form (only when no pending/approved status) ----- */
  if (s.status !== 'Pending' && s.status !== 'Approved') {
    $('#form-card').hidden = false;
    fill($('#category-options'), ...meta.subsidyCategories.map((c, i) =>
      h('label', { class: 'choice-card' },
        h('input', { type: 'radio', name: 'category', value: c.id, checked: i === 0 }),
        h('span', {}, h('strong', {}, c.label), h('span', { class: 'small muted' }, `Usual limit ${fmtGallons(c.defaultLimitGallons)} / month`)))));
    fillSelect(form.proofType, meta.proofTypes.map(p => ({ id: p, name: p })), { placeholder: 'Select a document' });
    $('#income-hint').textContent = `Must not be more than ${fmtMoney(meta.householdIncomeCeiling)}`;

    // Show only the fields for the chosen category. Hidden fields are disabled so they are not sent.
    const toggle = () => {
      const cat = form.querySelector('input[name=category]:checked')?.value;
      $$('[data-for]', form).forEach(el => {
        const show = el.dataset.for.split(' ').includes(cat);
        el.hidden = !show;
        el.querySelectorAll('input').forEach(i => { i.disabled = !show; });
      });
    };
    form.addEventListener('change', e => { if (e.target.name === 'category') toggle(); });
    toggle();

    const isHousehold = v => v.category === 'Household';
    const schema = {
      category: [rules.required('Choose a category')],
      proofType: [rules.required('Choose the proof document')],
      proofReference: [rules.required('Enter the document number'), rules.pattern(patterns.proofRef, '4-30 letters, numbers, dashes or slashes')],
      monthlyIncome: [rules.when(isHousehold,
        rules.required('Enter monthly income'), rules.integer(), rules.min(0, 'Income cannot be negative'),
        rules.max(meta.householdIncomeCeiling, `Income must not be more than ${fmtMoney(meta.householdIncomeCeiling)} to qualify`))],
      householdSize: [rules.when(isHousehold, rules.required('Enter household size'), rules.integer(), rules.min(1), rules.max(30))],
      institutionName: [rules.when(v => !isHousehold(v), rules.required('Enter the institution name'), rules.minLength(3), rules.maxLength(80))],
      details: [rules.maxLength(300)]
    };
    liveValidate(form, schema);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const { valid, values } = validateForm(form, schema);
      if (!valid) return;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await post('/subsidy-applications', values);
        toast('Application submitted', 'success');
        location.reload();
      } catch (err) {
        showApiError(form, err);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ----- history ----- */
  const columns = [
    { label: 'No.', render: a => `#${a.id}` },
    { label: 'Submitted', render: a => fmtDateTime(a.createdAt) },
    { label: 'Category', render: a => a.category },
    { label: 'Proof', render: a => `${a.proofType} · ${a.proofReference}` },
    { label: 'Status', render: a => h('span', { class: `badge badge-${a.status.toLowerCase()}` }, a.status) },
    { label: 'Officer remarks', render: a => (a.remarks ? `${a.remarks} (${a.reviewerName})` : '-') },
    { label: 'Limit', render: a => (a.monthlyLimitGallons ? fmtGallons(a.monthlyLimitGallons) : '-') }
  ];
  createList({
    output: $('#list'), pager: $('#pager'), endpoint: '/subsidy-applications', syncUrl: false,
    render: rows => fill($('#list'), renderTable({ columns, rows, caption: 'My applications', empty: 'No applications yet.' }))
  });
});
