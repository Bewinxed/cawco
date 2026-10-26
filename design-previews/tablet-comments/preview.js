/**
 * The tablet comments preview: the two options for a compact Comments
 * panel on a tablet (report 80d6af29), each drawn from the dashboard's real
 * parts (parts.js, captured by capture/capture.ts) on its own stylesheet
 * (house.css), with the two real comments on the comment-sizing preview
 * (pins.json, read from the hub) over that page in the well.
 *
 * - A: the Comments rail as a strip `--c-comments-compact-w` wide beside the
 *   well, its rows one line; a row pressed stands open and a HangCard hangs
 *   from it, flush with its trailing edge, reaching over the page to the
 *   reading width.
 * - B: nothing docked; the list hangs from the head's trailing glass group,
 *   where Comments stands, as the glass's one card; a row pressed changes
 *   the card in place to its thread (GlassCard's swap), Back changes it back.
 *
 * The motion is the house's, ported line for line: `hang`'s open and close
 * (motion/hang: translate alone under a cut that never moves, --dur-pop in
 * and --dur-exit out on --ease-out, interruptible, the kit's fade under less
 * motion), its neck (HangCard `neckAt`, hang `setNeck`), and GlassCard's
 * swap (the outgoing face lifted out where it stands and faded over
 * --dur-exit, the incoming faded in over --dur-morph on --ease-drawer, the
 * box tweened from its drawn size to its new one over --dur-morph on
 * --ease-drawer, its trailing edge and top held).
 */
import { PARTS } from "./parts.js";
import { mountStateSwitcher } from "./state-switcher.js";

const EXPORT = await (await fetch("./pins.json")).json();
const PINS = EXPORT.pins;
const ROOT = document.documentElement;
const css = () => getComputedStyle(ROOT);
const dur = (name) => Number.parseFloat(css().getPropertyValue(name)) || 0;
const ease = (name) => css().getPropertyValue(name).trim();
const px = (name) => Number.parseFloat(css().getPropertyValue(name)) || 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const motionOk = () => !reduced.matches;

/** Each width's screen: a tablet, its height the screen's less the top bar. */
const SCREENS = { 744: 1133, 820: 1180, 1024: 1366 };
const TOP_BAR = 44;

const RULES = {
  a: "A strip of one-line rows beside the page, 200px. A row pressed stands open and its thread hangs from it as a HangCard: flush with the row's end, reaching over the page to two fifths of it, 280px at least. Another row pressed moves the card to it.",
  b: "Nothing docked: the page keeps its whole width. Comments, in the head's trailing glass group, hangs the list from that group as the glass's card does, three tenths of the page wide (280 to 380px). A row pressed changes the card in place to its thread, two fifths of the page wide; Back changes it back.",
};

/* ── Reading the address: the option and the width are the switcher's
   (named in the address), what stands open the preview's own (`state`, `pin`). ── */
const switcher = mountStateSwitcher({
  // The widest tablet.
  width: 1024,
  axes: true,
  label: "Tablet comments states",
  groups: [
    {
      key: "option",
      label: "Option",
      states: [
        { value: "a", label: "A · A strip, the thread hangs from its row" },
        { value: "b", label: "B · The list hangs from Comments" },
      ],
    },
    {
      key: "width",
      label: "Width",
      initial: "820",
      states: [
        { value: "744", label: "744, iPad mini" },
        { value: "820", label: "820, iPad Air" },
        { value: "1024", label: "1024, iPad Pro" },
      ],
    },
  ],
  onchange: (next) => {
    state.option = next.option;
    state.width = Number(next.width);
    state.shows = "list";
    build();
  },
});
const ask = new URLSearchParams(location.search);
const state = {
  option: switcher.state.option,
  width: Number(switcher.state.width),
  /** What stands: the list (A's strip, B's hung card), a thread, or (B) nothing. */
  shows: ["list", "thread", "none"].includes(ask.get("state"))
    ? ask.get("state")
    : "list",
  pin: Number(ask.get("pin")) || PINS[0].number,
};
const write = () => {
  const url = new URL(location.href);
  url.searchParams.set("state", state.shows);
  if (state.shows === "thread") {
    url.searchParams.set("pin", String(state.pin));
  } else {
    url.searchParams.delete("pin");
  }
  history.replaceState(history.state, "", url);
};

/* ── Parts ────────────────────────────────────────────────────────── */
/** A part's markup as its component drew it, as a fresh element (its first). */
function part(key) {
  const html = PARTS[key];
  if (html === undefined) {
    throw new Error(`no part ${key}`);
  }
  const t = document.createElement("template");
  t.innerHTML = html;
  const first = t.content.firstElementChild;
  if (!first) {
    throw new Error(`part ${key} is empty`);
  }
  return first;
}

