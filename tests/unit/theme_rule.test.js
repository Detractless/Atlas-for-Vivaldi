// One rule decides light or dark from the Theme setting:
//   "system" follows the OS, a missing theme means "dark", "custom" draws on dark.
// Four places apply it, in four different pages, and cannot share code (two are
// plain scripts in other documents). This runs each copy over every case so
// they cannot drift apart.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const acorn = require("acorn");
const walk = require("acorn-walk");

const ROOT = path.resolve(__dirname, "..", "..");

/** The source of function `name` in `file`, as a standalone declaration. */
function fnSource(file, name) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  let ast;
  for (const sourceType of ["module", "script"]) {
    try { ast = acorn.parse(text, { ecmaVersion: "latest", sourceType }); break; } catch (e) { /* next */ }
  }
  let found = null;
  walk.simple(ast, { FunctionDeclaration(n) { if (n.id && n.id.name === name) found = n; } });
  assert.ok(found, `${name} in ${file}`);
  return text.slice(found.start, found.end);
}

function load(file, name, osDark) {
  const ctx = { window: { matchMedia: () => ({ matches: osDark }) } };
  vm.createContext(ctx);
  vm.runInContext(fnSource(file, name), ctx);
  return ctx[name];
}

const CASES = [undefined, "dark", "light", "system", "custom"];
const mode = (theme, osDark) => (theme === "system" ? (osDark ? "dark" : "light") : theme || "dark");

for (const osDark of [true, false]) {
  test(`every copy of the theme rule agrees (OS ${osDark ? "dark" : "light"})`, () => {
    const newTab = load("payload/detractless/src/utils/themeResolver.js", "resolveActiveTheme", osDark);
    const preinit = load("payload/detractless/src/pages/shared/themePreinit.js", "resolveTheme", osDark);
    const pageMenu = load("payload/install-files/components/atlas/atlas-ctxmenu.js", "resolveThemeDark", osDark);
    const windowSync = load("src/modules/11-theme-sync.js", "resolveDark", osDark);
    for (const theme of CASES) {
      const cfg = theme === undefined ? {} : { Theme: theme };
      const want = mode(theme, osDark);
      assert.equal(newTab(cfg), want, `new tab, ${theme}`);
      assert.equal(preinit(theme), want, `first paint, ${theme}`);
      assert.equal(pageMenu(cfg), want !== "light", `page menu, ${theme}`);
      assert.equal(windowSync(cfg), want !== "light", `browser window, ${theme}`);
    }
  });
}
