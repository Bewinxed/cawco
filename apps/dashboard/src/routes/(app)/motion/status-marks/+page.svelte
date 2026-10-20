<script lang="ts">
  /**
   * Every row that draws a status mark beside meta or label words, in the
   * state that draws it, no hub (DESIGN.md, Sizes: a status mark is never
   * 12px; The Mark Line Rule). Each surface stands in its own
   * `[data-surface]`, as wide as it stands in the product, so
   * scripts/probe-kit/specs/status-marks.ts reads each mark's box and its
   * words' x-height and each row's height. The surfaces that read the hub's
   * accounts and machines are read on their own pages there.
   */
  import { type Account, MOVED_HERE } from "@cawco/core";
  import DevicePanel from "#lib/cawco/accounts/DevicePanel.svelte";
  import { DeviceFlow } from "#lib/cawco/accounts/device.svelte.js";
  import SigninPanel from "#lib/cawco/accounts/SigninPanel.svelte";
  import { SigninFlow } from "#lib/cawco/accounts/signin.svelte.js";
  import type { Machine } from "#lib/cawco/client.svelte.js";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import MovedLogin from "#lib/cawco/home/MovedLogin.svelte";
  import UpdateCard from "#lib/cawco/home/UpdateCard.svelte";
  import type { Stage, TaskSummary } from "#lib/cawco/project-tasks.js";
  import RunStatus from "#lib/cawco/routines/RunStatus.svelte";
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import CompactionDivider from "#lib/cawco/transcript/CompactionDivider.svelte";
  import SystemLine from "#lib/cawco/transcript/SystemLine.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import type { Notice } from "#lib/cawco/updates/model.js";
  import ViewMade from "#lib/cawco/views/ViewMade.svelte";
  import ViewPipeline from "#lib/cawco/views/ViewPipeline.svelte";
  import { IconSkill } from "#lib/icons.js";
  import "#lib/cawco/spawn/ns-theme.css";

  const AT = Date.UTC(2026, 9, 20, 9, 30);

  /** A task as the hub's index lists it, waiting on you. */
  const task = (changes: Partial<TaskSummary>): TaskSummary => ({
    id: "tsk-12",
    number: 12,
    title: "Sign the release notes off",
    path: "tasks/tsk-12.md",
    stage: "review",
    kind: "you",
    type: null,
    labels: [],
    after: [],
    related: [],
    duplicateOf: null,
    foundIn: null,
    parent: null,
    fields: {},
    needsYou: true,
    outputs: [],
    problem: null,
    rank: null,
    todos: { done: 0, total: 0 },
    attempts: [],
    blockedBy: [],
    lastAttemptFailed: false,
    lastAttemptStopped: false,
    liveAttempt: false,
    queuedStart: false,
    startProblem: null,
    startProblemKind: null,
    createdAt: AT,
    updatedAt: AT,
    ...changes,
  });
  const youTask = task({});
  /** The made view lists a task by what it made. */
  const madeTask = task({ outputs: ["notes/release.md"] });
  const stages: Stage[] = [
    { name: "todo", kind: "todo", hooks: {} },
    { name: "review", kind: "you", hooks: {} },
  ];

  const account: Account = {
    atPlanLimit: null,
    createdAt: AT,
    email: "ada@tidewater.dev",
    hue: "blue",
    id: "acc-1",
    identity: null,
    kind: "subscription",
    label: "Ada",
    neverBackup: false,
    order: 0,
    provider: "anthropic",
    reservePct: null,
  } as unknown as Account;

  // A machine that refused the skill: the chip's failure mark, and the
  // machine's own in its list.
  const machines = [
    {
      machineId: "m-1",
      hostname: "obelisk",
      os: "linux-x64",
      status: "online",
      fleet: { skills: { review: { state: "failed" } } },
    },
    {
      machineId: "m-2",
      hostname: "gauntlet",
      os: "darwin-arm64",
      status: "online",
      fleet: { skills: { review: { state: "applied" } } },
    },
  ] as unknown as Machine[];

  const failure = {
    id: "m-fail",
    type: "ui.error",
    content: "The model answered 529: overloaded. Try again in a minute.",
    metadata: { errorTitle: "Turn failed" },
  } as unknown as Message;
  const moved = {
    id: "m-moved",
    type: "system",
    content: "Moved from gauntlet; its history came along.",
    metadata: { subtype: MOVED_HERE },
  } as unknown as Message;
  /** A folded note: its 12px info glyph on the same rail, no status mark. */
  const hook = {
    id: "m-hook",
    type: "system",
    content: "The pre-commit hook printed its report.",
    metadata: { noteTitle: "Hook ran" },
  } as unknown as Message;
  let open = $state(false);
  const disclosed = {
    get: () => open,
    set: (next: boolean) => {
      open = next;
    },
  };

  /** An update under way on one machine: its line carries the spinner. */
  const updating: Notice = {
    acks: [],
    caw: { moves: false, status: "idle" },
    configure: false,
    failed: false,
    kind: 3,
    lines: [{ state: "busy", text: "obelisk is updating to 0.9.2" }],
    machineIds: ["m-1"],
    title: "Updating",
    version: "0.9.2",
  };

  const device = new DeviceFlow(() => Promise.resolve("acc-1"), "m-1");
  device.phase = "mismatch";
  device.email = "grace@tidewater.dev";
  const signin = new SigninFlow(() => Promise.resolve("acc-1"), "m-1");
  signin.phase = "mismatch";
  signin.email = "grace@tidewater.dev";