/* ── The neck (HangCard `neckAt`, hang `neckCut`/`setNeck`) ───────── */
const flareTail = (flare) => (flare > 0 ? Math.sqrt(2 * flare + 1) : 0);
function neckCut(neck) {
  const tailStart = flareTail(neck.flareStart);
  const tailEnd = flareTail(neck.flareEnd);
  const start =
    neck.flareStart > 0
      ? `arc to ${tailStart}px 0 of ${neck.flareStart + 1}px ccw`
      : "line to 0 0";
  const end =
    neck.flareEnd > 0
      ? `arc to 100% 100% of ${neck.flareEnd + 1}px ccw`
      : "line to 100% 100%";
  return `shape(from 0 100%, ${start}, line to calc(100% - ${tailEnd}px) 0, ${end}, close)`;
}
function setNeck(node, neck) {
  node.style.setProperty("--neck-start", `${neck.start}px`);
  node.style.setProperty("--neck-end", `${neck.end}px`);
  node.style.setProperty("--neck-flare-start", `${neck.flareStart}px`);
  node.style.setProperty("--neck-flare-end", `${neck.flareEnd}px`);
  node.style.setProperty("--neck-cut", neckCut(neck));
  if (neck.flush) {
    node.dataset.flush = neck.flush;
  } else {
    delete node.dataset.flush;
  }
}
/** The neck with the card where it stands now, from its anchor's span and `--flare`. */
function neckOf(card, anchor) {
  const span = anchor.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  const flare =
    Number.parseFloat(getComputedStyle(anchor).getPropertyValue("--flare")) ||
    0;
  const left = box.left;
  const across = box.width;
  const right = left + across;
  const flushStart = Math.abs(left - span.left) <= 1;
  const flushEnd = Math.abs(right - span.right) <= 1;
  let flush = null;
  if (flushStart) {
    flush = "start";
  } else if (flushEnd) {
    flush = "end";
  }
  const start = Math.min(Math.max(span.left - left, 0), across);
  const end = Math.min(Math.max(span.right - left, start), across);
  return {
    start,
    end,
    flareStart: flushStart ? 0 : Math.min(flare, start),
    flareEnd: flushEnd ? 0 : Math.min(flare, across - end),
    flush,
  };
}

/* ── The hang (motion/hang `slideMotion`) ─────────────────────────── */
/**
 * A card hung from `anchor`: its wrapper (the kit popover's floating
 * wrapper, `data-hang`, cut at its top) placed on the anchor's foot, flush
 * with its trailing edge, and the card's open and close.
 */
