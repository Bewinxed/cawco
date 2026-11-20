/**
 * The stand-in hub behind Option 1's live story: what it does with each
 * change the person sends, and the words it refuses one with. Pure: the
 * fixture holds the record and calls these.
 */
import type { TaskSummary } from "@cawco/core/task-views";
import { HYUCKSFIELD, NOW, STAGES } from "./fixtures";
import type { Change, ChangeId, GovernedRecord } from "./records";

/** How the stand-in hub answers a change: in force, refused, or not at all. */
export const ANSWERS = ["Takes it", "Refuses it", "Never answers"] as const;
export type Answer = (typeof ANSWERS)[number];

/** How long the stand-in hub takes to answer, as a hub on the tailnet does. */
export const ANSWER_MS = 700;

export const changeId = (change: Change): ChangeId =>
  change.key === "decides" ? `decides.${change.kind}` : change.key;

/** The hub's refusal of a change, in its words: what happened, what is safe, the next step. */
export function refusalOf(change: Change): string {
  if (change.key === "taskHome") {
    return "GitHub refused the tie: the connection GitHub App · samleelabs may not write issues on samleelabs/hyucksfield (403). Tasks stay in CawCo's files; give the app Issues access and try again.";
  }
  if (change.key === "addPlace") {
    return `obelisk refused the folder: ${change.path} is in the machine's scratch area, which is removed when its session ends (scratch). Nothing was added; name a folder outside it.`;
  }
  return "The hub could not save the change: the project's record is being written by another change (busy). Nothing changed; try again.";
}

/** The record with a change the hub took. */
export function applied(
  record: GovernedRecord,
  change: Change
): GovernedRecord {
  const { project } = record;
  switch (change.key) {
    case "name":
      return { ...record, project: { ...project, name: change.name } };
    case "account":
      return { ...record, project: { ...project, account: change.account } };
    case "atLimit":
      return {
        ...record,
        project: { ...project, accountAtLimit: change.atLimit },
      };
    case "caw":
      return { ...record, caw: { ...record.caw, on: change.on } };
    case "landing":
      return { ...record, project: { ...project, lands: change.lands } };
    case "review":
      return { ...record, project: { ...project, review: change.review } };
    case "decides": {
      if (record.decides.state !== "read") {
        return record;
      }
      const route = record.decides.value[change.kind];
      return {
        ...record,
        decides: {
          state: "read",
          value: {
            ...record.decides.value,
            [change.kind]:
              change.member === null
                ? { ...route, member: route.fleet, own: false }
                : { ...route, member: change.member, own: true },
          },
        },
      };
    }
    case "taskHome":
      return change.tracker === "cawco"
        ? {
            ...record,
            tracker: {
              state: "read",
              value: { tracker: "cawco", binding: null },
            },
          }
        : {
            ...record,
            tracker: {
              state: "read",
              value: {
                tracker: change.tracker,
                binding: {
                  boundAt: NOW,
                  connection: change.connection ?? "",
                  githubProject: null,
                  githubProjectReason: null,
                  linked: 0,
                  polledAt: null,
                  provider: change.tracker,
                  reason: null,
                  state: "syncing",
                  target: change.target ?? "",
                  targetName: change.target ?? "",
                  targetUrl: `https://github.com/${change.target ?? ""}`,
                },
              },
            },
          };
    case "largeFiles":
      return { ...record, largeFiles: change.largeFiles };
    case "addPlace":
      return {
        ...record,
        project: {
          ...project,
          places: [
            ...project.places.filter((p) => p.kind !== "hub"),
            {
              createdAt: new Date(NOW).toISOString(),
              found: true,
              id: `pl_${project.places.length}`,
              isPrimary: false,
              kind: "checkout",
              machineId: change.machineId,
              made: false,
              missing: false,
              path: change.path,
              projectId: project.id,
              within: [],
            },
            ...project.places.filter((p) => p.kind === "hub"),
          ],
        },
      };
    default:
      return record;
  }
}

/** The tracker as a sync finds it: running, then in step just now. */
export function syncing(
  record: GovernedRecord,
  state: "syncing" | "synced"
): GovernedRecord {
  if (record.tracker.state !== "read" || !record.tracker.value.binding) {
    return record;
  }
  return {
    ...record,
    tracker: {
      state: "read",
      value: {
        ...record.tracker.value,
        binding: {
          ...record.tracker.value.binding,
          state,
          reason: null,
          polledAt:
            state === "synced" ? NOW : record.tracker.value.binding.polledAt,
        },
      },
    },
  };
}

/** A fact read again: reading, then as hyucksfield's hub answers it. */
export function reread(
  record: GovernedRecord,
  what: "decides" | "tracker" | "connections",
  done: boolean
): GovernedRecord {
  return { ...record, [what]: done ? HYUCKSFIELD[what] : { state: "reading" } };
}

/** A task moved on the board, as the hub writes it. */
export const moved = (
  tasks: TaskSummary[],
  id: string,
  stage: string
): TaskSummary[] =>
  tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          stage,
          kind: STAGES.find((s) => s.name === stage)?.kind ?? null,
        }
      : task
  );
