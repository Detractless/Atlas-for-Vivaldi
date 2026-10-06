// Settings page. Builds the full-page settings UI (sidebar, cards, pills, toggles,
// dropdown menu) and drives the original, hidden settings controls in
// #settings-modal. Saving, reverting, pickers and the limiter/delay logic all
// stay in the main bundle; this file only reads and sets those controls.
(function () {
  const modal = document.getElementById("settings-modal");
  const closeBtn = document.getElementById("close-settings-modal");
  const saveBtn = document.getElementById("save-settings");
  if (!modal || !closeBtn || !saveBtn) return;

  const $ = (id) => document.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const subpageOpen = () => !!document.querySelector(".settings-subpage:not([hidden])");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Icons ---------- */
  const I = {
    search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3 3"/>',
    sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1"/>',
    focus: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.5"/>',
    db: '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
    reset: '<path d="M4 10a6 6 0 1 0 2-4.5M4 3.5v3h3"/>',
    star: '<path d="m10 3 2.1 4.4 4.9.6-3.6 3.3.9 4.8L10 13.7 5.7 16l.9-4.8L3 7.9l4.9-.6z"/>',
    ext: '<path d="M7 13 13 7M8 7h5v5"/>'
  };
  const svg = (d, cls = "") =>
    `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const CHEV =
    '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg>';
  const CHECK =
    '<svg viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l3 3 6-7"/></svg>';

  /* ---------- Controls: each reads/sets the original hidden control ---------- */
  const radio = (name, labels) => ({
    options: Object.entries(labels).map(([value, label]) => ({ value, label })),
    get() {
      const c = document.querySelector(`input[name="${name}"]:checked`);
      return c ? c.value : null;
    },
    set(v) {
      const r = document.querySelector(`input[name="${name}"][value="${v}"]`);
      if (r) { r.checked = true; fire(r, "change"); }
    }
  });

  const SCALE = { "0.75": "75%", "0.9": "90%", "1": "100%", "1.1": "110%", "1.25": "125%" };
  const scale = {
    options: Object.entries(SCALE).map(([value, label]) => ({ value, label })),
    get() {
      const on = document.querySelector(".scale-btn.active");
      if (on) return on.dataset.value;
      const span = document.querySelector('[data-picker-value="ui-scale"]');
      const text = span ? span.textContent.trim() : "";
      const hit = Object.entries(SCALE).find(([, l]) => l === text);
      return hit ? hit[0] : null;
    },
    set(v) {
      const b = document.querySelector(`.scale-btn[data-value="${v}"]`);
      if (b) b.click();
      setTimeout(() => document.dispatchEvent(new CustomEvent("settings-modal-opened")), 150);
    }
  };

  const LIMITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const limit = {
    options: LIMITS.map((v) => ({ value: v, label: v === "0" ? "Off" : v })),
    get() {
      const b = document.querySelector(".limit-btn.active:not(.delay-btn):not(.scale-btn)");
      return b ? b.dataset.limit : "0";
    },
    set(v) {
      const b = document.querySelector(`.limit-btn[data-limit="${v}"]:not(.delay-btn)`);
      if (b) b.click();
      refreshSoon();
    }
  };

  const DELAYS = [["0", "Off"], ["15", "15 seconds"], ["30", "30 seconds"], ["60", "1 minute"], ["120", "2 minutes"], ["300", "5 minutes"]];
  const delay = {
    options: DELAYS.map(([value, label]) => ({ value, label })),
    get() {
      const b = document.querySelector(".delay-btn.active");
      return b ? b.dataset.value : null;
    },
    set(v) {
      const b = document.querySelector(`.delay-btn[data-value="${v}"]`);
      if (b) b.click();
      refreshSoon();
    }
  };

  const check = (id) => ({
    get: () => { const e = $(id); return !!(e && e.checked); },
    set(v) { const e = $(id); if (e) { e.checked = v; fire(e, "change"); } }
  });

  // Grayscale: applied to the whole new tab and saved the moment it is toggled,
  // like the other Focus settings. It is not tied to Save / Discard.
  const gray = {
    on: false,
    apply(v) {
      gray.on = !!v;
      document.documentElement.classList.toggle("grayscale", gray.on);
    },
    get: () => gray.on,
    set(v) {
      gray.apply(v);
      try { chrome.storage.sync.set({ grayscale: gray.on }); } catch (e) {}
    }
  };
  try {
    chrome.storage.sync.get("grayscale", (r) => gray.apply(r && r.grayscale));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.grayscale) gray.apply(changes.grayscale.newValue);
    });
  } catch (e) {}

  const C = {
    grayscale: gray,
    spotlight: check("spotlight-checkbox"),
    showQuery: check("show-query-checkbox"),
    engine: radio("search-behavior", { "remember": "Remember last selected", "always-default": "Always reset to default" }),
    pills: radio("bookmark-pill-behavior", { "prefix": "When typing ./", "always": "Always" }),
    theme: radio("theme-choice", { "system": "System", "light": "Light", "dark": "Dark", "custom": "Custom" }),
    scale,
    limit,
    method: radio("management-method", { "random": "Close a random tab", "block": "Block the new tab" }),
    delay
  };

  /* ---------- Row builders ---------- */
  const labelOf = (key) => {
    const c = C[key], v = c.get();
    const o = c.options.find((x) => String(x.value) === String(v));
    return o ? o.label : "-";
  };
  const select = (key, sm = false) =>
    `<button class="sp-pill${sm ? " sm" : ""}" data-select="${key}"><span>${labelOf(key)}</span>${CHEV}</button>`;
  const toggle = (key) =>
    `<button class="sp-toggle" role="switch" data-toggle="${key}" aria-checked="${C[key].get()}"></button>`;
  const row = (title, desc, ctrl) =>
    `<div class="sp-row"><div class="sp-row-text"><div class="sp-row-title">${title}</div>${desc ? `<div class="sp-row-desc">${desc}</div>` : ""}</div><div class="sp-row-ctrl">${ctrl}</div></div>`;
  const card = (rows) => `<div class="sp-card">${rows.join("")}</div>`;
  const section = (title, cards) =>
    `<div class="sp-section">${title ? `<h2 class="sp-section-title">${title}</h2>` : ""}${cards.join("")}</div>`;

  const modeThumb = (id, bg, panel, line) => `
    <button class="sp-mode" role="radio" data-mode="${id}" aria-checked="${C.theme.get() === id}" aria-label="${id}">
      <svg viewBox="0 0 80 60">${id === "system"
        ? `<rect width="40" height="60" fill="#f4f4f4"/><rect x="40" width="40" height="60" fill="#1c1c1c"/>
           <rect x="6" y="8" width="10" height="44" rx="2" fill="#e2e2e2"/><rect x="46" y="8" width="10" height="44" rx="2" fill="#2e2e2e"/>
           <rect x="20" y="14" width="14" height="2.5" rx="1" fill="#7aa7f7"/><rect x="60" y="14" width="14" height="2.5" rx="1" fill="#7aa7f7"/>`
        : `<rect width="80" height="60" fill="${bg}"/><rect x="6" y="8" width="14" height="44" rx="2" fill="${panel}"/>
           <rect x="26" y="12" width="40" height="2.5" rx="1" fill="#7aa7f7"/><rect x="26" y="20" width="30" height="2.5" rx="1" fill="${line}"/>
           <rect x="26" y="28" width="44" height="2.5" rx="1" fill="#7aa7f7"/><rect x="26" y="36" width="24" height="2.5" rx="1" fill="${line}"/>`}
      </svg>
    </button>`;

  const pendingText = (boxId) => {
    const box = $(boxId);
    if (!box || box.style.display === "none") return "";
    return box.textContent.replace(/\s+/g, " ").replace(/\s*Cancel\s*$/, "").trim();
  };

  let resetConfirm = false;

  const PAGES = {
    search: () =>
      section("", [card([
        row("Search bar", "Show the search bar on your new tab", toggle("spotlight")),
        row("Engine preference", "Which engine the search bar starts with", select("engine")),
        row("Bookmark pills", "When bookmark pills appear while typing", select("pills"))
      ])]),
    appearance: () =>
      section("Visual style", [
        card([row("Theme", "", `<div class="sp-modes" role="radiogroup">${modeThumb("system")}${modeThumb("light", "#fafafa", "#ececec", "#c9c9c9")}${modeThumb("dark", "#1c1c1c", "#2e2e2e", "#555")}</div>`)]),
        card([row("UI scale", "Size of everything on the new tab", select("scale"))])
      ]),
    focus: () =>
      section("Tab limiter", [card([
        row("Tab limit", pendingText("limiter-pending-box") || "Decreases apply now. Increases take 30 minutes.", select("limit")),
        row("When the limit is hit", "", select("method"))
      ])]) +
      section("Search delay", [card([
        row("Delay", pendingText("delay-pending-box") || "A pause before results, to make searching deliberate. Increases apply now. Decreases take 30 minutes.", select("delay")),
        row("Show the search query", "While you wait", toggle("showQuery"))
      ])]) +
      section("Display", [card([
        row("Grayscale", "Remove color from the new tab", toggle("grayscale"))
      ])]),
    backup: () =>
      section("", [card([
        row("Export", "Save your bookmarks, settings and snippets to a .detractless file", `<button class="sp-pill" data-action="export">Export</button>`),
        row("Import", "Bring in a .detractless, .pastekit or .json file", `<button class="sp-pill" data-action="import">Import</button>`)
      ])]),
    reset: () =>
      section("", [card([
        row("Reset everything", "Erases bookmarks, settings and snippets stored on this computer", resetConfirm ? "" : `<button class="sp-pill danger" data-action="reset-ask">Reset</button>`),
        ...(resetConfirm ? [`<div class="sp-confirm"><div class="sp-row-desc">This cannot be undone. Everything stored on this computer is deleted.</div><div class="sp-confirm-btns"><button class="sp-pill" data-action="reset-cancel">Cancel</button><button class="sp-pill danger" data-action="reset-go">Erase everything</button></div></div>`] : [])
      ])])
  };

  const NAV = [
    { group: "Settings", items: [
      { id: "search", label: "Search", icon: I.search },
      { id: "appearance", label: "Appearance", icon: I.sun },
      { id: "focus", label: "Focus", icon: I.focus }
    ] },
    { group: "Data", items: [
      { id: "backup", label: "Backup", icon: I.db },
      { id: "reset", label: "Reset", icon: I.reset },
      { id: "review", label: "Leave a review", icon: I.star, external: true }
    ] }
  ];
  const REVIEW_URL = "https://chromewebstore.google.com/detail/ipgmbcinekdcmhhnbanlahedgpehffab";

  /* ---------- Shell ---------- */
  const root = document.createElement("div");
  root.id = "sp-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="sp-layout">
      <aside class="sp-sidebar">
        <button class="sp-nav-item" id="sp-back">${svg('<path d="M16 10H4m5-5-5 5 5 5"/>')}Back to dashboard</button>
        <label class="sp-search">${svg(I.search)}<input id="sp-search" type="text" placeholder="Search" autocomplete="off"></label>
        <nav id="sp-nav"></nav>
        <div class="sp-side-foot">
          <button class="sp-nav-item" id="sp-discard" hidden>Discard changes</button>
          <button class="sp-version" id="sp-version" tabindex="-1"></button>
        </div>
      </aside>
      <main class="sp-main"><div class="sp-content" id="sp-content"></div></main>
    </div>
    <ul class="sp-menu" id="sp-menu" role="menu" tabindex="-1"></ul>`;
  document.body.appendChild(root);
  /* Cancel the page-wide UI Scale zoom so settings stays at 100%. */
  const unzoom = () => {
    const z = parseFloat(document.body.style.zoom);
    root.style.zoom = z && z !== 1 ? String(1 / z) : "";
  };
  unzoom();
  new MutationObserver(unzoom).observe(document.body, { attributes: true, attributeFilter: ["style"] });

  const navEl = $("sp-nav"), content = $("sp-content"), menu = $("sp-menu");
  let current = "search", dirty = false, menuOwner = null;

  function renderNav(filter = "") {
    const f = filter.trim().toLowerCase();
    navEl.innerHTML = NAV.map((g) => {
      const items = g.items.filter((i) => i.label.toLowerCase().includes(f));
      if (!items.length) return "";
      return `<div class="sp-group-label">${g.group}</div>` + items.map((i) =>
        `<button class="sp-nav-item" data-page="${i.id}" ${i.id === current ? 'aria-current="page"' : ""}>${svg(i.icon)}${i.label}${i.external ? svg(I.ext, "ext") : ""}</button>`
      ).join("");
    }).join("");
  }
  function renderPage() {
    closeMenu();
    const item = NAV.flatMap((g) => g.items).find((i) => i.id === current);
    content.innerHTML = `<h1 class="sp-page-title">${item.label}</h1>` + PAGES[current]();
  }
  function go(id) {
    if (id === "review") { window.open(REVIEW_URL, "_blank", "noopener"); return; }
    if (!PAGES[id]) return;
    current = id;
    resetConfirm = false;
    renderNav($("sp-search").value);
    renderPage();
  }
  function render() { renderNav($("sp-search").value); renderPage(); }
  function setDirty(v) { dirty = v; $("sp-discard").hidden = !v; }

  /* ---------- Opening, refreshing, closing ---------- */
  async function refresh() {
    // Opening the original sub-pages makes the main bundle refresh the limiter and
    // delay controls; return to the home view afterwards.
    for (const name of ["limiter", "delay"]) {
      const r = document.querySelector(`[data-subpage="${name}"]`);
      if (r) r.click();
      await wait(120);
    }
    if (subpageOpen()) closeBtn.click();
    await wait(120);
    if (!root.hidden) render();
  }
  let refreshTimer = 0;
  function refreshSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 250); }

  let opening = false;
  function syncVisibility() {
    const open = modal.classList.contains("show");
    if (open && root.hidden) {
      root.hidden = false;
      setDirty(false);
      $("sp-version").textContent = ($("version-trigger") || {}).textContent || "";
      render();
      opening = true;
      refresh().finally(() => { opening = false; });
    } else if (!open && !root.hidden) {
      root.hidden = true;
      closeMenu();
      forgetSettingsUrl();
    }
  }
  /* A closed settings page must not stay in the URL: the next reload (a profile
     switch reloads every new tab) would open it again. */
  function forgetSettingsUrl() {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has("settings") && u.hash !== "#settings") return;
      u.searchParams.delete("settings");
      history.replaceState(null, "", u.pathname + u.search);
    } catch (e) {}
  }
  new MutationObserver(syncVisibility).observe(modal, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("settings-modal-opened", () => { setTimeout(() => { if (!root.hidden && !opening) render(); }, 0); });

  $("sp-back").addEventListener("click", () => { saveBtn.click(); });
  $("sp-discard").addEventListener("click", () => {
    if (subpageOpen()) closeBtn.click();
    closeBtn.click();
  });
  $("sp-version").addEventListener("click", () => { const v = $("version-trigger"); if (v) v.click(); });

  navEl.addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b) go(b.dataset.page); });
  $("sp-search").addEventListener("input", (e) => renderNav(e.target.value));

  /* ---------- Controls ---------- */
  content.addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) {
      const k = t.dataset.toggle, v = t.getAttribute("aria-checked") !== "true";
      C[k].set(v); t.setAttribute("aria-checked", String(v)); setDirty(true); return;
    }
    const m = e.target.closest("[data-mode]");
    if (m) {
      C.theme.set(m.dataset.mode); setDirty(true);
      content.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b === m)));
      return;
    }
    const s = e.target.closest("[data-select]");
    if (s) { openMenu(s); return; }
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const act = a.dataset.action;
    if (act === "export") { const b = $("export-btn"); if (b) b.click(); }
    else if (act === "import") { const b = $("import-btn"); if (b) b.click(); }
    else if (act === "reset-ask") { resetConfirm = true; renderPage(); }
    else if (act === "reset-cancel") { resetConfirm = false; renderPage(); }
    else if (act === "reset-go") { const b = $("reset-confirm-btn"); if (b) b.click(); }
  });

  /* ---------- Dropdown menu ---------- */
  function openMenu(btn) {
    if (menuOwner === btn) return closeMenu();
    menuOwner = btn;
    const key = btn.dataset.select, c = C[key], cur = String(c.get());
    menu.innerHTML = c.options.map((o) =>
      `<li class="sp-menu-item" role="menuitemradio" tabindex="-1" aria-checked="${String(o.value) === cur}" data-value="${o.value}"><span>${o.label}</span>${CHECK}</li>`
    ).join("");
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = Math.max(200, r.width) + "px";
    menu.style.top = r.bottom + 6 + "px";
    menu.style.left = "0px";
    menu.classList.add("open");
    const maxTop = window.innerHeight - menu.offsetHeight - 8;
    if (r.bottom + 6 > maxTop) menu.style.top = Math.max(8, r.top - menu.offsetHeight - 6) + "px";
    menu.style.left = Math.max(8, r.right - menu.offsetWidth) + "px";
    menu.focus();
  }
  function closeMenu() { menu.classList.remove("open"); menuOwner = null; }
  function pick(li) {
    const key = menuOwner.dataset.select;
    C[key].set(li.dataset.value);
    setDirty(true);
    const b = menuOwner;
    b.querySelector("span").textContent = li.textContent;
    closeMenu();
    b.focus();
  }
  menu.addEventListener("mousemove", (e) => { const li = e.target.closest(".sp-menu-item"); if (li && document.activeElement !== li) li.focus(); });
  menu.addEventListener("mouseleave", () => { if (menuOwner) menu.focus(); });
  menu.addEventListener("click", (e) => { const li = e.target.closest(".sp-menu-item"); if (li) pick(li); });
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.children];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (i === -1) return (menu.querySelector('[aria-checked="true"]') || items[0]).focus();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    }
    if ((e.key === "Enter" || e.key === " ") && i !== -1) { e.preventDefault(); pick(items[i]); }
    if (e.key === "Escape") { e.stopPropagation(); const b = menuOwner; closeMenu(); if (b) b.focus(); }
  }, true);
  document.addEventListener("mousedown", (e) => {
    if (menuOwner && !menu.contains(e.target) && !menuOwner.contains(e.target)) closeMenu();
  });
  window.addEventListener("resize", closeMenu);
  root.querySelector(".sp-main").addEventListener("scroll", closeMenu);

  /* Other scripts (profilesPage.js) add pages through this. A page can be asked
     for by URL (?settings=<id>) or by message ({atlas:{act:"open-settings",page}}). */
  window.AtlasSettingsUI = {
    current: () => current,
    rerender: () => { if (!root.hidden) renderPage(); },
    go, content, svg, row, card, section, I,
    register(def) {
      PAGES[def.id] = def.render;
      const group = NAV.find((g) => g.group === (def.group || "Settings"));
      const at = group.items.findIndex((i) => i.id === def.before);
      group.items.splice(at < 0 ? group.items.length : at, 0, { id: def.id, label: def.label, icon: def.icon });
      if (new URLSearchParams(location.search).get("settings") === def.id) current = def.id;
      if (!root.hidden) render();
    }
  };
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      const a = msg && msg.atlas;
      if (a && a.act === "open-settings" && a.page) setTimeout(() => go(a.page), 30);
    });
  } catch (e) {}

  syncVisibility();
})();
