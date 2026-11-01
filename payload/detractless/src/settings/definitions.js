// src/settings/definitions.js — every setting the Settings page shows, defined
// once: what applying a value does to this page. Saving, loading and following
// other tabs are the registry's (settings/registry.js).
import { defineSetting } from './registry.js';
import { DEFAULT_THEME } from '../constants/defaults.js';
import {
  setSpotlightVisible, setSearchEngineBehavior, setBookmarkPillBehavior, setFadeInEnabled,
  setAppThemeConfig, setSearchDelaySeconds,
} from '../pages/newtab/newtabState.js';
import { applySpotlightVisibility, applyFadeIn } from '../pages/newtab/displayEffects.js';
import { requestSaturation } from '../components/colorLock/colorLock.js';
import { applyThemeConfig } from '../pages/newtab/theme.js';
import { updateCurrentEngine } from '../components/engines/enginesUI.js';
import { requestTabLimit } from '../components/tabLimiter/tabLimiterUI.js';
import { requestSearchDelay } from '../components/searchDelay/searchDelay.js';

let defined = false;

export function defineAllSettings() {
  if (defined) return;
  defined = true;

  // ── Search ──
  // The search bar no longer shows (setSpotlightVisible, newtabState.js); the
  // setting stays so saved values, backups and profiles keep it.
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
  // The UI scale stood here. Nothing on the page is meant to scale any more, so it is gone; a saved one is ignored.
  defineSetting({ key: 'fadeInEnabled', apply: (v) => { setFadeInEnabled(v); applyFadeIn(); } });

  // ── Focus ──
  defineSetting({ key: 'tabLimit', write: requestTabLimit });
  defineSetting({ key: 'pendingIncrease' });
  defineSetting({ key: 'managementMethod' });
  defineSetting({ key: 'searchDelaySeconds', apply: (v) => setSearchDelaySeconds(v), write: requestSearchDelay });
  defineSetting({ key: 'pendingDelayDecrease' });
  defineSetting({ key: 'showQueryOnDelay' });
  defineSetting({ key: 'saturation', write: requestSaturation });
  // The locks beside the tab limit, delay, color slider, content-shield mode and social media filter (utils/focusLock.js).
  defineSetting({ key: 'focusLocks' });

  // ── Content shield ──
  defineSetting({ key: 'nsfwAction' });
  defineSetting({ key: 'socialFilter' });
}
