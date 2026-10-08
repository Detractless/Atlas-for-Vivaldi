// background/broadcast.js — fire-and-forget SNIPPETS_CHANGED fan-out so open
// tabs, the side panel, and content scripts refresh their caches.
import { MSG } from '../utils/messages.js';

export function broadcast() {
  try {
    chrome.runtime.sendMessage({ type: MSG.SNIPPETS_CHANGED }).catch(() => {});
  } catch (_) { /* no listener (SW not running) — safe to ignore for fan-out */ }
  // Also notify content scripts across tabs.
  try {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (t.id == null) continue;
        try { chrome.tabs.sendMessage(t.id, { type: MSG.SNIPPETS_CHANGED }).catch(() => {}); }
        catch (_) { /* tab has no content script — safe to ignore for fan-out */ }
      }
    });
  } catch (_) { /* tabs API unavailable in this context — fan-out is best-effort */ }
}
