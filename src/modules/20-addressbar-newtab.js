/* ── 20-addressbar-newtab.js: the address bar on the Atlas new tab ──
   On the new tab (#browser.atlas-newtab, set by 01-addressbar.js) the engine
   button (19-addressbar-engine-picker.js) shows without clicking into the
   field, and the field is kept empty: Vivaldi would fill in the new tab's
   extension address when you click into it or press Esc. Elsewhere the
   button shows only while the field is in use. ── */

/* The window's address field, in use or not. */
function abeFieldInput() {
  return document.querySelector('.toolbar-mainbar .UrlBar-AddressField input.url') ||
    document.querySelector('.UrlBar-AddressField input.url');
}

function abeOnNewTab() {
  var browser = document.getElementById('browser');
  return !!(browser && browser.classList.contains('atlas-newtab'));
}

/* The field the button belongs to: the one in use, or on the new tab the field at rest. */
function abeAnchor() {
  return abe.input || (abeOnNewTab() ? abeFieldInput() : null);
}

/* The field not in use: the button stays on the new tab; elsewhere Vivaldi's
   own icon is back (the lock on a web page). Run again when the active tab
   becomes or stops being the new tab (abeNewTabChanged, from 01). */
function abeRest() {
  if (abe.input) return;
  if (abeOnNewTab() && abeFieldInput()) return abeShowButton();
  if (abe.btn) abe.btn.hidden = true;
  var browser = document.getElementById('browser');
  if (browser) browser.classList.remove('atlas-enginebtn-on');
}

function abeNewTabChanged() {
  abeRest();
  if (abe.input) abeClearNewTabAddress(abe.input);
}

/* Set the field's text as typing would, so Vivaldi's own field follows. */
function abeSetValue(input, v) {
  abe.setting = true;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  abe.setting = false;
}

/* On the new tab Vivaldi fills the field with the new tab's extension
   address. Empty it, as deleting it by hand would, so the field shows its
   "Search ... or enter an address" hint. */
function abeClearNewTabAddress(input) {
  if (input && abeOnNewTab() && atlasIsNewTabUrl(input.value)) abeSetValue(input, '');
}

/* Re-place the button when the toolbar changes size (a panel opening moves the field). */
function abeWatchToolbar() {
  var bar = document.querySelector('.toolbar-mainbar');
  if (!bar || abe.watched === bar || typeof ResizeObserver === 'undefined') return;
  if (abe.ro) abe.ro.disconnect();
  abe.watched = bar;
  abe.ro = new ResizeObserver(function () { if (abe.btn && !abe.btn.hidden) abePlace(); });
  abe.ro.observe(bar);
}

if (typeof document !== 'undefined' && document.addEventListener) {
  /* Esc puts the page's address back in the field; on the new tab, empty it again. */
  document.addEventListener('keyup', function (e) {
    var input = e.key === 'Escape' && apbField(e.target);
    if (input) setTimeout(function () { abeClearNewTabAddress(input); }, 0);
  });
}
