/* ── atlas-social-core.js: the social media filter on a web page (Settings > Focus > Content shield).
   A site table (atlas-social-<site>.js) lists, for each part of the site, what hides it. This engine reads the
   `socialFilter` setting and, for the parts chosen, adds one style block per part to the page, keeps
   <html data-atlas-route> up to date so rules can say which pages they apply to, and runs the safety guard
   (atlas-social-guard.js). With the filter off, or a part not chosen, nothing is added to the page.
   Parts are only ever hidden, never removed, so the site's own scripts keep the elements they expect. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial = window.__atlasSocial || {};
  if (S.run) return;

  var ROUTE_ATTR = 'data-atlas-route';
  var HELD_ATTR = 'data-atlas-route-held';   /* the routes just left, while the site still shows their page */
  var STYLE_ATTR = 'data-atlas-social';
  var SHADOW_ATTR = 'data-atlas-social-shadow';
  var TRIPS_ATTR = 'data-atlas-social-trips';
  var MS_ATTR = 'data-atlas-social-ms';       /* when the first style went on, in ms since the page began: how long a part showed */
  var HEALTH_KEY = 'atlas_social_health';
  var CHECK_DELAYS = [400, 1500, 4000, 8000, 15000, 30000];  /* after a page or route change; then every 30 s */
  var MODES = { off: 1, parts: 1, all: 1 };

  /* The setting made safe, the same rules as utils/socialFilter.js normalize(): a known mode and part ids. */
  function normalize(value, known) {
    var v = value && typeof value === 'object' ? value : {};
    var chosen = Array.isArray(v.parts) ? v.parts : [];
    return {
      mode: MODES[v.mode] === 1 ? v.mode : 'off',
      parts: known.filter(function (id) { return chosen.indexOf(id) >= 0; })
    };
  }

  /* A part's css entries as rules: { sel, on } where `on` is the list of routes, or null for every page. */
  function rulesOf(part) {
    return (part.css || []).map(function (c) {
      return typeof c === 'string' ? { sel: c, on: part.on || null } : { sel: c.sel, on: c.on || part.on || null };
    });
  }

  /* One rule per selector: a selector the browser can't parse drops only its own rule, never a neighbour's. */
  function cssText(rules, how) {
    var decl = how === 'visibility' ? 'visibility:hidden!important' : 'display:none!important';
    var out = [];
    rules.forEach(function (r) {
      if (!r.on) { out.push(r.sel + '{' + decl + '}'); return; }
      r.on.forEach(function (route) {
        out.push('html[' + ROUTE_ATTR + '="' + route + '"] ' + r.sel + '{' + decl + '}');
        out.push('html[' + HELD_ATTR + '~="' + route + '"] ' + r.sel + '{' + decl + '}');
      });
    });
    return out.join('\n');
  }

  function routeNow(table) {
    try { return table.route(location.pathname, location.search, location.hostname) || 'other'; } catch (e) { return 'other'; }
  }

  function note(state, id, matches, trip) {
    var h = state.health[id] || (state.health[id] = { dChecks: 0, dTrips: 0, matches: 0, maxMatches: 0, everMatched: false });
    h.dChecks++;
    h.matches = matches;
    if (matches > h.maxMatches) h.maxMatches = matches;
    if (matches > 0) h.everMatched = true;
    if (trip) { h.dTrips++; h.lastTrip = trip; }
    h.last = Date.now();
    if (!state.flushTimer) state.flushTimer = setTimeout(function () { flush(state); }, 15000);
  }

  /* Match counts and guard trips per part, kept in chrome.storage.local so rot shows up without anyone
     having to notice it. Page addresses are never stored. */
  function flush(state) {
    state.flushTimer = null;
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(HEALTH_KEY, function (items) {
      var all = (items && items[HEALTH_KEY]) || {};
      var site = all[state.table.key] || (all[state.table.key] = {});
      Object.keys(state.health).forEach(function (id) {
        var h = state.health[id], old = site[id] || {};
        site[id] = {
          checks: (old.checks || 0) + h.dChecks, trips: (old.trips || 0) + h.dTrips,
          matches: h.matches, maxMatches: Math.max(old.maxMatches || 0, h.maxMatches),
          everMatched: !!(old.everMatched || h.everMatched), lastTrip: h.lastTrip || old.lastTrip || '', last: h.last
        };
        h.dChecks = 0; h.dTrips = 0;
      });
      chrome.storage.local.set({ atlas_social_health: all });
    });
  }

  /* Shadow roots: a page style cannot reach inside one, so a part's `shadow` rules ({ host, css, on? }) go into the
     root of each host element, once each. Routes use :host-context, which sees the route attribute on <html>. */
  function shadowText(rule, how) {
    var decl = how === 'visibility' ? 'visibility:hidden!important' : 'display:none!important';
    var out = [];
    rule.css.forEach(function (sel) {
      if (!rule.on) { out.push(sel + '{' + decl + '}'); return; }
      rule.on.forEach(function (route) {
        out.push(':host-context(html[' + ROUTE_ATTR + '="' + route + '"]) ' + sel + '{' + decl + '}');
        out.push(':host-context(html[' + HELD_ATTR + '~="' + route + '"]) ' + sel + '{' + decl + '}');
      });
    });
    return out.join('\n');
  }

  function sweepShadows(state) {
    Object.keys(state.parts).forEach(function (id) {
      var entry = state.parts[id];
      (entry.part.shadow || []).forEach(function (rule, n) {
        var hosts = document.querySelectorAll(rule.host);
        for (var i = 0; i < hosts.length; i++) {
          var host = hosts[i];
          if (!host.shadowRoot || entry.done[n].has(host)) continue;
          var style = document.createElement('style');
          style.setAttribute(SHADOW_ATTR, id);
          style.textContent = shadowText(rule, entry.part.hide);
          host.shadowRoot.appendChild(style);
          entry.done[n].add(host);
        }
      });
    });
  }

  /* One watcher for the page, while any chosen part has shadow rules: hosts arrive as the page scrolls. */
  function shadowWatch(state) {
    var any = Object.keys(state.parts).some(function (id) { return state.parts[id].part.shadow; });
    if (any && !state.shadowObserver) {
      var timer = 0;
      state.shadowObserver = new MutationObserver(function () {
        if (!timer) timer = setTimeout(function () { timer = 0; sweepShadows(state); }, 40);
      });
      state.shadowObserver.observe(document.documentElement, { childList: true, subtree: true });
    } else if (!any && state.shadowObserver) {
      state.shadowObserver.disconnect();
      state.shadowObserver = null;
    }
    if (any) sweepShadows(state);
  }

  function removeShadowStyles(entry, id) {
    (entry.part.shadow || []).forEach(function (rule) {
      var hosts = document.querySelectorAll(rule.host);
      for (var i = 0; i < hosts.length; i++) {
        var styles = hosts[i].shadowRoot ? hosts[i].shadowRoot.querySelectorAll('style[' + SHADOW_ATTR + '="' + id + '"]') : [];
        for (var j = 0; j < styles.length; j++) styles[j].parentNode.removeChild(styles[j]);
      }
    });
  }

  function unmount(state, id) {
    var entry = state.parts[id];
    if (!entry) return;
    if (entry.style.parentNode) entry.style.parentNode.removeChild(entry.style);
    removeShadowStyles(entry, id);
    entry.stops.forEach(function (stop) { try { stop(); } catch (e) { /* already stopped */ } });
    delete state.parts[id];
  }

  function mount(state, id) {
    var part = state.table.parts[id];
    var rules = rulesOf(part);
    var style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, id);
    style.textContent = cssText(rules, part.hide);
    document.documentElement.appendChild(style);
    if (!document.documentElement.hasAttribute(MS_ATTR)) document.documentElement.setAttribute(MS_ATTR, String(Math.round(performance.now())));
    var entry = state.parts[id] = { part: part, rules: rules, styles: [style], style: style, stops: [], done: (part.shadow || []).map(function () { return new WeakSet(); }) };
    if (typeof part.act === 'function') {
      try {
        var stop = part.act({ helpers: S.helpers, route: function () { return state.route; } });
        if (typeof stop === 'function') entry.stops.push(stop);
      } catch (e) { /* the part still hides what its css names */ }
    }
  }

  /* The guard switched a part off: take its style away for good on this page and say so on <html>. */
  function trip(state, id, why) {
    unmount(state, id);
    shadowWatch(state);
    state.tripped[id] = why;
    var list = document.documentElement.getAttribute(TRIPS_ATTR);
    document.documentElement.setAttribute(TRIPS_ATTR, (list ? list + ',' : '') + id);
  }

  /* What no rule may hide: the table's landmarks, and the smoke selectors (the search box, the player). */
  function protectedList(table) {
    return (table.landmarks || []).concat((table.smoke || []).map(function (sel) { return { sel: sel }; }));
  }

  function runChecks(state) {
    Object.keys(state.parts).forEach(function (id) {
      var res = S.guard.check(state.parts[id], protectedList(state.table), state.route);
      note(state, id, res.matches, res.trip);
      if (res.trip) trip(state, id, res.trip);
    });
  }

  function scheduleChecks(state) {
    clearTimeout(state.checkTimer);
    var i = state.checkIndex++;
    var delay = CHECK_DELAYS[Math.min(i, CHECK_DELAYS.length - 1)];
    state.checkTimer = setTimeout(function () {
      runChecks(state);
      if (Object.keys(state.parts).length) scheduleChecks(state);
    }, delay);
  }

  /* A page we redirected to must not redirect straight back: at most one redirect from an address per 10 s. */
  function redirectAllowed(from) {
    try {
      var last = JSON.parse(sessionStorage.getItem('atlas-social-redirect') || 'null');
      if (last && last.from === from && Date.now() - last.at < 10000) return false;
      sessionStorage.setItem('atlas-social-redirect', JSON.stringify({ from: from, at: Date.now() }));
    } catch (e) { /* no session storage: the table check below still prevents a loop */ }
    return true;
  }

  function runRedirects(state) {
    var ids = Object.keys(state.parts);
    for (var i = 0; i < ids.length; i++) {
      var r = state.parts[ids[i]].part.redirect;
      if (!r || !r.from.test(location.pathname)) continue;
      var target = new URL(r.to, location.origin).href;
      if (target === location.href || !redirectAllowed(location.href)) continue;
      S.navigate(target);
      return;
    }
  }

  function setRoute(state) {
    state.route = routeNow(state.table);
    document.documentElement.setAttribute(ROUTE_ATTR, state.route);
    state.href = location.href;
  }

  /* A site that rewrites <html> or its children can drop our route attribute or a style block: put them back. */
  function repair(state) {
    var root = document.documentElement;
    if (root.getAttribute(ROUTE_ATTR) !== state.route) root.setAttribute(ROUTE_ATTR, state.route);
    Object.keys(state.parts).forEach(function (id) {
      var style = state.parts[id].style;
      if (!style.isConnected) root.appendChild(style);
    });
  }

  /* A single-page site changes the address first and keeps showing the old page until the new one has loaded (YouTube:
     about 0.8 s). The old route's rules would stop the moment the address changed and uncover that page, so they stay on,
     next to the new route's, until the table's `settle` event says the new page is on screen (or `settle.max` ms pass). */
  function holdOldPage(state, route) {
    var settle = state.table.settle;
    if (!settle || !route) return;
    if (state.held.indexOf(route) < 0) state.held.push(route);
    document.documentElement.setAttribute(HELD_ATTR, state.held.join(' '));
    clearTimeout(state.settleTimer);
    clearTimeout(state.holdTimer);
    state.holdTimer = setTimeout(function () { releaseOldPage(state); }, settle.max || 5000);
  }

  function releaseOldPage(state) {
    clearTimeout(state.settleTimer);
    clearTimeout(state.holdTimer);
    state.held = [];
    document.documentElement.removeAttribute(HELD_ATTR);
  }

  /* The address changed (a link inside a single-page site): switch to the new page's rules. */
  function follow(state) {
    if (location.href === state.href) return;
    var left = state.route;
    setRoute(state);
    if (left !== state.route) holdOldPage(state, left);
    state.tripped = {};   /* a part that tripped on one kind of page gets a fresh try on the next */
    apply(state);
    state.checkIndex = 0;
    scheduleChecks(state);
    runRedirects(state);
  }

  function tick(state) {
    repair(state);
    sweepShadows(state);
    follow(state);
  }

  /* Follow the address the moment it changes, not at the next 300 ms check: until the route on <html> is current,
     the new page's rules are off, and a page the site shows from its cache (YouTube's home) is on screen unhidden.
     The check stays as the fallback for anything these events miss. */
  function listenForNavigation(state) {
    state.onNavigate = function () { follow(state); };
    state.onSettled = function () {
      if (!state.held.length) return;
      clearTimeout(state.settleTimer);
      state.settleTimer = setTimeout(function () { releaseOldPage(state); }, state.table.settle.after || 250);
    };
    ((state.table.settle && state.table.settle.events) || []).forEach(function (name) { document.addEventListener(name, state.onSettled, true); });
    if (window.navigation && window.navigation.addEventListener) window.navigation.addEventListener('currententrychange', state.onNavigate);
    window.addEventListener('popstate', state.onNavigate);
    window.addEventListener('hashchange', state.onNavigate);
  }

  function stopListening(state) {
    if (!state.onNavigate) return;
    if (window.navigation && window.navigation.removeEventListener) window.navigation.removeEventListener('currententrychange', state.onNavigate);
    window.removeEventListener('popstate', state.onNavigate);
    window.removeEventListener('hashchange', state.onNavigate);
    ((state.table.settle && state.table.settle.events) || []).forEach(function (name) { document.removeEventListener(name, state.onSettled, true); });
    state.onNavigate = null;
    state.onSettled = null;
  }

  function awake(state) {
    if (state.awake) return;
    state.awake = true;
    setRoute(state);
    listenForNavigation(state);
    state.routeTimer = setInterval(function () { tick(state); }, 300);
    state.checkIndex = 0;
    scheduleChecks(state);
    runRedirects(state);
  }

  function idle(state) {
    state.awake = false;
    stopListening(state);
    clearInterval(state.routeTimer);
    clearTimeout(state.checkTimer);
    releaseOldPage(state);
    document.documentElement.removeAttribute(ROUTE_ATTR);
    document.documentElement.removeAttribute(MS_ATTR);
  }

  function apply(state) {
    var want = state.cfg.mode === 'parts' ? state.cfg.parts : [];
    Object.keys(state.parts).forEach(function (id) { if (want.indexOf(id) < 0) unmount(state, id); });
    Object.keys(state.tripped).forEach(function (id) { if (want.indexOf(id) < 0) delete state.tripped[id]; });   /* switched off in Settings: a later switch-on gets a fresh try */
    var added = false;
    want.forEach(function (id) { if (!state.parts[id] && !state.tripped[id]) { mount(state, id); added = true; } });
    shadowWatch(state);
    if (!Object.keys(state.parts).length) { idle(state); return; }
    if (!state.awake) { awake(state); return; }
    if (added) { state.checkIndex = 0; scheduleChecks(state); runRedirects(state); }
  }

  function load(state) {
    chrome.storage.sync.get(['socialFilter'], function (items) {
      state.cfg = normalize(items && items.socialFilter, Object.keys(state.table.parts));
      apply(state);
    });
  }

  /* How a redirect happens; tests replace it. */
  S.navigate = function (url) { location.replace(url); };

  /* Start the filter for one site table. Returns the state, which the tests look at. */
  S.run = function (table) {
    if (!table || (table.live === false && !S.reviewing)) return null;   /* S.reviewing: the live review runs a table that is not live yet */
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return null;
    var state = { table: table, cfg: { mode: 'off', parts: [] }, parts: {}, tripped: {}, health: {}, route: '', held: [], href: '', checkIndex: 0 };
    S.state = state;
    load(state);
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'sync' && changes.socialFilter) load(state);
      });
    }
    return state;
  };

  S.internals = { normalize: normalize, rulesOf: rulesOf, cssText: cssText, flush: flush, runChecks: runChecks, tick: tick };
})();