class Hang {
  constructor(key, anchor, layer, { joined }) {
    this.anchor = anchor;
    this.joined = joined;
    this.wrapper = part(key);
    this.wrapper.removeAttribute("id");
    this.wrapper.removeAttribute("style");
    this.card = this.wrapper.querySelector('[data-slot="popover-content"]');
    this.card.removeAttribute("id");
    // Its style as the stage left it goes; its neck is written where it stands.
    this.card.removeAttribute("style");
    delete this.card.dataset.shown;
    delete this.card.dataset.flush;
    this.card.dataset.state = "open";
    this.card.setAttribute("role", "dialog");
    for (const body of this.card.querySelectorAll('[data-slot="hang-body"]')) {
      body.remove();
    }
    this.run = null;
    this.layer = layer;
    layer.append(this.wrapper);
    this.sized = new ResizeObserver(() => this.neck());
    this.sized.observe(this.card);
    // A tween of its box (the swap) is followed frame by frame, as HangCard's
    // glide is: a resize observer is not told of every frame of it in WebKit.
    this.card.__neck = () => this.neck();
  }
  /**
   * On the anchor's foot, its trailing edge on the anchor's. Its room runs to
   * the well's foot less `--space-2`, and never onto a pill on the page: a
   * pill under the footprint `width` wide stops the card's foot `--space-2`
   * above its drawn edge, so a person always sees the pins (the review's
   * must-fix: the card stood on the pin he opened). Where the card's width
   * changes, the caller sets it (the swap); this reads it for the footprint.
   */
  place(width, foot) {
    this.width = width;
    this.foot = foot;
    const room = this.layer.getBoundingClientRect();
    const at = this.anchor.getBoundingClientRect();
    this.wrapper.style.insetBlockStart = `${at.bottom - room.top}px`;
    this.wrapper.style.insetInlineEnd = `${room.right - at.right}px`;
    const gap = px("--space-2");
    const left = at.right - width;
    let stop = foot - gap;
    for (const pill of pillBoxes()) {
      const beside = pill.right + gap <= left || pill.left - gap >= at.right;
      if (!beside && pill.bottom > at.bottom) {
        stop = Math.min(stop, pill.top - gap);
      }
    }
    this.card.style.setProperty(
      "--card-max-h",
      `${Math.max(0, stop - at.bottom)}px`
    );
    this.neck();
  }
  /** Placed again where it stands: the pills or the page moved. */
  refit() {
    if (this.width !== undefined && !this.closing) {
      this.place(this.width, this.foot);
    }
  }
  neck() {
    setNeck(this.card, neckOf(this.card, this.anchor));
  }
  /** Up behind the cut by its height and its shadow's reach under it. */
  shut() {
    const reach =
      Number.parseFloat(
        getComputedStyle(this.card).getPropertyValue("--hang-reach")
      ) || 0;
    return `0px calc(-100% - ${reach}px)`;
  }
  drawn(fallback) {
    return this.run ? getComputedStyle(this.card).translate : fallback;
  }
  play(from, to, ms) {
    const next = this.card.animate([{ translate: from }, { translate: to }], {
      // Named for the clock that reads it (the probe's `of`); hang's own is unnamed.
      id: "hang",
      duration: ms,
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    this.run?.cancel();
    this.run = next;
    return next;
  }
  /** Comes down out of the anchor's foot; at once, with nothing to play, when `still`. */
  open(still = false) {
    this.card.dataset.state = "open";
    this.card.dataset.shown = "";
    this.joined(true);
    if (still || !motionOk()) {
      this.run?.cancel();
      this.run = null;
      return Promise.resolve();
    }
    const growth = this.play(this.drawn(this.shut()), "0px 0px", dur("--dur-pop"));
    return growth.finished
      .then(() => {
        if (this.run === growth) {
          growth.cancel();
          this.run = null;
        }
      })
      .catch(() => undefined);
  }
  /** Goes back up into it, then leaves (`ongone`); under less motion the kit's fade. */
  close(ongone) {
    this.closing = true;
    this.joined(false);
    this.card.dataset.state = "closed";
    const gone = () => {
      if (this.closing) {
        this.sized.disconnect();
        this.wrapper.remove();
        ongone?.();
      }
    };
    if (!motionOk()) {
      setTimeout(gone, dur("--dur-exit"));
      return;
    }
    const folding = this.play(this.drawn("0px 0px"), this.shut(), dur("--dur-exit"));
    folding.finished
      .then(() => {
        if (this.run === folding) {
          gone();
        }
      })
      .catch(() => undefined);
  }
  /** Asked open again mid-close: turns back from where it is drawn. */
  reopen() {
    this.closing = false;
    return this.open();
  }
}

/* ── A card's faces (GlassCard's swap, motion/morph's tween) ──────── */
/** The face standing in `card`, or none. */
const faceIn = (card) => card.querySelector("[data-face]:not([data-leaving])");
/**
 * Changes `card` in place to `face`, `width` wide: the outgoing face lifted
 * out of the flow where it stands (from the card's trailing side) and faded
 * out over --dur-exit on --ease-out, the incoming faded in over --dur-morph
 * on --ease-drawer, the box tweened from its drawn size to the new one's
 * over --dur-morph on --ease-drawer, the incoming held at its natural size
 * meanwhile (the box clips it). With less motion the box takes its new
 * size at once and the faces still cross-fade. `still`: at once, no fade.
 * `fit` runs once the new width and face stand, before the new size is read
 * (the card's room for its new footprint, `Hang.place`).
 */
function swap(card, face, width, still = false, fit = () => undefined) {
  const leaving = faceIn(card);
  const drawnBox = card.getBoundingClientRect();
  card.__tween?.cancel();
  if (leaving) {
    const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = leaving;
    const trailing = card.clientWidth - offsetLeft - offsetWidth;
    leaving.dataset.leaving = "";
    leaving.inert = true;
    Object.assign(leaving.style, {
      position: "absolute",
      top: `${offsetTop}px`,
      right: `${trailing}px`,
      width: `${offsetWidth}px`,
      height: `${offsetHeight}px`,
    });
    if (still) {
      leaving.remove();
    } else {
      const out = leaving.animate(
        [{ opacity: getComputedStyle(leaving).opacity }, { opacity: 0 }],
        { duration: dur("--dur-exit"), easing: ease("--ease-out"), fill: "forwards" }
      );
      out.finished.then(() => leaving.remove()).catch(() => undefined);
    }
  }
  card.style.setProperty("--card-w", `${width}px`);
  card.append(face);
  fit();
  opensAtNewest(face);
  if (still) {
    return;
  }
  face.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: dur("--dur-morph"),
    easing: ease("--ease-drawer"),
  });
  if (!(leaving && motionOk())) {
    return;
  }
  const natural = { w: card.offsetWidth, h: card.offsetHeight };
  // The incoming face holds its natural size, on the card's trailing edge.
  Object.assign(face.style, {
    flex: "none",
    alignSelf: "flex-end",
    width: `${face.offsetWidth}px`,
    height: `${face.offsetHeight}px`,
  });
  card.style.overflow = "clip";
  const tween = card.animate(
    [
      { width: `${drawnBox.width}px`, height: `${drawnBox.height}px` },
      { width: `${natural.w}px`, height: `${natural.h}px` },
    ],
    // Named for the clock that reads it (the probe's `of`).
    { id: "morph", duration: dur("--dur-morph"), easing: ease("--ease-drawer") }
  );
  card.__tween = tween;
  const follow = () => {
    if (card.__tween === tween) {
      card.__neck?.();
      requestAnimationFrame(follow);
    }
  };
  card.__neck?.();
  requestAnimationFrame(follow);
  const done = () => {
    if (card.__tween === tween) {
      card.__tween = null;
      card.style.removeProperty("overflow");
      for (const prop of ["flex", "align-self", "width", "height"]) {
        face.style.removeProperty(prop);
      }
    }
  };
  tween.finished.then(done, done);
}

