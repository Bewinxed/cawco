/*
 * Each option's own motion, on the house curves and durations (tokens.css):
 * ease-out for what enters, leaves or changes in place, ease-in-out for what
 * is on screen moving, the drawer curve for a flight. Every travelling run
 * asks for motion first; with less motion only opacity runs, still timed.
 */
import { ic } from "./parts.js";
import { parseBrief, shapeView } from "./shape.js";

const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const ms = (name) => Number.parseFloat(css(name));
const curve = (name) => css(name);
export const motionOk = () =>
  matchMedia("(prefers-reduced-motion: no-preference)").matches;

/** The stage's own scale: a frame drawn at 1440 is read at its fitted size. */
const fitOf = (el) =>
  Number.parseFloat(
    getComputedStyle(el.closest(".frame")).getPropertyValue("--fit")
  ) || 1;

/** A swap seen many times a session: a fade alone over --dur-fade, no travel or blur. */
export const fadeIn = (el) =>
  el.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: ms("--dur-fade"),
    easing: curve("--ease-out"),
  });

/** Something arrives: up from 0.96 with a 2px blur, or a fade alone. */
export function arrive(el, { delay = 0, duration = ms("--dur-pop") } = {}) {
  const frames = motionOk()
    ? [
        { opacity: 0, scale: "0.96", filter: "blur(2px)" },
        { opacity: 1, scale: "1", filter: "blur(0px)" },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
  return el.animate(frames, {
    duration,
    delay,
    easing: curve("--ease-out"),
    fill: "backwards",
  });
}

/** A path draws along itself (its pathLength is 1). */
function draw(path, delay = 0) {
  if (!motionOk()) {
    return path.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: ms("--dur-pop"),
      delay,
      easing: curve("--ease-out"),
      fill: "backwards",
    });
  }
  if (path.classList.contains("dash")) {
    return path.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: ms("--dur-panel"),
      delay,
      easing: curve("--ease-in-out"),
      fill: "backwards",
    });
  }
  return path.animate(
    [
      { strokeDasharray: "1 1", strokeDashoffset: "1" },
      { strokeDasharray: "1 1", strokeDashoffset: "0" },
    ],
    {
      duration: ms("--dur-panel"),
      delay,
      easing: curve("--ease-in-out"),
      fill: "backwards",
    }
  );
}

/**
 * A shape drawn again: nodes that stay slide from where they stood
 * (ease-in-out, 280ms), nodes that are new or changed arrive 60ms apart,
 * and edges that are new draw along themselves.
 */
export function redraw(host, html) {
  const before = new Map();
  const keys = new Set();
  for (const node of host.querySelectorAll("[data-node]")) {
    before.set(node.dataset.node, node.getBoundingClientRect());
    keys.add(node.dataset.key);
  }
  const edges = new Set(
    [...host.querySelectorAll("[data-edge]")].map((e) => e.dataset.edge)
  );
  host.innerHTML = html;
  const scale = fitOf(host);
  let order = 0;
  for (const node of host.querySelectorAll("[data-node]")) {
    const was = before.get(node.dataset.node);
    if (was && keys.has(node.dataset.key)) {
      const now = node.getBoundingClientRect();
      const dx = (was.left - now.left) / scale;
      const dy = (was.top - now.top) / scale;
      if ((Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) && motionOk()) {
        node.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: ms("--dur-panel"),
            easing: curve("--ease-in-out"),
          }
        );
      }
    } else {
      arrive(node, { delay: order * ms("--dur-stagger") });
      order += 1;
    }
  }
  for (const path of host.querySelectorAll("[data-edge]")) {
    if (!edges.has(path.dataset.edge)) {
      draw(path, ms("--dur-stagger"));
    }
  }
}

/* -------------------------------------------------- option A: the brief */

const EXTRA_LINE = "\n6. Draft up to 3 DMs (low).";

export function wireBrief(stage) {
  const area = stage.querySelector("[data-brief]");
  const host = stage.querySelector("[data-shape-host]");
  if (!(area && host)) {
    return;
  }
  const w =
    Number.parseFloat(
      host.querySelector("[data-shape]")?.style.getPropertyValue("--node-w")
    ) || 150;
  let timer = 0;
  const read = () => redraw(host, shapeView(parseBrief(area.value), { w }));
  area.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(read, 350);
  });
  stage.playA = () => {
    area.value = area.value.endsWith(EXTRA_LINE)
      ? area.value.slice(0, -EXTRA_LINE.length)
      : area.value + EXTRA_LINE;
    read();
  };
}

/* ------------------------------------------------- option B: the ledger */

