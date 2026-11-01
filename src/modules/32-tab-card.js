/* The hover card prints the host of every page it can parse. Atlas's own pages
   (new tab, History, Settings) live under the browser's own extension id, so that
   line is marked atlas-own and CSS shows "Atlas" in its place; any other extension
   id is marked atlas-no-id and hidden. Real sites keep their domain. The line's own
   text is never edited: the card is drawn by React, which would lose track of it. */
function atlasMarkTabCard(root) {
  var own = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || '';
  var lines = root.querySelectorAll('.tooltip-item .thumbnail-text .url'), i, text, isOwn, isId;
  for (i = 0; i < lines.length; i++) {
    text = (lines[i].textContent || '').trim();
    isOwn = text !== '' && text === own;
    isId = !isOwn && /^[a-p]{32}$/.test(text);
    if (lines[i].classList.contains('atlas-own') !== isOwn) lines[i].classList.toggle('atlas-own', isOwn);
    if (lines[i].classList.contains('atlas-no-id') !== isId) lines[i].classList.toggle('atlas-no-id', isId);
  }
}

function startAtlasTabCard(attempt) {
  var tip = document.getElementById('vivaldi-tooltip');
  if (!tip) {
    if (attempt < 40) setTimeout(function () { startAtlasTabCard(attempt + 1); }, 500);
    return;
  }
  if (typeof MutationObserver === 'undefined') return;
  // Class changes are not observed, so toggling the class cannot loop.
  new MutationObserver(function () { atlasMarkTabCard(tip); })
    .observe(tip, { childList: true, subtree: true, characterData: true });
  atlasMarkTabCard(tip);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') startAtlasTabCard(0);
