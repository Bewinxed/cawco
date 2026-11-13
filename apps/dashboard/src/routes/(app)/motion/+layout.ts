import { error } from "@sveltejs/kit";

// The benches: under `vite dev`, and in a `vite build --mode bench`, which
// times them as built. A shipped dashboard answers 404 here.
export function load() {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "bench")) {
    error(404, "Not found");
  }
}
