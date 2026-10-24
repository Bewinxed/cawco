/*
 * The Decisions tab as report 7932615d §7 draws it: a search field over one
 * raised list whose groups are the pages' standing (Open, Later, Sent,
 * Decided, Closed), one row per page: its mark, its title, the one fact that
 * differs, its age, and on hover the one act it takes. Every state the brief
 * names is a function of `cfg` (the state and the four picks that draw
 * differently), so the desk and the phone draw the same model.
 */
import {
  ALL_SENT,
  MANY_OPEN,
  NO_MATCH,
  PAGES,
  REMOVED,
  REPLACED,
  SEARCH,
  STARTERS,
} from "./data.js";
import { btn, esc, ic, pageChip } from "./parts.js";

const ORCH = "Orchestrate cockpit fleet work";

/** An age as minutes, to sort by last movement. */
export const minutes = (age) => {
  const n = Number.parseFloat(age);
  if (age.endsWith("m")) {
    return n;
  }
  return age.endsWith("h") ? n * 60 : n * 1440;
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The 25 pages as the state stands them. */
export function pagesFor(state) {
  return PAGES.map((page) => {
    if (state === "many" && MANY_OPEN[page.name]) {
      return {
        ...page,
        ...MANY_OPEN[page.name],
        standing: "open",
        heard: undefined,
      };
    }
    if (state === "alldone" && ALL_SENT[page.name]) {
      return {
        ...page,
        ...ALL_SENT[page.name],
        standing: "sent",
        notSent: false,
        quietDays: undefined,
      };
    }
    return page;
  });
}

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

const isQuiet = (page, cfg) =>
  cfg.quiet === "on" && page.standing === "open" && (page.quietDays ?? 0) >= 7;

export function markOf(page, cfg) {
  switch (page.standing) {
    case "open":
      return ring(page.picked, page.cards, isQuiet(page, cfg) ? "quiet" : "live");
    case "later":
      return dashed("later");
    case "sent":
      return ring(page.picked, page.cards, "sent");
    case "decided":
      return page.tasksDone < page.tasks
        ? ring(page.tasksDone, page.tasks, "live")
        : `<span class="g-done" role="img" aria-label="Built">${ic("done")}</span>`;
    default:
      return dashed("gone");
  }
}

/* ------------------------------------------------------------ facts */

const liveDot = '<span class="live-dot breathe" aria-hidden="true"></span>';

function heardFact(page) {
  const figure = `${page.picked} of ${page.cards}`;
  if (page.heard === "working") {
    return `<span data-heard-fact="working">${figure} · ${liveDot}<span>working on it</span></span>`;
  }
  if (page.heard === "unread") {
    return `<span data-heard-fact="unread">${figure} · not read yet</span>`;
  }
  return `<span data-heard-fact="read">${figure} · read</span>`;
}

/** Today's tile pill: the writer session's busyness, "Sent · working". */
const statePill = (page) =>
  `<span class="state-pill" data-tone="live">Sent${page.writer === ORCH ? '<span class="who"> · working</span>' : ""}</span>`;

export function factOf(page, cfg) {
  switch (page.standing) {
    case "open": {
      if (page.newCards) {
        return `<span class="strong">Asked again · ${plural(page.newCards, "new card")}</span> · ${page.picked} of ${page.cards} picked`;
      }
      const parts = [`${page.picked} of ${page.cards} picked`];
      if (page.notes) {
        parts.push(plural(page.notes, "note"));
      }
      if (page.notSent) {
        parts.push('<span class="strong">Not sent</span>');
      }
      if (isQuiet(page, cfg)) {
        parts.push(`<span data-quiet-fact>quiet ${page.quietDays}d</span>`);
      }
      return parts.join(" · ");
    }
    case "later":
      return `${page.picked} of ${page.cards} picked · put aside ${page.asideAgo} ago`;
    case "sent":
      return cfg.heard === "pill"
        ? `<span>${page.picked} of ${page.cards} picked</span>${statePill(page)}`
        : heardFact(page);
    case "decided":
      return page.tasksDone < page.tasks
        ? `${page.decided} decided · <span data-tasks>${page.tasksDone} of ${page.tasks} tasks done</span>`
        : `${page.decided} decided · <span data-tasks>${page.tasks} tasks done</span>`;
    default:
      if (page.closed === "replaced") {
        return `<span class="mark-text">Replaced by</span> ${pageChip(page.by)}`;
      }
      return page.closed === "dropped"
        ? `Withdrawn by you · ${plural(page.kept, "pick")} kept`
        : `Withdrawn · ${plural(page.kept, "pick")} kept`;
  }
}

function actOf(page, cfg) {
  if (page.standing === "open") {
    return btn("Not now", {
      v: "ghost",
      size: "xs",
      icon: "close",
      attrs: 'data-act="not-now"',
    });
  }
  if (page.standing === "later") {
    return btn("Reopen", { v: "ghost", size: "xs", attrs: 'data-act="reopen"' });
  }
  if (page.standing === "sent" && cfg.tasks === "row" && page.picked > 0) {
    return btn("Make tasks", {
      v: "ghost",
      size: "xs",
      attrs: 'data-act="make-tasks"',
    });
  }
  return "";
}

/* -------------------------------------------------------------- rows */

const highlight = (text, query) => {
  const safe = esc(text);
  const q = esc(query ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!q) {
    return safe;
  }
  return safe.replace(new RegExp(`(${q})`, "gi"), '<mark class="hl">$1</mark>');
};

function hitsOf(page, query) {
  const lines = SEARCH.hits[page.name] ?? [];
  if (lines.length === 0) {
    return "";
  }
  return `<div class="hits" data-hits>${lines
    .slice(0, 3)
    .map(
      (line) =>
        `<a class="hit" href="#" data-hit><span class="q">${highlight(line.q, query)}</span><span class="arrow" aria-hidden="true">→</span><span class="a">${highlight(line.a, query)}</span>${line.note ? `<span class="n">· ${highlight(line.note, query)}</span>` : ""}</a>`
    )
    .join("")}</div>`;
}

export function row(page, cfg, { hover = false, query = "" } = {}) {
  const act = actOf(page, cfg);
  const quiet = isQuiet(page, cfg);
  return `<div class="row" data-row data-page="${page.name}" data-standing="${page.standing}"${quiet ? " data-quiet" : ""}${hover ? " data-hover" : ""}>
    <span class="mark" data-mark>${markOf(page, cfg)}</span>
    <a class="title" href="#" data-title data-open-page="${page.name}" title="${esc(page.title)}"><span class="t">${highlight(page.title, query)}</span></a>
    <span class="fact" data-fact>${factOf(page, cfg)}</span>
    <span class="end"><span class="age num">${page.age}</span>${act ? `<span class="act">${act}</span>` : ""}</span>
    ${query === SEARCH.query ? hitsOf(page, query) : ""}
  </div>`;
}

/* ------------------------------------------------------------ groups */

const GROUPS = {
  open: { title: "Open", glyph: "open", ink: "g-attn" },
  later: { title: "Later", glyph: "later", ink: "g-muted" },
  sent: { title: "Sent", glyph: "sent", ink: "g-muted" },
  decided: { title: "Decided", glyph: "done", ink: "g-done" },
  closed: { title: "Closed", glyph: "closed", ink: "g-muted" },
  rest: { title: "Everything else", glyph: "decisions", ink: "g-muted" },
};

/** Sent and Decided fold past six; Everything else past eight; Closed always. */
const SHOWN = { sent: 6, decided: 6, rest: 8 };

const moreWords = (key, hidden, open) => {
  if (open) {
    return "Show fewer";
  }
  return key === "sent" ? `Show ${hidden} more sent` : `Show ${hidden} more`;
};

function group(key, pages, cfg, opts = {}) {
  const g = GROUPS[key];
  const n = pages.length;
  const always = key === "closed" && !opts.unfold;
  const shown = always ? 0 : (SHOWN[key] ?? n);
  const head = pages.slice(0, shown);
  const tail = pages.slice(shown);
  const hoverAt = opts.hover ?? -1;
  const rows = (list, from) =>
    list
      .map((page, i) =>
        row(page, cfg, { hover: from + i === hoverAt, query: opts.query })
      )
      .join("");
  const closedOpen = key === "closed" && opts.unfold;
  const toggle =
    key === "closed" && !opts.query
      ? `<button class="gtoggle" type="button" data-fold-toggle="closed" aria-expanded="${closedOpen}"><span>${closedOpen ? "Hide closed" : "Show closed"}</span><span class="chev">${ic("down", "sm")}</span></button>`
      : "";
  const count = n > 0 ? `<span class="count num">${n}</span>` : "";
  const line = opts.line ? `<p class="gline" data-gline>${opts.line}</p>` : "";
  let body = rows(head, 0);
  if (key === "closed") {
    body = `<div class="fold" data-fold="closed"${closedOpen ? " data-open" : " inert"}><div class="fold-in">${rows(pages, 0)}</div></div>`;
  } else if (tail.length > 0) {
    body += `<div class="fold" data-fold="${key}" inert><div class="fold-in">${rows(tail, shown)}</div></div>
      <button class="more" type="button" data-more="${key}" aria-expanded="false"><span>${moreWords(key, tail.length, false)}</span><span class="chev">${ic("down", "sm")}</span></button>`;
  }
  return `<section class="grp" data-group="${key}" data-count="${n}"${opts.edge ? ` data-edge="${opts.edge}"` : ""}>
    <div class="ghead"><span class="mark">${ic(g.glyph, g.ink)}</span><div class="gtext"><h3><span>${g.title}</span>${count}</h3>${toggle}</div></div>
    ${line}${body}
  </section>`;
}

const byWait = (a, b) => minutes(b.age) - minutes(a.age);
const byMove = (a, b) => minutes(a.age) - minutes(b.age);

/** The groups as the picks draw them, and who counts as Open (the badge). */
export function grouped(cfg) {
  const pages = pagesFor(cfg.state);
  const of = (standing) => pages.filter((p) => p.standing === standing);
  const open = of("open").sort(byWait);
  if (cfg.groups === "two") {
    const rest = pages.filter((p) => p.standing !== "open").sort(byMove);
    return { open, list: [["open", open], ["rest", rest]], pages };
  }
  return {
    open,
    pages,
    list: [
      ["open", open],
      ["later", of("later").sort(byMove)],
      ["sent", of("sent").sort(byMove)],
      ["decided", of("decided").sort(byMove)],
      ["closed", of("closed").sort(byMove)],
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
  const sections = [];
  let liveDone = false;
  for (const [key, group_] of list) {
    if (key !== "open" && key !== "later" && !liveDone) {
      liveDone = true;
      sections.push(
        group(key, group_, cfg, {
          edge: "live",
          unfold: cfg.state === "closed",
          hover:
            !phone && key === "sent" && cfg.state !== "many" && cfg.groups === "five"
              ? 0
              : -1,
        })
      );
      continue;
    }
    const line =
      key === "open" && group_.length === 0
        ? `Nothing waits on you. Agents have ${sentCount} pages; ${decided} are decided.`
        : "";
    sections.push(
      group(key, group_, cfg, {
        line,
        unfold: cfg.state === "closed",
        hover: !phone && key === "open" && cfg.state === "many" ? 0 : -1,
      })
    );
  }
  return `<div class="dl" data-list-root data-open-count="${open.length}">
    ${field({ phone })}
    <div class="list" data-list data-total="${pages.length}">${sections.join("")}</div>
  </div>`;
}

/** What a query finds: a title that holds it, or (for the drawn query) the card lines the hub matched. */
function found(page, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return false;
  }
  if (q === SEARCH.query && page.name in SEARCH.hits) {
    return true;
  }
  return page.title.toLowerCase().includes(q);
}

function searchState(cfg, phone, query = SEARCH.query) {
  const { open, pages } = grouped({ ...cfg, groups: "five" });
  const sections = ["open", "later", "sent", "decided", "closed"]
    .map((key) => [
      key,
      pages.filter((p) => p.standing === key && found(p, query)),
    ])
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) =>
      group(key, list.sort(byMove), cfg, {
        query: query.trim().toLowerCase() === SEARCH.query ? SEARCH.query : query.trim(),
        unfold: true,
      })
    );
  if (sections.length === 0) {
    return noMatch(cfg, phone, query);
  }
  return `<div class="dl" data-list-root data-open-count="${open.length}" data-searching>
    ${field({ value: query, phone })}
    <div class="list" data-list data-total="${pages.length}">${sections.join("")}</div>
  </div>`;
}

