// What the archived Tools-sidebar features (PasteKit, Element Remover) left in a
// profile, and what happens to it now that their code is gone.
//
// KEPT, untouched: the "pastekit" IndexedDB database (snippets still travel in
// backups, see services/snippetBackup.js), chrome.storage.local "pastekit.settings"
// and "rhe_rules", and chrome.storage.session "rheTabStates" (cleared by the
// browser at session end anyway). No user data is deleted here.
//
// REMOVED, because it would now do nothing: PasteKit's "Save to Pastekit" item in
// the browser's own right-click menu. Context-menu items persist in the profile,
// so an item created by an earlier version outlives the code that handled it.
// Removing a missing item is a no-op, so this is safe to run on every start.
const PASTEKIT_MENU_ID = 'pastekit-save-selection';

if (chrome.contextMenus && chrome.contextMenus.remove) {
  try {
    chrome.contextMenus.remove(PASTEKIT_MENU_ID, () => { void chrome.runtime.lastError; });
  } catch (e) { /* the item was never created */ }
}
