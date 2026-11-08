/**
 * The generated `tokens.css` every page we serve shares: the decision-page
 * kit's copy of the dashboard's tokens, built by `bun run tokens` (its path
 * here is what that build writes to, and what every reader reads).
 */
import { readFileSync } from "node:fs";

/** Where the generated kit `tokens.css` lives. */
export const KIT_TOKENS_PATH = new URL(
  "../../hub/skills/decision-page/kit/tokens.css",
  import.meta.url
).pathname;

/** The kit's `tokens.css` as it is built: read by the bundles that carry it (a Bun macro, so they embed it at build time). */
export const kitTokensCss = (): string => readFileSync(KIT_TOKENS_PATH, "utf8");
