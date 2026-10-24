/**
 * The comment sizing preview: the preview pane at a real size, its decision
 * page, the comments' pills on it, the Comments rail, and the open thread
 * where the chosen option puts it. Every comment part is the real
 * component's markup (parts.js, captured by capture/capture.ts); this file
 * places them, by the pane's own rules (PinFloat's placement, ported line
 * for line below) and each option's sizes, and plays the house motion for
 * opening and handing off: the card grows from its pill (PinFloat `grow`),
 * a rail changing size tweens its width (motion/morph: --dur-morph on
 * --ease-drawer) while what it held fades out and what it holds fades in,
 * a rail arriving comes in from its end (PreviewPane `railIn`: --dur-panel
 * on --ease-drawer) and goes closing to none (`railOut`: --dur-exit on
 * --ease-out), and what opens inside a list unfolds (motion/fold `unfold`:
 * --dur-pop on --ease-out) while the rows under it slide.
 */
import { PARTS } from "./parts.js";

/* ---- The sizes. A's are main's tokens; B's and C's are the report's
   (aba6492c), which main has no tokens for. ---- */
const SCREENS = {
  desk: { w: 1440, h: 900 },
  window: { w: 1037, h: 760 },
  phone: { w: 390, h: 844 },
};
/** B: the card's width (c-pin-card-short-w). */
const B_CARD_W = 320;
/** B: the card's tallest, min(400px, 40%) of the well (c-pin-card-short-max). */
const B_CAP = { px: 400, share: 0.4 };
/** B and C: the rail holding one thread (c-comments-thread-w), 500px on a pane 1680px or wider (c-comments-thread-wide-w). */
const THREAD_W = 400;
const THREAD_WIDE_W = 500;
const WIDE_PANE = 1680;
/** C: the panel's narrowest (c-thread-panel-min) and widest share of the pane. */
const PANEL_MIN = 300;
const PANEL_MAX_SHARE = 0.5;
/** A pane under this is a phone's: the rail and the card are the well's foot sheets (PreviewPane `phone`, `RAIL_BESIDE_FROM`). */
const PHONE_BELOW = 640;
/** The pane's head. */
const HEAD_H = 44;
/** How far down the well the commented element stands as the frame opens: near its foot, as in the owner's case. */
const TARGET_AT = 0.7;

const root = document.documentElement;
const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const px = (name, fallback) => Number.parseFloat(token(name)) || fallback;
const ms = (name, fallback) => {
  const value = token(name);
  if (value.endsWith("ms")) {
    return Number.parseFloat(value);
  }
  if (value.endsWith("s")) {
    return Number.parseFloat(value) * 1000;
  }
  return fallback;
};
const T = {
  gap: px("--space-2", 7),
  pin: px("--c-pin", 20),
  reach: px("--c-pin-card-reading-room", 320),
  railW: px("--c-comments-w", 320),
  composeW: px("--c-pin-card-w", 280),
  press: px("--press-scale", 0.97),
  clearance: px("--space-3", 11),
  menu: ms("--dur-menu", 140),
  control: ms("--dur-control", 120),
  morph: ms("--dur-morph", 180),
  panel: ms("--dur-panel", 280),
  pop: ms("--dur-pop", 260),
  exit: ms("--dur-exit", 160),
  easeOut: token("--ease-out") || "ease-out",
  easeDrawer: token("--ease-drawer") || "ease-out",
};
/** PinFloat `clear`: `--space-2` from the pill as drawn, past its focus ring. */
T.clear = T.gap + 4;
const motionOk = () =>
  matchMedia("(prefers-reduced-motion: no-preference)").matches;

const RULES = {
  a: "Every comment opens next to what it is about, two fifths of the page area wide (280 to 480px), as tall as the room from its pin to the foot. On a phone it is a drawer at the bottom. This is what ships today.",
  b: "A comment opens in a 320px card next to what it is about, at most 400px or two fifths of the page area tall. One that needs more opens in Comments instead, which widens to 400px to hold it. On a phone it opens in its row of the Comments list.",
  c: "A new comment is written in a 280px card next to its spot. Every thread opens in a panel on the right, as tall as the page area, 400px to start, dragged anywhere from 300px to half the pane, in place of the Comments list. On a phone it is a drawer at the bottom.",
};

