/**
 * What a wait waits on, settled or not: the one resolver dispatch, the board,
 * every task tool and a plan step read (wait-targets.ts has the grammar).
 *
 * | Target  | Settled when                                       | Flagged, still unsettled, when |
 * | ------- | -------------------------------------------------- | ------------------------------ |
 * | task    | in a done stage; a duplicate follows its survivor  | the project has no such task   |
 * | card    | answered                                           | its page is deleted            |
 * | pin     | resolved                                           | its page or pin is gone        |
 * | pr      | merged                                             | closed unmerged                |
 * | run     | green                                              | red                            |
 * | session | its work item finished                             | its work item failed or was stopped |
 *
 * A task target that was dropped (not as a duplicate) settles as `dropped`:
 * the wait is removed (tasks.ts), and the answer says so. A flag stays until
 * someone removes or re-points the wait. A card's and a pin's `value` is
 * what it settled with: an attempt keeps it as its witness (dispatch.ts), so
 * a card answered differently since is told apart from one answered the
 * same way again.
 *
 * PR and run state come from the project's GitHub connection and its poller
 * (ingress.ts `githubWaits`); a project with none is refused such a target
 * where it is written ({@link readWait}).
 */
import {
  githubTarget,
  referenceHref,
  type StageKind,
  taskLinkWords,
  taskTarget,
  type WaitKind,
  type WaitTarget,
  waitHandle,
  waitTarget,
} from "@cawco/core";
import type { WorkItemState } from "./db/schema";

/** A pull request's or an Actions run's state, as the poller last read it. */
export type GitHubWaitState =
  "open" | "merged" | "closed" | "running" | "green" | "red" | "checking";

/** What the resolver reads of the hub, each answer the thing's own state now. */
export interface WaitWorld {
  /** Card `card` of page `artifactId`: its question, whether the page asks it, the pick it holds (null: none); undefined once the page is deleted. */
  readonly card: (
    artifactId: string,
    card: string
  ) =>
    | { asked: boolean; page: string; question: string; value: string | null }
    | undefined;
  /** A pull request's or run's state and title, as the project's poller last read it. */
  readonly github: (target: Extract<WaitTarget, { kind: "pr" | "run" }>) => {
    state: GitHubWaitState;
    title: string | null;
  };
  /** Whether the folder's history shows the task taken out of tasks/ (archived or deleted): done with. */
  readonly gone: (id: string) => boolean;
  /** Pin `number` of artifact `artifactId`: what it stands on, and whether it is resolved; undefined when it is gone. */
  readonly pin: (
    artifactId: string,
    number: number
  ) => { label: string; resolved: boolean } | undefined;
  /** The project the waits are read in: a task target is one of its tasks. */
  readonly projectId: string;
  /** A session by its whole id: its title and its work item's state (null: it runs none); undefined when the hub has none. */
  readonly session: (
    instanceId: string
  ) => { item: WorkItemState | null; title: string } | undefined;
  /** One of the project's tasks as its index holds it; undefined when it has none. */
  readonly task: (id: string) =>
    | {
        duplicateOf: string | null;
        kind: StageKind | null;
        stage: string;
        title: string;
      }
    | undefined;
}

/** One wait, settled or not, as every reader shows it. */
export interface WaitState {
  /** A task target dropped since (not as a duplicate): the wait is removed. */
  dropped: boolean;
  /** Why it is blocked for good until someone removes or re-points it (`closed unmerged`); null when it is not. */
  flag: string | null;
  /** Where it opens: its `cawco:` reference, or the pull request's or run's page. */
  href: string;
  kind: WaitKind;
  /** What it is called: a task's title, a card's question, what a pin stands on, `PR #418`. */
  label: string;
  settled: boolean;
  /** Where it stands, in a word or two: `doing`, `open`, `picked`, `merged`, `red`. */
  state: string;
  /** The wait as its file keeps it ({@link waitHandle}). */
  target: string;
  /** What it settled with, for a card (its pick) or a pin; null otherwise or while unsettled. */
  value: string | null;
}

