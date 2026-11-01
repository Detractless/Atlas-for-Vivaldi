// Settings > Focus > Content shield: the NSFW image detection row, and the Social media filter under it (settings/pages.js,
// shell.js, chipPane.js; the rules are utils/socialFilter.js and social_filter.test.js). Only the choices are saved so far:
// nothing is blocked, and the row says so. Locked, the mode can't go down and a chip that is on can't be switched off.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));
const stored = async (t, key) => plain(await t.chrome.storage.sync.get([key]))[key];

async function openFocus(t) {
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="focus"]'), 2000, "Focus in the menu"));
  await waitFor(() => doc.querySelector("#sp-content [data-lock]"), 2000, "the Focus page");
  return doc.getElementById("sp-content");
}
const chip = (content, id) => content.querySelector(`[data-chip="${id}"]`);
const filterRow = (content) => content.querySelector('[data-select="socialFilter"]').closest(".sp-row");
const note = (content) => text(filterRow(content).querySelector(".sp-row-desc"));
async function pickMode(t, label) {
  click(t.window, t.document.querySelector('#sp-content [data-select="socialFilter"]'));
  const li = [...t.document.querySelectorAll("#sp-menu .sp-menu-item")].find((x) => text(x) === label);
  click(t.window, li);
  await settle(t.window, 80);
  if (t.document.querySelector("#sp-menu.open")) click(t.window, t.document.querySelector('#sp-content [data-select="socialFilter"]'));
}
const menuState = (t) => Object.fromEntries([...t.document.querySelectorAll("#sp-menu .sp-menu-item")].map((li) => [text(li), li.getAttribute("aria-disabled") !== "true"]));

test("the shield row is named NSFW image detection, and the Social media filter sits under it, off, with its own lock", async () => {
  const t = await openNewTab();
  const content = await openFocus(t);
  const nsfw = content.querySelector('[data-select="nsfwAction"]').closest(".sp-row");
  assert.equal(text(nsfw.querySelector(".sp-row-title")), "NSFW image detection");
  assert.ok([...content.querySelectorAll(".sp-section-title")].some((h) => text(h) === "Content shield"), "the group is still Content shield");
  const row = filterRow(content);
  assert.equal(text(row.querySelector(".sp-row-title")), "Social media filter");
  assert.equal(text(row.querySelector("[data-select] span")), "Off");
  assert.ok(row.querySelector('[data-lock="socialFilter"]'), "its own lock, beside the menu");
  assert.equal(note(content), "Not blocking yet. Lock it to prevent turning it off.", "it says nothing is blocked yet");
  assert.equal(content.querySelectorAll("[data-chip]").length, 0, "no chips while it is Off");
  assert.equal(await stored(t, "socialFilter"), undefined, "nothing is written while off");
  assert.deepEqual(t.errors, []);
});

test("Block selected parts shows twenty chips in four groups; each saves at once, in the page's order", async () => {
  const t = await openNewTab();
  const content = await openFocus(t);
  click(t.window, content.querySelector('[data-select="socialFilter"]'));
  assert.deepEqual([...t.document.querySelectorAll("#sp-menu .sp-menu-item")].map(text),
    ["Off", "Block selected parts", "Block social sites entirely"]);
  click(t.window, [...t.document.querySelectorAll("#sp-menu .sp-menu-item")].find((li) => text(li) === "Block selected parts"));
  await waitFor(() => content.querySelectorAll("[data-chip]").length === 20, 2000, "the chips");
  assert.deepEqual(await stored(t, "socialFilter"), { mode: "parts", parts: [] });
  assert.deepEqual([...content.querySelectorAll(".sp-chip-label")].map(text), ["Feeds", "Video", "Interaction", "Numbers and alerts"]);
  assert.deepEqual([...content.querySelectorAll(".sp-chips")].map((g) => g.children.length), [5, 5, 6, 4]);
  click(t.window, chip(content, "comments"));
  click(t.window, chip(content, "likes"));
  await settle(t.window, 80);
  assert.deepEqual(await stored(t, "socialFilter"), { mode: "parts", parts: ["likes", "comments"] });
  assert.equal(chip(content, "likes").getAttribute("aria-pressed"), "true");
  assert.ok(chip(content, "likes").classList.contains("on"));
  assert.equal(chip(content, "share").getAttribute("aria-pressed"), "false");
  click(t.window, chip(content, "comments"));
  await settle(t.window, 80);
  assert.deepEqual(await stored(t, "socialFilter"), { mode: "parts", parts: ["likes"] }, "unlocked, a chip switches both ways");
  assert.ok(content.contains(chip(content, "likes")), "a chip switches in place: the page is not redrawn");
  await pickMode(t, "Block social sites entirely");
  assert.equal(content.querySelectorAll("[data-chip]").length, 0, "the chips go with the mode");
  assert.deepEqual(await stored(t, "socialFilter"), { mode: "all", parts: ["likes"] }, "the chosen parts are kept");
  assert.deepEqual(t.errors, []);
});

