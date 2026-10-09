/**
 * The strategy figures (Configure → Accounts): each account a lane, sessions
 * riding in from the left and docking in the lane the strategy picks, the
 * lane's bar filling as they use it. One looping timeline per figure, of Web
 * Animations keyframes on transform, opacity, box-shadow and offset-distance
 * (chips ride offset-path curves), built from a storyboard in seconds.
 *
 * Travel and growth run on --ease-figure, fades on --ease-out; the edge
 * pulse is a ring leaving the bar; the last frame holds, then the figure
 * fades through to its first. A figure that is not playing shows its last
 * frame and caption, which is also all it ever shows under reduced motion.
 *
 * Ported from the owner-approved preview (artifacts/accounts-preview), whose
 * storyboards these are. The lanes' clocks and fills are illustrations of a
 * strategy, not anybody's readings.
 */
import { ease } from "../motion/curves.svelte";

export type Board = "pinned" | "fill" | "spread" | "soonest" | "limit";

export interface Lane {
  /** A CSS colour (an account token). */
  color: string;
  name: string;
}

/** The at-limit numbers the limit figure is driven by. */
export interface Policy {
  /** Summary written at this % of the window. */
  at: number;
  /** Move the whole conversation under this many k tokens. */
  under: number;
  /** Wait if the window resets within this many minutes. */
  wait: number;
}

export interface FigureSpec {
  board: Board;
  lanes: Lane[];
  /** Whether CawCo reads the provider's limits: the at-the-limit policy shows below. */
  limits?: boolean;
  /** The pinned lane, for `pinned`. */
  pin?: number;
  policy?: Policy;
}

type Prop =
  | "transform"
  | "opacity"
  | "boxShadow"
  | "offsetDistance"
  | "strokeDashoffset"
  | "backgroundColor";

interface Key {
  e: string;
  t: number;
  v: string;
}

/** One property of one element over the figure's time. */
class Track {
  readonly el: HTMLElement | SVGElement;
  readonly p: Prop;
  readonly k: Key[];
  readonly #mk: string;

  constructor(el: HTMLElement | SVGElement, p: Prop, v0: string, mk: string) {
    this.el = el;
    this.p = p;
    this.k = [{ t: 0, v: v0, e: "linear" }];
    this.#mk = mk;
  }

  get last(): Key {
    return this.k.at(-1) as Key;
  }

  /** From `t`, move to `v` over `d` seconds on `e`. */
  to(at: number, v: string, d = 0.5, e = this.#mk): this {
    const L = this.last;
    const t = Math.max(at, L.t);
    if (t > L.t) {
      this.k.push({ t, v: L.v, e });
    } else {
      L.e = e;
    }
    this.k.push({ t: t + Math.max(d, 0.001), v, e: "linear" });
    return this;
  }

  set(t: number, v: string): this {
    return this.to(t, v, 0.001, "linear");
  }

  at(t: number): string {
    const [{ v: first }] = this.k;
    let v = first;
    for (const { t: when, v: value } of this.k) {
      if (when <= t + 1e-6) {
        v = value;
      }
    }
    return v;
  }

  frames(D: number): Keyframe[] {
    const f: Keyframe[] = this.k.map((key) => ({
      offset: Math.min(1, Math.max(0, key.t / D)),
      [this.p]: key.v,
      easing: key.e,
    }));
    if ((f.at(-1)?.offset as number) < 1) {
      f.push({ offset: 1, [this.p]: this.last.v });
    }
    return f;
  }
}

/** The figure's whole loop: its tracks, and the words that change with time. */
export class Timeline {
  readonly tracks: Track[] = [];
  readonly texts: { el: HTMLElement; fn: (t: number) => string }[] = [];
  /** The last frame's time, the seam's start, the loop's length (seconds). */
  E = 0;
  S = 0;
  D = 1;
  anims: Animation[] | null = null;
  #raf = 0;
  readonly mk: string;

  constructor(mk: string) {
    this.mk = mk;
  }

  tr(el: HTMLElement | SVGElement, p: Prop, v0: string): Track {
    const track = new Track(el, p, v0, this.mk);
    this.tracks.push(track);
    return track;
  }

  text(el: HTMLElement, fn: (t: number) => string): void {
    this.texts.push({ el, fn });
  }

  /** Shows the last frame, standing still. */
  rest(): void {
    for (const t of this.tracks) {
      (t.el.style as unknown as Record<string, string>)[t.p] = t.at(this.E);
    }
    this.#words(this.E);
  }

