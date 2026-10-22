<script lang="ts">
  /**
   * Option A, glyph, number, dot (Linear, GitHub, Campsite): the kind is a
   * distinct 12px Solar duotone glyph in the 18px mark slot. The slot is a
   * filled identity tile only for a session, a project and a machine; every
   * other kind is its bare glyph in `ink-muted`. A numbered kind carries its
   * number by the mark. The state is the house status dot on the mark's
   * top-right corner; where the glyph is the state (a to-do's box, a plan's
   * ring, a step's circle) the glyph swaps instead. The state word is in the
   * chip's name and in its peek's head.
   */
  import type { Component } from "svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconClock,
    IconDecisions,
    IconDot,
    IconFolder,
    IconGlobe,
    IconHook,
    IconHourglass,
    IconLock,
    IconMinusCircle,
    IconPauseCircle,
    IconSuccess,
    IconTodoBox,
    IconTodoDone,
    IconWindow,
    IconWorkflow,
    IconWorking,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { sessionSprite } from "../mark";
  import OsMark from "../OsMark.svelte";
  import PinMark from "../preview/PinMark.svelte";
  import TaskRing from "../TaskRing.svelte";
  import type { DotTone } from "./ChipDot.svelte";
  import ChipMark from "./ChipMark.svelte";
  import ChipPeek from "./ChipPeek.svelte";
  import { type ChipSpec, nameOf, roleOf, stateOf } from "./kinds";
  import { chipOver } from "./shell";

  let { open = $bindable(false), ...chip }: ChipSpec & { open?: boolean } =
    $props();

  const panelId = $props.id();
  const state = $derived(stateOf(chip));
  const role = $derived(roleOf(chip.kind, state));
  const tile = $derived(`var(--mark-${chip.hue ?? 1})`);

  /** The artifact kinds' glyphs, as Files and Go to draw them. */
  const ARTIFACT: Partial<Record<ChipSpec["kind"], Component>> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    sheet: IconArtifactSheet,
    site: IconGlobe,
  };

  /** The dot a kind's state puts on its mark. */
  const dot = $derived.by((): DotTone | null => {
    switch (chip.kind) {
      case "machine":
        return state === "away" || state === "off" ? state : "online";
      case "todo":
      case "step":
        return null;
      case "plan":
        return state === "working" ? "live" : null;
      case "task":
        return state === "done" ? null : role;
      case "decision":
        return role === "attn" ? "attn" : null;
      case "pin":
      case "page":
      case "canvas":
      case "preview":
      case "sheet":
      case "site":
        return null;
      case "session":
      case "project":
      case "routine":
      case "workflow":
      case "run":
        return role;
    }
  });

  const routineGlyph = $derived.by((): Component => {
    if (state === "paused") {
      return IconPauseCircle;
    }
    if (state === "expiring") {
      return IconHourglass;
    }
    if (state === "never-run") {
      return IconMinusCircle;
    }
    return state === "event" || chip.trigger === "event" ? IconHook : IconClock;
  });

  const Sprite = $derived(sessionSprite(chip.seed ?? chip.label));
  const Artifact = $derived(ARTIFACT[chip.kind]);
  const Routine = $derived(routineGlyph);
  const glyph = "size-icon-sm";
</script>

<span class="relative"
  ><button
    aria-controls={panelId}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={nameOf(chip)}
    class={cn(chipVariants({ variant: "inline" }), chipOver("mark"))}
    data-chip-option="a"
    data-kind={chip.kind}
    data-state={state}
    onclick={() => {
      open = !open;
    }}
    type="button"
  >
    {#if chip.kind === "pin"}
      <!-- PinMark rings its pill and its dot in surface-raised, its ground on a
           page; on the chip that ring is drawn in the chip's own ground, so it
           reads as a cut and leaves no pale band, and the dot stands in the
           pill's corner, inside the chip and clear of the label. -->
      <span
        class="inline-flex flex-none *:ring-(color:--chip-ground) **:data-dot:end-0 **:data-dot:top-0 **:data-dot:ring-(color:--chip-ground)"
        data-box
        data-slot="mark"
      >
        <PinMark
          dot={state === "unread" ? "unread" : null}
          gone={state === "gone"}
          number={chip.number ?? null}
          size="inline"
          state={state === "resolved" ? "resolved" : "sent"}
        />
      </span>
    {:else if chip.kind === "session"}
      <ChipMark {dot} fill={tile}><Sprite class={glyph} /></ChipMark>
    {:else if chip.kind === "project"}
      <ChipMark {dot} fill={tile}><IconFolder class={glyph} /></ChipMark>
    {:else if chip.kind === "machine"}
      <ChipMark {dot} fill={state === "off" ? "var(--machine-offline)" : tile}
        ><OsMark class={glyph} os={chip.os ?? ""} /></ChipMark
      >
    {:else}
      <ChipMark {dot}>
        {#if Artifact}
          <Artifact class={glyph} />
        {:else if chip.kind === "decision"}
          {#if state === "picked"}
            <IconSuccess class="{glyph} text-status-done-glyph" />
          {:else}
            <IconDecisions class={glyph} />
          {/if}
        {:else if chip.kind === "task"}
          {#if state === "blocked"}
            <IconLock class={glyph} />
          {:else if state === "done"}
            <TaskRing done={1} size="sm" total={1} />
          {:else}
            <TaskRing indeterminate size="sm" />
          {/if}
        {:else if chip.kind === "todo"}
          {#if state === "ticked"}
            <IconTodoDone class="{glyph} text-status-done-glyph" />
          {:else}
            <IconTodoBox class={glyph} />
          {/if}
        {:else if chip.kind === "plan"}
          <TaskRing
            done={state === "done" ? (chip.total ?? 1) : (chip.number ?? 0)}
            size="sm"
            total={chip.total ?? 1}
          />
        {:else if chip.kind === "step"}
          {#if state === "done"}
            <IconSuccess class="{glyph} text-status-done-glyph" />
          {:else if state === "in-progress"}
            <IconWorking
              class="{glyph} text-status-live-glyph motion-safe:animate-breath"
            />
          {:else}
            <IconDot class={glyph} />
          {/if}
        {:else if chip.kind === "routine"}
          <Routine class={glyph} />
        {:else}
          <IconWorkflow
            class="{glyph} {state === 'running'
              ? 'motion-safe:animate-breath'
              : ''}"
          />
        {/if}
      </ChipMark>
    {/if}
    {#if chip.kind === "plan"}
      <span class="num flex-none self-baseline type-meta text-ink-muted"
        >{state === "done" ? chip.total : chip.number}/{chip.total}</span
      >
    {:else if chip.kind === "run"}
      <span class="num flex-none self-baseline type-caps text-ink-muted"
        >#{chip.number}</span
      >
    {:else if chip.kind === "step"}
      <span class="num flex-none self-baseline type-caps text-ink-muted"
        >{chip.number}</span
      >
    {/if}
    <span data-slot="label"
      >{chip.kind === "plan" ? `Plan · ${chip.label}` : chip.label}</span
    >
  </button><ChipPeek chip={{ ...chip, state }} id={panelId} {open} /></span
>