/* ---- What is shown, kept through a reload. ---- */
const KEY = "cawco:comment-sizing";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
})();
const params = new URLSearchParams(location.search);
const pick = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;
const CASES = ["long", "closed", "short", "new"];
const state = {
  option: pick(params.get("option") ?? saved.option, ["a", "b", "c"], "a"),
  case: pick(params.get("case") ?? saved.case, CASES, "long"),
  screen: pick(
    params.get("screen") ?? saved.screen,
    Object.keys(SCREENS),
    "window"
  ),
  /** The thread stands open: closed by its Close, opened by its pill or its row. */
  open: params.has("case") ? true : (saved.open ?? true),
  /** C's panel as it was last dragged. */
  panelW: Number(params.get("panel")) || saved.panelW || THREAD_W,
};
const save = () => {
  localStorage.setItem(KEY, JSON.stringify(state));
  const query = new URLSearchParams({
    option: state.option,
    case: state.case,
    screen: state.screen,
  });
  history.replaceState(null, "", `?${query}`);
};

/* ---- Markup. ---- */
const fragment = (html) => {
  const holder = document.createElement("template");
  holder.innerHTML = html;
  return holder.content;
};
const first = (html) => fragment(html).firstElementChild;
/** The rail's own `aside` attributes, for a rail that holds a thread. */
const railShell = (form) => {
  const rail = first(PARTS[`rail-long-${form}`]);
  const shell = document.createElement("aside");
  for (const { name, value } of rail.attributes) {
    shell.setAttribute(name, value);
  }
  shell.setAttribute("aria-label", "Comment 3");
  shell.dataset.holds = "thread";
  return shell;
};
/** A float's own element (PinFloat), its contents emptied. */
const floatShell = (kind) => {
  const shell = first(PARTS[kind]);
  shell.replaceChildren();
  shell.removeAttribute("style");
  shell.removeAttribute("data-side");
  return shell;
};

/** The thread's own parts (PinCard), its head carrying the pill when its page pill is out of reach. */
const threadParts = (beside) => {
  const kind = state.case === "short" ? "short" : "long";
  return fragment(PARTS[`card-${kind}-${beside ? "beside" : "held"}`]);
};

/* ---- What the state means. ---- */
const LIST_DEFAULT = { long: true, closed: false, short: true, new: true };
let listOpen = LIST_DEFAULT[state.case];
if (typeof saved.list === "boolean" && !params.has("case")) {
  listOpen = saved.list;
}

const layoutOf = () => {
  const screen = SCREENS[state.screen];
  const phone = screen.w < PHONE_BELOW;
  const composing = state.case === "new";
  const thread = state.open && !composing;
  let stands = "none";
  if (composing) {
    stands = "compose";
  } else if (thread) {
    stands = {
      a: phone ? "sheet" : "card",
      b: phone ? "row" : "card",
      c: phone ? "bottom" : "panel",
    }[state.option];
  }
  return { screen, phone, composing, thread, stands };
};

/* ---- The frame. ---- */
const els = {
  fit: document.querySelector('[data-slot="fit"]'),
  frame: document.querySelector('[data-slot="frame"]'),
  readout: document.querySelector('[data-slot="readout"]'),
  rule: document.querySelector('[data-slot="rule"]'),
};
let built = null;

