// background/clip.js — quick-save from the context menu.
// Right-click highlighted text -> "Save to Pastekit" -> instant save with an
// auto-generated @token name (heuristic; designed so an AI naming rung can be
// slotted into suggestName later without touching the save flow).
import { MSG } from '../utils/messages.js';
import { getSnippetByName, saveSnippet } from './db.js';
import { broadcast } from './broadcast.js';

const MENU_ID = 'pastekit-save-selection';

export function initClipMenu() {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: 'Save to Pastekit',
        contexts: ['selection'],
      });
    });
  });

  chrome.contextMenus.onClicked.addListener(onMenuClicked);
}

async function onMenuClicked(info, tab) {
  if (info.menuItemId !== MENU_ID || !tab || tab.id == null) return;

  // Prefer the content script's read of the selection: it preserves line
  // breaks and HTML, where info.selectionText flattens newlines to spaces.
  let text = '', html = '';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: MSG.GET_SELECTION });
    if (res && res.text) { text = res.text; html = res.html || ''; }
  } catch (_) { /* no content script in tab — fall back to info.selectionText below */ }
  if (!text) text = (info.selectionText || '').trim();
  if (!text) return;

  try {
    const name = await uniqueName(suggestName(text, tab.title || ''));
    await saveSnippet({
      name,
      description: tab.title ? 'Clipped from ' + tab.title : 'Clipped selection',
      folderId: 0,
      tags: ['clipped'],
      contentText: text,
      contentHtml: html,
    });
    broadcast();
    notify(tab.id, { ok: true, name });
  } catch (e) {
    console.error('[Pastekit] quick save failed', e);
    notify(tab.id, { ok: false, error: String(e && e.message ? e.message : e) });
  }
}

// ------------------------------ naming ------------------------------------
const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','of','to','in','on','at','for','with',
  'is','are','was','were','be','been','it','its','this','that','these','those',
  'i','you','we','they','he','she','my','your','our','as','by','from','so',
]);

function suggestName(text, pageTitle) {
  const t = text.trim();

  // URL -> domain slug.
  if (/^https?:\/\/\S+$/i.test(t)) {
    try { return slug(new URL(t).hostname.replace(/^www\./, '')); }
    catch (_) { /* malformed URL — fall through to word-based naming */ }
  }
  // Email -> local part.
  const email = t.match(/^([A-Za-z0-9._%+-]+)@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
  if (email) return slug(email[1]);

  // First meaningful words of the selection.
  let name = firstWordsSlug(t);
  // Mostly-numeric or empty result identifies nothing -> use the page title.
  if (!name || /^[\d-]+$/.test(name)) name = firstWordsSlug(pageTitle);
  return name || 'clip';
}

function firstWordsSlug(s) {
  const words = String(s || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let picked = words.filter(w => !STOPWORDS.has(w.toLowerCase())).slice(0, 3);
  if (!picked.length) picked = words.slice(0, 3);
  return slug(picked.join('-')).slice(0, 24).replace(/-+$/, '');
}

function slug(s) {
  return String(s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

async function uniqueName(base) {
  if (!base) base = 'clip';
  if (!(await getSnippetByName(base))) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = base + '-' + i;
    if (!(await getSnippetByName(candidate))) return candidate;
  }
  return base + '-' + Date.now();
}

// ------------------------------ notify ------------------------------------
function notify(tabId, payload) {
  try {
    chrome.tabs.sendMessage(tabId, Object.assign({ type: MSG.CLIP_SAVED }, payload)).catch(() => {});
  } catch (_) { /* tab closed or has no content script — toast is best-effort */ }
}
