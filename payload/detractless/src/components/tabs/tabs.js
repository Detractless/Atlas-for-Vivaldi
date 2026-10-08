/* ══════════════════════════════════════════════════════════════════════
   PAGE SWITCHER (S-004, R-013)

   SELECTION LIVES HERE, not in the DOM: selectedTabId is a module variable,
   and selectTab-through-click plus selectSearchTab() are its only writers.
   The shell (button + listbox) is built ONCE; renderTabs refills the list.
   ══════════════════════════════════════════════════════════════════════ */

import './tabs.css';
import { DEFAULT_TABS } from '../../constants/defaults.js';
import { ContextMenu } from '../contextMenu/contextMenu.js';
import { openTabDialog } from '../bookmarks/bookmarkDialog.js';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { attachScrollAffordance } from '../shared/scrollAffordance.js';
import {
  activeTabs, setActiveTabs, currentBookmarkPage
} from '../../pages/newtab/newtabState.js';

/** "AI TOOLS" -> "Ai tools": page names show in sentence case. */
function sentenceCase(t) { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); }

let _onTabClick = null;
let _onNavigateToSearch = null;
const FILTER_THRESHOLD = 3;
let selectedTabId = 'search';
let els = null;        // built once by buildShell()
let affordance = null;
let filterQuery = '';

export function setTabNavigationCallbacks({ onTabClick, onNavigateToSearch }) {
  _onTabClick = onTabClick;
  _onNavigateToSearch = onNavigateToSearch;
}
export async function initializeTabs() {
  return new Promise((resolve) => {
    window.chrome.storage.sync.get(["activeTabs"], (result) => {
      if (result.activeTabs && Array.isArray(result.activeTabs)) {
        setActiveTabs(result.activeTabs);
      } else {
        setActiveTabs([...DEFAULT_TABS]);
        saveTabs();
      }
      renderTabs();
      resolve();
    });
  });
}
export function saveTabs() {
  window.chrome.storage.sync.set({ activeTabs: activeTabs });
}
export function selectSearchTab() {
  const home = activeTabs.find((t) => t.type === "search") || activeTabs[0];
  if (home) {
    selectedTabId = home.id;
    syncSelection();
  }
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== void 0) node.textContent = text;
  return node;
}
const checkSVG = '<svg class="check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
const chevSVG = '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

