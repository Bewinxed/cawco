/**
 * The comment sizing preview: the preview pane at a real size, its decision
 * page, the comments' pills on it, the Comments rail, and the open thread
 * where the chosen option puts it. Every comment part is the real
 * component's markup (parts.js, captured by capture/capture.ts); option A's
 * card and composer are the product's own PinFloat, live (live-card/card.js,
 * built from the dashboard's source by apps/dashboard/scripts/comment-card.vite.ts):
 * the thread's card hung from its pin's foot (HangCard), sliding out of it
 * and back, where it stands and how it keeps still as the page scrolls, all
 * the product's, never a copy; this file only tells it where the pill and
 * what it is about stand, as the page's overlay tells the pane. It places
 * the rest by each option's sizes, and plays the house motion for handing
 * off: a rail changing size tweens its width (motion/morph: --dur-morph on
 * --ease-drawer) while what it held fades out and what it holds fades in,
 * a rail arriving comes in from its end (PreviewPane `railIn`: --dur-panel
 * on --ease-drawer) and goes closing to none (`railOut`: --dur-exit on
 * --ease-out), and what opens inside a list unfolds (motion/fold `unfold`:
 * --dur-pop on --ease-out) while the rows under it slide.
 */
import { mountCard } from "./live-card/card.js";
import { PARTS } from "./parts.js";
import { mountStateSwitcher } from "./state-switcher.js";

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
/** B's and C's card and composer stand `--space-2` from the pill as drawn, past its focus ring. */
T.clear = T.gap + 4;
const motionOk = () =>
  matchMedia("(prefers-reduced-motion: no-preference)").matches;

const RULES = {
  a: "Every comment opens next to what it is about, growing out of its pin, two fifths of the page area wide (280 to 480px) and as tall as what it holds. Near the foot it moves up to stay whole. Beside an element too wide to stand next to, it stands above or below it when that room holds it whole, else beside its pin over the element; it scrolls inside only when the whole page area can't hold it. On a phone it is a drawer at the bottom. This is what ships today.",
  b: "A comment opens in a 320px card next to what it is about, at most 480px or half the page area tall. One that needs more opens in Comments instead, which widens to 400px to hold it. On a phone a short one is a drawer at the bottom and a long one opens in its row of the Comments list.",
  c: "A new comment is written in a 280px card next to its spot. Every thread opens in a panel on the right, as tall as the page area, 400px to start, dragged anywhere from 300px to half the pane, in place of the Comments list. On a phone it is a drawer at the bottom.",
};

/* ---- What is shown: the option, the comment and the screen are the
   switcher's (the address names them, so they are kept through a reload); C's panel
   as last dragged is kept here. ---- */
