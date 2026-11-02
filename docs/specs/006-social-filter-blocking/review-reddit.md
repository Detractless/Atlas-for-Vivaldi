# Review: Reddit (7 pairs)

Table: `payload/install-files/components/atlas/atlas-social-reddit.js` (`live: true` (switched on after the lead re-ran the review independently)). Plan:
`scripts/social_live/plans/reddit.mjs`. New Reddit only (the "shreddit" web components); `old.reddit.com` is on the same host
but has other markup and is not covered.

## Read this first: Reddit's bot check made the review patchy

From about 02:20 on 2026-11-01 Reddit served "Prove your humanity" (a reCAPTCHA) to the review tool's fresh signed-out
browser on most page loads (home, the AskReddit post, the archived post), at random. It was not worked around. What a run
shows depends on whether that run got in; a run that did not get in reports `not-visible` and failing custom checks for
the page ("got exists:false") and shows the captcha in its screenshots. Passing runs happened only after the machine had
not touched Reddit for 25+ minutes, so re-run in one go after a long pause, and run `home` and `post-old` first.

What is on disk in `/tmp/atlas-social-review/reddit/`:

- `home/`: screenshots and `snapshot.html` of a **passing** home run (about 04:02). Its console output is transcribed in
  `home-run-0402-console.txt` (its `report.partial.json` was overwritten by a later blocked run).
- `report.json`: the full run of about 03:21: `post-old` passed (everything below), `home` and `post` were blocked.
  Console transcribed in `post-old-run-0321-console.txt`. The `post-old/` and `post/` screenshots are now captcha pages
  (overwritten by later blocked runs; the 03:21 ones were never looked at). Earlier (about 02:19) a first full run got
  into the post pages; I looked at its before/after crops and all-on screenshot then (see likes/comments rows).
- `report.partial.json`: the last (blocked) single-page run. Ignore it.

## Pairs

