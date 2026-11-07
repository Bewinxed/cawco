import { error } from "@sveltejs/kit";

// Shaping frames for Who decides: throwaway, dev only, no hub.
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