function noMatch(cfg, phone, query = NO_MATCH) {
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

const firstUse = () => `<div class="dl" data-list-root data-open-count="0">
  <div class="empty first" data-empty="first">
    <div class="caw-axis" data-caw><img alt="" src="caw/hero.png" width="80" height="80" /></div>
    <h3 class="etitle">No decisions yet</h3>
    <p class="eline">Caw writes a decision page: the choices this project needs you to make, each with its options.</p>
    <ul class="starters" aria-label="Starters">${STARTERS.map(
      (s) =>
        `<li><button class="starter" type="button"><span class="mark-cell">${ic(s.glyph)}</span><span>${esc(s.text)}</span></button></li>`
    ).join("")}</ul>
  </div>
</div>`;

/* ------------------------------------------------------------- pages */

const option = (label, { chosen = false, recommended = false } = {}) =>
  `<span class="dopt"${chosen ? " data-chosen" : ""}><span>${esc(label)}</span>${recommended ? '<span class="rec">Recommended</span>' : ""}</span>`;

const pageHead = (title, meta) => `<div class="dback">${btn("Decisions", { v: "ghost", size: "sm", icon: "left", attrs: "data-back" })}</div>
  <header class="dhead"><h3 class="dtitle" data-dtitle>${esc(title)}</h3><p class="dmeta">${meta}</p></header>`;

function replacedPage() {
  const r = REPLACED;
  const c = r.card;
  return `<div class="dpage" data-dpage="${r.name}" data-list-root data-open-count="2">
    ${pageHead(r.title, `<span class="ring-line">${ring(1, 1, "sent")}</span><span>1 of 1 picked · closed ${r.ago} ago</span>`)}
    <div class="banner" data-banner>
      <span class="mark-cell">${ic("closed")}</span>
      <p><span class="mark-text">Replaced by</span> ${pageChip(r.by)} <span class="mark-text">${r.ago} ago · its picks are kept below</span></p>
      ${btn("Open the new page", { size: "sm", attrs: "data-successor" })}
    </div>
    <article class="dcard" inert>
      <p class="dq">${esc(c.q)}</p>
      <div class="dopts">${c.options.map((o, i) => option(o, { chosen: i === c.chosen, recommended: i === c.recommended })).join("")}</div>
    </article>
  </div>`;
}

function removedPage() {
  const r = REMOVED;
  return `<div class="dpage" data-dpage="${r.name}" data-list-root data-open-count="2">
    ${pageHead(r.title, `<span class="ring-line">${ring(3, 6, "sent")}</span><span>3 of 6 · read · 2 pictures were removed</span>`)}
    ${r.cards
      .map(
        (c) => `<article class="dcard">
      <p class="dq">${esc(c.q)}</p>
      <figure class="gone" data-gone>
        <div class="gone-well">
          <span class="gone-mark">${ic("canvas")}</span>
          <p class="gone-t">Canvas removed</p>
          <p class="gone-l">“${esc(c.gone)}” was deleted ${c.ago} ago.</p>
          ${c.next ? `<p class="gone-l"><span class="mark-text">Its design went on in</span> ${pageChip(c.next)}<span class="mark-text">.</span></p>` : ""}
        </div>
        <figcaption>${esc(c.caption)}</figcaption>
      </figure>
      <div class="dopts">${c.options.map((o, i) => option(o, { chosen: i === c.chosen })).join("")}</div>
    </article>`
      )
      .join("")}
  </div>`;
}

/* ------------------------------------------------------------- entry */

export function pane(cfg, phone = false, query = null) {
  if (query !== null) {
    return query.trim() ? searchState(cfg, phone, query) : listState(cfg, phone);
  }
  switch (cfg.state) {
    case "search":
      return searchState(cfg, phone);
    case "nomatch":
      return noMatch(cfg, phone);
    case "loading":
      return loading(phone);
    case "failure":
      return failure();
    case "first":
      return firstUse();
    case "replaced":
      return replacedPage();
    case "removed":
      return removedPage();
    default:
      return listState(cfg, phone);
  }
}

/** The badge on the Decisions tab: the Open group's count, absent at 0 or while unknown. */
export function badgeOf(cfg) {
  if (["loading", "failure", "first"].includes(cfg.state)) {
    return 0;
  }
  return grouped(cfg).open.length;
}
