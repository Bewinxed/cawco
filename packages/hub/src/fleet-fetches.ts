/**
 * The hub's own ear on its `fleet.fetch` announcements. A skill, plugin or
 * marketplace fetch runs after the request that asked for it has answered
 * (fleet-sources.ts `fetchSkill`, `fetchPlugins`, `readMarketplaceSource`,
 * `linkMarketplace`); dashboards learn what came of it from the frame, and an
 * agent's admin tool (admin-tools.ts) from here, in the same process.
 */
import { EventEmitter, on } from "node:events";
import type { FleetFetchFrame } from "@cawco/core/frames";
import { answered } from "./mcp-tool";
import type { AnyProblem } from "./refusal";

/** What one announcement carries: the frame less its kind. */
export type FetchNews = Omit<FleetFetchFrame, "kind" | "instanceId">;

/** The announcements, as events of one name, for {@link landedFetch} to read. */
const fetches = new EventEmitter();
// Each request waiting on a landing listens while it waits; there is no leak to warn of.
fetches.setMaxListeners(0);

/** Tells every waiter what a fetch came to; server.ts calls it beside each broadcast. */
export const heardFetch = (news: FetchNews): void => {
  fetches.emit("news", news);
};

/**
 * Asks for a fetch and resolves with what `pick` reads off the announcement
 * that lands it. The request answers with `fetching` first; the landing
 * announcement may come before that answer, so the announcements are read
 * from before the request goes (`on` holds each one heard until it is read).
 */
export const landedFetch = async <T extends { fetching?: boolean }>(
  pick: (news: FetchNews) => T | undefined,
  ask: () => Promise<T | AnyProblem>
): Promise<T | AnyProblem> => {
  const heard = on(fetches, "news");
  try {
    const row = await ask();
    // A request the hub refused lands nothing.
    if (!(answered(row) && row.fetching)) {
      return row;
    }
    for await (const [news] of heard) {
      const landed = pick(news);
      if (landed && !landed.fetching) {
        return landed;
      }
    }
    throw new Error("the fetch announcements ended");
  } finally {
    await heard.return?.();
  }
};