</script>

<div class="bench" data-bench>
  <section class="surface" data-surface="task-card">
    <TaskCard
      href="?task=tsk-12"
      kindOf={() => "you"}
      movable={false}
      task={youTask}
    />
  </section>

  <section class="surface wide" data-surface="task-table">
    <TaskTable
      hrefOf={(id) => `?task=${id}`}
      onopen={() => undefined}
      {stages}
      tasks={[youTask]}
    />
  </section>

  <section class="surface" data-surface="view-pipeline">
    <ViewPipeline {stages} tasks={[youTask]} />
  </section>

  <section class="surface" data-surface="view-made">
    <ViewMade
      hrefOf={(id) => `?task=${id}`}
      onopen={() => undefined}
      open={null}
      projectId="tidewater"
      tasks={[madeTask]}
    />
  </section>

  <section class="surface" data-surface="moved-login">
    <MovedLogin
      onchoose={() => undefined}
      ondismiss={() => undefined}
      one={{
        account,
        at: AT,
        from: "from Claude Code on gauntlet",
        id: "moved-1",
        missing: 0,
        name: "Ada",
      }}
    />
  </section>

  <section class="surface" data-surface="run-status">
    <RunStatus status="done" text="9:30" />
    <RunStatus status="failed" text="Failed at 9:30" />
    <RunStatus status="waiting" text="Waits on you" />
    <RunStatus status="neutral" text="Nothing to do" />
    <RunStatus status="running" text="Running" />
  </section>

  <section class="surface wide" data-surface="section-row">
    <ul class="rows">
      <SectionRow
        icon={IconSkill}
        meta="A skill"
        name="review"
        note={{
          text: "obelisk refused it: the skill's folder is not readable.",
          tone: "fail",
        }}
      />
      <SectionRow
        icon={IconSkill}
        meta="A skill"
        name="lint"
        note={{ text: "Rolling it out to obelisk…", tone: "busy" }}
      />
    </ul>
  </section>

  <section class="surface" data-surface="rollout">
    <RolloutChip kind="skills" {machines} name="review" what="review" />
  </section>

  <section class="surface" data-surface="update-card">
    <UpdateCard
      alone
      notice={updating}
      onaction={() => undefined}
      ondismiss={() => undefined}
    />
  </section>

  <section class="surface wide tx-columns" data-surface="system-line">
    <SystemLine {disclosed} message={failure} />
    <SystemLine {disclosed} message={moved} />
    <SystemLine {disclosed} message={hook} />
  </section>

  <section class="surface wide tx-columns" data-surface="compaction">
    <CompactionDivider
      row={{
        kind: "compaction",
        key: "c-1",
        session: "s-1",
        brief: null,
        state: "failed",
        error: "The harness stopped before the summary was written.",
      }}
    />
  </section>

  <section class="surface" data-surface="device-panel">
    <div class="ns-theme ns-pop p-(--space-2)">
      <DevicePanel flow={device} machine="obelisk" online />
    </div>
  </section>

  <section class="surface" data-surface="signin-panel">
    <div class="ns-theme ns-pop p-(--space-2)">
      <SigninPanel
        expected="ada@tidewater.dev"
        flow={signin}
        machine="obelisk"
        online
      />
    </div>
  </section>
</div>

<style>
  .bench {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-inline-size: 960px;
    margin: var(--space-5) auto;
    padding-inline: var(--space-4);
  }
  .surface {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: 320px;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }
  .surface.wide {
    inline-size: 100%;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
