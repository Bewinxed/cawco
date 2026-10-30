import { error } from "@sveltejs/kit";

// The design graph's preview (scripts/design-graph-preview.ts): client-only,
// under `vite dev` or the bench build alone; a shipped dashboard answers 404.
export const ssr = false;

export function load() {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "bench")) {
    error(404, "Not found");
  }
}
