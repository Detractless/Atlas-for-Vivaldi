# 006 - Social media filter: blocking

Settings > Focus > Content shield > Social media filter saves `socialFilter = { mode, parts }` (see
`payload/detractless/src/utils/socialFilter.js`). This spec is the part that makes the choices work on the sites.
NSFW detection is separate (spec 005).

## The contract

Settings lists 20 parts, and each part lists the sites it works on (`sites` in `socialFilter.js`). That is **46
(part, site) pairs**; each has a slideshow screenshot. The goal is exactly those 46 pairs, site by site. A site's
table either builds a pair (`parts[id]`) or says so in `todo: [id]` (an acknowledged gap, reported at the end).
`tests/unit/social_sites.test.js` enforces this, so Settings can never promise what is not built.

Modes: `off` does nothing. `parts` hides the chosen parts on the sites that have them. `all` blocks the sites
entirely (`background/socialBlock.js`, main frame only, subdomains included, no way through).

## How it works

- `src/modules/03-bridge-content-scripts.js` registers one persistent content script per site (`atlas-social-<key>`),
  at `document_start`, top frame only, for the site's hosts. Each is: `atlas-social-behaviors.js`,
  `atlas-social-guard.js`, `atlas-social-core.js`, then the site's table `atlas-social-<key>.js`
  (all in `payload/install-files/components/atlas/`). The table calls `__atlasSocial.run(table)` itself.
- The engine reads `socialFilter` from `chrome.storage.sync` (as the NSFW guard reads `nsfwAction`), follows
  `onChanged`, and for the chosen parts adds one `<style data-atlas-social="<part>">` per part. With the filter off,
  or a part not chosen, nothing is added to the page.
- It keeps `<html data-atlas-route="<route>">` current (the table's `route()` function; updated the moment the address changes (Navigation API, Back button, `#`
  changes), with a 300 ms check as the fallback) so a rule can name the pages it applies to.
- A single-page site keeps showing the old page until the new one has loaded. If the table has `settle`, the route just
  left is also put on `<html data-atlas-route-held>`, and each route rule has a twin for it, so the old page stays hidden
  until the `settle.events` event plus `settle.after` ms (or `settle.max` ms, default 5000, if the event never comes).
- Parts are **hidden, never removed** (`display:none !important`, or `visibility:hidden` with `hide: 'visibility'`).
- Health: match counts and guard trips per site and part, in `chrome.storage.local.atlas_social_health` (no page
  addresses). Read it from the Vivaldi profile on disk to see selector rot in real, signed-in browsing.

## A site table

```js
S.run({
  key: 'youtube', name: 'YouTube', live: false,          // live: false until the site passes review (see below)
  hosts: ['youtube.com'],                                 // must equal SITES in socialFilter.js
  settle: { events: ['yt-navigate-finish'], after: 250, max: 5000 },  // optional: the document event that says the new page is on screen
  route: function (path, search, host) { return 'home'; },// a short name per kind of page; 'other' for the rest
  landmarks: [{ sel: 'ytd-app' }, { sel: '#movie_player', on: ['watch'] }],  // must never be hidden
  smoke: ['ytd-masthead input[name="search_query"]'],     // must stay visible with every part on
  parts: {
    shortVideos: {
      css: ['ytd-reel-shelf-renderer', { sel: 'a[href^="/shorts/"]', on: ['home'] }],  // one selector per entry
      on: ['home', 'watch'],         // default routes for string entries; omit = every page
      redirect: { from: /^\/shorts\//, to: '/' },        // send the page away (a path on the site)
      act: function (ctx) { return ctx.helpers.keepOff('.ytp-autonav-toggle-button', isOn); },  // returns a stop()
      hide: 'visibility',            // optional: keep the box, hide the contents
      shadow: [{ host: 'shreddit-post', css: ['.vote'], on: ['post'] }],  // rules for inside a shadow root (see below)
      maxArea: 1,                    // feed parts that legitimately cover most of the window say 1
      maxMatches: 5000,              // a part whose lists are legitimately long raises the runaway cap (default 2000)
      english: true                  // only if a selector matches English text (aria-label etc.)
    }
  },
  todo: ['liveStreams']              // pairs from Settings that this table does not build yet
});
```

Rules (checked by `tests/unit/social_sites.test.js`):

