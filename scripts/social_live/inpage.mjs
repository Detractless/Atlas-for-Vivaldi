// Code that runs inside the page being reviewed, in a separate "isolated world" like a real content script,
// so the page never sees it. Strings, because they are sent to the browser.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const COMPONENTS = path.resolve(HERE, "..", "..", "payload", "install-files", "components", "atlas");
export const WORLD = "atlas-social";
const ENGINE = ["atlas-social-behaviors.js", "atlas-social-guard.js", "atlas-social-core.js"];

/* A stand-in for chrome.storage, so the engine reads the setting the review chooses. */
const STUB = `(function () {
  var store = { sync: { socialFilter: __INITIAL__ }, local: {} }, listeners = [];
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function area(name) {
    return {
      get: function (keys, cb) {
        var out = {}; (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { if (k in store[name]) out[k] = copy(store[name][k]); });
        if (cb) cb(out);
      },
      set: function (o, cb) {
        var ch = {}; Object.keys(o).forEach(function (k) { ch[k] = { newValue: copy(o[k]) }; store[name][k] = copy(o[k]); });
        if (cb) cb(); listeners.slice().forEach(function (fn) { fn(ch, name); });
      }
    };
  }
  window.__atlasSocial = { reviewing: true };
  window.chrome = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: function (fn) { listeners.push(fn); } } }, runtime: {} };
  window.__atlasStub = { setFilter: function (v) { window.chrome.storage.sync.set({ socialFilter: v }); } };
})();`;

/** Everything injected at document start: the stub, the engine, and the site's real table file. */
export function injectedSource(key, initial) {
  const read = (f) => fs.readFileSync(path.join(COMPONENTS, f), "utf8");
  const stub = STUB.replace("__INITIAL__", JSON.stringify(initial || { mode: "off", parts: [] }));
  return [stub, ...ENGINE.map(read), read(`atlas-social-${key}.js`)].join("\n;\n");
}

/** Measure one part on the current page (filter off or on): matches, visible matches, and their joint box. */
export const MEASURE = `(function (id) {
  var S = window.__atlasSocial, t = S.state.table;
  var route = t.route(location.pathname, location.search, location.hostname) || 'other';
  var rules = S.internals.rulesOf(t.parts[id]), matches = 0, visible = 0, box = null;
  rules.forEach(function (r) {
    if (r.on && r.on.indexOf(route) < 0) return;
    var list; try { list = document.querySelectorAll(r.sel); } catch (e) { return; }
    matches += list.length;
    for (var i = 0; i < list.length; i++) {
      var b = list[i].getBoundingClientRect();
      if (!(b.width > 0 && b.height > 0)) continue;
      visible++;
      box = box ? { l: Math.min(box.l, b.left), t: Math.min(box.t, b.top), r: Math.max(box.r, b.right), b: Math.max(box.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    }
  });
  var trips = document.documentElement.getAttribute('data-atlas-social-trips') || '';
  return { route: route, matches: matches, visible: visible, box: box, trips: trips, tripWhy: S.state.tripped[id] || '' };
})`;

/** The landmarks and smoke selectors of the site table, and whether each is on screen right now. */
export const SMOKE = `(function () {
  var t = window.__atlasSocial.state.table;
  var route = t.route(location.pathname, location.search, location.hostname) || 'other';
  function shown(sel) {
    var el = document.querySelector(sel); if (!el) return 'missing';
    /* Hidden means it has no box at all (display:none on it or around it, which is all the filter ever does).
       A wrapper that is display:contents, or empty, has a zero-size box but is not hidden. */
    return el.getClientRects().length > 0 || getComputedStyle(el).display === 'contents' ? 'shown' : 'hidden';
  }
  var out = { route: route, landmarks: {}, smoke: {} };
  (t.landmarks || []).forEach(function (l) { if (!l.on || l.on.indexOf(route) >= 0) out.landmarks[l.sel] = shown(l.sel); });
  (t.smoke || []).forEach(function (s) { out.smoke[s] = shown(s); });
  return out;
})()`;

/** A trimmed copy of the page's structure (no scripts, styles, images or text), for the offline fixture tests. */
export const SNAPSHOT = `(function () {
  var c = document.documentElement.cloneNode(true);
  c.querySelectorAll('script,style,link,noscript,svg,iframe,canvas,source,meta').forEach(function (n) { n.remove(); });
  c.removeAttribute('data-atlas-route'); c.removeAttribute('data-atlas-social-trips');
  c.querySelectorAll('*').forEach(function (n) {
    n.removeAttribute('style'); n.removeAttribute('srcset'); n.removeAttribute('src');
    if (n.hasAttribute('href')) n.setAttribute('href', n.getAttribute('href').replace(/[?#].*$/, '').slice(0, 80));
    Array.prototype.forEach.call(n.childNodes, function (t) { if (t.nodeType === 3) t.nodeValue = t.nodeValue.trim().slice(0, 24); });
  });
  return '<!doctype html>' + c.outerHTML;
})()`;
