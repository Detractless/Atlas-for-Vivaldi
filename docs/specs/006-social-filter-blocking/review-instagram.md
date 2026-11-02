# Review: Instagram (signed out), 2026-11-01

Table: `payload/install-files/components/atlas/atlas-social-instagram.js` (`live: true` (switched on after the lead re-ran the review independently), `todo: []`).
Plan: `scripts/social_live/plans/instagram.mjs`. Run: `node scripts/social_live_check.mjs instagram --port 9433`.
Artifacts: `/tmp/atlas-social-review/instagram/`.

**What a signed-out visitor sees.** `/` is a log-in form (nothing of the app). A public profile (`/instagram/`,
`/nasa/`), a reel (`/instagram/reel/<id>/`) and a post (`/nasa/p/<id>/`) render behind a "Sign up" pop-up and are fully
readable in the DOM (left alone; the tool measures elements, not what is on top). The profile is locked in place, so
anything below the fold cannot be scrolled to (see whoToFollow). Instagram's hashed classes (`x1lliihq ...`) are not
used; hooks are roles, href shapes and the plain tag structure of these pages (`main[role="main"]`, `header >
section`, `section > div > span`). The app root `div[id^="mount_"]` has no box of its own, so it and
`[role=banner]`-style wrappers cannot be checked on screen: the landmark is `main[role="main"]`.

Mixed status is expected: the signed-in app (home feed, story tray, DMs, home sidebar) cannot be seen.

| Pair | Status | Selectors, and where they come from | What was seen (before -> after, visible matches) | Caveats |
| --- | --- | --- | --- | --- |
| whoToFollow | **verified-live (profile block), source-only (home sidebar)** | `div:has(> div > a[href$="/related_profiles/"])` (the "Accounts you might like" block with its "See all" link; read from the profile); `div:has(> div > a[href="/explore/people/"])` and the link itself (jordwest/news-feed-eradicator, AGPL, for the home sidebar). | `/instagram/` 1 -> 0. A separate measurement showed the matched box is the "Accounts you might like / See all / Follow ..." block. | The block sits ~2000 px down and the pop-up locks scrolling, so the screenshot crop shows the wrong area; the proof is the measured box, not a picture. Home variant not seen. |
| stories | **verified-live (profile highlights), source-only (home tray)** | `[role="menu"]:has(a[href^="/stories/"])` (highlights tray: every item links to `/stories/highlights/...`; read from the profile); `[role="menu"]:has([aria-label^="Story by"])` and `[scrollable="true"]:has([aria-label^="Story by"])` (malekwael229/FocusTube, for the home tray); redirect `/stories/...` to `/` (InfectedDuck/ReelLess). `english: true`. | `/instagram/` highlights tray 1 -> 0 (screenshots: circles gone, grid moves up). Redirect: `/stories/instagram/` ends on `/` (pass; whether Instagram would have redirected that address itself was not checked). | Home tray hooks not seen. |
| shortVideos | **verified-live** | `a[href*="/reel/"]`, `a[href*="/reels/"]`, `a[href$="/reels"]` (FocusTube, untrap-insta, ReelLess); redirect `/reels/`, `/reel/<id>/`, `/<user>/reel(s)/` to `/`. `maxArea: 1`. | Profile reel grid 12 -> 0. Redirect: `/instagram/reel/<id>/` ends on `/` (pass). | Only links are hidden: grid cells stay as empty frames. Reels shown as full posts inside the signed-in feed are not covered (CSS cannot tell a reel post from a photo post without hashed classes). The reel page itself cannot be measured with the part on (redirect). |
| likes | **verified-live (post / reel), source-only (home feed svg hooks)** | `section > div > span:first-child:has([role="button"])` (the heart in the row under a post; written from the signed-out reel and post pages). `[role="button"]:has(svg[aria-label="Like"])` / `"Unlike"` on `home` only (source-only; keeps the offline snapshots, which have no svg, in agreement). `english: true`. | Reel 1 -> 0; post 1 -> 0 (screenshot: heart gone, counts stay). | Per-comment "Like" buttons are text-only and are not hidden. |
| follow | **verified-live (behaviour)** | No hook exists (a `<div role="button">` holding only the word). `act` marks every button whose whole text is "Follow"/"Following" (English plus es, pt, it, fr, de, nl, pl, id, tr, ru, ja, ko, zh, ar) with `data-atlas-follow`; css hides the mark; stop removes the marks. `english: true`. | Control (follow off): follow buttons on screen; follow on: 0 left, on the profile (suggestions), a reel (header "Follow") and a post. The plain `not-visible` line is expected: the rule matches only after the behaviour has run. | A language not in the list keeps its buttons. Marks are applied within 0.7 s of the page changing. |
| messages | **source-only** | `a[href^="/direct/"]`, `div[aria-label="Thread list"][role="navigation"]` (sanjeed5/instagram-chats-hider-extension); redirect `/direct` to `/`. `english: true`. | Nothing: no DM UI exists signed out. `/direct/inbox/` is sent to `/accounts/login/` by Instagram itself, so the redirect is not exercised live. | Floating "Messages" pop-up at bottom right of the home feed has no known hook: not covered. |
| counts | **verified-live (post / reel), source-only (feed)** | `section > div > span[role="button"]` (the numbers beside heart and speech bubble; read from the reel / post pages), `a[href$="/liked_by/"]`, `a[href$="/comments/"]` (feed-style "Liked by" / "View all N comments"; igplus-extension was consulted for which numbers count). | Reel 2 -> 0; post 2 -> 0 (screenshot: icons stay, numbers gone). | View counts on grid hover overlays and the home feed's "Liked by" line were not seen. |
| followers | **verified-live (profile)** | `header > section > ul` on the profile route (the stats row; read from the profile). | `/instagram/` 1 -> 0 (screenshot: "686M followers / 163 following" gone). | Hides the whole row, so Following (and Posts, signed in) go too: the numbers have no separating hook signed out (the links are `#`). |

**All parts on at once** (profile, reel, post, home): landmark and smoke shown, no trips, no new page errors.

**Offline fixtures:** `tests/fixtures/social/instagram-{profile,reel,post}.html` + `instagram.json` (counts agree with
the snapshots).
