"""Detect the eye region of every leader portrait, for the "Regard" game mode.

For each `leader.portrait` in data/leaders.json, runs MediaPipe Face Mesh
(legacy `solutions` API, which ships its model inside the wheel) and writes

    leader.eyes = {"right": [cx, cy, w], "left": [cx, cy, w], "angle": a}

* right / left -- the subject's right / left eye: centre (midpoint of the
                  two corners) and width (corner-to-corner distance), in
                  percent of the image size;
* angle        -- tilt of the line joining the two eye centres, in degrees
                  (positive = clockwise in image coordinates), so the view
                  can be levelled.

Leaders where no face is found are listed and left without `eyes`; they are
not eligible for the mode. Manual values can be put in
tools/bbg/eyes_overrides.json ({"leader-id": {same structure}}) and take
precedence over the detection; ids listed in tools/bbg/eyes_rejected.json are
removed from the mode (detection judged wrong on the contact sheet).

Requirements: mediapipe==0.10.14 (Python <= 3.12; later versions removed the
`solutions` API and download their models at runtime), numpy<2, pillow.

Usage:
    python tools/bbg/detect_eyes.py [--sheet out.png]

`--sheet` also writes a contact sheet with the detected band drawn on each
portrait, to check the detection by eye.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import mediapipe as mp

ROOT = Path(__file__).resolve().parents[2]
LEADERS = ROOT / "data" / "leaders.json"
OVERRIDES = Path(__file__).with_name("eyes_overrides.json")
REJECTED = Path(__file__).with_name("eyes_rejected.json")

# Face Mesh landmark indices (canonical MediaPipe topology).
# "Left"/"right" are from the subject's point of view.
RIGHT_EYE = (33, 133)    # outer, inner corner of the subject's right eye
LEFT_EYE = (263, 362)    # outer, inner corner of the subject's left eye

# Contact sheet only: view drawn around each eye, relative to the eye width
# (VIEW_START in js/modes/regard.js; the frame is round, ASPECT 1 = its square).
VIEW_START = 1.6
ASPECT = 1.0
UPSCALE = 2              # detection works better on larger faces


def load_rgb(path):
    """Open a portrait and flatten its transparency onto mid-grey."""
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def detect(mesh, img):
    """Return {"right": [cx, cy, w], "left": [cx, cy, w], "angle": a}, or None."""
    big = img.resize((img.width * UPSCALE, img.height * UPSCALE), Image.LANCZOS)
    res = mesh.process(np.asarray(big))
    if not res.multi_face_landmarks:
        return None
    lm = res.multi_face_landmarks[0].landmark

    def pt(i):
        return np.array([lm[i].x, lm[i].y])  # normalised [0, 1]

    def eye(corners):
        a, b = pt(corners[0]), pt(corners[1])
        c = (a + b) / 2
        return c, [round(float(c[0] * 100), 2), round(float(c[1] * 100), 2),
                   round(float(np.linalg.norm(b - a) * 100), 2)]

    r_c, right = eye(RIGHT_EYE)
    l_c, left = eye(LEFT_EYE)
    d = l_c - r_c
    return {"right": right, "left": left, "angle": round(math.degrees(math.atan2(d[1], d[0])), 1)}


def draw_sheet(leaders, out, cols=11, size=160):
    """Draw the starting view around each eye (red: right, blue: left)."""
    rows = math.ceil(len(leaders) / cols)
    sheet = Image.new("RGB", (cols * size, rows * (size + 14)), "white")
    d = ImageDraw.Draw(sheet)
    for i, l in enumerate(leaders):
        img = load_rgb(ROOT / l["portrait"]).resize((size, size))
        x0, y0 = (i % cols) * size, (i // cols) * (size + 14)
        sheet.paste(img, (x0, y0))
        e = l.get("eyes")
        if e:
            t = math.radians(e["angle"])
            for side, colour in (("right", (255, 0, 0)), ("left", (0, 90, 255))):
                cx, cy, w = (v * size / 100 for v in e[side])
                vw = VIEW_START * w
                vh = vw / ASPECT
                corners = []
                for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    dx, dy = sx * vw / 2, sy * vh / 2
                    corners.append((x0 + cx + dx * math.cos(t) - dy * math.sin(t),
                                    y0 + cy + dx * math.sin(t) + dy * math.cos(t)))
                d.polygon(corners, outline=colour)
        d.text((x0 + 2, y0 + size), l["id"][:26], fill=(0, 0, 0) if e else (255, 0, 0))
    sheet.save(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sheet", help="write a contact sheet to this path")
    args = ap.parse_args()

    leaders = json.loads(LEADERS.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    rejected = set(json.loads(REJECTED.read_text(encoding="utf-8"))) if REJECTED.exists() else set()

    missing = []
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                         refine_landmarks=False,
                                         min_detection_confidence=0.3) as mesh:
        for l in leaders:
            l.pop("eyes", None)
            if not l.get("portrait") or l["id"] in rejected:
                continue
            e = overrides.get(l["id"]) or detect(mesh, load_rgb(ROOT / l["portrait"]))
            if e:
                l["eyes"] = e
            else:
                missing.append(l["id"])

    LEADERS.write_text(json.dumps(leaders, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n = sum(1 for l in leaders if "eyes" in l)
    print(f"eyes: {n}/{len(leaders)} leaders; no face found: {missing or 'none'}")
    if args.sheet:
        draw_sheet(leaders, args.sheet)
        print(f"contact sheet: {args.sheet}")


if __name__ == "__main__":
    main()
