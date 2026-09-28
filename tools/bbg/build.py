"""Build Civdle data from the BBG documentation site and the sourced overrides.

Usage (from the repository root):

    git clone --depth 1 --filter=blob:none --sparse \
        https://github.com/civ6bbg/civ6bbg.github.io bbg
    git -C bbg sparse-checkout set --no-cone \
        '/fr_FR/leaders_7.5.html' '/en_US/leaders_7.5.html' '/images/leaders/'
    python tools/bbg/build.py bbg 7.5

Inputs
------
- ``<bbg>/fr_FR/leaders_<version>.html`` and ``<bbg>/en_US/leaders_<version>.html``:
  leaders, abilities and unique items (French texts, English names used as
  search aliases). Parsed by ``parse_bbg.py``.
- ``<bbg>/images/leaders/*.webp``: leader portraits (256x256, transparent).
- ``tools/bbg/sources.json``: values that are NOT on the BBG site (extension,
  gender, continent), each with its provenance.

Outputs
-------
- ``data/leaders.json`` (overwritten)
- ``data/catalogs.json`` (overwritten)
- ``img/portraits/<id>.webp``
- ``silhouetteSource``: "game" (tools/game/import_textures.py) or "cutout"
  (make_silhouettes.py), None without silhouette.
- ``silhouette`` field: ``img/silhouettes/<id>.png`` when it exists (made by
  ``make_silhouettes.py``) and is not listed in ``silhouettes_rejected.json``

Derived fields
--------------
- ``uniqueUnitClass``: parsed from the first sentence of each unique unit's
  BBG description ("Unité de cavalerie lourde ..."), see ``UNIT_CLASS_RULES``.
  Great people listed as units ("Personnage illustre ...") are skipped.
- ``uniqueDistrict``: base district replaced by each unique district, parsed
  from "remplaçant le/la/l'<district>" in its BBG description.
- ``descriptions``: leader ability, civ ability, then each unique item, in that
  order (French BBG texts, game markup removed).
- ``era``: not built (no source); left null for manual filling.

Any unit or district that cannot be classified is reported on stderr and
left out of the corresponding field; the script never guesses.
"""

import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_bbg import parse  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

# First match wins; tested against the lowercased first sentence of the unit
# description. Order matters: naval / mounted rules before generic ones.
UNIT_CLASS_RULES = [
    (r"personnage illustre", None),
    (r"navale de combat rapproch", "naval_melee"),
    (r"navale de combat à distance", "naval_ranged"),
    (r"navale d'assaut", "naval_raider"),
    (r"navale de soutien", "support"),
    (r"chasseur aérien", "air_fighter"),
    (r"montée d'attaque à distance|montée de combat à distance", "ranged_cavalry"),
    (r"cavalerie lourde", "heavy_cavalry"),
    (r"cavalerie légère", "light_cavalry"),
    (r"anti-cavalerie", "anti_cavalry"),
    (r"reconnaissance", "recon"),
    (r"siège", "siege"),
    (r"combat à distance", "ranged"),
    (r"combat rapproch", "melee"),
]

UNIT_CLASSES = {
    "melee":          {"label": "Combat rapproché",          "icon": "img/icons/units/warrior.png"},
    "ranged":         {"label": "Combat à distance",         "icon": "img/icons/units/slinger.png"},
    "anti_cavalry":   {"label": "Anti-cavalerie",            "icon": "img/icons/units/spearman.png"},
    "light_cavalry":  {"label": "Cavalerie légère",          "icon": "img/icons/units/horseman.png"},
    "heavy_cavalry":  {"label": "Cavalerie lourde"},
    "ranged_cavalry": {"label": "Unité montée à distance", "icon": "img/icons/units/barbarian_horse_archer.png"},
    "recon":          {"label": "Reconnaissance", "icon": "img/icons/units/scout.png"},
    "siege":          {"label": "Siège", "icon": "img/icons/units/catapult.png"},
    "naval_melee":    {"label": "Naval combat rapproché", "icon": "img/icons/units/galley.png"},
    "naval_ranged":   {"label": "Naval combat à distance", "icon": "img/icons/units/quadrireme.png"},
    "naval_raider":   {"label": "Naval assaut en mer", "icon": "img/icons/units/privateer.png"},
    "support":        {"label": "Soutien"},
    "air_fighter":    {"label": "Chasseur aérien", "icon": "img/icons/units/biplane.png"},
}

