import { error } from "@sveltejs/kit";

// The artifact panel's bar symbols in one face, for the owner's pick: only
// under `vite dev` (a built dashboard answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
