// The transcript's loading state: transitions.dev's "UI generation" skeleton,
// the load transition of the first `.cm-beam` on https://transitions.dev/
// (its prompt box). There, composer-generate.js runs
//   generate(box, { mode: "skeleton", duration: 1600, reveal: "fade", fadeDuration: 475, revealAt: 930 })
// from assets/ui-generation/ui-generation.js?v=5: a dot field ripples out from
// the centre, construction guides and corner handles come in, the outline
// and then every part (boxes, text lines) are traced in small flowing dots
// with a moving head, particles land on the outline as it is drawn, and the
// real box fades in over the drawing (opacity and a 3px blur, 475ms on
// cubic-bezier(.22, 1, .36, 1), from 930ms) as the drawing fades out.
//
// Ported here with these changes, each for the transcript:
// - The shape traced is the transcript's own (Veil.svelte's blocks: the who
//   marks, the reader's well, prose lines, the rail's tool lines), measured
//   as their `measure` measures the prompt box.
// - Its clock is one Web Animation (`driver`), and the reveal's two parts are
//   Web Animations on the same start time, so the page's clock, and the
//   DevTools Animation domain, hold and seek all of it together. Theirs reads
//   performance.now() in a requestAnimationFrame loop.
// - The hub's answer can come after the drawing's own end (1184ms, where the
//   parts are all traced): the drawing then holds that pose, its dots still
//   flowing and the dot rain still falling, until the rows are landed. The
//   reveal starts at revealAt (930ms) or once the rows are landed,
//   whichever is later, and the rest of the run follows it as theirs follows
//   930ms.
// - The dot field is drawn on a canvas: a pane holds ten times the dots
//   their prompt box does, one SVG circle each was too many to restyle a frame.
// - Colours and the label face are the house's (app.css `--gen-*`).

// ─── timing: phases of a build, as fractions of `duration` (theirs) ───
const PH = {
  dots: [0, 0.3],
  probe: [0.02, 0.24],
  guides: [0.04, 0.3],
  outline: [0.1, 0.42],
  parts: [0.28, 0.74],
  reveal: [0.74, 1.055],
  clean: [0.84, 1.04],
};
const END = 1.09;
/** Theirs, as composer-generate.js sets them for the prompt box. */
export const TIMING = { duration: 1600, fadeDuration: 475, revealAt: 930 };
/** Their reveal curve, `--ease-smooth-out`. */
export const REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const NS = "http://www.w3.org/2000/svg";
const clamp = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, p) => a + (b - a) * p;
const smooth = (a, b, x) => {
  const q = clamp((x - a) / (b - a));
  return q * q * (3 - 2 * q);
};
const win = (r, p) => clamp((p - r[0]) / (r[1] - r[0]));
const f2 = (n) => (+n).toFixed(2);
const hashN = (x) => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function bezier(x1, y1, x2, y2) {
  const cx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const cy = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let m = 0.5;
    for (let i = 0; i < 28; i += 1) {
      m = (lo + hi) / 2;
      if (cx(m) < x) lo = m;
      else hi = m;
    }
    return cy(m);
  };
}
const OUT = bezier(0.16, 1, 0.3, 1);
const SMOOTH_OUT = bezier(0.22, 1, 0.36, 1);

