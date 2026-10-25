/*
 * The Workflows tab's own ledger, shared by every option: a row per workflow,
 * opened in place under its row (as RoutineDetail opens today).
 */
import { block, btn, esc, glyph, ic } from "./parts.js";

const WORKFLOWS = [
  {
    name: "Reply shortlist",
    meta: "5 steps · research, low · x-use",
    v: 3,
    state: "needs",
    last: "run 7 · 4m ago",
    runs: 7,
    score: "5 of 6",
  },
  {
    name: "Milestone check",
    meta: "2 steps · low · x-use",
    v: 1,
    state: "failed",
    last: "Oct 19",
    runs: 1,
    score: "0 of 1",
  },
];

export const wfRow = (w, { open = false, more = "" } = {}) =>
  `<tr${open ? ' class="open"' : ""}><td class="lead">${glyph(w.state)}</td><td><span class="rowname"><span class="name trunc">${esc(w.name)}</span><span class="meta trunc">${w.meta}</span></span></td><td class="num">v${w.v}</td><td class="num">${w.last}</td><td class="num">${w.runs}</td><td class="num">${w.score}</td><td class="end" style="overflow:visible;position:relative">${btn("", { v: "ghost", size: "sm", icon: "more" })}${more}</td></tr>`;

/**
 * The ledger: `open` is the well drawn under the first row, `more` a menu on
 * its ⋯, `rows` the workflows it lists.
 */
export const wfLedger = ({
  open = "",
  more = "",
  rows = WORKFLOWS,
  head = true,
} = {}) => {
  const body = rows
    .map((w, i) => {
      const row = wfRow(w, {
        open: i === 0 && Boolean(open),
        more: i === 0 ? more : "",
      });
      return i === 0 && open
        ? `${row}<tr class="open"><td colspan="7" style="padding:0;block-size:auto;white-space:normal">${open}</td></tr>`
        : row;
    })
    .join("");
  const table = `<div class="card" style="overflow:visible"><table class="ledger">
    <colgroup><col style="width:28px"><col><col style="width:44px"><col style="width:132px"><col style="width:64px"><col style="width:88px"><col style="width:44px"></colgroup>
    <thead><tr><th class="lead"><span class="sr-only">State</span></th><th>Workflow</th><th>v</th><th>Last run</th><th>Runs</th><th>Checks</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
  if (!head) {
    return table;
  }
  return block({
    icon: "workflow",
    title: "Workflows",
    count: String(rows.length),
    acts: `${btn("Ask Caw", { v: "ghost", size: "sm" })}${btn("Create workflow", { size: "sm", icon: "plus" })}`,
    body: table,
  });
};

/** The phone's list of workflows: two-line rows. */
export const wfPhoneList = ({ open = "" } = {}) =>
  `<div class="pcard">${WORKFLOWS.map(
    (w, i) =>
      `<div class="prow">${glyph(w.state)}<span class="t trunc">${w.name}</span><span class="r num">v${w.v}</span><span class="m">${w.last} · ${w.runs} runs · checks ${w.score}</span></div>${i === 0 ? open : ""}`
  ).join("")}</div>`;

export const inputsLine = (extra = "") =>
  `<span class="row-wrap"><span class="meta">Inputs</span><span class="field" style="min-block-size:26px"><span class="mono">account</span><span class="ph">cawcodev</span></span>${extra}</span>`;

export const versionLine = (acts) =>
  `<div class="row-wrap" style="justify-content:space-between"><span class="meta num">${ic("runs", "sm")} v3 · saved 2m ago · 7 runs</span><span class="acts">${acts}</span></div>`;
