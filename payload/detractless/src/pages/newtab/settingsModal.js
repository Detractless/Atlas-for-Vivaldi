import { showModal, hideModal, _revertSettingsModal, switchSettingsTab, openSettingsSubpage, closeSettingsSubpage, settingsSubpageOpen } from './modalVisibility.js';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { importBookmarks, exportBookmarks } from './importExport.js';
import { resetAllData } from '../../services/resetService.js';
import { applyFadeIn, applySpotlightVisibility, toggleScale } from './displayEffects.js';
import { applyThemeConfig } from './theme.js';
import { updateLimiterUI } from '../../components/tabLimiter/tabLimiterUI.js';
import { updateDelayPendingUI } from '../../components/searchDelay/searchDelay.js';
import { updateCurrentEngine } from '../../components/engines/enginesUI.js';
import { renderEngineDropdown } from '../../components/engines/enginesUI.js';
import { renderTabs } from '../../components/tabs/tabs.js';
import { loadBookmarks } from '../../components/bookmarks/bookmarks.js';
import { attachScrollAffordance } from '../../components/shared/scrollAffordance.js';
import {
  spotlightVisible, searchEngineBehavior, bookmarkPillBehavior, fadeInEnabled, appThemeConfig, uiScale,
  currentEngine, activeTabs,
  setSpotlightVisible, setSearchEngineBehavior, setBookmarkPillBehavior
} from './newtabState.js';

export function initSettingsModal() {
  const closeSettingsModal = document.getElementById("close-settings-modal");
  const saveSettings = document.getElementById("save-settings");
  const cancelSettings = document.getElementById("cancel-settings");
  const importBtn = document.getElementById("import-btn");
  const importFile = document.getElementById("import-file");
  const exportBtn = document.getElementById("export-btn");
  const openLimiterBtn = document.getElementById("open-limiter-modal");
  const closeLimiterBtn = document.getElementById("close-limiter-modal");
  const openDelayBtn = document.getElementById("open-delay-modal");

  if (openDelayBtn) {
    openDelayBtn.addEventListener("click", () => {
      hideModal("settings-modal");
      showModal("delay-modal");
      updateDelayPendingUI();
    });
  }

  if (closeSettingsModal) closeSettingsModal.addEventListener("click", () => {
    // One level deep the disc is a back button (phone navigation); at the top
    // it closes and reverts, exactly as before.
    if (settingsSubpageOpen()) { closeSettingsSubpage(); return; }
    _revertSettingsModal();
    hideModal("settings-modal");
  });

  if (saveSettings) saveSettings.addEventListener("click", async () => {
    const spotlightCheckbox = document.getElementById("spotlight-checkbox");
    const behaviorRadio = document.querySelector('input[name="search-behavior"]:checked');
    const pillBehaviorRadio = document.querySelector('input[name="bookmark-pill-behavior"]:checked');

    const newSpotlightVisible = spotlightCheckbox ? spotlightCheckbox.checked : spotlightVisible;
    const newBehavior = behaviorRadio ? behaviorRadio.value : searchEngineBehavior;
    const newPillBehavior = pillBehaviorRadio ? pillBehaviorRadio.value : bookmarkPillBehavior;

    setSpotlightVisible(newSpotlightVisible);
    setSearchEngineBehavior(newBehavior);
    setBookmarkPillBehavior(newPillBehavior);

    const settingsToSave = {
      fadeInEnabled: fadeInEnabled,
      spotlightVisible: newSpotlightVisible,
      searchEngineBehavior: newBehavior,
      bookmarkPillBehavior: newPillBehavior,
      Theme: appThemeConfig,
      uiScale: uiScale
    };

    BookmarkDB.setUiPref('uiScale', uiScale).catch(() => {});

    window.chrome.storage.sync.set(settingsToSave, () => {
      applyFadeIn();
      applySpotlightVisibility();
      applyThemeConfig(appThemeConfig);
      if (searchEngineBehavior === "always-default") updateCurrentEngine("default");

      hideModal("settings-modal");
    });
  });

  if (cancelSettings) cancelSettings.addEventListener("click", () => {
    _revertSettingsModal();
    hideModal("settings-modal");
    const spotlightCheckbox = document.getElementById("spotlight-checkbox");
    if (spotlightCheckbox) spotlightCheckbox.checked = spotlightVisible;
  });

  if (importBtn) importBtn.addEventListener("click", () => importFile && importFile.click());
  if (importFile) importFile.addEventListener("change", importBookmarks);
  if (exportBtn) exportBtn.addEventListener("click", exportBookmarks);
  if (openLimiterBtn) openLimiterBtn.addEventListener("click", () => {
    hideModal("settings-modal"); showModal("limiter-modal"); updateLimiterUI();
  });
  if (closeLimiterBtn) closeLimiterBtn.addEventListener("click", () => hideModal("limiter-modal"));

  document.querySelectorAll(".scale-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleScale(parseFloat(btn.dataset.value)));
  });

  initSettingsRows();

  const resetAllBtn = document.getElementById('reset-all-btn');
  const resetConfirmBox = document.getElementById('reset-confirm-box');
  const resetCancelBtn = document.getElementById('reset-cancel-btn');
  const resetConfirmBtn = document.getElementById('reset-confirm-btn');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      resetAllBtn.style.display = 'none';
      if (resetConfirmBox) resetConfirmBox.style.display = 'block';
    });
  }
  if (resetCancelBtn) {
    resetCancelBtn.addEventListener('click', () => {
      if (resetConfirmBox) resetConfirmBox.style.display = 'none';
      if (resetAllBtn) resetAllBtn.style.display = '';
    });
  }
  if (resetConfirmBtn) {
    resetConfirmBtn.addEventListener('click', async () => {
      resetConfirmBtn.disabled = true;
      resetConfirmBtn.textContent = 'Resetting...';
      await resetAllData();
    });
  }
}

