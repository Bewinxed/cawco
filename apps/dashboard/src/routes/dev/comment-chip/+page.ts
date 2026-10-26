import { error } from "@sveltejs/kit";

// The comment chip's bench: client-only, on his real threads held in the page,
// and only under `vite dev` (a built dashboard answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
