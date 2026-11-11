/* ══════════════════════════════════════════════════════════════════════
   RIGHT-CLICK, IN THE ADDRESS BAR

   Right-clicking a bookmark, a group or a page used to open a pop-up over
   the blurred page. Now it asks the browser window to open the address bar
   for it, the way Add bookmark, Add group and Add page do (src/modules/
   26-addbar-edit.js in the window; background/editFlow.js does the saving
   and tells this page to show it).

   The window answers { ok: true } once the bar is open. If nobody answers
   (this page is open somewhere Atlas's window code is not, or the browser
   has not been restarted since this was installed) `fallback` runs, which
   is the pop-up, so a right-click never does nothing.

   `edit` is what was clicked:
     { kind: 'bookmark', page, group, name, url }
     { kind: 'group', page, group, count }
     { kind: 'page', id, label, name, sub, type }
   ══════════════════════════════════════════════════════════════════════ */

export function editInBar(edit, fallback) {
  const handled = (reply) => {
    const lastError = chrome.runtime && chrome.runtime.lastError;   // read, so Chrome does not log it
    return !lastError && !!reply && reply.ok === true;
  };
  try {
    chrome.runtime.sendMessage({ atlas: { act: 'edit-open', edit } }, (reply) => { if (!handled(reply)) fallback(); });
  } catch (e) {
    fallback();   // no extension runtime here
  }
}
