// The design graph, round 29: the component on the page, its state machines as one graph in the panel, and
// the kept move's choreography in the dock, editable; on every screen (responsive-design.md). Round 29 builds
// the designer's sections A to F (the handle, the clip rows, the popover, Hide, the regions, the edges).

// ---- Glyphs ----
const icon = (name, cls) => SOLAR[name].replace("<svg ", '<svg aria-hidden="true" focusable="false"' + (cls ? ' class="' + cls + '"' : "") + " ");
const ICON = { zoomIn: "minimalistic-magnifer-zoom-in-bold-duotone", zoomOut: "minimalistic-magnifer-zoom-out-bold-duotone", play: "play-bold-duotone", pause: "pause-bold-duotone", loop: "repeat-bold-duotone", chevron: "alt-arrow-down-linear", chevronRight: "alt-arrow-right-linear", chevronLeft: "alt-arrow-left-linear", chevronUp: "alt-arrow-up-linear", graph: "structure-bold-duotone", outline: "list-bold-duotone", fail: "danger-circle-bold-duotone" };
// A clip's kind of property and its glyph (section B): what moves, read before its words are.
const PROP_GLYPH = { opacity: "sun-fog-bold-duotone", position: "move-bold-duotone", size: "maximize-bold-duotone", colour: "palette-bold-duotone", text: "text-field-bold-duotone", unfold: "sort-vertical-bold-duotone" };
const PROP_WORD = { opacity: "Opacity", position: "Position", size: "Size", colour: "Colour", text: "Text swap", unfold: "Unfold" };
for (const el of document.querySelectorAll("[data-icon]")) el.insertAdjacentHTML("afterbegin", icon(ICON[el.dataset.icon]));

