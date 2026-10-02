"""Make the pre-cropped, upscaled eye images of the "Regard" game mode.

For each leader with `eyes` (tools/bbg/detect_eyes.py) and each side
("right", "left": the subject's eyes), crops a square around the eye from
the BBG portrait, levelled on the eye line, of side VIEW_END x the eye width
(the widest view of the mode), upscales it x4 with Real-ESRGAN, and writes

    img/eyes/<id>-<side>.webp      and      leader.eyeImages = {side: path}

Upscaling: model `realesrgan-x4plus` (general images), run on CPU with the
ncnn runtime; the model files are those shipped inside the
`realesrgan-ncnn-py` wheel (no download at runtime). The x4plus-anime model
was also tried: it redraws the eyes in a flatter cartoon style, so it was not
kept. Super-resolution invents plausible detail; it is not a recovery of the
original texture.

Transparency: the network sees the RGB flattened on BACKGROUND; the alpha
channel (outside the round medallion) is upscaled separately (Lanczos) and
put back.

Requirements: realesrgan-ncnn-py (for its model files), ncnn, numpy, pillow.

Usage:
    python tools/bbg/make_eye_images.py [--sheet out.png]
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import ncnn
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LEADERS = ROOT / "data" / "leaders.json"
OUT_DIR = ROOT / "img" / "eyes"
# Locate the wheel's model folder without importing the package: its own
# Vulkan wrapper needs libomp/GPU libraries that are not used here.
MODEL_DIR = Path(importlib.util.find_spec("realesrgan_ncnn_py").origin).parent / "models"
MODEL = "realesrgan-x4plus"
SCALE = 4

VIEW_END = 3          # same value as VIEW_END in js/modes/regard.js
BACKGROUND = (128, 128, 128)
QUALITY = 90


def load_net():
    net = ncnn.Net()
    net.opt.use_vulkan_compute = False
    net.opt.num_threads = 8
    net.load_param(str(MODEL_DIR / f"{MODEL}.param"))
    net.load_model(str(MODEL_DIR / f"{MODEL}.bin"))
    return net


def upscale_rgb(net, im):
    """Real-ESRGAN x4 on an RGB PIL image; input/output in [0, 1]."""
    a = np.ascontiguousarray(np.asarray(im.convert("RGB"), dtype=np.uint8))
    mat = ncnn.Mat.from_pixels(a, ncnn.Mat.PixelType.PIXEL_RGB, im.width, im.height)
    mat.substract_mean_normalize([], [1 / 255.0] * 3)
    ex = net.create_extractor()
    ex.input("data", mat)
    _, out = ex.extract("output")
    o = np.clip(np.array(out).transpose(1, 2, 0), 0, 1)
    return Image.fromarray((o * 255 + 0.5).astype(np.uint8))


def eye_crop(portrait, eye, angle):
    """Square RGBA crop centred on the eye, levelled, side VIEW_END x width."""
    cx, cy, w = eye
    sx, sy = portrait.width / 100, portrait.height / 100
    levelled = portrait.rotate(angle, center=(cx * sx, cy * sy), resample=Image.BICUBIC)
    half = VIEW_END * w / 2
    # Pixels outside the portrait come out transparent (RGBA crop padding).
    return levelled.crop((round((cx - half) * sx), round((cy - half) * sy),
                          round((cx + half) * sx), round((cy + half) * sy)))


def upscale_rgba(net, im):
    flat = Image.new("RGBA", im.size, BACKGROUND + (255,))
    flat.alpha_composite(im)
    rgb = upscale_rgb(net, flat.convert("RGB"))
    alpha = im.getchannel("A").resize(rgb.size, Image.LANCZOS)
    rgb.putalpha(alpha)
    return rgb


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sheet", help="write a contact sheet of the results to this path")
    args = ap.parse_args()

    leaders = json.loads(LEADERS.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    net = load_net()
    made = []
    for l in leaders:
        l.pop("eyeImages", None)
        e = l.get("eyes")
        if not e or not l.get("portrait"):
            continue
        portrait = Image.open(ROOT / l["portrait"]).convert("RGBA")
        paths = {}
        for side in ("right", "left"):
            out = upscale_rgba(net, eye_crop(portrait, e[side], e["angle"]))
            rel = f"img/eyes/{l['id']}-{side}.webp"
            out.save(ROOT / rel, quality=QUALITY)
            paths[side] = rel
            made.append(out)
        l["eyeImages"] = paths
        print(l["id"], made[-1].size)

    LEADERS.write_text(json.dumps(leaders, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(made)} eye images written to {OUT_DIR}")

    if args.sheet:
        size, cols = 128, 16
        sheet = Image.new("RGB", (cols * size, math.ceil(len(made) / cols) * size), BACKGROUND)
        for i, im in enumerate(made):
            t = im.resize((size, size), Image.LANCZOS)
            sheet.paste(t, ((i % cols) * size, (i // cols) * size), t)
        sheet.save(args.sheet)


if __name__ == "__main__":
    main()
