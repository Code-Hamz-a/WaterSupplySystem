// Customer booking form. Everything in the form (types, hydrants, slots, sizes, prices,
// quota and subsidy limits) comes from the API. Rules are checked here for fast feedback
// and checked again by the server.
import { get, post, getAll } from '../api.js';
import { initPage, boot } from '../layout.js';
import { h, $, clear, fillSelect, fmtMoney, fmtGallons, fmtDate, todayStr, addDays, toast, fill } from '../ui.js';
import { validateForm, liveValidate, showApiError, rules } from '../validation.js';
import { VARIATION, extraBookingRules } from '../variation.js';

boot(async () => {
  const { user, meta } = await initPage(['customer']);
  const form = $('#book-form');
  const today = todayStr();
  const maxDate = addDays(today, meta.maxAdvanceDays);
  const subsidyOk = user.subsidy?.status === 'Approved';
  const state = { availability: null, usage: null };

  $('#zone-line').textContent = `Delivering in zone: ${user.zoneName}`;

  const [hydrants, rates] = await Promise.all([
    getAll('/hydrants', { zoneIds: user.zoneId, sort: 'name' }),
    getAll('/rates', { sort: 'capacity' })
  ]);

  /* ----- booking type ----- */
  const typeInfo = {
    Commercial: 'Full rate. Approved straight away.',
    Subsidised: subsidyOk
      ? `Reduced rate for ${user.subsidy.category}. Needs Zone Officer approval.`
      : 'Only for approved low-income households, hospitals and mosques.'
  };
  fill($('#type-options'), ...meta.bookingTypes.map(t => {
    const disabled = t === 'Subsidised' && !subsidyOk;
    return h('label', { class: 'choice-card' },
      h('input', { type: 'radio', name: 'type', value: t, disabled, checked: t === 'Commercial' }),
      h('span', {}, h('strong', {}, t), h('span', { class: 'small muted' }, typeInfo[t] || ''),
        disabled ? h('a', { class: 'small', href: 'subsidy-apply.html' }, ' Apply for subsidy') : null));
  }));

  /* ----- hydrants, date ----- */
  fillSelect(form.hydrantId, hydrants.map(hy => ({
    ...hy,
    disabled: hy.status !== 'Available',
    label: `${hy.name} · open ${hy.openTime}-${hy.closeTime}${hy.status !== 'Available' ? ' (unavailable)' : ''}`
  })), { label: 'label', placeholder: hydrants.length ? 'Select a hydrant' : 'No hydrant serves your zone' });
  const firstOpen = hydrants.find(hy => hy.status === 'Available');
  if (firstOpen) form.hydrantId.value = firstOpen.id;

  form.deliveryDate.min = today;
  form.deliveryDate.max = maxDate;
  form.deliveryDate.value = today;
  $('#date-hint').textContent = `From today up to ${fmtDate(maxDate)}`;
  form.deliveryAddress.value = user.address || '';

  /* ----- tanker sizes with prices ----- */
  function renderCapacities() {
    const type = form.querySelector('input[name=type]:checked')?.value || 'Commercial';
    const selected = form.querySelector('input[name=capacity]:checked')?.value;
    fill($('#capacity-options'), ...rates.map(r =>
      h('label', { class: 'choice-card' },
        h('input', { type: 'radio', name: 'capacity', value: r.capacity, checked: String(r.capacity) === selected }),
        h('span', {}, h('strong', {}, fmtGallons(r.capacity)),
          h('span', { class: 'small muted' }, fmtMoney(type === 'Subsidised' ? r.subsidisedRate : r.commercialRate))))));
  }

  function renderPrice() {
    const type = form.querySelector('input[name=type]:checked')?.value;
    const cap = form.querySelector('input[name=capacity]:checked')?.value;
    const rate = rates.find(r => String(r.capacity) === cap);
    const box = clear($('#price-box'));
    if (!rate || !type) return box.append(h('p', { class: 'muted' }, 'Choose a tanker size.'));
    const amount = type === 'Subsidised' ? rate.subsidisedRate : rate.commercialRate;
    fill(box,
      h('div', { class: 'stat-value' }, fmtMoney(amount)),
      h('p', { class: 'small muted' }, `${type} rate for ${fmtGallons(rate.capacity)}`),
      type === 'Subsidised' ? h('p', { class: 'small' }, `You save ${fmtMoney(rate.commercialRate - rate.subsidisedRate)}`) : null);
  }

  /* ----- hydrant availability: slots and quota ----- */
  const nowHM = () => new Date().toTimeString().slice(0, 5);

  async function refreshAvailability() {
    const hydrantId = form.hydrantId.value;
    const date = form.deliveryDate.value;
    const box = $('#quota-box');
    if (!hydrantId || !date || date < today || date > maxDate) {
      state.availability = null;
      fillSelect(form.slot, [], { placeholder: 'Pick a hydrant and date first' });
      fill(box, h('p', { class: 'muted' }, 'Pick a hydrant and a valid date.'));
      return;
    }
    const res = await get(`/hydrants/${hydrantId}/availability`, { date });
    const a = (state.availability = res.data);
    const previous = form.slot.value;
    fillSelect(form.slot, a.slots.map(s => {
      const over = date === today && nowHM() >= s.end;
      return { ...s, disabled: !s.open || over, text: s.label + (!s.open ? ' - hydrant closed' : over ? ' - already over' : '') };
    }), { label: 'text', placeholder: 'Select a slot' });
    const keep = a.slots.find(s => s.id === previous);
    if (keep && !form.slot.querySelector(`option[value="${previous}"]`).disabled) form.slot.value = previous;

    const usedPct = Math.min(100, Math.round((a.reservedGallons / a.dailyQuotaGallons) * 100));
    fill(box, 
      a.status !== 'Available' ? h('div', { class: 'alert alert-error' }, `Unavailable: ${a.unavailableReason || 'no reason given'}`) : null,
      h('div', { class: 'stat-value' }, fmtGallons(a.remainingGallons)),
      h('p', { class: 'small muted' }, `left on ${fmtDate(a.date)} at ${a.hydrantName}`),
      h('div', { class: `meter${usedPct >= 100 ? ' full' : usedPct >= 80 ? ' warn' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': usedPct, 'aria-label': 'Quota used' },
        h('span', { style: `width:${usedPct}%` })),
      h('p', { class: 'small muted mt' }, `${fmtGallons(a.reservedGallons)} of ${fmtGallons(a.dailyQuotaGallons)} daily quota already booked`));
  }

  /* ----- subsidy usage for the chosen month ----- */
  async function refreshUsage() {
    const box = clear($('#subsidy-box'));
    if (!subsidyOk) {
      box.append(
        h('p', {}, 'Status: ', h('span', { class: `badge badge-${user.subsidy.status.toLowerCase()}` }, user.subsidy.status)),
        h('p', { class: 'small muted' }, 'Subsidised bookings need approved status.'),
        h('a', { href: 'subsidy-apply.html', class: 'btn btn-sm btn-ghost' }, 'Subsidy application'));
      return;
    }
    const month = (form.deliveryDate.value || today).slice(0, 7);
    const res = await get('/subsidy/usage', { month });
    const u = (state.usage = res.data);
    const pct = u.monthlyLimitGallons ? Math.min(100, Math.round((u.usedGallons / u.monthlyLimitGallons) * 100)) : 100;
    box.append(
      h('div', { class: 'stat-value' }, fmtGallons(u.remainingGallons)),
      h('p', { class: 'small muted' }, `left for ${u.month} (${u.category})`),
      h('div', { class: `meter${pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': 'Subsidy used' },
        h('span', { style: `width:${pct}%` })),
      h('p', { class: 'small muted mt' }, `${fmtGallons(u.usedGallons)} of ${fmtGallons(u.monthlyLimitGallons)} used`));
  }

  /* ----- validation ----- */
  const schema = {
    type: [rules.required('Choose a booking type'), rules.oneOf(meta.bookingTypes)],
    hydrantId: [rules.required('Choose a hydrant')],
    deliveryDate: [
      rules.required('Choose a delivery date'),
      v => (v < today ? 'Delivery date cannot be in the past' : null),
      v => (v > maxDate ? `You can book at most ${meta.maxAdvanceDays} days ahead` : null)
    ],
    slot: [rules.required('Choose a time slot')],
    capacity: [rules.required('Choose a tanker size')],
    deliveryAddress: [rules.required('Enter the delivery address'), rules.minLength(10, 'Address must be at least 10 characters'), rules.maxLength(200)],
    notes: [rules.maxLength(200, 'Notes can be at most 200 characters')]
  };

  // Business rules that need data from the API (quota, slot, subsidy limit, group variation).
  let ctxBookings = [];
  function businessRules(values) {
    const errors = {};
    const a = state.availability;
    const cap = Number(values.capacity);
    if (a) {
      if (a.status !== 'Available') errors.hydrantId = `This hydrant is unavailable: ${a.unavailableReason || 'no reason given'}`;
      const slot = a.slots.find(s => s.id === values.slot);
      if (slot && !slot.open) errors.slot = 'The hydrant is closed during this slot';
      else if (slot && values.deliveryDate === today && nowHM() >= slot.end) errors.slot = 'This slot is already over for today';
      if (cap && cap > a.remainingGallons) errors.capacity = `Only ${fmtGallons(a.remainingGallons)} of quota left at this hydrant on that date`;
    }
    if (values.type === 'Subsidised') {
      if (!subsidyOk) errors.type = 'You do not have approved subsidised status';
      else if (state.usage && cap > state.usage.remainingGallons) {
        errors.capacity = `This exceeds your monthly subsidy limit (${fmtGallons(state.usage.remainingGallons)} left)`;
      }
    }
    const variationErrors = extraBookingRules(values, { user, meta, availability: a, usage: state.usage, myBookings: ctxBookings });
    for (const [k, v] of Object.entries(variationErrors)) if (!errors[k]) errors[k] = v;
    return errors;
  }
  liveValidate(form, schema);

  /* ----- events ----- */
  form.addEventListener('change', async e => {
    const name = e.target.name;
    if (name === 'type') { renderCapacities(); renderPrice(); }
    if (name === 'capacity') renderPrice();
    try {
      if (name === 'hydrantId' || name === 'deliveryDate') await refreshAvailability();
      if (name === 'deliveryDate') await refreshUsage();
    } catch (err) {
      showApiError(form, err);
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      // Refresh quota/limits right before checking, another customer may have booked meanwhile.
      await Promise.all([refreshAvailability(), refreshUsage()]);
      if (VARIATION.enabled && form.deliveryDate.value) {
        ctxBookings = (await get('/bookings', { deliveryDate: form.deliveryDate.value, limit: 100 })).data;
      }
      const { valid, values } = validateForm(form, schema, businessRules);
      if (!valid) return;
      const res = await post('/bookings', { ...values, hydrantId: Number(values.hydrantId), capacity: Number(values.capacity) });
      toast(`Booking #${res.data.id} created`, 'success');
      location.href = `booking.html?id=${res.data.id}&created=1`;
    } catch (err) {
      showApiError(form, err);
    } finally {
      btn.disabled = false;
    }
  });

  renderCapacities();
  renderPrice();
  await Promise.all([refreshAvailability(), refreshUsage()]);
});
