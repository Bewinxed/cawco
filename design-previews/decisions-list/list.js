/*
 * The Decisions tab as report 7932615d §7 draws it, with the designer's
 * answers to its critiques (report 068af135): a search field over one raised
 * list whose groups are the pages' standing (Needs you, Not now, Sent,
 * Decided, Closed), one row per page: its mark, its title, the one fact that
 * differs, the date that put it in its group, and on hover the one act it
 * takes. Every row opens its page, drawn from the page's own cards. Every
 * state is a function of `cfg` (the state, the open page or canvas) and of
 * what was done in the drawing (`moves`, `seen`), so the desk and the phone
 * draw the same model.
 */
import { CARDS } from "./cards.js";
import {
  ALL_SENT,
  CANVASES,
  GONE,
  KEPT_CARDS,
  MANY_OPEN,
  NO_MATCH,
  NOTES,
  PAGES,
  QUERY,
  STARTERS,
} from "./data.js";
import { btn, cawStill, chip, esc, ic } from "./parts.js";

/* ------------------------------------------------------------- dates */

/** The drawing's now: Saturday 24 October 2026, 21:30. */
export const NOW = new Date(2026, 9, 24, 21, 30).getTime();

const minutes = (age) => {
  if (age === "now") {
    return 0;
  }
  const n = Number.parseFloat(age);
  if (age.endsWith("m")) {
    return n;
  }
  return age.endsWith("h") ? n * 60 : n * 1440;
};

export const atOf = (page) => NOW - minutes(page.age) * 60_000;

