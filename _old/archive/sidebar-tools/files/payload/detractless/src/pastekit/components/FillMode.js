// content/fillMode.js — fill-mode wiring + FillIndicator (§C4).
// Top frame only. Open shadow host for the indicator.
import { MSG } from '../utils/messages.js';
import { FillQueue } from './FillQueue.js';
import { surfaceCSS, resolveOnPageTheme, onThemeChange } from './onPageSurface.js';

/* Position only. Everything painted comes from surfaceCSS, and this is prepended
   rather than merged so re-theming is a single reassignment. */
const HOST_RULE =
  ':host { all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647; }';

let queue = null, indicator = null;

export function initFillMode() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (window !== top) return false;
    if (!msg) return false;
    switch (msg.type) {
      case MSG.FILL_START:
        startFillMode(msg.snippets);
        sendResponse({ ok: true, remaining: queue.remaining });
        return false;
      case MSG.FILL_CANCEL:
        exitFillMode('cancelled'); sendResponse({ ok: true });
        return false;
      case MSG.FILL_STATUS:
        sendResponse(queue
          ? { ok: true, active: true, cursor: queue.cursor, total: queue.items.length }
          : { ok: true, active: false });
        return false;
    }
    return false;
  });
}

function startFillMode(snippets) {
  if (queue) exitFillMode('restarted');
  queue = new FillQueue(snippets);
  queue.on('advance', () => {
    indicator.update(queue);
    chrome.runtime.sendMessage({ type: MSG.FILL_ADVANCE, remaining: queue.remaining }).catch(() => {});
  });
  queue.on('done', () => setTimeout(() => exitFillMode('done'), 800));
  indicator = new FillIndicator(queue, () => exitFillMode('cancelled'));
  document.addEventListener('click', onCaptureClick, true);
  document.addEventListener('keydown', onKeydown, true);
}

function isFillTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement)
    return !el.disabled && !el.readOnly && /^(text|search|email|url|tel|number)$/.test(el.type || 'text');
  return false;
}

function onCaptureClick(e) {
  const path = e.composedPath();
  if (path[0] && indicator.contains(path[0])) return;
  let tgt = null;
  for (const n of path) { if (n instanceof Element && isFillTarget(n)) { tgt = n; break; } }
  if (!tgt && isFillTarget(e.target)) tgt = e.target;
  if (!tgt) return;
  e.stopPropagation(); // do NOT preventDefault — default focuses field & places caret
  queue.fillNext(tgt);
}

function onKeydown(e) {
  if (e.key === 'Escape' && queue) {
    e.preventDefault(); e.stopPropagation();
    exitFillMode('cancelled');
  }
}

function exitFillMode(reason) {
  document.removeEventListener('click', onCaptureClick, true);
  document.removeEventListener('keydown', onKeydown, true);
  if (indicator) indicator.destroy();
  indicator = null; queue = null;
  chrome.runtime.sendMessage({ type: MSG.FILL_ENDED, reason }).catch(() => {});
}

class FillIndicator {
  constructor(queue, onCancel) {
    this.host = document.createElement('pastekit-fill-indicator');
    // Closed: the indicator previews snippet text, and an open root would let
    // the host page read it back via element.shadowRoot.
    const root = this.host.attachShadow({ mode: 'closed' });
    /* Spec 009: the private style block is gone, and three rule breaches went
       with it. A shadow no ruling granted (R-041 covers popovers; an inverse
       fill separates by luminance already), an OUTLINE on the next-up dot, which
       is the banned focus-ring technique wearing a different hat, and a
       hand-picked grey palette that themed with nothing. */
    const styleEl = document.createElement('style');
    styleEl.textContent = HOST_RULE + surfaceCSS('light');
    resolveOnPageTheme().then(t => { styleEl.textContent = HOST_RULE + surfaceCSS(t); });
    onThemeChange(t => { styleEl.textContent = HOST_RULE + surfaceCSS(t); });

    const pillEl = document.createElement('div');
    pillEl.className = 'pk-toast';
    this._dotsEl = document.createElement('span');    this._dotsEl.className = 'dots';
    this._previewEl = document.createElement('span'); this._previewEl.className = 'pk-preview';
    this._countEl = document.createElement('span');   this._countEl.className = 'count';
    const cancelBtnEl = document.createElement('button');
    cancelBtnEl.title = 'Cancel (Esc)';
    cancelBtnEl.textContent = '✕';
    pillEl.append(this._dotsEl, this._previewEl, this._countEl, cancelBtnEl);
    root.append(styleEl, pillEl);
    this.root = root;
    cancelBtnEl.addEventListener('click', onCancel);
    document.documentElement.appendChild(this.host);
    this.update(queue);
  }
  update(queue) {
    this._dotsEl.replaceChildren(...queue.items.map((it, i) => {
      const dotEl = document.createElement('span');
      dotEl.className = `pk-qdot ${it.filled ? 'filled' : i === queue.cursor ? 'next' : ''}`.trim();
      return dotEl;
    }));
    const cur = queue.current;
    this._previewEl.textContent = cur ? ('Next: ' + (cur.label || cur.text)) : 'Done';
    this._countEl.textContent = `${queue.cursor}/${queue.items.length}`;
  }
  contains(node) { return node === this.host || this.host.contains(node); }
  destroy() { this.host.remove(); }
}