// ---- The mockup's data: components, each with its state machines, each machine with its states and moves ----
// Every state carries the agent's note: what the state is for and what to check in it (clarity §6).
const longPrompt = "Read every issue opened since the last run in github.com/petralab/cockpit/issues?q=is%3Aopen+label%3Atriage, label each one by area, link duplicates, and say which need me before standup.";
const components = [
  {
    id: "form", name: "Create routine form",
    base: { name: "Triage new issues", prompt: "Read the issues opened since the last run, label each one, and say which need me.", when: "Every day", at: "09:00", zone: "Asia/Riyadh", read: "Next run today 09:00", type: "The hub's pick for each run", primary: "Create routine" },
    defaults: { when: "day", read: "readback", types: "loaded", save: "filled" },
    machineEdges: [["when", "read"], ["read", "save"], ["types", "save"]],
    machines: [
      { id: "when", name: "When it runs", states: [
          { id: "hour", name: "Every hour", note: "At swaps to the read-back; nothing else moves.", set: { when: "Every hour", at: null, read: "Next run 10:00" } },
          { id: "day", name: "Every day", note: "The form opens here; At holds 09:00.", set: { when: "Every day" } },
          { id: "week", name: "Every week", note: "The read-back names the day; At keeps its time.", set: { when: "Every week", read: "Next run Monday 09:00" } },
          { id: "custom", name: "Custom", note: "Schedule takes At's place; the read-back is the hub's own parse.", vars: [
            { name: "Readable", set: { when: "Custom", at: null, custom: "0 8,13 * * 1-5", read: "At 08:00 and 13:00, Monday through Friday · next run today 13:00" } },
            { name: "Unreadable", set: { when: "Custom", at: null, custom: "0 9 * *", read: null, failSchedule: "This schedule can't be read. Write five values separated by spaces: minute, hour, day of the month, month, day of the week." } } ] } ],
        edges: [["hour", "day"], ["day", "week"], ["day", "custom"]], path: ["hour", "day", "week", "custom"] },
      { id: "read", name: "Reading the schedule back", states: [
          { id: "reading", name: "Reading", note: "Asking the hub when it runs next.", set: { read: "Reading the schedule…", readMuted: true } },
          { id: "readback", name: "Read back", note: "The hub's words take the reading line's place.", set: {} },
          { id: "cant", name: "Can't be read", fail: true, note: "One line in the read-back's place; the fields stay as typed.", set: { read: null, readFail: "The hub couldn't read this schedule back." } } ],
        edges: [["reading", "readback"], ["reading", "cant"]], path: ["reading", "readback", "cant"] },
      { id: "types", name: "Delegate type", states: [
          { id: "loading", name: "Loading", note: "The field says Loading… until the list arrives.", set: { type: "Loading…" } },
          { id: "loaded", name: "Loaded", note: "The field offers the types; the hub's pick stays the default.", set: {} },
          { id: "typesfail", name: "Didn't load", fail: true, note: "The hub's pick stays; one line under the field says the list didn't load.", set: { failType: "The delegate types didn't load." } } ],
        edges: [["loading", "loaded"], ["loading", "typesfail"]], path: ["loading", "loaded", "typesfail"] },
      { id: "save", name: "Saving it", states: [
          { id: "empty", name: "Empty", note: "Just opened: Name and the instruction are blank.", set: { name: "", prompt: "" } },
          { id: "filled", name: "Filled", note: "Ready to create; the variants check that long words wrap and never clip.", vars: [
            { name: "Short instruction", set: {} },
            { name: "Long instruction with a link", set: { prompt: longPrompt } },
            { name: "Long name", set: { name: "Triage new issues for the cockpit repo and post the summary in the team thread before standup" } } ] },
          { id: "saving", name: "Saving", note: "Create reads Creating… while the hub works; nothing else changes.", set: { primary: "Creating…" } },
          { id: "failed", name: "Save failed", fail: true, note: "The reason sits above the actions; the form keeps every value.", vars: [
            { name: "The hub didn't answer", set: { failActions: "The routine wasn't created. The hub didn't answer." } },
            { name: "Delegate type refused", set: { type: "medium", failType: "The routine wasn't created. This project can't run the medium delegate type." } } ] },
          { id: "created", name: "Created", note: "The form closes; it's in the list.", set: { created: true } } ],
        edges: [["empty", "filled"], ["filled", "saving"], ["saving", "failed"], ["saving", "created"], ["failed", "saving", "Try again"]], path: ["empty", "filled", "saving", "failed", "created"] } ],
    // The moves that play: the agent's clips, each timed by house tokens; their ms are read from tokens.css.
    // `at` is a start: from the start, or after or with another clip, plus an offset.
    moves: {
      "save:filled>saving": [
        { key: "label", kind: "text", of: "Button label", does: "swaps to “Creating…”", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "save:saving>failed": [
        { key: "label", kind: "text", of: "Button label", does: "swaps to “Create routine”", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" },
        { key: "reveal", kind: "unfold", of: "Reason line", does: "unfolds", at: { ref: null, v: "--dur-stagger" }, dur: "--dur-pop", ease: "--ease-out", prop: "y", from: 16, to: 0, unit: "px" },
        { key: "fade", kind: "opacity", of: "Reason words", does: "fade in", at: { ref: "with", of: "reveal", v: 0 }, dur: "--dur-pop", ease: "--ease-out" } ],
      "save:failed>saving": [
        { key: "fold", kind: "unfold", of: "Reason line", does: "folds away", at: { ref: null, v: 0 }, dur: "--dur-exit", ease: "--ease-out" },
        { key: "label", kind: "text", of: "Button label", does: "swaps to “Creating…”", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "save:saving>created": [
        { key: "formOut", kind: "opacity", of: "Form", does: "folds away", at: { ref: null, v: 0 }, dur: "--dur-exit", ease: "--ease-out" },
        { key: "doneIn", kind: "position", of: "Created line", does: "rises in", at: { ref: "after", of: "formOut", v: 0 }, dur: "--dur-pop", ease: "--ease-out", prop: "y", from: 8, to: 0, unit: "px" } ],
      "when:day>custom": [
        { key: "swap", kind: "text", of: "At", does: "swaps to Schedule", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" },
        { key: "fade", kind: "text", of: "Read-back", does: "rewrites", at: { ref: null, v: "--dur-stagger" }, dur: "--dur-pop", ease: "--ease-out" } ],
    },
  },
  {
    id: "row", name: "Routine row",
    base: { name: "Morning board check", schedule: "Weekdays at 09:00", status: "Next run tomorrow 09:00", kind: "", actions: ["Run now"], dim: false },
    defaults: { pause: "active", runs: "waiting" },
    machineEdges: [["pause", "runs"]],
    machines: [
      { id: "pause", name: "Pausing it", states: [
          { id: "active", name: "Active", note: "Runs on its schedule; Run now is its action.", set: {} },
          { id: "paused", name: "Paused", note: "The row dims and Resume takes Run now's place.", set: { status: "Paused", kind: "muted", actions: ["Resume"], dim: true } } ],
        edges: [["active", "paused", "Pause"], ["paused", "active", "Resume"]], path: ["active", "paused"] },
      { id: "runs", name: "Its runs", states: [
          { id: "waiting", name: "Waiting", note: "Between runs: the status names the next one.", set: {} },
          { id: "running", name: "Running", note: "A live dot leads the status; Open takes the action's place.", set: { status: "Running for 2 min", kind: "live", actions: ["Open"] } },
          { id: "ran", name: "Ran", note: "The status says when it last ran and when it runs next.", vars: [
            { name: "A minute ago", set: { status: "Ran 1 min ago · next run tomorrow 09:00" } },
            { name: "Yesterday", set: { status: "Ran yesterday 09:00 · next run tomorrow 09:00" } } ] },
          { id: "failed", name: "Didn't run", fail: true, note: "The status says why in red; the action fixes that cause.", vars: [
            { name: "No machine online", set: { status: "Didn't run: no machine was online", kind: "fail", actions: ["Run now"] } },
            { name: "Budget spent", set: { status: "Didn't run: the project's budget is spent", kind: "fail", actions: ["Raise budget"] } } ] } ],
        edges: [["waiting", "running"], ["running", "ran"], ["running", "failed"], ["failed", "running", "Run again"], ["ran", "waiting"]], path: ["waiting", "running", "ran", "failed"] } ],
    moves: {
      "runs:waiting>running": [
        { key: "dot", kind: "size", of: "Live dot", does: "comes in", at: { ref: null, v: 0 }, dur: "--dur-pop", ease: "--ease-out" },
        { key: "fade", kind: "text", of: "Status words", does: "change", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "runs:running>failed": [
        { key: "dotOut", kind: "size", of: "Live dot", does: "goes", at: { ref: null, v: 0 }, dur: "--dur-exit", ease: "--ease-out" },
        { key: "fade", kind: "text", of: "Status words", does: "change", at: { ref: null, v: "--dur-stagger" }, dur: "--dur-fade", ease: "--ease-crossfade" },
        { key: "ink", kind: "colour", of: "Status words", does: "turn crimson", at: { ref: "with", of: "fade", v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "pause:active>paused": [
        { key: "dim", kind: "opacity", of: "Row", does: "dims", at: { ref: null, v: 0 }, dur: "--dur-control", ease: "--ease-out" },
        { key: "fade", kind: "text", of: "Status words", does: "change", at: { ref: "with", of: "dim", v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
    },
  },
];

// ---- Tokens: every clip's time and curve is read from tokens.css ----
const rootEl = document.documentElement;
const tok = (name) => getComputedStyle(rootEl).getPropertyValue(name).trim();
const ms = (name) => parseFloat(tok(name)) || 0;
const px = (name) => parseFloat(tok(name)) || 0;
// The duration ladder: the house's motion lengths, shortest first. Two tokens at one length keep the first.
const LADDER = ["--dur-stagger", "--dur-ghost", "--dur-control", "--dur-menu", "--dur-exit", "--dur-morph", "--dur-fade", "--dur-grow-exit", "--dur-reveal", "--dur-pop", "--dur-panel", "--dur-grow", "--dur-lift", "--dur-press-hold", "--dur-settle", "--dur-cascade"];
const CURVES = ["--ease-out", "--ease-in-out", "--ease-drawer", "--ease-arrive", "--ease-figure", "--ease-crossfade", "--ease-glide-in", "--ease-glide-out"];
const msOf = (v) => (typeof v === "string" ? ms(v) : v);
const ladderMs = () => [...new Set(LADDER.map(ms))].sort((a, b) => a - b);
// A length that lands on a token takes its name: the clip's own token first, else the ladder's.
function tokenAt(value, prefer) {
  if (typeof prefer === "string" && ms(prefer) === value) return prefer;
  return LADDER.find((t) => ms(t) === value) || null;
}
const asValue = (value, prefer) => tokenAt(value, prefer) || value;
const bezierOf = (name) => (tok(name).match(/cubic-bezier\(([^)]+)\)/) || [, "0,0,1,1"])[1].split(",").map(Number);
function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    if (Math.abs(X(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 40; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return Y(t);
  };
}
// Motion's duration-based spring (type "spring", visualDuration, bounce: motion-dom spring.ts getSpringOptions),
// integrated at 1ms. It rests by the house test (motion/spring.ts: |x| < 0.5 and |v| < 20, in px, over the
// clip's travel, or 100 when it has no px travel), from the last moment it was still outside it.
const springCache = new Map();
function springOf(visualMs, bounce, travel) {
  const id = visualMs + "|" + bounce + "|" + travel;
  if (springCache.has(id)) return springCache.get(id);
  const vd = Math.max(visualMs, 1) / 1000, root = (2 * Math.PI) / (vd * 1.2), k = root * root;
  const c = 2 * Math.min(1, Math.max(0.05, 1 - bounce)) * Math.sqrt(k), dt = 1 / 1000;
  let x = -1, v = 0, t = 0, moving = 0;
  const xs = [0];
  for (let i = 1; i <= 3000; i++) {
    v += (-k * x - c * v) * dt; x += v * dt; t += dt; xs.push(1 + x);
    if (!(Math.abs(x * travel) < 0.5 && Math.abs(v * travel) < 20)) moving = i;
  }
  xs.length = moving + 1;
  const s = { settle: moving, at: (tms) => (tms <= 0 ? 0 : tms >= xs.length - 1 ? 1 : xs[Math.floor(tms)]) };
  springCache.set(id, s);
  return s;
}
const isSpring = (e) => !!(e && typeof e === "object" && !Array.isArray(e) && e.spring);
const travelOf = (c) => (c.unit === "px" && c.from != null ? Math.abs(c.to - c.from) : 100);

// ---- Edits: per move, the agent's clips and the edited ones, with undo ----
const clone = (x) => JSON.parse(JSON.stringify(x));
const edits = {};
function E(c, key) {
  const id = c.id + "/" + key;
  if (!edits[id]) edits[id] = { orig: clone(c.moves[key]), cur: clone(c.moves[key]), past: [], future: [], view: "edited", sel: new Set(), rulerEnd: null };
  return edits[id];
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changed = (e, key) => !same(e.cur.find((x) => x.key === key), e.orig.find((x) => x.key === key));
const editCount = (e) => e.cur.filter((x) => changed(e, x.key)).length;
function commit(e, next) { if (same(next, e.cur)) return false; e.past.push(clone(e.cur)); e.future = []; e.cur = clone(next); return true; }
// Each clip's start and length in ms: an anchored start follows its anchor.
function resolve(clips) {
  const out = {};
  const get = (key, depth = 0) => {
    if (out[key]) return out[key];
    const c = clips.find((x) => x.key === key);
    let base = 0;
    if (c.at.ref && depth < 8) { const a = get(c.at.of, depth + 1); base = c.at.ref === "after" ? a.end : a.start; }
    const start = Math.max(0, base + (c.at.ref === "with" ? 0 : msOf(c.at.v)));
    const dur = msOf(c.dur);
    let fn, tail = start + dur;
    if (isSpring(c.ease)) { const s = springOf(dur, c.ease.spring.bounce, travelOf(c)); fn = (t) => s.at(t); tail = start + Math.max(dur, s.settle); }
    else { const f = bezier(Array.isArray(c.ease) ? c.ease : bezierOf(c.ease)); fn = (t) => f(t / dur); }
    return (out[key] = { start, dur, end: start + dur, tail, fn });
  };
  for (const c of clips) get(c.key);
  return out;
}
const lengthOf = (r) => Math.max(0, ...Object.values(r).map((x) => x.end));
const playLengthOf = (r) => Math.max(0, ...Object.values(r).map((x) => x.tail));

// ---- State ----
const startAt = (c, machine, state, vary = 0) => ({ cur: Object.fromEntries(c.machines.map((m) => [m.id, { state: m.id === machine ? state : c.defaults[m.id], vary: m.id === machine ? vary : 0 }])), last: machine });
// The components under review: every one, or those the address names (#review=form). A review of one
// component is the earlier single layout at every width.
const review = (() => { const m = location.hash.match(/review=([\w,-]+)/), ids = m ? m[1].split(",") : null, out = ids ? components.filter((c) => ids.includes(c.id)) : components; return out.length ? out : components; })();
const STARTS = { form: ["save", "failed"], row: ["runs", "failed"] };
// The component last kept (all-components-design.md: "tab becomes the component last kept"): the dock edits its
// move and the keys go to it; below the line where every page fits, the tabs show it alone.
let tab = review[0].id;
const views = Object.fromEntries(review.map((c) => [c.id, startAt(c, ...STARTS[c.id])]));
let peek = null; // { comp, machine, state, vary }: a hover's or a held press's preview, on its own page
let time = null; // the playhead in ms; null is the end of the move
let playing = null, looping = false, scrubbing = false;
// Compact screens: the face shown (graph | move), the drawer's stop (head | peek | full) and its height.
let face = "graph", stop = "peek", drawerH = 0;
const $ = (id) => document.getElementById(id);
const compOf = (id) => components.find((c) => c.id === id);
const comp = () => compOf(tab);
const machineOf = (c, id) => c.machines.find((m) => m.id === id);
const stateOf = (m, id) => m.states.find((s) => s.id === id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- The screen: the pane's class, its layout and its input (responsive-design.md, Frame) ----
// Measured on the pane (this window), never the device: an iPad in a 50% split is a portrait tablet. Targets
// size on any-pointer: coarse; hover behaviours key on (hover: hover).
const BP = { short: 560, tablet: 640, desk: 900, wide: 1800, ultra: 2450 };
const inputOf = () => (matchMedia("(any-pointer: coarse)").matches ? (matchMedia("(hover: hover)").matches ? "touch-hover" : "touch") : "fine");
function screenOf(w, h, input) {
  if (w < BP.tablet) return { screen: "phone-portrait", layout: "drawer" };
  if (h < BP.short) return { screen: w < BP.desk ? "phone-landscape" : "short", layout: "sheet" };
  if (w < BP.desk) return { screen: "tablet-portrait", layout: "drawer" };
  if (w < BP.wide) return { screen: input === "fine" ? "desk" : "tablet-landscape", layout: "desk" };
  return { screen: w < BP.ultra ? "wide" : "ultrawide", layout: "desk" };
}
// Every page at once (all-components-design.md): from bp-desk-wide, with two or more components under review,
// the pages stand in rows of as many as fit (each 600 with its margins either side, a margin apart, beside the
// 448 panel and its margins: W >= N x 636 + (N - 1) x 18 + 484), the tabs go and the graphs stack in the
// panel. Past bp-ultra the panel holds the graphs side by side where the row leaves room for two.
// The width a stable scrollbar gutter takes on this platform (0 where scrollbars overlay), measured once.
let sbw = null;
function scrollbarW() {
  if (sbw === null) { const p = document.createElement("div"); p.style.cssText = "position:absolute;visibility:hidden;inline-size:100px;block-size:10px;overflow:auto;scrollbar-gutter:stable"; document.body.append(p); sbw = p.offsetWidth - p.clientWidth; p.remove(); }
  return sbw;
}
function multiOf(w, layout) {
  if (review.length < 2 || layout !== "desk" || w < BP.wide) return null;
  const s5 = px("--space-5"), pageW = 600 + 2 * s5, panelW = px("--c-graph-panel-w");
  const perRow = Math.max(1, Math.floor((w - panelW - 2 * s5 + s5) / (pageW + s5)));
  const n = Math.min(review.length, perRow), rowW = n * pageW + (n - 1) * s5;
  // The pages' own row (each 600, a margin apart), which the centred review block is laid out from.
  return { perRow, rowW: n * 600 + (n - 1) * s5, wrapped: review.length > perRow, graphs: w >= BP.ultra && rowW + 2 * panelW + 2 * s5 <= w ? "row" : "stack" };
}
let screen = null;
// Sets html[data-screen], [data-layout], [data-input], [data-multi] and [data-graphs]; answers whether the
// layout changed.
function applyScreen() {
  const input = inputOf(), s = screenOf(innerWidth, innerHeight, input), was = screen, multi = multiOf(innerWidth, s.layout);
  screen = { ...s, input, multi };
  rootEl.dataset.screen = s.screen; rootEl.dataset.layout = s.layout; rootEl.dataset.input = input;
  rootEl.toggleAttribute("data-multi", !!multi);
  if (multi) rootEl.dataset.graphs = multi.graphs; else delete rootEl.dataset.graphs;
  // The page column keeps a stable scrollbar gutter: the row's width includes it, so two pages never wrap.
  if (multi) rootEl.style.setProperty("--row-w", multi.rowW + scrollbarW() + "px"); else rootEl.style.removeProperty("--row-w");
  rootEl.toggleAttribute("data-wrapped", !!multi && multi.wrapped);
  return !was || was.layout !== s.layout || !!was.multi !== !!multi || (was.multi && multi && was.multi.graphs !== multi.graphs);
}
const layoutIs = (l) => screen.layout === l;
// Where every target keeps the 44px touch floor (a finger, or a phone's screen), the graph never zooms itself
// below 1, so no fit shrinks a target under it; the person's own pinch or Fit all still may.
const touchFloors = () => screen.input !== "fine" || /^phone/.test(screen.screen);
const compact = () => !layoutIs("desk");
// A length token in px, whatever its unit (45dvh, 85vh): drawn once on a probe and measured.
function lenOf(name) {
  const p = document.createElement("div");
  p.style.cssText = "position:absolute;visibility:hidden;inline-size:0;block-size:var(" + name + ")";
  document.body.append(p); const h = p.getBoundingClientRect().height; p.remove();
  return h;
}
applyScreen();

// The page's fields: every machine's state applied in turn, the one in focus last so its words win.
function fieldsOf(c, cur, top) {
  const f = { ...c.base };
  for (const m of [...c.machines.filter((x) => x.id !== top), machineOf(c, top)]) {
    const sel = cur[m.id], st = stateOf(m, sel.state), v = st.vars ? st.vars[sel.vary] : null;
    Object.assign(f, st.set || {}, v ? v.set : {});
  }
  return f;
}
// The move into a machine's state: from the path's previous state, else any edge into it.
function moveInto(c, machine, state) {
  const m = machineOf(c, machine), via = views[c.id] && views[c.id].via;
  // An edge pressed in the graph picks its own source over the path's.
  const chosen = via && via.machine === machine && via.to === state ? m.edges.find(([a, b]) => a === via.from && b === state) : null;
  const from = chosen || m.edges.find(([a, b]) => b === state && m.path.indexOf(a) === m.path.indexOf(state) - 1) || m.edges.find(([, b]) => b === state);
  if (!from) return null;
  const key = m.id + ":" + from[0] + ">" + state;
  return { from: from[0], key, has: !!c.moves[key] };
}
// The kept move, as the dock edits it and the page plays it.
function keptMove() {
  const c = comp(), v = views[tab];
  const into = moveInto(c, v.last, v.cur[v.last].state);
  if (!into || !into.has) return null;
  const e = E(c, into.key);
  const clips = e.view === "original" ? e.orig : e.cur;
  return { c, into, e, clips, r: resolve(clips) };
}

// ---- The pages: one per component; only the last-kept one plays its move ----
const stageOf = (cid) => document.querySelector('.stage[data-comp="' + cid + '"]');
const marksOf = (cid) => document.querySelector('.marks[data-comp="' + cid + '"]');
const shownComps = () => (screen.multi ? review : [comp()]);
function drawStage(cid = tab) {
  const c = compOf(cid), v = views[cid];
  const pk = peek && peek.comp === cid ? peek : null;
  const tm = cid === tab ? time : null;
  const top = pk ? pk.machine : v.last;
  const cur = pk ? { ...v.cur, [pk.machine]: { state: pk.state, vary: pk.vary } } : v.cur;
  const km = !pk && cid === tab ? keptMove() : null;
  const into = !pk ? moveInto(c, top, cur[top].state) : null;
  const r = km ? km.r : {};
  const total = km ? playLengthOf(r) : 0;
  const t = tm === null ? total : tm;
  const p = (key) => (r[key] ? (t <= r[key].start ? 0 : t >= r[key].tail ? 1 : r[key].fn(Math.min(t - r[key].start, Math.max(r[key].dur, r[key].tail - r[key].start)))) : 1);
  const clipOf = (key) => (km ? km.clips.find((x) => x.key === key) : null);
  const val = (key, fallback) => { const cl = clipOf(key); return cl && cl.from != null ? cl.from + (cl.to - cl.from) * p(key) : fallback; };
  const fromF = into ? fieldsOf(c, { ...cur, [top]: { state: into.from, vary: 0 } }, top) : null;
  const f = fieldsOf(c, cur, top);
  applyStage(cid, c.id === "form" ? formHtml(f, fromF, p, val, tm) : rowHtml(f, fromF, p, tm), tm);
  if (pk) drawWashes(cid); else clearWashes(cid);
}
function softSwap(el, next) {
  const prev = el.dataset.text ?? el.textContent;
  if (prev === next) return;
  el.dataset.text = next;
  clearTimeout(el._softTimer);
  const out = document.createElement("span"); out.className = "t-text-soft-old"; out.setAttribute("aria-hidden", "true"); out.textContent = prev;
  const inn = document.createElement("span"); inn.className = "t-text-soft-new"; inn.textContent = next;
  el.classList.remove("is-swapping"); el.replaceChildren(out, inn);
  void el.offsetWidth;
  el.classList.add("is-swapping");
  el._softTimer = setTimeout(() => { el.classList.remove("is-swapping"); el.textContent = next; }, ms("--text-soft-dur") + 40);
}
// Moving between states with the same fields: every value that changed swaps softly in place.
// A state whose fields differ (or a frame of the move) draws whole.
// A frame of the move draws whole, and so does the first rest after one, so the page at rest is always drawn
// from the same markup.
function applyStage(cid, html, tm) {
  const stage = stageOf(cid), next = document.createElement("div");
  const afterFrame = !!stage._drewFrame; stage._drewFrame = tm !== null;
  next.innerHTML = html;
  const keys = (root) => [...root.querySelectorAll("[data-key]")].map((e) => e.dataset.key).join("|");
  const k = keys(next);
  if (tm === null && !afterFrame && k && keys(stage) === k) {
    for (const n of next.querySelectorAll("[data-key]")) {
      const cur = stage.querySelector('[data-key="' + n.dataset.key + '"]');
      cur.className = n.className; cur.dataset.val = n.dataset.val || "";
      cur.setAttribute("style", n.getAttribute("style") || "");
      const nt = n.querySelector(".t-text-soft"), ct = cur.querySelector(".t-text-soft");
      if (nt && ct) softSwap(ct, nt.textContent);
    }
    for (const n of next.querySelectorAll("[data-sync]")) {
      const cur = stage.querySelector('[data-sync="' + n.dataset.sync + '"]');
      if (cur) cur.setAttribute("style", n.getAttribute("style") || "");
    }
  } else {
    stage.replaceChildren(...next.childNodes);
  }
}
const soft = (text, wrap) => '<span class="t-text-soft' + (wrap ? " is-wrap" : "") + '">' + esc(text) + "</span>";
function crossfade(oldText, newText, k) {
  if (!oldText || oldText === newText || k >= 1) return soft(newText);
  return '<span style="display:inline-grid"><span style="grid-area:1/1;opacity:' + (1 - k) + '">' + esc(oldText) + '</span><span style="grid-area:1/1;opacity:' + k + '">' + esc(newText) + "</span></span>";
}
const doneCard = '<div class="frame"><div class="done" data-key="done" data-val="done"><b>Triage new issues</b> is created and its test run has started.</div></div>';
function formHtml(f, from, p, val, tm) {
  const outK = p("formOut"), inK = p("doneIn");
  if (f.created && (!from || (outK >= 1 && inK >= 1))) return doneCard;
  if (f.created) return '<div style="display:grid"><div style="grid-area:1/1;opacity:' + (1 - outK) + '">' + formHtml(from, null, () => 1, (k, d) => d, null) + '</div><div style="grid-area:1/1;align-self:start;opacity:' + inK + ";translate:0 " + val("doneIn", 0) + 'px">' + doneCard + "</div></div>";
  const field = (key, v, tall) => '<div class="input' + (tall ? " tall" : "") + '" data-key="' + key + '" data-val="' + esc(v || "") + '">' + soft(v || "", true) + "</div>";
  // A line that came in with the move unfolds and fades in; one the move takes away folds away.
  const line = (key, kind, text, was) => {
    if (!text && !was) return "";
    if (text && from && !was) {
      const r = p("reveal"), fd = p("fade"), y = val("reveal", 0);
      const style = r >= 1 && fd >= 1 && !y ? "" : "opacity:" + Math.min(1, fd) + ";max-height:" + 60 * Math.max(0, r) + "px;overflow:hidden;translate:0 " + y + "px";
      return '<p class="line ' + kind + '" data-key="' + key + '" data-val="' + esc(text) + '" style="' + style + '">' + soft(text, true) + "</p>";
    }
    if (!text) { const k = p("fold"); return k >= 1 ? "" : '<p class="line ' + kind + '" style="opacity:' + (1 - k) + ";max-height:" + 60 * (1 - k) + 'px;overflow:hidden">' + esc(was) + "</p>"; }
    return '<p class="line ' + kind + '" data-key="' + key + '" data-val="' + esc(text) + '">' + soft(text, true) + "</p>";
  };
  const fr = from || {};
  const swapK = p("swap");
  let second = "<div></div>";
  if (f.at) second = '<div class="field"><label>At</label>' + field("at", f.at) + "</div>";
  else if (f.custom) second = '<div class="field" style="opacity:' + swapK + '"><label>Schedule</label>' + field("custom", f.custom) + line("failSchedule", "fail", f.failSchedule, fr.failSchedule) + "</div>";
  const label = tm === null || !from ? soft(f.primary) : crossfade(from.primary, f.primary, p("label"));
  const read = f.read ? '<p class="line ' + (f.readMuted ? "muted" : "read") + '" data-key="read" data-val="' + esc(f.read) + '" style="opacity:' + (from && from.read !== f.read ? p("fade") : 1) + '">' + soft(f.read, true) + "</p>" : line("readFail", "fail", f.readFail, fr.readFail);
  return '<div class="frame">' +
    '<div class="field"><label>Name</label>' + field("name", f.name, false) + "</div>" +
    '<div class="field"><label>What each run does</label>' + field("prompt", f.prompt, true) + "</div>" +
    '<div class="two"><div class="field"><label>When</label>' + field("when", f.when) + "</div>" + second + "</div>" +
    '<div class="two"><div class="field"><label>Time zone</label>' + field("zone", f.zone) + "</div><div></div></div>" + read +
    '<div class="field"><label>Delegate type</label>' + field("type", f.type) + line("failType", "fail", f.failType, fr.failType) + "</div>" +
    line("failActions", "fail", f.failActions, fr.failActions) +
    '<div class="actions"><span class="note" data-key="note" data-val="test">Creating it runs it once now, as a test.</span><span class="btn">Cancel</span><span class="btn primary" data-key="primary" data-val="' + esc(f.primary) + '">' + label + "</span></div></div>";
}
function rowHtml(f, from, p, tm) {
  const others = '<div class="rrow"><b>Weekly milestone check</b><span class="rmeta">Mondays at 10:00</span><span class="rstatus muted">Next run Monday 10:00</span><span class="ractions"><span class="btn">Run now</span></span></div>';
  const dotK = from && from.kind !== "live" && f.kind === "live" ? p("dot") : from && from.kind === "live" && f.kind !== "live" ? 1 - p("dotOut") : f.kind === "live" ? 1 : 0;
  const status = tm === null || !from ? soft(f.status) : crossfade(from.status, f.status, p("fade"));
  const dim = from && from.dim !== f.dim ? (f.dim ? 1 - 0.55 * p("dim") : 0.45 + 0.55 * p("dim")) : f.dim ? 0.45 : 1;
  // Turning to the failure's ink is a clip of its own (a colour): the words' ink mixes over to crimson on it.
  const inkK = from && from.kind !== "fail" && f.kind === "fail" ? p("ink") : 1;
  const inkStyle = inkK < 1 ? ' style="color:color-mix(in oklab, var(--status-fail-ink) ' + Math.round(inkK * 100) + '%, var(--ink-strong))"' : "";
  const dot = '<span class="dot" data-sync="dot" style="inline-size:calc(var(--c-block-drop-dot) * ' + dotK + ");margin-inline-end:calc(var(--space-2) * " + dotK + ");opacity:" + dotK + '"></span>';
  return '<div class="rlist"><div class="rrow" data-sync="row" style="opacity:' + dim + '"><b>' + esc(f.name) + '</b><span class="rmeta">' + esc(f.schedule) + '</span><span class="rstatus ' + (f.kind === "live" ? "" : f.kind) + '" data-key="status" data-val="' + esc(f.status + "|" + f.kind) + '"' + inkStyle + ">" + dot + status + '</span><span class="ractions"><span class="btn" data-key="actions" data-val="' + esc(f.actions.join(" · ")) + '">' + soft(f.actions.join(" · ")) + "</span></span></div>" + others + "</div>";
}

// ---- Change marks: a wash over what a hover would change on the page (clarity §3 B) ----
const keptSnaps = {};
// One Target (the r21 ruling): an element that draws a box (a fill, an edge or a shadow) is washed on that box
// exactly; a bare one --c-target-gap outside it; the wash's radius is the element's plus that pad.
function drawsBox(el) {
  const cs = getComputedStyle(el), fill = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor);
  const edge = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none");
  return fill || edge || cs.boxShadow !== "none";
}
function snapStage(cid) {
  const st = stageOf(cid), wrap = st.getBoundingClientRect(), out = new Map();
  for (const el of st.querySelectorAll("[data-key]")) {
    const b = el.getBoundingClientRect();
    out.set(el.dataset.key, { val: el.dataset.val ?? el.textContent, cls: el.className, box: { x: b.left - wrap.left, y: b.top - wrap.top, w: b.width, h: b.height }, boxed: drawsBox(el), radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 });
  }
  return out;
}
function clearWashes(cid) { marksOf(cid).replaceChildren(); }
function drawWashes(cid) {
  const was = keptSnaps[cid];
  if (!was) return;
  const now = snapStage(cid), out = [], gap = px("--c-target-gap"), marks = marksOf(cid);
  for (const [k, n] of now) { const o = was.get(k); if (!o || o.val !== n.val || o.cls !== n.cls) out.push(["add", n, k]); }
  for (const [k, o] of was) if (!now.has(k)) out.push(["del", o, k]);
  // What the preview draws, in the stage's own coordinates: every box that shows a value or a control, less
  // those that came in or changed (their washes may stand where a gone value stood: the same place, by design).
  const st = stageOf(cid), sb = st.getBoundingClientRect(), added = new Set(out.filter(([k]) => k === "add").map(([, , key]) => key));
  const live = [...st.querySelectorAll("[data-key], label, .btn, .line, .note, .rrow > b, .rmeta, .rstatus, .done")].filter((el) => !added.has(el.dataset.key) && !el.closest(added.size ? [...added].map((k) => '[data-key="' + k + '"]').join(",") : "#none")).map((el) => { const b = el.getBoundingClientRect(); return { x: b.left - sb.left, y: b.top - sb.top, w: b.width, h: b.height }; }).filter((b) => b.w > 0.5 && b.h > 0.5);
  const hits = (r) => live.some((b) => Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x) > 0.5 && Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y) > 0.5);
  marks.replaceChildren(...out.map(([kind, n, key]) => {
    // A bare element's wash stands its gap outside it plus the wash's own 1px stroke, so the stroke stands
    // --c-target-gap clear of the text (the r25 review: the first letter sat on the stroke).
    const pad = n.boxed ? 0 : gap + 1, w = document.createElement("div");
    w.className = "wash " + kind; w.dataset.wash = kind; w.dataset.of = key; w.dataset.pad = pad;
    w.dataset.box = [n.box.x, n.box.y, n.box.w, n.box.h].join(",");
    let r = { x: n.box.x - pad, y: n.box.y - pad, w: n.box.w + 2 * pad, h: n.box.h + 2 * pad };
    // A gone value whose place the preview has filled with something else (the rows under it moved up) is
    // marked in the seam where it went: the gap nearest its old top that the preview leaves free, a wash
    // no taller than it was. It never covers what the preview shows.
    if (kind === "del" && hits(r)) {
      const reach = px("--space-3") + n.box.h, edges = [n.box.y - reach, n.box.y + n.box.h + reach];
      for (const b of live) if (Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x) > 0.5) edges.push(b.y, b.y + b.h);
      const ys = [...new Set(edges)].filter((y) => y >= edges[0] && y <= edges[1]).sort((a, b) => a - b);
      let seam = null;
      // It stands --c-target-gap off both neighbours, and only where that leaves it 4px (the r24 values ruling).
      for (let i = 1; i < ys.length; i++) {
        const t = ys[i - 1], h = Math.min(ys[i] - t, n.box.h) - 2 * gap, cand = { x: r.x, y: t + gap, w: r.w, h };
        if (h < 4 || hits(cand)) continue;
        if (!seam || Math.abs(t - n.box.y) < Math.abs(seam.y - n.box.y)) seam = cand;
      }
      if (seam) { r = seam; w.dataset.seam = ""; } else return null;
    }
    Object.assign(w.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px", borderRadius: (w.dataset.seam !== undefined ? Math.min(n.radius + pad, r.h / 2) : n.radius + pad) + "px" });
    return w;
  }).filter(Boolean));
  void marks.offsetWidth;
  for (const w of marks.children) w.classList.add("in");
}

// ---- The graph, laid out by dagre ----
function layout(items, edges, rankdir, margin, extra) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 22, ranksep: 46, edgesep: 12, marginx: margin, marginy: margin, ...extra });
  g.setDefaultEdgeLabel(() => ({}));
  for (const it of items) g.setNode(it.id, { width: it.w, height: it.h });
  for (const [a, b, label, hidden] of edges) g.setEdge(a, b, hidden ? { hidden } : label ? { label, width: label.length * 7 + 18, height: 22, labelpos: "c" } : {});
  dagre.layout(g);
  return g;
}
function fitLayout(items, edges, room, margin, extra) {
  const lr = layout(items, edges, "LR", margin), tb = layout(items, edges, "TB", margin, extra);
  const fits = (g) => g.graph().width <= room;
  return fits(lr) && fits(tb) ? (lr.graph().height <= tb.graph().height ? lr : tb) : fits(lr) ? lr : fits(tb) ? tb : lr.graph().width <= tb.graph().width ? lr : tb;
}
function moveOrder(c) {
  const order = [], left = c.machines.map((m) => m.id);
  while (left.length) {
    const next = left.find((id) => !c.machineEdges.some(([a, b]) => b === id && left.includes(a))) || left[0];
    order.push(next); left.splice(left.indexOf(next), 1);
  }
  return order;
}
const SVGNS = "http://www.w3.org/2000/svg";
// ---- One edge grammar (round 29, section F) ----
// Orthogonal runs between the states' boxes, every bend rounded by --c-edge-elbow-r. A forward edge leaves its
// source's far side and enters its target's near side through one turn at the middle of the gap between
// them (dagre's ranks); a way back (Try again) runs out to a lane beside both boxes, past every state of the
// machine, and comes in from that side. Its label is the kit badge standing on its longest run.
function route(S, T, dir, laneAt, viaLane) {
  const tb = dir === "TB";
  // The main axis (down the ranks) and the cross axis, in the box's own terms.
  const m0 = (b) => (tb ? b.t : b.l), m1 = (b) => (tb ? b.b : b.r), c = (b) => (tb ? (b.l + b.r) / 2 : (b.t + b.b) / 2);
  const P = (main, cross) => (tb ? { x: cross, y: main } : { x: main, y: cross });
  if (!viaLane && m0(T) >= m1(S) - 0.5) {
    const mid = (m1(S) + m0(T)) / 2, a = c(S), b = c(T);
    return Math.abs(a - b) < 0.5 ? [P(m1(S), a), P(m0(T), a)] : [P(m1(S), a), P(mid, a), P(mid, b), P(m0(T), b)];
  }
  // Back up the ranks: out of the source's cross side to the lane, along it, and into the target's.
  const sc = tb ? (S.t + S.b) / 2 : (S.l + S.r) / 2, tc = tb ? (T.t + T.b) / 2 : (T.l + T.r) / 2;
  const near = laneAt < (tb ? S.l : S.t);
  const sx = near ? (tb ? S.l : S.t) : tb ? S.r : S.b, tx = near ? (tb ? T.l : T.t) : tb ? T.r : T.b;
  const Q = (cross, main) => (tb ? { x: cross, y: main } : { x: main, y: cross });
  return [Q(sx, sc), Q(laneAt, sc), Q(laneAt, tc), Q(tx, tc)];
}
// A path through orthogonal points, each bend a quarter turn of radius r (less where a run is shorter).
function roundedPath(pts, r) {
  if (pts.length < 3) return "M" + pts.map((q) => q.x + "," + q.y).join(" L");
  let d = "M" + pts[0].x + "," + pts[0].y;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y), k = Math.min(r, l1 / 2, l2 / 2);
    const p1 = { x: b.x + ((a.x - b.x) * k) / (l1 || 1), y: b.y + ((a.y - b.y) * k) / (l1 || 1) }, p2 = { x: b.x + ((c.x - b.x) * k) / (l2 || 1), y: b.y + ((c.y - b.y) * k) / (l2 || 1) };
    d += " L" + p1.x + "," + p1.y + " Q" + b.x + "," + b.y + " " + p2.x + "," + p2.y;
  }
  const z = pts[pts.length - 1];
  return d + " L" + z.x + "," + z.y;
}
// The open chevron: two legs of --c-edge-head-leg at 90° to each other, meeting at the tip, the same stroke.
function headPath(tip, from) {
  const L = px("--c-edge-head-leg"), dx = tip.x - from.x, dy = tip.y - from.y, n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, k = L * Math.SQRT1_2;
  const a = { x: tip.x - k * ux - k * uy, y: tip.y - k * uy + k * ux }, b = { x: tip.x - k * ux + k * uy, y: tip.y - k * uy - k * ux };
  return "M" + a.x + "," + a.y + " L" + tip.x + "," + tip.y + " L" + b.x + "," + b.y;
}
// A machine's edges, drawn in its body's coordinates from dagre's node boxes. Returns the svg and the extent
// its lanes and labels reach, so the body grows to hold them.
function edgesSvg(g, m) {
  const svg = document.createElementNS(SVGNS, "svg"), dir = g.graph().rankdir || "TB", tb = dir === "TB";
  const box = (id) => { const n = g.node(id); return { l: n.x - n.width / 2, t: n.y - n.height / 2, r: n.x + n.width / 2, b: n.y + n.height / 2 }; };
  const all = g.nodes().map((id) => ({ id, ...box(id) })), farCross = Math.max(...all.map((b) => (tb ? b.r : b.b)));
  const s1 = px("--space-1"), s2 = px("--space-2"), badgeH = px("--c-badge-h");
  const lanes = { hi: null, lo: null }, ext = { l: 0, t: 0, r: g.graph().width, b: g.graph().height };
  const nearCross = Math.min(...all.map((b) => (tb ? b.l : b.t)));
  // Does a run across the ranks at `main`, from cross a to b, pass over a state other than these two?
  const blocked = (main, a, b, skip) => all.some((x) => !skip.includes(x.id) && (tb ? x.t < main && x.b > main && Math.min(x.r, Math.max(a, b)) > Math.max(x.l, Math.min(a, b)) : x.l < main && x.r > main && Math.min(x.b, Math.max(a, b)) > Math.max(x.t, Math.min(a, b))));
  for (const [from, to, label] of m.edges) {
    const S = box(from), T = box(to);
    // A forward edge whose straight run would cross another state (a skip in a column) takes a lane as a way
    // back does.
    const straight = Math.abs((tb ? (S.l + S.r) / 2 : (S.t + S.b) / 2) - (tb ? (T.l + T.r) / 2 : (T.t + T.b) / 2)) < 0.5;
    const crosses = straight && all.some((x) => x.id !== from && x.id !== to && (tb ? x.t > S.b - 0.5 && x.b < T.t + 0.5 && x.l < (S.l + S.r) / 2 && x.r > (S.l + S.r) / 2 : x.l > S.r - 0.5 && x.r < T.l + 0.5 && x.t < (S.t + S.b) / 2 && x.b > (S.t + S.b) / 2));
    const back = !((tb ? T.t : T.l) >= (tb ? S.b : S.r) - 0.5) || crosses;
    const words = label || "";
    const wordsW = words ? textW(words) + 2 * s2 : 0;
    let lane = 0;
    if (back) {
      // The lane on the far side (right of a top-down machine, under a left-to-right one) unless a state stands
      // in the way there; then the near side. Each further lane on a side stands a badge and a gap out.
      const cs = (b) => (tb ? (b.t + b.b) / 2 : (b.l + b.r) / 2);
      // Each lane stands clear of the last one's label: its own label's half past the side's running reach.
      lanes.hi ??= farCross + 2 * s2; lanes.lo ??= nearCross - 2 * s2;
      const hi = lanes.hi + wordsW / 2, lo = lanes.lo - wordsW / 2;
      const hiFree = !blocked(cs(S), tb ? S.r : S.b, hi, [from, to]) && !blocked(cs(T), tb ? T.r : T.b, hi, [from, to]);
      if (hiFree) { lane = hi; lanes.hi = hi + wordsW / 2 + 2 * s2; } else { lane = lo; lanes.lo = lo - wordsW / 2 - 2 * s2; }
    }
    const pts = route(S, T, dir, lane, back);
    const grp = document.createElementNS(SVGNS, "g");
    grp.setAttribute("class", "edge"); grp.dataset.from = from; grp.dataset.to = to; grp.dataset.machine = m.id;
    const d = roundedPath(pts, px("--c-edge-elbow-r"));
    const tip = pts[pts.length - 1], prev = pts[pts.length - 2];
    grp.innerHTML = '<path class="hit" d="' + d + '"/><path class="line" d="' + d + '"/><path class="head" d="' + headPath(tip, prev) + '"/>';
    grp.dataset.points = pts.map((q) => q.x + "," + q.y).join(" ");
    if (words) {
      // On the longest run, centred: the badge and its halo cut the line --space-1 either side.
      let best = 0, at = null;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (l > best) { best = l; at = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 }; } }
      const lbl = document.createElementNS(SVGNS, "g"); lbl.setAttribute("class", "lbl");
      lbl.innerHTML = '<rect x="' + (at.x - wordsW / 2) + '" y="' + (at.y - badgeH / 2) + '" width="' + wordsW + '" height="' + badgeH + '" rx="' + px("--radius-xs") + '"/><text x="' + at.x + '" y="' + at.y + '" text-anchor="middle" dominant-baseline="central">' + esc(words) + "</text>";
      grp.append(lbl);
      ext.l = Math.min(ext.l, at.x - wordsW / 2 - s1); ext.t = Math.min(ext.t, at.y - badgeH / 2 - s1); ext.r = Math.max(ext.r, at.x + wordsW / 2 + s1); ext.b = Math.max(ext.b, at.y + badgeH / 2 + s1);
    }
    for (const q of pts) { ext.l = Math.min(ext.l, q.x - s1); ext.t = Math.min(ext.t, q.y - s1); ext.r = Math.max(ext.r, q.x + s1); ext.b = Math.max(ext.b, q.y + s1); }
    svg.append(grp);
  }
  svg.setAttribute("width", ext.r - ext.l); svg.setAttribute("height", ext.b - ext.t);
  return { svg, ext };
}
// A label's width in meta type, measured once per word on a canvas in the face a probe resolves.
const textWs = new Map();
let textCv = null;
function textW(words) {
  if (textWs.has(words)) return textWs.get(words);
  if (!textCv) {
    const p = document.createElement("span"); p.style.font = "var(--type-meta)"; document.body.append(p);
    const cs = getComputedStyle(p); textCv = document.createElement("canvas").getContext("2d"); textCv.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily; p.remove();
  }
  const w = Math.ceil(textCv.measureText(words).width);
  textWs.set(words, w);
  return w;
}
const varyOf = (cid, machine, state) => { const k = views[cid].cur[machine]; return k.state === state ? k.vary : 0; };
const hoverMatters = (cid, machine, state, vary) => { const k = views[cid].cur[machine]; return !(k.state === state && k.vary === vary); };
// Each graph previews and keeps on its own page.
function stateNode(c, m, it) {
  const b = document.createElement("div"); b.className = "node" + (it.fail ? " fail" : ""); b.dataset.machine = m.id; b.dataset.state = it.id;
  b.setAttribute("role", "button"); b.tabIndex = 0;
  // A failure state leads its name with the house's failure glyph, in crimson.
  const t = document.createElement("b"); t.innerHTML = (it.fail ? '<span class="node-fail">' + icon(ICON.fail) + "</span>" : "") + esc(it.name); b.append(t);
  const d = document.createElement("p"); d.textContent = it.note; b.append(d);
  const unpeek = () => { const was = peek && peek.comp; peek = null; if (was) drawStage(was); mark(); };
  const enter = (vary) => { if (!hoverMatters(c.id, m.id, it.id, vary)) { if (peek) unpeek(); return; } const was = peek && peek.comp; peek = { comp: c.id, machine: m.id, state: it.id, vary }; if (was && was !== c.id) drawStage(was); drawStage(c.id); mark(); };
  const leave = () => { if (peek) unpeek(); };
  hoverable(b, () => enter(varyOf(c.id, m.id, it.id)), leave);
  pressable(b, () => enter(varyOf(c.id, m.id, it.id)), leave, () => keep(c.id, m.id, it.id, varyOf(c.id, m.id, it.id)));
  b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); keep(c.id, m.id, it.id, varyOf(c.id, m.id, it.id)); } };
  // A focus by key (or by script) reveals the state; a press's own focus doesn't move the view under the finger.
  b.addEventListener("focus", () => { if (performance.now() - lastPress > 500) revealNode(c.id, b); });
  if (it.vars) {
    const list = document.createElement("div"); list.className = "vars";
    it.vars.forEach((vv, i) => {
      const ch = document.createElement("button"); ch.className = "var"; ch.dataset.machine = m.id; ch.dataset.state = it.id; ch.dataset.vary = i; ch.dataset.label = vv.name; ch.textContent = vv.name;
      hoverable(ch, () => enter(i));
      pressable(ch, () => enter(i), leave, () => keep(c.id, m.id, it.id, i));
      list.append(ch);
    });
    b.append(list);
  }
  return b;
}
let lastPress = -Infinity;
addEventListener("pointerdown", () => { lastPress = performance.now(); }, true);
// Hover previews on a pointer that hovers (a mouse, a trackpad, a hovering Pencil); a finger never hovers.
function hoverable(el, on, off) {
  el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") on(); });
  if (off) el.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") off(); });
}
// Pressing (touch and a Pencil's tip): a press held --dur-press-hold previews, as a hover does, until it lifts;
// a tap keeps; a drag past 10px (a scroll) cancels both. A click from a mouse or a key keeps at once.
function pressable(el, preview, unpreview, keepIt) {
  el.addEventListener("pointerdown", (e) => {
    el._noClick = false;
    if (e.pointerType === "mouse") return;
    e.stopPropagation();
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    let shown = false, dead = false;
    const timer = setTimeout(() => { shown = true; preview(); }, ms("--dur-press-hold"));
    const off = () => { for (const [t, f] of [["pointermove", move], ["pointerup", done], ["pointercancel", done]]) removeEventListener(t, f, true); };
    const move = (ev) => { if (ev.pointerId !== id || dead || Math.hypot(ev.clientX - x0, ev.clientY - y0) <= 10) return; dead = true; clearTimeout(timer); if (shown) { shown = false; unpreview(); } };
    const done = (ev) => { if (ev.pointerId !== id) return; off(); clearTimeout(timer); el._noClick = ev.type === "pointerup" && (shown || dead); if (shown) unpreview(); };
    for (const [t, f] of [["pointermove", move], ["pointerup", done], ["pointercancel", done]]) addEventListener(t, f, true);
  });
  el.addEventListener("click", (e) => { e.stopPropagation(); if (el._noClick) { el._noClick = false; return; } keepIt(); });
  el.addEventListener("contextmenu", (e) => { if (screen.input !== "fine") e.preventDefault(); });
}
// ---- The graphs: one section per component under review, each with its own zoom, Outline and dials ----
const G = Object.fromEntries(review.map((c) => [c.id, { zoom: 1, gw: 0, gh: 0 }]));
const gsecOf = (cid) => document.querySelector('.gsec[data-comp="' + cid + '"]');
const graphOf = (cid) => gsecOf(cid).querySelector(".graph");
const doorsOf = (cid) => gsecOf(cid).querySelector(".doors");
const stateCount = (m) => m.states.length + (m.states.length === 1 ? " state" : " states");
function drawGraph(cid = tab) {
  const c = compOf(cid), graph = graphOf(cid), gs = G[cid];
  // A face out of view has no width; it draws when it comes back.
  if (!graph.clientWidth) return;
  graph.innerHTML = "";
  const zoomer = document.createElement("div"); zoomer.className = "zoomer";
  const world = document.createElement("div"); world.className = "world";
  // Drawn anew, its states take their tiers (mark) without a transition; two frames on, changes fade again.
  world.dataset.instant = "";
  requestAnimationFrame(() => requestAnimationFrame(() => delete world.dataset.instant));
  zoomer.append(world); graph.append(zoomer);
  // The slabs stand --space-2 in from the well and --space-8 apart; each holds its states --space-5 in.
  const margin = px("--space-2"), apart = px("--space-8"), room = graph.clientWidth - 2 * margin;
  // Nodes are 168px. Two machines stand side by side only where both fit at 168; under that the chain stays
  // top-to-bottom. Where targets keep the touch floor (a phone, a finger) each machine is one column instead,
  // its states as wide as the view leaves beside their lanes (columnLayout), so nothing narrows to fit.
  const chrome = 2 * px("--space-5"), full = 168, gap = 22;
  const two = graph.clientWidth >= 2 * (2 * full + gap + chrome) + 2 * margin + apart;
  const mroom = two ? Math.floor((room - apart) / 2) : room;
  const column = touchFloors() && !two;
  world.style.setProperty("--node-w", (column ? mroom - chrome : clamp(Math.floor((mroom - chrome - gap) / 2), 120, full)) + "px");
  graph.dataset.two = String(two);
  const regions = {};
  for (const m of c.machines) {
    const r = document.createElement("section"); r.className = "region"; r.setAttribute("aria-label", m.name); r.dataset.machine = m.id;
    // Its name inside it: a press fits the slab in the view (Framer's "Fit the canvas to your selection").
    const head = document.createElement("button"); head.type = "button"; head.className = "region-head"; head.dataset.tip = "Fit " + m.name;
    head.innerHTML = "<b>" + esc(m.name) + "</b><span>" + stateCount(m) + "</span>";
    head.onclick = (e) => { e.stopPropagation(); fitRegion(cid, m.id, "fit"); };
    const body = document.createElement("div"); body.className = "regionBody";
    r.append(head, body); world.append(r);
    const els = {};
    for (const it of m.states) { const b = stateNode(c, m, it); body.append(b); els[it.id] = b; }
    let g, drawn;
    if (column) {
      // Laid once at the view's width to learn how far its lanes reach, then again with the states that much
      // narrower, so the column and its lanes fill the view exactly.
      const W0 = mroom - chrome;
      const reach = edgesSvg(columnLayout(m, els, W0), m).ext;
      const W = Math.floor(W0 - (reach.r - reach.l - W0));
      r.style.setProperty("--node-w", W + "px");
      g = columnLayout(m, els, W);
    } else g = fitLayout(m.states.map((it) => ({ id: it.id, w: els[it.id].offsetWidth, h: els[it.id].offsetHeight })), m.edges, mroom - chrome, 0, { align: "UL" });
    drawn = edgesSvg(g, m);
    const { svg, ext } = drawn;
    // The body holds the states and every lane and label their edges reach; a lane on the near side shifts
    // the states in by its reach.
    const ox = -ext.l, oy = -ext.t;
    body.style.width = ext.r - ext.l + "px"; body.style.height = ext.b - ext.t + "px";
    svg.setAttribute("viewBox", ext.l + " " + ext.t + " " + (ext.r - ext.l) + " " + (ext.b - ext.t));
    for (const id of g.nodes()) { const p = g.node(id); els[id].style.left = p.x - p.width / 2 + ox + "px"; els[id].style.top = p.y - p.height / 2 + oy + "px"; }
    body.prepend(svg);
    // An edge is a press: it chooses that transition and loads the dock with its move.
    for (const e of svg.querySelectorAll(".edge")) e.addEventListener("click", (ev) => { ev.stopPropagation(); keep(cid, m.id, e.dataset.to, varyOf(cid, m.id, e.dataset.to), e.dataset.from); });
    regions[m.id] = r;
  }
  const sized = c.machines.map((m) => ({ id: m.id, w: regions[m.id].offsetWidth, h: regions[m.id].offsetHeight }));
  let outer = fitLayout(sized, c.machineEdges, room + 2 * margin, margin, { align: "UL", nodesep: apart, ranksep: apart });
  if (outer.graph().width > room + 2 * margin) {
    const order = moveOrder(c), chain = [];
    for (let i = 1; i < order.length; i++) if (!c.machineEdges.some(([a, b]) => a === order[i - 1] && b === order[i])) chain.push([order[i - 1], order[i], null, true]);
    outer = layout(sized, c.machineEdges.concat(chain), "TB", margin, { align: "UL", nodesep: apart, ranksep: apart, edgesep: 4 });
  }
  for (const id of outer.nodes()) { const p = outer.node(id); regions[id].style.left = p.x - p.width / 2 + "px"; regions[id].style.top = p.y - p.height / 2 + "px"; }
  gs.gw = outer.graph().width; gs.gh = outer.graph().height;
  world.style.width = gs.gw + "px"; world.style.height = gs.gh + "px";
  drawDoors(c);
  graph.onscroll = () => viewChanged(cid);
  applyZoom(cid);
  requestAnimationFrame(() => viewChanged(cid));
}

// A machine as one column (phones and touch): its states down its path's order, each the given width, the
// house rank gap between them; shaped as the dagre graph the edge router reads.
function columnLayout(m, els, width) {
  const order = m.path.concat(m.states.map((x) => x.id).filter((id) => !m.path.includes(id))), sep = 46, nodes = {};
  let y = 0;
  for (const id of order) { const h = els[id].offsetHeight; nodes[id] = { x: width / 2, y: y + h / 2, width, height: h }; y += h + sep; }
  const height = y - sep;
  return { graph: () => ({ width, height, rankdir: "TB" }), nodes: () => order, node: (id) => nodes[id] };
}

// ---- Doorways and pinned names (round 29, section E) ----
// One door per machine, kept across views, so a region leaving the view fades its door in and one coming back
// fades it out (data-on); one more per edge says "N more" past four and opens the Outline.
function drawDoors(c) {
  const box = doorsOf(c.id);
  box.replaceChildren();
  for (const m of c.machines) {
    const d = document.createElement("button"); d.type = "button"; d.className = "door"; d.dataset.machine = m.id; d.tabIndex = -1;
    d.setAttribute("aria-label", "Go to " + m.name); d.innerHTML = '<span class="door-face"><span class="door-name">' + esc(m.name) + "</span>" + icon(ICON.chevron) + "</span>";
    d.onclick = (e) => { e.stopPropagation(); fitRegion(c.id, m.id, "pan"); };
    box.append(d);
  }
  for (const edge of ["top", "bottom"]) {
    const d = document.createElement("button"); d.type = "button"; d.className = "door more"; d.dataset.more = edge; d.tabIndex = -1;
    d.innerHTML = '<span class="door-face"><span class="door-name"></span>' + icon(ICON.chevron) + "</span>";
    d.onclick = (e) => { e.stopPropagation(); openOutline(c.id, d); };
    box.append(d);
  }
}
// A door that is showing and changes band takes the new band's clip and place in the same frame, its face's
// transitions held for that frame, so no frame draws the old band's clip at the new place (the third review:
// a flipped door's shadow reached below the well for a few frames).
function setBand(d, band) {
  if (d.dataset.band === band) return;
  const f = d.querySelector(".door-face");
  if (!d.hasAttribute("data-on") || !f) { d.dataset.band = band; return; }
  f.style.transition = "none"; d.dataset.band = band; void f.offsetWidth;
  requestAnimationFrame(() => { f.style.transition = ""; });
}
// The chevron points out through the edge its door stands on.
const DOOR_TURN = { bottom: "0deg", top: "180deg", right: "-90deg", left: "90deg" };
// Every scroll, zoom and redraw: the names that pin and the doors that show.
function viewChanged(cid) {
  const g = graphOf(cid);
  if (!g || !g.clientHeight) return;
  const gb = g.getBoundingClientRect(), top = gb.top + g.clientTop, left = gb.left + g.clientLeft, W = g.clientWidth, H = g.clientHeight, z = G[cid].zoom;
  const s1 = px("--space-1"), s2 = px("--space-2");
  // The house edge fade at an end with more past it.
  const more = g.scrollHeight - g.clientHeight - g.scrollTop;
  g.dataset.fade = [g.scrollTop > 1 ? "top" : "", more > 1 ? "foot" : ""].filter(Boolean).join(" ");
  // Doors stand in the well's two bands, never over the view: a region wholly out of view gets one in the
  // band nearest it, along the band at the region's own place; one out to the side stands at that end of the
  // band its middle is nearer, its chevron pointing that way. Four at most per band, past that three and
  // "N more".
  const doors = doorsOf(cid), per = { top: [], bottom: [] };
  for (const r of g.querySelectorAll(".region")) {
    const rb = r.getBoundingClientRect(), d = doors.querySelector('.door[data-machine="' + r.dataset.machine + '"]');
    if (!d) continue;
    const below = rb.top - (top + H), above = top - rb.bottom, right = rb.left - (left + W), leftOf = left - rb.right;
    const out = below >= -0.5 || above >= -0.5 || right >= -0.5 || leftOf >= -0.5;
    if (!out) { delete d.dataset.on; continue; }
    const vert = Math.max(below, above), horiz = Math.max(right, leftOf);
    const way = vert >= horiz ? (below >= above ? "bottom" : "top") : right >= leftOf ? "right" : "left";
    const band = way === "top" || way === "bottom" ? way : rb.top + rb.height / 2 < top + H / 2 ? "top" : "bottom";
    const at = way === "right" ? Infinity : way === "left" ? -Infinity : rb.left + rb.width / 2 - left;
    d.style.setProperty("--door-turn", DOOR_TURN[way]);
    per[band].push({ d, at });
  }
  for (const d of doors.querySelectorAll(".door:not(.more)")) if (!Object.values(per).some((list) => list.some((x) => x.d === d))) delete d.dataset.on;
  for (const [band, list] of Object.entries(per)) {
    const moreDoor = doors.querySelector('.door[data-more="' + band + '"]');
    list.sort((a, b) => a.at - b.at);
    const shown = list.length > 4 ? list.slice(0, 3) : list, rest = list.length - shown.length;
    for (const x of list.slice(shown.length)) delete x.d.dataset.on;
    if (rest) { moreDoor.querySelector(".door-name").textContent = rest + " more"; moreDoor.setAttribute("aria-label", rest + " more machines, open the Outline"); moreDoor.style.setProperty("--door-turn", DOOR_TURN[band]); shown.push({ d: moreDoor, at: Infinity }); } else delete moreDoor.dataset.on;
    // Laid along the band in order, each its own width apart by --space-1, inside it by --space-2; where their
    // run is longer than the band, each names its region in an equal share, its words cut at the end.
    const span = W;
    for (const x of shown) x.d.style.maxInlineSize = "";
    if (shown.length) {
      const room = span - 2 * s2 - (shown.length - 1) * s1, total = shown.reduce((n, x) => n + x.d.offsetWidth, 0);
      if (total > room) for (const x of shown) x.d.style.maxInlineSize = Math.floor(room / shown.length) + "px";
    }
    let next = s2;
    const places = shown.map((x) => { setBand(x.d, band); const w = x.d.offsetWidth; const want = clamp(x.at - w / 2, s2, span - s2 - w); const at = Math.max(want, next); next = at + w + s1; return { x, at, w }; });
    let limit = span - s2;
    for (let i = places.length - 1; i >= 0; i--) { places[i].at = Math.min(places[i].at, limit - places[i].w); limit = places[i].at - s1; }
    // The band's own left is the view's (the well's edge and the view's share one inline start).
    const off = gb.left - doors.getBoundingClientRect().left + g.clientLeft;
    for (const { x, at } of places) { x.d.style.left = off + at + "px"; x.d.dataset.on = ""; x.d.tabIndex = 0; }
  }
  for (const d of doors.querySelectorAll(".door:not([data-on])")) d.tabIndex = -1;
  // A band stands only while it holds a door (impeccable critique: an empty band was dead room). Its coming
  // shrinks the view and its going grows it, so a door only ever adds a door or takes one away: no flicker. The
  // top band's coming and going moves the scroll by its height, so nothing in the view moves.
  const gv = g.parentNode, band = px("--c-doorway-tab-h");
  for (const [edge, attr] of [["top", "data-top"], ["bottom", "data-foot"]]) {
    const want = per[edge].length > 0;
    if (gv.hasAttribute(attr) === want) continue;
    gv.toggleAttribute(attr, want);
    if (edge === "top") g.scrollTop += want ? band : -band;
    return viewChanged(cid);
  }
  // A slab's name sticks to the view's top while its top has left the view and the slab is still in it, so the
  // room the view is in is named; it stops --space-5 short of its slab's foot, stands --space-2 under the view's
  // top (clear of a door's touch layer, which reaches 6px in), and never stands on a state: where pinned it
  // would cover one, it scrolls away with its slab instead (the third review).
  for (const r of g.querySelectorAll(".region")) {
    const head = r.querySelector(".region-head"), rb = r.getBoundingClientRect();
    const natural = rb.top + head.offsetTop * z, want = top + s2;
    const most = (r.offsetHeight - head.offsetTop - head.offsetHeight - px("--space-5")) * z;
    const inView = rb.bottom > top + 0.5 && rb.top < top + H - 0.5;
    let shift = inView ? clamp(want - natural, 0, Math.max(0, most)) : 0;
    if (shift > 0.5) {
      const hb = head.getBoundingClientRect(), t = natural + shift, b = t + head.offsetHeight * z;
      const covers = [...r.querySelectorAll(".node")].some((n) => { const q = n.getBoundingClientRect(); return Math.min(q.right, hb.right) - Math.max(q.left, hb.left) > 0.5 && Math.min(q.bottom, b) - Math.max(q.top, t) > 0.5; });
      if (covers) shift = 0;
    }
    head.style.translate = shift > 0.5 ? "0 " + Math.round((shift / z) * 100) / 100 + "px" : "";
    head.toggleAttribute("data-pinned", shift > 0.5);
  }
}
// The view moves (a pan to a region, a fit): set the new zoom and scroll, then play the world from where it
// was drawn to there over --dur-panel on --ease-in-out (a FLIP of the world, WAAPI): a pan caught by another
// starts from where the first stood. With less motion it jumps.
function animateView(cid, change) {
  const g = graphOf(cid), world = g.querySelector(".world");
  const before = world.getBoundingClientRect(), z0 = new DOMMatrix(getComputedStyle(world).transform).a || G[cid].zoom;
  for (const a of world.getAnimations()) a.cancel();
  change();
  const after = world.getBoundingClientRect(), z1 = G[cid].zoom;
  if (reduced()) { viewChanged(cid); return; }
  const dx = before.left - after.left, dy = before.top - after.top;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(z0 - z1) < 0.001) { viewChanged(cid); return; }
  const a = world.animate([{ transform: "translate(" + dx + "px, " + dy + "px) scale(" + z0 + ")" }, { transform: "scale(" + z1 + ")" }], { duration: ms("--dur-panel"), easing: tok("--ease-in-out") });
  a.onfinish = () => viewChanged(cid);
}
// Fit a region: "fit" zooms it to fill the view (between 0.5 and 1); "pan" keeps the zoom and only zooms out
// when the region would not fit whole. Either way it ends centred, or top-aligned where it is taller.
function fitRegion(cid, mid, mode) {
  const g = graphOf(cid), gs = G[cid], r = g.querySelector('.region[data-machine="' + mid + '"]');
  if (!r) return;
  const pad = px("--space-3"), W = g.clientWidth - 2 * pad, H = g.clientHeight - 2 * pad;
  const rw = r.offsetWidth, rh = r.offsetHeight, rx = r.offsetLeft, ry = r.offsetTop;
  const fitZ = touchFloors() ? 1 : clamp(Math.min(W / rw, H / rh), 0.5, 1);
  const z = mode === "fit" ? fitZ : Math.min(gs.zoom, fitZ);
  animateView(cid, () => {
    gs.zoom = z; gs.own = true; applyZoom(cid);
    const zm = g.querySelector(".zoomer");
    g.scrollLeft = zm.offsetLeft + (rx + rw / 2) * z - g.clientWidth / 2;
    g.scrollTop = rh * z > H ? zm.offsetTop + ry * z - pad : zm.offsetTop + (ry + rh / 2) * z - g.clientHeight / 2;
  });
}
function applyZoom(cid = tab) {
  const gs = G[cid], zoomer = graphOf(cid).querySelector(".zoomer"), label = fig(Math.round(gs.zoom * 100) + "%");
  gsecOf(cid).querySelector(".gsec-head .zoom-fit").innerHTML = label;
  if (cid === tab) $("zoomLevel").innerHTML = label;
  if (!zoomer) return;
  zoomer.style.width = gs.gw * gs.zoom + "px"; zoomer.style.height = gs.gh * gs.zoom + "px";
  zoomer.firstChild.style.transform = "scale(" + gs.zoom + ")";
}
// A zoom the person sets is theirs: the graph stops fitting its kept machine.
const setZoom = (cid, z, lo = 0.5) => { G[cid].zoom = clamp(z, lo, 1.6); G[cid].own = true; applyZoom(cid); viewChanged(cid); };
// Fit all (the zoom figure's press, ⇧1): every slab in the view, centred.
const fitZoom = (cid) => {
  const g = graphOf(cid), gs = G[cid];
  animateView(cid, () => { gs.own = true; gs.zoom = clamp(Math.min((g.clientWidth - 8) / gs.gw, (g.clientHeight - 8) / gs.gh), 0.5, 1); applyZoom(cid); g.scrollLeft = (g.scrollWidth - g.clientWidth) / 2; g.scrollTop = 0; });
};
// The Outline: the machines with their counts, in the kit's menu under the button that opened it; a press fits one.
function openOutline(cid, trigger) {
  const c = compOf(cid), v = views[cid];
  openMenu("outline", trigger, '<div class="menu-head">Outline</div>', c.machines.map((m) => ({ html: "<span>" + esc(m.name) + '</span><span class="count">' + stateCount(m) + "</span>", on: m.id === v.last, pick: () => fitRegion(cid, m.id, "fit") })));
}
// The kept state brought into view, with its from-node above it when there is room.
function showKept(cid = tab) {
  const v = views[cid], g = graphOf(cid);
  if (!g.clientHeight) return;
  const el = g.querySelector('.node[data-machine="' + v.last + '"][data-state="' + v.cur[v.last].state + '"]');
  if (!el) return;
  const into = moveInto(compOf(cid), v.last, v.cur[v.last].state);
  const fromEl = into ? g.querySelector('.node[data-machine="' + v.last + '"][data-state="' + into.from + '"]') : null;
  revealIn(cid, el, fromEl, true);
  viewChanged(cid);
}
// A state brought into its graph's view by the same rule as the kept one.
function revealNode(cid, el) {
  if (!graphOf(cid).clientHeight) return;
  revealIn(cid, el, null, false);
  viewChanged(cid);
}
function revealIn(cid, el, fromEl, fit) {
  const g = graphOf(cid), pad = px("--space-2"), gs = G[cid];
  // Until the person zooms it, the graph opens zoomed to hold the kept state's machine whole, its box and a
  // margin, between 0.75 and 1 (the r24 values ruling, call 3). Where it doesn't fit at 0.75, the view opens
  // on the kept state, its from-state above it when there is room, the machine's top cut cleanly.
  if (fit && !gs.own) {
    const rh = el.closest(".region").getBoundingClientRect().height / gs.zoom, z = touchFloors() ? 1 : clamp((g.clientHeight - 2 * pad) / rh, 0.75, 1);
    if (Math.abs(z - gs.zoom) > 0.001) { gs.zoom = z; applyZoom(cid); }
  }
  const box = g.getBoundingClientRect(), n = el.getBoundingClientRect(), r = el.closest(".region").getBoundingClientRect();
  const sh = 0;
  const at = (y) => y - box.top - g.clientTop + g.scrollTop - sh;
  const topWant = Math.min(at(r.top) - pad, fromEl ? at(fromEl.getBoundingClientRect().top) - pad : Infinity, at(n.top) - pad);
  let want = Math.max(at(n.bottom) + pad - (g.clientHeight - sh), topWant);
  // A focus keeps the view where it stands when that already shows the state; else it moves the least.
  if (!fit) { const s0 = g.scrollTop, Hv = g.clientHeight - sh; want = at(n.top) >= s0 - 0.5 && at(n.bottom) <= s0 + Hv + 0.5 ? s0 : at(n.top) < s0 ? at(n.top) - pad : at(n.bottom) + pad - Hv; }
  // The view it opens on (the r23 review): its top edge cuts nothing, a state, a machine's name, an edge's
  // label, a machine's box or an arrow inside one, and stands --space-2 clear of what shows under it; only an
  // arrow between machines may come in over it, its head in view. Its foot cuts no state, name or label (a
  // box or an arrow running on under it is the cue that there is more). The nearest such scroll to the
  // kept state's; where none shows the kept state whole, the edges cut no state or name, as before.
  const H = g.clientHeight - sh;
  let max = g.scrollHeight - g.clientHeight;
  const boxOf = (el) => { const b = el.getBoundingClientRect(); return [at(b.top), at(b.bottom)]; };
  const solid = [...g.querySelectorAll(".node, .region-head, .world svg .lbl")].map(boxOf);
  // The edge cuts no state, no machine's name and no edge label (the r24 values ruling, call 4); a machine's
  // box and arrows, between machines or inside one, may run on over it.
  const frames = [];
  const boxes = [...g.querySelectorAll(".node, .region-head")].map(boxOf);
  const cuts = (s) => boxes.some(([t, b]) => (t < s - 0.5 && b > s + 0.5) || (t < s + H - 0.5 && b > s + H + 0.5));
  const clear = (s) => s <= 0.5 || (!solid.some(([t, b]) => t < s + pad - 0.5 && b > s + 0.5) && !frames.some(([t, b]) => t < s + pad - 0.5 && b > s + 0.5));
  const footClear = (s) => !solid.some(([t, b]) => t < s + H - 0.5 && b > s + H + 0.5);
  // The clean view stands --space-2 clear at the foot as at the top (the r25 review).
  const footRoom = (s) => s + H >= max + H - 0.5 || !solid.some(([t, b]) => t < s + H + 0.5 && b > s + H - pad + 0.5);
  const keeps = (s) => at(n.top) >= s - 0.5 && at(n.bottom) <= s + H + 0.5;
  const cands = [want, 0, max];
  for (const [t, b] of boxes.concat(frames, solid)) cands.push(t - pad, t, b + pad - H, b - H, b + pad, b, t - pad - H + (b - t));
  // Scroll offsets land on whole pixels, so each candidate is tried rounded down and up.
  const pickBy = (ok) => (limit) => cands.flatMap((s) => [Math.floor(s), Math.ceil(s)]).map((s) => clamp(s, 0, Math.max(0, Math.floor(limit)))).filter((s) => ok(s) && keeps(s)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
  // Where no scroll leaves --space-2 under the top edge, the foot still cuts nothing (the r25 review) and the
  // top cuts no state, name or label.
  const uncut = (s) => s <= 0.5 || !solid.some(([t, b]) => t < s - 0.5 && b > s + 0.5);
  // The foot's --space-2 is the first wish; the top's margin outranks it where both can't stand.
  const strict = pickBy((s) => clear(s) && footClear(s) && footRoom(s)), topClear = pickBy((s) => clear(s) && footClear(s)), footFirst = pickBy((s) => uncut(s) && footClear(s)), loose = pickBy((s) => !cuts(s));
  // Last, where nothing keeps both edges clean (a short stacked well), the top stays uncut and the foot runs on
  // (round 27: the region bands made such views possible).
  const topOnly = pickBy((s) => uncut(s));
  const pick = (limit) => strict(limit) ?? topClear(limit) ?? footFirst(limit) ?? loose(limit) ?? topOnly(limit);
  let best = pick(max);
  // Where no view of the content as drawn shows the kept state whole and cuts nothing, the well gets room
  // past its last machine, so the view can open lower.
  if (best === undefined) {
    best = pick(Infinity);
    if (best !== undefined && best > max) { const tail = document.createElement("div"); tail.className = "graph-tail"; tail.style.blockSize = Math.ceil(best - max) + "px"; g.append(tail); max = g.scrollHeight - g.clientHeight; }
  }
  g.scrollTop = best ?? want;
  g.scrollLeft += n.left + n.width / 2 - (box.left + box.width / 2);
}
// Three tiers, per component: its kept state (coral, one per component on screen; crimson where it is a
// failure), every other machine's current state, and the rest.
function mark() {
  for (const c of review) {
    const v = views[c.id], sec = gsecOf(c.id);
    const peeked = (el) => !!peek && peek.comp === c.id && peek.machine === el.dataset.machine && peek.state === el.dataset.state;
    const kept = (el) => el.dataset.machine === v.last && v.cur[v.last].state === el.dataset.state;
    sec.querySelectorAll(".node").forEach((el) => {
      const on = v.cur[el.dataset.machine].state === el.dataset.state;
      el.classList.toggle("kept", on && kept(el)); el.classList.toggle("cur", on && !kept(el)); el.classList.toggle("peek", peeked(el));
      el.setAttribute("aria-current", on ? "true" : "false");
    });
    sec.querySelectorAll(".var").forEach((el) => {
      const k = v.cur[el.dataset.machine], i = +el.dataset.vary, on = k.state === el.dataset.state && k.vary === i;
      el.classList.toggle("kept", on && el.dataset.machine === v.last); el.classList.toggle("cur", on && el.dataset.machine !== v.last);
      el.classList.toggle("peek", peeked(el) && peek.vary === i);
    });
    // The machine the stage plays names itself in the strong ink.
    sec.querySelectorAll(".region").forEach((r) => r.classList.toggle("kept-region", r.dataset.machine === v.last));
    // The chosen edge: the transition into the kept state the dock plays, drawn last, in coral.
    const into = moveInto(c, v.last, v.cur[v.last].state);
    sec.querySelectorAll(".edge").forEach((e) => {
      const lit = !!into && e.dataset.machine === v.last && e.dataset.from === into.from && e.dataset.to === v.cur[v.last].state;
      e.classList.toggle("chosen", lit);
      if (lit && e.nextElementSibling) e.parentNode.append(e);
    });
  }
  document.querySelectorAll(".edge-dash").forEach((d) => d.remove());
  updateDash();
  // The drawer's and the sheet's head name the kept state.
  const v = views[tab];
  $("sheetState").textContent = stateOf(machineOf(comp(), v.last), v.cur[v.last].state).name;
  labelHead();
}
// Playback (section F): one 24px dash travels the chosen edge from source to target on the dock's clock,
// one clock with the playhead; shown while playing or scrubbing, and gone when playback ends.
function updateDash() {
  const e = gsecOf(tab).querySelector(".edge.chosen");
  let dash = document.querySelector(".edge-dash");
  const km = keptMove();
  const show = !!e && !!km && (scrubbing || (!!playing && !reduced()));
  if (!show) { if (dash) dash.remove(); return; }
  const line = e.querySelector(".line");
  if (!dash || dash.parentNode !== e.parentNode) { if (dash) dash.remove(); dash = document.createElementNS(SVGNS, "path"); dash.setAttribute("class", "edge-dash"); dash.setAttribute("d", line.getAttribute("d")); e.parentNode.append(dash); }
  const len = line.getTotalLength(), D = px("--c-edge-dash-len"), total = playLengthOf(km.r), k = total ? clamp((time ?? total) / total, 0, 1) : 1;
  dash.style.strokeDasharray = D + " " + (len + 2 * D);
  dash.style.strokeDashoffset = String(D - k * (len + D));
}
// A keep makes its component the last kept: the dock turns to its move and the keys go to it. A press on an
// edge keeps its target by that edge (`via`, its source).
function keep(cid, machine, state, vary, via) {
  stopPlay();
  const was = tab, v = views[cid]; tab = cid;
  v.cur[machine] = { state, vary }; v.last = machine; peek = null; time = null;
  v.via = via ? { machine, from: via, to: state } : null;
  closePop();
  if (was !== cid && screen.multi) drawStage(was);
  setCurrent();
  drawStage(cid); keptSnaps[cid] = snapStage(cid); mark(); buildDock(); showKept(cid);
}
// The last-kept component is the current one: the tabs' pick, the page and graph shown below the line.
function setCurrent() {
  for (const c of review) {
    const on = c.id === tab;
    gsecOf(c.id).toggleAttribute("data-current", on);
    const wrap = stageOf(c.id).parentNode;
    wrap.toggleAttribute("data-current", on);
    wrap.hidden = !screen.multi && !on;
  }
  for (const b of $("tabs").querySelectorAll(".t-tab")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
}

// ---- The dock: the kept move's clips over time, an editor ----
const panelOpen = () => $("panel").dataset.open === "true";
let tl = null; // the drawn timeline's handles
function rulerEndOf(km) {
  if (km.e.rulerEnd === null) km.e.rulerEnd = Math.max(lengthOf(resolve(km.e.cur)), lengthOf(resolve(km.e.orig))) + 100;
  return km.e.rulerEnd;
}
function rescale(km) {
  const want = Math.max(lengthOf(resolve(km.e.cur)), lengthOf(resolve(km.e.orig))) + 100;
  if (want === km.e.rulerEnd) return false;
  km.e.rulerEnd = want; return true;
}
// A curve's points, x and y from 0 to 1: a bezier, or a spring's response over its settle (it overshoots when
// it bounces).
function curvePoints(ease, n = 24) {
  const pts = [];
  if (isSpring(ease)) {
    const s = springOf(1000, ease.spring.bounce, 100), end = Math.max(1000, s.settle);
    for (let i = 0; i <= n; i++) { const t = (i / n) * end; pts.push([t / end, s.at(t)]); }
  } else {
    const f = bezier(Array.isArray(ease) ? ease : bezierOf(ease));
    for (let i = 0; i <= n; i++) pts.push([i / n, f(i / n)]);
  }
  return pts;
}
// The curve drawn small (16×10 at 1.5px, The Show Don't Tell Rule).
function glyph(ease, cls) {
  const d = curvePoints(ease).map(([x, y], i) => (i ? "L" : "M") + (1 + x * 14).toFixed(2) + " " + (9 - y * 8).toFixed(2)).join(" ");
  return '<svg class="' + (cls || "") + '" viewBox="0 0 16 10" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
const fmtMs = (v) => Math.round(v) + " ms";
// A token's short name, as the badge and the slider's detents say it.
const durShort = (t) => t.replace(/^--dur-/, "");
// The house curves the curve control offers as glyphs; any other value the agent wrote is Custom, as it is.
const SEG_CURVES = ["--ease-out", "--ease-in-out", "--ease-drawer", "--ease-crossfade"];
const CURVE_WORD = { "--ease-out": "ease-out", "--ease-in-out": "ease-in-out", "--ease-drawer": "drawer", "--ease-crossfade": "crossfade" };
function curveWord(c) {
  if (isSpring(c.ease)) return "spring " + Math.round(msOf(c.dur)) / 1000 + "s · " + c.ease.spring.bounce + " bounce";
  if (Array.isArray(c.ease)) return "custom";
  return CURVE_WORD[c.ease] || c.ease.replace(/^--ease-/, "");
}
// A Measured figure: JetBrains Mono, tabular, at its cap height; its unit after it in meta.
const fig = (v, unit, cls = "") => '<span class="fig ' + cls + '">' + v + (unit ? '<span class="unit">' + unit + "</span>" : "") + "</span>";
// When each badge last came or went (component/move/clip), so a redraw carries a running one on.
const tokLast = new Map();
// A clip's facts (round 29, section B), each its own press and its own dress: the length a figure with the
// token's badge after it only when the length is a token; the curve drawn with its word; the delta as figures.
// A value the person changed takes the selection pair.
function factsHtml(e, c) {
  const o = e.orig.find((x) => x.key === c.key), ch = (a, b) => (same(a, b) ? "" : " changed");
  const d = Math.round(msOf(c.dur)), isTok = typeof c.dur === "string";
  // Off a detent the badge keeps the name it last showed (it is folding away), never an empty chip.
  const name = isTok ? durShort(c.dur) : typeof o.dur === "string" ? durShort(o.dur) : "";
  let html = '<button type="button" class="fact fact-dur' + ch(c.dur, o.dur) + '" data-open="dur" aria-label="Length ' + d + " ms" + (isTok ? ", the " + esc(name) + " token" : "") + '">' + fig(d, "ms") + '<span class="tok"' + (isTok ? " data-on" : "") + ' aria-hidden="true"><span class="tok-clip"><code class="badge">' + esc(name) + "</code></span></span></button>";
  html += '<button type="button" class="fact fact-curve' + ch(c.ease, o.ease) + '" data-open="curve" aria-label="Curve ' + esc(curveWord(c)) + '">' + glyph(c.ease, "curve-glyph") + '<span class="word">' + esc(curveWord(c)) + "</span></button>";
  if (c.from != null) html += '<button type="button" class="fact fact-delta' + ch([c.from, c.to], [o.from, o.to]) + '" data-open="delta" aria-label="' + esc((c.prop || "") + " from " + c.from + " to " + c.to + " " + (c.unit || "")) + '">' + fig(c.from) + '<span class="arrow">→</span>' + fig(c.to, c.unit || "") + "</button>";
  return html;
}
const anchorWords = (e, c) => (c.at.ref ? c.at.ref + " " + e.cur.concat(e.orig).find((x) => x.key === c.at.of).of : "");
function clipRow(e, c) {
  const kind = c.kind || "text";
  return '<div class="tl-row clip" data-key="' + c.key + '" data-prop="' + kind + '"><div class="clip-name"><span class="lead" role="img" aria-label="' + PROP_WORD[kind] + '">' + icon(PROP_GLYPH[kind]) + '</span><p class="l1"><span class="el">' + esc(c.of) + '</span> <span class="chg">' + esc(c.does) + '</span></p><div class="facts">' + factsHtml(e, c) + '</div></div><div class="lane" data-key="' + c.key + '"><div class="ghost" hidden></div><div class="bar" role="button" tabindex="0" aria-pressed="false" data-key="' + c.key + '" aria-label="' + esc(c.of + " " + c.does) + '"' + (c.at.ref ? ' data-tip="' + esc(anchorWords(e, c)) + '"' : "") + '><i class="bar-hit" aria-hidden="true"></i></div><div class="tail" hidden></div></div></div>';
}
function buildDock(opts = {}) {
  const dock = $("dock"), km = keptMove();
  const move = $("faces").querySelector('[data-face="move"]');
  move.disabled = !km;
  if (!km) { dock.dataset.open = "false"; tl = null; sizeDockRoom(); if (face === "move") setFace("graph"); return; }
  dock.dataset.open = "true";
  dock.dataset.view = km.e.view;
  const m = machineOf(km.c, views[tab].last);
  // With every page on screen the dock names the component it edits: the last kept.
  const title = (screen.multi ? km.c.name + " · " : "") + stateOf(m, km.into.from).name + " → " + stateOf(m, views[tab].cur[views[tab].last].state).name;
  const n = editCount(km.e);
  const edited = n > 0;
  // The badges as they stood before this draw (the same move), so one that comes or goes animates.
  const sameMove = tl && tl.km.into.key === km.into.key && tl.km.c.id === km.c.id;
  const tokWas = new Map(sameMove && $("rows") ? [...$("rows").querySelectorAll(".clip")].map((r) => [r.dataset.key, r.querySelector(".tok").hasAttribute("data-on")]) : []);
  // Its head bar: the move, play and loop, the time; Compare, the count and Reset at its end.
  // The transport and the time hold the bar's trailing end, so play stays where the hand left it whatever
  // the move is called; the edits stand before them when there are any.
  let html = '<header class="dock-head"><h2 class="dock-title">' + esc(title) + "</h2>";
  html += '<div class="edits">';
  if (edited) html += '<div class="t-tabs" id="compare" role="tablist" aria-label="Compare"><span class="t-tabs-pill" aria-hidden="true"></span><button class="t-tab" role="tab" data-view="original"><span class="t-label">Original</span></button><button class="t-tab" role="tab" data-view="edited"><span class="t-label">Edited</span></button></div><span class="badge edits-count"><span class="num">' + n + "</span>" + (n === 1 ? " edit" : " edits") + '</span><button class="ghost-btn" id="resetAll">Reset</button>';
  html += '</div><div class="transport"><button class="tbtn" id="play" aria-label="Play">' + icon(ICON.play, "i-play") + icon(ICON.pause, "i-pause") + '</button><button class="tbtn" id="loop" aria-label="Loop" aria-pressed="' + looping + '">' + icon(ICON.loop) + '</button></div><span class="readout" id="readout"></span></header>';
  html += '<div class="tl" id="tl"><div class="end-area" id="endArea"></div>';
  html += '<div class="tl-row ruler-row"><div class="ruler" id="ruler"></div></div>';
  html += '<div class="rows" id="rows"><div class="row-ghost" id="rowGhost" aria-hidden="true"></div>' + km.clips.map((c) => clipRow(km.e, c)).join("") + "</div>";
  html += '<div id="ties"></div><div class="playhead" id="playhead"></div></div>';
  $("dockBody").innerHTML = html;
  tl = { km };
  // A badge whose detent changed comes or goes from where it stood; one still on its way when the rows are
  // drawn again (a slider held, then let go) carries on at the time it had reached, by a negative delay.
  const now = performance.now(), run = ms("--dur-pop");
  for (const r of $("rows").querySelectorAll(".clip")) {
    const t = r.querySelector(".tok"), id = km.c.id + "/" + km.into.key + "/" + r.dataset.key, on = t.hasAttribute("data-on"), was = tokWas.get(r.dataset.key), last = tokLast.get(id);
    let since = null;
    if (was !== undefined && was !== on) { since = 0; tokLast.set(id, { on, t: now }); }
    else if (last && last.on === on && now - last.t < run) since = now - last.t;
    if (since === null) continue;
    t.style.transition = "none"; t.toggleAttribute("data-on", !on); void t.offsetWidth; t.style.transition = "";
    if (since > 0) t.style.transitionDelay = -since + "ms";
    t.toggleAttribute("data-on", on);
    if (since > 0) requestAnimationFrame(() => { t.style.transitionDelay = ""; });
  }
  if (edited) { for (const b of dock.querySelectorAll("#compare .t-tab")) { b.setAttribute("aria-selected", String(b.dataset.view === km.e.view)); b.onclick = () => setView(b.dataset.view); } if (opts.pillFrom) glideFrom($("compare"), opts.pillFrom); else requestAnimationFrame(() => slidePill($("compare"), false)); $("resetAll").onclick = () => { if (commit(km.e, km.e.orig)) afterEdit(km, { replay: true }); }; }
  $("play").onclick = () => (playing ? stopPlay() : play());
  $("loop").onclick = () => { looping = !looping; $("loop").setAttribute("aria-pressed", String(looping)); if (looping && !playing) play(); };
  wireDock(km);
  layoutDock();
  sizeDockRoom();
  if (pop) placePop();
}
// The hover ghost glides under the row the pointer is on (--dur-ghost on ease-in-out); its first showing fades
// in where it stands.
function ghostTo(row) {
  const g = $("rowGhost");
  if (!g) return;
  if (!row) { delete g.dataset.on; return; }
  const fresh = !g.hasAttribute("data-on");
  if (fresh) g.dataset.fresh = "";
  g.style.setProperty("--ghost-y", row.offsetTop + "px"); g.style.setProperty("--ghost-h", row.offsetHeight + "px");
  if (fresh) { void g.offsetWidth; delete g.dataset.fresh; }
  g.dataset.on = "";
}
// A facts line keeps one line: where it overflows, the badges go first, then the curve's word; never the glyph
// or the figure.
function fitFacts() {
  for (const f of document.querySelectorAll("#rows .facts")) {
    delete f.dataset.drop;
    const room = f.clientWidth, need = () => f.scrollWidth;
    if (need() <= room + 0.5) continue;
    f.dataset.drop = "tok";
    if (need() > room + 0.5) f.dataset.drop = "tok word";
  }
}
// A strip that scrolls fades the edge with more to scroll.
function edgeFade(t) { const more = t.scrollWidth - t.clientWidth; if (more <= 1) { delete t.dataset.fade; return; } const s = t.scrollLeft > 1, e = t.scrollLeft < more - 1; t.dataset.fade = s && e ? "both" : s ? "start" : "end"; }
$("tabs").addEventListener("scroll", () => edgeFade($("tabs")), { passive: true });
function slidePill(tabs, animate) {
  if (!tabs) return;
  edgeFade(tabs);
  const t = tabs.querySelector('[aria-selected="true"]'), pill = tabs.querySelector(".t-tabs-pill");
  if (!t) return;
  if (!animate) { const prev = pill.style.transition; pill.style.transition = "none"; pill.style.transform = "translateX(" + t.offsetLeft + "px)"; pill.style.width = t.offsetWidth + "px"; void pill.offsetWidth; pill.style.transition = prev; }
  else { pill.style.transform = "translateX(" + t.offsetLeft + "px)"; pill.style.width = t.offsetWidth + "px"; }
}
// The segmented thumb glides from the segment it stood on to the chosen one, across a rebuild.
function glideFrom(tabs, fromView) {
  const from = tabs.querySelector('[data-view="' + fromView + '"]'), pill = tabs.querySelector(".t-tabs-pill");
  pill.style.transition = "none"; pill.style.transform = "translateX(" + from.offsetLeft + "px)"; pill.style.width = from.offsetWidth + "px";
  void pill.offsetWidth; pill.style.transition = "";
  slidePill(tabs, !reduced());
}
// Original | Edited redraws the rows from that move: their readouts, their tints and their bars are the
// original's under Original, so no edited value shows there.
function setView(view) {
  const km = keptMove();
  if (!km || km.e.view === view) return;
  const was = km.e.view;
  km.e.view = view;
  closePop();
  km.e.sel.clear();
  buildDock({ pillFrom: was });
  play();
}
// Geometry: the lanes' x from time, from the first lane's box.
// Stacked rows (a dock narrower than a name column and a lane): set by the dock's container query.
const stacked = () => !!$("tl") && getComputedStyle($("tl")).getPropertyValue("--rows").trim() === "stacked";
function laneGeo() {
  const lane = $("rows").querySelector(".lane"), tlb = $("tl").getBoundingClientRect(), lb = lane.getBoundingClientRect();
  return { x0: lb.left - tlb.left, w: lb.width, end: rulerEndOf(tl.km) };
}
const xOf = (g, t) => g.x0 + (g.w * t) / g.end;
function layoutDock(work) {
  if (!tl) return;
  const km = keptMove(); tl.km = km;
  const clips = work || km.clips, r = resolve(clips), e = km.e, g = laneGeo();
  // A face out of view has no width; it lays out when it comes back.
  if (!g.w) return;
  const ro = km.e.view === "original" ? null : resolve(e.orig);
  for (const c of clips) {
    const lane = $("rows").querySelector('.lane[data-key="' + c.key + '"]');
    const bar = lane.querySelector(".bar"), ghost = lane.querySelector(".ghost"), tail = lane.querySelector(".tail");
    const x = r[c.key];
    bar.style.left = (g.w * x.start) / g.end + "px"; bar.style.width = Math.max(1, (g.w * x.dur) / g.end) + "px";
    bar.setAttribute("aria-pressed", String(e.sel.has(c.key) && e.view !== "original"));
    lane.parentNode.toggleAttribute("data-chosen", e.sel.has(c.key) && e.view !== "original");
    bar.classList.toggle("spring", isSpring(c.ease));
    const isEdited = ro && !same(c, e.orig.find((o) => o.key === c.key));
    ghost.hidden = !isEdited;
    if (isEdited) { const o = ro[c.key]; ghost.style.left = (g.w * o.start) / g.end + "px"; ghost.style.width = (g.w * o.dur) / g.end + "px"; }
    tail.hidden = !(isSpring(c.ease) && x.tail > x.end);
    if (!tail.hidden) { tail.style.left = (g.w * x.end) / g.end + "px"; tail.style.width = Math.min(g.w - (g.w * x.end) / g.end, (g.w * (x.tail - x.end)) / g.end) + "px"; }
  }
  // The move's end: one area behind every row and the ruler, from the move's end to the ruler's end.
  const total = lengthOf(r), endX = xOf(g, total);
  const area = $("endArea");
  area.style.left = endX + "px";
  // Stacked, each lane and the ruler draw the end area themselves, from --end-x.
  $("tl").style.setProperty("--end-x", endX - g.x0 + "px");
  const rrow = $("dock").querySelector(".ruler-row");
  rrow.style.background = stacked() ? "" : "linear-gradient(to right, var(--surface-raised) " + (endX - rrow.offsetLeft) + "px, var(--surface-recess-deep) 0)";
  // The ruler: round times, every 100ms (50 under 300) where they fit, else the next step up a 1-2-5
  // ladder that leaves each label its own width and a half, plus --space-2, so no two ever meet.
  const ruler = $("ruler"), gap = px("--space-2");
  ruler.innerHTML = "<span>" + Math.round(g.end) + "</span>";
  const widest = ruler.firstChild.offsetWidth;
  const ladder = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const base = total < 300 ? 50 : 100;
  const step = ladder.find((s) => s >= base && (g.w * s) / g.end >= 1.5 * widest + gap) || ladder[ladder.length - 1];
  const marks = [];
  for (let t = 0; t <= g.end + 0.5; t += step) marks.push(t);
  ruler.innerHTML = marks.map((t) => '<span data-t="' + t + '">' + t + '</span><i style="left:' + (g.w * t) / g.end + 'px"></i>').join("");
  let prevRight = -Infinity;
  for (const s of ruler.querySelectorAll("span")) {
    const t = +s.dataset.t, w = s.offsetWidth, x = (g.w * t) / g.end, left = clamp(x - w / 2, 0, g.w - w);
    if (left < prevRight + gap) { s.remove(); continue; }
    s.style.left = left + "px"; prevRight = left + w;
    // Over the move's end area the tick's figure steps up to ink-muted, to hold 4.5:1 on the deeper recess.
    s.classList.toggle("over-end", left + w / 2 >= endX - g.x0);
  }
  drawTies(clips, r, g);
  fitFacts();
  updateTime();
}
// An anchored start draws its tie: a hairline from the anchor's edge to this bar's start, a foot at each end.
// Stacked, the tie stays in its own lane: a hairline across the lane at the anchor, its foot along the lane's
// middle to the bar's start, so it never crosses the names between two rows.
// The timeline scrolls: a mark placed in it from viewport boxes adds its scroll offset, or it lands that far
// up (the r23 review's stray bracket on the inline editor's fields was a tie drawn above its lane).
const tlTop = () => $("tl").getBoundingClientRect().top - $("tl").scrollTop;
function drawTies(clips, r, g) {
  const tlb = { left: $("tl").getBoundingClientRect().left, top: tlTop() }, html = [], st = stacked();
  for (const c of clips) {
    if (!c.at.ref) continue;
    const a = r[c.at.of], me = r[c.key];
    const aBar = $("rows").querySelector('.bar[data-key="' + c.at.of + '"]').getBoundingClientRect();
    const mBar = $("rows").querySelector('.bar[data-key="' + c.key + '"]').getBoundingClientRect();
    const ax = xOf(g, c.at.ref === "after" ? a.end : a.start), mx = xOf(g, me.start);
    const y0 = st ? mBar.top - tlb.top : aBar.top < mBar.top ? aBar.bottom - tlb.top : mBar.bottom - tlb.top;
    const y1 = st ? mBar.bottom - tlb.top : aBar.top < mBar.top ? mBar.top - tlb.top : aBar.top - tlb.top;
    const foot = st ? Math.round((y0 + y1) / 2) : y1 - 1;
    html.push('<div class="tie" data-for="' + c.key + '" style="left:' + Math.round(ax) + "px;top:" + Math.min(y0, y1) + "px;height:" + Math.abs(y1 - y0) + 'px"></div>');
    if (Math.abs(mx - ax) >= 1) html.push('<div class="tie" style="left:' + Math.min(ax, mx) + "px;top:" + foot + "px;height:1px;width:" + Math.abs(mx - ax) + 'px"></div>');
  }
  $("ties").innerHTML = html.join("");
}
function updateTime() {
  if (!tl || !$("playhead")) return;
  const km = tl.km, r = km.r, total = playLengthOf(r), len = lengthOf(r), g = laneGeo();
  const t = time === null ? len : Math.min(time, total);
  if (!g.w) return;
  $("playhead").style.left = xOf(g, Math.min(t, g.end)) + "px";
  $("tl").style.setProperty("--ph-x", xOf(g, Math.min(t, g.end)) - g.x0 + "px");
  const rb = $("ruler").getBoundingClientRect(), tb = $("tl").getBoundingClientRect();
  $("playhead").style.setProperty("--ph-y", rb.bottom - tlTop() - px("--space-1") / 2 + "px");
  $("readout").innerHTML = '<b class="fig">' + Math.round(t) + '</b> / <span class="fig">' + Math.round(len) + '<span class="unit">ms</span></span>';
  $("play").toggleAttribute("data-playing", !!playing);
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  updateDash();
}
// The page's room ends where the tool at its foot begins: the dock and its margins at a desk, the drawer.
function sizeDockRoom() {
  let room = 0;
  // The drawer's grabber stands on its top edge, half above it: the page's room ends above the grabber, so
  // nothing of the page shows under it (the r24 review).
  if (layoutIs("drawer")) room = drawerH + px("--c-grabber-h") / 2 + 0.5;
  else if (layoutIs("desk") && $("dock").dataset.open === "true") room = $("dock").offsetHeight + 2 * px("--space-5");
  rootEl.style.setProperty("--dock-room", room + "px");
}
// Playback: the page plays the move from 0, once, or on a loop. A committed edit replays it once.
function play() {
  const km = keptMove();
  if (!km) return;
  stopPlay();
  // Play at full drops the drawer to peek, so the page is seen playing.
  if (layoutIs("drawer") && stop === "full") setStop("peek");
  const total = playLengthOf(km.r);
  let start = null;
  const tick = (now) => {
    if (start === null) start = now;
    time = Math.min(total, now - start);
    drawStage(); updateTime();
    if (time < total) playing = requestAnimationFrame(tick);
    else if (looping) { start = now; playing = requestAnimationFrame(tick); }
    else { playing = null; time = null; drawStage(); updateTime(); }
  };
  time = 0; playing = requestAnimationFrame(tick); updateTime();
}
function stopPlay() { if (playing) { cancelAnimationFrame(playing); playing = null; time = null; drawStage(); updateTime(); } }
function afterEdit(km, { replay, rescaleNow = true, inPlace = false } = {}) {
  const lanes = [...$("dock").querySelectorAll(".lane")];
  const grew = rescaleNow && rescale(keptMove());
  if (editCount(km.e) === 0) km.e.view = "edited";
  const hadPop = pop && pop.key;
  const sel = [...km.e.sel];
  rebuildKeepingFocus();
  keptMove().e.sel = new Set(sel);
  if (grew && !reduced()) { for (const l of $("dock").querySelectorAll(".lane")) { l.classList.add("rescaling"); setTimeout(() => l.classList.remove("rescaling"), ms("--dur-reveal") + 40); } }
  layoutDock();
  if (hadPop && pop) { if (inPlace) refreshPop(keptMove().e.cur); else refreshPop(); }
  if (replay) play(); else { drawStage(); }
  void lanes;
}
function rebuildKeepingFocus() {
  const f = document.activeElement, key = f && f.classList && f.classList.contains("bar") ? f.dataset.key : null;
  buildDock();
  if (key) { const b = $("rows").querySelector('.bar[data-key="' + key + '"]'); if (b) b.focus({ preventScroll: true }); }
}
// Snapping (the token rule C): drags snap to tokens and to every clip's edges and the playhead; ⌥ frees.
function snapTargets(km, clips, skip) {
  const r = resolve(clips), out = [0];
  for (const c of clips) if (!skip.has(c.key)) out.push(r[c.key].start, r[c.key].end);
  out.push(time ?? lengthOf(r));
  return out;
}
function wireDock(km) {
  const rows = $("rows"), tlEl = $("tl");
  // Scrub: the knob, or anywhere on the ruler row's ruler.
  const scrubAt = (e) => { const g = laneGeo(), tlb = tlEl.getBoundingClientRect(); stopPlayKeepTime(); time = clamp(((e.clientX - tlb.left - g.x0) / g.w) * g.end, 0, playLengthOf(tl.km.r)); drawStage(); updateTime(); };
  const startScrub = (e) => { e.preventDefault(); scrubbing = true; rootEl.dataset.scrubbing = ""; e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e); e.currentTarget.onpointermove = scrubAt; e.currentTarget.onpointerup = e.currentTarget.onpointercancel = (ev) => { ev.currentTarget.onpointermove = null; scrubbing = false; delete rootEl.dataset.scrubbing; updateDash(); }; };
  $("ruler").onpointerdown = startScrub;
  for (const name of rows.querySelectorAll(".clip-name")) name.onclick = (e) => { if (e.target.closest(".fact")) return; const bar = name.parentNode.querySelector(".bar"); barClick(bar.dataset.key, e, "pointer", { name: true }); };
  // A fact opens its clip's popover grown out of itself (section C); a press on the fact whose popover is open
  // folds it back in.
  for (const f of rows.querySelectorAll(".fact")) f.onclick = (e) => {
    e.stopPropagation();
    const key = f.closest(".clip").dataset.key, open = f.dataset.open;
    if (pop && pop.key === key && pop.anchor && pop.anchor.open === open && pop.el.dataset.state === "open") { closePop(); return; }
    barClick(key, e, e.detail === 0 ? "key" : "pointer", { open });
  };
  // The hover ghost follows the pointer down the rows.
  for (const row of rows.querySelectorAll(".clip")) row.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") ghostTo(row); });
  rows.addEventListener("pointerleave", () => ghostTo(null));
  for (const bar of rows.querySelectorAll(".bar")) {
    bar.onpointermove = (e) => { if (bar.dataset.dragging || km.e.view === "original") return; const b = bar.getBoundingClientRect(), z = px("--bar-handle-zone"); const zone = e.clientX - b.left < z ? "start" : b.right - e.clientX < z ? "end" : ""; if (zone) bar.dataset.zone = zone; else delete bar.dataset.zone; };
    bar.onpointerleave = () => { delete bar.dataset.zone; };
    bar.onpointerdown = (e) => barDown(bar, e, e.pointerType === "mouse" ? null : touchZone(bar, e.clientX));
    bar.onkeydown = (e) => barKey(bar, e);
  }
  // Empty lane space selects: a marquee.
  // Touch has no marquee: a press beside a selected bar's end takes that end (its 44px handle), else it
  // clears the selection.
  for (const lane of rows.querySelectorAll(".lane")) lane.onpointerdown = (e) => {
    if (e.target.closest(".bar") || tl.km.e.view === "original") return;
    if (e.pointerType !== "mouse") { const bar = lane.querySelector('.bar[aria-pressed="true"]'), z = bar && touchZone(bar, e.clientX); if (z) barDown(bar, e, z); else { tl.km.e.sel = new Set(); closePop(); layoutDock(); } return; }
    marquee(e);
  };
}
// A selected bar's end handles on touch: transparent, the touch floor wide, centred on each end. A bar
// narrower than two handles keeps its middle third for moving it whole.
function touchZone(bar, x) {
  if (bar.getAttribute("aria-pressed") !== "true") return null;
  const b = bar.getBoundingClientRect(), half = px("--c-touch-floor") / 2, ds = Math.abs(x - b.left), de = Math.abs(x - b.right);
  if (Math.min(ds, de) > half) return null;
  if (x > b.left && x < b.right && (b.width >= 2 * half ? x > b.left + half && x < b.right - half : Math.abs(x - (b.left + b.width / 2)) < b.width / 6)) return null;
  return ds <= de ? "start" : "end";
}
function stopPlayKeepTime() { if (playing) { cancelAnimationFrame(playing); playing = null; } }
function barClick(key, e, origin, anchor) {
  const km = keptMove();
  if (km.e.view === "original") return;
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    if (e.metaKey || e.ctrlKey) { if (km.e.sel.has(key)) km.e.sel.delete(key); else km.e.sel.add(key); } else km.e.sel.add(key);
    closePop(); layoutDock(); return;
  }
  km.e.sel = new Set([key]);
  layoutDock();
  openPop(key, origin, anchor);
}
function barDown(bar, e, touchEdge) {
  const km = keptMove();
  if (km.e.view === "original" || e.button !== 0) return;
  const key = bar.dataset.key, zone = touchEdge || bar.dataset.zone || "body", x0 = e.clientX, g = laneGeo();
  const base = clone(km.e.cur), r0 = resolve(base);
  let moved = false, work = base;
  bar.setPointerCapture(e.pointerId);
  const sel = km.e.sel.has(key) ? new Set(km.e.sel) : new Set([key]);
  const pill = document.createElement("div"); pill.className = "drag-pill";
  const snapLine = document.createElement("div"); snapLine.className = "snap";
  const ticks = document.createElement("div");
  bar.onpointermove = (ev) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 4) return;
    if (!moved) {
      moved = true; bar.dataset.dragging = ""; rootEl.dataset.dragging = zone === "body" ? "body" : "edge";
      if (!km.e.sel.has(key)) { km.e.sel = new Set([key]); if (pop && pop.key !== key) closePop(); }
      if (pop) pop.held = true;
      $("tl").append(ticks, snapLine, pill); stopPlayKeepTime(); time = null;
    }
    const free = ev.altKey, dt = (dx / g.w) * g.end, c0 = base.find((x) => x.key === key), s0 = r0[key];
    const near = (v, targets) => { const tol = (6 / g.w) * g.end; let best = null; for (const t of targets) if (Math.abs(t - v) <= tol && (!best || Math.abs(t - v) < Math.abs(best - v))) best = t; return best; };
    const tens = (v) => Math.round(v / 10) * 10;
    work = clone(base);
    let snapAt = null, pillHtml = "", pillX = 0;
    ticks.innerHTML = "";
    if (zone === "body") {
      let start = s0.start + dt;
      if (free) start = tens(start);
      else {
        const targets = snapTargets(km, base, sel), stag = ms("--dur-stagger");
        const ladder = []; for (let t = 0; t <= g.end; t += stag) ladder.push(t);
        const sStart = near(start, targets.concat(ladder)), sEnd = near(start + s0.dur, targets);
        if (sStart !== null && (sEnd === null || Math.abs(sStart - start) <= Math.abs(sEnd - start - s0.dur))) { start = sStart; snapAt = sStart; }
        else if (sEnd !== null) { start = sEnd - s0.dur; snapAt = sEnd; }
        else start = tens(start);
      }
      const delta = start - s0.start;
      const order = [...sel].sort((a, b) => r0[a].start - r0[b].start || (base.find((x) => x.key === a).at.ref ? 1 : 0) - (base.find((x) => x.key === b).at.ref ? 1 : 0));
      for (const k of order) {
        const c = work.find((x) => x.key === k), rk = r0[k];
        let ns = rk.start + delta;
        if (ns < 0) ns = 0;
        if (c.at.ref === "with") { c.at = { ref: null, v: 0 }; }
        const anchorBase = c.at.ref ? (c.at.ref === "after" ? resolve(work)[c.at.of].end : resolve(work)[c.at.of].start) : 0;
        const off = Math.round(ns - anchorBase);
        c.at.v = asValue(off, typeof c0.at.v === "string" ? c0.at.v : null);
      }
      const rr = resolve(work);
      pillX = xOf(g, Math.max(rr[key].start, 0));
      pillHtml = '<span class="badge">starts ' + fmtMs(rr[key].start) + "</span>";
    } else {
      const end0 = s0.end;
      if (zone === "end") {
        let end = end0 + dt, dur;
        if (free) dur = tens(end - s0.start);
        else {
          const lens = ladderMs(), sL = near(end - s0.start, lens), sE = near(end, snapTargets(km, base, new Set([key])));
          if (sL !== null && (sE === null || Math.abs(sL - (end - s0.start)) <= Math.abs(sE - end))) { dur = sL; snapAt = s0.start + sL; }
          else if (sE !== null) { dur = sE - s0.start; snapAt = sE; }
          else dur = tens(end - s0.start);
          ticks.innerHTML = lens.filter((l) => s0.start + l <= g.end).map((l) => '<div class="tick" style="left:' + xOf(g, s0.start + l) + "px;top:" + (bar.getBoundingClientRect().bottom - tlTop()) + 'px"></div>').join("");
        }
        dur = Math.max(10, dur);
        const c = work.find((x) => x.key === key); c.dur = free ? dur : asValue(dur, typeof c0.dur === "string" ? c0.dur : null);
      } else {
        let start = s0.start + dt;
        if (free) start = tens(start);
        else { const s = near(start, snapTargets(km, base, new Set([key]))); if (s !== null) { start = s; snapAt = s; } else start = tens(start); }
        start = clamp(start, 0, end0 - 10);
        let dur = end0 - start;
        if (!free) { const t = tokenAt(dur); if (!t) { const lens = ladderMs(); const s = near(dur, lens); if (s !== null) { dur = s; start = end0 - s; snapAt = start; } } }
        const c = work.find((x) => x.key === key);
        if (c.at.ref === "with") c.at = { ref: null, v: 0 };
        const anchorBase = c.at.ref ? (c.at.ref === "after" ? resolve(work)[c.at.of].end : resolve(work)[c.at.of].start) : 0;
        c.at.v = asValue(Math.round(start - anchorBase), null);
        c.dur = free ? dur : asValue(dur, typeof c0.dur === "string" ? c0.dur : null);
      }
      const c = work.find((x) => x.key === key), rr = resolve(work);
      pillX = xOf(g, zone === "end" ? rr[key].end : rr[key].start);
      pillHtml = lengthBadge(c);
    }
    snapLine.hidden = snapAt === null;
    if (snapAt !== null) snapLine.style.left = xOf(g, snapAt) + "px";
    pill.innerHTML = pillHtml;
    pill.style.left = pillX + "px";
    pill.style.top = bar.getBoundingClientRect().top - tlTop() - px("--c-badge-h") - px("--space-1") + "px";
    layoutDock(work);
    if (zone === "body" && s0.start + dt < 0) bar.style.left = (g.w * -Math.sqrt(-(s0.start + dt) * 4)) / g.end + "px";
    if (pop) refreshPop(work);
  };
  bar.onpointerup = bar.onpointercancel = (ev) => {
    bar.onpointermove = (pe) => { if (!bar.dataset.dragging) { const b = bar.getBoundingClientRect(), z = px("--bar-handle-zone"); const zn = pe.clientX - b.left < z ? "start" : b.right - pe.clientX < z ? "end" : ""; if (zn) bar.dataset.zone = zn; else delete bar.dataset.zone; } };
    bar.onpointerup = null; bar.onpointercancel = null;
    pill.remove(); snapLine.remove(); ticks.remove();
    delete bar.dataset.dragging; delete rootEl.dataset.dragging;
    if (!moved) { if (ev.type === "pointerup") barClick(key, ev, "pointer"); return; }
    const r0 = pop ? pop.el.getBoundingClientRect() : null;
    const shown = parseFloat(bar.style.left);
    if (shown < 0 && !reduced()) bar.animate([{ left: shown + "px" }, { left: "0px" }], { duration: ms("--dur-control"), easing: tok("--ease-out") });
    if (commit(km.e, work)) afterEdit(km, { replay: true });
    else layoutDock();
    if (pop) { pop.held = false; movePop(r0); }
  };
}
function marquee(e) {
  const tlEl = $("tl"), tlb = tlEl.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  const box = document.createElement("div"); box.className = "marquee";
  const lane = e.currentTarget; lane.setPointerCapture(e.pointerId);
  const km = keptMove(); const add = e.shiftKey || e.metaKey; const startSel = add ? new Set(km.e.sel) : new Set();
  let moved = false;
  lane.onpointermove = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    if (!moved) { moved = true; tlEl.append(box); closePop(); }
    const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), t = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY);
    Object.assign(box.style, { left: l - tlb.left + "px", top: t - tlTop() + "px", width: r - l + "px", height: b - t + "px" });
    const sel = new Set(startSel);
    for (const bar of $("rows").querySelectorAll(".bar")) { const bb = bar.getBoundingClientRect(); if (bb.left < r && bb.right > l && bb.top < b && bb.bottom > t) sel.add(bar.dataset.key); }
    km.e.sel = sel; layoutDock();
  };
  lane.onpointerup = lane.onpointercancel = () => { lane.onpointermove = null; box.remove(); if (!moved) { km.e.sel = new Set(); closePop(); layoutDock(); } };
}
// Keys on a focused bar: arrows nudge the start (to the next snap target; ⇧ 50ms; ⌥ 1ms), [ and ] step the
// length on the ladder, Enter opens the popover with focus in Starts. Nudges land at once and don't replay.
function barKey(bar, e) {
  const km = keptMove(), key = bar.dataset.key;
  if (km.e.view === "original") return;
  if (e.key === "Enter") { e.preventDefault(); km.e.sel = new Set([key]); layoutDock(); openPop(key, "key"); return; }
  const next = clone(km.e.cur), c = next.find((x) => x.key === key), r = resolve(next)[key];
  const setStart = (s) => { s = Math.max(0, s); if (c.at.ref === "with") c.at = { ref: null, v: 0 }; const b = c.at.ref ? (c.at.ref === "after" ? resolve(next)[c.at.of].end : resolve(next)[c.at.of].start) : 0; c.at.v = asValue(Math.round(s - b), typeof c.at.v === "string" ? c.at.v : null); };
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    if (e.shiftKey) setStart(r.start + 50 * dir);
    else if (e.altKey) setStart(r.start + dir);
    else {
      const stag = ms("--dur-stagger"), t = snapTargets(km, km.e.cur, new Set([key]));
      for (let x = 0; x <= rulerEndOf(km); x += stag) t.push(x);
      const cand = t.filter((x) => (dir > 0 ? x > r.start + 0.5 : x < r.start - 0.5)).sort((a, b) => dir * (a - b));
      setStart(cand.length ? cand[0] : r.start + 10 * dir);
    }
  } else if (e.key === "[" || e.key === "]") {
    e.preventDefault();
    const lens = ladderMs(), d = r.dur, dir = e.key === "]" ? 1 : -1;
    const n = lens.filter((l) => (dir > 0 ? l > d : l < d)).sort((a, b) => dir * (a - b))[0];
    if (n === undefined) return;
    c.dur = asValue(n, null);
  } else return;
  if (commit(km.e, next)) afterEdit(km, { replay: false });
}

