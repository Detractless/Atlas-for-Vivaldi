"use strict";
// 09-popups.css restyles Vivaldi's toolbar popups and dropdown lists. It can only be
// judged in the running browser, so these checks pin the rules that matter: the colors
// come from Atlas tokens alone, and Vivaldi's blue highlight and gradients are gone.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "payload", "css-mods", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("09-popups.css");
const controls = read("10-popup-controls.css");

test("no raw colors: every color comes from an Atlas token", () => {
  for (const sheet of [css, controls]) assert.deepEqual(sheet.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g), null);
});

test("Vivaldi's blue highlight is never used", () => {
  for (const sheet of [css, controls]) assert.ok(!/colorHighlight/.test(sheet));
});

test("the popup and list containers remap Vivaldi's theme colors onto Atlas tokens", () => {
  const block = /#browser \.button-popup,\s*#browser \.addressfield-popup-container,\s*#browser \.WorkspacePopup,\s*#browser \.VivaldiSelector__menu \{([^}]*)\}/.exec(css);
  assert.ok(block, "remap block present");
  const map = Object.fromEntries([...block[1].matchAll(/(--color[\w]+):\s*var\((--atlas-[\w-]+)\)/g)].map((m) => [m[1], m[2]]));
  assert.equal(map["--colorBg"], "--atlas-menu");
  assert.equal(map["--colorBgDark"], "--atlas-hover-2");
  assert.equal(map["--colorBgDarker"], "--atlas-hover-3");
  assert.equal(map["--colorBorder"], "--atlas-border");
  assert.equal(map["--colorFg"], "--atlas-text-1");
  assert.equal(map["--colorFgFaded"], "--atlas-text-2");
});

test("the dropdown trigger is a flat pill and the list rows take a wash, not a fill", () => {
  const control = /#browser \.VivaldiSelector__control \{([^}]*)\}/.exec(css)[1];
  assert.match(control, /border-radius:\s*9999px/);
  assert.match(control, /background-image:\s*none/);
  const focus = /#browser \.VivaldiSelector__option--is-focused,[^{]*\{([^}]*)\}/.exec(css)[1];
  assert.match(focus, /background-color:\s*var\(--atlas-hover-2\)/);
});

test("the workspace tick stops being blue", () => {
  assert.match(css, /\.checkmark[^{]*\{\s*fill:\s*var\(--atlas-text-1\)/);
});

test("the Site info popup is covered by the remap, and its switch is the Atlas ink switch", () => {
  assert.match(css, /#browser \.addressfield-popup-container,/);
  assert.match(controls, /\.Switch-Input:checked \{ background-color: var\(--atlas-text-1\) !important; \}/);
  assert.match(controls, /\.Switch:has\(\.Switch-Input:checked\) \.Switch-Button \{ background-color: var\(--atlas-bar\); \}/);
});

test("popup buttons are soft pills in every place the Site info popup can live", () => {
  const rule = /input\[type="button"\], button:not\([^)]*\)\) \{([^}]*)\}/.exec(controls);
  assert.ok(rule, "pill rule present");
  assert.match(rule[1], /border-radius:\s*9999px/);
  assert.match(rule[1], /background-image:\s*none/);
  const scope = /#browser :is\(([^)]*)\)/.exec(controls)[1];
  for (const root of [".SiteInfo", ".SiteInfo-Footer", ".SiteInfo-Field-Permissions", ".addressfield-popup-container"]) assert.ok(scope.includes(root), root);
});

