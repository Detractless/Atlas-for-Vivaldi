// Settings > Focus with its locks (settings/pages.js, shell.js, menu.js; the rules are utils/focusLock.js and
// focus_lock.test.js): unlocked, the tab limit, the delay and the color slider change at once both ways. Locked,
// each can only get stricter, the looser choices are greyed out, and nothing unlocks until you click the lock again;
// then it takes 30 minutes, and a click during them keeps it locked. A profile switch can't undo a lock.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));
const MIN = 60 * 1000;

async function openFocus(t) {
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="focus"]'), 2000, "Focus in the menu"));
  await waitFor(() => doc.querySelector("#sp-content [data-lock]"), 2000, "the Focus page");
  return doc.getElementById("sp-content");
}
const stored = async (t, key) => plain(await t.chrome.storage.sync.get([key]))[key];
const lockBtn = (content, key) => content.querySelector(`[data-lock="${key}"]`);
const note = (content, key) => text(lockBtn(content, key).closest(".sp-row").querySelector(".sp-row-desc"));
const lockClick = async (t, content, key) => { click(t.window, lockBtn(content, key)); await settle(t.window, 120); };

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

test("unlocked, the tab limit and the delay change at once both ways, and nothing is queued", async () => {
  const t = await openNewTab({ sync: { tabLimit: 6 } });
  const content = await openFocus(t);
  assert.equal(note(content, "tabLimit"), "Lock it to stop it going higher.");
  assert.equal(note(content, "searchDelaySeconds"), "A pause before results. Lock it to stop it getting shorter.");
  assert.equal(note(content, "saturation"), "Lock it to stop going back to color.");
  for (const key of ["tabLimit", "searchDelaySeconds", "saturation"]) {
    const b = lockBtn(content, key);
    assert.equal(b.getAttribute("aria-pressed"), "false", `${key}: open`);
    assert.ok(!b.disabled && !b.classList.contains("on"));
  }
  await pick(t, "limit", "3");
  await pick(t, "limit", "8");
  assert.equal(await stored(t, "tabLimit"), 8, "higher applies at once");
  await pick(t, "delay", "30 seconds");
  await pick(t, "delay", "15 seconds");
  assert.equal(await stored(t, "searchDelaySeconds"), 15, "shorter applies at once");
  assert.equal(await stored(t, "pendingIncrease"), undefined);
  assert.equal(await stored(t, "pendingDelayDecrease"), undefined);
  assert.deepEqual(t.errors, []);
});

test("locked, the delay can only get longer: shorter choices are greyed out and refused", async () => {
  const t = await openNewTab({ sync: { searchDelaySeconds: 30 } });
  const content = await openFocus(t);
  await lockClick(t, content, "searchDelaySeconds");
  assert.deepEqual(await stored(t, "focusLocks"), { searchDelaySeconds: { unlockAt: null } });
  const b = lockBtn(content, "searchDelaySeconds");
  assert.ok(b.classList.contains("on") && !b.disabled, "locked, dark, and still clickable");
  assert.equal(note(content, "searchDelaySeconds"), "Locked. It can get longer, but not shorter.");
  assert.deepEqual(menuOf(t, "delay"), { "Off": false, "15 seconds": false, "30 seconds": true, "1 minute": true, "2 minutes": true, "5 minutes": true });
  click(t.window, [...t.document.querySelectorAll("#sp-menu .sp-menu-item")].find((li) => text(li) === "15 seconds"));
  await settle(t.window, 80);
  assert.ok(t.document.querySelector("#sp-menu.open"), "a greyed-out choice leaves the menu open");
  closeMenu(t, "delay");
  assert.equal(await stored(t, "searchDelaySeconds"), 30, "and does nothing");
  assert.equal(text(t.document.querySelector('[data-select="delay"]')), "30 seconds", "and the pill still says so");
  await pick(t, "delay", "1 minute");
  assert.equal(await stored(t, "searchDelaySeconds"), 60, "longer applies");
  assert.equal(lockBtn(content, "tabLimit").getAttribute("aria-pressed"), "false", "the tab limit has its own lock, still open");
  assert.deepEqual(t.errors, []);
});