// ---- The clip popover (round 29, section C): it grows out of what was pressed ----
// One thing per tray: the clip's controls and nothing else. Its head is the row's first line; then the length
// (a slider with a detent at every --dur-* token, and a figure that takes any number), the curve (the house
// curves as glyphs, Spring, Custom, the chosen one drawn large with its handles), and the delta. A change
// applies at once and the stage replays; there is no foot and no Save.
let pop = null, closing = null;
const popInset = () => (compact() ? px("--c-screen-margin") : px("--space-5"));
const phoneWide = () => screen.screen === "phone-portrait" || screen.screen === "phone-landscape";
function clipNow(key, work) { const km = keptMove(); return (work || km.e.cur).find((x) => x.key === key); }
// The pressed thing, found again by what it is (a fact by its field, the name, or the bar), so a redrawn row
// gives the popover its source back.
function anchorEl(p = pop) {
  const row = p && $("rows") && $("rows").querySelector('.clip[data-key="' + p.key + '"]');
  if (!row) return null;
  const a = p.anchor;
  return (a && a.open && row.querySelector('.fact[data-open="' + a.open + '"]')) || (a && a.name && row.querySelector(".l1")) || row.querySelector(".bar");
}
// Read at rest: a fact still pressed (scaled by --press-scale) would put the box a pixel or two off.
function restRect(el) { const was = el.style.scale; el.style.scale = "1"; const b = el.getBoundingClientRect(); el.style.scale = was; return b; }
function popBounds() { const inset = popInset(); return { l: inset, t: inset, r: innerWidth - inset, b: innerHeight - inset }; }
// Where it stands: above the row, start-aligned on the pressed thing, --space-1 off it; below only when the
// room above is shorter than it and shorter than the room below; inside the viewport's inset either way.
function popPlace(p = pop) {
  const a = anchorEl(p);
  if (!a) return null;
  const b = restRect(a), el = p.el, B = popBounds(), gap = px("--space-1"), w = el.offsetWidth, h = el.offsetHeight;
  const left = clamp(b.left, B.l, B.r - w), roomAbove = b.top - gap - B.t, roomBelow = B.b - (b.bottom + gap);
  const above = roomAbove >= h || roomAbove >= roomBelow;
  const top = clamp(above ? b.top - gap - h : b.bottom + gap, B.t, Math.max(B.t, B.b - h));
  return { left, top, w, h, above, src: b, radius: parseFloat(getComputedStyle(a).borderTopLeftRadius) || px("--radius-xs") };
}
function placePop(p = pop) {
  if (!p) return;
  const q = popPlace(p);
  if (!q) return;
  const s = p.el.style;
  s.left = q.left + "px";
  // Above, it hangs from its foot, so a taller body grows up and away from the row.
  if (q.above) { s.top = "auto"; s.bottom = innerHeight - (q.top + q.h) + "px"; } else { s.bottom = "auto"; s.top = q.top + "px"; }
  p.above = q.above;
  // Closed, its box is the source's rect and radius in the popover's own frame.
  s.setProperty("--from-t", q.src.top - q.top + "px"); s.setProperty("--from-l", q.src.left - q.left + "px");
  s.setProperty("--from-r", q.left + q.w - q.src.right + "px"); s.setProperty("--from-b", q.top + q.h - q.src.bottom + "px");
  s.setProperty("--from-radius", q.radius + "px");
}
const movePop = () => placePop();
// The source is hidden while the box flies out of it or folds back into it: one box on screen.
// It shows again once the box has grown (its transitionend, on the clock the box runs on).
function fly(p) {
  for (const x of document.querySelectorAll("[data-flying]")) delete x.dataset.flying;
  const a = anchorEl(p);
  if (!a || reduced()) return;
  a.dataset.flying = "";
  const box = p.el.querySelector(".pop-box");
  if (p.flyEnd) box.removeEventListener("transitionend", p.flyEnd);
  p.flyEnd = (e) => { if (e.target !== box || e.propertyName !== "top" || p.el.dataset.state !== "open") return; box.removeEventListener("transitionend", p.flyEnd); for (const x of document.querySelectorAll("[data-flying]")) delete x.dataset.flying; };
  box.addEventListener("transitionend", p.flyEnd);
}
function openPop(key, origin, anchor) {
  const km = keptMove();
  if (!km || km.e.view === "original") return;
  // The same clip, open: the popover re-anchors on what was pressed now.
  if (pop && pop.key === key) { pop.anchor = anchor || null; placePop(); if (origin === "key") focusFirst(); return; }
  // A fold caught by a press on its own source turns back from where the box is drawn.
  if (closing && closing.key === key && same(closing.anchor, anchor || null)) {
    pop = closing; closing = null;
    pop.el.dataset.state = "open"; fly(pop);
    return;
  }
  if (pop) { const p = pop; pop = null; p.el.remove(); }
  const el = document.createElement("div");
  el.className = "pop"; el.dataset.state = "closed"; el.setAttribute("role", "dialog"); el.dataset.key = key;
  el.innerHTML = '<div class="pop-box"></div><div class="pop-body"></div>';
  // On a phone the kit's own rule: the viewport less 24px.
  if (phoneWide()) el.style.inlineSize = innerWidth - 2 * px("--c-screen-margin") + "px";
  pop = { key, el, origin, held: false, committed: {}, anchor: anchor || null };
  document.body.append(el);
  // Measured and placed with its box held still, so the box stands on the source's rect before it grows.
  const box = el.querySelector(".pop-box"); box.style.transition = "none";
  renderPop();
  placePop();
  void box.offsetWidth; box.style.transition = "";
  const c = clipNow(key); el.setAttribute("aria-label", c.of + " " + c.does);
  fly(pop);
  el.dataset.state = "open";
  if (origin === "key") focusFirst();
  playLive();
}
function focusFirst() { const i = pop.el.querySelector(".dslider") || pop.el.querySelector("input, button"); if (i) i.focus({ preventScroll: true }); }
// Closed by Esc, a press outside or a press on its source: the box folds back into the source as it stands now.
function closePop(instant) {
  closeMenu();
  if (closing && instant) { closing.el.remove(); closing = null; }
  if (!pop) return;
  const p = pop; pop = null;
  if (instant) { p.el.remove(); for (const x of document.querySelectorAll("[data-flying]")) delete x.dataset.flying; return; }
  if (closing) closing.el.remove();
  closing = p;
  placePop(p);
  p.el.dataset.state = "closed";
  // The source stays hidden until the box has folded into it; then the box goes. Both on the fold's own clock
  // (its transitionend), so a paused or slowed clock holds them.
  const a = anchorEl(p);
  for (const x of document.querySelectorAll("[data-flying]")) delete x.dataset.flying;
  if (a && !reduced()) a.dataset.flying = "";
  const done = () => { if (closing !== p) return; closing = null; p.el.remove(); for (const x of document.querySelectorAll("[data-flying]")) delete x.dataset.flying; };
  const box = p.el.querySelector(".pop-box");
  p.el.addEventListener("transitionend", (e) => { if ((e.target === box && e.propertyName === "top") || (e.target === p.el && e.propertyName === "opacity")) done(); });
  requestAnimationFrame(() => { if (!p.el.getAnimations({ subtree: true }).length) done(); });
  p.timer = 0;
}
const fieldVal = (v) => String(Math.round(msOf(v) * 100) / 100);
// The field is a label round its input, so a press anywhere on its box is the input's.
function fieldHtml(f, value, unit, label) { return '<label class="fld"><input data-f="' + f + '" inputmode="decimal" aria-label="' + esc(label) + '" value="' + esc(value) + '">' + (unit ? '<span class="unit">' + unit + "</span>" : "") + "</label>"; }
// The slider's detents: one per house length, two tokens at one length keeping the first.
const detents = () => { const seen = new Set(), out = []; for (const t of LADDER) { const v = ms(t); if (!seen.has(v)) { seen.add(v); out.push({ t, v }); } } return out.sort((a, b) => a.v - b.v); };
const sliderMax = (d) => Math.max(500, Math.ceil(d / 100) * 100);
function sliderHtml(c, mode) {
  const d = msOf(c.dur), max = sliderMax(d), at = (v) => (Math.min(v, max) / max) * 100, on = typeof c.dur === "string" ? ms(c.dur) : null;
  const tok = typeof c.dur === "string" ? durShort(c.dur) : null;
  let html = '<div class="dslider" role="slider" tabindex="0" aria-label="' + (mode === "spring" ? "Response" : "Duration") + '" aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + Math.round(d) + '" aria-valuetext="' + Math.round(d) + " ms" + (tok ? ", the " + tok + " token" : "") + '" data-max="' + max + '"><div class="dslider-track"></div><div class="dslider-fill" style="inline-size:' + at(d) + '%"></div>';
  for (const x of detents()) html += '<i class="dtick" style="left:' + at(x.v) + '%"' + (x.v === on ? " data-on" : "") + '></i><span class="dname" data-v="' + x.v + '" style="left:' + at(x.v) + '%"' + (x.v === on ? " data-on" : "") + ">" + esc(durShort(x.t)) + "</span>";
  return html + '<div class="dthumb" style="left:' + at(d) + '%"></div></div>';
}
// The detents' names where they have room, each its own width and --space-1 clear of every name shown; the
// rest keep their tick alone.
function labelTicks() {
  const s = pop && pop.el.querySelector(".dslider");
  if (!s) return;
  const names = [...s.querySelectorAll(".dname")], gap = px("--space-1"), W = s.clientWidth;
  const box = (n) => { const x = (parseFloat(n.style.left) / 100) * W, w = n.offsetWidth; return [x - w / 2, x + w / 2]; };
  const taken = [];
  const fits = ([a, b]) => a >= 0 && b <= W && taken.every(([c, d]) => b + gap <= c || a >= d + gap);
  // The chosen detent's name first, then the lengths the designer named (ghost, fade, pop, panel, grow), then
  // the rest left to right.
  const named = ["ghost", "fade", "pop", "panel", "grow"], rank = (n) => (n.hasAttribute("data-on") ? -1 : named.includes(n.textContent) ? named.indexOf(n.textContent) : named.length);
  const order = names.slice().sort((a, b) => rank(a) - rank(b));
  for (const n of order) { const b = box(n); if (fits(b)) { taken.push(b); n.style.visibility = ""; } else n.style.visibility = "hidden"; }
}
// The chosen curve drawn large (DialKit's easing editor): its plot 0 to 1 across and up, room above and below
// for a curve that overshoots; a bezier's two handles to drag; a live dot that plays the clip's length on it.
const ED = { x0: 10, x1: 110, y0: 58, y1: 14 };
const edX = (x) => ED.x0 + x * (ED.x1 - ED.x0), edY = (y) => ED.y0 + y * (ED.y1 - ED.y0);
function editorHtml(c) {
  const pts = curvePoints(c.ease, 48), d = pts.map(([x, y], i) => (i ? "L" : "M") + edX(x).toFixed(2) + " " + edY(y).toFixed(2)).join(" ");
  let handles = "";
  if (!isSpring(c.ease)) {
    const [x1, y1, x2, y2] = Array.isArray(c.ease) ? c.ease : bezierOf(c.ease);
    handles = '<line class="arm" x1="' + edX(0) + '" y1="' + edY(0) + '" x2="' + edX(x1) + '" y2="' + edY(y1) + '"/><line class="arm" x1="' + edX(1) + '" y1="' + edY(1) + '" x2="' + edX(x2) + '" y2="' + edY(y2) + '"/><circle class="knob-hit" data-for="1" r="22" cx="' + edX(x1) + '" cy="' + edY(y1) + '"/><circle class="knob-hit" data-for="2" r="22" cx="' + edX(x2) + '" cy="' + edY(y2) + '"/><circle class="knob" tabindex="0" role="slider" aria-label="First handle" data-h="1" r="4" cx="' + edX(x1) + '" cy="' + edY(y1) + '"/><circle class="knob" tabindex="0" role="slider" aria-label="Second handle" data-h="2" r="4" cx="' + edX(x2) + '" cy="' + edY(y2) + '"/>';
  }
  return '<div class="ceditor"><svg viewBox="0 0 120 72" aria-hidden="false" role="img" aria-label="The curve, drawn"><rect class="grid" x="' + ED.x0 + '" y="' + ED.y1 + '" width="' + (ED.x1 - ED.x0) + '" height="' + (ED.y0 - ED.y1) + '" rx="2"/><path class="curve" d="' + d + '"/>' + handles + '<circle class="live" r="3" cx="' + edX(0) + '" cy="' + edY(0) + '"/></svg></div>';
}
// After every change the dot plays the clip on the curve: across in time, up with the value (WAAPI, linear in
// time because the curve's x is time). With less motion it stands at the end.
function playLive() {
  const dot = pop && pop.el.querySelector(".ceditor .live");
  if (!dot) return;
  for (const a of dot.getAnimations()) a.cancel();
  const c = clipNow(pop.key), dur = isSpring(c.ease) ? Math.max(msOf(c.dur), springOf(msOf(c.dur), c.ease.spring.bounce, travelOf(c)).settle) : msOf(c.dur);
  const pts = curvePoints(c.ease, 24), end = pts[pts.length - 1];
  const at = ([x, y]) => "translate(" + (edX(x) - edX(0)).toFixed(2) + "px, " + (edY(y) - edY(0)).toFixed(2) + "px)";
  if (reduced()) { dot.style.transform = at(end); return; }
  dot.style.transform = at(end);
  dot.animate(pts.map((q, i) => ({ transform: at(q), offset: i / (pts.length - 1) })), { duration: Math.max(dur, 1), easing: "linear" });
}
// A held slider or handle redraws in place (its element keeps the pointer): the thumb, the fill, the detent
// it stands on and its name; the curve, its arms and its knobs.
function syncSlider(c) {
  const s = pop.el.querySelector(".dslider");
  if (!s) return;
  const d = msOf(c.dur), max = +s.dataset.max, at = (v) => (Math.min(v, max) / max) * 100 + "%", on = typeof c.dur === "string" ? ms(c.dur) : null;
  s.querySelector(".dthumb").style.left = at(d); s.querySelector(".dslider-fill").style.inlineSize = at(d);
  for (const n of s.querySelectorAll(".dname")) n.toggleAttribute("data-on", +n.dataset.v === on);
  s.querySelectorAll(".dtick").forEach((t, i) => t.toggleAttribute("data-on", detents()[i].v === on));
  s.setAttribute("aria-valuenow", Math.round(d)); s.setAttribute("aria-valuetext", Math.round(d) + " ms" + (on != null ? ", the " + durShort(c.dur) + " token" : ""));
  labelTicks();
}
function syncEditor(c) {
  const ed = pop.el.querySelector(".ceditor svg");
  if (!ed) return;
  ed.querySelector(".curve").setAttribute("d", curvePoints(c.ease, 48).map(([x, y], i) => (i ? "L" : "M") + edX(x).toFixed(2) + " " + edY(y).toFixed(2)).join(" "));
  if (isSpring(c.ease)) return;
  const [x1, y1, x2, y2] = Array.isArray(c.ease) ? c.ease : bezierOf(c.ease), arms = ed.querySelectorAll(".arm"), knobs = ed.querySelectorAll(".knob");
  if (arms.length < 2) return;
  arms[0].setAttribute("x2", edX(x1)); arms[0].setAttribute("y2", edY(y1)); arms[1].setAttribute("x2", edX(x2)); arms[1].setAttribute("y2", edY(y2));
  knobs[0].setAttribute("cx", edX(x1)); knobs[0].setAttribute("cy", edY(y1)); knobs[1].setAttribute("cx", edX(x2)); knobs[1].setAttribute("cy", edY(y2));
  const hits = ed.querySelectorAll(".knob-hit");
  hits[0].setAttribute("cx", edX(x1)); hits[0].setAttribute("cy", edY(y1)); hits[1].setAttribute("cx", edX(x2)); hits[1].setAttribute("cy", edY(y2));
}
function renderPop(work) {
  const el = pop.el, body = el.querySelector(".pop-body"), c = clipNow(pop.key, work), km = keptMove(), e = km.e;
  const o = e.orig.find((x) => x.key === c.key), isEdited = !same(c, o);
  const mode = isSpring(c.ease) ? "spring" : SEG_CURVES.includes(c.ease) ? c.ease : "custom";
  const d = msOf(c.dur);
  // Its title is the row's first line, led by the row's own glyph (Family's trays: "a title … alongside an icon").
  let html = '<div class="pop-head" data-prop="' + (c.kind || "text") + '"><span class="lead" role="img" aria-label="' + PROP_WORD[c.kind || "text"] + '">' + icon(PROP_GLYPH[c.kind || "text"]) + "</span><p>" + esc(c.of) + " <span>" + esc(c.does) + "</span></p>" + (isEdited ? '<button class="ghost-btn" id="popReset" type="button">Reset</button>' : "") + "</div>";
  // Length: the slider and its figure. A spring's length is its perceptual duration: its response.
  html += '<div class="pop-sec"><div class="pop-label"><span>' + (mode === "spring" ? "Response" : "Duration") + '</span></div><div class="pop-line">' + sliderHtml(c, mode) + fieldHtml("dur", fieldVal(d), "ms", (mode === "spring" ? "Response" : "Duration") + ", ms") + "</div></div>";
  // Curve: the four house curves as glyphs, then Spring and Custom; the chosen one drawn large beside its words.
  // The curve: past four short segments the list, as the inspector's variant control does (designer's 2C):
  // the house curves as their glyphs with their words, then Spring and Custom, one radio group in two columns.
  const CHOICES = SEG_CURVES.map((t) => [t, glyph(t), CURVE_WORD[t]]).concat([["spring", glyph({ spring: { bounce: 0.3 } }), "Spring"], ["custom", '<svg viewBox="0 0 16 10" aria-hidden="true"><path d="M1 9 C 6 9, 4 1, 15 1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="0"/><circle cx="6" cy="9" r="1.5" fill="currentColor"/><circle cx="4" cy="1" r="1.5" fill="currentColor"/></svg>', "Custom"]]);
  html += '<div class="pop-sec"><div class="pop-label"><span id="curveLabel">Curve</span></div><div class="curve-list" id="curveList" role="radiogroup" aria-labelledby="curveLabel">';
  for (const [t, g, w] of CHOICES) html += '<button class="curve-opt" type="button" role="radio" data-curve="' + t + '" aria-checked="' + (mode === t) + '" tabindex="' + (mode === t ? 0 : -1) + '">' + g + "<span>" + esc(w) + "</span></button>";
  html += "</div>";
  let side;
  if (mode === "spring") side = '<span class="word">Spring</span><label class="pop-label" for="bounceIn"><span>Bounce</span>' + fig(c.ease.spring.bounce) + '</label><input id="bounceIn" type="range" data-f="bounce" min="0" max="0.6" step="0.05" value="' + c.ease.spring.bounce + '" aria-label="Bounce">';
  else if (mode === "custom" && Array.isArray(c.ease)) side = '<span class="word">Custom</span><label class="fld wide"><input data-f="bez" aria-label="Custom bezier" value="' + c.ease.map((n) => +(+n).toFixed(3)).join(", ") + '"></label>';
  // A house curve the agent wrote that the control has no glyph for is shown as it is, its token and numbers.
  else if (mode === "custom") side = '<span class="word">' + esc(curveWord(c)) + "</span><code>" + esc(c.ease) + "</code><code>" + bezierOf(c.ease).join(", ") + "</code>";
  else side = '<span class="word">' + esc(CURVE_WORD[c.ease]) + "</span><span>Drag a handle to make it your own</span>";
  html += '<div class="pop-line">' + editorHtml(c) + '<div class="curve-side">' + side + "</div></div></div>";
  // Delta: from and to, where the property has them.
  if (c.from != null) html += '<div class="pop-sec"><div class="pop-label"><span><code>' + esc(c.prop) + "</code> from, to</span></div><div class=\"pop-line\">" + fieldHtml("from", String(c.from), "", c.prop + " from") + '<span class="arrow">→</span>' + fieldHtml("to", String(c.to), c.unit || "", c.prop + " to") + "</div></div>";
  const focused = document.activeElement && el.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused ? focused.dataset.f || focused.dataset.curve || focused.dataset.h || (focused.classList.contains("dslider") ? "slider" : null) : null;
  const caret = focused && focused.selectionStart;
  const h0 = body.childElementCount ? body.offsetHeight : 0;
  body.innerHTML = html;
  pop.committed = { dur: fieldVal(d), from: String(c.from), to: String(c.to), bez: Array.isArray(c.ease) ? c.ease.map((n) => +(+n).toFixed(3)).join(", ") : "" };
  wirePop();
  labelTicks();
  if (focusKey) { const f = el.querySelector('[data-f="' + focusKey + '"], [data-curve="' + focusKey + '"], [data-h="' + focusKey + '"]') || (focusKey === "slider" ? el.querySelector(".dslider") : null); if (f) { f.focus({ preventScroll: true }); if (caret != null && f.setSelectionRange) try { f.setSelectionRange(caret, caret); } catch {} } }
  // The kit's morph: a height change tweens the box over --dur-morph on the drawer curve, on its far side from
  // the row.
  const h1 = body.offsetHeight;
  if (h0 && h0 !== h1 && !reduced() && el.dataset.state === "open") el.querySelector(".pop-box").animate([{ [pop.above ? "top" : "bottom"]: h1 - h0 + "px" }, { [pop.above ? "top" : "bottom"]: "0px" }], { duration: ms("--dur-morph"), easing: tok("--ease-drawer") });
}
// While the bar is dragged the fields tick with it in place; otherwise the popover is drawn anew.
function refreshPop(work) {
  if (!pop) return;
  if (work) {
    const c = clipNow(pop.key, work), set = (f, v) => { const i = pop.el.querySelector('input[data-f="' + f + '"]'); if (i && document.activeElement !== i) i.value = v; };
    set("dur", fieldVal(c.dur)); if (c.from != null) { set("from", String(c.from)); set("to", String(c.to)); }
    if (Array.isArray(c.ease)) set("bez", c.ease.map((n) => +(+n).toFixed(3)).join(", "));
    syncSlider(c); syncEditor(c);
    return;
  }
  renderPop();
  if (!pop.held) placePop();
  playLive();
}
function popCommit(next, { replay }) {
  const km = keptMove();
  if (commit(km.e, next)) { afterEdit(km, { replay }); return true; }
  if (pop) renderPop();
  return false;
}
function withClip(fn, key = pop.key) { const km = keptMove(), next = clone(km.e.cur), c = next.find((x) => x.key === key); fn(c, next); return next; }
function applyField(f, raw, km, key = pop.key) {
  const text = String(raw).trim();
  if (f === "bez") { const n = text.split(/[\s,]+/).map(Number); if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null; return withClip((c) => { c.ease = n; }, key); }
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  return withClip((c) => {
    const o = km.e.orig.find((x) => x.key === c.key);
    if (f === "dur") c.dur = asValue(Math.max(10, Math.round(v)), typeof o.dur === "string" ? o.dur : null);
    if (f === "bounce") c.ease = { spring: { bounce: clamp(Math.round(v * 100) / 100, 0, 0.6) } };
    if (f === "from") c.from = v;
    if (f === "to") c.to = v;
  }, key);
}
function stepField(f, dir, e, km) {
  const c = clipNow(pop.key);
  if (f === "dur") {
    const cur = msOf(c.dur);
    let n;
    if (e.shiftKey || e.altKey) n = cur + dir * 10;
    else { n = ladderMs().filter((l) => (dir > 0 ? l > cur : l < cur)).sort((a, b) => dir * (a - b))[0]; if (n === undefined) return null; }
    return applyField(f, n, km);
  }
  if (f === "from" || f === "to") return applyField(f, c[f] + dir, km);
  return null;
}
// A live change (a slider or a handle held): the clip takes it at once, the stage replays on release.
function liveEdit(km, next) { km.e.cur = next; afterEdit(km, { replay: false, rescaleNow: false, inPlace: true }); }
function settleEdit(before) { const kmm = keptMove(); if (!same(before, kmm.e.cur)) { kmm.e.past.push(before); kmm.e.future = []; rescale(kmm); afterEdit(kmm, { replay: true }); } }
function wirePop() {
  const el = pop.el, km = keptMove();
  for (const i of el.querySelectorAll("input[data-f]:not([type=range])")) {
    const f = i.dataset.f;
    i.onkeydown = (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const next = stepField(f, e.key === "ArrowUp" ? 1 : -1, e, km); if (next) popCommit(next, { replay: false }); }
      else if (e.key === "Enter") { e.preventDefault(); const next = applyField(f, i.value, km); if (next) popCommit(next, { replay: true }); else i.value = pop.committed[f]; }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (i.value !== pop.committed[f]) i.value = pop.committed[f]; else closeAndFocusSource(); }
    };
    i.onblur = () => { if (!pop || i.value === pop.committed[f]) return; const key = pop.key, val = i.value; setTimeout(() => { const next = applyField(f, val, keptMove(), key); if (next) { const kmm = keptMove(); if (commit(kmm.e, next)) afterEdit(kmm, { replay: true }); } }); };
  }
  const bounce = el.querySelector('input[data-f="bounce"]');
  if (bounce) {
    let before = null;
    bounce.onpointerdown = () => { before = clone(keptMove().e.cur); };
    bounce.oninput = () => { const next = applyField("bounce", bounce.value, keptMove()); if (next) { if (!before) before = clone(keptMove().e.cur); liveEdit(keptMove(), next); } };
    bounce.onchange = () => { if (before) { settleEdit(before); before = null; } };
  }
  // Arrows move the choice round the group, as a radio group's do.
  const opts = [...el.querySelectorAll("#curveList .curve-opt")];
  for (const b of opts) b.onkeydown = (e) => { const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault(); const n = opts[(opts.indexOf(b) + d + opts.length) % opts.length]; n.focus(); n.click(); };
  for (const b of opts) b.onclick = () => {
    const kind = b.dataset.curve, c = clipNow(pop.key);
    const next = withClip((x) => {
      if (kind === "spring") x.ease = isSpring(c.ease) ? c.ease : { spring: { bounce: 0 } };
      else if (kind === "custom") x.ease = Array.isArray(c.ease) ? c.ease : isSpring(c.ease) ? bezierOf("--ease-out") : bezierOf(c.ease);
      else x.ease = kind;
    });
    popCommit(next, { replay: true });
  };
  const rs = el.querySelector("#popReset");
  if (rs) rs.onclick = () => { const next = clone(km.e.cur), i = next.findIndex((x) => x.key === pop.key); next[i] = clone(km.e.orig.find((x) => x.key === pop.key)); popCommit(next, { replay: true }); };
  wireSlider(el.querySelector(".dslider"));
  for (const k of el.querySelectorAll(".ceditor .knob")) wireKnob(k);
  // A finger's 44px circle round each handle hands its press to the handle.
  for (const h of el.querySelectorAll(".ceditor .knob-hit")) h.onpointerdown = (e) => el.querySelector('.ceditor .knob[data-h="' + h.dataset.for + '"]').onpointerdown(e);
}
// The duration slider: a drag snaps to a detent within --c-detent-snap (a finger feels a tick there, the
// house's Quiet Feel), ⌥ frees it to 10ms steps; arrows step detent to detent, ⇧ by 10ms; Home and End to the
// first and last detent.
function wireSlider(s) {
  if (!s) return;
  const max = +s.dataset.max, ds = detents();
  const valueAt = (x, free) => {
    const b = s.getBoundingClientRect(), v = clamp(((x - b.left) / b.width) * max, 10, max);
    if (free) return Math.round(v / 10) * 10;
    const snap = (px("--c-detent-snap") / b.width) * max, near = ds.reduce((a, d) => (Math.abs(d.v - v) < Math.abs(a.v - v) ? d : a), ds[0]);
    return Math.abs(near.v - v) <= snap ? near.v : Math.round(v / 10) * 10;
  };
  s.onpointerdown = (e) => {
    e.preventDefault(); s.focus({ preventScroll: true }); s.setPointerCapture(e.pointerId); rootEl.dataset.sliding = "";
    const before = clone(keptMove().e.cur);
    let last = null;
    const move = (ev) => {
      const v = valueAt(ev.clientX, ev.altKey);
      if (v === last) return;
      if (ev.pointerType !== "mouse" && ds.some((d) => d.v === v) && navigator.vibrate) navigator.vibrate(1);
      last = v;
      const next = applyField("dur", v, keptMove()); if (next) liveEdit(keptMove(), next);
    };
    move(e);
    s.onpointermove = move;
    s.onpointerup = s.onpointercancel = () => { s.onpointermove = s.onpointerup = s.onpointercancel = null; delete rootEl.dataset.sliding; settleEdit(before); };
  };
  s.onkeydown = (e) => {
    const c = clipNow(pop.key), cur = msOf(c.dur), km = keptMove();
    let n = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") n = e.shiftKey ? cur + 10 : (ds.find((d) => d.v > cur) || {}).v;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") n = e.shiftKey ? cur - 10 : ([...ds].reverse().find((d) => d.v < cur) || {}).v;
    else if (e.key === "Home") n = ds[0].v;
    else if (e.key === "End") n = ds[ds.length - 1].v;
    else return;
    e.preventDefault();
    if (n == null) return;
    const next = applyField("dur", n, km); if (next) popCommit(next, { replay: true });
  };
}
// A bezier handle: dragged, the curve is the person's own (Custom), x kept between 0 and 1. Arrows nudge it
// by 0.05 (⇧ 0.01).
function wireKnob(k) {
  const h = +k.dataset.h, svg = k.ownerSVGElement;
  const ease = () => { const c = clipNow(pop.key); return (Array.isArray(c.ease) ? c.ease : bezierOf(c.ease)).slice(); };
  const set = (x, y) => { const b = ease(); if (h === 1) { b[0] = x; b[1] = y; } else { b[2] = x; b[3] = y; } return withClip((c) => { c.ease = b.map((n) => Math.round(n * 1000) / 1000); }); };
  k.onpointerdown = (e) => {
    e.preventDefault(); e.stopPropagation(); k.setPointerCapture(e.pointerId); rootEl.dataset.sliding = "";
    const before = clone(keptMove().e.cur), r = svg.getBoundingClientRect(), sx = 120 / r.width, sy = 72 / r.height;
    k.onpointermove = (ev) => {
      const ux = (ev.clientX - r.left) * sx, uy = (ev.clientY - r.top) * sy;
      const x = clamp((ux - ED.x0) / (ED.x1 - ED.x0), 0, 1), y = clamp((uy - ED.y0) / (ED.y1 - ED.y0), -0.5, 1.5);
      liveEdit(keptMove(), set(x, y));
    };
    k.onpointerup = k.onpointercancel = () => { k.onpointermove = k.onpointerup = k.onpointercancel = null; delete rootEl.dataset.sliding; settleEdit(before); };
  };
  k.onkeydown = (e) => {
    const step = e.shiftKey ? 0.01 : 0.05, b = ease(), i = h === 1 ? 0 : 2;
    let x = b[i], y = b[i + 1];
    if (e.key === "ArrowLeft") x -= step; else if (e.key === "ArrowRight") x += step; else if (e.key === "ArrowUp") y += step; else if (e.key === "ArrowDown") y -= step; else return;
    e.preventDefault();
    popCommit(set(clamp(x, 0, 1), clamp(y, -0.5, 1.5)), { replay: true });
  };
}
// Esc folds it back into its source and gives the source the focus.
function closeAndFocusSource() { const p = pop; const a = p && anchorEl(p); closePop(); if (a) a.focus({ preventScroll: true }); }