| Pair | Status | Selectors and where they come from | Evidence | Caveats |
| --- | --- | --- | --- | --- |
| homeFeed | verified-live | `shreddit-feed` and the sort bar loader `shreddit-async-loader[bundlename="shreddit_sort_dropdown"]`, on the home routes (`/`, `/best`, `/hot`, `/new`, `/top`, `/rising`). FrontFilter (`feed.feed`), Distraction-Free-Reddit and unhook-for-reddit all hide `shreddit-feed`. `maxArea: 1`. | `home`: 2 visible, 0 after, no trip. All-on screenshot (looked at): the whole feed is gone, the header, search box and the sign-up panel stay. | Signed out, `/` is the Popular feed. Subreddit feeds are deliberately left alone. |
| suggested | verified-live (right rail, post pages); recommended-posts rule verified by a simulated page type | Right rail on home: `aside:has(> ul > li > community-card)` ("Discover communities") and `#right-sidebar-contents > aside > aside` (Reddit also serves a "Popular Communities" variant of the same box; the second selector covers both). Post pages: `aside#answers-suggested-queries-pdp` ("People also ask") and `aside:has(> pdp-right-rail)` ("Related posts"). Feed: `shreddit-app:not([pagetype="popular"]) shreddit-feed article:has(> shreddit-post[recommendation-source]:not([recommendation-source=""]))` and the divider after it (FrontFilter `suggestedPosts`, RedditEnhancer `hideRecommended`), `in-feed-community-recommendations` (FrontFilter). `maxArea: 1`. | `home`: 2 visible, 0 after (right rail gone in the all-on screenshot). `post-old`: 2 visible, 0 after. Custom check on `home` passed: with the page type flipped to `home`, recommended posts are hidden, and they are kept on the Popular page type. | The recommended-posts rule never matches signed out: the Popular feed is recommendations by design and is excluded (as RedditEnhancer and FrontFilter do), and subreddit pages have none; only the simulated page type shows it works. `in-feed-community-recommendations` not seen. |
| trending | verified-live (footer links, redirect, search list); left-menu links source-only | `redirect` `/r/popular`, `/r/all`, `/explore`, `/news` to `/` (FrontFilter `mainPageLinks`; the lead's reading of "Popular and All"); footer links `#right-sidebar-container li:has(a[href^="/r/popular"])` etc.; the search box's trending list `#reddit-trending-searches-partial-container` and the heading before it, inside the shadow root of `reddit-search-large` / `-small` (Distraction-Free-Reddit `trending-shim`); the same links inside `left-nav-top-section`'s shadow root (FrontFilter). | `home`: 3 footer links visible (Popular, News, Explore), 0 after; the trending-after crop shows them gone. Redirect `/r/popular/` lands on `/` (every run); `/explore/` too (three runs). Custom check passed: the search box's list is forced open inline and stays `display:none`. By hand: after a real click the list is `display:block` 558 x 584 px. | The search list only opens on a real click, so the plan forces it open instead of clicking. The left-menu links only exist signed in: source-only. Signed out, Reddit already sends `/r/all` to `/`. |
| likes | verified-live | `award-button` (light DOM, the leaf next to Reply; FrontFilter `hideAwards`) and, inside shadow roots (put there by `act`): in `shreddit-post` `span:has(> shreddit-vote-animations)`, `shreddit-vote-animations`, `.rpl-vote-button-group`; in `shreddit-comment-action-row` `shreddit-vote-animations` (FrontFilter `shadowSignals.hideVotes`). RedditEnhancer reaches the same buttons with `::part(vote)`, which Reddit no longer exports. | `post-old`: 6 award buttons visible, 0 after; custom checks passed for the post's vote row and the comment vote buttons, with the rest of the row still shown. `home` custom check passed (vote group hidden, comment button kept). Looked at the `home` likes-after crop: vote arrows gone, comments and Share stay; and (first run) the AskReddit post's crops: post and comment arrows and awards gone, Reply and Share stay. | The vote rows are in shadow roots a page style cannot reach (see Requests). |
| comments | verified-live | `shreddit-comment-tree`, `comment-body-header` (the "Join the conversation" box, sort and comment search), and in `shreddit-post`'s shadow root `[data-post-click-location="comments-button"]` (FrontFilter `comment.actions`; Distraction-Free-Reddit hides the tree and header too). `maxArea: 1`. | `post-old`: 2 visible, 0 after; custom checks passed for the comment button on `post-old` and `home` (button hidden, vote row kept). First run, AskReddit post: tree and composer gone in the all-on screenshot. | The first selector said `a`; on a post page the comment button is a `button`, so it is now element-agnostic. |
| share | verified-live | `shreddit-comment-share-button` and the post page's `rpl-dropdown[slot="ssr-share-button"]` (light DOM), and `shreddit-post-share-button` in `shreddit-post`'s shadow root. RedditEnhancer's share hiding is the reference. | `post-old`: 7 visible, 0 after; custom checks passed on `post-old` and `home` (share hidden, vote row kept). First run: the AskReddit post's Share button was gone in the all-on screenshot. | |
| counts | verified-live | `reddit-pdp-right-rail-post div:has(> faceplate-number)` (the "141 upvotes - 35 comments" line under related posts, real page); in shadow roots: `button[upvote] ~ span:has(> faceplate-number)` (the vote count, arrows kept) in `shreddit-post` and `shreddit-comment-action-row`, and `[data-post-click-location="comments-button"] faceplate-number` in `shreddit-post` (FrontFilter `shadowSignals`). | `post-old`: 25 visible, 0 after; custom checks passed for the post's and the comments' vote counts with the arrows kept; `home` custom check passed. | The comment count on a feed post's button is covered by the same rule as `comments`' button rule but was not checked on its own. |

## Fixtures

`tests/fixtures/social/reddit-home.html` and `reddit.json` come from the passing `home` run's `snapshot.html` (538 KB). The
match counts in the manifest (homeFeed 2, suggested 2, trending 3) were **computed offline** from that snapshot with the engine
under jsdom, because that run's report had been overwritten before it could be fed to `social_fixtures.mjs`; they equal the
visible counts the live run printed (2, 2, 3). Re-record with `node scripts/social_fixtures.mjs reddit` after a clean run.
The `post-old` snapshot is just over 600 KB with scrolling; the plan now sets `scroll: false` for it so it fits.

## Not seen live

Left-menu Popular/Explore links (signed-in only); `in-feed-community-recommendations`; the `post` (AskReddit) page and the
composer on a non-archived post in a passing run (only in the first run); `old.reddit.com`.

## Re-verify (after 25+ minutes without Reddit traffic; stop if the screenshots say "Prove your humanity")

A single-page run writes `report.partial.json`, which `social_fixtures.mjs` does not read, so give each page its own output
folder and copy the report:

```
for p in home post-old; do
  node scripts/social_live_check.mjs reddit --page $p --port 9423 --out /tmp/rr-$p
  cp /tmp/rr-$p/reddit/report.partial.json /tmp/rr-$p/reddit/report.json
  node scripts/social_fixtures.mjs reddit --from /tmp/rr-$p
done
node --test tests/unit/social_sites.test.js tests/unit/social_fixtures.test.js tests/unit/social_core.test.js
```

The shadow-only parts (likes, comments, share, counts on a feed) show `not-visible` in the table for `home` and pass through
their custom checks; that is expected. The plan's second redirect (`/explore/`) was dropped to save a Reddit load: the same
`from` expression covers it and it passed in three earlier runs.
