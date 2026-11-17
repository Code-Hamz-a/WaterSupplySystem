# PaaniLink – Assumptions

The project brief leaves many details open. This file records how we decided each one.
Every rule below is checked in the frontend now (Phase 1) and returned/enforced by the mock API.
The values (slots, limits, reasons, ...) come from `GET /api/meta` (`mock-api/meta.js`), so they can be changed in one place.

## A. Booking and scheduling

1. **Time slots.** A day is split into four delivery slots: Morning 08:00-12:00, Afternoon 12:00-16:00, Evening 16:00-20:00, Night 20:00-23:59. A customer books a slot, not an exact time.
2. **"Never promised twice" for tankers and drivers** means: one tanker and one driver can have **at most one live booking per date + slot**. A booking is "live" unless it is Cancelled or Rejected. Different slots on the same day are allowed (a tanker can do several trips a day).
3. **"Never promised twice" for hydrant water** means: the sum of tanker capacities booked at a hydrant on a date may not exceed its **daily quota**. Every booking counts except Cancelled and Rejected — so a subsidised booking that is still `PendingApproval` already **reserves** quota, and a `Failed` trip still counts (the water was already filled).
4. A hydrant offers a slot only if the whole slot fits inside its operating hours (e.g. Crown Hydrant 08:00-16:00 offers Morning and Afternoon only).
5. Bookings can be made for **today up to 7 days ahead**. For today, a slot that has already ended cannot be booked; a slot in progress can.
6. The customer chooses the hydrant, but only from hydrants that **serve the customer's zone**. Unavailable hydrants are shown but cannot be chosen.
7. The delivery address defaults to the registered address and may be edited, but it is assumed to be in the customer's registered zone (the booking's zone is always the customer's zone).
8. Tanker sizes that can be booked are exactly the capacities in the rate list (1,000 / 3,000 / 6,000 gallons in the seed). The tanker assigned must be the **same size** as the booking.
9. The price is fixed when the booking is made (commercial or subsidised rate of that size). Later rate changes do not change old bookings.

## B. Booking types and approval

10. **Commercial** bookings are approved automatically when created (history shows "System") and go straight to the operator.
11. **Subsidised** bookings start as `PendingApproval` and must be approved by the Zone Officer of the customer's zone. The officer can also reject with a reason.
12. On approval the server checks the monthly limit **again** (another subsidised booking may have been approved meanwhile).

## C. Subsidy

13. Subsidised status is per customer account. Categories: **Low-income household**, **Hospital**, **Mosque**.
14. The **monthly limit is measured in gallons** (not number of tankers), so a household cannot get around it by booking bigger tankers. Default limits: household 12,000, hospital 60,000, mosque 36,000 gallons; the officer sets the actual limit when approving.
15. Usage counts subsidised bookings whose **delivery date** is in that calendar month, excluding Cancelled, Rejected and **Failed** (the household did not receive the water).
16. A household must declare monthly income **≤ Rs 50,000** and household size (1-30). Hospitals and mosques give the institution name instead.
17. "Uploading proof details" is captured as **proof type + reference number** (e.g. BISP card number, registration certificate number) plus optional details. No file upload in Phase 1; the officer verifies the reference outside the system.
18. To stop misuse, **CNIC, phone and email are unique**, so one person/household cannot hold two subsidised accounts. Only one application can be pending at a time, and an already approved customer cannot apply again.
19. A rejected customer may apply again with new proof.
20. Only the Zone Officer of the applicant's zone (or the admin) can review an application.

## D. Dispatch and delivery

21. The operator sees bookings at their hydrant **from `Approved` onwards**; pending and rejected subsidised bookings are not shown to them.
22. The operator can **re-assign** a different tanker/driver while the booking is still `Assigned` (before filling). After filling, the assignment is fixed.
23. "Records when the tanker is filled and leaves" = two operator actions: **Mark filled** (`Filled`) and **Mark left hydrant** (`Dispatched`). Both are time-stamped.
24. If the hydrant is marked unavailable, no new bookings, assignments or fillings are allowed there. Trips already on the road continue.
25. A tanker marked unavailable cannot be assigned. Existing assignments are not changed automatically; the operator re-assigns them.
26. A driver can mark **Arrived** after the tanker left, then **Delivered**. **Failed** is allowed only after the tanker has left the hydrant (`Dispatched` or `Arrived`) and needs a reason from a fixed list; "Other" needs a written description.
27. A failed booking is final. The customer can dispute it or make a new booking. (No automatic re-delivery.)

