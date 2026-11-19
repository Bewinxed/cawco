/**
 * A project's delegate type proposals (§5.1, "Caw can propose a new type as
 * a file diff you approve"): Caw's `folder_write` of a `delegates/` file,
 * checked to make a type whole (project-delegate-types.ts), kept as
 * `memory/proposals/<id>.json` and parked for the person through the hub's
 * one needs-you path (pending.ts), drawn as a diff on every surface (core
 * permission-presentation.ts). A delegate type is fleet configuration, so
 * it waits for him; the project's memory files never pass through here
 * (memory-run.ts writes them with nothing waiting).
 *
 * - **Approve** commits it as the person; a file changed since is merged
 *   three ways (proposal-base.ts), and refused when it no longer applies.
 *   He may edit the card's diff first; his edit must still make a type.
 * - **Reject** takes the proposal file out.
 * - **No longer applying**: every commit to a file it changes reads it
 *   again, and one that no longer applies closes then, its session told.
 * - **The hub starting** parks every open one again. A memory proposal from
 *   before the nightly run (its files not under `delegates/`) is closed
 *   then, once, its notes left in the inbox for the run.
 */

import type { ArrivingAsk } from "@cawco/core/frames";
import { DELEGATE_TYPE_PROPOSAL_TOOL } from "@cawco/core/permission-presentation";
import type { ProjectNote } from "@cawco/core/project-conversation";
import type { InstanceRow } from "@cawco/core/protocol";
import type { PermissionResult } from "@cawco/core/session-messages";
import { parseRecord } from "@cawco/core/state-file";
import { askWords } from "@cawco/core/words/asks";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import { ProposalSchema } from "./db/stored-shapes";
import type { Proposal } from "./db/stored-types";
import { boardTitle } from "./labels";
import { fileOr } from "./memory";
import { typeFileProblem } from "./project-delegate-types";
import {
  changeFolderFiles,
  type FolderAuthor,
  folderFileNames,
  folderHistory,
  writeFolderFile,
  YOU,
} from "./project-folder";
import { appliesNow } from "./proposal-base";

const PROPOSALS_DIR = "memory/proposals";
/** Where a project's delegate types are, one file each (project-delegate-types.ts). */
const DELEGATES_DIR = "delegates/";
const PROPOSAL_ID = /^p-\d{8}-\d{6}-[0-9a-f]{6}$/u;
const STAMP_PUNCTUATION = /[-:]/gu;
const HUB: FolderAuthor = { name: "CawCo hub" };
/** What a parked proposal's caller hears. */
const WAITING =
  "The person sees it as a needs-you item with its diff; nothing changes until they approve it.";

/** `p-20261013-120000-ab12cd`: sorts by when it was made. */
const proposalIdAt = (at: Date): string => {
  const stamp = at
    .toISOString()
    .slice(0, 19)
    .replace(STAMP_PUNCTUATION, "")
    .replace("T", "-");
  return `p-${stamp}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`;
};

/** Whether a kept proposal file reads as one (its files whole). */
const wholeProposal = (parsed: Proposal): boolean =>
  PROPOSAL_ID.test(parsed.id) &&
  Array.isArray(parsed.files) &&
  parsed.files.length > 0 &&
  parsed.files.every(
    (file) =>
      typeof file.path === "string" &&
      typeof file.before === "string" &&
      typeof file.content === "string"
  );

/** A proposal's files, by path, as one line: its log's and its commit's. */
const pathsOf = (proposal: Proposal): string =>
  proposal.files.map((file) => file.path).join(", ");

/** Whether a proposal changes delegate types alone: one from before the nightly run changes memory files, and is closed. */
const typesOnly = (proposal: Proposal): boolean =>
  proposal.files.every((file) => file.path.startsWith(DELEGATES_DIR));

/** A file the person edited in a card's diff, as their answer carries it. */
const EditedFile = z.object({ content: z.string(), path: z.string() });

/** The `edits` the person's answer carries, when its input is an object. */
const editsAnswered = (input: unknown): unknown =>
  typeof input === "object" && input !== null && "edits" in input
    ? input.edits
    : undefined;

/** Your answer to a proposal for `paths`, as its note in the project's conversation: `sha` is your commit, null when you declined; it links the first file. */
const answeredNote = (
  paths: string[],
  sha: string | null,
  result: PermissionResult
): ProjectNote => {
  const path = paths[0] ?? "";
  const named = paths.join(", ");
  return sha === null
    ? {
        title: `You declined the change to ${named}`,
        body:
          (result.behavior === "deny" && result.message.trim()) ||
          "Nothing changed.",
        event: { kind: "file", what: "declined", path, sha },
      }
    : {
        title: `You approved the change to ${named}`,
        body: `Committed as your commit ${sha.slice(0, 9)}.`,
        event: { kind: "file", what: "approved", path, sha },
      };
};

