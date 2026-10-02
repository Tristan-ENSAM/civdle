"""Build the data of the "Aménagement" mode from the BBG site.

Usage (from the repository root):

    git -C bbg sparse-checkout add \
        '/fr_FR/improvements_7.5.html' '/en_US/improvements_7.5.html' \
        '/images/improvements/'
    python tools/bbg/build_improvements.py bbg 7.5

Inputs
------
- ``<bbg>/<lang>/improvements_<version>.html`` (``fr_FR`` for names,
  ``en_US`` for the English names used as search aliases). Layout relied
  upon: each improvement is introduced by an HTML comment
  ``<!--LOC_IMPROVEMENT_<KEY>_NAME-->`` (``_NAME`` is missing for some keys,
  e.g. ``LOC_IMPROVEMENT_MISSILE_SILO`` in 7.5), followed by
  ``<h2 class="civ-name">Name <img src="/images/improvements/X.webp">``.
- ``<bbg>/images/improvements/*.webp``: icons (transparent background, sizes
  vary between 186x215 and 276x272), copied as is. Icons of the folder that
  the page does not use are ignored.

Outputs
-------
- ``data/improvements.json`` (overwritten): one record per improvement:
  ``id`` (icon file stem, e.g. ``fishing-boats``), ``name`` (French),
  ``aliases`` (English name if different), ``icon``, ``source`` (page and
  LOC key).
- ``img/improvements/<id>.webp``

The script stops if a key is missing in one language, if an id or a French
name is duplicated (the guess input matches on names), or if an icon file
is missing.
"""

import html
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_JSON = ROOT / "data" / "improvements.json"
OUT_IMG = ROOT / "img" / "improvements"

ENTRY_RE = re.compile(
    r'<!--LOC_IMPROVEMENT_(\w+?)(?:_NAME)?-->\s*'
    r'<h2 class="civ-name">(.*?)\s*<img[^>]*src="([^"]+)"',
    re.S,
)


def parse_page(path):
    """Return ``[{"key", "name", "img"}]`` for one language, in page order."""
    text = path.read_text(encoding="utf-8")
    text = text[text.find("<main"):]  # skip the sidebar
    return [
        {"key": m.group(1), "name": html.unescape(m.group(2).strip()), "img": m.group(3)}
        for m in ENTRY_RE.finditer(text)
    ]


def make_id(img):
    """Icon path -> ASCII id (``/images/improvements/Pā.webp`` -> ``pa``)."""
    stem = unicodedata.normalize("NFKD", Path(img).stem)
    stem = stem.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", stem).strip("-")


def main(bbg_dir, version):
    """Parse both pages, copy the icons and write the JSON."""
    bbg = Path(bbg_dir)
    page = f"improvements_{version}.html"
    fr = parse_page(bbg / "fr_FR" / page)
    en = {e["key"]: e for e in parse_page(bbg / "en_US" / page)}
    if not fr:
        sys.exit("Nothing found: the page layout may have changed.")
    missing = sorted({e["key"] for e in fr} ^ set(en))
    if missing:
        sys.exit(f"Keys not present in both languages: {missing}")

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    records, ids, names = [], set(), set()
    for e in fr:
        rid = make_id(e["img"])
        if not rid or rid in ids:
            sys.exit(f"Empty or duplicate id for {e['img']}")
        if e["name"].lower() in names:
            sys.exit(f"Duplicate French name {e['name']}")
        ids.add(rid)
        names.add(e["name"].lower())
        src = bbg / e["img"].lstrip("/")
        if not src.exists():
            sys.exit(f"Missing icon {src}")
        shutil.copyfile(src, OUT_IMG / f"{rid}.webp")
        name_en = en[e["key"]]["name"]
        records.append({
            "id": rid,
            "name": e["name"],
            "aliases": [name_en] if name_en != e["name"] else [],
            "icon": f"img/improvements/{rid}.webp",
            "source": {"bbg": page, "locKey": f"LOC_IMPROVEMENT_{e['key']}"},
        })

    records.sort(key=lambda r: r["id"])
    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    print(f"{len(records)} improvements -> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
