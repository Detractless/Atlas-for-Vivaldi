(() => {
  // src/content/elementRemover/messaging.js
  var background = (function() {
    let tmp = {};
    chrome.runtime.onMessage.addListener(function(request) {
      for (let id in tmp) {
        if (tmp[id] && typeof tmp[id] === "function") {
          if (request.path === "background-to-page") {
            if (request.method === id) tmp[id](request.data);
          }
        }
      }
    });
    return {
      receive: function(id, callback) {
        tmp[id] = callback;
      },
      send: function(id, data) {
        chrome.runtime.sendMessage({ method: id, data, path: "page-to-background" }, function() {
          return chrome.runtime.lastError;
        });
      }
    };
  })();

  // src/content/elementRemover/ui.js
  var UI_ID = "rhe-ui-container";
  function buildUI() {
    if (document.getElementById(UI_ID)) return;
    const chip = document.createElement("div");
    chip.id = UI_ID;
    chip.textContent = "Space removes \xB7 Q parent \xB7 W child \xB7 Esc stops";
    (document.body || document.documentElement).appendChild(chip);
  }
  function removeUI() {
    const chip = document.getElementById(UI_ID);
    if (chip) chip.remove();
  }
  function applyTheme() {
  }

  // src/content/elementRemover/elementState.js
  var elementState = {
    archive: [],
    current: null,
    previous: null
  };

  // node_modules/@medv/finder/finder.js
  var acceptedAttrNames = /* @__PURE__ */ new Set(["role", "name", "aria-label", "rel", "href"]);
  function attr(name, value) {
    let nameIsOk = acceptedAttrNames.has(name);
    nameIsOk ||= name.startsWith("data-") && wordLike(name);
    let valueIsOk = wordLike(value) && value.length < 100;
    valueIsOk ||= value.startsWith("#") && wordLike(value.slice(1));
    return nameIsOk && valueIsOk;
  }
  function idName(name) {
    return wordLike(name);
  }
  function className(name) {
    return wordLike(name);
  }
  function tagName(name) {
    return true;
  }
  function finder(input, options) {
    if (input.nodeType !== Node.ELEMENT_NODE) {
      throw new Error(`Can't generate CSS selector for non-element node type.`);
    }
    if (input.tagName.toLowerCase() === "html") {
      return "html";
    }
    const defaults = {
      root: document.body,
      idName,
      className,
      tagName,
      attr,
      timeoutMs: 1e3,
      seedMinLength: 3,
      optimizedMinLength: 2,
      maxNumberOfPathChecks: Infinity
    };
    const startTime = /* @__PURE__ */ new Date();
    const config = { ...defaults, ...options };
    const rootDocument = findRootDocument(config.root, defaults);
    let foundPath;
    let count = 0;
    for (const candidate of search(input, config, rootDocument)) {
      const elapsedTimeMs = (/* @__PURE__ */ new Date()).getTime() - startTime.getTime();
      if (elapsedTimeMs > config.timeoutMs || count >= config.maxNumberOfPathChecks) {
        const fPath = fallback(input, rootDocument);
        if (!fPath) {
          throw new Error(`Timeout: Can't find a unique selector after ${config.timeoutMs}ms`);
        }
        return selector(fPath);
      }
      count++;
      if (unique(candidate, rootDocument)) {
        foundPath = candidate;
        break;
      }
    }
    if (!foundPath) {
      throw new Error(`Selector was not found.`);
    }
    const optimized = [
      ...optimize(foundPath, input, config, rootDocument, startTime)
    ];
    optimized.sort(byPenalty);
    if (optimized.length > 0) {
      return selector(optimized[0]);
    }
    return selector(foundPath);
  }
  function* search(input, config, rootDocument) {
    const stack = [];
    let paths = [];
    let current = input;
    let i = 0;
    while (current && current !== rootDocument) {
      const level = tie(current, config);
      for (const node of level) {
        node.level = i;
      }
      stack.push(level);
      current = current.parentElement;
      i++;
      paths.push(...combinations(stack));
      if (i >= config.seedMinLength) {
        paths.sort(byPenalty);
        for (const candidate of paths) {
          yield candidate;
        }
        paths = [];
      }
    }
    paths.sort(byPenalty);
    for (const candidate of paths) {
      yield candidate;
    }
  }
  function wordLike(name) {
    if (/^[a-z\-]{3,}$/i.test(name)) {
      const words = name.split(/-|[A-Z]/);
      for (const word of words) {
        if (word.length <= 2) {
          return false;
        }
        if (/[^aeiou]{4,}/i.test(word)) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  function tie(element, config) {
    const level = [];
    const elementId = element.getAttribute("id");
    if (elementId && config.idName(elementId)) {
      level.push({
        name: "#" + CSS.escape(elementId),
        penalty: 0
      });
    }
    for (let i = 0; i < element.classList.length; i++) {
      const name = element.classList[i];
      if (config.className(name)) {
        level.push({
          name: "." + CSS.escape(name),
          penalty: 1
        });
      }
    }
    for (let i = 0; i < element.attributes.length; i++) {
      const attr2 = element.attributes[i];
      if (config.attr(attr2.name, attr2.value)) {
        level.push({
          name: `[${CSS.escape(attr2.name)}="${CSS.escape(attr2.value)}"]`,
          penalty: 2
        });
      }
    }
    const tagName2 = element.tagName.toLowerCase();
    if (config.tagName(tagName2)) {
      level.push({
        name: tagName2,
        penalty: 5
      });
      const index = indexOf(element, tagName2);
      if (index !== void 0) {
        level.push({
          name: nthOfType(tagName2, index),
          penalty: 10
        });
      }
    }
    const nth = indexOf(element);
    if (nth !== void 0) {
      level.push({
        name: nthChild(tagName2, nth),
        penalty: 50
      });
    }
    return level;
  }
  function selector(path) {
    let node = path[0];
    let query = node.name;
    for (let i = 1; i < path.length; i++) {
      const level = path[i].level || 0;
      if (node.level === level - 1) {
        query = `${path[i].name} > ${query}`;
      } else {
        query = `${path[i].name} ${query}`;
      }
      node = path[i];
    }
    return query;
  }
  function penalty(path) {
    return path.map((node) => node.penalty).reduce((acc, i) => acc + i, 0);
  }
  function byPenalty(a, b) {
    return penalty(a) - penalty(b);
  }
  function indexOf(input, tagName2) {
    const parent = input.parentNode;
    if (!parent) {
      return void 0;
    }
    let child = parent.firstChild;
    if (!child) {
      return void 0;
    }
    let i = 0;
    while (child) {
      if (child.nodeType === Node.ELEMENT_NODE && (tagName2 === void 0 || child.tagName.toLowerCase() === tagName2)) {
        i++;
      }
      if (child === input) {
        break;
      }
      child = child.nextSibling;
    }
    return i;
  }
  function fallback(input, rootDocument) {
    let i = 0;
    let current = input;
    const path = [];
    while (current && current !== rootDocument) {
      const tagName2 = current.tagName.toLowerCase();
      const index = indexOf(current, tagName2);
      if (index === void 0) {
        return;
      }
      path.push({
        name: nthOfType(tagName2, index),
        penalty: NaN,
        level: i
      });
      current = current.parentElement;
      i++;
    }
    if (unique(path, rootDocument)) {
      return path;
    }
  }
  function nthChild(tagName2, index) {
    if (tagName2 === "html") {
      return "html";
    }
    return `${tagName2}:nth-child(${index})`;
  }
  function nthOfType(tagName2, index) {
    if (tagName2 === "html") {
      return "html";
    }
    return `${tagName2}:nth-of-type(${index})`;
  }
  function* combinations(stack, path = []) {
    if (stack.length > 0) {
      for (let node of stack[0]) {
        yield* combinations(stack.slice(1, stack.length), path.concat(node));
      }
    } else {
      yield path;
    }
  }
  function findRootDocument(rootNode, defaults) {
    if (rootNode.nodeType === Node.DOCUMENT_NODE) {
      return rootNode;
    }
    if (rootNode === defaults.root) {
      return rootNode.ownerDocument;
    }
    return rootNode;
  }
  function unique(path, rootDocument) {
    const css = selector(path);
    switch (rootDocument.querySelectorAll(css).length) {
      case 0:
        throw new Error(`Can't select any node with this selector: ${css}`);
      case 1:
        return true;
      default:
        return false;
    }
  }
  function* optimize(path, input, config, rootDocument, startTime) {
    if (path.length > 2 && path.length > config.optimizedMinLength) {
      for (let i = 1; i < path.length - 1; i++) {
        const elapsedTimeMs = (/* @__PURE__ */ new Date()).getTime() - startTime.getTime();
        if (elapsedTimeMs > config.timeoutMs) {
          return;
        }
        const newPath = [...path];
        newPath.splice(i, 1);
        if (unique(newPath, rootDocument) && rootDocument.querySelector(selector(newPath)) === input) {
          yield newPath;
          yield* optimize(newPath, input, config, rootDocument, startTime);
        }
      }
    }
  }

  // src/content/elementRemover/selectorEngine.js
  var STABLE_ATTR = /^(data-testid|data-test|data-qa|data-cy|data-id|aria-label|role|name|title|alt|type)$/i;
  function getSelector(el, isBroad) {
    if (!el || el.nodeType !== 1) return "";
    if (isBroad) {
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList).filter((c) => c !== "rhe-css-active" && className(c));
      if (classes.length) return tag + "." + classes.join(".");
    }
    try {
      return finder(el, {
        className: (name) => name !== "rhe-css-active" && className(name),
        attr: (name, value) => STABLE_ATTR.test(name) || attr(name, value)
      });
    } catch (e) {
      return structuralPath(el);
    }
  }
  function structuralPath(el) {
    if (el.id) return "#" + el.id;
    const path = [];
    let parent = el;
    while (parent && parent.nodeType === 1) {
      let selector2 = parent.tagName.toLowerCase();
      if (parent.id) {
        path.unshift("#" + parent.id);
        break;
      }
      const classes = Array.from(parent.classList).filter((c) => c !== "rhe-css-active" && className(c)).join(".");
      if (classes) selector2 += "." + classes;
      let sibling = parent, nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName.toLowerCase() === parent.tagName.toLowerCase()) nth++;
      }
      if (nth > 1) selector2 += ":nth-of-type(" + nth + ")";
      path.unshift(selector2);
      parent = parent.parentNode;
    }
    return path.join(" > ");
  }

  // src/content/elementRemover/rulesManager.js
  function renderRules() {
  }
  function toggleRemember(selector2, isRemember, isSpecific, isBroad) {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    chrome.storage.local.get("rhe_rules", function(data) {
      let rulesMap = data.rhe_rules || {};
      let rules = rulesMap[hostname] || [];
      rules = rules.filter((r) => r && (typeof r === "string" ? r : r.selector) !== selector2);
      if (isRemember) rules.push({ selector: selector2, specific: isSpecific, broad: isBroad, path: pathname });
      rulesMap[hostname] = rules;
      chrome.storage.local.set({ "rhe_rules": rulesMap }, function() {
        renderRules();
      });
    });
  }
  function toggleBroad(oldSelector, isBroad, isRemember, isSpecific) {
    const wasBroad = !isBroad;
    const archiveItem = elementState.archive.find((item) => {
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
      if (el) {
        newSelector = getSelector(el, isBroad);
      } else {
        console.warn("Element Remover: Could not find original element for Broad toggle.");
        return;
      }
    }
    if (!newSelector) return;
    updateRuleSelector(oldSelector, newSelector, isRemember, isSpecific, isBroad);
  }
  function updateRuleSelector(oldSelector, newSelector, isRemember, isSpecific, isBroad) {
    if (!newSelector || newSelector === oldSelector) return;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const archiveItem = elementState.archive.find((item) => {
      if (item.manualSelector === oldSelector) return true;
      return getSelector(item.element, item.broad) === oldSelector;
    });
    if (archiveItem) archiveItem.manualSelector = newSelector;
    chrome.storage.local.get("rhe_rules", function(data) {
      let rulesMap = data.rhe_rules || {};
      let rules = rulesMap[hostname] || [];
      rules = rules.filter((r) => r && (typeof r === "string" ? r : r.selector) !== oldSelector);
      rules.push({ selector: newSelector, specific: isSpecific, broad: isBroad, path: pathname });
      rulesMap[hostname] = rules;
      chrome.storage.local.set({ "rhe_rules": rulesMap }, function() {
        renderRules();
        updatePageStyles();
        try {
          const all = document.querySelectorAll(newSelector);
          all.forEach((el) => el.style.display = "none");
        } catch (e) {
        }
      });
    });
  }
  function deleteRule(selector2) {
    const hostname = window.location.hostname;
    chrome.storage.local.get("rhe_rules", function(data) {
      let rulesMap = data.rhe_rules || {};
      if (rulesMap[hostname]) {
        rulesMap[hostname] = rulesMap[hostname].filter((r) => r && (typeof r === "string" ? r : r.selector) !== selector2);
        chrome.storage.local.set({ "rhe_rules": rulesMap }, function() {
          updatePageStyles();
          const archiveIndex = elementState.archive.findIndex((item) => {
            return item.manualSelector === selector2 || getSelector(item.element, item.broad) === selector2;
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
  function updatePageStyles() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    chrome.storage.local.get("rhe_rules", function(data) {
      const rules = data.rhe_rules || {};
      const hostRules = rules[hostname] || [];
      const selectors = [];
      hostRules.forEach((r) => {
        if (!r) return;
        if (typeof r === "string") selectors.push(r);
        else if (r.selector) {
          if (r.specific) {
            if (r.path === pathname) selectors.push(r.selector);
          } else selectors.push(r.selector);
        }
      });
      let style = document.getElementById("rhe-persistence-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "rhe-persistence-style";
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = selectors.length > 0 ? selectors.join(", ") + " { display: none !important; }" : "";
    });
  }
  function saveRule(element) {
    const isBroad = false;
    const selector2 = getSelector(element, isBroad);
    if (!selector2) return;
    chrome.storage.local.get("rhe_remember", function(res) {
      const isRemember = res.rhe_remember !== false;
      if (isRemember) {
        toggleRemember(selector2, true, false, isBroad);
      }
    });
  }

  // src/content/elementRemover/eventHandlers.js
  function removeTarget(el) {
    if (!el) return;
    const display = window.getComputedStyle(el).display;
    chrome.storage.local.get("rhe_remember", function(res) {
      const remember = res.rhe_remember !== false;
      elementState.archive.push({ element: el, display, broad: false });
      if (remember) saveRule(el);
      else el.style.display = "none";
    });
  }
  function handleMouseover(e) {
    if (e.target.closest && e.target.closest("#" + UI_ID)) return;
    elementState.current = e.target;
    if (elementState.current) {
      if (elementState.current !== elementState.previous) {
        if (elementState.previous) elementState.previous.removeAttribute("rhe-css-active");
        elementState.current.setAttribute("rhe-css-active", "");
        elementState.previous = elementState.current;
      }
    }
  }
  function handleKeydown(e) {
    const key = e.which || e.keyCode;
    const isModifier = e.ctrlKey || e.metaKey;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (key === 27) {
      e.preventDefault();
      background.send("store", { "state": "OFF" });
      return;
    }
    if (isModifier && key === 90) {
      const target = elementState.archive.pop();
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        target.element.style.display = target.display;
        const sel = getSelector(target.element, target.broad);
        if (sel) deleteRule(sel);
      }
      return;
    }
    if (!elementState.current) return;
    if (key === 81 && !isModifier) {
      e.preventDefault();
      if (elementState.current.parentNode && elementState.current.parentNode.nodeType === 1) {
        const parent = elementState.current.parentNode;
        if (parent !== document.body && parent !== document.documentElement) {
          elementState.current.removeAttribute("rhe-css-active");
          elementState.current = parent;
          elementState.current.setAttribute("rhe-css-active", "");
          elementState.previous = elementState.current;
        }
      }
    }
    if (key === 87 && !isModifier) {
      e.preventDefault();
      if (elementState.current.firstElementChild) {
        elementState.current.removeAttribute("rhe-css-active");
        elementState.current = elementState.current.firstElementChild;
        elementState.current.setAttribute("rhe-css-active", "");
        elementState.previous = elementState.current;
      }
    }
    if (key === 32 && !isModifier) {
      e.preventDefault();
      e.stopPropagation();
      const el = elementState.current;
      if (el.closest && el.closest("#" + UI_ID)) return;
      removeTarget(el);
      elementState.current.removeAttribute("rhe-css-active");
      elementState.current = null;
      elementState.previous = null;
    }
  }
  function handleClick(e) {
    if (e && e.target) {
      if (e.target.closest && e.target.closest("#" + UI_ID)) return;
      if (e.target === elementState.current) {
        e.preventDefault();
        e.stopPropagation();
        removeTarget(e.target);
      }
    }
  }

  // src/content/elementRemover/inject.js
  function onState(e) {
    if (e && e.state === "ON") {
      buildUI();
      window.addEventListener("click", handleClick, true);
      document.addEventListener("keydown", handleKeydown, true);
      document.addEventListener("mouseover", handleMouseover, false);
      chrome.storage.onChanged.addListener(applyTheme);
      if (elementState.current) elementState.current.setAttribute("rhe-css-active", "");
      if (document.documentElement) document.documentElement.setAttribute("rhe-css-cursor", "");
    } else {
      removeUI();
      window.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeydown, true);
      document.removeEventListener("mouseover", handleMouseover, false);
      chrome.storage.onChanged.removeListener(applyTheme);
      if (elementState.current) elementState.current.removeAttribute("rhe-css-active");
      if (elementState.previous) elementState.previous.removeAttribute("rhe-css-active");
      if (document.documentElement) document.documentElement.removeAttribute("rhe-css-cursor");
    }
  }
  background.send("state");
  background.receive("state", onState);
  function onToggleBroad(data) {
    if (data && data.oldSelector !== void 0) {
      toggleBroad(data.oldSelector, data.isBroad, true, data.isSpecific);
    }
  }
  background.receive("toggleBroad", onToggleBroad);
})();
//# sourceMappingURL=inject.bundle.js.map