test("the chosen row shows a tick, never a fill, in the Site info choice, the dropdowns and the workspaces", () => {
  assert.match(controls, /\.SiteInfo-Label--Active \{ background-color: transparent;/);
  assert.match(controls, /\.SiteInfo-Label--Active::after \{[^}]*mask: var\(--atlas-icon-check\)/);
  assert.match(css, /\.VivaldiSelector__option--is-selected \{ background-color: transparent; \}/);
  assert.match(css, /\.VivaldiSelector__option--is-selected::after \{[^}]*mask: var\(--atlas-icon-check\)/);
  assert.ok(!/workspace-item-wrapper\.selected[^{]*\{[^}]*background-color/.test(css), "selected workspace has no fill");
});

test("rows that open something get a thin chevron, not the filled triangle", () => {
  assert.match(controls, /\.LinkArrow:after \{[^}]*rotate:\s*none[^}]*mask-image:\s*var\(--atlas-icon-chevron\)/);
});

test("the pointer is a sized, bordered square in front of the popup, for every side", () => {
  // Measured live: Vivaldi's pointer here is a zero-size box (a CSS triangle), so it needs a size first.
  const base = /#browser \.button-popup:before \{([^}]*)\}/.exec(css)[1];
  assert.match(base, /width:\s*12px/);
  assert.match(base, /height:\s*12px/);
  assert.match(base, /box-sizing:\s*border-box/);
  assert.match(base, /rotate:\s*45deg/);
  assert.match(base, /z-index:\s*1\b/);
  assert.match(base, /border-top:\s*1px solid var\(--atlas-border\)/);
  assert.match(base, /filter:\s*none/);
  assert.match(base, /scale:\s*\.94/, "16px wide like the profile flyout's pointer");
  assert.match(css, /\.button-popup-pos-below:before \{ top: -6px; \}/);
  for (const side of ["above", "left", "right"]) assert.match(css, new RegExp("\\.button-popup-pos-" + side + ":before \\{[^}]*rotate:"));
});

test("the Site info popup uses the profile flyout's measure: 32px rows, 13px text", () => {
  const rows = /#browser \.SiteInfo-Label,\s*#browser \.SiteInfo-Field-Permissions li \{([^}]*)\}/.exec(controls)[1];
  assert.match(rows, /min-height:\s*32px/);
  assert.match(rows, /font-size:\s*13px/);
  assert.match(controls, /#browser \.SiteInfo-Field \{ padding: 0; \}/);
});

test("the switch is scaled to the settings toggle's 36x20 and uses its grey and ink", () => {
  assert.match(controls, /#browser \.Switch \{ zoom: 1\.25; \}/);
  assert.match(controls, /\.Switch-Input \{[^}]*background-color: var\(--atlas-toggle-off\) !important/);
  const tokens = read("00-tokens.css");
  assert.equal((tokens.match(/--atlas-toggle-off:/g) || []).length, 2, "defined for light and dark");
});

test("a second page's line is moved under the site name, and its title becomes a small heading", () => {
  assert.match(controls, /#browser \.SiteInfo-Header::after \{ order: 1; \}/);
  const title = /#browser \.SiteInfo-Header-Title \{([^}]*)\}/.exec(controls)[1];
  assert.match(title, /order:\s*2/);
  assert.match(title, /font-size:\s*10px/);
  assert.match(title, /text-transform:\s*uppercase/);
});

test("permission rows line up with the others, and the counters get room", () => {
  assert.match(controls, /li:has\(> \.SiteInfo-Label\) \{ padding: 0; \}/);
  assert.match(controls, /li:has\(> input\[type="button"\]\) \{ min-height: 0; padding: 4px 10px 6px; \}/);
  assert.ok(!/li \+ li/.test(controls), "no rule pads the second row twice");
  assert.match(controls, /#browser \.SiteInfo-Counter \{ margin-top: 8px;/);
});

test("the security page's text, Back button and link line up with the rows", () => {
  assert.match(controls, /#browser \.SiteInfo-Status \{ padding: 0 10px 6px; \}/);
  assert.match(controls, /#browser \.SiteInfo-Back \{ margin: 8px 10px 6px; \}/);
  assert.match(controls, /#browser \.SiteInfo :is\(a, \.InlineText\) \{ color: var\(--atlas-text-1\)/);
  assert.match(controls, /#browser \.SiteInfo-Counter \{ margin-top: 8px; padding: 0 10px 8px;/);
  assert.match(controls, /#browser \.SiteInfo-Footer \{ padding: 4px 10px 10px; \}/);
});