## E. Customer actions, disputes and bills

28. A customer can **cancel only before the tanker is filled** (`PendingApproval`, `Approved`, `Assigned`). After that the water is already drawn.
29. After delivery the customer either **confirms** or **disputes**. A dispute can also be raised for a failed trip. A dispute needs at least 10 characters of explanation.
30. Disputes are handled by the Zone Officer of the booking's zone. Outcomes: **Refund**, **Redelivery arranged** (arranged as a new booking outside this record), **No action**. The booking then becomes `Resolved`; a Refund also marks the bill `Refunded`.
31. A delivered booking that the customer never confirms stays `Delivered` (no auto-confirm in Phase 1).
32. Every booking has one bill. Lifecycle: `AwaitingApproval` (subsidised, not yet approved) → `Unpaid` → `Paid`; `Void` if cancelled or rejected; `Refunded` after a refund.
33. **Payment is simulated**: the customer picks a method (Cash, JazzCash, EasyPaisa, Bank transfer) and the bill is marked Paid. No payment gateway.

## F. Visibility and permissions

34. A user may see a record without being allowed to change it. Visibility per role:
    * Customer – only own bookings, bills, disputes and applications. They see the **assigned tanker number and the driver's name/phone for their own booking**, but cannot list a driver's other trips.
    * Zone Officer – every booking in their zone (read-only), plus approve/reject. They **cannot assign, re-assign or dispatch**.
    * Hydrant Operator – bookings, tankers and drivers of their own hydrant only.
    * Driver – only trips assigned to them.
    * Administrator – everything, plus master data and reports.
35. Buttons are shown only when the role **and** the current status allow the action (table `actions` in `mock-api/meta.js`). The server checks the same table, so hiding a button is never the only protection.
36. Each Zone Officer belongs to exactly one zone; each operator and driver to exactly one hydrant.
37. Staff accounts (officer, operator, driver, admin) are created by the administrator; only customers self-register.
38. Records with history (users with bookings, tankers with trips, hydrants with tankers/bookings, zones in use, rates for existing tanker sizes) **cannot be deleted** – they are deactivated / marked unavailable instead, so every past delivery stays traceable.
39. An admin cannot deactivate their own account.

## G. Technical (Phase 1)

40. The **mock API** (`mock-api/core.js`, no dependencies) stands in for the backend. Locally `mock-api/server.js` runs it and stores data in `mock-api/db.json`; on GitHub Pages `public/sw.js` runs it inside the browser and stores data in the browser. `npm run reset` restores the seed. Seed dates are relative to the day the server first starts.
41. Mock tokens are `mock-token-<userId>` and **passwords are stored in plain text in the mock only**. Phase 2 will hash passwords (bcrypt) and use signed JWTs.
42. All dates use the server's local time zone (Pakistan Standard Time assumed).
43. Search, filters, sorting and pagination are done by the API, not in the browser, so the same frontend works when Phase 2 moves them into SQL.
44. **Group variation**: not yet assigned by the teacher. A single hook exists in `public/js/variation.js` (`extraBookingRules()`, called by the booking form) and its name is shown in the footer. When the variation is known it will be added there and on the server.

## H. What Phase 2 must enforce on the server

* All rules above must be checked by the real backend; frontend checks are only for fast feedback.
* **Create booking** and **assign tanker/driver** must run inside **one database transaction**: lock/check the hydrant's reserved quota for the date, the customer's monthly subsidy usage, and that the tanker and driver are free for the date + slot, then insert/update and write the history row. If any step fails, roll back everything.
* Use database constraints as a second guard against two requests at the same moment, e.g. a unique index on `(tanker_id, delivery_date, slot)` and `(driver_id, delivery_date, slot)` for live bookings, and row locks (`SELECT ... FOR UPDATE`) on the hydrant/day quota.
* Status changes must check the current status inside the same transaction (e.g. `UPDATE ... WHERE id = ? AND status = 'PendingApproval'`) so two officers cannot approve/reject the same booking twice.
* Approval of a subsidy application and the customer's subsidy update must be one transaction.
* Dashboard and reports must use aggregate SQL queries; lists must avoid N+1 queries (use joins).
