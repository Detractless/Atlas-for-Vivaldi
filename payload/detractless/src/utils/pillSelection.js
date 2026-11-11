// Pure rules for spotlight bookmark pills. `./` explicitly asks for bookmarks;
// automatically shown pills are suggestions. Shift+Enter always searches.

/** The user typed "./" to browse bookmarks deliberately. */
export const MODE_EXPLICIT = 'explicit';

/** Pills appeared under an ordinary query because the setting is "always". */
export const MODE_AMBIENT = 'ambient';

/** Start on the first match; an empty list has no selection. */
export function initialSelectionIndex(matchCount) {
  return (!matchCount || matchCount <= 0) ? -1 : 0;
}

/** Enter opens a visible selected pill; Shift+Enter always searches. */
export function resolveEnterAction(listVisible, selectedIndex, matchCount, forceSearch = false) {
  if (forceSearch) return 'search';
  if (!listVisible) return 'search';
  if (!matchCount || matchCount <= 0) return 'search';
  if (selectedIndex < 0) return 'search';
  return 'bookmark';
}

/** Strip the "./" mode marker before sending the text as a search query. */
export function searchTextFor(value) {
  const raw = (value == null ? '' : String(value)).trim();
  return raw.startsWith('./') ? raw.slice(2).trim() : raw;
}

/** Resolve pill mode from the raw input and the bookmark-pill setting. */
export function modeForInput(value, pillBehavior) {
  const raw = value == null ? '' : String(value);
  if (pillBehavior === 'never') return null;
  if (raw.startsWith('./')) return MODE_EXPLICIT;
  if (pillBehavior === 'always' && raw.trim().length > 0) return MODE_AMBIENT;
  return null;
}
