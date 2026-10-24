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
    "Two agents wait on him: each card takes the spark band and moves to the top of Review. Answer on the card: Deny or Approve the push, or Answer the question. Press Ask Caw for his column.",
  open: "The pane opens on tsk-16 with its question standing: answer it with a chip, then Approve → Done takes the coral. Or press Send back.",
  empty: "An empty project: press a suggestion, then Send.",
  fault: "The hub refused the read: press Retry, or Show details.",
  first:
    "A project with no thread yet: Caw's column opens on his first-thread recipe. Press a starter, then Send.",
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

const ONE = matchMedia("(width < 1100px)");

const fit = () => {
  for (const screen of $$(".screen")) {
    const width = Number(screen.style.getPropertyValue("--w"));
    const room = screen.parentElement.clientWidth - 2;
    const desk = screen.closest('[data-frame="desk"]');
    /* One frame at a time: the Desk keeps its own size and pans. */
    const scale = ONE.matches && desk ? 1 : Math.min(1, room / width);
    screen.style.setProperty("--s", String(scale));
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
  if (input.name === "frame") {
    for (const figure of $$(".frame")) {
      figure.toggleAttribute("data-shown", figure.dataset.frame === input.value);
    }
    fit();
    return;
  }
  send();
});

$('[data-act="replay"]').addEventListener("click", send);

ONE.addEventListener("change", fit);

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
