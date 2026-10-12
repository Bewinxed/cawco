<script lang="ts">
  /**
   * The composer's recall: what the reader sent in this conversation rolls
   * down into the field as ghost text, on a wheel grown up out of the pill
   * (grown.ts). The row on the field's line is the pick, its words and time
   * in the selected ink; the reader's own draft is the first row, the newest
   * message the next, and older ones stand above, as many as fit under a
   * line half the window's height up on a compact window and 40% up on a
   * wider one, never fewer than five (three on a compact one). Their depth
   * is spread over however many show: each row up leans further back,
   * narrows, softens and fades a touch, evenly, the topmost ending where the
   * fifth row stood before (the third on a compact window): 30° back, 11%
   * narrower, 1.5px soft, at 94%. Every row that stands in the shape is
   * whole and holds 4.5:1; only a row rolling up past the top row goes out
   * of focus and out of sight, through the room over it. Each row stands
   * inside the shape's sides at its height, less the pill's padding; on the
   * field's line it stops short of the pill's buttons, folded into a deck
   * at the trailing end while it is up (Composer), at every frame of the
   * deck's slide (`deck`). Only the rows in the shape, and one past each end
   * of it, are mounted.
   *
   * The draft is the field's own text, not a copy: rolling up, the field's
   * words leave downward as every row leaves the line, and rolling back to
   * the draft brings them back up into place on the same spring (`--roll-y`,
   * `--roll-o` on the field, Composer). An empty draft's row is a hint, and
   * the field's own hint is not drawn while the wheel is up (Composer).
   *
   * It is mounted while it is up. ↑ and ↓ step (the composer hands it its
   * keys, `key`), a scroll or a drag rolls it, Enter takes the pick into
   * the field unsent, mod+Enter sends it as it is, Esc rolls back to the
   * draft (clearing a search first), and ↓ past the draft closes. With the
   * composer empty, typing searches what was sent (recall.ts) and the best
   * match lands on the line. On a touch screen a held press or a swipe up
   * brings it up under the finger and drags it (`follow`, `release`); a tap
   * on a row takes it, and a tap anywhere else puts it away.
   *
   * It rolls on the app's 0.3s glide spring, critically damped (the tab
   * track's, fluid-tabs/TabsList), and every entry it lands on is a detent
   * the reader hears and feels (feel.svelte.ts). Its sizes are read once,
   * by the composer before it opens (grown.ts `measureShape`), and the
   * shape's sides are its own outline's arithmetic; a frame only writes.
   * With reduced motion it steps without rolling and stands up without
   * growing, with the same outcomes.
   */
  import { onMount, tick, untrack } from "svelte";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { IconSearch } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { felt } from "../feel.svelte";
  import {
    GrownShape,
    type LineBox,
    type ShapeSize,
    type ViewBox,
  } from "./grown";
  import { marked, oneLine, type Part, type Sent, SentIndex } from "./recall";

  let {
    shell,
    field,
    measured,
    deck,
    draft,
    id,
    sent,
    more,
    older,
    keys,
    queuedWord,
    active = $bindable(),
    ontake,
    onback,
    ondone,
  }: {
    /** The box the shape and the rows stand in, the pill at its foot. */
    shell: HTMLElement;
    /** The field's box: its text is the draft's row. */
    field: HTMLElement;
    /**
     * The composer's sizes and its field, read by the composer before it
     * wrote anything for the wheel (grown.ts `measureShape`).
     */
    measured: { size: ShapeSize; line: LineBox; view: ViewBox };
    /**
     * Where the deck of the pill's buttons starts this frame (from the
     * shell's inline start), and whether it has stopped sliding.
     */
    deck: () => { at: number; still: boolean };
    /** The composer's text when it came up: the first row. */
    draft: string;
    /** The list's id; each row's is the list's and its place. */
    id: string;
    /** What was sent here, newest first. */
    sent: Sent[];
    /** Older history exists that is not read yet. */
    more: boolean;
    /** Reads the next older page. */
    older: () => void;
    /** Keys reach it from the field; a held press leaves the keyboard down. */
    keys: boolean;
    /** What a queued send is called on this harness, if anything. */
    queuedWord?: string;
    /** The row on the line, for the field's `aria-activedescendant`. */
    active?: string;
    /**
     * The pick goes into the field (`send`: and is sent as it is). Resolves
     * to the pill's height once the field has fitted the pick.
     */
    ontake: (text: string, send: boolean) => Promise<number>;
    /** Back to the draft, as it was. */
    onback: () => void;
    /** Folded away: the composer can let it go. */
    ondone: (send: boolean) => void;
  } = $props();

  /**
   * A compact window (DESIGN.md: narrower than 640px, or a coarse pointer
   * narrower than the drawer's line): a phone.
   */
  const COMPACT =
    "(max-width: 639px), (pointer: coarse) and (max-width: 899px)";
  /** How far up the window the shape's top reaches, as a share of its height. */
  const REACH = { compact: 0.5, wide: 0.4 } as const;
  /**
   * The rows the depth ends at, and the fewest that stand above the line:
   * five, three on a compact window (as many as stood there before).
   */
  const DEPTH_ROWS = { compact: 3, wide: 5 } as const;
  /**
   * How many rows stand above the line, read once as it opens: as many as
   * fit under the reach, never fewer than `depthRows`. A taller draft stands
   * the shape that much higher, and the rows fill the rest.
   */
  let above = 3;
  let depthRows: number = DEPTH_ROWS.compact;
  /** Each depth row's share of the top row's depth: lean (deg), narrowing, softness (px), fading. */
  const LEAN = 6;
  const NARROW = 0.022;
  const SOFT = 0.3;
  const FAINT = 0.015;
  /** The rows' perspective (px), from the line's foot at the shape's middle. */
  const DEPTH = 900;
  /** The tab track's glide: critically damped at a 0.3s response. */
  const GLIDE = 0.3;
  const STIFFNESS = ((2 * Math.PI) / GLIDE) ** 2;
  const DAMPING = (4 * Math.PI) / GLIDE;

  /** One row on the wheel: the draft, a send, or the line that says there is none. */
  interface Row {
    entry?: Sent;
    key: string;
    kind: "draft" | "sent" | "none";
    parts?: Part[];
  }

  // Held from the moment it opens: an older page read while it is up adds
  // to the end, so the rows above the line never shift under the reader.
  let entries = $state<Sent[]>(untrack(() => [...sent]));
  const index = untrack(() => new SentIndex(entries));
  $effect(() => {
    const known = new Set(entries.map((entry) => entry.id));
    const last = entries.at(-1)?.at ?? Number.POSITIVE_INFINITY;
    const fresh = sent.filter(
      (entry) => !known.has(entry.id) && (entry.at ?? 0) <= last
    );
    if (fresh.length > 0) {
      entries = [...entries, ...fresh];
      index.add(fresh);
    }
  });

  let query = $state("");
  /** An empty composer searches as the reader types; a draft takes the keys back. */
  const typing = untrack(() => draft === "");

  const rows = $derived.by((): Row[] => {
    const q = query.trim();
    if (q) {
      const found = index.search(q).map(
        ({ entry, terms }): Row => ({
          key: entry.id,
          kind: "sent",
          entry,
          parts: marked(oneLine(entry.text), terms),
        })
      );
      return found.length ? found : [{ key: "none", kind: "none" as const }];
    }
    const own: Row[] = [
      { key: "draft", kind: "draft" },
      ...entries.map((entry): Row => ({ key: entry.id, kind: "sent", entry })),
    ];
    return entries.length || more
      ? own
      : [...own, { key: "none", kind: "none" }];
  });
  /**
   * The rows mounted, by place: those the shape holds where the roll
   * stands, and two past each end of it, so a roll never draws a row that
   * is not there yet. Moved as the roll crosses a row (`draw`).
   */
  let span = $state({ from: 0, to: 0 });
  const mounted = $derived(
    rows
      .slice(span.from, span.to + 1)
      .map((entry, i) => ({ entry, k: span.from + i }))
  );
  /** How many rows can be picked: the line never rests on "none". */
  const pickable = $derived(rows.filter((each) => each.kind !== "none").length);
  const last = () => Math.max(0, pickable - 1);
  const clamp = (v: number) => Math.max(0, Math.min(last(), v));
  /** Past either end it gives a third of the way, as a scroll view does. */
  const soft = (v: number) => {
    if (v < 0) {
      return v * 0.35;
    }
    return v > last() ? last() + (v - last()) * 0.35 : v;
  };

  let ghosts = $state<HTMLElement>();
  let chipWidth = $state(0);
  /** The row on the line. */
  let pick = $state(0);
  $effect(() => {
    active = `${id}-${pick}`;
  });

  let pos = 0;
  let target = 0;
  let speed = 0;
  let frame = 0;
  let lastAt = 0;
  let detent: number | null = null;
  let closing = false;
  let shape: GrownShape | null = null;
  /** Sizes, read once as it opens. */
  let row = $state(0);
  let box = $state({ bottom: 0, width: 0, height: 0 });
  /**
   * The room over the top row a row rolling past it goes out of sight
   * through: the shape's headroom and the pill's sill. A row standing in
   * the shape is never in it.
   */
  let band = 1;
  /** The blur a row has as it leaves the band's top (px). */
  let haze = 0;
  /** A row's room above and below its words (px). */
  let inkPad = 1;
  /** Where the deck starts this frame, read once per frame. */
  let deckEdge = Number.POSITIVE_INFINITY;
  /** Called once the roll stands still (back to the draft, then close). */
  let settled: (() => void) | null = null;

  /** The room over the top row, grown. */
  let headroom = 0;
  /** The pill's own room over the field: from the field's top to the pill's edge. */
  let sill = 0;
  /** How far above the pill the shape reaches: what the rows need, never less than one. */
  const extFor = () => {
    const tall = query.trim()
      ? Math.min(Math.max(pickable - 1, 1), above)
      : above;
    return tall * row + headroom + sill;
  };

  /**
   * The draft's row is the field's own text, every line of it: it is as
   * tall as the field. An empty draft's row is its hint, one row.
   */
  const ownText = untrack(() => draft !== "");
  const draftTall = () => (ownText ? measured.line.height : row);
  /** How far up the line's foot row `k`'s foot stands with the roll at 0. */
  const rest = (k: number) => (k === 0 ? 0 : draftTall() + (k - 1) * row);
  /** How far the rows have rolled down past the line's foot, the roll at `p`. */
  function rolled(p: number): number {
    if (p <= 0) {
      return p * row;
    }
    return p <= 1 ? p * draftTall() : draftTall() + (p - 1) * row;
  }

  /**
   * How deep a row `up` rows above the line stands: 0 on the line, 1 at
   * the top row the shape holds and past it, evenly between.
   */
  const depthOf = (up: number) => Math.min(1, Math.max(0, up) / above);
  /**
   * How strongly a row shows: at full strength on the line, a touch fainter
   * by its depth (never below 4.5:1 for its age's muted ink: the top row at
   * what the fifth stood at before, 94%), and gone as it leaves `off` rows
   * below the line.
   */
  function presence(up: number, off: number): number {
    if (off < 0) {
      return Math.max(0, 1 + off * 1.6);
    }
    return 1 - FAINT * Math.min(depthRows, 4) * depthOf(up);
  }

  /**
   * How far over the line's foot the top of a row whose foot stands `y` px
   * over it is drawn, leaning back `lean` degrees and narrowed to `s` about
   * its foot: its top leans away, and the perspective draws it lower.
   */
  function topOf(y: number, lean: number, s: number): number {
    const th = (lean * Math.PI) / 180;
    const tall = row * s;
    return ((y + tall * Math.cos(th)) * DEPTH) / (DEPTH + tall * Math.sin(th));
  }

  /**
   * The inline insets of a row whose foot stands `y` px over the line's
   * foot, whose top is drawn `top` px over it and which is narrowed to `s`
   * about its middle: inside the shape's sides at the row's middle as it is
   * drawn, less the pill's padding. On the field's line it stops a step
   * short of the buttons' deck, where the deck is this frame, and of a
   * search's chip.
   */
  function edges(y: number, top: number, s: number): [number, number] {
    const { line, size } = measured;
    const pad = line.left;
    const half = size.w / 2;
    const inset = shape?.inset(line.bottom + (y + top) / 2) ?? 0;
    const side = Math.max(pad, half - (half - inset - pad) / s);
    // While its words stand beside the deck (the deck is a row tall, on the
    // line) a row stops short of it whole; its words clear of the deck's
    // top, it widens to the shape's side as its foot reaches it.
    const onLine = Math.min(1, Math.max(0, (row - y) / inkPad));
    if (onLine === 0) {
      return [side, side];
    }
    const gap = size.headroom;
    let stop = size.w - deckEdge + gap;
    if (query.trim()) {
      stop = Math.max(
        stop,
        size.w - (line.left + line.width - chipWidth) + gap
      );
    }
    return [side, side + Math.max(0, stop - side) * onLine];
  }

  /** Places row `k` where the roll has it. Writes only. */
  function place(node: HTMLElement, k: number): void {
    // The rows over the one on the line stand from the pill's top edge,
    // never across it: the pill comes back under them as it folds.
    const y = rest(k) - rolled(pos) + sill * Math.min(1, Math.max(0, k - pos));
    const off = k - pos;
    if (y > box.height || off < -1.2) {
      node.style.visibility = "hidden";
      return;
    }
    node.style.visibility = "visible";
    const up = Math.max(0, y / row);
    const depth = depthOf(up) * depthRows;
    const lean = depth * LEAN;
    const s = 1 - depth * NARROW;
    node.style.translate = `0 ${(-y).toFixed(2)}px`;
    node.style.rotate = `x ${lean.toFixed(3)}deg`;
    node.style.scale = s.toFixed(4);
    const top = topOf(y, lean, s);
    const [start, end] = edges(y, top, s);
    node.style.left = `${start}px`;
    node.style.right = `${end}px`;
    // A row rolling up past the top row leaves through the room over it,
    // by its top: whole while it stands in the shape, gone as it reaches the
    // edge, so the edge never cuts a row that can be seen.
    const clear = Math.min(1, Math.max(0, (box.height - top) / band));
    node.style.opacity = String(presence(up, off) * clear);
    const softness = depth * SOFT + haze * (1 - clear);
    // Blurred only where it is soft at all: the line's row draws no filter.
    const blur = softness > 0.005 ? `blur(${softness.toFixed(2)}px)` : "";
    if (node.style.filter !== blur) {
      node.style.filter = blur;
    }
  }

  /**
   * The field's text as the draft's row: down by as far as the rows have
   * rolled past it, leaving as a row leaves; home and untouched at 0.
   */
  function placeDraft(): void {
    if (!ownText) {
      return;
    }
    if (pos === 0) {
      field.style.removeProperty("--roll-y");
      field.style.removeProperty("--roll-o");
      return;
    }
    field.style.setProperty("--roll-y", `${rolled(pos).toFixed(2)}px`);
    field.style.setProperty("--roll-o", String(presence(0, -Math.max(0, pos))));
  }

  /** The roll stands at `at`, and aims there. */
  function stand(at: number): void {
    pos = at;
    target = at;
  }

  /** Places every row, and the draft, where the roll and the deck have them. */
  function placeAll(): void {
    placeRows();
    placeDraft();
  }

  /** Places every row where the roll and the deck have it. Writes only. */
  function placeRows(): void {
    deckEdge = deck().at;
    for (const node of ghosts?.children ?? []) {
      const el = node as HTMLElement;
      place(el, Number(el.dataset.k));
    }
  }

  /** The row standing at place `k`, if it is mounted. */
  const rowAt = (k: number) =>
    ghosts?.querySelector<HTMLElement>(`[data-k="${k}"]`) ?? undefined;

  /**
   * While the deck slides (folding in as it opens, fanning out as it folds),
   * the rows follow its edge every frame, whether or not the roll moves.
   * The draft is the roll's alone: a pick taken has let go of it.
   */
  let deckFrame = 0;
  function followDeck(): void {
    cancelAnimationFrame(deckFrame);
    const trail = () => {
      placeRows();
      deckFrame = deck().still ? 0 : requestAnimationFrame(trail);
    };
    deckFrame = requestAnimationFrame(trail);
  }

  /** Places every row and the draft, and keeps the pick. Writes only. */
  function draw(): void {
    // The rows the shape holds where the roll stands, and two past each end.
    const from = Math.max(0, Math.floor(pos) - 2);
    const to = Math.ceil(pos) + above + 2;
    if (from !== span.from || to !== span.to) {
      span = { from, to };
    }
    placeAll();
    if (closing) {
      return;
    }
    const k = clamp(Math.round(pos));
    if (k !== detent) {
      // A detent the reader feels; overshooting past an end is not one.
      if (detent !== null && pickable > 0 && Math.round(pos) === k) {
        felt("detent", k > detent ? "older" : "newer");
      }
      detent = k;
      pick = k;
    }
    // Nearing the oldest row read so far, the page before it is read.
    const fit = Math.ceil(box.height / row) + 1;
    if (more && target >= pickable - fit && !query.trim()) {
      older();
    }
  }

  /** Rolls toward the nearest row to `target` on the glide spring. */
  /** The first time the roll stands still: the shape's drop and blur may come in. */
  let rested: (() => void) | null = null;
  function atRest(): void {
    rested?.();
    rested = null;
  }

  function roll(): void {
    cancelAnimationFrame(frame);
    if (!motionOk.current) {
      stand(clamp(Math.round(target)));
      draw();
      settled?.();
      atRest();
      return;
    }
    lastAt = 0;
    const step = (now: number) => {
      const dt = lastAt ? Math.min(0.032, (now - lastAt) / 1000) : 1 / 60;
      lastAt = now;
      const goal = clamp(Math.round(target));
      speed += (STIFFNESS * (goal - pos) - DAMPING * speed) * dt;
      pos += speed * dt;
      if (Math.abs(goal - pos) < 0.002 && Math.abs(speed) < 0.05) {
        stand(goal);
        speed = 0;
        draw();
        settled?.();
        atRest();
        return;
      }
      draw();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  /** Rolls to row `k`: a move of the reader's, so a pending close is off. */
  function spinTo(k: number): void {
    settled = null;
    target = clamp(k);
    roll();
  }

  async function setQuery(next: string): Promise<void> {
    query = next;
    await tick();
    // The best match lands on the line; with no query, the newest message.
    detent = null;
    stand(clamp(query.trim() ? 0 : 1));
    speed = 0;
    draw();
    // The shape keeps only the room the matches need, and the rows stand
    // up to its top.
    const ext = extFor();
    if (shape && ext !== shape.ext) {
      box.height = shape.base + ext - measured.line.bottom;
      shape.morphTo(1, ext, dur("--dur-fade"));
    }
  }

  /** Rolls back to the draft; resolves once it stands there. */
  function rollHome(): Promise<void> {
    if (pos === 0 && speed === 0) {
      return Promise.resolve();
    }
    return new Promise((done) => {
      settled = done;
      target = 0;
      roll();
    });
  }

  /**
   * Folds away. `text`: the pick goes into the field (and is sent, `andSend`);
   * none: back to the draft, as it was.
   */
  async function close(text?: string, andSend = false): Promise<void> {
    if (closing) {
      return;
    }
    closing = true;
    settled = null;
    const line = rowAt(Math.round(pos));
    let base = shape?.base;
    let home = Promise.resolve();
    if (text === undefined) {
      onback();
      followDeck();
      felt("close");
      // The draft rolls home on the wheel's own spring as the shape folds.
      home = rollHome();
    } else {
      cancelAnimationFrame(frame);
      // The ghost on the line becomes the field's own text.
      if (line && motionOk.current) {
        await line.animate([{ opacity: line.style.opacity }, { opacity: 1 }], {
          duration: dur("--dur-control"),
          fill: "forwards",
        }).finished;
      }
      field.style.removeProperty("--roll-y");
      field.style.removeProperty("--roll-o");
      const fitted = ontake(text, andSend);
      followDeck();
      // The field's text stands where the ghost stood: the ghost blurs out
      // over it, so what they share reads as one and only the rest (a
      // longer pick's further lines, flattened onto the row) dissolves.
      if (line && motionOk.current) {
        const blur = getComputedStyle(shell).getPropertyValue(
          "--c-recall-cross-blur"
        );
        line.animate(
          [
            { opacity: 1, filter: "blur(0)" },
            { opacity: 0, filter: `blur(${blur})` },
          ],
          {
            duration: dur("--dur-fade"),
            easing: ease("--ease-out"),
            fill: "forwards",
          }
        );
      } else if (line) {
        line.style.visibility = "hidden";
      }
      base = await fitted;
    }
    // It folds back into the pill it came out of, the rows inside it,
    // fading as they go, its foot on the pill as the field fits.
    if (ghosts && motionOk.current) {
      ghosts.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-fade"),
        fill: "forwards",
      });
    }
    if (shape) {
      await Promise.all([
        shape.morphTo(0, shape.ext, dur("--dur-grow-exit"), base),
        home,
      ]);
    }
    ondone(andSend);
  }

  /** Takes the row on the line. */
  function take(andSend: boolean): void {
    const chosen = rows[Math.round(pos)];
    if (!chosen || chosen.kind === "none") {
      return;
    }
    if (chosen.kind === "draft") {
      close();
    } else {
      close(chosen.entry?.text, andSend);
    }
  }

  /** Rolls back to the draft and closes there; from a search, closes at once. */
  export function back(): void {
    if (closing) {
      return;
    }
    if (query || Math.round(pos) === 0) {
      close();
      return;
    }
    spinTo(0);
    settled = () => close();
  }

  /**
   * A key from the field. True when the wheel took it; a key it leaves goes
   * on to the field (typing into a draft of your own goes back to it).
   */
  export function key(event: KeyboardEvent): boolean {
    if (closing) {
      // Folding away, the field already holds what it keeps, and takes
      // keys as usual.
      return false;
    }
    // Rolling back to the draft after Esc, any other key means the reader
    // changed their mind: it stays up instead of closing where it stops.
    // (A search changes the rows without a roll, so this is not left to spinTo.)
    if (event.key !== "Escape") {
      settled = null;
    }
    if (event.key === "ArrowUp") {
      spinTo(Math.round(target) + 1);
    } else if (event.key === "ArrowDown") {
      if (!query && Math.round(target) <= 0) {
        close();
      } else {
        spinTo(Math.round(target) - 1);
      }
    } else if (event.key === "Enter") {
      take(event.metaKey || event.ctrlKey);
    } else if (event.key === "Escape") {
      if (query) {
        setQuery("");
      } else {
        back();
      }
    } else if (!typed(event)) {
      return false;
    }
    event.preventDefault();
    return true;
  }

  /**
   * Typing while it is up: into an empty composer it searches; into a draft
   * of your own it goes back to the draft, the key landing where the caret
   * was. False when the key goes on to the field.
   */
  function typed(event: KeyboardEvent): boolean {
    const printable =
      event.key.length === 1 &&
      !(event.ctrlKey || event.metaKey || event.altKey);
    if (event.isComposing || !typing) {
      if (event.isComposing || printable || event.key === "Backspace") {
        close();
        return false;
      }
    } else if (printable) {
      setQuery(query + event.key);
    } else if (event.key === "Backspace" && query) {
      setQuery(query.slice(0, -1));
    }
    return true;
  }

  /** A held press dragged `dy` px from where the wheel came up under it. */
  export function follow(dy: number): void {
    if (closing) {
      return;
    }
    settled = null;
    cancelAnimationFrame(frame);
    // Dragging down pulls older messages down into the field.
    stand(soft(1 + dy / row));
    draw();
  }

  /** The press lifted, moving at `speedAt` px a ms: the wheel stays up. */
  export function release(speedAt: number): void {
    target = clamp(Math.round(pos + speedAt * 6));
    roll();
  }

  function onwheel(event: WheelEvent): void {
    event.preventDefault();
    if (closing) {
      return;
    }
    settled = null;
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= row;
    }
    target = Math.max(
      -0.4,
      Math.min(last() + 0.4, target + (delta / row) * 0.5)
    );
    roll();
  }

  let dragging = false;
  let dragY = 0;
  let dragAt = 0;
  let flick = 0;
  function ondown(event: PointerEvent): void {
    dragging = true;
    dragY = event.clientY;
    dragAt = performance.now();
    flick = 0;
    ghosts?.setPointerCapture(event.pointerId);
  }
  function onmove(event: PointerEvent): void {
    if (!dragging || closing) {
      return;
    }
    const dy = event.clientY - dragY;
    const now = performance.now();
    flick = dy / Math.max(1, now - dragAt);
    dragY = event.clientY;
    dragAt = now;
    cancelAnimationFrame(frame);
    stand(soft(pos + dy / row));
    draw();
  }
  function onup(): void {
    if (!dragging) {
      return;
    }
    dragging = false;
    release(flick);
  }

  /**
   * A press on the grown shape around the rows rolls the wheel as a press
   * on the rows does: the drag is captured onto them from here on.
   */
  export function grab(event: PointerEvent): void {
    if (!closing) {
      ondown(event);
    }
  }

  function pickRow(k: number): void {
    if (closing || rows[k]?.kind === "none") {
      return;
    }
    if (Math.round(pos) === k) {
      take(false);
    } else {
      spinTo(k);
    }
  }

  // Rows that come or go (a search, an older page, the roll crossing into
  // rows not mounted yet) are placed in the frame they are drawn.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — the rows mounted are drawn where the roll stands
    void mounted;
    if (row > 0) {
      untrack(draw);
    }
  });

  onMount(() => {
    const { size, line, view } = measured;
    ({ row, headroom } = size);
    sill = Math.max(0, size.base - line.bottom - line.height);
    band = Math.max(1, headroom + sill);
    const compact = matchMedia(COMPACT).matches;
    depthRows = compact ? DEPTH_ROWS.compact : DEPTH_ROWS.wide;
    // As many rows over the line as stand under the reach: the shape's top
    // at that share of the window's height up from its foot.
    const reach = view.height * (1 - (compact ? REACH.compact : REACH.wide));
    const room = view.bottom - reach - size.base - headroom - sill;
    above = Math.max(depthRows, Math.floor(room / row));
    span = { from: 0, to: above + 3 };
    // Solid to its edge: nothing behind it shows through. Its shoulders
    // curve in as far as the depth's top row narrows, however tall it is.
    shape = new GrownShape(shell, size, extFor(), {
      fade: false,
      taperRows: depthRows,
    });
    haze = Number.parseFloat(
      getComputedStyle(shell).getPropertyValue("--c-head-fade-blur")
    );
    const first = ghosts?.firstElementChild;
    if (first) {
      inkPad = Math.max(
        1,
        Number.parseFloat(getComputedStyle(first).paddingTop)
      );
    }
    // The rows stand from the field's line up to the shape's top, across it.
    box = {
      bottom: line.bottom,
      width: size.w,
      height: size.base + shape.ext - line.bottom,
    };
    if (ghosts) {
      shape.clip(ghosts, () => ({ left: 0, ...box }));
    }
    draw();
    followDeck();
    if (keys) {
      felt("open");
    }
    ghosts?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      easing: ease("--ease-out"),
    });
    // Its drop and its far edge's blur come in once the rows stand still too.
    shape.settleAfter(
      new Promise((done) => {
        rested = done;
      })
    );
    shape.morphTo(1, shape.ext, dur("--dur-grow"));
    // The newest message rolls down into the field as it grows.
    spinTo(1);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(deckFrame);
      field.style.removeProperty("--roll-y");
      field.style.removeProperty("--roll-o");
      shape?.remove();
    };
  });

  /** What a send's row says after its words: its state, then its age. */
  const meta = (entry: Sent | undefined): string => {
    if (!entry) {
      return "";
    }
    let state: string | undefined;
    if (entry.state === "pending") {
      state = queuedWord;
    } else if (entry.state === "failed" || entry.state === "unreached") {
      state = "Not sent";
    }
    const age = entry.at === null ? "" : formatAgeShort(entry.at);
    return [state, age].filter(Boolean).join(" · ");
  };
