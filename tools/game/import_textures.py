"""Make Silhouette-mode images from the official Civ VI leader textures.

Source: the "Sid Meier's Civilization VI SDK Assets" Steam depot (free with the
game, used for modding). Its ``pantry/Textures`` folders contain, for the
leaders of the base game, Rise and Fall and Gathering Storm, a texture
``LEADER_<NAME>_NEUTRAL.dds``: the leader figure alone, on a transparent
background (the scene is a separate ``LEADER_<NAME>_BACKGROUND.dds``). Its
alpha channel is therefore an exact silhouette, with no background removal
needed. Leaders from later DLC packs and from BBG Expanded have no such
texture in this depot, so they are not covered here.

The mapping texture name -> site id is ``mapping.json`` (next to this file).
Only the original persona of each leader is mapped: alternate personas
(e.g. Qin Unifier, Saladin Sultan) have different artwork that is not in the
depot, so the texture of the original persona is never reused for them.

Output, for each mapped leader:
- ``img/silhouettes/<id>.png``, a square RGBA image (``SIZE`` px) whose colour
  is pure black and whose alpha is the texture alpha;
- ``img/reveal/<id>.webp``, the same figure in colour with the same framing,
  shown when the player finds the silhouette (``leader.reveal``).
The figure is scaled to the full height and centred horizontally; the bottom
of the figure (cut by the texture frame) stays on the bottom edge.

These silhouettes take precedence over the ones computed from the BBG
portraits by ``tools/bbg/make_silhouettes.py``: the ids listed in
``mapping.json`` are skipped by that script.

Then ``silhouette``, ``silhouetteFocus`` and ``silhouetteSource`` ("game", or
"mod" for the third source) are updated in
``data/leaders.json`` for the imported ids (same focus rule as
``tools/bbg/build.py``: a deterministic point on the outline).

Usage (from the repository root):

    python tools/game/import_textures.py "<SDK Assets>/Civ6" ["<game>" ["<mod>"]]

where ``<SDK Assets>/Civ6`` is searched recursively for the .dds files and
``<game>`` is the game install folder ("Sid Meier's Civilization VI") and
``<mod>`` the BBG Expanded folder (steamapps/workshop/content/289070/3533091092).

Second source (optional ``<game>`` argument): DLC leaders are not in the SDK
depot, but each DLC package of the game ships ``LeaderFallbackImages.blp``
with the 2D fallback image of its leaders (figure alone, with alpha), read by
``blp.py``. Entries are listed in ``mapping.json`` under ``fallback`` by
package and record index, each checked visually.

Third source (optional ``<mod>`` argument): the BBG Expanded mod ships its own
fallback package for each of its leaders (``LeaderFallbacks.blp`` or similar,
same CIVBLP format), listed in ``mapping.json`` under ``mod``, also checked
visually. These are the mod authors' images, not Firaxis'.
Requires Pillow (DXT/BC decoding of .dds is built in).
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SIZE = 512  # output side in px (arbitrary: enough for the 5x zoom at ~400 px frame)

sys.path.insert(0, str(ROOT / "tools" / "bbg"))
sys.path.insert(0, str(HERE))
from build import silhouette_focus  # noqa: E402
import blp  # noqa: E402


def frame(im):
    """Crop to the figure, scale to SIZE px high/wide, centre, bottom-align."""
    im = im.convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source image fully transparent")
    im = im.crop(bbox)
    w, h = im.size
    scale = SIZE / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # Centred horizontally, bottom-aligned (the texture cuts the figure at the bottom).
    canvas.paste(im, ((SIZE - im.width) // 2, SIZE - im.height))
    return canvas


def make_silhouette(im, out_path, reveal_path=None):
    """Write the black/alpha silhouette (and optionally the colour figure)."""
    framed = frame(im)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.putalpha(framed.getchannel("A"))
    out.save(out_path, optimize=True)
    if reveal_path is not None:
        framed.save(reveal_path, quality=88)


def _write(by_id, lid, im, source="game"):
    if lid not in by_id:
        raise KeyError(f"mapping.json: unknown leader id {lid}")
    rel = f"img/silhouettes/{lid}.png"
    rev = f"img/reveal/{lid}.webp"
    (ROOT / "img" / "reveal").mkdir(parents=True, exist_ok=True)
    make_silhouette(im, ROOT / rel, ROOT / rev)
    by_id[lid]["silhouette"] = rel
    by_id[lid]["reveal"] = rev
    by_id[lid]["silhouetteFocus"] = silhouette_focus(ROOT / rel, lid)
    by_id[lid]["silhouetteSource"] = source


def main(sdk_dir, game_dir=None, mod_dir=None):
    mapping = json.loads((HERE / "mapping.json").read_text(encoding="utf-8"))
    leaders_path = ROOT / "data" / "leaders.json"
    leaders = json.loads(leaders_path.read_text(encoding="utf-8"))
    by_id = {l["id"]: l for l in leaders}
    done, missing = [], []

    # 1. SDK Assets: LEADER_<NAME>_NEUTRAL.dds
    found = {p.stem: p for p in Path(sdk_dir).rglob("LEADER_*_NEUTRAL.dds")}
    for tex, lid in mapping["textures"].items():
        key = f"LEADER_{tex}_NEUTRAL"
        if key not in found:
            missing.append(key)
            continue
        _write(by_id, lid, Image.open(found[key]))
        done.append(lid)

    # 2. Game install: LeaderFallbackImages.blp of each DLC package
    # 3. BBG Expanded mod (Steam Workshop 289070/3533091092): one fallback
    #    package per leader, path given in full in mapping.json
    cache = {}

    def from_blp(path, e, source):
        if not path.exists():
            missing.append(str(path))
            return
        if path not in cache:
            data = path.read_bytes()
            cache[path] = (data, blp.find_textures(data), blp.list_names(data))
        data, recs, names = cache[path]
        # Guard against a changed package: the expected name (when the
        # package has one) must still be in it, and the record must exist.
        if (e.get("name") and e["name"] not in names) or e["index"] >= len(recs):
            raise ValueError(f"{path}: {e.get('name')} / index {e['index']} not found, re-check mapping.json")
        _write(by_id, e["id"], blp.decode(data, recs[e["index"]]), source)
        done.append(e["id"])

    if game_dir:
        for e in mapping["fallback"]:
            from_blp(Path(game_dir) / e["package"] / "Platforms" / "Windows" / "BLPs" / "LeaderFallbackImages.blp", e, "game")
    if mod_dir:
        for e in mapping["mod"]:
            from_blp(Path(mod_dir) / e["path"], e, "mod")

    leaders_path.write_text(json.dumps(leaders, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(done)} silhouettes written from game textures")
    if missing:
        print("not found:", ", ".join(missing))


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3, 4):
        sys.exit(__doc__)
    main(*sys.argv[1:])
