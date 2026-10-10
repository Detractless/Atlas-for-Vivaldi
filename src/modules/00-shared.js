/* ── 00-shared.js: helpers every module may use. Loaded first. ── */

/* Report a failure that should not stop the window: an action from a menu that
   threw, for example. A swallowed error is invisible; this shows where it came from. */
function atlasWarn(where, err) {
  try { console.warn('[Atlas] ' + where, err); } catch (e) { /* no console in this context */ }
}

/* Atlas's marks (atlas-* classes) on the window's #browser element, which the
   stylesheets follow. Vivaldi rebuilds that element's whole class list now and
   then (when the window gains or loses focus, among others), and that erased
   them: the address bar's engine logo then sat over Vivaldi's own icon
   (2026-10-09). So every mark goes through atlasMark, which keeps a record,
   and a watch on #browser puts recorded marks back as soon as Vivaldi's list
   replaces them, before the window redraws. */
var atlasMarks = {};
var atlasMarkWatch = { el: null, mo: null };

function atlasMark(name, on) {
  atlasMarks[name] = !!on;
  var browser = atlasMarkHost();
  if (browser) browser.classList.toggle(name, !!on);
}

/* Whether a mark is on, by the record: right even while Vivaldi's rewrite waits to be undone. */
function atlasMarked(name) {
  return !!atlasMarks[name];
}

function atlasMarkHost() {
  var browser = typeof document !== 'undefined' && document.getElementById ? document.getElementById('browser') : null;
  if (browser && atlasMarkWatch.el !== browser && typeof MutationObserver !== 'undefined') {
    if (atlasMarkWatch.mo) atlasMarkWatch.mo.disconnect();
    atlasMarkWatch.el = browser;
    atlasMarkWatch.mo = new MutationObserver(atlasMarkRestore);
    atlasMarkWatch.mo.observe(browser, { attributes: true, attributeFilter: ['class'] });
    atlasMarkRestore();   // a new #browser: the marks go on it too
  }
  return browser;
}

/* Only adds what the record has on, so it settles after one pass. */
function atlasMarkRestore() {
  var browser = atlasMarkWatch.el;
  if (!browser) return;
  Object.keys(atlasMarks).forEach(function (name) {
    if (atlasMarks[name] && !browser.classList.contains(name)) browser.classList.add(name);
  });
}
