/**
 * The switch page: one switch per choice the owner makes (H, D, P, C, the
 * K fork, F, S), Today, the width and what the frame shows, written into the
 * frame's hash (frame.js draws it). Picking an option shows it: C and K show
 * a board where something waits, K and S open what they change, F shows the
 * failed read, P a phone, D a desk. The choice is kept through a reload.
 */
const SIZES = { 1440: [1440, 900], 1037: [1037, 760], 390: [390, 844] };

const SWITCHES = [
  {
    key: "w",
    name: "Width",
    options: [
      ["1440", "Desk 1440"],
      ["1037", "His window 1037 × 760"],
      ["390", "Phone 390"],
    ],
  },
  { key: "today", name: "Today", options: [["0", "The options"], ["1", "Today (live capture)"]] },
  {
    key: "state",
    name: "His board",
    options: [
      ["rest", "As it is today"],
      ["waits", "Something waits (drawn)"],
      ["stale", "The hub didn't answer (drawn)"],
    ],
  },
  {
    key: "open",
    name: "Open beside",
    options: [
      ["none", "Nothing"],
      ["pane", "Task pane (tsk-16)"],
      ["caw", "Caw's column"],
    ],
  },
  { key: "view", name: "View", options: [["Board", "Board"], ["Table", "Table (T1)"]] },
  { key: "H", name: "H · the head", options: [["H1", "H1 one bar"], ["H2", "H2 bar over a shelf"]] },
  { key: "D", name: "D · desk board", options: [["D1", "D1 fit, strip when not"], ["D2", "D2 strip always"]] },
  { key: "P", name: "P · phone board", options: [["P1", "P1 strip over one stage"], ["P2", "P2 one grouped list"]] },
  { key: "C", name: "C · needs-you card", options: [["C1", "C1 mark and ask"], ["C2", "C2 plus Deny, Approve"]] },
  { key: "K", name: "K · pane opens", options: [["top", "K1-top at the title"], ["review", "K1-review on the Result"]] },
  { key: "F", name: "F · failure", options: [["F1", "F1 the band"], ["F2", "F2 the mark"]] },
  { key: "S", name: "S · Caw's starters", options: [["S1", "S1 a stack"], ["S2", "S2 a row on the composer"]] },
];

/** What picking a part's option also sets, so the option is in view. */
const SHOWS = {
  C: { state: "waits", open: "none", view: "Board", today: "0" },
  K: { state: "waits", open: "pane", today: "0" },
  F: { state: "stale", today: "0" },
  S: { open: "caw", today: "0" },
  P: { w: "390", view: "Board", today: "0" },
  D: { view: "Board", today: "0" },
  H: { today: "0" },
};

const DEFAULTS = {
  w: "1440",
  today: "0",
  state: "rest",
  open: "none",
  view: "Board",
  H: "H1",
  D: "D2",
  P: "P1",
  C: "C1",
  K: "review",
  F: "F1",
  S: "S2",
};

const STORE = "project-options:choice";
let choice = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") };

function notes() {
  const lines = [];
  if (choice.today === "1") {
    lines.push("Today: the live page as it was captured, on the same data.");
  }
  if (choice.state === "waits") {
    lines.push(
      "Drawn for the state: tsk-17's session asks you (today tsk-17 is Ready with no attempt); its ask has no record, so it stands as «the session's ask, in its words».",
      "Drawn for the state: tsk-16 handed in for review on 16 Oct (today it is Done; every word is its record's)."
    );
  }
  if (choice.state === "stale") {
    lines.push(
      "Drawn for the state: the hub answering 502, its retry clock (12 s) and the time the board last read (14:02); tsk-3's file not reading."
    );
  }
  if (choice.open === "pane") {
    lines.push(
      "The pane shows tsk-16 as if it stood in Review. The hub recorded no diff for it, so it has no Changes section."
    );
  }
  return lines;
}

function draw() {
  localStorage.setItem(STORE, JSON.stringify(choice));
  const box = document.querySelector("[data-switches]");
  box.innerHTML = SWITCHES.map(
    (one) => `<div class="po-switch" role="radiogroup" aria-label="${one.name}">
      <span>${one.name}</span>
      <div>${one.options
        .map(
          ([value, label]) =>
            `<button type="button" role="radio" data-key="${one.key}" data-value="${value}" aria-checked="${choice[one.key] === value}">${label}</button>`
        )
        .join("")}</div>
    </div>`
  ).join("");
  const said = notes();
  document.querySelector("[data-notes]").innerHTML = said.length
    ? `<ul>${said.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "";
  const frame = document.querySelector("[data-frame]");
  const [width, height] = SIZES[choice.w];
  frame.style.inlineSize = `${width}px`;
  frame.style.blockSize = `${height}px`;
  const room = document.querySelector("[data-stage]").clientWidth;
  const scale = Math.min(1, room / width);
  frame.style.scale = String(scale);
  document.querySelector("[data-stage]").style.blockSize = `${height * scale}px`;
  const hash = new URLSearchParams(choice).toString();
  frame.contentWindow?.location.replace(`frame.html#${hash}`);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-key]");
  if (!button) {
    return;
  }
  const { key, value } = button.dataset;
  choice = { ...choice, [key]: value, ...(SHOWS[key] ?? {}) };
  if (key === "D" && choice.w === "390") {
    choice.w = "1440";
  }
  draw();
});
window.addEventListener("resize", draw);
draw();
