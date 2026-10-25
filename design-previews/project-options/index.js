/**
 * The switch page: one switch per pick the owner makes, Today, the width and
 * what the frame shows, written into the frame's hash (frame.js draws it).
 * Picking an option brings it into view (SHOWS: the state, the width or what
 * stands open that the option needs). The choice is kept through a reload.
 */
const SIZES = { 1440: [1440, 900], 1037: [1037, 760], 390: [390, 844] };

const SWITCHES = [
  {
    key: "w",
    name: "Width",
    options: [
      ["1440", "Desk 1440"],
      ["1037", "Your window 1037 × 760"],
      ["390", "Phone 390"],
    ],
  },
  { key: "today", name: "Today", options: [["0", "The options"], ["1", "Today (live capture)"]] },
  {
    key: "state",
    name: "Your board",
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
  { key: "H", name: "H · the head", options: [["H1", "H1 one bar"], ["H2", "H2′ bar over a bare tab row"]] },
  {
    key: "fold",
    name: "Bar fold, step 2",
    options: [
      ["A", "A the machine's name folds"],
      ["B", "B New task and Filter fold first"],
    ],
  },
  { key: "D", name: "D · desk board", options: [["D1", "D1 fit, strip when not"], ["D2", "D2 strip always"]] },
  { key: "P", name: "P · phone board", options: [["P1", "P1 strip over one stage"], ["P2", "P2 one grouped list"]] },
  {
    key: "T",
    name: "T1 · Done and Dropped",
    options: [
      ["folded", "Folded"],
      ["open", "Open, heads pinned"],
    ],
  },
  { key: "C", name: "C · needs-you card", options: [["C1", "C1 mark and ask"], ["C2", "C2 plus its answers"]] },
  { key: "K", name: "K · pane opens", options: [["top", "K1-top at the title"], ["review", "K1-review on the Result"]] },
  { key: "jump", name: "K · jump strip", options: [["id", "Leads with the id"], ["bare", "No id"]] },
  {
    key: "place",
    name: "Pane and column",
    options: [
      ["B", "B under the page bar"],
      ["A", "A full height, on the bar's line"],
    ],
  },
  {
    key: "narrow",
    name: "Your window with a pane open",
    options: [
      ["beside", "(i) the board in its phone form beside"],
      ["page", "(ii) the pane takes the page"],
    ],
  },
  { key: "F", name: "F · failure", options: [["F1", "F1 the band"], ["F2", "F2 the mark"]] },
  { key: "S", name: "S · Caw's starters (desk)", options: [["S1", "S1 a stack"], ["S2", "S2 chips on the composer"]] },
  {
    key: "seat",
    name: "Caw's seat",
    options: [
      ["idle", "Idle"],
      ["working", "Working (drawn)"],
      ["asking", "Asking (drawn)"],
    ],
  },
  {
    key: "ask",
    name: "Caw asking",
    options: [
      ["a", "(a) a raised wing"],
      ["b", "(b) the tilt and the eyes"],
    ],
  },
];

/** What picking a pick's option also sets, so the option is in view. */
const SHOWS = {
  C: { state: "waits", open: "none", view: "Board", today: "0" },
  K: { state: "waits", open: "pane", today: "0" },
  jump: { state: "waits", open: "pane", K: "review", today: "0" },
  place: { state: "waits", open: "pane", today: "0" },
  narrow: { w: "1037", state: "waits", open: "pane", place: "B", today: "0" },
  fold: { today: "0" },
  F: { state: "stale", today: "0" },
  S: { open: "caw", today: "0" },
  P: { w: "390", view: "Board", today: "0" },
  D: { view: "Board", today: "0" },
  T: { view: "Table", today: "0" },
  H: { today: "0" },
  seat: { today: "0", open: "none" },
  ask: { seat: "asking", today: "0", open: "none" },
};

const DEFAULTS = {
  w: "1440",
  today: "0",
  state: "rest",
  open: "none",
  view: "Board",
  H: "H1",
  fold: "A",
  D: "D2",
  P: "P1",
  T: "folded",
  C: "C1",
  K: "review",
  jump: "id",
  place: "B",
  narrow: "beside",
  F: "F1",
  S: "S2",
  seat: "idle",
  ask: "a",
};

const STORE = "project-options:choice:3";
let choice = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? "{}") };

function notes() {
  const lines = [];
  if (choice.today === "1") {
    lines.push("Today: the live page as it was captured, on the same data.");
  }
  if (choice.state === "waits") {
    lines.push(
      "Drawn for the state: tsk-17's session asks you (today tsk-17 is Ready with no attempt). Its words are the one ask the hub has recorded in Cawco-Dev, Caw's question of 16 Oct in his “Routine · Memory curator” thread; no task's session has a recorded ask, and the hub holds no permission ask, so C2 answers it with that question's own choices.",
      "Drawn for the state: tsk-16 handed in for review on 16 Oct (today it is Done; every word is its record's)."
    );
  }
  if (choice.state === "stale") {
    lines.push(
      "Drawn for the state: the hub answering 502; tsk-3's file not reading. The retry clock runs the dashboard's own schedule (1 s, 2, 4, 8, 16, then every 30 s), and “as of” is when this frame's reads stopped."
    );
  }
  if (choice.open === "pane") {
    lines.push(
      "The pane shows tsk-16 as if it stood in Review. The hub recorded no diff for it, so it has no Changes section."
    );
  }
  if (choice.open === "caw" && choice.w === "390") {
    lines.push("On the phone Caw's sheet draws S2's row whichever starters you pick: S1's stack does not fit the half sheet.");
  }
  if (choice.seat !== "idle") {
    lines.push(
      choice.seat === "working"
        ? "Drawn for the state: Caw in a turn, his seat working."
        : "Drawn for the state: Caw asking, his seat in the asking pose with the needs-you dot (his recorded question of 16 Oct)."
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
  // A desk-only pick moves a phone frame to the desk.
  if (["D", "place", "fold", "S", "narrow"].includes(key) && choice.w === "390") {
    choice.w = "1440";
  }
  draw();
});
window.addEventListener("resize", draw);
draw();
