<script lang="ts" module>
  import type { Activity } from "@cawco/core/activity";
  import type { CawRunning } from "@cawco/core/project-conversation";

  /** One thing Caw started that still runs, as the pick step names it. */
  export interface PickRow extends CawRunning {
    /** What its turn is doing now, as the rail says it. */
    activity: Activity;
    /** Its machine's name ("obelisk"). */
    machineName: string;
    /** How long its turn has run ("4m"). */
    ran: string;
    /** The task's own title, for an attempt. */
    taskTitle: string | null;
  }

  /** How far one checked row's stop has got. */
  export type PickStop = "stopping" | "stopped" | "away" | "failed";

  /** The tray's step: choose what stops, the stops landing, Caw off. */
  export type PickStep = "pick" | "stopping" | "off";
</script>

<script lang="ts">
  /**
   * DESIGN DRAWING, not wired: the Caw-off tray with a pick step (the
   * owner's pin on caw-one-session-calls, 10-30). It stands where StopTray
   * stands, under Caw's switch, and grows in place through three steps,
   * each its own height (Family, benji.org/family-values: "each subsequent
   * tray is designed to vary in height"):
   *
   * 1. Pick: every session the conversation started that still runs, each
   *    with a checkbox, all checked. One confirm stops the checked ones and
   *    turns Caw off; the unchecked ones finish on their own. Cancel leaves
   *    Caw on. Its label carries the count ("Stop 5 and turn off"), and
   *    with none checked it is the old "Let them finish" ("Turn off, let 8
   *    finish"), so one button replaces the two and the arming press.
   * 2. Stopping: the unchecked rows fold away into one line, the checked
   *    ones turn as each machine confirms, the ring in the button fills.
   * 3. Off: the list folds shut; what stopped and what still runs, said.
   *
   * The nesting rule (a stopped lead never leaves its delegates running):
   * checking a row checks everything under it; unchecking a row unchecks
   * everything under it and the leads above it.
   *
   * The title morphs its words ("Turn Caw off for cockpit?" into "Caw is
   * off for cockpit"), Caw's face goes from ready to sleeping, and each
   * row's checkbox slot becomes its stop's glyph: what persists stays put.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconCloudCross as Away,
    IconError as Failed,
    IconPause as Pause,
    IconRenew as Working,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import CawFace from "./home/CawFace.svelte";
  import { markHue, sessionSprite } from "./mark";
  import { nestFrom } from "./motion/branch.svelte";
  import { unfold } from "./motion/fold.svelte";
  import RowFault from "./RowFault.svelte";
  import TreeMark from "./TreeMark.svelte";
  import { glyphIn, glyphOut } from "./workspace/session-status";

  let {
    class: className,
    projectName,
    rows,
    step = "pick",
    checked = $bindable([]),
    stops = {},
    refusal = null,
    oncancel,
    onconfirm,
  }: {
    class?: string;
    projectName: string;
    rows: PickRow[];
    step?: PickStep;
    /** The ids that stop; every row's by default. */
    checked?: string[];
    /** Each checked row's stop, from step 2 on. */
    stops?: Record<string, PickStop>;
    /** The hub refused the turn-off: its words, in the head. */
    refusal?: string | null;
    oncancel?: () => void;
    onconfirm?: () => void;
  } = $props();

  const uid = $props.id();

  /** Between the parts of a row's second line. */
  const SEP = " · ";

  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;

  /* ── The checks ─────────────────────────────────────────────────── */

  const on = $derived(new Set(checked));
  const kidsOf = (id: string) => rows.filter((row) => row.parentId === id);
  const under = (id: string): string[] => [
    id,
    ...kidsOf(id).flatMap((kid) => under(kid.id)),
  ];
  const leadsOf = (id: string): string[] => {
    const lead = rows.find((row) => row.id === id)?.parentId;
    return lead ? [lead, ...leadsOf(lead)] : [];
  };

  function toggle(id: string, next: boolean): void {
    const set = new Set(checked);
    for (const each of under(id)) {
      if (next) {
        set.add(each);
      } else {
        set.delete(each);
      }
    }
    if (!next) {
      for (const lead of leadsOf(id)) {
        set.delete(lead);
      }
    }
    checked = rows.filter((row) => set.has(row.id)).map((row) => row.id);
  }

  const total = $derived(rows.length);
  const stopping = $derived(rows.filter((row) => on.has(row.id)).length);
  const kept = $derived(total - stopping);
  const all = $derived(stopping === total);
  const tasks = $derived(rows.filter((row) => row.kind === "attempt").length);
  const delegates = $derived(total - tasks);

  /* ── What each step says ────────────────────────────────────────── */

  const name = $derived(projectName || "this project");
  const title = $derived(
    step === "pick" ? `Turn Caw off for ${name}?` : `Caw is off for ${name}`
  );

  const stopsOf = (state: PickStop) =>
    rows.filter((row) => on.has(row.id) && stops[row.id] === state);
  const stoppedCount = $derived(stopsOf("stopped").length);
  const away = $derived(stopsOf("away"));
  const left = $derived(stopsOf("stopping").length);
  const failedCount = $derived(stopsOf("failed").length);

  const finishes = (n: number) =>
    `${n} ${plural(n, "finishes", "finish")} on ${plural(n, "its", "their")} own.`;

  const line = $derived.by(() => {
    if (step === "pick") {
      if (stopping === 0) {
        return `He stops taking events now. ${total === 1 ? "It finishes" : `All ${total} finish`} on ${plural(total, "its", "their")} own.`;
      }
      return "He stops taking events now. Checked sessions stop mid-turn; the rest finish on their own.";
    }
    if (step === "stopping") {
      return "Each stops as its machine confirms it.";
    }
    const said = [`Stopped ${stoppedCount}.`];
    if (away.length > 0) {
      const machines = [...new Set(away.map((row) => row.machineName))];
      said.push(
        `${away.length} ${plural(away.length, "stops", "stop")} when ${machines.length === 1 ? `${machines[0]} is` : "their machines are"} back.`
      );
    }
    if (kept > 0) {
      said.push(finishes(kept));
    }
    return said.join(" ");
  });

  const confirmLabel = $derived.by(() => {
    if (step === "off") {
      return "Caw is off";
    }
    return stopping === 0
      ? `Turn off, let ${total === 1 ? "it" : total} finish`
      : `Stop ${stopping} and turn off`;
  });
  /** Coral to turn off with nothing stopped, destructive to stop, plain once he is off. */
  const confirmLook = $derived.by(() => {
    if (step === "off") {
      return "outline";
    }
    return step === "pick" && stopping === 0 ? "default" : "destructive";
  });
  const progress = $derived(
    step === "pick" || stopping === 0
      ? undefined
      : (stoppedCount + away.length) / stopping
  );

  /* ── A row ──────────────────────────────────────────────────────── */

  /** Shown in this step: every row to pick from; then only what stops. */
  const shown = (row: PickRow) => step === "pick" || on.has(row.id);
  /** Its nearest shown lead: a kept lead's stopping delegate stands at the top. */
  function leadShown(row: PickRow): string | null {
    let lead = row.parentId;
    while (lead) {
      const at = rows.find((each) => each.id === lead);
      if (at && shown(at)) {
        return lead;
      }
      lead = at?.parentId ?? null;
    }
    return null;
  }
  const branchOf = (lead: string | null) =>
    step === "off"
      ? []
      : rows.filter((row) => shown(row) && leadShown(row) === lead);

  const fillOf = (row: PickRow) => `var(--mark-${markHue(row.cwd)})`;
  const titleOf = (row: PickRow) =>
    (row.kind === "attempt" ? row.taskTitle : null) ??
    row.title ??
    row.cwd.split("/").at(-1) ??
    row.id;

  function statusOf(row: PickRow) {
    const stop = step === "pick" ? null : stops[row.id];
    if (stop === "stopping") {
      return { word: "Stopping…", icon: null, tone: "busy" } as const;
    }
    if (stop === "stopped") {
      return { word: "Stopped", icon: Pause, tone: "quiet" } as const;
    }
    if (stop === "failed") {
      return { word: "Couldn't stop", icon: Failed, tone: "failed" } as const;
    }
    if (row.offline) {
      return {
        word: on.has(row.id)
          ? `Stops when ${row.machineName} is back`
          : `${row.machineName} is away`,
        icon: Away,
        tone: "quiet",
      } as const;
    }
    if (row.activity === "blocked") {
      return { word: "Needs you", icon: null, tone: "attention" } as const;
    }
    if (row.activity === "working") {
      return { word: "Working", icon: null, tone: "working" } as const;
    }
    return { word: "Idle", icon: Pause, tone: "quiet" } as const;
  }

  function markOf(row: PickRow) {
    if (step !== "pick") {
      return stops[row.id] === "failed" ? ("fail" as const) : undefined;
    }
    if (row.activity === "blocked") {
      return "attn" as const;
    }
    return row.activity === "working" && !row.offline
      ? ("live" as const)
      : undefined;
  }

  /** A status word's ink: only what asks something of him takes a hue. */
  const toneInk = (tone: string) =>
    ({
      attention: "text-status-attn-ink",
      failed: "text-status-fail-ink",
    })[tone] ?? "";
  /** A stop's glyph's ink, in the trailing column. */
  const glyphInk = (tone: string) =>
    ({
      failed: "text-status-fail-glyph",
      quiet: "text-status-idle-glyph",
    })[tone] ?? "text-ink-muted";
