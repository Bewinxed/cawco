<script lang="ts">
  /**
   * A task's state line drawn (task-state-line.ts): led by its session's
   * mark (it echoes while it works, its dot pings while it asks you) or one
   * 16px mark, then the word in the label role in its status ink, then what
   * it adds, muted, clipped at the line's end (the pane says it whole).
   *
   * Its status marks are solid, never duotone (the owner's pin: "the x
   * inside the circle is unreadable"): a failure is IconFailed in the fail
   * glyph ink; a task that can't go on is IconBlocked, in the attn glyph ink
   * when it waits on you (Can't start, a file problem) and muted when it
   * waits on other tasks. A date is no status: its clock stays duotone.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import {
    IconBlocked,
    IconClock,
    IconFailed,
    IconNeedsYou,
  } from "#lib/icons.js";
  import type { StateLine } from "./task-state-line";

  let {
    line,
    title,
  }: {
    line: StateLine;
    /** Its words whole, for a hover: the line clips them. */
    title?: string;
  } = $props();

  const MARK =
    "size-icon-md flex-none text-ink-muted data-[tone=attn]:text-status-attn-glyph data-[tone=fail]:text-status-fail-glyph";
  const state = $derived(line.kind === "session" ? line.status : line.kind);
</script>

<span
  data-slot="state"
  class="group/state mark-line flex min-w-0 items-center gap-space-2 type-label text-ink-muted"
  data-start-problem={line.kind === "cant" || undefined}
  data-state={state}
  {title}
>
  {#if line.kind === "session" && line.status === "fail"}
    <IconFailed aria-hidden="true" class={MARK} data-tone="fail" />
  {:else if line.kind === "session"}
    <SessionMark id={line.session} place={line.place} status={line.status} />
  {:else if line.kind === "asks"}
    <IconNeedsYou aria-hidden="true" class={MARK} data-tone="attn" />
  {:else if line.kind === "cant" || line.kind === "problem"}
    <IconBlocked aria-hidden="true" class={MARK} data-tone="attn" />
  {:else if line.kind === "after"}
    <IconBlocked aria-hidden="true" class={MARK} />
  {:else}
    <IconClock aria-hidden="true" class={MARK} />
  {/if}
  <span
    data-slot="state-word"
    class={[
      "flex-none group-data-[state=live]/state:text-status-live-ink group-data-[state=attn]/state:text-status-attn-ink group-data-[state=cant]/state:text-status-attn-ink group-data-[state=problem]/state:text-status-attn-ink group-data-[state=asks]/state:text-status-attn-ink group-data-[state=fail]/state:text-status-fail-ink",
      line.kind === "date" && "num",
    ]}>{line.word}</span
  >
  {#if line.rest}
    <span
      data-slot="state-rest"
      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal"
      ><span aria-hidden="true">·</span> {line.rest}</span
    >
  {/if}
</span>
