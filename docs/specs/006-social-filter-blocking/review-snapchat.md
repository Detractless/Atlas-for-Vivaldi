# Review: Snapchat (signed out), 2026-11-01

Table: `payload/install-files/components/atlas/atlas-social-snapchat.js` (`live: true` (switched on after the lead re-ran the review independently), `todo: []`).
Plan: `scripts/social_live/plans/snapchat.mjs`. Run: `node scripts/social_live_check.mjs snapchat --port 9432`.
Artifacts: `/tmp/atlas-social-review/snapchat/`.

**What a signed-out visitor sees.** `snapchat.com/` is a log-in form and a marketing page; `snapchat.com/spotlight`
redirects by itself to `/@<creator>/spotlight/<id>`, a fully public Spotlight player with a nav bar, "Up next" cards
and comments, no pop-up. The home page and the Spotlight page are built differently (`desktop-nav` vs
`ConsumerNav_Desktop`), so the only hook both share is the link `href="https://www.snapchat.com/spotlight"`.

| Pair | Status | Selectors, and where they come from | What was seen | Caveats |
| --- | --- | --- | --- | --- |
| shortVideos | **verified-live** | `li:has(> a[href$="/spotlight"])` and `a[href$="/spotlight"]` (the "Spotlight" tab, read from the pages); redirect `/spotlight`, `/spotlight/<id>`, `/@user/spotlight`, `/@user/spotlight/<id>` to `/` (InfectedDuck/ReelLess treats Spotlight as a route). | Home page: Spotlight tab 2 -> 0 (screenshots: Stories, Chat, Lenses, Snapchat+ stay). Redirect: `https://www.snapchat.com/spotlight` ends on `/` (pass). ALL ON: landmark `[data-testid="page-frame"]` and the search box shown. | The Spotlight page itself is not measured: with the part on, opening it leaves at once, so the redirect is what is tested. No page-level CSS is kept for the player (the redirect is the part). The signed-in web app (`web.snapchat.com`) was not seen. The marketing slide "Open Spotlight" on the home page links to `web.snapchat.com`, so it stays. |

**Offline fixture:** `tests/fixtures/social/snapchat-home.html` + `snapchat.json`.
