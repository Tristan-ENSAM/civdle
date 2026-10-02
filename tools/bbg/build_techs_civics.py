"""Build the data of the "Technologies & Dogmes" mode from the BBG site.

Usage (from the repository root):

    git -C bbg sparse-checkout add \
        '/fr_FR/tech_tree_7.5.html' '/en_US/tech_tree_7.5.html' \
        '/fr_FR/civic_tree_7.5.html' '/en_US/civic_tree_7.5.html' \
        '/images/techs/' '/images/civic/'
    python tools/bbg/build_techs_civics.py bbg 7.5

Inputs
------
- ``<bbg>/<lang>/tech_tree_<version>.html`` and ``civic_tree_<version>.html``
  (``fr_FR`` for names and eras, ``en_US`` for the English names used as
  search aliases). Layout relied upon: era headers
  ``<!--ERA_<KEY>--> <h2 class="civ-name">Era name <img ...>`` and entries
  ``<!--LOC_TECH_<KEY>_NAME-->`` / ``<!--LOC_CIVIC_<KEY>_NAME-->`` followed
  by ``<h3 class="civ-ability-name" ...>Name <img src="/images/techs/X.webp">``.
- ``<bbg>/images/techs/*.webp`` and ``<bbg>/images/civic/*.webp``: icons
  (160x160, transparent background), copied as is.

Outputs
-------
- ``data/techs_civics.json`` (overwritten): one record per technology or
  civic: ``id`` (``tech-<icon stem>`` / ``civic-<icon stem>``), ``name``
  (French), ``aliases`` (English name if different), ``kind`` (``"tech"`` or
  ``"civic"``), ``era`` (French era label as on the BBG page), ``icon``,
  ``source`` (page and LOC key).
- ``img/techs-civics/<id>.webp``

The script stops if a key is missing in one language, if an id or a French
name is duplicated (the guess input matches on names), or if an icon file
is missing.
"""

import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_JSON = ROOT / "data" / "techs_civics.json"
OUT_IMG = ROOT / "img" / "techs-civics"

PAGES = {"tech": "tech_tree", "civic": "civic_tree"}

ENTRY_RE = re.compile(
    r'<!--ERA_\w+-->\s*<h2 class="civ-name">(.*?)\s*<img'
    r'|<!--LOC_(TECH|CIVIC)_(\w+?)_NAME-->\s*'
    r'<h3 class="civ-ability-name"[^>]*>(.*?)\s*<img[^>]*src="([^"]+)"',
    re.S,
)


def parse_page(path, kind):
    """Return the entries of one tech or civic tree page, in page order.

    Parameters
    ----------
    path : Path
        ``tech_tree_<version>.html`` or ``civic_tree_<version>.html``.
    kind : str
        ``"tech"`` or ``"civic"``; entries of the other kind are an error.

    Returns
    -------
    list of dict
        ``{"kind", "era", "key", "name", "img"}``; ``era`` is the label of the
        last era header seen before the entry.
    """
    text = path.read_text(encoding="utf-8")
    text = text[text.find("<main"):]  # skip the sidebar (era menu)
    out, era = [], None
    for m in ENTRY_RE.finditer(text):
        if m.group(1) is not None:
            era = html.unescape(m.group(1).strip())
            continue
        if m.group(2).lower() != kind:
            sys.exit(f"{path}: unexpected {m.group(2)} entry {m.group(3)}")
        out.append({
            "kind": kind,
            "era": era,
            "key": m.group(3),
            "name": html.unescape(m.group(4).strip()),
            "img": m.group(5),
        })
    return out


def make_id(kind, img):
    """``("tech", "/images/techs/Bronze_Working.webp")`` -> ``tech-bronze-working``."""
    stem = re.sub(r"[^a-z0-9]+", "-", Path(img).stem.lower()).strip("-")
    return f"{kind}-{stem}"


def main(bbg_dir, version):
    """Parse the four pages, copy the icons and write the JSON."""
    bbg = Path(bbg_dir)
    fr, en = [], {}
    for kind, page in PAGES.items():
        name = f"{page}_{version}.html"
        fr += parse_page(bbg / "fr_FR" / name, kind)
        for e in parse_page(bbg / "en_US" / name, kind):
            en[(kind, e["key"])] = e
    if not fr:
        sys.exit("Nothing found: the page layout may have changed.")
    missing = sorted({(e["kind"], e["key"]) for e in fr} ^ set(en))
    if missing:
        sys.exit(f"Keys not present in both languages: {missing}")

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    records, ids, names = [], set(), set()
    for e in fr:
        rid = make_id(e["kind"], e["img"])
        if rid in ids:
            sys.exit(f"Duplicate id {rid}")
        if e["name"].lower() in names:
            sys.exit(f"Duplicate French name {e['name']}")
        if e["era"] is None:
            sys.exit(f"{e['key']}: no era header before the entry")
        ids.add(rid)
        names.add(e["name"].lower())
        src = bbg / e["img"].lstrip("/")
        if not src.exists():
            sys.exit(f"Missing icon {src}")
        shutil.copyfile(src, OUT_IMG / f"{rid}.webp")
        name_en = en[(e["kind"], e["key"])]["name"]
        records.append({
            "id": rid,
            "name": e["name"],
            "aliases": [name_en] if name_en != e["name"] else [],
            "kind": e["kind"],
            "era": e["era"],
            "icon": f"img/techs-civics/{rid}.webp",
            "source": {
                "bbg": f"{PAGES[e['kind']]}_{version}.html",
                "locKey": f"LOC_{e['kind'].upper()}_{e['key']}",
            },
        })

    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    n_tech = sum(r["kind"] == "tech" for r in records)
    print(f"{n_tech} techs + {len(records) - n_tech} civics -> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
