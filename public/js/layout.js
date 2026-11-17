// Page bootstrap: checks login and role, draws the header/nav for the user's role,
// loads lookup data (meta) and the fresh user profile.
import { get, getMeta } from './api.js';
import { getUser, clearSession, updateUser } from './session.js';
import { h, $, clear, showError, fill } from './ui.js';
import { VARIATION } from './variation.js';

// Navigation per role. Pages a role cannot use are simply not linked.
const NAV = {
  customer: [
    ['dashboard.html', 'Dashboard'],
    ['book.html', 'Book a tanker'],
    ['bookings.html', 'My bookings'],
    ['bills.html', 'Bills'],
    ['subsidy-apply.html', 'Subsidy'],
    ['disputes.html', 'Disputes']
  ],
  officer: [
    ['dashboard.html', 'Dashboard'],
    ['bookings.html', 'Zone bookings'],
    ['subsidy-review.html', 'Subsidy applications'],
    ['disputes.html', 'Disputes']
  ],
  operator: [
    ['dashboard.html', 'Dashboard'],
    ['operator.html', 'Dispatch board'],
    ['fleet.html', 'Tankers & hydrant'],
    ['bookings.html', 'All hydrant bookings']
  ],
  driver: [
    ['driver.html', 'My trips']
  ],
  admin: [
    ['dashboard.html', 'Dashboard'],
    ['reports.html', 'Reports'],
    ['bookings.html', 'Bookings'],
    ['admin-zones.html', 'Zones'],
    ['admin-hydrants.html', 'Hydrants'],
    ['admin-tankers.html', 'Tankers'],
    ['admin-rates.html', 'Rates'],
    ['admin-users.html', 'Users'],
    ['subsidy-review.html', 'Subsidy'],
    ['disputes.html', 'Disputes'],
    ['bills.html', 'Bills']
  ]
};

export const homeFor = role => (role === 'driver' ? 'driver.html' : 'dashboard.html');

function renderHeader(user, meta) {
  const host = $('#app-header');
  if (!host) return;
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = NAV[user.role] || [];
  const nav = h('nav', { id: 'main-nav', class: 'nav', 'aria-label': 'Main' },
    h('ul', {}, links.map(([href, label]) =>
      h('li', {}, h('a', { href, 'aria-current': href === current ? 'page' : null }, label)))));
  const toggle = h('button', { class: 'nav-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'main-nav', 'aria-label': 'Open menu' },
    h('span', { 'aria-hidden': 'true' }, '☰'));
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });
  const logout = h('button', { class: 'btn btn-sm btn-ghost-light', type: 'button', onclick: () => { clearSession(); location.href = 'index.html'; } }, 'Log out');

  fill(host, 
    h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'),
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('a', { class: 'brand', href: homeFor(user.role) }, h('span', { class: 'brand-drop', 'aria-hidden': 'true' }, '💧'), 'PaaniLink'),
        toggle,
        nav,
        h('div', { class: 'userbox' },
          h('span', { class: 'user-name' }, user.name),
          h('span', { class: 'user-role' }, meta.roleLabels[user.role] + (user.zoneName ? ` · ${user.zoneName}` : '') + (user.hydrantName ? ` · ${user.hydrantName}` : '')),
          logout)))
  );

  const footer = $('#app-footer');
  if (footer) {
    fill(footer, h('footer', { class: 'footer' },
      h('span', {}, 'PaaniLink · City Water Board'),
      h('span', {}, `Group variation: ${VARIATION.name}`)));
  }
}

/**
 * Call at the top of every logged-in page.
 * @param {string[]} roles roles allowed on this page ([] = any logged-in user)
 * @returns {Promise<{user, meta}>}
 */
export async function initPage(roles = []) {
  const cached = getUser();
  if (!cached) {
    location.href = `index.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`;
    return new Promise(() => {}); // stop the page script
  }
  const [meta, me] = await Promise.all([getMeta(), get('/auth/me')]);
  const user = me.data;
  updateUser(user);
  if (roles.length && !roles.includes(user.role)) {
    location.href = homeFor(user.role);
    return new Promise(() => {});
  }
  renderHeader(user, meta);
  document.body.classList.add(`role-${user.role}`);
  return { user, meta };
}

/** Runs a page's main function and shows any startup error (e.g. API not running) on the page. */
export function boot(main) {
  main().catch(err => {
    console.error(err);
    showError($('#main'), err, () => location.reload());
  });
}