</script>

{#snippet branch(lead: string | null)}
  {#each branchOf(lead) as row (row.id)}
    {@const status = statusOf(row)}
    {@const kids = branchOf(row.id)}
    {@const Sprite = sessionSprite(row.id)}
    {@const named = titleOf(row)}
    <li class="relative" data-row={row.id} transition:unfold>
      <!-- Two lines: the title, whole, then what it is and what it is
           doing. The mark and the box stand on the title's first line. -->
      <svelte:element
        this={step === "pick" ? "label" : "div"}
        for={step === "pick" ? `${uid}-${row.id}` : undefined}
        data-slot="row"
        class={cn(
          "flex items-start gap-(--row-compact-gap) rounded-sm py-space-1 ps-(--row-compact-gap) pe-(--row-compact-pad-end) type-label text-ink-strong",
          step === "pick" && "hover:bg-surface-hover"
        )}
      >
        <!-- mark-line: the mark stands on the title's first line, a
             one-line box over a two-line block of words. -->
        <span data-box class="flex block-lh flex-none items-center">
          <TreeMark
            noun="delegate"
            status={markOf(row)}
            fill={fillOf(row)}
            count={kids.length}
            faceAlways
          >
            {#snippet face()}
              <Sprite aria-hidden="true" class="size-icon-sm" />
            {/snippet}
          </TreeMark>
        </span>
        <span data-slot="words" class="grid min-w-0 flex-auto">
          <span
            data-slot="title"
            class="text-pretty wrap-anywhere text-ink-strong">{named}</span
          >
          <span data-slot="meta" class="type-meta text-ink-muted"
            >{#if row.kind === "attempt"}Task{SEP}{/if}<span
              class={toneInk(status.tone)}
              data-stop-tray-tone={status.tone}
              ><MorphText text={status.word} /></span
            >{#if step === "pick" && row.ran}{SEP}<span class="num"
                >{row.ran}</span
              >{/if}</span
          >
        </span>
        <!-- The pick's checkbox, then its stop's glyph, in one trailing
             column that lines up at every depth of the tree. -->
        <span
          data-slot="pick"
          data-box
          class="grid block-lh flex-none place-items-center"
        >
          {#if step === "pick"}
            <Checkbox
              id="{uid}-{row.id}"
              aria-label="Stop {named}"
              checked={on.has(row.id)}
              onCheckedChange={(next) => toggle(row.id, next)}
            />
          {:else}
            {#key status.word}
              <span
                class="col-start-1 row-start-1 inline-grid"
                in:glyphIn
                out:glyphOut
              >
                {#if status.icon}
                  <status.icon
                    aria-hidden="true"
                    class={cn("size-icon-md", glyphInk(status.tone))}
                  />
                {:else}
                  <Spinner aria-hidden="true" role="presentation" />
                {/if}
              </span>
            {/key}
          {/if}
        </span>
      </svelte:element>
      {#if kids.length > 0}
        <ul
          data-nest
          class="kit-nest m-0 flex list-none flex-col gap-(--tree-gap) pt-(--tree-gap) pb-0 ps-(--nest-pad) pe-0"
          {@attach nestFrom("[data-tree-mark]")}
        >
          {@render branch(row.id)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<section
  aria-labelledby="{uid}-title"
  class={cn(
    "@container/stop-tray min-w-0 py-space-1 ps-(--ask-indent) pe-(--ask-end)",
    className
  )}
  data-stop-kind="caw-off"
  data-phase={step}
  transition:unfold
>
  <div
    data-slot="tile"
    class="grid grid-cols-1 gap-space-3 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
  >
    <div data-slot="head" class="flex min-w-0 gap-space-3">
      <div aria-hidden="true" class="flex-none">
        <CawFace size={36} status={step === "pick" ? "ready" : "sleeping"} />
      </div>
      <div data-slot="words" class="grid min-w-0 flex-auto gap-space-1">
        <p
          data-slot="title"
          class="m-0 min-w-0 type-label font-medium text-balance text-ink-strong"
          id="{uid}-title"
        >
          <MorphText text={title} wrap />
        </p>
        <p aria-live="polite" class="m-0 type-meta text-pretty text-ink-muted">
          <MorphText text={line} wrap />
        </p>
        <RowFault reason={refusal} />
      </div>
    </div>

    {#if step !== "off"}
      <div
        data-slot="list"
        class="grid min-w-0 grid-cols-1 gap-space-1"
        transition:unfold
      >
        {#if step === "pick" && total > 1}
          <!-- The count, and which are tasks, over the rows; its box, in
               the rows' column, checks or clears them all. -->
          <label
            for="{uid}-all"
            data-slot="all"
            class="mark-line flex min-h-(--row-compact-h) items-center gap-(--row-compact-gap) rounded-sm ps-(--row-compact-gap) pe-(--row-compact-pad-end) hover:bg-surface-hover"
            transition:unfold
          >
            <span
              data-box
              class="flex min-w-0 flex-auto flex-wrap items-baseline gap-x-space-2"
            >
              <span class="type-label text-ink-strong">All {total} running</span
              >
              <span class="num type-meta text-ink-muted"
                >{tasks}
                {plural(tasks, "task", "tasks")} · {delegates}
                {plural(delegates, "delegate", "delegates")}</span
              >
            </span>
            <span
              data-box
              class="grid size-icon-md flex-none place-items-center"
            >
              <Checkbox
                id="{uid}-all"
                checked={all}
                indeterminate={!all && stopping > 0}
                onCheckedChange={(next) => {
                  checked = next ? rows.map((row) => row.id) : [];
                }}
              />
            </span>
          </label>
        {/if}
        <ul
          data-slot="sessions"
          aria-label="Sessions Caw started"
          class="m-0 flex list-none flex-col gap-(--tree-gap) overflow-x-clip p-0 clip-margin-space-2"
        >
          {@render branch(null)}
        </ul>
        {#if step === "stopping" && kept > 0}
          <!-- Where the unchecked rows went: one line, still true. -->
          <p
            data-slot="kept"
            class="mark-line m-0 flex items-center gap-space-1 ps-(--row-compact-gap) pe-(--row-compact-pad-end) type-meta text-pretty text-ink-muted"
            transition:unfold
          >
            <Working
              aria-hidden="true"
              class="size-icon-sm text-status-live-glyph"
            />
            {kept}
            {plural(
              kept,
              "keeps running and finishes on its own.",
              "keep running and finish on their own."
            )}
          </p>
        {/if}
      </div>
    {/if}

    <div data-slot="actions" class="flex flex-wrap justify-end gap-space-2">
      {#if step !== "off"}
        <Button
          data-stop-cancel
          label={step === "pick" ? "Cancel" : "Stop waiting"}
          onclick={oncancel}
          size="sm"
          variant="ghost"
        />
      {/if}
      <Button
        data-stop-confirm
        failed={failedCount > 0 && left === 0}
        label={confirmLabel}
        onclick={step === "pick" ? onconfirm : undefined}
        pending={step === "stopping"}
        pendingLabel="Stopping {Math.max(left, 1)}…"
        {progress}
        size="sm"
        variant={confirmLook}
      />
    </div>
  </div>
</section>