/**
 * A thread opens at its newest entry's first line, so a long reply reads from
 * its start (PinCard `settle`, the owner's pick "At the reply's first line");
 * the house edge fade then says what is past either edge.
 */
function opensAtNewest(face) {
  const room = face.querySelector("[data-pin-room]");
  const list = room?.querySelector('[data-slot="thread"]');
  const newest = list?.querySelector(":scope > li:last-child");
  if (!(room && list && newest)) {
    return;
  }
  let placed = -1;
  const settle = () => {
    room.scrollTop =
      newest.getBoundingClientRect().top -
      room.getBoundingClientRect().top +
      room.scrollTop;
    placed = room.scrollTop;
  };
  settle();
  // Unscrolled, it keeps that place as the room and its entries take their
  // height (the card's room for a pill, a font), as PinCard's does.
  const watch = new ResizeObserver(() => {
    if (Math.abs(room.scrollTop - placed) <= 1) {
      settle();
    }
  });
  watch.observe(room);
  watch.observe(list);
}

/** Each page pill's drawn box, its rings included (PinMark: a 2px ring, a focus ring 2px out). */
function pillBoxes() {
  if (!built) {
    return [];
  }
  const ring = 4;
  return [...built.pins.querySelectorAll("[data-page-pin]")]
    .filter((pin) => pin.style.visibility !== "hidden")
    .map((pin) => {
      const r = (pin.querySelector("[data-mark]") ?? pin).getBoundingClientRect();
      return {
        left: r.left - ring,
        right: r.right + ring,
        top: r.top - ring,
        bottom: r.bottom + ring,
      };
    });
}

/* ── What each face holds ─────────────────────────────────────────── */
const pinOf = (number) => PINS.find((pin) => pin.number === number);

/** The rail's list, its head gone (no title), its actions one glass group, its search shut. */
function listFace(onrow) {
  const face = document.createElement("div");
  face.dataset.face = "list";
  const rail = part("rail");
  rail.querySelector('header[data-slot="head"]')?.remove();
  const bar = document.createElement("div");
  bar.className = "list-bar";
  const group = part("group-rail");
  bar.append(group);
  rail.prepend(bar);
  const search = rail.querySelector('[data-slot="input-group"]');
  if (search) {
    search.hidden = true;
    group
      .querySelector('[aria-label="Search comments"]')
      ?.addEventListener("click", (event) => {
        unfold(search, event.currentTarget);
      });
  }
  for (const row of rail.querySelectorAll('[data-slot="pin-row"]')) {
    row.addEventListener("click", () => onrow(Number(row.dataset.pinRow)));
  }
  group
    .querySelector('[aria-label="Close comments"]')
    ?.addEventListener("click", () => closeList());
  face.append(rail);
  return face;
}

/** The search field drops in above the tabs, or folds away (motion/fold's unfold). */
function unfold(field, button) {
  const opening = field.hidden;
  button.setAttribute("aria-expanded", String(opening));
  if (opening) {
    field.hidden = false;
    if (motionOk()) {
      const h = field.offsetHeight;
      field.animate(
        [
          { height: "0px", opacity: 0, overflow: "clip" },
          { height: `${h}px`, opacity: 1, overflow: "clip" },
        ],
        { duration: dur("--dur-pop"), easing: ease("--ease-out") }
      );
    }
    field.querySelector("input")?.focus({ preventScroll: true });
    return;
  }
  const h = field.offsetHeight;
  const fold = field.animate(
    motionOk()
      ? [
          { height: `${h}px`, opacity: 1, overflow: "clip" },
          { height: "0px", opacity: 0, overflow: "clip" },
        ]
      : [{ opacity: 1 }, { opacity: 0 }],
    { duration: dur("--dur-exit"), easing: ease("--ease-out") }
  );
  fold.finished.then(() => {
    field.hidden = true;
  });
}

