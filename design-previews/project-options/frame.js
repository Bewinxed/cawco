/**
 * One frame of the project page at its own viewport: the options picked in
 * the URL's hash (index.js writes it), set together from the captured parts
 * (parts.js) the way the page stands them: the Shell's rail and its glass
 * (cuts of the live captures), the project's bar, the band (F1), the board
 * or the list, and the task pane or Caw's column beside it (a phone: the
 * pane is its own page, Caw's column a sheet). `today` shows the live page
 * as it was captured instead.
 *
 *   frame.html#w=1440&H=H1&fold=A&D=D2&state=rest&open=pane&place=B&K=review&jump=id
 *
 * What the frame does once the parts stand:
 * - folds the bar in its fold order until its three groups fit (`fitBar`);
 * - says every recorded time in the reader's zone (`localize`);
 * - runs the client's reconnect schedule for a stale read (`retryClock`);
 * - places the pane's strip edge where its strip sticks, and opens K1-review
 *   on the Result (`openOnReview`).
 */
import { PARTS } from "./parts.js";

const DEFAULTS = {
  w: "1440",
  today: "0",
  state: "rest",
  open: "none",
  view: "Board",
  H: "H1",
  fold: "A",
  D: "D2",
  P: "P1",
  T: "folded",
  C: "C1",
  K: "review",
  jump: "id",
  place: "B",
  narrow: "beside",
  F: "F1",
  S: "S2",
  seat: "idle",
  ask: "a",
};

export function readChoice(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, value]) => [key, params.get(key) ?? value])
  );
}

function part(key) {
  const html = PARTS[key];
  if (html === undefined) {
    throw new Error(`no part ${key}`);
  }
  return html;
}

const TODAY = { 1440: "today/desk.png", 1037: "today/window.png", 390: "today/phone.png" };

/**
 * The bar's fold order (ruling 4): the views fold first, then the step the
 * owner picks (A: the machine's name; B: New task and Filter into More),
 * then the other. H2′ has no views in its bar, so its order starts at step 2.
 */
const FOLD_ORDER = {
  H1: { A: ["", "v", "vn", "vna"], B: ["", "v", "va", "vna"] },
  H2: { A: ["", "n", "na"], B: ["", "a", "na"] },
};

/** Caw's seat as the choice draws it: idle, working, or asking in the picked take. */
const seatOf = (c) => (c.seat === "asking" ? `asking-${c.ask}` : c.seat);

function headKey(c) {
  return c.state === "stale" && c.F === "F2" ? "stale-F2" : c.state;
}

function phone(c) {
  if (c.open === "pane") {
    return `<div class="po-phone">${part(`pane:${c.K}:${c.jump}:phone`)}</div>`;
  }
  const stale = c.state === "stale";
  const ask = c.state === "waits" ? c.C : "C1";
  const top = part(`phonebar:top:${stale && c.F === "F2" ? "stale-F2" : "rest"}`);
  const band = stale && c.F === "F1" ? `<div class="po-phone-band">${part("band:phone")}</div>` : "";
  const popover = stale && c.F === "F2" ? `<div class="po-phone-popover">${part("popover:phone")}</div>` : "";
  const list = c.view === "Table" || c.P === "P2";
  const body = c.view === "Table" ? part(`table:phone:${c.state}:${c.T}`) : part(`phone:${c.P}:${c.state}:${ask}`);
  // S1 is not offered on the phone (ruling 7): the phone draws S2's row whichever the desk picks.
  const sheet = c.open === "caw" ? `<div class="po-phone-sheet">${part("caw:S2:phone")}</div>` : "";
  return `<div class="po-phone po-edge-host">
      <div class="po-phone-scroll po-edge-scroller ${list ? "po-phone-fill" : ""}" data-edge-scroller data-scroller>${band}${body}</div>
      <span aria-hidden="true" class="po-edge po-edge-top" data-edge="bar"></span>
      <span aria-hidden="true" class="po-edge po-edge-foot" data-edge="foot"></span>
      <div class="po-phone-top">${top}</div>${popover}
      <div class="po-phone-foot" data-askcaw="${c.open === "caw" ? "caw" : "none"}">${part(`phonebar:foot:${c.state === "waits" ? 2 : 0}`)}</div>${sheet}
    </div>`;
}

