import { error } from "@sveltejs/kit";

// The artifact panel whole, on real records: client-only (the panel reads
// the page's own width and frames as it is set up), no hub, and only under
// `vite dev` (a built dashboard answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
