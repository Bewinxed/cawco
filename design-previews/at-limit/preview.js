/**
 * The at-limit preview: one state on screen, the grouped switcher beside
 * it, every state a link (`?__state=<key>`, `&scheme=night`). Each state
 * sets the real components' captured markup (parts.js, capture/capture.ts)
 * in the frame it stands in: the tab strip in the desk's top bar, the home
 * list's column, the rail, the transcript's column, the composer's tray,
 * each among the session's real neighbours. Today's states are main's own
 * components on the same records.
 *
 * Hover is the house's own rule (`group-hover/move` opens the second line);
 * a state that shows it holds that frame as hovered (`data-hover`), which
 * preview.css answers with the same two declarations. Pressed is the
 * component's own press, made before capture.
 */
import { PARTS } from "./parts.js";

const part = (key) => {
  const html = PARTS[key];
  if (html === undefined) {
    throw new Error(`no captured part ${key}`);
  }
  return html;
};

/** A frame: where a surface stands, at a desk or on a phone. */
const frame = (kind, device, key, extra = {}) => ({ kind, device, key, ...extra });

const GROUPS = [
  {
    name: "Today",
    states: [
      {
        key: "today-tab",
        label: "Tab",
        caption: "Today, desk: the held session’s tab, chosen, in the strip.",
        frames: [frame("tabs", "Desk", "today:moves:tabs")],
      },
      {
        key: "today-home",
        label: "Home row",
        caption: "Today, desk: the held row among the four sessions busy just before it.",
        frames: [frame("home", "Desk", "today:moves:home")],
      },
      {
        key: "today-rail",
        label: "Rail row",
        caption: "Today, desk: the rail’s tree under the orchestrator.",
        frames: [frame("rail", "Desk", "today:moves:rail")],
      },
      {
        key: "today-line",
        label: "Transcript line",
        caption: "Today, desk: the transcript’s account line at rest, with its stop sentence.",
        frames: [
          frame("line", "Desk", "today:moves:line"),
          frame("line", "Phone", "today:moves:line"),
        ],
      },
      {
        key: "today-tray",
        label: "Tray chip",
        caption: "Today, desk: the orchestrator’s delegate tray with the held delegate’s chip.",
        frames: [frame("tray", "Desk", "today:moves:tray")],
      },
    ],
  },
  {
    name: "Surfaces",
    states: [
      {
        key: "tab",
        label: "Tab strip, desk",
        caption: "Design, desk: the held tab, chosen, in the strip.",
        frames: [frame("tabs", "Desk", "design:moves:tabs")],
      },
      {
        key: "home-moves",
        label: "Home row: moves to",
        caption: "Design, desk: the held row, the hub moving it at the reset.",
        frames: [frame("home", "Desk", "design:moves:home")],
      },
      {
        key: "home-resets",
        label: "Home row: resets",
        caption: "Design, desk: the held row, waiting for its own account’s reset.",
        frames: [frame("home", "Desk", "design:resets:home")],
      },
      {
        key: "home-fits",
        label: "Home row: one account could take it",
        caption: "Design, desk: the held row, one other account able to take it now.",
        frames: [frame("home", "Desk", "design:fits:home")],
      },
      {
        key: "rail",
        label: "Rail row",
        caption: "Design, desk: the rail’s tree under the orchestrator.",
        frames: [frame("rail", "Desk", "design:moves:rail")],
      },
      {
        key: "phone-row",
        label: "Phone row",
        caption: "Design, phone: the held row in the home list.",
        frames: [frame("home", "Phone", "design:moves:home")],
      },
      {
        key: "line-rest",
        label: "Transcript line: rest",
        caption: "Design, desk: the account line at rest, one line.",
        frames: [frame("line", "Desk", "design:moves:line")],
      },
      {
        key: "line-hover",
        label: "Transcript line: hover",
        caption: "Design, desk: the line under the pointer, its reason under it.",
        frames: [frame("line", "Desk", "design:moves:line", { hover: true })],
      },
      {
        key: "line-pressed",
        label: "Transcript line: pressed",
        caption: "Design, desk: the line pressed open, the other accounts unfolded.",
        frames: [frame("line", "Desk", "design:moves:pressed")],
      },
      {
        key: "line-phone-rest",
        label: "Transcript line: phone rest",
        caption: "Design, phone: the account line at rest.",
        frames: [frame("line", "Phone", "design:moves:line")],
      },
      {
        key: "line-phone-pressed",
        label: "Transcript line: phone pressed",
        caption: "Design, phone: one press, the reason and the accounts together.",
        frames: [frame("line", "Phone", "design:moves:pressed")],
      },
      {
        key: "line-after",
        label: "Transcript line: after the reset",
        caption: "Design, desk: the line once the reset has passed, history.",
        frames: [frame("line", "Desk", "design:after:line")],
      },
      {
        key: "tray",
        label: "Tray chip",
        caption: "Design, desk: the orchestrator’s tray with the held delegate’s chip.",
        frames: [frame("tray", "Desk", "design:moves:tray")],
      },
    ],
  },
  {
    name: "Fork A",
    states: [
      {
        key: "forka-dot",
        label: "Muted dot",
        caption: "Fork A, a still dot in muted ink on the held row’s mark: rail at a desk, row on a phone.",
        frames: [
          frame("rail", "Desk", "design:moves:rail"),
          frame("home", "Phone", "design:moves:home"),
        ],
      },
      {
        key: "forka-nodot",
        label: "No dot",
        caption: "Fork A, no dot on the held row’s mark: rail at a desk, row on a phone.",
        frames: [
          frame("rail", "Desk", "nodot:moves:rail"),
          frame("home", "Phone", "nodot:moves:home"),
        ],
      },
    ],
  },
  {
    name: "Fork B",
    states: [
      {
        key: "forkb-button",
        label: "Text button",
        caption: "Fork B, the way out as a text button: hovered and pressed at a desk, pressed on a phone.",
        frames: [
          frame("line", "Desk", "design:fits:line", { hover: true, note: "Hover" }),
          frame("line", "Desk", "design:fits:pressed", { note: "Pressed" }),
          frame("line", "Phone", "design:fits:pressed", { note: "Pressed" }),
        ],
      },
      {
        key: "forkb-words",
        label: "Words only",
        caption: "Fork B, words only, the menu’s Move to as today: hovered and pressed at a desk, pressed on a phone.",
        frames: [
          frame("line", "Desk", "words:fits:line", { hover: true, note: "Hover" }),
          frame("line", "Desk", "words:fits:pressed", { note: "Pressed" }),
          frame("line", "Phone", "words:fits:pressed", { note: "Pressed" }),
        ],
      },
    ],
  },
];

