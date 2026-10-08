# E2E Test Infrastructure & Test Methodology

## 1. Overview
The Atlas for Vivaldi modularization and spell check integration project is verified by an automated, opaque-box, requirement-driven End-to-End (E2E) test suite located under `tests/e2e/`.

The test suite requires zero external third-party testing frameworks (such as pytest), running natively on Python 3 (`unittest`) and Node.js (`v24+`), guaranteeing 100% portability, deterministic execution, and zero setup friction.

---

## 2. Directory Layout
```text
C:\Users\Calibro1\Downloads\atlas-installer\
├── tests/
│   └── e2e/
│       ├── __init__.py                     Package marker
│       ├── helpers.py                      Path resolvers, CRLF auditor, Node runner, CSS variable parser
│       ├── test_tier1_features.py          Tier 1: Feature Coverage tests (10 test cases)
│       ├── test_tier2_boundaries.py        Tier 2: Boundary & Corner Cases tests (9 test cases)
│       ├── test_tier3_interactions.py      Tier 3: Cross-Feature Interactions tests (4 test cases)
│       ├── test_tier4_workload.py          Tier 4: Real-World Workload & Packaging tests (4 test cases)
│       └── test_runner.py                  CLI master runner with tier filtering and structured diagnostics
├── TEST_INFRA.md                           This documentation
└── TEST_READY.md                           Readiness declaration and baseline results
```

---

## 3. 4-Tier Test Methodology

### Tier 1: Feature Coverage (`test_tier1_features.py`)
Validates core functional deliverables required by `ORIGINAL_REQUEST.md` and `PROJECT.md`:
1. `test_01_css_modular_files_exist_and_monolith_removed`: Verifies all 8 modular CSS stylesheets exist in `payload/css-mods/` (`00-tokens.css` through `07-extensions.css`) and legacy `atlas.css` is removed.
2. `test_02_css_file_line_counts`: Verifies every modular stylesheet is $\le 350$ lines and non-empty.
3. `test_03_js_source_modules_exist_and_bounded`: Verifies all 12 JS source modules exist in `src/modules/` (`01-addressbar.js` through `12-spelling.js`) and each is $\le 350$ lines.
4. `test_04_bundler_script_compiles_atlas_js`: Verifies `scripts/bundle.py` compiles `payload/install-files/atlas.js` with exit code 0.
5. `test_05_bundled_atlas_js_syntax_validation`: Verifies `node -c payload/install-files/atlas.js` passes with code 0 (zero syntax errors).
6. `test_06_addressbar_context_menu_items`: Verifies that "Undo" and "Redo" are removed, and "Cut", "Copy", "Paste", "Paste and go", "Select all" are present in the address field context menu.
7. `test_07_addressbar_spellcheck_attribute`: Verifies that `spellcheck = true` is activated on address bar inputs.
8. `test_08_offline_spelling_generator_corrections`: Evaluates `12-spelling.js` in Node.js against common misspellings ("teh", "definately", "recieve", "seperate", "adress", "wierd").
9. `test_09_harper_extension_payload_and_manifest`: Verifies offline unpacked Harper extension exists under `payload/extensions/harper/` with valid MV3 `manifest.json`.
10. `test_10_build_cmd_compiles_executable`: Verifies `build.cmd` pipeline integrates bundler, `node -c`, PyInstaller, and artifact cleanup.

### Tier 2: Boundary & Corner Cases (`test_tier2_boundaries.py`)
Tests system limits, resilience against hostile/unusual input, and structural boundaries:
1. `test_01_spelling_zero_typos_valid_words`: Valid words ("search", "browser", "atlas", "vivaldi", etc.) return valid status and are not corrupted.
2. `test_02_spelling_single_typo_variations`: Tests deletions ("serch"), insertions ("searrch"), substitutions ("seurch"), and transpositions ("saerch").
3. `test_03_spelling_two_typos_variations`: Tests 2-typo inputs with bounded ($\le 3$) candidate suggestions.
4. `test_04_spelling_extreme_typos_distance_greater_than_two`: Gibberish ("zzqqww", "123456789") does not freeze or crash the engine, completing in $<50$ms.
5. `test_05_spelling_casing_resilience`: UPPERCASE ("TEH"), TitleCase ("Definately"), and mixed case ("rEcIeVe") map to correct suggestions without case-sensitivity failures.
6. `test_06_spelling_empty_whitespace_and_null_inputs`: Empty string `""`, spaces, tabs, and newlines return empty suggestions without throwing exceptions.
7. `test_07_spelling_punctuation_and_symbols`: Punctuation strings ("!@#$%", "word!") handled gracefully.
8. `test_08_url_and_domain_preservation`: URLs and domains (`google.com`, `https://example.com/path`, `localhost:8080`, `vivaldi://settings`) are preserved and not flagged/corrupted by spellcheck.
9. `test_09_strict_line_count_boundaries`: Strictly enforces that no source module exceeds 350 lines, and verifies `scripts/bundle.py` contains the line count guard.

