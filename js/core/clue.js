/**
 * Clue image drawn on a <canvas> instead of an <img> styled by CSS.
 *
 * Why: with an <img>, the blur, grey, rotation and zoom of a clue are CSS
 * properties, so the browser's inspector shows the image untouched (hover on
 * `src`, or untick `filter` / `transform`). Here the image is decoded off the
 * page (fetch + createImageBitmap) and only the degraded view is painted on
 * the canvas: the page holds no <img> of the answer and no CSS to remove.
 *
 * Limit: the image file itself is still downloaded, so the Network panel of
 * the dev tools (or the URL in the data) gives the original. A static site
 * cannot avoid that; only a server that sends degraded images could.
 *
 * Once the puzzle is solved, `reveal(src)` puts back a plain <img>. The clue
 * is only downloaded on the first `set()`.
 *
 * Usage:
 *   const clue = createClue(frame, src, { padding: 0.14, black: false, round: false });
 *   clue.set({ blur: 24, grey: true, scale: 1.08, rotate: 90, tx: 0, ty: 0 });
 *
 * Parameters of `set` (all optional, numbers are tweened like the former CSS
 * transitions, TWEEN_MS):
 *   blur    px, in CSS pixels of the frame (like CSS `blur()`)
 *   grey    boolean, shades of grey (like CSS `grayscale(1)`)
 *   scale   magnification around the frame centre
 *   rotate  degrees, around the frame centre
 *   tx, ty  shift applied before `scale`, in fractions of the frame size
 *           (like CSS `scale(z) translate(tx*100%, ty*100%)`)
 * Options of `createClue`:
 *   padding fraction of the frame left empty on each side around the image
 *   black   paint every opaque pixel black (silhouettes)
 *   round   clip the drawing to the inscribed circle (round frames)
 */

const TWEEN_MS = 500;
const DEFAULTS = { blur: 0, grey: false, scale: 1, rotate: 0, tx: 0, ty: 0 };
const NUMERIC = ["blur", "scale", "rotate", "tx", "ty"];
// Canvas filters (blur, grayscale) are missing on some browsers (older
// Safari); a fallback is used there (see `applyBlur`, `applyGrey`).
const HAS_FILTER = typeof CanvasRenderingContext2D !== "undefined"
  && "filter" in CanvasRenderingContext2D.prototype;

async function loadBitmap(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${res.status} ${src}`);
  return createImageBitmap(await res.blob());
}

function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function applyBlur(src, radius) {
  const out = newCanvas(src.width, src.height);
  const g = out.getContext("2d");
  if (radius <= 0.25) {
    g.drawImage(src, 0, 0);
  } else if (HAS_FILTER) {
    g.filter = `blur(${radius}px)`;
    g.drawImage(src, 0, 0);
  } else {
    // Fallback: shrink then enlarge with smoothing, in two steps each way
    // so the result is soft rather than pixelated. Not a gaussian blur; the
    // factor (radius x 1.2) was matched by eye to CSS blur() (approximation).
    const f = Math.max(1, radius * 1.2);
    const dims = (k) => [Math.max(1, Math.round(src.width / k)), Math.max(1, Math.round(src.height / k))];
    const mid = newCanvas(...dims(Math.sqrt(f)));
    const small = newCanvas(...dims(f));
    for (const c of [mid, small, mid]) c.getContext("2d").imageSmoothingQuality = "high";
    mid.getContext("2d").drawImage(src, 0, 0, mid.width, mid.height);
    small.getContext("2d").drawImage(mid, 0, 0, small.width, small.height);
    const m = mid.getContext("2d");
    m.clearRect(0, 0, mid.width, mid.height);
    m.drawImage(small, 0, 0, mid.width, mid.height);
    g.imageSmoothingQuality = "high";
    g.drawImage(mid, 0, 0, out.width, out.height);
  }
  return out;
}

/** Recolour the opaque pixels in place: black, or grey (Rec. 601 luma, as CSS grayscale). */
function recolour(canvas, mode) {
  const g = canvas.getContext("2d");
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = mode === "black" ? 0 : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
}

export function createClue(frame, src, { padding = 0, black = false, round = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", frame.querySelector("img")?.alt ?? "");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  frame.replaceChildren(canvas);

  let bitmap = null;
  let shown = { ...DEFAULTS };   // parameters currently painted
  let target = { ...DEFAULTS };  // parameters asked by the last set()
  let anim = 0;
  let revealed = false;

  function paint(p) {
    if (!bitmap || revealed) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(1, Math.round(frame.clientWidth * dpr));
    if (canvas.width !== size) canvas.width = canvas.height = size;

    // 1. Place the image (contain, padding, transforms) on a layer.
    const layer = newCanvas(size, size);
    const g = layer.getContext("2d");
    g.imageSmoothingQuality = "high";
    const c = size / 2;
    g.translate(c, c);
    g.scale(p.scale, p.scale);
    g.rotate((p.rotate * Math.PI) / 180);
    g.translate(p.tx * size, p.ty * size);
    const box = size * (1 - 2 * padding);
    const k = Math.min(box / bitmap.width, box / bitmap.height);
    const w = bitmap.width * k;
    const h = bitmap.height * k;
    g.drawImage(bitmap, -w / 2, -h / 2, w, h);

    // 2. Effects on the pixels of that layer only.
    if (black) recolour(layer, "black");
    else if (p.grey) recolour(layer, "grey");
    const out = applyBlur(layer, p.blur * dpr * p.scale);

    // 3. Copy to the visible canvas.
    const v = canvas.getContext("2d");
    v.clearRect(0, 0, size, size);
    v.save();
    if (round) {
      v.beginPath();
      v.arc(c, c, c, 0, 2 * Math.PI);
      v.clip();
    }
    v.drawImage(out, 0, 0);
    v.restore();
  }

  function tween() {
    cancelAnimationFrame(anim);
    const from = { ...shown };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const step = (now) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / TWEEN_MS);
      const e = 1 - (1 - t) ** 3; // ease-out
      shown = { ...target };
      for (const key of NUMERIC) shown[key] = from[key] + (target[key] - from[key]) * e;
      paint(shown);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // Loaded on the first set(): a puzzle already solved goes straight to
  // reveal() and never downloads the clue.
  let loading = null;
  function load() {
    loading ??= loadBitmap(src).then((b) => {
      bitmap = b;
      shown = { ...target }; // first paint without animation
      paint(shown);
    }).catch((err) => console.error("Civdle: clue image not loaded", err));
    return loading;
  }

  new ResizeObserver(() => paint(shown)).observe(frame);

  return {
    set(params) {
      target = { ...DEFAULTS, ...params };
      if (bitmap) tween();
      else load();
    },
    /** Replace the canvas with a plain <img> of `revealSrc` (puzzle solved). */
    reveal(revealSrc, alt = "") {
      if (revealed) return null;
      revealed = true;
      cancelAnimationFrame(anim);
      const img = document.createElement("img");
      img.alt = alt;
      img.draggable = false;
      img.src = revealSrc;
      frame.replaceChildren(img);
      return img;
    },
  };
}
