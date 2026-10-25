/**
 * The suggestions preview: each look's captured markup (parts.js, drawn by
 * Suggestions.svelte, capture/capture.ts) set in the two places it would
 * stand, Caw's first thread and the empty Decisions tab, at a desk and on a
 * phone, then its states (one, seven, the longest, while read). Today's
 * StarterCards lead, for comparison, in the same states. A press puts the
 * words where they go, the caret after them, nothing sent: in the thread,
 * its composer; on the empty Decisions tab, Caw's panel, which opens in
 * that frame with the words in its composer (StarterCards: a starter
 * "opens his panel with its words in his composer").
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
      "Two recipes for one job: outlined rows as wide as their words in Caw’s column, cards with a glyph each on an empty panel. Nothing is drawn while the starters are read.",
    thread: "today:three",
    panel: "today:decisions",
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
      "Taller than the list: three with their reasons stand 207px in Caw’s 380px panel and in the 390px Phone frame here, against the list’s 134px, and 224px in the 358px frame a 390px screen leaves, where more reasons wrap; his earlier threads move down by as much.",
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

/**
 * Caw's still at a size, by day and by night: the night still is drawn on
 * the paper rim (the Caw panel preview's stills), so his near-black body
 * stands clear of the night's near-black ground; his 28px head mark takes
 * the night still whose rim is grown to a device pixel at that size
 * (capture/night-mark.py). The scheme shows one.
 */
const caw = (size, cls) =>
  `<img class="${cls} caw-still day" src="caw/caw-ready-day.png" alt="" width="${size}" height="${size}" /><img class="${cls} caw-still night" src="caw/caw-ready-night${size < 48 ? "-mark" : ""}.png" alt="" width="${size}" height="${size}" />`;

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
      ${caw(28, "panel-mark")}
      <span class="panel-words"><strong>Caw</strong><span>Obelisk Site</span></span>
    </header>
    <div class="thread-body">
      <div class="hero">
        ${caw(80, "caw")}
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

/**
 * The empty Decisions tab: Caw over the empty state, the suggestions its
 * one action. A press opens Caw's panel in the frame, beside the page where
 * the desk has room and under it where it hasn't (CawFloat), the words in
 * his composer.
 */
const panel = (key, frame) => `
  <article class="frame frame-${frame} frame-page" data-context="panel" data-part-key="${key}" aria-label="The empty Decisions tab, ${frame}">
    <div class="empty">
      ${caw(80, "caw")}
      <h3 class="hero-title">No decisions yet</h3>
      <p class="empty-line">Caw writes a decision page: the choices this project needs you to make, each with its options.</p>
      <div class="hero-action">${part(key)}</div>
    </div>
    <aside class="caw-dock" data-slot="caw-dock" aria-label="Caw’s panel" hidden>
      <header class="panel-head">
        ${caw(28, "panel-mark")}
        <span class="panel-words"><strong>Caw</strong><span>Obelisk Site</span></span>
      </header>
      <div class="dock-body">
        <label class="composer">
          <span class="visually-hidden">Message Caw</span>
          <textarea rows="1" placeholder="Message Caw…" data-slot="composer-field"></textarea>
          <span class="send" aria-hidden="true"></span>
        </label>
      </div>
    </aside>
  </article>`;

/** StarterCards has no state while its starters are read: it draws nothing. */
const NOTHING = {
  "today:loading":
    '<p class="state-note">Draws nothing while the starters are read.</p>',
};

const state = (label, key) => `
  <figure class="state" data-state="${label}">
    <figcaption>${label}</figcaption>
    <div class="state-well" data-part-key="${key}">${NOTHING[key] ?? part(key)}</div>
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
    <div class="row" data-row="desk">
      <h3 class="row-head">Desk</h3>
      <div class="frames">${thread(threadKey, "desk")}${panel(panelKey, "desk")}</div>
    </div>
    <div class="row" data-row="phone">
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

/**
 * A press: the words into the composer of the frame it stands in, caret
 * after them; on the empty Decisions tab, Caw's panel opens there first.
 * A state's well has no composer, so a press there puts nothing anywhere.
 */
main.addEventListener("click", (event) => {
  const button = event.target.closest('[data-slot="suggestion"], [data-slot="starter"]');
  const frame = button?.closest(".frame");
  if (!frame) {
    return;
  }
  const words = button.querySelector('[data-slot="suggestion-text"], [data-slot="starter-text"]');
  const dock = frame.querySelector('[data-slot="caw-dock"]');
  if (dock) {
    dock.hidden = false;
    frame.dataset.docked = "";
  }
  const field = frame.querySelector('[data-slot="composer-field"]');
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