/**
 * A pin's thread, PinCard as it drew it. `hung` (A): its head's first row
 * goes, its actions given to the row (`peers`). B: a bar, Back leading and
 * the four peers trailing, over the pill (its focus ring left to the page's
 * pill: the panel's one coral is Reply's send).
 */
function threadFace(number, how) {
  const face = document.createElement("div");
  face.dataset.face = "thread";
  face.dataset.pin = String(number);
  const holder = document.createElement("div");
  holder.innerHTML = PARTS[`card-${number}`];
  face.append(...holder.childNodes);
  const row = face.querySelector('[data-slot="head-row"]');
  const peers = row?.querySelector(":scope > [data-box]");
  const close = peers?.querySelector('button[aria-label="Close"]');
  close?.addEventListener("click", () => how.onclose());
  if (how.hung) {
    peers?.remove();
    row?.remove();
    return { face, peers };
  }
  // One bar row: Back, then the pill, then the four peers at its end; the
  // element's name under it is the card's content.
  const bar = document.createElement("div");
  bar.className = "thread-bar";
  // The part is the kit's Button itself.
  const back = part("back");
  back.addEventListener("click", () => how.onback());
  const lead = document.createElement("span");
  lead.className = "thread-lead";
  lead.append(back);
  const pill = row?.querySelector('[data-slot="head-pill"]');
  if (pill) {
    // Its focus ring is left to the page's pill: the panel's one coral is Reply's send.
    pill.querySelector("[data-mark]")?.removeAttribute("data-focused");
    lead.append(pill);
  }
  bar.append(lead);
  if (peers) {
    bar.append(peers);
  }
  row?.remove();
  face.querySelector('[data-slot="head"]')?.prepend(bar);
  return { face, peers: null };
}

/* ── The frame ────────────────────────────────────────────────────── */
const frame = document.querySelector('[data-slot="frame"]');
const fit = document.querySelector('[data-slot="fit"]');
const readout = document.querySelector('[data-slot="readout"]');
let built = null;
let ready = 0;

/** Two fifths of the page area, 280 to 480px (`c-pin-card-reading-w`). */
const readingW = (well) => Math.min(480, Math.max(280, 0.4 * well));
/** The iOS panel's share (`c-pin-list-share` 0.3, between `c-pin-list-min` 280 and `c-panel-w`). */
const listW = (well) =>
  Math.min(px("--c-panel-w"), Math.max(280, 0.3 * well));

function head(option) {
  const bar = document.createElement("header");
  bar.className = "pane-head";
  bar.dataset.slot = "pane-head";
  const lead = document.createElement("div");
  lead.className = "lead";
  lead.append(part("title"));
  const centre = document.createElement("div");
  centre.className = "centre";
  centre.append(part("group-modes"));
  const trail = document.createElement("div");
  trail.className = "trail";
  const trailing = part("group-trailing");
  trailing.dataset.slot = "tools";
  trail.append(part("group-new"), trailing);
  bar.append(lead, centre, trail);
  const comments = trailing.querySelector('[aria-label="Comments"]');
  comments?.setAttribute("aria-expanded", option === "a" ? "true" : "false");
  return { bar, trailing, comments };
}

/** The page's pills over the page, each at its element's box and point (its tail on the point). */
function placePins(well, iframe, layer) {
  const doc = iframe.contentDocument;
  if (!doc) {
    return;
  }
  // The card's room follows the pills it must keep clear of.
  queueMicrotask(() => built?.hang?.refit());
  const at = iframe.getBoundingClientRect();
  const room = well.getBoundingClientRect();
  for (const pin of PINS) {
    const button = layer.querySelector(`[data-page-pin="${pin.number}"]`);
    const el = doc.querySelector(pin.anchor.selector);
    const mark = button?.querySelector("[data-mark]");
    if (!(button && mark)) {
      continue;
    }
    if (!el) {
      // Its element is gone: a dashed pill at the page's top-right.
      mark.dataset.gone = "true";
      button.style.insetInlineStart = `${room.width - mark.offsetWidth - px("--space-2")}px`;
      button.style.insetBlockStart = `${px("--space-2")}px`;
      button.style.removeProperty("visibility");
      continue;
    }
    delete mark.dataset.gone;
    const box = el.getBoundingClientRect();
    const x = box.left + box.width * (pin.point?.x ?? 0);
    const y = box.top + box.height * (pin.point?.y ?? 0);
    const h = mark.offsetHeight;
    button.style.insetInlineStart = `${at.left - room.left + x}px`;
    button.style.insetBlockStart = `${at.top - room.top + y - h}px`;
    button.style.removeProperty("visibility");
  }
}

