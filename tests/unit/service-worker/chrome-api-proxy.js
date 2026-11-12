"use strict";

function anyApi(name, listeners, calls) {
  return new Proxy(function () {}, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (prop === "addListener") return (fn) => (listeners[name] = listeners[name] || []).push(fn);
      return anyApi(`${name}.${String(prop)}`, listeners, calls);
    },
    apply(_, __, args) {
      calls.push({ name, args });
      const cb = args.find((a) => typeof a === "function");
      if (cb) Promise.resolve().then(() => cb(undefined));
      return Promise.resolve(undefined);
    },
  });
}

module.exports = { anyApi };
