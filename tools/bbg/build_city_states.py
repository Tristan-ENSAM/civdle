"""Build the city-state data of the "Cités-État" mode from the BBG site.

Usage (from the repository root):

    git clone --depth 1 --filter=blob:none --sparse \
        https://github.com/civ6bbg/civ6bbg.github.io bbg
    git -C bbg sparse-checkout set --no-cone \
        '/fr_FR/city_states_7.5.html' '/en_US/city_states_7.5.html' \
        '/images/city_states/'
    python tools/bbg/build_city_states.py bbg 7.5

Inputs
------
- ``<bbg>/fr_FR/city_states_<version>.html``: list of city-states, grouped by
  type (``<div class="col-lg-12" id="<Type>">`` headers), each introduced by
  an HTML comment ``<!--LOC_CIVILIZATION_<KEY>_NAME-->`` or
  ``<!--LOC_CIVILIZATION_<KEY>_FRONTEND_NAME-->`` followed by
  ``<h2 class="civ-name">Name <img src="/images/city_states/X.webp">``.
  French names and types are read here.
- ``<bbg>/en_US/city_states_<version>.html``: same layout; the English names
  are used as search aliases. Both pages must list the same keys.
- ``<bbg>/images/city_states/*.webp``: icons, 256x256 RGB, a uniform dark
  background and a single glyph colour (checked: the script stops if an icon
  does not match this assumption, see ``check_icon``).

Outputs
-------
- ``data/city_states.json`` (overwritten): one record per city-state:
  ``id``, ``name`` (French), ``aliases`` (English name if different),
  ``type`` (French type label, as on the BBG page), ``icon`` (colour image),
  ``iconGrey`` (challenger image), ``source`` (page and LOC key).
- ``img/city-states/<id>.webp``: icon copied as is.
- ``img/city-states/<id>-grey.webp``: challenger icon. On the BBG icons the
  glyph colour encodes the city-state type (one colour per type), so a plain
  luminance conversion would still leak the type (a red glyph turns dark
  grey, a white one stays white). Instead, each pixel is projected onto the
  segment background -> glyph colour, which gives its coverage ``t`` in
  [0, 1] (anti-aliasing included), and redrawn as
  ``background + t * (GREY - background)``. Every glyph thus ends up in the
  same grey, whatever its type.

The ``id`` is derived from the BBG icon file name, which is the English name
(``Vatican City.webp`` -> ``vatican-city``). The LOC key is not used for it
because some keys are legacy game keys unrelated to the displayed name
(``PALENQUE`` -> Mitla, ``LISBON`` -> Mogadiscio, ``ANTIOCH`` -> Venise,
``BABYLON`` -> Anshan); it is kept in ``source.locKey``.
"""

import html
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_JSON = ROOT / "data" / "city_states.json"
OUT_IMG = ROOT / "img" / "city-states"

# Grey level of the challenger glyph (0-255). Arbitrary, chosen to stay
# readable on the dark icon background.
GREY = 190
# Tolerances of check_icon (0-255 per channel). Arbitrary.
BG_TOL = 6          # background corners must be within this of each other
GLYPH_MIN_DIST = 40  # a pixel farther than this from the background is "glyph"

ENTRY_RE = re.compile(
    r'<div class="col-lg-12" id="([^"]+)">'
    r'|<!--LOC_CIVILIZATION_(\w+?)_(?:FRONTEND_)?NAME-->\s*'
    r'<h2 class="civ-name">(.*?)\s*<img[^>]*src="([^"]+)"',
    re.S,
)


