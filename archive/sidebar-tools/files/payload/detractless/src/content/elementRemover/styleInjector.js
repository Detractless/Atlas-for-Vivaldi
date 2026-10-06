/* Inject the `display:none !important` rule for the host's selectors.
 *
 * The rule goes into the document, AND into every open shadow root — a document
 * stylesheet cannot cross a shadow boundary, so component-library / web-component
 * UIs (increasingly common on modern React sites) would otherwise be untouchable.
 * The shadow walk is GATED on there being selectors: pages with no rules (the
 * vast majority) pay nothing; only a page you've actually hidden things on does
 * the extra traversal. A short-lived observer re-injects into shadow roots that
 * appear later. */

const STYLE_ID = 'rhe-persistence-style';

function styleFor(root) {
  let style = root.getElementById ? root.getElementById(STYLE_ID) : root.querySelector('#' + STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    const host = root === document ? (document.head || document.documentElement) : root;
    host.appendChild(style);
  }
  return style;
}

/* Collect open shadow roots, bounded so a pathological page can't hang us. */
function shadowRoots(limit) {
  const out = [];
  const walk = (node) => {
    if (out.length >= limit) return;
    const els = node.querySelectorAll ? node.querySelectorAll('*') : [];
    for (let i = 0; i < els.length; i++) {
      const sr = els[i].shadowRoot;
      if (sr) { out.push(sr); walk(sr); if (out.length >= limit) return; }
    }
  };
  try { walk(document); } catch (e) {}
  return out;
}

let shadowObserver = null;

export function injectSelectors(selectors) {
  const css = selectors.length > 0 ? selectors.join(', ') + ' { display: none !important; }' : '';
  styleFor(document).textContent = css;

  if (!css) {
    if (shadowObserver) { shadowObserver.disconnect(); shadowObserver = null; }
    return;
  }

  shadowRoots(200).forEach((sr) => { try { styleFor(sr).textContent = css; } catch (e) {} });

  /* Catch shadow roots created after this pass (SPA mounts a widget later). One
     observer, re-arming the current css into any new root. */
  if (!shadowObserver) {
    shadowObserver = new MutationObserver(() => {
      const cur = styleFor(document).textContent;
      if (!cur) return;
      shadowRoots(200).forEach((sr) => {
        const s = sr.querySelector('#' + STYLE_ID);
        if (!s || s.textContent !== cur) { try { styleFor(sr).textContent = cur; } catch (e) {} }
      });
    });
    try { shadowObserver.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }
}