  #words(t: number): void {
    for (const x of this.texts) {
      const s = x.fn(t);
      if (x.el.textContent !== s) {
        x.el.textContent = s;
      }
    }
  }

  /** Plays from `from` ms, or from just before the last frame's hold. */
  play(from?: number): void {
    if (this.anims) {
      return;
    }
    const ms = this.D * 1000;
    this.anims = this.tracks.map((t) =>
      t.el.animate(t.frames(this.D), {
        duration: ms,
        iterations: Number.POSITIVE_INFINITY,
      })
    );
    const start = from ?? (this.S - 0.2) * 1000;
    for (const a of this.anims) {
      a.currentTime = start;
    }
    if (this.texts.length > 0) {
      const loop = () => {
        const first = this.anims?.[0];
        if (!first) {
          return;
        }
        this.#words(((Number(first.currentTime) || 0) / 1000) % this.D);
        this.#raf = requestAnimationFrame(loop);
      };
      this.#raf = requestAnimationFrame(loop);
    }
  }

  stop(): void {
    if (this.anims) {
      for (const a of this.anims) {
        a.cancel();
      }
      this.anims = null;
    }
    cancelAnimationFrame(this.#raf);
    this.rest();
  }

  /** Where the loop is, in ms; null while it stands still. */
  time(): number | null {
    const t = this.anims?.[0]?.currentTime;
    return t === null || t === undefined ? null : Number(t);
  }
}

interface LaneSpec {
  blkText?: string;
  clock: string | ((t: number) => string);
  fill: number;
  glow?: boolean;
  lane: Lane;
  pin?: boolean;
}

interface LaneParts {
  bk: HTMLElement;
  c: string;
  ck: HTMLElement;
  cw: HTMLElement;
  f: number;
  f0: number;
  gh: HTMLElement;
  i: number;
  /** The lane's label: its dot and name. */
  lb: HTMLElement;
  n: number;
  tblk: Track;
  /** The clock's words: away while the blocked word stands in their place. */
  tck: Track;
  tdim: Track;
  tf: Track;
  tgh: Track;
  tglow: Track;
  thr: Track;
  tpu: Track;
}

interface Chip {
  el: HTMLElement;
  lane: number;
  pos: { x: number; y: number };
}

const SVG = "http://www.w3.org/2000/svg";
/** Solar's pin-bold-duotone, beside the pinned lane's name. */
const PIN =
  '<g fill="currentColor"><path fill-rule="evenodd" d="M16.2188 4.83755L19.1835 7.80516C21.1954 9.81905 22.2014 10.826 21.9667 11.9115C21.7319 12.9969 20.4 13.4973 17.7362 14.4981L15.8922 15.191C15.1788 15.459 14.8221 15.593 14.5468 15.8314C14.4262 15.9358 14.3184 16.054 14.2254 16.1835C14.013 16.4795 13.9119 16.8472 13.7095 17.5825C13.2493 19.2551 13.0192 20.0914 12.4713 20.4041C12.2404 20.5358 11.9792 20.6049 11.7134 20.6045C11.0827 20.6036 10.4699 19.9902 9.24441 18.7635L7.77841 17.2961L6.69935 16.2163L5.28476 14.8C4.06698 13.581 3.45809 12.9715 3.45413 12.3446C3.45242 12.0735 3.5228 11.8069 3.65804 11.5721C3.97088 11.0289 4.80107 10.8 6.46145 10.3423C7.19811 10.1392 7.56644 10.0377 7.86251 9.82451C7.99536 9.72887 8.11619 9.61754 8.22239 9.49292C8.45908 9.2152 8.59063 8.85617 8.85373 8.1381L9.5217 6.31506C10.5086 3.62155 11.0021 2.2748 12.0904 2.03468C13.1788 1.79457 14.1921 2.8089 16.2188 4.83755Z" clip-rule="evenodd" opacity=".5"/><path d="M3.30236 21.7764L7.77841 17.2961L6.69935 16.2163L2.22345 20.6965C1.92552 20.9947 1.92552 21.4782 2.22345 21.7764C2.52138 22.0747 3.00443 22.0747 3.30236 21.7764Z"/></g>';