function svg(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function rrPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z`;
}
function rrHalf(x, y, w, h, r, dir) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const X = (v) => f2(x + v);
  const Y = (v) => f2(y + v);
  const R = f2(r);
  return dir
    ? `M${X(w / 2)} ${Y(0)}H${X(w - r)}A${R} ${R} 0 0 1 ${X(w)} ${Y(r)}V${Y(h - r)}A${R} ${R} 0 0 1 ${X(w - r)} ${Y(h)}H${X(w / 2)}`
    : `M${X(w / 2)} ${Y(0)}H${X(r)}A${R} ${R} 0 0 0 ${X(0)} ${Y(r)}V${Y(h - r)}A${R} ${R} 0 0 0 ${X(r)} ${Y(h)}H${X(w / 2)}`;
}
export const motionOk = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: no-preference)").matches;

// ─── 1. read the shape: its boxes and text lines (theirs, `measure`) ───
function measure(el, maxParts, keys) {
  const R = el.getBoundingClientRect();
  const area = R.width * R.height;
  const parts = [];
  const rel = (r) => ({ x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height });
  const alpha = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return c && c !== "transparent" ? 1 : 0;
    const p = m[1].split(/[ ,/]+/).filter(Boolean);
    return p.length > 3 ? +p[3] : 1;
  };
  let radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const walk = (node) => {
    for (const c of node.children) {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      if (cs.display === "none") continue;
      if (!(r.width && r.height)) {
        walk(c);
        continue;
      }
      const big = r.width * r.height > area * 0.6;
      const boxy = !big && (alpha(cs.backgroundColor) > 0.02 || Number.parseFloat(cs.borderTopWidth) > 0);
      if (boxy) {
        parts.push({
          kind: "box",
          ...rel(r),
          r: Math.min(Number.parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2),
          name: c.dataset.genName ?? "frame",
          interactive: c.dataset.genKey !== undefined,
        });
      }
      walk(c);
    }
  };
  walk(el);
  if (parts.length > maxParts) {
    const keep = new Set([...parts].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, maxParts));
    for (let i = parts.length - 1; i >= 0; i -= 1) if (!keep.has(parts[i])) parts.splice(i, 1);
  }
  const boxes = parts.filter((p) => p.kind === "box");
  [...boxes.filter((b) => b.interactive), ...boxes.filter((b) => !b.interactive).sort((a, b) => b.w * b.h - a.w * a.h)]
    .slice(0, keys)
    .forEach((k) => {
      k.key = true;
    });
  return { w: R.width, h: R.height, r: Math.min(radius, R.width / 2, R.height / 2), parts };
}

/** A colour the page resolves (a token, light-dark() and all), for the canvas. */
function resolved(host, value) {
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  host.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

// ─── 2. the overlay (theirs, `buildOverlay`) ───
function buildOverlay(host, shape, M, opts) {
  const H = host.getBoundingClientRect();
  const S = shape.getBoundingClientRect();
  const { w, h } = M;
  const MG = opts.margin;
  const SP = 15;
  const DOT_GAP = 4.8;
  const GUIDE_GAP = 6.5;
  const layer = document.createElement("div");
  layer.className = "gen";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    left: `${f2(S.left - H.left)}px`,
    top: `${f2(S.top - H.top)}px`,
    width: `${f2(w)}px`,
    height: `${f2(h)}px`,
  });
  // The dot field covers the host, wherever the shape stands in it.
  const field = { x0: -(S.left - H.left), y0: -(S.top - H.top), x1: H.right - S.left, y1: H.bottom - S.top };
  const canvas = document.createElement("canvas");
  canvas.className = "gen-field";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(H.width * dpr);
  canvas.height = Math.ceil(H.height * dpr);
  Object.assign(canvas.style, { left: `${f2(field.x0)}px`, top: `${f2(field.y0)}px`, width: `${f2(H.width)}px`, height: `${f2(H.height)}px` });
  layer.appendChild(canvas);
  const root = svg("svg", { class: "gen-svg", width: f2(w), height: f2(h), viewBox: `0 0 ${f2(w)} ${f2(h)}` }, layer);
  host.appendChild(layer);
  const G = { layer, root, w, h, M: MG, n: (buildOverlay.n = (buildOverlay.n || 0) + 1), parts: [], keys: [], canvas, dpr, field };
  G.ctx = canvas.getContext("2d");
  G.ink = resolved(layer, "var(--gen-ink)");
  G.strong = resolved(layer, "var(--gen-strong)");
  const defs = svg("defs", {}, root);

  // dot field and its rain columns, over the host
  G.dots = [];
  let maxD = 0;
  const cx = w / 2;
  const cy = h / 2;
  for (let x = field.x0 + SP / 2; x <= field.x1; x += SP) {
    for (let y = field.y0 + SP / 2; y <= field.y1; y += SP) {
      const d = Math.hypot(x - cx, y - cy);
      const out = Math.max(0, -x, x - w, -y, y - h);
      const col = Math.round(x / SP);
      G.dots.push({
        x,
        y,
        d,
        edge: 1 - clamp(out / Math.max(MG, 120)),
        inside: out === 0,
        v: 0.07 + 0.09 * hashN(col * 7.13 + G.n * 31.7),
        ph: hashN(col * 3.71 + G.n * 11.3) * 900,
        tr: 50 + 70 * hashN(col * 1.91 + G.n),
      });
      maxD = Math.max(maxD, d);
    }
  }
  G.maxD = maxD;
  G.span = field.y1 - field.y0;

  const stroke = (d, parent, cls = "gen-wire", extra = {}) => {
    const e = svg("path", Object.assign({ d, class: cls }, extra), parent);
    return { el: e, L: e.getTotalLength(), gap: cls === "gen-guide" ? GUIDE_GAP : DOT_GAP };
  };
  const head = (parent, r = 2.4) => svg("circle", { r, class: "gen-head", opacity: 0 }, parent);

  G.probe = svg("path", { d: `M0 ${-MG}V${f2(h + MG)}`, class: "gen-guide gen-guide--dashed", opacity: 0 }, root);
  G.guides = [
    [-MG, 0, w + MG, 0],
    [w, -MG, w, h + MG],
    [w + MG, h, -MG, h],
    [0, h + MG, 0, -MG],
  ].map(([a, b, c, d]) => stroke(`M${f2(a)} ${f2(b)}L${f2(c)} ${f2(d)}`, root, "gen-guide"));
  G.dim = svg("text", { x: 0, y: -10, class: "gen-label" }, root);

  const wire = svg("g", { class: "gen-wireframe" }, root);
  G.wire = wire;
  G.outline = [1, 0].map((dir) => Object.assign(stroke(rrHalf(0, 0, w, h, M.r, dir), wire), { head: head(wire, 2.8) }));

  for (const P of M.parts) {
    const strokes = [];
    if (P.key) for (const dir of [1, 0]) strokes.push(Object.assign(stroke(rrHalf(P.x, P.y, P.w, P.h, P.r, dir), wire), { together: true }));
    else strokes.push(stroke(rrPath(P.x, P.y, P.w, P.h, P.r), wire));
    for (const s of strokes) s.head = head(wire);
    let ix = -1;
    strokes.forEach((s, i) => {
      s.idx = s.together && i > 0 && strokes[i - 1].together ? ix : ++ix;
    });
    strokes.n = ix + 1;
    G.parts.push({ strokes, b: { x: P.x, y: P.y, w: P.w, h: P.h }, name: P.name, key: !!P.key });
  }
  const N = G.parts.length;
  const span = PH.parts[1] - PH.parts[0];
  const dur = Math.min(0.2, span * 0.6);
  G.parts.forEach((pt, i) => {
    pt.t0 = PH.parts[0] + (N > 1 ? (span - dur) * (i / (N - 1)) : 0);
    pt.t1 = pt.t0 + dur;
  });

  for (const pt of G.parts) {
    if (!pt.key) continue;
    const { x, y, w: bw, h: bh } = pt.b;
    const E = 16;
    G.keys.push({
      pt,
      guides: [
        [x - E, y, x + bw + E, y],
        [x + bw, y - E, x + bw, y + bh + E],
        [x + bw + E, y + bh, x - E, y + bh],
        [x, y + bh + E, x, y - E],
      ].map(([a, b, c, d]) => stroke(`M${f2(a)} ${f2(b)}L${f2(c)} ${f2(d)}`, root, "gen-guide", { opacity: 0 })),
      handles: [
        [x, y],
        [x + bw, y],
        [x + bw, y + bh],
        [x, y + bh],
      ].map(([hx, hy]) => ({
        el: svg("rect", { x: -2, y: -2, width: 4, height: 4, class: "gen-handle", transform: `translate(${f2(hx)} ${f2(hy)}) scale(0)` }, root),
        x: hx,
        y: hy,
      })),
      dim: svg("text", { x: f2(x), y: f2(y - 5), class: "gen-label gen-label--small", opacity: 0 }, root),
    });
  }

  const inv = (f) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 26; i += 1) {
      const m = (lo + hi) / 2;
      if (OUT(m) < f) lo = m;
      else hi = m;
    }
    return lo;
  };
  G.flyers = [];
  for (let i = 0; i < 44; i += 1) {
    const half = G.outline[i % 2];
    const f = 0.06 + 0.9 * (Math.floor(i / 2) / 21);
    const pt = half.el.getPointAtLength(half.L * f);
    const ang = hashN(i * 9.1 + G.n) * Math.PI * 2;
    const dist = 30 + 70 * hashN(i * 4.7 + G.n * 2);
    const arr = PH.outline[0] + (PH.outline[1] - PH.outline[0]) * inv(f);
    G.flyers.push({ el: svg("circle", { r: 1.6, class: "gen-flyer", opacity: 0 }, root), x0: pt.x + Math.cos(ang) * dist, y0: pt.y + Math.sin(ang) * dist, x1: pt.x, y1: pt.y, arr, s0: arr - 0.09 });
  }

  G.ret = svg("path", { class: "gen-reticle", opacity: 0 }, root);
  G.tag = svg("text", { class: "gen-label gen-label--tag", opacity: 0 }, root);
  G.handles = [
    [0, 0, 0.17],
    [w, 0, 0.17],
    [w, h, 0.37],
    [0, h, 0.37],
  ].map(([x, y, at]) => ({ el: svg("rect", { x: -2.5, y: -2.5, width: 5, height: 5, class: "gen-handle", transform: `translate(${f2(x)} ${f2(y)}) scale(0)` }, root), x, y, at }));
  G.read = svg("text", { class: "gen-label gen-label--small", opacity: 0 }, root);
  void defs;
  return G;
}

// ─── 3. one frame (theirs, `frame`, reveal "fade"): p = drawing progress, t = ms on the clock ───
const FLOW = 0.016;
function drawStroke(s, q, t) {
  const on = q > 0;
  s.el.style.opacity = on ? 1 : 0;
  if (on) {
    const gap = s.gap;
    const n = Math.floor((s.L * Math.min(1, q)) / gap) + 1;
    if (n !== s.n) {
      s.n = n;
      s.el.style.strokeDasharray = `${`0 ${f2(gap)} `.repeat(n - 1)}0 ${f2(s.L + 10)}`;
    }
    s.el.style.strokeDashoffset = f2(-(t * FLOW) % gap);
  }
  if (s.head) {
    const live = (s.live = q > 0 && q < 1);
    s.head.setAttribute("opacity", live ? 1 : 0);
    if (live) {
      s.pt = s.el.getPointAtLength(Math.floor((s.L * q) / s.gap) * s.gap);
      s.head.setAttribute("cx", f2(s.pt.x));
      s.head.setAttribute("cy", f2(s.pt.y));
    }
  }
}

function frame(G, p, t, D, fq) {
  const { w, h } = G;
  const clean = 1 - smooth(PH.clean[0], PH.clean[1], p);

  // dot field: ripple from the centre, rain down the columns, lit by the probe and the reticle
  const R = OUT(win(PH.dots, p)) * (G.maxD + 60);
  const rainOn = smooth(0.04, 0.2, p) * (1 - smooth(0.62, 0.86, p));
  const pw = win(PH.probe, p);
  const probeX = lerp(-G.M, w + G.M, OUT(pw));
  const probeOp = pw > 0 && pw < 1 ? smooth(0, 0.1, pw) * (1 - smooth(0.85, 1, pw)) : 0;
  G.probe.setAttribute("transform", `translate(${f2(probeX)} 0)`);
  G.probe.setAttribute("opacity", f2(probeOp * 0.8));
  let rb = null;
  let rOp = 0;
  const at = G.parts.reduce((k, pt, i) => (p >= pt.t0 ? i : k), -1);
  if (at >= 0 && p < PH.reveal[0] + 0.06) {
    const pt = G.parts[at];
    const from = at ? G.parts[at - 1].b : { x: 0, y: 0, w, h };
    const q = OUT(clamp((p - pt.t0) / 0.05));
    const P = 5;
    rb = { x: lerp(from.x, pt.b.x, q) - P, y: lerp(from.y, pt.b.y, q) - P, w: lerp(from.w, pt.b.w, q) + 2 * P, h: lerp(from.h, pt.b.h, q) + 2 * P };
    rOp = smooth(PH.parts[0], PH.parts[0] + 0.04, p) * (1 - smooth(PH.reveal[0], PH.reveal[0] + 0.06, p));
    const l = Math.min(7, rb.w / 3, rb.h / 3);
    const { x: X, y: Y, w: RW, h: RH } = rb;
    G.ret.setAttribute("d", `M${f2(X)} ${f2(Y + l)}V${f2(Y)}H${f2(X + l)}M${f2(X + RW - l)} ${f2(Y)}H${f2(X + RW)}V${f2(Y + l)}M${f2(X + RW)} ${f2(Y + RH - l)}V${f2(Y + RH)}H${f2(X + RW - l)}M${f2(X + l)} ${f2(Y + RH)}H${f2(X)}V${f2(Y + RH - l)}`);
    G.tag.setAttribute("x", f2(X));
    G.tag.setAttribute("y", f2(Y - 4));
    G.tag.textContent = `${pt.name} ${Math.round(pt.b.w)}×${Math.round(pt.b.h)}`;
  }
  G.ret.setAttribute("opacity", f2(rOp));
  G.tag.setAttribute("opacity", f2(rOp));

  const ctx = G.ctx;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, -G.field.x0 * G.dpr, -G.field.y0 * G.dpr);
  ctx.clearRect(G.field.x0, G.field.y0, G.field.x1 - G.field.x0, G.field.y1 - G.field.y0);
  G.lit = 0;
  G.shown = 0;
  for (const d of G.dots) {
    const lag = R - d.d;
    const env = clamp(lag / 50);
    const front = p < PH.dots[1] + 0.05 ? Math.exp(-(((lag - 6) / 14) ** 2)) : 0;
    const headY = ((t * d.v + d.ph) % (G.span + d.tr)) + G.field.y0;
    const back = headY - d.y;
    const rain = back >= 0 && back < d.tr ? (1 - back / d.tr) ** 1.6 * rainOn * env * d.edge : 0;
    const near = rb
      ? Math.max(0, 1 - Math.max(rb.x - d.x, d.x - rb.x - rb.w, rb.y - d.y, d.y - rb.y - rb.h, 0) / 16) *
        (d.x > rb.x && d.x < rb.x + rb.w && d.y > rb.y && d.y < rb.y + rb.h ? 1 : 0.6)
      : 0;
    const probe = probeOp > 0 ? Math.exp(-(((d.x - probeX) / 9) ** 2)) * probeOp * env : 0;
    const lit = Math.max(front, rain, near * rOp * 0.8, probe);
    const a = Math.max(env * 0.5 * d.edge, lit * d.edge) * clean * (1 - fq);
    if (a < 0.01) continue;
    G.shown += 1;
    const isLit = lit > 0.35;
    if (isLit) G.lit += 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = isLit ? G.strong : G.ink;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 1.05 + lit * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const gOp = 0.5 * (1 - smooth(0.66, 0.92, p));
  G.guides.forEach((g, i) => {
    const q = OUT(clamp((p - PH.guides[0] - i * 0.03) / (PH.guides[1] - PH.guides[0] - 0.09)));
    drawStroke(g, q, t);
    g.el.style.opacity = q > 0 ? gOp : 0;
  });
  const oq = OUT(win(PH.outline, p));
  G.dim.textContent = `${Math.round(w * oq)} × ${Math.round(h * oq)}   t+${((Math.min(p, 1) * D) / 1000).toFixed(2)}s`;
  G.dim.setAttribute("opacity", f2(p > PH.outline[0] ? (1 - smooth(0.66, 0.9, p)) * 0.9 : 0));
  for (const s of G.outline) drawStroke(s, oq, t);
  for (const hd of G.handles) {
    hd.el.setAttribute("transform", `translate(${f2(hd.x)} ${f2(hd.y)}) scale(${f2(OUT(clamp((p - hd.at) / 0.1)) * (1 - smooth(0.82, 0.96, p)))})`);
  }
  for (const q of G.flyers) {
    const k = clamp((p - q.s0) / (q.arr - q.s0));
    const on = p >= q.s0 && p < q.arr + 0.01;
    q.el.setAttribute("opacity", on ? f2(smooth(0, 0.25, k)) : 0);
    if (on) {
      const e = OUT(k);
      q.el.setAttribute("cx", f2(lerp(q.x0, q.x1, e)));
      q.el.setAttribute("cy", f2(lerp(q.y0, q.y1, e)));
    }
  }
  for (const pt of G.parts) {
    const q = clamp((p - pt.t0) / (pt.t1 - pt.t0));
    for (const s of pt.strokes) drawStroke(s, OUT(clamp(q * pt.strokes.n - s.idx * 0.75)), t);
  }
  const kOut = 1 - smooth(PH.reveal[0] - 0.02, PH.reveal[0] + 0.1, p);
  for (const K of G.keys) {
    const t0 = K.pt.t0 - 0.03;
    const hq = OUT(clamp((p - K.pt.t0 - 0.04) / 0.08));
    const oq2 = OUT(clamp((p - K.pt.t0) / (K.pt.t1 - K.pt.t0)));
    K.guides.forEach((g, i) => {
      const q = OUT(clamp((p - t0 - i * 0.012) / 0.1));
      drawStroke(g, q, t);
      g.el.style.opacity = q > 0 ? f2(0.5 * kOut) : 0;
    });
    for (const hd of K.handles) hd.el.setAttribute("transform", `translate(${f2(hd.x)} ${f2(hd.y)}) scale(${f2(hq * kOut)})`);
    K.dim.setAttribute("opacity", f2(p > t0 ? 0.9 * kOut : 0));
    K.dim.textContent = `${Math.round(K.pt.b.w * oq2)} × ${Math.round(K.pt.b.h * oq2)}`;
  }
  let cur = null;
  for (const s of [...G.outline, ...G.parts.flatMap((pt) => pt.strokes)]) if (s.live) cur = s;
  G.read.setAttribute("opacity", cur ? 1 : 0);
  if (cur) {
    G.read.setAttribute("x", f2(cur.pt.x + 6));
    G.read.setAttribute("y", f2(cur.pt.y - 5));
    G.read.textContent = `${String(Math.round(cur.pt.x)).padStart(3, "0")}·${String(Math.round(cur.pt.y)).padStart(3, "0")}`;
  }
}

/**
 * Draw `shape` (an element laid out unseen in `host`) as it is generated,
 * from now. `run.reveal(el)` brings `el` in over the drawing once it is
 * ready; without it the drawing holds its finished pose. `margin`: how far
 * the guides reach past the shape (theirs: 44px).
 */
export function generate(host, shape, { margin = 44, maxParts = 60, keys = 5, id = "generate" } = {}) {
  const D = TIMING.duration;
  const HOLD = PH.reveal[0] * D;
  const lag = HOLD - TIMING.revealAt; // the drawing starts fading out this long after the box starts coming in
  let G = null;
  let raf = 0;
  let revealAt = null;
  let stopped = false;
  const M = measure(shape, maxParts, keys);
  G = buildOverlay(host, shape, M, { margin });
  G.layer.dataset.genRun = "";
  // The run's one clock: every part of it reads this animation's time.
  const driver = G.layer.animate([{ opacity: 1 }, { opacity: 1 }], { duration: Number.POSITIVE_INFINITY });
  driver.id = id;
  const animations = [driver];

  /** Where the drawing stands at `t` on the clock: it holds its finished pose until the reveal. */
  const drawing = (t) => (revealAt === null || t < revealAt + lag ? Math.min(t, HOLD) : HOLD + (t - (revealAt + lag)));
  const fadeOut = (t) => (revealAt === null ? 0 : SMOOTH_OUT(clamp((t - (revealAt + lag)) / TIMING.fadeDuration)));
  const paint = () => {
    const t = Number(driver.currentTime ?? 0);
    frame(G, drawing(t) / D, t, D, fadeOut(t));
  };
  paint();
  const tick = () => {
    if (stopped) return;
    paint();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const a of animations) a.cancel();
    G.layer.remove();
  };
  return {
    animations,
    driver,
    get layer() {
      return G.layer;
    },
    /** The drawing's numbers at this frame, for the proof. */
    read: () => ({ t: Number(driver.currentTime ?? 0), revealAt, shown: G.shown, lit: G.lit }),
    /**
     * Bring `el` in: from revealAt, or now if that has passed, its opacity
     * from 0 and its blur from 3px over fadeDuration on their curve, while
     * the drawing fades out after it (the same lag as theirs). One clock: both
     * start where the driver started, each at its delay. Resolves once the
     * drawing has gone and `el` stands at rest.
     */
    reveal(el) {
      const now = Number(driver.currentTime ?? 0);
      revealAt = Math.max(TIMING.revealAt, now);
      const end = Math.max(revealAt + lag + TIMING.fadeDuration, ((PH.clean[1] * D - HOLD) + revealAt + lag), (END * D - HOLD) + revealAt + lag);
      driver.effect.updateTiming({ duration: end });
      const start = driver.startTime;
      const into = el.animate(
        [
          { opacity: 0, filter: "blur(3px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: TIMING.fadeDuration, delay: revealAt, easing: REVEAL_EASE, fill: "backwards" }
      );
      into.id = "generate-reveal";
      const out = G.wire.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: TIMING.fadeDuration,
        delay: revealAt + lag,
        easing: REVEAL_EASE,
        fill: "both",
      });
      out.id = "generate-wire";
      for (const a of [into, out]) {
        a.startTime = start;
        animations.push(a);
      }
      return driver.finished.then(() => {
        stopped = true;
        cancelAnimationFrame(raf);
        G.layer.remove();
        into.cancel();
      });
    },
    stop,
  };
}
