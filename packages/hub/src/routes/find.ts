/**
 * Find: searching sessions and pages, and its settings.
 */

import type {
  FindPlacesAnswer,
  FindSessionsAnswer,
  FindSettings,
  PlacesHeard,
} from "@cawco/core/find";
import { CONTROL_TRANSCRIPT_PLACES } from "@cawco/core/session/controls";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import {
  answerFind,
  FIND_PLACES_QUERY,
  FIND_QUERY,
  FIND_SESSIONS_BODY,
} from "../find";
import {
  placeCounts,
  placesForScreens,
  placesHeard,
  placesQuery,
} from "../find-places";
import { forScreens } from "../find-secrets";
import type { HubContext } from "../hub-context";

/**
 * Who asks `GET /api/find`, as the hub's log names a slow machine's search
 * by: the app's Jump (its URLSession says CFNetwork and Darwin, no browser)
 * or the dashboard's Find (⌘K; the composer's `@` asks names alone,
 * `transcripts=0`, so no machine).
 */
const findCaller = (request: Request): string => {
  const agent = request.headers.get("user-agent") ?? "";
  return agent.includes("Darwin") && !agent.includes("Mozilla")
    ? "the app's Jump"
    : "the dashboard's Find (⌘K)";
};

export const findRoutes = ({
  db,
  find,
  machineName,
  machineCalls: { readStoppable },
}: Pick<HubContext, "db" | "find" | "machineCalls" | "machineName">) =>
  new Elysia()
    // The fleet's one finding engine (find.ts): names and transcripts under
    // one ranking, and what waits on your eyes: read from the looks
    // (`/api/seen`) and the `shown` acks the screens already send.
    // While "Hide secrets in Find" is on, each answer names where its
    // secrets stand (find-secrets.ts), for every screen to draw as dots.
    .get("/api/find", { query: FIND_QUERY }, async ({ query, request }) => {
      const hide = db.findSettings.hideSecrets();
      const answer = await answerFind(find, query, hide, {
        caller: findCaller(request),
        signal: request.signal,
      });
      return answer instanceof ElysiaStatus ? answer : forScreens(answer, hide);
    })
    .get("/api/find/waiting", () => find.waiting())
    // The sessions a screen names by id and holds no row of, asked
    // together and answered by key (session-names.svelte.ts).
    .post(
      "/api/find/sessions",
      { body: FIND_SESSIONS_BODY },
      ({ body }): Promise<FindSessionsAnswer> => find.named(body.names)
    )
    // The person's find in one conversation (find-places.ts): how many
    // places its machine's transcript index holds the words in, and one
    // window of them, oldest first, what tools answered included. A
    // machine that does not answer is said so, by name, never as a
    // conversation without the words.
    .get(
      "/api/find/places",
      { query: FIND_PLACES_QUERY },
      async ({ query, request }) => {
        const [row] = db.find.instances([query.session]);
        if (!row) {
          return problem(404, {
            code: "no-session",
            detail: `no session ${query.session}`,
          });
        }
        const named = (
          took: PlacesHeard,
          window: Omit<FindPlacesAnswer, "machine"> = {
            counts: placeCounts(null),
            offset: 0,
            places: [],
            through: null,
          }
        ): FindPlacesAnswer => ({
          machine: {
            heard: took,
            id: row.machineId,
            name: machineName(row.machineId),
          },
          ...window,
        });
        const sessions = [row.sessionId, ...row.priorSessionIds].filter(
          (each): each is string => !!each
        );
        const words = query.q.trim();
        if (sessions.length === 0 || words === "") {
          return named("answered");
        }
        const answer = await readStoppable(
          row.machineId,
          CONTROL_TRANSCRIPT_PLACES,
          [placesQuery(sessions, words, query)],
          {
            caller: "the person's find in a conversation",
            signal: request.signal,
          }
        );
        const heard = placesHeard(answer);
        if (heard.heard !== "answered") {
          return named(heard.heard);
        }
        const { counts, offset, places, through } = heard.places;
        const at = through === null ? Number.NaN : Date.parse(through);
        return named("answered", {
          counts: placeCounts(counts),
          offset,
          places: await placesForScreens(places, db.findSettings.hideSecrets()),
          through: Number.isNaN(at) ? null : at,
        });
      }
    )
    // The person's Find settings, the same on every screen: kept at the hub.
    .get("/api/find/settings", (): FindSettings => ({
      hideSecrets: db.findSettings.hideSecrets(),
    }))
    .put(
      "/api/find/settings",
      { body: t.Object({ hideSecrets: t.Boolean() }) },
      ({ body }): FindSettings => {
        db.findSettings.setHideSecrets(body.hideSecrets, new Date());
        return { hideSecrets: db.findSettings.hideSecrets() };
      }
    );