// ---- The kit's DropdownMenu (the Outline) ----
let menu = null;
function openMenu(kind, trigger, head, items) {
  if (menu && menu.kind === kind && menu.trigger === trigger) { closeMenu(); return; }
  closeMenu();
  const el = document.createElement("div");
  el.className = "menu"; el.setAttribute("role", "menu"); el.setAttribute("aria-label", kind === "outline" ? "Outline" : kind);
  el.innerHTML = (head || "") + items.map((it, i) => '<div class="mi" role="menuitemradio" tabindex="-1" data-i="' + i + '" aria-checked="' + !!it.on + '">' + it.html + "</div>").join("");
  document.body.append(el);
  const tb = trigger.getBoundingClientRect(), inset = popInset(), gap = px("--space-1");
  const left = clamp(tb.right - el.offsetWidth, inset, innerWidth - inset - el.offsetWidth);
  const below = tb.bottom + gap + el.offsetHeight <= innerHeight - inset;
  el.style.left = left + "px"; el.style.top = (below ? tb.bottom + gap : Math.max(inset, tb.top - gap - el.offsetHeight)) + "px";
  menu = { kind, el, trigger, items };
  trigger.setAttribute("aria-expanded", "true");
  const mis = [...el.querySelectorAll(".mi")];
  const hi = (m) => { for (const x of mis) x.toggleAttribute("data-highlighted", x === m); if (m) m.focus({ preventScroll: true }); };
  const pick = (m) => { const it = items[+m.dataset.i]; closeMenu(); trigger.focus({ preventScroll: true }); it.pick(); };
  for (const m of mis) { m.onpointermove = () => hi(m); m.onclick = () => pick(m); }
  el.onpointerleave = () => hi(null);
  el.onkeydown = (e) => {
    const i = mis.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); hi(mis[(i + (e.key === "ArrowDown" ? 1 : -1) + mis.length) % mis.length]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (i >= 0) pick(mis[i]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); trigger.focus(); }
  };
  hi(mis.find((m) => m.getAttribute("aria-checked") === "true") || mis[0]);
  if (!reduced()) el.animate([{ opacity: 0, scale: tok("--pop-scale") }, { opacity: 1, scale: 1 }], { duration: ms("--dur-menu"), easing: tok("--ease-out") });
}
function closeMenu() { if (menu) { menu.trigger.setAttribute("aria-expanded", "false"); menu.el.remove(); menu = null; } }
// An outside press commits the field being edited, closes, and still acts.
addEventListener("pointerdown", (e) => {
  if (menu && !menu.el.contains(e.target) && !menu.trigger.contains(e.target)) closeMenu();
  if (pop && !pop.el.contains(e.target) && !(menu && menu.el.contains(e.target))) {
    const a = document.activeElement; if (a && pop.el.contains(a)) a.blur();
    const row = e.target.closest && e.target.closest(".clip");
    if (row && row.dataset.key === pop.key && !e.shiftKey && !e.metaKey && !e.ctrlKey) return;
    closePop();
  }
}, true);
addEventListener("scroll", (e) => { if (pop && !pop.held) placePop(); if (menu && !(e.target instanceof Node && menu.el.contains(e.target))) closeMenu(); }, true);

