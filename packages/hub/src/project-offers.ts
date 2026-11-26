/**
 * "Make this a project" (Projects §2, "Caw suggests, you escalate"). A plain
 * session (no project, started by you) that outgrows itself is offered,
 * once, to become a project; nothing here ever makes one on its own.
 *
 * What counts as outgrowing is code, never a model, and each is cheap enough
 * to ask at every turn's end and every delegate's spawn:
 * - `delegates`: it started a delegate;
 * - `days`: it has been going for more than a day, so it was active on two;
 * - `repo`: its folder belongs to no project, and another session is working
 *   in the same repository (normalised `origin`, projects.ts) on any machine.
 *
 * A session that was offered, whatever it answered, is never offered again:
 * the `project_offers` row says so. Accepting makes or joins the project
 * through the same path the dashboard's "New project" takes, and moves the
 * session and its delegates into it. (A plain session keeps no plan: a
 * plan's steps are a project's tasks and to-dos, plans.ts.)
 */

import type { CommandResult } from "@cawco/core/commands/controls";
import { makeJoin } from "@cawco/core/effect/join";
import type {
  AcceptResult,
  ProjectOfferReason,
  ProjectOfferSummary,
} from "@cawco/core/frames";
import type { MachinePath } from "@cawco/core/machine-path";
import type { ProjectNote } from "@cawco/core/project-conversation";
import type { InstanceRow } from "@cawco/core/protocol";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { DAY_MS } from "@cawco/core/time";
import { Effect } from "effect";
import { Elysia, ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import type { Caw } from "./caw";
import type { DbShape } from "./db";
import type { ProjectOfferRow } from "./db/projects";
import { leafOf, sessionLabel } from "./labels";
import type { HubLifetimeShape } from "./lifetime";
import { machineName } from "./machine-name";
import { tool } from "./mcp-tool";
import type { CreateOrJoinProject } from "./project-making";
import { normaliseRemote } from "./projects";

/** A git read is local; past this the machine is not going to answer it. */
const READ_MS = 10_000;

type InstanceShape = ReturnType<DbShape["listInstances"]>[number];

export interface ProjectOffersDeps {
  /**
   * Makes the project with Caw, or joins the one that has the folder's
   * remote (project-joining.ts `createOrJoinProject`), or its refusal.
   */
  createProject: CreateOrJoinProject;
  db: DbShape;
  /** The hub's lifetime: a folder's remote is read on it. */
  lifetime: HubLifetimeShape;
  online: (machineId: string) => boolean;
  /** To every dashboard: the session's standing offer, or null once answered. */
  publish: (row: InstanceShape, offer: ProjectOfferSummary | null) => void;
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
  /** Notes a new project's start and sends its conversation the setup steps (caw.ts `setup`): its session, when it started. */
  setup: (projectId: string, note: ProjectNote) => ReturnType<Caw["setup"]>;
}

const summaryOf = (row: ProjectOfferRow): ProjectOfferSummary => ({
  instanceId: row.instanceId,
  reason: row.reason,
  line: row.line,
  offeredAt: row.offeredAt.getTime(),
});

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const createProjectOffers = (deps: ProjectOffersDeps) => {
  const { db } = deps;
  /** `machine:folder` → its normalised remote (null: none), once read. Read once per folder. */
  const remotes = new Map<string, string | null>();
  /** Each folder's read of its remote in flight: a second ask while it runs shares it. */
  const reading = makeJoin<string, string | null>();
  /** Sessions being looked at now, so a burst of ends asks once. */
  const looking = new Set<string>();

  const rowOf = (id: string): InstanceShape | undefined =>
    db.getInstancesByIds([id])[0];

  /** A session you started and nothing put in a project: the only kind offered. */
  const plain = (row: InstanceShape | undefined): row is InstanceShape =>
    !!row &&
    !row.projectId &&
    !row.parentInstanceId &&
    !row.workItemId &&
    row.kind === "mainline" &&
    row.status !== "discarded";

  const descendants = (id: string, rows: InstanceShape[]): InstanceShape[] => {
    const found: InstanceShape[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const parent = queue.shift();
      for (const row of rows) {
        if (row.parentInstanceId === parent && !found.includes(row)) {
          found.push(row);
          queue.push(row.id);
        }
      }
    }
    return found;
  };

  const remoteOf = (
    machineId: string,
    cwd: MachinePath
  ): Promise<string | null | undefined> => {
    const key = `${machineId}:${cwd}`;
    const known = remotes.get(key);
    if (known !== undefined) {
      return Promise.resolve(known);
    }
    if (!deps.online(machineId)) {
      // Not known, which is not "no remote": asked again when it is back.
      return Promise.resolve(undefined);
    }
    const read = Effect.tryPromise(() =>
      deps.run(
        machineId,
        cwd,
        `${SAFE_GIT_SHELL}git remote get-url origin`,
        READ_MS
      )
    ).pipe(
      Effect.map((result) =>
        result.exitCode === 0 ? normaliseRemote(result.stdout) : null
      ),
      // A folder that is gone answers nothing, now or later.
      Effect.orElseSucceed(() => null),
      Effect.tap((remote) =>
        Effect.sync(() => {
          remotes.set(key, remote);
        })
      )
    );
    // The promise edge of the read: its callers are promise code.
    return deps.lifetime.run(reading.run(key, read));
  };

  const offer = (
    row: InstanceShape,
    reason: ProjectOfferReason,
    line: string
  ): void => {
    if (!db.offerProject({ instanceId: row.id, reason, line })) {
      return;
    }
    const filed = db.projectOffer(row.id);
    if (filed) {
      deps.publish(row, summaryOf(filed));
    }
  };

  /** The `repo` signal: another session in this folder's repository, which no project has. */
  const sharedRepository = async (
    row: InstanceShape
  ): Promise<string | undefined> => {
    const { cwd } = row;
    if (
      db
        .listProjects()
        .some((project) =>
          project.places.some(
            (place) => place.machineId === row.machineId && place.path === cwd
          )
        )
    ) {
      return;
    }
    const remote = await remoteOf(row.machineId, cwd);
    if (!remote || db.projectByRemote(remote)) {
      return;
    }
    // Live top-level mainline sessions other than this one. Its delegates
    // are never among them: each has a parent.
    const others = db
      .liveMainlineFolders()
      .filter((other) => other.id !== row.id);
    for (const other of others) {
      if ((await remoteOf(other.machineId, other.cwd)) === remote) {
        const where =
          other.machineId === row.machineId
            ? ""
            : ` on ${machineName(db, other.machineId)}`;
        return `Another session is working in ${remote}${where}. Make this one a project?`;
      }
    }
  };

  /** Asks every signal, cheapest first, and offers on the first that holds. */
  const consider = async (id: string, at: "turn" | "spawn"): Promise<void> => {
    const row = rowOf(id);
    if (!plain(row) || db.projectOffer(id) || looking.has(id)) {
      return;
    }
    looking.add(id);
    try {
      // Every turn's end asks: counted and looked up in the database, never
      // a read of every session (2,600 of them) per turn.
      const delegates = db.listedChildCount(id);
      if (delegates > 0) {
        offer(
          row,
          "delegates",
          `This session started ${plural(delegates, "delegate", "delegates")}. Make it a project?`
        );
        return;
      }
      if (at === "spawn") {
        return;
      }
      const age = Date.now() - row.createdAt.getTime();
      if (age > DAY_MS) {
        const days = Math.floor(age / DAY_MS);
        offer(
          row,
          "days",
          `This session has been going for ${days === 1 ? "over a day" : `${days} days`}. Make it a project?`
        );
        return;
      }
      const shared = await sharedRepository(row);
      if (shared) {
        offer(row, "repo", shared);
      }
    } finally {
      looking.delete(id);
    }
  };

  const quietly = (work: Promise<void>, id: string): void => {
    work.catch((error: unknown) =>
      console.warn(
        `[project-offers] ${id}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /** The session `id`, or its refusal (project-offer-session-unknown). */
  const answerable = (id: string) =>
    rowOf(id) ??
    problem(404, {
      code: "project-offer-session-unknown",
      detail: "No session with that id on this hub.",
    });

  /** Why session `row` can't be made a project, in the hub's words, or nothing. */
  const unmakeable = (row: InstanceShape) => {
    if (row.projectId) {
      return problem(409, {
        code: "project-offer-in-project",
        detail:
          "This session is already in a project; there is nothing to make.",
      });
    }
    if (row.parentInstanceId || row.workItemId) {
      return problem(409, {
        code: "project-offer-delegate",
        detail:
          "A delegate belongs to the session that started it. Make that session the project.",
      });
    }
    // Its `cwd` may be a folder its CLI wandered into, not its checkout.
    if (row.launchDir === "unknown") {
      return problem(409, {
        code: "project-offer-folder-unknown",
        detail: `${sessionLabel(row).name}'s conversation is no longer on its machine, so its folder is unknown and it can't be made a project.`,
      });
    }
  };

  return {
    /** A turn ended: is the session past plain? */
    turnEnded(instanceId: string): void {
      quietly(consider(instanceId, "turn"), instanceId);
    },

    /** A session started a delegate: offer it, if it is plain. */
    delegateSpawned(parentInstanceId: string): void {
      quietly(consider(parentInstanceId, "spawn"), parentInstanceId);
    },

    /** The offers standing now, for a dashboard that just opened. */
    open(): ProjectOfferSummary[] {
      return db
        .openProjectOffers()
        .filter((row) => plain(rowOf(row.instanceId)))
        .map(summaryOf);
    },

    /** "Not now": recorded, so it is never offered again; the session's refusal. */
    dismiss(instanceId: string) {
      const row = answerable(instanceId);
      if (row instanceof ElysiaStatus) {
        return row;
      }
      db.answerProjectOffer(instanceId, "dismissed");
      deps.publish(row, null);
    },

    /**
     * "Create project": the project from the session's machine and folder (or
     * the one that already has its repository), and the session and its
     * delegates in it.
     */
    async accept(instanceId: string) {
      const row = answerable(instanceId);
      if (row instanceof ElysiaStatus) {
        return row;
      }
      const unmade = unmakeable(row);
      if (unmade) {
        return unmade;
      }
      const made = await deps.createProject({
        name: leafOf(row.cwd),
        checkout: { machineId: row.machineId, cwd: row.cwd },
        caw: true,
      });
      if ("response" in made) {
        return problem(made.status, {
          code: "project-offer-not-made",
          detail: made.response.detail,
        });
      }
      const { project, joined } = made;
      const moving = [row, ...descendants(row.id, db.listInstances())];
      db.setInstancesProject(
        moving.map((r) => r.id),
        project.id
      );
      db.answerProjectOffer(row.id, "accepted", project.id);
      deps.publish(row, null);

      // A new project is set up by its conversation.
      const from = row.title || sessionLabel(row).name;
      const conversation = joined
        ? undefined
        : await deps.setup(project.id, {
            title: `Project · made from ${from}`,
            event: { kind: "project", what: "made", name: project.name, from },
            body: "",
          });
      if (conversation instanceof ElysiaStatus) {
        return conversation;
      }
      const accepted: AcceptResult = {
        joined,
        project: { id: project.id, name: project.name },
        sessions: moving.map((r) => r.id),
        ...(conversation ? { conversation } : {}),
      };
      return accepted;
    },
  };
};

export type ProjectOffers = ReturnType<typeof createProjectOffers>;

/** The dashboard's routes: the standing offers, and their two answers. */
export const projectOfferRoutes = (offers: ProjectOffers) =>
  new Elysia()
    .get("/api/project-offers", () => offers.open())
    .post(
      "/api/project-offers/:instanceId/dismiss",
      ({ params }) => offers.dismiss(params.instanceId) ?? { ok: true }
    )
    .post("/api/project-offers/:instanceId/accept", ({ params }) =>
      offers.accept(params.instanceId)
    );

/** The MCP tool's name: Caw proposes it in conversation, and you say yes. */
export const PROJECT_FROM_SESSION = "project_from_session";

/**
 * `project_from_session`, for a session you started: the same accept as the
 * dashboard's "Create project", on the calling session. Without `accept` it is
 * the listing's copy, which runs nothing.
 */
export const projectFromSessionTool = (
  accept?: () => ReturnType<ProjectOffers["accept"]>
) =>
  tool(
    PROJECT_FROM_SESSION,
    "Makes this session a project: its machine and folder become the project's place, or it joins the project that already has this repository, and this session and its delegates move into it. " +
      "Use it once the operator says yes to your offer, made in conversation when the work has outgrown one session (it runs for days, starts delegates, leaves follow-ups).",
    {
      confirm: z
        .literal(true)
        .describe("True: the operator said yes to making it a project."),
    },
    async () => {
      if (!accept) {
        throw new Error("Discovery cannot execute tools");
      }
      return await accept();
    },
    acceptedWords
  );

/** What making a session a project did, in words. */
const acceptedWords = (result: AcceptResult): string =>
  [
    `${result.joined ? "Joined" : "Made"} project ${result.project.name}; ${result.sessions.length === 1 ? "this session moved" : `this session and ${result.sessions.length - 1} delegates moved`} into it.`,
    result.conversation
      ? "Its conversation sets it up; the person reads it on the project's page."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

/** Whether a session may make itself a project: one you started, and in none yet. */
export const mayMakeProject = (actor: InstanceRow): boolean =>
  !(actor.parentInstanceId || actor.workItemId || actor.projectId);
