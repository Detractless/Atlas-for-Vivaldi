# 006 - YouTube table: review against the real site (2026-11-01)

Table: `payload/install-files/components/atlas/atlas-social-youtube.js` (`live: true` (switched on after the lead re-ran the review independently): the lead flips it).
Plan: `scripts/social_live/plans/youtube.mjs`. Output of the last run: `/tmp/atlas-social-review/youtube/` (`report.json`, before/after
JPEGs and `snapshot.html` per page). Fixtures: `tests/fixtures/social/youtube*`.

Re-run (about 9 minutes, one throw-away Vivaldi, 12 page loads):

```
node scripts/social_live_check.mjs youtube --port 9411
node scripts/social_fixtures.mjs youtube
node --test tests/unit/social_sites.test.js tests/unit/social_fixtures.test.js tests/unit/social_core.test.js
```

## Result

All 12 pairs exist on signed-out YouTube and all 12 passed in the last run: selectors found something visible, nothing was
visible with the part on, no guard trip. On every page the ALL ON line showed the landmarks and the search box still shown, no
trips (one page error on the live-stream page: "ResizeObserver loop completed with undelivered notifications", a harmless browser
notice that the tool counts as an error). `live` page: all 12 parts on at once, landmarks and search box shown. The table
tests, fixture replay and engine tests pass (36 of 36). Nothing is left in `todo`.

Two kinds of proof are used, and the table below says which:

- **crop**: the tool's own check, with before/after crops (selectors visible before, none after).
- **scripted**: a `checks` entry in the plan, for things that only exist after an action (comments load when scrolled to, a
  hover preview needs the pointer, an end screen needs the end of the video, autoplay is a switch). It turns the part on, makes
  the page show the thing, and requires 0 visible with the part on, and more than 0 with the part's style switched off for a
  moment (proof that the page really showed it). There is no crop for these.

## The pairs

Sources are credited in the table's header comment. RYS = remove-youtube-suggestions, CPFY = control-panel-for-youtube,
bp = bpavlina/ublock-hide-yt-shorts, YTT = "YouTube Tweaks" (userstyles 9174), jo = johnny-official filters; "ours" = found
on the live page and written for this table. Counts are visible elements before -> after.

