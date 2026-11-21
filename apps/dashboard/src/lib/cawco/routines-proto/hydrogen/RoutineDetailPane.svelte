<script lang="ts">
  import PageSurface from "#lib/cawco/side/PageSurface.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import {
    IconChevronDown,
    IconChevronRight,
    IconExternal,
    IconKeep,
    IconPause,
    IconPen,
    IconPlay,
    IconRefresh,
    IconSparkles,
    IconTerminal,
    IconTick,
    IconTrash,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import {
    checkStandingMeta,
    exitCodeReading,
    nextRunSummary,
    routineStatusMeta,
    runOutcomeMeta,
    type StatusTone,
    serviceName,
    triggerLabel,
  } from "./routine-format";
  import {
    daysUntil,
    type EventRule,
    formatDay,
    formatExactClock,
    formatRelAge,
    formatShortDuration,
    LOCAL_ZONE,
    MOCK_NOW,
    type Routine,
  } from "./routines-data";
  import ServiceMark from "./ServiceMark.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    routine,
    rules,
    stale = false,
    now = MOCK_NOW,
    phone = false,
    onclose,
    onrunnow,
    ontogglepause,
    onkeep,
    onedit,
    onaskcaw,
    onmarkmet,
    onlookagain,
    onextenddate,
    ondelete,
    onopenrun,
  }: {
    routine: Routine;
    rules: EventRule[];
    stale?: boolean;
    now?: number;
    phone?: boolean;
    onclose: () => void;
    onrunnow: (id: string) => void;
    ontogglepause: (id: string) => void;
    onkeep: (id: string) => void;
    onedit: (id: string) => void;
    onaskcaw: (prompt: string) => void;
    onmarkmet: (id: string) => void;
    onlookagain: (id: string) => void;
    onextenddate: (id: string, days: number | null) => void;
    ondelete: (id: string) => void;
    onopenrun: (routineId: string, runId: string) => void;
  } = $props();

  type ConfirmKind = "delete" | "pause-held" | "mark-met" | "look-again" | null;
  let confirm = $state<ConfirmKind>(null);
  let showSpend = $state(false);
  let showAllRuns = $state(false);

  // Reset inline confirmations when switching to another routine.
  let lastId = "";
  $effect(() => {
    const { id } = routine;
    if (lastId && lastId !== id) {
      confirm = null;
      showSpend = false;
      showAllRuns = false;
    }
    lastId = id;
  });

  function outcomeToneClass(tone: StatusTone): string {
    switch (tone) {
      case "fail":
        return "text-status-fail-ink";
      case "live":
        return "text-status-live-ink";
      case "done":
        return "text-status-done-ink";
      case "attn":
        return "text-status-attn-ink";
      case "idle":
        return "text-ink-strong";
    }
  }

  const status = $derived(routineStatusMeta(routine, now));
  const next = $derived(nextRunSummary(routine, now));
  const check = $derived(routine.check ?? null);
  const standing = $derived(
    check ? checkStandingMeta(check.standing, check.markedMetByOwner) : null
  );
  const unkeptAgent = $derived(
    routine.origin.by === "session" && !routine.origin.kept
  );
  const attachedRules = $derived(
    rules.filter((rule) => rule.routineId === routine.id)
  );
  const isRunning = $derived(
    routine.status === "running" ||
      routine.runs.some(
        (run) => run.outcome === "running" || run.outcome === "queued"
      )
  );
  const hasHeldWork = $derived(
    check !== null && (check.heldTasks.length > 0 || check.heldSteps > 0)
  );
  const visibleRuns = $derived(
    showAllRuns ? routine.runs : routine.runs.slice(0, 4)
  );

  const lastWordsAuthor = $derived.by(() => {
    if (!check) {
      return "";
    }
    if (check.lastWordsBy === "command") {
      return `Command output (${exitCodeReading(check.lastExitCode)})`;
    }
    if (check.lastWordsBy === "owner") {
      return "Marked met by you";
    }
    return "Model said";
  });

  function requestPauseToggle(): void {
    if (
      routine.status !== "paused" &&
      check &&
      check.standing !== "met" &&
      hasHeldWork
    ) {
      confirm = confirm === "pause-held" ? null : "pause-held";
      return;
    }
    confirm = null;
    ontogglepause(routine.id);
  }
