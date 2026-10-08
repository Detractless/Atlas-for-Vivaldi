import { getSelector } from './selectorEngine.js';
import { elementState } from './elementState.js';

export function renderRules() {
  // UI rendering moved to sidepanel.js
}

export function toggleRemember(selector, isRemember, isSpecific, isBroad) {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  chrome.storage.local.get("rhe_rules", function (data) {
    let rulesMap = data.rhe_rules || {};
    let rules = rulesMap[hostname] || [];
    rules = rules.filter(r => r && (typeof r === 'string' ? r : r.selector) !== selector);
    if (isRemember) rules.push({ selector: selector, specific: isSpecific, broad: isBroad, path: pathname });
    rulesMap[hostname] = rules;
    chrome.storage.local.set({ "rhe_rules": rulesMap }, function () { renderRules(); });
  });
}

export function toggleSpecific(selector, isSpecific, isRemember, isBroad) {
  // specific toggling is now handled by sidepanel.js modifying storage directly
}

export function toggleBroad(oldSelector, isBroad, isRemember, isSpecific) {
  const wasBroad = !isBroad;
  const archiveItem = elementState.archive.find(item => {
    if (item.manualSelector === oldSelector) return true;
    return getSelector(item.element, wasBroad) === oldSelector;
  });

  let newSelector = null;
  if (archiveItem) {
    newSelector = getSelector(archiveItem.element, isBroad);
    archiveItem.broad = isBroad;
    archiveItem.manualSelector = null;
  } else {
    const el = document.querySelector(oldSelector);
    if (el) { newSelector = getSelector(el, isBroad); }
    else { console.warn("Element Remover: Could not find original element for Broad toggle."); return; }
  }

  if (!newSelector) return;
  updateRuleSelector(oldSelector, newSelector, isRemember, isSpecific, isBroad);
}

export function updateRuleSelector(oldSelector, newSelector, isRemember, isSpecific, isBroad) {
  if (!newSelector || newSelector === oldSelector) return;
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  const archiveItem = elementState.archive.find(item => {
    if (item.manualSelector === oldSelector) return true;
    return getSelector(item.element, item.broad) === oldSelector;
  });
  if (archiveItem) archiveItem.manualSelector = newSelector;

  chrome.storage.local.get("rhe_rules", function (data) {
    let rulesMap = data.rhe_rules || {};
    let rules = rulesMap[hostname] || [];
    rules = rules.filter(r => r && (typeof r === 'string' ? r : r.selector) !== oldSelector);
    rules.push({ selector: newSelector, specific: isSpecific, broad: isBroad, path: pathname });
    rulesMap[hostname] = rules;
    chrome.storage.local.set({ "rhe_rules": rulesMap }, function () {
      renderRules();
      updatePageStyles();
      try { const all = document.querySelectorAll(newSelector); all.forEach(el => el.style.display = "none"); } catch (e) {}
    });
  });
}

export function deleteRule(selector) {
  const hostname = window.location.hostname;
  chrome.storage.local.get("rhe_rules", function (data) {
    let rulesMap = data.rhe_rules || {};
    if (rulesMap[hostname]) {
      rulesMap[hostname] = rulesMap[hostname].filter(r => r && (typeof r === 'string' ? r : r.selector) !== selector);
      chrome.storage.local.set({ "rhe_rules": rulesMap }, function () {
        updatePageStyles();
        const archiveIndex = elementState.archive.findIndex(item => {
          return (item.manualSelector === selector) || (getSelector(item.element, item.broad) === selector);
        });
        if (archiveIndex > -1) {
          const target = elementState.archive[archiveIndex];
          target.element.style.display = target.display;
          elementState.archive.splice(archiveIndex, 1);
        }
      });
    }
  });
}

export function updatePageStyles() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  chrome.storage.local.get("rhe_rules", function (data) {
    const rules = data.rhe_rules || {};
    const hostRules = rules[hostname] || [];
    const selectors = [];
    hostRules.forEach(r => {
      if (!r) return;
      if (typeof r === 'string') selectors.push(r);
      else if (r.selector) {
        if (r.specific) { if (r.path === pathname) selectors.push(r.selector); }
        else selectors.push(r.selector);
      }
    });
    let style = document.getElementById("rhe-persistence-style");
    if (!style) { style = document.createElement("style"); style.id = "rhe-persistence-style"; (document.head || document.documentElement).appendChild(style); }
    style.textContent = selectors.length > 0 ? selectors.join(", ") + " { display: none !important; }" : "";
  });
}

export function saveRule(element) {
  const isBroad = false;
  const selector = getSelector(element, isBroad);
  if (!selector) return;
  chrome.storage.local.get('rhe_remember', function (res) {
    const isRemember = res.rhe_remember !== false; // default true
    if (isRemember) { 
      toggleRemember(selector, true, false, isBroad); 
    }
  });
}