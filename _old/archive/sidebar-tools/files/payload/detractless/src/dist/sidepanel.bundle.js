(() => {
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
  async function setSettings(partial) {
    const current = await getSettings();
    const next = Object.assign({}, current, partial);
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  // src/components/shared/scrollAffordance.js
  function make(tag, className) {
    const el3 = document.createElement(tag);
    el3.className = className;
    return el3;
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
    const refresh2 = () => {
      const box = scroller.getBoundingClientRect();
      if (box.height === 0) {
        setState(0, 0);
        return;
      }
      let above = 0, below = 0;
      for (const el3 of items()) {
        if (el3.offsetParent === null) continue;
        const r = el3.getBoundingClientRect();
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
        refresh2();
      });
    };
    scroller.addEventListener("scroll", refresh2, { passive: true });
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
    return { refresh: refresh2, host };
  }

  // src/pages/sidepanel/panelDialog.js
  function wellAffordance(host, well) {
    requestAnimationFrame(() => {
      if (well.scrollHeight <= well.clientHeight + 1) return;
      attachScrollAffordance(well, { host, items: ".picker-row" });
    });
  }
  var modal = document.createElement("div");
  modal.className = "modal sp-modal";
  var card = document.createElement("div");
  card.className = "picker-card";
  modal.appendChild(card);
  document.body.appendChild(modal);
  var activeSpec = null;
  function close() {
    activeSpec = null;
    modal.classList.remove("show");
    card.replaceChildren();
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("show")) close();
  });
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function iconSpan(svg) {
    const span = el("span", "picker-row-icon");
    span.innerHTML = svg || "";
    return span;
  }
  function renderMenu(spec) {
    card.replaceChildren();
    card.appendChild(el("div", "picker-title", spec.title));
    if (spec.subtitle) card.appendChild(el("div", "picker-subtitle", spec.subtitle));
    const host = el("div", "picker-wellhost");
    const well = el("div", "picker-well");
    for (const row of spec.rows) {
      well.appendChild(row.danger ? dangerRow(row) : actionRow(row));
    }
    host.appendChild(well);
    card.appendChild(host);
    wellAffordance(host, well);
  }
  function actionRow(row) {
    const btn = el("button", "picker-row");
    btn.type = "button";
    if ("mark" in row) {
      if (row.mark) btn.classList.add("is-current");
      btn.appendChild(el("span", "picker-check"));
    } else {
      btn.appendChild(iconSpan(row.icon));
    }
    btn.appendChild(el("span", null, row.label));
    btn.addEventListener("click", () => {
      if (row.input) {
        renderInput(row);
        return;
      }
      close();
      if (row.onPick) row.onPick();
    });
    return btn;
  }
  function dangerRow(row) {
    const btn = el("button", "picker-row picker-row--danger");
    btn.type = "button";
    btn.appendChild(iconSpan(row.icon));
    btn.appendChild(el("span", null, row.label));
    let armed = false;
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.classList.add("picker-row--armed");
        btn.replaceChildren(el("span", null, row.confirmLabel || "Delete, are you sure?"));
        return;
      }
      close();
      row.onPick();
    });
    return btn;
  }
  function renderInput(row) {
    const spec = activeSpec;
    card.replaceChildren();
    card.appendChild(el("div", "picker-title", row.paneTitle || row.label));
    const wrap = el("div", "picker-fieldwrap");
    const field = el("input", "picker-field");
    field.type = "text";
    field.autocomplete = "off";
    field.value = row.input.value || "";
    if (row.input.placeholder) field.placeholder = row.input.placeholder;
    const error = el("div", "picker-error");
    wrap.append(field, error);
    card.appendChild(wrap);
    const commit = async () => {
      const result = await row.input.onSave(field.value);
      if (typeof result === "string") {
        error.textContent = result;
        error.classList.add("picker-error--show");
        field.focus();
        return;
      }
      close();
    };
    field.addEventListener("input", () => error.classList.remove("picker-error--show"));
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    });
    const foot = el("div", "picker-foot");
    const back = el("button", "picker-btn", "Back");
    back.type = "button";
    back.addEventListener("click", () => renderMenu(spec));
    const saveBtn = el("button", "picker-btn picker-btn--primary", "Save");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", commit);
    foot.append(back, saveBtn);
    card.appendChild(foot);
    field.focus();
  }
  function openPanelDialog(spec) {
    activeSpec = spec;
    renderMenu(spec);
    modal.classList.add("show");
  }

  // src/constants/icons.js
  var Icons = {
    plus: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    copy: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    delete: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    move: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    list: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    link: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    /* Empty-state glyphs (R-038). Same stroke grammar as the rest of the set; the
       14px width/height attributes are overridden by .empty svg, which sizes them
       up for the one place they appear large. */
    search: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    note: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    eyeOff: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    /* Tool-identity glyphs (R-040): the ONE icon a tool wears everywhere — its home
       tile AND its empty state — so "no snippets yet" shows the same mark as the
       tile you tapped to reach it. Same stroke grammar as the rest of the set. */
    clipboard: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg>`,
    pencil: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`,
    tabs: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="14" height="14" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
    eraser: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg>`
  };

  // src/components/shared/emptyState.js
  function emptyState(icon, text, hint) {
    const box = document.createElement("div");
    box.className = "empty";
    const glyph = document.createElement("span");
    glyph.className = "empty-icon";
    glyph.innerHTML = icon || "";
    box.appendChild(glyph);
    const line = document.createElement("span");
    line.textContent = text;
    box.appendChild(line);
    if (hint) {
      const sub = document.createElement("span");
      sub.className = "empty-hint";
      sub.textContent = hint;
      box.appendChild(sub);
    }
    return box;
  }
  function fillEmptyState(host, icon, text, hint) {
    const built = emptyState(icon, text, hint);
    host.replaceChildren(...built.childNodes);
  }

  // src/pastekit/pages/Sidepanel.js
  var $ = (id) => {
    const foundEl = document.getElementById(id);
    if (!foundEl) throw new Error(`Sidepanel: required element #${id} not found`);
    return foundEl;
  };
  var input = (id) => (
    /** @type {HTMLInputElement} */
    $(id)
  );
  var button = (id) => (
    /** @type {HTMLButtonElement} */
    $(id)
  );
  var textarea = (id) => (
    /** @type {HTMLTextAreaElement} */
    $(id)
  );
  var els = {
    search: input("search"),
    list: $("list"),
    bar: $("pkBar"),
    libraryPage: $("pkLibraryPage"),
    editorPage: $("pkEditorPage"),
    settingsPage: $("pkSettingsPage"),
    foot: $("pkFoot"),
    fillBtn: button("fillBtn"),
    copyBtn: button("copyBtn"),
    splitLines: input("splitLines"),
    splitWrap: $("splitWrap"),
    status: $("status"),
    libActions: $("libActions"),
    editActions: $("editActions"),
    cancelBtn: button("cancelBtn"),
    saveBtn: button("saveBtn"),
    settingsBtn: $("settingsBtn"),
    newBtn: $("newBtn"),
    hdTitle: $("hdTitle"),
    hdActions: $("pkHdActions"),
    edError: $("edError"),
    fName: input("fName"),
    fDesc: input("fDesc"),
    fTags: input("fTags"),
    fText: textarea("fText"),
    fHtml: textarea("fHtml"),
    fHtmlWrap: (
      /** @type {HTMLDetailsElement} */
      $("fHtmlWrap")
    ),
    tagCloud: $("tagCloud"),
    dotModeRow: $("dotModeRow"),
    dotModeVal: $("dotModeVal"),
    limitRow: $("limitRow"),
    limitVal: $("limitVal")
  };
  var snippets = [];
  var query = "";
  var selection = [];
  var editing = null;
  var editorOpen = false;
  var tagFilter = null;
  function initSidepanel() {
    return init();
  }
  function pasteKitBack() {
    if (editorOpen) {
      closeEditor();
      return true;
    }
    if (settingsOpen) {
      showSettings(false);
      return true;
    }
    return false;
  }
  async function init() {
    els.search.addEventListener("input", () => {
      query = els.search.value;
      refresh();
    });
    els.fillBtn.addEventListener("click", startFill);
    els.copyBtn.addEventListener("click", copySelected);
    els.settingsBtn.addEventListener("click", () => showSettings(!settingsOpen));
    els.newBtn.addEventListener("click", () => openEditor(null));
    els.cancelBtn.addEventListener("click", closeEditor);
    els.saveBtn.addEventListener("click", saveEditor);
    els.dotModeRow.addEventListener("click", pickDotMode);
    els.limitRow.addEventListener("click", pickRowsVisible);
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === MSG.SNIPPETS_CHANGED) refresh();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (editorOpen) closeEditor();
      else if (settingsOpen) showSettings(false);
    });
    await refresh();
    await checkInProgress();
  }
  async function refresh() {
    try {
      snippets = await call(MSG.SNIPPET_SEARCH, { query, folderId: null });
    } catch (_) {
      snippets = [];
    }
    if (tagFilter) {
      snippets = snippets.filter((s) => (s.tags || []).includes(tagFilter));
    }
    drawList();
    updateFooter();
    drawTags();
  }
  function drawList() {
    els.list.replaceChildren();
    if (!snippets.length) {
      els.list.appendChild(query || tagFilter ? emptyState(Icons.search, "No snippets match") : emptyState(Icons.clipboard, "No snippets yet"));
      return;
    }
    for (const s of snippets) {
      const pos = selection.indexOf(s.id);
      const rowEl = document.createElement("div");
      rowEl.className = "settings-row" + (pos !== -1 ? " selected" : "");
      rowEl.dataset.id = String(s.id);
      if (s.tags && s.tags.length) rowEl.title = s.tags.join(", ");
      const textEl = document.createElement("span");
      textEl.className = "settings-row-text";
      const nmEl = document.createElement("span");
      nmEl.className = "settings-row-title";
      nmEl.textContent = s.name;
      textEl.appendChild(nmEl);
      if (s.description) {
        const dsEl = document.createElement("span");
        dsEl.className = "settings-row-value";
        dsEl.textContent = s.description;
        textEl.appendChild(dsEl);
      }
      rowEl.appendChild(textEl);
      if (pos !== -1) {
        const qposEl = document.createElement("span");
        qposEl.className = "qpos";
        qposEl.textContent = String(pos + 1);
        rowEl.appendChild(qposEl);
      }
      const moreEl = document.createElement("button");
      moreEl.className = "sp-row-btn";
      moreEl.textContent = "\u22EF";
      moreEl.title = "Copy / edit / delete";
      moreEl.addEventListener("click", (e) => {
        e.stopPropagation();
        snippetMenu(s);
      });
      rowEl.appendChild(moreEl);
      rowEl.addEventListener("click", () => toggleSelect(s.id, selection.indexOf(s.id) === -1));
      rowEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        snippetMenu(s);
      });
      els.list.appendChild(rowEl);
    }
  }
  function snippetMenu(s) {
    openPanelDialog({
      title: s.name,
      subtitle: s.description || void 0,
      rows: [
        {
          icon: Icons.copy,
          label: "Copy text",
          onPick: async () => {
            try {
              await navigator.clipboard.writeText(s.contentText || "");
              els.status.textContent = "Copied " + s.name + ".";
            } catch (_) {
              els.status.textContent = "Copy failed.";
            }
          }
        },
        { icon: Icons.edit, label: "Edit", onPick: () => openEditor(s) },
        {
          icon: Icons.delete,
          label: "Delete",
          danger: true,
          onPick: () => {
            call(MSG.SNIPPET_DELETE, { id: s.id }).then(() => {
              const i = selection.indexOf(s.id);
              if (i !== -1) selection.splice(i, 1);
            }).catch((e) => {
              els.status.textContent = "Delete failed: " + e.message;
            });
          }
        }
      ]
    });
  }
  function openEditor(snippet) {
    editing = snippet;
    editorOpen = true;
    els.hdTitle.textContent = snippet ? "Edit snippet" : "New snippet";
    els.edError.textContent = "";
    els.fName.value = snippet ? snippet.name : "";
    els.fDesc.value = snippet ? snippet.description || "" : "";
    els.fTags.value = snippet ? (snippet.tags || []).join(", ") : "";
    els.fText.value = snippet ? snippet.contentText || "" : "";
    els.fHtml.value = snippet ? snippet.contentHtml || "" : "";
    els.fHtmlWrap.open = !!(snippet && snippet.contentHtml);
    showPage("editor");
    els.libActions.classList.add("hidden");
    els.editActions.classList.remove("hidden");
    els.splitWrap.style.visibility = "hidden";
    els.status.textContent = "";
    try {
      els.fName.focus();
    } catch (_) {
    }
  }
  function closeEditor() {
    editing = null;
    editorOpen = false;
    els.hdTitle.textContent = "PasteKit";
    showPage("library");
    els.libActions.classList.remove("hidden");
    els.editActions.classList.add("hidden");
    els.splitWrap.style.visibility = "";
  }
  function showPage(which) {
    els.libraryPage.hidden = which !== "library";
    els.editorPage.hidden = which !== "editor";
    els.settingsPage.hidden = which !== "settings";
    els.bar.hidden = which !== "library";
    els.tagCloud.hidden = which !== "library";
    els.foot.hidden = which === "settings";
    els.hdActions.hidden = which !== "library";
  }
  async function saveEditor() {
    const rec = {
      name: els.fName.value.trim(),
      description: els.fDesc.value.trim(),
      folderId: editing ? editing.folderId || 0 : 0,
      tags: els.fTags.value.split(",").map((t) => t.trim()).filter(Boolean),
      contentText: els.fText.value,
      contentHtml: els.fHtml.value.trim()
    };
    if (editing) rec.id = editing.id;
    if (!rec.name) {
      els.edError.textContent = "Name is required.";
      return;
    }
    try {
      await call(MSG.SNIPPET_SAVE, { snippet: rec });
      closeEditor();
    } catch (e) {
      els.edError.textContent = e.message;
    }
  }
  function toggleSelect(id, on) {
    const i = selection.indexOf(id);
    if (on && i === -1) selection.push(id);
    else if (!on && i !== -1) selection.splice(i, 1);
    drawList();
    updateFooter();
  }
  function updateFooter() {
    const n = selection.length;
    els.fillBtn.textContent = `Fill (${n})`;
    els.fillBtn.disabled = n === 0;
    els.copyBtn.disabled = n === 0;
  }
  async function collectSelectedFull() {
    let all = snippets;
    const missing = selection.some((id) => !snippets.find((s) => s.id === id));
    if (missing) {
      try {
        all = await call(MSG.SNIPPET_LIST, {});
      } catch (_) {
      }
    }
    const byId = new Map(all.map((s) => [s.id, s]));
    return selection.map((id) => byId.get(id)).filter(Boolean);
  }
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }
  async function startFill() {
    const chosen = await collectSelectedFull();
    if (!chosen.length) return;
    let items = chosen.map((s) => ({ id: s.id, text: s.contentText, html: s.contentHtml, label: s.name }));
    if (els.splitLines.checked) {
      items = items.flatMap((it) => it.text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((t) => Object.assign({}, it, { text: t, html: null })));
    }
    const tab = await activeTab();
    if (!tab || tab.id == null) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.FILL_START, snippets: items });
      selection.length = 0;
      drawList();
      updateFooter();
      els.status.textContent = "Fill mode active \u2014 click fields on the page.";
    } catch (_) {
      els.status.textContent = "Cannot fill on this page (try reloading it).";
    }
  }
  async function copySelected() {
    const chosen = await collectSelectedFull();
    if (!chosen.length) return;
    const text = chosen.map((s) => s.contentText).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      els.status.textContent = "Copied " + chosen.length + " snippet(s).";
    } catch (_) {
      els.status.textContent = "Copy failed.";
    }
  }
  async function checkInProgress() {
    try {
      const tab = await activeTab();
      if (!tab || tab.id == null) return;
      const tabId = tab.id;
      const res = await chrome.tabs.sendMessage(tabId, { type: MSG.FILL_STATUS });
      if (res && res.active) {
        els.status.textContent = `Fill in progress ${res.cursor}/${res.total}`;
        els.fillBtn.textContent = "Cancel fill";
        els.fillBtn.disabled = false;
        els.fillBtn.onclick = async () => {
          try {
            await chrome.tabs.sendMessage(tabId, { type: MSG.FILL_CANCEL });
          } catch (_) {
          }
          els.status.textContent = "";
          els.fillBtn.onclick = startFill;
          updateFooter();
        };
      }
    } catch (_) {
    }
  }
  var settingsOpen = false;
  var toggles = (
    /** @type {HTMLInputElement[]} */
    Array.from(document.querySelectorAll("input[data-setting]"))
  );
  function showSettings(on) {
    settingsOpen = on;
    els.hdTitle.textContent = on ? "Quick settings" : "PasteKit";
    showPage(on ? "settings" : "library");
    if (on) loadToggles();
  }
  var PICKER_MIN = 1;
  var PICKER_MAX = 15;
  async function loadToggles() {
    try {
      const s = await getSettings();
      for (const t of toggles) t.checked = !!s[t.dataset.setting];
      setPickerLimit(s.pickerLimit ?? 10, false);
      setDotMode(s.dotMode || "always", false);
    } catch (_) {
    }
  }
  function setPickerLimit(n, save = true) {
    n = Math.max(PICKER_MIN, Math.min(PICKER_MAX, n));
    els.limitVal.textContent = String(n);
    if (save) setSettings({ pickerLimit: n }).catch(() => {
    });
  }
  var DOT_MODES = [
    { value: "always", label: "Always" },
    { value: "hover", label: "On hover" },
    { value: "focus", label: "On focus" }
  ];
  var dotMode = "always";
  function setDotMode(mode, save = true) {
    dotMode = mode;
    const found = DOT_MODES.find((m) => m.value === mode);
    els.dotModeVal.textContent = found ? found.label : mode;
    if (save) setSettings({ dotMode: mode }).catch(() => {
    });
  }
  function choiceRows(options, current, onPick) {
    return options.map((opt) => ({
      icon: "",
      label: opt.label,
      mark: opt.value === current,
      onPick: () => onPick(opt.value)
    }));
  }
  function pickDotMode() {
    openPanelDialog({
      title: "Dot visibility",
      rows: choiceRows(DOT_MODES, dotMode, (v) => setDotMode(v))
    });
  }
  function pickRowsVisible() {
    const options = [];
    for (let n = PICKER_MIN; n <= PICKER_MAX; n++) options.push({ value: n, label: String(n) });
    openPanelDialog({
      title: "Rows visible",
      rows: choiceRows(options, Number(els.limitVal.textContent), (v) => setPickerLimit(v))
    });
  }
  for (const t of toggles) {
    t.addEventListener("change", () => {
      const key = t.dataset.setting;
      if (!key) return;
      setSettings({ [key]: t.checked }).catch(() => {
      });
    });
  }
  async function drawTags() {
    let tags = [];
    try {
      tags = await call(MSG.TAG_LIST);
    } catch (_) {
    }
    els.tagCloud.replaceChildren();
    for (const t of tags) {
      const chip = document.createElement("button");
      chip.className = "sp-chip" + (t === tagFilter ? " active" : "");
      chip.textContent = t;
      chip.addEventListener("click", () => {
        tagFilter = t === tagFilter ? null : t;
        refresh();
      });
      els.tagCloud.appendChild(chip);
    }
  }

  // src/services/mergeSync.js
  var TOMBSTONE_WINDOW_MS = 90 * 24 * 60 * 60 * 1e3;

  // src/services/bookmarkSync.js
  function newBookmarkId() {
    return typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID() || `bm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function dematerialize(nested, now = Date.now()) {
    const records = [];
    let sortIndex = 0;
    for (const [pageKey, groups] of Object.entries(nested || {})) {
      if (!pageKey.startsWith("page")) continue;
      const page = Number(pageKey.slice(4));
      if (Number.isNaN(page)) continue;
      for (const [group, list] of Object.entries(groups || {})) {
        for (const bm of list || []) {
          if (!bm || bm.name === void 0 && bm.url === void 0) continue;
          records.push({
            id: newBookmarkId(),
            page,
            group,
            name: bm.name,
            url: bm.url,
            sortIndex: sortIndex++,
            updatedAt: now,
            deletedAt: null
          });
        }
      }
    }
    return records;
  }

  // src/services/bookmarksDB.js
  var BookmarkDB = {
    dbName: "DetractlessBookmarks",
    // v6 added the `notes` and `events` stores. Both features have been removed and
    // nothing reads these any more.
    // v7 adds `bookmarkRecords` (Phase 12): bookmarks as merge-owned records so an
    // import merges instead of clobbering. The old nested `bookmarks` store is
    // KEPT, not dropped — it is the backout snapshot until Phase 12 is proven.
    version: 7,
    db: null,
    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.warn("[BookmarkDB] init blocked in sidepanel");
          if (this.db) { try { this.db.close(); } catch (_) {} this.db = null; }
          reject(new Error("BookmarkDB init blocked by open connection"));
        };
        request.onsuccess = () => {
          this.db = request.result;
          this.db.onversionchange = () => {
            if (this.db) {
              try { this.db.close(); } catch (_) {}
              this.db = null;
            }
          };
          resolve(this.db);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          db.onversionchange = () => {
            try { db.close(); } catch (_) {}
          };
          if (!db.objectStoreNames.contains("bookmarks")) db.createObjectStore("bookmarks", { keyPath: "page" });
          if (!db.objectStoreNames.contains("icons")) db.createObjectStore("icons");
          if (!db.objectStoreNames.contains("usage")) db.createObjectStore("usage", { keyPath: "url" });
          if (!db.objectStoreNames.contains("uiPrefs")) {
            const store = db.createObjectStore("uiPrefs", { keyPath: "key" });
            const themePref = localStorage.getItem("themePref");
            const uiScaleStr = localStorage.getItem("uiScale");
            if (themePref) store.put({ key: "themePref", value: themePref });
            if (uiScaleStr !== null) {
              const scale = parseFloat(uiScaleStr);
              if (!isNaN(scale)) store.put({ key: "uiScale", value: scale });
            }
            localStorage.removeItem("themePref");
            localStorage.removeItem("uiScale");
          }
          if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
          if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" });
          if (!db.objectStoreNames.contains("bookmarkRecords")) {
            db.createObjectStore("bookmarkRecords", { keyPath: "id" });
          }
        };
      });
    },
    async getUiPref(key) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["uiPrefs"], "readonly");
        const req = tx.objectStore("uiPrefs").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : void 0);
        req.onerror = () => reject(req.error);
      });
    },
    async setUiPref(key, value) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["uiPrefs"], "readwrite");
        const req = tx.objectStore("uiPrefs").put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async clearUiPrefs() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["uiPrefs"], "readwrite");
        const req = tx.objectStore("uiPrefs").clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async getBookmarks(pageNumber) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["bookmarks"], "readonly");
        const store = transaction.objectStore("bookmarks");
        const request = store.get(pageNumber);
        request.onsuccess = () => resolve(request.result ? request.result.data : {});
        request.onerror = () => reject(request.error);
      });
    },
    async saveBookmarks(pageNumber, bookmarksData) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["bookmarks"], "readwrite");
        const store = transaction.objectStore("bookmarks");
        const request = store.put({ page: pageNumber, data: bookmarksData });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    async saveIcon(id, data) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["icons"], "readwrite");
        const store = transaction.objectStore("icons");
        const request = store.put(data, id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    async getIcon(id) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["icons"], "readonly");
        const store = transaction.objectStore("icons");
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async deleteIcon(id) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["icons"], "readwrite");
        const store = transaction.objectStore("icons");
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    async deleteBookmarks(pageNumber) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["bookmarks"], "readwrite");
        const store = transaction.objectStore("bookmarks");
        const request = store.delete(pageNumber);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    async getAllBookmarks() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["bookmarks"], "readonly");
        const store = transaction.objectStore("bookmarks");
        const request = store.getAll();
        request.onsuccess = () => {
          const result = {};
          request.result.forEach((item) => {
            result[`page${item.page}`] = item.data;
          });
          resolve(result);
        };
        request.onerror = () => reject(request.error);
      });
    },
    // ── Bookmark records (Phase 12) ──────────────────────────────────────────
    //
    // The nested `bookmarks` store above is the OLD form. Records are the new
    // merge-owned form. During Phase 12 both exist; the nested store is the backout
    // snapshot. `getAllBookmarks` still reads nested here (Landing A) and is
    // repointed to materialise from records in Landing B — which is why the
    // migration below uses its own raw reader rather than getAllBookmarks, so it
    // keeps reading the ORIGINAL nested data whatever getAllBookmarks becomes.
    /** Raw read of the nested `bookmarks` store, independent of getAllBookmarks. */
    async _getAllNestedBookmarks() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const request = this.db.transaction(["bookmarks"], "readonly").objectStore("bookmarks").getAll();
        request.onsuccess = () => {
          const result = {};
          request.result.forEach((item) => {
            result[`page${item.page}`] = item.data;
          });
          resolve(result);
        };
        request.onerror = () => reject(request.error);
      });
    },
    /* ── Notes (side panel) ──────────────────────────────────────────────
         Deliberately in THIS database rather than a new one, and deliberately in the
         `notes` store v6 already created. Two consequences worth stating: reset
         covers notes for free, because resetService deletes this database whole; and
         notes are NOT in the pastekit database, so the whole-store lock that gates
         snippets does not gate them. A note is not a secret and must not be
         unreachable because the snippet store happens to be locked.
    
         A note: { id, title, body, updatedAt }. */
    async listNotes() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const request = this.db.transaction(["notes"], "readonly").objectStore("notes").getAll();
        request.onsuccess = () => {
          const notes = request.result || [];
          notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(notes);
        };
        request.onerror = () => reject(request.error);
      });
    },
    async saveNote(note) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const record = {
          id: note.id || `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title: note.title || "",
          body: note.body || "",
          updatedAt: Date.now()
        };
        const tx = this.db.transaction(["notes"], "readwrite");
        const request = tx.objectStore("notes").put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      });
    },
    async deleteNote(id) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["notes"], "readwrite");
        const request = tx.objectStore("notes").delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
    async getBookmarkRecords() {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const request = this.db.transaction(["bookmarkRecords"], "readonly").objectStore("bookmarkRecords").getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },
    /** Rewrite the whole records set in one transaction (clear then put). */
    async putBookmarkRecords(records) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["bookmarkRecords"], "readwrite");
        const store = tx.objectStore("bookmarkRecords");
        store.clear();
        for (const record of records) store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
    /**
     * One-time, NON-DESTRUCTIVE migration: dematerialise the nested bookmarks into
     * records. The nested store is left untouched. Gated by a flag so it runs once;
     * it also no-ops if records already exist, so a device that has synced records
     * down before its own migration ran does not clobber them.
     */
    async migrateBookmarksToRecords() {
      if (!this.db) await this.init();
      if (await this.getUiPref("bookmarksMigratedToRecords")) return;
      const existing = await this.getBookmarkRecords();
      if (existing.length === 0) {
        const nested = await this._getAllNestedBookmarks();
        await this.putBookmarkRecords(dematerialize(nested, Date.now()));
      }
      await this.setUiPref("bookmarksMigratedToRecords", true);
    },
    async importAllBookmarks(data) {
      if (!this.db) await this.init();
      const promises = [];
      Object.keys(data).forEach((key) => {
        if (key.startsWith("page")) {
          const pageNum = Number(key.replace("page", ""));
          if (!isNaN(pageNum)) promises.push(this.saveBookmarks(pageNum, data[key]));
        }
      });
      return Promise.all(promises);
    },
    async recordClick(url) {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["usage"], "readwrite");
        const store = transaction.objectStore("usage");
        const getReq = store.get(url);
        getReq.onsuccess = () => {
          const existing = getReq.result ? getReq.result.timestamps : [];
          const updated = [Date.now(), ...existing].slice(0, 30);
          const putReq = store.put({ url, timestamps: updated });
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },
    async getAllUsageScores() {
      if (!this.db) await this.init();
      const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1e3;
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["usage"], "readonly");
        const store = transaction.objectStore("usage");
        const request = store.getAll();
        request.onsuccess = () => {
          const now = Date.now();
          const scores = /* @__PURE__ */ new Map();
          request.result.forEach(({ url, timestamps }) => {
            const score = timestamps.reduce((sum, ts) => sum + Math.exp(-(now - ts) / HALF_LIFE_MS), 0);
            scores.set(url, score);
          });
          resolve(scores);
        };
        request.onerror = () => reject(request.error);
      });
    },
    async migrateFromChromeStorage() {
      return new Promise((resolve) => {
        window.chrome.storage.sync.get(
          ["bookmarks-page-1", "bookmarks-page-2", "bookmarks-page-3", "bookmarks-migrated"],
          async (result) => {
            if (result["bookmarks-migrated"]) {
              resolve(false);
              return;
            }
            let hasMigrated = false;
            if (result["bookmarks-page-1"]) {
              await this.saveBookmarks(1, result["bookmarks-page-1"]);
              hasMigrated = true;
            }
            if (result["bookmarks-page-2"]) {
              await this.saveBookmarks(2, result["bookmarks-page-2"]);
              hasMigrated = true;
            }
            if (result["bookmarks-page-3"]) {
              await this.saveBookmarks(3, result["bookmarks-page-3"]);
              hasMigrated = true;
            }
            if (hasMigrated) {
              window.chrome.storage.sync.set({ "bookmarks-migrated": true });
              window.chrome.storage.sync.remove(["bookmarks-page-1", "bookmarks-page-2", "bookmarks-page-3"]);
            }
            resolve(hasMigrated);
          }
        );
      });
    }
  };

  // src/services/noteEditor.js
  var AUTOSAVE_DELAY = 600;
  function createNoteSession(db, opts = {}) {
    const delay = opts.delay === void 0 ? AUTOSAVE_DELAY : opts.delay;
    const setTimer = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = opts.clearTimeout || ((t) => clearTimeout(t));
    let active = null;
    let pending = { title: "", body: "" };
    let timer = null;
    let chain = Promise.resolve();
    function cancelTimer() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    }
    function open(note) {
      cancelTimer();
      const existing = note && note.id ? note : null;
      active = {
        id: existing ? existing.id : null,
        /* The baseline carries the ORIGINAL id, so reverting an emptied-out note
           restores the same record rather than a copy of its text. */
        baseline: existing ? { id: existing.id, title: existing.title || "", body: existing.body || "" } : null,
        dead: false
      };
      pending = {
        title: active.baseline ? active.baseline.title : "",
        body: active.baseline ? active.baseline.body : ""
      };
      return active;
    }
    function change(title, body) {
      if (!active) return;
      pending = { title, body };
      cancelTimer();
      timer = setTimer(() => {
        timer = null;
        flush();
      }, delay);
    }
    function flush() {
      cancelTimer();
      if (!active) return chain;
      const session = active;
      const { title, body } = pending;
      chain = chain.then(async () => {
        if (session.dead) return;
        if (!title.trim() && !body.trim()) {
          if (session.id) await db.deleteNote(session.id);
          return;
        }
        const rec = await db.saveNote({ id: session.id, title, body });
        session.id = rec.id;
      });
      return chain;
    }
    function commit() {
      const done = flush();
      active = null;
      return done;
    }
    function revert() {
      cancelTimer();
      const session = active;
      active = null;
      if (!session) return chain;
      session.dead = true;
      chain = chain.then(async () => {
        if (session.baseline) {
          await db.saveNote(session.baseline);
        } else if (session.id) {
          await db.deleteNote(session.id);
        }
      });
      return chain;
    }
    return {
      open,
      change,
      flush,
      commit,
      revert,
      get id() {
        return active ? active.id : null;
      },
      get isOpen() {
        return active !== null;
      },
      settled: () => chain
    };
  }

  // src/services/removerRules.js
  function readRule(rule) {
    return {
      selector: typeof rule === "string" ? rule : rule && rule.selector || "",
      specific: typeof rule === "object" && rule !== null && !!rule.specific,
      broad: typeof rule === "object" && rule !== null && !!rule.broad
    };
  }
  function ruleName(selector) {
    const s = String(selector || "").trim();
    if (!s) return "";
    const parts = s.split(">");
    return (parts[parts.length - 1] || "").trim() || s;
  }
  function ruleLabel(r) {
    const scope = r.specific ? "This page only" : "Whole site";
    return r.broad ? `${scope} \xB7 broad match` : scope;
  }

  // src/services/tabSaver.js
  var STORAGE_KEY = "savedTabGroups";
  var SKIP_SCHEMES = /^(chrome|chrome-extension|edge|about|devtools|view-source|moz-extension):/i;
  function shouldSaveTab(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (trimmed === "about:blank") return false;
    if (SKIP_SCHEMES.test(trimmed)) return false;
    return /^https?:\/\//i.test(trimmed);
  }
  function dayKey(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function toEntry(tab, closedAt) {
    return {
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || "",
      closedAt
    };
  }
  function addTabsToGroups(groups, entries, mode, now = Date.now()) {
    const list = Array.isArray(groups) ? groups.map((g) => ({ ...g, tabs: [...g.tabs || []] })) : [];
    const fresh = (entries || []).filter((e) => e && e.url);
    if (fresh.length === 0) return list;
    let target = null;
    if (mode === "auto") {
      const key = dayKey(now);
      target = list.find((g) => g.kind === "auto" && g.dayKey === key) || null;
    }
    if (!target) {
      target = {
        id: `grp-${now}-${Math.random().toString(16).slice(2, 8)}`,
        kind: mode === "auto" ? "auto" : "manual",
        dayKey: dayKey(now),
        savedAt: now,
        /* A STABLE number, assigned once and stored, never a position in the list.
           "Session N" was derived from chronological ORDER, which meant deleting an
           old session silently renumbered every later one: a name that changes when
           you delete something else is exactly what made the old numbering feel
           arbitrary. Stored, "Save 12" stays Save 12 forever. */
        seq: nextSeq(list),
        description: "",
        tabs: []
      };
      list.unshift(target);
    }
    const byUrl = new Map(target.tabs.map((t) => [t.url, t]));
    for (const entry of fresh) byUrl.set(entry.url, entry);
    target.tabs = [...byUrl.values()].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
    target.savedAt = Math.max(target.savedAt || 0, now);
    return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  function nextSeq(groups) {
    return (groups || []).reduce((max, g) => Math.max(max, Number(g && g.seq) || 0), 0) + 1;
  }
  function ensureSeq(groups) {
    const list = groups || [];
    if (list.every((g) => Number(g && g.seq) > 0)) return list;
    const order = [...list].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    let n = 0;
    const assigned = /* @__PURE__ */ new Map();
    for (const g of order) {
      n = Number(g.seq) > 0 ? Math.max(n, Number(g.seq)) : n + 1;
      assigned.set(g.id, Number(g.seq) > 0 ? Number(g.seq) : n);
    }
    return list.map((g) => ({ ...g, seq: assigned.get(g.id) }));
  }
  function pruneEmptyGroups(groups) {
    return (groups || []).filter((g) => g && Array.isArray(g.tabs) && g.tabs.length > 0);
  }
  function groupMatches(group, query2) {
    const q = String(query2 || "").trim().toLowerCase();
    if (!q) return true;
    if ((group.description || "").toLowerCase().includes(q)) return true;
    return (group.tabs || []).some((t) => (t.title || "").toLowerCase().includes(q) || (t.url || "").toLowerCase().includes(q));
  }
  function applyTabEdit(groups, groupId, oldUrl, patch) {
    const list = Array.isArray(groups) ? groups : [];
    const group = list.find((g) => g && g.id === groupId);
    if (!group) return { error: "That session is gone." };
    const tabs = group.tabs || [];
    const index = tabs.findIndex((t) => t && t.url === oldUrl);
    if (index === -1) return { error: "That tab is no longer in this session." };
    const flatten = (v) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ");
    const url = flatten(patch.url).trim();
    if (!url) return { error: "Give the tab an address." };
    if (!shouldSaveTab(url)) {
      return { error: "That needs to be a web address starting with http or https." };
    }
    if (url !== oldUrl && tabs.some((t, i) => i !== index && t && t.url === url)) {
      return { error: "Another tab in this session already has that address." };
    }
    const title = flatten(patch.title).trim() || url;
    const nextTabs = tabs.slice();
    nextTabs[index] = { ...tabs[index], url, title };
    return {
      groups: list.map((g) => g.id === groupId ? { ...g, tabs: nextTabs } : g)
    };
  }
  async function readGroups() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res && res[STORAGE_KEY] || []));
    });
  }
  async function writeGroups(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve);
    });
  }
  async function listSavedGroups() {
    const stored = await readGroups();
    const withSeq = ensureSeq(stored);
    if (withSeq !== stored) await writeGroups(withSeq);
    return withSeq;
  }
  async function removeSavedTab(groupId, url) {
    const groups = (await readGroups()).map((g) => g.id === groupId ? { ...g, tabs: (g.tabs || []).filter((t) => t.url !== url) } : g);
    const pruned = pruneEmptyGroups(groups);
    await writeGroups(pruned);
    return pruned;
  }
  async function updateSavedTab(groupId, oldUrl, patch) {
    const result = applyTabEdit(await readGroups(), groupId, oldUrl, patch);
    if (result.error) return result;
    await writeGroups(result.groups);
    return result;
  }
  async function removeSavedGroup(groupId) {
    const remaining = (await readGroups()).filter((g) => g.id !== groupId);
    await writeGroups(remaining);
    return remaining;
  }
  async function setGroupDescription(groupId, description) {
    const groups = (await readGroups()).map((g) => g.id === groupId ? { ...g, description: String(description || "").trim() } : g);
    await writeGroups(groups);
    return groups;
  }
  function classifyOpenTabs(tabs) {
    const candidates = (tabs || []).filter((tab) => tab && shouldSaveTab(tab.url)).map((tab, index) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || "",
      pinned: tab.pinned === true,
      isCurrent: tab.active === true,
      order: index
    }));
    const rank = (c) => c.isCurrent ? 0 : c.pinned ? 1 : 2;
    return candidates.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  }
  function defaultSelection(candidates) {
    return (candidates || []).filter((c) => !c.isCurrent && !c.pinned).map((c) => c.id);
  }
  function planSaveAndClose(tabs, selectedIds, now = Date.now()) {
    const wanted = new Set(selectedIds || []);
    const chosen = classifyOpenTabs(tabs).filter((c) => wanted.has(c.id));
    if (chosen.length === 0) return { entries: [], closeIds: [], navigateId: null };
    const survivors = (tabs || []).length - chosen.length;
    const current = chosen.find((c) => c.isCurrent) || null;
    const navigateId = current && survivors === 0 ? current.id : null;
    return {
      entries: chosen.map((c) => toEntry(c, now)),
      closeIds: chosen.filter((c) => c.id !== navigateId).map((c) => c.id),
      navigateId
    };
  }
  var NEW_TAB_URL = "chrome://newtab/";
  async function listOpenTabCandidates() {
    return classifyOpenTabs(await chrome.tabs.query({ currentWindow: true }));
  }
  async function saveAndCloseSelected(selectedIds, now = Date.now()) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const { entries, closeIds, navigateId } = planSaveAndClose(tabs, selectedIds, now);
    if (entries.length === 0) return null;
    const groups = addTabsToGroups(await readGroups(), entries, "manual", now);
    await writeGroups(groups);
    for (const id of closeIds) {
      try {
        await chrome.tabs.remove(id);
      } catch (_) {
      }
    }
    if (navigateId != null) {
      try {
        await chrome.tabs.update(navigateId, { url: NEW_TAB_URL });
      } catch (_) {
      }
    }
    const made = groups.find((g) => g.kind === "manual" && g.savedAt === now);
    return made ? made.id : null;
  }

  // src/pages/sidepanel/sidepanel.js
  function showPane(id) {
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }
  function focusSearch(sel) {
    requestAnimationFrame(() => {
      const el3 = document.querySelector(sel);
      if (el3) {
        try {
          el3.focus();
        } catch (_) {
        }
      }
    });
  }
  document.getElementById("tilePastekit").addEventListener("click", () => {
    showPane("view-pastekit");
    focusSearch("#search");
  });
  document.getElementById("tileRemover").addEventListener("click", () => {
    showPane("view-remover");
    loadRemoverView();
  });
  document.getElementById("tileNotes").addEventListener("click", () => {
    showPane("view-notes");
    renderNotes();
    focusSearch("#noteSearch");
  });
  document.getElementById("tileTabs").addEventListener("click", () => {
    showPane("view-tabs");
    renderSavedTabs();
    focusSearch("#tabsSearch");
  });
  document.getElementById("pkBack").addEventListener("click", () => {
    if (pasteKitBack()) return;
    showPane("view-home");
  });
  document.getElementById("removerBack").addEventListener("click", () => showPane("view-home"));
  document.getElementById("notesBack").addEventListener("click", () => {
    if (!document.getElementById("notesEditorPage").hidden) {
      commitNoteEditor();
      return;
    }
    showPane("view-home");
  });
  document.getElementById("tabsBack").addEventListener("click", () => {
    if (!document.getElementById("tabsChoosePage").hidden) {
      showTabsListPage();
      return;
    }
    if (!document.getElementById("tabsDetailPage").hidden) {
      showTabsListPage();
      return;
    }
    showPane("view-home");
  });
  initSidepanel();
  var currentTabId = null;
  var currentHost = null;
  var removerArmed = false;
  var armBtn = (
    /** @type {HTMLButtonElement} */
    document.getElementById("armBtn")
  );
  var removerTitle = (
    /** @type {HTMLElement} */
    document.getElementById("removerTitle")
  );
  var rulesList = (
    /** @type {HTMLElement} */
    document.getElementById("removerRulesList")
  );
  var removerEmpty = (
    /** @type {HTMLElement} */
    document.getElementById("removerEmpty")
  );
  var rememberChk = (
    /** @type {HTMLInputElement} */
    document.getElementById("spRemoverRemember")
  );
  chrome.storage.local.get("rhe_remember", (res) => {
    if (res.rhe_remember !== void 0) rememberChk.checked = res.rhe_remember;
  });
  rememberChk.addEventListener("change", () => {
    chrome.storage.local.set({ rhe_remember: rememberChk.checked });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.rhe_rules && currentHost) {
      const newRules = changes.rhe_rules.newValue || {};
      renderRules(newRules[currentHost] || []);
    }
    if (changes._themeCache && window.__applyTheme) {
      window.__applyTheme(changes._themeCache.newValue);
    }
  });
  armBtn.addEventListener("click", async () => {
    if (!currentTabId) return;
    try {
      const res = await chrome.runtime.sendMessage({ action: "toggleRemoverOnTab", tabId: currentTabId });
      removerArmed = res && res.state === "ON";
    } catch (_) {
      removerArmed = !removerArmed;
    }
    setArmState(removerArmed);
  });
  function setArmState(armed) {
    armBtn.classList.toggle("armed", armed);
    const label = armed ? "Disarm picker" : "Arm picker";
    armBtn.title = label;
    armBtn.setAttribute("aria-label", label);
  }
  function killStickyInPage() {
    var all = document.querySelectorAll("body *");
    for (var i = 0; i < all.length; i++) {
      var el3 = all[i], cs = getComputedStyle(el3);
      if (cs.position === "fixed" || cs.position === "sticky") el3.style.setProperty("display", "none", "important");
      if (cs.overflow === "hidden" || cs.overflowY === "hidden") el3.style.setProperty("overflow", "visible", "important");
    }
    document.documentElement.style.setProperty("overflow", "auto", "important");
    document.body.style.setProperty("overflow", "auto", "important");
  }
  var nukeBtn = document.getElementById("nukeOverlays");
  if (nukeBtn) nukeBtn.addEventListener("click", () => {
    if (!currentTabId || !chrome.scripting || !chrome.scripting.executeScript) return;
    chrome.scripting.executeScript({ target: { tabId: currentTabId }, func: killStickyInPage }).catch(() => {
    });
  });
  async function loadRemoverView() {
    currentTabId = null;
    currentHost = null;
    removerArmed = false;
    setArmState(false);
    removerTitle.textContent = "Remover";
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (_) {
    }
    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      armBtn.disabled = true;
      renderRules([], "No accessible tab");
      return;
    }
    armBtn.disabled = false;
    try {
      currentHost = new URL(tab.url).hostname;
      currentTabId = tab.id;
    } catch (_) {
      armBtn.disabled = true;
      renderRules([], "Unknown site");
      return;
    }
    removerTitle.textContent = currentHost;
    try {
      const res = await chrome.runtime.sendMessage({ action: "getRemoverState", tabId: currentTabId });
      removerArmed = res && res.state === "ON";
      setArmState(removerArmed);
    } catch (_) {
    }
    const result = await chrome.storage.local.get("rhe_rules");
    const allRules = result.rhe_rules || {};
    renderRules(allRules[currentHost] || []);
  }
  function renderRules(rules, emptyText) {
    rulesList.replaceChildren();
    if (emptyText) fillEmptyState(removerEmpty, Icons.eraser, emptyText);
    else fillEmptyState(
      removerEmpty,
      Icons.eraser,
      "No rules for this site yet",
      "Arm the picker, then click parts of the page to hide them"
    );
    removerEmpty.hidden = rules.length > 0;
    rules.forEach((rule, idx) => {
      const r = readRule(rule);
      const row = el2("button", "settings-row");
      row.type = "button";
      const text = el2("span", "settings-row-text");
      const title = el2("span", "settings-row-title sp-mono-title", ruleName(r.selector));
      title.title = r.selector;
      text.appendChild(title);
      text.appendChild(el2("span", "settings-row-value", ruleLabel(r)));
      row.appendChild(text);
      row.appendChild(el2("span", "sp-row-btn", "\u22EF"));
      row.addEventListener("click", () => openRuleMenu(r, idx));
      rulesList.appendChild(row);
    });
  }
  async function setRuleScope(idx, specific) {
    const allRules = (await chrome.storage.local.get("rhe_rules")).rhe_rules || {};
    const hostRules = allRules[currentHost] || [];
    const prev = hostRules[idx];
    if (prev === void 0) return;
    hostRules[idx] = typeof prev === "string" ? { selector: prev, specific, broad: false, path: null } : { ...prev, specific };
    allRules[currentHost] = hostRules;
    await chrome.storage.local.set({ rhe_rules: allRules });
  }
  function openRuleMenu(r, idx) {
    openPanelDialog({
      /* The NAME, never the raw path: a page-generated selector ran twelve lines
         and became the whole dialog (R-037). Page-derived text is hostile and
         gets a ceiling before it enters a fixed-size component. */
      title: ruleName(r.selector),
      subtitle: "Where this rule applies",
      rows: [
        { mark: !r.specific, label: "Whole site", onPick: () => setRuleScope(idx, false) },
        { mark: r.specific, label: "This page only", onPick: () => setRuleScope(idx, true) },
        /* Independent of the scope pair: its tick means ON, not "the choice". */
        {
          mark: r.broad,
          label: "Broad match",
          onPick: () => {
            if (!currentTabId) return;
            chrome.tabs.sendMessage(currentTabId, {
              method: "toggleBroad",
              data: { oldSelector: r.selector, isBroad: !r.broad, isSpecific: r.specific },
              path: "background-to-page"
            });
          }
        },
        {
          danger: true,
          icon: Icons.delete,
          label: "Delete rule",
          confirmLabel: "Delete, are you sure?",
          onPick: () => deleteRule(idx)
        }
      ]
    });
  }
  async function deleteRule(idx) {
    const result = await chrome.storage.local.get("rhe_rules");
    const allRules = result.rhe_rules || {};
    const hostRules = (allRules[currentHost] || []).slice();
    hostRules.splice(idx, 1);
    if (hostRules.length === 0) delete allRules[currentHost];
    else allRules[currentHost] = hostRules;
    await chrome.storage.local.set({ rhe_rules: allRules });
    renderRules(allRules[currentHost] || []);
  }
  var notesList = document.getElementById("notesList");
  var noteSearch = document.getElementById("noteSearch");
  var notesTitle = document.getElementById("notesTitle");
  var notesBar = document.getElementById("notesBar");
  var notesListPage = document.getElementById("notesListPage");
  var notesEditorPage = document.getElementById("notesEditorPage");
  var noteActions = document.getElementById("noteActions");
  var noteListActions = document.getElementById("noteListActions");
  var notesFoot = document.getElementById("notesFoot");
  var noteTitle = document.getElementById("noteTitle");
  var noteBody = document.getElementById("noteBody");
  var noteSession = createNoteSession(BookmarkDB);
  async function renderNotes() {
    const query2 = (noteSearch.value || "").trim().toLowerCase();
    const all = await BookmarkDB.listNotes();
    const notes = query2 ? all.filter((n) => (n.title || "").toLowerCase().includes(query2) || (n.body || "").toLowerCase().includes(query2)) : all;
    notesList.replaceChildren();
    if (notes.length === 0) {
      notesList.appendChild(query2 ? emptyState(Icons.search, "No matching notes") : emptyState(Icons.pencil, "No notes yet"));
      return;
    }
    for (const note of notes) {
      notesList.appendChild(noteRow(note));
    }
  }
  function noteRow(note) {
    const row = document.createElement("div");
    row.className = "settings-row";
    const text = document.createElement("span");
    text.className = "settings-row-text";
    const nm = document.createElement("span");
    nm.className = "settings-row-title";
    nm.textContent = (note.title || "").trim() || firstLine(note.body) || "Untitled note";
    const ds = document.createElement("span");
    ds.className = "settings-row-value";
    ds.textContent = firstLine(note.body) || formatWhen(note.updatedAt);
    text.append(nm, ds);
    row.appendChild(text);
    const more = document.createElement("button");
    more.className = "sp-row-btn";
    more.textContent = "\u22EF";
    more.title = "Edit / delete";
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      noteMenu(note);
    });
    row.appendChild(more);
    row.addEventListener("click", () => openNoteEditor(note));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      noteMenu(note);
    });
    return row;
  }
  function noteMenu(note) {
    openPanelDialog({
      title: (note.title || "").trim() || firstLine(note.body) || "Untitled note",
      rows: [
        { icon: Icons.edit, label: "Edit", onPick: () => openNoteEditor(note) },
        {
          icon: Icons.delete,
          label: "Delete",
          danger: true,
          onPick: async () => {
            if (note.id) await BookmarkDB.deleteNote(note.id);
            await renderNotes();
          }
        }
      ]
    });
  }
  function firstLine(body) {
    return (body || "").split("\n").find((line) => line.trim()) || "";
  }
  function formatDay(ts) {
    if (!ts) return "";
    const date = new Date(ts);
    const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((midnight(/* @__PURE__ */ new Date()) - midnight(date)) / 864e5);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function formatWhen(ts) {
    if (!ts) return "";
    const date = new Date(ts);
    const sameDay = date.toDateString() === (/* @__PURE__ */ new Date()).toDateString();
    return sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function openNoteEditor(note) {
    const opening = note || { id: null, title: "", body: "" };
    noteTitle.value = opening.title || "";
    noteBody.value = opening.body || "";
    noteSession.open(note || null);
    notesTitle.textContent = opening.id ? "Edit note" : "New note";
    showNotesPage("editor");
    noteListActions.classList.add("hidden");
    noteActions.classList.remove("hidden");
    try {
      noteTitle.focus();
    } catch (_) {
    }
  }
  function closeNoteEditor() {
    notesTitle.textContent = "Notes";
    showNotesPage("list");
    noteListActions.classList.remove("hidden");
    noteActions.classList.add("hidden");
  }
  function showNotesPage(which) {
    notesListPage.hidden = which !== "list";
    notesEditorPage.hidden = which !== "editor";
    notesBar.hidden = which !== "list";
    notesFoot.hidden = which !== "editor";
  }
  noteSearch.addEventListener("input", () => renderNotes());
  document.getElementById("noteNewBtn").addEventListener("click", () => openNoteEditor(null));
  noteTitle.addEventListener("input", queueNoteAutosave);
  noteBody.addEventListener("input", queueNoteAutosave);
  function queueNoteAutosave() {
    noteSession.change(noteTitle.value, noteBody.value);
  }
  noteTitle.addEventListener("blur", () => noteSession.flush());
  noteBody.addEventListener("blur", () => noteSession.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) noteSession.flush();
  });
  window.addEventListener("pagehide", () => noteSession.flush());
  document.getElementById("noteCancelBtn").addEventListener("click", async () => {
    const done = noteSession.revert();
    closeNoteEditor();
    await done;
    await renderNotes();
  });
  document.getElementById("noteSaveBtn").addEventListener("click", () => commitNoteEditor());
  async function commitNoteEditor() {
    if (!noteSession.isOpen) {
      closeNoteEditor();
      return;
    }
    const done = noteSession.commit();
    closeNoteEditor();
    await done;
    await renderNotes();
  }
  var SCROLLERS = [
    ["list", ".settings-row"],
    // PasteKit snippets
    ["notesList", ".settings-row"],
    ["notesEditorScroll", "label"],
    ["savedTabsList", ".settings-row"],
    ["tabsDetailScroll", ".settings-row"],
    // a session's tabs
    ["tabsChooseScroll", ".settings-row"],
    // the open tabs, spec 007
    ["removerScroll", ".settings-row"],
    // remover rules, spec 008
    ["pkEditorScroll", "label, details"],
    // the snippet form
    ["pkSettingsScroll", ".settings-row, .sp-sect"]
  ];
  for (const [id, items] of SCROLLERS) {
    const scroller = document.getElementById(id);
    if (!scroller) continue;
    const host = scroller.closest(".pane-host, .sp-scrollhost");
    if (!host) {
      throw new Error(
        `scroll affordance: #${scroller.id} has no .sp-scrollhost or .pane-host parent. Wrap the scroller in one; a host that holds anything else paints the fades over its siblings.`
      );
    }
    attachScrollAffordance(scroller, { host, items });
  }
  var savedTabsList = document.getElementById("savedTabsList");
  var tabsSearch = document.getElementById("tabsSearch");
  var tabsBar = document.getElementById("tabsBar");
  var tabsFoot = document.getElementById("tabsFoot");
  var tabsTitle = document.getElementById("tabsTitle");
  var tabsListPage = document.getElementById("tabsListPage");
  var tabsDetailPage = document.getElementById("tabsDetailPage");
  var tabsDetailBody = document.getElementById("tabsDetailBody");
  var tabsListActions = document.getElementById("tabsListActions");
  var tabsDetailActions = document.getElementById("tabsDetailActions");
  var tabsChoosePage = document.getElementById("tabsChoosePage");
  var tabsChooseScroll = document.getElementById("tabsChooseScroll");
  var tabsChooseActions = document.getElementById("tabsChooseActions");
  var tabsSelectToggle = document.getElementById("tabsSelectToggleBtn");
  var tabsChooseSave = document.getElementById("tabsChooseSaveBtn");
  var detailGroup = null;
  function el2(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function sessionName(group) {
    return group.description || `Save ${group.seq || "?"}`;
  }
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  function openGroupTabs(group) {
    for (const entry of group.tabs) chrome.tabs.create({ url: entry.url, active: false });
  }
  function sessionMenu(group) {
    openPanelDialog({
      /* No subtitle: the date-and-count line was reviewed and disliked, and the
         row already shows both. */
      title: sessionName(group),
      rows: [
        {
          icon: Icons.edit,
          label: "Rename",
          input: {
            value: group.description || "",
            onSave: async (value) => {
              await setGroupDescription(group.id, value.trim());
              if (detailGroup && detailGroup.id === group.id) {
                detailGroup = { ...detailGroup, description: value.trim() };
                tabsTitle.textContent = sessionName(detailGroup);
              }
              await renderSavedTabs();
            }
          }
        },
        {
          icon: Icons.delete,
          label: "Delete",
          danger: true,
          onPick: async () => {
            await removeSavedGroup(group.id);
            if (detailGroup && detailGroup.id === group.id) showTabsListPage();
            await renderSavedTabs();
          }
        }
      ]
    });
  }
  function tabMenu(group, entry) {
    openPanelDialog({
      title: entry.title || entry.url,
      subtitle: entry.url,
      rows: [
        {
          icon: Icons.edit,
          label: "Rename",
          input: {
            value: entry.title || "",
            onSave: async (value) => {
              const result = await updateSavedTab(group.id, entry.url, {
                title: value,
                url: entry.url
              });
              if (result.error) return result.error;
              await refreshSessionDetail();
            }
          }
        },
        {
          icon: Icons.link,
          label: "Change address",
          input: {
            value: entry.url,
            onSave: async (value) => {
              const result = await updateSavedTab(group.id, entry.url, {
                title: entry.title,
                url: value
              });
              if (result.error) return result.error;
              await refreshSessionDetail();
            }
          }
        },
        {
          icon: Icons.delete,
          label: "Delete",
          danger: true,
          onPick: async () => {
            await removeSavedTab(group.id, entry.url);
            await refreshSessionDetail();
          }
        }
      ]
    });
  }
  function sessionRow(group) {
    const row = el2("div", "settings-row");
    const text = el2("span", "settings-row-text");
    const count = group.tabs.length;
    text.append(
      el2("span", "settings-row-title", sessionName(group)),
      /* Day and count together: the title already carries identity, so this line
         is free to answer both "when" and "how big" at a glance. */
      el2(
        "span",
        "settings-row-value",
        `${formatDay(group.savedAt)} \xB7 ${count} ${count === 1 ? "tab" : "tabs"}`
      )
    );
    const open = el2("button", "sp-open-pill", `Open ${group.tabs.length}`);
    open.addEventListener("click", (e) => {
      e.stopPropagation();
      openGroupTabs(group);
    });
    const more = el2("button", "sp-row-btn", "\u22EF");
    more.title = "Rename / delete";
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      sessionMenu(group);
    });
    row.append(text, open, more);
    row.addEventListener("click", () => openSessionDetail(group));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      sessionMenu(group);
    });
    return row;
  }
  function tabRow(group, entry) {
    const row = el2("div", "settings-row");
    row.title = entry.url;
    const text = el2("span", "settings-row-text");
    text.append(
      el2("span", "settings-row-title", entry.title || entry.url),
      el2("span", "settings-row-value", hostOf(entry.url))
    );
    const more = el2("button", "sp-row-btn", "\u22EF");
    more.title = "Rename / edit / delete";
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      tabMenu(group, entry);
    });
    row.append(text, more);
    row.addEventListener("click", () => chrome.tabs.create({ url: entry.url }));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      tabMenu(group, entry);
    });
    return row;
  }
  async function renderSavedTabs() {
    const query2 = (tabsSearch.value || "").trim();
    const all = await listSavedGroups();
    const groups = all.filter((g) => groupMatches(g, query2));
    savedTabsList.replaceChildren();
    if (groups.length === 0) {
      savedTabsList.appendChild(query2 ? emptyState(Icons.search, "No matching tabs") : emptyState(Icons.tabs, "Nothing saved yet"));
      return;
    }
    for (const group of groups) savedTabsList.appendChild(sessionRow(group));
  }
  function showTabsPage(which) {
    tabsListPage.hidden = which !== "list";
    tabsDetailPage.hidden = which !== "detail";
    tabsChoosePage.hidden = which !== "choose";
    tabsBar.hidden = which !== "list";
    tabsListActions.classList.toggle("hidden", which !== "list");
    tabsDetailActions.classList.toggle("hidden", which !== "detail");
    tabsChooseActions.classList.toggle("hidden", which !== "choose");
    tabsFoot.hidden = which === "list";
  }
  function showTabsListPage() {
    detailGroup = null;
    tabsTitle.textContent = "Saved tabs";
    showTabsPage("list");
  }
  function openSessionDetail(group) {
    detailGroup = group;
    tabsTitle.textContent = sessionName(group);
    tabsDetailBody.replaceChildren();
    for (const entry of group.tabs) tabsDetailBody.appendChild(tabRow(group, entry));
    showTabsPage("detail");
  }
  async function refreshSessionDetail() {
    if (!detailGroup) {
      await renderSavedTabs();
      return;
    }
    const fresh = (await listSavedGroups()).find((g) => g.id === detailGroup.id);
    if (!fresh || fresh.tabs.length === 0) {
      showTabsListPage();
      await renderSavedTabs();
      return;
    }
    detailGroup = fresh;
    tabsTitle.textContent = sessionName(fresh);
    tabsDetailBody.replaceChildren();
    for (const entry of fresh.tabs) tabsDetailBody.appendChild(tabRow(fresh, entry));
    await renderSavedTabs();
  }
  document.getElementById("tabsOpenAllBtn").addEventListener("click", () => {
    if (detailGroup) openGroupTabs(detailGroup);
  });
  tabsSearch.addEventListener("input", () => renderSavedTabs());
  var chooseCandidates = [];
  var chooseSelected = /* @__PURE__ */ new Set();
  function chooseRow(candidate) {
    const row = el2("button", "settings-row");
    row.type = "button";
    if (chooseSelected.has(candidate.id)) row.classList.add("is-checked");
    const text = el2("span", "settings-row-text");
    text.appendChild(el2("span", "settings-row-title", candidate.title));
    const host = (() => {
      try {
        return new URL(candidate.url).hostname.replace(/^www\./, "");
      } catch (_) {
        return candidate.url;
      }
    })();
    const label = candidate.isCurrent ? `Current tab \xB7 ${host}` : candidate.pinned ? `Pinned \xB7 ${host}` : host;
    text.appendChild(el2("span", "settings-row-value", label));
    row.appendChild(text);
    row.appendChild(el2("span", "picker-check"));
    row.addEventListener("click", () => {
      if (chooseSelected.has(candidate.id)) chooseSelected.delete(candidate.id);
      else chooseSelected.add(candidate.id);
      row.classList.toggle("is-checked", chooseSelected.has(candidate.id));
      syncChooseFoot();
    });
    return row;
  }
  function syncChooseFoot() {
    const n = chooseSelected.size;
    tabsChooseSave.textContent = n ? `Save and close (${n})` : "Save and close";
    tabsChooseSave.disabled = n === 0;
    tabsSelectToggle.textContent = n === chooseCandidates.length && n > 0 ? "Select none" : "Select all";
  }
  async function openChooseTabs() {
    chooseCandidates = await listOpenTabCandidates();
    chooseSelected = new Set(defaultSelection(chooseCandidates));
    tabsChooseScroll.replaceChildren();
    if (chooseCandidates.length === 0) {
      tabsChooseScroll.appendChild(emptyState(Icons.list, "No open tabs to save"));
    } else {
      for (const c of chooseCandidates) tabsChooseScroll.appendChild(chooseRow(c));
    }
    tabsTitle.textContent = "Choose tabs";
    showTabsPage("choose");
    syncChooseFoot();
  }
  document.getElementById("tabsSaveAllBtn").addEventListener("click", openChooseTabs);
  tabsSelectToggle.addEventListener("click", () => {
    const all = chooseSelected.size === chooseCandidates.length && chooseCandidates.length > 0;
    chooseSelected = all ? /* @__PURE__ */ new Set() : new Set(chooseCandidates.map((c) => c.id));
    for (const row of tabsChooseScroll.querySelectorAll(".settings-row")) {
      row.classList.toggle("is-checked", !all);
    }
    syncChooseFoot();
  });
  tabsChooseSave.addEventListener("click", async () => {
    if (chooseSelected.size === 0) return;
    await saveAndCloseSelected([...chooseSelected]);
    showTabsListPage();
    await renderSavedTabs();
  });
})();
//# sourceMappingURL=sidepanel.bundle.js.map