/** The house formatter (find-rows.ts `age()`): now, Nm, Nh, Nd under 7 days, then the date. */
export function formatAge(at) {
  const s = Math.max(0, (NOW - at) / 1000);
  if (s < 60) {
    return "now";
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)}h`;
  }
  if (s < 7 * 86_400) {
    return `${Math.floor(s / 86_400)}d`;
  }
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const dayOf = (at) =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const timeOf = (at) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const ago = (at) => {
  if (NOW - at >= 7 * 86_400_000) {
    return `on ${dayOf(at)}`;
  }
  const f = formatAge(at);
  return f === "now" ? "now" : `${f} ago`;
};

/** What the figure means, for a pointer that rests on it and for a screen reader. */
function dateWords(page, at) {
  switch (page.standing) {
    case "open":
      return `Waiting since ${dayOf(at)}`;
    case "later":
      return `Not now since ${dayOf(at)}`;
    case "sent":
      return `Sent ${dayOf(at)}, ${timeOf(at)}`;
    case "decided":
      return `Decided ${ago(at)}`;
    default:
      return `Closed ${ago(at)}`;
  }
}

/* ------------------------------------------------------------- model */

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What was done in the drawing (Not now, Reopen, Send, Make tasks), by page; a state switch clears it. */
export const moves = {};
/** The pages he has opened: a removed picture is news only until then. */
export const seen = new Set();
export const clearMoves = () => {
  for (const key of Object.keys(moves)) {
    delete moves[key];
  }
  seen.clear();
};

export const cardsOf = (name) => CARDS[name] ?? KEPT_CARDS[name] ?? [];

/** The pictures a page lost: by card, and how many it had. */
const goneOf = (name) => {
  const g = GONE[name] ?? {};
  const byCard = Object.fromEntries(
    Object.entries(g).filter(([k]) => /^\d+$/.test(k))
  );
  return { byCard, count: Object.keys(byCard).length, total: g.total ?? 0 };
};

/** The 25 pages as the state stands them, with what was done applied. */
export function pagesFor(state) {
  return PAGES.map((page) => {
    let p = page;
    if (state === "many" && MANY_OPEN[page.name]) {
      p = { ...p, ...MANY_OPEN[page.name], standing: "open", heard: undefined };
    }
    if (state === "alldone" && ALL_SENT[page.name]) {
      p = {
        ...p,
        ...ALL_SENT[page.name],
        standing: "sent",
        notSent: false,
        quietDays: undefined,
      };
    }
    if (moves[page.name]) {
      p = { ...p, ...moves[page.name] };
    }
    return { ...p, cards: cardsOf(page.name).length || p.cards };
  });
}

export const titleOf = (name) => PAGES.find((p) => p.name === name)?.title;
export const pageNamed = (title) => PAGES.find((p) => p.title === title)?.name;

/** How many of a page's cards carry a pick (each the writer's recommendation). */
function picksOf(page) {
  switch (page.standing) {
    case "decided":
      return page.decided ?? page.picked ?? 0;
    case "closed":
      return page.closed === "replaced" ? cardsOf(page.name).length : page.kept;
    default:
      return page.picked ?? 0;
  }
}
const choiceOf = (card) => card.rec ?? 0;

/** Make tasks is offered once the send was read, or its session ended unread (answer 6). */
export const canMakeTasks = (page) =>
  page.standing === "sent" &&
  picksOf(page) > 0 &&
  (page.heard === "read" || page.heard === "ended");

/** From 7 days, an Open row's wait greys its ring and takes no word (answer 3). */
const waitedLong = (page) =>
  page.standing === "open" && NOW - atOf(page) >= 7 * 86_400_000;

/* ------------------------------------------------------------ marks */

const R = 7.25;
export const CIRC = 2 * Math.PI * R;

/** TaskRing's look at 16px: a track and an arc wound from the top; never the finish check. */
export const ring = (done, total, cls = "") => {
  const share = total > 0 ? Math.min(done, total) / total : 0;
  return `<svg class="ring ${cls}" viewBox="0 0 16 16" aria-hidden="true"><circle class="track" cx="8" cy="8" r="${R}"/><circle class="arc" cx="8" cy="8" r="${R}" stroke-dasharray="${CIRC} ${CIRC}" stroke-dashoffset="${CIRC * (1 - share)}" transform="rotate(-90 8 8)"/></svg>`;
};

const dashed = (cls) =>
  `<svg class="ring dashed ${cls}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${R}"/></svg>`;

export function markOf(page) {
  switch (page.standing) {
    case "open":
      return ring(page.picked, page.cards, waitedLong(page) ? "waited" : "live");
    case "later":
      return dashed("later");
    case "sent":
      return ring(page.picked, page.cards, "sent");
    case "decided":
      if (page.making) {
        return ring(0, 1, "live");
      }
      return page.tasksDone < page.tasks
        ? ring(page.tasksDone, page.tasks, "live")
        : `<span class="g-done" role="img" aria-label="Built">${ic("done")}</span>`;
    default:
      return dashed("gone");
  }
}

/* ------------------------------------------------------------ facts */

const liveDot = '<span class="live-dot breathe" aria-hidden="true"></span>';

/** A fact's pieces, each its own element, parted by a separator element so no space collapses. */
const pieces = (list) =>
  list
    .filter(Boolean)
    .map((p) => `<span class="fp">${p}</span>`)
    .join('<span class="sep" aria-hidden="true">·</span>');

function heardPiece(page) {
  if (page.heard === "working") {
    return `<span data-heard-fact="working">${liveDot}working on it</span>`;
  }
  if (page.heard === "unread") {
    return '<span data-heard-fact="unread">not read yet</span>';
  }
  if (page.heard === "ended") {
    return '<span data-heard-fact="ended">its session ended</span>';
  }
  return '<span data-heard-fact="read">read</span>';
}

const tasksPiece = (page) => {
  if (page.making) {
    return `<span data-tasks>${liveDot}making tasks</span>`;
  }
  return page.tasksDone < page.tasks
    ? `<span data-tasks>${page.tasksDone} of ${page.tasks} tasks done</span>`
    : `<span data-tasks>${page.tasks} tasks done</span>`;
};

/** "2 pictures removed", "1 picture removed", "All 3 pictures removed": news until he opens the page (answer 1). */
function gonePiece(page) {
  const { count, total } = goneOf(page.name);
  if (count === 0) {
    return "";
  }
  const words =
    count === total && total > 1
      ? `All ${total} pictures removed`
      : `${plural(count, "picture")} removed`;
  return `<span data-gone-fact${seen.has(page.name) ? "" : ' class="strong"'}>${words}</span>`;
}

/** Who closed a page, named when the closing doesn't say it (answer 5). */
function closedPiece(page) {
  if (page.closed === "replaced") {
    return `<span data-actor="successor"><span class="mark-text">Replaced by</span> ${chip(page.by, { kind: "page", target: pageNamed(page.by) })}</span>`;
  }
  if (page.closed === "dropped") {
    return '<span data-actor="you">Dropped by you</span>';
  }
  return page.by === "Caw"
    ? '<span data-actor="caw">Withdrawn by Caw</span>'
    : `<span data-actor="session"><span class="mark-text">Withdrawn by</span> ${chip(page.by, { kind: "session" })}</span>`;
}

/** The one fact that differs on a row: the group says the standing, so the fact never repeats it (Row Dress). */
export function factOf(page) {
  switch (page.standing) {
    case "open":
      if (page.newCards) {
        return pieces([
          '<span class="strong">Asked again</span>',
          `<span class="strong">${plural(page.newCards, "new card")}</span>`,
          `${page.picked} of ${page.cards} picked`,
        ]);
      }
      return pieces([
        `${page.picked} of ${page.cards} picked`,
        page.notes ? plural(page.notes, "note") : "",
        page.notSent ? '<span class="strong">Not sent</span>' : "",
      ]);
    case "later":
      return pieces([`${page.picked} of ${page.cards} picked`]);
    case "sent":
      return pieces([gonePiece(page), `${page.picked} of ${page.cards}`, heardPiece(page)]);
    case "decided":
      return pieces([gonePiece(page), `${page.decided} decided`, tasksPiece(page)]);
    default:
      return pieces([
        closedPiece(page),
        page.closed === "replaced" ? "" : `${plural(page.kept, "pick")} kept`,
      ]);
  }
}

function actOf(page) {
  if (page.standing === "open") {
    return btn("Not now", {
      v: "ghost",
      size: "xs",
      icon: "close",
      attrs: `data-act="not-now" data-for="${page.name}"`,
    });
  }
  if (page.standing === "later") {
    return btn("Reopen", {
      v: "ghost",
      size: "xs",
      attrs: `data-act="reopen" data-for="${page.name}"`,
    });
  }
  if (canMakeTasks(page)) {
    return btn("Make tasks", {
      v: "ghost",
      size: "xs",
      attrs: `data-act="make-tasks" data-for="${page.name}"`,
    });
  }
  return "";
}

/* ------------------------------------------------------------ search */

const has = (text, q) => String(text ?? "").toLowerCase().includes(q);

/**
 * The card lines a query finds on a page: every question, option, pick and
 * note, as Find indexes them. A line is the question, then the pick, then
 * the option or the note the query matched when it isn't the pick.
 */
export function hitsFor(page, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const picked = picksOf(page);
  return cardsOf(page.name)
    .map((card, i) => {
      const pick = i < picked ? card.options[choiceOf(card)] : null;
      const note = NOTES[page.name]?.[i] ?? null;
      const option = card.options.find((o) => has(o, q) && o !== pick) ?? null;
      const matched = has(card.q, q) || has(pick, q) || option || has(note, q);
      return matched
        ? { q: card.q, pick, option, note: has(note, q) ? note : null, card: i }
        : null;
    })
    .filter(Boolean);
}

export const found = (page, query) => {
  const q = query.trim().toLowerCase();
  return q !== "" && (has(page.title, q) || hitsFor(page, q).length > 0);
};

const highlight = (text, query) => {
  const safe = esc(text);
  const q = esc(query ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!q) {
    return safe;
  }
  return safe.replace(new RegExp(`(${q})`, "gi"), '<mark class="hl">$1</mark>');
};

function hitsHtml(page, query) {
  const lines = hitsFor(page, query).slice(0, 3);
  if (lines.length === 0) {
    return "";
  }
  const part = (label, text) =>
    `<span class="sep" aria-hidden="true">·</span><span class="n">${label}${highlight(text, query)}</span>`;
  return `<div class="hits" data-hits>${lines
    .map(
      (line) =>
        `<a class="hit" href="#" data-hit data-open-page="${page.name}" data-card-at="${line.card}"><span class="q">${highlight(line.q, query)}</span>${line.pick ? `<span class="arrow" aria-hidden="true">→</span><span class="a">${highlight(line.pick, query)}</span>` : part("", "not picked")}${line.option ? part("option: ", line.option) : ""}${line.note ? part("your note: ", line.note) : ""}</a>`
    )
    .join("")}</div>`;
}

/* -------------------------------------------------------------- rows */

export function row(page, { hover = false, query = "" } = {}) {
  const act = actOf(page);
  const at = atOf(page);
  const words = dateWords(page, at);
  return `<div class="row" data-row data-page="${page.name}" data-standing="${page.standing}" data-at="${at}"${waitedLong(page) ? " data-waited" : ""}${hover ? " data-hover" : ""}>
    <span class="mark" data-mark>${markOf(page)}</span>
    <a class="title" href="#" data-title data-open-page="${page.name}" title="${esc(page.title)}"><span class="t">${highlight(page.title, query)}</span></a>
    <span class="fact" data-fact>${factOf(page)}</span>
    <span class="end"><span class="age num" title="${esc(words)}" data-age><span aria-hidden="true">${formatAge(at)}</span><span class="sr-only">${esc(words)}</span></span>${act ? `<span class="act">${act}</span>` : ""}</span>
    ${query ? hitsHtml(page, query) : ""}
  </div>`;
}

/* ------------------------------------------------------------ groups */

const GROUPS = {
  open: { title: "Needs you", glyph: "open", ink: "g-attn" },
  later: { title: "Not now", glyph: "later", ink: "g-muted" },
  sent: { title: "Sent", glyph: "sent", ink: "g-muted" },
  decided: { title: "Decided", glyph: "done", ink: "g-done" },
  closed: { title: "Closed", glyph: "closed", ink: "g-muted" },
};

/** Sent and Decided show six, the rest behind one reveal; Closed folds whole. */
const SHOWN = { sent: 6, decided: 6 };

function group(key, pages, opts = {}) {
  const g = GROUPS[key];
  const n = pages.length;
  const unfold = opts.unfold || opts.query;
  const shown = key === "closed" || unfold ? n : (SHOWN[key] ?? n);
  const head = pages.slice(0, shown);
  const tail = pages.slice(shown);
  const hoverAt = opts.hover ?? -1;
  const rows = (list, from) =>
    list
      .map((page, i) => row(page, { hover: from + i === hoverAt, query: opts.query }))
      .join("");
  const count = n > 0 ? `<span class="count num">${n}</span>` : "";
  const line = opts.line ? `<p class="gline" data-gline>${opts.line}</p>` : "";
  const closedOpen = key === "closed" && Boolean(unfold);
  // Closed's head is its disclosure: the group's own name, never a verb (the accordion pattern).
  const title =
    key === "closed"
      ? `<h3><button class="gtoggle" type="button" data-fold-toggle="closed" aria-expanded="${closedOpen}"><span>${g.title}</span>${count}<span class="chev">${ic("down", "sm")}</span></button></h3>`
      : `<h3><span>${g.title}</span>${count}</h3>`;
  let body = rows(head, 0);
  if (key === "closed") {
    body = `<div class="fold" data-fold="closed"${closedOpen ? " data-open" : " inert"}><div class="fold-in">${rows(pages, 0)}</div></div>`;
  } else if (tail.length > 0) {
    body += `<div class="fold" data-fold="${key}" inert><div class="fold-in">${rows(tail, shown)}</div></div>
      <button class="more" type="button" data-more="${key}" aria-expanded="false"><span>${plural(tail.length, `more ${key} page`)}</span><span class="chev">${ic("down", "sm")}</span></button>`;
  }
  return `<section class="grp" data-group="${key}" data-count="${n}"${opts.edge ? ` data-edge="${opts.edge}"` : ""}>
    <div class="ghead"><span class="mark">${ic(g.glyph, g.ink)}</span><div class="gtext">${title}</div></div>
    ${line}${body}
  </section>`;
}

/** Needs you longest wait first; every other group newest first by the date that put it there (answer 4). */
const oldestFirst = (a, b) => atOf(a) - atOf(b);
const newestFirst = (a, b) => atOf(b) - atOf(a);

export function grouped(cfg) {
  const pages = pagesFor(cfg.state);
  const of = (standing) => pages.filter((p) => p.standing === standing);
  const open = of("open").sort(oldestFirst);
  return {
    open,
    pages,
    list: [
      ["open", open],
      ["later", of("later").sort(newestFirst)],
      ["sent", of("sent").sort(newestFirst)],
      ["decided", of("decided").sort(newestFirst)],
      ["closed", of("closed").sort(newestFirst)],
    ],
  };
}

/* ------------------------------------------------------------- field */

const field = ({ value = "", disabled = false, phone = false } = {}) =>
  `<label class="search${disabled ? " disabled" : ""}" data-search>
    ${ic("search")}
    <input type="search" placeholder="Search decisions" aria-label="Search decisions" value="${esc(value)}"${disabled ? " disabled" : ""} />
    ${value ? btn("", { v: "ghost", size: "xs", icon: "close", attrs: 'data-clear aria-label="Clear the search"' }) : phone ? "" : '<kbd class="key">/</kbd>'}
  </label>`;

/* ------------------------------------------------------------ states */

function listState(cfg, phone) {
  const { open, list, pages } = grouped(cfg);
  const sentCount = pages.filter((p) => p.standing === "sent").length;
  const decided = pages.filter((p) => p.standing === "decided").length;
  const firstOffered = list[2][1].findIndex(canMakeTasks);
  const sections = list.map(([key, members], i) => {
    const line =
      key === "open" && members.length === 0
        ? `Nothing waits on you. Agents have ${sentCount} pages; ${decided} are decided.`
        : "";
    let hover = -1;
    if (!phone && key === "sent" && cfg.state !== "many") {
      hover = firstOffered;
    }
    if (!phone && key === "open" && cfg.state === "many") {
      hover = 0;
    }
    return group(key, members, {
      edge: i === 2 ? "live" : "",
      line,
      hover,
      unfold: key === "closed" && cfg.state === "closed",
    });
  });
  return `<div class="dl" data-list-root data-open-count="${open.length}">
    ${field({ phone })}
    <div class="list" data-list data-total="${pages.length}">${sections.join("")}</div>
  </div>`;
}

function searchState(cfg, phone, query) {
  const { open, pages } = grouped(cfg);
  const q = query.trim();
  const sections = [
    ["open", oldestFirst],
    ["later", newestFirst],
    ["sent", newestFirst],
    ["decided", newestFirst],
    ["closed", newestFirst],
  ]
    .map(([key, by]) => [key, pages.filter((p) => p.standing === key && found(p, q)).sort(by)])
    .filter(([, members]) => members.length > 0)
    .map(([key, members]) => group(key, members, { query: q, unfold: true }));
  if (sections.length === 0) {
    return noMatch(cfg, phone, query);
  }
  return `<div class="dl" data-list-root data-open-count="${open.length}" data-searching>
    ${field({ value: query, phone })}
    <div class="list" data-list data-total="${pages.length}">${sections.join("")}</div>
  </div>`;
}

function noMatch(cfg, phone, query) {
  const { open } = grouped(cfg);
  return `<div class="dl" data-list-root data-open-count="${open.length}" data-searching>
    ${field({ value: query, phone })}
    <div class="nomatch" data-nomatch>
      <h3 class="etitle">No decisions for “${esc(query)}”</h3>
      ${btn("Open Find", { attrs: "data-find" })}
    </div>
  </div>`;
}

function loading(phone) {
  const rows = Array.from(
    { length: 5 },
    (_, i) =>
      `<div class="sk-row"><span class="sk sk-ring"></span><span class="sk sk-title" style="--w:${[62, 48, 70, 40, 55][i]}%"></span>${phone ? "" : '<span class="sk sk-fact"></span>'}<span class="sk sk-age"></span>${phone ? '<span class="sk sk-fact"></span>' : ""}</div>`
  ).join("");
  return `<div class="dl" data-list-root data-open-count="0" data-loading>
    ${field({ disabled: true, phone })}
    <div class="list sk-list" data-skeleton aria-busy="true"><div class="sk-band"><span class="sk sk-head"></span></div>${rows}</div>
  </div>`;
}

const failure = () => `<div class="dl" data-list-root data-open-count="0">
  <div class="empty" data-empty="failure">
    <span class="emark">${ic("decisions", "lg")}</span>
    <h3 class="etitle">Decisions are not available</h3>
    <p class="eline">The decision pages for Cawco-Dev could not be read: the hub didn't answer (502).</p>
    ${btn("Retry", { attrs: "data-retry" })}
  </div>
