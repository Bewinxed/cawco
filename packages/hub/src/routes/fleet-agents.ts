/**
 * The fleet's subagents.
 */

import { agentProblem, parseAgentFrontMatter } from "@cawco/core/fleet";
import { Elysia, status, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";

/**
 * Why a write naming `expectedHash` may not land on subagent `name`: the
 * stored file when it moved since that read or when "" asked for a new one
 * under a taken name (409), a refusal when the read file is gone (404).
 * Undefined when it may, or when no hash was named (the dashboard's save).
 */
const agentMoved = (
  db: Pick<HubContext["db"], "listFleetAgents">,
  name: string,
  expectedHash: string | undefined
) => {
  if (expectedHash === undefined) {
    return;
  }
  const current = db.listFleetAgents().find((row) => row.name === name);
  if (!current) {
    return expectedHash === ""
      ? undefined
      : refusal(404, "no-subagent", `the fleet keeps no subagent ${name}`);
  }
  return current.hash === expectedHash ? undefined : status(409, current);
};

export const fleetAgentRoutes = ({
  db,
  fanOutAgents,
  pushAgents,
  registry,
  unpushable,
}: Pick<
  HubContext,
  "db" | "fanOutAgents" | "pushAgents" | "registry" | "unpushable"
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
      ({ params, body }) => {
        const problem = agentProblem(
          parseAgentFrontMatter(body.content),
          params.name
        );
        if (problem) {
          return refusal(400, "agent-invalid", problem);
        }
        const moved = agentMoved(db, params.name, body.expectedHash);
        if (moved) {
          return moved;
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
      ({ params, query }) => {
        const moved = agentMoved(db, params.name, query.expectedHash);
        if (moved) {
          return moved;
        }
        const trashed = db.trash.put(
          { kind: "agent", key: params.name },
          Date.now()
        );
        if (trashed === undefined) {
          return refusal(
            404,
            "no-subagent",
            `the fleet keeps no subagent ${params.name}`
          );
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
