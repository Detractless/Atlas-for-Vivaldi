// background/action.js — toolbar click opens the side panel (native Side
// Panel API): full browser height for the snippet library, persists across
// tab switches.

export function initAction() {
  try {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.error('[Pastekit] sidePanel behavior failed', e));
  } catch (e) {
    console.error('[Pastekit] sidePanel API unavailable', e);
  }
}