</div>`;

/** First use: what goes here and its one action (DESIGN.md, Voice, First use), Caw on the axis of the block he heads. */
const firstUse = () => `<div class="dl" data-list-root data-open-count="0">
  <div class="empty first" data-empty="first">
    <div class="caw-axis" data-caw>${cawStill("hero-thread", 80)}</div>
    <h3 class="etitle">Your decision pages will appear here</h3>
    <p class="eline">Caw writes one when this project needs you to choose: each choice with its options, picked here and sent to the agents.</p>
    <ul class="starters" aria-label="Starters" style="--n:${STARTERS.length}">${STARTERS.map(
      (s) =>
        `<li><button class="starter" type="button"><span class="mark-cell">${ic(s.glyph)}</span><span>${esc(s.text)}</span></button></li>`
    ).join("")}</ul>
  </div>
</div>`;

/* ------------------------------------------------------------- pages */

const option = (label, { chosen = false, recommended = false } = {}) =>
  `<span class="dopt"${chosen ? " data-chosen" : ""}><span>${esc(label)}</span>${recommended ? '<span class="rec">Recommended</span>' : ""}</span>`;

function goneWell(g) {
  return `<figure class="gone" data-gone>
    <div class="gone-well">
      <span class="gone-mark">${ic("canvas")}</span>
      <p class="gone-t">Canvas removed</p>
      <p class="gone-l">“${esc(g.name)}” was deleted ${g.ago} ago.</p>
      ${g.next ? `<p class="gone-l"><span class="mark-text">Its design went on in</span> ${chip(g.next, { kind: "canvas" })}<span class="mark-text">.</span></p>` : ""}
    </div>
    <figcaption>${esc(g.caption)}</figcaption>
  </figure>`;
}

/** The page's head line: its figure (always out of the cards it draws), what the hub knows, what was removed. */
function metaOf(page, total, gone) {
  const picked = picksOf(page);
  const parts = [];
  switch (page.standing) {
    case "open":
      parts.push(`${picked} of ${total} picked`, page.notSent ? "Not sent" : "");
      break;
    case "later":
      parts.push(`${picked} of ${total} picked`, "Not now");
      break;
    case "sent":
      parts.push(`${picked} of ${total}`, heardPiece(page));
      break;
    case "decided":
      parts.push(`${picked} of ${total} decided`, tasksPiece(page));
      break;
    default:
      parts.push(`${plural(picked, "pick")} kept`);
  }
  if (gone > 0) {
    parts.push(`${plural(gone, "picture")} ${gone === 1 ? "was" : "were"} removed`);
  }
  return pieces(parts);
}

/**
 * The page's one act, at its foot (DESIGN.md's decision card: "Only the
 * page's own Send"): Send while it needs you; once sent and read (or its
 * session ended), Make tasks where Send stood (answer 7).
 */
function footOf(page) {
  let act = "";
  if (page.standing === "open") {
    act = btn("I'm done picking", {
      v: "primary",
      attrs: `data-page-act="send" data-for="${page.name}"`,
    });
  } else if (page.standing === "later") {
    act = btn("Reopen", { attrs: `data-page-act="reopen" data-for="${page.name}"` });
  } else if (canMakeTasks(page)) {
    act = btn("Make tasks", {
      v: "primary",
      attrs: `data-page-act="make-tasks" data-for="${page.name}"`,
    });
  } else if (page.standing === "decided" && page.making) {
    act = btn("Making tasks…", { attrs: 'aria-disabled="true" data-page-act="making"' });
  }
  return act ? `<footer class="dfoot" data-foot>${act}</footer>` : "";
}

function bannerOf(page) {
  if (page.standing !== "closed") {
    return "";
  }
  const at = atOf(page);
  if (page.closed === "replaced") {
    return `<div class="banner" data-banner>
      <span class="mark-cell">${ic("closed")}</span>
      <p><span class="mark-text">Replaced by</span> ${chip(page.by, { kind: "page", target: pageNamed(page.by) })}<span class="mark-text">, written by ${esc(page.writtenBy)} ${ago(at)} · its picks are kept below</span></p>
      ${btn("Open the new page", { size: "sm", attrs: `data-successor="${pageNamed(page.by)}"` })}
    </div>`;
  }
  const kept = page.kept === 1 ? "its pick is kept below" : `its ${page.kept} picks are kept below`;
  let who = '<span class="mark-text">Dropped by you</span>';
  if (page.closed === "withdrawn") {
    who =
      page.by === "Caw"
        ? '<span class="mark-text">Withdrawn by Caw</span>'
        : `<span class="mark-text">Withdrawn by</span> ${chip(page.by, { kind: "session" })}`;
  }
  return `<div class="banner" data-banner><span class="mark-cell">${ic("closed")}</span><p>${who} <span class="mark-text">${ago(at)} · ${kept}</span></p></div>`;
}

const back = (label, attrs) =>
  `<div class="dback">${btn(label, { v: "ghost", size: "sm", icon: "left", attrs })}</div>`;

/** A decision page opened in the pane: its head, its standing, every card it holds, and its one act at its foot. */
export function pageView(name, cfg) {
  const { open, pages } = grouped(cfg);
  const page = pages.find((p) => p.name === name);
  const cards = cardsOf(name);
  const gone = goneOf(name);
  const picked = picksOf(page);
  const readOnly = page.standing === "closed" || page.standing === "decided";
  const meta = metaOf(page, cards.length, gone.count);
  return `<div class="dpage" data-dpage="${name}" data-standing="${page.standing}" data-cards="${cards.length}" data-list-root data-open-count="${open.length}">
    ${back("Decisions", "data-back")}
    <header class="dhead"><h3 class="dtitle" data-dtitle>${esc(page.title)}</h3><p class="dmeta" data-meta><span class="ring-line">${markOf(page)}</span>${meta}</p></header>
    ${bannerOf(page)}
    ${cards
      .map((card, i) => {
        const chosen = i < picked ? choiceOf(card) : -1;
        const note = NOTES[name]?.[i];
        const pending = page.standing === "open" && i >= picked;
        return `<article class="dcard" data-card="${i}"${pending ? " data-pending" : ""}${readOnly ? " inert" : ""} tabindex="-1">
      <p class="dq">${esc(card.q)}</p>
      ${gone.byCard[i] ? goneWell(gone.byCard[i]) : ""}
      <div class="dopts">${card.options.map((o, j) => option(o, { chosen: j === chosen, recommended: j === card.rec })).join("")}</div>
      ${note ? `<p class="dnote"><span class="mark-text">Your note:</span> ${esc(note)}</p>` : ""}
    </article>`;
      })
      .join("")}
    ${footOf(page)}
  </div>`;
}

/** A canvas a page names, opened: where it lives and the page it came from. */
export function canvasView(title, cfg) {
  const c = CANVASES[title];
  const { open } = grouped(cfg);
  return `<div class="dpage" data-canvas="${esc(title)}" data-list-root data-open-count="${open.length}">
    ${back(titleOf(c.from), `data-back-to="${c.from}"`)}
    <header class="dhead"><h3 class="dtitle" data-dtitle>${esc(title)}</h3><p class="dmeta">${pieces(["Canvas", `made ${c.made} ago`, `named on ${esc(titleOf(c.from))}`])}</p></header>
    <div class="canvas-well"><span class="gone-mark">${ic("canvas", "lg")}</span><p>The canvas opens here, beside the page that names it.</p></div>
  </div>`;
}

/* ------------------------------------------------------------- entry */

export function pane(cfg, phone = false, query = null) {
  if (cfg.canvas) {
    return canvasView(cfg.canvas, cfg);
  }
  if (cfg.page) {
    return pageView(cfg.page, cfg);
  }
  if (query !== null) {
    return query.trim() ? searchState(cfg, phone, query) : listState(cfg, phone);
  }
  switch (cfg.state) {
    case "search":
      return searchState(cfg, phone, QUERY);
    case "nomatch":
      return noMatch(cfg, phone, NO_MATCH);
    case "loading":
      return loading(phone);
    case "failure":
      return failure();
    case "first":
      return firstUse();
    default:
      return listState(cfg, phone);
  }
}

/** The badge on the Decisions tab: the Needs you group's count, absent at 0 or while unknown. */
export function badgeOf(cfg) {
  if (["loading", "failure", "first"].includes(cfg.state)) {
    return 0;
  }
  return grouped(cfg).open.length;
}
