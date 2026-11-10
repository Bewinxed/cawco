/**
 * What the person writes on a task reaches the project's conversation, and
 * nothing anyone else writes does (hub task-input.ts, tsk-141's items 1 and
 * 7). On a scratch fleet (real hub, agent and sessiond; Claude Code against
 * the mock model). The project is made with its events off, as the person's
 * words reach its conversation on or off, so the conversation hears only
 * what this spec writes.
 *
 * A wake is one turn of the project's conversation: a session's request
 * (the harness offered tools) that opens on a send naming the
 * project-task-input skill, carrying the marker the leg wrote. Each leg
 * counts its wakes once the hub's quiet spell (10 s) and a margin have
 * passed since its last write.
 *
 * - i1. A task the person adds at the board wakes the conversation once.
 * - i2. The person's comment on it wakes the conversation once.
 * - i3. Two of their comments 3 s apart wake it once, both in that one send.
 * - i4. A comment by an agent of the project, and one by the project's
 *   conversation itself (both through `task_comment`), wake nothing.
 * - i5. With the project's `hearsTasks` switch turned off (an agent's
 *   `project_settings`, `set_hears_tasks`), the person's comment wakes
 *   nothing.
 *
 * Before the hub gathered the person's writing (2026-11-05), i1–i3 woke
 * nothing: the person's comment reached only a live attempt.
 *
 * A live attempt still hearing the comment is task-input-attempt's, on the
 * host.
 *
 *   bun scripts/probe-kit/run.ts task-input
 */

import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../spec";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The hub's quiet spell (task-input.ts `QUIET_MS`) and a margin past it, ms. */
const SETTLE_MS = 10_000 + 8000;

/** The skill a send of the person's writing on a task names (caw.ts `EVENT_SKILLS`). */
const SKILL = "project-task-input";

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

/** The conversation's turns that opened on a send of the person's writing carrying every marker in `markers`. */
const wakes = (seen: readonly Seen[], ...markers: string[]): Seen[] =>
  seen.filter(
    (one) =>
      one.tools &&
      !one.afterTool &&
      one.last.includes(SKILL) &&
      markers.every((marker) => one.last.includes(marker))
  );

/** Waits for a first wake carrying `markers`, then for the quiet spell to pass, and counts them. */
const wakesSettled = async (
  fleet: KitFleet,
  ...markers: string[]
): Promise<number> => {
  await until(
    `a wake carrying ${markers.join(", ")}`,
    () => wakes(fleet.seen, ...markers).length,
    (count) => count > 0,
    120_000
  ).catch(() => 0);
  await Bun.sleep(SETTLE_MS);
  return wakes(fleet.seen, ...markers).length;
};

const spec: Spec = {
  group: "The hub and machines",
  name: "task-input",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    await fleet.up();

    const project = await fleet.api((hub) =>
      hub.api.projects.post({
        name: "Kitchen refit",
        machineId: MACHINE,
        cwd: fleet.repo,
        caw: false,
      })
    );
    // An agent of the project: it sets the stages up, and comments in i4.
    const agentId = await fleet.spawn("claude", "Refit lead", fleet.repo, {
      projectId: project.id,
    });
    const agent = {
      base: fleet.base,
      id: agentId,
      credential: await fleet.sessionCredential(agentId),
    };
    const staged = await toolWords(agent, "folder_write", {
      path: "stages.md",
      content: STAGES_MD,
    });

    // i1. A task the person adds at the board.
    const task = await fleet.api((hub) =>
      hub.api
        .projects({ id: project.id })
        .tasks.post({ title: "Price the oak worktops TI-ADD" })
    );
    const added = await wakesSettled(fleet, "TI-ADD");
    check(
      "i1: a task the person adds at the board wakes the project's conversation once",
      !staged.refused && added === 1,
      `stages: ${staged.text.slice(0, 160)}; wakes ${added}`
    );

    const comment = (text: string) =>
      fleet.api((hub) =>
        hub.api
          .projects({ id: project.id })
          .tasks({ taskId: task.id })
          .comments.post({
            text,
          })
      );

    // i2. The person's comment.
    await comment("TI-ONE: oak or walnut, whichever ships before March.");
    const one = await wakesSettled(fleet, "TI-ONE");
    check(
      "i2: the person's comment on a task wakes the project's conversation once",
      one === 1,
      `wakes ${one}`
    );

    // i3. Two comments inside one quiet spell.
    await comment("TI-TWO-A: the sink side needs a cut-out.");
    await Bun.sleep(3000);
    await comment("TI-TWO-B: and keep the offcuts.");
    const both = await wakesSettled(fleet, "TI-TWO-A", "TI-TWO-B");
    const firstAlone = wakes(fleet.seen, "TI-TWO-A").length;
    check(
      "i3: two of the person's comments 3 s apart wake the conversation once, both in that send",
      both === 1 && firstAlone === 1,
      `wakes with both ${both}; wakes with the first ${firstAlone}`
    );

    // i4. An agent's comment, and the conversation's own.
    const view = await fleet.api((hub) =>
      hub.api.projects({ id: project.id }).caw.get()
    );
    const agentSaid = await toolWords(agent, "task_comment", {
      task: task.id,
      text: "TI-AGENT: the supplier quoted 14 days.",
    });
    const cawSaid = view.instanceId
      ? await toolWords(
          {
            base: fleet.base,
            id: view.instanceId,
            credential: await fleet.sessionCredential(view.instanceId),
          },
          "task_comment",
          { task: task.id, text: "TI-CAW: noted, oak it is." }
        )
      : undefined;
    await Bun.sleep(SETTLE_MS);
    const quiet = wakes(fleet.seen, "TI-AGENT").length;
    const ownQuiet = wakes(fleet.seen, "TI-CAW").length;
    check(
      "i4: a comment by an agent of the project, and one by its conversation, wake nothing",
      !agentSaid.refused &&
        cawSaid !== undefined &&
        !cawSaid.refused &&
        quiet === 0 &&
        ownQuiet === 0,
      `agent: ${agentSaid.text.slice(0, 160)} (wakes ${quiet}); conversation ${view.instanceId}: ${cawSaid?.text.slice(0, 160)} (wakes ${ownQuiet})`
    );

    // i5. The switch off.
    const off = await toolWords(agent, "project_settings", {
      changes: [{ kind: "set_hears_tasks", hears_tasks: false }],
      reason: "The person reads the board themselves this week.",
    });
    const offView = await fleet.api((hub) =>
      hub.api.projects({ id: project.id }).caw.get()
    );
    await comment("TI-OFF: hold the order until Friday.");
    await Bun.sleep(SETTLE_MS);
    const held = wakes(fleet.seen, "TI-OFF").length;
    check(
      "i5: with the project's hearsTasks switch off, the person's comment wakes nothing",
      !off.refused && offView.hearsTasks === false && held === 0,
      `project_settings: ${off.text.slice(0, 200)}; hearsTasks ${offView.hearsTasks}; wakes ${held}`
    );
  },
};

export default spec;
