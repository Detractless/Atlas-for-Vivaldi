"""
Atlas for Vivaldi - End-to-End Test Runner
Executes requirement-driven tests across Tiers 1-4 with rich reporting and tier filtering.

Usage:
  py -3 tests/e2e/test_runner.py              # Run all tiers (1-4)
  py -3 tests/e2e/test_runner.py --tier 1     # Run only Tier 1 (Feature Coverage)
  py -3 tests/e2e/test_runner.py --tier 2     # Run only Tier 2 (Boundary & Corner Cases)
  py -3 tests/e2e/test_runner.py --tier 3     # Run only Tier 3 (Cross-Feature Interactions)
  py -3 tests/e2e/test_runner.py --tier 4     # Run only Tier 4 (Real-World Workload)
  py -3 tests/e2e/test_runner.py -v           # Verbose mode
  py -3 tests/e2e/test_runner.py --json       # Output JSON summary
"""

import sys
import time
import json
import argparse
import unittest
from pathlib import Path
from typing import Dict, List, Any

# Ensure project root and tests/ are on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.e2e.test_tier1_features import TestTier1FeatureCoverage
from tests.e2e.test_tier2_boundaries import TestTier2BoundaryAndCornerCases
from tests.e2e.test_tier3_interactions import TestTier3CrossFeatureInteractions
from tests.e2e.test_tier4_workload import TestTier4RealWorldWorkload

TIER_MAP = {
    1: ("Tier 1 - Feature Coverage", TestTier1FeatureCoverage),
    2: ("Tier 2 - Boundary & Corner Cases", TestTier2BoundaryAndCornerCases),
    3: ("Tier 3 - Cross-Feature Interactions", TestTier3CrossFeatureInteractions),
    4: ("Tier 4 - Real-World Workload", TestTier4RealWorldWorkload),
}


class CustomTestResult(unittest.TestResult):
    """Custom TestResult collector capturing structured pass/fail/error metadata."""

    def __init__(self, stream=None, descriptions=None, verbosity=1):
        super().__init__(stream, descriptions, verbosity)
        self.successes: List[unittest.TestCase] = []
        self.verbosity = verbosity
        self.test_records: List[Dict[str, Any]] = []

    def startTest(self, test: unittest.TestCase):
        super().startTest(test)
        test._start_time = time.time()
        if self.verbosity > 1:
            doc = test.shortDescription() or ""
            print(f"  RUNNING: {test.id()} {doc[:60]}")

    def addSuccess(self, test: unittest.TestCase):
        super().addSuccess(test)
        self.successes.append(test)
        elapsed = time.time() - getattr(test, "_start_time", time.time())
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "PASS",
            "doc": test.shortDescription() or "",
            "elapsed_ms": round(elapsed * 1000, 2),
            "error": None
        })
        if self.verbosity > 0:
            print(f"  [PASS] {test._testMethodName} ({round(elapsed * 1000, 1)}ms)")

    def addFailure(self, test: unittest.TestCase, err):
        super().addFailure(test, err)
        elapsed = time.time() - getattr(test, "_start_time", time.time())
        err_msg = self._exc_info_to_string(err, test)
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "FAIL",
            "doc": test.shortDescription() or "",
            "elapsed_ms": round(elapsed * 1000, 2),
            "error": err_msg
        })
        if self.verbosity > 0:
            print(f"  [FAIL] {test._testMethodName} ({round(elapsed * 1000, 1)}ms)")

    def addError(self, test: unittest.TestCase, err):
        super().addError(test, err)
        elapsed = time.time() - getattr(test, "_start_time", time.time())
        err_msg = self._exc_info_to_string(err, test)
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "ERROR",
            "doc": test.shortDescription() or "",
            "elapsed_ms": round(elapsed * 1000, 2),
            "error": err_msg
        })
        if self.verbosity > 0:
            print(f"  [ERROR] {test._testMethodName} ({round(elapsed * 1000, 1)}ms)")

    def addSkip(self, test: unittest.TestCase, reason: str):
        super().addSkip(test, reason)
        self.test_records.append({
            "id": test.id(),
            "name": test._testMethodName,
            "status": "SKIP",
            "doc": test.shortDescription() or "",
            "elapsed_ms": 0,
            "error": reason
        })
        if self.verbosity > 0:
            print(f"  [SKIP] {test._testMethodName}: {reason}")