const flagged = (
  base: Omit<WaitState, "dropped" | "flag" | "settled" | "value">,
  flag: string
): WaitState => ({
  ...base,
  settled: false,
  flag,
  value: null,
  dropped: false,
});

/** A task target, a duplicate followed to its survivor. */
const taskState = (
  id: string,
  world: WaitWorld,
  seen: ReadonlySet<string> = new Set()
): WaitState => {
  const href = referenceHref("task", `${world.projectId}/${id}`);
  const task = world.task(id);
  const base = { target: id, kind: "task" as const, href };
  if (!task) {
    return world.gone(id)
      ? {
          ...base,
          label: id,
          settled: true,
          state: "archived",
          flag: null,
          value: null,
          dropped: false,
        }
      : flagged(
          { ...base, label: id, state: "missing" },
          "is not in the project"
        );
  }
  const named = { ...base, label: task.title };
  if (task.kind === "done") {
    return {
      ...named,
      settled: true,
      state: "done",
      flag: null,
      value: null,
      dropped: false,
    };
  }
  if (task.kind === "dropped" && task.duplicateOf && !seen.has(id)) {
    const survivor = taskState(task.duplicateOf, world, new Set([...seen, id]));
    return {
      ...survivor,
      target: id,
      state: `duplicate, ${survivor.state}`,
      dropped: false,
    };
  }
  if (task.kind === "dropped") {
    return {
      ...named,
      settled: true,
      state: "dropped",
      flag: null,
      value: null,
      dropped: true,
    };
  }
  return {
    ...named,
    settled: false,
    state: task.stage || "no stage",
    flag: null,
    value: null,
    dropped: false,
  };
};

const GITHUB_SETTLED: ReadonlySet<GitHubWaitState> = new Set([
  "merged",
  "green",
]);

/** Each red state's flag. */
const GITHUB_FLAG: Partial<Record<GitHubWaitState, string>> = {
  closed: taskLinkWords.closedUnmerged,
  red: taskLinkWords.runFailed,
};

/** A card target: settled once answered, flagged once its page is deleted or asks it no more. */
const cardState = (
  target: Extract<WaitTarget, { kind: "card" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("decision", `${target.artifactId}/${target.card}`);
  const card = world.card(target.artifactId, target.card);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!card) {
    return flagged(
      { ...base, label: target.card, state: "deleted" },
      "was deleted with its page"
    );
  }
  const named = { ...base, label: card.question || target.card };
  if (!card.asked) {
    return flagged(
      { ...named, state: "missing" },
      `is no longer asked on ${card.page}`
    );
  }
  return {
    ...named,
    settled: card.value !== null,
    state: card.value === null ? "open" : "picked",
    flag: null,
    value: card.value,
    dropped: false,
  };
};

/** A pin target: settled once resolved, flagged once it is gone. */
const pinState = (
  target: Extract<WaitTarget, { kind: "pin" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("pin", `${target.artifactId}/${target.number}`);
  const pin = world.pin(target.artifactId, target.number);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!pin) {
    return flagged(
      { ...base, label: `pin ${target.number}`, state: "gone" },
      "is gone"
    );
  }
  return {
    ...base,
    label: pin.label,
    settled: pin.resolved,
    state: pin.resolved ? "resolved" : "open",
    flag: null,
    value: pin.resolved ? "resolved" : null,
    dropped: false,
  };
};

/** A pull request or run: settled once merged or green, flagged once closed unmerged or red. */
const githubState = (
  target: Extract<WaitTarget, { kind: "pr" | "run" }>,
  world: WaitWorld
): WaitState => {
  const read = world.github(target);
  const label =
    target.kind === "pr"
      ? `PR #${target.number}${read.title ? ` ${read.title}` : ""}`
      : `${read.title ?? "Actions run"} ${target.id}`;
  const base = {
    target: target.url,
    kind: target.kind,
    href: target.url,
    label,
  };
  const flag = GITHUB_FLAG[read.state];
  if (flag) {
    return flagged({ ...base, state: read.state }, flag);
  }
  return {
    ...base,
    settled: GITHUB_SETTLED.has(read.state),
    state: read.state,
    flag: null,
    value: null,
    dropped: false,
  };
};

