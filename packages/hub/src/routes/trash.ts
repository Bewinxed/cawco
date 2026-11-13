/**
 * Bringing a thing the person deleted back from the trash.
 */

import type { HarnessConfigKind } from "@cawco/core/harness-config";
import { areaWords } from "@cawco/core/words/areas";
import { Elysia, problem, t } from "elysia";
import type { TrashKind } from "../db/schema";
import type { HubContext } from "../hub-context";

import { unreachable } from "../unreachable";

export const trashRoutes = ({
  announceMcp,
  connections,
  db,
  delegateTypes,
  fanOutAgents,
  fleetChanged,
  fleetMcp,
  maskedMcp,
  ruleEngine,
  ruleRowsOf,
}: Pick<
  HubContext,
  | "announceMcp"
  | "connections"
  | "db"
  | "delegateTypes"
  | "fanOutAgents"
  | "fleetChanged"
  | "fleetMcp"
  | "maskedMcp"
  | "ruleEngine"
  | "ruleRowsOf"
>) => {
  /**
   * A config item the trash just put back (db/trash.ts): what its delete
   * stopped, started again, and the item as its list reads it, under its
   * kind.
   */
  const returned = async (kind: TrashKind, key: string) => {
    switch (kind) {
      case "rule": {
        ruleEngine.reload();
        const rule = db.getRule(key);
        return { kind, row: rule ? (ruleRowsOf([rule])[0] ?? null) : null };
      }
      case "hook":
        fleetChanged();
        return { kind, row: db.getFleetHook(key) ?? null };
      case "skill":
        fleetChanged();
        return {
          kind,
          row: db.listSkills().find((row) => row.name === key) ?? null,
        };
      case "plugin":
        fleetChanged();
        return {
          kind,
          row: db.listPlugins().find((row) => row.id === key) ?? null,
        };
      case "marketplace":
        fleetChanged();
        return {
          kind,
          row:
            db.fleetConfig().marketplaces.find((row) => row.name === key) ??
            null,
        };
      case "agent":
        fanOutAgents();
        return {
          kind,
          row: db.listFleetAgents().find((row) => row.name === key) ?? null,
        };
      case "mcp":
        await fleetMcp.probe(key);
        announceMcp();
        return {
          kind,
          row: maskedMcp(key) ?? null,
        };
      case "delegateType":
        return { kind, row: delegateTypes.get(key) ?? null };
      case "memory":
        fleetChanged();
        return {
          kind,
          row: {
            memory: db.getFleetMemory() ?? null,
            docs: db.listFleetMemoryDocs(),
          },
        };
      case "memoryDoc":
        fleetChanged();
        return { kind, row: db.getFleetMemoryDoc(key) ?? null };
      case "connection":
        return { kind, row: connections.returned(key) };
      case "harnessConfig": {
        fleetChanged();
        const [harness, name] = key.split(":") as [HarnessConfigKind, string];
        return { kind, row: db.getHarnessConfig(harness, name) ?? null };
      }
      default:
        throw unreachable(kind);
    }
  };

  return (
    new Elysia()
      /**
       * Undo, for every config delete (db/trash.ts): the item back whole,
       * what its putting back sets going (a fan-out, a probe, the rule engine)
       * set going, and the item as its list reads it, under `row`.
       */
      .post(
        "/api/trash/:id/restore",
        { params: t.Object({ id: t.Numeric() }) },
        async ({ params }) => {
          const back = db.trash.take(params.id, Date.now());
          if (!back.ok) {
            switch (back.why) {
              case "taken":
                return problem(409, {
                  code: "trash-name-taken",
                  detail:
                    "Something of the same name was made while it waited, and that one stays.",
                });
              case "unbound":
                return problem(409, {
                  code: "undo-unbound",
                  detail: areaWords.undoUnbound,
                });
              case "gone":
                return problem(404, {
                  code: "trash-gone",
                  detail:
                    "It can no longer be brought back: its undo has run out.",
                });
              default:
                throw unreachable(back);
            }
          }
          return await returned(back.kind, back.key);
        }
      )
  );
};
