import { Alignment, Fit, Layout, Rive, RuntimeLoader } from "@rive-app/canvas";

RuntimeLoader.setWasmUrl("/assets/rive.wasm");
RuntimeLoader.setWasmFallbackUrl(null);
const root = document.documentElement;
const scheme = matchMedia("(prefers-color-scheme: dark)");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let dark = scheme.matches;
let paused = motion.matches;
let mascot: Rive | undefined;
const themeButton = document.querySelector<HTMLButtonElement>(".theme-control");
const motionButton = document.querySelector<HTMLButtonElement>(".motion-control");

function syncAppearance() {
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
  themeButton?.setAttribute("aria-label", `Use ${dark ? "light" : "dark"} appearance`);
  const model = mascot?.viewModelInstance;
  const darkProperty = model?.boolean("dark");
  if (darkProperty) darkProperty.value = dark;
}
function syncMotion() {
  const property = mascot?.viewModelInstance?.boolean("reducedMotion");
  if (property) property.value = paused;
  motionButton?.setAttribute("aria-label", `${paused ? "Play" : "Pause"} motion`);
  motionButton?.setAttribute("aria-pressed", String(paused));
  const label = motionButton?.querySelector("span");
  if (label) label.textContent = paused ? "Play motion" : "Pause motion";
}
themeButton?.addEventListener("click", () => { dark = !dark; syncAppearance(); });
motionButton?.addEventListener("click", () => { paused = !paused; syncMotion(); });
scheme.addEventListener("change", () => { dark = scheme.matches; syncAppearance(); });
motion.addEventListener("change", () => { paused = motion.matches; syncMotion(); });
syncAppearance();
syncMotion();

const canvas = document.querySelector<HTMLCanvasElement>(".caw canvas");
const holder = canvas?.parentElement;
if (canvas && holder) {
  mascot = new Rive({
    canvas,
    src: `/caw/${holder.dataset.caw}.riv`,
    artboard: "Caw",
    stateMachines: "CawStates",
    autoBind: true,
    autoplay: true,
    shouldDisableRiveListeners: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    onLoad: () => {
      mascot?.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio, 2));
      syncAppearance();
      syncMotion();
      holder.dataset.loaded = "true";
    },
    onLoadError: () => console.error("Caw could not load."),
  });
  new ResizeObserver(() => mascot?.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio, 2))).observe(holder);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) mascot?.stopRendering(); else mascot?.startRendering();
  });
  window.addEventListener("pagehide", () => mascot?.cleanup(), { once: true });
}

const dialog = document.querySelector<HTMLDialogElement>(".store-dialog");
document.querySelector<HTMLAnchorElement>('[data-store="app-store"]')?.addEventListener("click", (event) => {
  const link = event.currentTarget as HTMLAnchorElement;
  if (link.getAttribute("href") !== "#") return;
  event.preventDefault();
  dialog?.showModal();
});
document.querySelectorAll(".close-dialog, .close-action").forEach((button) => { button.addEventListener("click", () => dialog?.close()); });
dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
