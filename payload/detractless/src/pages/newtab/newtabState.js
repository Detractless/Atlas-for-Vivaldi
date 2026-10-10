import { DEFAULT_THEME } from '../../constants/defaults.js';

export let appThemeConfig = DEFAULT_THEME;

export let currentTheme = "dark", currentPage = "search", currentBookmarkPage = 1, bookmarks = {}, fadeInEnabled = true, spotlightVisible = false, uiScale = 1.0;
export let searchEngineBehavior = "remember", bookmarkPillBehavior = "always", activeTabs = [];
export let searchEngines = {}, currentEngine = "default", defaultEngineKey = "default";
export let searchDelaySeconds = 0, delayUpdateInterval = null;

export let allCachedBookmarks = [];
export let allCachedGroups = {};
export let usageScores = new Map();
export let searchDropdownIndex = -1;

export let limiterUpdateInterval = null;

export function setAppThemeConfig(v) { appThemeConfig = v; }
export function setCurrentTheme(v) { currentTheme = v; }
export function setCurrentPage(v) { currentPage = v; }
export function setCurrentBookmarkPage(v) { currentBookmarkPage = v; }
export function setBookmarks(v) { bookmarks = v; }
export function setFadeInEnabled(v) { fadeInEnabled = v; }
/* The new tab's search bar is gone (2026-10-09): the address bar searches, with
   the same engines and bookmark pills. A saved spotlightVisible stays as it was
   (backups, profiles) but no longer shows the bar. */
export function setSpotlightVisible() { spotlightVisible = false; }
export function setUiScale(v) { uiScale = v; }
/* R-015: currentModalStep/totalModalSteps and their setters stood here.
   The add form is one screen now, so there is no step to track. */
/* R-017: groupPageMap and its setter stood here. Nothing derives a page
   from a group name any more; the add form asks for the page directly. */
export function setSearchEngineBehavior(v) { searchEngineBehavior = v; }
export function setBookmarkPillBehavior(v) { bookmarkPillBehavior = v; }
export function getBookmarkPillBehavior() { return bookmarkPillBehavior; }
export function setActiveTabs(v) { activeTabs = v; }
export function setSearchEngines(v) { searchEngines = v; }
export function setCurrentEngine(v) { currentEngine = v; }
export function setDefaultEngineKey(v) { defaultEngineKey = v; }
export function setSearchDelaySeconds(v) { searchDelaySeconds = v; }
export function setDelayUpdateInterval(v) { delayUpdateInterval = v; }
export function setAllCachedBookmarks(v) { allCachedBookmarks = v; }
export function setAllCachedGroups(v) { allCachedGroups = v; }
export function setUsageScores(v) { usageScores = v; }
export function setSearchDropdownIndex(v) { searchDropdownIndex = v; }
export function setLimiterUpdateInterval(v) { limiterUpdateInterval = v; }
