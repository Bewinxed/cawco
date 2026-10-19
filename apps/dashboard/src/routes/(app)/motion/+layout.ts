import { error } from "@sveltejs/kit";

// The benches: under `vite dev`, and in the probe kit's build (`vite build
// --mode bench`, scripts/probe-kit/kit.ts), which times them as built. A
// shipped dashboard answers 404 here.
export function load() {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "bench")) {
    error(404, "Not found");
  }
}
