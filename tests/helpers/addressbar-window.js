const test = require("node:test");
const { openWindow } = require("../unit/helpers/windowDom");

const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
const ENGINES = { google: { name: "Google", url: "https://www.google.com/search?q=", icon: "src/assets/svg/google.com.svg" } };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const open = new Set();

test.afterEach(() => {
  for (const window of open) window.window.close();
  open.clear();
});

async function startAddressbarWindow(value, markup) {
  const window = await openWindow({ sync: { customSearchEngines: ENGINES, defaultEngineKey: "google" } });
  open.add(window);
  window.window.document.getElementById("browser").insertAdjacentHTML("beforeend", markup);
  window.input = window.window.document.querySelector(".UrlBar-AddressField input.url");
  window.input.value = value;
  for (const listener of window.listeners["chrome.tabs.onActivated"] || []) listener({ tabId: 1 });
  await wait(80);
  return window;
}

module.exports = { NEWTAB, startAddressbarWindow, wait };
