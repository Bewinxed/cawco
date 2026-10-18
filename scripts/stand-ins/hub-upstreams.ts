/**
 * packages/hub/src/upstreams.ts as a scratch fleet's hub has it (preload.ts
 * puts it in that module's place): each value the spec set on the fleet's
 * stand-ins (index.ts), else the product's own. It exports every name that
 * module does.
 */
import { standIns } from "./index";

const asked = standIns();

export const GITHUB_API = asked.githubApi ?? "https://api.github.com";

export const TYPESAFE_URL =
  asked.typesafeUrl ?? "https://api.typesafe.ai/v1/systemone";

export const STARTERS_QUIET_MS = asked.startersPace?.quiet ?? 60_000;

export const STARTERS_GAP_MS = asked.startersPace?.gap ?? 600_000;
