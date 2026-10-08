// src/components/ShadowHost.js — shared closed-shadow UI host for injected
// overlays (field dot, @ menu). Creates a zero-footprint fixed host, fences
// events so page frameworks never see our internal interactions, and keeps
// the host mounted even if the page rewrites <html>'s children.
//
// The root is CLOSED: an open root is reachable from page script via
// element.shadowRoot, which would let the host page read whatever we render —
// including snippet text sitting in the @ menu. Callers keep the `shadow`
// handle returned here; nothing reads it back off the element.

const Z_MAX = 2147483647;

const FENCED_EVENTS = [
  'keydown','keyup','keypress','input','beforeinput','click','dblclick',
  'mousedown','mouseup','pointerdown','pointerup','touchstart','touchend',
  'compositionstart','compositionend','copy','cut','paste','wheel',
];

export function createShadowHost(dataAttr, styleText) {
  const hostEl = document.createElement('div');
  hostEl.setAttribute(dataAttr, '');
  hostEl.style.all = 'initial';
  hostEl.style.position = 'fixed';
  hostEl.style.top = '0'; hostEl.style.left = '0';
  hostEl.style.width = '0'; hostEl.style.height = '0';
  hostEl.style.zIndex = String(Z_MAX);
  const shadow = hostEl.attachShadow({ mode: 'closed' });

  for (const t of FENCED_EVENTS)
    shadow.addEventListener(t, e => e.stopPropagation());

  /* Returned to the caller (spec 009) so a host can RESTYLE itself in place when
     the extension's theme changes. Before this, style text was write-once at
     construction, which is why the on-page surfaces could not follow the theme
     without being torn down and rebuilt. */
  const styleEl = document.createElement('style');
  styleEl.textContent = styleText;
  shadow.appendChild(styleEl);

  const mount = () => {
    if (!hostEl.isConnected && document.documentElement)
      document.documentElement.appendChild(hostEl);
  };
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });

  return { host: hostEl, shadow, styleEl };
}
