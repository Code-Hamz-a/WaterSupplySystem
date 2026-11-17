// Lookup data and workflow rules shared with the frontend through GET /api/meta.
// The frontend never hardcodes these lists; it reads them from the API.

const META = {
  roles: ['customer', 'officer', 'operator', 'driver', 'admin'],
  roleLabels: {
    customer: 'Customer',
    officer: 'Zone Officer',
    operator: 'Hydrant Operator',
    driver: 'Driver',
    admin: 'Administrator'
  },
  bookingTypes: ['Commercial', 'Subsidised'],
  // Delivery slots. A hydrant offers a slot only if the slot fits inside its operating hours.
  slots: [
    { id: 'MORNING', label: 'Morning (08:00 - 12:00)', start: '08:00', end: '12:00' },
    { id: 'AFTERNOON', label: 'Afternoon (12:00 - 16:00)', start: '12:00', end: '16:00' },
    { id: 'EVENING', label: 'Evening (16:00 - 20:00)', start: '16:00', end: '20:00' },
    { id: 'NIGHT', label: 'Night (20:00 - 23:59)', start: '20:00', end: '23:59' }
  ],
  maxAdvanceDays: 7,
  bookingStatuses: [
    'PendingApproval', 'Approved', 'Rejected', 'Cancelled', 'Assigned', 'Filled',
    'Dispatched', 'Arrived', 'Delivered', 'Failed', 'Confirmed', 'Disputed', 'Resolved'
  ],
  statusLabels: {
    PendingApproval: 'Pending approval',
    Approved: 'Approved',
    Rejected: 'Rejected',
    Cancelled: 'Cancelled',
    Assigned: 'Tanker assigned',
    Filled: 'Filled at hydrant',
    Dispatched: 'On the way',
    Arrived: 'Arrived',
    Delivered: 'Delivered',
    Failed: 'Failed',
    Confirmed: 'Confirmed',
    Disputed: 'Disputed',
    Resolved: 'Dispute resolved'
  },
  // Bookings in these statuses do NOT use hydrant water quota.
  quotaFreeStatuses: ['Cancelled', 'Rejected'],
  // Bookings in these statuses do NOT count toward a household's monthly subsidy limit.
  subsidyFreeStatuses: ['Cancelled', 'Rejected', 'Failed'],
  failReasons: ['House locked', 'Road blocked', 'Wrong address', 'Customer refused', 'Vehicle breakdown', 'Other'],
  subsidyCategories: [
    { id: 'Household', label: 'Low-income household', defaultLimitGallons: 12000 },
    { id: 'Hospital', label: 'Hospital', defaultLimitGallons: 60000 },
    { id: 'Mosque', label: 'Mosque', defaultLimitGallons: 36000 }
  ],
  proofTypes: ['Income certificate', 'BISP card', 'Utility bill', 'Registration certificate'],
  householdIncomeCeiling: 50000,
  applicationStatuses: ['Pending', 'Approved', 'Rejected'],
  disputeStatuses: ['Open', 'Resolved'],
  disputeOutcomes: ['Refund', 'Redelivery arranged', 'No action'],
  paymentMethods: ['Cash', 'JazzCash', 'EasyPaisa', 'Bank transfer'],
  billStatuses: ['AwaitingApproval', 'Unpaid', 'Paid', 'Void', 'Refunded'],
  tankerStatuses: ['Available', 'Unavailable'],
  hydrantStatuses: ['Available', 'Unavailable'],
  // Booking workflow: which role may perform which action from which status.
  // The frontend uses this table to decide which buttons to show.
  actions: {
    cancel: { label: 'Cancel booking', roles: ['customer'], from: ['PendingApproval', 'Approved', 'Assigned'], to: 'Cancelled', input: 'optionalReason', style: 'danger' },
    approve: { label: 'Approve', roles: ['officer'], from: ['PendingApproval'], to: 'Approved', input: null, style: 'primary' },
    reject: { label: 'Reject', roles: ['officer'], from: ['PendingApproval'], to: 'Rejected', input: 'reason', style: 'danger' },
    assign: { label: 'Assign tanker & driver', roles: ['operator'], from: ['Approved', 'Assigned'], to: 'Assigned', input: 'assign', style: 'primary' },
    filled: { label: 'Mark filled', roles: ['operator'], from: ['Assigned'], to: 'Filled', input: null, style: 'primary' },
    dispatch: { label: 'Mark left hydrant', roles: ['operator'], from: ['Filled'], to: 'Dispatched', input: null, style: 'primary' },
    arrive: { label: 'Arrived', roles: ['driver'], from: ['Dispatched'], to: 'Arrived', input: null, style: 'primary' },
    deliver: { label: 'Delivered', roles: ['driver'], from: ['Arrived'], to: 'Delivered', input: null, style: 'success' },
    fail: { label: 'Failed', roles: ['driver'], from: ['Dispatched', 'Arrived'], to: 'Failed', input: 'failReason', style: 'danger' },
    confirm: { label: 'Confirm delivery', roles: ['customer'], from: ['Delivered'], to: 'Confirmed', input: null, style: 'success' },
    dispute: { label: 'Raise dispute', roles: ['customer'], from: ['Delivered', 'Failed'], to: 'Disputed', input: 'reason', style: 'danger' }
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { META };
