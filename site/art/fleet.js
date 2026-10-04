/**
 * Fleet: four machines standing on one ground. A rack of three units is the
 * machine you rent; a block floating in a dashed cage is the virtual one; a
 * laptop sits with its lid left ajar; a squat box is the small desktop. The
 * machine under the pointer wakes and rises, and the others stir after it in
 * turn, less the farther they stand. The slider is the stagger, in ms.
 *
 * The pattern: discrete items. Tweens, a stagger by distance, each machine told
 * apart by its geometry, and a hit test on the rest centres, which never move.
 */
const {
  Cam, extremes, facing, fit, poly, proj, rad, ringAt, rings, rrect, prism, seg,
  tdone, tset, tval, tween, disposer, mk, solid, put, place, pointer, reflect, register,
} = HL;

const LIFT = 9, FALL = [1, 0.36, 0.14], AJAR = 24, TK = 1.4, REACH = 46;
/** Each machine's footprint and height, back to front: ascending x + y. */
const M = [
  { name: "cloud", x0: 0, y0: 0, x1: 40, y1: 40, h: 58 },
  { name: "vm", x0: 76, y0: 8, x1: 104, y1: 36, h: 34 },
  { name: "laptop", x0: 0, y0: 78, x1: 52, y1: 112, h: 3 },
  { name: "box", x0: 78, y0: 80, x1: 112, y1: 114, h: 13 },
];

/** One rounded unit from z to z + h: its solid, a vent slot on the right face and a lamp on the left one. */
function unit(P, front, g, m, h, r) {
  const [ring, inner] = rings(m.x0, m.y0, m.x1, m.y1, r, 1.5);
  const s = solid(g), slot = mk("path", { class: "nf lo" }, g), lamp = mk("circle", { r: 1.5, class: "dot m" }, g);
  return {
    sil: s.sil,
    lamp,
    draw(z) {
      put(s, prism(P, front, ring, inner, z, z + h));
      slot.setAttribute("d", seg(P(m.x1, m.y0 + 9, z + h / 2), P(m.x1, m.y1 - 9, z + h / 2)));
      place(lamp, P(m.x0 + 8, m.y1, z + h / 2));
    },
  };
}

/** The rented machine: three units stacked in a rack, a gap between each. */
function cloud(P, front, g, m) {
  const units = [0, 21, 42].map((z0) => ({ z0, u: unit(P, front, g, m, 16, 5) }));
  return {
    marks: units.map((q) => q.u.sil),
    lamps: units.map((q) => q.u.lamp),
    draw: (z) => units.forEach((q) => q.u.draw(z + q.z0)),
  };
}

/** The virtual machine: a block floating inside a dashed cage, which is drawn first so the block covers it. */
function vm(P, front, g, m) {
  const cage = rrect(m.x0 - 8, m.y0 - 8, m.x1 + 8, m.y1 + 8, 7, 5), drops = extremes(P, cage);
  const frame = mk("path", { class: "dash nf" }, g), u = unit(P, front, g, m, 18, 5);
  return {
    marks: [u.sil],
    lamps: [u.lamp],
    draw(z) {
      const posts = drops.map((q) => seg(P(q.u, q.v, z), P(q.u, q.v, z + m.h))).join("");
      frame.setAttribute("d", poly(ringAt(P, cage, z)) + poly(ringAt(P, cage, z + m.h)) + posts);
      u.draw(z + 8);
    },
  };
}

