/*
 * The pieces every drawing shares: the glyph helper, the kit's controls, and
 * the project page around the list as CawCo draws it: the rail, the top bar
 * holding the view strip (fluid tabs) and the glass, the project's head
 * (ProjectHead.svelte), and on a phone the head with ⋯ alone and the views
 * bar docked at the foot (ViewBar.svelte).
 */
import { PROJECT } from "./data.js";
import { ICONS } from "./icons.js";

export const ic = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" data-glyph="${name}">${ICONS[name]}</svg>`;

/** Caw's still, by day and by night: the night still carries the paper rim (the Caw panel preview's stills). */
export const cawStill = (still, size) =>
  `<img class="caw-still day" alt="" src="caw/${still}-day.png" width="${size}" height="${size}" /><img class="caw-still night" alt="" src="caw/${still}-night.png" width="${size}" height="${size}" />`;

export const esc = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The kit's button: outline by default; `primary` is the coral act. */
export const btn = (
  label,
  { v = "", icon = "", end = "", size = "", attrs = "" } = {}
) => {
  const cls = ["btn", v, size, label ? "" : "icon"].filter(Boolean).join(" ");
  const name = label ? "" : ` aria-label="${esc(icon)}"`;
  return `<button class="${cls}" type="button"${name} ${attrs}>${icon ? ic(icon) : ""}${label ? `<span>${label}</span>` : ""}${end ? ic(end) : ""}</button>`;
};

/** The glyph a named thing wears in its inline chip: a decision page, a canvas, a session. */
const CHIP_GLYPH = { page: "decisions", canvas: "canvas", session: "session" };

/** The inline chip a thing takes in a line of words (ui/chip `inline`); a press opens it. */
export const chip = (title, { kind = "page", target = title } = {}) =>
  `<a class="ichip" href="#" data-chip data-kind="${kind}" data-target="${esc(target)}">${ic(CHIP_GLYPH[kind])}<span data-slot="label">${esc(title)}</span></a>`;

/** The kit's segmented groove and lifted thumb: Day and Night. */
export const seg = (items, chosen, name, id = name) =>
  `<div class="seg" role="group" aria-label="${esc(name)}" data-seg="${esc(id)}"><span class="seg-thumb" aria-hidden="true"></span>${items
    .map(
      (item) =>
        `<button type="button" class="seg-item" data-value="${item.value}" aria-pressed="${item.value === chosen}"><span>${item.label}</span>${item.tag ? `<span class="tag">${item.tag}</span>` : ""}</button>`
    )
    .join("")}</div>`;

/** A set of option chips, one pressed, wrapping: the eleven states. */
export const chips = (items, chosen, name) =>
  `<div class="chipset" role="group" aria-label="${esc(name)}" data-seg="${esc(name)}">${items
    .map(
      (item) =>
        `<button type="button" class="opt" data-value="${item.value}" aria-pressed="${item.value === chosen}">${item.label}</button>`
    )
    .join("")}</div>`;

/* ----------------------------------------------------------- the desk */

const tux = `<svg class="ic sm" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M1.8 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0 1-4.8 0ZM9.4 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0 1-4.8 0ZM2.57 7.13a3.1 1.35 82 0 1 .86 6.14 3.1 1.35 82 0 1-.86-6.14ZM13.43 7.13a3.1 1.35 98 0 1-.86 6.14 3.1 1.35 98 0 1 .86-6.14ZM3.1 9.9a4.9 5.1 0 0 1 9.8 0 4.9 5.1 0 0 1-9.8 0ZM4.7 4.1a3.3 3.4 0 0 1 6.6 0 3.3 3.4 0 0 1-6.6 0ZM5.55 3.9a.9 1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8.65 3.9a.9 1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8 5.6 6.6 7h2.8Z"/></svg>`;

