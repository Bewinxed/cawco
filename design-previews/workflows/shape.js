/*
 * The shape of a workflow, laid out from its steps: each step on the row
 * after the steps it waits for, a step "with" another beside it. Option A
 * reads the steps off the numbered brief; B's Shape toggle, C's canvas and
 * the lit runs draw the same layout.
 */
import { esc, glyph, ic, KIND, RUN12, STEPS } from "./parts.js";

const NUMBERED = /^\s*(\d+)\.\s+(.*)$/;
const WHO = /\(([a-z-]+)\)/i;
const WITH = /\bwith (\d+)\b/i;
const IF = /^if\b([^,]*),\s*(.*)$/i;
const POST = /^(post|call|send)\b/i;
const ASK = /^ask me\b/i;
const CHANNEL = /#[a-z0-9-]+/i;

const WITH_WORDS = /,?\s*with \d+/i;
const SPACE_DOT = /\s+\./g;
const END_DOT = /\.$/;

const tidy = (text) =>
  text
    .replace(WHO, "")
    .replace(WITH_WORDS, "")
    .replace(SPACE_DOT, ".")
    .replace(END_DOT, "")
    .trim();

/** Reads a numbered brief into steps; a numbered line it cannot read stays prose, marked. */
export function parseBrief(text) {
  const steps = [];
  for (const line of text.split("\n")) {
    const m = NUMBERED.exec(line);
    if (!m) {
      continue;
    }
    const n = Number(m[1]);
    let body = m[2].trim();
    let cond = "";
    const ifMatch = IF.exec(body);
    if (ifMatch) {
      const [, when, rest] = ifMatch;
      cond = `if${when}`.trim();
      body = rest;
    }
    const who = WHO.exec(body)?.[1] ?? "";
    const withN = Number(WITH.exec(body)?.[1] ?? 0);
    let kind = "";
    if (ASK.test(body)) {
      kind = "ask";
    } else if (POST.test(body)) {
      kind = "call";
    } else if (who) {
      kind = "agent";
    }
    const title = tidy(body);
    steps.push({
      n,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      kind,
      who: kind === "call" ? (CHANNEL.exec(body)?.[0] ?? "slack-brand") : who,
      with: withN,
      cond,
      unparsed: kind === "",
    });
  }
  return steps;
}

/** Each read step's row and place in it. */
export function layout(steps, { start = false } = {}) {
  const levelOf = new Map();
  let deepest = start ? 0 : -1;
  for (const s of steps.filter((each) => !each.unparsed)) {
    const level =
      s.with && levelOf.has(s.with) ? levelOf.get(s.with) : deepest + 1;
    levelOf.set(s.n, level);
    deepest = Math.max(deepest, level);
  }
  const rows = [];
  for (const s of steps.filter((each) => !each.unparsed)) {
    const level = levelOf.get(s.n);
    rows[level] ??= [];
    rows[level].push(s);
  }
  if (start) {
    rows[0] = [
      { n: 0, title: "Start", kind: "start", who: "Run now · version" },
    ];
  }
  return rows.filter(Boolean);
}

const NODE_H = 50;
const PITCH = 70;
const TOP = 34;

const stateOf = (s, lit) => (lit ? (RUN12[s.n]?.state ?? "planned") : "");

const nodeMark = (s, lit) => {
  if (s.kind === "start") {
    return ic("play", "g-idle");
  }
  if (lit) {
    return glyph(stateOf(s, lit));
  }
  return `<span class="g-idle">${ic(KIND[s.kind].icon)}</span>`;
};

const nodeMeta = (s) => {
  if (s.kind === "start") {
    return "";
  }
  const { word } = KIND[s.kind];
  return `<span class="m">${word}${s.who && s.kind !== "ask" ? ` · ${esc(s.who)}` : ""}</span>`;
};

/**
 * The shape drawn: nodes placed by percent across, edges in an SVG on the
 * same grid. `lit` draws run 12's states; `sel` marks one node chosen.
 */
export function shapeView(
  steps,
  {
    lit = false,
    sel = 0,
    start = false,
    caption = "Shape, read from the brief",
    w = 156,
    extraTag = "",
  } = {}
) {
  const rows = layout(steps, { start });
  const height = TOP + rows.length * PITCH + 8;
  const at = new Map();
  rows.forEach((row, level) => {
    row.forEach((s, i) => {
      at.set(s.n, {
        x: ((i + 0.5) / row.length) * 100,
        y: TOP + level * PITCH,
        s,
      });
    });
  });
  const edges = [];
  rows.forEach((row, level) => {
    if (level === 0) {
      return;
    }
    for (const child of row) {
      for (const parent of rows[level - 1]) {
        const a = at.get(parent.n);
        const b = at.get(child.n);
        const y1 = a.y + NODE_H;
        const y2 = b.y;
        const mid = (y1 + y2) / 2;
        edges.push({
          key: `${parent.n}-${child.n}`,
          d: `M${a.x} ${y1} C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${y2}`,
          dash: Boolean(child.cond),
          tag: child.cond,
          tx: b.x,
          ty: mid,
        });
      }
    }
  });
  const tags = new Map();
  for (const e of edges) {
    if (e.tag && !tags.has(e.tag)) {
      tags.set(e.tag, e);
    }
  }
  const nodes = [...at.values()]
    .map(({ x, y, s }) => {
      const cls = [
        "node",
        s.kind === "start" ? "start" : "",
        s.n === sel ? "sel" : "",
        lit && stateOf(s, lit) === "needs" ? "ask-node" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<div class="${cls}" data-node="${s.n}" data-key="${esc(`${s.n}|${s.title}|${s.kind}|${s.who}`)}" style="left:${x}%;top:${y}px">${nodeMark(s, lit)}<span class="t">${esc(s.title)}</span>${nodeMeta(s)}</div>`;
    })
    .join("");
  const paths = edges
    .map(
      (e) =>
        `<path class="edge${e.dash ? " dash" : ""}" data-edge="${e.key}" d="${e.d}" pathLength="1" vector-effect="non-scaling-stroke"/>`
    )
    .join("");
  const tagHtml = [...tags.values()]
    .map(
      (e) =>
        `<span class="edge-tag" style="left:${e.tx}%;top:${e.ty}px">${esc(e.tag)}</span>`
    )
    .join("");
  return `<div class="shape" data-shape style="--node-w:${w}px;block-size:${height}px"><span class="shape-cap">${caption}</span><svg class="edges" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${nodes}${tagHtml}${extraTag}</div>`;
}

export const BRIEF = `Release {{version}} from main.
1. Draft the release notes (writer).
2. Check the changelog links (checker), with 1.
3. Post the notes to Slack #releases.
4. Ask me which channel.
5. If I say beta, run the smoke test (runner).`;

export const BRIEF_SLIPPED = `${BRIEF}
6. Tell QA if it slipped.`;

export const READ_STEPS = parseBrief(BRIEF);

/** STEPS as the shape reads them: the release workflow's own steps. */
export const PLAN = STEPS.map((s) => ({
  n: s.n,
  title: s.short,
  kind: s.kind,
  who: s.who,
  with: s.n === 2 ? 1 : 0,
  cond: s.n === 5 ? "if beta" : "",
  unparsed: false,
}));