export interface TypeProposalsDeps {
  readonly db: Pick<DbShape, "listProjects" | "project">;
  /** The project's folder changed under its tasks (a commit landed). */
  readonly folderChanged: (projectId: string) => void;
  /** A note to the person in the project's conversation (caw.ts `notice`); wakes no model. */
  readonly notice: (projectId: string, note: ProjectNote) => void;
  /** Parks an ask for the person: the pending ledger, every dashboard, push. */
  readonly park: (envelope: ArrivingAsk) => void;
  /**
   * Takes a settled ask off the pending ledger: answered, or (`closed`, a
   * sentence with no stop) closed by the hub because it no longer applies.
   */
  readonly settle: (requestId: string, closed?: string) => void;
  /**
   * Says `text` to the session `instanceId` (a former id is the session it
   * is part of now), under the ask's origin, which wakes it as an answer
   * does, its transcript reading `line`; false when that session can never
   * act again, and nothing is said.
   */
  readonly tell: (instanceId: string, text: string, line: string) => boolean;
}

export const createTypeProposals = ({
  db,
  folderChanged,
  notice,
  park,
  settle,
  tell,
}: TypeProposalsDeps) => {
  /** Open proposals, by id: the project each is in. */
  const open = new Map<string, string>();
  /** Proposals the person's answer is being carried out for: no other path closes them meanwhile. */
  const answering = new Set<string>();
  /** Proposals being closed ({@link closeStale}): each closes once. */
  const closing = new Set<string>();

  const proposalsOf = async (projectId: string) => {
    const all = await folderFileNames(projectId, PROPOSALS_DIR);
    if (all instanceof ElysiaStatus) {
      return all;
    }
    const names = all.filter((name) => name.endsWith(".json")).sort();
    const read = await Promise.all(
      names.map(async (name) => {
        const path = `${PROPOSALS_DIR}/${name}`;
        let why = "it names no files whole";
        try {
          const text = await fileOr(projectId, path);
          const parsed =
            text instanceof ElysiaStatus
              ? undefined
              : parseRecord(path, text, ProposalSchema);
          if (parsed && wholeProposal(parsed)) {
            return parsed;
          }
        } catch (error) {
          why = error instanceof Error ? error.message : String(error);
        }
        console.warn(
          `[type proposals] ${projectId}: ${path} does not read as a proposal (${why}); it is not parked`
        );
      })
    );
    return read.filter((proposal) => proposal !== undefined);
  };

  /** The proposal as the person's ask: drawn as a diff per file, answered by Approve or Reject. */
  const envelopeOf = (
    proposal: Proposal,
    projectName: string
  ): ArrivingAsk => ({
    verb: "frames",
    machineId: "hub",
    instanceId: proposal.id,
    requestId: proposal.id,
    payload: {
      kind: "permission_request",
      instanceId: proposal.id,
      requestId: proposal.id,
      harness: "claude",
      requestKind: "tool",
      toolName: DELEGATE_TYPE_PROPOSAL_TOOL,
      input: {
        files: proposal.files,
        notes: proposal.notes,
        why: proposal.why,
        project: projectName,
      },
      memoryProposal: proposal.id,
      projectId: proposal.projectId,
      proposer: `${proposal.by} · ${projectName}`,
      raisedAt: new Date(proposal.time).getTime(),
      ...(proposal.session ? { originInstanceId: proposal.session } : {}),
      ...(proposal.toolUseId ? { toolUseId: proposal.toolUseId } : {}),
    },
  });

  const parkProposal = (proposal: Proposal): void => {
    const project = db.project(proposal.projectId);
    if (!project) {
      return;
    }
    open.set(proposal.id, proposal.projectId);
    park(envelopeOf(proposal, project.name));
  };

  /** A proposal kept as its file, then parked for the person where it was made. */
  const keep = async (proposal: Proposal, project: ProjectRow) => {
    const written = await writeFolderFile(
      project.id,
      `${PROPOSALS_DIR}/${proposal.id}.json`,
      `${JSON.stringify(proposal, null, 2)}\n`,
      {
        author: { name: proposal.by },
        message: `delegates: propose a change to ${pathsOf(proposal)}`,
      }
    );
    if (written instanceof ElysiaStatus) {
      return written;
    }
    folderChanged(project.id);
    parkProposal(proposal);
    console.log(
      `[type proposals] ${project.name}: ${proposal.id} by ${proposal.by} proposes ${pathsOf(proposal)} at ${written.sha.slice(0, 9)}`
    );
  };

  /**
   * Caw's delegate type: his `folder_write` of a `delegates/` file, checked
   * to make a type whole, kept and parked in the session that wrote it as a
   * proposal. Nothing is written to `delegates/` until the person approves.
   */
  const proposeType = async (
    actor: InstanceRow,
    path: string,
    content: string,
    toolUseId: string | undefined
  ) => {
    const { projectId } = actor;
    const project = projectId ? db.project(projectId) : undefined;
    if (!project) {
      return problem(409, {
        code: "memory-session-no-project",
        detail: "This session is in no project, so it has no delegates/.",
      });
    }
    const misfit = typeFileProblem(path, content);
    if (misfit) {
      return problem(400, {
        code: "memory-type-unfit",
        detail: `${path} was not proposed: ${misfit}`,
      });
    }
    const before = await fileOr(project.id, path);
    if (before instanceof ElysiaStatus) {
      return before;
    }
    if (before === content) {
      return problem(409, {
        code: "memory-change-empty",
        detail: `${path} already says exactly that; nothing to change.`,
      });
    }
    const history = await folderHistory(project.id, "", 1);
    if (history instanceof ElysiaStatus) {
      return history;
    }
    const name = path.slice(DELEGATES_DIR.length, -".md".length);
    const at = new Date();
    const proposal: Proposal = {
      id: proposalIdAt(at),
      projectId: project.id,
      files: [{ path, before, content }],
      base: history.commits[0]?.sha ?? "",
      notes: [],
      why: before
        ? `a change to the delegate type ${name}`
        : `a new delegate type, ${name}`,
      by: boardTitle(actor),
      session: actor.id,
      time: at.toISOString(),
      ...(toolUseId ? { toolUseId } : {}),
    };
    const kept = await keep(proposal, project);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    return { id: proposal.id, path, waiting: WAITING };
  };

  /** The proposal file, read back; undefined when it is gone. */
  const proposalFile = async (projectId: string, id: string) => {
    const proposals = await proposalsOf(projectId);
    return proposals instanceof ElysiaStatus
      ? proposals
      : proposals.find((proposal) => proposal.id === id);
  };

  /** Whether a proposal still applies to its files as they are now (proposal-base.ts). */
  const mergedNow = (proposal: Proposal) =>
    appliesNow(proposal.files, (path) => fileOr(proposal.projectId, path));

  /**
   * A proposal that no longer applies to `path`, closed by the hub: its
   * file goes in a commit whose message keeps why, it leaves every screen
   * with why, and the session that proposed it is told (under the ask's
   * origin, waking it) so it can propose again from the file as it is now.
   * Answers whether that session was told.
   */
  const closeStale = async (proposal: Proposal, path: string) => {
    const { projectId } = proposal;
    if (closing.has(proposal.id)) {
      return false;
    }
    closing.add(proposal.id);
    const why = askWords.proposalClosed(path);
    try {
      const closed = await changeFolderFiles(
        projectId,
        { writes: [], deletes: [`${PROPOSALS_DIR}/${proposal.id}.json`] },
        { author: HUB, message: `delegates: ${proposal.id} closed: ${why}` }
      );
      if (closed instanceof ElysiaStatus) {
        return closed;
      }
      open.delete(proposal.id);
    } finally {
      closing.delete(proposal.id);
    }
    folderChanged(projectId);
    settle(proposal.id, why);
    const told = proposal.session
      ? tell(
          proposal.session,
          askWords.proposalClosedTold(proposal.id, path),
          askWords.proposalClosedLine(path)
        )
      : false;
    console.log(
      `[type proposals] ${projectId}: ${proposal.id} closed, ${why}; ${told ? `${proposal.session} told` : "no session to tell"}`
    );
    return told;
  };

  /**
   * A commit changed `paths` in `projectId`'s folder: every open proposal
   * that changes one of them and no longer applies is closed
   * ({@link closeStale}), at the change and not when the person presses.
   * One being answered is the answer's to settle.
   */
  const folderCommitted = async (
    projectId: string,
    paths: ReadonlySet<string>
  ) => {
    if (![...paths].some((path) => path.startsWith(DELEGATES_DIR))) {
      return;
    }
    const proposals = await proposalsOf(projectId);
    if (proposals instanceof ElysiaStatus) {
      return proposals;
    }
    for (const proposal of proposals.filter(
      (each) =>
        open.get(each.id) === projectId &&
        !answering.has(each.id) &&
        each.files.some((file) => paths.has(file.path))
    )) {
      const merged = await mergedNow(proposal);
      if (merged instanceof ElysiaStatus) {
        return merged;
      }
      if (
        "stale" in merged &&
        open.has(proposal.id) &&
        !answering.has(proposal.id)
      ) {
        const closed = await closeStale(proposal, merged.stale);
        if (closed instanceof ElysiaStatus) {
          return closed;
        }
      }
    }
  };

  /**
   * The proposal as the person approves it: when their answer carries
   * `updatedInput.edits` (a card's diff they edited, each `{ path, content }`
   * of a file the proposal changes), those files' text in place of the
   * proposal's, each still a whole type. Unedited, the proposal as it was.
   */
  const asApproved = (proposal: Proposal, result: PermissionResult) => {
    const asked =
      result.behavior === "allow"
        ? editsAnswered(result.updatedInput)
        : undefined;
    if (!Array.isArray(asked)) {
      return proposal;
    }
    const edits = new Map<string, string>();
    for (const each of asked) {
      const edited = EditedFile.safeParse(each);
      if (!edited.success) {
        return problem(400, {
          code: "memory-edit-unshaped",
          detail: "Each edited file is `{ path, content }`.",
        });
      }
      if (!proposal.files.some((file) => file.path === edited.data.path)) {
        return problem(400, {
          code: "memory-edit-not-proposed",
          detail: `${edited.data.path} is not a file this proposal changes.`,
        });
      }
      edits.set(edited.data.path, edited.data.content);
    }
    const files = proposal.files.map((file) => ({
      ...file,
      content: edits.get(file.path) ?? file.content,
    }));
    for (const file of files) {
      const misfit = typeFileProblem(file.path, file.content);
      if (misfit) {
        return problem(400, {
          code: "memory-type-unfit",
          detail: `${file.path} was not approved: ${misfit}`,
        });
      }
    }
    return { ...proposal, files };
  };

  /**
   * The person's approval of `proposal`, as they left it, applied as their
   * commit with the proposal's file taken out; one that no longer applies
   * closes, and its words are thrown.
   */
  const approve = async (proposal: Proposal, result: PermissionResult) => {
    const asked = asApproved(proposal, result);
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    const merged = await mergedNow(asked);
    if (merged instanceof ElysiaStatus) {
      return merged;
    }
    if ("stale" in merged) {
      const told = await closeStale(proposal, merged.stale);
      if (told instanceof ElysiaStatus) {
        return told;
      }
      const closed = askWords.proposalClosedOnAnswer(merged.stale);
      throw new Error(
        told ? `${closed} ${askWords.proposerTold(proposal.by)}` : closed
      );
    }
    const written = await changeFolderFiles(
      proposal.projectId,
      {
        writes: merged.writes,
        deletes: [`${PROPOSALS_DIR}/${proposal.id}.json`],
      },
      {
        author: YOU,
        message: `${pathsOf(proposal)}: ${proposal.why}\n\nProposal: ${proposal.id}`,
      }
    );
    if (written instanceof ElysiaStatus) {
      return written;
    }
    folderChanged(proposal.projectId);
    return written.sha;
  };

  /** Reject: the proposal's file goes. */
  const reject = async (proposal: Proposal) => {
    const done = await changeFolderFiles(
      proposal.projectId,
      { writes: [], deletes: [`${PROPOSALS_DIR}/${proposal.id}.json`] },
      { author: YOU, message: `delegates: ${proposal.id} rejected` }
    );
    if (done instanceof ElysiaStatus) {
      return done;
    }
    folderChanged(proposal.projectId);
  };

  /** The person's answer to the open proposal `requestId`, carried out; the project's conversation keeps it as a note. */
  const answerOpen = async (
    projectId: string,
    requestId: string,
    result: PermissionResult
  ) => {
    const proposal = await proposalFile(projectId, requestId);
    if (proposal instanceof ElysiaStatus) {
      return proposal;
    }
    if (proposal) {
      const approved = result.behavior === "allow";
      let sha: string | null = null;
      if (approved) {
        const applied = await approve(proposal, result);
        if (applied instanceof ElysiaStatus) {
          return applied;
        }
        sha = applied;
      } else {
        const rejected = await reject(proposal);
        if (rejected instanceof ElysiaStatus) {
          return rejected;
        }
      }
      notice(
        projectId,
        answeredNote(
          proposal.files.map((file) => file.path),
          sha,
          result
        )
      );
    }
    open.delete(requestId);
    settle(requestId);
  };

  /** The memory proposals from before the nightly run closed, in one commit: their notes stay in the inbox for the run. */
  const closeMemoryProposals = async (
    project: ProjectRow,
    memory: Proposal[]
  ) => {
    if (memory.length === 0) {
      return;
    }
    const closed = await changeFolderFiles(
      project.id,
      {
        writes: [],
        deletes: memory.map(
          (proposal) => `${PROPOSALS_DIR}/${proposal.id}.json`
        ),
      },
      {
        author: HUB,
        message: `memory: ${memory.length} open proposal${memory.length === 1 ? "" : "s"} closed. ${memoryRunWords.proposalClosed}`,
      }
    );
    if (closed instanceof ElysiaStatus) {
      return closed;
    }
    folderChanged(project.id);
  };

  /**
   * A project's open proposals parked again as the hub starts, each that no
   * longer applies closed. One from before the nightly run that changes
   * memory files is closed once, in one commit: its notes stay in the inbox
   * for the run.
   */
  const parkAgain = async (project: ProjectRow) => {
    const proposals = await proposalsOf(project.id);
    if (proposals instanceof ElysiaStatus) {
      return proposals;
    }
    const closed = await closeMemoryProposals(
      project,
      proposals.filter((proposal) => !typesOnly(proposal))
    );
    if (closed) {
      return closed;
    }
    for (const proposal of proposals.filter(typesOnly)) {
      // The folder may have changed while no hub watched it.
      const merged = await mergedNow(proposal);
      if (merged instanceof ElysiaStatus) {
        return merged;
      }
      if ("stale" in merged) {
        const stale = await closeStale(proposal, merged.stale);
        if (stale instanceof ElysiaStatus) {
          return stale;
        }
      } else {
        parkProposal(proposal);
      }
    }
  };

  return {
    proposeType,
    folderCommitted,

    /** Every open proposal, parked again as the hub starts: the person's asks outlive it. */
    start: async (): Promise<void> => {
      await Promise.all(
        db.listProjects().map(async (project) => {
          const notRead = (why: string) =>
            console.warn(
              `[type proposals] ${project.name}: its proposals were not read: ${why}`
            );
          try {
            const parked = await parkAgain(project);
            if (parked instanceof ElysiaStatus) {
              notRead(parked.response.detail);
            }
          } catch (error) {
            notRead(error instanceof Error ? error.message : String(error));
          }
        })
      );
    },

    /** Whether `requestId` is a proposal waiting on the person. */
    owns: (requestId: string): boolean => open.has(requestId),

    /**
     * Session `from` folded into `to`, the one it went on in: each open
     * proposal it made names `to` from here (its kept file rewritten, so a
     * restart reads it so too), and is parked again, its card drawn under
     * `to`.
     */
    async folded(from: string, to: string) {
      for (const projectId of new Set(open.values())) {
        const proposals = await proposalsOf(projectId);
        if (proposals instanceof ElysiaStatus) {
          return proposals;
        }
        const moved = proposals.filter(
          (proposal) => open.has(proposal.id) && proposal.session === from
        );
        if (moved.length === 0) {
          continue;
        }
        const changed = await changeFolderFiles(
          projectId,
          {
            writes: moved.map((proposal) => ({
              path: `${PROPOSALS_DIR}/${proposal.id}.json`,
              content: `${JSON.stringify({ ...proposal, session: to }, null, 2)}\n`,
            })),
            deletes: [],
          },
          {
            author: HUB,
            message: `delegates: ${moved.length} open proposal${moved.length === 1 ? "" : "s"} of ${from} go${moved.length === 1 ? "es" : ""} on with ${to}, the session it went on in`,
          }
        );
        if (changed instanceof ElysiaStatus) {
          return changed;
        }
        for (const proposal of moved) {
          parkProposal({ ...proposal, session: to });
        }
      }
    },

    /**
     * The person's answer to a proposal: approved, it applies as they left
     * it; rejected, it goes. Either way the ask leaves the ledger once done.
     */
    async answer(requestId: string, result: PermissionResult) {
      const projectId = open.get(requestId);
      if (!projectId || answering.has(requestId)) {
        throw new Error("That proposal is no longer waiting.");
      }
      answering.add(requestId);
      try {
        return await answerOpen(projectId, requestId, result);
      } finally {
        answering.delete(requestId);
      }
    },
  };
};

export type TypeProposals = ReturnType<typeof createTypeProposals>;
