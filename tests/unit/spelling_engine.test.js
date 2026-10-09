// The offline spelling engine (src/modules/14-spelling.js, shipped as
// components/atlas/atlas-spelling.js). Ported from the Windows-era tier-2 and
// adversarial Python suites, which ran one Node process per word.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");

const FILE = path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas", "atlas-spelling.js");

function engine() {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(FILE, "utf8"), ctx);
  const api = ctx.__atlasSpelling;
  return {
    check: (w) => api.checkWord(w),
    suggest: (w, n = 3) => JSON.parse(JSON.stringify(api.getSuggestions(w, n) || [])).map((s) => s.toLowerCase()),
    wordAt: (value, caret) => api.getWordAtInput({ value, selectionStart: caret, selectionEnd: caret }),
    selected: (value) => api.getWordAtInput({ value, selectionStart: 0, selectionEnd: value.length }),
  };
}
const sp = engine();

/* Timing bars. On a quiet computer: 1 ms a suggestion and 50 ms for very long
   input. While the computer is busy (the test files run in parallel, and other
   work may be running), macOS can move this work to slower cores and the same
   engine measures about twice as slow, so the bars are three times looser then:
   still instant to a person, and still far below a real slowdown. */
const BUSY = os.loadavg()[0] / os.cpus().length > 0.5;
const SLACK = BUSY ? 3 : 1;
const busyNote = BUSY ? ", computer busy" : "";

test("correct words are accepted, whatever their case", () => {
  for (const w of ["search", "history", "download", "extension", "window", "browser", "atlas", "vivaldi", "tab",
    "SEARCH", "Search", "sEaRcH", "BROWSER", "VIVALDI"]) {
    assert.ok(sp.check(w), w);
  }
});

test("one-typo mistakes suggest the word", () => {
  for (const [typo, want] of [["serch", "search"], ["searrch", "search"], ["seurch", "search"], ["saerch", "search"],
    ["browsr", "browser"], ["tabb", "tab"]]) {
    assert.ok(sp.suggest(typo).includes(want), `${typo} -> ${sp.suggest(typo)}`);
  }
});

test("two-typo mistakes suggest the word, three suggestions at most", () => {
  for (const [typo, want] of [["sarch", "search"], ["windw", "window"], ["brower", "browser"]]) {
    const got = sp.suggest(typo);
    assert.ok(got.length <= 3, `${typo}: ${got}`);
    assert.ok(got.includes(want), `${typo} -> ${got}`);
  }
});

test("mixed-case mistakes are flagged and corrected", () => {
  for (const [typo, want] of [["Teh", "the"], ["TEH", "the"], ["tEh", "the"], ["Definately", "definitely"],
    ["DEFINATELY", "definitely"], ["dEfInAtElY", "definitely"], ["rEcIeVe", "receive"], ["SEPERATE", "separate"],
    ["SERCH", "search"], ["Serch", "search"], ["sEuRcH", "search"], ["BROWSR", "browser"], ["VIVALDII", "vivaldi"]]) {
    assert.ok(sp.suggest(typo).includes(want), `${typo} -> ${sp.suggest(typo)}`);
  }
  for (const w of ["SERCH", "Serch", "DEFINATELY", "BROWSR", "VIVALDII"]) assert.ok(!sp.check(w), w);
});

test("gibberish is not accepted and gets no suggestions", () => {
  for (const w of ["abcdefghijk", "zzqqwwxxvv", "qwertyuiopasdf", "supercalifragilistic", "xkjqpvwyz12345",
    "qqqqqqqqqqqq", "zzzzzzzzzzzz"]) {
    assert.ok(!sp.check(w), w);
    assert.deepEqual(sp.suggest(w), [], w);
  }
  for (const w of ["zzqqww", "123456789", "qwertyuiopasdfghjkl", "xkjqpvwy"]) assert.ok(sp.suggest(w).length <= 3, w);
});

test("empty, blank, symbol and non-Latin input is safe", () => {
  for (const w of ["", "   ", "\t", "\n", " \t \n "]) assert.deepEqual(sp.suggest(w), [], JSON.stringify(w));
  for (const w of ["!@#$%", "word!", "...test...", "(brackets)", "hyphen-word", "😀😁😂🤣", "🌍🚀✨", "hello👋world",
    "café", "naïve", "résumé", "日本語", "العربية", "русский", "!@#$%^&*()"]) {
    assert.doesNotThrow(() => sp.check(w), w);
    assert.ok(sp.suggest(w).length <= 3, w);
  }
});

test("very long input is rejected quickly", () => {
  for (const len of [1000, 10000, 100000]) {
    const w = "a".repeat(len);
    const t0 = process.hrtime.bigint();
    assert.ok(!sp.check(w));
    assert.deepEqual(sp.suggest(w), []);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 50 * SLACK, `length ${len} took ${ms.toFixed(1)} ms (limit ${50 * SLACK} ms${busyNote})`);
  }
});

test("addresses are never treated as words", () => {
  for (const u of ["google.com", "https://example.com/path", "http://localhost:8080", "vivaldi://settings", "user@example.com",
    "https://admin:pass@example.com:8080/path?q=test#anchor", "http://127.0.0.1:3000/api/v1", "192.168.1.1",
    "chrome://extensions", "file:///C:/Windows/System32/", "ftp://ftp.example.org/pub/files", "localhost:8080"]) {
    const at = sp.wordAt(u, 3);
    assert.ok(!at || !/[.:/@]/.test(at.word), `${u} -> ${at && at.word}`);
    assert.equal(sp.selected(u), null, `a selected address is not a word: ${u}`);
  }
});

test("suggestions are fast (well under a millisecond each)", () => {
  const words = ["serch", "browsr", "definately", "sarch", "windw", "zzqqww", "search", "12345", "teh", "seperate"];
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 500; i++) sp.suggest(words[i % words.length]);
  const avgMs = Number(process.hrtime.bigint() - t0) / 1e6 / 500;
  assert.ok(avgMs < SLACK, `average ${avgMs.toFixed(3)} ms (limit ${SLACK} ms${busyNote})`);
});
