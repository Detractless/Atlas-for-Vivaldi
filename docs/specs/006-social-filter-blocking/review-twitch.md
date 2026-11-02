# Review: Twitch (2 pairs)

Table: `payload/install-files/components/atlas/atlas-social-twitch.js` (`live: true` (switched on after the lead re-ran the review independently)). Plan:
`scripts/social_live/plans/twitch.mjs`. Reviewed 2026-11-01 with `node scripts/social_live_check.mjs twitch` in a
signed-out throw-away Vivaldi (home, a live channel page, the directory). Screenshots and `report.json` are in
`/tmp/atlas-social-review/twitch/`. Fixtures: `tests/fixtures/social/twitch*`.

| Pair | Status | Selectors and where they come from | What was seen (signed out) | Caveats |
| --- | --- | --- | --- | --- |
| liveStreams | verified-live | Written from the real pages (no source has this part). Hooks: `[data-a-target="front-page-carousel"]` (also hidden by potrepka/simple-twitch as `.front-page-carousel`), `.find-me:has(a[data-a-target="preview-card-image-link"])` (the live shelves; `.find-me` is hidden by simple-twitch too), `.tw-tower:has(a[data-a-target="preview-card-image-link"])` (every grid of live-stream cards), `[data-test-selector="recommended-channel"]` and `[data-test-selector="similarity-channel"]` (left-menu live channels; FFZ hides `.side-nav .recommended-channels`), `.persistent-player` and `.right-column` on channel pages (player and chat). | home: 15 visible matches, 0 after (carousel, "Live on Twitch" shelf, left-menu live channels). Channel page `theburntpeanut` (live 24/7): 14, 0 after (player, chat column, left-menu live and "Viewers Also Watch"). Directory `/directory/all`: 11, 0 after (the card grid). No guard trip; every part on at once keeps `#root`, `main`, top bar, side nav and the search box shown, no new page errors. Looked at the all-on screenshots of all three pages. | `maxArea: 1` (a card grid covers most of the window). The channel page keeps its info bar (title, Follow, the LIVE tag and viewer count); with the player hidden Twitch draws its own "?" placeholder in the old player box, and the chat column leaves an empty dark strip. The signed-in "followed channel" card (`[data-test-selector="followed-channel"]:has([data-a-target="side-nav-live-status"])`) is a guess from the recommended-channel markup and is source-only. If `theburntpeanut` is ever off air the channel page shows `not-visible`: pick another always-on channel. |
| badges | verified-live (red number badge, tab title); source-only (bell, whispers, `.tw-badge--notification`) | `.tw-number-badge` from the real page (the red "30" Prime offers badge in the top bar); `.tw-badge--notification` is the notification badge class in FFZ's `theme.scss`; `.whispers__pill` is FFZ's `css_tweaks` whispers rule; `[data-a-target="notifications-toggle"]` (the bell) is from memory of Twitch's markup, not from a source. The tab-title count is `ctx.helpers.stripTitleCount()` in `act`. FFZ hides the notification bell through a React component, not CSS, so there was no selector to take. | `.tw-number-badge`: 1 visible on home and on the channel page, 0 after. Custom check: with the part on, a tab title set to `(3) Twitch` reads `Twitch` after 1.5 s (passes). All-on: nothing trips, landmarks and smoke shown. | The bell, the notification badge and the whispers pill only exist signed in, so they are proven only by the health log (`atlas_social_health`) in real browsing. The Prime offers badge is not a notification but is a red number badge that pulls attention, so it goes too. |

## Not verifiable signed out

Notification bell, notification badge class and whispers pill (signed-in UI); the signed-in "followed channels" list.

## Re-verify

```
node scripts/social_live_check.mjs twitch --port 9423
node scripts/social_fixtures.mjs twitch
node --test tests/unit/social_sites.test.js tests/unit/social_fixtures.test.js tests/unit/social_core.test.js
```