/* ── Phone-style rows: value rows + picker dialogs + drill-in sub-pages ─────
   The pickers are the UI-RULES 4 multi-choice pattern (ValueRow + PickerDialog).
   They are a pure visual layer: selecting an option sets the ORIGINAL hidden
   input and dispatches change/click, so every existing save/revert/sync path
   works unchanged. */

const PICKERS = {
  'search-behavior': {
    kind: 'radio', name: 'search-behavior',
    labels: { 'remember': 'Remember last selected', 'always-default': 'Always reset to default' },
  },
  'bookmark-pill-behavior': {
    kind: 'radio', name: 'bookmark-pill-behavior',
    labels: { 'prefix': 'When typing ./ (default)', 'always': 'Always' }
  },
  'management-method': {
    kind: 'radio', name: 'management-method',
    labels: { 'random': 'Close a random tab', 'block': 'Block the new tab' }
  },
  'theme-choice': {
    kind: 'radio', name: 'theme-choice',
    labels: { 'system': 'System', 'light': 'Light', 'dark': 'Dark', 'custom': 'Custom' },
  },
  'ui-scale': {
    kind: 'scale',
    labels: { '0.75': '75%', '0.9': '90%', '1': '100%', '1.1': '110%', '1.25': '125%' },
  },
};

function pickerCurrentValue(cfg) {
  if (cfg.kind === 'scale') return String(uiScale);
  const checked = document.querySelector(`input[name="${cfg.name}"]:checked`);
  return checked ? checked.value : null;
}

