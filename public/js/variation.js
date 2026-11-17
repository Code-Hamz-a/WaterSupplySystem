// ===================================================================
// GROUP VARIATION
// ===================================================================
// The project brief says each group gets a "variation" (an extra rule).
// Put your group's variation here so it is applied in ONE place:
//   - extraBookingRules() runs inside the booking form validation (book.js)
//   - VARIATION.name is shown in the footer so the examiner can see it
//
// Example (if your variation was "max 2 bookings per customer per day"):
//   export function extraBookingRules(values, ctx) {
//     const sameDay = ctx.myBookings.filter(b => b.deliveryDate === values.deliveryDate);
//     return sameDay.length >= 2 ? { deliveryDate: 'Max 2 bookings per day' } : {};
//   }
// In Phase 2 the same rule must also be enforced on the server.

export const VARIATION = {
  name: 'Not assigned yet',
  enabled: false
};

/**
 * Extra validation for the booking form.
 * @param {object} values form values (hydrantId, capacity, type, deliveryDate, slot, ...)
 * @param {object} ctx    { user, meta, availability, usage, myBookings }
 * @returns {object} map of field name -> error message (empty when valid)
 */
export function extraBookingRules(values, ctx) {
  if (!VARIATION.enabled) return {};
  return {};
}
