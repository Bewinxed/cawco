<script lang="ts">
  /**
   * Option A, a glyph and a dot (Linear, GitHub, Campsite): today's inline
   * chip (ui/chip `inline`) with the kind as a distinct Solar duotone glyph
   * in its 18px mark slot. The slot is a filled identity tile only for a
   * session, a project and a machine; every other kind is its bare glyph in
   * the label's `ink-strong` (ChipMark). A pin keeps its own pill
   * (PinMark), a plan says its k/n before its label. The state is the house
   * status dot on the mark's top-right corner, its motion as well as its
   * colour; where the glyph is the state (a to-do's box, a step's circle, a
   * picked card's check, a dropped task's minus) the glyph swaps instead.
   * The state word is in the chip's name and its peek's head.
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
    IconHourglass,
    IconMinusCircle,
    IconPauseCircle,
    IconSuccess,
    IconTodoBox,
    IconTodoDone,
    IconWindow,
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
  import { CHIP_GROUND } from "./shell";

  let { open = false, ...chip }: ChipSpec & { open?: boolean } = $props();

  const state = $derived(stateOf(chip));
  const role = $derived(roleOf(chip.kind, state));
  const tile = $derived(`var(--mark-${chip.hue ?? 1})`);

  /** The artifact kinds' glyphs, as ArtifactReference draws them. */
  const ARTIFACT: Partial<Record<ChipSpec["kind"], Component>> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    sheet: IconArtifactSheet,
    browser: IconGlobe,
  };

  /**
   * The dot a kind's state puts on its mark. Finished draws none, as on the
   * house tree mark ("Idle and finished: nothing"); a kind whose glyph can
   * say its state swaps it instead. Live breathes, needs you echoes, failed
   * stands still (ChipDot), so no two dots differ by colour alone.
   */
  const dot = $derived.by((): DotTone | null => {
    switch (chip.kind) {
      case "machine":
        return state === "off" ? "off" : "online";
      case "plan":
        return state === "working" ? "live" : null;
      case "session":
      case "task":
      case "routine":
        return role === "done" ? null : role;
      case "pin":
      case "decision":
      case "page":
      case "canvas":
      case "preview":
      case "sheet":
      case "browser":
      case "todo":
      case "step":
      case "project":
        return null;
    }
  });

  const Sprite = $derived(sessionSprite(chip.seed ?? chip.label));
  const Artifact = $derived(ARTIFACT[chip.kind]);
  const glyph = "size-icon-sm";
</script>

<span class="relative"
  ><button
    aria-expanded={open}
    aria-label={nameOf(chip)}
    class={cn(chipVariants({ variant: "inline" }), CHIP_GROUND)}
    data-chip-option="a"
    data-kind={chip.kind}
    data-state={state}
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
      <ChipMark fill={tile}><IconFolder class={glyph} /></ChipMark>
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
          {#if state === "waiting"}
            <IconHourglass class={glyph} />
          {:else if state === "dropped"}
            <IconMinusCircle class={glyph} />
          {:else if state === "done"}
            <TaskRing done={1} size="sm" total={1} />
          {:else if state === "todo"}
            <TaskRing done={0} size="sm" total={1} />
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
          {#if state === "paused"}
            <IconPauseCircle class={glyph} />
          {:else if state === "expiring"}
            <IconHourglass class={glyph} />
          {:else}
            <IconClock class={glyph} />
          {/if}
        {/if}
      </ChipMark>
    {/if}
    {#if chip.kind === "plan"}
      <span class="num flex-none self-baseline type-meta text-ink-muted"
        >{state === "done" ? chip.total : chip.number}/{chip.total}</span
      >
    {/if}
    <span data-slot="label">{chip.label}</span>
  </button>{#if open}<ChipPeek chip={{ ...chip, state }} />{/if}</span
>