/** A session: settled once its work item finished, flagged once it failed or was stopped. */
const sessionState = (
  target: Extract<WaitTarget, { kind: "session" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("session", target.instanceId);
  const session = world.session(target.instanceId);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!session) {
    return flagged(
      { ...base, label: waitHandle(target), state: "gone" },
      "is gone"
    );
  }
  const named = { ...base, label: session.title };
  if (session.item === "failed" || session.item === "cancelled") {
    return flagged(
      { ...named, state: session.item },
      session.item === "failed" ? "ended failed" : "was stopped"
    );
  }
  return {
    ...named,
    settled: session.item === "done",
    state: session.item === "done" ? "finished" : "working",
    flag: null,
    value: null,
    dropped: false,
  };
};

/**
 * Whether `target` is settled, and where it stands: THE resolver. Every
 * reader of a wait (tasks.ts readiness, dispatch, the board, the task tools,
 * a plan step) asks it here.
 */
export const settled = (target: WaitTarget, world: WaitWorld): WaitState => {
  switch (target.kind) {
    case "task":
      return taskState(target.id, world);
    case "card":
      return cardState(target, world);
    case "pin":
      return pinState(target, world);
    case "pr":
    case "run":
      return githubState(target, world);
    case "session":
      return sessionState(target, world);
  }
};

/** {@link settled} for a wait as a file keeps it; one that reads as no target is flagged. */
export const settledHandle = (handle: string, world: WaitWorld): WaitState => {
  const target = waitTarget(handle);
  return target
    ? settled(target, world)
    : flagged(
        {
          target: handle,
          kind: "task",
          href: "",
          label: handle,
          state: "unreadable",
        },
        "is not a target the hub reads"
      );
};

/** Waits in the order every reader shows them: unsettled first, each kind's order kept. */
export const unsettledFirst = <T extends { settled: boolean }>(
  waits: readonly T[]
): T[] => [
  ...waits.filter((wait) => !wait.settled),
  ...waits.filter((wait) => wait.settled),
];

// --- what an agent or the dashboard writes ------------------------------------

/** What reading a written wait asks of the hub; each refusal said in words. */
export interface WaitReader {
  /** The cards page `artifactId` asks. */
  readonly cards: (artifactId: string) => string[];
  /** Why the project cannot wait on a pull request or run (no GitHub connection), or nothing when it can. */
  readonly githubRefusal: () => string | undefined;
  /** The page a name, handle or id names, by its whole id and name; a refusal in words when it names none. */
  readonly page: (asked: string) => { id: string; name: string } | string;
  /** Whether page `artifactId` holds pin `number`. */
  readonly pinHeld: (artifactId: string, number: number) => boolean;
  /** The session a handle names, and whether it runs a work item; a refusal in words when it names none. */
  readonly session: (
    handle: string
  ) => { dir: string; id: string; item: boolean } | string;
}

/** A written wait the hub refuses, in words that name it. */
export class WaitRefusal extends Error {}

const HANDLE_HEX = /^[0-9a-f-]{6,}$/i;
const PIN_NUMBER = /^\d{1,6}$/;
const WEB = /^https?:\/\//i;

const refuseWait = (message: string): never => {
  throw new WaitRefusal(message);
};

/** A session handle (`cockpit#5a167bde`) as a session target, refused when it names none or runs no work item. */
const sessionWait = (written: string, reader: WaitReader): WaitTarget => {
  const session = reader.session(written);
  if (typeof session === "string") {
    return refuseWait(session);
  }
  if (!session.item) {
    return refuseWait(
      `“${written}” is a session that runs no work item, so it never finishes: wait on its task or a card instead.`
    );
  }
  return { kind: "session", dir: session.dir, instanceId: session.id };
};

