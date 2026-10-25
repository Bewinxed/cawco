/**
 * The suggestions preview: each look's captured markup (parts.js, drawn by
 * Suggestions.svelte, capture/capture.ts) set in the two places it would
 * stand, Caw's first thread and the empty Decisions tab, at a desk and on a
 * phone, then its states (one, seven, the longest, while read). Today's
 * StarterCards lead, for comparison. A press puts the words in the
 * section's composer, the caret after them; nothing is sent.
 */
import { PARTS } from "./parts.js";

const MOBBIN = "https://mobbin.com/screens/";

/** Each look: where it comes from, what it gives and what it costs. */
const VARIANTS = [
  {
    look: "today",
    name: "Today",
    source: "StarterCards: rows in Caw’s panel, cards on an empty panel",
    refs: [],
    gives: "Already shipped; glyph and reason per row.",
    costs:
      "Two recipes for one job. Outlined rows read as form buttons, the cards carry a border and a shadow both, and neither says where the words go.",
    thread: "today:three",
    panel: "today:decisions",
    states: [["Longest", "today:long"]],
  },
  {
    look: "list",
    name: "List",
    source: "Lightfield’s “Some ideas” and Plane AI’s Suggestions",
    refs: [
      ["Lightfield", "a77b052b-5612-4588-895a-6cc553d5b18d"],
      ["Plane", "e9cd6480-757c-460e-961a-baec177562e4"],
    ],
    gives:
      "The calmest: sentences on hairlines, the glyph in the row’s lead column, no surface competing with Caw. Reads as things to say, not buttons.",
    costs:
      "No reasons, so why each is offered stays unsaid; on a wide empty panel the ruled list is a long thin column.",
  },
  {
    look: "rows",
    name: "Rows",
    source: "Cofounder’s next steps in its chat",
    refs: [["Cofounder", "be8d45fe-a735-4ad4-b297-7b97a59d21a3"]],
    gives:
      "Each sentence over its reason, so the person sees why before asking. Raised on the thread’s recess, as content is.",
    costs:
      "Taller than the list in a narrow column: three with their reasons stand 224px in Caw’s 380px column against the list’s 134px, pushing his earlier threads down.",
  },
  {
    look: "tiles",
    name: "Tiles",
    source: "Linear’s “Get started with some examples”",
    refs: [["Linear", "a0193431-e1b3-44c4-b1a2-1d1f4a017ccc"]],
    gives:
      "On a wide empty panel, three or four across with their reasons: a scan from left to right, the glyph leading each.",
    costs:
      "In Caw’s 380px column they fall to one column of cards, glyph over words: three stand 339px, the most of all four.",
  },
  {
    look: "chips",
    name: "Chips",
    source: "Langdock’s and AirOps’ chips under the field, Relevance AI’s under its own",
    refs: [
      ["Langdock", "b66870ae-8d47-493d-b1b6-e6c01173ad96"],
      ["AirOps", "0e0ae5e4-5097-483c-a2d8-f8cddd192d67"],
      ["Relevance AI", "22b3b535-c32d-473b-a1fa-6defef04d729"],
    ],
    gives:
      "The most compact (three stand 104px in Caw’s column): the kit’s own option chip, each as wide as its words, wrapping whole. Fits on the composer as well as above Caw.",
    costs:
      "No reasons; a long sentence makes a tall, ragged chip, and seven chips read as a cloud rather than a list.",
  },
];

const STATES = [
  ["One", "one"],
  ["Seven", "many"],
  ["Longest", "long"],
  ["Being read", "loading"],
];

const part = (key) => {
  const html = PARTS[key];
  if (html === undefined) {
    throw new Error(`no captured part ${key}`);
  }
  return html;
};

