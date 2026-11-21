<script lang="ts">
  import RowFault from "#lib/cawco/RowFault.svelte";
  import PageSurface from "#lib/cawco/side/PageSurface.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconChevronLeft, IconSparkles } from "#lib/icons.js";
  import {
    describeDraftSchedule,
    LOCAL_ZONE,
    MOCK_MACHINE,
    type Routine,
    type RoutineKind,
    type ScheduleCadence,
  } from "./routines-data";

  export interface RoutineDraftSubmit {
    cadence: ScheduleCadence;
    checkCommand: string;
    checkMethod: "model" | "command";
    checkStatement: string;
    cron: string;
    delegateType: string;
    executorMode: "delegate" | "orchestrator";
    giveUpDate: string;
    instructions: string;
    kind: RoutineKind;
    name: string;
    time: string;
    timezone: string;
    weekday: string;
  }

  type BadField =
    "name" | "statement" | "command" | "instructions" | "date" | "cron" | null;

  const WHITESPACE = /\s+/u;
  const TODAY_ISO = "2026-11-21";
  const CADENCES: { label: string; value: ScheduleCadence }[] = [
    { value: "hourly", label: "Hourly" },
    { value: "daily", label: "Daily" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekly", label: "Weekly" },
    { value: "custom", label: "Custom" },
    { value: "events", label: "Events only" },
  ];
  const CADENCE_SET = new Set<string>(CADENCES.map((one) => one.value));
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const ZONES = [
    LOCAL_ZONE,
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
  ];
  const DELEGATE_TYPES = ["CawCo's pick", "Claude Code", "OpenCode", "Pi"];

  function isCadence(value: string | undefined): value is ScheduleCadence {
    return value !== undefined && CADENCE_SET.has(value);
  }

  let {
    editing = null,
    stale = false,
    phone = false,
    onback,
    onclose,
    onsubmit,
    onaskcaw,
  }: {
    editing?: Routine | null;
    stale?: boolean;
    phone?: boolean;
    onback?: () => void;
    onclose: () => void;
    onsubmit: (draft: RoutineDraftSubmit) => void;
    onaskcaw: (prompt: string) => void;
  } = $props();

  const isBuiltIn = $derived(Boolean(editing?.builtIn));
  const titleText = $derived(
    editing ? `Edit · ${editing.name}` : "New routine"
  );

  let name = $state("");
  let kind = $state<RoutineKind>("work");
  let instructions = $state("");
  let checkStatement = $state("");
  let checkMethod = $state<"model" | "command">("model");
  let checkCommand = $state("");
  let giveUpDate = $state("");
  let cadence = $state<ScheduleCadence>("weekdays");
  let time = $state("09:00");
  let weekday = $state("Mon");
  let cron = $state("*/15 * * * *");
  let timezone = $state(LOCAL_ZONE);
  let executorMode = $state<"delegate" | "orchestrator">("delegate");
  let delegateType = $state("CawCo's pick");
  let fault = $state<string | null>(null);
  let badField = $state<BadField>(null);

  // Sync draft fields whenever the target routine changes (including opening fresh create).
  let hydratedKey = "";
  $effect(() => {
    const key = editing ? `edit:${editing.id}` : "create";
    if (key === hydratedKey) {
      return;
    }
    hydratedKey = key;
    fault = null;
    badField = null;
    if (editing) {
      ({ name, kind, instructions } = editing);
      ({ cadence, time, weekday, timezone } = editing.schedule);
      checkStatement = editing.check?.statement ?? "";
      checkMethod = editing.check?.method ?? "model";
      checkCommand = editing.check?.command ?? "";
      giveUpDate = editing.check?.giveUpAt
        ? new Date(editing.check.giveUpAt).toISOString().slice(0, 10)
        : "";
      cron = editing.schedule.cron ?? "*/15 * * * *";
      executorMode =
        editing.executor.mode === "orchestrator" ? "orchestrator" : "delegate";
      delegateType = editing.executor.delegateType ?? "CawCo's pick";
    } else {
      name = "";
      kind = "work";
      instructions = "";
      checkStatement = "";
      checkMethod = "model";
      checkCommand = "";
      giveUpDate = "";
      cadence = "weekdays";
      time = "09:00";
      weekday = "Mon";
      cron = "*/15 * * * *";
      timezone = LOCAL_ZONE;
      executorMode = "delegate";
      delegateType = "CawCo's pick";
    }
  });

  const readback = $derived(
    describeDraftSchedule({
      cadence,
      time,
      weekday,
      cron,
      timezone,
    })
  );

  function cawPromptForDraft(): string {
    if (editing) {
      return `Change routine "${editing.name}": `;
    }
    const clean = name.trim();
    return clean
      ? `Set up a routine called "${clean}": `
      : "Set up a routine that ";
  }

  function validateCheckFields(): { field: BadField; reason: string } | null {
    if (!checkStatement.trim()) {
      return {
        field: "statement",
        reason:
          checkMethod === "command"
            ? "A shell check needs a statement of what is true once it exits 0."
            : "Write the statement that is true once this is met.",
      };
    }
    if (checkMethod === "command" && !checkCommand.trim()) {
      return {
        field: "command",
        reason: "Enter the shell command CawCo should run to check.",
      };
    }
    if (checkMethod === "model" && !instructions.trim()) {
      return {
        field: "instructions",
        reason: "Write the instructions the model follows to check this fact.",
      };
    }
    if (giveUpDate && giveUpDate <= TODAY_ISO) {
      return {
        field: "date",
        reason:
          "The give-up day must be after today (leave blank to keep looking until met).",
      };
    }
    return null;
  }

  function validateDraft(
    cleanName: string
  ): { field: BadField; reason: string } | null {
    if (!cleanName) {
      return {
        field: "name",
        reason: "Give this routine a plain name (3 to 6 words).",
      };
    }
    if (cleanName.length > 64) {
      return {
        field: "name",
        reason: `Name is ${cleanName.length} characters; keep it to 64 characters or fewer.`,
      };
    }
    if (kind === "check") {
      const checkProblem = validateCheckFields();
      if (checkProblem) {
        return checkProblem;
      }
    } else if (!(isBuiltIn || instructions.trim())) {
      return {
        field: "instructions",
        reason: "Describe what each run should do.",
      };
    }
    if (cadence === "custom") {
      const parts = cron.trim().split(WHITESPACE).filter(Boolean);
      if (parts.length !== 5) {
        return {
          field: "cron",
          reason:
            "Custom schedules take five space-separated fields (minute hour day month weekday).",
        };
      }
    }
    return null;
  }

  function handleSave(event: SubmitEvent): void {
    event.preventDefault();
    fault = null;
    badField = null;

    const cleanName = name.trim();
    const problem = validateDraft(cleanName);
    if (problem) {
      badField = problem.field;
      fault = problem.reason;
      return;
    }

    onsubmit({
      name: cleanName,
      kind,
      instructions:
        kind === "check" && checkMethod === "command"
          ? checkStatement.trim()
          : instructions.trim(),
      checkStatement: checkStatement.trim(),
      checkMethod,
      checkCommand: checkCommand.trim(),
      giveUpDate,
      cadence,
      time,
      weekday,
      cron: cron.trim(),
      timezone,
      executorMode,
      delegateType,
    });
  }
</script>

{#snippet backLeading()}
  {#if onback}
    <BarGlass form="group">
      <BarItem
        icon={IconChevronLeft}
        label="Back to routine"
        onclick={onback}
      />
    </BarGlass>
  {/if}
{/snippet}

{#snippet body()}
  <form
    class="flex flex-auto flex-col min-h-0 overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head"
    data-routine-editor
    onsubmit={handleSave}
  >
    <div
      class="flex flex-col gap-space-5 px-space-5 pt-space-2 pb-space-7 max-phone:px-space-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <h2 class="m-0 type-title text-ink-strong">{titleText}</h2>
        <Button
          disabled={stale}
          icon={IconSparkles}
          label="Tell Caw instead"
          onclick={() => onaskcaw(cawPromptForDraft())}
          size="xs"
          variant="ghost"
        />
      </div>

      {#if isBuiltIn}
        <p
          class="m-0 rounded-sm bg-surface-recess px-space-3 py-space-2 type-meta text-ink-muted"
        >
          Built-in CawCo routine: you can change when it runs, while its name
          and instructions stay fixed.
        </p>
      {/if}

      <!-- Mode pick: work vs look for a fact (plain words, no "condition" jargon) -->
      {#if !isBuiltIn}
        <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
          <legend class="type-label text-ink-strong">
            What kind of routine
          </legend>
          <OptionGroup
            aria-label="What kind of routine"
            bind:value={
              () => [kind],
              (next) => {
                const [picked] = next;
                if (picked === "work" || picked === "check") {
                  kind = picked;
                }
              }
            }
          >
            <OptionGroupItem value="work">Repeat work</OptionGroupItem>
            <OptionGroupItem value="check">Look for a fact</OptionGroupItem>
          </OptionGroup>
        </fieldset>
      {/if}

      <!-- Name -->
      <div class="flex flex-col gap-space-1">
        <div class="flex items-center justify-between gap-space-2">
          <label class="type-label text-ink-strong" for="rtn-name">Name</label>
          <span
            class={[
              "type-meta tabular-nums",
              name.trim().length > 64
                ? "text-status-fail-ink"
                : "text-ink-subtle",
            ]}
          >
            {name.trim().length}/64
          </span>
        </div>
        <Input
          aria-invalid={badField === "name" || undefined}
          disabled={isBuiltIn}
          id="rtn-name"
          placeholder="e.g. Morning PR triage"
          bind:value={name}
        />
      </div>

      <!-- Look-for-a-fact fields (T11) -->
      {#if kind === "check" && !isBuiltIn}
        <div
          class="flex flex-col gap-space-4 rounded-lg border border-border-well bg-surface-well p-space-4"
        >
          <div class="flex flex-col gap-space-1">
            <label class="type-label text-ink-strong" for="rtn-statement">
              Statement that is true once met
            </label>
            <Textarea
              aria-invalid={badField === "statement" || undefined}
              id="rtn-statement"
              placeholder="e.g. Release v2.4.0 is live on GitHub with signed tarballs."
              bind:value={checkStatement}
            />
          </div>

          <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
            <legend class="type-label text-ink-strong">How CawCo checks</legend>
            <OptionGroup
              aria-label="How CawCo checks"
              bind:value={
                () => [checkMethod],
                (next) => {
                  const [picked] = next;
                  if (picked === "model" || picked === "command") {
                    checkMethod = picked;
                  }
                }
              }
            >
              <OptionGroupItem value="model">Model judges</OptionGroupItem>
              <OptionGroupItem value="command">
                Shell command (no model)
              </OptionGroupItem>
            </OptionGroup>
          </fieldset>

          {#if checkMethod === "command"}
            <div class="flex flex-col gap-space-1">
              <label class="type-label text-ink-strong" for="rtn-command">
                Shell command
              </label>
              <Textarea
                aria-invalid={badField === "command" || undefined}
                face="mono"
                id="rtn-command"
                placeholder="curl -sf https://staging.cawco.dev/health"
                bind:value={checkCommand}
              />
              <p class="m-0 type-meta text-ink-muted">
                Runs in a sandboxed copy on {MOCK_MACHINE.hostname} with none of your
                credentials (1 min max). Commands you write yourself run without approval.
              </p>
              <p class="m-0 type-meta text-ink-subtle">
                Exit 0 = met · 124, 126, 127 or signal = could not check ·
                anything else = not yet.
              </p>
            </div>
          {/if}

          <div class="flex flex-col gap-space-1">
            <label class="type-label text-ink-strong" for="rtn-giveup">
              Stop looking after (optional)
            </label>
            <Input
              aria-invalid={badField === "date" || undefined}
              id="rtn-giveup"
              measure="cap-sm"
              min="2026-11-22"
              type="date"
              bind:value={giveUpDate}
            />
            <p class="m-0 type-meta text-ink-muted">
              Leave blank to keep looking until met. Only runs while a task or
              plan step waits on it, and stops for good once met.
            </p>
          </div>
        </div>
      {/if}

      <!-- Instructions (work or model check) -->
      {#if !isBuiltIn && (kind === "work" || checkMethod === "model")}
        <div class="flex flex-col gap-space-1">
          <label class="type-label text-ink-strong" for="rtn-instructions">
            {kind === "check"
              ? "Instructions for the model to check"
              : "What each run does"}
          </label>
          <Textarea
            aria-invalid={badField === "instructions" || undefined}
            id="rtn-instructions"
            placeholder="Write plain instructions for each run…"
            bind:value={instructions}
          />
        </div>
      {/if}

      <!-- Schedule & live plain-English readback (T3, T10) -->
      <div
        class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
      >
        <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
          <legend class="type-label text-ink-strong">When it runs</legend>
          <OptionGroup
            aria-label="Schedule cadence"
            bind:value={
              () => [cadence],
              (next) => {
                const [picked] = next;
                if (isCadence(picked)) {
                  cadence = picked;
                }
              }
            }
          >
            {#each CADENCES as option (option.value)}
              <OptionGroupItem value={option.value}>
                {option.label}
              </OptionGroupItem>
            {/each}
          </OptionGroup>
        </fieldset>

        {#if cadence !== "events"}
          <div class="flex flex-wrap items-end gap-space-3">
            {#if cadence === "weekly"}
              <div class="flex flex-col gap-space-1">
                <span class="type-meta text-ink-muted">Day</span>
                <Select.Root
                  onValueChange={(next) => {
                    if (next) {
                      weekday = next;
                    }
                  }}
                  type="single"
                  value={weekday}
                >
                  <Select.Trigger aria-label="Weekday">{weekday}</Select.Trigger
                  >
                  <Select.Content>
                    {#each WEEKDAYS as day (day)}
                      <Select.Item label={day} value={day}>
                        <span>{day}</span>
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            {/if}

            {#if cadence === "daily" || cadence === "weekdays" || cadence === "weekly"}
              <div class="flex w-32 flex-col gap-space-1">
                <label class="type-meta text-ink-muted" for="rtn-time">
                  Time
                </label>
                <Input id="rtn-time" type="time" bind:value={time} />
              </div>
            {/if}

            {#if cadence === "custom"}
              <div class="flex flex-1 flex-col gap-space-1">
                <label class="type-meta text-ink-muted" for="rtn-cron">
                  Five-field cron
                </label>
                <Input
                  aria-invalid={badField === "cron" || undefined}
                  face="mono"
                  id="rtn-cron"
                  placeholder="*/15 * * * *"
                  bind:value={cron}
                />
              </div>
            {/if}

            <div class="flex flex-col gap-space-1">
              <span class="type-meta text-ink-muted">Time zone</span>
              <Select.Root
                onValueChange={(next) => {
                  if (next) {
                    timezone = next;
                  }
                }}
                type="single"
                value={timezone}
              >
                <Select.Trigger aria-label="Time zone">
                  {timezone}
                </Select.Trigger>
                <Select.Content>
                  {#each ZONES as zone (zone)}
                    <Select.Item label={zone} value={zone}>
                      <span>{zone}</span>
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          </div>
        {/if}

        <!-- Live plain-English readback before committing -->
        <div
          class="flex flex-col gap-space-row rounded-well border border-border-well bg-surface-well px-space-3 py-space-2"
          data-slot="schedule-readback"
        >
          <span class="type-label text-ink-strong">{readback.rhythm}</span>
          <span class="type-meta text-ink-muted tabular-nums">
            Next: {readback.nextLabel}
          </span>
        </div>
      </div>

      <!-- Executor (delegate vs orchestrator) -->
      {#if !(isBuiltIn || (kind === "check" && checkMethod === "command"))}
        <div
          class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
        >
          <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
            <legend class="type-label text-ink-strong">Who does each run</legend
            >
            <OptionGroup
              aria-label="Who does each run"
              bind:value={
                () => [executorMode],
                (next) => {
                  const [picked] = next;
                  if (picked === "delegate" || picked === "orchestrator") {
                    executorMode = picked;
                  }
                }
              }
            >
              <OptionGroupItem value="delegate">
                Fresh delegate (does work & reports)
              </OptionGroupItem>
              <OptionGroupItem value="orchestrator">
                Orchestrating session (delegates & continues)
              </OptionGroupItem>
            </OptionGroup>
          </fieldset>

          <div class="flex flex-col gap-space-1">
            <span class="type-meta text-ink-muted">Delegate type</span>
            <Select.Root
              onValueChange={(next) => {
                if (next) {
                  delegateType = next;
                }
              }}
              type="single"
              value={delegateType}
            >
              <Select.Trigger aria-label="Delegate type">
                {delegateType}
              </Select.Trigger>
              <Select.Content>
                {#each DELEGATE_TYPES as option (option)}
                  <Select.Item label={option} value={option}>
                    <span>{option}</span>
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      {/if}

      {#if !editing}
        <p class="m-0 type-meta text-ink-muted">
          {kind === "check"
            ? "After creation, this routine appears among things any task can wait on."
            : "Creating this routine starts one test run right away, which spends like any delegate run."}
        </p>
      {/if}

      <RowFault reason={fault} />

      <div
        class="flex flex-wrap items-center justify-end gap-space-2 border-t border-t-border-hairline pt-space-4"
      >
        <Button
          label="Cancel"
          onclick={onback ?? onclose}
          size="sm"
          variant="ghost"
        />
        <Button
          disabled={stale}
          label={editing ? "Save changes" : "Create & test run"}
          size="sm"
          type="submit"
          variant="default"
        />
      </div>
    </div>
  </form>
{/snippet}

{#if phone}
  <PageSurface
    backTo={editing ? editing.name : "Routines"}
    label={titleText}
    onclose={onback ?? onclose}
    title={titleText}
  >
    {@render body()}
  </PageSurface>
{:else}
  <SideSurface
    label={titleText}
    leading={onback ? backLeading : undefined}
    of="task"
    {onclose}
    recessed={false}
    title={titleText}
  >
    {@render body()}
  </SideSurface>
{/if}
