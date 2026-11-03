import { error } from "@sveltejs/kit";

// The setup page's bench: client-only, with no hub, and only under
// `vite dev` (a built dashboard answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
