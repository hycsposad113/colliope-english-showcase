# Extracted from a larger private codebase (CALLIOPE). Source: scripts/calliope-vault-hash.py; adapted: generic directory argument and usage.
#!/usr/bin/env python3
"""Deterministic SHA-256 over vault regular files (path + bytes)."""
from __future__ import annotations

import hashlib
import os
import sys


def normalize_relative_path(root: str, full_path: str) -> str:
    rel = os.path.relpath(full_path, root)
    rel_norm = rel.replace(os.sep, "/")
    if rel_norm.startswith("./"):
        rel_norm = rel_norm[2:]
    return rel_norm


def vault_hash(root: str) -> str:
    if not os.path.isdir(root):
        raise FileNotFoundError(f"Directory not found: {root}")

    entries: list[tuple[str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        for name in filenames:
            full_path = os.path.join(dirpath, name)
            if not os.path.isfile(full_path):
                continue
            entries.append((normalize_relative_path(root, full_path), full_path))

    entries.sort(key=lambda item: item[0])

    digest = hashlib.sha256()
    for rel_path, full_path in entries:
        digest.update(rel_path.encode("utf-8"))
        digest.update(b"\0")
        with open(full_path, "rb") as handle:
            digest.update(handle.read())
        digest.update(b"\0")

    return digest.hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: vault-hash.py <directory>", file=sys.stderr)
        return 2

    try:
        print(vault_hash(sys.argv[1]))
    except OSError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