function pillButton(pin) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "page-pin";
  button.dataset.pagePin = String(pin.number);
  button.setAttribute("aria-label", `Comment ${pin.number}`);
  button.append(part(`pill-${pin.number}`));
  button.dataset.drawn = `pill-${pin.number}`;
  // Unseen until the page has laid out what it stands on.
  button.style.visibility = "hidden";
  return button;
}

/** The page's pill for the open thread stands focused (its 2px focus ring), the others not. */
function focusPill(layer, number) {
  for (const pin of PINS) {
    const button = layer.querySelector(`[data-page-pin="${pin.number}"]`);
    if (!button) {
      continue;
    }
    const want = pin.number === number ? `pill-${pin.number}-focused` : `pill-${pin.number}`;
    if (button.dataset.drawn === want) {
      continue;
    }
    const gone = button.querySelector("[data-mark]")?.dataset.gone;
    button.replaceChildren(part(want));
    button.dataset.drawn = want;
    if (gone) {
      button.querySelector("[data-mark]").dataset.gone = gone;
    }
  }
}

function build() {
  const { option, width } = state;
  const height = SCREENS[width] - TOP_BAR;
  frame.style.setProperty("--frame-w", `${width}px`);
  frame.style.setProperty("--frame-h", `${height}px`);
  fit.style.setProperty("--frame-w", `${width}px`);
  fit.style.setProperty("--frame-h", `${height}px`);
  scale();
  document.querySelector('[data-slot="rule"]').textContent = RULES[option];

  const pane = document.createElement("section");
  pane.className = "pane";
  pane.dataset.slot = "pane";
  pane.dataset.option = option;
  pane.setAttribute("aria-label", "Preview");
  const { bar, trailing, comments } = head(option);
  const body = document.createElement("div");
  body.className = "pane-body";
  const well = document.createElement("div");
  well.className = "well";
  well.dataset.slot = "well";
  const iframe = document.createElement("iframe");
  iframe.dataset.slot = "page";
  iframe.title = `${EXPORT.artifact.name}, the page under review`;
  iframe.src = `page/index.html?${EXPORT.artifact.address.split("?")[1]}`;
  const pins = document.createElement("div");
  pins.className = "pins";
  pins.dataset.slot = "pins";
  for (const pin of PINS) {
    pins.append(pillButton(pin));
  }
  well.append(iframe, pins);
  body.append(well);
  const hangs = document.createElement("div");
  hangs.className = "hangs";
  hangs.dataset.slot = "hangs";
  pane.append(bar, body, hangs);
  frame.replaceChildren(pane);

  built = { option, pane, well, iframe, pins, hangs, trailing, comments, hang: null };
  if (option === "a") {
    buildA(body);
  } else {
    comments?.addEventListener("click", () => {
      if (built.hang && !built.hang.closing) {
        closeList();
      } else {
        openList();
      }
    });
  }
  for (const button of pins.querySelectorAll("[data-page-pin]")) {
    button.addEventListener("click", () => {
      openThread(Number(button.dataset.pagePin));
    });
  }
  iframe.addEventListener("load", () => {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    const again = () => placePins(well, iframe, pins);
    // The page lays itself out and plays its own opening as it loads: the
    // pills follow its elements wherever they stand.
    const watch = new win.ResizeObserver(again);
    watch.observe(doc.documentElement);
    for (const pin of PINS) {
      const el = doc.querySelector(pin.anchor.selector);
      if (el) {
        watch.observe(el);
      }
    }
    win.addEventListener("scroll", again, { capture: true, passive: true });
    doc.addEventListener("transitionend", again, true);
    doc.addEventListener("animationend", again, true);
    // The page is ready once it has said so (its own `data-ready`, set as it
    // plays its opening), and then once every run of its own that ends has
    // ended (a breath and a live dot loop for good) and two frames have
    // passed with none running: so the page's own card is never caught
    // mid-opening, and A and B differ only by the option.
    const frameOf = () => new Promise((done) => win.requestAnimationFrame(done));
    const ending = () =>
      doc
        .getAnimations()
        .filter(
          (run) =>
            run.playState !== "finished" &&
            Number.isFinite(Number(run.effect?.getComputedTiming().endTime))
        );
    const still = async () => {
      while (!doc.documentElement.dataset.ready) {
        await frameOf();
      }
      let quiet = 0;
      while (quiet < 2) {
        const runs = ending();
        await Promise.all(runs.map((run) => run.finished.catch(() => undefined)));
        await frameOf();
        quiet = runs.length === 0 ? quiet + 1 : 0;
      }
    };
    Promise.all([doc.fonts.ready, still()]).then(() => {
      requestAnimationFrame(() => {
        again();
        settle();
      });
    });
  });
}