</script>

{#snippet body()}
  <div
    class="flex flex-auto flex-col min-h-0 overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head"
    data-routine-detail={routine.id}
  >
    <div
      class="flex flex-col gap-space-5 px-space-5 pt-space-2 pb-space-7 max-phone:px-space-4"
    >
      <!-- Head: status badge, origin, title, plain sentence -->
      <header class="flex flex-col gap-space-2">
        <div class="flex flex-wrap items-center gap-space-2">
          <Badge variant={status.badge}>
            <StatusGlyph glyph={status.glyph} size="sm" tone={status.tone} />
            <span>{status.label}</span>
          </Badge>
          {#if routine.builtIn}
            <Badge variant="secondary"><span>CawCo built-in</span></Badge>
          {:else if routine.kind === "check"}
            <Badge variant="secondary"><span>Looks for a fact</span></Badge>
          {:else}
            <Badge variant="secondary"><span>Repeating work</span></Badge>
          {/if}
          {#if routine.status === "running" && routine.runningStep}
            <span class="type-meta text-status-live-ink">
              {routine.runningStep}
            </span>
          {/if}
        </div>

        <h2 class="m-0 type-title text-ink-strong wrap-anywhere">
          {routine.name}
        </h2>
        <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
          {routine.summary}
        </p>

        <!-- Action strip -->
        <div class="mt-space-1 flex flex-wrap items-center gap-space-2">
          {#if routine.status !== "finished"}
            <Button
              disabled={stale || isRunning}
              icon={IconPlay}
              label={routine.kind === "check" ? "Check now" : "Run now"}
              onclick={() => onrunnow(routine.id)}
              size="sm"
              variant="outline"
            />
            <Button
              disabled={stale}
              icon={routine.status === "paused" ? IconPlay : IconPause}
              label={routine.status === "paused" ? "Resume" : "Pause"}
              onclick={requestPauseToggle}
              size="sm"
              variant="outline"
            />
          {/if}
          <Button
            disabled={stale}
            icon={IconPen}
            label={routine.builtIn ? "Edit schedule" : "Edit"}
            onclick={() => onedit(routine.id)}
            size="sm"
            variant="outline"
          />
          <Button
            disabled={stale}
            icon={IconSparkles}
            label="Change with Caw"
            onclick={() => onaskcaw(`Change routine "${routine.name}": `)}
            size="sm"
            variant="outline"
          />
          {#if !routine.builtIn}
            <Button
              class="ms-auto"
              disabled={stale}
              icon={IconTrash}
              label="Delete"
              onclick={() => {
                confirm = confirm === "delete" ? null : "delete";
              }}
              size="sm"
              tone="destructive"
              variant="ghost"
            />
          {/if}
        </div>

        <!-- Inline confirmation: pausing a check that holds tasks (T15) -->
        {#if confirm === "pause-held" && check}
          <div
            class="mt-space-2 flex flex-col gap-space-2 rounded-lg border border-status-attn-glyph bg-needs-ground p-space-3"
            transition:unfold
          >
            <p class="m-0 type-label text-ink-strong">
              Pause while work is waiting?
            </p>
            <p class="m-0 type-meta text-ink-muted">
              Pausing stops all checks. Held work stays blocked until you resume
              this routine or mark it met:
              {#each check.heldTasks as task, i (task.id)}
                {i > 0 ? ", " : " "}
                <span class="font-mono text-ink-strong">{task.id}</span>
                ({task.title})
              {/each}
              {#if check.heldSteps > 0}
                {check.heldTasks.length > 0 ? " and " : " "}
                {check.heldSteps} plan {check.heldSteps === 1
                  ? "step"
                  : "steps"}
              {/if}.
            </p>
            <div class="flex items-center justify-end gap-space-2">
              <Button
                label="Cancel"
                onclick={() => {
                  confirm = null;
                }}
                size="xs"
                variant="ghost"
              />
              <Button
                label="Pause routine"
                onclick={() => {
                  confirm = null;
                  ontogglepause(routine.id);
                }}
                size="xs"
                variant="outline"
              />
            </div>
          </div>
        {/if}

        <!-- Inline confirmation: delete with full consequences (T17) -->
        {#if confirm === "delete"}
          <div
            class="mt-space-2 flex flex-col gap-space-2 rounded-lg border border-error-9 bg-status-fail-bg p-space-3"
            transition:unfold
          >
            <p class="m-0 type-label text-status-fail-ink">
              Delete "{routine.name}"?
            </p>
            <ul
              class="m-0 flex flex-col gap-space-1 ps-space-4 type-meta text-status-fail-ink"
            >
              <li>Stops running immediately. This cannot be undone.</li>
              <li>
                Deletes its {routine.runs.length} recorded
                {routine.runs.length === 1 ? "run" : "runs"} along with the routine.
              </li>
              {#if attachedRules.length > 0}
                <li>
                  Deletes {attachedRules.length} event
                  {attachedRules.length === 1 ? "rule" : "rules"} feeding it:
                  {#each attachedRules as rule, i (rule.id)}
                    {i > 0 ? ", " : " "}
                    {rule.serviceName} ({rule.eventKinds.join(", ")})
                  {/each}.
                </li>
              {/if}
              {#if check && hasHeldWork && check.standing !== "met"}
                <li>
                  Leaves waiting work blocked until you free or repoint it:
                  {#each check.heldTasks as task, i (task.id)}
                    {i > 0 ? ", " : " "}
                    {task.id} ({task.title})
                  {/each}
                  {#if check.heldSteps > 0}
                    {check.heldTasks.length > 0 ? " + " : " "}
                    {check.heldSteps} plan {check.heldSteps === 1
                      ? "step"
                      : "steps"}
                  {/if}.
                </li>
              {/if}
            </ul>
            <div class="flex items-center justify-end gap-space-2 pt-space-1">
              <Button
                label="Keep routine"
                onclick={() => {
                  confirm = null;
                }}
                size="xs"
                variant="outline"
              />
              <Button
                label="Delete for good"
                onclick={() => {
                  confirm = null;
                  ondelete(routine.id);
                }}
                size="xs"
                variant="destructive"
              />
            </div>
          </div>
        {/if}
      </header>

      <!-- Agent-made review callout (T14) -->
      {#if unkeptAgent}
        <section
          aria-label="Created by an agent"
          class="flex flex-col gap-space-2 rounded-lg border border-status-attn-glyph bg-needs-ground p-space-4"
          data-slot="agent-origin-review"
        >
          <div class="flex flex-wrap items-center justify-between gap-space-2">
            <span class="type-label text-ink-strong">
              Created by session "{routine.origin.sessionTitle ??
                "Agent session"}"
            </span>
            {#if routine.origin.expiresAt}
              <Badge variant="attn">
                <span>
                  Turns off in {daysUntil(routine.origin.expiresAt, now)}
                  {daysUntil(routine.origin.expiresAt, now) === 1
                    ? "day"
                    : "days"} unless kept
                </span>
              </Badge>
            {/if}
          </div>
          {#if routine.origin.why}
            <blockquote
              class="m-0 rounded-well border border-border-well bg-surface-raised px-space-3 py-space-2 type-meta text-ink-strong"
            >
              <span class="text-ink-muted">Session said: </span>
              "{routine.origin.why}"
            </blockquote>
          {/if}
          <div class="flex flex-wrap items-center gap-space-2 pt-space-1">
            <Button
              disabled={stale}
              icon={IconKeep}
              label="Keep routine"
              onclick={() => onkeep(routine.id)}
              size="sm"
              variant="outline"
            />
            <Button
              disabled={stale}
              icon={IconPause}
              label="Turn off"
              onclick={() => ontogglepause(routine.id)}
              size="sm"
              variant="ghost"
            />
          </div>
        </section>
      {/if}

      <!-- What it looks for (T2, T7, T8, T9) — plain language, never "condition" jargon -->
      {#if check && standing}
        <section
          aria-labelledby="check-section-h"
          class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
          data-slot="routine-check"
        >
          <div class="flex flex-wrap items-center justify-between gap-space-2">
            <h3 class="m-0 type-label text-ink-strong" id="check-section-h">
              What it looks for
            </h3>
            <Badge variant={standing.badge}>
              <StatusGlyph
                glyph={standing.glyph}
                size="sm"
                tone={standing.tone}
              />
              <span>{standing.label}</span>
            </Badge>
          </div>

          <!-- Full statement true once met -->
          <p class="m-0 type-body font-medium text-ink-strong text-pretty">
            {check.statement}
          </p>

          <!-- Attributed latest look finding (data, never CawCo's own claim) -->
          {#if check.lastWords}
            <div
              class="flex flex-col gap-space-1 rounded-sm border border-border-hairline bg-surface-raised px-space-3 py-space-2"
            >
              <div
                class="flex flex-wrap items-center justify-between gap-space-2 type-meta text-ink-muted"
              >
                <span>{lastWordsAuthor}</span>
                {#if check.checkedAt}
                  <span class="tabular-nums">
                    {formatRelAge(check.checkedAt, now)}
                  </span>
                {/if}
              </div>
              <p
                class={[
                  "m-0 wrap-anywhere",
                  check.lastWordsBy === "command"
                    ? "font-mono type-code text-ink-strong"
                    : "type-body text-ink-strong",
                ]}
              >
                {check.lastWords}
              </p>
            </div>
          {/if}

          <!-- How CawCo checks it -->
          <div class="flex flex-col gap-space-2">
            <div
              class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
            >
              {#if check.method === "command"}
                <IconTerminal class="size-icon-sm flex-none" />
                <span>
                  Checked by shell command on {check.machineName} (sandboxed copy,
                  no credentials, max {routine.limits.maxMinutes}m)
                </span>
              {:else}
                <span>
                  Checked by a fresh delegate following the instructions below
                  and judging the result.
                </span>
              {/if}
            </div>

            {#if check.method === "command" && check.command}
              <div
                class="flex items-start gap-space-2 rounded-sm border border-border-hairline bg-code-bg py-space-2 ps-space-3 pe-space-2"
              >
                <code
                  class="min-w-0 flex-1 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere"
                >
                  {check.command}
                </code>
                <CopyButton
                  aria-label="Copy check command"
                  class="flex-none"
                  size="icon-xs"
                  text={check.command}
                  variant="ghost"
                />
              </div>
              <p class="m-0 type-meta text-ink-muted">
                Exit reading: <span class="font-mono text-ink-strong">0</span>
                means met ·
                <span class="font-mono text-ink-strong">124, 126, 127</span> or signal
                means could not check · anything else means not yet.
              </p>
            {/if}
          </div>

          <!-- Held work & give-up date -->
          <div
            class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-3"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-space-2 type-meta text-ink-muted"
            >
              <span>
                {check.giveUpAt
                  ? `Gives up after ${formatDay(check.giveUpAt)}`
                  : "Looks until met (no give-up date)"}
              </span>
              <span>
                Does not check while nothing waits · stops for good once met
              </span>
            </div>

            {#if hasHeldWork}
              <div class="flex flex-col gap-space-1">
                <span class="type-meta font-medium text-ink-strong">
                  Waiting on this ({check.heldTasks.length}
                  {check.heldTasks.length === 1 ? "task" : "tasks"}
                  {#if check.heldSteps > 0}
                    + {check.heldSteps} plan
                    {check.heldSteps === 1 ? "step" : "steps"}
                  {/if}):
                </span>
                <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
                  {#each check.heldTasks as task (task.id)}
                    <li
                      class="flex flex-wrap items-center justify-between gap-space-2 rounded-sm bg-surface-raised px-space-3 py-space-2"
                    >
                      <span class="flex min-w-0 items-center gap-space-2">
                        <span class="font-mono type-meta text-ink-subtle">
                          {task.id}
                        </span>
                        <span class="type-label text-ink-strong truncate">
                          {task.title}
                        </span>
                      </span>
                      <span class="type-meta text-ink-muted">
                        → {task.stage}
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {:else if check.standing !== "met"}
              <p class="m-0 type-meta text-status-attn-ink">
                No look will run: nothing waits on this right now.
              </p>
            {/if}
          </div>

          <!-- Recovery & manual override actions (T7, T8, T9) -->
          <div class="flex flex-wrap items-center gap-space-2 pt-space-1">
            {#if check.standing === "failing" || check.standing === "timed-out"}
              <Button
                disabled={stale || isRunning}
                icon={IconRefresh}
                label="Check again now"
                onclick={() => onlookagain(routine.id)}
                size="sm"
                variant="outline"
              />
              {#if check.standing === "timed-out"}
                <Button
                  disabled={stale}
                  label="Extend 7 days"
                  onclick={() => onextenddate(routine.id, 7)}
                  size="sm"
                  variant="outline"
                />
                <Button
                  disabled={stale}
                  label="Look until met"
                  onclick={() => onextenddate(routine.id, null)}
                  size="sm"
                  variant="ghost"
                />
              {/if}
              <Button
                disabled={stale}
                icon={IconTick}
                label="Say it is met myself"
                onclick={() => {
                  confirm = confirm === "mark-met" ? null : "mark-met";
                }}
                size="sm"
                variant="outline"
              />
            {:else if check.standing === "met"}
              <Button
                disabled={stale || isRunning}
                icon={IconRefresh}
                label="Look again"
                onclick={() => {
                  confirm = confirm === "look-again" ? null : "look-again";
                }}
                size="sm"
                variant="outline"
              />
            {:else if check.standing !== "paused"}
              <Button
                disabled={stale}
                icon={IconTick}
                label="Say it is met myself"
                onclick={() => {
                  confirm = confirm === "mark-met" ? null : "mark-met";
                }}
                size="sm"
                variant="outline"
              />
            {/if}
          </div>

          <!-- Inline confirmation: Say it is met myself (T8) -->
          {#if confirm === "mark-met"}
            <div
              class="flex flex-col gap-space-2 rounded-sm border border-status-attn-glyph bg-surface-raised p-space-3"
              transition:unfold
            >
              <p class="m-0 type-label text-ink-strong">
                Mark this as met yourself?
              </p>
              <p class="m-0 type-meta text-ink-muted">
                Checking stops for good and records that you marked it met.
                {#if hasHeldWork}
                  Every held item goes ahead immediately (
                  {#each check.heldTasks as task, i (task.id)}
                    {i > 0 ? ", " : ""}{task.id}
                  {/each}
                  {#if check.heldSteps > 0}
                    {check.heldTasks.length > 0 ? " + " : ""}{check.heldSteps}
                    plan {check.heldSteps === 1 ? "step" : "steps"}
                  {/if}
                  ), and work that starts cannot be held again.
                {/if}
              </p>
              <div class="flex items-center justify-end gap-space-2">
                <Button
                  label="Cancel"
                  onclick={() => {
                    confirm = null;
                  }}
                  size="xs"
                  variant="ghost"
                />
                <Button
                  icon={IconTick}
                  label="Mark met & release work"
                  onclick={() => {
                    confirm = null;
                    onmarkmet(routine.id);
                  }}
                  size="xs"
                  variant="grant"
                />
              </div>
            </div>
          {/if}

          <!-- Inline confirmation: Look again at a met check (T9) -->
          {#if confirm === "look-again"}
            <div
              class="flex flex-col gap-space-2 rounded-sm border border-border-control bg-surface-raised p-space-3"
              transition:unfold
            >
              <p class="m-0 type-label text-ink-strong">
                Un-meet and check again now?
              </p>
              <p class="m-0 type-meta text-ink-muted">
                This clears the met verdict and runs a fresh check now. Tasks
                not yet started are held again while tasks already started carry
                on.
              </p>
              <div class="flex items-center justify-end gap-space-2">
                <Button
                  label="Cancel"
                  onclick={() => {
                    confirm = null;
                  }}
                  size="xs"
                  variant="ghost"
                />
                <Button
                  icon={IconRefresh}
                  label="Start new check"
                  onclick={() => {
                    confirm = null;
                    onlookagain(routine.id);
                  }}
                  size="xs"
                  variant="outline"
                />
              </div>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Schedule & Triggers (T3 — words & clock, no decorative graphs) -->
      <section
        aria-labelledby="schedule-section-h"
        class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-4"
      >
        <h3 class="m-0 type-label text-ink-strong" id="schedule-section-h">
          When it runs
        </h3>
        <dl class="m-0 grid grid-cols-1 gap-space-2 @details:grid-cols-2">
          <div class="flex flex-col gap-space-row">
            <dt class="type-meta text-ink-muted">Rhythm</dt>
            <dd class="m-0 type-body text-ink-strong">
              {routine.schedule.rhythm}
              {#if routine.schedule.timezone !== LOCAL_ZONE}
                <span class="type-meta text-ink-muted">
                  ({routine.schedule.timezone})
                </span>
              {/if}
            </dd>
          </div>
          <div class="flex flex-col gap-space-row">
            <dt class="type-meta text-ink-muted">Next run on your clock</dt>
            <dd class="m-0 type-body text-ink-strong tabular-nums">
              {next.primary}
              {#if routine.schedule.nextAt && !next.blocked}
                <span class="block type-meta text-ink-muted">
                  {formatExactClock(routine.schedule.nextAt)} ({LOCAL_ZONE})
                </span>
              {:else if next.secondary}
                <span class="block type-meta text-ink-muted">
                  {next.secondary}
                </span>
              {/if}
            </dd>
          </div>
        </dl>

        {#if routine.eventTriggers.length > 0}
          <div class="mt-space-1 flex flex-col gap-space-1">
            <span class="type-meta text-ink-muted">Also started by events</span>
            <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
              {#each routine.eventTriggers as trigger (trigger.id)}
                <li
                  class="mark-line flex flex-wrap items-center gap-space-2 rounded-sm bg-surface-recess px-space-3 py-space-2 type-meta"
                >
                  <ServiceMark service={trigger.service} size="sm" />
                  <span class="font-medium text-ink-strong">
                    {serviceName(trigger.service)}
                  </span>
                  <span class="font-mono text-ink-muted">
                    {trigger.eventKind}
                  </span>
                  {#each trigger.filters as filter (filter)}
                    <Badge data-box kind="meta" variant="raised">
                      <span>{filter}</span>
                    </Badge>
                  {/each}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>

      <!-- Instructions & runner -->
      <section
        aria-labelledby="instructions-section-h"
        class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-space-2">
          <h3
            class="m-0 type-label text-ink-strong"
            id="instructions-section-h"
          >
            What each run does
          </h3>
          <span class="type-meta text-ink-muted">{routine.executor.label}</span>
        </div>
        <p class="m-0 max-w-c-measure type-body text-ink-strong text-pretty">
          {routine.instructions}
        </p>
        <p class="m-0 type-meta text-ink-subtle">
          {#if routine.origin.by === "cawco"}
            Built in to CawCo · pause or reschedule any time, instructions stay
            fixed.
          {:else if routine.origin.by === "session"}
            Created by session "{routine.origin.sessionTitle ?? "Agent"}" ·
            {routine.origin.kept ? "Kept by you" : "Pending your decision"}.
          {:else}
            Created by you.
          {/if}
        </p>
      </section>

      <!-- Recent runs ledger (T4) — each run opens strictly via IconExternal -->
      <section
        aria-labelledby="runs-section-h"
        class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-4"
      >
        <div class="flex items-center justify-between gap-space-2">
          <div class="mark-line flex items-center gap-space-2">
            <h3 class="m-0 type-label text-ink-strong" id="runs-section-h">
              Recent runs
            </h3>
            <Badge data-box size="tally" variant="secondary">
              <span>{routine.runs.length}</span>
            </Badge>
          </div>
          <span class="type-meta text-ink-subtle">
            Open a run for full output & session
          </span>
        </div>

        {#if routine.runs.length === 0}
          <p class="m-0 type-meta text-ink-muted">No runs recorded yet.</p>
        {:else}
          <div
            class="overflow-hidden rounded-lg border border-border-hairline bg-surface-raised"
          >
            <ul class="m-0 list-none p-0">
              {#each visibleRuns as run (run.id)}
                {@const meta = runOutcomeMeta(run.outcome)}
                <li
                  class="flex items-start gap-space-3 border-b border-b-border-hairline px-space-3 py-space-3 transition-[background-color] duration-(--duration-control) ease-out last:border-b-0 hover:bg-surface-hover"
                  data-run-row={run.id}
                >
                  <div class="pt-space-1">
                    <StatusGlyph
                      glyph={meta.glyph}
                      size="sm"
                      tone={meta.tone}
                    />
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col gap-space-row">
                    <div
                      class="flex flex-wrap items-center gap-x-space-2 gap-y-space-row type-meta"
                    >
                      <span
                        class={["font-medium", outcomeToneClass(meta.tone)]}
                      >
                        {meta.label}
                      </span>
                      {#if run.retriedOnce}
                        <Badge kind="meta" variant="secondary">
                          <span>Retried once</span>
                        </Badge>
                      {/if}
                      <span class="text-ink-muted tabular-nums">
                        {formatRelAge(run.startedAt, now)}
                      </span>
                      <span aria-hidden="true" class="text-ink-subtle">·</span>
                      <span class="text-ink-muted tabular-nums">
                        {formatShortDuration(run.durationMs)}
                      </span>
                      <span aria-hidden="true" class="text-ink-subtle">·</span>
                      <span class="text-ink-subtle">
                        {run.triggerDetail ?? triggerLabel(run.trigger)}
                      </span>
                    </div>
                    <p
                      class="m-0 type-meta text-ink-muted line-clamp-2 wrap-anywhere"
                    >
                      {run.oneLine}
                    </p>
                  </div>

                  <!-- Open icon only, never clicking the row text. -->
                  <Button
                    aria-label="Open run from {formatRelAge(
                      run.startedAt,
                      now
                    )}"
                    class="flex-none"
                    data-open-run={run.id}
                    icon={IconExternal}
                    onclick={() => onopenrun(routine.id, run.id)}
                    size="icon-sm"
                    title="Open run output & session"
                    tone="quiet"
                    variant="ghost"
                  />
                </li>
              {/each}
            </ul>
          </div>

          {#if routine.runs.length > 4}
            <div>
              <Button
                label={showAllRuns
                  ? "Show fewer runs"
                  : `Show all ${routine.runs.length} runs`}
                onclick={() => {
                  showAllRuns = !showAllRuns;
                }}
                size="xs"
                variant="ghost"
              />
            </div>
          {/if}
        {/if}
      </section>

      <!-- Spend & limits disclosure (T18 — never in the first view, always on demand) -->
      <section class="border-t border-t-border-hairline pt-space-3">
        <button
          aria-expanded={showSpend}
          class="mark-line press-tint flex w-full items-center justify-between gap-space-2 rounded-sm px-space-2 py-space-2 text-start type-label text-ink-muted transition-[background-color,color] duration-(--duration-control) ease-out hover:bg-surface-hover hover:text-ink-strong"
          onclick={() => {
            showSpend = !showSpend;
          }}
          type="button"
        >
          <span class="mark-line inline-flex items-center gap-space-2" data-box>
            {#if showSpend}
              <IconChevronDown class="size-icon-sm flex-none" />
            {:else}
              <IconChevronRight class="size-icon-sm flex-none" />
            {/if}
            <span>Spend & run limits</span>
          </span>
          <span class="type-meta tabular-nums text-ink-subtle">
            {routine.limits.runsWeek} runs this week
          </span>
        </button>

        {#if showSpend}
          <dl
            class="m-0 mt-space-2 grid grid-cols-2 gap-space-3 rounded-well border border-border-well bg-surface-well p-space-3 @details:grid-cols-3"
            transition:unfold
          >
            <div class="flex flex-col gap-space-row">
              <dt class="type-meta text-ink-muted">Spent this week</dt>
              <dd class="m-0 type-label text-ink-strong tabular-nums">
                {routine.limits.spentWeekDollars === undefined
                  ? "$0.00 (shell)"
                  : `$${routine.limits.spentWeekDollars.toFixed(2)}`}
              </dd>
            </div>
            <div class="flex flex-col gap-space-row">
              <dt class="type-meta text-ink-muted">Spent today</dt>
              <dd class="m-0 type-label text-ink-strong tabular-nums">
                {routine.limits.spentTodayDollars === undefined
                  ? "$0.00"
                  : `$${routine.limits.spentTodayDollars.toFixed(2)}`}
              </dd>
            </div>
            <div class="flex flex-col gap-space-row">
              <dt class="type-meta text-ink-muted">Daily cap</dt>
              <dd class="m-0 type-label text-ink-strong tabular-nums">
                {routine.limits.dailyCapDollars === undefined
                  ? "None set"
                  : `$${routine.limits.dailyCapDollars.toFixed(2)} / day`}
              </dd>
            </div>
            <div class="flex flex-col gap-space-row">
              <dt class="type-meta text-ink-muted">Per-run budget</dt>
              <dd class="m-0 type-label text-ink-strong tabular-nums">
                {routine.limits.maxDollars === undefined
                  ? "No model spend"
                  : `$${routine.limits.maxDollars.toFixed(2)}`}
              </dd>
            </div>
            <div class="flex flex-col gap-space-row">
              <dt class="type-meta text-ink-muted">Time limit</dt>
              <dd class="m-0 type-label text-ink-strong tabular-nums">
                {routine.limits.maxMinutes} min
              </dd>
            </div>
            {#if routine.limits.maxTurns !== undefined}
              <div class="flex flex-col gap-space-row">
                <dt class="type-meta text-ink-muted">Turn limit</dt>
                <dd class="m-0 type-label text-ink-strong tabular-nums">
                  {routine.limits.maxTurns} turns
                </dd>
              </div>
            {/if}
          </dl>
        {/if}
      </section>
    </div>
  </div>
{/snippet}

{#if phone}
  <PageSurface
    backTo="Routines"
    label={routine.name}
    {onclose}
    title={routine.name}
  >
    {@render body()}
  </PageSurface>
{:else}
  <SideSurface
    label={routine.name}
    of="task"
    {onclose}
    recessed={false}
    title={routine.name}
  >
    {@render body()}
  </SideSurface>
{/if}