/**
 * A wait as an agent or the dashboard writes it, read into its target: a
 * task (whose being in the project the caller checks), a card or a pin of a
 * page the writer may name, a pull request or run while the project has
 * GitHub, a session that runs a work item. Refused in words otherwise.
 */
export const readWait = (written: string, reader: WaitReader): WaitTarget => {
  const said = written.trim();
  const task = taskTarget(said);
  if (task) {
    return { kind: "task", id: task };
  }
  if (WEB.test(said)) {
    return readLink(said, reader);
  }
  if (waitTarget(said)?.kind === "session") {
    return sessionWait(said, reader);
  }
  const hash = said.lastIndexOf("#");
  if (hash > 0 && hash < said.length - 1) {
    return readCard(said, hash, reader);
  }
  const slash = said.lastIndexOf("/");
  if (slash > 0 && PIN_NUMBER.test(said.slice(slash + 1))) {
    return readPin(said, slash, reader);
  }
  return refuseWait(
    `“${said}” names nothing the hub waits on: a task (tsk-12), a card (<page>#<card>), a pin (<page>/<number>), a GitHub pull request or Actions run, or a session (<dir>#<id>).`
  );
};

/** A link as a wait: a GitHub pull request or Actions run, while the project has GitHub. */
const readLink = (said: string, reader: WaitReader): WaitTarget => {
  const github = githubTarget(said);
  if (!github) {
    return refuseWait(
      `“${said}” is a link the hub cannot settle: wait on a GitHub pull request or Actions run, a task, a card, a pin or a session.`
    );
  }
  const refusal = reader.githubRefusal();
  return refusal
    ? refuseWait(`“${said}” cannot be waited on: ${refusal}`)
    : github;
};

/** `<page>#<card>` as a card the page asks; else a session handle (`cockpit#5a167bde`). */
const readCard = (
  said: string,
  hash: number,
  reader: WaitReader
): WaitTarget => {
  const page = reader.page(said.slice(0, hash));
  const card = said.slice(hash + 1);
  if (typeof page === "string") {
    return HANDLE_HEX.test(card) ? sessionWait(said, reader) : refuseWait(page);
  }
  const cards = reader.cards(page.id);
  return cards.includes(card)
    ? { kind: "card", artifactId: page.id, card }
    : refuseWait(
        `${page.name} asks no card “${card}”. Its cards: ${cards.join(", ") || "none"}.`
      );
};

/** `<page>/<number>` as a pin the page holds. */
const readPin = (
  said: string,
  slash: number,
  reader: WaitReader
): WaitTarget => {
  const page = reader.page(said.slice(0, slash));
  if (typeof page === "string") {
    return refuseWait(page);
  }
  const number = Number(said.slice(slash + 1));
  return reader.pinHeld(page.id, number)
    ? { kind: "pin", artifactId: page.id, number }
    : refuseWait(`${page.name} holds no pin ${number}.`);
};

// --- cycles -----------------------------------------------------------------------

/**
 * A cycle reachable from `start` through `next`, its ends the same task
 * (`[a, b, a]`, `[c, c]`); undefined when none is. Asked with a write applied
 * before it lands: the graph had no cycle before, so any found runs through
 * the write, and the write is refused with it, by name.
 */
export const cycleFrom = (
  start: string,
  next: (id: string) => readonly string[]
): string[] | undefined => {
  const done = new Set<string>();
  const walk = (at: string, path: string[]): string[] | undefined => {
    for (const to of next(at)) {
      const back = path.indexOf(to);
      if (back !== -1) {
        return [...path.slice(back), to];
      }
      if (!done.has(to)) {
        const found = walk(to, [...path, to]);
        if (found) {
          return found;
        }
      }
    }
    done.add(at);
  };
  return walk(start, [start]);
};