// A fault in a promise's callback is said where the console shows it.
addEventListener("unhandledrejection", (event) => {
  console.error(event.reason?.stack ?? String(event.reason));
});

/** The state asked for, drawn at once (a load, a switch): nothing plays. */
function settle() {
  const { shows } = state;
  if (state.option === "b" && shows !== "none") {
    openList(true);
  }
  if (shows === "thread") {
    openThread(state.pin, true);
  }
  say();
  write();
  ready += 1;
  ROOT.dataset.ready = String(ready);
}

/* ── A: the strip, a row's card ───────────────────────────────────── */
function buildA(body) {
  const strip = document.createElement("aside");
  strip.className = "strip";
  strip.dataset.slot = "strip";
  const face = listFace((number) => openThread(number));
  strip.append(face.firstElementChild);
  body.append(strip);
  built.strip = strip;
}

/** The row's li for a pin, in A's strip. */
const rowOf = (number) =>
  built.strip
    ?.querySelector(`[data-pin-row="${number}"]`)
    ?.closest("li") ?? null;

/** A row stands open as its card's anchor: its peers in its trailing cell, its own foot (the glass's join) drawn. */
function standOpen(li, peers) {
  li.dataset.open = "";
  li.classList.add("group/tools");
  const join = part("group-trailing-joined").querySelector('[data-slot="join"]');
  join.style.setProperty("--join-round", "var(--radius-sm)");
  li.prepend(join);
  const cell = document.createElement("span");
  cell.className = "row-peers";
  if (peers) {
    cell.append(peers);
  }
  li.append(cell);
  return (joined) => {
    if (joined) {
      li.dataset.joined = "";
    } else {
      delete li.dataset.joined;
    }
  };
}
function standShut(li) {
  delete li.dataset.open;
  delete li.dataset.joined;
  li.classList.remove("group/tools");
  li.querySelector(':scope > [data-slot="join"]')?.remove();
  li.querySelector(":scope > .row-peers")?.remove();
}

function openThreadA(number, still) {
  const li = rowOf(number);
  if (!li) {
    return;
  }
  const wellW = built.well.getBoundingClientRect().width;
  const foot = built.well.getBoundingClientRect().bottom;
  const current = built.hang;
  const how = { hung: true, onclose: () => closeThread() };
  if (current && !current.closing && current.number !== number) {
    // Another row: the card glides to it, its contents changing in place.
    const was = rowOf(current.number);
    const fromTop = current.wrapper.getBoundingClientRect().top;
    if (was) {
      standShut(was);
    }
    const { face, peers } = threadFace(number, how);
    current.joined = standOpen(li, peers);
    current.joined(true);
    current.anchor = li;
    current.number = number;
    current.place(readingW(wellW), foot);
    const dy = fromTop - current.wrapper.getBoundingClientRect().top;
    swap(current.card, face, readingW(wellW), still);
    if (!still && motionOk() && dy !== 0) {
      current.wrapper.animate(
        [{ translate: `0 ${dy}px` }, { translate: "0 0" }],
        { duration: dur("--dur-morph"), easing: ease("--ease-drawer") }
      );
    }
  } else if (current && current.closing && current.number === number) {
    current.joined = standOpen(li, current.peers);
    current.reopen();
  } else {
    if (current) {
      const was = rowOf(current.number);
      if (!current.closing) {
        current.close();
      }
      if (was) {
        standShut(was);
      }
    }
    const { face, peers } = threadFace(number, how);
    const joined = standOpen(li, peers);
    const hang = new Hang("hang-row", li, built.hangs, { joined });
    hang.number = number;
    hang.peers = peers;
    hang.card.setAttribute("aria-label", `Comment ${number}`);
    const width = readingW(wellW);
    swap(hang.card, face, width, true, () => hang.place(width, foot));
    built.hang = hang;
    hang.open(still);
  }
  focusPill(built.pins, number);
  state.shows = "thread";
  state.pin = number;
}

function closeThreadA() {
  const hang = built.hang;
  if (!hang || hang.closing) {
    return;
  }
  const li = rowOf(hang.number);
  // The row gives its peers back once the card is up behind the cut.
  hang.close(() => {
    if (built.hang === hang) {
      built.hang = null;
    }
    if (li) {
      standShut(li);
    }
  });
  focusPill(built.pins, null);
  state.shows = "list";
}

/* ── B: the hung card ─────────────────────────────────────────────── */
const joinGroup = (joined) => {
  if (joined) {
    built.trailing.dataset.joined = "";
  } else {
    delete built.trailing.dataset.joined;
  }
};

