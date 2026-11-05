/**
 * Each place's live fact, as its rail row says it (the option's "Each rail
 * row is name, count and one live fact, in that order"): the count it holds
 * and the fact in parts, so a failed or stuck part takes its own ink. While
 * the hub is not live a count is not claimed: Home's is suppressed and every
 * fact says since when the rows are kept (PRODUCT.md, How state is shown).
 */
import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
import type { PlaceKey, Project, Read } from "./model";

export interface FactPart {
  text: string;
  tone: "plain" | "fail" | "attn";
}

export interface PlaceFact {
  /** What it holds; null draws no count (none, or not to be claimed). */
  count: number | null;
  /** Its row carries the needs-you dot beside its name. */
  needs: boolean;
  parts: FactPart[];
  state: "live" | "stale" | "unread" | "empty";
}

const plain = (text: string): FactPart => ({ text, tone: "plain" });

/** A count of none is not drawn (DESIGN.md, The Earned Count Rule). */
const earned = (count: number): number | null => (count > 0 ? count : null);

const fail = (text: string): FactPart => ({ text, tone: "fail" });

/** What a place says when it holds nothing yet, or else its own parts. */
const orEmpty = (holds: number, parts: () => FactPart[]): FactPart[] =>
  holds === 0 ? [plain(w.nothingYet)] : parts();

function taskParts(project: Project): FactPart[] {
  const working = project.tasks.filter((task) => task.attempt === "working");
  const stuck = project.tasks.filter((task) => task.attempt === "stuck");
  if (working.length + stuck.length === 0) {
    return [plain(w.noneWorking)];
  }
  return [
    ...(working.length > 0 ? [plain(w.working(working.length))] : []),
    ...(stuck.length > 0 ? [fail(w.stuck(stuck.length))] : []),
  ];
}

function routineParts(project: Project): FactPart[] {
  const failed = project.routines.filter(
    (routine) => routine.last.outcome === "failed"
  );
  return [
    ...(project.nextRun ? [plain(w.nextRun(project.nextRun))] : []),
    ...(failed.length > 0 ? [fail(w.failed(failed.length))] : []),
  ];
}

function decisionParts(project: Project): FactPart[] {
  const waiting = project.decisions.filter(
    (decision) => decision.group === "waits"
  );
  const [first] = waiting;
  if (!first) {
    return [plain(w.noneWaiting)];
  }
  return [
    { text: w.waits(waiting.length), tone: "attn" },
    plain(w.picked(first.picked[0], first.picked[1])),
  ];
}

function outputParts(project: Project): FactPart[] {
  const fresh = project.outputs.filter((output) => output.isNew).length;
  return [plain(fresh > 0 ? w.newSince(fresh) : w.nothingNew)];
}

function sessionParts(project: Project): FactPart[] {
  const running = project.sessions.filter(
    (session) => session.state === "working" || session.state === "needs"
  ).length;
  return [plain(running > 0 ? w.running(running) : w.noneRunning)];
}

/** A place holding `holds`: its count, its state, its parts. */
function place(
  holds: number,
  parts: () => FactPart[],
  needs: boolean
): PlaceFact {
  return {
    count: earned(holds),
    parts: orEmpty(holds, parts),
    needs,
    state: holds === 0 ? "empty" : "live",
  };
}

function liveFacts(project: Project): Record<PlaceKey, PlaceFact> {
  const needs = project.needs.length;
  const board = project.tasks.filter((task) => task.stage !== "dropped");
  const { spend } = project;
  return {
    home: {
      count: earned(needs),
      parts: [
        needs > 0
          ? { text: w.needYou(needs), tone: "attn" }
          : plain(w.nothingNeedsYou),
      ],
      needs: needs > 0,
      state: "live",
    },
    tasks: place(
      board.length,
      () => taskParts(project),
      project.tasks.some((task) => task.needsYou)
    ),
    routines: place(
      project.routines.length,
      () => routineParts(project),
      project.proposed.some((one) => one.state === "waiting")
    ),
    decisions: place(
      project.decisions.length,
      () => decisionParts(project),
      project.decisions.some((decision) => decision.group === "waits")
    ),
    outputs: place(project.outputs.length, () => outputParts(project), false),
    sessions: place(
      project.sessions.length,
      () => sessionParts(project),
      project.sessions.some((session) => session.state === "needs")
    ),
    spend: {
      count: null,
      parts: [
        plain(spend ? w.spentOf(spend.today, spend.capDay) : w.nothingYet),
      ],
      needs: false,
      state: spend ? "live" : "empty",
    },
  };
}

/** The rail's facts for this project as its reads stand. */
export function placeFacts(
  project: Project,
  read: Read
): Record<PlaceKey, PlaceFact> {
  const facts = liveFacts(project);
  for (const key of Object.keys(facts) as PlaceKey[]) {
    const fact = facts[key];
    if (read.stale !== null) {
      facts[key] = {
        count: key === "home" ? null : fact.count,
        parts: [
          plain(
            key === "home" ? w.staleSince(read.stale) : w.staleShort(read.stale)
          ),
        ],
        needs: false,
        state: "stale",
      };
    } else if (read.unread.includes(`rail:${key}`)) {
      facts[key] = {
        count: null,
        parts: [{ text: w.couldNotRead, tone: "fail" }],
        needs: false,
        state: "unread",
      };
    }
  }
  return facts;
}

/** The places in the rail's order: the daily five, then the weekly two below a hairline. */
export const DAILY: PlaceKey[] = [
  "home",
  "tasks",
  "routines",
  "decisions",
  "outputs",
];
export const WEEKLY: PlaceKey[] = ["sessions", "spend"];
