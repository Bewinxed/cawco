/**
 * A BROKEN LAW BECOMES A DEFECT TASK (core invariant.ts, laws.ts). A law is
 * a programmer's error in CawCo's own code, so its first break files one
 * task for agents in the project whose repository is CawCo's, labelled and
 * triaged as the project's other defects are, for dispatch to take. A later
 * break of the same law, while that task is open, is a comment on it; once
 * it is done or dropped, the next break files a new one. The person sees
 * the task on the board as he sees any defect, never the law on his screen.
 *
 * The project is the one whose main repository on the hub (its bare
 * `<projectId>.git`, git-remote.ts) has CawCo's root commit
 * (`CAWCO_ROOT_COMMIT`): a fleet that does not develop CawCo has none, and
 * files nothing. None or more than one, the `[law]` log line says why, and
 * the next break looks again, so a project added later is found. A match is
 * kept for the hub's run.
 *
 * A law broken on every board publish breaks many times a second, and each
 * comment is a commit in the project's folder: the breaks after the first
 * are gathered into one comment per law at most every
 * {@link LAW_NOTE_GAP_MS}, which counts them and carries the newest.
 */
import { CAWCO_ROOT_COMMIT } from "@cawco/core/binary-distribution";
import { detach, failureOf } from "@cawco/core/detach";
import {
  type InvariantBroken,
  LAWS,
  type Law,
  type LawAbout,
} from "@cawco/core/invariant";
import { runCaptured } from "@cawco/core/run-captured";
import { GIT_LOCALE, safeGitArgv } from "@cawco/core/safe-git";
import { ElysiaStatus } from "elysia";
import { bareRepoPath } from "./git-remote";
import { hubActor, type Tasks } from "./tasks";

/** The least time between two comments on one law's task: 10 min. */
const LAW_NOTE_GAP_MS = 600_000;

/** Each law's task title: the law in plain words, as a defect is named. */
const LAW_TITLES: Record<Law, string> = {
  "running-session-machine-connected":
    "Stop serving a session as running on a machine the hub has no socket for",
  "register-spawned-nothing":
    "Send an agent's first register before any harness probe starts",
  "live-workspace-judge-answers":
    "Keep a judge answering in every workspace a session runs in",
  "owed-send-machine-has-deadline":
    "Stop keeping a send for a machine that reads offline with no deadline",
  "artifact-notice-drawn":
    "Draw every artifact message as an artifact notice, never as the person's words",
};

/** The task's own field naming its law: how a later break finds it open. */
const LAW_FIELD = "law";

/** What the project's other defects carry, which dispatch reads as a defect ready for an agent. */
const DEFECT = {
  labels: ["defect"],
  fields: { triage: "ready-for-agent" },
};

/** One break, as its task tells it. */
interface Occurrence {
  about: LawAbout;
  at: Date;
  message: string;
  /** Where it was raised: the function and file the stack names first outside the law's own code. */
  place: string;
}

/** Breaks of one law not yet on its task: how many, and the newest. */
interface Owed {
  count: number;
  newest: Occurrence;
}

/** The frames of the law's own code, which never name where it was raised. */
const LAW_FRAMES = /\/(?:core\/src\/invariant|hub\/src\/laws)\.ts:/u;
/** A stack frame: `at fn (file:line:col)` or `at file:line:col`. */
const FRAME = /^\s*at (?:(.+?) \((.+)\)|(.+))$/u;
/** A path from the repository's packages on, wherever it was built. */
const PACKAGES = /^.*?\/(packages\/)/u;

/** Where `error` was raised: `fn in packages/…/file.ts:line:col`, else what the stack lacks. */
const placeOf = (error: InvariantBroken): string => {
  for (const line of (error.stack ?? "").split("\n").slice(1)) {
    const frame = FRAME.exec(line);
    const file = frame?.[2] ?? frame?.[3];
    if (!file || LAW_FRAMES.test(file)) {
      continue;
    }
    const path = file.replace(PACKAGES, "$1");
    return frame?.[1] ? `${frame[1]} in ${path}` : path;
  }
  return "not in its stack";
};

/** The ids a break names, one line each, or that it named none. */
const aboutLines = (about: LawAbout): string[] => {
  const lines = [
    ...(about.session ? [`- Session: ${about.session}`] : []),
    ...(about.send ? [`- Send: ${about.send}`] : []),
    ...(about.machine ? [`- Machine: ${about.machine}`] : []),
  ];
  return lines.length > 0 ? lines : ["- It names no session, send or machine."];
};

/** One break, as lines of markdown. */
const occurrenceLines = (one: Occurrence): string[] => [
  `- When: ${one.at.toISOString()}`,
  `- Raised at: \`${one.place}\``,
  ...aboutLines(one.about),
  "",
  "```",
  one.message,
  "```",
];

/** A new law task's description: the law, the break, and what to do. */
const filedWords = (law: Law, owed: Owed, version: string): string =>
  [
    `The hub caught the system law \`${law}\` broken (core \`packages/core/src/invariant.ts\`, \`LAWS\`): “${LAWS[law]}”`,
    "",
    `The frame or request it was found in failed. The hub logged it as a \`[law]\` line on hub ${version}.${owed.count > 1 ? ` It broke ${owed.count} times before this task was filed; the newest:` : ""}`,
    "",
    ...occurrenceLines(owed.newest),
    "",
    "Find the code that let the law break, from the facts above and the law's own comment in `LAWS`, and fix the rule that produced it. A later break of this law while this task is open is a comment here.",
  ].join("\n");

