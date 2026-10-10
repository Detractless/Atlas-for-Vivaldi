/* ── 20-addressbar-newtab.js: the address bar on the Atlas new tab ──
   On the new tab (#browser.atlas-newtab, set by 01-addressbar.js) the engine
   button (19-addressbar-engine-picker.js) is there without clicking into the
   field, drawn as the bar's own parts are: only while the pointer is over the
   bar (#browser.atlas-urlbar-hover) or the field is in use
   (#browser.atlas-enginebtn-inuse). The field is kept empty: Vivaldi would
   fill in the new tab's extension address when you click into it or press
   Esc; on hover its hint shows in place of that address (abeCopyHint). A
   new tab opens with the cursor in the field (abeFocusNewTab). Elsewhere the
   button shows only while the field is in use and holds a search. ── */

/* The window's address field, in use or not. */
function abeFieldInput() {
  return document.querySelector('.toolbar-mainbar .UrlBar-AddressField input.url') ||
    document.querySelector('.UrlBar-AddressField input.url');
}

function abeOnNewTab() {
  return atlasMarked('atlas-newtab');
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
  if (abeOnNewTab() && abeFieldInput()) { abeCopyHint(); return abeShowButton(); }
  if (abe.btn) abe.btn.hidden = true;
  atlasMark('atlas-enginebtn-on', false);
  atlasMark('atlas-enginebtn-inuse', false);
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

/* The bar's own :hover ends where the logo starts, because the logo floats
   over the bar rather than inside it. So the pointer over the bar or the
   logo counts as one hover, #browser.atlas-urlbar-hover, which the logo's
   fade (and the bar's hover color) follow. */
function abeWatchHover() {
  var anchor = abeAnchor(), field = anchor && anchor.closest('.UrlBar-AddressField');
  if (!field || abe.hoverField === field) return;
  if (abe.hoverField) {
    abe.hoverField.removeEventListener('mouseenter', abeHoverOn);
    abe.hoverField.removeEventListener('mouseleave', abeHoverOff);
  }
  abe.hoverField = field;
  field.addEventListener('mouseenter', abeHoverOn);
  field.addEventListener('mouseleave', abeHoverOff);
}

function abeHoverOn() {
  abeCopyHint();
  atlasMark('atlas-urlbar-hover', true);
}

/* The hint the new tab's field shows on hover in place of the new tab's own
   address (03-addressbar.css): the one Vivaldi gives an empty field, which
   names the engine in use. Copied again on every hover, so it follows a pick. */
function abeCopyHint() {
  var input = abeFieldInput(), box = input && input.closest('.UrlField');
  if (!box) return;
  var hint = input.getAttribute('placeholder') || '';
  if (box.getAttribute('data-atlas-hint') !== hint) box.setAttribute('data-atlas-hint', hint);
}

/* Moving between the bar and the logo isn't leaving. */
function abeHoverOff(e) {
  var to = e && e.relatedTarget;
  if (to && ((abe.btn && abe.btn.contains(to)) || (abe.hoverField && abe.hoverField.contains(to)))) return;
  atlasMark('atlas-urlbar-hover', false);
}

/* A new tab opened in this window: the cursor goes to the address bar, as it
   went to the new tab's own search box before that was removed (2026-10-09).
   Tried once the new tab is up, and again when it has loaded in case the page
   took the focus, for a few seconds at most; never over typing elsewhere in
   the window, and not when you switch back to a new tab already open. */
var ABE_FOCUS_WINDOW_MS = 3000;
var abeFocusFor = { id: null, until: 0 };

function abeFocusNewTab(tab) {
  if (!tab) return;
  abeFocusFor = { id: tab.id, until: Date.now() + ABE_FOCUS_WINDOW_MS };
  setTimeout(abeFocusIfNewTab, 250);
}

function abeFocusIfNewTab() {
  if (abeFocusFor.id === null || Date.now() > abeFocusFor.until) return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    void chrome.runtime.lastError;
    var t = tabs && tabs[0], input = abeFieldInput(), a = document.activeElement;
    if (!t || t.id !== abeFocusFor.id || !input || a === input || !atlasIsNewTabUrl(t.pendingUrl || t.url)) return;
    if (a && a !== document.body && a.matches && a.matches('input, textarea, [contenteditable="true"]')) return;
    input.focus();
  });
}

if (chrome.tabs && chrome.tabs.onCreated) chrome.tabs.onCreated.addListener(abeFocusNewTab);
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (id, info) {
    if (id === abeFocusFor.id && info && info.status === 'complete') abeFocusIfNewTab();
  });
}

if (typeof document !== 'undefined' && document.addEventListener) {
  /* Esc puts the page's address back in the field; on the new tab, empty it again. */
  document.addEventListener('keyup', function (e) {
    var input = e.key === 'Escape' && apbField(e.target);
    if (input) setTimeout(function () { abeClearNewTabAddress(input); }, 0);
  });
}
