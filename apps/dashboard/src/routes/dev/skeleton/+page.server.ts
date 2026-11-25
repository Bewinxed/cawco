import { error } from "@sveltejs/kit";
import { readSkeletonShapes } from "#lib/components/ui/skeleton/shape.js";
import type { PageServerLoad } from "./$types";

/**
 * The kit's skeletons on a page the server draws, for measuring them as a
 * screen holds them (layout shift, first paint, the light's cost): the
 * shapes each slot last showed come from the request's cookie, and the
 * data streams in `delay` ms later. Only under `vite dev`.
 */
export const load: PageServerLoad = ({ cookies, url }) => {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
  const delay = url.searchParams.get("delay") ?? "600";
  return {
    shapes: readSkeletonShapes(cookies, url),
    // `never`: the data never comes, for measuring the wait itself (and
    // the page's response ends at once).
    arrives:
      delay === "never"
        ? undefined
        : new Promise<true>((done) =>
            setTimeout(() => done(true), Number(delay))
          ),
  };
};
