<script lang="ts" module>
  import type { Activity } from "@cawco/core/activity";

  /** One thing Caw started that still runs, as the section draws it. */
  export interface PickRow {
    /** What its turn is doing now, as the rail says it. */
    activity: Activity;
    /** Its folder: its mark's hue. */
    cwd: string;
    /** Its stop failed: the hub's words. */
    error: string | null;
    /** Its session's page. */
    href?: string;
    id: string;
    kind: "attempt" | "delegate";
    /** Its stop has landed, or is recorded for its machine's return: the ring counts it. */
    landed: boolean;
    /** Its machine's name ("obelisk"). */
    machineName: string;
    /** Its machine is away. */
    offline: boolean;
    /** The nearest row it is a delegate of; null for a top row. */
    parentId: string | null;
    /** How long its turn has run ("4m"), or how long its stop has waited ("7s"). */
    ran: string;
    /** How far its stop has got, once the confirm is pressed; null before. */
    stop: PickStop | null;
    /** Its name: an attempt's task title, else the session's. */
    title: string;
  }

  /** How far one checked row's stop has got. */
  export type PickStop = "stopping" | "stopped" | "away" | "failed";

  /** The section's step: choose what stops, the stops landing, one failed, Caw off. */
  export type PickStep = "pick" | "stopping" | "failed" | "off";
</script>

