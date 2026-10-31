// Two shapes the dashboard never writes (its former ESLint
// no-restricted-syntax entries, apps/dashboard/eslint.config.mjs):
//
// - house/no-raw-duration-read: a duration token is read in its unit,
//   through motion `dur()`, never as a bare number: the built stylesheet's
//   minifier (Lightning CSS) writes `1000ms` as `1s`, so `parseFloat` of what
//   `getPropertyValue("--dur-…")` returns reads it 1000× short (Preview's wait
//   grace stood at 1ms so). motion/curves is where `dur()` reads them.
// - house/no-dimension-binding: a Svelte dimension binding is a
//   ResizeObserver that writes its state inside the delivery: what that
//   state lays out resizes boxes the delivery has passed ("ResizeObserver
//   loop completed with undelivered notifications", PaneTabs on WebKit,
//   c4313c3d8). The markup half of biome.jsonc's ResizeObserver ban
//   (aca304eaf), which reads no Svelte markup. A site that must write inside
//   the delivery says why in a `golar-ignore-next-line` comment.
// - house/no-scroll-into-view: `scrollIntoView` moves every box round its
//   element on both axes, `overflow: hidden` ones too, a page's column off
//   the foot beside its scroller among them. bring-into-view.ts moves the
//   one axis, through the boxes a person scrolls.
import { eachNode } from "./model.mjs";

const DURATION_TOKEN = /^--dur-/u;
const DIMENSIONS = new Set([
  "offsetHeight",
  "offsetWidth",
  "clientHeight",
  "clientWidth",
  "contentRect",
  "contentBoxSize",
  "borderBoxSize",
  "devicePixelContentBoxSize",
]);

export function rawDurationReads(model) {
  const findings = [];
  eachNode(model, (node) => {
    const callee = node.type === "CallExpression" ? node.callee : null;
    const first = node.arguments?.[0];
    if (
      callee?.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.name === "getPropertyValue" &&
      first?.type === "Literal" &&
      typeof first.value === "string" &&
      DURATION_TOKEN.test(first.value)
    ) {
      findings.push({
        start: node.start,
        end: node.end,
        message:
          "Read a duration token with dur() (lib/cawco/motion/curves.svelte.ts): the built stylesheet writes `1000ms` as `1s`, so its bare number isn't milliseconds.",
      });
    }
  });
  return findings;
}

export function dimensionBindings(model) {
  const findings = [];
  eachNode(model, (node) => {
    if (node.type === "BindDirective" && DIMENSIONS.has(node.name)) {
      findings.push({
        start: node.start,
        end: node.end,
        message:
          "A dimension binding writes inside its ResizeObserver's delivery. Measure with frameObserver ($lib/cawco/frame-observer): `{@attach frameSize((node) => { … })}` reads the size as it mounts and a change in the next frame, as PaneTabs' details height and ModelSection's chosen row do.",
      });
    }
  });
  return findings;
}

export function scrollIntoViews(model) {
  const findings = [];
  eachNode(model, (node) => {
    const callee = node.type === "CallExpression" ? node.callee : null;
    if (
      callee?.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.name === "scrollIntoView"
    ) {
      findings.push({
        start: node.start,
        end: node.end,
        message:
          "scrollIntoView moves every box round the element, sideways too. Use bringIntoView or bringIntoStrip (lib/cawco/bring-into-view.ts), which move one axis.",
      });
    }
  });
  return findings;
}