/** The frame's scale: 1 unless the window is narrower than the frame. */
const scaleOf = (screen) => {
  const stage = document.querySelector(".stage");
  const style = getComputedStyle(stage);
  const room =
    stage.clientWidth -
    Number.parseFloat(style.paddingInlineStart) -
    Number.parseFloat(style.paddingInlineEnd);
  return Math.min(1, room / screen.w);
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the frame in one reading order: the head, the page and its pills, the float, then what stands beside or under the page for each option
function build() {
  const look = layoutOf();
  const { screen, phone, stands } = look;
  const s = scaleOf(screen);
  els.fit.style.setProperty("--w", String(screen.w));
  els.fit.style.setProperty("--h", String(screen.h));
  els.fit.style.setProperty("--s", String(s));

  const { frame } = els;
  frame.replaceChildren();
  frame.dataset.option = state.option;
  frame.dataset.case = state.case;
  frame.dataset.screen = state.screen;
  frame.dataset.stands = stands;
  delete frame.dataset.needs;

  const head = document.createElement("div");
  head.className = "pane-head";
  head.dataset.slot = "pane-head";
  const title = document.createElement("h2");
  title.textContent = "Away mode";
  const toggle = first(PARTS.toggle);
  toggle.setAttribute("aria-pressed", String(listOpen));
  toggle.dataset.slot = "comments-toggle";
  toggle.addEventListener("click", async () => {
    const going = built?.side;
    if (listOpen && going && !going.querySelector("[data-holds]")) {
      // PreviewPane `railOut`: its width closing to none over --dur-exit.
      const from = going.getBoundingClientRect().width / built.s;
      const out = going.animate(
        motionOk()
          ? [
              { width: `${from}px`, opacity: 1 },
              { width: "0px", opacity: 0 },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        { duration: T.exit, easing: T.easeOut, fill: "forwards" }
      );
      follow(T.exit);
      await out.finished.catch(() => undefined);
    }
    listOpen = !listOpen;
    if (state.case === "long" || state.case === "closed") {
      state.case = listOpen ? "long" : "closed";
    }
    render({ play: listOpen ? "list" : null });
  });
  head.append(title, toggle);

  const body = document.createElement("div");
  body.className = "pane-body";
  const well = document.createElement("div");
  well.className = "well";
  well.dataset.slot = "well";
  const scroller = document.createElement("div");
  scroller.className = "page-scroll";
  scroller.dataset.slot = "page-scroll";
  scroller.append(document.getElementById("page").content.cloneNode(true));
  const room = document.createElement("div");
  room.className = "pin-room";
  room.dataset.slot = "pin-room";
  well.append(scroller, room);
  body.append(well);

  // The page's pills.
  const pills = new Map();
  const spots = {
    1: "title",
    2: "pause",
    3: "away-rail",
    4: "digest",
  };
  for (const [number, id] of Object.entries(spots)) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "page-pin";
    pill.dataset.pagePin = number;
    pill.setAttribute("aria-label", `Comment ${number}`);
    const focused = number === "3" && look.thread;
    pill.append(first(PARTS[`pill-${number}${focused ? "-focused" : ""}`]));
    if (number === "3") {
      pill.addEventListener("click", () => {
        if (!look.thread && state.case !== "new") {
          state.open = true;
          render({ play: "open" });
        }
      });
    }
    room.append(pill);
    pills.set(id, pill);
  }
  if (look.composing) {
    const pill = document.createElement("span");
    pill.className = "page-pin";
    pill.dataset.pagePin = "new";
    pill.append(first(PARTS["pill-new"]));
    room.append(pill);
    pills.set("away-card", pill);
  }

  // What the comment is about.
  const targetId = look.composing ? "away-card" : "away-rail";
  const target = scroller.querySelector(`#${targetId}`);
  target.dataset.commented = "";

  // The float over the page: the card (A, B), a foot sheet (A on a phone), the composer.
  let float = null;
  if (stands === "card" || stands === "sheet") {
    float = floatShell(stands === "sheet" ? "float-sheet" : "float");
    float.append(threadParts(true));
    room.append(float);
  } else if (stands === "compose") {
    float = floatShell("float-bare");
    if (phone) {
      float.dataset.sheet = "true";
    }
    float.append(fragment(PARTS.composer));
    room.append(float);
  }

  // Beside the well: the list, the rail holding the thread, or C's panel.
  let side = null;
  let handle = null;
  let sheet = null;
  const rail = (form) => {
    const kind = state.case === "short" ? "short" : "long";
    const list = first(PARTS[`rail-${kind}-${form}`]);
    if (!look.thread) {
      for (const row of list.querySelectorAll("[aria-current]")) {
        row.removeAttribute("aria-current");
      }
    }
    for (const row of list.querySelectorAll("[data-pin-row]")) {
      row.addEventListener("click", () => {
        if (row.dataset.pinRow === "3" && !look.thread) {
          state.open = true;
          if (state.case === "new") {
            state.case = "long";
          }
          render({ play: "open" });
        }
      });
    }
    return list;
  };
  const held = (form) => {
    const shell = railShell(form);
    const holder = document.createElement("div");
    holder.className = "rail-thread";
    holder.dataset.slot = "rail-thread";
    holder.append(threadParts(false));
    shell.append(holder);
    return shell;
  };
  if (phone) {
    if (stands === "row" || stands === "bottom" || listOpen) {
      sheet = document.createElement("div");
      sheet.className = "foot-sheet";
      sheet.dataset.slot = "foot-sheet";
      if (stands === "bottom") {
        sheet.dataset.tall = "";
        sheet.append(held("sheet"));
      } else {
        const list = rail("sheet");
        if (stands === "row") {
          sheet.dataset.tall = "";
          openRow(list);
        }
        sheet.append(list);
      }
      well.append(sheet);
    }
  } else {
    let width = 0;
    let content = null;
    if (stands === "panel" || (stands === "card" && needsRail())) {
      const threadW = screen.w >= WIDE_PANE ? THREAD_WIDE_W : THREAD_W;
      width = stands === "panel" ? panelWidth(screen.w) : threadW;
      content = held("beside");
    } else if (listOpen) {
      width = T.railW;
      content = rail("beside");
    }
    if (content) {
      side = document.createElement("div");
      side.className = "side";
      side.dataset.slot = "side";
      side.style.setProperty("--side-w", String(width));
      side.append(content);
      if (stands === "panel") {
        side.dataset.panel = "";
        handle = handleOf(side, screen);
        const slot = document.createElement("div");
        slot.className = "handle-slot";
        slot.append(handle);
        body.append(slot);
      }
      body.append(side);
    }
  }
  if (float && stands === "card" && side?.querySelector("[data-holds]")) {
    // B handed the thread to the rail: no card over the page.
    float.remove();
    float = null;
    frame.dataset.stands = "rail";
  }

  frame.append(head, body);
  built = {
    look,
    s,
    well,
    scroller,
    room,
    pills,
    spots,
    target,
    float,
    side,
    sheet,
    handle,
  };
  wireThread();
  // As PinFloat does (frameObserver): what the card, a sheet or the rail
  // holds takes its height after it stands (the composer's field, the
  // entries' words), and the frame is placed again in the next frame.
  sizes?.disconnect();
  sizes = new ResizeObserver(() => requestAnimationFrame(() => layout()));
  for (const el of [float, sheet, side, well]) {
    if (el) {
      sizes.observe(el);
    }
  }
  return built;
}
let sizes = null;

/** B: a thread whose whole exchange needs more than its card's tallest goes to the rail. Measured on the card at its width, nothing capping it. */
function needsRail() {
  if (state.option !== "b") {
    return false;
  }
  const screen = SCREENS[state.screen];
  const wellH = screen.h - HEAD_H;
  const probe = floatShell("float");
  probe.append(threadParts(true));
  probe.style.cssText = `position: absolute; visibility: hidden; inset-block-start: 0; inset-inline-start: 0; --float-w: ${B_CARD_W}px; --float-max: none;`;
  const host = document.createElement("div");
  host.className = "pin-room";
  host.style.cssText = `inline-size: ${screen.w}px; block-size: ${wellH}px; position: fixed; inset: 0; visibility: hidden;`;
  host.append(probe);
  document.body.append(host);
  const room = probe.querySelector("[data-pin-room]");
  const natural = probe.offsetHeight - room.clientHeight + room.scrollHeight;
  host.remove();
  const cap = Math.min(B_CAP.px, B_CAP.share * wellH);
  els.frame.dataset.needs = `${Math.round(natural)}/${Math.round(cap)}`;
  return natural > cap;
}

/** C: the panel's width, as dragged, within 300px and half the pane. */
function panelWidth(paneW) {
  return Math.round(
    Math.min(Math.max(state.panelW, PANEL_MIN), PANEL_MAX_SHARE * paneW)
  );
}

/** C's handle: the kit's split handle (resizable-handle `split`), dragged by the pointer or moved by the arrow keys. */
function handleOf(side, screen) {
  const handle = fragment(PARTS.split).querySelector(
    '[data-slot="resizable-handle"]'
  );
  for (const name of ["id", "aria-controls", "data-pane-group-id"]) {
    handle.removeAttribute(name);
  }
  handle.style.cssText = "cursor: ew-resize; touch-action: none;";
  handle.setAttribute("aria-orientation", "vertical");
  const set = (width) => {
    const next = Math.round(
      Math.min(Math.max(width, PANEL_MIN), PANEL_MAX_SHARE * screen.w)
    );
    state.panelW = next;
    side.style.setProperty("--side-w", String(next));
    handle.setAttribute("aria-valuemin", String(PANEL_MIN));
    handle.setAttribute(
      "aria-valuemax",
      String(Math.round(PANEL_MAX_SHARE * screen.w))
    );
    handle.setAttribute("aria-valuenow", String(next));
    handle.setAttribute("aria-valuetext", `${next}px wide`);
    layout();
  };
  set(state.panelW);
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.dataset.active = "pointer";
    const { s } = built;
    const start = event.clientX;
    const from = state.panelW;
    const move = (next) => set(from + (start - next.clientX) / s);
    const end = () => {
      delete handle.dataset.active;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      save();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
  handle.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 50 : 10;
    const moves = {
      ArrowLeft: state.panelW + step,
      ArrowRight: state.panelW - step,
      Home: PANEL_MIN,
      End: PANEL_MAX_SHARE * screen.w,
    };
    if (event.key in moves) {
      event.preventDefault();
      set(moves[event.key]);
      save();
    }
  });
  return handle;
}

