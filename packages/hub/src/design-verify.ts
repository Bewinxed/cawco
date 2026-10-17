/**
 * Enforcement of a project's design system is agentic (Projects spec §5.7;
 * owner: "a deterministic scan for values wouldn't be a good nor accurate
 * approach, it should be agentic"). A separate verifier session, never the
 * builder, judges the rendered work against the project's system and its
 * CSS practices, and its must-fix findings, each tied to an element, go
 * back to the builder before the person sees the result. Jev takes no part.
 * It runs as needed, not to a count (owner, 2026-10-16, Q2: "why do u need
 * to stick to 1 or 2 or 3? wasteful, do as needed, some stuff don't even
 * need reviews"):
 *
 * - **When.** An attempt's `finish_item` (work-items.ts `designHold`), before
 *   its landing gate runs, when its task is design-shaped (design-offers.ts
 *   `designShaped`: the project's template, the task's labels, its outputs)
 *   and its workspace's base branch on origin holds a design system
 *   (design-system.ts `designOnBase`): the project's, by ancestry, never by
 *   any machine's clock. A system only the attempt's own commits hold is its
 *   build, which the person judges in review; work that is not design work
 *   is never checked. One path.
 * - **What is judged.** The builder's working tree as it stands, committed
 *   or not, keyed by its git tree (a temporary index, so the builder's own
 *   index is never touched). The verifier's workspace is cut from the
 *   builder's, so its clone holds the builder's commits; what the tree adds
 *   on top of them goes to it as one patch in its inputs. A pass holds for
 *   that tree: committing the same files later needs no second check.
 * - **A round.** The hub files a `design_checks` row, says on the task and
 *   on the builder's chip that it is being checked against the design
 *   system, and starts the verifier: a fresh delegate landing nothing and
 *   reporting to no session (work-items.ts `verifierParent`). The task stays
 *   in its active stage; the builder's turns wait, not idle.
 * - **The verdict** (`design_verdict`, listed to the verifier alone):
 *   findings go back to the builder as one message, each tied to
 *   `file:line` and its selector, each a must-fix; the builder fixes and
 *   calls `finish_item` again, which starts the next round on the new tree.
 *   No findings is a pass: the hub runs the builder's held `finish_item`
 *   itself, so its landing gate runs, it lands, and its task goes on to review. The
 *   verdict also names the variant that holds to the system best, when the
 *   result offers several. It finishes the verifier's item.
 * - **Ends.** A verifier that ends with no verdict fails its round, and the
 *   builder is told; its next `finish_item` starts another. A builder that
 *   ends while checked stops its verifier. A hub that restarts keeps every
 *   round (the rows), and its chips say so again.
 */
import type { InstanceRow, ResultArtifact } from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import type { DbShape, WorkItemRow } from "./db";
import type { DesignCheckRow } from "./db/design-checks";
import type {
  DesignFinding,
  DesignPick,
  WorkItemSubmission,
} from "./db/schema";
import { designShaped } from "./design-offers";
import { designOnBase, type Run } from "./design-system";
import type { DesignVerdict } from "./hub-tools";
import { quote } from "./landing";
import { hubActor, type Tasks } from "./tasks";
import {
  isLive,
  type Parent,
  verifierParent,
  type WorkItemRequest,
  type WorkItemStart,
} from "./work-items";

/** What the builder's chip says while a verifier works. */
const CHECKING = "being checked against the design system";
/** What a verifier's brief opens with: what the probe kit keys its turns by. */
export const VERIFIER_BRIEF = "You are the design system verifier";
/** The patch's name in the verifier's `$TMPDIR/inputs/`. */
const PATCH = "design-check.patch";
/** The most of a page's HTML a brief carries. */
const PAGE_CHARS = 40_000;
const COMMAND_MS = 120_000;

/**
 * The builder's working tree, read without touching its index: the commit
 * it sits on, its whole tree (tracked and untracked, .gitignore kept) as a
 * temporary index writes it, and, when that tree is not the commit's, a
 * binary patch of the difference in a new folder under the clone's
 * `TMPDIR` (its scratch dir, the same path on the host, where the
 * verifier's inputs are read from). Run inside the clone's boundary, git
 * the safe way (core safe-git.ts). Three lines: head, tree, the patch's
 * path or nothing.
 */
