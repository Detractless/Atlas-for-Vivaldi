// Finds every chrome.storage key a JS file names literally:
//   chrome.storage.<area>.get / set / remove (and storage[area].x with a literal area),
//   and the wrappers in services/storage.js: storageGet('<area>', keys) and friends
// The first argument may be a string, an array of strings, or an object whose
// property names are the keys. A computed key or a bare identifier resolves when
// it names a `const`/`var` string in the same file. Anything else is reported as
// "dynamic" so a test can decide whether to accept it.
"use strict";

const fs = require("fs");
const acorn = require("acorn");
const walk = require("acorn-walk");

const WRAPPERS = new Set(["storageGet", "storageSet", "storageRemove", "storageClear"]);

function parse(text) {
  for (const sourceType of ["module", "script"]) {
    try { return acorn.parse(text, { ecmaVersion: "latest", sourceType, allowHashBang: true }); } catch (e) { /* next */ }
  }
  return null;
}

function stringConsts(ast) {
  const out = new Map();
  walk.simple(ast, {
    VariableDeclarator(n) {
      if (n.id.type === "Identifier" && n.init && n.init.type === "Literal" && typeof n.init.value === "string") {
        out.set(n.id.name, n.init.value);
      }
    },
  });
  return out;
}

/** "sync" for chrome.storage.sync.get, storage.local.set, chrome.storage["session"].remove ... */
function areaOf(callee) {
  if (callee.type !== "MemberExpression") return null;
  const op = callee.property.name || callee.property.value;
  if (!["get", "set", "remove"].includes(op)) return null;
  const area = callee.object;
  if (area.type !== "MemberExpression") return null;
  const name = area.computed ? (area.property.type === "Literal" ? area.property.value : null) : area.property.name;
  if (!["sync", "local", "session"].includes(name)) return null;
  const store = area.object;
  const storeName = store.type === "MemberExpression" ? store.property.name : store.name;
  return storeName === "storage" ? { area: name, op } : null;
}

function keysOfArg(arg, consts, dynamic) {
  const one = (n) => {
    if (!n) return [];
    if (n.type === "Literal" && typeof n.value === "string") return [n.value];
    if (n.type === "Identifier" && consts.has(n.name)) return [consts.get(n.name)];
    dynamic.push(n.type === "Identifier" ? n.name : n.type);
    return [];
  };
  if (!arg) return [];
  if (arg.type === "ArrayExpression") return arg.elements.flatMap(one);
  if (arg.type === "ObjectExpression") {
    return arg.properties.flatMap((p) => {
      if (p.type !== "Property") { dynamic.push("spread"); return []; }
      if (!p.computed) return [p.key.name || String(p.key.value)];
      return one(p.key);
    });
  }
  return one(arg);
}

/** { sync: Set, local: Set, session: Set, dynamic: [{area, what}] } for one file. */
function scanFile(file) {
  const result = { sync: new Set(), local: new Set(), session: new Set(), dynamic: [] };
  const ast = parse(fs.readFileSync(file, "utf8"));
  if (!ast) return result;
  const consts = stringConsts(ast);
  walk.simple(ast, {
    CallExpression(n) {
      let where = areaOf(n.callee), keysArg = n.arguments[0];
      // The bundles go through services/storage.js: storageGet('sync', keys) ...
      if (!where && n.callee.type === "Identifier" && WRAPPERS.has(n.callee.name)) {
        const a = n.arguments[0];
        if (a && a.type === "Literal" && ["sync", "local", "session"].includes(a.value)) {
          where = { area: a.value };
          keysArg = n.arguments[1];
        }
      }
      if (!where || n.callee.name === "storageClear") return;
      const dynamic = [];
      for (const k of keysOfArg(keysArg, consts, dynamic)) result[where.area].add(k);
      for (const what of dynamic) result.dynamic.push({ area: where.area, what });
    },
  });
  return result;
}

module.exports = { scanFile };
