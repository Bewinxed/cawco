/**
 * Each `cawco:` reference's face, as the dashboard framing the page said it
 * (core reference-faces.ts, `cawco:reference-faces` through the overlay):
 * the faces of the references the page's program names, a set the hub read
 * off the program it keeps. The page names nothing to its host. A reference
 * with no face (none said, the dashboard knows nothing by it, or no
 * dashboard frames the page) draws as its label alone.
 */
import {
  REFERENCE_FACES,
  type ReferenceFace,
  referenceFacesOf,
} from "@cawco/core/reference-faces";
import { SvelteMap } from "svelte/reactivity";

/** Each reference's face, as the host said it last. */
const faces = new SvelteMap<string, ReferenceFace | null>();

addEventListener(REFERENCE_FACES, (event) => {
  const said = referenceFacesOf(
    (event as CustomEvent<{ faces?: unknown } | null>).detail?.faces
  );
  for (const [href, face] of Object.entries(said)) {
    faces.set(href, face);
  }
});

/** The face `href` draws with now; null: its label alone. */
export const referenceFaceOf = (href: string): ReferenceFace | null =>
  faces.get(href) ?? null;
