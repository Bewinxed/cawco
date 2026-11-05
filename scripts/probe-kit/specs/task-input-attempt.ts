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
 * - a1. While an attempt at the task is live, the person's comment reaches
 *   the attempt's session, and the project's conversation once.
 * - a2. With the project's `attemptsHearComments` switch off (its session's
 *   `project_settings`, `set_attempts_hear_comments`), the next comment
 *   reaches no attempt, and the conversation still once.
 *
 *   bun scripts/probe-kit/run.ts task-input-attempt
 */
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

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

/** The attempt's note beside the person's comment (jev-tasks.ts `commented`). */
const ATTEMPT_NOTE = "your task.";
/** The skill the conversation's send names (caw.ts `EVENT_SKILLS`). */
const CONVERSATION_NOTE = "project-task-input";

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

    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Kitchen refit",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
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
    const task = await fleet.api<{ id: string }>(
      `/api/projects/${project.id}/tasks`,
      { title: "Fit the oak worktops" }
    );
    const started = await fleet
      .api<{ workItemId: string | null }>(
        `/api/projects/${project.id}/tasks/${task.id}/attempts`,
        { parentInstanceId: leadId }
      )
      .catch((error: unknown) =>
        error instanceof Error ? error.message : String(error)
      );
    const live =
      typeof started !== "string" && started.workItemId
        ? await until(
            "the attempt's session running",
            () =>
              fleet.query<{ state: string }>(
                "SELECT state FROM work_items WHERE id = ?",
                started.workItemId ?? ""
              )[0],
            (row) => row.state === "running",
            180_000
          ).then(
            () => true,
            () => false
          )
        : false;

    const comment = (text: string) =>
      fleet.api(`/api/projects/${project.id}/tasks/${task.id}/comments`, {
        text,
      });

    // a1. A live attempt hears the comment; the conversation does too.
    await comment("TI-LIVE: leave a 3 mm gap at the wall.");
    const heard = await until(
      "the attempt hearing the comment",
      () => turns(fleet.seen, "TI-LIVE", ATTEMPT_NOTE),
      (count) => count > 0,
      60_000
    ).catch(() => 0);
    await Bun.sleep(SETTLE_MS);
    const told = turns(fleet.seen, "TI-LIVE", CONVERSATION_NOTE);
    check(
      "a1: while an attempt at the task is live, the person's comment reaches its session, and the project's conversation once",
      live && heard > 0 && told === 1,
      `attempt ${typeof started === "string" ? `refused: ${started}` : `${started.workItemId} running ${live}`}; attempt heard ${heard}; conversation woke ${told}`
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