<script lang="ts">
  /**
   * Caw turned off while what his conversation started still runs: a
   * section of his settings under the switch, a hairline over it, no card
   * (CawOffTray wires it to its job in stop-work.svelte.ts). It grows in
   * place through its steps, each its own height (Family,
   * benji.org/family-values: "each subsequent tray is designed to vary in
   * height"):
   *
   * 1. Pick: every session the conversation started that still runs, each
   *    with a checkbox, all checked. One confirm stops the checked ones and
   *    turns Caw off; the unchecked ones run on, their empty box saying so.
   *    Cancel leaves Caw on. The confirm counts the checked ("Stop 5 and
   *    turn off"); with none checked it just turns him off.
   * 2. Stopping: only the checked rows stand, each turning as its machine
   *    confirms it, the ring in the confirm filling. A failed row says why
   *    and offers its own Try again; the confirm tries every failed one.
   * 3. Off: the list folds shut; what stopped, and what waits for its
   *    machine, said.
   *
   * The nesting rule (a stopped lead never leaves its delegates running):
   * checking a row checks everything under it; unchecking a row unchecks
   * everything under it and the leads above it.
   *
   * A long list stands about ten rows tall and scrolls, the house edge fade
   * (`kit-edge-fade-block`, edge-fade.css) at whichever edge has more past it.
   */
  import { cawOffWords as words } from "@cawco/core/words/caw-off";
  import { commonWords } from "@cawco/core/words/common";
  import type { HTMLAttributes } from "svelte/elements";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconCloudCross as Away,
    IconError as Failed,
    IconMoonSleep as OffGlyph,
    IconPause as Pause,
    IconStop as StopGlyph,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { ACTIVITY_LABEL, STOPPED_LABEL, STOPPING_LABEL } from "./activity";
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
    refusal = null,
    onpick,
    oncancel,
    onconfirm,
    onagain,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    class?: string;
    projectName: string;
    rows: PickRow[];
    step?: PickStep;
    /** The ids that stop; every row's at first. */
    checked?: string[];
    /** Turning him off was refused: the hub's words, in the head. */
    refusal?: string | null;
    /** A box changed: the ids now checked. */
    onpick?: (ids: string[]) => void;
    /** Cancel, Stop waiting or Close. */
    oncancel?: () => void;
    /** The confirm: turn off and stop the checked, or try the failed again. */
    onconfirm?: () => void;
    /** One failed row's Try again. */
    onagain?: (id: string) => void;
  } = $props();

  const uid = $props.id();

  /** Between the parts of a row's second line. */
  const SEP = " · ";

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

  /** The boxes now: drawn at once, and handed to the job. */
  function pick(ids: string[]): void {
    checked = ids;
    onpick?.(ids);
  }

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
    pick(rows.filter((row) => set.has(row.id)).map((row) => row.id));
  }

  const total = $derived(rows.length);
  const picked = $derived(rows.filter((row) => on.has(row.id)));
  const all = $derived(picked.length === total);
  const landed = $derived(picked.filter((row) => row.landed).length);

  /* ── What each step says ────────────────────────────────────────── */

  const title = $derived(
    step === "pick" ? words.ask(projectName) : words.off(projectName)
  );

  /** Once he is off: what stopped, and what waits for its machine. */
  const line = $derived.by(() => {
    if (step !== "off") {
      return "";
    }
    const away = picked.filter((row) => row.stop === "away");
    const machines = [...new Set(away.map((row) => row.machineName))];
    return words.done(
      picked.filter((row) => row.stop === "stopped").length,
      away.length,
      machines.length === 1 ? (machines[0] ?? null) : null
    );
  });

  const confirmLabel = $derived.by(() => {
    if (step === "failed") {
      return commonWords.tryAgain;
    }
    return picked.length === 0 ? words.turnOff : words.stop(picked.length);
  });
  const cancelLabel = $derived.by(() => {
    if (step === "stopping") {
      return words.stopWaiting;
    }
    return step === "failed" ? words.close : words.cancel;
  });
  /** The ring's share, from the press on. */
  const progress = $derived(
    step === "pick" || picked.length === 0 ? undefined : landed / picked.length
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

  function statusOf(row: PickRow) {
    if (row.stop === "stopping") {
      return { word: STOPPING_LABEL, icon: null, tone: "busy" } as const;
    }
    if (row.stop === "stopped") {
      return { word: STOPPED_LABEL, icon: Pause, tone: "quiet" } as const;
    }
    if (row.stop === "failed") {
      return { word: words.couldntStop, icon: Failed, tone: "failed" } as const;
    }
    if (row.offline || row.stop === "away") {
      return {
        word: on.has(row.id)
          ? words.stopsWhenBack(row.machineName)
          : words.away(row.machineName),
        icon: Away,
        tone: "quiet",
      } as const;
    }
    if (row.activity === "blocked") {
      return {
        word: commonWords.needsYou,
        icon: null,
        tone: "attention",
      } as const;
    }
    if (row.activity === "working") {
      return {
        word: ACTIVITY_LABEL.working,
        icon: null,
        tone: "working",
      } as const;
    }
    return { word: ACTIVITY_LABEL.idle, icon: Pause, tone: "quiet" } as const;
  }

  function markOf(row: PickRow) {
    if (step !== "pick") {
      return row.stop === "failed" ? ("fail" as const) : undefined;
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
            class="text-pretty wrap-anywhere text-ink-strong"
          >
            {#if row.href && step !== "pick"}
              <a
                class="text-inherit no-underline hover:underline hover:underline-offset-3"
                href={row.href}>{row.title}</a
              >
            {:else}
              {row.title}
            {/if}
          </span>
          <span data-slot="meta" class="type-meta text-ink-muted"
            >{#if row.kind === "attempt"}{words.task}{SEP}{/if}<span
              class={toneInk(status.tone)}
              data-stop-tray-tone={status.tone}
              ><MorphText text={status.word} /></span
            >{#if row.ran}{SEP}<span class="num">{row.ran}</span>{/if}</span
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
              aria-label={words.stopOne(row.title)}
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
      <RowFault
        again={onagain ? () => onagain(row.id) : undefined}
        end={"var(--row-compact-pad-end)"}
        indent={"calc(var(--row-compact-gap) * 2 + var(--mark-size, var(--space-5)))"}
        reason={row.stop === "failed" ? row.error : null}
      />
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
    "@container/stop-tray mt-space-1 min-w-0 border-t border-border-hairline pt-space-3 ps-(--ask-indent) pe-(--ask-end)",
    className
  )}
  data-stop-kind="caw-off"
  data-phase={step}
  transition:unfold
  {...rest}
>
  <div data-slot="body" class="grid grid-cols-1 gap-space-3">
    <div data-slot="head" class="flex min-w-0 gap-space-2">
      <!-- mark-line: the glyph stands on the title's first line. -->
      <span
        aria-hidden="true"
        data-box
        class="grid block-lh flex-none place-items-center type-label text-ink-muted"
      >
        {#key step === "off"}
          <span
            class="col-start-1 row-start-1 inline-grid"
            in:glyphIn
            out:glyphOut
          >
            {#if step === "off"}
              <OffGlyph class="size-icon-md" />
            {:else}
              <StopGlyph class="size-icon-md" />
            {/if}
          </span>
        {/key}
      </span>
      <div data-slot="words" class="grid min-w-0 flex-auto gap-space-1">
        <p
          data-slot="title"
          class="m-0 min-w-0 type-label font-medium text-balance text-ink-strong"
          id="{uid}-title"
        >
          <MorphText text={title} wrap />
        </p>
        {#if line}
          <p
            aria-live="polite"
            class="m-0 type-meta text-pretty text-ink-muted"
            transition:unfold
          >
            {line}
          </p>
        {/if}
        <RowFault reason={refusal} />
      </div>
    </div>

    {#if step !== "off" && total > 0}
      <div
        data-slot="list"
        class="-mx-(--row-compact-gap) grid min-w-0 grid-cols-1 gap-space-1"
        transition:unfold
      >
        {#if step === "pick" && total > 1}
          <!-- Its box, in the rows' column, checks or clears them all. -->
          <label
            for="{uid}-all"
            data-slot="all"
            class="mark-line flex min-h-(--row-compact-h) items-center gap-(--row-compact-gap) rounded-sm ps-(--row-compact-gap) pe-(--row-compact-pad-end) hover:bg-surface-hover"
            transition:unfold
          >
            <span data-box class="min-w-0 flex-auto type-label text-ink-strong"
              >{words.all(total)}</span
            >
            <span
              data-box
              class="grid size-icon-md flex-none place-items-center"
            >
              <Checkbox
                id="{uid}-all"
                checked={all}
                indeterminate={!all && picked.length > 0}
                onCheckedChange={(next) => {
                  pick(next ? rows.map((row) => row.id) : []);
                }}
              />
            </span>
          </label>
        {/if}
        <!-- About ten rows tall, then it scrolls, the next row peeking
             under the house edge fade. -->
        <ul
          data-slot="sessions"
          aria-label={words.list}
          class="kit-edge-fade-block m-0 flex max-h-(--list-cap) list-none flex-col gap-(--tree-gap) overflow-x-clip overflow-y-auto overscroll-contain p-0 scrollbar-thin scrollbar-thumb-border-control scrollbar-track-transparent"
          style:--list-cap={"calc(10.5 * (2lh + 2 * var(--space-1) + var(--tree-gap)))"}
        >
          {@render branch(null)}
        </ul>
      </div>
    {/if}

    {#if step !== "off"}
      <div
        data-slot="actions"
        class="flex flex-wrap justify-end gap-space-2"
        transition:unfold
      >
        <Button
          data-stop-cancel
          label={cancelLabel}
          onclick={oncancel}
          size="sm"
          variant="ghost"
        />
        <Button
          data-stop-confirm
          failed={step === "failed"}
          label={confirmLabel}
          onclick={step === "stopping" ? undefined : onconfirm}
          pending={step === "stopping"}
          pendingLabel={words.stopping(Math.max(picked.length - landed, 1))}
          {progress}
          size="sm"
          variant={step === "pick" && picked.length === 0
            ? "default"
            : "destructive"}
        />
      </div>
    {/if}
  </div>
</section>
