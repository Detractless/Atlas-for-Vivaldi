/* Element Remover — background controller.
 *
 * The "armed" state is PER TAB and PERSISTED in chrome.storage.session, not a
 * single module-level variable. The old design kept one global `elementRemoverState`
 * in the service worker, which broke two ways: (1) it wasn't per-tab (arming one
 * tab flipped every tab), and (2) an MV3 service worker is ephemeral — it is
 * killed after ~30s idle and restarts with the variable reset to OFF, so the
 * sidebar's toggle desynced from reality ("wasn't working, now it is").
 * storage.session survives SW restarts for the life of the browser session and is
 * not exposed to content scripts, which is exactly the right scope for this.
 *
 * The picker itself (inject.bundle.js) is injected on demand and does NOT survive
 * a navigation, so we reset a tab's state to OFF when it starts loading and when
 * it closes — keeping the stored state honest. */

const STATE_KEY = 'rheTabStates';

async function readStates() {
  try { const r = await chrome.storage.session.get(STATE_KEY); return r[STATE_KEY] || {}; }
  catch (e) { return {}; }
}
async function writeStates(states) {
  try { await chrome.storage.session.set({ [STATE_KEY]: states }); } catch (e) {}
}
async function getTabState(tabId) {
  if (tabId == null) return 'OFF';
  const s = await readStates();
  return s[tabId] || 'OFF';
}
async function setTabState(tabId, state) {
  if (tabId == null) return;
  const s = await readStates();
  if (state === 'ON') s[tabId] = 'ON'; else delete s[tabId];
  await writeStates(s);
  try { chrome.action.setTitle({ tabId, title: 'Detractless Remover - ' + state }); } catch (e) {}
}

function injectElementRemover(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/dist/inject.bundle.js']
  }, () => {
    if (chrome.runtime.lastError) { console.error(chrome.runtime.lastError); return; }
    chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/elementRemover/inject.css']
    });
    /* After injection the picker asks for state; also push it in case the ask
       raced the listener setup. */
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { method: 'state', data: { state: 'ON' }, path: 'background-to-page' }, () => void chrome.runtime.lastError);
    }, 100);
  });
}

/* Turn the picker on/off for one tab. Injects inject.bundle.js only if the tab
   has no listener yet (first arm); a re-arm just re-sends the state. */
export async function toggleRemoverForTab(tabId) {
  const next = (await getTabState(tabId)) === 'ON' ? 'OFF' : 'ON';
  await setTabState(tabId, next);
  chrome.tabs.sendMessage(tabId, { method: 'state', data: { state: next }, path: 'background-to-page' }, () => {
    if (chrome.runtime.lastError && next === 'ON') injectElementRemover(tabId);
  });
  return next;
}

export async function getRemoverState(tabId) {
  return getTabState(tabId);
}

/* Toolbar icon click toggles the ACTIVE tab, same per-tab model. */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://')) return;
  await toggleRemoverForTab(tab.id);
});

/* Keep stored state honest: the injected picker dies on navigation, and a closed
   tab should not linger in the map. */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') setTabState(tabId, 'OFF');
});
chrome.tabs.onRemoved.addListener((tabId) => { setTabState(tabId, 'OFF'); });

/* Page → background: the picker asks for its tab's state, or stores OFF on Esc. */
export function handleElementRemoverMessage(message, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;
  if (message.method === 'state') {
    getTabState(tabId).then((state) => {
      chrome.tabs.sendMessage(tabId, { method: 'state', data: { state }, path: 'background-to-page' }, () => void chrome.runtime.lastError);
    });
  } else if (message.method === 'store' && message.data && message.data.state) {
    setTabState(tabId, message.data.state).then(() => {
      chrome.tabs.sendMessage(tabId, { method: 'state', data: { state: message.data.state }, path: 'background-to-page' }, () => void chrome.runtime.lastError);
    });
  }
}