</script>

<!-- The field keeps focus and points at the row on the line
     (aria-activedescendant): the list and its rows are never focused. -->
<div
  aria-label="What you sent here"
  class="ghosts"
  {id}
  onpointercancel={onup}
  onpointerdown={ondown}
  onpointermove={onmove}
  onpointerup={onup}
  {onwheel}
  role="listbox"
  tabindex="-1"
  bind:this={ghosts}
  style:bottom="{box.bottom}px"
  style:height="{box.height}px"
  style:perspective="{DEPTH}px"
  style:width="{box.width}px"
>
  {#each mounted as { entry, k } (entry.key)}
    <!-- The keys are the field's (↑ ↓ Enter); a click is the pointer's way
         to the same pick. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- biome-ignore lint/a11y/useKeyWithClickEvents: the field owns the keys for every row (aria-activedescendant) -->
    <div
      aria-selected={k === pick}
      class="ghost"
      data-k={k}
      id="{id}-{k}"
      onclick={() => pickRow(k)}
      role="option"
      tabindex="-1"
      class:draft={entry.kind === "draft"}
      class:none={entry.kind === "none"}
      class:own={entry.kind === "draft" && ownText}
    >
      <span class="t">
        {#if entry.kind === "none"}
          {query.trim()
            ? "Nothing you sent here matches"
            : "Nothing sent here yet"}
        {:else if entry.kind === "draft"}
          {#if draft}
            {oneLine(draft)}
          {:else}
            <span class="hint">Your draft · type to search</span>
          {/if}
        {:else if entry.parts}
          {#each entry.parts as part, p (p)}
            {#if part.mark}
              <mark>{part.text}</mark>
            {:else}
              {part.text}
            {/if}
          {/each}
        {:else}
          {oneLine(entry.entry?.text ?? "")}
        {/if}
      </span>
      <span class="m num">{meta(entry.entry)}</span>
    </div>
  {/each}
</div>
{#if query.trim()}
  <div
    class="chip-line"
    style:bottom="{box.bottom}px"
    style:height="{row}px"
    style:left="{measured.line.left}px"
    style:width="{measured.line.width}px"
  >
    <span class="qchip" bind:offsetWidth={chipWidth}>
      <IconSearch aria-hidden="true" />
      <span class="q">{query}</span>
      <span class="n num">{rows[0]?.kind === "none" ? 0 : pickable}</span>
    </span>
  </div>
{/if}

<style>
  /* The rows stand on the field's line and above it to the shape's top,
     across the shape, each one row tall, set as the field sets its text.
     Each one blurs and fades out on its own through the band at the
     shape's top (`place`), so none is cut through, in every engine. Each
     row's inline edges are the roll's. */
  .ghosts {
    position: absolute;
    z-index: 3;
    inset-inline-start: 0;
    overflow: hidden;
    perspective-origin: 50% 100%;
    touch-action: none;
    user-select: none;
    cursor: ns-resize;
  }
  .ghost {
    position: absolute;
    bottom: 0;
    height: var(--c-composer-field);
    padding-block: calc((var(--c-composer-field) - 1lh) / 2);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--space-3);
    align-items: baseline;
    font-family: var(--font-body);
    font-size: 16px;
    line-height: var(--leading-ui);
    color: var(--ink-strong);
    transform-origin: 50% 100%;
    will-change: translate, rotate, scale, opacity;
    /* Drawn where the roll puts it, once it has a place. */
    visibility: hidden;
    cursor: pointer;
    transition: color var(--dur-control) var(--ease-out);
  }
  .t {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .m {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    white-space: nowrap;
    transition: color var(--dur-control) var(--ease-out);
  }
  /* A draft of your own is drawn by the field itself (its row is read
     out, not drawn twice). */
  .own,
  .own .m {
    color: transparent;
  }
  /* The pick: what sits on the field's line, what Enter or a tap takes,
     its words and its time in the selected ink. The reader's own draft on
     the line is not a pick and keeps the field's ink. */
  .ghost[aria-selected="true"]:not(.draft, .none),
  .ghost[aria-selected="true"]:not(.draft) .m {
    color: var(--selected-ink);
  }
  .hint {
    color: var(--ink-subtle);
  }
  .none .t {
    color: var(--ink-muted);
  }
  mark {
    background: var(--selection);
    color: inherit;
    border-radius: var(--radius-hair);
  }
  /* The query, on the field's line at its end, wherever the rows roll. */
  .chip-line {
    position: absolute;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    pointer-events: none;
  }
  .qchip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 45%;
    padding: calc(var(--space-1) / 2) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    font-size: var(--text-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    white-space: nowrap;

    & :global(svg) {
      flex: none;
      inline-size: var(--icon-sm);
      block-size: var(--icon-sm);
      color: var(--ink-muted);
    }
  }
  .q {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n {
    color: var(--ink-muted);
  }
</style>