function openList(still = false) {
  const wellBox = built.well.getBoundingClientRect();
  const current = built.hang;
  if (current?.closing) {
    current.reopen();
    built.comments?.setAttribute("aria-expanded", "true");
    state.shows = "list";
    return;
  }
  if (current) {
    return;
  }
  const hang = new Hang("hang-glass", built.trailing, built.hangs, {
    joined: joinGroup,
  });
  hang.card.setAttribute("aria-label", "Comments");
  hang.face = "list";
  const width = listW(wellBox.width);
  swap(hang.card, listFace((number) => openThread(number)), width, true, () =>
    hang.place(width, wellBox.bottom)
  );
  built.hang = hang;
  built.comments?.setAttribute("aria-expanded", "true");
  hang.open(still);
  state.shows = "list";
  say();
  write();
}

function closeList() {
  if (state.option === "a") {
    return;
  }
  const hang = built.hang;
  if (!hang || hang.closing) {
    return;
  }
  hang.close(() => {
    if (built.hang === hang) {
      built.hang = null;
    }
  });
  built.comments?.setAttribute("aria-expanded", "false");
  focusPill(built.pins, null);
  state.shows = "none";
  say();
  write();
}

function openThreadB(number, still) {
  if (!built.hang || built.hang.closing) {
    // With the card shut, a pill's own hang is the builder's (not drawn here).
    if (!still) {
      return;
    }
    openList(true);
  }
  const hang = built.hang;
  const wellBox = built.well.getBoundingClientRect();
  if (hang.face === "list") {
    const rows = hang.card.querySelector('[data-slot="rows"]');
    hang.listScroll = rows?.scrollTop ?? 0;
  }
  const { face } = threadFace(number, {
    hung: false,
    onclose: () => closeList(),
    onback: () => backToList(),
  });
  hang.face = "thread";
  hang.number = number;
  const width = readingW(wellBox.width);
  swap(hang.card, face, width, still, () => hang.place(width, wellBox.bottom));
  focusPill(built.pins, number);
  state.shows = "thread";
  state.pin = number;
}

function backToList() {
  const hang = built.hang;
  if (!hang || hang.face !== "thread") {
    return;
  }
  const wellBox = built.well.getBoundingClientRect();
  const face = listFace((number) => openThread(number));
  hang.face = "list";
  const width = listW(wellBox.width);
  swap(hang.card, face, width, false, () => hang.place(width, wellBox.bottom));
  const rows = face.querySelector('[data-slot="rows"]');
  if (rows) {
    rows.scrollTop = hang.listScroll ?? 0;
  }
  focusPill(built.pins, null);
  state.shows = "list";
  say();
  write();
}

/* ── Either option ────────────────────────────────────────────────── */
function openThread(number, still = false) {
  if (!pinOf(number)) {
    return;
  }
  if (state.option === "a") {
    openThreadA(number, still);
  } else {
    openThreadB(number, still);
  }
  say();
  write();
}
function closeThread() {
  if (state.option === "a") {
    closeThreadA();
  } else {
    closeList();
  }
  say();
  write();
}

/** What the frame shows, measured: the page's width beside what stands, and the card's. */
function say() {
  if (!built) {
    return;
  }
  const wellW = Math.round(built.well.getBoundingClientRect().width);
  const card = built.hang?.closing ? null : built.hang?.card;
  const cardW = card ? Math.round(Number.parseFloat(card.style.getPropertyValue("--card-w"))) : 0;
  const over = card
    ? Math.max(
        0,
        Math.round(
          built.well.getBoundingClientRect().right -
            card.getBoundingClientRect().left
        )
      )
    : 0;
  const lines = {
    a: card
      ? `The page keeps ${wellW} of ${state.width}px. Comment ${built.hang.number}'s thread hangs from its row, ${cardW}px wide, ${over}px of it over the page.`
      : `The page keeps ${wellW} of ${state.width}px beside the 200px strip.`,
    b: card
      ? `The page keeps all ${wellW}px. The card hangs from Comments, ${cardW}px wide over the page's top-right${state.shows === "thread" ? `, showing comment ${built.hang.number}'s thread` : ", showing the list"}.`
      : `The page keeps all ${wellW}px; Comments is shut.`,
  };
  readout.textContent = lines[state.option];
}

function scale() {
  const room = document.querySelector(".stage").clientWidth;
  const s = Math.min(1, room / state.width);
  fit.style.setProperty("--s", String(s));
  frame.style.setProperty("--s", String(s));
}

/* ── The keys ─────────────────────────────────────────────────────── */
addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !built?.hang || built.hang.closing) {
    return;
  }
  // Esc unwinds one step: B's thread to its list, then the card; A's card.
  if (state.option === "b" && built.hang.face === "thread") {
    backToList();
  } else {
    closeThread();
  }
});
addEventListener("resize", scale);

build();
