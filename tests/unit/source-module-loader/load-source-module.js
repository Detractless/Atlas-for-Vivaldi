"use strict";

const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "..", "..", "..", "payload", "detractless", "src");

function loadSourceModule(rel) {
  const out = esbuild.buildSync({ entryPoints: [path.join(SRC, rel)], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
  const module = { exports: {} };
  new Function("module", "exports", "require", out)(module, module.exports, require);
  return module.exports;
}

module.exports = { loadSourceModule };