/** B on a phone: the open comment's row opens into its thread under it, the rows under it sliding down. */
function openRow(list) {
  const row = list.querySelector('[data-pin-row="3"]');
  const item = row.closest("li");
  const thread = document.createElement("div");
  thread.className = "row-thread";
  thread.dataset.slot = "row-thread";
  thread.append(threadParts(true));
  item.append(thread);
}

/* ---- Placement: PinFloat's, line for line. ---- */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: PinFloat's `place` and `tallest`, ported line for line so the card stands where the pane puts it
function placeOf({ mark, box, room, width, height, reach }) {
  const { gap, clear } = T;
  const parts = box ? [mark, box] : [mark];
  const left = Math.max(0, Math.min(...parts.map((one) => one.x)));
  const top = Math.max(0, Math.min(...parts.map((one) => one.y)));
  const right = Math.min(
    room.w,
    Math.max(...parts.map((one) => one.x + one.w))
  );
  const bottom = Math.min(
    room.h,
    Math.max(...parts.map((one) => one.y + one.h))
  );
  const about =
    right > left && bottom > top
      ? { x: left, y: top, w: right - left, h: bottom - top }
      : mark;
  const inside = (l, t) => ({
    left: Math.max(gap, Math.min(l, room.w - width - gap)),
    top: Math.max(gap, Math.min(t, room.h - height - gap)),
  });
  const least = Math.min(reach, height || reach);
  let place;
  const end = about.x + about.w + clear;
  const start = about.x - clear - width;
  const under = room.h - (about.y + about.h + clear) - gap;
  const over = about.y - clear - gap;
  if (end + width <= room.w - gap) {
    place = { ...inside(end, mark.y), side: "end", origin: "top left" };
  } else if (start >= gap) {
    place = { ...inside(start, mark.y), side: "start", origin: "top right" };
  } else if (under >= least || over >= least) {
    place =
      under >= least
        ? {
            ...inside(mark.x, about.y + about.h + clear),
            side: "below",
            origin: "top left",
          }
        : {
            ...inside(mark.x, about.y - clear - height),
            side: "above",
            origin: "bottom left",
          };
  } else {
    const belowPill = room.h - (mark.y + mark.h + clear) - gap;
    place =
      belowPill < reach && mark.y - clear - gap > belowPill
        ? {
            ...inside(mark.x, mark.y - clear - height),
            side: "above-pill",
            origin: "bottom left",
          }
        : {
            ...inside(mark.x, mark.y + mark.h + clear),
            side: "below-pill",
            origin: "top left",
          };
  }
  let tallest;
  if (place.side === "above") {
    tallest = about.y - clear - gap;
  } else if (place.side === "below") {
    tallest = room.h - (about.y + about.h + clear) - gap;
  } else if (place.side === "above-pill") {
    tallest = mark.y - clear - gap;
  } else if (place.side === "below-pill") {
    tallest = room.h - (mark.y + mark.h + clear) - gap;
  } else {
    const below = room.h - Math.max(gap, mark.y) - gap;
    tallest = below >= reach ? below : room.h - 2 * gap;
  }
  return { ...place, tallest };
}