### Tier 3: Cross-Feature Interactions (`test_tier3_interactions.py`)
Validates integrations across architectural boundaries:
1. `test_01_bundling_pipeline_and_syntax_verification_sequence`: Sequentially runs bundler, syntax validation, and evaluates the resulting `window.__Atlas` namespace in an isolated V8 runtime.
2. `test_02_harper_tooltips_and_atlas_context_menu_coexistence`: Inspects and simulates `components/atlas/atlas-ctxmenu.js` to ensure bubble-phase listening, `e.defaultPrevented` yielding, and Harper tooltip guards prevent menu collisions.
3. `test_03_css_token_cascade_and_consumption`: Parses CSS custom property declarations in `00-tokens.css` and ensures all `--atlas-*` variables consumed across `01-07` are declared or provide safe CSS fallbacks.
4. `test_04_addressbar_context_menu_spelling_integration`: Verifies that `03-contextmenu.js` integrates with `Atlas.spelling` to prepend candidate chips above clipboard actions.

### Tier 4: Real-World Workload & Build Verification (`test_tier4_workload.py`)
Validates deployment-grade packaging, binary health, and repository cleanliness:
1. `test_01_crlf_line_endings_repository_audit`: Audits all repository text files (`.js`, `.css`, `.py`, `.cmd`, `.json`, `.html`, `.md`), failing if any file has lone LF line endings.
2. `test_02_backup_archive_integrity`: Inspects `C:\Users\Calibro1\Downloads\atlas-installer-backup-2026-09-08.zip` using `zipfile.testzip()`, checking for valid CRC32s and verifying exclusion of `.agents/`, `.git/`, `build/`, and `*.spec`.
3. `test_03_pyinstaller_clean_artifacts_verification`: Verifies absence of residual `build/` directories and `*.spec` files in repository root; verifies `dist/AtlasSetup.exe` has valid PE header (`MZ`).
4. `test_04_full_bundler_and_line_count_workload`: Executes the bundler on the real repository and confirms output formatting, IIFE termination, and CRLF compliance.

---

## 4. How to Run the Tests

### Execute Full Suite (All Tiers 1-4)
```powershell
py -3 tests/e2e/test_runner.py
```

### Execute Specific Tiers
```powershell
py -3 tests/e2e/test_runner.py --tier 1     # Tier 1 (Feature Coverage)
py -3 tests/e2e/test_runner.py --tier 2     # Tier 2 (Boundary & Corner Cases)
py -3 tests/e2e/test_runner.py --tier 3     # Tier 3 (Cross-Feature Interactions)
py -3 tests/e2e/test_runner.py --tier 4     # Tier 4 (Real-World Workload)
```

### Verbose Mode
```powershell
py -3 tests/e2e/test_runner.py -v
```

### JSON Output (For Orchestrator / CI)
```powershell
py -3 tests/e2e/test_runner.py --json
```

### Standard Python Unittest Discovery
```powershell
py -3 -m unittest discover -s tests/e2e -p "test_tier*.py" -v
```

---

## 5. Authoritative Sources & Expected Outputs
Every test derives its expected behavior directly from authoritative project specifications:
- `ORIGINAL_REQUEST.md`: R1 (CSS modularization), R2 (JS modularization & bundler), R3 (Address bar menu cleanup & spellcheck), R4 (Harper integration), R5 (Packaging & line endings).
- `PROJECT.md`: Interface Contracts (`window.__Atlas` namespace, CSS loading order, Harper registry path), Code Layout, Line Count limits ($\le 350$).
- `survey_codebase.md`, `survey_build_pipeline.md`, `survey_spellcheck_harper.md`: Architectural blueprints and exact line mapping.