test("locked, a chip that is on stays on (and shows a lock); the others can still be switched on", async () => {
  const t = await openNewTab({ sync: { socialFilter: { mode: "parts", parts: ["likes"] } } });
  const content = await openFocus(t);
  assert.equal(chip(content, "likes").getAttribute("aria-pressed"), "true");
  assert.equal(chip(content, "likes").querySelector("svg"), null, "no lock on it before the lock is held");
  click(t.window, filterRow(content).querySelector('[data-lock="socialFilter"]'));
  await settle(t.window, 120);
  assert.deepEqual(await stored(t, "focusLocks"), { socialFilter: { unlockAt: null } });
  assert.equal(note(content), "Locked. You can block more, but not less. Not blocking yet.");
  assert.ok(chip(content, "likes").querySelector("svg"), "the chip the lock holds shows a small lock");
  assert.equal(chip(content, "likes").getAttribute("aria-disabled"), "true");
  assert.equal(chip(content, "comments").querySelector("svg"), null, "a chip that is off has none");
  click(t.window, chip(content, "likes"));
  await settle(t.window, 80);
  assert.deepEqual(await stored(t, "socialFilter"), { mode: "parts", parts: ["likes"] }, "it can't be switched off");
  click(t.window, chip(content, "comments"));
  await settle(t.window, 80);
  assert.deepEqual(await stored(t, "socialFilter"), { mode: "parts", parts: ["likes", "comments"] }, "another can be switched on");
  click(t.window, content.querySelector('[data-select="socialFilter"]'));
  assert.deepEqual(menuState(t), { "Off": false, "Block selected parts": true, "Block social sites entirely": true },
    "Off is greyed out; the same mode and a stricter one stay");
  click(t.window, [...t.document.querySelectorAll("#sp-menu .sp-menu-item")].find((li) => text(li) === "Off"));
  await settle(t.window, 80);
  assert.equal((await stored(t, "socialFilter")).mode, "parts", "it can't be turned off while locked");
  assert.deepEqual(t.errors, []);
});

test("the panel beside the pills says what a part hides and where it is planned, and rests when the pointer leaves", async () => {
  const t = await openNewTab({ sync: { socialFilter: { mode: "parts", parts: [] } } });
  const content = await openFocus(t);
  const pane = content.querySelector(".sp-chip-pane");
  assert.ok(pane && pane.id === "sp-chip-pane", "the panel is there, in the same container as the pills");
  assert.ok(pane.closest(".sp-card").contains(content.querySelector(".sp-chip-area")), "inside the Content shield card, beside the pills");
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Point at a part", "resting before anything is pointed at");
  assert.match(text(pane.querySelector(".sp-chip-pane-desc")), /Move over any pill, or Tab to it/);
  const over = (el, type, related) => el.dispatchEvent(new t.window.MouseEvent(type, { bubbles: true, relatedTarget: related || null }));
  over(chip(content, "shortVideos"), "mouseover");
  await settle(t.window, 150);
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Point at a part", "a pointer that has only just arrived shows nothing yet");
  over(chip(content, "shortVideos"), "mouseout", content.querySelector(".sp-chip-label"));
  over(chip(content, "autoplay"), "mouseover");
  over(chip(content, "autoplay"), "mouseout", content.querySelector(".sp-chip-label"));
  await settle(t.window, 500);
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Point at a part", "moving across the pills shows nothing");
  over(chip(content, "shortVideos"), "mouseover");
  await settle(t.window, 500);
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Short videos", "resting on a pill for a moment shows it");
  assert.equal(text(pane.querySelector(".sp-chip-pane-desc")), "Shorts, Reels and TikTok-style clips");
  assert.equal(text(pane.querySelector(".sp-chip-pane-sites")), "Planned for YouTube, TikTok, Instagram and Snapchat");
  assert.equal(chip(content, "shortVideos").getAttribute("aria-describedby"), "sp-chip-pane");
  assert.deepEqual([...pane.querySelectorAll(".sp-chip-site")].map(text), ["YouTube Shorts", "TikTok For You", "Instagram Reels", "Snapchat Spotlight"], "a slide for each site");
  assert.match(pane.querySelector(".sp-chip-slide.on img").getAttribute("src"), /^src\/assets\/social\/shortVideos-youtube-shorts\.jpg$/, "it starts on the first");
  assert.equal(pane.querySelectorAll(".sp-chip-dots i").length, 4);
  await settle(t.window, 2700);
  assert.equal(text(pane.querySelector(".sp-chip-slide.on .sp-chip-site")), "TikTok For You", "and flips to the next on its own");
  assert.equal(pane.querySelectorAll(".sp-chip-slide.on").length, 1, "one picture at a time");
  assert.equal(pane.querySelectorAll(".sp-chip-dots i.on").length, 1);
  over(chip(content, "likes"), "mouseover");
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Short videos", "the panel keeps its part until the next one has been rested on");
  await settle(t.window, 250);
  assert.match(pane.querySelector(".sp-chip-slide.on img").getAttribute("src"), /likes-youtube\.jpg$/, "each part has its own pictures; changing parts is quicker than the first");
  over(chip(content, "newPosts"), "mouseover");
  await settle(t.window, 250);
  assert.equal(pane.querySelector(".sp-chip-shot"), null, "a part with no picture yet is text only");
  assert.equal(chip(content, "likes").hasAttribute("aria-describedby"), false, "only the pill being shown points at the panel");
  over(chip(content, "autoplay"), "mouseover");
  await settle(t.window, 250);
  assert.equal(text(pane.querySelector(".sp-chip-pane-sites")), "Planned for YouTube", "one site reads plainly");
  over(chip(content, "autoplay"), "mouseout", content.querySelector(".sp-chip-label"));
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Autoplay", "moving over the gaps between pills keeps the panel as it is");
  over(chip(content, "autoplay"), "mouseout", content);
  assert.equal(text(pane.querySelector(".sp-chip-pane-title")), "Point at a part", "off the pills, it rests again");
  assert.equal(chip(content, "autoplay").hasAttribute("aria-describedby"), false);
  assert.deepEqual(t.errors, []);
});

