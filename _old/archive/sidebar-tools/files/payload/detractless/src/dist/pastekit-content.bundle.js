(() => {
  // src/pastekit/utils/settings.js
  var SETTINGS_KEY = "pastekit.settings";
  var DEFAULT_SETTINGS = {
    tokenSystem: true,
    // master switch for @ token engine
    tokenAutocomplete: true,
    // show @ dropdown while typing
    fieldDot: true,
    // show the Grammarly-style field dot
    smartDetect: true,
    // detectFieldType-based ranking in the picker
    pickerLimit: 10,
    // max visible rows in the field-dot picker (1–15)
    dotMode: "always"
    // 'always' | 'hover' | 'focus'
  };
  async function getSettings() {
    let stored = {};
    try {
      const bag = await chrome.storage.local.get(SETTINGS_KEY);
      stored = bag && bag[SETTINGS_KEY] || {};
    } catch (_) {
      stored = {};
    }
    return Object.assign({}, DEFAULT_SETTINGS, stored);
  }
  function onSettingsChanged(cb) {
    const listener = (changes, area) => {
      if (area !== "local" || !changes[SETTINGS_KEY]) return;
      const next = Object.assign({}, DEFAULT_SETTINGS, changes[SETTINGS_KEY].newValue || {});
      cb(next);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  // src/pastekit/utils/settingsCache.js
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  function getCachedSettings() {
    return settings;
  }
  function initSettingsCache() {
    getSettings().then((s) => {
      settings = s;
    }).catch(() => {
    });
    onSettingsChanged((s) => {
      settings = s;
    });
  }

  // src/pastekit/components/ShadowHost.js
  var Z_MAX = 2147483647;
  var FENCED_EVENTS = [
    "keydown",
    "keyup",
    "keypress",
    "input",
    "beforeinput",
    "click",
    "dblclick",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "compositionstart",
    "compositionend",
    "copy",
    "cut",
    "paste",
    "wheel"
  ];
  function createShadowHost(dataAttr, styleText) {
    const hostEl = document.createElement("div");
    hostEl.setAttribute(dataAttr, "");
    hostEl.style.all = "initial";
    hostEl.style.position = "fixed";
    hostEl.style.top = "0";
    hostEl.style.left = "0";
    hostEl.style.width = "0";
    hostEl.style.height = "0";
    hostEl.style.zIndex = String(Z_MAX);
    const shadow = hostEl.attachShadow({ mode: "closed" });
    for (const t of FENCED_EVENTS)
      shadow.addEventListener(t, (e) => e.stopPropagation());
    const styleEl = document.createElement("style");
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

  // src/pastekit/components/onPageSurface.js
  var PALETTE = {
    light: {
      canvas: "#E3E3E0",
      card: "#FFFFFF",
      muted: "#EFEEEC",
      hoverOnCanvas: "#F4F3F1",
      ink: "#0A0A09",
      inkSoft: "#76766F",
      inkFaint: "#9A9A95",
      inverse: "#111110",
      onInverse: "#FFFFFF",
      errorBg: "#FBEAE8",
      errorInk: "#B3382E"
    },
    dark: {
      canvas: "#111110",
      card: "#262622",
      muted: "#33332E",
      hoverOnCanvas: "#2D2D29",
      ink: "#F2F1EE",
      inkSoft: "#A0A099",
      inkFaint: "#7B7B75",
      inverse: "#EFEEEC",
      onInverse: "#111110",
      errorBg: "#2E1815",
      errorInk: "#E07A70"
    }
  };
  var FONT = '"Schibsted Grotesk", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
  var EASE = "cubic-bezier(.22,1,.36,1)";
  var Z_MAX2 = 2147483647;
  async function resolveOnPageTheme() {
    let pref = null;
    try {
      const got = await chrome.storage.local.get("_themeCache");
      pref = got && got._themeCache;
    } catch (_) {
    }
    if (pref === "light" || pref === "dark") return pref;
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (_) {
      return "light";
    }
  }
  function onThemeChange(fn) {
    const listener = (changes, area) => {
      if (area === "local" && changes._themeCache) resolveOnPageTheme().then(fn);
    };
    try {
      chrome.storage.onChanged.addListener(listener);
    } catch (_) {
      return () => {
      };
    }
    return () => {
      try {
        chrome.storage.onChanged.removeListener(listener);
      } catch (_) {
      }
    };
  }
  function surfaceCSS(theme) {
    const c = PALETTE[theme] || PALETTE.light;
    return `
  :host { all: initial; }

  /* THE POPOVER: a well that brings its own canvas, because the page cannot be
     trusted to be one. Canvas outer, card rows inside, 11/3 sandwich. */
  .pk-pop {
    position: fixed; display: none; flex-direction: column; gap: 2px;
    box-sizing: border-box; padding: 8px;
    background: ${c.canvas}; border-radius: 18px;
    font: 400 14px ${FONT}; color: ${c.ink};
    z-index: ${Z_MAX2};
    max-height: 264px; overflow-y: auto;
    scrollbar-width: none;
    /* R-041: the one granted shadow, container only. */
    box-shadow: 0 10px 32px rgba(10, 10, 9, 0.18);
  }
  .pk-pop::-webkit-scrollbar { display: none; }
  .pk-pop.open { display: flex; }

  /* A rows container, for the picker, whose list sits under a search field and
     scrolls on its own. The @ menu has no field so its rows are direct children
     of the popover; both arrangements need the same 2px seams, and :first-child
     resolves against whichever parent holds the rows, so the sandwich corners
     stay correct either way. */
  .pk-list {
    display: flex; flex-direction: column; gap: 2px;
    overflow-y: auto; scrollbar-width: none;
    /* min-height:0 lets this actually scroll inside the capped popover. Without
       it a flex child refuses to shrink below its content, and the overflow
       never engages. */
    min-height: 0; flex: 1 1 auto;
  }
  .pk-list::-webkit-scrollbar { display: none; }

  /* \u2500\u2500 Scroll affordance (R-010) on a page surface \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     Same rule as the extension's own pages: this popover hides its scrollbar
     (scrollbar-width:none above), so something else has to say "there is more".
     The behaviour is not reimplemented here, only the paint: the shared
     components/shared/scrollAffordance.js drives it, called with prefix
     'pk-scroll' so it emits these class names instead of the panel's, which
     cannot reach a closed shadow root.

     GEOMETRY IS THE PANEL'S, UNCHANGED (chosen over a popover-scaled variant on
     2026-08-15): 40px fade, card pill on the right at the same 12/8 insets, mono
     count, filled chevron. The colours are literal for the reason the whole file
     is, and the fade's is CANVAS because that is what the rows sit on. */
  .pk-pop .pk-scroll-affordance { position: relative; display: flex; min-height: 0; flex: 1 1 auto; }
  .pk-scroll-affordance > * { flex: 1; min-width: 0; }
  .pk-scroll-fade {
    position: absolute; left: 0; right: 0; height: 40px; pointer-events: none;
    opacity: 1; transition: opacity .18s ${EASE};
  }
  .pk-scroll-fade.hidden { opacity: 0; }
  .pk-scroll-fade-top {
    top: 0; background: linear-gradient(to top, transparent, ${c.canvas});
  }
  .pk-scroll-fade-bot {
    bottom: 0; background: linear-gradient(to bottom, transparent, ${c.canvas});
  }
  /* Card on canvas: the same figure and ground as the rows it counts, so this
     adds a component and no new material. */
  .pk-scroll-count {
    position: absolute; right: 12px;
    display: inline-flex; align-items: center; gap: 5px;
    background: ${c.card}; color: ${c.inkFaint};
    font-family: ${MONO}; font-size: 10px; line-height: 1;
    padding: 5px 9px; border-radius: 999px;
    pointer-events: none; opacity: 1;
    transition: opacity .18s ${EASE};
  }
  .pk-scroll-count.hidden { opacity: 0; }
  .pk-scroll-count-top { top: 8px; }
  .pk-scroll-count-bot { bottom: 8px; }
  /* A filled shape, not two box sides: outlines are banned and this needs none. */
  .pk-scroll-count-chev { width: 6px; height: 6px; flex: none; position: relative; }
  .pk-scroll-count-chev::before {
    content: ""; position: absolute; inset: 0;
    background: ${c.inkFaint};
    clip-path: polygon(50% 100%, 0 30%, 18% 14%, 50% 66%, 82% 14%, 100% 30%);
  }
  .pk-scroll-count-top .pk-scroll-count-chev::before { transform: rotate(180deg); }

  .pk-row {
    display: flex; flex-direction: column; gap: 1px;
    box-sizing: border-box; padding: 8px 12px;
    /* flex:none IS THE BUG FIX, not a tidy-up. These rows live in a flex column
       with a height cap, where the default flex-shrink:1 lets them COMPRESS to
       fit instead of letting the container scroll: ten snippets rendered as ten
       slivers of clipped text. Rows keep their height and the list scrolls. */
    flex: none;
    background: ${c.card}; border-radius: 3px;
    color: ${c.ink}; font: 400 13px ${FONT};
    cursor: pointer; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: background .14s ${EASE};
  }
  .pk-row:first-child { border-radius: 11px 11px 3px 3px; }
  .pk-row:last-child { border-radius: 3px 3px 11px 11px; }
  .pk-row:only-child { border-radius: 11px; }
  /* ADR-1: hover names what is UNDERNEATH. A row sits on the WELL, which is
     canvas, so hover moves away from CANVAS tone, not card tone. Getting this
     wrong is not subtle: the card hover is a much bigger step and reads as a
     press rather than a hover, in both themes. This is the same mistake R-032
     already corrected in the panel, made again here because the palette key was
     called plain "hover" and answered no question about what it sat on. */
  .pk-row:hover, .pk-row.active { background: ${c.hoverOnCanvas}; }
  .pk-row b { font-weight: 700; }
  .pk-ds {
    font-size: 11px; color: ${c.inkFaint};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* The search field: the panel's muted input shape. Surface separates it from
     the rows, so there is no line, which is what the old border was doing. */
  .pk-search {
    box-sizing: border-box; width: 100%;
    background: ${c.muted}; border-radius: 8px;
    padding: 8px 12px; margin-bottom: 8px;
    font: 400 13px ${FONT}; color: ${c.ink};
    border: none; outline: none;
    /* Same trap as the rows: a compressible search field is a squashed one. */
    flex: none;
  }
  .pk-search::placeholder { color: ${c.inkFaint}; }

  /* R-038's empty state, scaled for a popover: glyph, short line, centred. */
  .pk-empty {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 18px 12px; text-align: center;
    background: ${c.card}; border-radius: 11px;
    color: ${c.inkFaint}; font: 400 12px ${FONT};
  }
  .pk-empty svg { width: 22px; height: 22px; }

  /* THE CORNER TOAST: the clip confirmation and the fill indicator, both pinned
     bottom-right. An INVERSE FILL, which is the extension's own vocabulary for
     a primary surface, and which is why these get NO shadow even though they
     float on a foreign page: R-041's exception exists for surfaces that separate
     by subtle surface contrast, and near-black on anything (or near-white in
     dark) separates by LUMINANCE instead. The exception is for popovers that
     need it, not a licence for everything on a page. */
  .pk-toast {
    display: flex; align-items: center; gap: 10px;
    box-sizing: border-box; padding: 9px 16px;
    background: ${c.inverse}; color: ${c.onInverse};
    border-radius: 999px;
    font: 500 13px ${FONT};
    cursor: default; user-select: none;
    max-width: 320px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    animation: pk-rise .18s ${EASE};
  }
  /* Errors use the extension's danger pair, the same one an armed Delete row
     uses. The old toast invented its own red that matched no token at all. */
  .pk-toast.error { background: ${c.errorBg}; color: ${c.errorInk}; }
  @keyframes pk-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }
  .pk-toast .pk-preview {
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .pk-toast button {
    all: unset; cursor: pointer; padding: 0 4px; opacity: .65;
  }
  .pk-toast button:hover { opacity: 1; }
  /* Queue progress: filled, next, pending. "Next" was an outlined dot, and
     outlines are banned; it is a full-size solid against half-size pending
     dots now, so the state reads by weight rather than by a ring. */
  .pk-qdot {
    width: 6px; height: 6px; border-radius: 50%;
    background: ${c.onInverse}; opacity: .35; flex: none;
  }
  .pk-qdot.filled { opacity: .7; }
  .pk-qdot.next { width: 9px; height: 9px; opacity: 1; }

  /* The dot. Unchanged except that its shadow is gone: it sits ON the page, not
     over it, so it never qualified for R-041's exception. */
  .pk-dot {
    position: fixed; box-sizing: border-box;
    border-radius: 50%; background: ${c.inverse};
    cursor: pointer; display: none;
    transition: transform .14s ${EASE};
  }
  .pk-dot::after {
    content: 'P'; color: ${c.onInverse};
    font: 700 11px ${FONT};
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%;
  }
  .pk-dot:hover { transform: scale(1.12); }
  `;
  }
  var SEARCH_GLYPH = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

  // src/pastekit/utils/messages.js
  var MSG = {
    // service-worker DB API (popup/options/content -> SW)
    SNIPPET_LIST: "snippet.list",
    SNIPPET_GET_BY_NAME: "snippet.getByName",
    SNIPPET_SEARCH: "snippet.search",
    // Content-script surface. SUGGEST returns {id, name} only — never snippet
    // bodies — so a page's renderer never holds content it has no use for. GET
    // pulls the single snippet the user actually chose, at commit time.
    SNIPPET_SUGGEST: "snippet.suggest",
    SNIPPET_GET: "snippet.get",
    SNIPPET_SAVE: "snippet.save",
    SNIPPET_DELETE: "snippet.delete",
    FOLDER_LIST: "folder.list",
    FOLDER_SAVE: "folder.save",
    FOLDER_DELETE: "folder.delete",
    TAG_LIST: "tag.list",
    EXPORT_JSON: "export.json",
    IMPORT_JSON: "import.json",
    // broadcast (SW -> everyone, fire-and-forget)
    SNIPPETS_CHANGED: "snippets.changed",
    // fill mode (popup -> tab content script; CS -> SW)
    FILL_START: "fill.start",
    FILL_STATUS: "fill.status",
    FILL_CANCEL: "fill.cancel",
    FILL_ENDED: "fill.ended",
    FILL_ADVANCE: "fill.advance",
    // quick clip via context menu (SW <-> tab content script)
    GET_SELECTION: "clip.getSelection",
    CLIP_SAVED: "clip.saved"
  };
  async function call(type, payload = {}) {
    let res;
    try {
      res = await chrome.runtime.sendMessage(Object.assign({ type }, payload));
    } catch (e) {
      throw new Error(String(e && e.message ? e.message : e));
    }
    if (!res || !res.ok) throw new Error(res && res.error || "no response");
    return res.result;
  }

  // src/pastekit/components/InsertText.js
  var ALLOWED_TAGS = /* @__PURE__ */ new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "STRIKE",
    "P",
    "BR",
    "SPAN",
    "DIV",
    "A",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "CODE",
    "PRE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TD",
    "TH",
    "SUB",
    "SUP",
    "SMALL",
    "MARK"
  ]);
  var ALLOWED_ATTR = /* @__PURE__ */ new Set(["href", "title", "colspan", "rowspan"]);
  var BAD_HREF = /^\s*(javascript|data|vbscript):/i;
  function sanitizeHtml(html, doc) {
    doc = doc || document;
    const win = doc.defaultView || window;
    const parsed = new win.DOMParser().parseFromString(String(html == null ? "" : html), "text/html");
    sanitizeNode(parsed.body);
    return parsed.body.innerHTML;
  }
  function sanitizeNode(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) {
        node.removeChild(child);
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (!ALLOWED_TAGS.has(child.tagName)) {
        sanitizeNode(child);
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        continue;
      }
      scrubAttributes(child);
      sanitizeNode(child);
    }
  }
  function scrubAttributes(el) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTR.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" && BAD_HREF.test(attr.value || "")) el.removeAttribute(attr.name);
    }
  }
  function insertText(element, text, html) {
    if (!element) return false;
    element.focus();
    text = text == null ? "" : String(text);
    const tag = element.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA")
      return insertIntoTextField(element, text);
    if (element.isContentEditable || isEditableHost(element))
      return insertIntoEditable(element, text, html);
    return false;
  }
  function insertIntoTextField(element, text) {
    const win = element.ownerDocument.defaultView || window;
    const doc = element.ownerDocument;
    const payload = element.tagName === "INPUT" ? text.replace(/[\r\n]+/g, " ") : text;
    if (doc.activeElement === element) {
      try {
        if (doc.execCommand("insertText", false, payload)) return true;
      } catch (_) {
      }
    }
    const start = element.selectionStart != null ? element.selectionStart : element.value.length;
    const end = element.selectionEnd != null ? element.selectionEnd : element.value.length;
    const next = element.value.slice(0, start) + payload + element.value.slice(end);
    setNativeValue(win, element, next);
    const caret = start + payload.length;
    try {
      element.setSelectionRange(caret, caret);
    } catch (_) {
    }
    dispatch(win, element, "input", { inputType: "insertText", data: payload });
    dispatch(win, element, "change");
    return true;
  }
  function insertIntoEditable(element, text, html) {
    const win = element.ownerDocument.defaultView || window;
    const doc = element.ownerDocument;
    const sel = doc.getSelection();
    if (html && insertHtmlAtSelection(win, doc, sel, element, html)) return true;
    if (doc.activeElement === element || element.contains(doc.activeElement)) {
      try {
        if (doc.execCommand("insertText", false, text)) {
          dispatch(win, element, "input", { inputType: "insertText", data: text });
          return true;
        }
      } catch (_) {
      }
    }
    return insertPlainAtSelection(win, doc, sel, element, text);
  }
  function insertHtmlAtSelection(win, doc, sel, element, html) {
    const clean = sanitizeHtml(html, doc);
    try {
      if (doc.queryCommandSupported && doc.queryCommandSupported("insertHTML") && doc.execCommand("insertHTML", false, clean)) {
        dispatch(win, element, "input", { inputType: "insertFromPaste" });
        return true;
      }
    } catch (_) {
    }
    if (!sel || !sel.rangeCount) return false;
    try {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = range.createContextualFragment(clean);
      insertFragment(sel, range, frag);
      dispatch(win, element, "input", { inputType: "insertFromPaste" });
      return true;
    } catch (_) {
      return false;
    }
  }
  function insertPlainAtSelection(win, doc, sel, element, text) {
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = doc.createDocumentFragment();
    text.split(/\r\n?|\n/).forEach((line, i) => {
      if (i) frag.appendChild(doc.createElement("br"));
      frag.appendChild(doc.createTextNode(line));
    });
    insertFragment(sel, range, frag);
    dispatch(win, element, "input", { inputType: "insertText", data: text });
    return true;
  }
  function insertFragment(sel, range, frag) {
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  function setNativeValue(win, element, value) {
    const proto = element.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const ownDesc = Object.getOwnPropertyDescriptor(element, "value");
    const tracker = element._valueTracker;
    if (tracker) tracker.setValue(ownDesc ? ownDesc.value : "");
    if (desc && desc.set) desc.set.call(element, value);
    else element.value = value;
  }
  function dispatch(win, element, type, opts) {
    let evt;
    try {
      if (type === "input" && opts && ("inputType" in opts || "data" in opts)) {
        evt = new win.InputEvent("input", {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType: opts.inputType || "insertText",
          data: "data" in opts ? opts.data : null
        });
      } else {
        evt = new win.Event(type, { bubbles: true, cancelable: false, composed: true });
      }
    } catch (_) {
      evt = new win.Event(type, { bubbles: true });
    }
    element.dispatchEvent(evt);
  }
  function isEditableHost(el) {
    const ce = el.getAttribute && el.getAttribute("contenteditable");
    return ce === "" || ce === "true" || el.ownerDocument && el.ownerDocument.designMode === "on";
  }

  // src/components/shared/scrollAffordance.js
  function make(tag, className) {
    const el = document.createElement(tag);
    el.className = className;
    return el;
  }
  function attachScrollAffordance(scroller, options = {}) {
    if (!scroller) return { refresh: () => {
    }, host: null };
    const p = options.prefix || "scroll";
    let host = options.host;
    if (!host) {
      host = make("div", `${p}-affordance`);
      scroller.parentNode.insertBefore(host, scroller);
      host.appendChild(scroller);
    }
    const fadeTop = make("div", `${p}-fade ${p}-fade-top hidden`);
    const fadeBot = make("div", `${p}-fade ${p}-fade-bot hidden`);
    const countTop = make("span", `${p}-count ${p}-count-top hidden`);
    const countBot = make("span", `${p}-count ${p}-count-bot hidden`);
    for (const pill of [countTop, countBot]) {
      pill.appendChild(make("i", `${p}-count-chev`));
      pill.appendChild(document.createTextNode(""));
    }
    host.append(fadeTop, fadeBot, countTop, countBot);
    const syncRadius = () => {
      const cs = getComputedStyle(scroller);
      fadeTop.style.borderRadius = `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} 0 0`;
      fadeBot.style.borderRadius = `0 0 ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}`;
    };
    syncRadius();
    const noun = options.noun ? " " + options.noun : "";
    const items = () => options.items ? scroller.querySelectorAll(options.items) : scroller.children;
    const setState = (above, below) => {
      fadeTop.classList.toggle("hidden", above === 0);
      fadeBot.classList.toggle("hidden", below === 0);
      countTop.classList.toggle("hidden", above === 0);
      countBot.classList.toggle("hidden", below === 0);
      countTop.lastChild.textContent = above + noun + " above";
      countBot.lastChild.textContent = below + noun + " below";
    };
    const refresh = () => {
      const box = scroller.getBoundingClientRect();
      if (box.height === 0) {
        setState(0, 0);
        return;
      }
      let above = 0, below = 0;
      for (const el of items()) {
        if (el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.top < box.top - 2) above++;
        else if (r.bottom > box.bottom + 2) below++;
      }
      setState(above, below);
    };
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        refresh();
      });
    };
    scroller.addEventListener("scroll", refresh, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        syncRadius();
        schedule();
      });
      ro.observe(scroller);
      for (const child of scroller.children) ro.observe(child);
    }
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(schedule).observe(scroller, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "style", "class"]
      });
    }
    schedule();
    return { refresh, host };
  }

  // src/pastekit/components/SnippetPicker.js
  var DOT = 22;
  function createSnippetPicker(shadow, getField) {
    const overlayEl = document.createElement("div");
    overlayEl.className = "pk-pop";
    const searchEl = document.createElement("input");
    searchEl.className = "pk-search";
    searchEl.type = "text";
    searchEl.placeholder = "Search snippets and #tags\u2026";
    const listEl = document.createElement("div");
    listEl.className = "pk-list";
    const affEl = document.createElement("div");
    affEl.className = "pk-scroll-affordance";
    affEl.appendChild(listEl);
    overlayEl.append(searchEl, affEl);
    shadow.append(overlayEl);
    const listAff = attachScrollAffordance(listEl, {
      host: affEl,
      prefix: "pk-scroll",
      noun: ""
    });
    let snippets = [], activeIdx = -1;
    let pickerLimit = 10;
    function place(r) {
      const ow = 320, oh = Math.min(overlayEl.scrollHeight || 400, innerHeight - 16);
      let left = Math.min(r.left - DOT - 6, innerWidth - ow - 8);
      let top2 = r.top + 4 + DOT + 6;
      if (top2 + oh > innerHeight - 8) top2 = Math.max(8, r.top - oh - 6);
      overlayEl.style.left = Math.max(8, left) + "px";
      overlayEl.style.top = top2 + "px";
      overlayEl.style.width = ow + "px";
    }
    function toggle() {
      if (overlayEl.classList.contains("open")) {
        close();
        return;
      }
      overlayEl.classList.add("open");
      searchEl.value = "";
      render("");
      const field = getField();
      if (field) place(field.getBoundingClientRect());
      listAff.refresh();
      setTimeout(() => {
        try {
          searchEl.focus();
        } catch (_) {
        }
      }, 0);
    }
    function close() {
      overlayEl.classList.remove("open");
    }
    function isOpen() {
      return overlayEl.classList.contains("open");
    }
    function reposition() {
      const field = getField();
      if (field && isOpen()) place(field.getBoundingClientRect());
    }
    async function render(query) {
      try {
        snippets = await call(MSG.SNIPPET_SEARCH, { query: query || "" });
      } catch (_) {
        snippets = [];
      }
      activeIdx = snippets.length ? 0 : -1;
      drawList();
    }
    function drawList() {
      listEl.replaceChildren();
      if (!snippets.length) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "pk-empty";
        const glyph = document.createElement("span");
        glyph.innerHTML = SEARCH_GLYPH;
        emptyEl.append(glyph, document.createTextNode("No snippets match"));
        listEl.appendChild(emptyEl);
        listEl.style.maxHeight = "";
        return;
      }
      snippets.forEach((s, i) => listEl.appendChild(rowFor(s, i)));
      const firstEl = listEl.querySelector(".pk-row");
      if (firstEl instanceof HTMLElement && snippets.length > pickerLimit) {
        listEl.style.maxHeight = firstEl.offsetHeight * pickerLimit + 8 + "px";
      } else {
        listEl.style.maxHeight = "";
      }
    }
    function rowFor(s, i) {
      const itemEl = document.createElement("div");
      itemEl.className = "pk-row" + (i === activeIdx ? " active" : "");
      const nmEl = document.createElement("span");
      nmEl.textContent = s.name;
      itemEl.appendChild(nmEl);
      if (s.description) {
        const dsEl = document.createElement("span");
        dsEl.className = "pk-ds";
        dsEl.textContent = s.description;
        itemEl.appendChild(dsEl);
      }
      itemEl.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        choose(s);
      }, true);
      return itemEl;
    }
    function choose(s) {
      const field = getField();
      if (field) insertText(field, s.contentText, s.contentHtml);
      close();
    }
    function move(delta) {
      if (!snippets.length) return;
      activeIdx = (activeIdx + delta + snippets.length) % snippets.length;
      drawList();
      const el = listEl.children[activeIdx];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }
    searchEl.addEventListener("input", () => render(searchEl.value));
    searchEl.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        move(1);
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        move(-1);
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (snippets[activeIdx]) choose(snippets[activeIdx]);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        close();
        const field = getField();
        if (field) field.focus();
      }
    });
    return {
      toggle,
      close,
      isOpen,
      reposition,
      setPickerLimit(n) {
        pickerLimit = n;
      }
    };
  }

  // src/pastekit/components/FieldTracking.js
  function installFieldTracking({ host, shadow, isEditable, tracker, picker, requestPositionAll }) {
    const realTarget = (ev) => ev.composedPath ? ev.composedPath()[0] : ev.target;
    function updateCursor(ev) {
      tracker.mouseX = ev.clientX;
      tracker.mouseY = ev.clientY;
      if (tracker.dotMode === "hover") requestPositionAll();
    }
    document.addEventListener("pointermove", updateCursor, { capture: true, passive: true });
    document.addEventListener("pointerover", updateCursor, { capture: true, passive: true });
    document.addEventListener("focusin", (ev) => {
      const t = realTarget(ev);
      if (t === host || shadow.contains(t)) return;
      if (isEditable(t)) {
        tracker.field = t;
        if (tracker.dotMode === "focus") requestPositionAll();
      }
    }, true);
    document.addEventListener("focusout", (ev) => {
      if (tracker.dotMode !== "focus") return;
      const rel = ev.relatedTarget;
      if (rel === host || shadow.contains(rel)) return;
      setTimeout(requestPositionAll, 0);
    }, true);
    document.addEventListener("pointerdown", (ev) => {
      const t = realTarget(ev);
      if (t !== host && !shadow.contains(t)) picker.close();
    }, true);
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && picker.isOpen()) {
        ev.stopImmediatePropagation();
        picker.close();
      }
    }, true);
  }

  // src/pastekit/components/FieldDot.js
  var EDITABLE_SELECTOR = [
    "textarea",
    "input:not([type]),input[type=text],input[type=search],input[type=email],input[type=url],input[type=tel],input[type=number],input[type=password]",
    '[contenteditable=""],[contenteditable=true],[contenteditable=plaintext-only]'
  ].join(",");
  var OPT_OUT = "[data-pastekit=false],[data-gramm=false]";
  var DOT2 = 22;
  var HOVER_MARGIN = 16;
  var DOT_SIZE_STYLE = `
  * { box-sizing: border-box; }
  .pk-dot { width: ${DOT2}px; height: ${DOT2}px; }
`;
  function initFieldDot() {
    const dotEnabled = () => {
      const s = getCachedSettings();
      return !s || s.fieldDot !== false;
    };
    const isEditable = (el) => el instanceof HTMLElement && el.matches(EDITABLE_SELECTOR) && !el.matches(OPT_OUT) && !el.closest(OPT_OUT) && !(el instanceof HTMLInputElement && (el.readOnly || el.disabled)) && !(el instanceof HTMLTextAreaElement && (el.readOnly || el.disabled));
    const { host, shadow, styleEl } = createShadowHost(
      "data-pastekit-root",
      surfaceCSS("light") + DOT_SIZE_STYLE
    );
    const dressShadow = (t) => {
      styleEl.textContent = surfaceCSS(t) + DOT_SIZE_STYLE;
    };
    resolveOnPageTheme().then(dressShadow);
    onThemeChange(dressShadow);
    const dotMap = /* @__PURE__ */ new Map();
    const tracker = { field: null, dotMode: "always", mouseX: -9999, mouseY: -9999 };
    let rafPending = false;
    const picker = createSnippetPicker(shadow, () => tracker.field);
    getSettings().then((s) => {
      picker.setPickerLimit(s.pickerLimit ?? 10);
      tracker.dotMode = s.dotMode || "always";
    }).catch(() => {
    });
    onSettingsChanged((s) => {
      picker.setPickerLimit(s.pickerLimit ?? 10);
      tracker.dotMode = s.dotMode || "always";
      requestPositionAll();
    });
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
      if (!el.isConnected) {
        removeDot(el);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0 || r.bottom < 0 || r.top > innerHeight || clippedOut(el, r)) {
        dotEl.style.display = "none";
        return;
      }
      const pickerActive = picker.isOpen() && tracker.field === el;
      const nearField = tracker.mouseX >= r.left - HOVER_MARGIN && tracker.mouseX <= r.right + HOVER_MARGIN && tracker.mouseY >= r.top - HOVER_MARGIN && tracker.mouseY <= r.bottom + HOVER_MARGIN;
      const modeVisible = tracker.dotMode === "always" || tracker.dotMode === "hover" && nearField || tracker.dotMode === "focus" && (document.activeElement === el || pickerActive);
      dotEl.style.left = Math.max(4, r.left - DOT2 - 6) + "px";
      dotEl.style.top = Math.max(r.top + 4, 4) + "px";
      dotEl.style.display = dotEnabled() && modeVisible ? "block" : "none";
    }
    function positionAll() {
      rafPending = false;
      for (const [el, { dotEl }] of dotMap) positionDot(el, dotEl);
      picker.reposition();
    }
    const requestPositionAll = () => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(positionAll);
      }
    };
    function addDot(el) {
      if (dotMap.has(el)) return;
      const dotEl = document.createElement("div");
      dotEl.className = "pk-dot";
      shadow.appendChild(dotEl);
      const ro = new ResizeObserver(requestPositionAll);
      ro.observe(el);
      dotMap.set(el, { dotEl, ro });
      positionDot(el, dotEl);
      dotEl.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        tracker.field = el;
        el.focus();
        picker.toggle();
      }, true);
      dotEl.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }, true);
    }
    function removeDot(el) {
      const entry = dotMap.get(el);
      if (!entry) return;
      entry.ro.disconnect();
      entry.dotEl.remove();
      dotMap.delete(el);
      if (tracker.field === el) {
        tracker.field = null;
        picker.close();
      }
    }
    function scanAndSync() {
      if (!dotEnabled()) {
        for (const [el] of [...dotMap]) removeDot(el);
        return;
      }
      const foundEls = document.querySelectorAll(EDITABLE_SELECTOR);
      const current = /* @__PURE__ */ new Set();
      for (const el of foundEls) {
        if (isEditable(el)) current.add(el);
      }
      for (const [el] of [...dotMap]) {
        if (!current.has(el)) removeDot(el);
      }
      for (const el of current) {
        if (!dotMap.has(el)) addDot(el);
      }
    }
    scanAndSync();
    new MutationObserver(() => {
      scanAndSync();
      requestPositionAll();
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["contenteditable", "readonly", "disabled", "type", "hidden"]
    });
    document.addEventListener("scroll", requestPositionAll, { capture: true, passive: true });
    addEventListener("resize", requestPositionAll, { passive: true });
    installFieldTracking({ host, shadow, isEditable, tracker, picker, requestPositionAll });
  }

  // src/pastekit/utils/fuzzyMatch.js
  function fuzzyScore(needle, hay) {
    let hi = 0, score = 0, streak = 0;
    for (let i = 0; i < needle.length; i++) {
      const idx = hay.indexOf(needle[i], hi);
      if (idx === -1) return 0;
      streak = idx === hi ? streak + 1 : 0;
      score += 1 + streak;
      if (idx === 0) score += 2;
      hi = idx + 1;
    }
    return score;
  }
  function fuzzyHighlight(query, name) {
    const q = query.toLowerCase(), n = name.toLowerCase();
    if (!q) return { score: 1, html: escapeHtml(name) };
    const score = fuzzyScore(q, n);
    if (score === 0) return null;
    let hi = 0, out = "", last = 0;
    for (let i = 0; i < q.length; i++) {
      const idx = n.indexOf(q[i], hi);
      out += escapeHtml(name.slice(last, idx)) + "<b>" + escapeHtml(name[idx]) + "</b>";
      last = idx + 1;
      hi = idx + 1;
    }
    out += escapeHtml(name.slice(last));
    return { score, html: out };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  // src/pastekit/components/CaretRect.js
  var MIRROR_PROPS = [
    "boxSizing",
    "width",
    "height",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontFamily",
    "lineHeight",
    "textAlign",
    "textTransform",
    "textIndent",
    "letterSpacing",
    "wordSpacing",
    "whiteSpace",
    "tabSize",
    "direction"
  ];
  function caretRectForInput(el, caretIndex) {
    const doc = el.ownerDocument;
    const cs = getComputedStyle(el);
    const divEl = doc.createElement("div");
    const st = divEl.style;
    st.position = "absolute";
    st.visibility = "hidden";
    st.whiteSpace = el.tagName === "INPUT" ? "pre" : "pre-wrap";
    st.wordWrap = "break-word";
    st.overflow = "hidden";
    for (const prop of MIRROR_PROPS) st[prop] = cs[prop];
    if (el.tagName === "INPUT") st.whiteSpace = "pre";
    const rect = el.getBoundingClientRect();
    st.top = "0";
    st.left = "-9999px";
    doc.body.appendChild(divEl);
    const value = el.value;
    divEl.textContent = value.slice(0, caretIndex);
    const markerEl = doc.createElement("span");
    markerEl.textContent = value.slice(caretIndex) || ".";
    divEl.appendChild(markerEl);
    const mRect = markerEl.getBoundingClientRect();
    const divRect = divEl.getBoundingClientRect();
    const relTop = mRect.top - divRect.top;
    const relLeft = mRect.left - divRect.left;
    doc.body.removeChild(divEl);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    return {
      left: rect.left + relLeft - el.scrollLeft,
      top: rect.top + relTop - el.scrollTop,
      bottom: rect.top + relTop - el.scrollTop + lineHeight
    };
  }
  function caretRectForCE(node, offset) {
    try {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      let rect = range.getBoundingClientRect();
      if ((!rect || rect.top === 0 && rect.left === 0) && node.parentElement) {
        rect = node.parentElement.getBoundingClientRect();
      }
      return { left: rect.left, top: rect.top, bottom: rect.bottom };
    } catch (_) {
      return null;
    }
  }

  // src/pastekit/components/TokenMenu.js
  var MENU_W = 320;
  var MENU_H = 264;
  function createTokenMenu(onPick) {
    const { host, shadow, styleEl } = createShadowHost(
      "data-pastekit-token",
      surfaceCSS("light")
    );
    resolveOnPageTheme().then((t) => {
      styleEl.textContent = surfaceCSS(t);
    });
    onThemeChange((t) => {
      styleEl.textContent = surfaceCSS(t);
    });
    const menuEl = document.createElement("div");
    menuEl.className = "pk-pop";
    const affEl = document.createElement("div");
    affEl.className = "pk-scroll-affordance";
    const listEl = document.createElement("div");
    listEl.className = "pk-list";
    affEl.appendChild(listEl);
    menuEl.appendChild(affEl);
    shadow.append(menuEl);
    const listAff = attachScrollAffordance(listEl, {
      host: affEl,
      prefix: "pk-scroll",
      noun: ""
    });
    function draw(matches, activeIdx) {
      listEl.replaceChildren();
      if (!matches.length) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "pk-empty";
        const glyph = document.createElement("span");
        glyph.innerHTML = SEARCH_GLYPH;
        emptyEl.append(glyph, document.createTextNode("No snippets match"));
        listEl.appendChild(emptyEl);
        listAff.refresh();
        return;
      }
      matches.forEach((m, i) => {
        const rowEl = document.createElement("div");
        rowEl.className = "pk-row" + (i === activeIdx ? " active" : "");
        const nameEl = document.createElement("span");
        nameEl.appendChild(fuzzyHtmlToNodes(m.html));
        rowEl.appendChild(nameEl);
        if (m.s.description) {
          const dsEl = document.createElement("span");
          dsEl.className = "pk-ds";
          dsEl.textContent = m.s.description;
          rowEl.appendChild(dsEl);
        }
        rowEl.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onPick(m.s);
        }, true);
        listEl.appendChild(rowEl);
      });
      listAff.refresh();
    }
    function position(anchorRect) {
      if (!anchorRect) return;
      const mh = Math.min(MENU_H, menuEl.scrollHeight || MENU_H);
      let left = anchorRect.left;
      let top2 = anchorRect.bottom + 4;
      if (left + MENU_W > innerWidth - 8) left = Math.max(8, innerWidth - MENU_W - 8);
      if (top2 + mh > innerHeight - 8) top2 = Math.max(8, anchorRect.top - mh - 4);
      menuEl.style.left = Math.max(8, left) + "px";
      menuEl.style.top = top2 + "px";
      menuEl.style.width = MENU_W + "px";
    }
    return {
      host,
      shadow,
      draw,
      position,
      /* refresh() after the class, not before: the menu measures zero while it is
         still display:none, and the affordance would clear itself to "0 above,
         0 below" over a list that does overflow. */
      open() {
        const wasOpen = menuEl.classList.contains("open");
        menuEl.classList.add("open");
        listAff.refresh();
        return wasOpen;
      },
      close() {
        menuEl.classList.remove("open");
      },
      isOpen() {
        return menuEl.classList.contains("open");
      }
    };
  }
  function fuzzyHtmlToNodes(html) {
    const frag = document.createDocumentFragment();
    let s = String(html || "");
    while (s) {
      const open = s.indexOf("<b>");
      if (open === -1) {
        frag.appendChild(document.createTextNode(unescapeHtml(s)));
        break;
      }
      if (open > 0) frag.appendChild(document.createTextNode(unescapeHtml(s.slice(0, open))));
      const close = s.indexOf("</b>", open + 3);
      if (close === -1) {
        frag.appendChild(document.createTextNode(unescapeHtml(s.slice(open))));
        break;
      }
      const boldEl = document.createElement("b");
      boldEl.textContent = unescapeHtml(s.slice(open + 3, close));
      frag.appendChild(boldEl);
      s = s.slice(close + 4);
    }
    return frag;
  }
  function unescapeHtml(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  }

  // src/pastekit/components/TriggerParse.js
  var TRIGGER = "@";
  var REQUIRE_LEADING_SPACE = true;
  var MAX_QUERY_LENGTH = 40;
  function parseTrigger() {
    const el = document.activeElement;
    if (!el) return null;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const caret = el.selectionStart;
      if (caret == null || caret !== el.selectionEnd) return null;
      const info = lookBack(el.value.slice(0, caret));
      if (!info) return null;
      return { el, kind: "input", start: info.start, query: info.query, caret };
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== 3) return null;
      const offset = range.startOffset;
      const info = lookBack((node.textContent || "").slice(0, offset));
      if (!info) return null;
      return { el, kind: "ce", node, start: info.start, offset, query: info.query };
    }
    return null;
  }
  function lookBack(textBeforeCaret) {
    const at = textBeforeCaret.lastIndexOf(TRIGGER);
    if (at === -1) return null;
    const query = textBeforeCaret.slice(at + 1);
    if (/\s/.test(query)) return null;
    if (REQUIRE_LEADING_SPACE && at > 0) {
      const prev = textBeforeCaret[at - 1];
      if (!/\s/.test(prev)) return null;
    }
    if (query.length > MAX_QUERY_LENGTH) return null;
    return { start: at, query };
  }

  // src/pastekit/components/TokenAutocomplete.js
  var MAX_ITEMS = 8;
  var SUGGEST_DEBOUNCE_MS = 60;
  function initTokenAutocomplete() {
    function enabled() {
      const s = getCachedSettings();
      if (!s) return true;
      return s.tokenSystem !== false && s.tokenAutocomplete !== false;
    }
    let reqSeq = 0;
    let suggestTimer = null;
    async function fetchSuggestions(query) {
      const seq = ++reqSeq;
      let items;
      try {
        items = await call(MSG.SNIPPET_SUGGEST, { query, limit: MAX_ITEMS });
      } catch (_) {
        return null;
      }
      if (seq !== reqSeq) return null;
      return items || [];
    }
    let target = null;
    let matches = [];
    let activeIdx = 0;
    let open = false;
    const menu = createTokenMenu((suggestion) => commit(suggestion));
    function decorate(items, query) {
      return items.map((s) => {
        const f = fuzzyHighlight(query, s.name || "");
        return { s, score: f ? f.score : 0, html: f ? f.html : s.name || "" };
      });
    }
    function scheduleShowMenu(info) {
      if (suggestTimer) clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => {
        suggestTimer = null;
        showMenu(info);
      }, SUGGEST_DEBOUNCE_MS);
    }
    async function showMenu(info) {
      target = info;
      const items = await fetchSuggestions(info.query);
      if (items === null) return;
      if (target !== info) return;
      matches = decorate(items, info.query);
      activeIdx = 0;
      open = true;
      menu.open();
      menu.draw(matches, activeIdx);
      const rect = info.kind === "input" ? caretRectForInput(info.el, info.start) : caretRectForCE(info.node, info.start);
      menu.position(rect);
    }
    function hideMenu() {
      if (suggestTimer) {
        clearTimeout(suggestTimer);
        suggestTimer = null;
      }
      reqSeq++;
      open = false;
      target = null;
      matches = [];
      activeIdx = 0;
      menu.close();
    }
    async function commit(suggestion) {
      if (!target || !suggestion) return;
      const info = target;
      let snippet;
      try {
        snippet = await call(MSG.SNIPPET_GET, { id: suggestion.id });
      } catch (_) {
        hideMenu();
        return;
      }
      if (!snippet) {
        hideMenu();
        return;
      }
      if (target !== info) {
        hideMenu();
        return;
      }
      if (info.kind === "input") {
        const el = info.el;
        if (document.activeElement !== el) {
          hideMenu();
          return;
        }
        const caret = el.selectionStart;
        try {
          el.setSelectionRange(info.start, caret);
        } catch (_) {
        }
        insertText(el, snippet.contentText, null);
      } else {
        const sel = window.getSelection();
        if (!sel) return;
        try {
          const range = document.createRange();
          range.setStart(info.node, info.start);
          const cur = sel.getRangeAt(0);
          range.setEnd(cur.startContainer, cur.startOffset);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {
        }
        insertText(info.el, snippet.contentText, snippet.contentHtml);
      }
      hideMenu();
    }
    function composing(e) {
      return e.isComposing || e.keyCode === 229;
    }
    document.addEventListener("input", (e) => {
      if (!enabled()) {
        if (open) hideMenu();
        return;
      }
      if (
        /** @type {InputEvent} */
        e.isComposing
      ) return;
      reevaluate();
    }, true);
    document.addEventListener("keyup", (e) => {
      if (!enabled()) {
        if (open) hideMenu();
        return;
      }
      if (composing(e)) return;
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) reevaluate();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (!open) return;
      if (composing(e)) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (matches.length) {
            activeIdx = (activeIdx + 1) % matches.length;
            menu.draw(matches, activeIdx);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          if (matches.length) {
            activeIdx = (activeIdx - 1 + matches.length) % matches.length;
            menu.draw(matches, activeIdx);
          }
          break;
        case "Enter":
        case "Tab":
          if (matches[activeIdx]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            commit(matches[activeIdx].s);
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          hideMenu();
          break;
      }
    }, true);
    function reevaluate() {
      const info = parseTrigger();
      if (info) scheduleShowMenu(info);
      else if (open) hideMenu();
    }
    document.addEventListener("focusout", () => setTimeout(() => {
      if (open) hideMenu();
    }, 0), true);
    document.addEventListener("scroll", () => {
      if (open) hideMenu();
    }, { capture: true, passive: true });
    document.addEventListener("pointerdown", (e) => {
      const t = e.composedPath ? e.composedPath()[0] : e.target;
      if (t !== menu.host && !menu.shadow.contains(t instanceof Node ? t : null)) {
        if (open) hideMenu();
      }
    }, true);
  }

  // src/pastekit/components/FillQueue.js
  var FillQueue = class {
    constructor(snippets) {
      this.items = (snippets || []).map((s) => Object.assign({}, s, { filled: false }));
      this.cursor = 0;
      this._listeners = { advance: [], done: [], cancel: [] };
    }
    on(evt, fn) {
      (this._listeners[evt] || (this._listeners[evt] = [])).push(fn);
      return this;
    }
    _emit(evt, payload) {
      for (const fn of this._listeners[evt] || []) fn(payload);
    }
    get current() {
      return this.items[this.cursor] || null;
    }
    get remaining() {
      return this.items.length - this.cursor;
    }
    get isDone() {
      return this.cursor >= this.items.length;
    }
    fillNext(targetElement) {
      const item = this.current;
      if (!item) return null;
      if (!insertText(targetElement, item.text, item.html)) return null;
      item.filled = true;
      this.cursor++;
      this._emit("advance", { item, cursor: this.cursor, total: this.items.length });
      if (this.isDone) this._emit("done", {});
      return item;
    }
    reset() {
      this.cursor = 0;
      this.items.forEach((i) => {
        i.filled = false;
      });
    }
    cancel() {
      this._emit("cancel", {});
    }
  };

  // src/pastekit/components/FillMode.js
  var HOST_RULE = ":host { all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647; }";
  var queue = null;
  var indicator = null;
  function initFillMode() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (window !== top) return false;
      if (!msg) return false;
      switch (msg.type) {
        case MSG.FILL_START:
          startFillMode(msg.snippets);
          sendResponse({ ok: true, remaining: queue.remaining });
          return false;
        case MSG.FILL_CANCEL:
          exitFillMode("cancelled");
          sendResponse({ ok: true });
          return false;
        case MSG.FILL_STATUS:
          sendResponse(queue ? { ok: true, active: true, cursor: queue.cursor, total: queue.items.length } : { ok: true, active: false });
          return false;
      }
      return false;
    });
  }
  function startFillMode(snippets) {
    if (queue) exitFillMode("restarted");
    queue = new FillQueue(snippets);
    queue.on("advance", () => {
      indicator.update(queue);
      chrome.runtime.sendMessage({ type: MSG.FILL_ADVANCE, remaining: queue.remaining }).catch(() => {
      });
    });
    queue.on("done", () => setTimeout(() => exitFillMode("done"), 800));
    indicator = new FillIndicator(queue, () => exitFillMode("cancelled"));
    document.addEventListener("click", onCaptureClick, true);
    document.addEventListener("keydown", onKeydown, true);
  }
  function isFillTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
    if (el instanceof HTMLInputElement)
      return !el.disabled && !el.readOnly && /^(text|search|email|url|tel|number)$/.test(el.type || "text");
    return false;
  }
  function onCaptureClick(e) {
    const path = e.composedPath();
    if (path[0] && indicator.contains(path[0])) return;
    let tgt = null;
    for (const n of path) {
      if (n instanceof Element && isFillTarget(n)) {
        tgt = n;
        break;
      }
    }
    if (!tgt && isFillTarget(e.target)) tgt = e.target;
    if (!tgt) return;
    e.stopPropagation();
    queue.fillNext(tgt);
  }
  function onKeydown(e) {
    if (e.key === "Escape" && queue) {
      e.preventDefault();
      e.stopPropagation();
      exitFillMode("cancelled");
    }
  }
  function exitFillMode(reason) {
    document.removeEventListener("click", onCaptureClick, true);
    document.removeEventListener("keydown", onKeydown, true);
    if (indicator) indicator.destroy();
    indicator = null;
    queue = null;
    chrome.runtime.sendMessage({ type: MSG.FILL_ENDED, reason }).catch(() => {
    });
  }
  var FillIndicator = class {
    constructor(queue2, onCancel) {
      this.host = document.createElement("pastekit-fill-indicator");
      const root = this.host.attachShadow({ mode: "closed" });
      const styleEl = document.createElement("style");
      styleEl.textContent = HOST_RULE + surfaceCSS("light");
      resolveOnPageTheme().then((t) => {
        styleEl.textContent = HOST_RULE + surfaceCSS(t);
      });
      onThemeChange((t) => {
        styleEl.textContent = HOST_RULE + surfaceCSS(t);
      });
      const pillEl = document.createElement("div");
      pillEl.className = "pk-toast";
      this._dotsEl = document.createElement("span");
      this._dotsEl.className = "dots";
      this._previewEl = document.createElement("span");
      this._previewEl.className = "pk-preview";
      this._countEl = document.createElement("span");
      this._countEl.className = "count";
      const cancelBtnEl = document.createElement("button");
      cancelBtnEl.title = "Cancel (Esc)";
      cancelBtnEl.textContent = "\u2715";
      pillEl.append(this._dotsEl, this._previewEl, this._countEl, cancelBtnEl);
      root.append(styleEl, pillEl);
      this.root = root;
      cancelBtnEl.addEventListener("click", onCancel);
      document.documentElement.appendChild(this.host);
      this.update(queue2);
    }
    update(queue2) {
      this._dotsEl.replaceChildren(...queue2.items.map((it, i) => {
        const dotEl = document.createElement("span");
        dotEl.className = `pk-qdot ${it.filled ? "filled" : i === queue2.cursor ? "next" : ""}`.trim();
        return dotEl;
      }));
      const cur = queue2.current;
      this._previewEl.textContent = cur ? "Next: " + (cur.label || cur.text) : "Done";
      this._countEl.textContent = `${queue2.cursor}/${queue2.items.length}`;
    }
    contains(node) {
      return node === this.host || this.host.contains(node);
    }
    destroy() {
      this.host.remove();
    }
  };

  // src/pastekit/components/Clip.js
  var Z_MAX3 = 2147483647;
  function initClip() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg) return false;
      if (msg.type === MSG.GET_SELECTION) {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        if (!sel || !text) return false;
        let html = "";
        try {
          const divEl = document.createElement("div");
          for (let i = 0; i < sel.rangeCount; i++)
            divEl.appendChild(sel.getRangeAt(i).cloneContents());
          html = divEl.innerHTML;
        } catch (_) {
        }
        sendResponse({ text, html });
        return false;
      }
      if (msg.type === MSG.CLIP_SAVED && window === top) {
        showToast(msg.ok ? "Saved as @" + msg.name : "Save failed: " + (msg.error || "unknown error"), !msg.ok);
        return false;
      }
      return false;
    });
  }
  var toastHost = null;
  var toastTimer = null;
  function showToast(message, isError) {
    if (!toastHost) {
      const hostEl = document.createElement("div");
      hostEl.setAttribute("data-pastekit-toast", "");
      hostEl.style.all = "initial";
      hostEl.style.position = "fixed";
      hostEl.style.bottom = "16px";
      hostEl.style.right = "16px";
      hostEl.style.zIndex = String(Z_MAX3);
      const shadow = hostEl.attachShadow({ mode: "closed" });
      const styleEl = document.createElement("style");
      styleEl.textContent = surfaceCSS("light");
      resolveOnPageTheme().then((t) => {
        styleEl.textContent = surfaceCSS(t);
      });
      onThemeChange((t) => {
        styleEl.textContent = surfaceCSS(t);
      });
      shadow.appendChild(styleEl);
      const el = document.createElement("div");
      el.className = "pk-toast";
      shadow.appendChild(el);
      toastHost = Object.assign(hostEl, { _el: el });
    }
    const host = toastHost;
    host._el.textContent = message;
    host._el.classList.toggle("error", !!isError);
    if (!host.isConnected && document.documentElement)
      document.documentElement.appendChild(host);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      try {
        host.remove();
      } catch (_) {
      }
    }, 2600);
  }

  // src/pastekit/main.js
  initSettingsCache();
  initFieldDot();
  initTokenAutocomplete();
  initFillMode();
  initClip();
})();
//# sourceMappingURL=pastekit-content.bundle.js.map
