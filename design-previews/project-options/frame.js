/**
 * One frame of the project page at its own viewport: the options picked in
 * the URL's hash (index.js writes it), set together from the captured parts
 * (parts.js) the way the page stands them: the Shell's rail and its glass
 * (cuts of the live captures), the project's bar, the band (F1), the board
 * or the list, and the task pane or Caw's column beside it (a phone: the
 * pane is its own page, Caw's column a sheet). `today` shows the live page
 * as it was captured instead.
 *
 *   frame.html#w=1440&H=H1&D=D2&P=P1&C=C1&K=review&F=F1&S=S2&state=rest&open=none&view=Board
 */
import { PARTS } from "./parts.js";

const DEFAULTS = {
  w: "1440",
  H: "H1",
  D: "D2",
  P: "P1",
  C: "C1",
  K: "review",
  F: "F1",
  S: "S2",
  state: "rest",
  open: "none",
  view: "Board",
  today: "0",
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

function build(c) {
  const phone = c.w === "390";
  if (c.today === "1") {
    return `<img class="po-today" src="${TODAY[c.w]}" alt="The live project page as captured at ${c.w}">`;
  }
  const ask = c.state === "waits" ? c.C : "C1";
  const waiting = c.state === "waits" ? 2 : 0;
  if (phone) {
    if (c.open === "pane") {
      return `<div class="po-phone">${part(`pane:${c.K}:phone`)}</div>`;
    }
    const top = part(`phonebar:top:${c.state === "stale" && c.F === "F2" ? "stale-F2" : "rest"}`);
    const band = c.state === "stale" && c.F === "F1" ? `<div class="po-phone-band">${part("band:phone")}</div>` : "";
    const popover =
      c.state === "stale" && c.F === "F2" ? `<div class="po-phone-popover">${part("popover:phone")}</div>` : "";
    const body =
      c.view === "Table" ? part(`table:phone:${c.state}`) : part(`phone:${c.P}:${c.state}:${ask}`);
    const sheet = c.open === "caw" ? `<div class="po-phone-sheet">${part(`caw:${c.S}:phone`)}</div>` : "";
    const list = c.view === "Table" || c.P === "P2";
    return `<div class="po-phone">
      <div class="po-phone-scroll ${list ? "po-phone-fill" : ""}" data-scroller>${band}${body}</div>
      <div class="po-phone-top">${top}</div>${popover}
      <div class="po-phone-foot">${part(`phonebar:foot:${waiting}`)}</div>${sheet}
    </div>`;
  }
  let head = c.state;
  if (c.state === "stale" && c.F === "F2") {
    head = "stale-F2";
  }
  const band = c.state === "stale" && c.F === "F1" ? `<div class="po-band">${part("band:desk")}</div>` : "";
  const body =
    c.view === "Table" ? part(`table:desk:${c.state}`) : part(`board:${c.D}:${c.state}:${ask}`);
  let side = "";
  if (c.open === "pane") {
    side = `<div class="po-side po-side-pane">${part(`pane:${c.K}:desk`)}</div>`;
  } else if (c.open === "caw") {
    side = `<div class="po-side po-side-caw">${part(`caw:${c.S}:desk`)}</div>`;
  }
  const rail = c.w === "1037" ? "window" : "desk";
  return `<div class="po-desk">
    <span data-img="shell/${rail}-rail.png" data-natural class="po-rail"></span>
    <div class="po-main">
      <div class="po-head">${part(`head:${c.H}:${c.w}:${head}`)}</div>
      ${band}
      <div class="po-body">
        <div class="po-content ${c.view === "Table" ? "po-content-list" : ""}" data-scroller>${body}</div>
        ${side}
      </div>
    </div>
  </div>`;
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

/** The view chosen is the pressed one, in the bar and the pill. */
function view(root, name) {
  for (const button of root.querySelectorAll("[data-head] [aria-pressed]")) {
    if (button.matches("[data-waiting-toggle]")) {
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

/** K1-review opens scrolled to the Result, its head under the sticky jump strip. */
function openOnReview(root) {
  const scroller = root.querySelector("[data-pane-scroll]");
  const result = root.querySelector("[data-result]");
  const strip = root.querySelector("[data-jump]");
  if (!(scroller && result && strip)) {
    return;
  }
  const bar = root.querySelector("[data-pane-bar]");
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-3")) || 0;
  const top = result.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop = top - bar.offsetHeight - strip.offsetHeight - gap;
}

/**
 * F's clock ticks, as the report asks ("the clock must be visibly ticking"):
 * a second at a time from the drawn 12 s to the retry, then the next waits
 * of the advisor's backoff (20, 40, capped at 60 s; his own call).
 */
const BACKOFF = [12, 20, 40, 60];
let ticking = 0;
function tick(root) {
  clearInterval(ticking);
  let step = 0;
  let left = BACKOFF[0];
  ticking = setInterval(() => {
    left -= 1;
    if (left === 0) {
      step = Math.min(step + 1, BACKOFF.length - 1);
      left = BACKOFF[step];
    }
    for (const num of root.querySelectorAll('[data-slot="when"] [data-slot="num"]')) {
      num.textContent = String(left);
    }
  }, 1000);
}

export async function render(root, choice) {
  root.innerHTML = build(choice);
  for (const slot of root.querySelectorAll("[data-card]")) {
    slot.innerHTML = part(`card:${slot.dataset.card}`);
  }
  view(root, choice.view);
  document.documentElement.dataset.width = choice.w;
  await pictures(root);
  await document.fonts.ready;
  if (choice.K === "review") {
    openOnReview(root);
  }
  if (choice.state === "stale") {
    tick(root);
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
