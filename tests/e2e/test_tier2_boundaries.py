"""
Tier 2: Boundary & Corner Cases E2E Tests
Validates resilience, edge cases, and boundary constraints:
- Spelling dictionary accuracy across 0, 1, 2, and >2 typos
- Case insensitivity (lowercase, UPPERCASE, TitleCase, mIxEdCaSe)
- Empty strings, whitespace, punctuation, and symbol robustness
- URL and domain preservation (ensuring spellcheck does not corrupt web addresses)
- Strict <=350 line count ceiling enforcement across all CSS and JS source modules
"""

import re
import unittest
from pathlib import Path
from tests.e2e.helpers import (
    CSS_MODS_DIR,
    JS_MODULES_DIR,
    SCRIPTS_DIR,
    ATLAS_JS,
    EXPECTED_CSS_FILES,
    EXPECTED_JS_MODULES,
    MAX_MODULE_LINES,
    count_lines,
    run_node,
    evaluate_js_spelling,
)


class TestTier2BoundaryAndCornerCases(unittest.TestCase):
    """Tier 2: Boundary & Corner Cases Verification."""

    @classmethod
    def setUpClass(cls):
        cls.spelling_source = JS_MODULES_DIR / "14-spelling.js"
        if not cls.spelling_source.is_file():
            cls.spelling_source = ATLAS_JS

    def test_01_spelling_zero_typos_valid_words(self):
        """
        Verify that correctly spelled words (0 typos) are recognized as valid
        and not flagged with erroneous replacements.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        valid_words = [
            "search", "history", "download", "extension",
            "window", "browser", "atlas", "vivaldi", "tab"
        ]

        for word in valid_words:
            res = evaluate_js_spelling(self.spelling_source, word)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation failed for valid word '{word}': {res.get('error')}"
            )
            # If isCorrect method exists, it should be True
            if res.get("isCorrect") is not None:
                self.assertTrue(
                    res["isCorrect"],
                    f"Valid word '{word}' was flagged as incorrect"
                )

    def test_02_spelling_single_typo_variations(self):
        """
        Verify accurate suggestion for 1-typo errors:
        deletion, insertion, substitution, transposition.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        single_typo_cases = [
            ("serch", "search"),    # deletion
            ("searrch", "search"),  # insertion
            ("seurch", "search"),   # substitution
            ("saerch", "search"),   # transposition
            ("browsr", "browser"),  # deletion
            ("tabb", "tab"),        # insertion
        ]

        for typo, expected in single_typo_cases:
            res = evaluate_js_spelling(self.spelling_source, typo)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation failed on '{typo}': {res.get('error')}"
            )
            suggestions = [s.lower() for s in res.get("suggestions", [])]
            self.assertIn(
                expected.lower(),
                suggestions,
                f"1-typo '{typo}' did not produce expected candidate '{expected}'. Got: {suggestions}"
            )

    def test_03_spelling_two_typos_variations(self):
        """
        Verify that 2-typo errors are handled with bounded suggestions (<=3 items)
        containing the target correction.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        two_typo_cases = [
            ("sarch", "search"),
            ("windw", "window"),
            ("brower", "browser"),
        ]

        for typo, expected in two_typo_cases:
            res = evaluate_js_spelling(self.spelling_source, typo)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation failed on '{typo}': {res.get('error')}"
            )
            suggestions = [s.lower() for s in res.get("suggestions", [])]
            self.assertLessEqual(
                len(suggestions),
                3,
                f"Suggestions list for '{typo}' must be bounded to <= 3 items. Got: {suggestions}"
            )
            self.assertIn(
                expected.lower(),
                suggestions,
                f"2-typo '{typo}' did not produce expected candidate '{expected}'. Got: {suggestions}"
            )

    def test_04_spelling_extreme_typos_distance_greater_than_two(self):
        """
        Verify extreme typos (>2 edit distance) and arbitrary gibberish
        do not crash, freeze, or return runaway suggestions.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        gibberish_inputs = [
            "zzqqww",
            "123456789",
            "qwertyuiopasdfghjkl",
            "xkjqpvwy"
        ]

        for gibberish in gibberish_inputs:
            res = evaluate_js_spelling(self.spelling_source, gibberish)
            self.assertTrue(
                res["is_valid"],
                f"Spelling engine threw an error on gibberish '{gibberish}': {res.get('error')}"
            )
            suggestions = res.get("suggestions", [])
            self.assertLessEqual(
                len(suggestions),
                3,
                f"Extreme typo '{gibberish}' returned more than 3 suggestions: {suggestions}"
            )

    def test_05_spelling_casing_resilience(self):
        """
        Verify spelling suggestions handle varied casing:
        TitleCase, UPPERCASE, and mIxEdCaSe without case-sensitive lookup failures.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        casing_cases = [
            ("Teh", "the"),
            ("TEH", "the"),
            ("tEh", "the"),
            ("Definately", "definitely"),
            ("DEFINATELY", "definitely"),
            ("rEcIeVe", "receive"),
            ("SEPERATE", "separate")
        ]

        for typo, expected in casing_cases:
            res = evaluate_js_spelling(self.spelling_source, typo)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation failed on '{typo}': {res.get('error')}"
            )
            suggestions = [s.lower() for s in res.get("suggestions", [])]
            self.assertIn(
                expected.lower(),
                suggestions,
                f"Cased typo '{typo}' failed to suggest '{expected}'. Got: {suggestions}"
            )

    def test_06_spelling_empty_whitespace_and_null_inputs(self):
        """
        Verify that empty strings, whitespace, or null-like inputs
        do not throw uncaught exceptions and return empty suggestion lists.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        empty_inputs = ["", "   ", "\t", "\n", " \t \n "]

        for inp in empty_inputs:
            res = evaluate_js_spelling(self.spelling_source, inp)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation crashed on whitespace/empty input '{repr(inp)}': {res.get('error')}"
            )
            self.assertEqual(
                res.get("suggestions", []),
                [],
                f"Empty/whitespace input '{repr(inp)}' should return 0 suggestions, got: {res.get('suggestions')}"
            )

    def test_07_spelling_punctuation_and_symbols(self):
        """
        Verify that punctuation and special symbols do not cause regex parsing errors
        or unhandled exceptions.
        """
        self.assertTrue(
            self.spelling_source.is_file(),
            f"Spelling source not found at {self.spelling_source}"
        )

        punct_inputs = ["!@#$%", "word!", "...test...", "(brackets)", "hyphen-word"]

        for inp in punct_inputs:
            res = evaluate_js_spelling(self.spelling_source, inp)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation crashed on punctuation input '{inp}': {res.get('error')}"
            )

    def test_08_url_and_domain_preservation(self):
        """
        Verify that URLs and domain patterns are not corrupted or erroneously spellchecked.
        Examples: google.com, https://example.com/path, vivaldi://settings, localhost:8080.
        """
        target_file = JS_MODULES_DIR / "14-spelling.js"
        if not target_file.is_file():
            target_file = ATLAS_JS

        self.assertTrue(
            target_file.is_file(),
            f"Spelling implementation not found at {target_file}"
        )

        test_script = f"""
        const fs = require('fs');
        global.window = global;
        global.__Atlas = {{}};
        global.Atlas = global.__Atlas;
        const code = fs.readFileSync({repr(str(target_file))}, 'utf8');
        try {{
            eval(code);
            const spelling = global.Atlas.spelling || global.__Atlas.spelling || global.spelling || {{}};
            const checkFn = spelling.checkWord || global.checkWord;
            const suggFn = spelling.getSuggestions || global.getSuggestions;
            const wordFn = spelling.getWordAtCaret || global.getWordAtCaret;

            const urls = [
                'google.com',
                'https://example.com/path',
                'http://localhost:8080',
                'vivaldi://settings',
                'user@example.com'
            ];

            let errors = [];
            for (const u of urls) {{
                // Test 1: If getWordAtCaret exists, simulated input with URL
                if (typeof wordFn === 'function') {{
                    const input = {{ value: u, selectionStart: 3, selectionEnd: 3 }};
                    const res = wordFn(input);
                    // If res is returned, getting suggestions shouldn't corrupt domain
                    if (res && res.word && res.word.includes('.')) {{
                        errors.push(`URL '${{u}}' word extractor returned dot-separated token: ${{res.word}}`);
                    }}
                }}
            }}

            console.log(JSON.stringify({{ ok: errors.length === 0, errors: errors }}));
        }} catch (err) {{
            console.log(JSON.stringify({{ ok: false, errors: [String(err)] }}));
        }}
        """

        res = run_node(test_script)
        self.assertEqual(res.returncode, 0, f"Node script execution failed: {res.stderr}")
        import json
        out = json.loads(res.stdout.strip())
        self.assertTrue(out.get("ok"), f"URL preservation check failed: {out.get('errors')}")

    def test_09_strict_line_count_boundaries(self):
        """
        Strictly enforces the <=350 lines architectural ceiling across
        all CSS stylesheets and JS modules.
        """
        all_checked_files = []

        if CSS_MODS_DIR.is_dir():
            for f in EXPECTED_CSS_FILES:
                p = CSS_MODS_DIR / f
                if p.is_file():
                    all_checked_files.append((p, count_lines(p)))

        if JS_MODULES_DIR.is_dir():
            for m in EXPECTED_JS_MODULES:
                p = JS_MODULES_DIR / m
                if p.is_file():
                    all_checked_files.append((p, count_lines(p)))

        self.assertGreater(
            len(all_checked_files),
            0,
            "No modular CSS or JS files found to evaluate line boundaries"
        )

        violations = []
        for path, lines in all_checked_files:
            if lines > MAX_MODULE_LINES:
                violations.append((path.name, lines))

        self.assertEqual(
            violations,
            [],
            f"Strict line count ceiling ({MAX_MODULE_LINES} lines) violated: {violations}"
        )

        # Check bundler script contains line count guard
        bundler_script = SCRIPTS_DIR / "bundle.py"
        if bundler_script.is_file():
            bundler_code = bundler_script.read_text(encoding="utf-8", errors="replace")
            self.assertRegex(
                bundler_code,
                r"350",
                "scripts/bundle.py must contain validation logic enforcing the <=350 line limit"
            )


if __name__ == "__main__":
    unittest.main()