test("the panel follows the keyboard, stays put when a pill is switched, and goes with the mode", async () => {
  const t = await openNewTab({ sync: { socialFilter: { mode: "parts", parts: [] } } });
  const content = await openFocus(t);
  const pane = () => content.querySelector(".sp-chip-pane");
  chip(content, "comments").focus();
  assert.equal(text(pane().querySelector(".sp-chip-pane-title")), "Comments", "Tab to a pill shows it");
  click(t.window, chip(content, "comments"));
  await settle(t.window, 80);
  assert.equal(content.querySelector(".sp-chip-pane"), pane(), "switching a pill does not redraw the panel");
  assert.equal(text(pane().querySelector(".sp-chip-pane-title")), "Comments");
  await pickMode(t, "Block social sites entirely");
  assert.equal(content.querySelector(".sp-chip-pane"), null, "no pills, no panel");
  await pickMode(t, "Block selected parts");
  assert.equal(text(pane().querySelector(".sp-chip-pane-title")), "Point at a part", "and it comes back resting");
  assert.deepEqual(t.errors, []);
});

test("switching profile can't loosen a locked social media filter", async () => {
  const profiles = {
    v: 2, active: "personal", owner: "personal",
    share: { bookmarks: true, theme: true, appearance: true, search: true, focus: false },
    list: [
      { id: "personal", name: "Pat", label: "Personal", color: 0, icon: "", db: "", settings: {} },
      { id: "school", name: "Pat (School)", label: "School", color: 1, icon: "", db: "", settings: { socialFilter: { mode: "off", parts: [] } } },
      { id: "work", name: "Pat (Work)", label: "Work", color: 2, icon: "", db: "", settings: { socialFilter: { mode: "all", parts: [] } } },
    ],
  };
  const t = await openNewTab({
    local: { atlasProfilesV2: profiles },
    sync: { socialFilter: { mode: "parts", parts: ["likes"] }, focusLocks: { socialFilter: { unlockAt: null } } },
  });
  await t.window.AtlasProfiles.ready;
  await t.window.AtlasProfiles.switchTo("school");
  assert.deepEqual(plain(t.chrome.storage.sync._data.socialFilter), { mode: "parts", parts: ["likes"] }, "school's Off stays out");
  await t.window.AtlasProfiles.switchTo("work");
  assert.deepEqual(plain(t.chrome.storage.sync._data.socialFilter), { mode: "all", parts: [] }, "work's stricter one comes in");
  assert.deepEqual(plain(t.chrome.storage.sync._data.focusLocks), { socialFilter: { unlockAt: null } }, "the lock didn't move");
  assert.deepEqual(t.errors, []);
});