# French base-district name (as written after "remplaçant") -> catalog id.
DISTRICT_NAMES = {
    "complexe de loisirs": "entertainment_complex",
    "parc aquatique": "water_entertainment_complex",
    "port": "harbor",
    "zone industrielle": "industrial_zone",
    "place du théâtre": "theater",
    "quartier résidentiel": "neighborhood",
    "campus": "campus",
    "plateforme commerciale": "commercial_hub",
    "aqueduc": "aqueduct",
    "lieu saint": "holy_site",
    "campement": "encampment",
    "quartier diplomatique": "diplomatic_quarter",
}

DISTRICTS = {
    "aqueduct":                    {"label": "Aqueduc"},
    "campus":                      {"label": "Campus"},
    "commercial_hub":              {"label": "Plateforme commerciale"},
    "diplomatic_quarter":          {"label": "Quartier diplomatique"},
    "encampment":                  {"label": "Campement"},
    "entertainment_complex":       {"label": "Complexe de loisirs"},
    "harbor":                      {"label": "Port"},
    "holy_site":                   {"label": "Lieu saint"},
    "industrial_zone":             {"label": "Zone industrielle"},
    "neighborhood":                {"label": "Quartier résidentiel"},
    "theater":                     {"label": "Place du théâtre"},
    "water_entertainment_complex": {"label": "Parc aquatique"},
}
for _k, _v in DISTRICTS.items():
    _v["icon"] = f"img/icons/districts/{_k}.png"

# Civ names made of several words, at the start of the page headings.
MULTIWORD_CIVS = ["Grande Colombie", "Peuple khmer", "Gran Colombia"]

# Words never used alone as masks in descriptions (too common or not names).
MASK_STOPWORDS = {"le", "la", "les", "de", "du", "des", "d", "a", "ibn", "the", "of",
                  "ier", "ire", "ière", "ii", "iii", "vii", "grand", "grande", "dame",
                  "lady", "khan"}


def warn(msg):
    print(f"[warn] {msg}", file=sys.stderr)


def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def split_heading(heading):
    """Split a "Civ Leader" page heading into (civ, leader).

    The civ is the first word, except for the multi-word names listed in
    MULTIWORD_CIVS (checked by hand against the full list of headings).
    """
    for m in MULTIWORD_CIVS:
        if heading.startswith(m + " "):
            return m, heading[len(m) + 1:]
    civ, _, rest = heading.partition(" ")
    return civ, rest


