// src/settings/shell.js — the full-page Settings UI: sidebar, page content,
// opening and closing. Every control saves the moment it changes (registry.js),
// so there is no Save button and nothing to discard: "Back to dashboard" closes.
import { PAGES, NAV, REVIEW_URL, resetState } from './pages.js';
import { CONTROLS } from './controls.js';
import { onSettingChange } from './registry.js';
import { I, svg, row, card, section } from './markup.js';
import { initMenu, openMenu, closeMenu, menuIsOpen } from './menu.js';
import { importBookmarks, exportBookmarks } from '../pages/newtab/importExport.js';
import { resetAllData } from '../services/resetService.js';
import { pageAction, resetPagesSection } from './pagesSection.js';

let root = null, navEl = null, content = null, current = "search";
const $ = (id) => document.getElementById(id);

/** Build the page (hidden) and publish window.AtlasSettingsUI. Run once, before profilesPage.js. */
export function installSettingsPage() {
  if (root) return;
  root = buildRoot();
  navEl = $("sp-nav");
  content = $("sp-content");
  keepUnzoomed();
  initMenu($("sp-menu"), root.querySelector(".sp-main"));
  wireShell();
  wireContent();
  onSettingChange(() => rerenderSoon());
  publishApi();
}

export const isSettingsOpen = () => !!root && !root.hidden;

/** Show Settings, on `pageId` when given (?settings=<id> and messages use this). */
export function openSettings(pageId) {
  if (pageId && PAGES[pageId]) current = pageId;
  if (!root.hidden && !pageId) return;
  root.hidden = false;
  resetState.confirming = false;
  $("sp-version").textContent = "v" + chrome.runtime.getManifest().version;
  render();
}

export function closeSettings() {
  if (!root || root.hidden) return;
  root.hidden = true;
  closeMenu();
  forgetSettingsUrl();
}

function buildRoot() {
  const el = document.createElement("div");
  el.id = "sp-root";
  el.hidden = true;
  el.innerHTML = `
    <div class="sp-layout">
      <aside class="sp-sidebar">
        <button class="sp-nav-item" id="sp-back">${svg('<path d="M16 10H4m5-5-5 5 5 5"/>')}Back to dashboard</button>
        <label class="sp-search">${svg(I.search)}<input id="sp-search" type="text" placeholder="Search" autocomplete="off"></label>
        <nav id="sp-nav"></nav>
        <div class="sp-side-foot">
          <button class="sp-version" id="sp-version" tabindex="-1"></button>
        </div>
      </aside>
      <main class="sp-main"><div class="sp-content" id="sp-content"></div></main>
    </div>
    <ul class="sp-menu" id="sp-menu" role="menu" tabindex="-1"></ul>
    <input type="file" id="import-file" accept=".detractless,.pastekit,.json" hidden>`;
  document.body.appendChild(el);
  return el;
}

/* The page-wide UI Scale zoom is cancelled on Settings so it stays at 100%;
   the UI scale row shows a sample at the chosen size instead. */
function keepUnzoomed() {
  const unzoom = () => {
    const z = parseFloat(document.body.style.zoom);
    root.style.zoom = z && z !== 1 ? String(1 / z) : "";
  };
  unzoom();
  new MutationObserver(unzoom).observe(document.body, { attributes: true, attributeFilter: ["style"] });
}

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
  const focusKey = focusedControl();
  content.innerHTML = `<h1 class="sp-page-title">${item.label}</h1>` + PAGES[current]();
  if (focusKey) {
    const again = content.querySelector(`[${focusKey.attr}="${focusKey.value}"]`);
    if (again) again.focus();
  }
}

/** Which control has focus, so a re-render can give it back. */
function focusedControl() {
  const a = document.activeElement;
  if (!a || !content.contains(a)) return null;
  for (const attr of ["data-select", "data-toggle", "data-mode", "data-action"]) {
    if (a.hasAttribute(attr)) return { attr, value: a.getAttribute(attr) };
  }
  return null;
}

function render() { renderNav($("sp-search").value); renderPage(); }

let rerenderTimer = 0;
function rerenderSoon() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => { if (isSettingsOpen() && !menuIsOpen()) renderPage(); }, 0);
}

function go(id) {
  if (id === "review") { window.open(REVIEW_URL, "_blank", "noopener"); return; }
  if (!PAGES[id]) return;
  current = id;
  resetState.confirming = false;
  resetPagesSection();
  render();
}

/* A closed settings page must not stay in the URL: a reload would open it again. */
function forgetSettingsUrl() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has("settings") && u.hash !== "#settings") return;
    u.searchParams.delete("settings");
    history.replaceState(null, "", u.pathname + u.search);
  } catch (e) { /* history unavailable: nothing to tidy */ }
}

function wireShell() {
  $("sp-back").addEventListener("click", closeSettings);
  navEl.addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b) go(b.dataset.page); });
  $("sp-search").addEventListener("input", (e) => renderNav(e.target.value));
  $("import-file").addEventListener("change", importBookmarks);
  document.addEventListener("keydown", (e) => {
    // Escape closes Settings unless a dialog or menu above it takes the key first.
    if (e.key !== "Escape" || !isSettingsOpen() || menuIsOpen()) return;
    if (document.querySelector(".modal.show")) return;
    e.preventDefault();
    closeSettings();
  });
}

function wireContent() {
  content.addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) {
      const v = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", String(v));
      CONTROLS[t.dataset.toggle].set(v);
      return;
    }
    const m = e.target.closest("[data-mode]");
    if (m) {
      content.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b === m)));
      CONTROLS.theme.set(m.dataset.mode);
      return;
    }
    const s = e.target.closest("[data-select]");
    if (s) { openMenu(s); return; }
    const a = e.target.closest("[data-action]");
    if (a) runAction(a.dataset.action, a);
  });
}

function runAction(act, el) {
  if (act.startsWith("page-")) pageAction(act, el.dataset.id, renderPage);
  else if (act === "export") exportBookmarks();
  else if (act === "import") $("import-file").click();
  else if (act === "reset-ask") { resetState.confirming = true; renderPage(); }
  else if (act === "reset-cancel") { resetState.confirming = false; renderPage(); }
  else if (act === "reset-go") resetAllData();
}

/* Other scripts (profilesPage.js) add pages through this. A page can be asked
   for by URL (?settings=<id>) or by message ({atlas:{act:"open-settings",page}}). */
function publishApi() {
  window.AtlasSettingsUI = {
    current: () => current,
    rerender: () => { if (isSettingsOpen()) renderPage(); },
    go, content, svg, row, card, section, I,
    register(def) {
      PAGES[def.id] = def.render;
      const group = NAV.find((g) => g.group === (def.group || "Settings"));
      const at = group.items.findIndex((i) => i.id === def.before);
      group.items.splice(at < 0 ? group.items.length : at, 0, { id: def.id, label: def.label, icon: def.icon });
      if (new URLSearchParams(location.search).get("settings") === def.id) current = def.id;
      if (isSettingsOpen()) render();
    }
  };
}
