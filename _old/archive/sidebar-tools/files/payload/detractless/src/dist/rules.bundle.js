(() => {
  // src/content/elementRemover/ruleLoader.js
  var DANGEROUS = /^\s*(\*|html|body|head|div|span|a|p|ul|ol|li|section|article|main|header|footer|nav|aside|img|button|input|form|label|table|thead|tbody|tr|td|th)\s*$/i;
  function extractSelectors(rules, hostname, pathname) {
    const selectors = [];
    const hostRules = rules[hostname] || [];
    if (!Array.isArray(hostRules)) return selectors;
    hostRules.forEach((rule) => {
      if (!rule) return;
      let sel = null;
      if (typeof rule === "string") sel = rule;
      else if (rule.selector) {
        if (rule.specific) {
          if (rule.path === pathname) sel = rule.selector;
        } else sel = rule.selector;
      }
      if (sel && !DANGEROUS.test(sel)) selectors.push(sel);
    });
    return selectors;
  }

  // src/content/elementRemover/styleInjector.js
  var STYLE_ID = "rhe-persistence-style";
  function styleFor(root) {
    let style = root.getElementById ? root.getElementById(STYLE_ID) : root.querySelector("#" + STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      const host = root === document ? document.head || document.documentElement : root;
      host.appendChild(style);
    }
    return style;
  }
  function shadowRoots(limit) {
    const out = [];
    const walk = (node) => {
      if (out.length >= limit) return;
      const els = node.querySelectorAll ? node.querySelectorAll("*") : [];
      for (let i = 0; i < els.length; i++) {
        const sr = els[i].shadowRoot;
        if (sr) {
          out.push(sr);
          walk(sr);
          if (out.length >= limit) return;
        }
      }
    };
    try {
      walk(document);
    } catch (e) {
    }
    return out;
  }
  var shadowObserver = null;
  function injectSelectors(selectors) {
    const css = selectors.length > 0 ? selectors.join(", ") + " { display: none !important; }" : "";
    styleFor(document).textContent = css;
    if (!css) {
      if (shadowObserver) {
        shadowObserver.disconnect();
        shadowObserver = null;
      }
      return;
    }
    shadowRoots(200).forEach((sr) => {
      try {
        styleFor(sr).textContent = css;
      } catch (e) {
      }
    });
    if (!shadowObserver) {
      shadowObserver = new MutationObserver(() => {
        const cur = styleFor(document).textContent;
        if (!cur) return;
        shadowRoots(200).forEach((sr) => {
          const s = sr.querySelector("#" + STYLE_ID);
          if (!s || s.textContent !== cur) {
            try {
              styleFor(sr).textContent = cur;
            } catch (e) {
            }
          }
        });
      });
      try {
        shadowObserver.observe(document.documentElement, { childList: true, subtree: true });
      } catch (e) {
      }
    }
  }

  // src/content/elementRemover/spaObserver.js
  function initSpaObserver(applyRules2) {
    let lastUrl = location.href;
    chrome.runtime.onMessage.addListener(function(message) {
      if (message.action === "reapplyRules") {
        lastUrl = location.href;
        applyRules2();
      }
    });
    const observer = new MutationObserver(function() {
      if (!document.getElementById("rhe-persistence-style")) applyRules2();
    });
    observer.observe(document.head || document.documentElement, { childList: true });
    function onNav() {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        applyRules2();
      }
    }
    window.addEventListener("popstate", onNav);
    setInterval(onNav, 1e3);
  }

  // src/content/elementRemover/rules.js
  function applyRules() {
    chrome.storage.local.get("rhe_rules", function(data) {
      if (chrome.runtime.lastError) return;
      const selectors = extractSelectors(
        data.rhe_rules || {},
        window.location.hostname,
        window.location.pathname
      );
      injectSelectors(selectors);
    });
  }
  applyRules();
  initSpaObserver(applyRules);
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === "local" && changes.rhe_rules) applyRules();
  });
})();
//# sourceMappingURL=rules.bundle.js.map
