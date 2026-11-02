/**
 * The kit's dropdown menu under review: a states file of one story and no
 * machine, the design graph's one-state case (the stage alone, nothing to
 * step through).
 */

// biome-ignore lint/performance/noNamespaceImport: a states file is read whole: each of its exports is a story.
import * as MenuStates from "../../components/ui/dropdown-menu/dropdown-menu.stories";
import menuSource from "../../components/ui/dropdown-menu/dropdown-menu.stories.ts?raw";
import type { ReviewInput } from "./model";

export const menu: ReviewInput = {
  file: "apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu.stories.ts",
  module: MenuStates as unknown as ReviewInput["module"],
  source: menuSource,
};
