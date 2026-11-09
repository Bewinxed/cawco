/**
 * The generated `tokens.css` every page we serve shares: the dashboard's
 * tokens as the pages carry them. `bun run tokens` writes it beside this
 * file, and the same bytes as the decision-page skill's kit (the copy the
 * skill ships), so the overlay and canvas host read it here without knowing
 * where the hub keeps its skills.
 */
import { readFileSync } from "node:fs";

/** Where the generated kit `tokens.css` lives. */
export const KIT_TOKENS_PATH = new URL("./kit-tokens.css", import.meta.url)
  .pathname;

/** The kit's `tokens.css` as it is built: read by the bundles that carry it (a Bun macro, so they embed it at build time). */
export const kitTokensCss = (): string => readFileSync(KIT_TOKENS_PATH, "utf8");