- One selector per `css` entry: no top-level commas. A bad selector then drops only its own rule.
- No selector may be too broad (`body`, `main`, a bare tag, `[role=main]`), start at the page root, be a landmark,
  use uBlock-only syntax (`:has-text()`, `:contains()`, `##`), or depend on `style`/`src` attributes.
- Prefer stable hooks: custom element names, `data-testid`, `href` prefixes, `aria-*` roles. Attribute selectors on
  English labels (`aria-label`, `title`, `alt`) need `english: true` on the part.
- A redirect target must not be matched by another redirect's `from`.
- `landmarks` list what makes the page the page (app root, search box, the player). They are checked at run time too.

### Safety guard (run time)

A part is switched off for that page, and the trip recorded (`<html data-atlas-social-trips>`, health), when its
rule would hide `html`/`body`, a landmark or `smoke` selector (or something containing one), when one rule matches
more than `maxMatches` elements (default 2000), when a selector is not valid, or when the elements it hides cover more
than `maxArea` (default 40%) of the window. A trip lasts until the next kind of page (the route changes) or until the
part is switched off and on in Settings; then the part gets a fresh try.

### Shadow roots

A page style cannot reach inside a shadow root (Reddit keeps its vote rows and share buttons in them). A part's
`shadow` list puts its rules into the root of every `host` element (a custom element name), once each; one watcher
for the page picks up hosts that arrive as it scrolls, and `on` routes work through `:host-context(html[...])`.
Shadow rules go through the same lint, but not the run-time area guard (the elements are inside a component the
page owns); keep them to the exact element.

### What the engine never does

It never removes elements, never reads page text or addresses into storage, and adds nothing to the page while the
filter is off. The behaviours that do touch something (`keepOff` clicks YouTube's autoplay switch, which YouTube
remembers) give it back when the part is switched off. `pauseVideos` unmutes what it muted.

### Helpers for `act`

`ctx.helpers.every(ms, fn)`, `keepOff(selector, isOn)`, `stripTitleCount()` (the "(3)" in tab titles),
`pauseVideos(selector)`; each returns a stop function. `ctx.route()` is the current route.

## Reviewing a site against the real site

```
node scripts/social_live_check.mjs <site> [--page name] [--part id] [--port N]
```

Reads the plan `scripts/social_live/plans/<site>.mjs` (pages to open; parts expected on each; optional `hold`:
`{ part: selector }` to hover something first; `redirects`). Opens a throw-away signed-out Vivaldi, injects the
engine and the real table into an isolated world, and for each part records: the elements its selectors find and
how many are visible, then with the part on how many are visible and whether the guard tripped, with before/after
crops. Then every part on at once: landmarks and smoke selectors must stay visible. Output: `report.json`, JPEGs and a
trimmed `snapshot.html` per page under `/tmp/atlas-social-review/<site>/`.

`node scripts/social_fixtures.mjs <site>` turns a passing review into the offline fixtures
(`tests/fixtures/social/`) that `tests/unit/social_fixtures.test.js` replays.

**A site goes live** (`live: true` in its table and `LIVE_SITES` in `socialFilter.js`) when: the table tests pass;
the live review passes for every pair that is visible signed out; every part on at once leaves the landmarks and
smoke selectors visible with no guard trips; the pairs that only exist signed in are listed as such in the review
notes (they are proven only by the health log in real browsing).

## What was found out first (spikes), 2026-11-01

- A page script registered by Atlas reads `socialFilter` from `chrome.storage.sync` like the NSFW guard reads
  `nsfwAction`: yes, in a real Vivaldi with Atlas installed (`node scripts/social_e2e_check.mjs`).
