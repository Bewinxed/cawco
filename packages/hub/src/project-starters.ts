/**
 * A project's starters, in three places (core `StarterPlace`): what its
 * empty board (StarterCards) and Caw's panel hero (CawStarters) offer to say
 * to him, what its empty Routines page offers as routines, and what its
 * empty Decisions tab offers to lay out as a decision page. Each is written
 * for that project from what it holds now. No list of starters exists; each
 * is one of the asks that fit a thing in the project (starter-asks.ts: a
 * task, a thread, a failure, a landed commit, a task kind filed often, an
 * event source no routine takes, a draft view, the project itself), chosen
 * by Jev (jev-placement.ts `jevStarters`, every place in one call), with the
 * reason it is offered and what it comes from.
 *
 * The pattern is pi-prompt-suggester's (https://github.com/guwidoe/pi-prompt-suggester,
 * vision.md): the project's curated words (AGENTS.md, knowledge/) are the
 * seed, so no seeding pass runs ("Turn-time inference consumes compact
 * distilled artifacts"); each set is stored with its inputs' hash and what
 * asked for it ("Store seeds and trigger reasons"); a weak guess is not
 * offered ("Confidence gate low-quality guesses"); a press only fills the
 * composer ("Suggest; never auto-send prompts"); and what the person did
 * with each starter is kept and read back ("Track whether the user
 * submitted the suggested prompt as-is or changed course").
 *
 * When it is written (our own calls):
 * - asked by a project being made, a task filed or moved, a turn ending in
 *   one of its threads (Caw's answer landing), a commit landing on its
 *   repository (an attempt landing on its base branch), an attempt or a
 *   routine failing, a session making one of its routines, an event from
 *   outside landing for it;
 * - after {@link QUIET_MS} with no other ask for the project, so a burst
 *   of moves asks once;
 * - at most once per {@link GAP_MS} per project: a later ask waits its turn;
 * - asked again on read when the set is older than {@link STALE_MS},
 *   which also writes the first set of a project made before starters were;
 * - not asked when the inputs hash as the stored set's did.
 *
 * Jev off: no starters anywhere, and the `[jev off]` line. Jev on but
 * failing: the stored set stands with its `generated_at`, and askRow logged
 * Jev's own words. Every open dashboard hears a new set at once
 * (`starters.changed`).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CAWCO_ENV,
  type CommandResult,
  type ProjectStarter,
  readEnv,
  STARTER_PLACES,
  type StarterPlace,
  type StartersChangedFrame,
} from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { Elysia, t } from "elysia";
import type { DbShape, WorkItemRow } from "./db";
import { designShaped } from "./design-offers";
import { jevAccess } from "./jev";
import { JevFailed, jevStarters, startersOff } from "./jev-placement";
import { AGENTS_FILE, fileOr, KNOWLEDGE_DIR } from "./memory";
import {
  FolderRefusal,
  listFolder,
  projectRoot,
  refused,
} from "./project-folder";
import {
  boundStarterInputs,
  STARTER_OFTEN,
  STARTER_RECENT_DAYS,
  type StarterInputs,
  type StarterTask,
} from "./starter-asks";
import type { TaskEvent, TaskSummary, Tasks } from "./tasks";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * `CAWCO_STARTERS_PACE=<quietMs>/<gapMs>` paces a scratch fleet's starters
 * for their live proof, as `CAWCO_TYPESAFE_URL` points Jev at a stand-in;
 * every installed hub runs the defaults.
 */
const pace = (() => {
  const [quiet, gap] = (readEnv(CAWCO_ENV.startersPace) ?? "")
    .split("/")
    .map(Number);
  return {
    quiet: Number.isFinite(quiet) && quiet ? quiet : MINUTE_MS,
    gap: Number.isFinite(gap) && gap ? gap : 10 * MINUTE_MS,
  };
})();

