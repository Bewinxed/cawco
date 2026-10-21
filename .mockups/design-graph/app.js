// The design graph, round 21: the component on the page, its state machines as one graph in the panel, and
// the kept move's choreography in the dock, editable.

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
let tab = "form";
const views = { form: startAt(components[0], "save", "failed"), row: startAt(components[1], "runs", "failed") };
let peek = null;
let time = null; // the playhead in ms; null is the end of the move
let playing = null, looping = false, scrubbing = false;
const $ = (id) => document.getElementById(id);
const comp = () => components.find((c) => c.id === tab);
const machineOf = (c, id) => c.machines.find((m) => m.id === id);
const stateOf = (m, id) => m.states.find((s) => s.id === id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = () => matchMedia("(width < 640px)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

// ---- The page ----
function drawStage() {
  const c = comp(), v = views[tab];
  const top = peek ? peek.machine : v.last;
  const cur = peek ? { ...v.cur, [peek.machine]: { state: peek.state, vary: peek.vary } } : v.cur;
  const km = !peek ? keptMove() : null;
  const into = !peek ? moveInto(c, top, cur[top].state) : null;
  const r = km ? km.r : {};
  const total = km ? playLengthOf(r) : 0;
  const t = time === null ? total : time;
  const p = (key) => (r[key] ? (t <= r[key].start ? 0 : t >= r[key].tail ? 1 : r[key].fn(Math.min(t - r[key].start, Math.max(r[key].dur, r[key].tail - r[key].start)))) : 1);
  const clipOf = (key) => (km ? km.clips.find((x) => x.key === key) : null);
  const val = (key, fallback) => { const cl = clipOf(key); return cl && cl.from != null ? cl.from + (cl.to - cl.from) * p(key) : fallback; };
  const fromF = into ? fieldsOf(c, { ...cur, [top]: { state: into.from, vary: 0 } }, top) : null;
  const f = fieldsOf(c, cur, top);
  applyStage(c.id === "form" ? formHtml(f, fromF, p, val) : rowHtml(f, fromF, p));
  if (peek) drawWashes(); else clearWashes();
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
let drewFrame = false;
function applyStage(html) {
  const stage = $("stage"), next = document.createElement("div");
  const afterFrame = drewFrame; drewFrame = time !== null;
  next.innerHTML = html;
  const keys = (root) => [...root.querySelectorAll("[data-key]")].map((e) => e.dataset.key).join("|");
  const k = keys(next);
  if (time === null && !afterFrame && k && keys(stage) === k) {
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
function formHtml(f, from, p, val) {
  const outK = p("formOut"), inK = p("doneIn");
  if (f.created && (!from || (outK >= 1 && inK >= 1))) return doneCard;
  if (f.created) return '<div style="display:grid"><div style="grid-area:1/1;opacity:' + (1 - outK) + '">' + formHtml(from, null, () => 1, (k, d) => d) + '</div><div style="grid-area:1/1;align-self:start;opacity:' + inK + '">' + doneCard + "</div></div>";
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
  const label = time === null || !from ? soft(f.primary) : crossfade(from.primary, f.primary, p("label"));
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
function rowHtml(f, from, p) {
  const others = '<div class="rrow"><b>Weekly milestone check</b><span class="rmeta">Mondays at 10:00</span><span class="rstatus muted">Next run Monday 10:00</span><span class="ractions"><span class="btn">Run now</span></span></div>';
  const dotK = from && from.kind !== "live" && f.kind === "live" ? p("dot") : from && from.kind === "live" && f.kind !== "live" ? 1 - p("dotOut") : f.kind === "live" ? 1 : 0;
  const status = time === null || !from ? soft(f.status) : crossfade(from.status, f.status, p("fade"));
  const dim = from && from.dim !== f.dim ? (f.dim ? 1 - 0.55 * p("dim") : 0.45 + 0.55 * p("dim")) : f.dim ? 0.45 : 1;
  const dot = '<span class="dot" data-sync="dot" style="inline-size:calc(var(--c-block-drop-dot) * ' + dotK + ");margin-inline-end:calc(var(--space-2) * " + dotK + ");opacity:" + dotK + '"></span>';
  return '<div class="rlist"><div class="rrow" data-sync="row" style="opacity:' + dim + '"><b>' + esc(f.name) + '</b><span class="rmeta">' + esc(f.schedule) + '</span><span class="rstatus ' + (f.kind === "live" ? "" : f.kind) + '" data-key="status" data-val="' + esc(f.status + "|" + f.kind) + '">' + dot + status + '</span><span class="ractions"><span class="btn" data-key="actions" data-val="' + esc(f.actions.join(" · ")) + '">' + soft(f.actions.join(" · ")) + "</span></span></div>" + others + "</div>";
}

// ---- Change marks: a wash over what a hover would change on the page (clarity §3 B) ----
let keptSnap = null;
function snapStage() {
  const wrap = $("stage").getBoundingClientRect(), out = new Map();
  for (const el of $("stage").querySelectorAll("[data-key]")) {
    const b = el.getBoundingClientRect();
    out.set(el.dataset.key, { val: el.dataset.val ?? el.textContent, cls: el.className, box: { x: b.left - wrap.left, y: b.top - wrap.top, w: b.width, h: b.height }, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 });
  }
  return out;
}
function clearWashes() { $("marks").replaceChildren(); }
function drawWashes() {
  if (!keptSnap) return;
  const now = snapStage(), out = [];
  for (const [k, n] of now) { const o = keptSnap.get(k); if (!o || o.val !== n.val || o.cls !== n.cls) out.push(["add", n, k]); }
  for (const [k, o] of keptSnap) if (!now.has(k)) out.push(["del", o, k]);
  const pad = px("--space-1");
  $("marks").replaceChildren(...out.map(([kind, n, key]) => {
    const w = document.createElement("div");
    w.className = "wash " + kind; w.dataset.wash = kind; w.dataset.of = key;
    Object.assign(w.style, { left: n.box.x - pad + "px", top: n.box.y - pad + "px", width: n.box.w + 2 * pad + "px", height: n.box.h + 2 * pad + "px", borderRadius: n.radius + pad + "px" });
    return w;
  }));
  void $("marks").offsetWidth;
  for (const w of $("marks").children) w.classList.add("in");
}

// ---- The graph, laid out by dagre ----
function layout(items, edges, rankdir, margin, extra) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 22, ranksep: 46, edgesep: 12, marginx: margin, marginy: margin, ...extra });
  g.setDefaultEdgeLabel(() => ({}));
  for (const it of items) g.setNode(it.id, { width: it.w, height: it.h });
  for (const [a, b, label, hidden] of edges) g.setEdge(a, b, hidden ? { hidden } : label ? { label, width: label.length * 6 + 6, height: 14, labelpos: "c" } : {});
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
function edgesSvg(g, id) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", g.graph().width); svg.setAttribute("height", g.graph().height);
  svg.innerHTML = '<defs><marker id="' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" style="fill: var(--border-contrast)"/></marker><marker id="' + id + '-kept" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" style="fill: var(--brand-solid)"/></marker></defs>';
  for (const e of g.edges()) {
    const ed = g.edge(e);
    if (ed.hidden) continue;
    const pl = document.createElementNS(SVGNS, "polyline");
    pl.setAttribute("points", ed.points.map((q) => q.x + "," + q.y).join(" ")); pl.setAttribute("marker-end", "url(#" + id + ")");
    pl.dataset.from = e.v; pl.dataset.to = e.w; pl.dataset.marker = id;
    if (ed.label === "Try again" || ed.label === "Run again" || ed.label === "Resume") pl.classList.add("dash");
    svg.append(pl);
    if (ed.label) { const tx = document.createElementNS(SVGNS, "text"); tx.setAttribute("x", ed.x - ed.width / 2 + 3); tx.setAttribute("y", ed.y + 4); tx.textContent = ed.label; svg.append(tx); }
  }
  return svg;
}
const varyOf = (machine, state) => { const k = views[tab].cur[machine]; return k.state === state ? k.vary : 0; };
const hoverMatters = (machine, state, vary) => { const k = views[tab].cur[machine]; return !(k.state === state && k.vary === vary); };
function stateNode(m, it) {
  const b = document.createElement("div"); b.className = "node"; b.dataset.machine = m.id; b.dataset.state = it.id;
  b.setAttribute("role", "button"); b.tabIndex = 0;
  const t = document.createElement("b"); t.textContent = it.name; b.append(t);
  const d = document.createElement("p"); d.textContent = it.note; b.append(d);
  const enter = (vary) => { if (!hoverMatters(m.id, it.id, vary)) { if (peek) { peek = null; drawStage(); mark(); } return; } peek = { machine: m.id, state: it.id, vary }; drawStage(); mark(); };
  b.onmouseenter = () => enter(varyOf(m.id, it.id));
  b.onmouseleave = () => { peek = null; drawStage(); mark(); };
  b.onclick = () => keep(m.id, it.id, varyOf(m.id, it.id));
  b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); keep(m.id, it.id, varyOf(m.id, it.id)); } };
  if (it.vars) {
    const list = document.createElement("div"); list.className = "vars";
    it.vars.forEach((vv, i) => {
      const ch = document.createElement("button"); ch.className = "var"; ch.dataset.machine = m.id; ch.dataset.state = it.id; ch.dataset.vary = i; ch.textContent = vv.name;
      ch.onmouseenter = () => enter(i);
      ch.onclick = (e) => { e.stopPropagation(); keep(m.id, it.id, i); };
      list.append(ch);
    });
    b.append(list);
  }
  return b;
}
let zoom = 1, gw = 0, gh = 0;
function drawGraph() {
  const c = comp(), graph = $("graph");
  graph.innerHTML = "";
  const zoomer = document.createElement("div"); zoomer.className = "zoomer";
  const world = document.createElement("div"); world.className = "world";
  zoomer.append(world); graph.append(zoomer);
  const margin = 10, room = graph.clientWidth - 2 * margin;
  // Two states side by side, the gap between them and their region's edges fit the graph's width, so the
  // graph never opens with a state cut at its side (168px where there is room, 120px at least).
  const chrome = 2 * (px("--space-2") + 1);
  world.style.setProperty("--node-w", clamp(Math.floor((room - chrome - 22) / 2), 120, 168) + "px");
  const regions = {};
  c.machines.forEach((m, n) => {
    const r = document.createElement("section"); r.className = "region"; r.setAttribute("aria-label", m.name); r.dataset.machine = m.id;
    const name = document.createElement("p"); name.className = "region-name"; name.textContent = m.name;
    const body = document.createElement("div"); body.className = "regionBody";
    r.append(name, body); world.append(r);
    const chrome = r.offsetWidth;
    const els = {};
    for (const it of m.states) { const b = stateNode(m, it); body.append(b); els[it.id] = b; }
    const g = fitLayout(m.states.map((it) => ({ id: it.id, w: els[it.id].offsetWidth, h: els[it.id].offsetHeight })), m.edges, room - chrome, 0, { align: "UL" });
    body.style.width = g.graph().width + "px"; body.style.height = g.graph().height + "px";
    for (const id of g.nodes()) { const p = g.node(id); els[id].style.left = p.x - p.width / 2 + "px"; els[id].style.top = p.y - p.height / 2 + "px"; }
    body.prepend(edgesSvg(g, "arrow-" + n));
    regions[m.id] = r;
  });
  const sized = c.machines.map((m) => ({ id: m.id, w: regions[m.id].offsetWidth, h: regions[m.id].offsetHeight }));
  let outer = fitLayout(sized, c.machineEdges, room + 2 * margin, margin, { align: "UL" });
  if (outer.graph().width > room + 2 * margin) {
    const order = moveOrder(c), chain = [];
    for (let i = 1; i < order.length; i++) if (!c.machineEdges.some(([a, b]) => a === order[i - 1] && b === order[i])) chain.push([order[i - 1], order[i], null, true]);
    outer = layout(sized, c.machineEdges.concat(chain), "TB", margin, { align: "UL", nodesep: 8, edgesep: 4 });
  }
  for (const id of outer.nodes()) { const p = outer.node(id); regions[id].style.left = p.x - p.width / 2 + "px"; regions[id].style.top = p.y - p.height / 2 + "px"; }
  world.prepend(edgesSvg(outer, "arrow-machines"));
  const points = outer.edges().flatMap((e) => (outer.edge(e).hidden ? [] : outer.edge(e).points));
  gw = Math.max(outer.graph().width, ...points.map((q) => q.x + margin));
  gh = Math.max(outer.graph().height, ...points.map((q) => q.y + margin));
  world.style.width = gw + "px"; world.style.height = gh + "px";
  applyZoom();
}
function applyZoom() {
  const zoomer = $("graph").querySelector(".zoomer");
  zoomer.style.width = gw * zoom + "px"; zoomer.style.height = gh * zoom + "px";
  zoomer.firstChild.style.transform = "scale(" + zoom + ")";
  $("zoomLevel").textContent = Math.round(zoom * 100) + "%";
}
const setZoom = (z) => { zoom = clamp(z, 0.25, 1.6); applyZoom(); };
const fitZoom = () => { const g = $("graph"); zoom = clamp(Math.min((g.clientWidth - 8) / gw, (g.clientHeight - 8) / gh), 0.25, 1); applyZoom(); };
// The kept state brought into view, with its from-node above it when there is room.
function showKept() {
  const v = views[tab], g = $("graph");
  const el = g.querySelector('.node[data-machine="' + v.last + '"][data-state="' + v.cur[v.last].state + '"]');
  if (!el) return;
  const into = moveInto(comp(), v.last, v.cur[v.last].state);
  const fromEl = into ? g.querySelector('.node[data-machine="' + v.last + '"][data-state="' + into.from + '"]') : null;
  const box = g.getBoundingClientRect(), n = el.getBoundingClientRect(), r = el.closest(".region").getBoundingClientRect();
  const at = (y) => y - box.top - g.clientTop + g.scrollTop, pad = px("--space-2");
  const topWant = Math.min(at(r.top) - pad, fromEl ? at(fromEl.getBoundingClientRect().top) - pad : Infinity, at(n.top) - pad);
  const want = Math.max(at(n.bottom) + pad - g.clientHeight, topWant);
  // Where the view's edges would cut a state or a machine's name, the nearest scroll that cuts none and still
  // shows the kept state whole.
  const H = g.clientHeight;
  let max = g.scrollHeight - H;
  const boxes = [...g.querySelectorAll(".node, .region-name")].map((el) => { const b = el.getBoundingClientRect(); return [at(b.top), at(b.bottom)]; });
  const cuts = (s) => boxes.some(([t, b]) => (t < s - 0.5 && b > s + 0.5) || (t < s + H - 0.5 && b > s + H + 0.5));
  const keeps = (s) => at(n.top) >= s - 0.5 && at(n.bottom) <= s + H + 0.5;
  const cands = [want, 0, max];
  for (const [t, b] of boxes) cands.push(t - pad, t, b + pad - H, b - H, b + pad, t - pad - H + (b - t));
  // Scroll offsets land on whole pixels, so each candidate is tried rounded down and up.
  const pick = (limit) => cands.flatMap((s) => [Math.floor(s), Math.ceil(s)]).map((s) => clamp(s, 0, Math.max(0, Math.floor(limit)))).filter((s) => !cuts(s) && keeps(s)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
  let best = pick(max);
  // Where no view of the content as drawn shows the kept state whole and cuts nothing, the well gets room
  // past its last machine, so the view can open lower.
  if (best === undefined) {
    best = pick(Infinity);
    if (best !== undefined && best > max) { const tail = document.createElement("div"); tail.className = "graph-tail"; tail.style.blockSize = Math.ceil(best - max) + "px"; g.append(tail); max = g.scrollHeight - H; }
  }
  g.scrollTop = best ?? want;
  g.scrollLeft += n.left + n.width / 2 - (box.left + box.width / 2);
}
// Three tiers: the kept state (coral), every other machine's current state, and the rest.
function mark() {
  const v = views[tab];
  const peeked = (el) => !!peek && peek.machine === el.dataset.machine && peek.state === el.dataset.state;
  const kept = (el) => el.dataset.machine === v.last && v.cur[v.last].state === el.dataset.state;
  document.querySelectorAll(".node").forEach((el) => {
    const on = v.cur[el.dataset.machine].state === el.dataset.state;
    el.classList.toggle("kept", on && kept(el)); el.classList.toggle("cur", on && !kept(el)); el.classList.toggle("peek", peeked(el));
    el.setAttribute("aria-current", on ? "true" : "false");
  });
  document.querySelectorAll(".var").forEach((el) => {
    const k = v.cur[el.dataset.machine], i = +el.dataset.vary, on = k.state === el.dataset.state && k.vary === i;
    el.classList.toggle("kept", on && el.dataset.machine === v.last); el.classList.toggle("cur", on && el.dataset.machine !== v.last);
    el.classList.toggle("peek", peeked(el) && peek.vary === i);
  });
  // The lit edge: the edge into the kept state, drawn last, in coral. Edges between machines never light.
  const into = moveInto(comp(), v.last, v.cur[v.last].state);
  document.querySelectorAll(".region polyline").forEach((pl) => {
    const lit = !!into && pl.closest(".region").dataset.machine === v.last && pl.dataset.from === into.from && pl.dataset.to === v.cur[v.last].state;
    pl.classList.toggle("kept", lit);
    pl.setAttribute("marker-end", "url(#" + pl.dataset.marker + (lit ? "-kept" : "") + ")");
    if (lit) pl.parentNode.append(pl);
  });
  document.querySelectorAll(".disc").forEach((d) => d.remove());
  updateDisc();
}
// The disc rides the lit edge with the dock's playhead, one to one; shown while playing or scrubbing.
function updateDisc() {
  const pl = document.querySelector(".region polyline.kept");
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
function keep(machine, state, vary) {
  const v = views[tab]; v.cur[machine] = { state, vary }; v.last = machine; peek = null; time = null; stopPlay();
  closePop();
  drawStage(); keptSnap = snapStage(); mark(); buildDock(); showKept();
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
// The readouts: the Badge, a token's name then its value, or the value alone with the dashed free edge.
function lengthBadge(c, cls = "") {
  return typeof c.dur === "string" ? '<span class="badge ' + cls + '"><code>' + c.dur + "</code> " + fmtMs(ms(c.dur)) + "</span>" : '<span class="badge free ' + cls + '">' + fmtMs(c.dur) + "</span>";
}
function curveBadge(c, cls = "") {
  if (isSpring(c.ease)) return '<span class="badge ' + cls + '">' + glyph(c.ease) + "<code>spring</code> " + c.ease.spring.bounce + "</span>";
  if (Array.isArray(c.ease)) return '<span class="badge free ' + cls + '">' + glyph(c.ease) + curveName(c.ease) + "</span>";
  return '<span class="badge ' + cls + '">' + glyph(c.ease) + "<code>" + c.ease + "</code></span>";
}
// Values take a line of their own, so a row's height never turns on how wide its other readouts are.
function valuesBadge(c, cls = "") { return c.from != null ? '<span class="readouts-break" aria-hidden="true"></span><span class="badge values ' + cls + '"><code>' + c.prop + "</code> " + c.from + " → " + c.to + " " + (c.unit || "") + "</span>" : ""; }
function readoutsHtml(e, c) {
  const o = e.orig.find((x) => x.key === c.key);
  const ch = (a, b) => (same(a, b) ? "" : "changed");
  return lengthBadge(c, ch(c.dur, o.dur)) + curveBadge(c, ch(c.ease, o.ease)) + valuesBadge(c, ch([c.from, c.to], [o.from, o.to]));
}
const anchorWords = (e, c) => (c.at.ref ? c.at.ref + " " + e.cur.concat(e.orig).find((x) => x.key === c.at.of).of : "");
function buildDock() {
  const dock = $("dock"), km = keptMove();
  if (!km) { dock.dataset.open = "false"; tl = null; placeDock(); return; }
  dock.dataset.open = String(panelOpen());
  dock.dataset.view = km.e.view;
  const m = machineOf(km.c, views[tab].last);
  const title = stateOf(m, km.into.from).name + " → " + stateOf(m, views[tab].cur[views[tab].last].state).name;
  const n = editCount(km.e);
  const edited = n > 0;
  let html = '<header class="dock-head"><h2 class="dock-title">' + esc(title) + "</h2>";
  html += '<div class="edits">';
  if (edited) html += '<div class="t-tabs" id="compare" role="tablist" aria-label="Compare"><span class="t-tabs-pill" aria-hidden="true"></span><button class="t-tab" role="tab" data-view="original">Original</button><button class="t-tab" role="tab" data-view="edited">Edited</button></div><span class="badge">' + n + (n === 1 ? " edit" : " edits") + '</span><button class="ghost-btn" id="resetAll">Reset</button>';
  html += "</div></header>";
  html += '<div class="tl" id="tl"><div class="end-area" id="endArea"></div>';
  html += '<div class="tl-row ruler-row"><div class="transport"><button class="tbtn" id="play" aria-label="Play">' + icon(ICON.play, "i-play") + icon(ICON.pause, "i-pause") + '</button><button class="tbtn" id="loop" aria-label="Loop" aria-pressed="' + looping + '">' + icon(ICON.loop) + '</button><span class="readout" id="readout"></span></div><div class="ruler" id="ruler"></div></div>';
  html += '<div class="rows" id="rows">' + km.clips.map((c) => '<div class="tl-row clip" data-key="' + c.key + '"><div class="clip-name"><p>' + esc(c.of) + " <span>" + esc(c.does) + '</span></p><div class="readouts">' + readoutsHtml(km.e, c) + '</div></div><div class="lane" data-key="' + c.key + '"><div class="ghost" hidden></div><div class="bar" role="button" tabindex="0" aria-pressed="false" data-key="' + c.key + '" aria-label="' + esc(c.of + " " + c.does) + '"' + (c.at.ref ? ' data-tip="' + esc(anchorWords(km.e, c)) + '"' : "") + '></div><div class="tail" hidden></div></div></div>').join("") + "</div>";
  html += '<div id="ties"></div><div class="playhead" id="playhead"></div></div>';
  dock.innerHTML = html;
  tl = { km };
  if (edited) { for (const b of dock.querySelectorAll("#compare .t-tab")) { b.setAttribute("aria-selected", String(b.dataset.view === km.e.view)); b.onclick = () => setView(b.dataset.view); } requestAnimationFrame(() => slidePill($("compare"), false)); $("resetAll").onclick = () => { if (commit(km.e, km.e.orig)) afterEdit(km, { replay: true }); }; }
  $("play").onclick = () => (playing ? stopPlay() : play());
  $("loop").onclick = () => { looping = !looping; $("loop").setAttribute("aria-pressed", String(looping)); if (looping && !playing) play(); };
  wireDock(km);
  layoutDock();
  placeDock();
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
function setView(view) {
  const km = keptMove();
  if (!km || km.e.view === view) return;
  km.e.view = view;
  closePop();
  km.e.sel.clear();
  $("dock").dataset.view = view;
  for (const b of $("dock").querySelectorAll("#compare .t-tab")) b.setAttribute("aria-selected", String(b.dataset.view === view));
  slidePill($("compare"), !reduced());
  tl.km = keptMove();
  layoutDock();
  play();
}
// Geometry: the lanes' x from time, from the first lane's box.
function laneGeo() {
  const lane = $("rows").querySelector(".lane"), tlb = $("tl").getBoundingClientRect(), lb = lane.getBoundingClientRect();
  return { x0: lb.left - tlb.left, w: lb.width, end: rulerEndOf(tl.km) };
}
const xOf = (g, t) => g.x0 + (g.w * t) / g.end;
function layoutDock(work) {
  if (!tl) return;
  const km = keptMove(); tl.km = km;
  const clips = work || km.clips, r = resolve(clips), e = km.e, g = laneGeo();
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
    if (!tail.hidden) { const r5 = px("--radius-xs"); tail.style.left = (g.w * x.end) / g.end - r5 + "px"; tail.style.width = Math.min(g.w - (g.w * x.end) / g.end, (g.w * (x.tail - x.end)) / g.end) + r5 + "px"; }
  }
  // The move's end: one area behind every row and the ruler, from the move's end to the ruler's end.
  const total = lengthOf(r), endX = xOf(g, total);
  const area = $("endArea");
  area.style.left = endX + "px";
  $("dock").querySelector(".ruler-row").style.background = "linear-gradient(to right, var(--surface-raised) " + endX + "px, var(--surface-recess-deep) 0)";
  // The ruler: round times, every 100ms (50 under 300), mono, to the ruler's end.
  const step = total < 300 ? 50 : 100, ruler = $("ruler");
  const marks = [];
  for (let t = 0; t <= g.end + 0.5; t += step) marks.push(t);
  ruler.innerHTML = marks.map((t) => '<span data-t="' + t + '">' + t + '</span><i style="left:' + (g.w * t) / g.end + 'px"></i>').join("");
  for (const s of ruler.querySelectorAll("span")) { const t = +s.dataset.t, w = s.offsetWidth, x = (g.w * t) / g.end; s.style.left = clamp(x - w / 2, 0, g.w - w) + "px"; }
  drawTies(clips, r, g);
  updateTime();
}
// An anchored start draws its tie: a hairline from the anchor's edge to this bar's start, a foot at each end.
function drawTies(clips, r, g) {
  const tlb = $("tl").getBoundingClientRect(), html = [];
  for (const c of clips) {
    if (!c.at.ref) continue;
    const a = r[c.at.of], me = r[c.key];
    const aBar = $("rows").querySelector('.bar[data-key="' + c.at.of + '"]').getBoundingClientRect();
    const mBar = $("rows").querySelector('.bar[data-key="' + c.key + '"]').getBoundingClientRect();
    const ax = xOf(g, c.at.ref === "after" ? a.end : a.start), mx = xOf(g, me.start);
    const y0 = aBar.top < mBar.top ? aBar.bottom - tlb.top : mBar.bottom - tlb.top;
    const y1 = aBar.top < mBar.top ? mBar.top - tlb.top : aBar.top - tlb.top;
    html.push('<div class="tie" data-for="' + c.key + '" style="left:' + Math.round(ax) + "px;top:" + Math.min(y0, y1) + "px;height:" + Math.abs(y1 - y0) + 'px"></div>');
    if (Math.abs(mx - ax) >= 1) html.push('<div class="tie" style="left:' + Math.min(ax, mx) + "px;top:" + (y1 - 1) + "px;height:1px;width:" + Math.abs(mx - ax) + 'px"></div>');
  }
  $("ties").innerHTML = html.join("");
}
function updateTime() {
  if (!tl || !$("playhead")) return;
  const km = tl.km, r = km.r, total = playLengthOf(r), len = lengthOf(r), g = laneGeo();
  const t = time === null ? len : Math.min(time, total);
  $("playhead").style.left = xOf(g, Math.min(t, g.end)) + "px";
  const rb = $("ruler").getBoundingClientRect(), tb = $("tl").getBoundingClientRect();
  $("playhead").style.setProperty("--ph-y", rb.bottom - tb.top - px("--space-1") / 2 + "px");
  $("readout").innerHTML = "<b>" + Math.round(t) + "</b> / " + Math.round(len) + " ms";
  $("play").toggleAttribute("data-playing", !!playing);
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  updateDisc();
}
function placeDock() {
  const dock = $("dock"), wrap = document.querySelector(".stage-wrap");
  const open = dock.dataset.open === "true" && !phone();
  const need = px("--space-8") + wrap.offsetHeight + px("--space-5") + dock.offsetHeight + 2 * px("--space-5");
  rootEl.toggleAttribute("data-stack", open && need > innerHeight);
  sizeDockRoom();
}
function sizeDockRoom() {
  const dock = $("dock"), open = dock.dataset.open === "true" && !phone() && !rootEl.hasAttribute("data-stack");
  rootEl.style.setProperty("--dock-room", open ? dock.offsetHeight + 2 * px("--space-5") + "px" : "0px");
}
// Playback: the page plays the move from 0, once, or on a loop. A committed edit replays it once.
function play() {
  const km = keptMove();
  if (!km) return;
  stopPlay();
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
  for (const name of rows.querySelectorAll(".clip-name")) name.onclick = (e) => { const bar = name.parentNode.querySelector(".bar"); barClick(bar.dataset.key, e, "pointer"); };
  for (const bar of rows.querySelectorAll(".bar")) {
    bar.onpointermove = (e) => { if (bar.dataset.dragging || km.e.view === "original") return; const b = bar.getBoundingClientRect(), z = px("--bar-handle-zone"); const zone = e.clientX - b.left < z ? "start" : b.right - e.clientX < z ? "end" : ""; if (zone) bar.dataset.zone = zone; else delete bar.dataset.zone; };
    bar.onpointerleave = () => { delete bar.dataset.zone; };
    bar.onpointerdown = (e) => barDown(bar, e);
    bar.onkeydown = (e) => barKey(bar, e);
  }
  // Empty lane space selects: a marquee.
  for (const lane of rows.querySelectorAll(".lane")) lane.onpointerdown = (e) => { if (e.target.classList.contains("bar") || tl.km.e.view === "original") return; marquee(e); };
}
function stopPlayKeepTime() { if (playing) { cancelAnimationFrame(playing); playing = null; } }
function barClick(key, e, origin) {
  const km = keptMove();
  if (km.e.view === "original") return;
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    if (e.metaKey || e.ctrlKey) { if (km.e.sel.has(key)) km.e.sel.delete(key); else km.e.sel.add(key); } else km.e.sel.add(key);
    closePop(); layoutDock(); return;
  }
  km.e.sel = new Set([key]);
  layoutDock();
  openPop(key, origin);
}
function barDown(bar, e) {
  const km = keptMove();
  if (km.e.view === "original" || e.button !== 0) return;
  const key = bar.dataset.key, zone = bar.dataset.zone || "body", x0 = e.clientX, g = laneGeo();
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
          ticks.innerHTML = lens.filter((l) => s0.start + l <= g.end).map((l) => '<div class="tick" style="left:' + xOf(g, s0.start + l) + "px;top:" + (bar.getBoundingClientRect().bottom - $("tl").getBoundingClientRect().top) + 'px"></div>').join("");
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
    pill.style.top = bar.getBoundingClientRect().top - $("tl").getBoundingClientRect().top - px("--c-badge-h") - px("--space-1") + "px";
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
    Object.assign(box.style, { left: l - tlb.left + "px", top: t - tlb.top + "px", width: r - l + "px", height: b - t + "px" });
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
const popInset = () => (phone() ? px("--c-screen-margin") : px("--space-5"));
function clipNow(key, work) { const km = keptMove(); return (work || km.e.cur).find((x) => x.key === key); }
function openPop(key, origin) {
  const km = keptMove();
  if (!km || km.e.view === "original") return;
  if (pop && pop.key === key) { if (origin === "key") focusFirst(); return; }
  closePop(true);
  const el = document.createElement("div");
  el.className = "pop"; el.setAttribute("role", "dialog"); el.dataset.key = key;
  document.body.append(el);
  pop = { key, el, origin, held: false, committed: {} };
  renderPop();
  placePop();
  el.setAttribute("aria-label", clipNow(key).of + " " + clipNow(key).does);
  if (!reduced()) el.animate([{ opacity: 0, translate: "0 " + tok("--pop-rise"), scale: tok("--pop-scale") }, { opacity: 1, translate: "0 0", scale: 1 }], { duration: ms("--dur-pop"), easing: tok("--ease-drawer") });
  else el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-pop"), easing: tok("--ease-drawer") });
  if (origin === "key") focusFirst();
}
function focusFirst() { const i = pop.el.querySelector('input[data-f="at"]:not(:disabled)') || pop.el.querySelector("input, button"); if (i) { i.focus(); if (i.select) i.select(); } }
function closePop(instant) {
  closeMenu();
  if (!pop) return;
  const el = pop.el; pop = null;
  if (instant) { el.remove(); return; }
  el.style.pointerEvents = "none";
  // With reduced motion the kit's fade alone runs, open and close.
  const frames = reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, translate: "0 0", scale: 1 }, { opacity: 0, translate: "0 " + tok("--pop-rise"), scale: tok("--pop-scale") }];
  el.animate(frames, { duration: ms("--dur-exit"), easing: tok("--ease-out"), fill: "forwards" }).finished.then(() => el.remove());
}
// Where it stands: 4px above its bar, its start on the bar's start, slid along the row inside the viewport;
// below the bar's row only when the room above is shorter than it.
function popPlace() {
  const bar = $("rows") && $("rows").querySelector('.bar[data-key="' + pop.key + '"]');
  if (!bar) return null;
  const b = bar.getBoundingClientRect(), el = pop.el, inset = popInset(), gap = px("--space-1");
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = clamp(b.left, inset, innerWidth - inset - w);
  const above = b.top - gap - h >= inset;
  const row = bar.closest(".clip").getBoundingClientRect();
  const top = above ? b.top - gap - h : Math.max(b.bottom, row.bottom) + gap;
  el.style.transformOrigin = (b.left - left) + "px " + (above ? "100%" : "0");
  return { left, top, above, bottom: innerHeight - (b.top - gap) };
}
function placePop() {
  const p = popPlace(); if (!p) return;
  const el = pop.el;
  el.style.left = p.left + "px";
  if (p.above) { el.style.top = "auto"; el.style.bottom = p.bottom + "px"; } else { el.style.bottom = "auto"; el.style.top = p.top + "px"; }
}
function movePop(from) {
  if (!pop) return;
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
  let rows = '<span class="pop-label" data-scrub="at">Starts</span><span class="pop-cell">' + fieldHtml("at", fieldVal(atVal), "ms", { token: atTok, free: atFree, label: "Starts, ms", disabled: c.at.ref === "with" }) + '<button class="anchor-btn" data-menu="anchor" aria-label="Starts from" aria-haspopup="menu">' + icon(ICON.chevron) + "</button>" + (c.at.ref ? '<span class="pop-sub">' + esc(anchorWords(e, c)) + "</span>" : "") + "</span>";
  rows += '<span class="pop-label" data-scrub="dur">Length</span><span class="pop-cell">' + fieldHtml("dur", fieldVal(c.dur), "ms", { token: durTok, free: !durTok, label: "Length, ms" }) + "</span>";
  if (Array.isArray(c.ease) && pop.custom) rows += '<span class="pop-label">Curve</span><span class="pop-cell"><span class="fld free">' + glyph(c.ease, "glyph") + '<input data-f="bez" aria-label="Custom bezier" value="' + c.ease.join(", ") + '"></span></span>';
  else rows += '<span class="pop-label">Curve</span><span class="pop-cell"><button class="fld trigger' + (Array.isArray(c.ease) ? " free" : "") + '" data-menu="curve" aria-haspopup="menu" aria-label="Curve">' + glyph(c.ease, "glyph") + "<span>" + (isSpring(c.ease) ? "Spring" : esc(curveName(c.ease))) + "</span>" + icon(ICON.chevron, "chev") + "</button></span>";
  if (isSpring(c.ease)) rows += '<span class="pop-label" data-scrub="bounce">Bounce</span><span class="pop-cell">' + fieldHtml("bounce", String(c.ease.spring.bounce), "", { label: "Bounce", num: true }) + "</span>";
  if (c.from != null) rows += '<span class="pop-label" data-scrub="from"><code>' + esc(c.prop) + '</code></span><span class="pop-cell">' + fieldHtml("from", String(c.from), "", { label: c.prop + " from", num: true }) + '<span class="arrow">→</span>' + fieldHtml("to", String(c.to), "", { label: c.prop + " to", num: true }) + '<span class="unit arrow">' + esc(c.unit || "") + "</span></span>";
  const head = '<div class="pop-head"><p>' + esc(c.of) + " <span>" + esc(c.does) + "</span></p>" + (isEdited ? '<button class="ghost-btn" id="popReset">Reset</button>' : "") + "</div>";
  const focusF = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.f || document.activeElement.dataset.menu : null;
  const caret = focusF && document.activeElement.selectionStart;
  const h0 = el.offsetHeight;
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
function drawDials() {
  const box = $("dials"); box.innerHTML = "";
  const list = dials[tab] || [];
  box.hidden = !list.length;
  for (const d of list) {
    const row = document.createElement("label"); row.className = "dial";
    const n = document.createElement("span"); n.textContent = d.name;
    const r = document.createElement("input"); r.type = "range"; r.min = d.min; r.max = d.max; r.step = d.step; r.value = d.value;
    const out = document.createElement("output"); out.textContent = d.value + " " + d.unit;
    r.oninput = () => { d.value = +r.value; out.textContent = d.value + " " + d.unit; d.apply(d.value); keptSnap = snapStage(); };
    row.append(n, r, out); box.append(row);
  }
}

// ---- Tabs ----
for (const c of components) {
  const b = document.createElement("button");
  b.className = "t-tab"; b.setAttribute("role", "tab"); b.dataset.tab = c.id; b.textContent = c.name;
  b.onclick = () => { if (tab === c.id) return; tab = c.id; peek = null; time = null; stopPlay(); closePop(true); zoom = 1; render(true); };
  $("tabs").append(b);
}
function render(animateTab) {
  for (const b of $("tabs").querySelectorAll(".t-tab")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  slidePill($("tabs"), !!animateTab);
  drawGraph(); drawStage(); keptSnap = snapStage(); mark(); buildDock(); drawDials(); showKept(); syncSashes();
}

// ---- Resizing the panel: the width edge, the foot and the corner (resize-handle-design.md) ----
const panel = $("panel");
const widthFloor = () => px("--c-panel-w"), widthCeil = () => Math.round(innerWidth * 0.85);
const graphFloor = () => { const g = $("graph"), r = g.querySelector(".region"), n = g.querySelector(".node"); return Math.ceil((r ? r.querySelector(".region-name").offsetHeight + px("--space-2") : 0) + (n ? n.offsetHeight : 0) + 2 * px("--space-2") + 2); };
const graphCeil = () => Math.max(graphFloor(), innerHeight - 2 * px("--space-5") - (panel.offsetHeight - $("graph").offsetHeight));
function setSize(w, h) {
  if (w != null) rootEl.style.setProperty("--panel-w", clamp(Math.round(w), widthFloor(), widthCeil()) + "px");
  if (h != null) rootEl.style.setProperty("--graph-h", clamp(Math.round(h), graphFloor(), graphCeil()) + "px");
  syncSashes();
}
function syncSashes() {
  const w = panel.offsetWidth, h = $("graph").offsetHeight;
  const set = (el, now, min, max, text) => { el.setAttribute("aria-valuenow", now); el.setAttribute("aria-valuemin", min); el.setAttribute("aria-valuemax", max); if (text) el.setAttribute("aria-valuetext", text); };
  set($("sashW"), w, widthFloor(), widthCeil());
  set($("sashH"), h, graphFloor(), graphCeil());
  set($("sashC"), w, widthFloor(), widthCeil(), w + " by " + h + " px");
}
function relayoutAfterResize() { drawGraph(); mark(); showKept(); if (tl) layoutDock(); sizeDockRoom(); if (pop) placePop(); }
for (const sash of panel.querySelectorAll(".sash")) {
  const edge = sash.dataset.edge;
  sash.onpointerenter = () => { panel.dataset.edge = edge; };
  sash.onfocus = () => { panel.dataset.edge = edge; };
  sash.onpointerdown = (e) => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, w0 = panel.offsetWidth, h0 = $("graph").offsetHeight;
    sash.setPointerCapture(e.pointerId);
    panel.dataset.edge = edge; panel.dataset.resizing = edge; rootEl.dataset.resizing = edge;
    sash.onpointermove = (ev) => setSize(edge.includes("w") ? w0 + x0 - ev.clientX : null, edge.includes("h") ? h0 + ev.clientY - y0 : null);
    sash.onpointerup = sash.onpointercancel = () => { sash.onpointermove = null; delete panel.dataset.resizing; delete rootEl.dataset.resizing; relayoutAfterResize(); };
  };
  // The APG window splitter: arrows move the edge 8px, 32px with Shift; Home and End go to the floor and ceiling.
  let keyTimer = null;
  sash.onkeydown = (e) => {
    const step = e.shiftKey ? 32 : 8, w = panel.offsetWidth, h = $("graph").offsetHeight;
    let nw = null, nh = null;
    if (edge.includes("w") && e.key === "ArrowLeft") nw = w + step;
    else if (edge.includes("w") && e.key === "ArrowRight") nw = w - step;
    else if (edge.includes("h") && e.key === "ArrowDown") nh = h + step;
    else if (edge.includes("h") && e.key === "ArrowUp") nh = h - step;
    else if (e.key === "Home") { if (edge.includes("w")) nw = widthFloor(); if (edge.includes("h")) nh = graphFloor(); }
    else if (e.key === "End") { if (edge.includes("w")) nw = widthCeil(); if (edge.includes("h")) nh = graphCeil(); }
    else return;
    e.preventDefault();
    panel.dataset.edge = edge; panel.dataset.resizing = edge;
    setSize(nw, nh);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => { delete panel.dataset.resizing; relayoutAfterResize(); }, ms("--dur-control"));
  };
}

// ---- Zoom and pan ----
$("zoomIn").onclick = () => setZoom(zoom * 1.2);
$("zoomOut").onclick = () => setZoom(zoom / 1.2);
$("zoomFit").onclick = () => fitZoom();
$("graph").addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
$("graph").addEventListener("pointerdown", (e) => {
  if (e.target.closest(".node")) return;
  const g = $("graph"), x0 = e.clientX, y0 = e.clientY, sl = g.scrollLeft, st = g.scrollTop;
  g.setPointerCapture(e.pointerId); g.classList.add("panning");
  g.onpointermove = (ev) => { g.scrollLeft = sl - (ev.clientX - x0); g.scrollTop = st - (ev.clientY - y0); };
  g.onpointerup = () => { g.onpointermove = null; g.classList.remove("panning"); };
});

// ---- Hide and Show ----
function setOpen(open) {
  panel.dataset.open = String(open);
  $("show").hidden = open;
  if (!open) closePop(true);
  buildDock();
}
$("hide").onclick = () => { setOpen(false); $("show").focus(); };
$("show").onclick = () => { setOpen(true); $("hide").focus(); };

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
  if ((e.key === "h" || e.key === "H") && !e.altKey) { setOpen(!panelOpen()); return; }
  if (!km || !tl) return;
  if (e.key === " " && !(document.activeElement && (document.activeElement.tagName === "BUTTON" || (document.activeElement.closest && document.activeElement.closest(".panel, .pop, .menu, .show"))))) { e.preventDefault(); playing ? stopPlay() : play(); }
  else if (e.key === "Home" && !e.target.closest(".sash")) { stopPlayKeepTime(); time = 0; drawStage(); updateTime(); }
  else if (e.key === "End" && !e.target.closest(".sash")) { stopPlayKeepTime(); time = null; drawStage(); updateTime(); }
  else if (e.key === "," || e.key === ".") { stopPlayKeepTime(); const len = playLengthOf(km.r); time = clamp((time ?? lengthOf(km.r)) + (e.key === "." ? 10 : -10), 0, len); drawStage(); updateTime(); }
});

new ResizeObserver(() => sizeDockRoom()).observe($("dock"));
addEventListener("resize", () => { render(); });
render();
document.fonts.ready.then(() => render());
