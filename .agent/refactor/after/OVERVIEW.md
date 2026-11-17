# Project overview

415 code files, 44951 lines.

A navigation map already exists: see [.claude/MAP.md](../../.claude/MAP.md) (not repeated here).

## Folders

| folder | code files here | lines (with sub-folders) |
|---|---|---|
| . | 2 | 44951 |
| docs/ | 0 | 141 |
|   specs/ | 0 | 141 |
|     001-pages-and-profiles/ | 1 | 141 |
| installer/ | 9 | 1123 |
|   vivaldi/ | 6 | 416 |
| payload/ | 0 | 20856 |
|   css-mods/ | 11 | 2030 |
|   detractless/ | 2 | 11957 |
|     src/ | 0 | 11758 |
|       background/ | 3 | 855 |
|         flows/ | 2 | 216 |
|         limits/ | 2 | 179 |
|         search/ | 2 | 126 |
|         social/ | 1 | 47 |
|         state/ | 3 | 114 |
|         usage/ | 1 | 27 |
|       components/ | 0 | 3469 |
|         acronym-badge/ | 1 | 6 |
|         add-popup/ | 5 | 587 |
|         bookmarks/ | 8 | 901 |
|         color-lock/ | 1 | 61 |
|         context-menu/ | 2 | 170 |
|         edit-in-bar/ | 1 | 31 |
|         engines/ | 5 | 592 |
|         scroll-affordance/ | 1 | 181 |
|         search/ | 1 | 256 |
|         search-delay/ | 1 | 30 |
|         subpage-nav/ | 1 | 110 |
|         tab-limiter/ | 2 | 131 |
|         tabs/ | 2 | 413 |
|       constants/ | 6 | 128 |
|       pages/ | 0 | 2394 |
|         gate/ | 3 | 315 |
|         newtab/ | 16 | 1972 |
|         shared/ | 1 | 107 |
|       services/ | 5 | 2298 |
|         accounts/ | 1 | 74 |
|         bookmarks/ | 6 | 667 |
|         import-export/ | 6 | 889 |
|         settings/ | 3 | 56 |
|         tab-saver/ | 5 | 390 |
|       settings/ | 8 | 1239 |
|         pages/ | 4 | 417 |
|       styles/ | 5 | 626 |
|       utils/ | 8 | 749 |
|         focus-lock/ | 2 | 131 |
|         social-filter/ | 1 | 100 |
|         theme/ | 2 | 24 |
|   extensions/ | 0 | 1326 |
|     harper/ | 4 | 1326 |
|   install-files/ | 1 | 5543 |
|     components/ | 0 | 5377 |
|       atlas/ | 37 | 5377 |
|         nsfw/ | 6 | 595 |
|         tab-shortcuts/ | 1 | 157 |
|     src/ | 2 | 129 |
| scripts/ | 15 | 2137 |
|   social_live/ | 3 | 621 |
|     plans/ | 8 | 324 |
| src/ | 0 | 6392 |
|   modules/ | 0 | 6280 |
|     accounts/ | 2 | 219 |
|     addbar/ | 4 | 769 |
|     addressbar/ | 6 | 1321 |
|     appearance/ | 3 | 478 |
|     bridge/ | 4 | 572 |
|     browser-marks/ | 1 | 49 |
|     commands/ | 2 | 229 |
|     downloads/ | 1 | 30 |
|     extensions/ | 2 | 400 |
|     history/ | 1 | 53 |
|     menus/ | 3 | 663 |
|     nsfw/ | 3 | 282 |
|     panels/ | 1 | 196 |
|     profiles/ | 2 | 294 |
|     spelling/ | 1 | 263 |
|     tabs/ | 1 | 31 |
|     toolbar/ | 4 | 431 |
|   native/ | 0 | 112 |
|     macos/ | 2 | 112 |
| tests/ | 0 | 14174 |
|   fixtures/ | 0 | 39 |
|     social/ | 22 | 39 |
|   helpers/ | 8 | 319 |
|   native/ | 2 | 113 |
|   unit/ | 93 | 13703 |
|     helpers/ | 9 | 697 |
|     service-worker/ | 1 | 19 |
|     social-fixtures/ | 1 | 23 |
|     source-module-loader/ | 1 | 15 |

## 10 biggest files