function pickerSelect(cfg, value) {
  if (cfg.kind === 'scale') {
    const btn = document.querySelector(`.scale-btn[data-value="${value}"]`);
    if (btn) btn.click(); // runs toggleScale via the existing binding
    return;
  }
  const radio = document.querySelector(`input[name="${cfg.name}"][value="${value}"]`);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function refreshSettingsRowValues() {
  document.querySelectorAll('[data-picker-value]').forEach(span => {
    const cfg = PICKERS[span.dataset.pickerValue];
    if (!cfg) return;
    const value = pickerCurrentValue(cfg);
    span.textContent = (value !== null && cfg.labels[value]) ? cfg.labels[value] : '';
  });
}

function openPickerDialog(title, cfg) {
  const current = pickerCurrentValue(cfg);
  const overlay = document.createElement('div');
  overlay.className = 'modal show picker-modal';
  const close = () => overlay.remove();

  const card = document.createElement('div');
  card.className = 'picker-card';
  const heading = document.createElement('div');
  heading.className = 'picker-title';
  heading.textContent = title;
  card.appendChild(heading);

  /* The options sit in an inset well, and selection is a TICK on the chosen row
     rather than a radio ring. The ring was drawn with a border, which UI-RULES
     bans; the tick is a clip-path mask, so the new tab and the side panel can
     finally use the same mark. */
  const host = document.createElement('div');
  host.className = 'picker-wellhost';
  const well = document.createElement('div');
  well.className = 'picker-well';

  Object.entries(cfg.labels).forEach(([value, label]) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'picker-row' + (value === current ? ' is-current' : '');
    const mark = document.createElement('span');
    mark.className = 'picker-check';
    const text = document.createElement('span');
    text.textContent = label;
    row.append(mark, text);
    row.addEventListener('click', () => {
      pickerSelect(cfg, value);
      refreshSettingsRowValues();
      close();
    });
    well.appendChild(row);
  });
  host.appendChild(well);
  /* R-010: a picker with more options than fit (UI scale, theme, tab limiter…)
     scrolls, and owed the same fade-and-count cue every other well has. The
     side panel's panelDialog already does this; the new-tab picker had missed
     it. Gated on actual overflow, and after layout, exactly as there. */
  requestAnimationFrame(function () {
    if (well.scrollHeight > well.clientHeight + 1) {
      attachScrollAffordance(well, { host: host, items: '.picker-row' });
    }
  });
  card.appendChild(host);

  // Hidden close button so the global Escape/dismiss path (which clicks the
  // modal's .close-btn) tears this overlay down instead of stranding it.
  /* Its DECLARATION was eaten by the well conversion (2026-08-15): the edit
     replaced a slice ending exactly at the first `hiddenClose.className` line,
     which kept every USE of the variable while deleting the two lines that
     created it. Every settings picker then threw ReferenceError before the
     overlay was ever attached, which the user saw as dialogs not opening. */
  const hiddenClose = document.createElement('button');
  hiddenClose.type = 'button';
  hiddenClose.className = 'close-btn picker-hidden-close';
  /* HIDDEN AS AN ATTRIBUTE, not only as a class: .close-btn paints a 44px disc
     and .picker-hidden-close removes it, both single-class rules, so SHEET ORDER
     decides. Promoting .picker-hidden-close into components.css (loaded before
     newtab.css) let the disc win and put a stray circle in the corner of every
     settings picker. `[hidden] { display: none !important }` in base.css settles
     it for good; .click() still fires, which the Escape path needs. */
  hiddenClose.hidden = true;
  hiddenClose.addEventListener('click', close);
  card.appendChild(hiddenClose);

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function initSettingsRows() {
  document.querySelectorAll('[data-picker]').forEach(row => {
    row.addEventListener('click', () => {
      const cfg = PICKERS[row.dataset.picker];
      if (cfg) openPickerDialog(row.dataset.pickerTitle || '', cfg);
    });
  });
  document.querySelectorAll('[data-subpage]').forEach(row => {
    row.addEventListener('click', () => openSettingsSubpage(row.dataset.subpage));
  });
  document.addEventListener('settings-modal-opened', refreshSettingsRowValues);
  refreshSettingsRowValues();
  initSettingsScrollAffordance();
}

/* R-010: scrollbars are hidden extension-wide, so the settings list needs the
   same two-way fade and hidden-item count the bookmark wells use.
 *
 * WHAT COUNTS AS AN ITEM: rows AND section headers, not rows alone. The list
 * interleaves the two, so counting only rows would let a header be the only
 * thing hidden and still report zero, which would hide the fade with content
 * off screen. .setting-item covers the sub-pages, whose content is prose
 * blocks rather than rows.
 *
 * NOT SNAPPED, deliberately. Bookmark wells snap to whole rows (R-008), but
 * that rests on every row being the same height. Settings rows are 52 minimum
 * and grow with a subtitle, and headers are a different height again, so there
 * is no single pitch to snap to. The count stays exact regardless, since it
 * measures real item rects rather than assuming a grid. */
function initSettingsScrollAffordance() {
  const body = document.querySelector('#settings-modal .settings-body');
  if (!body) return;
  const affordance = attachScrollAffordance(body, {
    items: '.settings-section-header, .settings-row, .setting-item'
  });
  // Drilling into a sub-page swaps the content under a scroller that has not
  // changed size. The child ResizeObserver catches the pane going to zero
  // height, but the modal opening from display:none needs its own nudge.
  document.addEventListener('settings-modal-opened', () => {
    requestAnimationFrame(affordance.refresh);
  });
}