# Review: Facebook (signed out), 2026-11-01

Table: `payload/install-files/components/atlas/atlas-social-facebook.js` (`live: true` (switched on after the lead re-ran the review independently), `todo: []`).
Plan: `scripts/social_live/plans/facebook.mjs`. Run: `node scripts/social_live_check.mjs facebook --port 9434`.
Artifacts: `/tmp/atlas-social-review/facebook/`.

**What a signed-out visitor sees.** `/` is a log-in form and nothing else. A public Page (`/facebook`) renders its
header, intro, photos and a few posts behind a "See more from Facebook" log-in pop-up (left alone). There is no news
feed, story tray, composer or badge to look at: most of this table is source-only. Facebook's hashed classes are not
used; hooks are `data-pagelet` names, roles and aria labels. The signed-out Page timeline is the one real feed that
can be seen (`data-pagelet="TimelineFeedUnit_0"`, role=article; there is no `role="feed"` signed out).
`[role=banner]` has no box of its own signed out, so it is not a landmark (the live check would report it hidden);
the landmark is `[role="main"]`.

| Pair | Status | Selectors, and where they come from | What was seen | Caveats |
| --- | --- | --- | --- | --- |
| homeFeed | **verified-live (a Page's timeline), source-only (news feed)** | `[data-pagelet^="TimelineFeedUnit"]` (read from the signed-out Page); `div[role="feed"]` (scottylad007/zuckless: news feed, groups, pages, profiles); `[data-pagelet^="FeedUnit"]` (safwat-fathi/facebook-reels-blocker). `maxArea: 1`. | `/facebook` timeline 1 -> 0 (screenshot: post content gone, empty card frames remain). | The real news feed was never seen (login wall). Watch / Reels pages are not part of Facebook's pairs and are untouched. |
| stories | **source-only** | `[data-pagelet="Stories"]`, `[data-focus-target="stories_tray"]` (facebook-reels-blocker), `div[aria-label="Stories"]`, `div[aria-label="Stories tray"]` (zuckless); redirect `/stories` to `/`. `english: true`. | Nothing signed out. `/stories/` is sent to `/login.php` by Facebook itself, so the redirect is not exercised live. | The two `aria-label` rules depend on English. |
| posting | **source-only** | `div[aria-label="Create a post"]` (zuckless); `[data-pagelet="FeedComposer"]`, `"ProfileComposer"`, `"GroupInlineComposer"` (no source repo lists these: written from memory of Facebook's page names, unverified). `english: true`. | Nothing signed out. | Treat the three pagelet names as guesses until the health log shows them matching. |
| badges | **source-only (mechanism checked)** | No source. `act`: `ctx.helpers.stripTitleCount()` plus a scanner that marks bare numbers ("3", "9+", <= 34 px wide) inside `[role="banner"]` / `[role="navigation"]` and the small box holding only that number (`data-atlas-badge`); css hides the mark. Language-independent. | The tab title count: the page title was set to `(3) Facebook` and read back as `Facebook` with the part on (pass). A synthetic badge (a number in a small box in a `role=banner` element) was hidden (pass). The plain `not-visible` line is expected: no real badge exists signed out. | The real notification / Messenger badges, and plain red dots without a number, were never seen. Proven only by the health log in real browsing. |

**All parts on at once** (Page, home): landmark `[role="main"]` shown, no trips, no new page errors.

**Offline fixture:** `tests/fixtures/social/facebook-page.html` + `facebook.json` (homeFeed only; the rest has no
signed-out evidence to record).