- payload/extensions/harper/background.js: 544 lines
- payload/extensions/harper/content.js: 416 lines
- payload/detractless/src/pages/newtab/profilesCore.js: 346 lines
- src/modules/addressbar/19-addressbar-engine-picker.js: 343 lines
- payload/install-files/components/atlas/atlas-nsfw-guard.js: 339 lines
- src/modules/addressbar/01-addressbar.js: 328 lines
- payload/install-files/components/atlas/atlas-nsfw-image-shield.js: 327 lines
- tests/unit/social_core.test.js: 325 lines
- payload/detractless/src/services/import-export/detractlessFormat.js: 324 lines
- tests/unit/addressbar_engine_picker.test.js: 323 lines

## Entry points

- build.sh: runs as a script (#!)
- docs/specs/001-pages-and-profiles/mockups.html: test file
- install.py: runs as a script (#!)
- installer/__init__.py: named __init__
- installer/vivaldi/__init__.py: named __init__
- payload/detractless/index.html: named index
- payload/detractless/src/services/tab-saver/index.js: named index
- scripts/build.mjs: named in package.json
- scripts/build.py: runs as a script (#!)
- scripts/build_dmg.py: runs as a script (#!)
- scripts/build_native_shortcuts.py: runs as a script (#!)
- scripts/bundle.py: runs as a script (#!)
- scripts/refresh_backup.py: runs as a script (#!)
- scripts/to_crlf.py: runs as a script (#!)
- tests/fixtures/social/facebook-page.html: test file
- tests/fixtures/social/instagram-post.html: test file
- tests/fixtures/social/instagram-profile.html: test file
- tests/fixtures/social/instagram-reel.html: test file
- tests/fixtures/social/reddit-home.html: test file
- tests/fixtures/social/snapchat-home.html: test file
- tests/fixtures/social/tiktok-explore.html: test file
- tests/fixtures/social/tiktok-home.html: test file
- tests/fixtures/social/tiktok-profile.html: test file
- tests/fixtures/social/tiktok-video.html: test file
- tests/fixtures/social/twitch-channel.html: test file
- tests/fixtures/social/twitch-directory.html: test file
- tests/fixtures/social/twitch-home.html: test file
- tests/fixtures/social/x-profile.html: test file
- tests/fixtures/social/youtube-channel.html: test file
- tests/fixtures/social/youtube-home.html: test file
- tests/fixtures/social/youtube-live.html: test file
- tests/fixtures/social/youtube-search-channel.html: test file
- tests/fixtures/social/youtube-search-live.html: test file
- tests/fixtures/social/youtube-shorts.html: test file
- tests/fixtures/social/youtube-watch-end.html: test file
- tests/fixtures/social/youtube-watch.html: test file
- tests/helpers/addressbar-window.js: test file
- tests/helpers/google-account-reply.js: test file
- tests/helpers/jsdom-error-capture.js: test file
- tests/helpers/nsfw_bridge_env.js: test file
- tests/helpers/nsfw_image_env.js: test file
- tests/helpers/social_env.js: test file
- tests/helpers/source-module-loader.js: test file
- tests/helpers/window-test-fixture.js: test file
- tests/native/core_test.c: test file
- tests/native/duplicate_test.c: test file
- tests/unit/add_popup.test.js: test file
- tests/unit/addbar_edit_flow.test.js: test file
- tests/unit/addbar_edit_worker.test.js: test file
- tests/unit/addbar_flow.test.js: test file
- tests/unit/addbar_group_flow.test.js: test file
- tests/unit/addbar_rules.test.js: test file
- tests/unit/addbar_worker.test.js: test file
- tests/unit/addressbar_engine_picker.test.js: test file
- tests/unit/addressbar_engine_typed.test.js: test file
- tests/unit/addressbar_newtab_hint.test.js: test file
- tests/unit/addressbar_pills.test.js: test file
- tests/unit/addressbar_revert.test.js: test file
- tests/unit/atlas_window.test.js: test file
- tests/unit/browser_marks.test.js: test file
- tests/unit/build_sync.test.js: test file
- tests/unit/command_focus.test.js: test file
- tests/unit/command_taps.test.js: test file
- tests/unit/css_tokens.test.js: test file
- tests/unit/downloads_core.test.js: test file
- tests/unit/downloads_opener.test.js: test file
- tests/unit/downloads_panel.test.js: test file
- tests/unit/drop_tail.test.js: test file
- tests/unit/dropdown_rows.test.js: test file
- tests/unit/error_handling.test.js: test file
- tests/unit/field_clues.test.js: test file
- tests/unit/focus_lock.test.js: test file
- tests/unit/google_account.test.js: test file
- tests/unit/google_account_picker.test.js: test file
- tests/unit/google_accounts_detect.test.js: test file
- tests/unit/google_page_check.test.js: test file
- tests/unit/google_switch.test.js: test file
- tests/unit/helpers/addFlow.js: test file
- tests/unit/helpers/addbarHarness.js: test file
- tests/unit/helpers/atlasMenu.js: test file
- tests/unit/helpers/fakeChrome.js: test file
- tests/unit/helpers/jsdomNavigation.js: test file
- tests/unit/helpers/newtabDom.js: test file
- tests/unit/helpers/storageKeyScan.js: test file
- tests/unit/helpers/windowDom.js: test file
- tests/unit/helpers/windowMenus.js: test file
- tests/unit/history_redirect.test.js: test file
- tests/unit/line_endings.test.js: test file
- tests/unit/native_sequences.test.js: test file
- tests/unit/native_shortcuts.test.js: test file
- tests/unit/newtab_bookmarks_layout.test.js: test file
- tests/unit/newtab_edit_in_bar.test.js: test file
- tests/unit/newtab_features.test.js: test file
- tests/unit/newtab_smoke.test.js: test file
- tests/unit/nsfw_cascade.test.js: test file
- tests/unit/nsfw_debug.test.js: test file
- tests/unit/nsfw_detector.test.js: test file
- tests/unit/nsfw_drag.test.js: test file
- tests/unit/nsfw_eval_fetch.test.js: test file
- tests/unit/nsfw_eval_manifest.test.js: test file
- tests/unit/nsfw_eval_metrics.test.js: test file
- tests/unit/nsfw_guard.test.js: test file
- tests/unit/nsfw_image_shield.test.js: test file
- tests/unit/nsfw_lifecycle.test.js: test file
- tests/unit/nsfw_performance.test.js: test file
- tests/unit/page_ctxmenu.test.js: test file
- tests/unit/page_saturation.test.js: test file
- tests/unit/page_subtitles.test.js: test file
- tests/unit/page_usage.test.js: test file
- tests/unit/panel_handle.test.js: test file
- tests/unit/popup_style.test.js: test file
- tests/unit/profile_edit.test.js: test file
- tests/unit/profile_menu_add.test.js: test file
- tests/unit/profile_recipe.test.js: test file
- tests/unit/profile_recipe_parity.test.js: test file
- tests/unit/profile_setup.test.js: test file
- tests/unit/profiles_core.test.js: test file
- tests/unit/saturation_lock.test.js: test file
- tests/unit/scroll_fade_layer.test.js: test file
- tests/unit/scroll_fade_page.test.js: test file
- tests/unit/scroll_fade_rules.test.js: test file
- tests/unit/service-worker/chrome-api-proxy.js: test file
- tests/unit/service_worker.test.js: test file
- tests/unit/settings_focus_locks.test.js: test file
- tests/unit/settings_page.test.js: test file
- tests/unit/settings_scroll_fade.test.js: test file
- tests/unit/settings_social_filter.test.js: test file
- tests/unit/site_suggestions.test.js: test file
- tests/unit/size_limits.test.js: test file
- tests/unit/social-fixtures/social-page-fixture.js: test file
- tests/unit/social_block.test.js: test file
- tests/unit/social_core.test.js: test file
- tests/unit/social_filter.test.js: test file
- tests/unit/social_fixtures.test.js: test file
- tests/unit/social_navigation.test.js: test file
- tests/unit/social_sites.test.js: test file
- tests/unit/social_slides.test.js: test file
- tests/unit/source-module-loader/load-source-module.js: test file
- tests/unit/spec001_e2e.test.js: test file
- tests/unit/spelling_engine.test.js: test file
- tests/unit/storage_keys.test.js: test file
- tests/unit/tab_card.test.js: test file
- tests/unit/tab_limiter.test.js: test file
- tests/unit/test_downloads_panel_prefs.py: test file
- tests/unit/test_install.py: test file
- tests/unit/test_native_shortcuts_install.py: test file
- tests/unit/theme_rule.test.js: test file
- tests/unit/theme_sync_guard.test.js: test file
- tests/unit/usage_log.test.js: test file
- tests/unit/usage_page.test.js: test file
- tests/unit/window_menus.test.js: test file

## 5 files imported by the most others

- payload/detractless/src/services/storage.js: 28
- tests/unit/helpers/newtabDom.js: 18
- tests/unit/helpers/windowDom.js: 18
- payload/detractless/src/services/bookmarks/bookmarksDB.js: 17
- payload/detractless/src/pages/newtab/newtabState.js: 15

## 5 files that import the most others

- payload/detractless/src/pages/newtab/newtab.js: 25
- payload/detractless/src/components/engines/engines-modal.js: 14
- install.py: 13
- payload/detractless/src/components/bookmarks/bookmarks.js: 12
- payload/detractless/src/settings/shell.js: 12

## Import rings

No import rings found.
