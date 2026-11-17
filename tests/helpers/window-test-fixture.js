const test = require("node:test");
const { openWindow } = require("../unit/helpers/windowDom");

const open = new Set();

test.afterEach(() => {
  for (const window of open) window.window.close();
  open.clear();
});

function plain(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

async function startWindow(options) {
  const window = await openWindow(options);
  open.add(window);
  return window;
}

module.exports = { plain, startWindow };
