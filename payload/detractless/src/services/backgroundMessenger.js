export async function sendToBackground(message) {
  try { return await chrome.runtime.sendMessage(message); } catch (e) { /* background may not be listening */ }
}
