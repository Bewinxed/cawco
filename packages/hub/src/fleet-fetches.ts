/**
 * The hub's own ear on its `fleet.fetch` announcements. A skill, plugin or
 * marketplace fetch runs after the request that asked for it has answered
 * (server.ts `fetchSkill`, `fetchPlugins`, `readMarketplaceSource`,
 * `linkMarketplace`); dashboards learn what came of it from the frame, and an
 * agent's admin tool (admin-tools.ts) from here, in the same process.
 */
import type { FleetFetchFrame } from "@cawco/core";

/** What one announcement carries: the frame less its kind. */
export type FetchNews = Omit<FleetFetchFrame, "kind" | "instanceId">;

const listeners = new Set<(news: FetchNews) => void>();

/** Tells every waiter what a fetch came to; server.ts calls it beside each broadcast. */
export const heardFetch = (news: FetchNews): void => {
  for (const listener of listeners) {
    listener(news);
  }
};

/**
 * Asks for a fetch and resolves with what `pick` reads off the announcement
 * that lands it. The request answers with `fetching` first; the landing
 * announcement may come before that answer, so the listener is on before the
 * request goes.
 */
export const landedFetch = <T extends { fetching?: boolean }>(
  pick: (news: FetchNews) => T | undefined,
  ask: () => Promise<T>
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let answered = false;
    let landed: T | undefined;
    const listener = (news: FetchNews): void => {
      const row = pick(news);
      if (!row || row.fetching) {
        return;
      }
      landed = row;
      if (answered) {
        listeners.delete(listener);
        resolve(row);
      }
    };
    listeners.add(listener);
    ask().then(
      (row) => {
        answered = true;
        if (!row.fetching) {
          listeners.delete(listener);
          resolve(row);
        } else if (landed) {
          listeners.delete(listener);
          resolve(landed);
        }
      },
      (error: unknown) => {
        listeners.delete(listener);
        reject(error);
      }
    );
  });
