// src/components/FieldDot.js — field dot lifecycle + positioning (§C5).
// Multi-dot mode: one persistent dot per editable field. Clicking a dot opens
// the SnippetPicker overlay anchored to that field.
import { getSettings, onSettingsChanged } from '../utils/settings.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import { createShadowHost } from './ShadowHost.js';
import { surfaceCSS, resolveOnPageTheme, onThemeChange } from './onPageSurface.js';
import { createSnippetPicker } from './SnippetPicker.js';
import { installFieldTracking } from './FieldTracking.js';

/* PASSWORD IS IN THIS LIST DELIBERATELY. It was missing, and that was an
   oversight rather than a privacy stance: filling a password field always worked
   (insertText checks tagName and never reads `type`), so the omission hid only
   the DOT. The visible symptom was bizarre. On a site whose show/hide control
   flips `type` between `password` and `text`, verified on dollargeneral.com where
   that control is a plain <div class="show-pass">, the dot was absent while the
   field was masked and appeared the moment the user revealed the text, because
   the MutationObserver below already watches `type`. Filling worked throughout,
   so the feature looked broken at random.

   Excluding it also fought the sensitive-snippet feature, whose whole purpose is
   values that live in password fields. */
const EDITABLE_SELECTOR = [
  'textarea',
  'input:not([type]),input[type=text],input[type=search],input[type=email],input[type=url],input[type=tel],input[type=number],input[type=password]',
  '[contenteditable=""],[contenteditable=true],[contenteditable=plaintext-only]'
].join(',');
const OPT_OUT = '[data-pastekit=false],[data-gramm=false]';
const DOT = 22;
const HOVER_MARGIN = 16; // px outside the field boundary that still shows the dot

/* Spec 009 (R-041): the dot's private style block is gone. Its shadow went with
   it, because the dot sits ON the page rather than floating over it, so it never
   qualified for the popover exception. Size is still owned here (the picker's
   anchor maths reads DOT), but the paint comes from onPageSurface, which also
   styles the picker sharing this same root. */
const DOT_SIZE_STYLE = `
  * { box-sizing: border-box; }
  .pk-dot { width: ${DOT}px; height: ${DOT}px; }
`;

export function initFieldDot() {
  const dotEnabled = () => {
    const s = getCachedSettings();
    return !s || s.fieldDot !== false;
  };

  const isEditable = (el) =>
    el instanceof HTMLElement &&
    el.matches(EDITABLE_SELECTOR) &&
    !el.matches(OPT_OUT) && !el.closest(OPT_OUT) &&
    !(el instanceof HTMLInputElement && (el.readOnly || el.disabled)) &&
    !(el instanceof HTMLTextAreaElement && (el.readOnly || el.disabled));

  /* This root is SHARED with the picker, so one stylesheet dresses both. Light
     first, corrected the moment storage answers, and reapplied whenever the
     extension's theme changes: the dot can be on screen for hours, so a
     construction-time snapshot would strand it in the old theme. */
  const { host, shadow, styleEl } = createShadowHost(
    'data-pastekit-root', surfaceCSS('light') + DOT_SIZE_STYLE);
  const dressShadow = (t) => { styleEl.textContent = surfaceCSS(t) + DOT_SIZE_STYLE; };
  resolveOnPageTheme().then(dressShadow);
  onThemeChange(dressShadow);

  // ---------- state ----------
  const dotMap = new Map(); // el -> { dotEl, ro }
  // Shared with FieldTracking: insert-target field, cursor position, dot mode.
  const tracker = { field: null, dotMode: 'always', mouseX: -9999, mouseY: -9999 };
  let rafPending = false;

  const picker = createSnippetPicker(shadow, () => tracker.field);

  getSettings().then(s => {
    picker.setPickerLimit(s.pickerLimit ?? 10);
    tracker.dotMode = s.dotMode || 'always';
  }).catch(() => {});
  onSettingsChanged(s => {
    picker.setPickerLimit(s.pickerLimit ?? 10);
    tracker.dotMode = s.dotMode || 'always';
    requestPositionAll();
  });

  // ---------- positioning ----------
  function clippedOut(el, rect) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        return rect.bottom < pr.top || rect.top > pr.bottom;
      }
    }
    return false;
  }

  function positionDot(el, dotEl) {
    if (!el.isConnected) { removeDot(el); return; }
    const r = el.getBoundingClientRect();
    if ((r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > innerHeight || clippedOut(el, r)) {
      dotEl.style.display = 'none'; return;
    }
    const pickerActive = picker.isOpen() && tracker.field === el;
    const nearField = tracker.mouseX >= r.left - HOVER_MARGIN &&
                      tracker.mouseX <= r.right + HOVER_MARGIN &&
                      tracker.mouseY >= r.top - HOVER_MARGIN &&
                      tracker.mouseY <= r.bottom + HOVER_MARGIN;
    const modeVisible =
      tracker.dotMode === 'always' ||
      (tracker.dotMode === 'hover' && nearField) ||
      (tracker.dotMode === 'focus' && (document.activeElement === el || pickerActive));
    dotEl.style.left = Math.max(4, r.left - DOT - 6) + 'px';
    dotEl.style.top  = Math.max(r.top + 4, 4) + 'px';
    dotEl.style.display = (dotEnabled() && modeVisible) ? 'block' : 'none';
  }

  function positionAll() {
    rafPending = false;
    for (const [el, { dotEl }] of dotMap) positionDot(el, dotEl);
    picker.reposition();
  }

  const requestPositionAll = () => {
    if (!rafPending) { rafPending = true; requestAnimationFrame(positionAll); }
  };

  // ---------- dot lifecycle ----------
  function addDot(el) {
    if (dotMap.has(el)) return;
    const dotEl = document.createElement('div'); dotEl.className = 'pk-dot';
    shadow.appendChild(dotEl);
    const ro = new ResizeObserver(requestPositionAll);
    ro.observe(el);
    dotMap.set(el, { dotEl, ro });
    positionDot(el, dotEl);

    dotEl.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      tracker.field = el;
      el.focus(); // restore focus so 'focus' mode dot stays visible
      picker.toggle();
    }, true);
    dotEl.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopImmediatePropagation();
    }, true);
  }

  function removeDot(el) {
    const entry = dotMap.get(el);
    if (!entry) return;
    entry.ro.disconnect();
    entry.dotEl.remove();
    dotMap.delete(el);
    if (tracker.field === el) { tracker.field = null; picker.close(); }
  }

  function scanAndSync() {
    if (!dotEnabled()) {
      for (const [el] of [...dotMap]) removeDot(el);
      return;
    }
    const foundEls = document.querySelectorAll(EDITABLE_SELECTOR);
    const current = new Set();
    for (const el of foundEls) { if (isEditable(el)) current.add(el); }
    for (const [el] of [...dotMap]) {
      if (!current.has(el)) removeDot(el);
    }
    for (const el of current) {
      if (!dotMap.has(el)) addDot(el);
    }
  }

  // ---------- initial scan + DOM watch ----------
  scanAndSync();

  new MutationObserver(() => { scanAndSync(); requestPositionAll(); }).observe(document.documentElement, {
    subtree: true, childList: true,
    attributes: true, attributeFilter: ['contenteditable', 'readonly', 'disabled', 'type', 'hidden']
  });

  document.addEventListener('scroll', requestPositionAll, { capture: true, passive: true });
  addEventListener('resize', requestPositionAll, { passive: true });

  installFieldTracking({ host, shadow, isEditable, tracker, picker, requestPositionAll });
}
