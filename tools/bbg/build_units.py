"""Build the data of the "Unité" mode (military units) from the BBG site.

Usage (from the repository root):

    git -C bbg sparse-checkout add \
        '/fr_FR/units_7.5.html' '/en_US/units_7.5.html' '/images/units/'
    python tools/bbg/build_units.py bbg 7.5

Inputs
------
- ``<bbg>/<lang>/units_<version>.html`` (``fr_FR`` for names, ``en_US`` for
  the English names used as search aliases). Layout relied upon: each unit is
  introduced by an HTML comment ``<!--LOC_UNIT_<KEY>_NAME-->`` followed by
  ``<h2 class="civ-name">Name <img src="/images/units/X.webp">``.
- ``<bbg>/images/units/*.webp``: unit icons, copied as is (shown in the
  history and once the unit is found; never as a clue). The page links some icons
  that the folder does not have (``Longbowman.webp`` in 7.5; the site then
  shows a generic image): ``icon`` is ``null`` for those units.
- ``audio/units/<id>-<kind>.<ext>`` (optional, not produced by this script):
  the sounds of each unit, see "Sons" below.

Outputs
-------
- ``data/units.json`` (overwritten): one record per military unit: ``id``
  (icon file stem, e.g. ``man-at-arms``), ``name`` (French), ``aliases``
  (English name if different), ``icon``, ``sounds`` (``{kind: path}`` of the
  sound files, or ``null`` if there is none), ``source`` (page and LOC key).
- ``img/units/<id>.webp``

Choices
-------
- The page lists every unit, civilian or not. The religious units
  (``NON_MILITARY``) are left out, since the mode asks for a military unit.
  Support units (battering ram, medic, supply convoy...) are kept: in the
  game they are military units of the "support" class.
- Entries whose French name is missing on the page (the page then shows
  ``Not found: LOC_UNIT_..._NAME``; ``COG`` in 7.5) are skipped and listed
  on the error output.

Sons
----
The BBG site has no sounds, so they are not downloaded here. Put the files in
``audio/units/`` named ``<id>-<kind>.<ext>``, ``kind`` being one of SOUND_KINDS
(``audio/units/knight-move.mp3``, ``knight-attack.mp3``, ``knight-select.mp3``;
``.ogg``, ``.mp3``, ``.m4a``, ``.wav`` or ``.webm``) and run this script
again: it fills ``sounds`` for the units that have files and lists the files
whose name is not ``<unit id>-<kind>``. Only units with the three sounds can be
the answer of the day (``eligible`` in ``js/modes/son.js``); the others stay
in the data as possible guesses.

The files of the repository come from the game (Civilization VI, Windows,
base game and DLC Wwise banks) and cover the non-unique units only (no
TraitType in the game's Units table): the selection sound (event
``Unit_Selected``), the movement sound (``Unit_Move_2D``, grassland terrain)
and the attack sound (``Unit_Attack_2D``), with the unit's "Unit" switch
value from ``ArtDefs/Units.artdef``. A unit got sounds only when its selection
sound holds a recording that no other non-unique unit plays; movement and
attack sounds are often shared by a class of units. The game loops these
sounds (steps, several blows): each file keeps a single one.

The script stops if a key is missing in one language, or if an id or a
French name is duplicated (the guess input matches on names).
"""

import html
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_JSON = ROOT / "data" / "units.json"
OUT_IMG = ROOT / "img" / "units"
AUDIO_DIR = ROOT / "audio" / "units"
AUDIO_EXT = {".ogg", ".mp3", ".m4a", ".wav", ".webm"}
# Kinds of sound of a unit (suffix of the file name), see js/modes/son.js.
SOUND_KINDS = ("move", "attack", "select")

# Religious units of the page (not military).
NON_MILITARY = {"MISSIONARY", "APOSTLE", "INQUISITOR", "GURU"}

ENTRY_RE = re.compile(
    r'<!--LOC_UNIT_(\w+?)_NAME-->\s*'
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
    """Icon path -> ASCII id (``/images/units/Voi_Chiến.webp`` -> ``voi-chien``)."""
    stem = unicodedata.normalize("NFKD", Path(img).stem)
    stem = stem.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", stem).strip("-")


def find_sounds():
    """``{id: {kind: "audio/units/<id>-<kind>.<ext>"}}`` for the sound files
    present; files not named ``<id>-<kind>`` are listed under the key ``None``."""
    if not AUDIO_DIR.is_dir():
        return {}
    out = {}
    for f in sorted(AUDIO_DIR.iterdir()):
        if f.suffix.lower() not in AUDIO_EXT:
            continue
        rid, _, kind = f.stem.rpartition("-")
        path = f.relative_to(ROOT).as_posix()
        if kind not in SOUND_KINDS or not rid:
            out.setdefault(None, []).append(path)
            continue
        if kind in out.setdefault(rid, {}):
            sys.exit(f"Two {kind} sound files for {rid} in {AUDIO_DIR.relative_to(ROOT)}")
        out[rid][kind] = path
    return out


def main(bbg_dir, version):
    """Parse both pages, copy the icons, attach the sounds and write the JSON."""
    bbg = Path(bbg_dir)
    page = f"units_{version}.html"
    fr = parse_page(bbg / "fr_FR" / page)
    en = {e["key"]: e for e in parse_page(bbg / "en_US" / page)}
    if not fr:
        sys.exit("Nothing found: the page layout may have changed.")
    missing = sorted({e["key"] for e in fr} ^ set(en))
    if missing:
        sys.exit(f"Keys not present in both languages: {missing}")

    sounds = find_sounds()
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    records, ids, names = [], set(), set()
    for e in fr:
        if e["key"] in NON_MILITARY:
            continue
        if e["name"].startswith("Not found"):
            print(f"skipped (no French name on the page): LOC_UNIT_{e['key']}", file=sys.stderr)
            continue
        rid = make_id(e["img"])
        if not rid or rid in ids:
            sys.exit(f"Empty or duplicate id for {e['img']}")
        if e["name"].lower() in names:
            sys.exit(f"Duplicate French name {e['name']}")
        ids.add(rid)
        names.add(e["name"].lower())
        src = bbg / e["img"].lstrip("/")
        icon = None
        if src.exists():
            shutil.copyfile(src, OUT_IMG / f"{rid}.webp")
            icon = f"img/units/{rid}.webp"
        else:
            print(f"no icon on the BBG site for {rid} ({e['img']})", file=sys.stderr)
        name_en = en[e["key"]]["name"]
        records.append({
            "id": rid,
            "name": e["name"],
            "aliases": [name_en] if name_en != e["name"] else [],
            "icon": icon,
            "sounds": sounds.get(rid),
            "source": {"bbg": page, "locKey": f"LOC_UNIT_{e['key']}"},
        })

    unknown = [p for u in set(sounds) - ids for p in
               (sounds[u] if u is None else sounds[u].values())]
    for path in sorted(unknown):
        print(f"sound file not named <unit id>-<kind>: {path}", file=sys.stderr)
    records.sort(key=lambda r: r["id"])
    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    n_full = sum(1 for r in records if r["sounds"] and all(k in r["sounds"] for k in SOUND_KINDS))
    n_some = sum(1 for r in records if r["sounds"])
    print(f"{len(records)} units ({n_full} with the {len(SOUND_KINDS)} sounds, "
          f"{n_some} with at least one) -> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
