// src/settings/shell.js — the full-page Settings UI: sidebar, page content,
// opening and closing. Every control saves the moment it changes (registry.js),
// so there is no Save button and nothing to discard: "Back to dashboard" closes.
import { PAGES, NAV, REVIEW_URL, resetState, lockNote, lockCountdown } from './pages.js';
import { lockState } from '../utils/focusLock.js';
import { CONTROLS, lockControl, labelOf, toggleSocialPart, socialPartState } from './controls.js';
import { onSettingChange, getSetting } from './registry.js';
import { I, svg, row, card, section, paintLockButton, paintChip } from './markup.js';
import { initMenu, openMenu, closeMenu, menuIsOpen } from './menu.js';
import { importBookmarks, exportBookmarks } from '../pages/newtab/importExport.js';
import { resetAllData } from '../services/resetService.js';
import { usageAction } from './usagePage.js';
import { initChipPane, resetChipPane } from './chipPane.js';
import { normalize } from '../utils/socialFilter.js';

/* `current` is null until Settings first opens, which then shows the first page in the list (Profiles). */
let root = null, navEl = null, content = null, current = null, currentArg = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Hidden pages: registered but not in the side list, opened with go(id, arg)
   from another page (a profile's edit page from Profiles). id -> { title(arg), parent }. */
const HIDDEN = {};

/** Build the page (hidden) and publish window.AtlasSettingsUI. Run once, before profilesPage.js. */
export function installSettingsPage() {
  if (root) return;
  root = buildRoot();
  navEl = $("sp-nav");
  content = $("sp-content");
  initMenu($("sp-menu"), root.querySelector(".sp-main"));
  initChipPane(content);
  wireShell();
  wireContent();
  onSettingChange((key, value) => {
    // A slider updates in place: redrawing the page would replace it mid-drag and end the drag.
    if (typeof value === "number" && showSlider(key, value)) return;
    if (key === "focusLocks" && showLocks()) return;
    // A chip switches in place, so the panel beside it stays as it is; only a change of mode redraws.
    if (key === "socialFilter" && showChips()) return;
    rerenderSoon();
  });
  // The time left on an unlock counts down, and the lock opens when it ends.
  setInterval(showLocks, 1000);
  publishApi();
}

export const isSettingsOpen = () => !!root && !root.hidden;

/** Show Settings, on `pageId` when given (?settings=<id> and messages use this). */
export function openSettings(pageId) {
  if (pageId && PAGES[pageId]) { current = pageId; currentArg = null; }
  else if (!current || !PAGES[current]) { current = NAV[0].items[0].id; currentArg = null; }
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
  resetChipPane();
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

function renderNav(filter = "") {
  const f = filter.trim().toLowerCase();
  navEl.innerHTML = NAV.map((g) => {
    const items = g.items.filter((i) => i.label.toLowerCase().includes(f));
    if (!items.length) return "";
    return `<div class="sp-group-label">${g.group}</div>` + items.map((i) =>
      `<button class="sp-nav-item" data-page="${i.id}" ${i.id === navCurrent() ? 'aria-current="page"' : ""}>${svg(i.icon)}${i.label}${i.external ? svg(I.ext, "ext") : ""}</button>`
    ).join("");
  }).join("");
}

/** The side-list entry to mark: a hidden page marks its parent. */
const navCurrent = () => (HIDDEN[current] ? HIDDEN[current].parent : current);
const navItem = (id) => NAV.flatMap((g) => g.items).find((i) => i.id === id);

function renderPage() {
  closeMenu();
  resetChipPane();
  const hidden = HIDDEN[current];
  const title = hidden ? hidden.title(currentArg) : navItem(current).label;
  const back = hidden
    ? `<button class="sp-back-link" data-back="${hidden.parent}">${svg('<path d="M16 10H4m5-5-5 5 5 5"/>')}${esc(navItem(hidden.parent).label)}</button>`
    : "";
  const focusKey = focusedControl();
  content.innerHTML = back + `<h1 class="sp-page-title">${esc(title)}</h1>` + PAGES[current](currentArg);
  if (focusKey) {
    const again = content.querySelector(`[${focusKey.attr}="${focusKey.value}"]`);
    if (again) again.focus();
  }
}

/** Which control has focus, so a re-render can give it back. */
function focusedControl() {
  const a = document.activeElement;
  if (!a || !content.contains(a)) return null;
  for (const attr of ["data-select", "data-toggle", "data-mode", "data-action", "data-input", "data-chip"]) {
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

/** Open a page; `arg` is passed to a hidden page's render (which profile, say). */
function go(id, arg = null) {
  if (id === "review") { window.open(REVIEW_URL, "_blank", "noopener"); return; }
  if (!PAGES[id]) return;
  current = id;
  currentArg = arg;
  resetState.confirming = false;
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

/** Show a slider's value and saturation preview without redrawing the page.
    Returns false when that slider is not on screen. */
function showSlider(key, v) {
  const sl = content.querySelector('[data-slider="' + key + '"]');
  if (!sl) return false;
  if (document.activeElement !== sl) sl.value = String(v);
  const valDisp = sl.closest(".sp-slider-wrap").querySelector(".sp-slider-val");
  if (valDisp) valDisp.textContent = String(v) + (sl.dataset.unit || "");
  if (key === "saturation") {
    const sample = content.querySelector("#sp-sat-sample");
    if (sample) sample.style.filter = "saturate(" + v + "%)";
  }
  return true;
}

/** The social media filter's chips and mode, brought up to date in place. Returns false when the chips must be drawn
    again: they show only in the "Block selected parts" mode, and none are on screen or they should go. */
function showChips() {
  const area = content.querySelector(".sp-chip-area");
  if (!!area !== (normalize(getSetting("socialFilter")).mode === "parts")) return false;
  const pill = content.querySelector('[data-select="socialFilter"] span');
  if (pill) pill.textContent = labelOf("socialFilter");
  paintChips();
  return true;
}

function paintChips() {
  content.querySelectorAll("[data-chip]").forEach((b) => { const s = socialPartState(b.dataset.chip); paintChip(b, s.on, s.held); });
}

/** Each Focus lock's note, button and countdown, redrawn in place (never the slider or the pill beside it).
    Returns false when no lock is on screen. */
function showLocks() {
  const btns = content ? content.querySelectorAll("[data-lock]") : [];
  if (!btns.length) return false;
  btns.forEach((btn) => {
    const key = btn.dataset.lock, state = lockState(getSetting("focusLocks"), key);
    const desc = btn.closest(".sp-row") && btn.closest(".sp-row").querySelector(".sp-row-desc");
    const note = lockNote(key);
    if (desc && desc.textContent !== note) desc.textContent = note;
    paintLockButton(btn, state);
    const ctl = lockControl(key);
    const sl = ctl && content.querySelector(`[data-slider="${key}"]`);
    if (sl && ctl.min) sl.min = String(ctl.min());
    const count = content.querySelector(`[data-lockcount="${key}"]`);
    if (count) count.textContent = state === "unlocking" ? lockCountdown(key) : "";
  });
  paintChips();   // a chip the lock holds on shows a small lock
  return true;
}

function wireContent() {
  content.addEventListener("input", (e) => {
    const sl = e.target.closest("[data-slider]");
    if (sl) {
      const ctl = CONTROLS[sl.dataset.slider];
      let v = parseInt(sl.value, 10);
      // A locked slider cannot move toward a less strict value.
      const min = ctl.min ? ctl.min() : parseInt(sl.min || "0", 10);
      const max = ctl.max ? ctl.max() : 100;
      if (v < min) { v = min; sl.value = String(min); }
      if (v > max) { v = max; sl.value = String(max); }
      ctl.set(v);
      showSlider(sl.dataset.slider, v);
    }
  });
  // Let go of the slider: save now rather than at the next step.
  content.addEventListener("change", (e) => {
    const sl = e.target.closest("[data-slider]");
    if (sl) { if (CONTROLS[sl.dataset.slider].flush) CONTROLS[sl.dataset.slider].flush(); return; }
    // A text field commits on blur or Enter, not per keystroke, so the page is not redrawn while typing.
    const inp = e.target.closest("[data-input]");
    if (inp) CONTROLS[inp.dataset.input].set(inp.value);
  });
  content.addEventListener("click", (e) => {
    const back = e.target.closest("[data-back]");
    if (back) { go(back.dataset.back); return; }
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
    const ch = e.target.closest("[data-chip]");
    if (ch) { toggleSocialPart(ch.dataset.chip); return; }
    const s = e.target.closest("[data-select]");
    if (s) { openMenu(s); return; }
    const a = e.target.closest("[data-action]");
    if (a) runAction(a.dataset.action, a);
  });
}

function runAction(act, el) {
  if (act.startsWith("usage-")) usageAction(act, el, renderPage);
  else if (act === "focus-lock") { const c = lockControl(el.dataset.lock); if (c) c.clickLock(); }
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
    arg: () => currentArg,
    rerender: () => { if (isSettingsOpen()) renderPage(); },
    go, content, svg, row, card, section, I,
    register(def) {
      PAGES[def.id] = def.render;
      if (def.hidden) {
        HIDDEN[def.id] = { title: def.title || (() => def.label), parent: def.parent };
        if (isSettingsOpen()) render();
        return;
      }
      const group = NAV.find((g) => g.group === (def.group || "General"));
      const at = group.items.findIndex((i) => i.id === def.before);
      group.items.splice(at < 0 ? group.items.length : at, 0, { id: def.id, label: def.label, icon: def.icon });
      if (new URLSearchParams(location.search).get("settings") === def.id) current = def.id;
      if (isSettingsOpen()) render();
    }
  };
}
