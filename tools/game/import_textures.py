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

Output, for each mapped leader: ``img/silhouettes/<id>.png``, a square RGBA
image (``SIZE`` px) whose colour is pure black and whose alpha is the texture
alpha. Only the shape is published, not the painted texture. The figure is
scaled to the full height and centred horizontally; the bottom of the figure
(cut by the texture frame) stays on the bottom edge.

These silhouettes take precedence over the ones computed from the BBG
portraits by ``tools/bbg/make_silhouettes.py``: the ids listed in
``mapping.json`` are skipped by that script.

Then ``silhouette``, ``silhouetteFocus`` and ``silhouetteSource`` ("game") are updated in
``data/leaders.json`` for the imported ids (same focus rule as
``tools/bbg/build.py``: a deterministic point on the outline).

Usage (from the repository root):

    python tools/game/import_textures.py "<SDK Assets>/Civ6" ["<game>"]

where ``<SDK Assets>/Civ6`` is searched recursively for the .dds files and
``<game>`` is the game install folder ("Sid Meier's Civilization VI").

Second source (optional ``<game>`` argument): DLC leaders are not in the SDK
depot, but each DLC package of the game ships ``LeaderFallbackImages.blp``
with the 2D fallback image of its leaders (figure alone, with alpha), read by
``blp.py``. Entries are listed in ``mapping.json`` under ``fallback`` by
package and record index, each checked visually. Leaders of BBG Expanded
(a mod) are in neither source.
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


def make_silhouette(im, out_path):
    """Write the black/alpha square silhouette of one leader image (PIL RGBA)."""
    alpha = im.convert("RGBA").getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"{out_path}: source image fully transparent")
    alpha = alpha.crop(bbox)
    w, h = alpha.size
    scale = SIZE / max(w, h)
    alpha = alpha.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("L", (SIZE, SIZE), 0)
    # Centred horizontally, bottom-aligned (the texture cuts the figure at the bottom).
    canvas.paste(alpha, ((SIZE - alpha.width) // 2, SIZE - alpha.height))
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.putalpha(canvas)
    out.save(out_path, optimize=True)


def _write(by_id, lid, im):
    if lid not in by_id:
        raise KeyError(f"mapping.json: unknown leader id {lid}")
    rel = f"img/silhouettes/{lid}.png"
    make_silhouette(im, ROOT / rel)
    by_id[lid]["silhouette"] = rel
    by_id[lid]["silhouetteFocus"] = silhouette_focus(ROOT / rel, lid)
    by_id[lid]["silhouetteSource"] = "game"


def main(sdk_dir, game_dir=None):
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
    if game_dir:
        cache = {}
        for e in mapping["fallback"]:
            path = Path(game_dir) / e["package"] / "Platforms" / "Windows" / "BLPs" / "LeaderFallbackImages.blp"
            if not path.exists():
                missing.append(str(path))
                continue
            if path not in cache:
                data = path.read_bytes()
                cache[path] = (data, blp.find_textures(data), blp.list_names(data))
            data, recs, names = cache[path]
            # Guard against a changed package: the expected name must still be
            # in it, and the record index must exist.
            if e["name"] not in names or e["index"] >= len(recs):
                raise ValueError(f"{path}: {e['name']} / index {e['index']} not found, re-check mapping.json")
            _write(by_id, e["id"], blp.decode(data, recs[e["index"]]))
            done.append(e["id"])

    leaders_path.write_text(json.dumps(leaders, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(done)} silhouettes written from game textures")
    if missing:
        print("not found:", ", ".join(missing))


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    main(*sys.argv[1:])
