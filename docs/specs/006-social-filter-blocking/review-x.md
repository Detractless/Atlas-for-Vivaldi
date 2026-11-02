# Review: X (5 pairs)

Table: `payload/install-files/components/atlas/atlas-social-x.js` (`live: true` (switched on after the lead re-ran the review independently)). Plan:
`scripts/social_live/plans/x.mjs`. Reviewed 2026-11-01 with `node scripts/social_live_check.mjs x` in a signed-out
throw-away Vivaldi. Screenshots and `report.json` are in `/tmp/atlas-social-review/x/`. Fixtures:
`tests/fixtures/social/x*`.

## What a signed-out browser sees

- `https://x.com/` and `https://x.com/explore` are login walls (X sends `/explore` to `/i/jf/onboarding/web?...`). They were
  not worked around.
- A public profile (`https://x.com/NASA`) and a public post (`https://x.com/NASA/status/2116263878807998722`) load, but as a
  different, plainer page than the signed-in app: no `#react-root`, no `data-testid` attributes, Tailwind-style classes,
  a log-in card where the right column would be, and a "Continue to X" bar over the timeline. The post page has a
  "Relevant people" box with a Follow button, but its only hooks are text and a generated class.
- So the signed-in app's selectors (below) cannot be seen on the real site signed out. Only the parts with a signed-out
  counterpart could be proven.

| Pair | Status | Selectors and where they come from | What was seen | Caveats |
| --- | --- | --- | --- | --- |
| trending | source-only, unverified live | `[data-testid="sidebarColumn"] div:has(> section[aria-labelledby^="accessible-list-"])` and the section itself (typefully/minimal-twitter: the right-column "What's happening" section; insin/control-panel-for-twitter: the `WhatsHappening` container is that section's parent), `[data-testid="trend"]` (CPFT), `[data-testid="sidebarColumn"] div:has(> [data-testid="news_sidebar"])` (CPFT, Today's News), `header a[data-testid="AppTabBar_Explore_Link"]` (minimal-twitter sidebar links; CPFT `a[href="/explore"]`), and `redirect` `/explore` to `/home` (CPFT hides the Explore page contents). | Nothing: none of these exist on the signed-out pages (login wall, plain page). Listed as `not-visible` in the report. | The redirect could not be tested: signed out, X itself sends `/explore` to its login flow before the filter runs, so any check would pass without proving anything. |
| whoToFollow | source-only, unverified live | `[data-testid="sidebarColumn"] aside[role="complementary"]` (minimal-twitter `removeOtherSections`; CPFT's `SuggestedFollows` marks the same box), `[data-testid="cellInnerDiv"]:has([data-testid="UserCell"])` on home, post and profile pages (the suggestion modules inside timelines; `UserCell` is X's person row). | Nothing (`not-visible`): the signed-out "Relevant people" box has no stable hook, so no rule was written for it. | The heading row of an in-timeline "Who to follow" module stays (its only hook is text). The `UserCell` rule is limited to the pages named so people lists (followers, likes, search) are not hidden. |
| follow | verified-live (signed-out profile only); signed-in rule source-only | `[role="button"][data-testid$="-follow"]` (CPFT; this does not match `-unfollow`, so the "Following" state button stays); for the signed-out profile, written from the real page: `main div:has(> a[aria-label="Follow"])` (the Follow button is a plain button with a link laid over it; `english: true` because of `aria-label`). | `https://x.com/NASA`: 1 visible match (the Follow button), 0 after; the Mention button next to it stays. All-on: page intact, no trips, no new page errors. Looked at before, after and all-on screenshots. | The "Follow" in the post page's "Relevant people" box is not covered (no hook). The signed-in `data-testid` rule is not seen live. |
| followers | verified-live | `a[href$="/verified_followers"]`, `a[href$="/followers"]`, `a[href$="/following"]`, each `:not([role="tab"])` so the tabs on the followers pages stay. CPFT hides the number inside the same links; minimal-twitter hides the links (`[href$="followers"][dir][role="link"]`). The whole link is hidden here, so the label does not dangle. | `https://x.com/NASA`: 2 visible matches ("115 Following", "92.2M Followers"), 0 after; "85 Affiliates" stays. Looked at before and after. | The href rule is the same in the signed-in app, but the signed-in markup was not seen. Hover cards use the same links. |
| newPosts | source-only, unverified live | `[data-testid="primaryColumn"] [role="button"]:has([data-testid="pillLabel"])` and the label, on the home route. The hook `pillLabel` is **from memory of X's page, not from a source**: CPFT finds the "Show N posts" bar through a `style^="transform"` attribute selector, which the table tests forbid. | Nothing (`not-visible`): the bar only exists in a signed-in home timeline. | May match nothing if `pillLabel` is wrong; the health log (`atlas_social_health`, `everMatched`) will show it. Best candidate to fix first from real signed-in markup. |

## Re-verify

```
node scripts/social_live_check.mjs x --port 9423
node scripts/social_fixtures.mjs x
node --test tests/unit/social_sites.test.js tests/unit/social_fixtures.test.js tests/unit/social_core.test.js
```

The live check will pass `followers` and `follow` on the profile page and report the other three as `not-visible`.
That is expected; the pairs that only exist signed in are proven by the health log in real, signed-in browsing.