function buildShell(container) {
  container.className = "switcher";
  container.innerHTML = `
      <button class="switcher-btn" aria-haspopup="listbox" aria-expanded="false">
        <span class="switcher-label"></span>
        ${chevSVG}
      </button>
      <ul class="switcher-menu" role="listbox" tabindex="-1"></ul>
    `;
  const btn = container.querySelector(".switcher-btn");
  const label = container.querySelector(".switcher-label");
  const menu = container.querySelector(".switcher-menu");
  els = { container, btn, label, menu };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  menu.addEventListener("click", (e) => {
    const li = e.target.closest(".switcher-item");
    if (li) {
      const targetId = isNaN(Number(li.dataset.id)) ? li.dataset.id : Number(li.dataset.id);
      const tab = activeTabs.find((t) => t.id === targetId || String(t.id) === li.dataset.id);
      if (tab) {
        selectedTabId = tab.id;
        syncSelection();
        setOpen(false);
        btn.focus();
        if (_onTabClick) _onTabClick(tab);
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!els || !container.contains(e.target)) setOpen(false);
  });

  menu.addEventListener("mousemove", (e) => {
    const li = e.target.closest(".switcher-item");
    if (li && document.activeElement !== li) li.focus();
  });

  menu.addEventListener("mouseleave", () => {
    if (menu.classList.contains("open")) menu.focus();
  });

  menu.addEventListener("keydown", (e) => {
    const items = [...menu.children].filter((el) => el.classList.contains("switcher-item"));
    let i = items.indexOf(document.activeElement);
    if (i === -1 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      (menu.querySelector('[aria-selected="true"]') || items[0])?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (i !== -1) items[i].click();
    }
    if (e.key === "Escape") {
      setOpen(false);
      btn.focus();
    }
  });
}

function setOpen(open) {
  if (!els) return;
  els.btn.setAttribute("aria-expanded", String(open));
  els.menu.classList.toggle("open", Boolean(open));
  if (open) els.menu.focus();
}

export function renderTabs() {
  const container = document.getElementById("tabs-container") || document.getElementById("switcher");
  if (!container) return;
  if (!els || els.container !== container) buildShell(container);
  if (!activeTabs.some((t) => t.id === selectedTabId)) {
    const home = activeTabs.find((t) => t.type === "search") || activeTabs[0];
    selectedTabId = home ? home.id : "search";
  }
  els.menu.innerHTML = "";
  activeTabs.forEach((tab) => {
    const li = document.createElement("li");
    li.className = "switcher-item";
    li.setAttribute("role", "option");
    li.setAttribute("tabindex", "-1");
    li.dataset.id = String(tab.id);
    li.setAttribute("aria-selected", String(tab.id === selectedTabId));

    const tabLabel = (tab.type === "search" && (!tab.label || tab.label === "Home")) ? "Dashboard" : sentenceCase(tab.label);
    const tabSub = (tab.type === "search" && !tab.sub) ? "Everything at a glance" : (tab.sub || "");

    const spanLabel = document.createElement("span");
    spanLabel.className = "label";
    spanLabel.textContent = tabLabel;
    if (tabSub) {
      const spanSub = document.createElement("span");
      spanSub.className = "sub";
      spanSub.textContent = tabSub;
      spanLabel.appendChild(spanSub);
    }

    li.appendChild(spanLabel);
    li.insertAdjacentHTML("beforeend", checkSVG);

    if (tab.type !== "search") {
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (ContextMenu.disabled) return;
        setOpen(false);
        openTabDialog({
          name: tab.label,
          onRename: (newName) => {
            const t = activeTabs.find((t2) => t2.id === tab.id);
            if (t) {
              t.label = newName;
              saveTabs();
              renderTabs();
            }
          },
          onDelete: () => {
            setActiveTabs(activeTabs.filter((t) => t.id !== tab.id));
            if (currentBookmarkPage === tab.id) {
              if (_onNavigateToSearch) _onNavigateToSearch();
              selectSearchTab();
            }
            window.chrome.storage.sync.remove(`page${tab.id}`);
            BookmarkDB.deleteBookmarks(tab.id);
            saveTabs();
            renderTabs();
          }
        });
      });
    }
    els.menu.appendChild(li);
  });
  syncSelection();
}

function syncSelection() {
  if (!els) return;
  els.menu.querySelectorAll(".switcher-item").forEach((item) => {
    item.setAttribute("aria-selected", String(item.dataset.id === String(selectedTabId)));
  });
  const index = activeTabs.findIndex((t) => t.id === selectedTabId);
  const tab = index === -1 ? null : activeTabs[index];
  const name = tab ? ((tab.type === "search" && (!tab.label || tab.label === "Home")) ? "Dashboard" : sentenceCase(tab.label)) : "Dashboard";
  els.label.textContent = name;
  els.btn.title = name;
}

export async function addNewTab() {
  const count = activeTabs.filter((t) => t.type !== "search").length + 1;
  const { openInputPicker } = await import('../bookmarks/bookmarkDialog.js');
  openInputPicker({
    title: "Page name",
    value: "",
    placeholder: `Page ${count}`,
    save: (raw) => {
      const label = raw.trim() || `Page ${count}`;
      createPage(label);
      return true;
    }
  });
}
function createPage(label) {
  const newId = Date.now();
  const newTab = { id: newId, label, type: "bookmarks" };
  activeTabs.push(newTab);
  saveTabs();
  selectedTabId = newId;
  renderTabs();
  if (_onTabClick) _onTabClick(newTab);
}
