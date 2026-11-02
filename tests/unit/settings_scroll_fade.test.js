// Settings > Focus > Scroll fade (settings/scrollFadePage.js, fadeControls.js, shell.js; the rules are utils/scrollFade.js and
// scroll_fade_rules.test.js, the counting script is scroll_fade_page.test.js, the dimming in the window is
// scroll_fade_layer.test.js): the rows, what each choice saves, the sites left alone as pills, the pictures that follow the
// slider, and the one lock: locked, the fade can only get stronger.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));
const stored = async (t, key) => plain(await t.chrome.storage.sync.get([key]))[key];
const ON = { on: true, by: "either", minutes: 5, screens: 150, darkest: 70, restSeconds: 60, waitMinutes: 10, except: [] };

async function openFocus(t) {
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="focus"]'), 2000, "Focus in the menu"));
  await waitFor(() => doc.querySelector("#sp-content [data-lock]"), 2000, "the Focus page");
  return doc.getElementById("sp-content");
}
const rowTitles = (content) => [...content.querySelector("[data-fadeshape]").querySelectorAll(".sp-row-title")].map(text);
const pillOf = (content, key) => text(content.querySelector(`[data-select="${key}"] span`));
const sites = (content) => [...content.querySelectorAll("[data-site]")].map((b) => b.dataset.site);
const lockBtn = (content) => content.querySelector('[data-lock="scrollFade"]');

/** Open `key`'s menu and say which choices can be picked: { label: true | false }. */
function menuOf(t, key) {
  click(t.window, t.document.querySelector(`#sp-content [data-select="${key}"]`));
  return Object.fromEntries([...t.document.querySelectorAll("#sp-menu .sp-menu-item")].map((li) => [text(li), li.getAttribute("aria-disabled") !== "true"]));
}
const closeMenu = (t, key) => { if (t.document.querySelector("#sp-menu.open")) click(t.window, t.document.querySelector(`#sp-content [data-select="${key}"]`)); };
async function pick(t, key, label) {
  menuOf(t, key);
  click(t.window, [...t.document.querySelectorAll("#sp-menu .sp-menu-item")].find((li) => text(li) === label));
  await settle(t.window, 80);
  closeMenu(t, key);   // a greyed-out choice leaves the menu open
}
const drag = async (t, slider, v) => {
  slider.value = String(v);
  slider.dispatchEvent(new t.window.Event("input", { bubbles: true }));
  slider.dispatchEvent(new t.window.Event("change", { bubbles: true }));
  await settle(t.window, 100);
};
const type = async (t, input, value) => {
  input.value = value;
  input.dispatchEvent(new t.window.Event("change", { bubbles: true }));
  await settle(t.window, 100);
};

test("Scroll fade sits between Display and Content shield, off, with the rows of the mock-up and its own lock", async () => {
  const t = await openNewTab();
  const content = await openFocus(t);
  const titles = [...content.querySelectorAll(".sp-section-title")].map(text);
  assert.deepEqual(titles.slice(titles.indexOf("Display"), titles.indexOf("Display") + 3), ["Display", "Scroll fade", "Content shield"]);
  assert.deepEqual(rowTitles(content), ["Fade", "Dim by", "Fully dim after", "Or after scrolling", "Darkest it gets", "Rest to clear", "Wait once fully dim", "Leave these sites alone"]);
  assert.deepEqual(["fade", "fadeBy", "fadeMinutes", "fadeScreens", "fadeRest", "fadeWait"].map((k) => pillOf(content, k)),
    ["Off", "Whichever comes first", "5 minutes", "150 screens", "1 minute", "10 minutes"]);
  const slider = content.querySelector('[data-slider="fadeDarkest"]');
  assert.deepEqual([slider.value, slider.min, slider.max, text(slider.closest(".sp-slider-wrap").querySelector(".sp-slider-val"))], ["70", "10", "90", "70%"]);
  assert.deepEqual(sites(content), [], "every site dims to start with: nothing is left alone");
  assert.match(text(content.querySelector(".sp-sites")), /None: every site dims/);
  assert.deepEqual([...content.querySelectorAll(".sp-fade-prev figcaption")].map(text), ["Start", "A quarter", "Halfway", "Three quarters", "Fully dim"]);
  assert.deepEqual([...content.querySelectorAll(".sp-fade-shot i")].map((i) => Number(i.style.opacity)), [0, 0.175, 0.35, 0.525, 0.7], "the pictures show 70% at the end");
  assert.ok(lockBtn(content), "its own lock beside the Fade menu");
  assert.equal(text(lockBtn(content).closest(".sp-row").querySelector(".sp-row-desc")), "Dims every page as you keep scrolling. Lock it to stop it getting weaker.");
  assert.equal(await stored(t, "scrollFade"), undefined, "nothing is written while it is untouched");
  assert.deepEqual(t.errors, []);
});

