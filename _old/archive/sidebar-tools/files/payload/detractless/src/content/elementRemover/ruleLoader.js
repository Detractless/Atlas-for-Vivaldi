/* A selector so broad it would hide a large part of any page — a bare common tag
   or the universal selector. These are never a legitimate "hide these" rule and
   have wrecked pages (a stray broad "div" on YouTube hid the whole results page),
   so the persistence engine refuses to apply them even if one is stored. */
const DANGEROUS = /^\s*(\*|html|body|head|div|span|a|p|ul|ol|li|section|article|main|header|footer|nav|aside|img|button|input|form|label|table|thead|tbody|tr|td|th)\s*$/i;

export function extractSelectors(rules, hostname, pathname) {
  const selectors = [];
  const hostRules = rules[hostname] || [];
  if (!Array.isArray(hostRules)) return selectors;
  hostRules.forEach(rule => {
    if (!rule) return;
    let sel = null;
    if (typeof rule === 'string') sel = rule;
    else if (rule.selector) {
      if (rule.specific) { if (rule.path === pathname) sel = rule.selector; }
      else sel = rule.selector;
    }
    if (sel && !DANGEROUS.test(sel)) selectors.push(sel);
  });
  return selectors;
}
