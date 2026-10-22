<script lang="ts">
  /**
   * Option B, the kind is a word (GitHub, Plain, Linear, Tana, Slack): a
   * caps-role keycap (`--type-caps`, 500 11px, tabular) at the chip's start,
   * `space-1` in, then a `space-1` gap and the label. The state is the
   * keycap's tint: with no state, bare `ink-muted` words; with one, the
   * status pair's fill and ink, the mark's 18px tall, `radius-xs`, `space-1`
   * each side. The keycap never clips; the label clips at the chip's
   * maximum width. A session keeps its tile and dot (Option A's). The state
   * word is in the chip's name and in its peek's head.
   */
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconLock, IconPauseCircle, IconTick } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { sessionSprite } from "../mark";
  import ChipMark from "./ChipMark.svelte";
  import ChipPeek from "./ChipPeek.svelte";
  import { type ChipSpec, nameOf, roleOf, stateOf } from "./kinds";
  import { chipOver } from "./shell";

  let { open = $bindable(false), ...chip }: ChipSpec & { open?: boolean } =
    $props();

  const panelId = $props.id();
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
      case "step":
        return `STEP ${chip.number ?? ""}`;
      case "run":
        return `RUN ${chip.number ?? ""}`;
      case "session":
      case "page":
      case "canvas":
      case "preview":
      case "sheet":
      case "site":
      case "task":
      case "routine":
      case "workflow":
      case "project":
      case "machine":
        return chip.kind.toUpperCase();
    }
  });

  /**
   * The keycap's tint: a status pair, a pin's own faces, or none. A sent
   * pin, a blocked task, a paused or scheduled routine, an online machine,
   * an idle project and every artifact stand bare.
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
      return state === "away" ? "attn" : null;
    }
    if (chip.kind === "routine") {
      return state === "ok" || state === "failed" || state === "running"
        ? role
        : null;
    }
    return role;
  });

  /** A bare keycap's own ink: a project's hue, an offline machine's grey. */
  const ink = $derived.by(() => {
    if (chip.kind === "project" && !tint) {
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
    aria-controls={panelId}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={nameOf(chip)}
    class={cn(
      chipVariants({ variant: "inline" }),
      chipOver(chip.kind === "session" ? "mark" : "keycap")
    )}
    data-chip-option="b"
    data-kind={chip.kind}
    data-state={state}
    onclick={() => {
      open = !open;
    }}
    type="button"
  >
    {#if chip.kind === "session"}
      <ChipMark dot={role} fill={`var(--mark-${chip.hue ?? 1})`}
        ><Sprite class="size-icon-sm" /></ChipMark
      >
    {:else}
      <span
        aria-hidden="true"
        class="mark-line num inline-flex h-c-inline-chip-line flex-none items-center gap-space-1 whitespace-nowrap rounded-xs type-caps text-ink-muted data-tint:px-space-1 data-[tint=live]:bg-status-live-bg data-[tint=live]:text-status-live-ink data-[tint=attn]:bg-status-attn-bg data-[tint=attn]:text-status-attn-ink data-[tint=done]:bg-status-done-bg data-[tint=done]:text-status-done-ink data-[tint=fail]:bg-status-fail-bg data-[tint=fail]:text-status-fail-ink data-[tint=resolved]:bg-surface-fill-strong data-[tint=gone]:outline-1 data-[tint=gone]:outline-dashed data-[tint=gone]:-outline-offset-1 data-[tint=gone]:outline-border-control {ink}"
        data-box
        data-slot="kind"
        data-tint={tint ?? undefined}
        style:--identity-h={chip.kind === "project"
          ? HUE_ANGLE[(chip.hue ?? 1) - 1]
          : undefined}
      >
        <span>{word}</span>
        {#if chip.kind === "task" && state === "blocked"}
          <IconLock class="size-icon-sm" />
        {:else if chip.kind === "todo" && state === "ticked"}
          <IconTick class="size-icon-sm" />
        {:else if chip.kind === "routine" && state === "paused"}
          <IconPauseCircle class="size-icon-sm" />
        {:else if chip.kind === "machine" && state === "off"}
          <span
            class="size-(--status-dot-size) rounded-pill inset-ring-(length:--status-dot-cut) inset-ring-current"
            data-box
            data-slot="ring"
          ></span>
        {/if}
      </span>
    {/if}
    <span data-slot="label">{chip.label}</span>
  </button><ChipPeek chip={{ ...chip, state }} id={panelId} {open} /></span
>