test("each choice saves at once: On, what it dims by (which rows show), the limits and the rest", async () => {
  const t = await openNewTab();
  const content = await openFocus(t);
  await pick(t, "fade", "On");
  assert.equal((await stored(t, "scrollFade")).on, true);
  assert.equal(pillOf(content, "fade"), "On");
  assert.deepEqual(Object.keys(await stored(t, "scrollFade")), ["on", "by", "minutes", "screens", "darkest", "restSeconds", "waitMinutes", "except"], "the whole setting is saved, safe to read as it is");
  assert.deepEqual(Object.keys(menuOf(t, "fadeBy")), ["Whichever comes first", "Time", "Distance"]);
  closeMenu(t, "fadeBy");
  await pick(t, "fadeBy", "Time");
  assert.equal((await stored(t, "scrollFade")).by, "time");
  assert.deepEqual(rowTitles(content), ["Fade", "Dim by", "Fully dim after", "Darkest it gets", "Rest to clear", "Wait once fully dim", "Leave these sites alone"], "by time, there is no distance row");
  await pick(t, "fadeBy", "Distance");
  assert.deepEqual(rowTitles(content), ["Fade", "Dim by", "Fully dim after scrolling", "Darkest it gets", "Rest to clear", "Wait once fully dim", "Leave these sites alone"], "by distance, no time row, and the distance row says so");
  await pick(t, "fadeBy", "Whichever comes first");
  assert.equal(rowTitles(content).length, 8, "both again");
  assert.deepEqual(Object.keys(menuOf(t, "fadeMinutes")), ["1 minute", "2 minutes", "3 minutes", "5 minutes", "10 minutes", "15 minutes", "20 minutes", "30 minutes", "45 minutes", "60 minutes"]);
  closeMenu(t, "fadeMinutes");
  await pick(t, "fadeMinutes", "10 minutes");
  await pick(t, "fadeScreens", "250 screens");
  await pick(t, "fadeRest", "2 minutes");
  assert.deepEqual(Object.keys(menuOf(t, "fadeRest")), ["30 seconds", "1 minute", "2 minutes", "5 minutes", "10 minutes"]);
  closeMenu(t, "fadeRest");
  await pick(t, "fadeWait", "30 minutes");
  assert.deepEqual(Object.keys(menuOf(t, "fadeWait")), ["1 minute", "2 minutes", "5 minutes", "10 minutes", "15 minutes", "30 minutes", "60 minutes"]);
  closeMenu(t, "fadeWait");
  const s = await stored(t, "scrollFade");
  assert.deepEqual([s.minutes, s.screens, s.restSeconds, s.waitMinutes, s.on, s.by], [10, 250, 120, 30, true, "either"]);
  assert.deepEqual([pillOf(content, "fadeMinutes"), pillOf(content, "fadeScreens"), pillOf(content, "fadeRest"), pillOf(content, "fadeWait")], ["10 minutes", "250 screens", "2 minutes", "30 minutes"]);
  await pick(t, "fade", "Off");
  assert.equal((await stored(t, "scrollFade")).on, false);
  assert.deepEqual(t.errors, []);
});

test("a saved number that is not one of the usual choices is still named, never a dash", async () => {
  const t = await openNewTab({ sync: { scrollFade: { ...ON, minutes: 7, restSeconds: 45, waitMinutes: 7 } } });
  const content = await openFocus(t);
  assert.equal(pillOf(content, "fadeMinutes"), "7 minutes");
  assert.equal(pillOf(content, "fadeRest"), "45 seconds");
  assert.equal(pillOf(content, "fadeWait"), "7 minutes");
  assert.ok(Object.keys(menuOf(t, "fadeMinutes")).includes("7 minutes"));
  assert.deepEqual(t.errors, []);
});

