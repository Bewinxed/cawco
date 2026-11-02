import { error } from "@sveltejs/kit";

// The design graph's own page: client-only (its stage mounts components
// live), and only under `vite dev` or the probe kit's bench build.
export const ssr = false;

export function load() {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "bench")) {
    error(404, "Not found");
  }
}