- Time to the first style on a page: printed by that check as `data-atlas-social-ms` on `<html>`.
- Route changes inside single-page sites were first followed only by a 300 ms poll of `location.href`. Measured on YouTube
  (2026-11-01): up to 265 ms from the address changing to the route on `<html>` changing, 858 ms with the CPU 4x slower, long enough
  for a page the site shows from its cache (YouTube's home) to be on screen unhidden. Now the engine follows `currententrychange`
  (Navigation API), `popstate` and `hashchange` at once, and keeps the poll as the fallback.
- That was not the main flash. Recorded in a signed-in Vivaldi (2026-11-02), searching from YouTube's home by Enter and by the
  search button: the route changed 10 ms after the address, but YouTube kept the old home page on screen for another 0.8 to
  0.87 s (until `yt-navigate-finish`), and the home feed was visible for all of it, because its home-only rules had just
  stopped. Hence `settle` above.
- "Block social sites entirely": `webNavigation` + `tabs.update` to the gate page works, including redirects
  (`onCommitted`), short links, and tabs already open when the mode is switched on.
- Registered scripts are cached by the browser: a change to a site table takes effect after Vivaldi is restarted
  (Atlas's own registration happens at startup). A running Vivaldi keeps the old scripts until then.
- A new Vivaldi tab answers no DevTools command until it has navigated, and never answers `Page.enable`: the
  review tools navigate first and use an isolated world (see `scripts/social_live/review.mjs`).

## The 46 pairs and where they come from

B = a permissively licensed source exists, R = reference only (non-commercial / unlicensed; fine for a private
project, rewrite rather than paste), W = write it ourselves. Source repos (read them on GitHub with `gh api`):

- YouTube: `lawrencehook/remove-youtube-suggestions` (RYS, MPL-2.0, `main.css` and `html/` js), `bpavlina/ublock-hide-yt-shorts`
  (MIT), `insin/control-panel-for-youtube` (R, unlicensed), userstyles.world "YouTube Tweaks" (MIT).
- Reddit: `fabiomolignoni/FrontFilter` (MPL-2.0, `selectors.js`), `djm30/Distraction-Free-Reddit` (MIT),
  `joelacus/RedditEnhancer` (R).
- X: `insin/control-panel-for-twitter` (MIT, `script.js` `hide*` settings and css), `typefully/minimal-twitter` (MIT).
- TikTok: `shbernal/tiktok-feed-blocker` (MIT, `selectors.ts`), `4tru/bettertiktok` (MIT).
- Instagram, Facebook: `malekwael229/FocusTube` (MIT), `scottylad007/zuckless` (MIT), `InfectedDuck/ReelLess` (MIT),
  `jordwest/news-feed-eradicator` (R, AGPL: `src/sitelist/`), `gerwld/igplus-extension` (R, CC BY-NC-ND).
- Twitch: `FrankerFaceZ/FrankerFaceZ` (Apache-2.0, `css_tweaks`), `BevizLaszlo/UBlock-Filters-for-Social-Media` (MIT).
- Snapchat: `InfectedDuck/ReelLess` (MIT, route blocks).

| Site | Part: source |
| --- | --- |
| YouTube (12) | suggested B RYS; shortVideos B RYS+bpavlina; autoplay B RYS (click the autoplay toggle); liveStreams B RYS (chat, live badge); upNext B RYS (end screen, related); hoverPreviews B RYS; likes B RYS; follow B YT Tweaks (partial); comments B RYS+bpavlina; share B YT Tweaks/RYS; counts B RYS; followers B RYS |
| Reddit (7) | homeFeed B FrontFilter; suggested B FrontFilter; trending B FrontFilter; likes B FrontFilter; comments B FrontFilter; share R RedditEnhancer; counts B FrontFilter |
| X (5) | trending B CPFT; whoToFollow B CPFT; follow W; followers B CPFT; newPosts B CPFT |
| TikTok (7) | homeFeed B tiktok-feed-blocker; shortVideos B tiktok-feed-blocker; likes W; follow W; share W; posting B ReelLess (upload route); counts W |
| Instagram (8) | whoToFollow B FocusTube; stories B FocusTube; shortVideos B FocusTube+ReelLess; likes W; follow W; messages B IG DM hider (recheck); counts R IGPlus; followers R IGPlus |
| Facebook (4) | homeFeed B Zuckless; stories B Zuckless; posting B Zuckless; badges W |
| Twitch (2) | liveStreams W (FFZ as a map); badges B FFZ (extract the selector) |
| Snapchat (1) | shortVideos B ReelLess (Spotlight route) |

Part ids and their Settings meaning: see `GROUPS` in `socialFilter.js`.

## Provenance

Selectors are facts about someone else's page markup; each table credits the projects its selectors came from in
its header comment. Everything is rewritten into our format, nothing pasted as a file. The project is private; if
it is ever shared, re-clear the R sources (and RYS/FrontFilter/LeechBlock-style MPL files if copied verbatim).

## Status

Tracked in `review-2026-11.md` (written when the sites are reviewed).
