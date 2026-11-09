/**
 * The person's comment on a task still reaches its live attempt, now that
 * the project's conversation reads it too, and each has its own switch (hub
 * jev-tasks.ts Attach or fresh, task-input.ts; tsk-141's items 6 and 7). On
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model). The attempt cuts a workspace, whose boundary is user
 * namespaces: it runs on the host.
 *
 * The attempt hears a comment as one of the person's messages with CawCo's
 * note "It is a comment on <task>, your task." (jev-tasks.ts `commented`);
 * the conversation hears it on a send naming the project-task-input skill.
 *
 * The mock attempt starts a background `sleep` on its brief's turn, so the
 * quiet-turns rule (work-items.ts `QUIET_TURNS`) leaves its item live while
 * the legs read it.
 *
 * - a1. While an attempt at the task is live (running before the comment,
 *   and still running as its session hears it), the person's comment
 *   reaches the attempt's session, and the project's conversation once.
 * - a2. With the project's `attemptsHearComments` switch off (its session's
 *   `project_settings`, `set_attempts_hear_comments`), the next comment
 *   reaches no attempt, and the conversation still once.
 *
 *   bun scripts/probe-kit/run.ts task-input-attempt
 */

import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The attempt's note beside the person's comment (jev-tasks.ts `commented`). */
const ATTEMPT_NOTE = "your task.";
/** The skill the conversation's send names (caw.ts `EVENT_SKILLS`). */
const CONVERSATION_NOTE = "project-task-input";

/** What the task's description carries, so the attempt's brief is told apart from every other send. */
const BRIEF = "TI-BRIEF";
/** The attempt's background work: it keeps the item live past the quiet-turns rule (work-items.ts `QUIET_TURNS`). */
const SLEEP = "sleep 600.0447";

/**
 * The attempt's first turn starts {@link SLEEP} in the background, so its
 * turns count for nothing while it runs (work-items.ts `waitsInBackground`)
 * and the item stays live while the legs read it; every other request: a
 * word.
 */
const respond = (request: Seen): Reply =>
  request.tools &&
  !request.afterTool &&
  request.last.includes(BRIEF) &&
  !request.last.includes(CONVERSATION_NOTE)
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "Bash",
          input: {
            command: SLEEP,
            description: "Run a command",
            run_in_background: true,
          },
        },
      }
    : { everyMs: 5, words: ["ok"] };

/** The hub's quiet spell (task-input.ts `QUIET_MS`) and a margin past it, ms. */
const SETTLE_MS = 10_000 + 8000;

/** The stages a project's setup writes (setup-send's leg 2). */
const STAGES_MD = `---
found      todo
your-call  you
done       done
moves
  * → *    you
views
  board    by stage
---
`;

/** A session's turns opening on a send that carries `marker` and `note`. */
const turns = (seen: readonly Seen[], marker: string, note: string): number =>
  seen.filter(
    (one) =>
      one.tools &&
      !one.afterTool &&
      one.last.includes(marker) &&
      one.last.includes(note)
  ).length;

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "task-input-attempt",
  host: "its attempt cuts a workspace, whose boundary is user namespaces",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const project = await fleet.api((hub) =>
      hub.api.projects.post({
        name: "Kitchen refit",
        machineId: MACHINE,
        cwd: fleet.repo,
        caw: false,
      })
    );
    // The project's session: it sets the stages up, parents the attempt
    // and turns the switch off in a2.
    const leadId = await fleet.spawn("claude", "Refit lead", fleet.repo, {
      projectId: project.id,
    });
    const lead = {
      base: fleet.base,
      id: leadId,
      credential: await fleet.sessionCredential(leadId),
    };
    await toolWords(lead, "folder_write", {
      path: "stages.md",
      content: STAGES_MD,
    });
    const task = await fleet.api((hub) =>
      hub.api.projects({ id: project.id }).tasks.post({
        title: "Fit the oak worktops",
        description: `${BRIEF}: oak, 40 mm.`,
      })
    );
    const started = await fleet
      .api((hub) =>
        hub.api
          .projects({ id: project.id })
          .tasks({ taskId: task.id })
          .attempts.post({ parentInstanceId: leadId })
      )
      .catch((error: unknown) =>
        error instanceof Error ? error.message : String(error)
      );
    const itemId = typeof started === "string" ? null : started.workItemId;
    /** The attempt's work item's state now. */
    const stateNow = () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE id = ?",
        itemId ?? ""
      )[0]?.state;
    // Running, with its background work started: its brief's turn is over.
    const running = itemId
      ? await until(
          "the attempt running with its background work",
          () =>
            stateNow() === "running" &&
            fleet.seen.some((one) => one.afterTool && one.all.includes(BRIEF))
              ? true
              : undefined,
          Boolean,
          180_000
        ).catch(() => false)
      : false;

    const comment = (text: string) =>
      fleet.api((hub) =>
        hub.api
          .projects({ id: project.id })
          .tasks({ taskId: task.id })
          .comments.post({
            text,
          })
      );

    // a1. A live attempt hears the comment; the conversation does too.
    await comment("TI-LIVE: leave a 3 mm gap at the wall.");
    const heard = await until(
      "the attempt hearing the comment",
      () => turns(fleet.seen, "TI-LIVE", ATTEMPT_NOTE),
      (count) => count > 0,
      60_000
    ).catch(() => 0);
    // Still live as it heard it: the live path, not an ended attempt's attach.
    const liveAsHeard = stateNow();
    await Bun.sleep(SETTLE_MS);
    const told = turns(fleet.seen, "TI-LIVE", CONVERSATION_NOTE);
    check(
      "a1: while an attempt at the task is live, the person's comment reaches its session, and the project's conversation once",
      running && heard > 0 && liveAsHeard === "running" && told === 1,
      `attempt ${typeof started === "string" ? `refused: ${started}` : `${itemId} running before the comment ${running}, ${liveAsHeard} as it heard it`}; attempt heard ${heard}; conversation woke ${told}`
    );

    // a2. The attempt's switch off: the conversation alone hears it.
    const off = await toolWords(lead, "project_settings", {
      changes: [
        { kind: "set_attempts_hear_comments", attempts_hear_comments: false },
      ],
      reason: "The person talks to the attempt in its own session.",
    });
    await comment("TI-HUSH: the gap is fine as it is.");
    await Bun.sleep(SETTLE_MS);
    const hushed = turns(fleet.seen, "TI-HUSH", ATTEMPT_NOTE);
    const stillTold = turns(fleet.seen, "TI-HUSH", CONVERSATION_NOTE);
    check(
      "a2: with the project's attemptsHearComments switch off, the comment reaches no attempt, and the conversation once",
      !off.refused && hushed === 0 && stillTold === 1,
      `project_settings: ${off.text.slice(0, 200)}; attempt heard ${hushed}; conversation woke ${stillTold}`
    );
  },
};

export default spec;