/**
 * A desk. The pane and Caw's column stand under the page bar (placement B,
 * the recommendation as re-ruled), or run the window's full height with
 * their bar on the page bar's line (A), the Shell's own group staying at the
 * window's edge over the side's trailing end, never inside its bar. At his
 * 1037 window a pane leaves the board a column under the phone's breakpoint:
 * under B it draws the board in its phone form beside the pane (`narrow` i)
 * or the pane takes the board's place with Back (ii); under A the page
 * column takes its phone form whole, its bar the title and More, its views,
 * hand and Ask Caw in a foot dock.
 */
function desk(c) {
  const ask = c.state === "waits" ? c.C : "C1";
  const band = c.state === "stale" && c.F === "F1" ? `<div class="po-band">${part("band:desk")}</div>` : "";
  const narrow = c.w === "1037" && c.open === "pane";
  let body = c.view === "Table" ? part(`table:desk:${c.state}:${c.T}`) : part(`board:${c.D}:${c.state}:${ask}`);
  if (narrow && c.view !== "Table") {
    body = part(`phone:P1:${c.state}:${ask}`);
  }
  let side = "";
  if (c.open === "pane") {
    side = `<div class="po-side po-side-pane">${part(`pane:${c.K}:${c.jump}:desk`)}</div>`;
  } else if (c.open === "caw") {
    side = `<div class="po-side po-side-caw">${part(`caw:${c.S}:desk`)}</div>`;
  }
  const rail = c.w === "1037" ? "window" : "desk";
  const head = `<div class="po-head" data-head-slot data-askcaw="${c.open}"></div>`;
  const content = `<div class="po-content ${c.view === "Table" ? "po-content-list" : ""} ${narrow ? "po-content-narrow" : ""}" data-scroller>${body}</div>`;
  let main = `<div class="po-main">${head}${band}<div class="po-body">${content}${side}</div></div>`;
  if (side && c.place === "A") {
    const shell = `<span data-img="shell/${rail}-tools.png" data-natural data-shell-edge class="po-shell-edge"></span>`;
    const page = narrow
      ? `<div class="po-page po-page-narrow">
          <div class="po-head">${part(`phonebar:narrow:${c.state === "stale" && c.F === "F2" ? "stale-F2" : "rest"}`)}</div>
          ${c.state === "stale" && c.F === "F1" ? `<div class="po-phone-band">${part("band:phone")}</div>` : ""}
          <div class="po-body">${content}</div>
          <div class="po-page-foot" data-askcaw="${c.open}">${part(`phonebar:foot:${c.state === "waits" ? 2 : 0}`)}</div>
        </div>`
      : `<div class="po-page">${head}${band}<div class="po-body">${content}</div></div>`;
    main = `<div class="po-main po-main-split">${page}${side}${shell}</div>`;
  } else if (narrow && c.narrow === "page") {
    const pane = `<div class="po-body po-body-page">${part(`pane:${c.K}:${c.jump}:phone`)}</div>`;
    main = `<div class="po-main">${head}${band}${pane}</div>`;
  }
  return `<div class="po-desk">
    <span data-img="shell/${rail}-rail.png" data-natural class="po-rail"></span>
    ${main}
  </div>`;
}

/** Under A the Shell's group stands at the window's edge: the side's bar keeps that room at its trailing end. */
function shellRoom(root) {
  const shell = root.querySelector("[data-shell-edge]");
  const side = root.querySelector(".po-main-split > .po-side");
  if (shell && side) {
    const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2")) || 0;
    const bar = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c-top-bar-h")) || 44;
    shell.style.insetBlockStart = `${(bar - shell.getBoundingClientRect().height) / 2}px`;
    const edge = side.getBoundingClientRect().right - shell.getBoundingClientRect().left;
    side.style.setProperty("--po-shell-room", `${edge + gap}px`);
  }
}

function build(c) {
  if (c.today === "1") {
    return `<img class="po-today" src="${TODAY[c.w]}" alt="The live project page as captured at ${c.w}">`;
  }
  return c.w === "390" ? phone(c) : desk(c);
}

