"use strict";

const HTML = `<!doctype html><html><head><title>T</title></head><body>
  <div id="app"><header id="search"><input id="q"></header>
  <main id="feed"><div class="short">s1</div><div class="short">s2</div><div class="like">l</div></main>
  <aside id="rail"><div class="who">w</div></aside></div></body></html>`;

function table(extra) {
  return Object.assign({
    key: 'demo', name: 'Demo', live: true, hosts: ['example.test'],
    route: (path) => (path === '/' ? 'home' : path.startsWith('/watch') ? 'watch' : 'other'),
    landmarks: [{ sel: '#app' }, { sel: '#search' }, { sel: '#feed', on: ['home'] }],
    parts: {
      shortVideos: { css: ['.short'] },
      whoToFollow: { css: ['.who'], on: ['home'] },
      likes: { css: ['.like'] },
    },
  }, extra || {});
}

const on = (parts) => ({ mode: 'parts', parts });

module.exports = { HTML, table, on };
