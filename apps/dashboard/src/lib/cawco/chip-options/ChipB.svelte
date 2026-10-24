<script lang="ts">
  /**
   * Option B, the kind as a word (GitHub, Plain, Linear, Tana, Slack):
   * today's inline chip (ui/chip `inline`) led by a caps-role keycap
   * (`type-caps`, tabular) naming its kind, `space-1` in, then the chip's gap
   * and the label. The state is the keycap's tint: at rest, bare `ink-muted`
   * words (DESIGN.md, The Idle Has No Fill Rule); live, needs you and failed,
   * the status pair's fill and ink, the mark's line tall, `radius-xs`,
   * `space-1` each side; a task not started, an outline in the keycap's own
   * ink; done, a tick after the word; waiting, dropped and paused, their
   * glyph after it. A machine's keycap carries its presence dot, a
   * project's its identity ink. The keycap never clips; the label clips at
   * the chip's maximum width. A session keeps its tile and dot (Option A's).
   * The state word is in the chip's name and its peek's head.
   */
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import {
    IconHourglass,
    IconMinusCircle,
    IconPauseCircle,
    IconTick,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { sessionSprite } from "../mark";
  import ChipMark from "./ChipMark.svelte";
  import ChipPeek from "./ChipPeek.svelte";
  import { type ChipSpec, nameOf, roleOf, stateOf } from "./kinds";
  import { CHIP_GROUND } from "./shell";

  let { open = false, ...chip }: ChipSpec & { open?: boolean } = $props();

  const state = $derived(stateOf(chip));
  const role = $derived(roleOf(chip.kind, state));

  /** The mark hues' angles (tokens.css `--mark-1`…`--mark-8`), for a project's `identity-ink`. */
  const HUE_ANGLE = [27.9, 47.4, 86.8, 121.2, 186.7, 251.4, 292.5, 349.8];

  /** The keycap's words. */
  const word = $derived.by(() => {
    switch (chip.kind) {
      case "pin":
        return `PIN ${chip.number ?? ""}`;
      case "decision":
        return "CARD";
      case "todo":
        return "TO-DO";
      case "plan":
        return `PLAN ${state === "done" ? chip.total : chip.number}/${chip.total}`;
      case "session":
      case "page":
      case "canvas":
      case "preview":
      case "sheet":
      case "browser":
      case "task":
      case "step":
      case "routine":
      case "project":
      case "machine":
        return chip.kind.toUpperCase();
    }
  });

  /**
   * The keycap's tint: a status pair for what moves or asks (live, needs
   * you, failed), a pin's own faces, an outline in the keycap's ink for a
   * task not started, or none. Done is no fill but a tick in
   * `status-done-glyph`, so finished work stays quiet and a line of done
   * chips is not a row of one olive. Rest stands bare: a sent pin, a
   * waiting or dropped task, a paused routine, a project, a machine (its
   * presence is its dot) and every artifact.
   */
  const tint = $derived.by(() => {
    if (chip.kind === "pin") {
      if (state === "resolved") {
        return "resolved";
      }
      if (state === "gone") {
        return "gone";
      }
      return state === "unread" ? "attn" : null;
    }
    if (chip.kind === "machine") {
      return null;
    }
    if (chip.kind === "task" && state === "todo") {
      return "pending";
    }
    return role === "done" ? null : role;
  });

  /** A machine's presence dot: the machine row's (DESIGN.md, Machine row). */
  const PRESENCE: Record<string, string> = {
    online: "bg-presence-online",
    off: "inset-ring-(length:--status-dot-cut) inset-ring-presence-off",
  };

  /** A bare keycap's own ink: a project's hue, an offline machine's grey. */
  const ink = $derived.by(() => {
    if (chip.kind === "project") {
      return "identity-ink";
    }
    return chip.kind === "machine" && state === "off"
      ? "text-machine-offline"
      : "";
  });

  const Sprite = $derived(sessionSprite(chip.seed ?? chip.label));
</script>

<span class="relative"
  ><button
    aria-expanded={open}
    aria-label={nameOf(chip)}
    class={cn(
      chipVariants({ variant: "inline" }),
      CHIP_GROUND,
      chip.kind === "session" ? "" : "ps-space-1"
    )}
    data-chip-option="b"
    data-kind={chip.kind}
    data-state={state}
    type="button"
  >
    {#if chip.kind === "session"}
      <ChipMark
        dot={role === "done" ? null : role}
        fill={`var(--mark-${chip.hue ?? 1})`}
        ><Sprite class="size-icon-sm" /></ChipMark
      >
    {:else}
      <span
        aria-hidden="true"
        class="mark-line num inline-flex h-c-inline-chip-line flex-none items-center gap-space-1 whitespace-nowrap rounded-xs type-caps text-ink-muted data-tint:px-space-1 data-[tint=live]:bg-status-live-bg data-[tint=live]:text-status-live-ink data-[tint=attn]:bg-status-attn-bg data-[tint=attn]:text-status-attn-ink data-[tint=fail]:bg-status-fail-bg data-[tint=fail]:text-status-fail-ink data-[tint=resolved]:bg-surface-fill-strong data-[tint=pending]:outline-1 data-[tint=pending]:-outline-offset-1 data-[tint=pending]:outline-current data-[tint=gone]:outline-1 data-[tint=gone]:outline-dashed data-[tint=gone]:-outline-offset-1 data-[tint=gone]:outline-current {ink}"
        data-box
        data-slot="kind"
        data-tint={tint ?? undefined}
        style:--identity-h={chip.kind === "project"
          ? HUE_ANGLE[(chip.hue ?? 1) - 1]
          : undefined}
      >
        <span>{word}</span>
        {#if chip.kind === "task" && state === "waiting"}
          <IconHourglass class="size-icon-sm" />
        {:else if chip.kind === "task" && state === "dropped"}
          <IconMinusCircle class="size-icon-sm" />
        {:else if role === "done" && chip.kind !== "pin"}
          <IconTick class="size-icon-sm text-status-done-glyph" />
        {:else if chip.kind === "routine" && state === "paused"}
          <IconPauseCircle class="size-icon-sm" />
        {:else if chip.kind === "machine"}
          <span
            class="size-(--status-dot-size) flex-none rounded-pill {PRESENCE[
              state
            ]}"
            data-box
            data-slot="presence"
          ></span>
        {/if}
      </span>
    {/if}
    <span data-slot="label">{chip.label}</span>
  </button>{#if open}<ChipPeek chip={{ ...chip, state }} />{/if}</span
>
