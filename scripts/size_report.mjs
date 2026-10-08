// Size limits for hand-written code: files under 400 lines, functions under 80.
//
//   node scripts/size_report.mjs            -> list everything over the limits
//
// What counts:
// - Every tracked .js/.mjs/.css/.html/.py file, except generated output (dist/,
//   atlas.js, atlas-spelling.js), vendored code (vendor/), and _old/.
// - A function is any JS function or Python def. A wrapper that encloses a whole
//   file - `(function () { ... })()` as the file's only statement - is file
//   scope, not a function, so its body is not counted as one long function.
//   Python classes are containers, not functions; their methods are counted.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MAX_FILE_LINES = 400;
export const MAX_FUNCTION_LINES = 80;

const GENERATED = new Set([
  "payload/install-files/atlas.js",
  "payload/install-files/components/atlas/atlas-spelling.js",
]);

export function isMeasured(rel) {
  if (!/\.(js|mjs|cjs|css|html|py)$/.test(rel)) return false;
  if (GENERATED.has(rel)) return false;
  return !/(^|\/)(_old|dist|vendor|node_modules)\//.test(rel);
}

export function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean).filter(isMeasured).filter((f) => fs.existsSync(path.join(ROOT, f)));
}

export function lineCount(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").length;
}

function parseJs(text) {
  for (const sourceType of ["module", "script"]) {
    try {
      return acorn.parse(text, { ecmaVersion: "latest", sourceType, locations: true, allowHashBang: true });
    } catch (e) { /* try the other source type */ }
  }
  return null;
}

/** The function node of `(function(){...})()` / `(() => {...})()` when it is the whole file. */
function fileWrapper(ast) {
  const body = ast.body.filter((s) => s.type !== "EmptyStatement" && !(s.type === "ExpressionStatement" && s.directive));
  if (body.length !== 1 || body[0].type !== "ExpressionStatement") return null;
  let e = body[0].expression;
  if (e.type === "UnaryExpression") e = e.argument;
  if (e.type !== "CallExpression") return null;
  const fn = e.callee.type === "MemberExpression" ? e.callee.object : e.callee;
  return /Function/.test(fn.type) ? fn : null;
}

export function jsFunctions(text) {
  const ast = parseJs(text);
  if (!ast) return null;
  const wrapper = fileWrapper(ast);
  const out = [];
  walk.full(ast, (node) => {
    if (!/Function/.test(node.type) || node === wrapper) return;
    out.push({ line: node.loc.start.line, lines: node.loc.end.line - node.loc.start.line + 1, name: node.id ? node.id.name : "" });
  });
  return out;
}

export function pyFunctions(file) {
  const script = [
    "import ast,json,sys",
    "t=ast.parse(open(sys.argv[1],encoding='utf-8').read())",
    "print(json.dumps([[n.lineno,n.end_lineno-n.lineno+1,n.name] for n in ast.walk(t) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]))",
  ].join("\n");
  const out = execFileSync("python3", ["-c", script, file], { encoding: "utf8" });
  return JSON.parse(out).map(([line, lines, name]) => ({ line, lines, name }));
}

/** Every file and function over the limits: [{ rel, kind, lines, line?, name? }]. */
export function report(files = trackedFiles()) {
  const found = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const text = fs.readFileSync(abs, "utf8");
    const n = lineCount(text);
    if (n > MAX_FILE_LINES) found.push({ rel, kind: "file", lines: n });
    let fns = [];
    if (/\.(m?js|cjs)$/.test(rel)) {
      fns = jsFunctions(text);
      if (!fns) { found.push({ rel, kind: "parse-error", lines: 0 }); continue; }
    } else if (rel.endsWith(".py")) {
      fns = pyFunctions(abs);
    }
    for (const f of fns) {
      if (f.lines > MAX_FUNCTION_LINES) found.push({ rel, kind: "function", lines: f.lines, line: f.line, name: f.name });
    }
  }
  return found.sort((a, b) => b.lines - a.lines);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv[2];
  const rows = report().filter((r) => !only || r.rel.startsWith(only));
  for (const r of rows) {
    console.log(r.kind === "function" ? `fn   ${r.lines}  ${r.rel}:${r.line} ${r.name}` : `${r.kind} ${r.lines}  ${r.rel}`);
  }
  console.log(`${rows.length} over the limits (file ${MAX_FILE_LINES}, function ${MAX_FUNCTION_LINES})`);
}
