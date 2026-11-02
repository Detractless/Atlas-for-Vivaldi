# Scroll fade (spec 007)

Settings > Focus > Scroll fade. Every page dims the longer or farther you scroll, on all sites together, and once it is fully
dim it stays that way for a wait you cannot shorten. The idea and the mock-up are the user's (2026-11-02); the name, the
defaults and the build are below.

**Changed 2026-11-02 after the first version was tried.** The first version kept one total per site, drew the dimming inside
each page and only started the rest once you stopped scrolling. Three things were wrong: moving to another site started
again, scrolling on kept the page from ever having to wait, and the dimming was missing on pages a script can't run in (the
Web Store). The rules below are the second version. The old per-site list ("Only these sites") is gone, so is the saved list.

## What it does

- **Measures scrolling the way Settings > Usage does** (`atlas-usage.js`): distance in window heights and the time actually
  scrolling (steady scrolling adds up; a lone flick counts 0.1 s). A jump of more than 2 screens in one step is not scrolling.
  Scrolling inside a box on the page counts too. Endless feeds count the same as any page, which is why distance is a choice.
- **One total for every site and tab**: `chrome.storage.local.atlas_scroll_fade` = `{ ms, screens, last, until }`. Going to
  another site, or opening a new tab, does not start again. Only numbers are kept, never a site name or address.
- **Dim by**: `time`, `distance`, or `either` (the default: whichever is further along). Darkness = `darkest` x the further of
  `time / minutes` and `distance / screens`, up to `darkest`. Defaults: 5 minutes, 150 screens, darkest 70%.
- **Rest to clear** (`restSeconds`, 1 minute): a page that is not fully dim clears when you have not scrolled for this long.
- **Wait once fully dim** (`waitMinutes`, 10 minutes): the moment the page reaches full dark, `until` is set to now + the wait.
  Until then the page is held at the darkest whatever happens: scrolling adds nothing, resting does not end it, changing the
  limits does not end it. When `until` passes, the total goes back to nothing and the page comes back.
- **Leave these sites alone** (`except`, empty to start): never counted, never dimmed. A host covers its subdomains. Every
  other site works, so there is no "only these sites" list.
- **Drawn in the browser window, not in each page** (`src/modules/36-scroll-fade-layer.js`), the way the colour filter is
  (`22-page-saturation.js`): one black layer after `#webpage-stack` inside its container, `pointer-events: none`, eased 1.2 s.
  It follows the tab you are on: a web page that is not left alone dims; Atlas's pages (the new tab, Settings), Vivaldi's own
  and a tab whose address is not known yet stay clear. Because it is in the window it also dims the Web Store and anything a
  script cannot run in, it is already there when the next page starts, and a full-screen video has no layer to hide behind.
  Once the page is half dim a pill in the corner says "Rest 1:00 to clear" while scrolling, "Clearing in 0:42" while resting,
  and "Back in 9:41" during the wait.
- **Counting stays in the page** (`atlas-scroll-fade.js`): scrolling in the Web Store, a PDF or a Vivaldi page is not counted
  (no script runs there) but the page still dims. The script adds to the stored total at most once a second, as an addition to
  what is stored, so two tabs do not overwrite each other; during a wait it adds nothing.
- Never in a private window (the counting script does not run there). Off until switched on.

## Pieces

| File | Job |
| --- | --- |
| `payload/detractless/src/utils/scrollFade.js` | The setting and every rule: `normalize`, `progress`, `amount`, `settle`, `appliesTo`, `looser`, choices. No page, no storage. |
| `payload/install-files/components/atlas/atlas-scroll-fade.js` | Counts scrolling on pages into the total. Cannot import, so it repeats `normalize` (on, except, restSeconds). |
| `src/modules/36-scroll-fade-layer.js` | The layer, the pill and the wait. Repeats `normalize`, `progress` and `settle`; reachable as `Atlas.scrollFade` for the tests. |
| `src/modules/03-bridge-content-scripts.js` | Registers the counting script (`atlas-scroll-fade`, `document_idle`, http/https). |
| `settings/scrollFadePage.js`, `fadeControls.js`, `lockable.js` | The section, its controls, the shared lock helper. |
| `utils/focusLock.js`, `pages/newtab/profilesCore.js` | One lock, `scrollFade`; locked, it can only get stronger. profilesCore repeats `looser()`. |
| `constants/atlasKeys.json` | `sync.scrollFade` (per profile: focus; in backups) and `local.atlas_scroll_fade` (never backed up). |

## The lock

`looser(from, to)`: off is the loosest, so nothing is looser than it. From on, these are looser: switching off, a farther
time or distance limit (dropping one of the two counts as farther), a lighter `darkest`, **a shorter rest, a shorter wait**,
and more sites left alone. A longer rest or wait, a nearer limit, a darker page or fewer sites left alone is stronger.
(The first version had the rest backwards: it treated a longer rest as looser. Fixed here, with a test.) Unlocking takes 30
minutes, like the other Focus locks. The Settings controls grey out looser choices; the slider cannot go lighter; while the
lock holds the add-a-site box is off, but a pill can still be taken off, which is stronger.

## Tests

`scroll_fade_rules.test.js` (rules; the page script's, the window layer's and profilesCore's copies agree with
`utils/scrollFade.js` over many values), `scroll_fade_page.test.js` (the counting script in jsdom: counting, saving, one total
for every site, rest and wait, private windows), `scroll_fade_layer.test.js` (the layer in the window: which tabs dim, the pill,
the wait starting and ending, the setting followed), `settings_scroll_fade.test.js` (the section and the lock),
`atlas_window.test.js` (registration).

## Checked in a real browser (2026-11-02, throw-away Vivaldi with the installed Atlas, grayscale on at the same time)

A black layer inside the page area first dimmed a real page from white to 40% brightness and left Vivaldi's toolbar and sidebar
alone. With the finished module, a test setting of 25 screens / 2 minutes, a 30 s rest and a 60 s wait, on Wikipedia:

| Step | What the window's layer said | Brightest page pixel (255 = white) |
| --- | --- | --- |
| 12 screens scrolled | dim 0.336 (= 0.7 x 12/25), pill "Rest 0:30 to clear" | 169 (66%, as 1 - 0.336 says) |
| 25 screens (up and down count) | dim 0.7, pill "Back in 0:55", `until` set 60 s ahead | 77 (30%) |
| 25 more screens in the wait | total and `until` did not move | |
| Chrome Web Store (no script runs there) | dim 0.7, "Back in 0:40" | 77, and the screenshot shows the dimmed store |
| Atlas's own new tab | dim 0 | it is clear |
| After the 60 s wait | dim 0, total `{ ms: 0, screens: 0, last: 0, until: 0 }` | |

The sidebar and tab bar pixels did not change at any step. The real Settings section shows the rows Fade, Dim by, Fully dim
after, Or after scrolling, Darkest it gets, Rest to clear, Wait once fully dim, Leave these sites alone.

## Not measured

- A video player in real full screen (the layer is in the page area, which a full-screen page fills, but this was not seen).
- The address bar's drop-down over a dimmed page: the layer sits under Vivaldi's own popups by its place in the page, not seen with a menu open on a dimmed page.
- A real mouse wheel (Vivaldi did not answer `Input.dispatchMouseEvent`, so scrolling is done with `scrollBy`).
- Sites that scroll inside their own box with a locked page (counted like Usage counts it, not seen on a real one).
- Whether 150 screens or 5 minutes, or a 10 minute wait, suit the user: they are guesses until they have used it.
- Split view (two pages side by side): the layer follows the active tab and covers the whole page area.