/** A box in the well's own px (the frame may be drawn scaled). */
const inWell = (node) => {
  const well = built.well.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  return {
    x: (box.left - well.left) / built.s,
    y: (box.top - well.top) / built.s,
    w: box.width / built.s,
    h: box.height / built.s,
  };
};

/** The float's width, by option. */
const floatWidth = () => {
  if (state.case === "new") {
    return {
      a: "var(--c-pin-card-reading-w)",
      b: `${B_CARD_W}px`,
      c: "var(--c-pin-card-w)",
    }[state.option];
  }
  return state.option === "b" ? `${B_CARD_W}px` : "var(--c-pin-card-reading-w)";
};

/** Every pill on its element, the float beside its pill, and the page lifted clear of a foot sheet. */
function layout() {
  if (!built) {
    return;
  }
  const { well, scroller, room, pills, target, float, sheet, look } = built;
  const size = { w: well.clientWidth, h: well.clientHeight };
  // Under a foot sheet the page is scrolled as little as lifts what the
  // comment is about clear above it (the overlay's `reveal`), never so far
  // that its pill leaves the top.
  const covers = look.phone
    ? [float?.dataset.sheet ? float : null, sheet].filter(Boolean)
    : [];
  if (covers.length > 0) {
    const over = Math.min(...covers.map((one) => inWell(one).y));
    const about = inWell(target);
    const need = about.y + about.h + T.clearance - over;
    const headroom = about.y - (T.gap + T.pin + T.gap);
    if (need > 0 && headroom > 0) {
      scroller.scrollTop += Math.min(need, headroom);
    }
  }
  for (const [id, pill] of pills) {
    const at = inWell(scroller.querySelector(`#${id}`));
    const wide = pill.firstElementChild.getBoundingClientRect().width / built.s;
    const x = Math.round(Math.min(at.x + at.w * 0.82, size.w - wide - T.gap));
    const y = Math.round(at.y - T.pin);
    pill.style.setProperty("--x", String(x));
    pill.style.setProperty("--y", String(y));
  }
  if (float && !float.dataset.sheet) {
    float.style.setProperty(
      "--float-w",
      `min(${floatWidth()}, calc(100% - 2 * var(--space-2)))`
    );
    const pill = pills.get(look.composing ? "away-card" : "away-rail");
    const mark = {
      x: Number(pill.style.getPropertyValue("--x")),
      y: Number(pill.style.getPropertyValue("--y")),
      w: pill.firstElementChild.getBoundingClientRect().width / built.s,
      h: T.pin,
    };
    const box = inWell(target);
    const cap =
      state.option === "b" && !look.composing
        ? Math.min(B_CAP.px, B_CAP.share * size.h)
        : Number.POSITIVE_INFINITY;
    for (let pass = 0; pass < 3; pass += 1) {
      const place = placeOf({
        mark,
        box,
        room: size,
        width: float.offsetWidth,
        height: float.offsetHeight,
        reach: T.reach,
      });
      float.dataset.side = place.side;
      float.style.setProperty("--float-x", `${place.left}px`);
      float.style.setProperty("--float-y", `${place.top}px`);
      float.style.setProperty("--float-origin", place.origin);
      float.style.setProperty(
        "--float-max",
        `${Math.max(0, Math.min(place.tallest, cap))}px`
      );
    }
  } else if (float) {
    float.style.setProperty("--float-max", "calc(100% - 2 * var(--space-2))");
    float.style.setProperty("--float-origin", "bottom center");
    float.style.setProperty(
      "--sheet-pb",
      "calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
    );
  }
  room.dataset.laid = "";
  readout();
}