/** A later break's comment on the open task. */
const noteWords = (owed: Owed): string =>
  [
    owed.count > 1
      ? `Broken again, ${owed.count} times since the last note; the newest:`
      : "Broken again:",
    "",
    ...occurrenceLines(owed.newest),
  ].join("\n");

export interface LawTasksDeps {
  /** A timer the hub's lifetime ends (lifetime.ts `after`). */
  after: (ms: number, run: () => void) => unknown;
  /** The hub's bare repositories' folder (config.ts `GIT_ROOT`). */
  gitRoot: string;
  /** Every project the hub has. */
  projectIds: () => string[];
  tasks: Pick<Tasks, "comment" | "create" | "list">;
  /** The hub's version, as the description names it. */
  version: string;
}

export const createLawTasks = (deps: LawTasksDeps) => {
  const actor = hubActor("a system law broke");
  /** The project that takes law tasks, once one matched in this run. */
  let home: string | undefined;
  /** Breaks not yet on their task, by law. */
  const owed = new Map<Law, Owed>();
  /** Laws whose task is being written or whose gap is running: a break meanwhile waits in {@link owed}. */
  const writing = new Set<Law>();

  /** The root commit of `projectId`'s main repository on the hub; null when it has none. */
  const rootOf = async (projectId: string): Promise<string | null> => {
    const ran = await runCaptured(
      safeGitArgv([
        "-C",
        bareRepoPath(deps.gitRoot, { projectId }),
        "rev-list",
        "--max-parents=0",
        "--first-parent",
        "HEAD",
      ]),
      { env: { ...process.env, ...GIT_LOCALE } }
    );
    return ran.code === 0 ? ran.stdout.trim() : null;
  };

  /** The project whose repository is CawCo's; why none takes it when there is not one alone. */
  const homeOf = async (): Promise<{ projectId: string } | { why: string }> => {
    if (home) {
      return { projectId: home };
    }
    const ids = deps.projectIds();
    const roots = await Promise.all(ids.map(rootOf));
    const ours = ids.filter((_, index) => roots[index] === CAWCO_ROOT_COMMIT);
    const [only] = ours;
    if (only && ours.length === 1) {
      home = only;
      return { projectId: only };
    }
    return {
      why:
        ours.length === 0
          ? `no project on this hub has CawCo's repository (root commit ${CAWCO_ROOT_COMMIT.slice(0, 10)})`
          : `${ours.length} projects have CawCo's repository (${ours.join(", ")}), and the hub files in one alone`,
    };
  };

  /** A refusal from the tasks: logged, and a project gone is looked for again. */
  const refused = (
    law: Law,
    projectId: string,
    refusal: { response: { detail: string }; status: number | string }
  ) => {
    if (refusal.status === 404) {
      home = undefined;
    }
    console.error(
      `[law] ${law}: its task in project ${projectId} was not written: ${refusal.response.detail}`
    );
  };

  /** Puts `due` on the law's open task, else on a new one. */
  const write = async (law: Law, due: Owed): Promise<void> => {
    const found = await homeOf();
    if ("why" in found) {
      console.error(`[law] ${law}: no task filed: ${found.why}.`);
      return;
    }
    const { projectId } = found;
    const listed = await deps.tasks.list(projectId, {
      fields: { [LAW_FIELD]: law },
    });
    if (listed instanceof ElysiaStatus) {
      refused(law, projectId, listed);
      return;
    }
    const open = listed.tasks.find(
      (task) => task.kind !== "done" && task.kind !== "dropped"
    );
    const done = open
      ? await deps.tasks.comment(projectId, open.id, noteWords(due), actor)
      : await deps.tasks.create(
          projectId,
          {
            title: LAW_TITLES[law],
            description: filedWords(law, due, deps.version),
            labels: DEFECT.labels,
            fields: { ...DEFECT.fields, [LAW_FIELD]: law },
          },
          actor
        );
    if (done instanceof ElysiaStatus) {
      refused(law, projectId, done);
      return;
    }
    console.info(
      `[law] ${law}: ${open ? "noted on" : "filed as"} ${done.id} in project ${projectId}`
    );
  };

  /** Writes what is owed on `law`, then waits out its gap, until nothing is owed. */
  const drain = async (law: Law): Promise<void> => {
    for (;;) {
      const due = owed.get(law);
      if (!due) {
        writing.delete(law);
        return;
      }
      owed.delete(law);
      try {
        await write(law, due);
      } catch (error) {
        console.error(
          `[law] ${law}: its task was not written: ${failureOf(error)}`
        );
      }
      await new Promise<void>((resolve) => {
        deps.after(LAW_NOTE_GAP_MS, resolve);
      });
    }
  };

  return {
    /** Takes one break (laws.ts `fileWith`): on its law's task now, or in the next note. */
    broke: (error: InvariantBroken): void => {
      const one: Occurrence = {
        about: error.about,
        at: new Date(),
        message: error.message,
        place: placeOf(error),
      };
      const due = owed.get(error.law);
      owed.set(error.law, { count: (due?.count ?? 0) + 1, newest: one });
      if (writing.has(error.law)) {
        return;
      }
      writing.add(error.law);
      detach(drain(error.law), `law ${error.law}'s task`);
    },
  };
};