test("clicking a lock again starts a 30-minute unlock; clicking during it keeps it locked; when it ends, it's free", async () => {
  const t = await openNewTab({ sync: { tabLimit: 3, focusLocks: { tabLimit: { unlockAt: null } } } });
  const content = await openFocus(t);
  assert.equal(note(content, "tabLimit"), "Locked. It can go lower, but not higher.");
  assert.deepEqual(Object.entries(menuOf(t, "limit")).filter(([, ok]) => ok).map(([l]) => l), ["1", "2", "3"], "Off and higher limits are out");
  closeMenu(t, "limit");
  await lockClick(t, content, "tabLimit");
  const at = (await stored(t, "focusLocks")).tabLimit.unlockAt;
  assert.ok(Math.abs(at - Date.now() - 30 * MIN) < 5000, "unlocks 30 minutes from the click");
  const b = lockBtn(content, "tabLimit");
  assert.ok(b.classList.contains("wait") && !b.classList.contains("on"), "the unlocking look");
  assert.match(text(content.querySelector('[data-lockcount="tabLimit"]')), /^(30:00|29:5\d)$/);
  assert.match(note(content, "tabLimit"), /^Unlocks at .+\. Click the lock to keep it locked\.$/);
  await pick(t, "limit", "8");
  assert.equal(await stored(t, "tabLimit"), 3, "still locked while it unlocks");
  await lockClick(t, content, "tabLimit");
  assert.deepEqual(await stored(t, "focusLocks"), { tabLimit: { unlockAt: null } }, "a click while unlocking: locked again");
  assert.ok(b.classList.contains("on"));
  await lockClick(t, content, "tabLimit");
  await t.chrome.storage.sync.set({ focusLocks: { tabLimit: { unlockAt: Date.now() - 1000 } } });   // the 30 minutes are up
  await settle(t.window, 1100);
  assert.equal(b.getAttribute("aria-pressed"), "false", "open again");
  assert.equal(text(content.querySelector('[data-lockcount="tabLimit"]')), "");
  assert.equal(note(content, "tabLimit"), "Lock it to stop it going higher.");
  assert.ok(content.contains(b), "the countdown and the unlock updated the button in place, never replaced it");
  await pick(t, "limit", "8");
  assert.equal(await stored(t, "tabLimit"), 8, "and a higher limit applies");
  assert.deepEqual(t.errors, []);
});

test("the color lock: grayer only while locked, and it never frees itself", async () => {
  const t = await openNewTab();
  const content = await openFocus(t);
  const slider = content.querySelector('[data-slider="saturation"]');
  await drag(t, slider, 40);
  await drag(t, slider, 70);
  assert.equal(await stored(t, "saturation"), 70, "unlocked it moves freely both ways");
  assert.equal(await stored(t, "focusLocks"), undefined, "dragging locks nothing");
  await drag(t, slider, 40);
  await lockClick(t, content, "saturation");
  assert.deepEqual(await stored(t, "focusLocks"), { saturation: { unlockAt: null } });
  assert.equal(note(content, "saturation"), "Locked. It can go grayer, but not back to color.");
  await drag(t, slider, 70);
  assert.equal(slider.value, "40", "the thumb stops where it is");
  assert.equal(await stored(t, "saturation"), 40);
  await drag(t, slider, 25);
  assert.equal(await stored(t, "saturation"), 25, "grayer applies");
  await drag(t, slider, 35);
  assert.equal(await stored(t, "saturation"), 25, "not even back up to where it was");
  await lockClick(t, content, "saturation");
  assert.ok(lockBtn(content, "saturation").classList.contains("wait"), "unlocking");
  await drag(t, slider, 90);
  assert.equal(await stored(t, "saturation"), 25, "still locked while it unlocks");
  assert.ok(content.contains(slider), "the slider was never replaced");
  assert.deepEqual(t.errors, []);
});

test("switching profile can't loosen a locked setting, including the shield mode", async () => {
  const profiles = {
    v: 2, active: "personal", owner: "personal",
    share: { bookmarks: true, theme: true, appearance: true, search: true, focus: false },
    list: [
      { id: "personal", name: "Pat", label: "Personal", color: 0, icon: "", db: "", settings: {} },
      { id: "school", name: "Pat (School)", label: "School", color: 1, icon: "", db: "", settings: { searchDelaySeconds: 15, saturation: 20, tabLimit: 9, nsfwAction: "off" } },
    ],
  };
  const t = await openNewTab({
    local: { atlasProfilesV2: profiles },
    sync: { searchDelaySeconds: 60, saturation: 50, tabLimit: 4, nsfwAction: "blur", focusLocks: {
      searchDelaySeconds: { unlockAt: null }, saturation: { unlockAt: Date.now() + 10 * MIN }, nsfwAction: { unlockAt: null }
    } },
  });
  await t.window.AtlasProfiles.ready;
  await t.window.AtlasProfiles.switchTo("school");
  const live = t.chrome.storage.sync._data;
  assert.equal(live.searchDelaySeconds, 60, "locked: school's shorter delay stays out");
  assert.equal(live.saturation, 20, "locked, but school's is grayer: it comes in");
  assert.equal(live.tabLimit, 9, "the tab limit isn't locked: school's comes in");
  assert.equal(live.nsfwAction, "blur", "the shield lock prevents a profile switch from turning it off");
  assert.deepEqual(plain(live.focusLocks), {
    searchDelaySeconds: { unlockAt: null },
    saturation: { unlockAt: plain(live.focusLocks).saturation.unlockAt },
    nsfwAction: { unlockAt: null },
  }, "the locks didn't move");
  assert.deepEqual(t.errors, []);
});
