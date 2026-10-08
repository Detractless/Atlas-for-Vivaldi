// src/main.js — content-script composition root.
// Bundled by esbuild into dist/content.bundle.js. Init order matters:
// the settings cache must be live before the UI modules read it.
import { initSettingsCache } from './utils/settingsCache.js';
import { initFieldDot } from './components/FieldDot.js';
import { initTokenAutocomplete } from './components/TokenAutocomplete.js';
import { initFillMode } from './components/FillMode.js';
import { initClip } from './components/Clip.js';

initSettingsCache();
initFieldDot();
initTokenAutocomplete();
initFillMode();
initClip();