// ---- The tooltip (DESIGN.md Tooltip): ink, never coral; after the kit's 400ms rest ----
let tipTimer = null, tipFor = null;
function showTip(el) {
  const tip = $("tip"); tip.textContent = el.dataset.tip;
  const b = el.getBoundingClientRect(), gap = px("--space-2"), inset = px("--c-screen-margin");
  let top = b.top - gap - tip.offsetHeight; if (top < inset) top = b.bottom + gap;
  tip.style.left = clamp(b.left + b.width / 2 - tip.offsetWidth / 2, inset, innerWidth - inset - tip.offsetWidth) + "px"; tip.style.top = top + "px";
  tip.toggleAttribute("data-on", true);
}
const hideTip = () => { clearTimeout(tipTimer); tipFor = null; $("tip").removeAttribute("data-on"); };
addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el === tipFor) return;
  hideTip();
  if (!el || rootEl.dataset.dragging !== undefined) return;
  tipFor = el; tipTimer = setTimeout(() => showTip(el), 400);
});
addEventListener("pointerdown", hideTip, true);

// ---- Dials: what the agent put up for tuning on this component ----
const dials = {
  form: [{ name: "Corner radius", min: 0, max: 16, step: 1, unit: "px", value: 8, apply: (v) => rootEl.style.setProperty("--mock-radius", v + "px") }],
  row: [{ name: "Row padding", min: 6, max: 20, step: 1, unit: "px", value: 12, apply: (v) => rootEl.style.setProperty("--mock-row-pad", v + "px") }],
};
function drawDials(cid = tab) {
  const box = gsecOf(cid).querySelector(".dials"); box.innerHTML = "";
  const list = dials[cid] || [];
  box.hidden = !list.length;
  for (const d of list) {
    const row = document.createElement("label"); row.className = "dial";
    const n = document.createElement("span"); n.textContent = d.name;
    const r = document.createElement("input"); r.type = "range"; r.min = d.min; r.max = d.max; r.step = d.step; r.value = d.value;
    const out = document.createElement("output");
    const say = () => { out.innerHTML = fig(d.value, d.unit); };
    say();
    r.oninput = () => { d.value = +r.value; say(); d.apply(d.value); for (const c of shownComps()) keptSnaps[c.id] = snapStage(c.id); };
    row.append(n, r, out); box.append(row);
  }
}

