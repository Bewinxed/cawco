import { error } from "@sveltejs/kit";

// The page `bun run bones` captures the kit's skeletons from: client-only
// (boneyard reads the boxes the browser lays out), no hub, and only under
// `vite dev` (a built dashboard answers 404 here).
export const ssr = false;

export function load() {
  if (!import.meta.env.DEV) {
    error(404, "Not found");
  }
}
