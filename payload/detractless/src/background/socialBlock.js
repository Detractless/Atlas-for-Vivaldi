// "Block social sites entirely" (Settings > Focus > Content shield > Social media filter). While that mode is on,
// opening a page of one of the social sites (utils/socialFilter.js SITES) lands on the block page instead.
// Same pattern as the search delay (searchInterception.js): the navigation is replaced before the page is seen.
// Main frame only, so a video embedded on another site still plays; subdomains and short-link hosts (youtu.be,
// fb.me) are included. There is no way through the block page: loosening the mode is the Focus lock's decision,
// not a button. Turning the mode on also takes the tabs that are already on those sites.
//
// Three events, because a redirect (youtu.be/<id> to youtube.com) only shows up once the page commits.
import { storageGet } from '../services/storage.js';
import { normalize, siteOf } from '../utils/socialFilter.js';

let mode = 'off';
// The worker can be woken by a navigation before its first storage read is back: wait for it.
const ready = storageGet('sync', ['socialFilter']).then((r) => { mode = normalize(r.socialFilter).mode; });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.socialFilter) return;
  const was = mode;
  mode = normalize(changes.socialFilter.newValue).mode;
  if (mode === 'all' && was !== 'all') blockOpenTabs();
});

/** Tabs already open on a social site, when the mode is switched on. */
function blockOpenTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs || []) {
      const site = tab.url && siteOf(tab.url);
      if (site) chrome.tabs.update(tab.id, { url: blockPageUrl(site) });
    }
  });
}

/** The block page address for `site` (a SITES entry). */
export const blockPageUrl = (site) => chrome.runtime.getURL('gate.html') + '?why=social&site=' + encodeURIComponent(site.name);

export async function handleSocialBlock(tabId, url) {
  await ready;
  if (mode !== 'all') return;
  const site = siteOf(url);
  if (site) chrome.tabs.update(tabId, { url: blockPageUrl(site) });
}

// A new page, the page a redirect ended on, and a single-page site moving to another address without loading one.
const onNavigate = (details) => { if (details.frameId === 0) handleSocialBlock(details.tabId, details.url); };
chrome.webNavigation.onBeforeNavigate.addListener(onNavigate);
chrome.webNavigation.onCommitted.addListener(onNavigate);
chrome.webNavigation.onHistoryStateUpdated.addListener(onNavigate);
