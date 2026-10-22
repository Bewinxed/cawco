// The design graph, round 22: the component on the page, its state machines as one graph in the panel, and
// the kept move's choreography in the dock, editable; on every screen (responsive-design.md).

// ---- Glyphs ----
const icon = (name, cls) => SOLAR[name].replace("<svg ", '<svg aria-hidden="true" focusable="false"' + (cls ? ' class="' + cls + '"' : "") + " ");
const ICON = { zoomIn: "minimalistic-magnifer-zoom-in-bold-duotone", zoomOut: "minimalistic-magnifer-zoom-out-bold-duotone", fit: "maximize-square-minimalistic-bold-duotone", eyeClosed: "eye-closed-bold-duotone", eye: "eye-bold-duotone", play: "play-bold-duotone", pause: "pause-bold-duotone", loop: "repeat-bold-duotone", chevron: "alt-arrow-down-linear" };
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
          { id: "cant", name: "Can't be read", note: "One line in the read-back's place; the fields stay as typed.", set: { read: null, readFail: "The hub couldn't read this schedule back." } } ],
        edges: [["reading", "readback"], ["reading", "cant"]], path: ["reading", "readback", "cant"] },
      { id: "types", name: "Delegate type", states: [
          { id: "loading", name: "Loading", note: "The field says Loading… until the list arrives.", set: { type: "Loading…" } },
          { id: "loaded", name: "Loaded", note: "The field offers the types; the hub's pick stays the default.", set: {} },
          { id: "typesfail", name: "Didn't load", note: "The hub's pick stays; one line under the field says the list didn't load.", set: { failType: "The delegate types didn't load." } } ],
        edges: [["loading", "loaded"], ["loading", "typesfail"]], path: ["loading", "loaded", "typesfail"] },
      { id: "save", name: "Saving it", states: [
          { id: "empty", name: "Empty", note: "Just opened: Name and the instruction are blank.", set: { name: "", prompt: "" } },
          { id: "filled", name: "Filled", note: "Ready to create; the variants check that long words wrap and never clip.", vars: [
            { name: "Short instruction", set: {} },
            { name: "Long instruction with a link", set: { prompt: longPrompt } },
            { name: "Long name", set: { name: "Triage new issues for the cockpit repo and post the summary in the team thread before standup" } } ] },
          { id: "saving", name: "Saving", note: "Create reads Creating… while the hub works; nothing else changes.", set: { primary: "Creating…" } },
          { id: "failed", name: "Save failed", note: "The reason sits above the actions; the form keeps every value.", vars: [
            { name: "The hub didn't answer", set: { failActions: "The routine wasn't created. The hub didn't answer." } },
            { name: "Delegate type refused", set: { type: "medium", failType: "The routine wasn't created. This project can't run the medium delegate type." } } ] },
          { id: "created", name: "Created", note: "The form closes; it's in the list.", set: { created: true } } ],
        edges: [["empty", "filled"], ["filled", "saving"], ["saving", "failed"], ["saving", "created"], ["failed", "saving", "Try again"]], path: ["empty", "filled", "saving", "failed", "created"] } ],
    // The moves that play: the agent's clips, each timed by house tokens; their ms are read from tokens.css.
    // `at` is a start: from the start, or after or with another clip, plus an offset.
    moves: {
      "save:filled>saving": [
        { key: "label", of: "Button label", does: "swaps to “Creating…”", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "save:saving>failed": [
        { key: "label", of: "Button label", does: "swaps to “Create routine”", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" },
        { key: "reveal", of: "Reason line", does: "unfolds", at: { ref: null, v: "--dur-stagger" }, dur: "--dur-pop", ease: "--ease-out", prop: "y", from: 16, to: 0, unit: "px" },
        { key: "fade", of: "Reason words", does: "fade in", at: { ref: "with", of: "reveal", v: 0 }, dur: "--dur-pop", ease: "--ease-out" } ],
      "save:failed>saving": [
        { key: "fold", of: "Reason line", does: "folds away", at: { ref: null, v: 0 }, dur: "--dur-exit", ease: "--ease-out" },
        { key: "label", of: "Button label", does: "swaps to “Creating…”", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "save:saving>created": [
        { key: "formOut", of: "Form", does: "folds away", at: { ref: null, v: 0 }, dur: "--dur-exit", ease: "--ease-out" },
        { key: "doneIn", of: "Created line", does: "comes in", at: { ref: "after", of: "formOut", v: 0 }, dur: "--dur-pop", ease: "--ease-out" } ],
      "when:day>custom": [
        { key: "swap", of: "At", does: "swaps to Schedule", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" },
        { key: "fade", of: "Read-back", does: "rewrites", at: { ref: null, v: "--dur-stagger" }, dur: "--dur-pop", ease: "--ease-out" } ],
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
          { id: "failed", name: "Didn't run", note: "The status says why in red; the action fixes that cause.", vars: [
            { name: "No machine online", set: { status: "Didn't run: no machine was online", kind: "fail", actions: ["Run now"] } },
            { name: "Budget spent", set: { status: "Didn't run: the project's budget is spent", kind: "fail", actions: ["Raise budget"] } } ] } ],
        edges: [["waiting", "running"], ["running", "ran"], ["running", "failed"], ["failed", "running", "Run again"], ["ran", "waiting"]], path: ["waiting", "running", "ran", "failed"] } ],
    moves: {
      "runs:waiting>running": [
        { key: "dot", of: "Live dot", does: "comes in", at: { ref: null, v: 0 }, dur: "--dur-pop", ease: "--ease-out" },
        { key: "fade", of: "Status words", does: "change", at: { ref: null, v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "runs:running>failed": [
        { key: "dotOut", of: "Live dot", does: "goes", at: { ref: null, v: 0 }, dur: "--dur-exit", ease: "--ease-out" },
        { key: "fade", of: "Status words", does: "change", at: { ref: null, v: "--dur-stagger" }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
      "pause:active>paused": [
        { key: "dim", of: "Row", does: "dims", at: { ref: null, v: 0 }, dur: "--dur-control", ease: "--ease-out" },
        { key: "fade", of: "Status words", does: "change", at: { ref: "with", of: "dim", v: 0 }, dur: "--dur-fade", ease: "--ease-crossfade" } ],
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
  const m = machineOf(c, machine);
  const from = m.edges.find(([a, b]) => b === state && m.path.indexOf(a) === m.path.indexOf(state) - 1) || m.edges.find(([, b]) => b === state);
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
  if (f.created) return '<div style="display:grid"><div style="grid-area:1/1;opacity:' + (1 - outK) + '">' + formHtml(from, null, () => 1, (k, d) => d, null) + '</div><div style="grid-area:1/1;align-self:start;opacity:' + inK + '">' + doneCard + "</div></div>";
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
  const dot = '<span class="dot" data-sync="dot" style="inline-size:calc(var(--c-block-drop-dot) * ' + dotK + ");margin-inline-end:calc(var(--space-2) * " + dotK + ");opacity:" + dotK + '"></span>';
  return '<div class="rlist"><div class="rrow" data-sync="row" style="opacity:' + dim + '"><b>' + esc(f.name) + '</b><span class="rmeta">' + esc(f.schedule) + '</span><span class="rstatus ' + (f.kind === "live" ? "" : f.kind) + '" data-key="status" data-val="' + esc(f.status + "|" + f.kind) + '">' + dot + status + '</span><span class="ractions"><span class="btn" data-key="actions" data-val="' + esc(f.actions.join(" · ")) + '">' + soft(f.actions.join(" · ")) + "</span></span></div>" + others + "</div>";
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
// An edge's label never sits on a line (its own or another's) or over a state: it starts where dagre put it,
// then takes the nearest place round it, a few px at a time, that no line crosses and no state covers, its
// halo's 2px included.
function clearLabels(svg, g) {
  const segs = [...svg.querySelectorAll("path.edge")].flatMap((pl) => { const p = pl.dataset.points.split(" ").map((q) => q.split(",").map(Number)); return p.slice(1).map((b, i) => [p[i], b]); });
  const nodes = g.nodes().map((id) => { const n = g.node(id); return { l: n.x - n.width / 2, t: n.y - n.height / 2, r: n.x + n.width / 2, b: n.y + n.height / 2 }; });
  // A label may stand into its machine's padding, never past it.
  const slack = px("--space-2") - 1, W = g.graph().width + slack, H = g.graph().height + slack;
  const hitSeg = (bx, [[x1, y1], [x2, y2]]) => { for (let k = 0; k <= 48; k++) { const x = x1 + ((x2 - x1) * k) / 48, y = y1 + ((y2 - y1) * k) / 48; if (x > bx.l && x < bx.r && y > bx.t && y < bx.b) return true; } return false; };
  const free = (bx) => bx.l >= -slack && bx.t >= -slack && bx.r <= W && bx.b <= H && !segs.some((sg) => hitSeg(bx, sg)) && !nodes.some((n) => n.l < bx.r && n.r > bx.l && n.t < bx.b && n.b > bx.t);
  for (const t of svg.querySelectorAll("text")) {
    // The chip round the label: its 6px pad either side and 3px over and under count as its box.
    const b = t.getBBox(), x0 = +t.getAttribute("x"), y0 = +t.getAttribute("y"), halo = 6;
    const at = (dx, dy) => ({ l: b.x + dx - halo, t: b.y + dy - halo, r: b.x + b.width + dx + halo, b: b.y + b.height + dy + halo });
    let best = null;
    for (let r = 0; r <= 120 && !best; r += 2) for (const [dx, dy] of [[r, 0], [-r, 0], [0, -r], [0, r], [r, -r], [-r, -r], [r, r], [-r, r]]) if (free(at(dx, dy))) { best = [dx, dy]; break; }
    if (best) { t.setAttribute("x", x0 + best[0]); t.setAttribute("y", y0 + best[1]); }
    // The label's chip (round 27, pin 30; React Flow's labelShowBg): the raised surface, a hairline, on the path.
    const nb = t.getBBox(), chip = document.createElementNS(SVGNS, "rect");
    chip.setAttribute("class", "lchip"); chip.setAttribute("x", nb.x - 6); chip.setAttribute("y", nb.y - 3); chip.setAttribute("width", nb.width + 12); chip.setAttribute("height", nb.height + 6); chip.setAttribute("rx", 5);
    t.before(chip);
  }
}
// A smoothstep path (React Flow's "smoothstep", pathOptions.borderRadius): dagre's points, every bend rounded
// by --radius-sm, the last run kept straight into its chevron.
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
// Edges (round 27, pin 30): smoothstep paths with an open chevron (two 1.5px strokes, round caps, 6px) as the
// house's linear arrows are; the edges between machines are dependencies, not moves: a hairline, no head.
function edgesSvg(g, id, between) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", g.graph().width); svg.setAttribute("height", g.graph().height);
  const chevron = (mid, ink) => '<marker id="' + mid + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1.5,1 L7,4 L1.5,7" style="fill: none; stroke: ' + ink + '; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round"/></marker>';
  svg.innerHTML = "<defs>" + chevron(id, "var(--border-contrast)") + chevron(id + "-kept", "var(--brand-solid)") + "</defs>";
  if (between) svg.classList.add("between");
  for (const e of g.edges()) {
    const ed = g.edge(e);
    if (ed.hidden) continue;
    const pl = document.createElementNS(SVGNS, "path");
    pl.setAttribute("class", "edge"); pl.dataset.points = ed.points.map((q) => q.x + "," + q.y).join(" ");
    pl.setAttribute("d", roundedPath(ed.points, px("--radius-sm")));
    if (!between) pl.setAttribute("marker-end", "url(#" + id + ")");
    pl.dataset.from = e.v; pl.dataset.to = e.w; pl.dataset.marker = id;
    // A way back (Try again, Run again, Resume): its own hue-less line, dotted, so dashes mean "free" alone in the
    // dock and "a way back" here, never "original" (finding 2).
    if (ed.label === "Try again" || ed.label === "Run again" || ed.label === "Resume") pl.classList.add("back");
    svg.append(pl);
    if (ed.label) { const tx = document.createElementNS(SVGNS, "text"); tx.setAttribute("x", ed.x - ed.width / 2 + 9); tx.setAttribute("y", ed.y + 4); tx.textContent = ed.label; svg.append(tx); }
  }
  return svg;
}
const varyOf = (cid, machine, state) => { const k = views[cid].cur[machine]; return k.state === state ? k.vary : 0; };
const hoverMatters = (cid, machine, state, vary) => { const k = views[cid].cur[machine]; return !(k.state === state && k.vary === vary); };
// Each graph previews and keeps on its own page.
function stateNode(c, m, it) {
  const b = document.createElement("div"); b.className = "node"; b.dataset.machine = m.id; b.dataset.state = it.id;
  b.setAttribute("role", "button"); b.tabIndex = 0;
  const t = document.createElement("b"); t.textContent = it.name; b.append(t);
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
// ---- The graphs: one section per component under review, each with its own zoom, Fit and dials ----
const G = Object.fromEntries(review.map((c) => [c.id, { zoom: 1, gw: 0, gh: 0 }]));
const gsecOf = (cid) => document.querySelector('.gsec[data-comp="' + cid + '"]');
const graphOf = (cid) => gsecOf(cid).querySelector(".graph");
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
  const margin = 10, room = graph.clientWidth - 2 * margin;
  // Nodes are 168px. Two machines stand side by side only where both fit at 168: 2 x (2 x 168 + 22 gap + 16
  // chrome) + 3 x 10 margin = 778px of graph (the r22 ruling); under that the chain stays top-to-bottom. Only a
  // phone's single column, too narrow for two 168px states, narrows them, to the 120px floor.
  const chrome = 2 * (px("--space-2") + 1), full = 168, gap = 22;
  const two = graph.clientWidth >= 2 * (2 * full + gap + chrome) + 3 * margin;
  const mroom = two ? Math.floor((room - margin) / 2) : room;
  world.style.setProperty("--node-w", clamp(Math.floor((mroom - chrome - gap) / 2), 120, full) + "px");
  graph.dataset.two = String(two);
  const regions = {};
  c.machines.forEach((m, n) => {
    const r = document.createElement("section"); r.className = "region"; r.setAttribute("aria-label", m.name); r.dataset.machine = m.id;
    const name = document.createElement("p"); name.className = "region-name"; name.textContent = m.name;
    const body = document.createElement("div"); body.className = "regionBody";
    r.append(name, body); world.append(r);
    const chrome = r.offsetWidth;
    const els = {};
    for (const it of m.states) { const b = stateNode(c, m, it); body.append(b); els[it.id] = b; }
    const g = fitLayout(m.states.map((it) => ({ id: it.id, w: els[it.id].offsetWidth, h: els[it.id].offsetHeight })), m.edges, mroom - chrome, 0, { align: "UL" });
    body.style.width = g.graph().width + "px"; body.style.height = g.graph().height + "px";
    for (const id of g.nodes()) { const p = g.node(id); els[id].style.left = p.x - p.width / 2 + "px"; els[id].style.top = p.y - p.height / 2 + "px"; }
    body.prepend(edgesSvg(g, "arrow-" + cid + "-" + n));
    clearLabels(body.querySelector("svg"), g);
    regions[m.id] = r;
  });
  const sized = c.machines.map((m) => ({ id: m.id, w: regions[m.id].offsetWidth, h: regions[m.id].offsetHeight }));
  let outer = fitLayout(sized, c.machineEdges, room + 2 * margin, margin, { align: "UL", ...(two ? { nodesep: margin } : {}) });
  if (outer.graph().width > room + 2 * margin) {
    const order = moveOrder(c), chain = [];
    for (let i = 1; i < order.length; i++) if (!c.machineEdges.some(([a, b]) => a === order[i - 1] && b === order[i])) chain.push([order[i - 1], order[i], null, true]);
    outer = layout(sized, c.machineEdges.concat(chain), "TB", margin, { align: "UL", nodesep: 8, edgesep: 4 });
  }
  for (const id of outer.nodes()) { const p = outer.node(id); regions[id].style.left = p.x - p.width / 2 + "px"; regions[id].style.top = p.y - p.height / 2 + "px"; }
  world.prepend(edgesSvg(outer, "arrow-" + cid + "-machines", true));
  const points = outer.edges().flatMap((e) => (outer.edge(e).hidden ? [] : outer.edge(e).points));
  gs.gw = Math.max(outer.graph().width, ...points.map((q) => q.x + margin));
  gs.gh = Math.max(outer.graph().height, ...points.map((q) => q.y + margin));
  world.style.width = gs.gw + "px"; world.style.height = gs.gh + "px";
  drawStrip(c, graph);
  applyZoom(cid);
}
// The section strip (round 27, pin 30; ComfyUI's canvas toolbar, Figma's labelled sections): sticky at the
// well's top, one chip per machine in region order. A chip whose region is in view reads full ink on the raised
// surface, one out of view is muted with no fill, the kept machine's wears the brand wash. A press brings its
// region into view by revealIn's own rule, over --dur-panel. Edge fades say there is more above or below.
function drawStrip(c, graph) {
  if (c.machines.length < 2) { const old = graph.parentNode.querySelector(":scope > .secstrip"); if (old) old.remove(); return; }
  // It stands right over the well, outside its scroll, so it is always in view and takes none of the view's room.
  const old = graph.parentNode.querySelector(":scope > .secstrip"); if (old) old.remove();
  const strip = document.createElement("div"); strip.className = "secstrip"; strip.setAttribute("role", "toolbar"); strip.setAttribute("aria-label", "Machines");
  for (const m of c.machines) {
    const b = document.createElement("button"); b.type = "button"; b.className = "secchip"; b.dataset.machine = m.id; b.textContent = m.name;
    b.onclick = (e) => { e.stopPropagation(); jumpTo(c.id, m.id); };
    strip.append(b);
  }
  const foot = document.createElement("div"); foot.className = "gfoot"; foot.setAttribute("aria-hidden", "true");
  const head = document.createElement("div"); head.className = "gtop"; head.setAttribute("aria-hidden", "true");
  graph.before(strip); graph.prepend(head); graph.append(foot);
  graph.onscroll = () => stripView(graph);
  requestAnimationFrame(() => stripView(graph));
}
function stripView(graph) {
  const strip = graph.parentNode.querySelector(":scope > .secstrip");
  if (!strip) return;
  const g = graph.getBoundingClientRect(), top = g.top, more = graph.scrollHeight - graph.clientHeight - graph.scrollTop;
  for (const chip of strip.children) {
    const r = graph.querySelector('.region[data-machine="' + chip.dataset.machine + '"]');
    const b = r && r.getBoundingClientRect();
    chip.toggleAttribute("data-inview", !!b && b.bottom > top + 1 && b.top < g.bottom - 1 && b.right > g.left + 1 && b.left < g.right - 1);
  }
  graph.dataset.fade = (graph.scrollTop > 1 ? "top" : "") + (more > 1 ? " foot" : "");
}
function jumpTo(cid, machine) {
  const g = graphOf(cid), r = g.querySelector('.region[data-machine="' + machine + '"]');
  if (!r) return;
  const n = r.querySelector(".node.kept, .node.cur") || r.querySelector(".node");
  const s0 = g.scrollTop, l0 = g.scrollLeft;
  revealIn(cid, n, null, false);
  // The region's own top in view: its band under the strip, --space-2 clear.
  const rb = r.getBoundingClientRect(), gb = g.getBoundingClientRect();
  const want = clamp(g.scrollTop + (rb.top - gb.top - g.clientTop) - px("--space-2"), 0, g.scrollHeight - g.clientHeight), wantL = g.scrollLeft;
  g.scrollTop = s0; g.scrollLeft = l0;
  g.scrollTo({ top: want, left: wantL, behavior: reduced() ? "auto" : "smooth" });
}
function applyZoom(cid = tab) {
  const gs = G[cid], zoomer = graphOf(cid).querySelector(".zoomer"), label = fig(Math.round(gs.zoom * 100) + "%");
  gsecOf(cid).querySelector(".gsec-head output").innerHTML = label;
  if (cid === tab) $("zoomLevel").innerHTML = label;
  if (!zoomer) return;
  zoomer.style.width = gs.gw * gs.zoom + "px"; zoomer.style.height = gs.gh * gs.zoom + "px";
  zoomer.firstChild.style.transform = "scale(" + gs.zoom + ")";
}
// A zoom the person sets is theirs: the graph stops fitting its kept machine.
// One floor for every zoom path the person takes: the pinch's 0.5 (the r24 values ruling, call 3).
const setZoom = (cid, z, lo = 0.5) => { G[cid].zoom = clamp(z, lo, 1.6); G[cid].own = true; applyZoom(cid); };
const fitZoom = (cid) => { const g = graphOf(cid), gs = G[cid]; gs.own = true; gs.zoom = clamp(Math.min((g.clientWidth - 8) / gs.gw, (g.clientHeight - 8) / gs.gh), 0.5, 1); applyZoom(cid); };
// The kept state brought into view, with its from-node above it when there is room.
function showKept(cid = tab) {
  const v = views[cid], g = graphOf(cid);
  if (!g.clientHeight) return;
  const el = g.querySelector('.node[data-machine="' + v.last + '"][data-state="' + v.cur[v.last].state + '"]');
  if (!el) return;
  const into = moveInto(compOf(cid), v.last, v.cur[v.last].state);
  const fromEl = into ? g.querySelector('.node[data-machine="' + v.last + '"][data-state="' + into.from + '"]') : null;
  revealIn(cid, el, fromEl, true);
}
// A state brought into its graph's view by the same rule as the kept one: a focus (a key, a press) shows it
// on a view whose edges cut no state (the r24 review: a browser's own scroll-into-view cut the foot).
function revealNode(cid, el) {
  if (!graphOf(cid).clientHeight) return;
  revealIn(cid, el, null, false);
}
function revealIn(cid, el, fromEl, fit) {
  const g = graphOf(cid), pad = px("--space-2"), gs = G[cid];
  // Until the person zooms it, the graph opens zoomed to hold the kept state's machine whole, its box and a
  // margin, between 0.75 and 1 (the r24 values ruling, call 3). Where it doesn't fit at 0.75, the view opens
  // on the kept state, its from-state above it when there is room, the machine's top cut cleanly.
  if (fit && !gs.own) {
    const st = g.querySelector(".secstrip"), rh = el.closest(".region").getBoundingClientRect().height / gs.zoom, z = clamp((g.clientHeight - (st ? st.offsetHeight : 0) - 2 * pad) / rh, 0.75, 1);
    if (Math.abs(z - gs.zoom) > 0.001) { gs.zoom = z; applyZoom(cid); }
  }
  const box = g.getBoundingClientRect(), n = el.getBoundingClientRect(), r = el.closest(".region").getBoundingClientRect();
  // The section strip stands over the view's top (pin 30): what shows starts under it.
  const strip = g.querySelector(".secstrip"), sh = strip ? strip.offsetHeight : 0;
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
  const solid = [...g.querySelectorAll(".node, .region-name, .world svg text, .world svg .lchip")].map(boxOf);
  // The edge cuts no state, no machine's name and no edge label (the r24 values ruling, call 4); a machine's
  // box and arrows, between machines or inside one, may run on over it.
  const frames = [];
  const boxes = [...g.querySelectorAll(".node, .region-name")].map(boxOf);
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
// Three tiers, per component: its kept state (coral, one per component on screen), every other machine's
// current state, and the rest.
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
    // The kept machine's region and its chip in the strip (pin 30).
    sec.querySelectorAll(".region").forEach((r) => r.classList.toggle("kept-region", r.dataset.machine === v.last));
    sec.querySelectorAll(".secchip").forEach((b) => b.toggleAttribute("data-kept", b.dataset.machine === v.last));
    // The lit edge: the edge into the kept state, drawn last, in coral. Edges between machines never light.
    const into = moveInto(c, v.last, v.cur[v.last].state);
    sec.querySelectorAll(".region path.edge").forEach((pl) => {
      const lit = !!into && pl.closest(".region").dataset.machine === v.last && pl.dataset.from === into.from && pl.dataset.to === v.cur[v.last].state;
      pl.classList.toggle("kept", lit);
      pl.setAttribute("marker-end", "url(#" + pl.dataset.marker + (lit ? "-kept" : "") + ")");
      if (lit) pl.parentNode.append(pl);
    });
  }
  document.querySelectorAll(".disc").forEach((d) => d.remove());
  updateDisc();
  // The drawer's and the sheet's head name the kept state.
  const v = views[tab];
  $("sheetState").textContent = stateOf(machineOf(comp(), v.last), v.cur[v.last].state).name;
  labelHead();
}
// The disc rides the lit edge with the dock's playhead, one to one; shown while playing or scrubbing.
function updateDisc() {
  const pl = gsecOf(tab).querySelector(".region path.edge.kept");
  let disc = document.querySelector(".disc");
  const km = keptMove();
  const show = !!pl && !!km && (scrubbing || (!!playing && !reduced()));
  if (!show) { if (disc) disc.remove(); return; }
  if (!disc) { disc = document.createElementNS(SVGNS, "circle"); disc.setAttribute("class", "disc"); disc.setAttribute("r", "3"); pl.parentNode.append(disc); }
  const total = playLengthOf(km.r), k = total ? clamp((time ?? total) / total, 0, 1) : 1;
  const len = pl.getTotalLength(), pt = pl.getPointAtLength(k * len);
  disc.setAttribute("cx", pt.x); disc.setAttribute("cy", pt.y);
  disc.style.opacity = String(k > 0.9 ? (1 - k) / 0.1 : 1);
}
// A keep makes its component the last kept: the dock turns to its move and the keys go to it.
function keep(cid, machine, state, vary) {
  stopPlay();
  const was = tab, v = views[cid]; tab = cid;
  v.cur[machine] = { state, vary }; v.last = machine; peek = null; time = null;
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
// A curve's glyph, drawn from its function: a bezier, or a spring's response (it overshoots when it bounces).
function glyph(ease, cls) {
  const pts = [];
  if (isSpring(ease)) {
    const s = springOf(1000, ease.spring.bounce, 100), end = Math.max(1000, s.settle);
    for (let i = 0; i <= 24; i++) { const t = (i / 24) * end; pts.push([t / end, s.at(t)]); }
  } else {
    const f = bezier(Array.isArray(ease) ? ease : bezierOf(ease));
    for (let i = 0; i <= 24; i++) pts.push([i / 24, f(i / 24)]);
  }
  const d = pts.map(([x, y], i) => (i ? "L" : "M") + (1 + x * 14).toFixed(2) + " " + (9 - y * 8).toFixed(2)).join(" ");
  return '<svg class="' + (cls || "") + '" viewBox="0 0 16 10" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
const fmtMs = (v) => Math.round(v) + " ms";
const curveName = (ease) => (isSpring(ease) ? "spring" : Array.isArray(ease) ? ease.map((n) => +n.toFixed(2)).join(", ") : ease);
// The readouts (round 27, pin 27): each is one button that opens the clip's popover on its own field (pin 28).
// A token's name is a code chip; a number is a Measured figure (JetBrains Mono, tabular, at its cap height)
// in full ink, its unit after it in meta. A free value's figure keeps the dashed edge, the one mark of free;
// a value the person changed takes the selection pair, theirs alone.
const fig = (v, unit, cls = "") => '<span class="fig ' + cls + '">' + v + (unit ? '<span class="unit">' + unit + "</span>" : "") + "</span>";
const codeChip = (name) => '<span class="badge code"><code>' + esc(name) + "</code></span>";
const readout = (open, label, inner, cls) => '<button type="button" class="ro ' + cls + '" data-open="' + open + '" aria-label="' + esc(label) + '">' + inner + "</button>";
function lengthBadge(c, cls = "") {
  return typeof c.dur === "string" ? readout("dur", "Length " + c.dur + " " + fmtMs(ms(c.dur)), codeChip(c.dur) + fig(Math.round(ms(c.dur)), "ms"), cls) : readout("dur", "Length " + fmtMs(c.dur), fig(Math.round(c.dur), "ms", "free"), cls);
}
function curveBadge(c, cls = "") {
  if (isSpring(c.ease)) return readout("curve", "Curve spring, bounce " + c.ease.spring.bounce, '<span class="badge code">' + glyph(c.ease) + "<code>spring</code></span>" + fig(c.ease.spring.bounce), cls);
  if (Array.isArray(c.ease)) return readout("curve", "Curve " + curveName(c.ease), '<span class="fig free">' + glyph(c.ease) + curveName(c.ease) + "</span>", cls);
  return readout("curve", "Curve " + c.ease, '<span class="badge code">' + glyph(c.ease) + "<code>" + c.ease + "</code></span>", cls);
}
// Values take a line of their own, so a row's height never turns on how wide its other readouts are.
function valuesBadge(c, cls = "") { return c.from != null ? '<span class="readouts-break" aria-hidden="true"></span>' + readout("from", c.prop + " " + c.from + " to " + c.to + " " + (c.unit || ""), codeChip(c.prop) + fig(c.from) + '<span class="arrow">→</span>' + fig(c.to, c.unit || ""), "values " + cls) : ""; }
function readoutsHtml(e, c) {
  const o = e.orig.find((x) => x.key === c.key);
  const ch = (a, b) => (same(a, b) ? "" : "changed");
  return lengthBadge(c, ch(c.dur, o.dur)) + curveBadge(c, ch(c.ease, o.ease)) + valuesBadge(c, ch([c.from, c.to], [o.from, o.to]));
}
// The kind of change a clip makes, by its verb: it comes in, it changes in place, or it goes (pin 27). Its hue
// marks its bar's edge and a dot before the verb, so clips read apart before their words are read.
const KINDS = { enter: /^(comes in|fade in|unfolds|appears|rises)/, exit: /^(folds away|goes|dims|fades out|leaves)/ };
const kindOf = (c) => (KINDS.enter.test(c.does) ? "enter" : KINDS.exit.test(c.does) ? "exit" : "change");
const anchorWords = (e, c) => (c.at.ref ? c.at.ref + " " + e.cur.concat(e.orig).find((x) => x.key === c.at.of).of : "");
function buildDock(opts = {}) {
  const dock = $("dock"), km = keptMove();
  const move = $("faces").querySelector('[data-face="move"]');
  move.disabled = !km;
  if (!km) { dock.dataset.open = "false"; tl = null; sizeDockRoom(); if (face === "move") setFace("graph"); return; }
  dock.dataset.open = String(panelOpen());
  dock.dataset.view = km.e.view;
  const m = machineOf(km.c, views[tab].last);
  // With every page on screen the dock names the component it edits: the last kept.
  const title = (screen.multi ? km.c.name + " · " : "") + stateOf(m, km.into.from).name + " → " + stateOf(m, views[tab].cur[views[tab].last].state).name;
  const n = editCount(km.e);
  const edited = n > 0;
  let html = '<header class="dock-head"><h2 class="dock-title">' + esc(title) + "</h2>";
  html += '<div class="edits">';
  if (edited) html += '<div class="t-tabs" id="compare" role="tablist" aria-label="Compare"><span class="t-tabs-pill" aria-hidden="true"></span><button class="t-tab" role="tab" data-view="original">Original</button><button class="t-tab" role="tab" data-view="edited">Edited</button></div><span class="badge edits-count"><span class="num">' + n + "</span>" + (n === 1 ? " edit" : " edits") + '</span><button class="ghost-btn" id="resetAll">Reset</button>';
  html += "</div></header>";
  html += '<div class="tl" id="tl"><div class="end-area" id="endArea"></div>';
  html += '<div class="tl-row ruler-row"><div class="transport"><button class="tbtn" id="play" aria-label="Play">' + icon(ICON.play, "i-play") + icon(ICON.pause, "i-pause") + '</button><button class="tbtn" id="loop" aria-label="Loop" aria-pressed="' + looping + '">' + icon(ICON.loop) + '</button><span class="readout" id="readout"></span></div><div class="ruler" id="ruler"></div></div>';
  html += '<div class="rows" id="rows">' + km.clips.map((c) => '<div class="tl-row clip" data-key="' + c.key + '" data-kind="' + kindOf(c) + '"><div class="clip-name"><p>' + esc(c.of) + ' <span class="verb"><i class="kind" aria-hidden="true"></i>' + esc(c.does) + '</span></p><div class="readouts">' + readoutsHtml(km.e, c) + '</div></div><div class="lane" data-key="' + c.key + '"><div class="ghost" hidden></div><div class="bar" role="button" tabindex="0" aria-pressed="false" data-key="' + c.key + '" aria-label="' + esc(c.of + " " + c.does) + '"' + (c.at.ref ? ' data-tip="' + esc(anchorWords(km.e, c)) + '"' : "") + '></div><div class="tail" hidden></div></div></div>').join("") + "</div>";
  html += '<div id="ties"></div><div class="playhead" id="playhead"></div></div>';
  const refocus = pop && pop.inline && pop.el.contains(document.activeElement) ? document.activeElement.dataset.f : null;
  $("dockBody").innerHTML = html;
  tl = { km };
  if (pop && pop.inline) { attachInline(); if (refocus) { const f = pop.el.querySelector('[data-f="' + refocus + '"]'); if (f) f.focus({ preventScroll: true }); } }
  if (edited) { for (const b of dock.querySelectorAll("#compare .t-tab")) { b.setAttribute("aria-selected", String(b.dataset.view === km.e.view)); b.onclick = () => setView(b.dataset.view); } if (opts.pillFrom) glideFrom($("compare"), opts.pillFrom); else requestAnimationFrame(() => slidePill($("compare"), false)); $("resetAll").onclick = () => { if (commit(km.e, km.e.orig)) afterEdit(km, { replay: true }); }; }
  $("play").onclick = () => (playing ? stopPlay() : play());
  $("loop").onclick = () => { looping = !looping; $("loop").setAttribute("aria-pressed", String(looping)); if (looping && !playing) play(); };
  wireDock(km);
  layoutDock();
  sizeDockRoom();
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
  $("dock").querySelector(".ruler-row").style.background = stacked() ? "" : "linear-gradient(to right, var(--surface-raised) " + endX + "px, var(--surface-recess-deep) 0)";
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
  updateDisc();
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
  const startScrub = (e) => { e.preventDefault(); scrubbing = true; rootEl.dataset.scrubbing = ""; e.currentTarget.setPointerCapture(e.pointerId); scrubAt(e); e.currentTarget.onpointermove = scrubAt; e.currentTarget.onpointerup = e.currentTarget.onpointercancel = (ev) => { ev.currentTarget.onpointermove = null; scrubbing = false; delete rootEl.dataset.scrubbing; updateDisc(); }; };
  $("ruler").onpointerdown = startScrub;
  for (const name of rows.querySelectorAll(".clip-name")) name.onclick = (e) => { if (e.target.closest(".ro")) return; const bar = name.parentNode.querySelector(".bar"); barClick(bar.dataset.key, e, "pointer", { name: true }); };
  // A readout opens its clip's popover on its own field: Length on its figure, the curve on its menu, values on From.
  for (const ro of rows.querySelectorAll(".ro")) ro.onclick = (e) => {
    e.stopPropagation();
    const key = ro.closest(".clip").dataset.key, open = ro.dataset.open, keyed = e.detail === 0;
    barClick(key, e, keyed ? "key" : "pointer", { open });
    if (!pop || pop.key !== key) return;
    if (open === "curve") { const t = pop.el.querySelector('[data-menu="curve"]'); if (t) openMenu("curve", t); }
    else { const f = pop.el.querySelector('input[data-f="' + (open === "from" ? "from" : "dur") + '"]'); if (f) { f.focus({ preventScroll: true }); if (f.select) f.select(); } }
  };
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
    if (e.target.classList.contains("bar") || tl.km.e.view === "original") return;
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

// ---- The clip popover (clip-popover-design.md) ----
let pop = null;
const popInset = () => (compact() ? px("--c-screen-margin") : px("--space-5"));
// The inline editor stands under its clip's row; a rebuilt dock takes it back there.
function attachInline() {
  const row = $("rows") && $("rows").querySelector('.clip[data-key="' + pop.key + '"]');
  if (row && row.nextElementSibling !== pop.el) row.after(pop.el);
}
// While the inline editor unfolds or folds, the rows under it move: the lanes' marks follow, frame by frame.
// An unfolding editor keeps itself in the rows' view frame by frame (a smooth scroll would clamp to the
// rows' height before the unfold).
function followRows(anim, reveal) {
  const step = () => { if (tl) layoutDock(); if (reveal) revealInline(); if (anim.playState === "running") requestAnimationFrame(step); };
  requestAnimationFrame(step);
  anim.finished.then(() => { if (tl) layoutDock(); if (reveal) revealInline(); }, () => {});
}
function clipNow(key, work) { const km = keptMove(); return (work || km.e.cur).find((x) => x.key === key); }
// The popover opens on what was pressed (round 27, pin 28): a readout, the clip's name or its bar (the anchor,
// held by what it is, so a relayout finds it again). It grows from that element's centre.
function openPop(key, origin, anchor) {
  const km = keptMove();
  if (!km || km.e.view === "original") return;
  if (pop && pop.key === key) { pop.anchor = anchor || null; if (!pop.inline) placePop(); if (origin === "key") focusFirst(); return; }
  closePop(true);
  const el = document.createElement("div"), inline = stacked();
  el.className = "pop" + (inline ? " inline" : ""); el.setAttribute("role", inline ? "group" : "dialog"); el.dataset.key = key;
  pop = { key, el, origin, held: false, committed: {}, inline, anchor: anchor || null };
  if (inline) attachInline(); else document.body.append(el);
  renderPop();
  placePop();
  el.setAttribute("aria-label", clipNow(key).of + " " + clipNow(key).does);
  if (inline) {
    // It unfolds in place: its height from nothing, its words fading in.
    const h = el.offsetHeight, frames = reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, height: "0px", marginBlockEnd: "0px" }, { opacity: 1, height: h + "px", marginBlockEnd: getComputedStyle(el).marginBlockEnd }];
    followRows(el.animate(frames, { duration: ms("--dur-pop"), easing: tok("--ease-drawer") }), true);
  } else if (!reduced()) el.animate([{ opacity: 0, translate: "0 " + tok("--pop-rise"), scale: tok("--pop-scale") }, { opacity: 1, translate: "0 0", scale: 1 }], { duration: ms("--dur-pop"), easing: tok("--ease-drawer") });
  else el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-pop"), easing: tok("--ease-drawer") });
  if (origin === "key") focusFirst();
}
function focusFirst() { const i = pop.el.querySelector('input[data-f="at"]:not(:disabled)') || pop.el.querySelector("input, button"); if (i) { i.focus(); if (i.select) i.select(); } }
function closePop(instant) {
  closeMenu();
  if (!pop) return;
  const el = pop.el, inline = pop.inline; pop = null;
  if (instant) { el.remove(); if (inline && tl) layoutDock(); return; }
  el.style.pointerEvents = "none";
  if (inline) {
    const frames = reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, height: el.offsetHeight + "px" }, { opacity: 0, height: "0px", marginBlockEnd: "0px" }];
    const a = el.animate(frames, { duration: ms("--dur-exit"), easing: tok("--ease-out"), fill: "forwards" });
    a.finished.then(() => { el.remove(); if (tl) layoutDock(); }, () => {});
    followRows(a);
    return;
  }
  // With reduced motion the kit's fade alone runs, open and close.
  const frames = reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, translate: "0 0", scale: 1 }, { opacity: 0, translate: "0 " + tok("--pop-rise"), scale: tok("--pop-scale") }];
  el.animate(frames, { duration: ms("--dur-exit"), easing: tok("--ease-out"), fill: "forwards" }).finished.then(() => el.remove());
}
// The inline editor scrolls into the face's view as it opens: its foot clear of the rows' bottom edge, and
// never above the sticky ruler.
// Its margin to the view's edges is --space-2 where the view holds it and that, else what the view leaves.
// An editor taller than the view keeps its natural height, the rows its one scroller: its head goes to the
// view's top (the r23 values ruling, call 7).
function revealInline() {
  const t = $("tl");
  if (!t || !pop || !pop.inline || !pop.el.isConnected) return;
  const top = $("dock").querySelector(".ruler-row").getBoundingClientRect().bottom, tb = t.getBoundingClientRect(), pb = pop.el.getBoundingClientRect();
  const room = tb.bottom - top, pad = Math.max(0, Math.min(px("--space-2"), (room - pb.height) / 2));
  let d = 0;
  if (pb.height > room) d = pb.top - top;
  else { if (pb.bottom + pad > tb.bottom) d = pb.bottom + pad - tb.bottom; if (pb.top - d < top + pad) d = pb.top - top - pad; }
  if (Math.abs(d) >= 0.5) t.scrollTop += d;
}
// The surface a popover opens in, less the inset: the viewport at a desk (over the page and the dock, by
// design); on a compact screen, the drawer's or the sheet's Move face, under its head.
function popBounds() {
  const inset = popInset();
  const B = { l: inset, t: inset, r: innerWidth - inset, b: innerHeight - inset };
  if (!compact()) return B;
  const d = $("dock").getBoundingClientRect();
  return { l: Math.max(B.l, d.left + inset), t: Math.max(B.t, d.top + inset), r: Math.min(B.r, d.right - inset), b: Math.min(B.b, d.bottom - inset) };
}
// Where it stands (clip-popover-design.md): 4px above its bar, its start on the bar's start, slid along the row
// inside its surface; below the bar's row only when the room above is shorter than it (and the room below
// longer); where neither side holds it, it stays inside the surface.
// The pressed element, found again by what it is: a readout by its field, the name block, or the bar.
function anchorEl() {
  const row = $("rows") && $("rows").querySelector('.clip[data-key="' + pop.key + '"]');
  if (!row) return null;
  const a = pop.anchor;
  return (a && a.open && row.querySelector('.ro[data-open="' + a.open + '"]')) || (a && a.name && row.querySelector(".clip-name")) || row.querySelector(".bar");
}
function popPlace() {
  const bar = anchorEl();
  if (!bar) return null;
  // A press in the name column opens under what was pressed, its start on its start; a bar's opens above it.
  // The anchor is read at rest: a chip still pressed (scaled by --press-scale) would put it a pixel or two off.
  if (!bar.classList.contains("bar")) {
    const was = bar.style.scale; bar.style.scale = "1";
    const b = bar.getBoundingClientRect();
    bar.style.scale = was;
    const el = pop.el, B = popBounds(), gap = px("--space-1"), w = el.offsetWidth, h = el.offsetHeight;
    const left = clamp(b.left, B.l, B.r - w), roomBelow = B.b - (b.bottom + gap), roomAbove = b.top - gap - B.t;
    const below = roomBelow >= h || roomBelow >= roomAbove, top = clamp(below ? b.bottom + gap : b.top - gap - h, B.t, B.b - h);
    el.style.transformOrigin = (b.left + b.width / 2 - left) + "px " + (below ? "0" : "100%");
    return { left, top, above: !below, bottom: innerHeight - (top + h) };
  }
  const b = bar.getBoundingClientRect(), el = pop.el, B = popBounds(), gap = px("--space-1");
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = clamp(b.left, B.l, B.r - w);
  const row = bar.closest(".clip").getBoundingClientRect(), under = Math.max(b.bottom, row.bottom) + gap;
  const roomAbove = b.top - gap - B.t, roomBelow = B.b - under;
  const above = roomAbove >= h || (roomBelow < h && roomAbove > roomBelow);
  const top = clamp(above ? b.top - gap - h : under, B.t, B.b - h);
  el.style.transformOrigin = (b.left - left) + "px " + (above ? "100%" : "0");
  return { left, top, above, bottom: innerHeight - (top + h) };
}
function placePop() {
  if (pop.inline) { attachInline(); return; }
  const p = popPlace(); if (!p) return;
  const el = pop.el;
  el.style.left = p.left + "px";
  if (p.above) { el.style.top = "auto"; el.style.bottom = p.bottom + "px"; } else { el.style.bottom = "auto"; el.style.top = p.top + "px"; }
}
function movePop(from) {
  if (!pop || pop.inline) return;
  const r0 = from || pop.el.getBoundingClientRect();
  placePop();
  const r1 = pop.el.getBoundingClientRect();
  if (!reduced() && (Math.abs(r1.left - r0.left) > 0.5 || Math.abs(r1.top - r0.top) > 0.5)) pop.el.animate([{ translate: r0.left - r1.left + "px " + (r0.top - r1.top) + "px" }, { translate: "0 0" }], { duration: ms("--dur-panel"), easing: tok("--ease-drawer") });
}
const fieldVal = (v) => String(Math.round(msOf(v) * 100) / 100);
function fieldHtml(f, value, unit, opts = {}) {
  return '<span class="fld' + (opts.free ? " free" : "") + (opts.num ? " num" : "") + '"><input data-f="' + f + '" inputmode="decimal" aria-label="' + opts.label + '" value="' + esc(value) + '"' + (opts.disabled ? " disabled" : "") + ">" + (unit ? '<span class="unit">' + unit + "</span>" : "") + (opts.token ? '<span class="badge"><code>' + opts.token + "</code></span>" : "") + "</span>";
}
function renderPop(work) {
  const el = pop.el, c = clipNow(pop.key, work), km = keptMove(), e = km.e;
  const o = e.orig.find((x) => x.key === c.key), isEdited = !same(c, o);
  const atTok = c.at.ref === "with" ? null : typeof c.at.v === "string" ? c.at.v : null;
  const atVal = c.at.ref === "with" ? 0 : msOf(c.at.v);
  const durTok = typeof c.dur === "string" ? c.dur : null;
  if (!Array.isArray(c.ease)) pop.custom = false;
  const atFree = c.at.ref !== "with" && !atTok && atVal !== 0;
  let rows = '<span class="pop-label" data-scrub="at">Starts</span><span class="pop-cell">' + fieldHtml("at", fieldVal(atVal), "ms", { token: atTok, free: atFree, label: "Starts, ms", disabled: c.at.ref === "with" }) + '<button class="anchor-btn" data-menu="anchor" aria-label="Starts from" aria-haspopup="menu">' + icon(ICON.chevron) + "</button>" + (c.at.ref ? '<span class="pop-sub">' + esc(anchorWords(e, c)) + "</span>" : o.at.ref ? '<span class="pop-sub">from the start</span>' : "") + "</span>";
  rows += '<span class="pop-label" data-scrub="dur">Length</span><span class="pop-cell">' + fieldHtml("dur", fieldVal(c.dur), "ms", { token: durTok, free: !durTok, label: "Length, ms" }) + "</span>";
  if (Array.isArray(c.ease) && pop.custom) rows += '<span class="pop-label">Curve</span><span class="pop-cell"><span class="fld free">' + glyph(c.ease, "glyph") + '<input data-f="bez" aria-label="Custom bezier" value="' + c.ease.join(", ") + '"></span></span>';
  else rows += '<span class="pop-label">Curve</span><span class="pop-cell"><button class="fld trigger' + (Array.isArray(c.ease) ? " free" : "") + '" data-menu="curve" aria-haspopup="menu" aria-label="Curve">' + glyph(c.ease, "glyph") + "<span>" + (isSpring(c.ease) ? "Spring" : esc(curveName(c.ease))) + "</span>" + icon(ICON.chevron, "chev") + "</button></span>";
  if (isSpring(c.ease)) rows += '<span class="pop-label" data-scrub="bounce">Bounce</span><span class="pop-cell">' + fieldHtml("bounce", String(c.ease.spring.bounce), "", { label: "Bounce", num: true }) + "</span>";
  if (c.from != null) rows += '<span class="pop-label" data-scrub="from"><code>' + esc(c.prop) + '</code></span><span class="pop-cell">' + fieldHtml("from", String(c.from), "", { label: c.prop + " from", num: true }) + '<span class="arrow">→</span>' + fieldHtml("to", String(c.to), "", { label: c.prop + " to", num: true }) + '<span class="unit arrow">' + esc(c.unit || "") + "</span></span>";
  const head = '<div class="pop-head"><p>' + esc(c.of) + " <span>" + esc(c.does) + "</span></p>" + (isEdited ? '<button class="ghost-btn" id="popReset">Reset</button>' : "") + "</div>";
  const focusF = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.f || document.activeElement.dataset.menu : null;
  const caret = focusF && document.activeElement.selectionStart;
  // A first draw has nothing to morph from: only a redraw of an open popover tweens its height.
  const h0 = el.childElementCount ? el.offsetHeight : 0;
  el.innerHTML = head + '<div class="pop-rows">' + rows + "</div>";
  pop.committed = { at: fieldVal(atVal), dur: fieldVal(c.dur), bounce: isSpring(c.ease) ? String(c.ease.spring.bounce) : "", from: String(c.from), to: String(c.to), bez: Array.isArray(c.ease) ? c.ease.join(", ") : "" };
  wirePop();
  if (focusF) { const f = el.querySelector('[data-f="' + focusF + '"], [data-menu="' + focusF + '"]'); if (f) { f.focus({ preventScroll: true }); if (caret != null && f.setSelectionRange) try { f.setSelectionRange(caret, caret); } catch {} } }
  // The kit's morph: a height change tweens over --dur-morph on the drawer curve.
  const h1 = el.offsetHeight;
  if (h0 && h0 !== h1 && !reduced()) el.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: ms("--dur-morph"), easing: tok("--ease-drawer") });
}
// While the bar is dragged the fields tick with it in place; otherwise the popover is drawn anew.
function refreshPop(work) {
  if (!pop) return;
  if (work) { const c = clipNow(pop.key, work); const set = (f, v) => { const i = pop.el.querySelector('input[data-f="' + f + '"]'); if (i && document.activeElement !== i) i.value = v; }; set("at", fieldVal(c.at.ref === "with" ? 0 : c.at.v)); set("dur", fieldVal(c.dur)); if (isSpring(c.ease)) set("bounce", String(c.ease.spring.bounce)); if (c.from != null) { set("from", String(c.from)); set("to", String(c.to)); } return; }
  renderPop();
  if (!pop.held) placePop();
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
  return withClip((c, next) => {
    const o = km.e.orig.find((x) => x.key === c.key);
    if (f === "at") c.at.v = asValue(Math.max(-1e4, Math.round(v)), typeof o.at.v === "string" ? o.at.v : null);
    if (f === "dur") c.dur = asValue(Math.max(10, Math.round(v)), typeof o.dur === "string" ? o.dur : null);
    if (f === "bounce") c.ease = { spring: { bounce: clamp(Math.round(v * 100) / 100, -1, 1) } };
    if (f === "from") c.from = v;
    if (f === "to") c.to = v;
    void next;
  }, key);
}
function stepField(f, dir, e, km) {
  const c = clipNow(pop.key);
  if (f === "at" || f === "dur") {
    const cur = f === "at" ? msOf(c.at.v) : msOf(c.dur);
    let n;
    if (e.altKey) n = cur + dir * (e.shiftKey ? 50 : 10);
    else { const lens = f === "at" ? [0].concat(ladderMs()) : ladderMs(); n = lens.filter((l) => (dir > 0 ? l > cur : l < cur)).sort((a, b) => dir * (a - b))[0]; if (n === undefined) return null; }
    return applyField(f, n, km);
  }
  if (f === "bounce") { const b = c.ease.spring.bounce + dir * (e.altKey ? 0.01 : 0.05); return applyField(f, clamp(Math.round(b * 100) / 100, 0, 0.6), km); }
  if (f === "from" || f === "to") return applyField(f, c[f] + dir, km);
  return null;
}
function wirePop() {
  const el = pop.el, km = keptMove();
  for (const i of el.querySelectorAll("input[data-f]")) {
    const f = i.dataset.f;
    i.onkeydown = (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const next = stepField(f, e.key === "ArrowUp" ? 1 : -1, e, km); if (next) popCommit(next, { replay: false }); }
      else if (e.key === "Enter") { e.preventDefault(); const next = applyField(f, i.value, km); if (next) popCommit(next, { replay: true }); else i.value = pop.committed[f]; if (f === "bez") { pop.custom = true; } }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (i.value !== pop.committed[f]) i.value = pop.committed[f]; else closeAndFocusBar(); }
    };
    i.onblur = () => { if (!pop || i.value === pop.committed[f]) return; const key = pop.key, val = i.value; setTimeout(() => { const next = applyField(f, val, keptMove(), key); if (next) { const kmm = keptMove(); if (commit(kmm.e, next)) afterEdit(kmm, { replay: false }); } }); };
    if (f === "bez") i.oninput = () => { const n = i.value.split(/[\s,]+/).map(Number); if (n.length === 4 && n.every(Number.isFinite)) i.parentNode.querySelector("svg").outerHTML = glyph(n, "glyph"); };
  }
  for (const b of el.querySelectorAll("[data-menu]")) b.onclick = () => openMenu(b.dataset.menu, b);
  const rs = el.querySelector("#popReset");
  if (rs) rs.onclick = () => { const next = clone(km.e.cur), i = next.findIndex((x) => x.key === pop.key); next[i] = clone(km.e.orig.find((x) => x.key === pop.key)); pop.custom = false; popCommit(next, { replay: true }); };
  // Labels scrub: the value follows the pointer, snapping to the ladder (and Starts to other clips' edges)
  // unless ⌥ is held. Release replays once.
  for (const l of el.querySelectorAll("[data-scrub]")) l.onpointerdown = (e) => {
    const f = l.dataset.scrub, c0 = clipNow(pop.key), x0 = e.clientX;
    if (f === "at" && c0.at.ref === "with") return;
    l.setPointerCapture(e.pointerId); e.preventDefault();
    const before = clone(km.e.cur);
    const v0 = f === "at" ? msOf(c0.at.v) : f === "dur" ? msOf(c0.dur) : f === "bounce" ? c0.ease.spring.bounce : c0.from;
    let last = null;
    l.onpointermove = (ev) => {
      const dx = ev.clientX - x0;
      let v;
      if (f === "bounce") { v = clamp(v0 + dx * 0.005, 0, 0.6); v = ev.altKey ? Math.round(v * 100) / 100 : Math.round(v * 20) / 20; }
      else if (f === "from") v = Math.round(v0 + dx / 4);
      else {
        v = v0 + dx * 2;
        if (ev.altKey) v = Math.round(v / 10) * 10;
        else { const lens = (f === "at" ? [0].concat(ladderMs()) : ladderMs()).concat(f === "at" ? snapTargets(km, km.e.cur, new Set([pop.key])) : []); v = lens.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), lens[0]); }
        v = Math.max(f === "dur" ? 10 : 0, v);
      }
      if (v === last) return; last = v;
      const next = applyField(f, v, km); if (next) { km.e.cur = next; afterEdit(km, { replay: false, rescaleNow: false, inPlace: true }); }
    };
    l.onpointerup = l.onpointercancel = () => { l.onpointermove = null; const kmm = keptMove(); if (last !== null && !same(before, kmm.e.cur)) { kmm.e.past.push(before); kmm.e.future = []; rescale(kmm); afterEdit(kmm, { replay: true }); } };
  };
}
function closeAndFocusBar() { const key = pop && pop.key; closePop(); const b = key && $("rows") && $("rows").querySelector('.bar[data-key="' + key + '"]'); if (b) b.focus({ preventScroll: true }); }