/** PinCard: the thread opens at its newest entry's first line (or as near as its room scrolls). */
function settleRooms() {
  for (const holder of els.frame.querySelectorAll("[data-pin-room]")) {
    const newest = holder.querySelector('[data-slot="thread"] > li:last-child');
    holder.scrollTop = newest ? newest.offsetTop : holder.scrollHeight;
  }
}

/** Lays the frame out again every frame for `duration`: the well and the page reflow as a rail's width travels. */
function follow(duration) {
  const until = performance.now() + duration + 40;
  const step = () => {
    layout();
    if (performance.now() < until) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

/* ---- Motion. ---- */
/** How the open plays, from what stood before it: the list (or nothing) beside the page, no thread. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per surface the thread can open in, each on its house clock
function playOpen() {
  const { float, side, sheet, look } = built;
  const ok = motionOk();
  const runs = [];
  if (float && !float.dataset.sheet) {
    // PinFloat `grow`: from --press-scale as it fades in, over --dur-menu.
    runs.push(
      float.animate(
        ok
          ? [
              { opacity: 0, transform: `scale(${T.press})` },
              { opacity: 1, transform: "scale(1)" },
            ]
          : [{ opacity: 0 }, { opacity: 1 }],
        { duration: T.menu, easing: T.easeOut }
      )
    );
  } else if (float) {
    runs.push(
      float.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: T.menu,
        easing: T.easeOut,
      })
    );
  }
  const holds = side?.querySelector("[data-holds]");
  if (side && holds) {
    const to = Number(side.style.getPropertyValue("--side-w"));
    if (listOpen) {
      // A hand-off: the list's rail tweens to the thread's width (morph)
      // while the list fades out where it stood and the thread fades in.
      const was = document.createElement("div");
      was.className = "side-was";
      was.style.setProperty("--was-w", String(T.railW));
      const kind = state.case === "short" ? "short" : "long";
      was.append(first(PARTS[`rail-${kind}-beside`]));
      side.append(was);
      const fadeOut = was.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: T.exit,
        easing: T.easeOut,
        fill: "forwards",
      });
      fadeOut.finished.then(() => was.remove()).catch(() => was.remove());
      runs.push(fadeOut);
      runs.push(
        holds.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: T.morph,
          easing: T.easeDrawer,
        })
      );
      if (ok) {
        runs.push(
          side.animate([{ width: `${T.railW}px` }, { width: `${to}px` }], {
            duration: T.morph,
            easing: T.easeDrawer,
          })
        );
      }
    } else {
      // PreviewPane `railIn`: in from its end over --dur-panel on --ease-drawer.
      runs.push(
        side.animate(
          ok
            ? [
                { width: "0px", opacity: 0 },
                { width: `${to}px`, opacity: 1 },
              ]
            : [{ opacity: 0 }, { opacity: 1 }],
          {
            duration: ok ? T.panel : ms("--dur-fade", 200),
            easing: T.easeDrawer,
          }
        )
      );
    }
  }
  if (sheet && look.stands === "row") {
    const thread = sheet.querySelector('[data-slot="row-thread"]');
    runs.push(unfoldRun(thread));
  } else if (sheet && look.stands === "bottom") {
    runs.push(
      sheet.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: T.menu,
        easing: T.easeOut,
      })
    );
  }
  follow(
    Math.max(
      0,
      ...runs.map((run) => Number(run.effect?.getTiming().duration) || 0)
    )
  );
  return runs;
}
function unfoldRun(node) {
  const height = node.getBoundingClientRect().height / built.s;
  return node.animate(
    motionOk()
      ? [
          { height: "0px", opacity: 0, overflow: "hidden" },
          { height: `${height}px`, opacity: 1, overflow: "hidden" },
        ]
      : [{ opacity: 0 }, { opacity: 1 }],
    { duration: motionOk() ? T.pop : T.control, easing: T.easeOut }
  );
}

/** The thread's Close: it goes the way it came, then the frame stands without it. */
function wireThread() {
  const { float, side, sheet } = built;
  const holder =
    side?.querySelector("[data-holds]") ??
    sheet?.querySelector('[data-slot="row-thread"], [data-holds]') ??
    float;
  const close = holder?.querySelector('button[aria-label="Close"]');
  close?.addEventListener("click", async () => {
    const runs = [];
    if (holder === float) {
      runs.push(
        float.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: T.control,
          easing: T.easeOut,
          fill: "forwards",
        })
      );
    } else if (side) {
      const from = side.getBoundingClientRect().width / built.s;
      runs.push(
        side.animate(
          motionOk()
            ? [
                { width: `${from}px`, opacity: 1 },
                {
                  width: `${listOpen ? T.railW : 0}px`,
                  opacity: listOpen ? 0.6 : 0,
                },
              ]
            : [{ opacity: 1 }, { opacity: 0 }],
          { duration: T.exit, easing: T.easeOut, fill: "forwards" }
        )
      );
      follow(T.exit);
    } else {
      runs.push(
        holder.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: T.exit,
          easing: T.easeOut,
          fill: "forwards",
        })
      );
    }
    await Promise.all(runs.map((run) => run.finished.catch(() => undefined)));
    state.open = false;
    render({ play: null });
  });
}