/** Quiet before a project's starters are written: 60 s with no other ask. */
export const QUIET_MS = pace.quiet;
/** The least time between two of one project's asks of Jev: 10 min. */
export const GAP_MS = pace.gap;
/** A set older than this is asked again when it is read: 24 h. */
export const STALE_MS = DAY_MS;
/** A read of a checkout's branch, commits and design/; past this the machine is not going to answer. */
const READ_MS = 10_000;
/** `origin/main` as the branch it names. */
const ORIGIN = /^origin\//;
/** The newest events read for "an event source with no routine". Our own call: a fortnight's polls of a busy repository. */
const UNROUTED_READ = 200;

/** What asks for a project's starters, as its set and its log line name it. */
export type StartersTrigger =
  | "project created"
  | "task moved"
  | "turn ended"
  | "commit landed"
  | "attempt failed"
  | "routine failed"
  | "routine made"
  | "event received"
  | "stale";

/** Where a project's views Caw drafted wait (views.ts `DRAFTS`). */
const DRAFTS_DIR = "views/drafts";
const OUI = /\.oui$/;

export interface ProjectStartersDeps {
  /** Every open dashboard hears a project's new set. */
  broadcast: (frame: StartersChangedFrame) => void;
  db: DbShape;
  online: (machineId: string) => boolean;
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
  tasks: Tasks;
}

const OPEN_KINDS = new Set(["todo", "active", "waiting", "you"]);
/** The tasks Jev reads first: waiting on you, then failed, then under way, then the newest changed. */
const weight = (task: TaskSummary): number =>
  (task.needsYou ? 4 : 0) +
  (task.lastAttemptFailed ? 2 : 0) +
  (task.kind === "active" ? 1 : 0);

/** The inputs' hash: the starters offered before steer Jev, but their outcomes alone ask nothing. */
const hashOf = (inputs: StarterInputs): string =>
  createHash("sha256")
    .update(JSON.stringify({ ...inputs, shown: [] }))
    .digest("hex");

