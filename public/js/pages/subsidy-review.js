// Zone Officer verifies subsidy applications for their zone (admin sees all zones).
import { post } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, fillSelect, renderTable, openDialog, field, toast, fmtDateTime, fmtGallons, fmtMoney, fill } from '../ui.js';
import { validateForm, rules } from '../validation.js';
import { createList } from '../list.js';

boot(async () => {
  const { user, meta } = await initPage(['officer', 'admin']);
  const form = $('#filters');
  if (user.role === 'officer') $('#page-sub').textContent = `Applications from ${user.zoneName}. Check the proof and approve or reject.`;
  fillSelect(form.status, meta.applicationStatuses.map(s => ({ id: s, name: s })), { placeholder: 'All statuses' });
  fillSelect(form.category, meta.subsidyCategories, { label: 'label', placeholder: 'All categories' });

  const summary = a => h('div', { class: 'small muted' },
    `${a.customerName} · CNIC ${a.customerCnic} · ${a.category} · ${a.proofType} ${a.proofReference}`);

  async function approve(a) {
    const cat = meta.subsidyCategories.find(c => c.id === a.category);
    const schema = {
      monthlyLimitGallons: [rules.required('Enter the monthly limit'), rules.integer(), rules.min(1000, 'At least 1,000 gallons'), rules.max(200000, 'At most 200,000 gallons')],
      remarks: [rules.maxLength(200)]
    };
    const done = await openDialog({
      title: `Approve application #${a.id}`, submitLabel: 'Approve', submitClass: 'btn-success',
      body: [
        summary(a),
        field({ label: 'Monthly limit (gallons)', name: 'monthlyLimitGallons', type: 'number', required: true, value: cat ? cat.defaultLimitGallons : 12000,
          hint: 'Subsidised water this customer may book per month', attrs: { min: 1000, max: 200000, step: 1000 } }),
        field({ label: 'Remarks', name: 'remarks', type: 'textarea', attrs: { maxlength: 200, placeholder: 'e.g. BISP card verified' } })
      ],
      onSubmit: async f => {
        const { valid, values } = validateForm(f, schema);
        if (!valid) return false;
        return (await post(`/subsidy-applications/${a.id}/approve`, { ...values, monthlyLimitGallons: Number(values.monthlyLimitGallons) })).data;
      }
    });
    if (done) { toast(`Application #${a.id} approved`, 'success'); list.reload(); }
  }

  async function reject(a) {
    const schema = { remarks: [rules.required('Give a reason'), rules.minLength(5), rules.maxLength(200)] };
    const done = await openDialog({
      title: `Reject application #${a.id}`, submitLabel: 'Reject', submitClass: 'btn-danger',
      body: [summary(a), field({ label: 'Reason', name: 'remarks', type: 'textarea', required: true, attrs: { maxlength: 200 } })],
      onSubmit: async f => {
        const { valid, values } = validateForm(f, schema);
        if (!valid) return false;
        return (await post(`/subsidy-applications/${a.id}/reject`, values)).data;
      }
    });
    if (done) { toast(`Application #${a.id} rejected`, 'success'); list.reload(); }
  }

  const columns = [
    { label: 'No.', render: a => `#${a.id}` },
    { label: 'Applicant', render: a => h('span', {}, a.customerName, h('br'), h('span', { class: 'small muted' }, `${a.customerCnic} · ${a.customerPhone}`)) },
    user.role === 'admin' ? { label: 'Zone', render: a => a.zoneName } : null,
    { label: 'Category', render: a => a.category + (a.institutionName ? ` · ${a.institutionName}` : '') },
    { label: 'Proof', render: a => `${a.proofType} · ${a.proofReference}` },
    { label: 'Income / size', render: a => (a.category === 'Household' ? `${fmtMoney(a.monthlyIncome)} · ${a.householdSize} people` : '-') },
    { label: 'Details', render: a => a.details || '-' },
    { label: 'Submitted', render: a => fmtDateTime(a.createdAt) },
    { label: 'Status', render: a => h('span', {},
      h('span', { class: `badge badge-${a.status.toLowerCase()}` }, a.status),
      a.monthlyLimitGallons ? h('div', { class: 'small muted' }, `${fmtGallons(a.monthlyLimitGallons)}/month`) : null,
      a.remarks ? h('div', { class: 'small muted' }, `${a.remarks} (${a.reviewerName})`) : null) },
    { label: 'Actions', render: a => (a.status === 'Pending'
      ? h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-sm btn-success', onclick: () => approve(a) }, 'Approve'),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => reject(a) }, 'Reject'))
      : '-') }
  ].filter(Boolean);

  const list = createList({
    form, output: $('#list'), pager: $('#pager'), endpoint: '/subsidy-applications',
    render: rows => fill($('#list'), renderTable({ columns, rows, caption: 'Subsidy applications', empty: 'No applications match these filters.' }))
  });
});