def run_tiers(selected_tiers: List[int], verbosity: int = 1) -> Dict[str, Any]:
    """Runs tests for specified tiers and compiles structured results."""
    overall_start = time.time()
    tier_results = []
    all_records = []
    total_run = 0
    total_passed = 0
    total_failed = 0
    total_errors = 0
    total_skipped = 0

    print("=" * 72)
    print(" Atlas for Vivaldi — End-to-End Test Suite")
    print(f" Workspace: {PROJECT_ROOT}")
    print(f" Target Tiers: {selected_tiers}")
    print("=" * 72)

    for tier_num in sorted(selected_tiers):
        tier_title, test_case_cls = TIER_MAP[tier_num]
        print(f"\n>>> Executing {tier_title} ({test_case_cls.__name__})")
        print("-" * 72)

        loader = unittest.TestLoader()
        suite = loader.loadTestsFromTestCase(test_case_cls)
        result = CustomTestResult(verbosity=verbosity)
        tier_start = time.time()
        suite.run(result)
        tier_elapsed = time.time() - tier_start

        passed = len(result.successes)
        failed = len(result.failures)
        errors = len(result.errors)
        skipped = len(result.skipped)
        total = result.testsRun

        total_run += total
        total_passed += passed
        total_failed += failed
        total_errors += errors
        total_skipped += skipped
        all_records.extend(result.test_records)

        tier_summary = {
            "tier": tier_num,
            "title": tier_title,
            "total": total,
            "passed": passed,
            "failed": failed,
            "errors": errors,
            "skipped": skipped,
            "elapsed_seconds": round(tier_elapsed, 2),
            "failures_detail": [
                {"name": t._testMethodName, "error": msg} for t, msg in result.failures
            ],
            "errors_detail": [
                {"name": t._testMethodName, "error": msg} for t, msg in result.errors
            ]
        }
        tier_results.append(tier_summary)

        status_flag = "PASS" if (failed == 0 and errors == 0) else "FAIL"
        print("-" * 72)
        print(f" {tier_title} Result: [{status_flag}] | Passed: {passed}/{total} | Failed: {failed} | Errors: {errors} | Time: {round(tier_elapsed, 2)}s")

    overall_elapsed = time.time() - overall_start

    print("\n" + "=" * 72)
    print(" SUITE EXECUTION SUMMARY")
    print("=" * 72)
    print(f" Total Tests Run:  {total_run}")
    print(f" Passed:           {total_passed}")
    print(f" Failed:           {total_failed}")
    print(f" Errors:           {total_errors}")
    print(f" Skipped:          {total_skipped}")
    pass_pct = round((total_passed / total_run * 100), 1) if total_run > 0 else 0.0
    print(f" Pass Percentage:  {pass_pct}%")
    print(f" Total Duration:   {round(overall_elapsed, 2)} seconds")
    print("=" * 72)

    # Print detailed failures if any occurred
    has_issues = total_failed > 0 or total_errors > 0
    if has_issues:
        print("\n" + "!" * 72)
        print(" DETAILED FAILURE & ERROR DIAGNOSTICS")
        print("!" * 72)
        for t_res in tier_results:
            for item in t_res["failures_detail"]:
                print(f"\n[FAILURE in {t_res['title']} -> {item['name']}]:")
                print(item["error"].strip())
            for item in t_res["errors_detail"]:
                print(f"\n[ERROR in {t_res['title']} -> {item['name']}]:")
                print(item["error"].strip())
        print("!" * 72)

    return {
        "success": not has_issues,
        "total": total_run,
        "passed": total_passed,
        "failed": total_failed,
        "errors": total_errors,
        "skipped": total_skipped,
        "pass_percentage": pass_pct,
        "elapsed_seconds": round(overall_elapsed, 2),
        "tiers": tier_results,
        "records": all_records
    }


def main():
    parser = argparse.ArgumentParser(description="Atlas for Vivaldi E2E Test Runner")
    parser.add_argument(
        "--tier",
        type=int,
        choices=[1, 2, 3, 4],
        help="Run tests for a single tier (1-4). If omitted, runs all tiers."
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output showing each test method and execution time."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON results to stdout."
    )

    args = parser.parse_args()
    selected_tiers = [args.tier] if args.tier else [1, 2, 3, 4]
    verbosity = 2 if args.verbose else 1

    summary = run_tiers(selected_tiers, verbosity=verbosity)

    if args.json:
        print("\n--- JSON OUTPUT ---")
        print(json.dumps(summary, indent=2))

    sys.exit(0 if summary["success"] else 1)


if __name__ == "__main__":
    main()