// A segment's words: cut inside it where its groove has no room, the whole name in its title.
function labelTab(b, name) { b.replaceChildren(); const l = document.createElement("span"); l.className = "t-label"; l.textContent = name; b.append(l); b.title = name; }
// ---- Each component's page, graph section and tab ----
// The zoom group: out, the zoom's figure (a press is Fit all, ⇧1), in; then the Outline. Built for the
// toolbar (the shown graph's) and for each section's head (every graph on screen).
const zoomGroup = (label, id) => '<div class="zoom" role="group" aria-label="Zoom, ' + esc(label) + '"><button class="icon-btn" type="button" data-z="out" aria-label="Zoom out" data-tip="Zoom out (⌘ scroll)">' + icon(ICON.zoomOut) + '</button><button class="zoom-fit" type="button" data-z="fit"' + (id ? ' id="' + id + '"' : "") + ' aria-label="Fit all" data-tip="Fit all (⇧1)">100%</button><button class="icon-btn" type="button" data-z="in" aria-label="Zoom in" data-tip="Zoom in (⌘ scroll)">' + icon(ICON.zoomIn) + "</button></div>";
const outlineBtn = (id) => '<button class="icon-btn hide-btn outline-btn" type="button" data-z="outline"' + (id ? ' id="' + id + '"' : "") + ' aria-label="Outline" aria-haspopup="menu" aria-expanded="false" data-tip="Outline">' + icon(ICON.outline) + "</button>";
const zoomAct = (cid, z) => (z.dataset.z === "fit" ? fitZoom(cid) : z.dataset.z === "outline" ? openOutline(cid, z) : setZoom(cid, G[cid].zoom * (z.dataset.z === "in" ? 1.2 : 1 / 1.2)));
// The toolbar's end: the zoom group, the Outline, and Hide last ("Hide graph", a chevron to the trailing edge).
$("barEnd").innerHTML = zoomGroup("the graph", "zoomLevel") + outlineBtn("outlineBtn") + '<button class="icon-btn hide-btn" id="hide" type="button" aria-label="Hide graph" aria-expanded="true" data-tip="Hide graph (H)">' + icon(ICON.chevronRight) + "</button>";
for (const z of $("barEnd").querySelectorAll("[data-z]")) z.onclick = () => zoomAct(tab, z);
for (const c of review) {
  const page = document.createElement("section");
  page.className = "stage-wrap"; page.dataset.comp = c.id; page.setAttribute("aria-label", c.name);
  page.innerHTML = '<div class="stage" data-comp="' + c.id + '"></div><div class="marks" data-comp="' + c.id + '" aria-hidden="true"></div>';
  $("pages").append(page);
  // Its name in the label role over its graph, and its own zoom and Fit: shown when every graph is on screen.
  const sec = document.createElement("section");
  sec.className = "gsec"; sec.dataset.comp = c.id; sec.setAttribute("aria-label", c.name);
  sec.innerHTML = '<header class="gsec-head"><h3 class="gsec-name">' + esc(c.name) + "</h3>" + zoomGroup(c.name) + outlineBtn() + '</header><div class="gview"><div class="graph" role="region" aria-label="' + esc(c.name) + ', its state machines"></div><div class="doors"></div></div><div class="dials"></div>';
  for (const z of sec.querySelectorAll("[data-z]")) z.onclick = () => zoomAct(c.id, z);
  $("graphs").append(sec);
  const b = document.createElement("button");
  b.className = "t-tab"; b.setAttribute("role", "tab"); b.dataset.tab = c.id; labelTab(b, c.name);
  b.onclick = () => { if (tab === c.id) return; stopPlay(); tab = c.id; peek = null; time = null; closePop(true); render(true); };
  $("tabs").append(b);
}
// Two graphs stacked share the panel's height: the first takes --split-h (half, until its foot edge is
// dragged), the last the rest.
let splitDragged = false;
function placeSplit() {
  const stackedGraphs = screen.multi && screen.multi.graphs === "stack", sash = $("sashS"), pill = document.querySelector('.lit[data-arm="s"]');
  sash.hidden = pill.hidden = !stackedGraphs;
  if (!stackedGraphs) return;
  const secs = [...$("graphs").children], first = secs[0], g1 = graphOf(first.dataset.comp);
  if (!splitDragged) {
    const fixed = secs.reduce((n, sec) => n + sec.offsetHeight - sec.querySelector(".graph").offsetHeight, 0);
    const gapY = parseFloat(getComputedStyle($("graphs")).rowGap) || 0;
    rootEl.style.setProperty("--split-h", Math.max(splitFloor(), Math.floor(($("graphs").clientHeight - fixed - gapY * (secs.length - 1)) / secs.length)) + "px");
  }
  // The edge stands in the gap under the first graph's section.
  const pb = panel.getBoundingClientRect(), y = first.getBoundingClientRect().bottom + (parseFloat(getComputedStyle($("graphs")).rowGap) || 0) / 2 - pb.top;
  sash.style.top = y - sash.offsetHeight / 2 + "px"; pill.style.top = y - pill.offsetHeight / 2 + "px";
  void g1;
}
function render(animateTab) {
  setCurrent();
  slidePill($("tabs"), !!animateTab);
  const cs = shownComps();
  for (const c of cs) drawDials(c.id);
  placeSplit();
  for (const c of cs) drawGraph(c.id);
  for (const c of cs) { drawStage(c.id); keptSnaps[c.id] = snapStage(c.id); }
  mark(); buildDock();
  for (const c of cs) showKept(c.id);
  placeSplit(); syncSashes();
  slidePill($("faces"), false);
}

