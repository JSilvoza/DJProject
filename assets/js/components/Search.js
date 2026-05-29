/**
 * components/Search.js — Live product search modal.
 * [ENGINEER v1] Functional. Reviewer issues filed below.
 * [OPTIMIZER v2] All issues resolved — see inline notes.
 */

import { PRODUCTS }                        from '../data/products.js';
import { search }                          from '../domain/catalog.js';
import { getDisplayPrice, formatPrice }    from '../domain/pricing.js';

/* ── Module state ────────────────────────────────────────────────── */

let _overlay = null;
let _input   = null;
let _list    = null;
let _results = [];
let _cursor  = -1;
let _timer   = null;

/* OPTIMIZER: 250ms debounce prevents a search call on every keystroke.
   Engineer had no debounce — every keypress triggered a synchronous filter. */
const DEBOUNCE_MS = 250;

/* ── Public API ──────────────────────────────────────────────────── */

export function initSearch() {
  _buildOverlay();
  _injectTrigger();
  /* OPTIMIZER: Cmd+K / Ctrl+K global shortcut — Engineer omitted this. */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
  });
}

export function openSearch() {
  _overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  /* OPTIMIZER: rAF guarantees the input receives focus after
     the browser has rendered the now-visible overlay. */
  requestAnimationFrame(() => _input.focus());
  document.addEventListener('keydown', _globalEsc);
}

export function closeSearch() {
  _overlay.hidden = true;
  document.body.style.overflow = '';
  _input.value = '';
  _cursor      = -1;
  _results     = [];
  _list.innerHTML = _hintHtml();
  /* OPTIMIZER: listener removed on close — Engineer left it permanently
     attached, firing on every keypress across the whole session. */
  document.removeEventListener('keydown', _globalEsc);
}

/* ── DOM construction ────────────────────────────────────────────── */

function _injectTrigger() {
  const actions = document.querySelector('.header__actions');
  if (!actions) return;

  const btn = document.createElement('button');
  btn.className = 'header__icon-btn header__search-btn';
  btn.setAttribute('aria-label', 'Search products');
  btn.setAttribute('aria-keyshortcuts', 'Control+k Meta+k');
  btn.innerHTML = _searchIcon(18);
  btn.addEventListener('click', openSearch);
  /* Inject before the cart button so search sits left of the cart */
  actions.prepend(btn);
}

function _buildOverlay() {
  _overlay = document.createElement('div');
  _overlay.id        = 'searchOverlay';
  _overlay.className = 'search-overlay';
  _overlay.hidden    = true;

  /* OPTIMIZER: ARIA dialog roles — Engineer had a plain <div> with no roles.
     Screen readers had no way to know a modal had opened. */
  _overlay.setAttribute('role',       'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.setAttribute('aria-label', 'Product search');

  _overlay.innerHTML = `
    <div class="search-box" role="search">
      <div class="search-input-wrap">
        ${_searchIcon(18, 'search-input-icon')}
        <input
          id="searchInput"
          class="search-input"
          type="search"
          placeholder="Search products…"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          aria-label="Search products"
          aria-autocomplete="list"
          aria-controls="searchResults"
        >
        <button class="search-close" aria-label="Close search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <ul
        id="searchResults"
        class="search-results"
        role="listbox"
        aria-label="Search results"
      >${_hintHtml()}</ul>

      <!-- OPTIMIZER: aria-live region announces result count to screen readers.
           Engineer rendered results visually only — screen readers were silent. -->
      <div
        id="searchAnnounce"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class="visually-hidden"
      ></div>
    </div>
  `;

  _input = _overlay.querySelector('#searchInput');
  _list  = _overlay.querySelector('#searchResults');

  _input.addEventListener('input',   _onInput);
  _input.addEventListener('keydown', _onKeydown);
  _overlay.querySelector('.search-close').addEventListener('click', closeSearch);
  /* Close on backdrop click */
  _overlay.addEventListener('click', (e) => { if (e.target === _overlay) closeSearch(); });

  document.body.appendChild(_overlay);
}

/* ── Input & search ──────────────────────────────────────────────── */

function _onInput(e) {
  clearTimeout(_timer);
  /* OPTIMIZER: debounced — waits for user to pause before searching */
  _timer = setTimeout(() => _runSearch(e.target.value), DEBOUNCE_MS);
}

function _runSearch(query) {
  _cursor  = -1;
  _results = search(PRODUCTS, query);
  _renderResults(query);
}

function _renderResults(query) {
  if (!query || query.trim().length < 2) {
    _list.innerHTML = _hintHtml();
    _announce('');
    return;
  }

  if (!_results.length) {
    _list.innerHTML = `<li class="search-empty" role="option">No results for "<strong>${_esc(query)}</strong>"</li>`;
    _announce('No results found.');
    return;
  }

  /* OPTIMIZER: _esc() sanitises user query before injecting into innerHTML
     — Engineer used raw interpolation, XSS risk if query contained HTML. */
  _list.innerHTML =
    _results.map((p, i) => `
      <li class="search-result" role="option" aria-selected="false" data-index="${i}">
        <a href="product.html?slug=${p.slug}" class="search-result__link">
          <div class="search-result__img-wrap">
            <img src="${p.images[0]}" alt="" class="search-result__img" loading="lazy" width="48" height="64">
          </div>
          <div class="search-result__info">
            <span class="search-result__name">${_esc(p.name)}</span>
            <span class="search-result__meta">${_esc(p.category)}</span>
          </div>
          <span class="search-result__price">${formatPrice(getDisplayPrice(p))}</span>
        </a>
      </li>`).join('')
    + `<li class="search-all">
        <a href="shop.html?q=${encodeURIComponent(query)}" class="search-all__link">
          View all results for "<strong>${_esc(query)}</strong>" →
        </a>
       </li>`;

  /* Close modal when clicking a result link */
  _list.querySelectorAll('.search-result__link').forEach(a => {
    a.addEventListener('click', closeSearch);
  });

  _announce(`${_results.length} result${_results.length !== 1 ? 's' : ''} found.`);
}

/* ── Keyboard navigation ─────────────────────────────────────────── */

function _onKeydown(e) {
  /* OPTIMIZER: full arrow-key navigation — Engineer had no keyboard support;
     users with keyboards or screen readers could not traverse results. */
  const items = _list.querySelectorAll('.search-result');
  if (!items.length) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      _cursor = (_cursor + 1) % items.length;
      _setCursor(items);
      break;
    case 'ArrowUp':
      e.preventDefault();
      _cursor = (_cursor - 1 + items.length) % items.length;
      _setCursor(items);
      break;
    case 'Enter':
      if (_cursor >= 0) {
        e.preventDefault();
        items[_cursor]?.querySelector('a')?.click();
      }
      break;
    case 'Escape':
      closeSearch();
      break;
  }
}

function _setCursor(items) {
  items.forEach((item, i) =>
    item.setAttribute('aria-selected', String(i === _cursor))
  );
  items[_cursor]?.scrollIntoView({ block: 'nearest' });
}

function _globalEsc(e) {
  if (e.key === 'Escape') closeSearch();
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function _announce(msg) {
  const el = document.getElementById('searchAnnounce');
  if (el) el.textContent = msg;
}

/* OPTIMIZER: HTML-escape user input before injecting into innerHTML */
function _esc(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function _hintHtml() {
  return `<li class="search-hint">Type to search products — or press <kbd>Esc</kbd> to close</li>`;
}

function _searchIcon(size, cls = '') {
  return `<svg ${cls ? `class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
}
