import { background } from './messaging.js';
import { elementState } from './elementState.js';
import { getSelector } from './selectorEngine.js';
import { saveRule, deleteRule } from './rulesManager.js';
import { UI_ID } from './ui.js';

/* Remove the target. The durable path is NOT setting inline `style.display`
   (React owns the style prop and wipes it on the next render — the "it comes
   back" bug). Instead, when Remember is on we persist a rule; the persistence
   content script then re-applies a `display:none !important` STYLESHEET that
   survives re-renders and dynamically re-inserted nodes. With Remember off the
   removal is explicitly temporary, so a session-only inline hide is fine. */
function removeTarget(el) {
  if (!el) return;
  const display = window.getComputedStyle(el).display;
  chrome.storage.local.get('rhe_remember', function (res) {
    const remember = res.rhe_remember !== false; // default true
    elementState.archive.push({ element: el, display: display, broad: false });
    if (remember) saveRule(el);        // persist → stylesheet re-applied live
    else el.style.display = 'none';    // temporary, session-only
  });
}

export function handleMouseover(e) {
  if (e.target.closest && e.target.closest("#" + UI_ID)) return;
  elementState.current = e.target;
  if (elementState.current) {
    if (elementState.current !== elementState.previous) {
      if (elementState.previous) elementState.previous.removeAttribute("rhe-css-active");
      elementState.current.setAttribute("rhe-css-active", '');
      elementState.previous = elementState.current;
    }
  }
}

export function handleKeydown(e) {
  const key = e.which || e.keyCode;
  const isModifier = e.ctrlKey || e.metaKey;

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (key === 27) {
    e.preventDefault();
    background.send("store", { "state": "OFF" });
    return;
  }

  if (isModifier && key === 90) {
    const target = elementState.archive.pop();
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      target.element.style.display = target.display;
      const sel = getSelector(target.element, target.broad);
      if (sel) deleteRule(sel);
    }
    return;
  }

  if (!elementState.current) return;

  if (key === 81 && !isModifier) {
    e.preventDefault();
    if (elementState.current.parentNode && elementState.current.parentNode.nodeType === 1) {
      const parent = elementState.current.parentNode;
      if (parent !== document.body && parent !== document.documentElement) {
        elementState.current.removeAttribute("rhe-css-active");
        elementState.current = parent;
        elementState.current.setAttribute("rhe-css-active", '');
        elementState.previous = elementState.current;
      }
    }
  }

  if (key === 87 && !isModifier) {
    e.preventDefault();
    if (elementState.current.firstElementChild) {
      elementState.current.removeAttribute("rhe-css-active");
      elementState.current = elementState.current.firstElementChild;
      elementState.current.setAttribute("rhe-css-active", '');
      elementState.previous = elementState.current;
    }
  }

  if (key === 32 && !isModifier) {
    e.preventDefault();
    e.stopPropagation();

    const el = elementState.current;
    if (el.closest && el.closest("#" + UI_ID)) return;

    removeTarget(el);

    elementState.current.removeAttribute("rhe-css-active");
    elementState.current = null;
    elementState.previous = null;
  }
}

export function handleClick(e) {
  if (e && e.target) {
    if (e.target.closest && e.target.closest("#" + UI_ID)) return;

    if (e.target === elementState.current) {
      e.preventDefault();
      e.stopPropagation();
      removeTarget(e.target);
    }
  }
}