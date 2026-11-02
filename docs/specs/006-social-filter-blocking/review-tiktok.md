# Review: TikTok (signed out), 2026-11-01

Table: `payload/install-files/components/atlas/atlas-social-tiktok.js` (`live: true` (switched on after the lead re-ran the review independently), `todo: []`).
Plan: `scripts/social_live/plans/tiktok.mjs`. Run: `node scripts/social_live_check.mjs tiktok --port 9431`.
Artifacts: `/tmp/atlas-social-review/tiktok/` (report.json, before/after JPEGs, snapshot.html per page).

**What a signed-out visitor sees.** Every page (For You feed, a video, Explore, a profile) renders fully behind a
"Log in to TikTok" pop-up (a Skip / close button is on it; it was left alone). The tool measures elements, not what
is on top, so everything below is measured on the real DOM. TikTok's own `data-e2e` attributes are stable and not
language-dependent, so no hashed class and no English text is used (one `[class*="DivFeedNavigationContainer"]`
carried over from tiktok-feed-blocker names a single styled-components segment, not a hash). Two page layouts were
seen (the 2026 "cinema" feed on `/`, and the older column layout on a video page), so each of like / follow / share
has the hook for both. The For You feed may rewrite its address to `/@user/video/<id>` as it scrolls; it only does so
if the feed is visible, and with `shortVideos` on it is not.

| Pair | Status | Selectors, and where they come from | What was seen (before -> after, visible matches) | Caveats |
| --- | --- | --- | --- | --- |
| homeFeed | **verified-live** | `[data-e2e="anchoring-player-column"]` (written from the page), `#column-list-container`, `[class*="DivFeedNavigationContainer"]`, `#main-content-explore_page` (shbernal/tiktok-feed-blocker). `on` home / explore. `maxArea: 1`. | `/` 3 -> 0; `/explore` 1 -> 0. Screenshots show the whole feed / Explore page gone, sidebar and pop-up intact. | Hides the For You / Following feed and the Explore page. The old-layout fallbacks (`#column-list-container`) matched on `/` too. `act` pauses videos in hidden feed columns. |
| shortVideos | **verified-live** | `[data-e2e="user-post-item-list"]`, `[data-e2e="explore-item-list"]`, `[data-e2e="video-detail-related-video"]`, `a[href*="/playlist/"]` (profile), feed column on `/` (written from the page); redirect `/@user/video/<id>` and `/photo/` to `/` (ReelLess treats video pages as a route). `maxArea: 1`. | `/` 2 -> 0; `/explore` 1 -> 0; profile 6 -> 0 (grid + playlists). Redirect: `/@tiktok/video/<id>` ends on `/` (pass). | The video page itself cannot be measured with the part on (the redirect leaves it), so its CSS fallbacks (`#column-list-container` and the related list on `video`) are not separately proven. The "nothing keeps playing" check passed (0 videos playing 2.5 s after turning the part on), but the signed-out feed video does autoplay muted before that, and the review cannot tell whether the `pauseVideos` act or TikTok's own visibility handling stopped it: weak evidence. Profile "Playlists" and "Videos" headings stay. |
| likes | **verified-live** | `[data-e2e="like-icon"]` (feed, video page), `browse-like-icon`, `comment-like-icon` (older / comment hooks, not seen). | `/` 1 -> 0; video page 2 -> 0. | `browse-like-icon` and `comment-like-icon` never appeared signed out: source-less guesses at TikTok's older naming, harmless if absent. |
| follow | **verified-live** | `[data-e2e="follow-button"]` (profile), `feed-follow` (video page), `cinema-video-info-follow` (new feed), plus the `[data-testid="tux-web-button-container"]:has(> ...)` box around each, or an empty coloured pill stays behind (seen on the profile and fixed). | `/` 2 -> 0; video 2 -> 0; profile 42 -> 0 (21 buttons, each counted twice: button + its box). | `:has()` needs a current Chromium (Vivaldi is). |
| share | **verified-live** | `[data-e2e="share-icon"]` (feed, video), `share-btn` + its button box (profile). | `/` 1 -> 0; video 2 -> 0; profile 2 -> 0. | Share count lives inside `share-icon` and goes with it. |
| posting | **verified-live (button), source-only (redirect)** | `[data-e2e="nav-upload"]`, `upload-icon`, `a[href*="/tiktokstudio/upload"]`, `a[href*="/creator-center/upload"]`; redirect `/upload`, `/creator-center`, `/tiktokstudio` to `/` (ReelLess blocks `/upload`). | The sidebar "Upload" entry 2 -> 0 on `/` (screenshot: Short dramas / LIVE / Profile close up). | Signed out, TikTok itself redirects all three upload addresses to `/login` before any script runs, so the redirect is not exercised live (the review "passes" only because the page is no longer on the upload route). It is covered by the engine's redirect tests. |
| counts | **verified-live** | `like-count`, `comment-count`, `favorite-count`, `share-count` (feed, video), `video-views` (profile grid), `explore-card-like-container` (Explore card), `likes-count` + `likes` label (profile total, profile route only). | `/` 4 -> 0; video 8 -> 0; explore 26 -> 0; profile 34 -> 0. | Related-video cards on a video page show a bare number with no hook: not hidden. |

**All parts on at once** (`/`, video, explore, profile): landmarks (`#app`, `nav-foryou`) and smoke (`nav-search`)
shown, no guard trips, no new page errors. `#app-header` was dropped as a landmark: it has no box of its own, so the
live check reported it as hidden although nothing hides it.

**Not verifiable signed out:** the signed-in header upload button (`upload-icon`), the Following / Friends feeds
(same layout assumed), LIVE.

**Offline fixtures:** `tests/fixtures/social/tiktok-{home,video,explore,profile}.html` + `tiktok.json`. Grids keep
loading rows, so explore and profile are reviewed unscrolled with `counts` first; the recorded counts then equal what
the snapshot yields (checked).
