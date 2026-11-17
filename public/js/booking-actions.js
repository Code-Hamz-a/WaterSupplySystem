// Booking workflow buttons. Which buttons appear depends on the user's role and the
// booking's status, using the action table from GET /api/meta (meta.actions).
import { get, post } from './api.js';
import { h, openDialog, field, toast, fmtGallons, fmtDate } from './ui.js';
import { validateForm, rules } from './validation.js';

/** Actions this user may perform on this booking right now. */
export function availableActions(booking, user, meta) {
  return Object.entries(meta.actions)
    .filter(([, a]) => a.roles.includes(user.role) && a.from.includes(booking.status))
    .map(([key, a]) => ({ key, ...a }));
}

/** Returns a list of buttons. onDone(updatedBooking) runs after a successful action. */
export function actionButtons(booking, ctx, onDone, { small = false, exclude = [] } = {}) {
  return availableActions(booking, ctx.user, ctx.meta)
    .filter(a => !exclude.includes(a.key))
    .map(a => h('button', {
      type: 'button',
      class: `btn btn-${a.style}${small ? ' btn-sm' : ''}`,
      onclick: async () => {
        const updated = await runAction(a, booking, ctx);
        if (updated) onDone(updated);
      }
    }, a.key === 'assign' && booking.status === 'Assigned' ? 'Change tanker/driver' : a.label));
}

const summary = b => `#${b.id} · ${fmtGallons(b.capacity)} · ${fmtDate(b.deliveryDate)} · ${b.slotLabel || b.slot}`;

export async function runAction(action, booking, ctx) {
  const send = body => post(`/bookings/${booking.id}/${action.key}`, body).then(r => r.data);
  const title = `${action.label}: booking #${booking.id}`;
  const submitClass = `btn-${action.style}`;
  let result = null;

  if (action.input === 'assign') {
    result = await assignDialog(booking, send);
  } else if (action.input === 'failReason') {
    const schema = {
      reason: [rules.required('Select a reason')],
      details: [rules.when(v => v.reason === 'Other', rules.required('Describe the problem'), rules.minLength(5)), rules.maxLength(200)]
    };
    result = await openDialog({
      title, submitLabel: 'Mark as failed', submitClass,
      body: [
        h('p', { class: 'muted' }, summary(booking)),
        field({ label: 'Reason', name: 'reason', type: 'select', required: true, options: ctx.meta.failReasons.map(r => ({ value: r, label: r })) }),
        field({ label: 'Details', name: 'details', type: 'textarea', hint: 'Required when the reason is "Other"', attrs: { maxlength: 200 } })
      ],
      onSubmit: form => {
        const { valid, values } = validateForm(form, schema);
        return valid ? send(values) : false;
      }
    });
  } else if (action.input === 'reason' || action.input === 'optionalReason') {
    const min = action.key === 'dispute' ? 10 : 5;
    const required = action.input === 'reason';
    const schema = { reason: required ? [rules.required('Please give a reason'), rules.minLength(min), rules.maxLength(300)] : [rules.maxLength(200)] };
    const label = action.key === 'dispute' ? 'What went wrong?' : required ? 'Reason' : 'Reason (optional)';
    result = await openDialog({
      title, submitLabel: action.label, submitClass,
      body: [
        h('p', { class: 'muted' }, summary(booking)),
        field({ label, name: 'reason', type: 'textarea', required, hint: required ? `At least ${min} characters` : null, attrs: { maxlength: 300 } })
      ],
      onSubmit: form => {
        const { valid, values } = validateForm(form, schema);
        return valid ? send(values) : false;
      }
    });
  } else {
    result = await openDialog({
      title, submitLabel: action.label, submitClass,
      body: h('p', {}, `${action.label} for booking ${summary(booking)}?`),
      onSubmit: () => send({})
    });
  }

  if (result) toast(`Booking #${booking.id}: ${ctx.meta.statusLabels[result.status] || result.status}`, 'success');
  return result;
}

/** Operator picks a tanker and driver. Busy or unavailable ones are shown but disabled. */
async function assignDialog(booking, send) {
  let res;
  try {
    res = await get(`/hydrants/${booking.hydrantId}/resources`, {
      date: booking.deliveryDate, slot: booking.slot, capacity: booking.capacity, bookingId: booking.id
    });
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
  const { tankers, drivers } = res.data;
  const tankerOptions = tankers.map(t => ({
    value: t.id,
    label: `${t.registrationNo} (${fmtGallons(t.capacity)})${t.status !== 'Available' ? ' - unavailable' : t.busy ? ' - busy this slot' : ''}`,
    disabled: t.status !== 'Available' || t.busy
  }));
  const driverOptions = drivers.map(d => ({
    value: d.id,
    label: `${d.name}${!d.active ? ' - inactive' : d.busy ? ' - busy this slot' : ''}`,
    disabled: !d.active || d.busy
  }));
  const freeTankers = tankerOptions.filter(o => !o.disabled).length;
  const freeDrivers = driverOptions.filter(o => !o.disabled).length;

  const tankerField = field({ label: `Tanker (${fmtGallons(booking.capacity)})`, name: 'tankerId', type: 'select', required: true, options: tankerOptions, value: booking.tankerId });
  const driverField = field({ label: 'Driver', name: 'driverId', type: 'select', required: true, options: driverOptions, value: booking.driverId });

  const schema = { tankerId: [rules.required('Select a tanker')], driverId: [rules.required('Select a driver')] };
  return openDialog({
    title: `Assign tanker & driver: booking #${booking.id}`,
    submitLabel: 'Assign',
    body: [
      h('p', { class: 'muted' }, summary(booking), h('br'), booking.deliveryAddress),
      !freeTankers ? h('div', { class: 'alert alert-warn' }, `No free ${fmtGallons(booking.capacity)} tanker in this slot.`) : null,
      !freeDrivers ? h('div', { class: 'alert alert-warn' }, 'No free driver in this slot.') : null,
      tankerField,
      driverField
    ],
    onSubmit: form => {
      const { valid, values } = validateForm(form, schema);
      return valid ? send({ tankerId: Number(values.tankerId), driverId: Number(values.driverId) }) : false;
    }
  });
}