def clean_game_text(t):
    t = re.sub(r"\[(COLOR[^\]]*|ENDCOLOR|ICON_[^\]]*)\]", "", t)
    t = t.replace("[NEWLINE]", "\n")
    t = re.sub(r"\n{3,}", "\n\n", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def unit_class(desc):
    first = desc.split("\n")[0].lower()
    for pattern, cls in UNIT_CLASS_RULES:
        if re.search(pattern, first):
            return cls, True
    return None, False


def replaced_district(desc):
    m = re.search(r"remplaçant (?:le |la |l'|l’)([^.,\n]+?)(?: et |[.,\n]|$)", desc)
    if not m:
        return None
    return DISTRICT_NAMES.get(m.group(1).strip().lower())


def silhouette_focus(image_path, seed):
    """Pick a zoom point on the outline of a transparent portrait.

    Outline pixels are opaque pixels (alpha >= 128) with at least one
    transparent 4-neighbour. One of them is chosen deterministically from
    ``seed``. Returns [x%, y%] or None if Pillow is missing or no outline is
    found (the site then falls back to a random point).
    """
    try:
        from PIL import Image
    except ImportError:
        warn("Pillow not installed: silhouetteFocus not computed")
        return None
    import hashlib
    im = Image.open(image_path).convert("RGBA")
    w, h = im.size
    a = im.getchannel("A").load()
    edge = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if a[x, y] >= 128 and min(a[x - 1, y], a[x + 1, y], a[x, y - 1], a[x, y + 1]) < 128:
                edge.append((x, y))
    if not edge:
        return None
    idx = int(hashlib.sha1(seed.encode()).hexdigest(), 16) % len(edge)
    x, y = edge[idx]
    return [round(100 * x / w, 1), round(100 * y / h, 1)]


def mask_words(names):
    """Extra words to mask: significant words of the given names."""
    words = set()
    for n in names:
        core = re.sub(r"\(.*?\)", "", n)
        for w in re.split(r"[^\w'’-]+", core):
            if len(w) >= 3 and w.lower() not in MASK_STOPWORDS and w[0].isupper():
                words.add(w)
    return sorted(words)


def main(bbg_dir, version):
    bbg = Path(bbg_dir)
    fr = parse(bbg / "fr_FR" / f"leaders_{version}.html")
    en = parse(bbg / "en_US" / f"leaders_{version}.html")
    if [x["leaderKey"] + x["civKey"] for x in fr] != [x["leaderKey"] + x["civKey"] for x in en]:
        sys.exit("FR and EN pages do not list the same leaders in the same order")
    src = json.loads((Path(__file__).parent / "sources.json").read_text(encoding="utf-8"))

    rejected = json.loads((Path(__file__).parent / "silhouettes_rejected.json").read_text(encoding="utf-8"))
    game_ids = set(json.loads((ROOT / "tools" / "game" / "mapping.json").read_text(encoding="utf-8"))["textures"].values())
    out_dir = ROOT / "img" / "portraits"
    out_dir.mkdir(parents=True, exist_ok=True)
    leaders, used_ids = [], set()
    for f, e in zip(fr, en):
        civ_fr, name_fr = split_heading(f["heading"])
        civ_en, name_en = split_heading(e["heading"])
        lid = slug(e["heading"])
        if lid in used_ids:
            sys.exit(f"duplicate id {lid}")
        used_ids.add(lid)

        classes, districts = [], []
        for it in f["items"]:
            if it["kind"] == "unit":
                cls, ok = unit_class(it["desc"])
                if not ok:
                    warn(f"{f['heading']}: unit '{it['name']}' not classified: {it['desc'][:80]!r}")
                elif cls and cls not in classes:
                    classes.append(cls)
            elif it["kind"] == "district":
                d = replaced_district(it["desc"])
                if not d:
                    warn(f"{f['heading']}: district '{it['name']}' replaced district not found")
                elif d not in districts:
                    districts.append(d)

        # Portrait
        portrait = None
        p = bbg / "images" / "leaders" / f["portraitFile"]
        if p.exists():
            shutil.copyfile(p, out_dir / f"{lid}.webp")
            portrait = f"img/portraits/{lid}.webp"
        else:
            warn(f"{f['heading']}: portrait not found ({p.name})")

        # Silhouette: produced by make_silhouettes.py (quality-checked); none
        # if missing or rejected after visual review -> not in Silhouette mode.
        sil = None
        if (ROOT / "img" / "silhouettes" / f"{lid}.png").exists() and lid not in rejected:
            sil = f"img/silhouettes/{lid}.png"
        # "game": exact outline from the official textures (tools/game);
        # "cutout": estimated by background removal (make_silhouettes.py).
        sil_source = None if sil is None else ("game" if lid in game_ids else "cutout")

        ext = src["extension"].get(f["leaderKey"])
        if ext is None:
            warn(f"{f['heading']}: no extension in sources.json")
        gender = src["gender"].get(f["leaderKey"], [None, None])[1]
        if gender is None:
            warn(f"{f['heading']}: no gender in sources.json")
        cont = src["continent"].get(f["civKey"], {}).get("continent")
        if not cont:
            warn(f"{f['heading']}: no continent in sources.json")

        texts = [a["desc"] for a in reversed(f["abilities"])]  # leader ability first
        texts += [f"{it['desc']}" for it in f["items"]]
        texts = [clean_game_text(t) for t in texts if t.strip()]

        aliases = sorted({name_en, re.sub(r"\s*\(.*?\)", "", name_en), re.sub(r"\s*\(.*?\)", "", name_fr)} - {name_fr})
        leaders.append({
            "id": lid,
            "name": name_fr,
            "aliases": aliases,
            "civilization": civ_fr,
            "era": None,
            "continent": cont or [],
            "uniqueDistrict": districts,
            "uniqueUnitClass": classes,
            "gender": gender,
            "extension": ext,
            "portrait": portrait,
            "silhouette": sil,
            "silhouetteFocus": silhouette_focus(ROOT / sil, lid) if sil else None,
            "silhouetteSource": sil_source,
            "descriptions": texts,
            "maskWords": sorted(set(mask_words([name_fr, name_en]) + [civ_en]
                                    + [it["name"] for it in f["items"]])),
            "source": {"bbg": f"leaders_{version}.html", "civKey": f["civKey"], "leaderKey": f["leaderKey"]},
        })

    (ROOT / "data" / "leaders.json").write_text(json.dumps(leaders, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "data" / "catalogs.json").write_text(json.dumps({"districts": DISTRICTS, "unitClasses": UNIT_CLASSES},
                                                            ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(leaders)} leaders written")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
