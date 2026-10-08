"""
Tier 4: Real-World Workload & Build Verification E2E Tests
Validates production readiness, packaging, and archive integrity:
- Full build and bundling pipeline execution
- Clean build environment (no residual build/ directories or .spec files)
- Backup archive (atlas-installer-backup-2026-09-08.zip) structural integrity and exclusions
- 100% Windows CRLF (\\r\\n) line ending audit across all repository text files
"""

import os
import zipfile
import unittest
from pathlib import Path
from tests.e2e.helpers import (
    PROJECT_ROOT,
    PAYLOAD_DIR,
    SCRIPTS_DIR,
    DIST_DIR,
    ATLAS_JS,
    BACKUP_ZIP_PATH,
    audit_repository_crlf,
    check_file_crlf,
    run_python,
)


class TestTier4RealWorldWorkload(unittest.TestCase):
    """Tier 4: Real-World Workload and Packaging Verification."""

    def test_01_crlf_line_endings_repository_audit(self):
        """
        Audit 100% of text files across the repository to guarantee Windows CRLF (\\r\\n)
        line ending compliance (excluding .agents metadata and compiled binaries).
        """
        violations = audit_repository_crlf(PROJECT_ROOT)

        if violations:
            formatted_violations = "\n".join(
                f"  - {path.relative_to(PROJECT_ROOT)}: {msg}"
                for path, msg in violations
            )
            self.fail(
                f"Repository contains {len(violations)} file(s) with non-CRLF line endings:\n{formatted_violations}\n"
                f"All text files must have 100% Windows CRLF (\\r\\n) line endings."
            )

    def test_02_backup_archive_integrity(self):
        """
        Verify the backup archive at C:\\Users\\Calibro1\\Downloads\\atlas-installer-backup-2026-09-08.zip:
        - Archive exists and passes zipfile integrity check (testzip() is None).
        - Archive strictly excludes .agents/, .git/, build/, and *.spec files.
        - Archive contains essential project files (build.cmd, install.py, payload/).
        """
        self.assertTrue(
            BACKUP_ZIP_PATH.is_file(),
            f"Backup zip archive missing at {BACKUP_ZIP_PATH}"
        )

        try:
            with zipfile.ZipFile(BACKUP_ZIP_PATH, "r") as zf:
                # 1. CRC32 / structural integrity check
                bad_file = zf.testzip()
                self.assertIsNone(
                    bad_file,
                    f"Corrupted file in backup zip archive: {bad_file}"
                )

                namelist = zf.namelist()
                self.assertGreater(
                    len(namelist),
                    20,
                    f"Backup zip archive contains suspiciously few entries: {len(namelist)}"
                )

                # 2. Strict exclusions check
                forbidden_prefixes = (".agents/", ".git/", "build/")
                forbidden_extensions = (".spec",)

                forbidden_entries = []
                for entry in namelist:
                    norm_entry = entry.replace("\\", "/")
                    if any(norm_entry.startswith(prefix) for prefix in forbidden_prefixes):
                        forbidden_entries.append(entry)
                    if any(norm_entry.endswith(ext) for ext in forbidden_extensions):
                        forbidden_entries.append(entry)

                self.assertEqual(
                    forbidden_entries,
                    [],
                    f"Backup archive contains forbidden temporary or metadata entries: {forbidden_entries}"
                )

                # 3. Essential files present
                self.assertIn("build.cmd", namelist, "build.cmd missing from backup archive")
                self.assertIn("install.py", namelist, "install.py missing from backup archive")
        except Exception as e:
            self.fail(f"Failed to inspect backup archive {BACKUP_ZIP_PATH}: {e}")

    def test_03_pyinstaller_clean_artifacts_verification(self):
        """
        Verify that intermediate PyInstaller build artifacts (build/ directory,
        AtlasSetup.spec or *.spec files) are not lingering in the repository.
        Verify dist/AtlasSetup.exe exists and is a valid PE executable.
        """
        # 1. Check build directory is cleaned
        build_dir = PROJECT_ROOT / "build"
        self.assertFalse(
            build_dir.is_dir(),
            f"Leftover PyInstaller build directory detected at {build_dir}. Must be cleaned by build pipeline."
        )

        # 2. Check no .spec files in root
        spec_files = list(PROJECT_ROOT.glob("*.spec"))
        self.assertEqual(
            spec_files,
            [],
            f"Leftover PyInstaller spec file(s) detected: {[f.name for f in spec_files]}. Must be cleaned post-build."
        )

        # 3. Check standalone executable
        setup_exe = DIST_DIR / "AtlasSetup.exe"
        self.assertTrue(
            setup_exe.is_file(),
            f"AtlasSetup.exe missing at {setup_exe}"
        )
        self.assertGreater(
            setup_exe.stat().st_size,
            1_000_000,
            f"AtlasSetup.exe is suspiciously small ({setup_exe.stat().st_size} bytes)"
        )

        # Verify Windows PE header (MZ magic bytes)
        raw_header = setup_exe.read_bytes()[:2]
        self.assertEqual(
            raw_header,
            b"MZ",
            f"AtlasSetup.exe is not a valid Windows PE binary (magic: {raw_header})"
        )

    def test_04_full_bundler_and_line_count_workload(self):
        """
        Execute scripts/bundle.py from start to finish and verify that:
        - The process finishes cleanly with code 0.
        - payload/install-files/atlas.js is formatted with 100% CRLF line endings.
        - The bundled output wraps modules in an outer IIFE.
        """
        bundler_script = SCRIPTS_DIR / "bundle.py"
        self.assertTrue(
            bundler_script.is_file(),
            f"Bundler script missing at {bundler_script}"
        )

        res = run_python(["scripts/bundle.py"])
        self.assertEqual(
            res.returncode,
            0,
            f"Bundler script failed with code {res.returncode}:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}"
        )

        self.assertTrue(
            ATLAS_JS.is_file(),
            f"Bundled output missing at {ATLAS_JS}"
        )

        # Check CRLF line endings
        is_crlf, msg = check_file_crlf(ATLAS_JS)
        self.assertTrue(
            is_crlf,
            f"Bundled atlas.js has invalid line endings: {msg}"
        )

        # Check outer IIFE
        content = ATLAS_JS.read_text(encoding="utf-8", errors="replace").strip()
        self.assertTrue(
            content.startswith("/*") or content.startswith("(function"),
            "atlas.js should start with header comments or outer IIFE"
        )
        self.assertTrue(
            content.endswith("})();") or content.endswith("})()"),
            "atlas.js must terminate with enclosing IIFE invocation '})();'"
        )


if __name__ == "__main__":
    unittest.main()
