/* Harper - Offline Grammar & Spell Checker
   In-page Grammar & Spell Checking Content Script */

(function () {
  'use strict';

  if (window.__harperContentScriptLoaded) return;
  window.__harperContentScriptLoaded = true;

  // ── Local Fallback Typo Map ────────────────────────────────────────────────
  const LOCAL_TYPOS = {
    'teh': ['the'],
    'definately': ['definitely'],
    'recieve': ['receive'],
    'seperate': ['separate'],
    'adress': ['address'],
    'wierd': ['weird'],
    'occured': ['occurred'],
    'untill': ['until'],
    'succesful': ['successful'],
    'neccessary': ['necessary'],
    'alot': ['a lot'],
    'beleive': ['believe'],
    'truely': ['truly'],
    'tommorrow': ['tomorrow']
  };

  // State
  let activeElement = null;
  let activeIssues = [];
  let checkDebounceTimer = null;
  let currentTooltip = null;
  let floatingBadge = null;

  // ── Element Qualification ──────────────────────────────────────────────────
  function isEditableElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'url', 'email', 'tel'].includes(type);
    }
    return false;
  }

  function getElementText(el) {
    if (!el) return '';
    if (el.isContentEditable) {
      return el.innerText || el.textContent || '';
    }
    return el.value || '';
  }

  function setElementText(el, newText) {
    if (!el) return;
    if (el.isContentEditable) {
      el.innerText = newText;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.value = newText;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ── Local Fallback Grammar & Spelling Check ────────────────────────────────
  function localCheck(text) {
    const issues = [];
    if (!text) return issues;

    // 1. Repeated words
    const repeatRegex = /\b([a-zA-Z]{2,})\s+\1\b/gi;
    let match;
    while ((match = repeatRegex.exec(text)) !== null) {
      issues.push({
        id: 'rep_' + match.index,
        type: 'grammar',
        start: match.index,
        end: match.index + match[0].length,
        matchedText: match[0],
        message: `Repeated word: '${match[0]}'`,
        suggestions: [match[1]]
      });
    }

    // 2. Capitalization after terminal punctuation
    const capRegex = /(?:^|[.!?]\s+)([a-z])/g;
    while ((match = capRegex.exec(text)) !== null) {
      const charIndex = match.index + match[0].length - 1;
      issues.push({
        id: 'cap_' + charIndex,
        type: 'grammar',
        start: charIndex,
        end: charIndex + 1,
        matchedText: match[1],
        message: 'Sentence should begin with a capital letter.',
        suggestions: [match[1].toUpperCase()]
      });
    }

    // 3. Local Typos
    const wordRegex = /\b([a-zA-Z]{2,})\b/g;
    while ((match = wordRegex.exec(text)) !== null) {
      const raw = match[1];
      const lower = raw.toLowerCase();
      if (LOCAL_TYPOS[lower]) {
        issues.push({
          id: 'sp_' + match.index,
          type: 'spelling',
          start: match.index,
          end: match.index + raw.length,
          matchedText: raw,
          message: `Possible spelling mistake: '${raw}'`,
          suggestions: LOCAL_TYPOS[lower]
        });
      }
    }

    return issues.sort((a, b) => a.start - b.start);
  }

  // ── Analysis Pipeline ──────────────────────────────────────────────────────
  function runTextCheck(el) {
    if (!el || !isEditableElement(el)) return;
    const text = getElementText(el);

    if (!text.trim()) {
      activeIssues = [];
      updateFieldUI(el);
      return;
    }

    // Try communicating with service worker; fallback to local rules
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'CHECK_TEXT', text: text }, (response) => {
          if (chrome.runtime.lastError || !response || !response.issues) {
            activeIssues = localCheck(text);
          } else {
            activeIssues = response.issues || [];
          }
          updateFieldUI(el);
        });
        return;
      } catch (e) {
        // Fallback below
      }
    }

    activeIssues = localCheck(text);
    updateFieldUI(el);
  }

  function scheduleCheck(el) {
    clearTimeout(checkDebounceTimer);
    checkDebounceTimer = setTimeout(() => {
      runTextCheck(el);
    }, 300);
  }

  // ── UI Badging & Underline Annotations ──────────────────────────────────────
  function updateFieldUI(el) {
    if (!el || el !== activeElement) {
      removeBadge();
      return;
    }

    if (activeIssues.length === 0) {
      removeBadge();
      try { delete el.dataset.harperIssues; } catch (e) {}
      return;
    }

    // Expose active issues on element dataset for seamless Atlas custom context menu integration
    try {
      el.dataset.harperIssues = JSON.stringify(activeIssues.map((i) => ({
        start: i.start,
        end: i.end,
        matchedText: i.matchedText,
        suggestions: i.suggestions || []
      })));
    } catch (e) {}

    // Floating pill badge removed per user preference - autocorrection & suggestions flow through context menu
    removeBadge();
  }

  function removeBadge() {
    if (floatingBadge) {
      floatingBadge.remove();
      floatingBadge = null;
    }
  }

  function showBadge(el, issueCount) {
    // Floating badge removed per user preference - autocorrection & suggestions flow through context menu
  }

  // ── Interactive Suggestion Tooltip ─────────────────────────────────────────
  function closeTooltip() {
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  }

  function showTooltipForIssue(el, issue) {
    closeTooltip();
    if (!issue) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'harper-tooltip';

    // Prevent context menu from bubbling up to page or Atlas context menu
    tooltip.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    // 1. Header
    const header = document.createElement('div');
    header.className = 'harper-tooltip-header';

    const badge = document.createElement('span');
    badge.className = `harper-tooltip-badge ${issue.type === 'grammar' ? 'harper-badge-grammar' : 'harper-badge-spelling'}`;
    badge.textContent = issue.type === 'grammar' ? 'Harper Grammar' : 'Harper Spelling';
    header.appendChild(badge);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'harper-tooltip-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Dismiss';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTooltip();
    });
    header.appendChild(closeBtn);
    tooltip.appendChild(header);

    // 2. Message
    const msg = document.createElement('div');
    msg.className = 'harper-tooltip-message';
    msg.textContent = issue.message || `Correction for '${issue.matchedText}'`;
    tooltip.appendChild(msg);

    // 3. Suggestions
    if (issue.suggestions && issue.suggestions.length > 0) {
      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'harper-chips-container';

      issue.suggestions.forEach((sugg) => {
        const chip = document.createElement('button');
        chip.className = 'harper-chip';
        chip.textContent = sugg;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          applySuggestion(el, issue, sugg);
          closeTooltip();
        });
        chipsContainer.appendChild(chip);
      });

      tooltip.appendChild(chipsContainer);
    }

    // 4. Actions: Ignore
    const actions = document.createElement('div');
    actions.className = 'harper-tooltip-actions';

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'harper-action-btn';
    ignoreBtn.textContent = 'Ignore';
    ignoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeIssues = activeIssues.filter(i => i.id !== issue.id);
      closeTooltip();
      updateFieldUI(el);
    });
    actions.appendChild(ignoreBtn);

    if (issue.type === 'spelling') {
      const addDictBtn = document.createElement('button');
      addDictBtn.className = 'harper-action-btn';
      addDictBtn.textContent = 'Add to dictionary';
      addDictBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'ADD_TO_DICTIONARY', word: issue.matchedText });
        }
        activeIssues = activeIssues.filter(i => i.matchedText !== issue.matchedText);
        closeTooltip();
        updateFieldUI(el);
      });
      actions.appendChild(addDictBtn);
    }

    tooltip.appendChild(actions);

    // Position tooltip near the element or caret
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;

    const rect = el.getBoundingClientRect();
    let top = window.scrollY + rect.bottom + 6;
    let left = window.scrollX + rect.left + 10;

    // Viewport bounds checking
    const tooltipRect = tooltip.getBoundingClientRect();
    if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
      top = Math.max(window.scrollY + 6, window.scrollY + rect.top - tooltipRect.height - 6);
    }
    if (left + tooltipRect.width > window.scrollX + window.innerWidth) {
      left = Math.max(window.scrollX + 6, window.scrollX + window.innerWidth - tooltipRect.width - 12);
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function applySuggestion(el, issue, replacement) {
    el.focus();
    if (el.isContentEditable) {
      const text = getElementText(el);
      const before = text.slice(0, issue.start);
      const after = text.slice(issue.end);
      setElementText(el, before + replacement + after);
    } else if (el.setRangeText) {
      el.setRangeText(replacement, issue.start, issue.end, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const text = el.value || '';
      const before = text.slice(0, issue.start);
      const after = text.slice(issue.end);
      el.value = before + replacement + after;
      el.selectionStart = el.selectionEnd = issue.start + replacement.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    scheduleCheck(el);
  }

  // ── Event Listeners ────────────────────────────────────────────────────────
  document.addEventListener('focusin', (e) => {
    if (isEditableElement(e.target)) {
      activeElement = e.target;
      runTextCheck(activeElement);
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    if (e.target === activeElement) {
      removeBadge();
    }
  }, true);

  document.addEventListener('input', (e) => {
    if (isEditableElement(e.target)) {
      activeElement = e.target;
      scheduleCheck(activeElement);
    }
  }, true);

  document.addEventListener('click', (e) => {
    // If click is outside current tooltip, close it
    if (currentTooltip && !currentTooltip.contains(e.target)) {
      closeTooltip();
    }

    // If click is inside an active editable field, see if an error was clicked
    if (isEditableElement(e.target) && activeIssues.length > 0) {
      const el = e.target;
      const caret = el.selectionStart;
      if (caret !== undefined) {
        const clickedIssue = activeIssues.find(i => caret >= i.start && caret <= i.end);
        if (clickedIssue) {
          showTooltipForIssue(el, clickedIssue);
        }
      }
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentTooltip) {
      closeTooltip();
      e.stopPropagation();
    }
  }, true);

  window.addEventListener('resize', () => {
    closeTooltip();
    removeBadge();
  });

  window.addEventListener('scroll', () => {
    if (currentTooltip) closeTooltip();
  }, true);

})();
