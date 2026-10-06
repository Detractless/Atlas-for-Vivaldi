## Purpose
The project modularizes Vivaldi's monolithic CSS and JavaScript assets into decoupled domain modules, updating the build pipeline to compile them cleanly with PyInstaller. It also enriches the address bar control, creating a comprehensive UI customization layer for Vivaldi desktop browser.

## Entry points
- `payload/detractless/index.html` - This HTML file is a template for the new tab page, including meta tags and linked CSS files.

## Directories
- `payload/` - 93 files
- `scripts/` - 3 files
- `src/` - 12 files
- `tests/` - 8 files

## Key files
- `payload/detractless/src/pages/sidepanel/sidepanel.js` (44391 B) - This file serves as the combined sidebar entry point for hosting the home view, PasteKit panel, and Remover view in the Atlas for Vivaldi project.
- `install.py` (31311 B) - core project file
- `payload/detractless/sidepanel.html` (21268 B) - core project file
- `PROJECT.md` (11484 B) - core project file
- `payload/detractless/src/pages/sidepanel/sidepanel.css` (9391 B) - core project file