// ---- The kit's DropdownMenu, over the popover ----
let menu = null;
function openMenu(kind, trigger) {
  if (menu && menu.kind === kind) { closeMenu(); return; }
  closeMenu();
  const km = keptMove(), c = clipNow(pop.key), items = [];
  if (kind === "curve") {
    for (const name of CURVES) items.push({ html: glyph(name, "glyph") + "<code>" + name + "</code>", on: c.ease === name, pick: () => withClip((x) => { x.ease = name; }) });
    items.push("sep");
    items.push({ html: glyph({ spring: { bounce: 0.3 } }, "glyph") + "Spring", on: isSpring(c.ease), pick: () => withClip((x) => { x.ease = isSpring(c.ease) ? c.ease : { spring: { bounce: 0 } }; }) });
    items.push("sep");
    items.push({ html: "Custom bezier…", on: Array.isArray(c.ease), pick: () => { pop.custom = true; return withClip((x) => { x.ease = Array.isArray(c.ease) ? c.ease : isSpring(c.ease) ? bezierOf("--ease-out") : bezierOf(c.ease); }); }, focus: "bez" });
  } else {
    // A clip can start from the start, or after or with any clip that doesn't already hang from it.
    const r = (k, seen = new Set()) => { const x = km.e.cur.find((y) => y.key === k); return !x.at.ref ? false : x.at.of === pop.key || seen.has(k) ? true : r(x.at.of, new Set([...seen, k])); };
    const others = km.e.cur.filter((x) => x.key !== pop.key && !r(x.key));
    items.push({ html: "From the start", on: !c.at.ref, pick: () => withClip((x) => { const off = x.at.ref === "with" ? 0 : x.at.v; x.at = { ref: null, v: off }; }) });
    if (others.length) items.push("sep");
    for (const o of others) items.push({ html: "After " + esc(o.of), on: c.at.ref === "after" && c.at.of === o.key, pick: () => withClip((x) => { x.at = { ref: "after", of: o.key, v: x.at.ref === "with" ? 0 : x.at.v }; }) });
    if (others.length) items.push("sep");
    for (const o of others) items.push({ html: "With " + esc(o.of), on: c.at.ref === "with" && c.at.of === o.key, pick: () => withClip((x) => { x.at = { ref: "with", of: o.key, v: 0 }; }) });
  }
  const el = document.createElement("div");
  el.className = "menu"; el.setAttribute("role", "menu");
  el.innerHTML = items.map((it, i) => (it === "sep" ? '<div class="mi-sep" role="separator"></div>' : '<div class="mi" role="menuitemradio" tabindex="-1" data-i="' + i + '" aria-checked="' + it.on + '">' + it.html + "</div>")).join("");
  document.body.append(el);
  const tb = trigger.getBoundingClientRect(), inset = popInset(), gap = px("--space-1");
  const left = clamp(tb.left, inset, innerWidth - inset - el.offsetWidth);
  const below = tb.bottom + gap + el.offsetHeight <= innerHeight - inset;
  el.style.left = left + "px"; el.style.top = (below ? tb.bottom + gap : Math.max(inset, tb.top - gap - el.offsetHeight)) + "px";
  menu = { kind, el, trigger, items };
  const mis = [...el.querySelectorAll(".mi")];
  const hi = (m) => { for (const x of mis) x.toggleAttribute("data-highlighted", x === m); if (m) m.focus({ preventScroll: true }); };
  const pick = (m) => { const it = items[+m.dataset.i]; const next = it.pick(); closeMenu(); trigger.focus({ preventScroll: true }); if (next) popCommit(next, { replay: true }); else renderPop(); if (it.focus && pop) { const f = pop.el.querySelector('[data-f="' + it.focus + '"]'); if (f) { f.focus(); f.select(); } } };
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
function closeMenu() { if (menu) { menu.el.remove(); menu = null; } }
// An outside press commits the field being edited, closes, and still acts.
addEventListener("pointerdown", (e) => {
  if (menu && !menu.el.contains(e.target) && !menu.trigger.contains(e.target)) closeMenu();
  if (pop && !pop.el.contains(e.target) && !(menu && menu.el.contains(e.target))) {
    const bar = e.target.closest && e.target.closest(".bar, .clip-name");
    const a = document.activeElement; if (a && pop.el.contains(a)) a.blur();
    if (bar && pop && (bar.dataset.key || bar.parentNode.querySelector(".bar").dataset.key) === pop.key) return;
    if (!bar || e.shiftKey || e.metaKey || e.ctrlKey) closePop();
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

// ---- Each component's page, graph section and tab ----
const zoomGroup = (label) => '<div class="zoom" role="group" aria-label="Zoom, ' + esc(label) + '"><button class="icon-btn" data-z="out" aria-label="Zoom out" data-tip="Zoom out (⌘ scroll)">' + icon(ICON.zoomOut) + '</button><output aria-live="polite">100%</output><button class="icon-btn" data-z="in" aria-label="Zoom in" data-tip="Zoom in (⌘ scroll)">' + icon(ICON.zoomIn) + '</button><button class="icon-btn" data-z="fit" aria-label="Fit" data-tip="Fit">' + icon(ICON.fit) + "</button></div>";
for (const c of review) {
  const page = document.createElement("section");
  page.className = "stage-wrap"; page.dataset.comp = c.id; page.setAttribute("aria-label", c.name);
  page.innerHTML = '<div class="stage" data-comp="' + c.id + '"></div><div class="marks" data-comp="' + c.id + '" aria-hidden="true"></div>';
  $("pages").append(page);
  // Its name in the label role over its graph, and its own zoom and Fit: shown when every graph is on screen.
  const sec = document.createElement("section");
  sec.className = "gsec"; sec.dataset.comp = c.id; sec.setAttribute("aria-label", c.name);
  sec.innerHTML = '<header class="gsec-head"><h3 class="gsec-name">' + esc(c.name) + "</h3>" + zoomGroup(c.name) + '</header><div class="graph" role="region" aria-label="' + esc(c.name) + ', its state machines"></div><div class="dials"></div>';
  for (const z of sec.querySelectorAll("[data-z]")) z.onclick = () => (z.dataset.z === "fit" ? fitZoom(c.id) : setZoom(c.id, G[c.id].zoom * (z.dataset.z === "in" ? 1.2 : 1 / 1.2)));
  $("graphs").append(sec);
  const b = document.createElement("button");
  b.className = "t-tab"; b.setAttribute("role", "tab"); b.dataset.tab = c.id; b.textContent = c.name;
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
function setStop(s) {
  const was = stop; stop = s; $("tools").dataset.stop = s;
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
  if (!layoutIs("drawer") || e.button !== 0 || e.target.closest(".faces")) return;
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

// ---- Resizing the panel: the width edge, the foot and the corner (resize-handle-design.md) ----
const panel = $("panel");
const widthFloor = () => px("--c-panel-w"), widthCeil = () => Math.round(Math.min(innerWidth, px("--c-review-max-w")) * 0.85);
const floorOf = (g) => { const r = g.querySelector(".region"), n = g.querySelector(".node"); return Math.ceil((r ? r.querySelector(".region-name").offsetHeight + px("--space-2") : 0) + (n ? n.offsetHeight : 0) + 2 * px("--space-2") + 2); };
const graphFloor = () => floorOf(graphOf(tab));
const graphCeil = () => Math.max(graphFloor(), innerHeight - 2 * px("--space-5") - (panel.offsetHeight - graphOf(tab).offsetHeight));
// The split between two stacked graphs: each keeps at least its own floor.
const splitGraphs = () => [...$("graphs").children].map((sec) => sec.querySelector(".graph"));
const splitFloor = () => { const gs = splitGraphs(); return gs.length && gs[0].querySelector(".node") ? floorOf(gs[0]) : 120; };
const splitCeil = () => { const gs = splitGraphs(); return gs.length < 2 ? splitFloor() : Math.max(splitFloor(), gs[0].offsetHeight + gs[gs.length - 1].offsetHeight - (gs[gs.length - 1].querySelector(".node") ? floorOf(gs[gs.length - 1]) : 120)); };
function setSplit(h) { splitDragged = true; rootEl.style.setProperty("--split-h", clamp(Math.round(h), splitFloor(), splitCeil()) + "px"); placeSplit(); syncSashes(); }
const stackedGraphs = () => !!screen.multi && screen.multi.graphs === "stack";
// The dock's height edge: its floor is its head, its ruler and one row, measured; its ceiling the room.
function dockFloor() {
  const d = $("dock"), head = d.querySelector(".dock-head"), ruler = d.querySelector(".ruler-row"), row = d.querySelector(".clip");
  if (!head || !ruler) return 0;
  const cs = getComputedStyle(d);
  return Math.ceil(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + head.offsetHeight + parseFloat(getComputedStyle(head).marginBottom) + ruler.offsetHeight + (row ? row.offsetHeight : 0));
}
// The ceiling leaves the page --c-page-h-floor (240px), so its head and first field stay readable at End.
const dockCeil = () => innerHeight - 2 * px("--space-5") - px("--c-page-h-floor");
function setDockH(h) { rootEl.style.setProperty("--dock-h", clamp(Math.round(h), dockFloor(), dockCeil()) + "px"); sizeDockRoom(); syncSashes(); }
function setSize(w, h) {
  if (w != null) rootEl.style.setProperty("--panel-w", clamp(Math.round(w), widthFloor(), widthCeil()) + "px");
  if (h != null) rootEl.style.setProperty("--graph-h", clamp(Math.round(h), graphFloor(), graphCeil()) + "px");
  syncSashes();
}
function syncSashes() {
  const w = panel.offsetWidth, h = graphOf(tab).offsetHeight;
  const set = (el, now, min, max, text) => { el.setAttribute("aria-valuenow", now); el.setAttribute("aria-valuemin", min); el.setAttribute("aria-valuemax", max); if (text) el.setAttribute("aria-valuetext", text); };
  set($("sashW"), w, widthFloor(), widthCeil());
  set($("sashH"), h, graphFloor(), graphCeil());
  set($("sashC"), w, widthFloor(), widthCeil(), w + " by " + h + " px");
  set($("sashD"), $("dock").offsetHeight, dockFloor(), dockCeil());
  if (stackedGraphs()) set($("sashS"), splitGraphs()[0].offsetHeight, splitFloor(), splitCeil());
}
function relayoutAfterResize() { for (const c of shownComps()) drawGraph(c.id); mark(); for (const c of shownComps()) showKept(c.id); placeSplit(); if (tl) layoutDock(); sizeDockRoom(); if (pop) placePop(); }
// ---- The resize handle (round 28): iPadOS 26's window handle, one path per handle ----
// One filled ribbon round a centreline: run-out A (GRIP_RUN points, from its tip in to the body), the body
// (GRIP_BODY + 1 points), run-out B (GRIP_RUN points, out to its tip). Every frame is drawn exactly from one
// number, its progress p (0 at rest, 1 held), so each frame is a true member of the family: no point ever
// takes a short cut between two shapes.
//   At rest (p = 0) the run-outs have no length: the body alone with round caps, Apple's arc.
//   Held (p = 1) each run-out leaves the body's end along the corner's own circle, straightens along its edge,
//   and bends out onto the border's hairline as it thins, ending on the hairline at nothing: one line that
//   becomes the border, never a second line beside it.
// The clock: CSS transitions one registered number, --grip-p, out over --dur-reveal and back over --dur-exit;
// paintGrip draws the path's `d` attribute from it (Safari and iPadOS draw nothing from the `d` CSS property).
const GRIP_RUN = 48, GRIP_BODY = 16, GRIP_CAP = 8, GRIP_TIP = 6;
function ribbon(C) {
  const A = [], B = [];
  for (const { x, y, tx, ty, w } of C) { const h = w / 2; A.push([x - ty * h, y + tx * h]); B.push([x + ty * h, y - tx * h]); }
  // A cap: the half circle round an end, from one side to the other through the point the stroke runs on to.
  const cap = ({ x, y, tx, ty, w }, sign) => { const h = w / 2, out = []; for (let k = 1; k <= GRIP_CAP; k++) { const f = (Math.PI * k) / (GRIP_CAP + 1), c = Math.cos(f), sn = Math.sin(f); out.push([x + sign * h * (-ty * c + tx * sn), y + sign * h * (tx * c + ty * sn)]); } return out; };
  return [...A, ...cap(C[C.length - 1], 1), ...B.reverse(), ...cap(C[0], -1)];
}
// The measured handle (style.css, --c-grip-*), scaled to the panel's radius R: concentric with the corner, its
// centreline d in from the edge, stroke w, its rest length `len` (fine pointers: the measured 65.6° of the
// circle; a finger: Apple's own length, the quarter circle and a straight leg on along each edge). Held, each
// run-out reaches L from the body's end, its bend onto the hairline B long; hc is the hairline's centre line.
function gripGeo(tool) {
  const R = px("--radius-panel"), d = px("--c-grip-inset"), w = px("--c-grip-stroke"), len = px("--c-grip-len"), L = px("--c-grip-run"), B = px("--c-grip-bend"), r = R - d;
  const sweep = Math.min(len / r, Math.PI / 2), legs = Math.max(0, (len - r * sweep) / 2);
  return { R, d, w, len, L, B, r, sweep, legs, hc: parseFloat(getComputedStyle(tool).borderLeftWidth) / 2 };
}
const smooth = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const dSmooth = (u) => (u <= 0 || u >= 1 ? 0 : 6 * u * (1 - u));
// A run-out's width s along it from the body's end, at run length a (a0 at rest: a finger's straight legs,
// else nothing): thinning from the body's end to its tip on a cube (under half the stroke a quarter of the way
// out); its tip narrows to nothing over the first GRIP_TIP px of growth, so at rest (tip = the stroke) every
// width is the full stroke and the round caps grow smoothly into the point.
function gripWidth(g, s, a, a0) {
  if (a <= 0) return g.w;
  const tip = g.w * Math.max(0, 1 - (a - a0) / GRIP_TIP);
  return tip + (g.w - tip) * (1 - s / a) ** 3;
}
// The panel's handle in the corner's own frame: the outer corner at 0,0, x in from the width edge, -y up it.
// The corner's circle is centred on (R, −R); t = π points at the width edge, π/2 at the foot. Run-out A goes up
// the width edge; B is its mirror about the diagonal, along the foot. at(s) is where A stands s along it, and
// the direction it travels there. The bend onto the hairline starts where the circle straightens (a finger's
// rest legs lean into it), so every frame's tip stands no further in than the rest mark's own end.
function cornerShape(g, p) {
  const { R, r, d, w, L, B, sweep, legs, hc } = g, tA = (3 * Math.PI) / 4 + sweep / 2, sc = r * (Math.PI / 2 - sweep) / 2, bendAt = sc;
  const at = (s) => {
    if (s <= sc) { const t = tA + s / r; return [R + r * Math.cos(t), -R + r * Math.sin(t), -Math.sin(t), Math.cos(t)]; }
    const x = d - (d - hc) * smooth((s - bendAt) / B), dx = (-(d - hc) * dSmooth((s - bendAt) / B)) / B, n = Math.hypot(dx, 1);
    return [x, -R - (s - sc), dx / n, -1 / n];
  };
  const a = legs + p * (L - legs), C = [];
  for (let i = 0; i < GRIP_RUN; i++) { const s = a * (1 - i / GRIP_RUN), [x, y, tx, ty] = at(s); C.push({ x, y, tx: -tx, ty: -ty, w: gripWidth(g, s, a, legs) }); }
  for (let j = 0; j <= GRIP_BODY; j++) { const t = tA - sweep * (j / GRIP_BODY); C.push({ x: R + r * Math.cos(t), y: -R + r * Math.sin(t), tx: Math.sin(t), ty: -Math.cos(t), w }); }
  // B is A mirrored about the diagonal: (x, y) → (−y, −x), and so its direction.
  for (let i = 1; i <= GRIP_RUN; i++) { const s = (a * i) / GRIP_RUN, [x, y, tx, ty] = at(s); C.push({ x: -y, y: -x, tx: -ty, ty: -tx, w: gripWidth(g, s, a, legs) }); }
  return ribbon(C);
}
// The dock's: the same stroke straightened into a capsule `len` long, d down from its top edge and centred on
// it; held, each end runs out along the edge and bends up onto the hairline the same way.
function edgeShape(g, p) {
  const { d, w, len, L, B, hc } = g, half = len / 2;
  const at = (s) => { const y = d - (d - hc) * smooth(s / B), dy = (-(d - hc) * dSmooth(s / B)) / B, n = Math.hypot(1, dy); return [half + s, y, 1 / n, dy / n]; };
  const a = p * L, C = [];
  for (let i = 0; i < GRIP_RUN; i++) { const s = a * (1 - i / GRIP_RUN), [x, y, tx, ty] = at(s); C.push({ x: -x, y, tx, ty: -ty, w: gripWidth(g, s, a, 0) }); }
  for (let j = 0; j <= GRIP_BODY; j++) C.push({ x: -half + (2 * half * j) / GRIP_BODY, y: d, tx: 1, ty: 0, w });
  for (let i = 1; i <= GRIP_RUN; i++) { const s = (a * i) / GRIP_RUN, [x, y, tx, ty] = at(s); C.push({ x, y, tx, ty, w: gripWidth(g, s, a, 0) }); }
  return ribbon(C);
}
// Each handle's path: its shape, its geometry and the progress last painted.
const gripShapes = new Map();
function paintGrip(path) {
  const s = gripShapes.get(path); if (!s) return;
  const p = Math.min(1, Math.max(0, parseFloat(getComputedStyle(path).getPropertyValue("--grip-p")) || 0));
  if (p === s.p) return;
  s.p = p;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  path.setAttribute("d", "M " + s.shape(s.g, p).map(([x, y]) => r3(x) + " " + r3(y)).join(" L ") + " Z");
}
// Paints both; true when either moved.
function paintGrips() { let moved = false; for (const [path, s] of gripShapes) { const p0 = s.p; paintGrip(path); moved ||= s.p !== p0; } return moved; }
// The painter runs while a handle's progress is moving, and one frame past, so the last frame painted is the
// value the transition ends on.
let gripLoop = 0;
function runGrips() {
  if (gripLoop) return;
  const tick = () => { const moved = paintGrips(), running = [...gripShapes.keys()].some((p) => p.getAnimations().some((a) => a.transitionProperty === "--grip-p" && a.playState === "running")); gripLoop = running || moved ? requestAnimationFrame(tick) : 0; };
  gripLoop = requestAnimationFrame(tick);
}
// What moves the progress: its transition starting (a drag, a let-go), a sash's focus, a key or a press.
for (const type of ["transitionrun", "focusin", "focusout", "pointerdown", "pointerup", "keydown"]) addEventListener(type, runGrips, true);
// Sized and measured again whenever the input changes (a finger's handle is Apple's own size).
function drawGrips() {
  const c = $("gripC"), gc = gripGeo(panel), S = Math.ceil(gc.R + gc.L + gc.w + 2);
  c.setAttribute("width", S); c.setAttribute("height", S); c.setAttribute("viewBox", "0 " + -S + " " + S + " " + S);
  gripShapes.set(c.querySelector("path"), { shape: cornerShape, g: gc, p: null });
  const g = $("gripD"), gd = gripGeo($("dock")), W = 2 * Math.ceil(gd.len / 2 + gd.L + gd.w), H = Math.ceil(gd.d + gd.w);
  g.setAttribute("width", W); g.setAttribute("height", H); g.setAttribute("viewBox", -W / 2 + " 0 " + W + " " + H);
  gripShapes.set(g.querySelector("path"), { shape: edgeShape, g: gd, p: null });
  paintGrips();
}
drawGrips();
for (const sash of document.querySelectorAll(".sash")) {
  const edge = sash.dataset.edge, owner = sash.closest(".tool");
  sash.onpointerenter = () => { owner.dataset.edge = edge; };
  sash.onfocus = () => { owner.dataset.edge = edge; };
  sash.onpointerdown = (e) => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, w0 = panel.offsetWidth, h0 = graphOf(tab).offsetHeight, d0 = $("dock").offsetHeight, s0 = splitGraphs()[0].offsetHeight;
    sash.setPointerCapture(e.pointerId);
    owner.dataset.edge = edge; owner.dataset.resizing = edge; rootEl.dataset.resizing = edge;
    sash.onpointermove = (ev) => { if (edge === "d") setDockH(d0 - (ev.clientY - y0)); else if (edge === "s") setSplit(s0 + ev.clientY - y0); else setSize(edge.includes("w") ? w0 + x0 - ev.clientX : null, edge.includes("h") ? h0 + ev.clientY - y0 : null); };
    sash.onpointerup = sash.onpointercancel = () => { sash.onpointermove = null; delete owner.dataset.resizing; delete rootEl.dataset.resizing; relayoutAfterResize(); };
  };
  // The APG window splitter: arrows move the edge 8px, 32px with Shift; Home and End go to the floor and ceiling.
  let keyTimer = null;
  sash.onkeydown = (e) => {
    const step = e.shiftKey ? 32 : 8, w = panel.offsetWidth, h = graphOf(tab).offsetHeight, d = $("dock").offsetHeight, sp = splitGraphs()[0].offsetHeight;
    let nw = null, nh = null, nd = null, ns = null;
    if (edge === "d") { if (e.key === "ArrowUp") nd = d + step; else if (e.key === "ArrowDown") nd = d - step; else if (e.key === "Home") nd = dockFloor(); else if (e.key === "End") nd = dockCeil(); else return; }
    else if (edge === "s") { if (e.key === "ArrowDown") ns = sp + step; else if (e.key === "ArrowUp") ns = sp - step; else if (e.key === "Home") ns = splitFloor(); else if (e.key === "End") ns = splitCeil(); else return; }
    else if (edge.includes("w") && e.key === "ArrowLeft") nw = w + step;
    else if (edge.includes("w") && e.key === "ArrowRight") nw = w - step;
    else if (edge.includes("h") && e.key === "ArrowDown") nh = h + step;
    else if (edge.includes("h") && e.key === "ArrowUp") nh = h - step;
    else if (e.key === "Home") { if (edge.includes("w")) nw = widthFloor(); if (edge.includes("h")) nh = graphFloor(); }
    else if (e.key === "End") { if (edge.includes("w")) nw = widthCeil(); if (edge.includes("h")) nh = graphCeil(); }
    else return;
    e.preventDefault();
    owner.dataset.edge = edge; owner.dataset.resizing = edge;
    if (nd !== null) setDockH(nd); else if (ns !== null) setSplit(ns); else setSize(nw, nh);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => { delete owner.dataset.resizing; relayoutAfterResize(); }, ms("--dur-control"));
  };
}

// ---- Zoom and pan: the toolbar's group drives the shown graph; each section's its own ----
$("zoomIn").onclick = () => setZoom(tab, G[tab].zoom * 1.2);
$("zoomOut").onclick = () => setZoom(tab, G[tab].zoom / 1.2);
$("zoomFit").onclick = () => fitZoom(tab);
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
    if (e.pointerType === "touch" || e.target.closest(".node, .secstrip")) return;
    const x0 = e.clientX, y0 = e.clientY, sl = g.scrollLeft, st = g.scrollTop;
    g.setPointerCapture(e.pointerId); g.classList.add("panning");
    g.onpointermove = (ev) => { g.scrollLeft = sl - (ev.clientX - x0); g.scrollTop = st - (ev.clientY - y0); };
    g.onpointerup = () => { g.onpointermove = null; g.classList.remove("panning"); };
  });
}

// ---- Hide and Show ----
// At a desk Hide takes the panel and the dock away; the side sheet folds to its edge tab; the drawer
// drops to its head.
// The pill Hide becomes, as a clip of the panel's border box: the button's own box, grown from its end by the
// eye, the gap and "Show graph" (pin 29). Read from the button as it stands, so it holds at any panel size.
function pillClip() {
  const b = $("hide"), pb = panel.getBoundingClientRect(), r = b.getBoundingClientRect();
  const w = 2 * px("--space-3") + px("--icon-md") + px("--space-2") + b.querySelector(".show-label").scrollWidth + 2;
  const top = r.top - pb.top, right = pb.right - r.right, bottom = pb.bottom - r.bottom, left = Math.max(0, r.right - w - pb.left);
  return "inset(" + [top, right, bottom, left].map((v) => Math.round(v * 100) / 100 + "px").join(" ") + " round " + tok("--radius-md") + ")";
}
function setOpen(open) {
  if (layoutIs("drawer")) { setStop(open ? "peek" : "head"); return; }
  if (!open && layoutIs("desk")) panel.style.setProperty("--pill-clip", pillClip());
  panel.dataset.open = String(open);
  rootEl.dataset.tools = open ? "open" : "hidden";
  const hide = $("hide"), label = open ? "Hide graph" : "Show graph";
  hide.setAttribute("aria-label", label); hide.dataset.tip = label + " (H)"; hide.setAttribute("aria-expanded", String(open));
  $("show").hidden = open || layoutIs("desk");
  if (!open) closePop(true);
  buildDock();
  if (open && layoutIs("sheet")) { if (face === "graph") { drawGraph(); mark(); showKept(); } else buildDock(); }
  if (open && layoutIs("desk")) { for (const c of shownComps()) drawGraph(c.id); mark(); for (const c of shownComps()) showKept(c.id); placeSplit(); }
}
const toolsOpen = () => (layoutIs("drawer") ? stop !== "head" : panelOpen());
// At a desk the one button toggles: Hide folds the panel into it, Show opens it back out; its focus stays.
$("hide").onclick = () => { if (layoutIs("desk")) { setOpen(!panelOpen()); return; } setOpen(false); $("show").focus(); };
$("sheetHide").onclick = () => { setOpen(false); $("show").focus(); };
$("show").onclick = () => { setOpen(true); (layoutIs("sheet") ? $("sheetHide") : $("hide")).focus(); };

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
  if (e.key === "Escape" && pop && !menu) { e.preventDefault(); closeAndFocusBar(); return; }
  if ((e.key === "h" || e.key === "H") && !e.altKey) { setOpen(!toolsOpen()); return; }
  if (!km || !tl) return;
  if (e.key === " " && !(document.activeElement && (document.activeElement.tagName === "BUTTON" || (document.activeElement.closest && document.activeElement.closest(".panel, .pop, .menu, .show"))))) { e.preventDefault(); playing ? stopPlay() : play(); }
  else if (e.key === "Home" && !e.target.closest(".sash")) { stopPlayKeepTime(); time = 0; drawStage(); updateTime(); }
  else if (e.key === "End" && !e.target.closest(".sash")) { stopPlayKeepTime(); time = null; drawStage(); updateTime(); }
  else if (e.key === "," || e.key === ".") { stopPlayKeepTime(); const len = playLengthOf(km.r); time = clamp((time ?? lengthOf(km.r)) + (e.key === "." ? 10 : -10), 0, len); drawStage(); updateTime(); }
});

