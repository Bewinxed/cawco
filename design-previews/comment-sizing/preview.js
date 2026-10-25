/**
 * The comment sizing preview: the preview pane at a real size, its decision
 * page, the comments' pills on it, the Comments rail, and the open thread
 * where the chosen option puts it. Every comment part is the real
 * component's markup (parts.js, captured by capture/capture.ts); this file
 * places them, by the pane's own rules (PinFloat's placement, ported line
 * for line below) and each option's sizes, and plays the house motion for
 * opening and handing off: the card is its pill grown (PinFloat `grow`:
 * one surface from the pill's shape to the card's, the thread fading in
 * once it has room) and goes back into it (`shrink`), and keeps to its
 * pill as the page scrolls (PinFloat `plan`),
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
/**
 * B: the card's tallest, min(480px, 50%) of the well. Our call, not the
 * report's min(400px, 40%) (c-pin-card-short-max): that cap was under what a
 * three-entry one-line exchange needs as a card (344px), so B sent every
 * thread to Comments and never drew the small card it is named for.
 */
const B_CAP = { px: 480, share: 0.5 };
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
  railW: px("--c-comments-w", 320),
  composeW: px("--c-pin-card-w", 280),
  popScale: px("--pop-scale", 0.92),
  popRise: px("--pop-rise", 8),
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
  a: "Every comment opens next to what it is about, growing out of its pin, two fifths of the page area wide (280 to 480px) and as tall as what it holds. Near the foot it moves up to stay whole. Beside an element too wide to stand next to, it stands above or below it when that room holds it whole, else beside its pin over the element; it scrolls inside only when the whole page area can't hold it. On a phone it is a drawer at the bottom. This is what ships today.",
  b: "A comment opens in a 320px card next to what it is about, at most 480px or half the page area tall. One that needs more opens in Comments instead, which widens to 400px to hold it. On a phone a short one is a drawer at the bottom and a long one opens in its row of the Comments list.",
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
  bodyOf(shell).replaceChildren();
  shell.removeAttribute("style");
  shell.removeAttribute("data-side");
  return shell;
};
/** What a float holds (PinFloat `pin-body`): the one part that scrolls. */
const bodyOf = (float) => float.querySelector('[data-slot="pin-body"]');

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
  } else if (thread && state.option === "b") {
    // B: a thread whose whole exchange fits the card's cap stays a card
    // (a phone's drawer); a longer one goes to Comments (a phone's row).
    const fits = !needsRail(phone);
    if (phone) {
      stands = fits ? "sheet" : "row";
    } else {
      stands = fits ? "card" : "rail";
    }
  } else if (thread) {
    stands = {
      a: phone ? "sheet" : "card",
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
  delete els.frame.dataset.needs;
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
    bodyOf(float).append(threadParts(true));
    room.append(float);
  } else if (stands === "compose") {
    float = floatShell(phone ? "float-bare-sheet" : "float-bare");
    if (!phone) {
      // PinFloat: the composer mounts closed, and opens once it is placed (render).
      float.dataset.state = "closed";
    }
    bodyOf(float).append(fragment(PARTS.composer));
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
  // PreviewPane `railAway` (main 9d00bda27, PreviewPane.svelte:1782-1785,
  // 4378): on a phone the list's foot sheet stands aside while a thread or a
  // composer stands as the well's foot drawer, so neither covers the other.
  const railAway = phone && float !== null;
  if (phone) {
    if (stands === "row" || stands === "bottom" || (listOpen && !railAway)) {
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
    if (stands === "panel" || stands === "rail") {
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

/** B's card's tallest in a well `wellH` tall. */
const bCap = (wellH) => Math.min(B_CAP.px, B_CAP.share * wellH);

/** B: whether the whole exchange needs more than the card's tallest, measured on the card (a phone's drawer) at its width, nothing capping it. */
function needsRail(phone) {
  const screen = SCREENS[state.screen];
  const wellH = screen.h - HEAD_H;
  const probe = floatShell(phone ? "float-sheet" : "float");
  bodyOf(probe).append(threadParts(true));
  probe.style.cssText = `position: absolute; visibility: hidden; inset-block: 0 auto; inset-inline-start: 0; --float-w: ${B_CARD_W}px; --float-max: none; max-block-size: none;`;
  const host = document.createElement("div");
  host.className = "pin-room";
  host.style.cssText = `inline-size: ${screen.w}px; block-size: ${wellH}px; position: fixed; inset: 0; visibility: hidden;`;
  host.append(probe);
  document.body.append(host);
  const room = probe.querySelector("[data-pin-room]");
  const natural = probe.offsetHeight - room.clientHeight + room.scrollHeight;
  host.remove();
  const cap = bCap(wellH);
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
/** Two boxes as one. */
const union = (parts) => {
  const left = Math.min(...parts.map((one) => one.x));
  const top = Math.min(...parts.map((one) => one.y));
  return {
    x: left,
    y: top,
    w: Math.max(...parts.map((one) => one.x + one.w)) - left,
    h: Math.max(...parts.map((one) => one.y + one.h)) - top,
  };
};

/** PinFloat `decide`: where it stands (the side, what it stands beside, its tallest), chosen once. */
function decideOf({ mark, whole, room, width, natural, cap }) {
  const { gap, clear } = T;
  const left = Math.max(0, whole.x);
  const top = Math.max(0, whole.y);
  const right = Math.min(room.w, whole.x + whole.w);
  const bottom = Math.min(room.h, whole.y + whole.h);
  const subject =
    right > left && bottom > top
      ? { x: left, y: top, w: right - left, h: bottom - top }
      : mark;
  const full = Math.max(0, Math.min(room.h - 2 * gap, cap));
  const tall = Math.min(natural, full);
  const pill = mark;
  const fits = (about) => {
    if (about.x + about.w + clear + width <= room.w - gap) {
      return "right";
    }
    return about.x - clear - width >= gap ? "left" : null;
  };
  const under = room.h - (subject.y + subject.h + clear) - gap;
  const over = subject.y - clear - gap;
  const nextTo = fits(subject);
  if (nextTo) {
    return { along: "subject", side: nextTo, max: full };
  }
  if (under >= tall) {
    return { along: "subject", side: "bottom", max: Math.min(under, full) };
  }
  if (over >= tall) {
    return { along: "subject", side: "top", max: Math.min(over, full) };
  }
  const alone = fits(pill);
  if (alone) {
    return { along: "pill", side: alone, max: full };
  }
  const belowPill = room.h - (pill.y + pill.h + clear) - gap;
  const abovePill = pill.y - clear - gap;
  return belowPill >= tall || belowPill >= abovePill
    ? { along: "pill", side: "bottom", max: Math.max(0, Math.min(belowPill, full)) }
    : { along: "pill", side: "top", max: Math.max(0, Math.min(abovePill, full)) };
}

/** PinFloat `place`: where it stands now, from the plan and the pill as it stands, held whole in the well. */
function standOf({ plan, mark, whole, room, width, natural }) {
  const { gap, clear } = T;
  const tall = Math.min(natural, plan.max);
  const inX = (x) => Math.max(gap, Math.min(x, room.w - width - gap));
  const inY = (y) => Math.max(gap, Math.min(y, room.h - gap - tall));
  const about = plan.along === "pill" ? mark : whole;
  let left = mark.x;
  let top = mark.y;
  if (plan.side === "right") {
    left = about.x + about.w + clear;
  } else if (plan.side === "left") {
    left = about.x - clear - width;
  } else if (plan.side === "bottom") {
    top = about.y + about.h + clear;
  } else {
    top = about.y - clear - tall;
  }
  left = inX(left);
  top = inY(top);
  const inside = (value, most) => Math.max(0, Math.min(value, most));
  return {
    left,
    top,
    side: plan.side,
    max: plan.max,
    origin: {
      x: inside(mark.x + mark.w / 2 - left, width),
      y: inside(mark.y + mark.h / 2 - top, tall),
    },
  };
}

/** PinFloat's `natural`: its height with nothing capping it, its body's and its thread's room's overflow counted. */
const naturalOf = (float) => {
  const body = bodyOf(float);
  let past = body ? body.scrollHeight - body.clientHeight : 0;
  for (const room of float.querySelectorAll("[data-pin-room]")) {
    past += room.scrollHeight - room.clientHeight;
  }
  return float.offsetHeight + Math.max(0, past);
};

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
  // The rail's foot sheet covers nothing: the page ends where it begins
  // (PreviewPane.svelte:4051-4054, `--frame-h: calc(100% - railSheetH)`),
  // and so do the page's pills.
  const railH = sheet ? sheet.getBoundingClientRect().height / built.s : 0;
  scroller.style.insetBlockEnd = `${railH}px`;
  room.style.insetBlockEnd = `${railH}px`;
  room.style.overflow = railH > 0 ? "clip" : "";
  // Under a foot drawer, or past the page's end over the rail's sheet, the
  // page is scrolled as little as lifts what the comment is about clear
  // above it (the overlay's `reveal`), never so far that its pill leaves the top.
  if (look.phone) {
    const over = Math.min(
      size.h - railH,
      float?.dataset.sheet ? inWell(float).y : Number.POSITIVE_INFINITY
    );
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
    const whole = union([mark, box]);
    const cap =
      state.option === "b" && !look.composing
        ? bCap(size.h)
        : Number.POSITIVE_INFINITY;
    const width = float.offsetWidth;
    const natural = naturalOf(float);
    // PinFloat `plan`: chosen again only when what it was chosen from
    // changes size, never as the page scrolls under it.
    const key = [
      size.w,
      size.h,
      width,
      Math.round(natural),
      `${mark.w}x${mark.h}`,
      `${Math.round(whole.w)}x${Math.round(whole.h)}`,
    ].join();
    if (key !== built.planFor || !built.plan) {
      const before = built.plan ? { ...built.place } : null;
      built.planFor = key;
      built.plan = decideOf({ mark, whole, room: size, width, natural, cap });
      built.replanned = before;
    }
    const place = standOf({
      plan: built.plan,
      mark,
      whole,
      room: size,
      width,
      natural,
    });
    // A new plan while it stands: it travels there over --dur-morph on
    // --ease-drawer, from where it was drawn.
    if (built.replanned && built.opened && motionOk()) {
      const from = built.replanned;
      float.animate(
        [
          { translate: `${from.left - place.left}px ${from.top - place.top}px` },
          { translate: "0px 0px" },
        ],
        { duration: T.morph, easing: T.easeDrawer }
      );
    }
    built.replanned = null;
    built.place = place;
    built.mark = mark;
    float.dataset.side = place.side;
    float.style.setProperty("--float-x", `${place.left}px`);
    float.style.setProperty("--float-y", `${place.top}px`);
    float.style.setProperty(
      "--float-origin",
      `${place.origin.x}px ${place.origin.y}px`
    );
    float.style.setProperty("--float-max", `${place.max}px`);
  } else if (float) {
    float.style.setProperty("--float-max", "calc(100% - 2 * var(--space-2))");
    if (state.option === "b" && !look.composing) {
      // B's drawer stops at its card's tallest, not the drawer's 70%.
      float.style.maxBlockSize = `${bCap(size.h)}px`;
    }
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
/** The card's one surface (PinFloat `pin-surface`). */
const surfaceOf = (float) => float.querySelector('[data-slot="pin-surface"]');

/** A colour token as the page computes it now. */
const colourOf = (token) => {
  const probe = document.createElement("i");
  probe.style.color = `var(${token})`;
  probe.hidden = true;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};

/** The pill's shape in the card's own coordinates (PinFloat `pillShape`): the pill, sent, is filled with `action-solid`. */
const pillShapeOf = () => {
  const { place, mark } = built;
  if (!(place && mark)) {
    return null;
  }
  return {
    left: `${mark.x - place.left}px`,
    top: `${mark.y - place.top}px`,
    width: `${mark.w}px`,
    height: `${mark.h}px`,
    borderRadius: `${mark.h / 2}px`,
    backgroundColor: colourOf("--action-solid"),
    borderColor: colourOf("--action-solid"),
  };
};

/** The surface as it stands (PinFloat `surfaceShape`). */
const surfaceShapeOf = (el) => {
  const style = getComputedStyle(el);
  return {
    left: `${el.offsetLeft}px`,
    top: `${el.offsetTop}px`,
    width: `${el.offsetWidth}px`,
    height: `${el.offsetHeight}px`,
    borderRadius: style.borderTopLeftRadius,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderTopColor,
  };
};

/**
 * PinFloat `grow`: the card is its pill grown, one surface from the pill's
 * shape to the card's over --dur-pop on --ease-out (the top bar's card's
 * own open, motion/hang), the thread waiting two fifths of it, then coming
 * in as the shape lands.
 */
function growRuns(float) {
  const shape = surfaceOf(float);
  const body = bodyOf(float);
  const from = pillShapeOf();
  if (!(motionOk() && from)) {
    return [
      float.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: T.control,
        easing: T.easeOut,
      }),
    ];
  }
  const to = surfaceShapeOf(shape);
  return [
    shape.animate([from, to], { duration: T.pop, easing: T.easeOut }),
    body.animate(
      [
        { opacity: 0, filter: "blur(var(--part-blur))" },
        { opacity: 1, filter: "blur(0px)" },
      ],
      {
        delay: T.pop * 0.4,
        duration: T.pop * 0.6,
        easing: T.easeOut,
        fill: "backwards",
      }
    ),
  ];
}

/** PinFloat `shrink`: back into the pill over --dur-exit, the thread gone in the first half. */
function shrinkRuns(float) {
  const shape = surfaceOf(float);
  const body = bodyOf(float);
  const to = pillShapeOf();
  if (!(motionOk() && to)) {
    return [
      float.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: T.control,
        easing: T.easeOut,
        fill: "forwards",
      }),
    ];
  }
  const from = surfaceShapeOf(shape);
  const shown = getComputedStyle(body).opacity;
  for (const run of [...shape.getAnimations(), ...body.getAnimations()]) {
    run.cancel();
  }
  return [
    shape.animate([from, to], {
      duration: T.exit,
      easing: T.easeOut,
      fill: "forwards",
    }),
    body.animate([{ opacity: shown }, { opacity: 0 }], {
      duration: T.exit / 2,
      easing: T.easeOut,
      fill: "forwards",
    }),
  ];
}

/** How the open plays, from what stood before it: the list (or nothing) beside the page, no thread. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per surface the thread can open in, each on its house clock
function playOpen() {
  const { float, side, sheet, look } = built;
  const ok = motionOk();
  const runs = [];
  if (float && surfaceOf(float)) {
    runs.push(...growRuns(float));
  } else if (float && !float.dataset.sheet) {
    // The composer: the kit's pop, out of the pill, on its `data-state`.
    runs.push(...float.getAnimations());
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
    if (holder === float && surfaceOf(float)) {
      runs.push(...shrinkRuns(float));
    } else if (holder === float) {
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
/**
 * How much of `node` a person sees, px: its box cut by every box that clips
 * it (its scroller, a sheet, the well, the frame), `clipped`; then less what
 * stands over it (a drawer, a card, the rail or panel it is not in), `seen`.
 */
function inView(node) {
  const r = node.getBoundingClientRect();
  let { top, bottom } = r;
  for (
    let up = node.parentElement;
    up && up !== els.fit;
    up = up.parentElement
  ) {
    if (getComputedStyle(up).overflowY !== "visible") {
      const b = up.getBoundingClientRect();
      top = Math.max(top, b.top);
      bottom = Math.min(bottom, b.bottom);
    }
  }
  const clipped = Math.max(0, bottom - top);
  for (const el of [built.float, built.sheet, built.side]) {
    if (!el || el.contains(node)) {
      continue;
    }
    const b = el.getBoundingClientRect();
    if (b.left >= r.right || b.right <= r.left) {
      continue;
    }
    if (b.top <= top && b.bottom >= bottom) {
      bottom = top;
    } else if (b.top > top && b.top < bottom && b.bottom >= bottom) {
      bottom = b.top;
    } else if (b.bottom > top && b.bottom < bottom && b.top <= top) {
      top = b.bottom;
    }
  }
  return {
    clipped: clipped / built.s,
    seen: Math.max(0, bottom - top) / built.s,
  };
}

/** The open thread's readout: where it stands, its size, and how much of the agent's reply a person sees. */
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
  const view = inView(reply);
  const seen = Math.min(h, Math.round(view.seen));
  const under = Math.round(view.clipped - view.seen);
  els.readout.dataset.visible = `${seen}/${h}`;
  let read = `In ${where} (${size}): the agent's reply, ${h}px of text, is all in view.`;
  if (seen < h) {
    const covered = under > 0 ? `, ${under}px of it under what stands over it` : "";
    const room = h > roomH ? ` (it scrolls in a ${roomH}px room)` : "";
    read = `In ${where} (${size}): ${seen}px of the agent's ${h}px reply is in view${covered}; the rest is a scroll away${room}.`;
  }
  if (state.option !== "b") {
    return read;
  }
  const [need, cap] = (els.frame.dataset.needs ?? "0/0").split("/");
  const went = Number(need) > Number(cap) ? "goes to Comments" : "stays a card";
  return `${read} B's cap is our call, not the report's: a card holds at most min(480px, half the page area), ${cap}px here; this exchange needs ${need}px, so it ${went}.`;
}

function readout() {
  const { look, float } = built;
  delete els.readout.dataset.visible;
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
  const { scroller, target, well, float } = built;
  // The composer opens once it is placed (PinFloat `opened`): from
  // `closed` to `open`, the kit's pop. A frame drawn again for what is not
  // an opening (the list toggled) shows it standing, with no transition.
  // The card grows from its pill in `playOpen`.
  const card =
    float && !float.dataset.sheet && float.dataset.state ? float : null;
  const opening = play === "open";
  if (card && !opening) {
    card.style.transition = "none";
  }
  const top = inWell(target).y + scroller.scrollTop;
  scroller.scrollTop = Math.max(0, top - TARGET_AT * well.clientHeight);
  layout();
  settleRooms();
  layout();
  scroller.addEventListener("scroll", () => layout(), { passive: true });
  if (card) {
    getComputedStyle(card).translate;
    card.dataset.state = "open";
    if (!opening) {
      getComputedStyle(card).opacity;
      card.style.transition = "";
    }
  }
  save();
  built.opened = true;
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
