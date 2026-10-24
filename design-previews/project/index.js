/*
 * The preview page: each switch posts the state, the phone fork or the
 * scheme to both frames, and each frame is scaled to the width it has (the
 * page inside stays at its own width, 1440 or 390, so its layout is the real
 * one).
 */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [
  ...scope.querySelectorAll(selector),
];

const HINTS = {
  rest: "At rest with work going: Working shows each agent's current step, Review shows what was handed in.",
  waiting:
    "Two agents wait on him: each card takes the spark band and moves to the top of Review; the head line gains “2 need you”. Press “2 need you” to filter.",
  open: "The pane opens on tsk-16. Press an answer chip, then Approve → Done.",
  empty: "An empty project: press a suggestion, then Send.",
  fault: "The hub refused the read: press Retry, or Show details.",
};

const frames = () => $$(".screen iframe");

const pick = (name) => $(`input[name="${name}"]:checked`)?.value;

const post = (message) => {
  for (const frame of frames()) {
    frame.contentWindow?.postMessage(message, "*");
  }
};

const placeThumb = (fieldset) => {
  const thumb = $(".seg-thumb", fieldset);
  const chosen = $("label:has(input:checked)", fieldset);
  if (!(thumb && chosen)) {
    return;
  }
  thumb.style.translate = `${chosen.offsetLeft - 3}px ${chosen.offsetTop - 3}px`;
  thumb.style.width = `${chosen.offsetWidth}px`;
};

const fit = () => {
  for (const screen of $$(".screen")) {
    const width = Number(screen.style.getPropertyValue("--w"));
    const room = screen.parentElement.clientWidth - 2;
    screen.style.setProperty("--s", String(Math.min(1, room / width)));
  }
  for (const fieldset of $$(".seg")) {
    placeThumb(fieldset);
  }
};

const send = () => {
  const state = pick("state");
  $('[data-slot="hint"]').textContent = HINTS[state] ?? "";
  post({ scheme: pick("scheme"), layout: pick("layout"), state });
};

document.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  placeThumb(input.closest(".seg"));
  if (input.name === "scheme") {
    document.documentElement.classList.toggle("dark", input.value === "dark");
    document.documentElement.classList.toggle("light", input.value !== "dark");
    post({ scheme: input.value });
    return;
  }
  if (input.name === "layout") {
    post({ layout: input.value });
    return;
  }
  send();
});

$('[data-act="replay"]').addEventListener("click", send);

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

document.fonts.ready.then(fit);
fit();
$('[data-slot="hint"]').textContent = HINTS.rest;