const mins = (m: number): string => {
  const whole = Math.max(0, Math.round(m));
  return whole >= 60
    ? `${Math.floor(whole / 60)}h ${String(whole % 60).padStart(2, "0")}m`
    : `${whole}m`;
};
/** Illustrative clocks and fills, by lane. */
const CLOCKS = [
  "resets 4h 25m",
  "resets 1h 10m",
  "resets 4h 50m",
  "resets 3h 05m",
];
const FILLS = [0.2, 0.3, 0.15, 0.25];

/**
 * The figure's geometry, px. Lanes stand on a fixed pitch from the top: a
 * lane's label row, then its dock row centred `ROW` below the lane's top,
 * then room under the dock (a fork's link; on the at-the-limit board, the
 * tag naming the conversation's size) before the next lane. Left of every
 * lane runs the entry gutter: sessions come in at the lanes' middle there,
 * and turn into their lane's row before the dock, so a session in flight
 * never crosses a lane's name, its dot, or a session already docked. The
 * stage is as tall as its lanes and its caption.
 */
const PAD = 12;
const PITCH = 40;
/** The at-the-limit board's pitch: a tag line under each dock row. */
const TAGGED_PITCH = 56;
const ROW = 24;
const GUTTER = 14;
const SLOT = 13;
const SLOTS = 5;
const CHIP = 10;
/** Room for the caption under the lanes: one line, and a line more per wrap. */
const CAP_GAP = 6;
const CAP_LINE = 16;
const CAP_FOOT = 8;

/** A board's lane pitch. */
const pitchOf = (board: Board): number =>
  board === "limit" ? TAGGED_PITCH : PITCH;

/** A board's stage height for `lanes` lanes and a caption of `lines` lines. */
export const figureHeight = (board: Board, lanes: number, lines = 1): number =>
  PAD + lanes * pitchOf(board) + CAP_GAP + lines * CAP_LINE + CAP_FOOT;

/**
 * Lays the lanes out in `stage` and returns the API a storyboard writes its
 * timeline with. Each lane: its name and clock on one row, then a dock for
 * session chips and the use bar. Sessions dock from the bar's end of the
 * dock back toward the gutter, so one arriving only ever passes empty slots.
 */