/** Caw's first thread: his head, the hero (Caw, the title, the suggestions), then the composer. */
const thread = (key, frame) => `
  <article class="frame frame-${frame}" data-context="thread" data-part-key="${key}" aria-label="Caw’s first thread, ${frame}">
    <header class="panel-head">
      <img class="panel-mark" src="caw/hero.png" alt="" width="28" height="28" />
      <span class="panel-words"><strong>Caw</strong><span>Obelisk Site</span></span>
    </header>
    <div class="thread-body">
      <div class="hero">
        <img class="caw" src="caw/hero.png" alt="" width="80" height="80" />
        <h3 class="hero-title">What’s next for Obelisk Site?</h3>
        <div class="hero-action">${part(key)}</div>
      </div>
      <label class="composer">
        <span class="visually-hidden">Message Caw</span>
        <textarea rows="1" placeholder="Message Caw…" data-slot="composer-field"></textarea>
        <span class="send" aria-hidden="true"></span>
      </label>
    </div>
  </article>`;

/** The empty Decisions tab: Caw over the empty state, the suggestions its one action. */
const panel = (key, frame) => `
  <article class="frame frame-${frame} frame-page" data-context="panel" data-part-key="${key}" aria-label="The empty Decisions tab, ${frame}">
    <div class="empty">
      <img class="caw" src="caw/hero.png" alt="" width="80" height="80" />
      <h3 class="hero-title">No decisions yet</h3>
      <p class="empty-line">Caw writes a decision page: the choices this project needs you to make, each with its options.</p>
      <div class="hero-action">${part(key)}</div>
    </div>
  </article>`;

const state = (label, key) => `
  <figure class="state" data-state="${label}">
    <figcaption>${label}</figcaption>
    <div class="state-well" data-part-key="${key}">${part(key)}</div>
  </figure>`;

const section = (v) => {
  const threadKey = v.thread ?? `${v.look}:three`;
  const panelKey = v.panel ?? `${v.look}:decisions`;
  const states = v.states ?? STATES.map(([label, set]) => [label, `${v.look}:${set}`]);
  const refs = v.refs
    .map(([app, id]) => `<a href="${MOBBIN}${id}" rel="noreferrer" target="_blank">${app}</a>`)
    .join(" · ");
  return `
  <section class="variant" data-look="${v.look}" aria-labelledby="look-${v.look}">
    <header class="variant-head">
      <h2 id="look-${v.look}">${v.name}</h2>
      <p class="source">${v.source}${refs ? ` · ${refs}` : ""}</p>
      <dl class="trade">
        <div><dt>Gives</dt><dd>${v.gives}</dd></div>
        <div><dt>Costs</dt><dd>${v.costs}</dd></div>
      </dl>
    </header>
    <div class="row">
      <h3 class="row-head">Desk</h3>
      <div class="frames">${thread(threadKey, "desk")}${panel(panelKey, "desk")}</div>
    </div>
    <div class="row">
      <h3 class="row-head">Phone</h3>
      <div class="frames">${thread(threadKey, "phone")}${panel(panelKey, "phone")}</div>
    </div>
    <div class="row">
      <h3 class="row-head">States</h3>
      <div class="states">${states.map(([label, key]) => state(label, key)).join("")}</div>
    </div>
  </section>`;
};

const main = document.querySelector('[data-slot="variants"]');
main.innerHTML = VARIANTS.map(section).join("");

/** A press: the words into the composer of the frame it stands in (the section's desk thread from a panel), caret after. */
main.addEventListener("click", (event) => {
  const button = event.target.closest('[data-slot="suggestion"], [data-slot="starter"]');
  if (!button) {
    return;
  }
  const words = button.querySelector('[data-slot="suggestion-text"], [data-slot="starter-text"]');
  const frame = button.closest(".frame");
  const field =
    frame?.querySelector('[data-slot="composer-field"]') ??
    button.closest(".variant")?.querySelector('[data-slot="composer-field"]');
  if (!(words && field)) {
    return;
  }
  field.value = words.textContent.trim();
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
});

/**
 * Day and night: the whole page's scheme, flipped with every transition
 * off for the flip, as the dashboard's theme switch does (DESIGN.md, Theme
 * switch), so no fill eases from the old scheme's colour.
 */
const schemes = document.querySelectorAll(".scheme [data-scheme]");
for (const button of schemes) {
  button.addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.flipping = "";
    root.dataset.scheme = button.dataset.scheme;
    getComputedStyle(root).color;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => delete root.dataset.flipping)
    );
    for (const other of schemes) {
      other.setAttribute("aria-checked", String(other === button));
    }
  });
}

window.__previewReady = true;