// ---- Compact screens: one surface, two faces, and the drawer's stops ----
function setFace(f) {
  if (f === "move" && !keptMove()) f = "graph";
  const was = face; face = f; $("tools").dataset.face = f;
  for (const b of $("faces").querySelectorAll(".t-tab")) b.setAttribute("aria-selected", String(b.dataset.face === f));
  slidePill($("faces"), was !== f && !reduced());
  if (was === f) return;
  closePop(true);
  // The face that comes back draws at its size.
  if (f === "graph") { drawGraph(); mark(); showKept(); } else buildDock();
}
for (const b of $("faces").querySelectorAll(".t-tab")) b.onclick = () => setFace(b.dataset.face);
// The stops: the head alone, peek (--c-graph-drawer-stop) and full (--c-sheet-max-h).
const STOPS = ["head", "peek", "full"];
const stopPx = (s) => (s === "head" ? $("sheetHead").offsetHeight + 1 : Math.round(lenOf(s === "full" ? "--c-sheet-max-h" : "--c-graph-drawer-stop")));
function labelHead() { $("sheetTitle").setAttribute("aria-label", "Design graph, " + $("sheetState").textContent + (layoutIs("drawer") ? ". Drawer at " + stop + "; tap for " + (stop === "peek" ? "full" : "peek") : "")); }
function setDrawerH(h) { drawerH = Math.round(h); rootEl.style.setProperty("--drawer-h", drawerH + "px"); sizeDockRoom(); }
// The sheet's own Hide (round 29 review): in the drawer a chevron down folds it to its head bar and, folded, the
// same control points up and is Show; in the side sheet it points to the trailing edge the sheet folds to.
function labelSheetHide() {
  const b = $("sheetHide"), drawer = layoutIs("drawer"), folded = drawer && stop === "head";
  // One chevron that turns over as the drawer folds and opens (Family's chevron that transforms rather than
  // swaps), on the drawer's own clock.
  const glyph = drawer ? ICON.chevron : ICON.chevronRight;
  if (b.dataset.glyph !== glyph) { b.innerHTML = icon(glyph); b.dataset.glyph = glyph; }
  b.toggleAttribute("data-folded", folded);
  b.setAttribute("aria-label", folded ? "Show graph" : "Hide graph"); b.dataset.tip = (folded ? "Show graph" : "Hide graph") + " (H)";
  b.setAttribute("aria-expanded", String(!folded));
}
function setStop(s) {
  const was = stop; stop = s; $("tools").dataset.stop = s;
  labelSheetHide();
  setDrawerH(stopPx(s));
  labelHead();
  // The graph's view follows the drawer's new height once it has settled.
  if (was !== s && face === "graph") setTimeout(() => { if (stop === s && layoutIs("drawer")) showKept(); }, reduced() ? 0 : ms("--dur-panel"));
}
const nextStop = (dir) => STOPS[clamp(STOPS.indexOf(stop) + dir, 0, STOPS.length - 1)];
// A tap on the head toggles peek and full; from the head stop it goes to peek (the r22 ruling). The head
// stop is a drag down or Hide. Up and Down step it by keys. In the side sheet a tap on the title brings the
// graph back to the kept state.
$("sheetHead").addEventListener("click", (e) => {
  if (e.target.closest(".faces, #sheetHide")) return;
  if ($("sheetHead")._dragged) { $("sheetHead")._dragged = false; return; }
  if (layoutIs("drawer")) setStop(stop === "peek" ? "full" : "peek");
  else if (e.target.closest("#sheetTitle")) { setFace("graph"); showKept(); }
});
$("sheetTitle").onkeydown = (e) => { if (!layoutIs("drawer") || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return; e.preventDefault(); setStop(nextStop(e.key === "ArrowUp" ? 1 : -1)); };
// Dragging the head moves the drawer with the finger; it settles on the nearest stop.
$("sheetHead").addEventListener("pointerdown", (e) => {
  const head = $("sheetHead");
  if (!layoutIs("drawer") || e.button !== 0 || e.target.closest(".faces, #sheetHide")) return;
  const y0 = e.clientY, h0 = drawerH, lo = stopPx("head"), hi = stopPx("full");
  let moved = false;
  head.setPointerCapture(e.pointerId);
  head.onpointermove = (ev) => { const dy = ev.clientY - y0; if (!moved && Math.abs(dy) < 6) return; if (!moved) { moved = true; rootEl.dataset.drawerDrag = ""; } setDrawerH(clamp(h0 - dy, lo, hi)); };
  head.onpointerup = head.onpointercancel = () => {
    head.onpointermove = head.onpointerup = head.onpointercancel = null;
    delete rootEl.dataset.drawerDrag;
    if (!moved) return;
    head._dragged = true; setTimeout(() => { head._dragged = false; });
    setStop(STOPS.slice().sort((a, b) => Math.abs(stopPx(a) - drawerH) - Math.abs(stopPx(b) - drawerH))[0]);
  };
});

// ---- Resizing the panel and the dock (round 29, section A) ----
const panel = $("panel");
const widthFloor = () => px("--c-panel-w"), widthCeil = () => Math.round(Math.min(innerWidth, px("--c-review-max-w")) * 0.85);
const floorOf = (g) => { const r = g.querySelector(".region"), n = g.querySelector(".node"); return Math.ceil((r ? r.querySelector(".region-head").offsetHeight + px("--space-5") : 0) + (n ? n.offsetHeight : 0) + 2 * px("--space-2") + 2); };
const graphFloor = () => floorOf(graphOf(tab));
// The graph's height is its token's (--graph-h, the view with both door bands standing); the scroller itself
// takes an empty band's room, so its own box is not the size.
const graphH = () => parseFloat(getComputedStyle(graphOf(tab)).getPropertyValue("--graph-h")) || graphOf(tab).offsetHeight;
const graphCeil = () => Math.max(graphFloor(), innerHeight - 2 * px("--space-5") - (panel.offsetHeight - graphOf(tab).parentNode.offsetHeight + 2 * px("--c-doorway-tab-h")));
// The split between two stacked graphs: each keeps at least its own floor.
const splitGraphs = () => [...$("graphs").children].map((sec) => sec.querySelector(".graph"));
const splitFloor = () => { const gs = splitGraphs(); return gs.length && gs[0].querySelector(".node") ? floorOf(gs[0]) : 120; };
const splitCeil = () => { const gs = splitGraphs(); return gs.length < 2 ? splitFloor() : Math.max(splitFloor(), gs[0].offsetHeight + gs[gs.length - 1].offsetHeight - (gs[gs.length - 1].querySelector(".node") ? floorOf(gs[gs.length - 1]) : 120)); };
function setSplit(h) { splitDragged = true; rootEl.style.setProperty("--split-h", clamp(Math.round(h), splitFloor(), splitCeil()) + "px"); placeSplit(); syncSashes(); }
const stackedGraphs = () => !!screen.multi && screen.multi.graphs === "stack";
// The dock's floor is its head bar alone (Figma Motion's collapsed timeline); its ceiling leaves the page
// --c-page-h-floor, so the page's head and first field stay readable.
function dockFloor() {
  const d = $("dock"), head = d.querySelector(".dock-head");
  if (!head) return 0;
  const cs = getComputedStyle(d);
  return Math.ceil(parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + head.offsetHeight);
}
const dockCeil = () => innerHeight - 2 * px("--space-5") - px("--c-page-h-floor");
function setDockH(h) { rootEl.style.setProperty("--dock-h", clamp(Math.round(h), dockFloor(), dockCeil()) + "px"); sizeDockRoom(); syncSashes(); }
function setSize(w, h) {
  if (w != null) rootEl.style.setProperty("--panel-w", clamp(Math.round(w), widthFloor(), widthCeil()) + "px");
  if (h != null) rootEl.style.setProperty("--graph-h", clamp(Math.round(h), graphFloor(), graphCeil()) + "px");
  syncSashes();
}
// The separators a key reaches: the panel's corner (both sizes) and the dock's (its height).
function syncSashes() {
  const w = panel.offsetWidth, h = graphH();
  const set = (el, now, min, max, text) => { el.setAttribute("aria-valuenow", now); el.setAttribute("aria-valuemin", min); el.setAttribute("aria-valuemax", max); if (text) el.setAttribute("aria-valuetext", text); };
  set($("sashC"), w, widthFloor(), widthCeil(), stackedGraphs() ? w + " px wide" : w + " by " + h + " px");
  set($("sashDC"), $("dock").offsetHeight, dockFloor(), dockCeil(), $("dock").offsetHeight + " px tall");
  if (stackedGraphs()) set($("sashS"), splitGraphs()[0].offsetHeight, splitFloor(), splitCeil());
}
function relayoutAfterResize() { for (const c of shownComps()) drawGraph(c.id); mark(); for (const c of shownComps()) showKept(c.id); placeSplit(); if (tl) layoutDock(); sizeDockRoom(); if (pop) placePop(); }

// ---- The arc (section A): one object at three lengths ----
// Drawn in its corner's own frame: the panel's bottom-leading corner at 0,0, x in along the foot, y up the
// leading edge as it falls negative; the dock's top-trailing corner is the same drawing turned half round
// (body.html). The corner's circle is centred on (R, −R); the arc's centreline stands --c-handle-inset in
// from the outer edge (radius ri = R − inset), its body --c-handle-sweep of that circle on the diagonal. Leg a
// runs on from the body's end round the rest of the quarter and up the vertical edge (the panel's leading
// edge, the dock's trailing one); leg b round and along the horizontal one (the panel's foot, the dock's top).
// Each leg's length: its reach mixed into the whole edge by its sweep (style.css's four registered values).
const ARCS = [
  { svg: $("arcP"), owner: panel, legOf: { w: "a", h: "b", wh: "ab" } },
  { svg: $("arcD"), owner: $("dock"), legOf: { d: "b", dc: "b" } },
];
const arcOf = (sash) => ARCS.find((a) => a.owner.contains(sash));
function arcGeo(arc) {
  const R = px("--radius-panel"), d = px("--c-handle-inset"), ri = R - d, sweep = (parseFloat(tok("--c-handle-sweep")) * Math.PI) / 180;
  const sc = (ri * (Math.PI / 2 - sweep)) / 2, w = arc.owner.offsetWidth, h = arc.owner.offsetHeight;
  return { R, d, ri, sweep, sc, fullA: sc + Math.max(0, h - 2 * R), fullB: sc + Math.max(0, w - 2 * R) };
}
const r3 = (n) => Math.round(n * 1000) / 1000;
// A point s along a leg from the body's end, and the leg's path to length `len`.
function legAt(g, leg, s) {
  const t0 = (3 * Math.PI) / 4 + (leg === "a" ? g.sweep / 2 : -g.sweep / 2);
  if (s <= g.sc) { const t = t0 + (leg === "a" ? s : -s) / g.ri; return [g.R + g.ri * Math.cos(t), -g.R + g.ri * Math.sin(t)]; }
  return leg === "a" ? [g.d, -g.R - (s - g.sc)] : [g.R + (s - g.sc), -g.d];
}
function legPath(g, leg, len) {
  if (len < 0.05) return "";
  const p0 = legAt(g, leg, 0), arcLen = Math.min(len, g.sc), p1 = legAt(g, leg, arcLen);
  let d = "M" + r3(p0[0]) + " " + r3(p0[1]) + " A" + r3(g.ri) + " " + r3(g.ri) + " 0 0 " + (leg === "a" ? 1 : 0) + " " + r3(p1[0]) + " " + r3(p1[1]);
  if (len > g.sc) { const p2 = legAt(g, leg, len); d += " L" + r3(p2[0]) + " " + r3(p2[1]); }
  return d;
}
// The rim taper (DESIGN.md, Rim taper): over its last --tab-rim-taper px the stroke's ink is 1 − (1 − x)^6 of
// whole, x the share of the taper from its tip; the stroke keeps its width to the tip.
const TAPER_STOPS = 12;
function taper(grad, g, leg, len) {
  const T = Math.min(px("--tab-rim-taper") || 32, len), k = px("--tab-rim-taper-ease") || 6;
  const a = legAt(g, leg, Math.max(0, len - T)), b = legAt(g, leg, len);
  grad.setAttribute("x1", r3(a[0])); grad.setAttribute("y1", r3(a[1])); grad.setAttribute("x2", r3(b[0])); grad.setAttribute("y2", r3(b[1]));
  if (grad.children.length !== TAPER_STOPS + 1) { grad.replaceChildren(); for (let i = 0; i <= TAPER_STOPS; i++) grad.append(document.createElementNS(SVGNS, "stop")); }
  [...grad.children].forEach((st, i) => { const f = i / TAPER_STOPS; st.setAttribute("offset", r3(f)); st.setAttribute("stop-opacity", r3(1 - f ** k)); });
}
// Paints one arc from its computed values; answers the two lengths drawn.
function paintArc(arc) {
  const cs = getComputedStyle(arc.svg), g = arcGeo(arc), num = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
  const a = clamp(num("--reach-a") + (g.fullA - num("--reach-a")) * num("--sweep-a"), 0, g.fullA), b = clamp(num("--reach-b") + (g.fullB - num("--reach-b")) * num("--sweep-b"), 0, g.fullB);
  const key = [a, b, g.fullA, g.fullB, g.ri].map(r3).join(",");
  if (arc.painted === key) return { a, b };
  arc.painted = key;
  const p0 = legAt(g, "b", 0), p1 = legAt(g, "a", 0), sv = arc.svg;
  sv.querySelector(".arc-body").setAttribute("d", "M" + r3(p0[0]) + " " + r3(p0[1]) + " A" + r3(g.ri) + " " + r3(g.ri) + " 0 0 1 " + r3(p1[0]) + " " + r3(p1[1]));
  for (const [leg, len] of [["a", a], ["b", b]]) {
    sv.querySelector('.arc-leg[data-leg="' + leg + '"]').setAttribute("d", legPath(g, leg, len));
    if (len >= 0.05) taper(sv.querySelector("#" + sv.id + "-" + leg), g, leg, len);
  }
  return { a, b };
}
// The painter runs while any arc's transitions run (or stand paused under a scrubbing clock) and a frame
// past, so the last frame painted is the value they end on.
let arcLoop = 0;
function runArcs() {
  if (arcLoop) return;
  const tick = () => {
    for (const arc of ARCS) paintArc(arc);
    const live = ARCS.some((arc) => arc.svg.getAnimations().some((x) => /^--(reach|sweep)/.test(x.transitionProperty || "")));
    arcLoop = live ? requestAnimationFrame(tick) : 0;
  };
  arcLoop = requestAnimationFrame(tick);
}
window.__paintArcs = () => ARCS.map(paintArc);
addEventListener("transitionrun", (e) => { if (e.target.classList && e.target.classList.contains("arc")) runArcs(); }, true);
// An arc's state: rest, reach (the pointer just came), follow (it rides the pointer), sweep (held), settle
// (let go with the pointer still on it). Reach is how far past the body's end the hovered leg runs: to
// --c-handle-reach past the pointer along its edge; on the corner both legs run --c-handle-reach.
function setArc(arc) {
  const s = arc.svg, st = s.style, g = arcGeo(arc), REACH = px("--c-handle-reach");
  const legs = arc.hover ? arc.legOf[arc.hover] || "" : "", sweeping = arc.drag ? arc.legOf[arc.drag] || "" : "";
  let ra = 0, rb = 0;
  if (arc.hover && arc.at) {
    const b = arc.owner.getBoundingClientRect();
    if (arc.hover === "wh" || arc.hover === "dc") { ra = REACH; rb = REACH; }
    else if (legs === "a") ra = g.sc + (b.bottom - arc.at[1]) + REACH - g.R;
    else if (legs === "b") rb = g.sc + (arc.owner === panel ? arc.at[0] - b.left : b.right - arc.at[0]) + REACH - g.R;
  }
  st.setProperty("--reach-a", r3(clamp(ra, 0, g.fullA)) + "px"); st.setProperty("--reach-b", r3(clamp(rb, 0, g.fullB)) + "px");
  st.setProperty("--sweep-a", sweeping.includes("a") ? "1" : "0"); st.setProperty("--sweep-b", sweeping.includes("b") ? "1" : "0");
  s.dataset.state = arc.drag ? "sweep" : arc.hover ? arc.settling ? "settle" : arc.followed ? "follow" : "reach" : "";
  runArcs();
}
function drawArcs() { for (const arc of ARCS) { arc.painted = null; setArc(arc); paintArc(arc); } }
for (const arc of ARCS) Object.assign(arc, { hover: null, drag: null, at: null, followed: false, settling: false, timer: 0 });
drawArcs();
// The corner separators move both sizes (the panel's) or the dock's height; with stacked graphs the panel's
// corner moves its width alone.
const edgeOf = (sash) => (sash.id === "sashC" && stackedGraphs() ? "w" : sash.id === "sashDC" ? "dc" : sash.dataset.edge);
const resizeCursor = (edge) => (edge === "dc" ? "d" : edge);
function resizeBy(edge, s0, dx, dy) {
  if (edge === "d" || edge === "dc") setDockH(s0.d - dy);
  else if (edge === "s") setSplit(s0.s + dy);
  else setSize(edge.includes("w") ? s0.w - dx : null, edge.includes("h") ? s0.h + dy : null);
}
// A finger's flick settles the size on the house spring (0.4s, no bounce): WAAPI on html's own size, its
// easing the spring drawn as linear() from its own response.
function springEasing(visual, bounce) {
  const s = springOf(visual, bounce, 100), n = 40, pts = [];
  for (let i = 0; i <= n; i++) pts.push(r3(s.at((i / n) * s.settle)));
  return { easing: "linear(" + pts.join(", ") + ")", duration: s.settle };
}
function animateSize(props, timing, done) {
  if (reduced()) { for (const [name, , to] of props) if (to == null) rootEl.style.removeProperty(name); else rootEl.style.setProperty(name, to); done(); return; }
  const a = rootEl.animate([Object.fromEntries(props.map(([n, from]) => [n, from])), Object.fromEntries(props.map(([n, from, to, auto]) => [n, to ?? auto ?? from]))], timing);
  a.onfinish = () => { for (const [name, , to] of props) if (to == null) rootEl.style.removeProperty(name); else rootEl.style.setProperty(name, to); a.cancel(); done(); };
}
function flickSettle(edge, s0, track) {
  if (track.length < 2) return false;
  const last = track[track.length - 1], first = track.find((p) => last[0] - p[0] <= 80) || track[0], dt = last[0] - first[0];
  if (dt <= 0) return false;
  const vx = (last[1] - first[1]) / dt, vy = (last[2] - first[2]) / dt, sp = springEasing(px("--spring-house-dur") || ms("--spring-house-dur"), parseFloat(tok("--spring-house-bounce")) || 0);
  if (Math.hypot(vx, vy) < 0.3) return false;
  // The size runs on by the flick's own velocity over a tenth of a second, inside its bounds.
  const reach = 100, props = [];
  if (edge === "d" || edge === "dc") { const from = $("dock").offsetHeight; props.push(["--dock-h", from + "px", clamp(Math.round(from - vy * reach), dockFloor(), dockCeil()) + "px"]); }
  if (edge.includes("w")) { const from = panel.offsetWidth; props.push(["--panel-w", from + "px", clamp(Math.round(from - vx * reach), widthFloor(), widthCeil()) + "px"]); }
  if (edge.includes("h")) { const from = graphH(); props.push(["--graph-h", from + "px", clamp(Math.round(from + vy * reach), graphFloor(), graphCeil()) + "px"]); }
  if (!props.length) return false;
  void s0;
  animateSize(props, sp, relayoutAfterResize);
  return true;
}
// A double-press on the corner restores the default size over --dur-panel on the drawer curve.
function restoreDefault(which) {
  const timing = { duration: ms("--dur-panel"), easing: tok("--ease-drawer") };
  if (which === "dock") {
    if (!rootEl.style.getPropertyValue("--dock-h")) return;
    const from = $("dock").offsetHeight; rootEl.style.removeProperty("--dock-h"); const to = $("dock").offsetHeight; rootEl.style.setProperty("--dock-h", from + "px");
    if (reduced()) { rootEl.style.removeProperty("--dock-h"); sizeDockRoom(); return; }
    const a = $("dock").animate([{ blockSize: from + "px" }, { blockSize: to + "px" }], timing);
    rootEl.style.removeProperty("--dock-h");
    a.onfinish = () => { sizeDockRoom(); syncSashes(); };
    return;
  }
  const props = [];
  const read = (name, el) => { const was = rootEl.style.getPropertyValue(name); if (!was) return null; const from = el(); rootEl.style.removeProperty(name); const to = el(); rootEl.style.setProperty(name, was); return [name, from + "px", null, to + "px"]; };
  const w = read("--panel-w", () => panel.offsetWidth), h = read("--graph-h", graphH);
  if (w) props.push(w); if (h) props.push(h);
  if (props.length) animateSize(props, timing, relayoutAfterResize);
}
for (const sash of document.querySelectorAll(".sash")) {
  const arc = arcOf(sash), owner = sash.closest(".tool");
  const hoverEdge = () => edgeOf(sash);
  sash.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "touch" || !arc || arc.drag) return;
    arc.hover = hoverEdge(); arc.at = [e.clientX, e.clientY]; arc.followed = false; arc.settling = false;
    clearTimeout(arc.timer); arc.timer = setTimeout(() => { arc.followed = true; if (arc.hover && !arc.drag) setArc(arc); }, ms("--dur-control"));
    setArc(arc);
  });
  sash.addEventListener("pointermove", (e) => { if (!arc || e.pointerType === "touch" || !arc.hover) return; arc.at = [e.clientX, e.clientY]; if (!arc.drag) setArc(arc); });
  sash.addEventListener("pointerleave", (e) => { if (!arc || e.pointerType === "touch" || arc.drag) return; arc.hover = null; clearTimeout(arc.timer); setArc(arc); });
  sash.onpointerdown = (e) => {
    e.preventDefault();
    if (e.button !== 0) return;
    const edge = edgeOf(sash), x0 = e.clientX, y0 = e.clientY, s0 = { w: panel.offsetWidth, h: graphH(), d: $("dock").offsetHeight, s: splitGraphs()[0].offsetHeight }, track = [[performance.now(), x0, y0]];
    for (const a of rootEl.getAnimations()) a.finish();
    sash.setPointerCapture(e.pointerId);
    owner.dataset.resizing = edge; rootEl.dataset.resizing = resizeCursor(edge);
    if (arc) { arc.drag = edge; setArc(arc); }
    sash.onpointermove = (ev) => { track.push([performance.now(), ev.clientX, ev.clientY]); if (track.length > 12) track.shift(); resizeBy(edge, s0, ev.clientX - x0, ev.clientY - y0); if (arc) { arc.at = [ev.clientX, ev.clientY]; setArc(arc); } };
    sash.onpointerup = sash.onpointercancel = (ev) => {
      sash.onpointermove = sash.onpointerup = sash.onpointercancel = null;
      delete owner.dataset.resizing; delete rootEl.dataset.resizing;
      if (arc) {
        arc.drag = null;
        // Let go with the pointer still on its edge: back to the reach over --dur-exit; else to the arc.
        const still = ev.type === "pointerup" && ev.pointerType !== "touch" && document.elementsFromPoint(ev.clientX, ev.clientY).includes(sash);
        arc.hover = still ? hoverEdge() : null; arc.at = [ev.clientX, ev.clientY]; arc.settling = still; arc.followed = still;
        clearTimeout(arc.timer); if (still) arc.timer = setTimeout(() => { arc.settling = false; if (arc.hover && !arc.drag) setArc(arc); }, ms("--dur-exit"));
        setArc(arc);
      }
      if (!(ev.pointerType !== "mouse" && flickSettle(edge, s0, track))) relayoutAfterResize();
    };
  };
  if (sash.id === "sashC" || sash.id === "sashDC") sash.addEventListener("dblclick", (e) => { e.preventDefault(); restoreDefault(sash.id === "sashDC" ? "dock" : "panel"); });
  // The APG window splitter: arrows move the edge 16px, 64px with Shift; Home and End go to the floor and
  // ceiling. A key's move is instant, as every keyboard action is.
  sash.onkeydown = (e) => {
    const edge = edgeOf(sash), step = e.shiftKey ? 64 : 16, w = panel.offsetWidth, h = graphH(), d = $("dock").offsetHeight, sp = splitGraphs()[0].offsetHeight;
    let nw = null, nh = null, nd = null, ns = null;
    if (edge === "dc") { if (e.key === "ArrowUp") nd = d + step; else if (e.key === "ArrowDown") nd = d - step; else if (e.key === "Home") nd = dockFloor(); else if (e.key === "End") nd = dockCeil(); else return; }
    else if (edge === "s") { if (e.key === "ArrowDown") ns = sp + step; else if (e.key === "ArrowUp") ns = sp - step; else if (e.key === "Home") ns = splitFloor(); else if (e.key === "End") ns = splitCeil(); else return; }
    else if (edge.includes("w") && e.key === "ArrowLeft") nw = w + step;
    else if (edge.includes("w") && e.key === "ArrowRight") nw = w - step;
    else if (edge.includes("h") && e.key === "ArrowDown") nh = h + step;
    else if (edge.includes("h") && e.key === "ArrowUp") nh = h - step;
    else if (e.key === "Home") { if (edge.includes("w")) nw = widthFloor(); if (edge.includes("h")) nh = graphFloor(); }
    else if (e.key === "End") { if (edge.includes("w")) nw = widthCeil(); if (edge.includes("h")) nh = graphCeil(); }
    else return;
    e.preventDefault();
    if (nd !== null) setDockH(nd); else if (ns !== null) setSplit(ns); else setSize(nw, nh);
    clearTimeout(sash._keyTimer);
    sash._keyTimer = setTimeout(relayoutAfterResize, ms("--dur-control"));
  };
}
// Any size change redraws the arcs at the new edge lengths.
{ const ro = new ResizeObserver(() => { for (const arc of ARCS) { arc.painted = null; paintArc(arc); } }); ro.observe(panel); ro.observe($("dock")); }