function layout(stage: HTMLElement, board: Board, lanes: LaneSpec[]) {
  const mk = ease("--ease-figure");
  const eo = ease("--ease-out");
  const W = stage.clientWidth;
  const n = lanes.length;
  const pitch = pitchOf(board);
  const H = figureHeight(board, n);
  const probe = document.createElement("i");
  probe.style.display = "none";
  const root = document.createElement("div");
  root.className = "dg";
  root.setAttribute("aria-hidden", "true");
  stage.replaceChildren(root, probe);
  /** A colour token resolved, for keyframes that cannot hold a variable. */
  const rc = (v: string, alpha?: number): string => {
    probe.style.color =
      alpha === undefined
        ? v
        : `color-mix(in oklab, ${v} ${alpha * 100}%, transparent)`;
    return getComputedStyle(probe).color;
  };
  const tl = new Timeline(mk);
  const pad = PAD;
  /** Where a lane's label and dock start: past the entry gutter. */
  const left = PAD + GUTTER;
  const y0 = (i: number) => PAD + i * pitch;
  const dockX = left;
  const barX = left + SLOTS * SLOT + 8;
  const barW = W - barX - PAD;
  /** A dock slot's centre, `k` from the gutter's end. */
  const slot = (i: number, k: number) => ({
    x: dockX + CHIP / 2 + k * SLOT,
    y: y0(i) + ROW,
  });
  /** Where a lane's `k`th session docks: the first at the bar's end. */
  const dock = (i: number, k: number) =>
    slot(i, SLOTS - 1 - Math.min(k, SLOTS - 1));
  const el = (cls: string, css = "", parent: Element = root): HTMLElement => {
    const e = document.createElement("div");
    e.className = `e ${cls}`.trim();
    if (css) {
      e.style.cssText = css;
    }
    parent.appendChild(e);
    return e;
  };
  /** The layer that fades through at the seam. */
  const dy = el("dy", "inset:0;width:100%;height:100%");
  const L: LaneParts[] = lanes.map((ln, i) => {
    const c = `--c:${ln.lane.color};`;
    const y = y0(i);
    const g = el("lane", `${c}inset:0;width:100%;height:100%`);
    const lb = el("ln-lbl", `left:${left}px;top:${y}px`, g);
    lb.append(
      Object.assign(document.createElement("span"), { className: "dot" })
    );
    lb.append(
      Object.assign(document.createElement("span"), {
        textContent: ln.lane.name,
        className: "nm",
      })
    );
    if (ln.pin) {
      const svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.innerHTML = PIN;
      lb.append(svg);
    }
    const cw = el(
      "clkw",
      `${c}right:${pad - 5}px;left:auto;top:${y}px;height:14px;width:0`,
      g
    );
    const ck = el("clk", `right:${pad - 5}px;left:auto;top:${y}px`, g);
    ck.textContent = typeof ln.clock === "function" ? ln.clock(0) : ln.clock;
    const bk = el("blk", `right:${pad}px;left:auto;top:${y}px`, g);
    bk.textContent = ln.blkText ?? "blocked";
    // A blocked lane dims its bar, never its words.
    const bg = el("bars", "inset:0;width:100%;height:100%", g);
    const bar = `left:${barX}px;top:${y + ROW - CHIP / 2}px;width:${barW}px`;
    el("bar", bar, bg);
    const hr = el("hr", c + bar, bg);
    const gh = el("gh", c + bar, bg);
    const fl = el("fl", `${c}${bar};transform:scaleX(${ln.fill})`, bg);
    const pu = el("pu", c + bar, bg);
    const parts: LaneParts = {
      i,
      lb,
      bk,
      ck,
      cw,
      gh,
      c: ln.lane.color,
      f: ln.fill,
      f0: ln.fill,
      n: 0,
      tf: tl.tr(fl, "transform", `scaleX(${ln.fill})`),
      tdim: tl.tr(bg, "opacity", "1"),
      tglow: tl.tr(cw, "opacity", ln.glow ? "1" : "0"),
      tck: tl.tr(ck, "opacity", "1"),
      tblk: tl.tr(bk, "opacity", "0"),
      thr: tl.tr(hr, "opacity", "0"),
      tgh: tl.tr(gh, "opacity", "0"),
      tpu: tl.tr(pu, "boxShadow", "0 0 0 0 transparent"),
    };
    if (typeof ln.clock === "function") {
      tl.text(ck, ln.clock);
    }
    return parts;
  });
  // The clock's wash sits behind the clock's words, and a lane's name gives
  // way (an ellipsis) before it reaches them.
  requestAnimationFrame(() => {
    for (const o of L) {
      o.cw.style.width = `${o.ck.offsetWidth}px`;
      const words = Math.max(o.ck.offsetWidth, o.bk.offsetWidth);
      o.lb.style.maxWidth = `${W - left - PAD - words - 8}px`;
    }
  });
  /** Where sessions come in: off the stage's edge, level with the lanes' middle. */
  const entry = { x: -10, y: PAD + (n * pitch) / 2 };
  /** The gutter's middle: where a session turns toward its lane, and waits when it must. */
  const turn = left / 2;
  /** A path's length, measured on the page (a pause is a share of it). */
  const measure = document.createElementNS(SVG, "svg");
  measure.setAttribute("width", "0");
  measure.setAttribute("height", "0");
  measure.style.position = "absolute";
  root.append(measure);
  const lengthOf = (d: string): number => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    measure.append(path);
    const length = path.getTotalLength();
    path.remove();
    return length;
  };
  const api = {
    W,
    H,
    L,
    tl,
    dy,
    el,
    slot,
    barX,
    barW,
    mk,
    eo,
    rc,
    fill(i: number, t: number, v: number, d = 0.5) {
      const o = L[i];
      o.f = Math.max(0, Math.min(1, v));
      o.tf.to(t, `scaleX(${o.f})`, d, mk);
    },
    notch(i: number, t: number, dv: number) {
      api.fill(i, t, L[i].f + dv);
    },
    /** A ring leaves the bar's edge and fades. */
    pulse(i: number, t: number) {
      L[i].tpu
        .set(t, `0 0 0 0 ${rc(L[i].c)}`)
        .to(t + 0.01, `0 0 0 7px ${rc(L[i].c, 0)}`, 0.9, "ease-out");
    },
    /**
     * A session comes in through the gutter, turns into lane i's row there,
     * and docks in the lane's next free slot. With `pause`, it waits at the
     * turn for `hold` seconds first (the strategy weighing the lanes).
     */
    chip(
      i: number,
      t: number,
      o: { pause?: boolean; hold?: number } = {}
    ): Chip {
      const ln = L[i];
      const s = dock(i, ln.n);
      ln.n += 1;
      const e = entry;
      const lead = `M ${e.x} ${e.y} L ${turn} ${e.y}`;
      const d = `${lead} C ${left} ${e.y}, ${turn} ${s.y}, ${left} ${s.y} L ${s.x} ${s.y}`;
      const c = el(
        "chip",
        `--c:${ln.c};offset-path:path('${d}');offset-distance:100%`,
        dy
      );
      tl.tr(c, "opacity", "0").to(t, "1", 0.3, "ease-out");
      const tod = tl.tr(c, "offsetDistance", "0%");
      if (o.pause) {
        const waitAt = (lengthOf(lead) / lengthOf(d)) * 100;
        tod
          .to(t, `${waitAt}%`, 0.45, mk)
          .to(t + (o.hold ?? 0), "100%", 0.6, mk);
      } else {
        tod.to(t, "100%", 0.7, mk);
      }
      return { el: c, lane: i, pos: s };
    },
    /**
     * A session's fork: the child grows in its parent's lane, in the next
     * free slot, its badge (the child mark) saying what it is. Nothing is
     * drawn between them: the lane is the relation.
     */
    fork(par: Chip, t: number): Chip {
      const ln = L[par.lane];
      const s = dock(par.lane, ln.n);
      ln.n += 1;
      const at = (scale: number) =>
        `translate(${s.x - CHIP / 2}px,${s.y - CHIP / 2}px) scale(${scale})`;
      const c = el("chip child", `--c:${ln.c};transform:${at(1)}`, dy);
      tl.tr(c, "opacity", "0").to(t, "1", 0.2, "ease-out");
      tl.tr(c, "transform", at(0.6)).to(t, at(1), 0.35, mk);
      return { el: c, lane: par.lane, pos: s };
    },
    /** The lane's blocked word takes its clock's place, and gives it back with `on` false. */
    block(i: number, t: number, on = true) {
      const o = L[i];
      // One word in the place at a time: the leaving one is gone before the
      // arriving one shows.
      const [leave, arrive] = on ? [o.tck, o.tblk] : [o.tblk, o.tck];
      leave.to(t, "0", 0.15, "ease-out");
      arrive.to(t + 0.15, "1", 0.25, "ease-out");
      if (on) {
        o.tglow.to(t, "0", 0.15, "ease-out");
      }
    },
    /** A caption fades in at a and out at b; b = 99 holds it to the seam. */
    cap(a: number, b: number, text: string) {
      const c = el("cap", "", dy);
      c.textContent = text;
      const t = tl.tr(c, "opacity", "0").to(a, "1", 0.3, "ease-out");
      if (b < 99) {
        t.to(b, "0", 0.25, "ease-out");
      }
    },
    /** Hold the last frame, then fade through to frame 0. */
    seam(E: number, hold = 1.2) {
      const S = E + hold;
      tl.E = E;
      tl.S = S;
      tl.D = S + 0.3;
      L.forEach((o, i) => {
        o.tf.to(S, `scaleX(${o.f0})`, 0.3, eo);
        o.tdim.to(S, "1", 0.3, eo);
        o.tblk.to(S, "0", 0.2, eo);
        o.tck.to(S, "1", 0.2, eo);
        o.thr.to(S, "0", 0.2, eo);
        o.tgh.to(S, "0", 0.2, eo);
        o.tglow.to(S, lanes[i].glow ? "1" : "0", 0.3, eo);
      });
      tl.tr(dy, "opacity", "0").to(0, "1", 0.15, eo).to(S, "0", 0.15, eo);
    },
  };
  return api;
}

