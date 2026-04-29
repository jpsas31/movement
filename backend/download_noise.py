"""Pull a noise corpus into backend/noise/ for enrollment-time augmentation.

Default = ESC-50 (~600 MB, single zip, 2000 environmental clips). MUSAN is the
larger alternative (~11 GB tarball; only the noise/ subtree is kept, ~200 MB).

Usage:
    uv run python backend/download_noise.py            # ESC-50
    uv run python backend/download_noise.py --source musan
"""
from __future__ import annotations

import argparse
import io
import shutil
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ESC50_URL = "https://github.com/karolpiczak/ESC-50/archive/master.zip"
MUSAN_URL = "https://us.openslr.org/resources/17/musan.tar.gz"

BASE_DIR = Path(__file__).resolve().parent
DEST = BASE_DIR / "noise"
TMP = Path("/tmp")


def _stream_to(url: str, dst: Path) -> None:
    print(f"Downloading {url} -> {dst}")
    with urllib.request.urlopen(url) as r:
        total = int(r.headers.get("Content-Length", 0))
        done = 0
        last_pct = -1
        with open(dst, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                if total:
                    pct = done * 100 // total
                    if pct != last_pct and pct % 5 == 0:
                        print(f"  {pct}% ({done >> 20} / {total >> 20} MB)")
                        last_pct = pct
    print(f"  done ({done >> 20} MB)")


def fetch_esc50() -> int:
    archive = TMP / "esc50.zip"
    if not archive.exists():
        _stream_to(ESC50_URL, archive)
    DEST.mkdir(parents=True, exist_ok=True)
    print("Extracting ESC-50/audio/*.wav ...")
    n = 0
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if not name.endswith(".wav"):
                continue
            if "/audio/" not in name:
                continue
            out = DEST / Path(name).name
            if out.exists():
                continue
            with z.open(name) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
            n += 1
    print(f"  {n} wavs in {DEST}")
    return n


def fetch_musan() -> int:
    archive = TMP / "musan.tar.gz"
    if not archive.exists():
        _stream_to(MUSAN_URL, archive)
    DEST.mkdir(parents=True, exist_ok=True)
    print("Extracting musan/noise/**.wav ...")
    n = 0
    with tarfile.open(archive, "r:gz") as tar:
        for m in tar:
            if not m.isfile() or not m.name.startswith("musan/noise/") or not m.name.endswith(".wav"):
                continue
            out = DEST / Path(m.name).name
            if out.exists():
                continue
            src = tar.extractfile(m)
            if src is None:
                continue
            with src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
            n += 1
    print(f"  {n} wavs in {DEST}")
    return n


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["esc50", "musan"], default="esc50")
    args = parser.parse_args()
    if args.source == "esc50":
        fetch_esc50()
    else:
        fetch_musan()
    return 0


if __name__ == "__main__":
    sys.exit(main())