const SNAPSHOT = [
  SAFE_GIT_SHELL,
  "set -e",
  "idx=$(mktemp); trap 'rm -f \"$idx\"' EXIT",
  'cp "$(git rev-parse --git-path index)" "$idx"',
  'export GIT_INDEX_FILE="$idx"',
  "git add -A",
  "tree=$(git write-tree)",
  "head=$(git rev-parse HEAD)",
  `out=""; if [ "$tree" != "$(git rev-parse 'HEAD^{tree}')" ]; then out="$(mktemp -d)/${PATCH}"; git diff --cached --binary HEAD > "$out"; fi`,
  'printf \'%s\\n%s\\n%s\\n\' "$head" "$tree" "$out"',
].join("\n");

export interface DesignVerifyDeps {
  /** A hub artifact a result names: its kind and name, and a page's HTML. */
  readonly artifact: (
    id: string
  ) => { html: string | null; kind: string; name: string } | undefined;
  readonly db: Pick<
    DbShape,
    "designChecks" | "project" | "workItem" | "workspacesNamed"
  >;
  /** Runs a command, inside the named workspace's boundary (design-system.ts `Run`). */
  readonly run: Run;
  readonly tasks: Pick<Tasks, "comment" | "get">;
  readonly workItems: {
    finishItem: (
      instanceId: string,
      request: WorkItemSubmission
    ) => Promise<string>;
    holdWords: (itemId: string, words: string | null) => void;
    startForHub: (
      request: Omit<
        WorkItemRequest,
        "parentInstanceId" | "workspace" | "fork" | "reuse"
      >,
      parent: Parent
    ) => Promise<WorkItemStart>;
    stopForHub: (itemId: string, why: string) => void;
    tellSession: (instanceId: string, content: string) => void;
  };
}

const short = (id: string): string => id.slice(0, 8);

/** One finding as the builder and the task read it. */
const findingLine = (finding: DesignFinding, at: number): string =>
  `${at + 1}. \`${finding.file}:${finding.line}\` \`${finding.selector}\`: ${finding.problem}`;

const pickLine = (pick: DesignPick | null | undefined): string =>
  pick
    ? `\n\nOf the variants, “${pick.variant}” holds to the system best: ${pick.why}`
    : "";

/** A result's artifacts, as the verifier is told them. */
const artifactsOf = (
  artifacts: ResultArtifact[],
  read: DesignVerifyDeps["artifact"]
): string => {
  if (artifacts.length === 0) {
    return "It names no artifacts: judge the screens and styles its changes touch.";
  }
  return artifacts
    .map((each) => {
      switch (each.kind) {
        case "artifact": {
          const found = read(each.artifactId);
          if (!found) {
            return `- artifact ${each.artifactId} (gone from the hub)`;
          }
          const html = found.html
            ? `\n\n\`\`\`html\n${found.html.length > PAGE_CHARS ? `${found.html.slice(0, PAGE_CHARS)}\n<!-- cut here -->` : found.html}\n\`\`\``
            : "";
          const sheet =
            found.kind === "sheet"
              ? " (its story file is among the changes: open it with artifact_create kind sheet on your own stage)"
              : "";
          return `- ${found.kind} “${found.name}”${sheet}${html}`;
        }
        case "link":
          return `- link ${each.url}`;
        case "file":
        case "post":
          break;
      }
      return `- ${each.kind} ${each.path}`;
    })
    .join("\n");
};

/** A working tree as the snapshot read it. */
interface Snapshot {
  head: string;
  /** The patch of what the tree adds to `head`, on the builder's machine; null when the tree is the commit's. */
  patch: string | null;
  tree: string;
}

