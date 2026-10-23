"""
tools/instance-poster.py - static, overlap-free instances of Bricolage Grotesque for the
outlined wordmark (tools/wordmark.mjs reads them).

    python tools/instance-poster.py        (needs: pip install fonttools skia-pathops)

The variable font keeps overlapping contours (the A crossbar is a rectangle laid over the legs,
the D has an inner stem, K and J joints overlap). Filled, that is invisible; stroked as an
outline it draws construction lines through the letters. fontTools' instancer pins the axes to
the poster setting and removes overlaps with skia-pathops (a true union of each glyph's
contours), so the stroke follows one inked line.

Outputs (committed, OFL like the source): tools/fonts/BricolageGrotesque-Poster800.ttf
(opsz 96, wdth 75, wght 800 - DIVJAKA) and -Poster700.ttf (wght 700 - HOTEL PELIKAN).
Run it only when the source font changes; `npm run wordmark` then rebuilds src/assets/wordmark.ts.
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import OverlapMode, instantiateVariableFont

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "fonts" / "BricolageGrotesque-VF.ttf"

for wght in (800, 700):
    vf = TTFont(SRC)
    inst = instantiateVariableFont(vf, {"opsz": 96, "wdth": 75, "wght": wght}, overlap=OverlapMode.REMOVE)
    out = ROOT / "fonts" / f"BricolageGrotesque-Poster{wght}.ttf"
    inst.save(out)
    print(f"wrote {out}")