test("the slider saves where you let go, moves the pictures as it goes, and the page is not redrawn under it", async () => {
  const t = await openNewTab({ sync: { scrollFade: ON } });
  const content = await openFocus(t);
  const slider = content.querySelector('[data-slider="fadeDarkest"]');
  slider.value = "40";
  slider.dispatchEvent(new t.window.Event("input", { bubbles: true }));
  assert.equal(text(slider.closest(".sp-slider-wrap").querySelector(".sp-slider-val")), "40%", "the number follows at once");
  assert.deepEqual([...content.querySelectorAll(".sp-fade-shot i")].map((i) => Number(i.style.opacity)), [0, 0.1, 0.2, 0.3, 0.4], "and so do the pictures");
  assert.equal((await stored(t, "scrollFade")).darkest, 70, "saving waits a moment while it moves");
  await settle(t.window, 400);
  assert.equal((await stored(t, "scrollFade")).darkest, 40);
  await drag(t, slider, 85);
  assert.equal((await stored(t, "scrollFade")).darkest, 85, "let go: saved at once");
  assert.ok(content.contains(slider), "the same slider is still there");
  await drag(t, slider, 5);
  assert.equal((await stored(t, "scrollFade")).darkest, 10, "never lighter than 10%");
  assert.deepEqual(t.errors, []);
});

test("Leave these sites alone: sites typed any way are added, a bad one or a repeat adds nothing, and a pill takes one off", async () => {
  const t = await openNewTab({ sync: { scrollFade: { ...ON, except: ["youtube.com", "reddit.com", "x.com"] } } });
  const content = await openFocus(t);
  assert.deepEqual(sites(content), ["youtube.com", "reddit.com", "x.com"]);
  await type(t, content.querySelector('[data-input="fadeAddSite"]'), "  https://Docs.Example.com/guide?x=1 ");
  assert.deepEqual((await stored(t, "scrollFade")).except, ["youtube.com", "reddit.com", "x.com", "docs.example.com"]);
  assert.deepEqual(sites(content), ["youtube.com", "reddit.com", "x.com", "docs.example.com"]);
  assert.equal(content.querySelector('[data-input="fadeAddSite"]').value, "", "the box is empty again");
  await type(t, content.querySelector('[data-input="fadeAddSite"]'), "not a site");
  await type(t, content.querySelector('[data-input="fadeAddSite"]'), "REDDIT.com");
  assert.equal((await stored(t, "scrollFade")).except.length, 4, "a bad name or one already there adds nothing");
  click(t.window, content.querySelector('[data-site="reddit.com"]'));
  await settle(t.window, 100);
  assert.deepEqual((await stored(t, "scrollFade")).except, ["youtube.com", "x.com", "docs.example.com"]);
  assert.deepEqual(sites(content), ["youtube.com", "x.com", "docs.example.com"]);
  for (const s of ["youtube.com", "x.com", "docs.example.com"]) click(t.window, content.querySelector(`[data-site="${s}"]`));
  await settle(t.window, 100);
  assert.deepEqual((await stored(t, "scrollFade")).except, [], "all of them dimmed again");
  assert.match(text(content.querySelector(".sp-sites")), /None: every site dims/);
  assert.equal((await stored(t, "scrollFade")).where, undefined, "there is no list of the only sites any more");
  assert.deepEqual(t.errors, []);
});

