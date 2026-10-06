// content/clip.js — quick-clip support.
// 1) GET_SELECTION: return the live selection with line breaks + HTML intact
//    (chrome's info.selectionText flattens newlines). Runs in every frame;
//    only the frame that actually holds a selection responds.
// 2) CLIP_SAVED: toast confirming the save (top frame only).
import { MSG } from '../utils/messages.js';
import { surfaceCSS, resolveOnPageTheme, onThemeChange } from './onPageSurface.js';

const Z_MAX = 2147483647;

export function initClip() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;

    if (msg.type === MSG.GET_SELECTION) {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!sel || !text) return false; // stay silent so a frame WITH a selection can answer
      let html = '';
      try {
        const divEl = document.createElement('div');
        for (let i = 0; i < sel.rangeCount; i++)
          divEl.appendChild(sel.getRangeAt(i).cloneContents());
        html = divEl.innerHTML;
      } catch (_) { /* selection cloning failed — plain text still gets sent */ }
      sendResponse({ text, html });
      return false;
    }

    if (msg.type === MSG.CLIP_SAVED && window === top) {
      showToast(msg.ok ? 'Saved as @' + msg.name : 'Save failed: ' + (msg.error || 'unknown error'), !msg.ok);
      return false;
    }
    return false;
  });
}

// ------------------------------- toast -------------------------------------
/** @type {(HTMLDivElement & { _el: HTMLDivElement }) | null} */
let toastHost = null;
let toastTimer = null;

function showToast(message, isError) {
  if (!toastHost) {
    const hostEl = document.createElement('div');
    hostEl.setAttribute('data-pastekit-toast', '');
    hostEl.style.all = 'initial';
    hostEl.style.position = 'fixed';
    hostEl.style.bottom = '16px'; hostEl.style.right = '16px';
    hostEl.style.zIndex = String(Z_MAX);
    const shadow = hostEl.attachShadow({ mode: 'closed' });
    /* Spec 009: styling comes from onPageSurface like every other surface
       PasteKit puts on a page. What left with the private block: a shadow no
       ruling granted (R-041 covers popovers, and an inverse fill separates by
       luminance without one) and an invented error red that matched no token in
       the system, while the extension already had a danger pair. */
    const styleEl = document.createElement('style');
    styleEl.textContent = surfaceCSS('light');
    resolveOnPageTheme().then(t => { styleEl.textContent = surfaceCSS(t); });
    onThemeChange(t => { styleEl.textContent = surfaceCSS(t); });
    shadow.appendChild(styleEl);
    const el = document.createElement('div');
    el.className = 'pk-toast';
    shadow.appendChild(el);
    toastHost = Object.assign(hostEl, { _el: el });
  }
  const host = toastHost;
  host._el.textContent = message;
  host._el.classList.toggle('error', !!isError);
  if (!host.isConnected && document.documentElement)
    document.documentElement.appendChild(host);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    try { host.remove(); }
    catch (_) { /* host already detached — nothing to remove */ }
  }, 2600);
}
