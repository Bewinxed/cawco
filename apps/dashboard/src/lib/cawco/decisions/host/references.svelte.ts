/**
 * The `cawco:` references the page's words draw (core reference-faces.ts),
 * and each one's face as the dashboard framing the page said it: the page
 * reads none of the dashboard's store, so it names its references to the
 * overlay (`cawco:references`, a `window` event), which tells its host, and
 * the host's faces come back the same way (`cawco:reference-faces`). A
 * reference with no face (none said, the dashboard knows nothing by it, or
 * the page stands where no dashboard frames it) draws as its label alone.
 */
import {
  REFERENCE_FACES,
  REFERENCES_DRAWN,
  type ReferenceFace,
  referenceFacesOf,
} from "@cawco/core/reference-faces";
import { SvelteMap } from "svelte/reactivity";

/** How many chips draw each reference now. */
const drawing = new Map<string, number>();
/** Each reference's face, as the host said it last. */
const faces = new SvelteMap<string, ReferenceFace | null>();
let telling = false;

/** Tells the overlay the references drawn now, once for every chip that came or went in this task. */
function tell(): void {
  if (telling) {
    return;
  }
  telling = true;
  queueMicrotask(() => {
    telling = false;
    dispatchEvent(
      new CustomEvent(REFERENCES_DRAWN, {
        detail: { hrefs: [...drawing.keys()] },
      })
    );
  });
}

addEventListener(REFERENCE_FACES, (event) => {
  const said = referenceFacesOf(
    (event as CustomEvent<{ faces?: unknown } | null>).detail?.faces
  );
  for (const [href, face] of Object.entries(said)) {
    faces.set(href, face);
  }
});

/** A chip of `href` stands from now until the answer is called. */
export function drawReference(href: string): () => void {
  const before = drawing.get(href) ?? 0;
  drawing.set(href, before + 1);
  if (before === 0) {
    tell();
  }
  return () => {
    const left = (drawing.get(href) ?? 1) - 1;
    if (left > 0) {
      drawing.set(href, left);
      return;
    }
    drawing.delete(href);
    tell();
  };
}

/** The face `href` draws with now; null: its label alone. */
export const referenceFaceOf = (href: string): ReferenceFace | null =>
  faces.get(href) ?? null;
