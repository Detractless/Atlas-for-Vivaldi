// src/services/storage.js — chrome.storage, the one way the bundles use it.
// Every read and write goes through here, so a failure (chrome.runtime.lastError,
// or an area that does not exist in this context) is logged once, here, and the
// caller still gets an answer: reads resolve to {} and writes resolve when done.
import { warn } from './log.js';

function call(area, op, arg) {
  const chrome = globalThis.chrome;
  return new Promise((resolve) => {
    const done = (result) => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) warn(`chrome.storage.${area}.${op} failed`, err);
      resolve(result);
    };
    try {
      if (arg === undefined) chrome.storage[area][op](done);
      else chrome.storage[area][op](arg, done);
    } catch (e) {
      warn(`chrome.storage.${area}.${op} threw`, e);
      resolve(undefined);
    }
  });
}

/** Values for `keys` (a key, a list of keys, or null for everything). Never rejects. */
export const storageGet = (area, keys) => call(area, 'get', keys).then((r) => r || {});
export const storageSet = (area, items) => call(area, 'set', items);
export const storageRemove = (area, keys) => call(area, 'remove', keys);
export const storageClear = (area) => call(area, 'clear');
