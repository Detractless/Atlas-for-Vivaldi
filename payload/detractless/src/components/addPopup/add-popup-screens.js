/* ═══════════════════════════════════════════════════════
   THE ADD POPUP — SCREENS

   Drawing the current screen from the answers so far, the moving between
   screens, and the page/group drop-downs. Nothing here reads or writes the
   database except loadGroups, which reads the chosen page's group names.
   ═══════════════════════════════════════════════════════ */

import { BookmarkDB } from '../../services/bookmarksDB.js';
import { NEW_GROUP, setValue, validateStep } from '../../utils/addBookmarkFlow.js';
import { activeTabs, allCachedBookmarks } from '../../pages/newtab/newtabState.js';
import { cleanSubtitle, MIN_WORDS, MAX_WORDS, MAX_CHARS } from '../../services/pageSubtitle.js';
import { matchSites, mainDomain, hostOf, nameChoices } from '../../services/siteSuggestions.js';
import { frameMarkup, button, websiteScreen, siteDrop, placeScreen, dropdown, plainField } from './addPopupMarkup.js';
import { $, field, showError, clearErrors } from './add-popup-dom.js';

export const bookmarkPages = () => activeTabs.filter((t) => t.type !== 'search');
/* Sites already saved are not offered again. */
const savedDomains = () => new Set((allCachedBookmarks || []).map((b) => mainDomain(hostOf(b && b.url))).filter(Boolean));
/* ── Drawing the current screen from the answers so far ───────────────── */

export function sitePills(popup) {
  return matchSites(popup.sites, popup.urlText, 8, savedDomains()).map((s) => ({ label: s.domain, value: s.domain }));
}

function pageItems() {
  return bookmarkPages().map((t) => ({ value: String(t.id), label: t.label }));
}

function groupItems(popup) {
  return [...popup.groups.map((g) => ({ value: g, label: g })), { value: NEW_GROUP, label: '+ New group' }];
}

export function render(popup) {
  const { kind, step, editing } = popup;
  let frame;
  if (kind === 'bookmark' && step === 1) {
    const pills = sitePills(popup);
    popup.siteAt = Math.min(popup.siteAt, Math.max(pills.length - 1, 0));
    frame = { title: 'Which website?', total: 2, body: websiteScreen({ urlText: popup.urlText, pills, at: popup.siteAt }),
      left: button('data-add-cancel', 'Cancel'), right: button('data-add-next', 'Next', true, !popup.urlText.trim()) };
  } else if (kind === 'bookmark') {
    const names = nameChoices(popup.urlText).map((n) => ({ label: n, value: n }));
    frame = { title: 'Name and place', total: 2,
      body: placeScreen({ name: popup.flow.name, namePills: names, pageItems: pageItems(), page: popup.flow.page === null ? '' : String(popup.flow.page),
        groupItems: groupItems(popup), group: popup.flow.group, newGroup: popup.flow.newGroupName, showNewGroup: popup.flow.group === NEW_GROUP }),
      left: button('data-add-back', 'Back'), right: button('data-add-save', 'Add', true) };
  } else if (editing) {
    frame = { title: 'Edit page', total: 1,
      body: plainField({ field: 'pageName', label: 'Name', value: popup.pageName, placeholder: `Page ${popup.pageCount}` }) +
        plainField({ field: 'sub', label: 'Subtitle', value: popup.sub, placeholder: 'Three to five words', aside: '<span class="ap-count" data-count></span>' }),
      left: button('data-add-cancel', 'Cancel'), right: button('data-add-save', 'Save', true) };
  } else if (step === 1) {
    frame = { title: 'What is the page called?', total: 2,
      body: plainField({ field: 'pageName', value: popup.pageName, placeholder: `Page ${popup.pageCount}` }),
      left: button('data-add-cancel', 'Cancel'), right: button('data-add-next', 'Next', true) };
  } else {
    frame = { title: 'Give it a short subtitle', total: 2,
      body: plainField({ field: 'sub', value: popup.sub, placeholder: 'Three to five words', aside: '<span class="ap-count" data-count></span>' }),
      left: button('data-add-back', 'Back'), right: button('data-add-save', 'Add', true) };
  }
  popup.menu = null;
  popup.overlay.innerHTML = frameMarkup({ ...frame, step });
  popup.overlay.dataset.kind = kind;
  popup.overlay.dataset.step = String(step);
  clearErrors(popup);
  updateCount(popup);
  if (kind === 'bookmark' && step === 2) loadGroups(popup);
  const first = popup.overlay.querySelector('.ap-input');
  if (first) requestAnimationFrame(() => first.focus());
}

