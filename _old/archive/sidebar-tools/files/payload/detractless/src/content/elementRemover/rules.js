import { extractSelectors } from './ruleLoader.js';
import { injectSelectors } from './styleInjector.js';
import { initSpaObserver } from './spaObserver.js';

function applyRules() {
  chrome.storage.local.get("rhe_rules", function (data) {
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

/* Re-apply the moment the rule set changes — the picker saving a new rule, or a
   rule deleted from the sidebar. This is what makes a just-picked element stick
   WITHOUT a reload: the picker persists the rule, this fires in every frame/tab
   on the same host, and the display:none stylesheet is rebuilt live. */
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.rhe_rules) applyRules();
});