export const createDesignVerify = (deps: DesignVerifyDeps) => {
  const { db, workItems } = deps;

  /** A command in the builder's live clone, inside its boundary (core safe-git.ts). */
  const command = async (
    workspace: { id: string; machineId: string; path: string },
    cmd: string
  ): Promise<string> => {
    const result = await deps.run(
      workspace.machineId,
      workspace.path,
      cmd,
      COMMAND_MS,
      { id: workspace.id, path: workspace.path }
    );
    if (result.exitCode !== 0) {
      throw new Error(
        (
          result.stderr.trim() ||
          result.stdout.trim() ||
          `exit ${result.exitCode}`
        )
          .split("\n")
          .slice(-3)
          .join(" ")
      );
    }
    return result.stdout;
  };

  const snapshot = async (workspace: {
    id: string;
    machineId: string;
    path: string;
  }): Promise<Snapshot> => {
    const [head = "", tree = "", patch = ""] = (
      await command(workspace, SNAPSHOT)
    ).split("\n");
    return {
      head: head.trim(),
      tree: tree.trim(),
      patch: patch.trim() || null,
    };
  };

  const comment = (
    check: Pick<DesignCheckRow, "projectId" | "taskId">,
    text: string,
    why: string
  ) =>
    deps.tasks
      .comment(check.projectId, check.taskId, text, hubActor(why))
      .catch((error: unknown) =>
        console.warn(
          `[design-verify] ${check.taskId}: its comment was not written: ${error instanceof Error ? error.message : String(error)}`
        )
      );

  /** The verifier's brief: the work, the system, how to judge, how to answer. */
  const briefOf = (
    item: WorkItemRow,
    task: { description: string; id: string; title: string },
    project: string,
    base: string,
    at: Snapshot
  ): string => {
    const result = item.taskResult;
    const setUp = at.patch
      ? `run \`git checkout --detach ${at.head} && git apply --binary "$TMPDIR/inputs/${PATCH}"\` first: the commit, then what the builder has not committed yet. Read the changes with \`git diff origin/${base}\` and \`git status\`.`
      : `run \`git checkout --detach ${at.head}\` first, then read the changes with \`git diff origin/${base}...${at.head}\`.`;
    return [
      `${VERIFIER_BRIEF} for project “${project}”. A builder session handed in ${task.id} “${task.title}”. Before the person sees it, you judge it against the project's design system. You never edit or fix the work: you judge, and the builder fixes.`,
      `## The work\n\nThe builder's work sits on commit ${at.head}, on top of origin/${base}; its objects are in your clone. ${setUp}\n\nThe task:\n\n${task.description.trim() || "(no description)"}\n\nThe builder's hand-in:\n\n${result?.summary.trim() || "(none)"}\n\nWhat it shows:\n\n${artifactsOf(result?.artifacts ?? [], deps.artifact)}`,
      "## The system\n\ndesign/ as the work has it: DESIGN.md (the rules and recipes), tokens.resolver.json and its token files, the generated tokens.css, specimens/, SKILL.md. Load the design-system skill with the Skill tool: its references/css.md holds the CSS practices the work must follow.",
      "## How\n\nRender what the work changed in your own workspace: a sheet with artifact_create kind sheet on your stage; a page or screen with playwright-core and the cached Chromium. Read the computed styles of the elements it touched, and judge them as a designer against DESIGN.md, the tokens and the CSS practices: a value that is no token, a role used for the wrong job, a rule DESIGN.md states broken, a practice css.md asks for not followed. Nothing that would not block the work: no nits, no suggestions.",
      "## Your answer\n\nCall design_verdict once. Each finding is a must-fix tied to one element: its file and line, its CSS selector, what is wrong and what the system says instead. No findings is a pass. When the result offers variants, name the one that holds to the system best in `pick`, and why. design_verdict finishes your item: then end your turn.",
    ].join("\n\n");
  };

  /** Starts a round on `at` for the builder's item; answers what its finish_item says. */
  const startRound = async (
    item: WorkItemRow & { projectId: string; taskId: string },
    submission: WorkItemSubmission,
    workspace: { base: string; id: string; machineId: string; path: string },
    at: Snapshot
  ): Promise<string> => {
    const project = db.project(item.projectId);
    const task = await deps.tasks.get(item.projectId, item.taskId);
    const check: DesignCheckRow = {
      id: crypto.randomUUID(),
      projectId: item.projectId,
      taskId: item.taskId,
      itemId: item.id,
      tree: at.tree,
      head: at.head,
      verifierItemId: null,
      state: "checking",
      submission,
      findings: null,
      pick: null,
      createdAt: new Date(),
      endedAt: null,
    };
    db.designChecks.open(check);
    try {
      const begun = await workItems.startForHub(
        {
          title: "Check against the design system",
          prompt: briefOf(
            item,
            task,
            project?.name ?? item.projectId,
            workspace.base,
            at
          ),
          lands: "none",
          cwd: workspace.path,
          machineId: workspace.machineId,
          // Kept work (Caw's, let finish as you turned him off) finishes
          // with its check, as yours does.
          origin: item.origin === "kept" ? "you" : item.origin,
          canDelegate: false,
          ...(at.patch ? { inputs: [at.patch] } : {}),
        },
        verifierParent({
          itemId: item.id,
          projectId: item.projectId,
          machineId: workspace.machineId,
          cwd: workspace.path,
        })
      );
      db.designChecks.set(check.id, { verifierItemId: begun.item.id });
    } catch (error) {
      db.designChecks.set(check.id, { state: "failed", endedAt: new Date() });
      const reason = error instanceof Error ? error.message : String(error);
      return `Your result needs checking against the project's design system before it reaches review, and the verifier did not start: ${reason}. Call finish_item again to start it again.`;
    } finally {
      // Copied into the verifier's inputs as it started, or not needed.
      if (at.patch) {
        await command(
          workspace,
          `rm -rf ${quote(at.patch.slice(0, at.patch.lastIndexOf("/")))}`
        ).catch((error: unknown) =>
          console.warn(
            `[design-verify] ${item.taskId}: ${at.patch} was not removed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }
    workItems.holdWords(item.id, CHECKING);
    await comment(
      check,
      `Being checked against the design system: a verifier session judges attempt ${short(item.id)}'s work (on ${at.head.slice(0, 9)}${at.patch ? ", with changes not yet committed" : ""}) before it reaches review.`,
      `attempt ${short(item.id)} handed in design work`
    );
    console.log(
      `[design-verify] ${item.taskId}: attempt ${short(item.id)}, tree ${at.tree.slice(0, 9)}, goes to a verifier`
    );
    return "Not yet: this project has a design system, so a verifier session (never you) checks your result against it before it reaches review. Its findings come back to you as one message, each a must-fix: fix them and call finish_item again. On a pass the hub finishes your item itself. End your turn now.";
  };

  /** A round that ends with no verdict: the builder's chip and its hold let go. */
  const failRound = (check: DesignCheckRow): void => {
    db.designChecks.set(check.id, { state: "failed", endedAt: new Date() });
    workItems.holdWords(check.itemId, null);
  };

  /**
   * Whether an attempt's result is judged against its project's system:
   * design work, in a workspace whose base branch holds a system (one only
   * its own commits hold is its build, the person's to judge in review).
   * Its task and workspace when it is.
   */
  const judged = async (item: WorkItemRow) => {
    const { projectId, taskId } = item;
    const project = projectId ? db.project(projectId) : undefined;
    if (!(projectId && taskId && project)) {
      return;
    }
    const task = await deps.tasks.get(projectId, taskId);
    const [workspace] = db.workspacesNamed(item.workspaceId);
    if (!(workspace && designShaped(project.template ?? null, task))) {
      return;
    }
    const onBase = await designOnBase(deps.run, workspace);
    return onBase ? { projectId, taskId, workspace } : undefined;
  };

  /** A pass: said on the task, and the builder's held finish_item run as it asked (landing gate, landing, review). */
  const passedVerdict = async (
    check: DesignCheckRow,
    live: WorkItemRow | undefined,
    verdict: DesignVerdict
  ): Promise<void> => {
    await comment(
      check,
      `Passed the design system check: ${verdict.summary}${pickLine(verdict.pick)}`,
      "the design check passed"
    );
    if (!(live && check.submission)) {
      return;
    }
    // A pass that lands needs no word to the builder; anything else does.
    const { instanceId } = live;
    workItems
      .finishItem(instanceId, check.submission)
      .then((text) => {
        if (db.workItem(check.itemId)?.state !== "done") {
          workItems.tellSession(instanceId, text);
        }
      })
      .catch((error: unknown) =>
        workItems.tellSession(
          instanceId,
          `Your result passed the design check, and its finish could not run: ${error instanceof Error ? error.message : String(error)}. Call finish_item again.`
        )
      );
  };

  /** The check the session verifies, still waiting for its verdict; refused to any other session. */
  const openCheckOf = (actor: InstanceRow): DesignCheckRow => {
    const mine = actor.workItemId ? db.workItem(actor.workItemId) : undefined;
    const check = mine ? db.designChecks.ofVerifier(mine.id) : undefined;
    if (!check) {
      throw new Error(
        "design_verdict is a design check's verifier's alone; this session runs none."
      );
    }
    if (check.state !== "checking") {
      throw new Error(`This check's verdict is in already (${check.state}).`);
    }
    return check;
  };

  /** Must-fixes: said on the task, and to the builder as one message. */
  const findingsVerdict = async (
    check: DesignCheckRow,
    live: WorkItemRow | undefined,
    verdict: DesignVerdict
  ): Promise<void> => {
    const list = verdict.findings.map(findingLine).join("\n");
    await comment(
      check,
      `The design system check found ${verdict.findings.length} must-fix:\n\n${list}${pickLine(verdict.pick)}`,
      "the design check found must-fixes"
    );
    if (live) {
      workItems.tellSession(
        live.instanceId,
        `A verifier session checked your work on ${check.head.slice(0, 9)} against the project's design system. Each of these must be fixed before your result reaches review:\n\n${list}\n\n${verdict.summary}${pickLine(verdict.pick)}\n\nFix each, then call finish_item again: the next hand-in is checked again.`
      );
    }
  };

  return {
    /** work-items.ts `designHold`: the words a `finish_item` answers while held, or nothing to go on. */
    async hold(
      item: WorkItemRow,
      submission: WorkItemSubmission
    ): Promise<string | undefined> {
      const subject = await judged(item);
      if (!subject) {
        return;
      }
      const { projectId, taskId, workspace } = subject;
      const latest = db.designChecks.latest(item.id);
      if (latest?.state === "checking") {
        return "Your result is still being checked against the design system; the verifier's word comes to you. End your turn.";
      }
      const at = await snapshot(workspace);
      const same = latest?.tree === at.tree;
      if (same && latest?.state === "passed") {
        return;
      }
      if (same && latest?.state === "findings") {
        return `The verifier's findings on this work are still open: nothing changed since. Fix each, then call finish_item again:\n\n${(latest.findings ?? []).map(findingLine).join("\n")}`;
      }
      return await startRound(
        { ...item, projectId, taskId },
        submission,
        workspace,
        at
      );
    },

    /** work-items.ts `designHeld`: a verifier is judging the item's result now. */
    held: (itemId: string): boolean =>
      db.designChecks.latest(itemId)?.state === "checking",

    /** `design_verdict`, from a design check's verifier alone. */
    async verdict(actor: InstanceRow, verdict: DesignVerdict) {
      const check = openCheckOf(actor);
      const passed = verdict.findings.length === 0;
      db.designChecks.set(check.id, {
        state: passed ? "passed" : "findings",
        findings: verdict.findings,
        pick: verdict.pick ?? null,
        endedAt: new Date(),
      });
      workItems.holdWords(check.itemId, null);
      const builder = db.workItem(check.itemId);
      const live = builder && isLive(builder.state) ? builder : undefined;
      await (passed ? passedVerdict : findingsVerdict)(check, live, verdict);
      console.log(
        `[design-verify] ${check.taskId}: ${passed ? "passed" : `${verdict.findings.length} findings`}, tree ${check.tree.slice(0, 9)}`
      );
      const finished = await workItems.finishItem(actor.id, {
        headline: passed
          ? "Passed the design system check."
          : `Found ${verdict.findings.length} must-fix against the design system.`,
        summary: verdict.summary,
      });
      return { recorded: passed ? "passed" : "findings", finished };
    },

    /**
     * A work item ended. A verifier's with no verdict fails its round, and
     * its builder hears it; a builder's while checked stops its verifier.
     */
    itemEnded(item: WorkItemRow): void {
      const mine = db.designChecks.ofVerifier(item.id);
      if (mine?.state === "checking") {
        failRound(mine);
        const builder = db.workItem(mine.itemId);
        if (builder && isLive(builder.state)) {
          workItems.tellSession(
            builder.instanceId,
            `The design system check of your work ended ${item.state} with no verdict${item.error ? ` (${item.error.split("\n")[0]})` : ""}. Call finish_item again to check it again.`
          );
        }
        return;
      }
      const theirs = db.designChecks.latest(item.id);
      if (theirs?.state === "checking") {
        failRound(theirs);
        if (theirs.verifierItemId) {
          workItems.stopForHub(
            theirs.verifierItemId,
            `the attempt it checked ended ${item.state}`
          );
        }
      }
    },

    /** The hub started: every round still checking says so on its builder's chip again. */
    start(): void {
      for (const check of db.designChecks.checking()) {
        workItems.holdWords(check.itemId, CHECKING);
      }
    },
  };
};

export type DesignVerify = ReturnType<typeof createDesignVerify>;
