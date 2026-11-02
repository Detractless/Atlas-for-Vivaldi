// A small Chrome DevTools Protocol client and a launcher for a throw-away, signed-out Vivaldi.
// The real Vivaldi is never touched: the temporary one has its own profile folder, which is deleted on exit.
import fs from "fs";
import { spawn, execFileSync } from "child_process";

export const VIVALDI = "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.onmessage = (m) => this.onMessage(JSON.parse(m.data));
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("cannot connect to " + url)); });
    return new Cdp(ws);
  }

  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      return;
    }
    for (const fn of this.handlers) fn(msg);
  }

  /** Send a command. Note: on a new Vivaldi tab, Page.enable and Runtime.enable never answer; navigate first, do not enable. */
  send(method, params = {}, timeoutMs = 45000) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method} did not answer in ${timeoutMs} ms`)); }, timeoutMs);
      this.pending.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    });
  }

  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch (e) { /* already closed */ } }
}

/** Start a temporary Vivaldi with remote debugging on `port` and wait until it answers. */
export async function launch({ port, dir }) {
  fs.mkdirSync(dir, { recursive: true });
  const proc = spawn(VIVALDI, [
    "--user-data-dir=" + dir, "--remote-debugging-port=" + port, "--remote-allow-origins=*",
    "--no-first-run", "--no-default-browser-check", "--use-mock-keychain", "--password-store=basic",
    "--window-size=1400,900", "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); return proc; } catch (e) { await sleep(500); }
  }
  throw new Error("the temporary Vivaldi did not start");
}

/** Close the temporary Vivaldi and delete its profile. Only processes using `dir` are touched. */
export function shutdown(dir) {
  try { execFileSync("pkill", ["-f", "user-data-dir=" + dir]); } catch (e) { /* nothing was running */ }
  setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 1500);
}

/** A new tab, as a connected client. */
export async function newTab(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  return { cdp, id: target.id };
}

export async function closeTab(port, tab) {
  tab.cdp.close();
  try { await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`); } catch (e) { /* gone already */ }
}