def parse_page(path):
    """Return the city-states of one BBG page, in page order.

    Parameters
    ----------
    path : Path
        ``city_states_<version>.html`` of one language.

    Returns
    -------
    list of dict
        ``{"type", "key", "name", "img"}``; ``type`` is the id of the last
        type header seen before the entry (``None`` if there is none).
    """
    text = path.read_text(encoding="utf-8")
    text = text[text.find("<main"):]  # skip the sidebar (type menu)
    out, current = [], None
    for m in ENTRY_RE.finditer(text):
        if m.group(1):
            current = m.group(1)
            continue
        out.append({
            "type": current,
            "key": m.group(2),
            "name": html.unescape(m.group(3).strip()),
            "img": m.group(4),
        })
    return out


def make_id(img):
    """Icon path -> id (``/images/city_states/Vatican City.webp`` -> ``vatican-city``)."""
    stem = Path(img).stem
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


def check_icon(rgb, name):
    """Check the icon layout assumed by ``grey_icon`` and return its colours.

    Assumption: uniform background (taken from the four corners) and one
    glyph colour (median of the pixels far from the background).

    Parameters
    ----------
    rgb : ndarray, shape (H, W, 3), int
    name : str
        For error messages.

    Returns
    -------
    (ndarray, ndarray)
        Background colour and glyph colour, shape (3,).
    """
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    if np.ptp(corners, axis=0).max() > BG_TOL:
        sys.exit(f"{name}: non-uniform background corners {corners.tolist()}")
    bg = corners.mean(axis=0)
    far = np.abs(rgb - bg).max(axis=-1) > GLYPH_MIN_DIST
    if not far.any():
        sys.exit(f"{name}: no glyph found")
    glyph = np.median(rgb[far], axis=0)
    return bg, glyph


def grey_icon(rgb, bg, glyph):
    """Redraw the glyph in a single grey (see module docstring).

    Parameters
    ----------
    rgb : ndarray, shape (H, W, 3), int
    bg, glyph : ndarray, shape (3,)
        Colours returned by ``check_icon``.

    Returns
    -------
    PIL.Image.Image
        Greyscale ("L") image.
    """
    axis = glyph - bg
    t = ((rgb - bg) @ axis) / float(axis @ axis)
    t = np.clip(t, 0.0, 1.0)
    bg_level = float(bg.mean())
    out = bg_level + t * (GREY - bg_level)
    return Image.fromarray(np.round(out).astype(np.uint8), mode="L")


def main(bbg_dir, version):
    """Parse both pages, write the JSON and the two images per city-state."""
    bbg = Path(bbg_dir)
    page = f"city_states_{version}.html"
    fr = parse_page(bbg / "fr_FR" / page)
    en = {e["key"]: e for e in parse_page(bbg / "en_US" / page)}
    if not fr:
        sys.exit("No city-state found: the page layout may have changed.")
    missing = sorted({e["key"] for e in fr} ^ set(en))
    if missing:
        sys.exit(f"Keys not present in both languages: {missing}")

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    records, seen = [], set()
    for e in fr:
        cid = make_id(e["img"])
        if cid in seen:
            sys.exit(f"Duplicate id {cid}")
        seen.add(cid)
        if e["type"] is None:
            sys.exit(f"{e['key']}: no type header before the entry")
        src = bbg / e["img"].lstrip("/")
        rgb = np.asarray(Image.open(src).convert("RGB")).astype(float)
        bg, glyph = check_icon(rgb, src.name)
        Image.open(src).save(OUT_IMG / f"{cid}.webp", lossless=True)
        grey_icon(rgb, bg, glyph).save(OUT_IMG / f"{cid}-grey.webp", lossless=True)

        name_en = en[e["key"]]["name"]
        records.append({
            "id": cid,
            "name": e["name"],
            "aliases": [name_en] if name_en != e["name"] else [],
            "type": e["type"],
            "icon": f"img/city-states/{cid}.webp",
            "iconGrey": f"img/city-states/{cid}-grey.webp",
            "source": {"bbg": page, "locKey": f"LOC_CIVILIZATION_{e['key']}"},
        })

    records.sort(key=lambda r: r["id"])
    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    print(f"{len(records)} city-states -> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