test("locked, the fade can only get stronger: looser choices are greyed out, no site can be added, the slider cannot go lighter", async () => {
  const t = await openNewTab({ sync: { scrollFade: { ...ON, except: ["youtube.com", "reddit.com"] } } });
  const content = await openFocus(t);
  assert.equal(content.querySelector('[data-input="fadeAddSite"]').disabled, false, "before the lock, sites can be added");
  click(t.window, lockBtn(content));
  await settle(t.window, 120);
  assert.deepEqual(plain((await t.chrome.storage.sync.get(["focusLocks"])).focusLocks), { scrollFade: { unlockAt: null } });
  assert.equal(text(lockBtn(content).closest(".sp-row").querySelector(".sp-row-desc")), "Locked. It can get stronger, but not weaker.");
  assert.deepEqual(menuOf(t, "fade"), { On: true, Off: false });
  closeMenu(t, "fade");
  const minutes = menuOf(t, "fadeMinutes");
  assert.deepEqual([minutes["3 minutes"], minutes["5 minutes"], minutes["10 minutes"], minutes["60 minutes"]], [true, true, false, false]);
  closeMenu(t, "fadeMinutes");
  assert.deepEqual(menuOf(t, "fadeBy"), { "Whichever comes first": true, Time: false, Distance: false }, "dropping a limit is looser");
  closeMenu(t, "fadeBy");
  assert.deepEqual(menuOf(t, "fadeRest"), { "30 seconds": false, "1 minute": true, "2 minutes": true, "5 minutes": true, "10 minutes": true }, "a shorter rest clears it sooner: looser");
  closeMenu(t, "fadeRest");
  assert.deepEqual(menuOf(t, "fadeWait"), { "1 minute": false, "2 minutes": false, "5 minutes": false, "10 minutes": true, "15 minutes": true, "30 minutes": true, "60 minutes": true }, "a shorter wait is looser");
  closeMenu(t, "fadeWait");
  await pick(t, "fadeMinutes", "10 minutes");
  assert.equal((await stored(t, "scrollFade")).minutes, 5, "a greyed-out choice does nothing");
  await pick(t, "fadeMinutes", "3 minutes");
  assert.equal((await stored(t, "scrollFade")).minutes, 3, "a stricter one goes through");
  await pick(t, "fadeWait", "30 minutes");
  assert.equal((await stored(t, "scrollFade")).waitMinutes, 30, "a longer wait goes through");
  await pick(t, "fadeWait", "5 minutes");
  assert.equal((await stored(t, "scrollFade")).waitMinutes, 30, "and cannot be made shorter");
  const slider = content.querySelector('[data-slider="fadeDarkest"]');
  assert.equal(slider.min, "70", "no lighter than it is");
  await drag(t, slider, 30);
  assert.equal(slider.value, "70");
  await drag(t, slider, 80);
  assert.equal((await stored(t, "scrollFade")).darkest, 80, "darker is fine");
  assert.equal(slider.min, "80", "and that is the new lightest");
  const add = content.querySelector('[data-input="fadeAddSite"]');
  assert.equal(add.disabled, true, "no more sites can be left alone");
  assert.match(add.placeholder, /Locked/);
  add.disabled = false;
  await type(t, add, "example.org");
  assert.deepEqual((await stored(t, "scrollFade")).except, ["youtube.com", "reddit.com"], "even if it were typed, the lock refuses it");
  click(t.window, content.querySelector('[data-site="reddit.com"]'));
  await settle(t.window, 100);
  assert.deepEqual(sites(content), ["youtube.com"], "a site can come off the list: fewer sites left alone is stronger");
  assert.deepEqual(t.errors, []);
});

test("the lock on the add-a-site box follows the lock itself, without drawing the page again", async () => {
  const t = await openNewTab({ sync: { scrollFade: ON } });
  const content = await openFocus(t);
  const add = content.querySelector('[data-input="fadeAddSite"]');
  click(t.window, lockBtn(content));
  await settle(t.window, 120);
  assert.equal(content.querySelector('[data-input="fadeAddSite"]'), add, "the same box");
  assert.equal(add.disabled, true);
  click(t.window, lockBtn(content));   // start unlocking: still held
  await settle(t.window, 120);
  assert.equal(add.disabled, true, "unlocking takes 30 minutes: still locked");
  assert.deepEqual(t.errors, []);
});

test("a fade that is off can be locked; switched on afterwards, it can no longer be switched off", async () => {
  const t = await openNewTab();
  const content = await openFocus(t);
  click(t.window, lockBtn(content));
  await settle(t.window, 120);
  assert.deepEqual(menuOf(t, "fade"), { On: true, Off: true }, "off is already the loosest: turning on is stronger, and off is where it is");
  closeMenu(t, "fade");
  await pick(t, "fade", "On");
  assert.equal((await stored(t, "scrollFade")).on, true);
  assert.deepEqual(menuOf(t, "fade"), { On: true, Off: false }, "once on, it cannot go off");
  closeMenu(t, "fade");
  assert.deepEqual(t.errors, []);
});