const STATES = GROUPS.flatMap((group) => group.states);
const SCHEMES = [
  ["day", "Day", "light"],
  ["night", "Night", "dark"],
];

const params = new URLSearchParams(location.search);
const chosen = STATES.find((one) => one.key === params.get("__state")) ?? STATES[0];
const scheme = SCHEMES.find(([key]) => key === params.get("scheme")) ?? SCHEMES[0];
document.documentElement.dataset.scheme = scheme[2];

const linkTo = (state, schemeKey) => {
  const next = new URLSearchParams(location.search);
  next.set("__state", state);
  next.set("scheme", schemeKey);
  return `?${next}`;
};

/** Where each kind of surface stands, as its frame names it. */
const PLACE = {
  tabs: "The top bar’s tab strip, his 1037px window",
  home: "The home list",
  rail: "The rail’s project tree",
  line: "The transcript’s column",
  tray: "The composer’s delegate tray",
};

const drawFrame = (one) => `
  <figure class="frame" data-kind="${one.kind}" data-device="${one.device.toLowerCase()}" ${one.hover ? "data-hover" : ""} data-part-key="${one.key}">
    <figcaption><strong>${one.device}</strong>${one.note ? ` · ${one.note}` : ""} · ${PLACE[one.kind]}</figcaption>
    <div class="well" data-slot="well">${part(one.key)}</div>
  </figure>`;

const stage = document.querySelector('[data-slot="stage"]');
stage.dataset.state = chosen.key;
stage.innerHTML = `
  <p class="caption" data-slot="caption">${chosen.caption}</p>
  <div class="frames">${chosen.frames.map(drawFrame).join("")}</div>`;

const nav = document.querySelector('[data-slot="states"]');
nav.innerHTML = [
  ...GROUPS.map(
    (group) => `
    <section class="group">
      <h2>${group.name}</h2>
      <ul>${group.states
        .map(
          (one) =>
            `<li><a href="${linkTo(one.key, scheme[0])}" data-state-link="${one.key}"${one.key === chosen.key ? ' aria-current="page"' : ""}>${one.label}</a></li>`
        )
        .join("")}</ul>
    </section>`
  ),
  `<section class="group">
    <h2>Day / Night</h2>
    <ul>${SCHEMES.map(
      ([key, label]) =>
        `<li><a href="${linkTo(chosen.key, key)}" data-scheme-link="${key}"${key === scheme[0] ? ' aria-current="page"' : ""}>${label}</a></li>`
    ).join("")}</ul>
  </section>`,
].join("");

// The captured parts are drawings: nothing in them navigates away or opens.
stage.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) {
    event.preventDefault();
  }
});

window.__previewReady = true;
