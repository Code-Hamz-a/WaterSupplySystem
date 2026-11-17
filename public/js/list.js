// Reusable list controller: filter form + Fetch + render + pagination.
// Filters, search text, sort and page are sent to the API as query parameters,
// so searching/sorting/paging happens on the server (the mock now, the database in Phase 2).
import { get } from './api.js';
import { readForm } from './validation.js';
import { showLoading, showError, renderPager, queryParams } from './ui.js';

/**
 * @param {object}   o
 * @param {HTMLFormElement} [o.form] filter form. A select named "sortBy" with values like "deliveryDate:desc" controls sorting.
 * @param {HTMLElement} o.output where render() draws the rows
 * @param {HTMLElement} o.pager  where the pagination goes
 * @param {string}   o.endpoint  e.g. '/bookings'
 * @param {object}   [o.baseQuery] fixed query params always sent
 * @param {Function} o.render    (rows, response) => void
 */
export function createList({ form, output, pager, endpoint, baseQuery = {}, render, limit = 10, syncUrl = true }) {
  const initial = syncUrl ? queryParams() : {};
  if (form) {
    for (const [k, v] of Object.entries(initial)) {
      const el = form.elements[k];
      if (el && 'value' in el) el.value = v;
    }
  }
  let page = Number(initial.page) || 1;
  let requestNo = 0;

  async function load() {
    const filters = form ? readForm(form) : {};
    const { sortBy, ...rest } = filters;
    const query = { ...rest, ...baseQuery, page, limit };
    if (sortBy) {
      const [sort, order] = sortBy.split(':');
      query.sort = sort;
      query.order = order;
    }
    if (syncUrl) {
      // Keep filters in the address bar so the page can be bookmarked or refreshed.
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...rest, sortBy, page: page > 1 ? page : '' })) if (v) usp.set(k, v);
      history.replaceState(null, '', usp.toString() ? `?${usp}` : location.pathname);
    }
    const mine = ++requestNo;
    showLoading(output);
    try {
      const res = await get(endpoint, query);
      if (mine !== requestNo) return; // a newer request has started; ignore this one
      await render(res.data, res);
      if (pager) renderPager(pager, res, p => { page = p; load(); });
    } catch (err) {
      if (mine === requestNo) showError(output, err, load);
    }
  }

  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); page = 1; load(); });
    form.addEventListener('change', e => { if (e.target.type !== 'search') { page = 1; load(); } });
    let timer;
    form.addEventListener('input', e => {
      if (e.target.type !== 'search') return;
      clearTimeout(timer);
      timer = setTimeout(() => { page = 1; load(); }, 350);
    });
    form.addEventListener('reset', () => setTimeout(() => { page = 1; load(); }));
  }

  load();
  return { reload: load };
}
