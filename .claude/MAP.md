<!-- projectmap v1 fingerprint=bb362c6df47282e3a443a93dd68b228decbf2ab6fc91a406eed1d70c3424ed04 generated=2026-09-16T10:28:39Z -->

## Purpose
This project, titled "Atlas for Vivaldi - installer (Python)", is a Python-based script designed to install the Atlas UI into an existing Vivaldi browser installation. The script, named "install.py", replaces the older PowerShell-based installer ("install.ps1") due to compatibility issues with Vivaldi version 5.1's JSON serializer.

## Entry points
- `install.py` (27808 B) — this Python script, named `install.py`, is an installer for the Atlas UI in Vivaldi browser. It closes
- `payload/detractless/index.html` (28970 B) — HTML document for a new tab page, including CSS and JavaScript files for styling and functionality
- `payload/extensions/harper/manifest.json` (1123 B) — manifest for an offline grammar and spell checker extension, named "Harper", with version 1.0.0, containing
- `payload/detractless/src/pastekit/main.js` (594 B) — various components for a content-script, including settings cache, field dot component, token autocomplete,
- `payload/detractless/src/pastekit/services/install.js` (851 B) — service for installing default settings in the Pastekit library, seeding them into chrome.storage.local upon

## Directories
- `payload/` — 92 tracked files
- `src/` — 12 tracked files
- `tests/` — 8 tracked files
- `scripts/` — 3 tracked files
- `.agents/` — 2 tracked files

## Key files
- `payload/install-files/atlas.js` (98165 B) — code for the Atlas mod in Vivaldi browser, focusing on managing the address field's behavior when it loses
- `payload/detractless/src/pages/sidepanel/sidepanel.js` (44391 B) — javaScript module that serves as the entry point for the sidebar component in a web application. It imports
- `payload/extensions/harper/background.js` (39560 B) — background service worker for offline grammar and spell checker
- `tests/e2e/test_tier1_features.py` (30175 B) — e2E tests for Tier 1 features, validating core functionalities of a project
- `payload/install-files/components/atlas/atlas-pages.css` (24628 B) — shared stylesheet for Atlas internal pages, defining their vocabulary and themes
- `payload/detractless/src/styles/panel.css` (23182 B) — CSS styles for the side panel's shared vocabulary, promoted under R-007 clause
- `payload/detractless/src/pages/newtab/newtab.css` (22207 B) — CSS styles for the new tab page, including animations and shared primitives
- `payload/install-files/components/atlas/atlas-history.html` (21996 B) — HTML document for a webpage titled "History", containing metadata, CSS and JavaScript links, and an SVG icon
