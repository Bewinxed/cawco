import { error } from "@sveltejs/kit";
import { dev } from "$app/env";

export const ssr = false;

/** A preview for the dev server only; a built dashboard has no such page. */
export const load = () => {
  if (!dev) {
    error(404, "Not found");
  }
};
