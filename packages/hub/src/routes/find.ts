/**
 * Find: searching sessions and pages, and its settings.
 */

import type {
  FindPlace,
  FindPlacesAnswer,
  FindSettings,
  PlacesHeard,
  TranscriptPlacesQuery,
} from "@cawco/core/find";
import { CONTROL_TRANSCRIPT_PLACES } from "@cawco/core/session/controls";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { answerFind, FIND_PLACES_QUERY, FIND_QUERY } from "../find";
import { PLACES_LIMIT, placesForScreens, placesHeard } from "../find-places";
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

/**
 * How long the person's find in a conversation waits on its machine for
 * the places (find-places.ts): one phrase read of the index, a sync first
 * when it is stale (agent search/index.ts `SYNC_WAIT_MS`). Past it, the
 * places in the turns loaded stand, the machine named. Our call, as
 * `FIND_TURNS_MS`.
 */
const FIND_PLACES_MS = 5000;

export const findRoutes = ({
  db,
  find,
  machineName,
  readStoppable,
}: Pick<HubContext, "db" | "find" | "machineName" | "readStoppable">) =>
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
    // The person's find in one conversation (find-places.ts): every place
    // its machine's transcript index holds the words in, oldest first,
    // what tools answered included. A machine that does not answer is
    // said so, by name, never as a conversation without the words.
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
          places: FindPlace[] = [],
          more = false
        ): FindPlacesAnswer => ({
          machine: {
            heard: took,
            id: row.machineId,
            name: machineName(row.machineId),
          },
          more,
          places,
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
          [
            {
              sessions,
              words,
              limit: PLACES_LIMIT + 1,
            } satisfies TranscriptPlacesQuery,
          ],
          FIND_PLACES_MS,
          {
            caller: "the person's find in a conversation",
            signal: request.signal,
          }
        );
        const heard = placesHeard(answer);
        if (heard.heard !== "answered") {
          return named(heard.heard);
        }
        return named(
          "answered",
          await placesForScreens(
            heard.places.slice(0, PLACES_LIMIT),
            db.findSettings.hideSecrets()
          ),
          heard.places.length > PLACES_LIMIT
        );
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
