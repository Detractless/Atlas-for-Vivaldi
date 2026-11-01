// Field clues for Autofill (components/atlas/atlas-field-clues.js): which fields a page has, and the one line of clues
// the autofill model reads for each. Loaded into a jsdom page the way the content script is. The training script runs
// the same file over saved pages, so what these tests pin down is also what the model learns from.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SCRIPT = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas", "atlas-field-clues.js"), "utf8");

function page(body) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${body}</body>`, { url: "https://shop.example.com/checkout", runScripts: "outside-only" });
  dom.window.eval(SCRIPT);
  const fc = dom.window.__atlasFieldClues;
  const doc = dom.window.document;
  return { dom, doc, fc, line: (sel) => fc.clueLine(doc.querySelector(sel)), clues: (sel) => fc.cluesFor(doc.querySelector(sel)) };
}

test("a labelled field: kind, label, and its name and id as words", () => {
  const p = page(`<h2>Shipping address</h2><form>
    <label for="fn">First Name</label><input id="fn" name="billing_firstName" type="text">
    <label for="em">Email</label><input id="em" name="email" type="email"></form>`);
  assert.equal(p.line("#fn"), "kind text · label First Name · name billing first name · id fn · section Shipping address");
  assert.equal(p.line("#em"), "kind email · label Email · id em · section Shipping address");
});

test("never in the line: the value, data-* attributes or autocomplete (which still rides along for the rules)", () => {
  const p = page(`<label>Zip <input name="zip" value="90210" autocomplete="postal-code" data-moz-autofill-type="postal-code" data-fathom="zip"></label>`);
  const line = p.line("input");
  for (const gone of ["90210", "postal-code", "moz", "fathom"]) assert.ok(!line.includes(gone), `${gone} leaked: ${line}`);
  assert.equal(p.clues("input").autocomplete, "postal-code");
  assert.match(line, /label Zip/);
});

test("labels from aria-labelledby, a wrapping label, aria-label, then title", () => {
  const p = page(`<span id="t">Phone number</span><input id="a" aria-labelledby="t">
    <div><label>City <input id="b"></label></div><div><input id="c" aria-label="Postcode"></div><div><input id="d" title="Company"></div>`);
  assert.equal(p.clues("#a").label, "Phone number");
  assert.equal(p.clues("#b").label, "City");
  assert.equal(p.clues("#c").label, "Postcode");
  assert.equal(p.clues("#d").label, "Company");
});

test("a label that points at a wrapper, not the field, is still read as the text beside it", () => {
  // the shape of a real saved checkout page: <label for> names the wrapping span, so the input has no label of its own
  const p = page(`<form><div><span id="firstName"><label for="firstName"><span>First Name</span></label><input name="firstName"></span></div>
    <div><span id="lastName"><label for="lastName">Last Name</label><input name="lastName"></span></div></form>`);
  assert.equal(p.clues("[name=firstName]").label, "");
  assert.equal(p.clues("[name=firstName]").near, "First Name");
  assert.equal(p.clues("[name=lastName]").near, "Last Name");
});

test("a table row holding one field: the cell before it is the text beside it", () => {
  const p = page(`<table><tr><td>Street address</td><td><input name="f1"></td></tr><tr><td>Town:</td><td><input name="f2"></td></tr></table>`);
  assert.equal(p.clues("[name=f1]").near, "Street address");
  assert.equal(p.clues("[name=f2]").near, "Town:");
});

test("text outside the field's box: what lies between the previous field and this one, nothing earlier", () => {
  const p = page(`<form><p>Street address</p><div><input name="f1"></div><p>Town:</p><div><input name="f2"></div></form>`);
  assert.equal(p.clues("[name=f1]").before, "Street address");
  assert.equal(p.clues("[name=f2]").before, "Town:");
  assert.equal(p.line("[name=f2]"), "kind text · before Town:");
});

test("a select lists its first options; a short maxlength is kept, a long one is not", () => {
  const p = page(`<fieldset><legend>Billing</legend><select name="ctry"><option value=""></option><option>Canada</option>
    <option>France</option><option>Germany</option><option>Japan</option><option>Spain</option></select>
    <input name="cvc" maxlength="4"><input name="street" maxlength="140"></fieldset>`);
  const c = p.clues("select");
  assert.equal(c.kind, "select");
  assert.equal(c.options, "Canada, France, Germany, Japan");
  assert.equal(c.section, "Billing");
  assert.equal(p.clues("[name=cvc]").max, "4");
  assert.equal(p.clues("[name=street]").max, "");
});

test("fieldsIn: fillable kinds only, in page order, open shadow roots included; hiding is left to the caller", () => {
  const p = page(`<form><input id="a"><input type="hidden" id="h"><input type="submit" id="s"><input type="checkbox" id="c">
    <input id="gone" style="display:none"><div hidden><input id="gone2"></div><input id="off" disabled>
    <textarea id="t"></textarea><select id="sel"><option>x</option></select><input type="password" id="pw"><x-box id="host"></x-box></form>`);
  const host = p.doc.getElementById("host");
  host.attachShadow({ mode: "open" }).innerHTML = `<label for="in">Inner email</label><input id="in" type="email">`;
  const ids = (visible) => Array.from(p.fc.fieldsIn(p.doc, visible), (el) => el.id);
  assert.deepEqual(ids(), ["a", "gone", "gone2", "t", "sel", "pw", "in"]);
  assert.equal(p.fc.cluesFor(host.shadowRoot.getElementById("in")).label, "Inner email");
  assert.deepEqual(ids((el) => !/gone/.test(el.id)), ["a", "t", "sel", "pw", "in"]);
});

test("machine-made names fade to their letter runs, and a long line is cut to 300 characters, least useful parts first", () => {
  assert.equal(p0().fc.idWords("r:r:8:m:r:1:cr:3:c:pr:1:container:fs:i:input"), "cr pr container fs input");
  const long = "abcdefghijklmnopqrst ".repeat(20);
  const p = page(`<h2>Heading</h2><div><label for="x">${long}</label><input id="x" name="a_b_c" placeholder="${long}"></div>`);
  const line = p.line("#x");
  assert.ok(line.length <= 300, line.length);
  assert.ok(line.startsWith("kind text · label abcdefghijklmnopqrst"));
  assert.ok(!line.includes("section"), "the section heading drops before the label does");
  assert.ok(!line.includes("placeholder"), "so does the placeholder, when the label alone is long");
});

function p0() { return page(""); }