/** A placeholder the stage drew for a picture becomes the picture, its classes kept. */
function pictures(root) {
  const waits = [];
  for (const span of root.querySelectorAll("[data-img]")) {
    const img = document.createElement("img");
    img.src = span.dataset.img;
    img.alt = "";
    img.className = span.className;
    for (const [name, value] of Object.entries(span.dataset)) {
      img.dataset[name] = value;
    }
    span.replaceWith(img);
    waits.push(
      img.decode().then(() => {
        if ("natural" in img.dataset) {
          img.style.inlineSize = `${img.naturalWidth / 2}px`;
          img.style.blockSize = `${img.naturalHeight / 2}px`;
        }
      })
    );
  }
  return Promise.all(waits);
}

/** Ask Caw, as what is open beside the page draws it, set into each bar's slot. */
function seatAskCaw(root, c) {
  for (const holder of root.querySelectorAll("[data-askcaw]")) {
    for (const slot of holder.querySelectorAll('[data-slot-part="askcaw"]')) {
      slot.innerHTML = part(`askcaw:${holder.dataset.askcaw}:${seatOf(c)}:${c.w === "390" ? "phone" : "desk"}`);
    }
  }
}

/** The view chosen is the pressed one, in the bar, the tab row and the pill. */
function view(root, name) {
  for (const button of root.querySelectorAll("[data-head] [aria-pressed]")) {
    if (button.matches("[data-waiting-toggle], [data-ask-caw]")) {
      continue;
    }
    const words = button.querySelector("span")?.textContent?.trim();
    button.setAttribute("aria-pressed", String(words === name));
  }
  for (const pill of root.querySelectorAll('[aria-label^="View: "]')) {
    pill.setAttribute("aria-label", `View: ${name}`);
    const words = pill.querySelector("span");
    if (words) {
      words.textContent = name;
    }
  }
}

/**
 * Whether a side group's controls stay inside its half less the bar's gap
 * toward the centre: the union of what it draws (a Range over its content,
 * since a trailing group overflows toward its start, where no scroll width
 * counts it) against its track's inner edge.
 */
function reachesIn(group, gap) {
  // A popover open from the place stands over the page, not in the bar's row.
  const popovers = [...group.querySelectorAll("[data-popover]")];
  for (const one of popovers) {
    one.style.display = "none";
  }
  const range = document.createRange();
  range.selectNodeContents(group);
  const drawn = range.getBoundingClientRect();
  const track = group.getBoundingClientRect();
  for (const one of popovers) {
    one.style.display = "";
  }
  return group.dataset.group === "lead" ? drawn.right + gap <= track.right : drawn.left - gap >= track.left;
}

/**
 * The bar folds in its order until its groups fit (ruling 4): the centre
 * group stands on the surface's axis, the leading and trailing groups each
 * in the half the centre leaves; a group that would reach into the centre's
 * room, less the bar's gap, folds the next step, never shifts.
 */
async function fitBar(root, c) {
  const slot = root.querySelector("[data-head-slot]");
  if (!slot) {
    return;
  }
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2")) || 0;
  const steps = FOLD_ORDER[c.H][c.fold];
  for (const [i, fold] of steps.entries()) {
    slot.innerHTML = part(`head:${c.H}:${fold}:${headKey(c)}`);
    seatAskCaw(root, c);
    for (const tools of slot.querySelectorAll("[data-shell-tools]")) {
      // Under A the Shell's group stands at the window's edge, not in the page bar.
      if (root.querySelector("[data-shell-edge]")) {
        tools.remove();
      } else {
        tools.dataset.img = `shell/${c.w === "1037" ? "window" : "desk"}-tools.png`;
      }
    }
    view(root, c.view);
    // biome-ignore lint/performance/noAwaitInLoops: each fold is measured once its pictures stand
    await pictures(slot);
    const fits = [...slot.querySelectorAll('[data-group="lead"], [data-group="trail"]')].every((group) =>
      reachesIn(group, gap)
    );
    if (fits || i === steps.length - 1) {
      slot.querySelector("[data-head]").dataset.fits = String(fits);
      return;
    }
  }
}

/** Every recorded time, said in the reader's own zone and words (`Intl.DateTimeFormat(undefined, …)`, as the dashboard says them). */
const FORMATS = {
  day: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }),
  clock: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
};
function say(ms, fmt) {
  if (fmt === "dayClock") {
    return `${FORMATS.day.format(ms)} ${FORMATS.clock.format(ms)}`;
  }
  return FORMATS[fmt].format(ms);
}
function localize(root) {
  for (const time of root.querySelectorAll("time[data-at]")) {
    time.textContent = say(Number(time.dataset.at), time.dataset.fmt ?? "day");
  }
}

