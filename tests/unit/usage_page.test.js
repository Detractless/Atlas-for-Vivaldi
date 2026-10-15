// Settings > Usage: which sites take your time, from the totals the page script collects.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const HOUR = 3600 * 1000;
const hourKey = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`; };
const row = (o) => ({ visibleMs: 0, handsOnMs: 0, mediaFrontMs: 0, mediaBackMs: 0, scrollMs: 0, pageViews: 0, imagesSeen: 0, clicks: 0, keys: 0, scrollScreens: 0, ...o });

function store(now = Date.now()) {
  return { v: 1, days: {}, hours: {
    [hourKey(now)]: {
      "youtube.com": row({ visibleMs: 2 * HOUR, handsOnMs: 0.5 * HOUR, pageViews: 14, imagesSeen: 240, mediaFrontMs: 40 * 60000, mediaBackMs: 10 * 60000, scrollScreens: 90, scrollMs: 30 * 60000, clicks: 50, keys: 5 }),
      "docs.google.com": row({ visibleMs: 0.5 * HOUR, handsOnMs: 0.4 * HOUR, pageViews: 2, keys: 900 }),
    },
    [hourKey(now - 3 * 24 * HOUR)]: { "reddit.com": row({ visibleMs: 1 * HOUR, pageViews: 9, imagesSeen: 100 }) },
  } };
}

async function openUsage(t) {
  click(t.window, t.document.getElementById("global-settings-btn"));
  const nav = await waitFor(() => t.document.querySelector('#sp-nav [data-page="usage"]'), 2000, "Usage in the menu");
  click(t.window, nav);
  await waitFor(() => text(t.document.querySelector("#sp-content .sp-page-title")) === "Usage", 2000, "Usage page");
  return t.document.getElementById("sp-content");
}

test("it lists the sites by time, with the numbers that describe how the time was spent", async () => {
  const t = await openNewTab({ local: { atlas_usage: store() } });
  const content = await openUsage(t);
  await waitFor(() => /youtube\.com/.test(text(content)), 3000, "the sites");
  const titles = [...content.querySelectorAll(".sp-row-title")].map(text);
  assert.deepEqual(titles.filter((x) => /\.com$/.test(x)), ["youtube.com", "reddit.com", "docs.google.com"], "most time first; reddit was three days ago, inside 7 days");
  const yt = text([...content.querySelectorAll(".sp-row")].find((r) => text(r.querySelector(".sp-row-title")) === "youtube.com"));
  assert.match(yt, /hands on 25%/);
  assert.match(yt, /14 page views/);
  assert.match(yt, /2 images a minute/);
  assert.match(yt, /50m of video or audio/);
  assert.match(yt, /2h 0m/);
  assert.ok(!/Time in front of you/.test(text(content)) && !content.querySelector(".sp-section-title:nth-of-type(2)") , "no Totals box");
  assert.deepEqual([...content.querySelectorAll(".sp-section-title")].map(text), ["By site"], "the Where your time goes box and the sites; no totals");
  const site = [...content.querySelectorAll(".sp-usage-site")][0];
  assert.equal(site.getAttribute("tabindex"), "0", "a site row can be reached with the keyboard, to show its details");
});

test("the time span can be changed to today only, or 30 days", async () => {
  const now = Date.now();
  const t = await openNewTab({ local: { atlas_usage: { v: 1, days: {}, hours: {
    [hourKey(now)]: { "today.com": row({ visibleMs: HOUR }) },
    [hourKey(now - 10 * 24 * HOUR)]: { "tenago.com": row({ visibleMs: 2 * HOUR }) },
  } } } });
  const content = await openUsage(t);
  await waitFor(() => /today\.com/.test(text(content)), 3000, "the sites");
  const pressed = () => text(content.querySelector('.sp-seg-btn[aria-pressed="true"]'));
  assert.equal(pressed(), "7 days");
  assert.ok(!/tenago\.com/.test(text(content)), "ten days ago is outside 7 days");
  click(t.window, content.querySelector('[data-days="30"]'));
  assert.equal(pressed(), "30 days");
  assert.match(text(t.document.getElementById("sp-content")), /tenago\.com/);
  click(t.window, t.document.querySelector('#sp-content [data-days="1"]'));
  assert.ok(!/tenago\.com/.test(text(t.document.getElementById("sp-content"))));
  assert.match(text(t.document.getElementById("sp-content")), /today\.com/);
});

test("with nothing recorded it says so", async () => {
  const t = await openNewTab();
  const content = await openUsage(t);
  await waitFor(() => /Nothing recorded yet/.test(text(content)), 3000, "the empty message");
  assert.ok(!content.querySelector(".sp-usage-bar"), "no bars");
});

test("the privacy line is on the page, and Clear asks first, then erases the totals", async () => {
  const t = await openNewTab({ local: { atlas_usage: store() } });
  const content = await openUsage(t);
  await waitFor(() => /youtube\.com/.test(text(content)), 3000, "the sites");
  assert.match(text(content), /never page addresses, titles, or what you type/);
  click(t.window, content.querySelector('[data-action="usage-clear"]'));
  assert.match(text(t.document.getElementById("sp-content")), /cannot be undone/);
  click(t.window, t.document.querySelector('#sp-content [data-action="usage-clear-cancel"]'));
  assert.ok(t.document.querySelector('#sp-content [data-action="usage-clear"]'), "cancel puts the first button back");
  assert.ok(t.chrome.storage.local._data.atlas_usage, "nothing erased yet");
  click(t.window, t.document.querySelector('#sp-content [data-action="usage-clear"]'));
  click(t.window, t.document.querySelector('#sp-content [data-action="usage-clear-go"]'));
  await settle(t.window, 100);
  assert.deepEqual(t.errors, []);
});

test("the page follows the totals while it is open", async () => {
  const t = await openNewTab({ local: { atlas_usage: store() } });
  const content = await openUsage(t);
  await waitFor(() => /youtube\.com/.test(text(content)), 3000, "the sites");
  const next = store();
  next.hours[Object.keys(next.hours)[0]]["new-site.com"] = row({ visibleMs: 10 * HOUR });
  await t.chrome.storage.local.set({ atlas_usage: next });
  await waitFor(() => /new-site\.com/.test(text(t.document.getElementById("sp-content"))), 3000, "the new site appears");
});