/* ---- The readout: what the person reads in this frame. ---- */
/** The open thread's readout: where it stands, its size, and the agent's reply against the room it scrolls in. */
function threadReadout() {
  const { look, float, side, sheet } = built;
  const holder =
    side?.querySelector("[data-holds]") ??
    sheet?.querySelector('[data-slot="row-thread"], [data-holds]') ??
    float;
  const reply = holder?.querySelector('li[data-by="agent"]');
  const scroller =
    look.stands === "row"
      ? sheet.querySelector('[data-slot="rows"]')
      : holder?.querySelector("[data-pin-room]");
  if (!(reply && scroller)) {
    return "";
  }
  const h = Math.round(reply.getBoundingClientRect().height / built.s);
  const roomH = Math.round(scroller.clientHeight);
  const box = holder.getBoundingClientRect();
  const where = {
    card: "a card beside the comment",
    sheet: "a drawer at the bottom",
    rail: "Comments, widened to hold it",
    row: "its row of the Comments list",
    panel: "the panel on the right",
    bottom: "a drawer at the bottom",
  }[els.frame.dataset.stands];
  const size = `${Math.round(box.width / built.s)} × ${Math.round(box.height / built.s)}`;
  return h <= roomH
    ? `In ${where} (${size}): the agent's reply, ${h}px of text, reads whole in a ${roomH}px room.`
    : `In ${where} (${size}): the agent's reply is ${h}px of text in a ${roomH}px room, ${h - roomH}px of it a scroll away.`;
}

