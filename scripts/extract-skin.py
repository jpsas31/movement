#!/usr/bin/env python3
"""
Extract a Winamp .wsz skin into a TypeScript WinampSkin constant
and register it in src/skin.ts.

Usage:
    python3 scripts/extract-skin.py path/to/SkinName.wsz
    python3 scripts/extract-skin.py path/to/SkinName.wsz --name "Display Name"
    python3 scripts/extract-skin.py path/to/SkinName.wsz --var MY_SKIN_VAR

The script will:
  1. Read pledit.bmp and Pledit.txt from the .wsz (zip)
  2. Slice sprites per Webamp's skinSprites.ts coordinates
  3. Parse PLEDIT.txt for colors
  4. Append the new skin constant to src/skin.ts
  5. Update the SKIN_REGISTRY array to include it
"""

from __future__ import annotations

import argparse
import base64
import io
import os
import re
import sys
import zipfile

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow", file=sys.stderr)
    sys.exit(1)

# Sprite map from Webamp skinSprites.ts — PLEDIT section
SPRITE_MAP = {
    "top_tile":      (127, 21,  25, 20),
    "top_left":      (0,   21,  25, 20),
    "title_bar":     (26,  21, 100, 20),
    "top_right":     (153, 21,  25, 20),
    "left_tile":     (0,   42,  12, 29),
    "right_tile":    (31,  42,  20, 29),
    "bottom_tile":   (179,  0,  25, 38),
    "bottom_left":   (0,   72, 125, 38),
    "bottom_right":  (126, 72, 150, 38),
    "top_tile_sel":  (127,  0,  25, 20),
    "top_left_sel":  (0,    0,  25, 20),
    "title_bar_sel": (26,   0, 100, 20),
    "top_right_sel": (153,  0,  25, 20),
}

DEFAULT_COLORS = {
    "normal": "#00FF00",
    "current": "#FFFFFF",
    "normalbg": "#000000",
    "selectedbg": "#0000C6",
    "font": "Arial",
}


def find_file_in_zip(zf: zipfile.ZipFile, name: str) -> str | None:
    """Case-insensitive file lookup in zip."""
    for n in zf.namelist():
        if n.lower() == name.lower():
            return n
    return None


def parse_pledit_txt(text: str) -> dict[str, str]:
    """Parse Winamp PLEDIT.txt INI-style file into a dict."""
    data = {}
    for line in text.splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("["):
            key, val = line.split("=", 1)
            data[key.strip().lower()] = val.strip()
    return data


def normalize_color(color: str) -> str:
    """Ensure color starts with # and is 7 chars."""
    if not color.startswith("#"):
        color = "#" + color
    return color[:7]


