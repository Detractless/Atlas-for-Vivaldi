// background/messageHub.js — onMessage dispatcher (§C2).
// Non-async listener → async handler → synchronous `return true`.
import { MSG } from '../utils/messages.js';
import {
  listSnippets, getSnippetByName, getSnippet, searchSnippets, suggestSnippets,
  saveSnippet, deleteSnippet,
  listFolders, saveFolder, deleteFolder, listTags, buildExport, importJson,
} from './db.js';
import { broadcast } from './broadcast.js';

// A message from a content script carries the tab it came from; messages from
// our own pages (new tab, side panel) do not. Content scripts run on every page,
// so anything answered for one is answered into that page's renderer process.
function fromContentScript(sender) {
  return !!(sender && sender.tab);
}

// Snippet payloads that may not cross into a page.
//
// SNIPPET_SUGGEST is in this set now, unlike before. It returns only names and
// descriptions rather than bodies, which is why it used to be exempt — but a name
// is exactly what Phase 3.6 decided to stop leaking, and while locked there is
// nothing legitimate to suggest anyway.
const SNIPPET_PAYLOAD_TYPES = new Set([
  MSG.SNIPPET_LIST, MSG.SNIPPET_GET_BY_NAME, MSG.SNIPPET_SEARCH, MSG.SNIPPET_GET,
  MSG.SNIPPET_SUGGEST,
]);

// Which snippet queries answer with a list. A locked store must answer these with
// an empty array rather than null, or the callers that map over the result throw
// inside the page.
const LIST_TYPES = new Set([MSG.SNIPPET_LIST, MSG.SNIPPET_SEARCH, MSG.SNIPPET_SUGGEST]);
function isListType(type) { return LIST_TYPES.has(type); }

const HANDLERS = {
  [MSG.SNIPPET_LIST]:        (m) => listSnippets(m.folderId == null ? null : m.folderId),
  [MSG.SNIPPET_GET_BY_NAME]: (m) => getSnippetByName(m.name),
  [MSG.SNIPPET_SEARCH]:      (m) => searchSnippets(m.query, m.folderId),
  [MSG.SNIPPET_SUGGEST]:     (m) => suggestSnippets(m.query, m.limit),
  [MSG.SNIPPET_GET]:         (m) => getSnippet(m.id),
  [MSG.SNIPPET_SAVE]:        (m) => saveSnippet(m.snippet).then(broadcastAfter),
  [MSG.SNIPPET_DELETE]:      (m) => deleteSnippet(m.id).then(broadcastAfter),
  [MSG.FOLDER_LIST]:         ()  => listFolders(),
  [MSG.FOLDER_SAVE]:         (m) => saveFolder(m.folder).then(broadcastAfter),
  [MSG.FOLDER_DELETE]:       (m) => deleteFolder(m.id).then(broadcastAfter),
  [MSG.TAG_LIST]:            ()  => listTags(),
  [MSG.EXPORT_JSON]:         ()  => buildExport(),
  [MSG.IMPORT_JSON]:         (m) => importJson(m.json, m.mode).then((r) => { broadcast(); return r; }),
};

function broadcastAfter(result) { broadcast(); return result; }

export function initMessageHub() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = msg && HANDLERS[msg.type];
    if (!handler) return; // not ours — let the channel close
    // Only our own extension may drive this API. Nothing today can reach it from
    // outside (no externally_connectable), so this is defence in depth against a
    // later manifest change quietly opening the door.
    if (!sender || sender.id !== chrome.runtime.id) return;

    Promise.resolve(handler(msg, sender))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => {
        // A locked store answering a content script returns EMPTY, not an error.
        // The page must not learn whether snippets exist, how many, or even that
        // there is a lock — and an in-page @ menu flashing an error box on every
        // keystroke while locked would be its own bug. Our own pages get the real
        // error, because they are the ones that can offer to unlock.
        if (err && err.locked && fromContentScript(sender)) {
          sendResponse({ ok: true, result: SNIPPET_PAYLOAD_TYPES.has(msg.type) && isListType(msg.type) ? [] : null });
          return;
        }
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      });
    return true; // REQUIRED synchronously from a non-async listener
  });
}