/**
 * A stale read runs the client's own reconnect schedule (client.svelte.ts,
 * `scheduleReconnect`; config.ts 6-8): each wait `1000ms × 2^attempt`, the
 * attempt capped at 10, the wait at 30000ms, so 1 s, 2, 4, 8, 16, then 30.
 * The ring reads `retryAt`: its arc is the share of the wait still to run,
 * wound from the top; the seconds beside it count down; "as of" is when the
 * board last read, the moment the reads stopped.
 */
const RECONNECT = { base: 1000, maxAttempts: 10, maxDelay: 30_000 };
let ticking = 0;
function retryClock(root) {
  cancelAnimationFrame(ticking);
  const asOf = Date.now();
  for (const time of root.querySelectorAll("[data-as-of]")) {
    time.dateTime = new Date(asOf).toISOString();
    time.textContent = say(asOf, "clock");
  }
  let attempt = 0;
  const delay = () => Math.min(RECONNECT.base * 2 ** Math.min(attempt, RECONNECT.maxAttempts), RECONNECT.maxDelay);
  let wait = delay();
  let retryAt = asOf + wait;
  const frame = () => {
    const now = Date.now();
    if (now >= retryAt) {
      attempt += 1;
      wait = delay();
      retryAt = now + wait;
    }
    const left = retryAt - now;
    for (const ring of root.querySelectorAll("[data-ring]")) {
      const length = Number(ring.dataset.circumference);
      ring.querySelector("[data-ring-arc]")?.setAttribute("stroke-dasharray", `${(left / wait) * length} ${length}`);
      ring.dataset.retryAt = String(retryAt);
      ring.dataset.wait = String(wait);
      ring.dataset.attempt = String(attempt);
    }
    for (const num of root.querySelectorAll('[data-slot="when"] [data-slot="num"]')) {
      num.textContent = String(Math.ceil(left / 1000));
    }
    ticking = requestAnimationFrame(frame);
  };
  frame();
}

/**
 * The pane's strip edge stands where the strip sticks: under the bar, as
 * tall as the strip, coming in once the scroll reaches the strip.
 */
function placeStripEdge(root) {
  const pane = root.querySelector("[data-pane]");
  const scroller = pane?.querySelector("[data-pane-scroll]");
  const strip = pane?.querySelector("[data-jump]");
  const edge = pane?.querySelector('[data-edge="strip"]');
  const bar = pane?.querySelector("[data-pane-bar]");
  if (!(scroller && strip && edge && bar)) {
    return;
  }
  const top = strip.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  edge.style.setProperty("--po-edge-at", `${bar.offsetHeight}px`);
  edge.style.setProperty("--po-edge-h", `${strip.offsetHeight}px`);
  edge.style.setProperty("--po-edge-from", `${Math.max(0, top - bar.offsetHeight)}px`);
}

/** K1-review opens scrolled to the Result, its head under the stuck jump strip. */
function openOnReview(root) {
  const scroller = root.querySelector("[data-pane-scroll]");
  const result = root.querySelector("[data-result]");
  const strip = root.querySelector("[data-jump]");
  const bar = root.querySelector("[data-pane-bar]");
  if (!(scroller && result && strip && bar)) {
    return;
  }
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-3")) || 0;
  const top = result.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTop = top - bar.offsetHeight - strip.offsetHeight - gap;
}

export async function render(root, choice) {
  root.innerHTML = build(choice);
  for (const slot of root.querySelectorAll("[data-card]")) {
    slot.innerHTML = part(`card:${slot.dataset.card}`);
  }
  seatAskCaw(root, choice);
  view(root, choice.view);
  document.documentElement.dataset.width = choice.w;
  await pictures(root);
  shellRoom(root);
  await fitBar(root, choice);
  localize(root);
  await document.fonts.ready;
  placeStripEdge(root);
  if (choice.open === "pane" && choice.K === "review") {
    openOnReview(root);
  }
  if (choice.state === "stale") {
    retryClock(root);
  }
  document.documentElement.dataset.ready = "";
}

const page = document.getElementById("page");
if (page) {
  const draw = () => {
    delete document.documentElement.dataset.ready;
    render(page, readChoice(location.hash));
  };
  window.addEventListener("hashchange", draw);
  draw();
}
