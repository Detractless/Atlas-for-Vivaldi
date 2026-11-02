# The same Atlas look in every Vivaldi profile (spec 008)

The installer sets up one profile, the one it is run for. Every other Vivaldi profile, and every profile made later, now sets
itself up the first time it opens. The idea is the user's (2026-11-02); what was measured and how it was built are below.

## Why other profiles looked plain

Two kinds of things make up Atlas:

- **Shared by every profile**: the window code (`atlas.js`), the page scripts, the Detractless new-tab pages. They live in
  Vivaldi's program folder, so every profile runs them. This is why the page right-click menu already worked everywhere.
- **Kept in each profile's own `Preferences`**: the look folder (`vivaldi.appearance.css_ui_mods_directory`), the toolbar
  layout, the address-bar settings, the new-tab page, the Atlas themes, the Downloads panel. The installer wrote these to one
  profile only, so any other profile had Atlas's code but not its look.

The tab menu then failed in those profiles (fixed separately by drawing it in its own shadow root, `37-ui-menu.js`): it was
styled only by the CSS mods, so without them it was an unstyled strip along the window's edge.

## What was measured (a throw-away profile with no Atlas settings, 2026-11-02)

- Window code can set a profile's settings with `vivaldi.prefs.set`: the look folder, toolbars, address bar, new tab, themes,
  panels, and the two non-`vivaldi.` ones (`search.suggest_enabled`, `extensions.ui.developer_mode`) all stuck, and were on disk
  after a clean close.
- The look (CSS mods) is read when a **window opens**. Setting the folder does not change the window that is open, nor does
  reloading it; **a new window** in the same running browser has the look. So a profile needs one new window after it is set up.
- `chrome.windows.create({ tabId })` gives a new window that adopts that tab. Moving every tab out of the old window closes it by
  itself. So the swap is: the active tab opens the new window (same size or state), the tabs before it go in at the front, the
  tabs after it at the end. No start-page tab appears in the new window. A first try (create an empty window, move the tabs in,
  close its start page) left that start page behind, because moving the last tab ends the old window's script before it can tidy.

## How it works

1. `payload/install-files/atlas-profile.json`, written by the installer (`installer/profile_facts.py`) next to `atlas.js`: the
   look-folder path, the new-tab address, the Atlas themes, the Downloads panel, and `version` (raise `RECIPE_VERSION` when the
   settings change and every profile applies them once more).
2. `src/modules/38-profile-recipe.js`: `profileRecipe(snapshot, facts)` returns only what must change, merging: a profile's own
   toolbar buttons, themes and panels stay. `profilePaths()` lists what to read. It follows `installer/preferences.py` rule by
   rule; `tests/unit/profile_recipe_parity.test.js` runs both on the same starting profiles and compares every setting.
3. `src/modules/39-profile-setup.js`, in every window of every profile, 1.5 s after it opens (under a Web Lock, so two windows
   of one profile do not both do it):
   - no facts file, or no Vivaldi settings API: nothing;
   - the mark `chrome.storage.local.atlas_profile_setup` is at this version already: nothing;
   - every list the recipe edits (toolbars, panels, themes) must be readable, else the profile is left alone and not marked;
   - nothing to change (the installer already set the profile up): only marked (`applied: false`);
   - otherwise: write the mark first (so a failure cannot loop), apply the changes, and if the look folder changed, swap the
     window (a profile that already has the look folder but lacks a newer rule gets the rule with no new window). The swap waits for the tab count to hold still (a session still restoring would lose tabs), skips private and
     non-normal windows, and keeps the old window if any tab fails to move.
4. The new window starts with the look. Its own run of the module finds the mark and stops.

## Choices

- **Once per recipe version, never again.** A setting the user changes in a profile afterwards is left alone. A new version
  re-applies the recipe, which merges (it never removes the user's own buttons), and swaps the window only when the look folder
  itself changed.
- **Merge, not replace** (toolbars, panels, themes), the same as the installer.
- **Not part of this**: history, bookmarks, logins and Atlas's own Settings stay per profile (Vivaldi Sync is the way to share
  those). Another macOS account has its own home folder, so it still needs its own install.
- **No Workspaces, no tab-list button (recipe version 2, 2026-11-02).** A stock profile has `WorkspaceButton` in
  `vivaldi.toolbars.tabbar_before` and `TabButton` in `tabbar_after`; the main profile has neither. Both rules (`PR_TABBAR_OUT`
  in the recipe, `TABBAR_OUT` in `preferences.py`) take those two, and Back/Forward, off the tab bar's own toolbars and leave every
  other button where it is. Chosen over copying the main profile's whole tab-bar layout, which would overwrite buttons a profile
  has arranged. A profile that really uses Workspaces loses its switcher button (the workspaces themselves stay).

## Checks

- `tests/unit/profile_recipe.test.js`: the rules on plain data (bare profile, own buttons kept, idempotent, themes, panels).
- `tests/unit/profile_recipe_parity.test.js`: preferences.py and the recipe give the same result on three starting profiles.
- `tests/unit/profile_setup.test.js`: the runtime in a stand-in Vivaldi (new, maximised, already set up, set up under an older
  version, set up before, unreadable, a tab that will not move, private window, tabs still arriving, no facts file).
- `tests/unit/test_install.py`: the facts file.
- Live, against the installed Atlas: two bare throw-away profiles each set themselves up, swapped windows, kept every tab, showed
  the look, and on their next start did nothing.
