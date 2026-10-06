import { resolveActiveTheme } from '../../utils/themeResolver.js';
import { formatColorForWeb, hexMix } from '../../utils/colorFormat.js';
import { DEFAULT_THEME } from '../../constants/defaults.js';
import { CUSTOM_THEME_VARS } from '../../constants/themeVars.js';
import { appThemeConfig, setAppThemeConfig, setCurrentTheme } from './newtabState.js';
import { BookmarkDB } from '../../services/bookmarksDB.js';

function applyThemeDOM(theme) {
  document.documentElement.dataset.theme = theme;
  document.body.className = 'theme-' + theme;
}

export function initializeTheme() {
  window.chrome.storage.sync.get(["Theme"], (result) => {
    setAppThemeConfig(result.Theme || DEFAULT_THEME);
    applyThemeConfig(appThemeConfig);
    syncThemePicker();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (appThemeConfig && appThemeConfig.Theme === 'system') {
      applyThemeConfig(appThemeConfig);
    }
  });
}

export function syncThemePicker() {
  const active = (appThemeConfig && appThemeConfig.Theme) ? appThemeConfig.Theme : 'dark';
  document.querySelectorAll('input[name="theme-choice"]').forEach(radio => {
    radio.checked = (radio.value === active);
  });
}

export function initThemePicker() {
  document.querySelectorAll('input[name="theme-choice"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      setAppThemeConfig(Object.assign({}, appThemeConfig || DEFAULT_THEME, { Theme: e.target.value }));
      applyThemeConfig(appThemeConfig);
    });
  });
  syncThemePicker();
}

export function applyThemeConfig(config) {
  const rawPref = config.Theme || 'dark';
  BookmarkDB.setUiPref('themePref', rawPref).catch(() => {});
  try { localStorage.setItem('_themeCache', rawPref); } catch (e) {}
  // Same value again, in chrome.storage, purely so OTHER extension pages get an
  // onChanged event. localStorage is shared across this origin but its `storage`
  // event is not something we rely on between extension contexts. The side panel
  // reads localStorage for first paint and this for live updates; both are
  // written here, so there is still one place that decides the theme.
  try { chrome.storage.local.set({ _themeCache: rawPref }); } catch (e) {}
  const activeTheme = resolveActiveTheme(config);
  const root = document.documentElement;
  setCurrentTheme(activeTheme);

  CUSTOM_THEME_VARS.forEach(v => root.style.removeProperty(v));

  if (activeTheme === "custom" && config.CustomColors) {
    const c = config.CustomColors;
    const f = formatColorForWeb;
    // Base on dark so non-overridden vars (overlay, error, inverse, focus) resolve.
    root.dataset.theme = "dark";
    const canvas = f(c.WindowBackground);
    const card = f(c.ControlBackground);
    root.style.setProperty('--surface-canvas', canvas);
    root.style.setProperty('--surface-card',   card);
    // muted = inset surface: kept distinct from card (mixed toward canvas) so grouped
    // containers stay visible instead of blending into the card.
    root.style.setProperty('--surface-muted',  hexMix(card, canvas, 0.5));
    root.style.setProperty('--surface-hover',  f(c.ControlHover));
    root.style.setProperty('--line-hairline',  f(c.BorderColor));
    root.style.setProperty('--text-primary',   f(c.TextPrimary));
    root.style.setProperty('--text-secondary', f(c.TextSecondary));
    root.style.setProperty('--select-bg',      f(c.SelectionBackground));
    root.style.setProperty('--text-tertiary',  hexMix(f(c.TextSecondary), canvas, 0.45));
    root.style.setProperty('--line-strong',    f(c.TextPrimary));
    root.style.setProperty('--accent',         f(c.TextPrimary));
    root.style.setProperty('--accent-text',    canvas);
    root.style.setProperty('--accent-hover',   hexMix(f(c.TextPrimary), canvas, 0.12));
    root.style.setProperty('--accent-press',   hexMix(f(c.TextPrimary), canvas, 0.22));
  }
  applyThemeDOM(activeTheme);
}