export const createProjectStarters = (deps: ProjectStartersDeps) => {
  const { db, tasks } = deps;
  /** A project's ask waiting out its quiet, and what asked. */
  const waiting = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; triggers: Set<StartersTrigger> }
  >();
  /** When each project's set was last asked of Jev, or found unchanged. */
  const asked = new Map<string, number>();
  const checked = new Map<string, number>();
  /** Projects being written now: an ask that lands meanwhile waits for the next turn. */
  const writing = new Set<string>();

  /** The project's repository as one checkout online reads it: its default branch, last commits, and design/. */
  const repository = async (
    projectId: string
  ): Promise<
    | {
        branch: string;
        commits: { sha: string; subject: string }[];
        design: boolean;
      }
    | undefined
  > => {
    const place = (db.project(projectId)?.places ?? []).find(
      (each) => each.kind === "checkout" && deps.online(each.machineId)
    );
    if (!place) {
      return;
    }
    const read = await deps
      .run(
        place.machineId,
        place.path,
        `${SAFE_GIT_SHELL}cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && b=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || git symbolic-ref --quiet --short HEAD) && printf '%s\\n' "$b" && if [ -d design ]; then echo yes; else echo no; fi && git log -5 --format='%H%x09%s' "$b" --`,
        READ_MS
      )
      .catch(() => undefined);
    if (read?.exitCode !== 0) {
      return;
    }
    const [branch = "", design = "", ...log] = read.stdout.trim().split("\n");
    return {
      branch: branch.replace(ORIGIN, ""),
      design: design === "yes",
      commits: log
        .map((line) => {
          const tab = line.indexOf("\t");
          return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
        })
        .filter((commit) => commit.sha.length > 0),
    };
  };

  /** The files under a folder of the project's, by path; none when it has no such folder. */
  const filesIn = async (
    projectId: string,
    dir: string,
    recursive: boolean
  ): Promise<string[]> => {
    try {
      const listing = await listFolder(projectId, dir, recursive);
      return listing.entries
        .filter((entry) => entry.kind === "file")
        .map((entry) => entry.path);
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return [];
      }
      throw error;
    }
  };

  /**
   * Task kinds filed often: each task made in the last
   * {@link STARTER_RECENT_DAYS} counted under its type, else its first
   * label; the kinds filed {@link STARTER_OFTEN} times or more, most first,
   * each with its newest tasks.
   */
  const kindsFiledOften = (
    all: TaskSummary[],
    now: number
  ): StarterInputs["recentKinds"] => {
    const since = now - STARTER_RECENT_DAYS * DAY_MS;
    const byKind = new Map<string, TaskSummary[]>();
    for (const task of all) {
      const kind = task.type ?? task.labels[0];
      if (kind && task.createdAt >= since) {
        byKind.set(kind, [...(byKind.get(kind) ?? []), task]);
      }
    }
    return [...byKind]
      .filter(([, filed]) => filed.length >= STARTER_OFTEN)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, filed]) => ({
        name,
        count: filed.length,
        tasks: filed
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((task) => task.id),
      }));
  };

  /**
   * Event sources whose events in the last {@link STARTER_RECENT_DAYS}
   * reached no routine (stored only, or handed to the lead), by source and
   * kind, most first.
   */
  const unroutedEvents = (
    projectId: string,
    now: number
  ): StarterInputs["unrouted"] => {
    const since = now - STARTER_RECENT_DAYS * DAY_MS;
    const routineIds = new Set(
      db.routines.list(projectId).map((routine) => routine.id)
    );
    const counts = new Map<
      string,
      { kind: string; source: string; n: number }
    >();
    for (const event of db.ingress.events(projectId, UNROUTED_READ)) {
      if (
        event.receivedAt.getTime() < since ||
        (event.routedTo !== null && routineIds.has(event.routedTo))
      ) {
        continue;
      }
      const key = `${event.source} ${event.kind}`;
      const held = counts.get(key) ?? {
        source: event.source,
        kind: event.kind,
        n: 0,
      };
      held.n += 1;
      counts.set(key, held);
    }
    return [...counts.values()]
      .sort((a, b) => b.n - a.n)
      .map(({ source, kind, n }) => ({ source, kind, count: n }));
  };

  /** What the project holds now, bounded. */
  const gather = async (projectId: string): Promise<StarterInputs> => {
    const project = db.project(projectId);
    const template = project?.template ?? null;
    const [{ tasks: all }, agents, knowledge, drafts, repo] = await Promise.all(
      [
        tasks.list(projectId),
        fileOr(projectId, AGENTS_FILE),
        filesIn(projectId, KNOWLEDGE_DIR, true),
        filesIn(projectId, DRAFTS_DIR, false),
        repository(projectId),
      ]
    );
    const now = Date.now();
    const open = all
      .filter((task) => task.kind !== null && OPEN_KINDS.has(task.kind))
      .sort((a, b) => weight(b) - weight(a) || b.updatedAt - a.updatedAt);
    const starterTasks: StarterTask[] = open.map((task) => ({
      id: task.id,
      title: task.title,
      stage: task.stage,
      kind: task.kind,
      days: Math.max(0, Math.floor((now - task.updatedAt) / DAY_MS)),
      waitsOnYou: task.needsYou,
      failed: task.lastAttemptFailed
        ? (task.attempts[0]?.endedHow ?? "It failed without a reason.")
        : null,
      blocked: task.blockedBy.length > 0,
      design: designShaped(template, task),
    }));
    const routineFailures = db.routines.list(projectId).flatMap((routine) => {
      const [last] = db.routines.runs(routine.id, 1);
      return last?.outcome === "failed"
        ? [
            {
              kind: "routine" as const,
              id: routine.id,
              name: routine.name,
              reason: last.reason ?? "",
              at: (last.endedAt ?? last.startedAt).getTime(),
            },
          ]
        : [];
    });
    const attemptFailures = open
      .filter((task) => task.lastAttemptFailed)
      .map((task) => ({
        kind: "attempt" as const,
        id: task.id,
        name: task.title,
        reason: task.attempts[0]?.endedHow ?? "",
        at: task.attempts[0]?.endedAt ?? task.updatedAt,
      }));
    return boundStarterInputs({
      name: project?.name ?? projectId,
      template,
      agents,
      knowledge,
      tasks: starterTasks,
      threads: db.projectThreads(projectId).map((thread) => ({
        id: thread.id,
        title: thread.title,
        last: thread.last,
      })),
      branch: repo?.branch ?? null,
      commits: repo?.commits ?? [],
      designWork:
        designShaped(template, { labels: [], outputs: [] }) ||
        starterTasks.some((task) => task.design),
      hasDesign:
        existsSync(join(projectRoot(projectId), "design")) ||
        (repo ? repo.design : null),
      failures: [...routineFailures, ...attemptFailures]
        .sort((a, b) => b.at - a.at)
        .map(({ at: _at, ...failure }) => failure),
      recentKinds: kindsFiledOften(all, now),
      unrouted: unroutedEvents(projectId, now),
      drafts: drafts.filter((path) => OUI.test(path)),
      routines: db.routines
        .list(projectId)
        .map((routine) => ({ id: routine.id, name: routine.name })),
      shown: db.starters.outcomes(projectId, 10).map((each) => ({
        place: each.place,
        text: each.text,
        outcome: each.outcome,
      })),
    });
  };

  const publish = (
    projectId: string,
    place: StarterPlace,
    starters: ProjectStarter[]
  ) => deps.broadcast({ kind: "starters.changed", projectId, place, starters });

  /** The project's sets as they stand, each place's, when every place has one. */
  const storedSets = (projectId: string) => {
    const sets = STARTER_PLACES.map((place) =>
      db.starters.set(projectId, place)
    );
    return sets.every((set) => set !== undefined) ? sets : undefined;
  };

  /** Writes the project's set now: Jev asked over what it holds, unless that is what the stored set was asked over. */
  const write = async (
    projectId: string,
    triggers: Set<StartersTrigger>
  ): Promise<void> => {
    if (!db.project(projectId)) {
      return;
    }
    const trigger = [...triggers].join(", ");
    const access = jevAccess(db);
    if (!access) {
      startersOff(projectId);
      for (const place of STARTER_PLACES) {
        publish(projectId, place, []);
      }
      return;
    }
    const inputs = await gather(projectId);
    const inputHash = hashOf(inputs);
    const stored = storedSets(projectId);
    checked.set(projectId, Date.now());
    if (stored?.every((set) => set?.inputHash === inputHash)) {
      console.log(
        `[starters] project=${projectId} trigger=${trigger}: unchanged since ${stored[0]?.generatedAt.toISOString()}, Jev not asked`
      );
      return;
    }
    asked.set(projectId, Date.now());
    let written: Awaited<ReturnType<typeof jevStarters>>;
    try {
      written = await jevStarters(access, projectId, inputs);
    } catch (error) {
      if (error instanceof JevFailed) {
        // askRow logged Jev's words; the stored sets stand.
        return;
      }
      throw error;
    }
    // Every place's set from this one ask, in one write.
    db.starters.replace(projectId, {
      inputHash,
      trigger,
      starters: written.starters,
    });
    console.log(
      `[starters] project=${projectId} trigger=${trigger}: wrote ${STARTER_PLACES.map((place) => `${place} ${written.starters[place].length}`).join(", ")}${written.dropped > 0 ? `; dropped ${written.dropped} not grounded in the inputs` : ""}${written.refused.map((each) => `; refused “${each.reason}”: ${each.why}`).join("")}`
    );
    for (const place of STARTER_PLACES) {
      publish(projectId, place, written.starters[place]);
    }
  };

  /** Asks for the project's set: after the quiet, and no sooner than the gap since its last ask. */
  const touched = (projectId: string, trigger: StartersTrigger): void => {
    const held = waiting.get(projectId);
    const triggers = held?.triggers ?? new Set<StartersTrigger>();
    triggers.add(trigger);
    if (held) {
      clearTimeout(held.timer);
    }
    const now = Date.now();
    const last =
      asked.get(projectId) ??
      db.starters.set(projectId, "board")?.generatedAt.getTime() ??
      0;
    const at = Math.max(now + QUIET_MS, last + GAP_MS);
    // Not on the hub's lifetime: a timer per project, dropped at the next
    // ask, as design-offers.ts holds its look.
    const timer = setTimeout(() => {
      waiting.delete(projectId);
      if (writing.has(projectId)) {
        touched(projectId, trigger);
        return;
      }
      writing.add(projectId);
      write(projectId, triggers)
        .catch((error: unknown) =>
          console.warn(
            `[starters] project=${projectId}: ${error instanceof Error ? error.message : String(error)}`
          )
        )
        .finally(() => writing.delete(projectId));
    }, at - now);
    waiting.set(projectId, { timer, triggers });
  };

  return {
    touched,

    /** A task filed or moved changes what the project holds. */
    taskChanged(event: TaskEvent): void {
      if (event.kind !== "changed") {
        touched(event.projectId, "task moved");
      }
    },

    /** A work item of the project ended: one that failed, or one whose commits landed on its base branch. */
    itemEnded(item: WorkItemRow): void {
      if (!item.projectId) {
        return;
      }
      if (item.state === "failed") {
        touched(item.projectId, "attempt failed");
      } else if (item.state === "done" && item.lands === "main") {
        touched(item.projectId, "commit landed");
      }
    },

    /** A routine of the project failed its run. */
    routineFailed(projectId: string | null): void {
      if (projectId) {
        touched(projectId, "routine failed");
      }
    },

    /** Caw answered in one of the project's threads: his turn there ended. */
    threadAnswered(threadId: string): void {
      const thread = db.thread(threadId);
      if (thread) {
        touched(thread.projectId, "turn ended");
      }
    },

    /** A session made one of the project's routines. */
    routineMade(projectId: string | null): void {
      if (projectId) {
        touched(projectId, "routine made");
      }
    },

    /** An event from outside landed for the project (ingress.ts `ingest`). */
    eventLanded(projectId: string): void {
      touched(projectId, "event received");
    },

    /**
     * The project's set for a place, for a read: none while Jev is off;
     * otherwise the stored one, every place asked again when it is stale or
     * there is none yet.
     */
    read(projectId: string, place: StarterPlace): ProjectStarter[] {
      if (!jevAccess(db)) {
        return [];
      }
      const stored = db.starters.set(projectId, place);
      const seen = Math.max(
        stored?.generatedAt.getTime() ?? 0,
        checked.get(projectId) ?? 0
      );
      if (
        Date.now() - seen > STALE_MS &&
        !waiting.has(projectId) &&
        !writing.has(projectId)
      ) {
        touched(projectId, "stale");
      }
      return stored?.starters ?? [];
    },

    /** What the person did with a starter of a place's set: sent as it stood, or changed. */
    record(
      projectId: string,
      place: StarterPlace,
      text: string,
      outcome: "picked" | "edited"
    ): { ok: true } {
      const stored = db.starters.set(projectId, place);
      if (!stored?.starters.some((starter) => starter.text === text)) {
        throw new FolderRefusal(
          404,
          "That starter is not one this project offers there now."
        );
      }
      db.starters.record(projectId, place, text, outcome);
      return { ok: true };
    },
  };
};

export type ProjectStarters = ReturnType<typeof createProjectStarters>;

/** What the person did with a starter they pressed, told when the composer sends. */
export const starterRoutes = (starters: ProjectStarters) =>
  new Elysia().post(
    "/api/projects/:id/starters/outcome",
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        place: t.Union(STARTER_PLACES.map((place) => t.Literal(place))),
        text: t.String({ minLength: 1, maxLength: 200 }),
        outcome: t.Union([t.Literal("picked"), t.Literal("edited")]),
      }),
    },
    ({ params, body }) => {
      try {
        return starters.record(params.id, body.place, body.text, body.outcome);
      } catch (error) {
        return refused(error);
      }
    }
  );