export function addStep(stage) {
  const ghost = stage.querySelector('[data-play="b-add"]');
  const added = stage.querySelector("[data-new-step]");
  if (added) {
    const leave = added.animate(
      [
        { opacity: 1, blockSize: `${added.offsetHeight}px` },
        { opacity: 0, blockSize: "0px" },
      ],
      { duration: ms("--dur-exit"), easing: curve("--ease-out") }
    );
    leave.finished.then(() => added.remove());
    return;
  }
  const row = document.createElement("div");
  row.className = "step";
  row.dataset.newStep = "";
  row.style.overflow = "clip";
  row.innerHTML = `<span class="grip">${ic("grip")}</span><span class="g-idle">${ic("planned")}</span><span class="title"><span class="field focus" style="min-block-size:28px"><span class="ph">What this step does…</span></span></span><span class="kind">${ic("agent")}Agent</span><span class="col">low</span><span class="chips"><span class="chip">5</span></span><span></span>`;
  ghost.before(row);
  const h = row.offsetHeight;
  const frames = motionOk()
    ? [
        {
          opacity: 0,
          blockSize: "0px",
          minBlockSize: "0px",
          paddingBlock: "0px",
        },
        {
          opacity: 1,
          blockSize: `${h}px`,
          minBlockSize: "0px",
          paddingBlock: "4px",
        },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
  row.animate(frames, {
    duration: ms("--dur-pop"),
    easing: curve("--ease-out"),
  });
}

export function toggleFold(stage) {
  const fold = stage.querySelector("[data-fold]");
  const row = stage.querySelector('[data-play="b-unfold"]');
  if (!fold) {
    return;
  }
  const open = !fold.hasAttribute("data-open");
  fold.toggleAttribute("data-open", open);
  row?.setAttribute("aria-expanded", String(open));
}

/** Two contents trade places in one box: the old leaves over 160ms, the new arrives over 260ms, on one start. */
export function crossSwap(box, html) {
  const old = box.firstElementChild;
  const ghost = old.cloneNode(true);
  const rect = old.getBoundingClientRect();
  const scale = fitOf(box);
  box.style.position = "relative";
  ghost.style.cssText += `;position:absolute;inset-inline:0;inset-block-start:0;block-size:${rect.height / scale}px;pointer-events:none`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.removeAttribute("data-shape");
  ghost.removeAttribute("data-steps");
  box.innerHTML = html;
  box.append(ghost);
  const out = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: ms("--dur-exit"),
    easing: curve("--ease-out"),
    fill: "forwards",
  });
  out.finished.then(() => ghost.remove());
  arrive(box.firstElementChild);
}

/* ------------------------------------------------- option C: the canvas */

export function pickNode(stage, node, inspectorHtml) {
  const canvas = node.closest("[data-canvas-pick]");
  for (const each of canvas.querySelectorAll(".node.sel")) {
    each.classList.remove("sel");
  }
  node.classList.add("sel");
  const box = stage.querySelector("[data-inspector]");
  box.innerHTML = inspectorHtml;
  const frames = motionOk()
    ? [
        { opacity: 0, filter: "blur(2px)" },
        { opacity: 1, filter: "blur(0px)" },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
  box.animate(frames, {
    duration: ms("--dur-morph"),
    easing: curve("--ease-drawer"),
  });
}

/* ------------------------------------------------ option D: keep a run */

export function keepFlight(stage) {
  const src = stage.querySelector("[data-keep-src]");
  const dst = stage.querySelector("[data-keep-dst]");
  const menu = stage.querySelector('[data-play="d-keep"]')?.closest(".menu");
  if (!(src && dst)) {
    return;
  }
  if (dst.dataset.kept) {
    delete dst.dataset.kept;
    dst.style.opacity = "0";
    src.style.visibility = "";
    for (const run of src.getAnimations()) {
      run.cancel();
    }
    arrive(src);
    if (menu) {
      menu.style.visibility = "";
    }
    return;
  }
  if (menu) {
    menu.style.visibility = "hidden";
  }
  const a = src.getBoundingClientRect();
  const b = dst.getBoundingClientRect();
  const scale = fitOf(src);
  const dx = (b.left - a.left) / scale;
  const dy = (b.top - a.top) / scale;
  const sx = b.width / a.width;
  const sy = b.height / a.height;
  const duration = ms("--dur-panel");
  const frames = motionOk()
    ? [
        { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          opacity: 0.4,
        },
      ]
    : [{ opacity: 1 }, { opacity: 0 }];
  const fly = src.animate(frames, {
    duration,
    easing: curve("--ease-drawer"),
    fill: "forwards",
  });
  fly.finished.then(() => {
    src.style.visibility = "hidden";
    dst.style.opacity = "1";
    dst.dataset.kept = "1";
    dst.animate([{ opacity: 0.4 }, { opacity: 1 }], {
      duration: ms("--dur-exit"),
      easing: curve("--ease-out"),
    });
  });
}

export function pruneRow(stage) {
  const row = stage.querySelector("[data-prune-row]");
  if (!row) {
    return;
  }
  const words = row.querySelector('[data-play="d-prune"] span');
  const whole = row.scrollHeight;
  const folded = row.firstElementChild.querySelector(".t").offsetHeight + 14;
  const gone = !row.dataset.gone;
  row.toggleAttribute("data-gone", gone);
  if (gone) {
    row.dataset.gone = "1";
  }
  if (words) {
    words.textContent = gone ? "Undo" : "Remove";
  }
  if (!motionOk()) {
    row.style.blockSize = gone ? `${folded}px` : "";
    return;
  }
  const from = gone ? whole : folded;
  const to = gone ? folded : whole;
  row.style.blockSize = gone ? `${folded}px` : "";
  row.animate([{ blockSize: `${from}px` }, { blockSize: `${to}px` }], {
    duration: ms(gone ? "--dur-exit" : "--dur-pop"),
    easing: curve("--ease-out"),
  });
}
