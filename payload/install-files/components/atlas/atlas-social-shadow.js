/* Shadow-root styles for the social filter's site rules. */
(function () {
  'use strict';

  function shadowText(rule, how, routeAttr, heldAttr) {
    var decl = how === 'visibility' ? 'visibility:hidden!important' : 'display:none!important';
    var out = [];
    rule.css.forEach(function (sel) {
      if (!rule.on) { out.push(sel + '{' + decl + '}'); return; }
      rule.on.forEach(function (route) {
        out.push(':host-context(html[' + routeAttr + '="' + route + '"]) ' + sel + '{' + decl + '}');
        out.push(':host-context(html[' + heldAttr + '~="' + route + '"]) ' + sel + '{' + decl + '}');
      });
    });
    return out.join('\n');
  }

  function sweepShadows(state, routeAttr, heldAttr, shadowAttr) {
    Object.keys(state.parts).forEach(function (id) {
      var entry = state.parts[id];
      (entry.part.shadow || []).forEach(function (rule, n) {
        var hosts = document.querySelectorAll(rule.host);
        for (var i = 0; i < hosts.length; i++) {
          var host = hosts[i];
          if (!host.shadowRoot || entry.done[n].has(host)) continue;
          var style = document.createElement('style');
          style.setAttribute(shadowAttr, id);
          style.textContent = shadowText(rule, entry.part.hide, routeAttr, heldAttr);
          host.shadowRoot.appendChild(style);
          entry.done[n].add(host);
        }
      });
    });
  }

  function shadowWatch(state, routeAttr, heldAttr, shadowAttr) {
    var any = Object.keys(state.parts).some(function (id) { return state.parts[id].part.shadow; });
    if (any && !state.shadowObserver) {
      var timer = 0;
      state.shadowObserver = new MutationObserver(function () {
        if (!timer) timer = setTimeout(function () {
          timer = 0;
          sweepShadows(state, routeAttr, heldAttr, shadowAttr);
        }, 40);
      });
      state.shadowObserver.observe(document.documentElement, { childList: true, subtree: true });
    } else if (!any && state.shadowObserver) {
      state.shadowObserver.disconnect();
      state.shadowObserver = null;
    }
    if (any) sweepShadows(state, routeAttr, heldAttr, shadowAttr);
  }

  function removeShadowStyles(entry, id, shadowAttr) {
    (entry.part.shadow || []).forEach(function (rule) {
      var hosts = document.querySelectorAll(rule.host);
      for (var i = 0; i < hosts.length; i++) {
        var styles = hosts[i].shadowRoot ? hosts[i].shadowRoot.querySelectorAll('style[' + shadowAttr + '="' + id + '"]') : [];
        for (var j = 0; j < styles.length; j++) styles[j].parentNode.removeChild(styles[j]);
      }
    });
  }

  function create(routeAttr, heldAttr, shadowAttr) {
    return {
      sweepShadows: function (state) { return sweepShadows(state, routeAttr, heldAttr, shadowAttr); },
      shadowWatch: function (state) { return shadowWatch(state, routeAttr, heldAttr, shadowAttr); },
      removeShadowStyles: function (entry, id) { return removeShadowStyles(entry, id, shadowAttr); }
    };
  }

  window.__atlasSocialShadow = { create: create };
})();
