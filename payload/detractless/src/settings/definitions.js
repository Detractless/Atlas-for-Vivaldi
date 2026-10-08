// src/settings/definitions.js — every setting the Settings page shows, defined
// once: what applying a value does to this page. Saving, loading and following
// other tabs are the registry's (settings/registry.js).
import { defineSetting } from './registry.js';
import { DEFAULT_THEME } from '../constants/defaults.js';
import { BookmarkDB } from '../services/bookmarksDB.js';
import {
  setSpotlightVisible, setSearchEngineBehavior, setBookmarkPillBehavior, setFadeInEnabled,
  setAppThemeConfig, setSearchDelaySeconds,
} from '../pages/newtab/newtabState.js';
import { applySpotlightVisibility, applyFadeIn, applyScale, applyGrayscale } from '../pages/newtab/displayEffects.js';
import { applyThemeConfig } from '../pages/newtab/theme.js';
import { updateCurrentEngine } from '../components/engines/enginesUI.js';
import { requestTabLimit } from '../components/tabLimiter/tabLimiterUI.js';
import { requestSearchDelay } from '../components/searchDelay/searchDelay.js';

let defined = false;

export function defineAllSettings() {
  if (defined) return;
  defined = true;

  // ── Search ──
  defineSetting({
    key: 'spotlightVisible',
    apply: (v) => { setSpotlightVisible(v); applySpotlightVisibility(); },
  });
  defineSetting({
    key: 'searchEngineBehavior',
    apply: (v, { local }) => {
      setSearchEngineBehavior(v);
      // Choosing "always reset" in Settings resets the engine right away; at page
      // start loadSavedEngine (enginesUI.js) does the same from storage.
      if (local && v === 'always-default') updateCurrentEngine('default');
    },
  });
  defineSetting({ key: 'bookmarkPillBehavior', apply: (v) => setBookmarkPillBehavior(v) });

  // ── Appearance ──
  defineSetting({
    key: 'Theme',
    apply: (v) => { setAppThemeConfig(v || DEFAULT_THEME); applyThemeConfig(v || DEFAULT_THEME); },
  });
  defineSetting({
    key: 'uiScale',
    apply: (v, { local }) => {
      applyScale(v);
      // preinit.js falls back to this IndexedDB copy when its cache is empty.
      if (local) BookmarkDB.setUiPref('uiScale', v).catch(() => {});
    },
  });
  defineSetting({ key: 'fadeInEnabled', apply: (v) => { setFadeInEnabled(v); applyFadeIn(); } });

  // ── Focus ──
  defineSetting({ key: 'tabLimit', write: requestTabLimit });
  defineSetting({ key: 'pendingIncrease' });
  defineSetting({ key: 'managementMethod' });
  defineSetting({ key: 'searchDelaySeconds', apply: (v) => setSearchDelaySeconds(v), write: requestSearchDelay });
  defineSetting({ key: 'pendingDelayDecrease' });
  defineSetting({ key: 'showQueryOnDelay' });
  defineSetting({ key: 'grayscale', apply: (v) => applyGrayscale(v) });
}
