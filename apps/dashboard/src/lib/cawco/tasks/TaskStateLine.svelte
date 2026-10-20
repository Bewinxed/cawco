<script lang="ts">
  /**
   * PROPOSED: a task's state line drawn: led by the session's 18px tree
   * mark (it echoes while it works) or a 16px mark, then the word in the
   * label role in its status ink, then what it adds, muted, clipped at the
   * line's end (the pane says it whole).
   *
   * Its status marks are solid Solar bold, never duotone (the failure-mark
   * ruling, DESIGN.md's Solar icons line): a failure is `danger-circle` in
   * the fail pair; a task that cannot go on is `forbidden-circle`, in the
   * attn pair when it waits on you (Can't start) and muted when it waits on
   * other tasks. A date is no status: its clock stays duotone.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  // Each glyph straight from Solar, as TreeMark takes its own: the icon
  // registry is one module of every glyph, too heavy for a line's three.
  import IconClock from "~icons/solar/clock-circle-bold-duotone";
  import IconFailed from "~icons/solar/danger-circle-bold";
  import IconBlocked from "~icons/solar/forbidden-circle-bold";
  import type { StateLine } from "./task-state-line";

  let {
    line,
    bare = false,
  }: {
    line: StateLine;
    /** Its mark stands elsewhere on the row (the run order's lead). */
    bare?: boolean;
  } = $props();

  /** A status mark: 16px, muted; attn and fail in their glyph inks. */
  const MARK =
    "size-icon-md flex-none text-ink-muted data-[tone=attn]:text-status-attn-glyph data-[tone=fail]:text-status-fail-glyph";
</script>

<!-- The word in its status ink (data-state), what it adds muted and
     clipped at the line's end. -->
<span
  data-slot="state"
  class="group/state mark-line flex min-w-0 items-center gap-space-2 type-label text-ink-muted"
  data-state={line.kind === "session" ? line.status : line.kind}
>
  {#if bare}
    <!-- The row's lead holds the mark. -->
  {:else if line.kind === "session" && line.status === "fail"}
    <IconFailed aria-hidden="true" class={MARK} data-tone="fail" />
  {:else if line.kind === "session"}
    <SessionMark id={line.session} place={line.place} status={line.status} />
  {:else if line.kind === "cant"}
    <IconBlocked aria-hidden="true" class={MARK} data-tone="attn" />
  {:else if line.kind === "after"}
    <IconBlocked aria-hidden="true" class={MARK} />
  {:else}
    <IconClock aria-hidden="true" class={MARK} />
  {/if}
  <span
    class={[
      "flex-none group-data-[state=live]/state:text-status-live-ink group-data-[state=attn]/state:text-status-attn-ink group-data-[state=cant]/state:text-status-attn-ink group-data-[state=fail]/state:text-status-fail-ink",
      line.kind === "date" && "mono-figure",
    ]}>{line.word}</span
  >
  {#if line.rest}
    <span
      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal"
      ><span aria-hidden="true">·</span> {line.rest}</span
    >
  {/if}
</span>
