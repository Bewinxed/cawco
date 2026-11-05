import { error } from "@sveltejs/kit";

// The design graph whole on the routine form with an agent's dials, for its
// design run: client-only (the graph reads the page's own width and frames
// as it is set up), no hub, and only under `vite dev` (a built dashboard
// answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
