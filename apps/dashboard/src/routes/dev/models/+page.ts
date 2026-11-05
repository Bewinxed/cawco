import { error } from "@sveltejs/kit";

// Models CawCo uses, previewed: no hub, and only under `vite dev` (a built
// dashboard answers 404 here). Rendered on the server as /config/models is,
// so the first paint is the page's frame, not a blank document.

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
