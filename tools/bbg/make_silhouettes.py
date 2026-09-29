"""Cut the leader figure out of each BBG portrait medallion, with a quality gate.

BBG portraits are round medallions: the leader is drawn over a disc, so the
image alpha only gives a circle. For each portrait this script tries several
background-removal methods in order and keeps the first result that passes
an automatic quality check. If none passes, no silhouette is written and the
leader is left out of the Silhouette mode (a disc-shaped silhouette would give
no information).

Usage (from the repository root, after ``tools/bbg/build.py`` wrote the
portraits):

    pip install "rembg[cpu]"
    python tools/bbg/make_silhouettes.py            # only leaders not in the report
    python tools/bbg/make_silhouettes.py --force    # redo all
    python tools/bbg/build.py <bbg> 7.5             # re-run to update leaders.json

Methods, in order (models as distributed by rembg):
1. ``birefnet-general-lite`` on the portrait over black;
2. ``birefnet-general-lite`` on the portrait over the disc colour (the
   transparent area around the medallion is filled with the median colour of
   the disc's outer ring, to hide the circular edge);
3. ``isnet-general-use``, 4. ``u2net``, 5. ``silueta``, each over the disc
   colour.
The mask is thresholded at 0.5, intersected with the portrait alpha, and the
medallion's thin rim is removed near the disc edge (``clean_rim``).

Quality check (thresholds chosen by inspecting the 88 BBG 7.5 portraits: good
cut-outs scored <= 0.26, disc-shaped ones >= 0.50 on the side test):
- side test: fraction of the disc's outer ring (0.88R-0.97R) at ear level
  (within 20 degrees of horizontal, left and right) covered by the mask must be
  < 0.35. A figure rarely reaches the disc edge there, a disc always does;
- face test: an ellipse on the face centre must be >= 90 % covered.

The chosen method and scores are written to ``tools/bbg/silhouettes_report.json``.

Memory: one BiRefNet inference peaks at ~5.9 GB (measured). Each inference
runs in its own subprocess, and a failed subprocess (killed for lack of
memory) is retried up to 3 times.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "img" / "silhouettes"
REPORT = Path(__file__).parent / "silhouettes_report.json"
METHODS = [
    ("birefnet-general-lite", "black"),
    ("birefnet-general-lite", "disc"),
    ("isnet-general-use", "disc"),
    ("u2net", "disc"),
    ("silueta", "disc"),
]
SIDE_MAX = 0.35
FACE_MIN = 0.90
RETRIES = 3


def disc_geometry(alpha):
    """Centre (cx, cy) and radius R of the medallion, from the alpha channel."""
    import numpy as np
    ys, xs = np.nonzero(alpha >= 128)
    cx, r = (xs.min() + xs.max()) / 2, (xs.max() - xs.min()) / 2
    return cx, ys.max() - r, r


def quality(mask, alpha):
    """Return (side_coverage, face_coverage) for a boolean mask."""
    import numpy as np
    cx, cy, r = disc_geometry(alpha)
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    dist = np.hypot(xx - cx, yy - cy)
    ang = np.degrees(np.arctan2(yy - cy, xx - cx))
    sides = (dist > 0.88 * r) & (dist < 0.97 * r) & ((np.abs(ang) < 20) | (np.abs(ang) > 160)) & (alpha >= 128)
    face = ((xx - cx) / (0.2 * r)) ** 2 + ((yy - (cy - 0.05 * r)) / (0.3 * r)) ** 2 < 1
    return float(mask[sides].mean()), float(mask[face].mean())


def clean_rim(path, alpha):
    """Remove the medallion's thin rim near the disc edge, and detached specks.

    Inside the outer annulus (r > 0.90R) a pixel is kept only if it survives a
    morphological opening with a 7x7 square; the rest of the mask is untouched,
    so thin details inside the disc (feathers, crowns) are kept.
    """
    import numpy as np
    from PIL import Image, ImageFilter
    img = Image.open(path).convert("RGBA")
    m = img.getchannel("A")
    opened = m.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    cx, cy, r = disc_geometry(alpha)
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    outer = np.hypot(xx - cx, yy - cy) > 0.90 * r
    a = np.asarray(m).copy()
    a[outer] = np.minimum(a[outer], np.asarray(opened)[outer])
    # Drop detached specks: components smaller than 1.5 % of the mask area.
    from scipy import ndimage
    lab, n = ndimage.label(a >= 128)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, index=range(1, n + 1))
        small = [i + 1 for i, sz in enumerate(sizes) if sz < 0.015 * sizes.sum()]
        a[np.isin(lab, small)] = 0
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste((0, 0, 0, 255), (0, 0, *img.size), Image.fromarray(a))
    out.save(path, optimize=True)


def model_path(model):
    """Model .onnx path; rembg (heavy import) is only used to download it."""
    p = Path.home() / ".rembg" / "models" / model / f"{model}.onnx"
    if not p.exists():
        from rembg import new_session
        new_session(model)
    return p


def run_worker(model, background, portrait, dest):
    """Worker: one inference, writes the black-on-transparent PNG to dest."""
    import numpy as np
    import onnxruntime as ort
    from PIL import Image

    p = Image.open(portrait).convert("RGBA")
    arr = np.asarray(p)
    fill = (0, 0, 0)
    if background == "disc":
        cx, cy, r = disc_geometry(arr[:, :, 3])
        yy, xx = np.mgrid[0:p.height, 0:p.width]
        dist = np.hypot(xx - cx, yy - cy)
        ring = (dist > 0.86 * r) & (dist < 0.97 * r) & (yy < cy) & (arr[:, :, 3] >= 128)
        if ring.any():
            fill = tuple(int(v) for v in np.median(arr[:, :, :3][ring], axis=0))
    rgb = Image.new("RGB", p.size, fill)
    rgb.paste(p, (0, 0), p)

    so = ort.SessionOptions()
    so.enable_cpu_mem_arena = False
    so.enable_mem_pattern = False
    so.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(model_path(model)), so)
    inp = sess.get_inputs()[0]
    size = inp.shape[2] if isinstance(inp.shape[2], int) else 1024
    x = np.asarray(rgb.resize((size, size), Image.LANCZOS), np.float32) / 255.0
    if model.startswith("isnet"):
        x = x - 0.5                                     # rembg: mean 0.5, std 1
    else:
        x = (x - (0.485, 0.456, 0.406)) / (0.229, 0.224, 0.225)
    out = sess.run(None, {inp.name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
    if model.startswith("birefnet"):
        out = 1 / (1 + np.exp(-out))
    pr = (out - out.min()) / (out.max() - out.min())
    m = np.asarray(Image.fromarray((pr * 255).astype(np.uint8)).resize(p.size, Image.LANCZOS))
    alpha = np.where((m >= 128) & (arr[:, :, 3] >= 128), 255, 0).astype(np.uint8)
    img = Image.new("RGBA", p.size, (0, 0, 0, 0))
    img.paste((0, 0, 0, 255), (0, 0, *p.size), Image.fromarray(alpha))
    img.save(dest, optimize=True)


def evaluate(path, alpha):
    import numpy as np
    from PIL import Image
    mask = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3] >= 128
    return quality(mask, alpha)


def process(leader, tmp):
    """Try the methods in order; return the report entry for this leader."""
    import numpy as np
    from PIL import Image
    portrait = ROOT / leader["portrait"]
    alpha = np.asarray(Image.open(portrait).convert("RGBA"))[:, :, 3]
    tried = []
    for model, bg in METHODS:
        ok = False
        for _ in range(RETRIES):
            tmp.unlink(missing_ok=True)
            r = subprocess.run([sys.executable, __file__, "--worker", model, bg, str(portrait), str(tmp)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if r.returncode == 0 and tmp.exists():
                ok = True
                break
        if not ok:
            tried.append({"method": f"{model}/{bg}", "error": "worker failed"})
            continue
        clean_rim(tmp, alpha)
        side, face = evaluate(tmp, alpha)
        entry = {"method": f"{model}/{bg}", "side": round(side, 3), "face": round(face, 3)}
        tried.append(entry)
        if side < SIDE_MAX and face >= FACE_MIN:
            tmp.replace(OUT / f"{leader['id']}.png")
            return {"accepted": entry["method"], "tried": tried}
    tmp.unlink(missing_ok=True)
    (OUT / f"{leader['id']}.png").unlink(missing_ok=True)
    return {"accepted": None, "tried": tried}


def sheet(leaders):
    """Contact sheet of all silhouettes (red cross = none) for visual review."""
    from PIL import Image, ImageDraw
    w, cols = 100, 15
    rows = (len(leaders) + cols - 1) // cols
    img = Image.new("RGB", (w * cols, (w + 12) * rows), (217, 210, 191))
    draw = ImageDraw.Draw(img)
    for i, l in enumerate(leaders):
        f = OUT / f"{l['id']}.png"
        x, y = (i % cols) * w, (i // cols) * (w + 12)
        if f.exists():
            s = Image.open(f).convert("RGBA").resize((w, w))
            img.paste(s, (x, y), s)
        else:
            draw.line((x + 20, y + 20, x + 80, y + 80), fill=(180, 0, 0), width=4)
            draw.line((x + 80, y + 20, x + 20, y + 80), fill=(180, 0, 0), width=4)
        draw.text((x + 2, y + w), f"{i} {l['name'][:14]}", fill=(80, 0, 0))
    img.save(ROOT / "silhouettes_sheet.png")


def main():
    if len(sys.argv) == 6 and sys.argv[1] == "--worker":
        run_worker(*sys.argv[2:])
        return
    force = "--force" in sys.argv
    leaders = json.loads((ROOT / "data" / "leaders.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    report = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() and not force else {}
    tmp = OUT / "_candidate.png"
    # Leaders with a silhouette from the official game textures are skipped
    # (see tools/game/import_textures.py): those are exact, not estimated.
    game_map = json.loads((ROOT / "tools" / "game" / "mapping.json").read_text(encoding="utf-8"))
    game_ids = (set(game_map["textures"].values()) | {e["id"] for e in game_map["fallback"]}
                | {e["id"] for e in game_map["mod"]})
    todo = [l for l in leaders
            if l.get("portrait") and l["id"] not in game_ids and (force or l["id"] not in report)]
    for i, l in enumerate(todo, 1):
        report[l["id"]] = process(l, tmp)
        REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[{i}/{len(todo)}] {l['id']}: {report[l['id']]['accepted']}", flush=True)
    sheet(leaders)
    n = sum(1 for v in report.values() if v["accepted"])
    print(f"{n}/{len(report)} silhouettes accepted; contact sheet: silhouettes_sheet.png")


if __name__ == "__main__":
    main()
