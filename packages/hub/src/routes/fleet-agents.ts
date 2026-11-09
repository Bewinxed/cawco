/**
 * The fleet's subagents.
 */

import { agentProblem, parseAgentFrontMatter } from "@cawco/core/fleet";
import { Elysia, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";

export const fleetAgentRoutes = ({
  agentMoved,
  db,
  fanOutAgents,
  pushAgents,
  registry,
  unpushable,
}: Pick<
  HubContext,
  | "agentMoved"
  | "db"
  | "fanOutAgents"
  | "pushAgents"
  | "registry"
  | "unpushable"
>) =>
  new Elysia()
    // A subagent is its markdown file (NEW.md §11): front matter over a body
    // that becomes the system prompt. The file is stored verbatim, and the only
    // thing parsed out of it is what a broken one has to be refused on — the
    // name a delegation asks for, and the description it decides to delegate on.
    //
    // `expectedHash` is the hash the writer read, "" for a new file, as the
    // memory routes take it: a save against a row that moved, or a new file
    // under a name that is taken, answers with what is really there.
    .put(
      "/api/fleet/agents/:name",
      {
        body: t.Object({
          content: t.String(),
          expectedHash: t.Optional(t.String()),
        }),
      },
      ({ params, body, status }) => {
        const problem = agentProblem(
          parseAgentFrontMatter(body.content),
          params.name
        );
        if (problem) {
          return refusal(400, "agent-invalid", problem);
        }
        const moved = agentMoved(params.name, body.expectedHash);
        if (moved) {
          return status(moved.status, moved.answer);
        }

        const agent = db.putFleetAgent({
          name: params.name,
          content: body.content,
        });
        fanOutAgents();
        return agent;
      }
    )
    // Forgotten here, and left where it is out there: the `fs` verb has list,
    // read and write and no delete, so every machine keeps the file until Phase
    // B's daemon-side sync can take it away. Discovery then shows the leftover
    // as unmanaged, which is the truth rather than a comforting silence.
    .delete(
      "/api/fleet/agents/:name",
      { query: t.Object({ expectedHash: t.Optional(t.String()) }) },
      ({ params, query, status }) => {
        const moved = agentMoved(params.name, query.expectedHash);
        if (moved) {
          return status(moved.status, moved.answer);
        }
        const trashed = db.trash.put(
          { kind: "agent", key: params.name },
          Date.now()
        );
        // A plain sentence, as `agentMoved`'s 404: the shipped app's
        // openapi.json types this 404 as `agentMoved`'s union, so its body
        // stays what that app reads (scripts/wire-compat.ts).
        if (trashed === undefined) {
          return status(404, `the fleet keeps no subagent ${params.name}`);
        }
        return undoable(trashed);
      }
    )
    // The click for a machine that was asleep when a definition was written, and
    // for one whose home the hub could only work out later. Awaited, so the
    // answer carries what this attempt could not reach rather than the last one.
    .post("/api/fleet/agents/push", async () => {
      await Promise.all(
        registry.machineIds().map((machineId) => pushAgents(machineId))
      );
      return { ok: true, unpushable: Object.fromEntries(unpushable) };
    });
