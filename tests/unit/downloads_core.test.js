"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../payload/install-files/components/atlas/downloads-core.js");

const NOW = new Date(2026, 9, 31, 15, 0, 0).getTime(); // Oct 31 2026, 3pm
const at = (daysAgo, hour) => new Date(2026, 9, 31 - daysAgo, hour || 10).toISOString();
const dl = (o) => Object.assign({ id: 1, state: "complete", exists: true, url: "https://a.test/f.zip", filename: "/Users/x/Downloads/f.zip", startTime: at(0) }, o);

test("headings read Today, Yesterday, then the date, newest first", () => {
  const groups = core.groupByDay([dl({ id: 1, startTime: at(2) }), dl({ id: 2, startTime: at(0, 9) }), dl({ id: 3, startTime: at(1) }), dl({ id: 4, startTime: at(0, 12) })], NOW);
  assert.deepEqual(groups.map((g) => g.label), ["Today", "Yesterday", "October 29, 2026"]);
  assert.deepEqual(groups[0].items.map((i) => i.id), [4, 2], "newest first inside a day");
});

test("a download just after midnight is Yesterday's, not Today's", () => {
  const justBefore = new Date(2026, 9, 30, 23, 59).toISOString();
  assert.equal(core.dayLabel(Date.parse(justBefore), NOW), "Yesterday");
});

test("a finished download is an active card with no extra words", () => {
  const d = core.describe(dl({}), NOW);
  assert.equal(d.active, true);
  assert.equal(d.tag, "");
  assert.equal(d.from, "https://a.test");
});

test("a deleted file is the grey card tagged Deleted", () => {
  const d = core.describe(dl({ exists: false }), NOW);
  assert.deepEqual([d.active, d.tag], [false, "Deleted"]);
});

test("failures and cancels use Chromium's wording", () => {
  assert.equal(core.describe(dl({ state: "interrupted", error: "NETWORK_FAILED" }), NOW).text, "Failed - Network error");
  assert.equal(core.describe(dl({ state: "interrupted", error: "FILE_NO_SPACE" }), NOW).text, "Failed - Disk is full");
  assert.equal(core.describe(dl({ state: "interrupted", error: "USER_CANCELED" }), NOW).text, "Canceled");
  assert.equal(core.describe(dl({ state: "interrupted", error: "SOMETHING_NEW" }), NOW).text, "Failed - Download error");
});

test("a running download shows how much, and how long is left", () => {
  const start = new Date(NOW - 10000).toISOString();
  const d = core.describe(dl({ state: "in_progress", bytesReceived: 5e6, totalBytes: 20e6, startTime: start }), NOW);
  assert.equal(d.text, "5 MB of 20 MB, 30 secs left");
  assert.deepEqual(d.progress, { value: 0.25, indeterminate: false });
  assert.equal(core.describe(dl({ state: "in_progress", bytesReceived: 5e6, totalBytes: 0 }), NOW).progress.indeterminate, true);
  assert.match(core.describe(dl({ state: "in_progress", paused: true, bytesReceived: 5e6, totalBytes: 20e6 }), NOW).text, /Paused$/);
});

test("an extension's download says so instead of naming a site", () => {
  const d = core.describe(dl({ byExtensionName: "Vivaldi" }), NOW);
  assert.deepEqual([d.by, d.from], ["Vivaldi", ""]);
});

test("a data: or blob: address has no 'From' line", () => {
  assert.equal(core.describe(dl({ url: "data:text/plain;base64,AAAA" }), NOW).from, "");
});

test("each state offers its own buttons", () => {
  assert.deepEqual(core.actions(dl({})), ["copy", "show", "remove"]);
  assert.deepEqual(core.actions(dl({ exists: false })), ["copy", "remove"]);
  assert.deepEqual(core.actions(dl({ state: "in_progress" })), ["copy", "pause", "cancel"]);
  assert.deepEqual(core.actions(dl({ state: "in_progress", paused: true })), ["copy", "resume", "cancel"]);
  assert.deepEqual(core.actions(dl({ state: "interrupted", canResume: false })), ["copy", "retry", "remove"]);
  assert.deepEqual(core.actions(dl({ state: "interrupted", canResume: true })), ["copy", "resume", "remove"]);
});

test("search matches every word, and a quoted phrase as one", () => {
  const item = dl({ filename: "/d/Annual Report 2026.pdf" });
  assert.equal(core.matches(item, "report pdf"), true);
  assert.equal(core.matches(item, '"annual report"'), true);
  assert.equal(core.matches(item, '"report annual"'), false);
  assert.equal(core.matches(item, "docx"), false);
  assert.equal(core.matches(item, "a.test"), true, "the address counts too");
  assert.equal(core.matches(item, ""), true);
});

test("sizes and file names read like Chromium's", () => {
  assert.equal(core.formatBytes(840), "840 B");
  assert.equal(core.formatBytes(8710), "8.71 kB");
  assert.equal(core.formatBytes(2.85e9), "2.85 GB");
  assert.equal(core.fileName(dl({ filename: "C:\\Users\\x\\a b.pdf" })), "a b.pdf");
  assert.equal(core.fileName(dl({ filename: "", url: "https://a.test/dir/pic%201.png" })), "pic 1.png");
});