// ---- Zoom and pan: the toolbar's group drives the shown graph; each section's its own ----
// Touch: native scroll pans; two fingers pinch the zoom (0.5 to 1.6) about their midpoint.
const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
for (const c of review) {
  const g = graphOf(c.id), pinch = { d0: 0, z0: 1 };
  g.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(c.id, G[c.id].zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
  g.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { pinch.d0 = spread(e.touches); pinch.z0 = G[c.id].zoom; } }, { passive: true });
  g.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || !pinch.d0) return;
    e.preventDefault();
    const b = g.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - b.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - b.top, z = G[c.id].zoom;
    setZoom(c.id, clamp((pinch.z0 * spread(e.touches)) / pinch.d0, 0.5, 1.6), 0.5);
    const k = G[c.id].zoom / z; g.scrollLeft = (g.scrollLeft + mx) * k - mx; g.scrollTop = (g.scrollTop + my) * k - my;
  }, { passive: false });
  g.addEventListener("touchend", (e) => { if (e.touches.length < 2) pinch.d0 = 0; });
  g.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.target.closest(".node, .edge, .region-head, .door")) return;
    const x0 = e.clientX, y0 = e.clientY, sl = g.scrollLeft, st = g.scrollTop;
    g.setPointerCapture(e.pointerId); g.classList.add("panning");
    g.onpointermove = (ev) => { g.scrollLeft = sl - (ev.clientX - x0); g.scrollTop = st - (ev.clientY - y0); };
    g.onpointerup = () => { g.onpointermove = null; g.classList.remove("panning"); };
  });
}

// ---- Hide and Show (round 29, section D): the panel folds into a tab ----
// At a desk Hide folds the panel's surface (its shell) into the 36px tab tucked at the screen's trailing edge
// at the head's height, and the tab is Show; the drawer drops to its head (its lower snap); the side sheet
// folds to the same tucked tab. Nothing else on the page moves.
function tabPlace() {
  const pb = panel.getBoundingClientRect(), hb = $("hide").getBoundingClientRect();
  panel.style.setProperty("--tab-y", Math.round((hb.top + hb.height / 2 - pb.top - px("--c-tucked-tab") / 2) * 100) / 100 + "px");
  panel.style.setProperty("--tab-out", Math.round((innerWidth - pb.right) * 100) / 100 + "px");
}
// Closed, everything but the shell is out of reach (inert), and the shell is the Show button.
function applyOpen(open) {
  panel.dataset.open = String(open);
  rootEl.dataset.tools = open ? "open" : "hidden";
  for (const el of panel.children) if (el !== $("shell")) el.inert = !open && layoutIs("desk");
  const shell = $("shell");
  shell.tabIndex = open ? -1 : 0; shell.setAttribute("aria-hidden", String(open));
  $("hide").setAttribute("aria-expanded", String(open));
}
function setOpen(open, how = {}) {
  if (layoutIs("drawer")) { setStop(open ? "peek" : "head"); return; }
  if (layoutIs("desk")) {
    if (panelOpen()) tabPlace();
    if (!open) closePop(true);
    if (how.key) {
      // A keyboard toggle is instant.
      panel.dataset.instant = ""; applyOpen(open); void panel.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => delete panel.dataset.instant));
    } else if (reduced()) {
      // Less motion: a 120ms cross-fade in place, out and back in.
      const t = { duration: ms("--dur-control") / 2, easing: "linear" };
      panel.animate([{ opacity: 1 }, { opacity: 0 }], t).onfinish = () => { applyOpen(open); panel.animate([{ opacity: 0 }, { opacity: 1 }], t); };
    } else applyOpen(open);
    if (open) { for (const c of shownComps()) drawGraph(c.id); mark(); for (const c of shownComps()) showKept(c.id); placeSplit(); }
    return;
  }
  applyOpen(open);
  $("show").hidden = open;
  if (!open) closePop(true);
  if (open) { if (face === "graph") { drawGraph(); mark(); showKept(); } else buildDock(); }
}
const toolsOpen = () => (layoutIs("drawer") ? stop !== "head" : panelOpen());
$("hide").onclick = () => { setOpen(false, { key: false }); $("shell").focus({ preventScroll: true }); };
$("shell").onclick = (e) => { setOpen(true, { key: e.detail === 0 }); $("hide").focus({ preventScroll: true }); };
$("sheetHide").onclick = () => { if (layoutIs("drawer")) { setStop(stop === "head" ? "peek" : "head"); return; } setOpen(false); $("show").focus(); };
$("show").onclick = () => { setOpen(true); $("sheetHide").focus(); };

// ---- Keys ----
const typing = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
addEventListener("keydown", (e) => {
  const km = keptMove();
  if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z") && km && !typing(document.activeElement)) {
    e.preventDefault();
    const st = e.shiftKey ? km.e.future : km.e.past, other = e.shiftKey ? km.e.past : km.e.future;
    if (!st.length) return;
    other.push(clone(km.e.cur)); km.e.cur = st.pop();
    afterEdit(km, { replay: false });
    return;
  }
  if (e.metaKey || e.ctrlKey || typing(document.activeElement)) return;
  if (e.key === "Escape" && pop && !menu) { e.preventDefault(); closeAndFocusSource(); return; }
  if ((e.key === "h" || e.key === "H") && !e.altKey) { const was = toolsOpen(); setOpen(!was, { key: true }); if (layoutIs("desk")) (was ? $("shell") : $("hide")).focus({ preventScroll: true }); return; }
  // ⇧1, as Figma's: fit every slab in the view.
  if (e.shiftKey && e.code === "Digit1") { e.preventDefault(); if (toolsOpen()) fitZoom(tab); return; }
  if (!km || !tl) return;
  if (e.key === " " && !(document.activeElement && (document.activeElement.tagName === "BUTTON" || (document.activeElement.closest && document.activeElement.closest(".panel, .pop, .menu, .show, .sash"))))) { e.preventDefault(); playing ? stopPlay() : play(); }
  else if (e.key === "Home" && !e.target.closest(".sash, .dslider")) { stopPlayKeepTime(); time = 0; drawStage(); updateTime(); }
  else if (e.key === "End" && !e.target.closest(".sash, .dslider")) { stopPlayKeepTime(); time = null; drawStage(); updateTime(); }
  else if (e.key === "," || e.key === ".") { stopPlayKeepTime(); const len = playLengthOf(km.r); time = clamp((time ?? lengthOf(km.r)) + (e.key === "." ? 10 : -10), 0, len); drawStage(); updateTime(); }
});

new ResizeObserver(() => sizeDockRoom()).observe($("dock"));
// A new size can be a new class: its layout is set first, then everything draws at it. A dragged dock height
// stays inside the new room; the drawer's stop is re-measured on the new height.
function onResize() {
  if (applyScreen()) { closePop(true); stopPlay(); if (layoutIs("desk")) $("tools").dataset.face = face = "graph"; }
  if (layoutIs("drawer")) setStop(stop);
  if (layoutIs("desk") && rootEl.style.getPropertyValue("--dock-h")) setDockH(parseFloat(rootEl.style.getPropertyValue("--dock-h")));
  if (layoutIs("drawer") && !panelOpen()) applyOpen(true);
  rootEl.dataset.tools = panelOpen() ? "open" : "hidden";
  $("show").hidden = panelOpen() || !layoutIs("sheet");
  if (layoutIs("desk")) tabPlace();
  labelSheetHide();
  render();
  drawArcs();
}
addEventListener("resize", onResize);
rootEl.dataset.tools = "open";
if (layoutIs("drawer")) setStop("peek");
labelSheetHide();
setFace("graph");

// ---- The round's open choice (the owner's): clip kinds in their own hue, or in ink only ----
rootEl.dataset.kinds = "hue";
for (const b of $("kinds").querySelectorAll(".t-tab")) b.onclick = () => {
  rootEl.dataset.kinds = b.dataset.kinds;
  for (const x of $("kinds").querySelectorAll(".t-tab")) x.setAttribute("aria-selected", String(x === b));
  slidePill($("kinds"), !reduced());
};
requestAnimationFrame(() => slidePill($("kinds"), false));

render();
document.fonts.ready.then(() => { if (layoutIs("drawer")) setStop(stop); render(); });
