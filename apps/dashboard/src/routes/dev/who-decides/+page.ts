import { error } from "@sveltejs/kit";

// Who decides whole on its fixtures, for judging and trying without a hub:
// client-only, and only under `vite dev` (a built dashboard answers 404).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
