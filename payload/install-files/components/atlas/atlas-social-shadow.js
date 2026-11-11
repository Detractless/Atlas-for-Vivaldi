/* Shadow-root styles for the social filter's site rules. */
(function () {
  'use strict';

  function create(routeAttr, heldAttr, shadowAttr) {
    function shadowText(rule, how) {
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

    function sweepShadows(state) {
      Object.keys(state.parts).forEach(function (id) {
        var entry = state.parts[id];
        (entry.part.shadow || []).forEach(function (rule, n) {
          var hosts = document.querySelectorAll(rule.host);
          for (var i = 0; i < hosts.length; i++) {
            var host = hosts[i];
            if (!host.shadowRoot || entry.done[n].has(host)) continue;
            var style = document.createElement('style');
            style.setAttribute(shadowAttr, id);
            style.textContent = shadowText(rule, entry.part.hide);
            host.shadowRoot.appendChild(style);
            entry.done[n].add(host);
          }
        });
      });
    }

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
          var styles = hosts[i].shadowRoot ? hosts[i].shadowRoot.querySelectorAll('style[' + shadowAttr + '="' + id + '"]') : [];
          for (var j = 0; j < styles.length; j++) styles[j].parentNode.removeChild(styles[j]);
        }
      });
    }

    return { sweepShadows: sweepShadows, shadowWatch: shadowWatch, removeShadowStyles: removeShadowStyles };
  }

  window.__atlasSocialShadow = { create: create };
})();
