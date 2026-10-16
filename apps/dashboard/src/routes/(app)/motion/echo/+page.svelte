<script lang="ts">
  /**
   * ECHO BENCH — real tree marks in one list on its echo beat
   * (motion/echo), each put through its statuses by hand or from
   * `window.__echo`, so a script can check what plays, how many times, and
   * that it rests. No fleet needed: the marks are TreeMark itself.
   */
  import { echoBeat } from "#lib/cawco/motion/echo.svelte.js";
  import TreeMark, { type MarkStatus } from "#lib/cawco/TreeMark.svelte";

  const STATUSES: MarkStatus[] = ["live", "attn", "fail", "done", "idle"];

  let marks = $state<MarkStatus[]>(["live", "attn", "idle"]);
  /** Bumped by `set` even with the same status: a re-render. */
  let renders = $state(0);

  const bench = {
    /** Row `row` takes `status` (the same one again is a re-render). */
    set(row: number, status: MarkStatus) {
      marks[row] = status;
      renders += 1;
    },
    marks: () => [...marks],
  };
  Object.assign(globalThis, { __echo: bench });
</script>

<svelte:head><title>Echo bench · CawCo</title></svelte:head>

<main>
  <ul {@attach echoBeat()}>
    {#each marks as status, row (row)}
      <li data-renders={renders} data-row={row}>
        <TreeMark fill="var(--mark-{row + 1})" {status}>
          {#snippet face()}
            <span></span>
          {/snippet}
        </TreeMark>
        <span data-slot="controls" class="controls">
          {#each STATUSES as s (s)}
            <button
              aria-pressed={status === s}
              onclick={() => bench.set(row, s)}
              type="button"
            >
              {s}
            </button>
          {/each}
        </span>
      </li>
    {/each}
  </ul>
  <!-- A working mark in no beat: it never echoes, and stands still on its
       live dot. -->
  <p class="mark-line" data-unbeaten>
    <TreeMark fill="var(--mark-8)" status="live">
      {#snippet face()}
        <span></span>
      {/snippet}
    </TreeMark>
    <span>no beat</span>
  </p>
</main>

<style>
  main {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: var(--space-7);
    background: var(--surface-recess);
    color: var(--ink-muted);
    font: var(--type-body);
  }
  ul {
    display: grid;
    gap: var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li,
  [data-unbeaten] {
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }
  .controls {
    display: flex;
    gap: var(--space-2);
  }
</style>
