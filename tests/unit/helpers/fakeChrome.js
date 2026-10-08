// A small stand-in for the chrome.* APIs the new tab uses, built inside a
// jsdom window. Storage behaves like the real thing: values are copied on the
// way in and out, callbacks run asynchronously, and every write fires
// chrome.storage.onChanged with { key: { oldValue, newValue } }.
"use strict";

function makeFakeChrome(window, seed = {}) {
  const clone = (v) => (v === undefined ? undefined : window.JSON.parse(JSON.stringify(v)));
  const later = (fn) => Promise.resolve().then(fn);
  const changeListeners = [];
  const messageListeners = [];
  const sentMessages = [];

  function emit(changes, areaName) {
    if (!Object.keys(changes).length) return;
    for (const fn of changeListeners.slice()) fn(clone(changes), areaName);
  }

  function area(areaName, initial) {
    const data = clone(initial || {});
    const pick = (keys) => {
      if (keys === null || keys === undefined) return clone(data);
      if (typeof keys === "string") keys = [keys];
      const out = {};
      if (Array.isArray(keys)) {
        for (const k of keys) if (k in data) out[k] = clone(data[k]);
        return out;
      }
      for (const [k, def] of Object.entries(keys)) out[k] = k in data ? clone(data[k]) : clone(def);
      return out;
    };
    const run = (result, cb) => later(() => {
      if (typeof cb === "function") cb(result);
      return result;
    });
    return {
      _data: data,
      get(keys, cb) {
        if (typeof keys === "function") { cb = keys; keys = null; }
        return run(pick(keys), cb);
      },
      set(items, cb) {
        const changes = {};
        for (const [k, v] of Object.entries(items || {})) {
          changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
          data[k] = clone(v);
        }
        return run(undefined, cb).then(() => emit(changes, areaName));
      },
      remove(keys, cb) {
        const changes = {};
        for (const k of typeof keys === "string" ? [keys] : keys || []) {
          if (k in data) {
            changes[k] = { oldValue: clone(data[k]) };
            delete data[k];
          }
        }
        return run(undefined, cb).then(() => emit(changes, areaName));
      },
      clear(cb) {
        const changes = {};
        for (const k of Object.keys(data)) {
          changes[k] = { oldValue: clone(data[k]) };
          delete data[k];
        }
        return run(undefined, cb).then(() => emit(changes, areaName));
      },
    };
  }

  const chrome = {
    storage: {
      sync: area("sync", seed.sync),
      local: area("local", seed.local),
      session: area("session", seed.session),
      onChanged: {
        addListener: (fn) => changeListeners.push(fn),
        removeListener: (fn) => {
          const i = changeListeners.indexOf(fn);
          if (i >= 0) changeListeners.splice(i, 1);
        },
      },
    },
    runtime: {
      id: "mpognobbkildjkofajifpdfhcoklimli",
      lastError: undefined,
      getManifest: () => ({ version: "2.4.2", manifest_version: 3 }),
      getURL: (p) => new window.URL(p, window.location.href).href,
      sendMessage(msg, cb) {
        sentMessages.push(clone(msg));
        return later(() => {
          if (typeof cb === "function") cb(undefined);
          return undefined;
        });
      },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
    },
    tabs: {
      query(q, cb) { return later(() => { const r = window.JSON.parse("[]"); if (cb) cb(r); return r; }); },
      sendMessage() { return later(() => undefined); },
      create() { return later(() => ({})); },
      update() { return later(() => ({})); },
    },
    search: { query() {} },
    extension: { isAllowedFileSchemeAccess: (cb) => later(() => cb(false)) },
  };

  // Test-side helpers (not part of the chrome API).
  const control = {
    sentMessages,
    /** Deliver a runtime message the way another extension page would. */
    deliver(msg) {
      const replies = [];
      for (const fn of messageListeners.slice()) fn(clone(msg), {}, (r) => replies.push(r));
      return replies;
    },
  };
  return { chrome, control };
}

module.exports = { makeFakeChrome };
