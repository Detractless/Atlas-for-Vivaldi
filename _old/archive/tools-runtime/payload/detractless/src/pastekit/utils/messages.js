// shared/messages.js — Pastekit message type constants + a thin call() client.

export const MSG = {
  // service-worker DB API (popup/options/content -> SW)
  SNIPPET_LIST:        'snippet.list',
  SNIPPET_GET_BY_NAME: 'snippet.getByName',
  SNIPPET_SEARCH:      'snippet.search',
  // Content-script surface. SUGGEST returns {id, name} only — never snippet
  // bodies — so a page's renderer never holds content it has no use for. GET
  // pulls the single snippet the user actually chose, at commit time.
  SNIPPET_SUGGEST:     'snippet.suggest',
  SNIPPET_GET:         'snippet.get',
  SNIPPET_SAVE:        'snippet.save',
  SNIPPET_DELETE:      'snippet.delete',
  FOLDER_LIST:         'folder.list',
  FOLDER_SAVE:         'folder.save',
  FOLDER_DELETE:       'folder.delete',
  TAG_LIST:            'tag.list',
  EXPORT_JSON:         'export.json',
  IMPORT_JSON:         'import.json',
  // broadcast (SW -> everyone, fire-and-forget)
  SNIPPETS_CHANGED:    'snippets.changed',
  // fill mode (popup -> tab content script; CS -> SW)
  FILL_START:          'fill.start',
  FILL_STATUS:         'fill.status',
  FILL_CANCEL:         'fill.cancel',
  FILL_ENDED:          'fill.ended',
  FILL_ADVANCE:        'fill.advance',
  // quick clip via context menu (SW <-> tab content script)
  GET_SELECTION:       'clip.getSelection',
  CLIP_SAVED:          'clip.saved',
};

/**
 * Thin message client usable from content scripts / popup / options.
 * Returns the handler result, throws on error responses.
 */
export async function call(type, payload = {}) {
  let res;
  try {
    res = await chrome.runtime.sendMessage(Object.assign({ type }, payload));
  } catch (e) {
    // "Extension context invalidated" etc. — surface gracefully.
    throw new Error(String(e && e.message ? e.message : e));
  }
  if (!res || !res.ok) throw new Error((res && res.error) || 'no response');
  return res.result;
}