const KEY = "cawco:comment-sizing";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
})();
const params = new URLSearchParams(location.search);
const CASES = ["long", "closed", "short", "new"];
const switcher = mountStateSwitcher({
  // The desk's 1440 at its real size, with the stage's padding (--space-6, 21px).
  width: 1482,
  axes: true,
  label: "Comment sizing states",
  groups: [
    {
      key: "option",
      label: "Option",
      states: [
        { value: "a", label: "A · Beside the comment" },
        { value: "b", label: "B · Small card, long ones in Comments" },
        { value: "c", label: "C · A panel on the right" },
      ],
    },
    {
      key: "case",
      label: "Comment",
      states: [
        { value: "long", label: "Your long reply, Comments open" },
        { value: "closed", label: "Your long reply, Comments closed" },
        { value: "short", label: "A short exchange" },
        { value: "new", label: "Writing a new one" },
      ],
    },
    {
      key: "screen",
      label: "Screen",
      initial: "window",
      states: [
        { value: "desk", label: "Desk, 1440" },
        { value: "window", label: "Your window, 1037" },
        { value: "phone", label: "Phone, 390" },
      ],
    },
  ],
  onchange: (next, previous) => {
    state.option = next.option;
    state.case = next.case;
    state.screen = next.screen;
    if (next.case !== previous.case) {
      listOpen = LIST_DEFAULT[state.case];
    }
    state.open = true;
    render({ play: "open" });
  },
});
const state = {
  option: switcher.state.option,
  case: switcher.state.case,
  screen: switcher.state.screen,
  /** The thread stands open: closed by its Close, opened by its pill or its row. */
  open: true,
  /** C's panel as it was last dragged. */
  panelW: Number(params.get("panel")) || saved.panelW || THREAD_W,
};
const save = () => {
  localStorage.setItem(KEY, JSON.stringify({ panelW: state.panelW }));
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
/** The thread's own parts (PinCard), its head carrying the pill when its page pill is out of reach. */
const threadParts = (beside) => {
  const kind = state.case === "short" ? "short" : "long";
  return fragment(PARTS[`card-${kind}-${beside ? "beside" : "held"}`]);
};

/* ---- What the state means. ---- */
const LIST_DEFAULT = { long: true, closed: false, short: true, new: true };
let listOpen = LIST_DEFAULT[state.case];

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

  // The float over the page: the card (A, B), a foot sheet (A, B on a
  // phone), the composer. Each is the product's PinFloat, live: it stands,
  // opens, keeps still as the page scrolls and goes by its own rules, at its
  // option's width (B's card and composer 320px, C's composer the
  // composer's 280: the reading width it stands at, `--c-pin-card-reading-w`,
  // set on the room) and, B's, its card's tallest (`--b-cap`, preview.css).
  liveCard?.unmount();
  liveCard = null;
  const floats = stands === "card" || stands === "sheet" || stands === "compose";
  if (state.option === "b") {
    room.style.setProperty("--c-pin-card-reading-w", `${B_CARD_W}px`);
  } else if (state.option === "c") {
    room.style.setProperty("--c-pin-card-reading-w", "var(--c-pin-card-w)");
  }
  if (floats) {
    // What the person reads is read again once the card stands open (hang's
    // `grown`, on the card): placed and drawn out of its pin, not shut
    // behind its cut as it was when the frame was laid out.
    room.addEventListener("grown", () => readout(), { capture: true });
    liveCard = mountCard(room, {
      open: true,
      number: 3,
      mark: null,
      box: null,
      room: { w: 0, h: 0 },
      sheet: phone,
      bare: stands === "compose",
      fill: (holder) => {
        holder.append(
          stands === "compose" ? fragment(PARTS.composer) : threadParts(true)
        );
        if (stands !== "compose") {
          wireLive(holder);
          requestAnimationFrame(settleRooms);
        }
      },
    });
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
  const railAway = phone && floats;
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
  for (const el of [sheet, side, well]) {
    if (el) {
      sizes.observe(el);
    }
  }
  return built;
}
let sizes = null;
/** Option A's live card (live-card/card.js `mountCard`), while the frame holds one. */
let liveCard = null;
/** The float standing over the page: the live card's element (the card, the composer or the foot sheet). */
const floatOf = () => liveCard?.float ?? null;

/** B's card's tallest in a well `wellH` tall. */
const bCap = (wellH) => Math.min(B_CAP.px, B_CAP.share * wellH);

/** B: whether the whole exchange needs more than the card's tallest, measured on the card (a phone's drawer) at its width, nothing capping it. */
function needsRail(phone) {
  const screen = SCREENS[state.screen];
  const wellH = screen.h - HEAD_H;
  // What PinFloat's card (or its foot sheet) holds, as it pads it, at B's width.
  const probe = document.createElement("div");
  probe.className = phone
    ? "flex min-h-0 min-w-0 flex-col px-space-3 pt-space-3 pb-(--sheet-pb)"
    : "flex min-h-0 min-w-0 flex-col gap-space-2 p-space-3";
  probe.append(threadParts(true));
  probe.style.cssText = `position: absolute; visibility: hidden; inset-block: 0 auto; inset-inline-start: 0; inline-size: ${B_CARD_W}px; --sheet-pb: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));`;
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

/** Every pill on its element, the float beside its pill, and the page lifted clear of a foot sheet. */
function layout() {
  if (!built) {
    return;
  }
  const { well, scroller, room, pills, target, sheet, look } = built;
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
    const standing = floatOf();
    const over = Math.min(
      size.h - railH,
      standing?.dataset.sheet ? inWell(standing).y : Number.POSITIVE_INFINITY
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
  const pill = pills.get(look.composing ? "away-card" : "away-rail");
  const mark = pill
    ? {
        x: Number(pill.style.getPropertyValue("--x")),
        y: Number(pill.style.getPropertyValue("--y")),
        w: pill.firstElementChild.getBoundingClientRect().width / built.s,
        h: T.pin,
      }
    : null;
  if (liveCard) {
    // As the page's overlay tells the pane where the pill stands (and the
    // pane tells PinFloat): the pill, what it is about, the well's room. A
    // pill scrolled out of the well is out of view.
    const roomBox = { w: room.clientWidth, h: room.clientHeight };
    const shown =
      mark &&
      mark.y + mark.h > 0 &&
      mark.y < roomBox.h &&
      mark.x + mark.w > 0 &&
      mark.x < roomBox.w;
    liveCard.set({
      mark: shown ? mark : null,
      box: shown ? inWell(target) : null,
      room: roomBox,
    });
  }
  if (state.option === "b") {
    room.style.setProperty("--b-cap", `${Math.round(bCap(size.h))}px`);
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
  const { side, sheet, look } = built;
  const ok = motionOk();
  const runs = [];
  // The float over the page (PinFloat, live) opens itself: the card hung
  // from its pin and out of its foot, the composer by the kit's pop, the
  // foot sheet by its fade.
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

/** A thread in the rail, the panel or a row: its Close, it goes the way it came, then the frame stands without it. */
function wireThread() {
  const { side, sheet } = built;
  const holder =
    side?.querySelector("[data-holds]") ??
    sheet?.querySelector('[data-slot="row-thread"], [data-holds]');
  const close = holder?.querySelector('button[aria-label="Close"]');
  close?.addEventListener("click", async () => {
    const runs = [];
    if (side) {
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

/**
 * The live card's Close: PinFloat folds it back into its pin's foot (its
 * own close, `--dur-exit`), and once it has left the room (its block let it
 * go), the frame stands without it.
 */
function wireLive(holder) {
  const close = holder.querySelector('button[aria-label="Close"]');
  close?.addEventListener("click", () => {
    const leaving = liveCard;
    const room = built?.room;
    if (!(leaving && room)) {
      return;
    }
    const gone = new MutationObserver(() => {
      if (!room.querySelector('[data-slot="pin-card"]')) {
        gone.disconnect();
        if (liveCard === leaving) {
          state.open = false;
          render({ play: null });
        }
      }
    });
    gone.observe(room, { childList: true, subtree: true });
    leaving.set({ open: false });
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
  for (const el of [floatOf(), built.sheet, built.side]) {
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
  const { look, side, sheet } = built;
  const float = floatOf();
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
  const { look } = built;
  const float = floatOf();
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

/* ---- The switcher follows what the frame moved itself (Comments
   pressed opens or shuts the list), and the option's rule. ---- */
function syncSwitches() {
  switcher.set({ option: state.option, case: state.case, screen: state.screen });
  els.rule.textContent = RULES[state.option];
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

// The frame's scale follows the stage's width, read in the next frame, never
// inside the observer's own delivery: there, laying the frame out again
// resized what it watched (WebKit: "ResizeObserver loop completed with
// undelivered notifications"). The root keeps its scrollbar's room
// (preview.css), so the scrollbar coming and going never changes that width.
let rescale = 0;
new ResizeObserver(() => {
  rescale ||= requestAnimationFrame(() => {
    rescale = 0;
    if (!built) {
      return;
    }
    const s = scaleOf(built.look.screen);
    if (Math.abs(s - built.s) > 0.001) {
      built.s = s;
      els.fit.style.setProperty("--s", String(s));
      layout();
    }
  });
}).observe(document.querySelector(".stage"));

await document.fonts.ready;
render({ play: "open" });
