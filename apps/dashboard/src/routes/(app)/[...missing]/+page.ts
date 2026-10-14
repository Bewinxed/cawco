import { error } from "@sveltejs/kit";

/**
 * A path nothing answers is still the app's: it lands on the group's error
 * page inside the shell, the rail kept, rather than on the bare root.
 */
export function load() {
  error(404, "Not found");
}
