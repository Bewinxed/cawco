<script lang="ts">
  import { planWords } from "@cawco/core/words/plan";
  /**
   * The plan read in its own order (direction "In order"): one list of its
   * tasks as the session ordered them, each a row (PlanTaskRow) with the
   * mark of the session on it at its end, so where each task stands and who
   * holds it read down two columns. The finished tasks at the plan's head
   * fold to one row ("4 done"), and the untouched tail past the next few to
   * another ("12 more to do"); each opens in place. Nothing regroups: a
   * task that changes state changes its glyph and stays where it was.
   */
  import { SvelteSet } from "svelte/reactivity";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import PlanFoldRow from "./PlanFoldRow.svelte";
  import PlanTaskRow from "./PlanTaskRow.svelte";
  import { doneHead, type PlanRow } from "./plan-view";

  let {
    rows,
    onwaiting,
  }: {
    rows: PlanRow[];
    /** Opens the list of what waits on the person. */
    onwaiting: () => void;
  } = $props();

  /** How many untouched tasks show after the last one moving or held before the rest fold. */
  const NEXT_SHOWN = 3;

  const opened = new SvelteSet<string>();
  let doneOpen = $state(false);
  let laterOpen = $state(false);

  const head = $derived(doneHead(rows));
  /** Where the untouched tail starts: after the last task that is not untouched. */
  const tail = $derived(
    rows.findLastIndex((row) => row.state !== "future") + 1
  );
  /** Where the later fold starts, when the tail is long enough to fold. */
  const fold = $derived(
    rows.length - Math.max(tail, head) > NEXT_SHOWN + 1
      ? Math.max(tail, head) + NEXT_SHOWN
      : rows.length
  );
  const shown = $derived([
    ...(doneOpen ? rows.slice(0, head) : []),
    ...rows.slice(head, laterOpen ? rows.length : fold),
  ]);

  const toggle = (handle: string) => {
    if (opened.has(handle)) {
      opened.delete(handle);
    } else {
      opened.add(handle);
    }
  };
</script>

<ul class="flex flex-col" {@attach reflow()}>
  {#if head > 0}
    <PlanFoldRow
      onpress={() => {
        doneOpen = !doneOpen;
      }}
      open={doneOpen}
      state="done"
      who
      words={planWords.doneFold(head)}
    />
  {/if}
  {#each shown as row (row.handle)}
    <PlanTaskRow
      {onwaiting}
      ontoggle={() => toggle(row.handle)}
      open={opened.has(row.handle)}
      {row}
    />
  {/each}
  {#if fold < rows.length && !laterOpen}
    <PlanFoldRow
      onpress={() => {
        laterOpen = true;
      }}
      open={false}
      state="future"
      who
      words={planWords.laterFold(rows.length - fold)}
    />
  {/if}
</ul>
