"""Installer messages and terminal failures."""

import sys


def say(msg, *, dim=False):
    print(("  " + msg) if not dim else ("  " + msg))


def fail(msg: str):
    print()
    print("  ERROR: " + msg)
    sys.exit(1)