/* The pills under the address field follow what is typed, without redrawing the field. */
export function paintSites(popup) {
  const drop = $(popup, '[data-drop="url"]');
  if (!drop) return;
  const pills = sitePills(popup);
  popup.siteAt = Math.min(popup.siteAt, Math.max(pills.length - 1, 0));
  const parts = siteDrop(pills, popup.siteAt);
  drop.innerHTML = `${parts.pillsHtml}<div class="ap-hint" data-hint>${parts.hint}</div>`;
  drop.hidden = pills.length === 0;
  const card = $(popup, '[data-card="url"]');
  if (card) card.classList.toggle('ap-card--open', pills.length > 0);
  const next = $(popup, '[data-add-next]');
  if (next) next.disabled = !popup.urlText.trim();
}

/* The page and group drop-downs, after the page or its groups changed. */
export function paintPlace(popup) {
  const cols = $(popup, '.ap-cols');
  if (!cols) return;
  cols.innerHTML = dropdown({ key: 'page', label: 'Page', value: popup.flow.page === null ? '' : String(popup.flow.page), items: pageItems() }) +
    dropdown({ key: 'group', label: 'Group', value: popup.flow.group, items: groupItems(popup) });
  popup.menu = null;
  const wrap = $(popup, '[data-newgroup]');
  if (wrap) wrap.hidden = popup.flow.group !== NEW_GROUP;
}

/* The groups on the chosen page. A page with none starts a new group; otherwise the first is chosen. */
export async function loadGroups(popup) {
  const id = popup.flow.page;
  const asked = String(id);
  popup.groupsFor = asked;
  const saved = id === null || id === undefined ? null : await BookmarkDB.getBookmarks(id);
  if (popup.groupsFor !== asked || !popup.overlay.isConnected) return; // the page changed while this was loading
  popup.groups = saved ? Object.keys(saved).sort() : [];
  let group = popup.flow.group;
  if (group === null || (group !== NEW_GROUP && !popup.groups.includes(group))) group = popup.groups.length ? popup.groups[0] : NEW_GROUP;
  popup.flow = setValue(popup.flow, 'group', group);
  paintPlace(popup);
}

export function updateCount(popup) {
  const slot = $(popup, '[data-count]');
  if (!slot) return;
  const sub = cleanSubtitle(popup.sub);
  const words = sub ? sub.split(' ').length : 0;
  slot.textContent = `${words} of ${MIN_WORDS}-${MAX_WORDS} words · ${sub.length} / ${MAX_CHARS}`;
}

/* ── Moving between screens ───────────────────────────────────────── */

export function next(popup) {
  clearErrors(popup);
  if (popup.kind === 'bookmark') {
    popup.flow = setValue(popup.flow, 'url', popup.urlText.trim());
    const problem = validateStep(popup.flow, 'url');
    if (problem) { showError(popup, 'url', problem); return; }
    if (!popup.nameTouched) popup.flow = setValue(popup.flow, 'name', nameChoices(popup.urlText)[0] || hostOf(popup.urlText) || '');
  }
  popup.step = 2;
  render(popup);
}

export function back(popup) {
  popup.step = 1;
  render(popup);
}

export function pickSite(popup, domain) {
  popup.urlText = domain;
  popup.siteAt = 0;
  next(popup);
}

/* ── Drop-downs ───────────────────────────────────────────────────── */

export function closeMenus(popup) {
  popup.overlay.querySelectorAll('[data-dd-menu]').forEach((m) => { m.hidden = true; });
  popup.overlay.querySelectorAll('[data-dd]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  popup.menu = null;
}

export function toggleMenu(popup, key) {
  const wasOpen = popup.menu === key;
  closeMenus(popup);
  if (wasOpen) return;
  const menu = $(popup, `[data-dd-menu="${key}"]`);
  if (!menu) return;
  menu.hidden = false;
  popup.menu = key;
  const btn = $(popup, `[data-dd="${key}"]`);
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

export function choose(popup, key, value) {
  if (key === 'page') {
    const tab = bookmarkPages().find((t) => String(t.id) === value);
    if (!tab) return;
    popup.flow = setValue(popup.flow, 'page', tab.id);   // changing the page clears the group
    popup.groups = [];
    paintPlace(popup);
    loadGroups(popup);
  } else if (key === 'group') {
    popup.flow = setValue(popup.flow, 'group', value);
    paintPlace(popup);
    if (value === NEW_GROUP) { const f = field(popup, 'newGroup'); if (f) f.focus(); }
  }
  closeMenus(popup);
}
