#!/usr/bin/env python3
"""
Simple script to create a grayscale copy of Assets/machines.png
Usage:
  python3 tools/grayscale_machines.py

Requires Pillow (PIL). Install with:
  pip install pillow

Outputs: Assets/machines_gray.png
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Pillow is required. Install with: pip install pillow", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'Assets' / 'machines.png'
DST = ROOT / 'Assets' / 'machines_gray.png'

if not SRC.exists():
    print(f"Source not found: {SRC}", file=sys.stderr)
    sys.exit(1)

try:
    img = Image.open(SRC)
    # preserve alpha if present
    if img.mode in ('RGBA', 'LA'):
        # split alpha, convert RGB to L, then reattach alpha
        rgb, alpha = img.convert('RGB'), img.getchannel('A')
        gray = ImageOps.grayscale(rgb)
        out = Image.merge('LA', (gray, alpha)) if img.mode == 'LA' else Image.merge('RGBA', (gray.convert('L'), gray.convert('L'), gray.convert('L'), alpha))
    else:
        out = ImageOps.grayscale(img)
    out.save(DST)
    print(f"Wrote grayscale image to: {DST}")
except Exception as e:
    print(f"Failed to convert image: {e}", file=sys.stderr)
    sys.exit(1)
