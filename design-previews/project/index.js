/*
 * The preview page: the shared state switcher (state-switcher.js) posts the
 * state, the phone fork or the scheme to both frames, and each frame is
 * scaled to the width it has (the page inside stays at its own width, 1440
 * or 390, so its layout is the real one).
 */

import { mountStateSwitcher } from "./state-switcher.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [
  ...scope.querySelectorAll(selector),
];

const HINTS = {
  rest: "At rest with work going: Working shows each agent's current step, Review shows what was handed in.",
  waiting:
    "Two agents wait on him: each card takes the spark band and moves to the top of Review. Answer on the card: Deny or Approve the push, or Answer the question. Press Ask Caw for his column.",
  open: "The pane opens on tsk-16 with its question standing: answer it with a chip, then Approve → Done takes the coral. Or press Send back.",
  empty: "An empty project: press a suggestion, then Send.",
  fault: "The hub refused the read: press Retry, or Show details.",
  first:
    "A project with no thread yet: Caw's column opens on his first-thread recipe. Press a starter, then Send.",
};

const frames = () => $$(".screen iframe");

const post = (message) => {
  for (const frame of frames()) {
    frame.contentWindow?.postMessage(message, "*");
  }
};

const ONE = matchMedia("(width < 1100px)");

/** The switcher's groups: Frame only where one frame stands at a time. */
const groupsOf = () => [
  {
    key: "state",
    label: "State",
    states: [
      { value: "rest", label: "At rest" },
      { value: "waiting", label: "Waiting on you" },
      { value: "open", label: "Task open" },
      { value: "empty", label: "Empty project" },
      { value: "fault", label: "Read failure" },
      { value: "first", label: "Caw's first thread" },
    ],
  },
  {
    key: "layout",
    label: "Phone board",
    states: [
      { value: "list", label: "One grouped list · recommended" },
      { value: "columns", label: "Desk columns sideways" },
    ],
  },
  {
    key: "scheme",
    label: "Scheme",
    states: [
      { value: "light", label: "Day" },
      { value: "dark", label: "Night" },
    ],
  },
  ...(ONE.matches
    ? [
        {
          key: "frame",
          label: "Frame",
          initial: "phone",
          states: [
            { value: "desk", label: "Desk" },
            { value: "phone", label: "Phone" },
          ],
        },
      ]
    : []),
];

const switcher = mountStateSwitcher({
  // The desk frame scales to the stage; the phone's 390 beside or under it.
  width: 1160,
  axes: true,
  label: "Project page states",
  groups: groupsOf,
  onchange: (next, previous) => {
    if (next.scheme !== previous.scheme) {
      paintScheme(next.scheme);
      post({ scheme: next.scheme });
    }
    if (next.layout !== previous.layout) {
      post({ layout: next.layout });
    }
    if (next.frame !== previous.frame) {
      showFrame(next.frame);
    }
    if (next.state !== previous.state) {
      send();
    }
  },
});
const pick = (name) => switcher.state[name];

function paintScheme(scheme) {
  document.documentElement.classList.toggle("dark", scheme === "dark");
  document.documentElement.classList.toggle("light", scheme !== "dark");
}

function showFrame(frame) {
  for (const figure of $$(".frame")) {
    figure.toggleAttribute("data-shown", figure.dataset.frame === (frame ?? "phone"));
  }
  fit();
}

const fit = () => {
  for (const screen of $$(".screen")) {
    const width = Number(screen.style.getPropertyValue("--w"));
    const room = screen.parentElement.clientWidth - 2;
    const desk = screen.closest('[data-frame="desk"]');
    /* One frame at a time: the Desk keeps its own size and pans. */
    const scale = ONE.matches && desk ? 1 : Math.min(1, room / width);
    screen.style.setProperty("--s", String(scale));
  }
};

const send = () => {
  const state = pick("state");
  $('[data-slot="hint"]').textContent = HINTS[state] ?? "";
  post({ scheme: pick("scheme"), layout: pick("layout"), state });
};

$('[data-act="replay"]').addEventListener("click", send);

ONE.addEventListener("change", () => {
  switcher.refresh();
  showFrame(switcher.state.frame);
});

let fitting = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(fitting);
  fitting = requestAnimationFrame(fit);
}).observe(document.body);

let loaded = 0;
for (const frame of frames()) {
  frame.addEventListener("load", () => {
    loaded += 1;
    if (loaded === frames().length) {
      send();
    }
  });
}

paintScheme(pick("scheme"));
showFrame(pick("frame"));
document.fonts.ready.then(fit);
$('[data-slot="hint"]').textContent = HINTS[pick("state")] ?? "";
