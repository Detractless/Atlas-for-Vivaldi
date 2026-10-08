import { background } from './messaging.js';
import { buildUI, removeUI, applyTheme } from './ui.js';
import { handleMouseover, handleKeydown, handleClick } from './eventHandlers.js';
import { elementState } from './elementState.js';
import { toggleBroad } from './rulesManager.js';

function onState(e) {
  if (e && e.state === "ON") {
    buildUI();
    window.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("mouseover", handleMouseover, false);
    chrome.storage.onChanged.addListener(applyTheme);
    if (elementState.current) elementState.current.setAttribute("rhe-css-active", '');
    if (document.documentElement) document.documentElement.setAttribute("rhe-css-cursor", '');
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
  if (data && data.oldSelector !== undefined) {
    // we assume isRemember is true because the rule is already in the saved list
    toggleBroad(data.oldSelector, data.isBroad, true, data.isSpecific);
  }
}
background.receive("toggleBroad", onToggleBroad);