import { error } from "@sveltejs/kit";

// Ending a project and bringing one back, previewed: client-only, no hub, and only under `vite dev`
// (a built dashboard answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
