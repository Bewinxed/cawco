<script lang="ts">
  /**
   * A parent's count of what is folded under it (tree.ts), and the switch
   * that opens and folds it: flush with the row's trailing edge, so every
   * count in a list stands in one column at the edge. On a one-line row
   * (the projects list) the row's time stands just before it; on a two-line
   * row (the home's) it stands under the time. Folded, what is under the row is
   * this number and nothing else; open, it hangs under the row on its
   * nesting rail (app.css .kit-nest, motion/branch). Failures among them are
   * said beside the count in their own ink.
   *
   * It sits inside the row's own link, so it is a button by role: a
   * <button> cannot nest in an <a>. Its click is its own and never the
   * link's: the row opens the session, the count opens the rows under it.
   * On a row that is itself the switch (a project's), it is `passive`: the
   * same chip, saying the count, and the row takes the click.
   */
  import type { HTMLAttributes } from "svelte/elements";

  let {
    count,
    failed = 0,
    open,
    ontoggle,
    compact = false,
    noun = "delegate",
    passive = false,
    ...rest
  }: {
    /**
     * On a one-line row (the projects list), where the title shares the
     * line: a failure count beside the count without its word.
     */
    compact?: boolean;
    /** What is folded under the parent, at every depth. */
    count: number;
    /** How many of them failed. */
    failed?: number;
    /** What one of them is, for its name ("3 delegates"). */
    noun?: string;
    open: boolean;
    ontoggle?: () => void;
    /** The row itself is the switch: this only says the count. */
    passive?: boolean;
  } & Omit<HTMLAttributes<HTMLSpanElement>, "role"> = $props();

  const label = $derived(
    `${count} ${noun}${count === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`
  );

  function toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    ontoggle?.();
  }
</script>

{#if passive}
  <span {...rest} class="count num" data-open={open || undefined}>
    <span>{count}</span>
    {#if failed}
      <span class="failed">· {failed}{compact ? "" : " failed"}</span>
    {/if}
  </span>
{:else}
  <!-- biome-ignore lint/a11y/useSemanticElements: it sits inside the row's link, and a <button> cannot nest in an <a>. -->
  <span
    {...rest}
    aria-expanded={open}
    aria-label={open ? `Hide ${label}` : `Show ${label}`}
    class="count num pressable focus-inset pointer-hit touch-hit"
    data-open={open || undefined}
    onclick={toggle}
    onkeydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        toggle(event);
      }
    }}
    role="button"
    tabindex="0"
  >
    <span>{count}</span>
    {#if failed}
      <span class="failed">· {failed}{compact ? "" : " failed"}</span>
    {/if}
  </span>
{/if}

<style>
  /* A plain filled chip: a step stronger under the pointer and while its
     rows are open, the press every compact control takes (.pressable). It
     never yields or truncates: a row's title gives up its room first. */
  .count {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    block-size: var(--space-5);
    min-inline-size: var(--space-5);
    padding-inline: var(--space-1);
    overflow: visible;
    border-radius: var(--radius-xs);
    background: var(--surface-fill);
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-toggle) var(--ease-out);
  }
  [role="button"].count {
    cursor: pointer;
  }
  .count[data-open] {
    background: var(--surface-fill-strong);
    color: var(--ink-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    [role="button"].count:hover {
      background: var(--surface-fill-strong);
      color: var(--ink-strong);
    }
  }
  .failed {
    color: var(--status-fail-ink);
  }
</style>
