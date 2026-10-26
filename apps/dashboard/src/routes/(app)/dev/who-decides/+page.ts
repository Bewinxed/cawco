import { error } from "@sveltejs/kit";

// Who decides' bench: client-only, in the shell, against the hub the
// dashboard serves, and only under `vite dev` (a built dashboard answers 404).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