new ResizeObserver(() => sizeDockRoom()).observe($("dock"));
// A new size can be a new class: its layout is set first, then everything draws at it. A dragged dock height
// stays inside the new room; the drawer's stop is re-measured on the new height.
function onResize() {
  if (applyScreen()) { closePop(true); stopPlay(); if (layoutIs("desk")) $("tools").dataset.face = face = "graph"; drawGrips(); }
  if (layoutIs("drawer")) setStop(stop);
  if (layoutIs("desk") && rootEl.style.getPropertyValue("--dock-h")) setDockH(parseFloat(rootEl.style.getPropertyValue("--dock-h")));
  if (layoutIs("drawer")) panel.dataset.open = "true";
  rootEl.dataset.tools = panelOpen() ? "open" : "hidden";
  $("show").hidden = panelOpen() || layoutIs("desk");
  if (!panelOpen() && layoutIs("desk")) panel.style.setProperty("--pill-clip", pillClip());
  render();
}
addEventListener("resize", onResize);
rootEl.dataset.tools = "open";
if (layoutIs("drawer")) setStop("peek");
setFace("graph");

// ---- The handle's demo (round 28) ----
// #demo=corner or #demo=dock (with &theme=dark for the night) plays the handle on this page's own elements on
// a loop for handle-demo.html, which shows it cropped at 1:1: at rest, the pointer arrives (data-pointing, the
// hover's own rule), a drag wider (the real data-resizing and the real setSize/setDockH), let go. The first
// real pointer on the page stops it where it is, and the page is the person's.
const demoOf = location.hash.match(/demo=(corner|dock)/);
if (demoOf) {
  const which = demoOf[1];
  rootEl.style.colorScheme = /theme=dark/.test(location.hash) ? "dark" : "light";
  // The dock stands once a state is kept: keep the first one, as a press on it would.
  if (which === "dock") { const n = document.querySelector(".node:not(.kept)"); if (n) n.click(); }
  const owner = which === "corner" ? panel : $("dock");
  let on = true, timer = null;
  const anchor = () => { const b = owner.getBoundingClientRect(); return which === "corner" ? { x: b.left, y: b.bottom } : { x: b.left + b.width / 2, y: b.top }; };
  const say = (step) => parent.postMessage({ demo: which, step, ...anchor() }, "*");
  const tween = (dur, set) => new Promise((done) => { let t0 = null; const go = (now) => { t0 ??= now; const k = Math.min(1, (now - t0) / dur); set(1 - (1 - k) ** 3); if (k < 1 && on) requestAnimationFrame(go); else done(); }; requestAnimationFrame(go); });
  const w0 = panel.offsetWidth, h0 = graphOf(tab).offsetHeight, d0 = () => $("dock").offsetHeight;
  let dock0 = null;
  const steps = [
    ["rest", 1200, () => {}],
    ["pointing", 1000, () => { owner.dataset.pointing = ""; }],
    ["drag", 1300, () => {
      if (which === "corner") { panel.dataset.resizing = rootEl.dataset.resizing = "wh"; tween(800, (e) => setSize(w0 + 40 * e, h0 + 30 * e)); }
      else { dock0 ??= d0(); $("dock").dataset.resizing = rootEl.dataset.resizing = "d"; tween(800, (e) => setDockH(dock0 + 40 * e)); }
    }],
    // Let go with the pointer still on the grip: the highlight runs back into the handle, still bright.
    ["release", 1400, () => { delete owner.dataset.resizing; delete rootEl.dataset.resizing; }],
    // The pointer leaves; the handle settles to its rest ink as the size goes back for the next loop.
    ["reset", 700, () => { delete owner.dataset.pointing; if (which === "corner") tween(500, (e) => setSize(w0 + 40 * (1 - e), h0 + 30 * (1 - e))); else tween(500, (e) => setDockH(dock0 + 40 * (1 - e))); }],
  ];
  let i = 0;
  const next = () => { if (!on) return; const [k, ms_, fn] = steps[i]; fn(); say(k); i = (i + 1) % steps.length; timer = setTimeout(next, ms_); };
  setTimeout(next, 300);
  addEventListener("pointerover", () => {
    if (!on) return;
    on = false; clearTimeout(timer);
    delete owner.dataset.pointing; delete owner.dataset.resizing; delete rootEl.dataset.resizing;
    if (which === "corner") setSize(w0, h0); else if (dock0) setDockH(dock0);
    relayoutAfterResize(); say("yours");
  }, { once: true });
}
render();
document.fonts.ready.then(() => { if (layoutIs("drawer")) setStop(stop); render(); });
