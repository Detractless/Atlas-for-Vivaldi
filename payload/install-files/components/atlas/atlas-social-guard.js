/* ── atlas-social-guard.js: the safety check of the social media filter. A hiding rule is only ever allowed to
   hide the part it names. If a rule would hide the page itself, a landmark the site table says must stay
   (the search box, the video player), too many things at once, or too much of the window, the part is
   switched off for that page and the trip is recorded. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial = window.__atlasSocial || {};
  if (S.guard) return;

  var MAX_MATCHES = 2000;     /* a part's rule matching more elements than this is a runaway selector (a part can say maxMatches) */
  var DEFAULT_MAX_AREA = 0.4; /* share of the window one part may cover; feed parts say maxArea: 1 */

  function inScope(rule, route) { return !rule.on || rule.on.indexOf(route) >= 0; }

  /* Whether `sel` hides `el` itself or something around it. */
  function reaches(el, sel) {
    try { return !!(el && (el.matches(sel) || el.closest(sel))); } catch (e) { return false; }
  }

  function landmarkTrip(sel, landmarks, route) {
    if (reaches(document.body, sel) || reaches(document.documentElement, sel)) return 'page-root';
    for (var i = 0; i < landmarks.length; i++) {
      var lm = landmarks[i];
      if (lm.on && lm.on.indexOf(route) < 0) continue;
      if (reaches(document.querySelector(lm.sel), sel)) return 'landmark:' + lm.sel;
    }
    return null;
  }

  /* The matched elements that are not inside another matched element, so nested matches count once. */
  function outermost(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var inside = false;
      for (var j = 0; j < list.length && !inside; j++) inside = i !== j && list[j].contains(list[i]);
      if (!inside) out.push(list[i]);
    }
    return out;
  }

  /* The share of the window the matched elements cover. They are display:none while the part is on, so the
     part's style is switched off, measured and switched back on inside one script run: nothing is painted
     in between, so the page never flashes. */
  function areaShare(matches, styles) {
    var w = window.innerWidth, h = window.innerHeight;
    if (!matches.length || !w || !h) return 0;
    var i, sum = 0;
    for (i = 0; i < styles.length; i++) styles[i].disabled = true;
    try {
      var els = outermost(matches.slice(0, 60));
      for (i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        var vw = Math.max(0, Math.min(r.right, w) - Math.max(r.left, 0));
        var vh = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0));
        sum += vw * vh;
      }
    } finally {
      for (i = 0; i < styles.length; i++) styles[i].disabled = false;
    }
    return Math.min(1, sum / (w * h));
  }

  /* Check one part. `entry` = { rules, styles, part }. Returns { matches, trip } where trip is a reason or null. */
  function check(entry, landmarks, route) {
    var found = [], total = 0;
    for (var i = 0; i < entry.rules.length; i++) {
      var rule = entry.rules[i];
      if (!inScope(rule, route)) continue;
      var list;
      try { list = document.querySelectorAll(rule.sel); } catch (e) { return { matches: total, trip: 'bad-selector:' + rule.sel }; }
      total += list.length;
      if (list.length > (typeof entry.part.maxMatches === 'number' ? entry.part.maxMatches : MAX_MATCHES)) return { matches: total, trip: 'too-many:' + rule.sel };
      var why = landmarkTrip(rule.sel, landmarks, route);
      if (why) return { matches: total, trip: why };
      for (var j = 0; j < list.length; j++) found.push(list[j]);
    }
    var cap = typeof entry.part.maxArea === 'number' ? entry.part.maxArea : DEFAULT_MAX_AREA;
    if (cap < 1 && found.length && areaShare(found, entry.styles) > cap) return { matches: total, trip: 'too-big' };
    return { matches: total, trip: null };
  }

  S.guard = { check: check, MAX_MATCHES: MAX_MATCHES, DEFAULT_MAX_AREA: DEFAULT_MAX_AREA };
})();