| Pair | Status | Sources | What was seen | Caveats |
| --- | --- | --- | --- | --- |
| suggested | verified-live | home grid: RYS; related sidebar: RYS, CPFY; search shelves: RYS, CPFY; search knowledge-panel card: ours | crop: home feed 1->0, watch sidebar 2->0, live-page sidebar 2->0, search "minecraft" 2->0 (the right-hand video-game card with related videos) | Home feed is empty signed out until a video has been watched (the plan watches first). |
| shortVideos | verified-live | RYS, bp, CPFY, YTT, jo; redirect: ours | crop: home shelf+items 15->0, channel 9->0 (shelf, Shorts tab, side-menu entry), search shelf 3->0. Redirect: `/shorts/<id>` and `/@YouTube/shorts` both land on `/` | A channel's Shorts tab holds hundreds of items (525 measured), more than the guard's 400 per selector, so that tab is a redirect, not a rule. Side-menu entry and tab are found by English title (`english: true`). |
| autoplay | verified-live (scripted) | RYS `disable_autoplay` (click the toggle) | scripted: toggle `aria-checked` true -> false with the part on, the "Up next" countdown (shown while autoplay is on) is gone; the check turns the toggle on itself first, as YouTube does, so it cannot pass by luck. Snapshot of a fresh watch page shows `aria-checked="true"`. | YouTube remembers the toggle, so autoplay stays off after the part is switched off (the filter does not put it back). Channel-trailer pause (RYS `disable_channel_autoplay`) is source-only: @YouTube has no trailer signed out. |
| liveStreams | verified-live | RYS, CPFY, YTT; side-menu entry: ours | crop: live page chat + "Live chat" teaser + live items in the sidebar 4->0, search of live streams 21->0, home 1->0 (side-menu "Live"), channel 1->0, search 1->0 | Live badges on feed items (`.ytBadgeShapeThumbnailLive` rows) were seen on the home feed in earlier runs (3 to 7 items), not in the last one. The channel's own "Live" tab is not hidden. Chat is found by `ytd-live-chat-frame` and `#chat-container`. |
| upNext | verified-live | RYS, CPFY, ours (countdown) | crop: end screen of a video that has just ended 1->0 (tiles of other videos); scripted: end screen after jumping to the end 0 with the part on. With autoplay on the end shows a countdown, with it off tiles; both are covered. | Hides only on the watch route. End cards (`.ytp-ce-element`) and the pause overlay are source-only: this video has neither. The info-card button and teaser are present but never visible here. `maxArea: 1`, since the end screen covers the whole player. |
| hoverPreviews | verified-live | RYS, jo; markup: ours | crop: home feed, pointer on a thumbnail, a muted preview with captions playing 1->0 (afterwards only the still thumbnail); scripted: search results, 0 with the part on, visible with it off | The review window has no focus, which YouTube checks, so previews only play in the crop on some pages; the scripted check works everywhere. `ytd-thumbnail-overlay-loading-preview-renderer` is source-only. Pausing the hidden preview's video (`pauseVideos`) is not separately verified. |
| likes | verified-live | YTT, RYS (count); markup and comments: ours | crop: watch/live like+dislike pill 3->0, Shorts heart 1->0; scripted: like buttons on comment threads 0 with the part on, visible with it off | `ytd-sentiment-bar-renderer` exists but is hidden signed out (source-only). |
| follow | verified-live | YTT, RYS; channel, search, Shorts: ours | crop: watch Subscribe 2->0, channel header actions 1->0, search channel result 2->0, Shorts channel bar 1->0, live page 2->0 | Hides the channel header's whole action row (Subscribe, and Join when there is one). `yt-subscribe-button-view-model` and the bell are source-only (not shown signed out). |
| comments | verified-live | RYS, bp, CPFY | crop: Shorts comments button 1->0; watch comments container 1->0 (its crop is blank: the section is empty at that moment, and the tool's crop after its scroll is off); scripted: the loaded comment threads, 0 with the part on | `maxArea: 1`. `#comment-teaser` and the comments side panel are present but empty/hidden signed out (source-only). |
| share | verified-live | YTT, CPFY | crop: watch Share 1->0, live page 1->0, Shorts Share 1->0 | Found by position (the lone `yt-button-view-model` in the action row; the second Shorts button), so no English label. `.ytp-copylink-button` appears only when the pointer is on the player; `.ytp-share-button` was not seen. |
| counts | verified-live | RYS (like count, comment votes), ours (feed rows, search rows, Shorts labels, live viewers) | crop: home 50->0, channel 65->0, search 36->0 and 25->0, live page 41->0, Shorts 2->0; scripted: views under the video, comment count + comment votes, live viewers "N watching now" | Numbers only: the age ("4d ago") stays, so the matching is positional (the text after the play icon / the first inline item). Feeds can pass the guard's 400-match limit after a very long scroll. `view-count-factoid-renderer` (inside the expanded description) is source-only. |
| followers | verified-live | RYS `#owner-sub-count`; channel and search: ours | crop: watch "6.72M subscribers" 1->0, channel header "46.6M subscribers - 1.6K videos" 3->0, search channel result 2->0, live page 1->0 | The channel header line is matched by position, with an English-label fallback (`english: true`). |

## Source-only selectors (no live evidence)

In the table, each is a rule that matched nothing visible on signed-out pages in this review. They stay because a source
lists them or because they appear in other states of the site; the health log (`atlas_social_health`, `everMatched`) is what
proves them in real, signed-in use.

- suggested: `ytd-search ytd-horizontal-card-list-renderer`, `[is-channel-for-you-section]`, `ytd-item-section-renderer[is-playlist-suggestions]`; `ytd-search ytd-shelf-renderer` ("Latest from ..." shelf) is in the DOM of the "mrbeast" search but was not part of a measured pass.
- shortVideos: `ytd-video-renderer:has(a[href^="/shorts/"])`, the related-sidebar Shorts rule, both mini-guide entries (the mini guide is not shown at 1400 px).
- autoplay: pausing a channel trailer.
- upNext: `.ytp-ce-element`, `.ytp-pause-overlay` (and the cards button/teaser, present but never visible on the test video).
- hoverPreviews: `ytd-thumbnail-overlay-loading-preview-renderer`.
- likes: `ytd-sentiment-bar-renderer`. follow: `yt-subscribe-button-view-model`, the notification bell.
- comments: `#comment-teaser`, the comments engagement panel. share: `.ytp-share-button`, `.ytp-copylink-button` (needs the pointer on the player).
- counts: `view-count-factoid-renderer`.

## Not covered

- The mobile site (`m.youtube.com`, `ytm-*` markup): the route function accepts it but the selectors are the desktop ones.
- Signed-in markup (notifications, Subscribe turning into "Subscribed", the Join button on videos) and languages other than English
  for the few rules marked `english: true` (side-menu Shorts/Live entries, the channel Shorts tab, the channel subscriber label). All
  other rules use element names, ids and positions. The Shorts redirect does not depend on language.
- A channel's Live tab, the player's "Next" button.

## Things to know when re-running

- A fresh browser has an empty cache and the first YouTube page takes 20 s or more to build itself, so the plan opens a "warmup" page
  first. Without it the first measurements read a half-built page ("not-visible", tiny `snapshot.html`).
- Signed out, the home feed fills only after videos have been watched in the same browser; the home page is the last page.
- On the `live` page, five parts show "not-visible": they are listed only so that all 12 are on in its ALL ON line.
- The Short (`rPj14ToaZSA`) and the live stream (CNN, `GotlA1KKWoo`) are real items picked on 2026-11-01; swap them if they are gone
  (the plan's header says where to find new ones). The review does not log in, does not touch the real browser, and a consent page
  did not appear in this region.
- The plan makes YouTube believe the window has focus only inside the scripted hover check (`document.hasFocus` is overridden on that page).

## Requests (not mine to change: engine / tool)

1. `scripts/social_live/review.mjs openPage`: add `Emulation.setFocusEmulationEnabled({ enabled: true })`. Hover previews play only when the
   page has focus; with it the `hold` check would give crops on every page (today it works on the home feed only, by luck).
2. `scripts/social_live/review.mjs checkAll`: do not count "ResizeObserver loop completed with undelivered notifications" as a page error.
3. `scripts/social_live/review.mjs checkPart`: after it scrolls a box into view the crop is taken in page coordinates and misses the box
   (the watch comments crop is blank). `social_fixtures.mjs` records the live match counts but the snapshot is taken earlier, so things
   that load later (side menu, comments, feed rows) make the replay differ; the plan was arranged around it, but recording the counts from
   the snapshot would remove the problem.
4. `atlas-social-guard.js`: `MAX_MATCHES = 400` per selector is below what a long feed or a channel's Shorts tab holds (525 seen). A per-part
   limit, or a higher one for feed parts, would let the item-level rules keep working there.