function readout() {
  const { look, float } = built;
  let text = "";
  if (look.composing) {
    const w = float
      ? Math.round(float.getBoundingClientRect().width / built.s)
      : 0;
    text = float?.dataset.sheet
      ? "Writing a new comment: the composer is a drawer at the bottom, the spot lifted above it."
      : `Writing a new comment: the composer is ${w}px wide, beside its spot.`;
  } else if (look.thread) {
    text = threadReadout();
  } else {
    text = "The comment is closed. Press its pin or its row to open it.";
  }
  els.readout.textContent = text;
}

/* ---- The switches. ---- */
function syncSwitches() {
  for (const [slot, value] of [
    ["option", state.option],
    ["case", state.case],
    ["screen", state.screen],
  ]) {
    for (const button of document.querySelectorAll(
      `[data-slot="${slot}"] button`
    )) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.value === value)
      );
    }
  }
  els.rule.textContent = RULES[state.option];
}
for (const slot of ["option", "case", "screen"]) {
  for (const button of document.querySelectorAll(
    `[data-slot="${slot}"] button`
  )) {
    button.addEventListener("click", () => {
      state[slot] = button.dataset.value;
      if (slot === "case") {
        listOpen = LIST_DEFAULT[state.case];
        state.open = true;
      }
      if (slot === "option") {
        state.open = true;
      }
      render({ play: "open" });
    });
  }
}
document.querySelector('[data-slot="replay"]').addEventListener("click", () => {
  state.open = true;
  render({ play: "open" });
});

/** Draws the frame for the state, the page scrolled so the comment stands near the well's foot, then plays how it opens. */
function render({ play }) {
  for (const run of document.getAnimations()) {
    run.cancel();
  }
  syncSwitches();
  build();
  const { scroller, target, well } = built;
  const top = inWell(target).y + scroller.scrollTop;
  scroller.scrollTop = Math.max(0, top - TARGET_AT * well.clientHeight);
  layout();
  settleRooms();
  layout();
  scroller.addEventListener("scroll", () => layout(), { passive: true });
  save();
  if (play === "open") {
    playOpen();
  } else if (
    play === "list" &&
    built.side &&
    !built.side.querySelector("[data-holds]")
  ) {
    // PreviewPane `railIn`: in from its end over --dur-panel on --ease-drawer.
    built.side.animate(
      motionOk()
        ? [
            { width: "0px", opacity: 0 },
            { width: `${T.railW}px`, opacity: 1 },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: motionOk() ? T.panel : ms("--dur-fade", 200),
        easing: T.easeDrawer,
      }
    );
    follow(T.panel);
  }
  root.dataset.ready = String(Number(root.dataset.ready ?? 0) + 1);
}

new ResizeObserver(() => {
  if (!built) {
    return;
  }
  const s = scaleOf(built.look.screen);
  if (Math.abs(s - built.s) > 0.001) {
    built.s = s;
    els.fit.style.setProperty("--s", String(s));
    layout();
  }
}).observe(document.querySelector(".stage"));

await document.fonts.ready;
render({ play: "open" });