const rail = () => `<aside class="rail" aria-label="Sidebar">
  <div class="rail-brand"><span class="wordmark">Caw&amp;Co</span>${btn("", { v: "ghost", size: "sm", icon: "plus" })}</div>
  <nav class="rail-group" aria-label="Home">
    <span class="nav">${ic("monitor")}<span>Fleet</span><span class="count num"></span></span>
    <span class="nav">${ic("history")}<span>Working</span><span class="count num">3</span></span>
    <span class="nav">${ic("done")}<span>Finished</span><span class="count num">12</span></span>
  </nav>
  <div class="rail-group"><p class="rail-h">Projects</p>
    <span class="nav on">${ic("folder", "g-proj")}<span class="trunc">${PROJECT.name}</span><span class="count num"></span></span>
    <span class="nav">${ic("folder", "g-proj2")}<span class="trunc">Launch</span><span class="count num"></span></span>
  </div>
</aside>`;

const VIEWS = ["Board", "Table", "Routines", "Decisions", "Canvas", "Calendar"];

/** The view strip in the shell's bar (`inBar`): the views, a hairline, New task, Ask Caw for a view. */
const strip = (badge) => `<div class="strip">
  <nav class="tabs" aria-label="Views">${VIEWS.map(
    (v) =>
      `<span class="tab${v === "Decisions" ? " on" : ""}"><span>${v}</span>${v === "Decisions" && badge > 0 ? `<span class="tab-num num" data-badge>${badge}</span>` : ""}</span>`
  ).join("")}</nav>
  <span class="vrule" aria-hidden="true"></span>
  ${btn("New task", { size: "sm", icon: "plus" })}
  ${btn("Ask Caw for a view", { v: "ghost", size: "sm", icon: "sparkles" })}
</div>`;

/** The top bar's trailing glass: Jump, the machines, Caw's head. */
const glass = () => `<div class="glass">
  <span class="gitem" aria-label="Jump to session">${ic("search")}</span>
  <span class="gitem wide" aria-label="3 machines">${ic("server")}<span class="num">3</span></span>
  <span class="gitem caw">${cawStill("caw-idle", 24)}</span>
</div>`;

/** The project's head: its name, where it lives, then Caw, Ask Caw, Spin off and ⋯. */
const head = () => `<header class="phead">
  <div class="who">
    <h2 class="ptitle"><span>${PROJECT.name}</span></h2>
    <p class="pline">${tux}<span class="trunc">${PROJECT.machine} · ${PROJECT.path}</span><span class="places">· ${PROJECT.places} places</span></p>
  </div>
  <div class="pacts">
    <span class="seat">${cawStill("caw-idle", 48)}</span>
    ${btn("Ask Caw", { v: "primary" })}
    ${btn("Spin off")}
    ${btn("", { v: "ghost", icon: "more" })}
  </div>
</header>`;

export const desk = (pane, badge) => `<div class="frame desk" data-frame="desk">
  ${rail()}
  <div class="main">
    <header class="bar">${strip(badge)}${glass()}</header>
    <div class="page">${head()}<div class="pane" data-pane>${pane}</div></div>
  </div>
</div>`;

/* ---------------------------------------------------------- the phone */

export const phone = (pane) => `<div class="frame phone" data-frame="phone">
  <header class="pbar">${btn("", { v: "ghost", icon: "sidebar" })}<span class="cawtab">${cawStill("caw-idle", 24)}</span></header>
  <div class="pscroll">
    <header class="phead phone-head">
      <div class="who">
        <h2 class="ptitle"><span>${PROJECT.name}</span></h2>
        <p class="pline">${tux}<span class="trunc">${PROJECT.machine} · ${PROJECT.path}</span></p>
      </div>
      ${btn("", { v: "ghost", icon: "more" })}
    </header>
    <div class="pane" data-pane>${pane}</div>
  </div>
  <div class="dock">
    <div class="dock-shell">
      <button class="pill" type="button" aria-label="View: Decisions"><span>Decisions</span>${ic("down", "sm")}</button>
      <span class="grow"></span>
      <button class="send" type="button" aria-label="Ask Caw">${ic("plus")}</button>
    </div>
  </div>
</div>`;