def extract_sprites(img: Image.Image) -> dict[str, str]:
    """Crop sprite regions and return as base64 data URLs."""
    img = img.convert("RGBA")
    sprites = {}
    for name, (x, y, w, h) in SPRITE_MAP.items():
        crop = img.crop((x, y, x + w, y + h))
        buf = io.BytesIO()
        crop.save(buf, format="PNG", optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode()
        sprites[name] = f"data:image/png;base64,{b64}"
    return sprites


def make_var_name(display_name: str) -> str:
    """Convert display name to UPPER_SNAKE_CASE variable name."""
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", display_name).strip("_")
    return cleaned.upper() + "_SKIN"


def generate_ts_constant(var_name: str, display_name: str, colors: dict, sprites: dict) -> str:
    """Generate a TypeScript WinampSkin constant."""
    lines = [f"export const {var_name}: WinampSkin = {{"]
    lines.append(f'  name: "{display_name}",')
    lines.append("  colors: {")
    lines.append(f'    normal: "{colors["normal"]}",')
    lines.append(f'    current: "{colors["current"]}",')
    lines.append(f'    normalBg: "{colors["normalbg"]}",')
    lines.append(f'    selectedBg: "{colors["selectedbg"]}",')
    font = colors.get("font", "Arial")
    if "," not in font:
        font = f"{font}, sans-serif"
    lines.append(f'    font: "{font}",')
    lines.append("  },")
    lines.append("  sprites: {")
    for name in SPRITE_MAP:
        lines.append(f'    {name}: "{sprites[name]}",')
    lines.append("  },")
    lines.append("};")
    return "\n".join(lines)


def update_skin_ts(skin_ts_path: str, new_constant: str, var_name: str):
    """Append the new skin constant and update SKIN_REGISTRY."""
    with open(skin_ts_path, "r") as f:
        content = f.read()

    if var_name in content:
        print(f"Warning: {var_name} already exists in {skin_ts_path}. Skipping.", file=sys.stderr)
        return False

    # Find the SKIN_REGISTRY line and add the new var
    registry_pattern = r"(export const SKIN_REGISTRY: WinampSkin\[\] = \[)(.*?)(\];)"
    match = re.search(registry_pattern, content, re.DOTALL)
    if not match:
        print(f"Error: Could not find SKIN_REGISTRY in {skin_ts_path}", file=sys.stderr)
        return False

    # Insert new constant before the registry line
    registry_start = match.start()
    content = content[:registry_start] + new_constant + "\n\n" + content[registry_start:]

    # Re-find registry after insertion (offset shifted)
    match = re.search(registry_pattern, content, re.DOTALL)
    existing_entries = match.group(2).strip()
    if existing_entries.endswith(","):
        new_entries = f"{existing_entries} {var_name}"
    else:
        new_entries = f"{existing_entries}, {var_name}"

    content = (
        content[: match.start()]
        + f"export const SKIN_REGISTRY: WinampSkin[] = [{new_entries}];"
        + content[match.end() :]
    )

    with open(skin_ts_path, "w") as f:
        f.write(content)

    return True


def main():
    parser = argparse.ArgumentParser(description="Extract Winamp .wsz skin for Movement")
    parser.add_argument("wsz_path", help="Path to .wsz skin file")
    parser.add_argument("--name", help="Display name (default: derived from filename)")
    parser.add_argument("--var", help="TypeScript variable name (default: derived from name)")
    parser.add_argument("--dry-run", action="store_true", help="Print generated code without modifying skin.ts")
    args = parser.parse_args()

    wsz_path = os.path.expanduser(args.wsz_path)
    if not os.path.isfile(wsz_path):
        print(f"Error: File not found: {wsz_path}", file=sys.stderr)
        sys.exit(1)

    # Derive names
    basename = os.path.splitext(os.path.basename(wsz_path))[0]
    display_name = args.name or basename.replace("_", " ").replace("-", " ")
    var_name = args.var or make_var_name(display_name)

    print(f"Skin: {display_name}")
    print(f"Variable: {var_name}")
    print(f"Source: {wsz_path}")
    print()

    # Open and extract
    with zipfile.ZipFile(wsz_path, "r") as zf:
        # Parse Pledit.txt
        pledit_name = find_file_in_zip(zf, "pledit.txt")
        if pledit_name:
            raw = zf.read(pledit_name).decode("utf-8", errors="replace")
            parsed = parse_pledit_txt(raw)
        else:
            print("Warning: No Pledit.txt found, using default colors", file=sys.stderr)
            parsed = {}

        colors = {}
        for key in ["normal", "current", "normalbg", "selectedbg"]:
            val = parsed.get(key, DEFAULT_COLORS[key])
            colors[key] = normalize_color(val)
        colors["font"] = parsed.get("font", DEFAULT_COLORS["font"])

        print("Colors:")
        for k, v in colors.items():
            print(f"  {k}: {v}")
        print()

        # Extract sprites from pledit.bmp
        bmp_name = find_file_in_zip(zf, "pledit.bmp")
        if not bmp_name:
            print("Error: No pledit.bmp found in skin", file=sys.stderr)
            sys.exit(1)

        img = Image.open(io.BytesIO(zf.read(bmp_name)))
        print(f"pledit.bmp: {img.size[0]}x{img.size[1]}")
        sprites = extract_sprites(img)
        print(f"Extracted {len(sprites)} sprites")
        print()

    # Generate TypeScript
    ts_code = generate_ts_constant(var_name, display_name, colors, sprites)

    if args.dry_run:
        print("--- Generated TypeScript ---")
        print(ts_code)
        return

    # Find skin.ts
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    skin_ts = os.path.join(project_root, "src", "skin.ts")

    if not os.path.isfile(skin_ts):
        print(f"Error: {skin_ts} not found", file=sys.stderr)
        sys.exit(1)

    if update_skin_ts(skin_ts, ts_code, var_name):
        print(f"Added {var_name} to {skin_ts}")
        print(f"Updated SKIN_REGISTRY to include {var_name}")
        print()
        print("Done. Press P in the app to see the new skin in the SKINS section.")
    else:
        print("No changes made.")


if __name__ == "__main__":
    main()