/** The laptop: a thin base with a trackpad and two key rows, and a lid hinged at the back, left ajar. */
function laptop(P, front, g, m) {
  const [ring, inner] = rings(m.x0, m.y0, m.x1, m.y1, 4, 1.2);
  const base = solid(g), deck = mk("path", { class: "nf lo" }, g);
  const under = mk("path", { class: "lo" }, g), lid = mk("path", { class: "sil" }, g);
  const lamp = mk("circle", { r: 1.5, class: "dot m" }, g);
  const plate = rrect(0, 0, m.x1 - m.x0, m.y1 - m.y0, 4, 5), pad = rrect(m.x0 + 18, m.y1 - 12, m.x1 - 18, m.y1 - 4, 2, 3);
  const s = Math.sin(rad(AJAR)), c = Math.cos(rad(AJAR));
  return {
    marks: [lid],
    lamps: [lamp],
    draw(z) {
      const top = z + m.h, row = (y) => seg(P(m.x0 + 6, y, top), P(m.x1 - 6, y, top));
      // the lid's own plane: v runs from the hinge to the free edge, dz down through its thickness
      const w = (q, dz) => P(m.x0 + q.u, m.y0 + q.v * c + dz * s, top + 0.8 + q.v * s - dz * c);
      put(base, prism(P, front, ring, inner, z, top));
      deck.setAttribute("d", poly(ringAt(P, pad, top)) + row(m.y1 - 16) + row(m.y1 - 20));
      under.setAttribute("d", poly(plate.map((q) => w(q, TK))));
      lid.setAttribute("d", poly(plate.map((q) => w(q, 0))));
      place(lamp, P(m.x0 + 7, m.y1, z + 1.5));
    },
  };
}

/** The small desktop: one squat box. */
function box(P, front, g, m) {
  const u = unit(P, front, g, m, m.h, 7);
  return { marks: [u.sil], lamps: [u.lamp], draw: u.draw };
}

const BUILD = [cloud, vm, laptop, box], RESTING = 2;
/** Steps between two machines on the two-by-two ground: 0, 1 or 2. */
const steps = (i, j) => Math.abs((i % 2) - (j % 2)) + Math.abs((i >> 1) - (j >> 1));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  // The camera is fitted to the ground with the tallest machine lifted, so nothing leaves the frame in any pose.
  const C = Cam(45, 0.5, 1.6);
  fit(C, [[-8, -8, 0], [112, 114, -10], [112, -8, 0], [-8, 114, 0], [0, 0, 58 + LIFT], [112, 0, 34 + LIFT]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  for (const m of M) reflect(svg, g, P, front, rings(m.x0, m.y0, m.x1, m.y1, 5, 1.5)[0], 0, 10);
  const parts = M.map((m, i) => ({
    ...BUILD[i](P, front, mk("g", {}, g), m),
    z: tween(0),
    // the rest centre: where the pointer is measured from, whatever the machine is doing
    at: P((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, m.h / 2),
  }));

  /** The machine whose rest centre is nearest the point, within reach; -1 outside. */
  function hit([x, y]) {
    let best = -1, near = REACH * REACH;
    parts.forEach((p, i) => {
      const d = (x - p.at[0]) ** 2 + (y - p.at[1]) ** 2;
      if (d < near) { near = d; best = i; }
    });
    return best;
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const p of parts) { p.draw(tval(p.z, now)); if (!tdone(p.z, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);

  /** The one bright mark: the machine chosen, or at rest the laptop's lid. */
  function light(a) {
    parts.forEach((p, i) => {
      const on = i === (a < 0 ? RESTING : a);
      for (const el of p.marks) el.classList.toggle("hi", on);
      for (const el of p.lamps) el.classList.toggle("m", !on);
    });
  }

  let act = -1;
  /** Wakes machine a (-1 lets them all settle). The stir spreads out from the one chosen, or the one let go. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    parts.forEach((p, i) => {
      const d = steps(i, from);
      tset(p.z, a < 0 ? 0 : LIFT * FALL[d], now, d * stag);
    });
    light(a);
    read.textContent = a < 0 ? "rest" : M[a].name;
    B.wake();
  }

  for (const p of parts) p.draw(0);
  light(-1);
  read.textContent = "rest";

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { stag = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "fleet",
  means: "Four machines on one ground: the one under the pointer wakes, and the rest stir after it, less the farther they stand.",
  rules: [1, 2, 5, 9],
  range: [0, 45, 90],
  mount,
});
