// house/no-clip-with-move: no animation effect cuts an element (clip-path)
// and moves it (transform, translate, scale, rotate) at once.
//
// Chromium (156.0.8078.4 and main of 2026-10-24) keeps a clip-path
// animation's compositing decision on its element and holds the animation
// weakly. An effect that cuts and moves is taken off the compositor whole when
// a later animation of the same move property starts on the element, the
// decision is never reset, and once the effect is collected the element's
// next pre-paint fails CHECK(GetClipPathAnimation(layout_object))
// (ClipPathClipper::HasCompositeClipPathAnimation): the renderer dies with
// SIGTRAP (be431e3dd; crbug-clip-path-check). A cut in an effect of its own,
// on the same timing, moves the same and is never the one displaced.
//
// What the rule reads in a script (a `.ts` file, a `.svelte` file's
// scripts and markup expressions):
// - a keyframe object literal naming `clipPath` beside a move;
// - CSS text (a string or template literal, as a Svelte transition's `css`
//   returns) declaring `clip-path:` beside a move;
// - a `clipPath` written into an object after it is made, other than an
//   element's `style`: a keyframe built so can't be read here, so a cut's
//   keyframes are their own literal.
// A stylesheet's @keyframes are style-greps.ts's to read.
import { eachNode } from "./model.mjs";

const CLIP = new Set(["clipPath", "clip-path"]);
const MOVES = new Set(["transform", "translate", "scale", "rotate"]);
const CSS_CLIP = /(?<![\w-])clip-path\s*:/u;
const CSS_MOVE = /(?<![\w-])(?:transform|translate|scale|rotate)\s*:/u;

const MESSAGE =
  "An animation effect never cuts (clip-path) and moves (transform, translate, scale, rotate) at once: Chromium kills the renderer once a later move displaces it (scripts/lint/design/clip-move.mjs). Animate the cut as its own effect on the same timing.";
const BUILT =
  "A keyframe's clip-path is written in its own keyframe literal, never into an object after it is made, so no effect can be seen cutting and moving at once (scripts/lint/design/clip-move.mjs).";

/** A property's name as written: `a`, `"a"`, never a computed one. */
const keyOf = (property) => {
  if (property.type !== "Property" || property.computed) {
    return null;
  }
  const { key } = property;
  return key.type === "Identifier" ? key.name : key.value;
};

/** The text a string or template literal holds, its holes as nothing. */
const textOf = (node) => {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(" ");
  }
  return null;
};

/** Whether `node` is an element's `style` (`el.style`, `node.style`). */
const isStyle = (node) =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.property.name === "style";

/** The name a member is written to as: `a.clipPath`, `a["clipPath"]`. */
const memberName = (node) => {
  if (node.type !== "MemberExpression") {
    return null;
  }
  return node.computed ? node.property.value : node.property.name;
};

/** What `node` breaks, by its shape: none, a cut beside a move, or a cut written in after. */
function breaks(node) {
  if (node.type === "ObjectExpression") {
    const keys = node.properties.map(keyOf);
    return keys.some((k) => CLIP.has(k)) && keys.some((k) => MOVES.has(k))
      ? MESSAGE
      : null;
  }
  const text = textOf(node);
  if (text !== null) {
    return CSS_CLIP.test(text) && CSS_MOVE.test(text) ? MESSAGE : null;
  }
  if (node.type === "AssignmentExpression") {
    const { left } = node;
    return CLIP.has(memberName(left)) && !isStyle(left.object) ? BUILT : null;
  }
  return null;
}

export function clipWithMove(model) {
  const findings = [];
  eachNode(model, (node) => {
    const message = breaks(node);
    if (message) {
      // A cut written in after is reported on what it is written to.
      const at = message === BUILT ? node.left : node;
      findings.push({ start: at.start, end: at.end, message });
    }
  });
  return findings;
}