type Figure = ReturnType<typeof layout>;

const BOARDS: Record<Board, (stage: HTMLElement, spec: FigureSpec) => Figure> =
  {
    pinned(stage, { lanes, pin = 0, limits = true }) {
      const F = layout(
        stage,
        "pinned",
        lanes.map((lane, i) => ({
          lane,
          fill: i === pin ? 0.2 : (FILLS[i] ?? 0.25),
          pin: i === pin,
          clock: CLOCKS[i] ?? CLOCKS[0],
        }))
      );
      F.chip(pin, 0.7);
      F.notch(pin, 1.15, 0.12);
      const c2 = F.chip(pin, 1.4);
      F.notch(pin, 1.85, 0.12);
      F.chip(pin, 2.1);
      F.notch(pin, 2.55, 0.12);
      F.fork(c2, 2.8);
      F.notch(pin, 3.3, 0.1);
      F.chip(pin, 3.5);
      F.notch(pin, 3.95, 0.14);
      F.fill(pin, 4.2, 1, 0.4);
      F.pulse(pin, 4.6);
      if (limits) {
        F.cap(4.6, 99, "At the limit → the policy below");
      }
      F.seam(5.6);
      return F;
    },
    fill(stage, { lanes }) {
      const F = layout(
        stage,
        "fill",
        lanes.map((lane, i) => ({
          lane,
          fill: FILLS[i] ?? 0.25,
          clock: CLOCKS[i] ?? CLOCKS[0],
        }))
      );
      const [L0] = F.L;
      F.chip(0, 0.7);
      F.notch(0, 1.15, 0.14);
      const c2 = F.chip(0, 1.4);
      F.notch(0, 1.85, 0.14);
      F.chip(0, 2.1);
      F.notch(0, 2.55, 0.14);
      F.fill(0, 2.8, 1, 0.3);
      F.pulse(0, 2.9);
      F.block(0, 3.0);
      L0.tdim.to(3.0, ".6", 0.3, "ease-out");
      F.chip(1, 3.5);
      F.notch(1, 3.95, 0.14);
      F.fork(c2, 4.2);
      F.chip(1, 5.0);
      F.notch(1, 5.45, 0.14);
      F.seam(6.0);
      return F;
    },
    spread(stage, { lanes }) {
      const f0 = [0.2, 0.6, 0.45, 0.35];
      const F = layout(
        stage,
        "spread",
        lanes.map((lane, i) => ({
          lane,
          fill: f0[i] ?? 0.4,
          clock: CLOCKS[i] ?? CLOCKS[0],
        }))
      );
      let forkFrom: Chip | null = null;
      let forkAfter = 0;
      for (const t of [0.7, 1.6, 2.5, 3.4]) {
        // The chip waits at the turn in the gutter while every lane's
        // headroom lights; the most room wins.
        const rooms = F.L.map((o) => 1 - o.f);
        const best = rooms.indexOf(Math.max(...rooms));
        const c = F.chip(best, t, { pause: true, hold: 0.55 });
        F.L.forEach((o, i) => {
          o.thr
            .to(t + 0.3, "1", 0.2, "ease-out")
            .to(i === best ? t + 0.95 : t + 0.6, "0", 0.25, "ease-out");
        });
        F.notch(best, t + 0.95, 0.15);
        if (best !== 0 && !forkFrom) {
          forkFrom = c;
          forkAfter = t + 1.3;
        }
      }
      const tf = Math.max(4.2, forkAfter);
      if (forkFrom) {
        F.fork(forkFrom, tf);
        F.notch(forkFrom.lane, tf + 0.5, 0.08);
      }
      F.seam(tf + 1.0);
      return F;
    },
    soonest(stage, { lanes }) {
      const base = [12, 100, 185, 240];
      const fills = [0.35, 0.2, 0.95, 0.5];
      /** Compressed time: five minutes a second. */
      const RATE = 5;
      const clock = (i: number) => {
        const b = base[i] ?? 240;
        if (i === 0) {
          return (t: number) => {
            if (t < 2.4) {
              return `resets ${mins(b - RATE * t)}`;
            }
            return t < 2.8 ? "resets 0m" : "resets 5h";
          };
        }
        return (t: number) => `resets ${mins(b - RATE * t)}`;
      };
      const F = layout(
        stage,
        "soonest",
        lanes.map((lane, i) => ({
          lane,
          fill: fills[i] ?? 0.3,
          clock: clock(i),
          glow: i === 0,
          blkText: "full",
        }))
      );
      const [P, Wk, Sp] = F.L;
      const c1 = F.chip(0, 0.7);
      F.notch(0, 1.15, 0.2);
      F.chip(0, 1.4);
      F.notch(0, 1.85, 0.2);
      // The first lane's clock reaches zero: what it left unused ghosts out,
      // and its fill drains.
      P.gh.style.left = `${F.barX + F.barW * P.f}px`;
      P.gh.style.width = `${F.barW * (1 - P.f)}px`;
      P.tgh.set(2.4, "1").to(2.5, "0", 0.6, "ease-out");
      F.fill(0, 2.4, 0, 0.4);
      P.tglow.to(2.4, "0", 0.3, "ease-out");
      F.cap(2.4, 3.7, "What’s unused at reset is wasted, so it goes first.");
      if (Wk) {
        Wk.tglow.to(2.8, "1", 0.3, "ease-out");
        F.chip(1, 2.8);
        F.notch(1, 3.25, 0.2);
      }
      if (Sp) {
        F.block(2, 3.6);
        F.block(2, 4.5, false);
        F.cap(3.8, 4.5, "A full account is skipped.");
      }
      if (Wk) {
        F.chip(1, 3.8);
        F.notch(1, 4.25, 0.2);
      }
      F.fork(c1, 4.6);
      F.seam(5.4);
      return F;
    },
    limit(stage, { lanes, policy }) {
      const {
        wait: Wm,
        under: K,
        at: Ap,
      } = policy ?? {
        wait: 15,
        under: 200,
        at: 90,
      };
      const [Wa, Pa] = lanes;
      const F = layout(stage, "limit", [
        { lane: Wa, fill: 0.85, clock: "resets 12m" },
        { lane: Pa, fill: 0.2, clock: "resets 4h 25m" },
      ]);
      const { tl, mk, eo, rc } = F;
      const [Wk, Pe] = F.L;
      const tc = Math.min(
        1.5,
        Math.max(0.1, ((Math.min(Ap, 100) / 100 - 0.85) / 0.15) * 1.6)
      );
      Wk.tf.to(0, "scaleX(1)", 1.6, "linear");
      Wk.f = 1;
      F.pulse(0, 1.6);
      F.cap(tc, 1.95, "Summary written early, while the cache is warm.");
      const scenes = [
        { t0: 2.0, t1: 3.4, w: 12, tok: 180 },
        { t0: 3.4, t1: 5.2, w: 120, tok: 180 },
        { t0: 5.2, t1: 7.0, w: 120, tok: 412 },
      ];
      const s0 = F.slot(0, 0);
      const s1 = F.slot(0, 1);
      const p0 = F.slot(1, 0);
      const p1 = F.slot(1, 1);
      const dyY = p0.y - s0.y;
      const clocks: [number, number, (t: number) => string][] = [
        [0, 2.0, () => "resets 12m"],
      ];
      const at = (x: number, y: number, more = "") =>
        `translate(${x}px,${y}px)${more ? ` ${more}` : ""}`;
      /** What the policy does with a scene: a reset close enough is waited for, a small conversation moves whole. */
      const branchOf = (q: (typeof scenes)[number]) => {
        if (q.w <= Wm) {
          return "wait";
        }
        return q.tok <= K ? "move" : "summary";
      };
      scenes.forEach((q, qi) => {
        const { t0, t1 } = q;
        const first = qi === 0;
        const last = qi === scenes.length - 1;
        const capEnd = last ? 99 : t1 - 0.1;
        const branch = branchOf(q);
        const wrap = F.el("", "left:0;top:0;width:0;height:0", F.dy);
        const ch = F.el(
          "chip",
          `--c:${Wa.color};transform:${at(s0.x - 5, s0.y - 5)}`,
          wrap
        );
        const tg = F.el("tag", `transform:${at(s0.x - 8, s0.y + 8)}`, wrap);
        tg.textContent = `${q.tok}k`;
        const dc = F.el("doc", `transform:${at(s1.x - 5, s1.y - 6)}`, wrap);
        // Each branch's pieces show for its window; the last branch is the
        // still frame, so it stays.
        const op = tl.tr(wrap, "opacity", first ? "1" : "0");
        if (!first) {
          op.to(t0 - 0.05, "1", 0.25, "ease-out");
        }
        if (!last) {
          op.to(t1 - 0.2, "0", 0.2, "ease-out");
        }
        const tch = tl.tr(ch, "transform", at(s0.x - 5, s0.y - 5));
        const tdc = tl.tr(
          dc,
          "transform",
          at(s1.x - 5, s1.y - 6, `scale(${first ? 0.4 : 1})`)
        );
        const odc = tl.tr(dc, "opacity", first ? "0" : "1");
        if (first) {
          odc.to(tc, "1", 0.3, "ease-out");
          tdc.to(tc, at(s1.x - 5, s1.y - 6, "scale(1)"), 0.5, mk);
        } else {
          Wk.tf.to(t0 - 0.05, "scaleX(1)", 0.25, mk);
          Pe.tf.to(t0 - 0.05, "scaleX(.2)", 0.25, mk);
        }
        if (branch === "wait") {
          F.cap(t0 + 0.1, capEnd, `Waits ${q.w}m for the window to reset`);
          clocks.push([
            t0,
            t1,
            (t) => {
              if (t < t0 + 0.1) {
                return `resets ${q.w}m`;
              }
              return t < t0 + 0.9
                ? `resets ${mins(q.w * (1 - (t - t0 - 0.1) / 0.8))}`
                : "resets 5h";
            },
          ]);
          Wk.tf.to(t0 + 0.9, "scaleX(.06)", 0.4, eo);
          tch
            .to(t0 + 1.0, at(s0.x - 5, s0.y - 5, "scale(1.25)"), 0.15, mk)
            .to(t0 + 1.15, at(s0.x - 5, s0.y - 5, "scale(1)"), 0.3, mk);
          odc.to(t0 + 1.0, "0", 0.3, "ease-out");
        } else if (branch === "move") {
          F.cap(t0 + 0.1, capEnd, "Moves the whole conversation");
          clocks.push([t0, t1, () => `resets ${mins(q.w)}`]);
          tch.to(t0 + 0.2, at(s0.x - 5, s0.y - 5 + dyY), 0.7, mk);
          tl.tr(ch, "backgroundColor", rc(Wa.color)).to(
            t0 + 0.5,
            rc(Pa.color),
            0.3,
            "ease-out"
          );
          tdc.to(t0 + 0.26, at(s1.x - 5, s1.y - 6 + dyY), 0.7, mk);
          const tg2 = F.el(
            "tag",
            `transform:${at(s0.x - 8, s0.y + 8 + dyY)}`,
            wrap
          );
          tg2.textContent = `re-read ${q.tok}k`;
          tl.tr(tg, "opacity", "1").to(t0 + 0.15, "0", 0.2, "ease-out");
          tl.tr(tg2, "opacity", "0").to(t0 + 0.8, "1", 0.3, "ease-out");
          Pe.tf.to(
            t0 + 0.85,
            `scaleX(${Math.min(1, 0.2 + q.tok * 0.0016)})`,
            0.5,
            mk
          );
        } else {
          F.cap(t0 + 0.1, capEnd, "Continues from a summary");
          clocks.push([t0, t1, () => `resets ${mins(q.w)}`]);
          tdc.to(t0 + 0.2, at(p0.x - 5, p0.y - 6), 0.7, mk);
          const nc = F.el(
            "chip",
            `--c:${Pa.color};transform:${at(p1.x - 5, p1.y - 5, "scale(.4)")}`,
            wrap
          );
          tl.tr(nc, "opacity", "0").to(t0 + 0.8, "1", 0.25, "ease-out");
          tl.tr(nc, "transform", at(p0.x - 5, p0.y - 5, "scale(.4)")).to(
            t0 + 0.8,
            at(p1.x - 5, p1.y - 5, "scale(1)"),
            0.6,
            mk
          );
          tl.tr(ch, "opacity", "1").to(t0 + 0.8, ".35", 0.3, "ease-out");
          const tg2 = F.el("tag", `transform:${at(s0.x - 8, s0.y + 8)}`, wrap);
          tg2.textContent = `${q.tok}k stays on ${Wa.name}`;
          tl.tr(tg, "opacity", "1").to(t0 + 0.75, "0", 0.2, "ease-out");
          tl.tr(tg2, "opacity", "0").to(t0 + 0.9, "1", 0.3, "ease-out");
          Pe.tf.to(t0 + 0.95, "scaleX(.28)", 0.5, mk);
        }
      });
      Wk.f0 = 0.85;
      Pe.f0 = 0.2;
      tl.text(Wk.ck, (t) => {
        for (const [a, b, f] of clocks) {
          if (t >= a && t < b) {
            return f(t);
          }
        }
        return (clocks.at(-1) as (typeof clocks)[number])[2](t);
      });
      F.seam(7.0, 1.0);
      return F;
    },
  };

/** Builds the figure for `spec` in `stage`, standing at its last frame. */
export function buildFigure(stage: HTMLElement, spec: FigureSpec): Timeline {
  const F = BOARDS[spec.board](stage, spec);
  // As tall as its lanes and its longest caption, which wraps rather than
  // being cut where the stage is narrow.
  const tallest = Math.max(
    CAP_LINE,
    ...[...stage.querySelectorAll<HTMLElement>(".cap")].map(
      (cap) => cap.scrollHeight
    )
  );
  stage.style.height = `${figureHeight(spec.board, spec.lanes.length, Math.ceil(tallest / CAP_LINE))}px`;
  F.tl.rest();
  return F.tl;
}
