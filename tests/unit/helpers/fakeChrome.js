// A small stand-in for the chrome.* APIs the new tab uses, built inside a
// jsdom window. Storage behaves like the real thing: values are copied on the
// way in and out, callbacks run asynchronously, and every write fires
// chrome.storage.onChanged with { key: { oldValue, newValue } }.
"use strict";

const later = (fn) => Promise.resolve().then(fn);

function respond(result, cb) {
  return later(() => {
    if (typeof cb === "function") cb(result);
    return result;
  });
}

/** One storage area (sync, local or session). `emit(changes)` fires onChanged. */
function makeStorageArea(clone, initial, emit) {
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
  const removeKeys = (keys) => {
    const changes = {};
    for (const k of keys) {
      if (k in data) {
        changes[k] = { oldValue: clone(data[k]) };
        delete data[k];
      }
    }
    return changes;
  };
  return {
    _data: data,
    get(keys, cb) {
      if (typeof keys === "function") { cb = keys; keys = null; }
      return respond(pick(keys), cb);
    },
    set(items, cb) {
      const changes = {};
      for (const [k, v] of Object.entries(items || {})) {
        changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
        data[k] = clone(v);
      }
      return respond(undefined, cb).then(() => emit(changes));
    },
    remove(keys, cb) {
      const changes = removeKeys(typeof keys === "string" ? [keys] : keys || []);
      return respond(undefined, cb).then(() => emit(changes));
    },
    clear(cb) {
      const changes = removeKeys(Object.keys(data));
      return respond(undefined, cb).then(() => emit(changes));
    },
  };
}

function makeRuntime(window, clone, sentMessages, messageListeners) {
  return {
    id: "mpognobbkildjkofajifpdfhcoklimli",
    lastError: undefined,
    getManifest: () => ({ version: "2.4.2", manifest_version: 3 }),
    getURL: (p) => new window.URL(p, window.location.href).href,
    sendMessage(msg, cb) {
      sentMessages.push(clone(msg));
      return respond(undefined, cb);
    },
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
  };
}

function makeFakeChrome(window, seed = {}) {
  const clone = (v) => (v === undefined ? undefined : window.JSON.parse(JSON.stringify(v)));
  const changeListeners = [];
  const messageListeners = [];
  const sentMessages = [];
  const searches = [];
  const emitFor = (areaName) => (changes) => {
    if (!Object.keys(changes).length) return;
    for (const fn of changeListeners.slice()) fn(clone(changes), areaName);
  };

  const chrome = {
    storage: {
      sync: makeStorageArea(clone, seed.sync, emitFor("sync")),
      local: makeStorageArea(clone, seed.local, emitFor("local")),
      session: makeStorageArea(clone, seed.session, emitFor("session")),
      onChanged: {
        addListener: (fn) => changeListeners.push(fn),
        removeListener: (fn) => {
          const i = changeListeners.indexOf(fn);
          if (i >= 0) changeListeners.splice(i, 1);
        },
      },
    },
    runtime: makeRuntime(window, clone, sentMessages, messageListeners),
    tabs: {
      query(q, cb) { return respond(window.JSON.parse("[]"), cb); },
      sendMessage() { return later(() => undefined); },
      create() { return later(() => ({})); },
      update() { return later(() => ({})); },
    },
    search: { query(opts) { searches.push(clone(opts)); } },
    extension: { isAllowedFileSchemeAccess: (cb) => later(() => cb(false)) },
  };

  // Test-side helpers (not part of the chrome API).
  const control = {
    sentMessages,
    searches,
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
