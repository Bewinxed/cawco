<script lang="ts">
  import { planWords } from "@cawco/core/words/plan";
  /**
   * The plan read by who is on it (direction "By who"): one group for each
   * session working it, this session first and then its delegates as the
   * tray orders them, each headed by the session's mark and name and, under
   * them, what it is doing this minute (its live transcript's newest line,
   * its mark's live dot on, while it works a turn; its status word, Idle or
   * Needs you, while it works none); under that, the tasks it
   * holds, each a row (PlanTaskRow) with its to-dos folded to a count. The
   * finished tasks fold to one row over them all; the tasks no session is
   * on yet follow them in the plan's order, every held one shown and the
   * untouched ones past the first two folded to one row.
   *
   * Each group is one head row of the list with its tasks hung under its
   * name, so the sessions' names, the "Not started" heading and the done
   * fold stand on one text edge, and each group's tasks on the next.
   */
  import { SvelteSet } from "svelte/reactivity";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { sessionPlace } from "#lib/cawco/session-names.svelte.js";
  import { LeadRow } from "#lib/components/ui/lead-row/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import PlanFoldRow from "./PlanFoldRow.svelte";
  import PlanTaskRow from "./PlanTaskRow.svelte";
  import type { PlanRow, PlanWorker } from "./plan-view";

  let {
    rows,
    workers,
    onwaiting,
  }: {
    rows: PlanRow[];
    /** The sessions working the plan: this one, then its delegates in the tray's order. */
    workers: PlanWorker[];
    /** Opens the list of what waits on the person. */
    onwaiting: () => void;
  } = $props();

  const opened = new SvelteSet<string>();
  let doneOpen = $state(false);

  /** Each session with the tasks it is on; a session on none is left out. */
  const lanes = $derived(
    workers
      .map((worker) => ({
        worker,
        held: rows.filter(
          (row) => row.state === "current" && row.who?.id === worker.id
        ),
      }))
      .filter((lane) => lane.held.length > 0)
  );
  /** How many untouched tasks show under "not started" before the rest fold. */
  const NEXT_SHOWN = 2;
  let laterOpen = $state(false);

  const unheld = $derived(
    rows.filter((row) => row.state !== "done" && row.state !== "current")
  );
  /** The untouched ones past the first few, folded unless opened; a held one never folds. */
  const later = $derived(
    unheld.filter((row) => row.state === "future").slice(NEXT_SHOWN)
  );
  const unheldShown = $derived(
    laterOpen || later.length < 2
      ? unheld
      : unheld.filter((row) => !later.includes(row))
  );
  const done = $derived(rows.filter((row) => row.state === "done"));

  const toggle = (handle: string) => {
    if (opened.has(handle)) {
      opened.delete(handle);
    } else {
      opened.add(handle);
    }
  };
</script>

{#snippet tasks(list: PlanRow[])}
  <ul class="flex flex-col" {@attach reflow()}>
    {#each list as row (row.handle)}
      <PlanTaskRow
        {onwaiting}
        ontoggle={() => toggle(row.handle)}
        open={opened.has(row.handle)}
        {row}
        who={false}
      />
    {/each}
  </ul>
{/snippet}

<ul class="flex flex-col gap-space-2">
  {#if done.length > 0}
    <PlanFoldRow
      onpress={() => {
        doneOpen = !doneOpen;
      }}
      open={doneOpen}
      state="done"
      words={planWords.doneFold(done.length)}
    >
      {#snippet below()}
        {#if doneOpen}
          <div transition:unfold>{@render tasks(done)}</div>
        {/if}
      {/snippet}
    </PlanFoldRow>
  {/if}
  {#each lanes as { worker, held } (worker.id)}
    <LeadRow data-worker={worker.id} step="head">
      {#snippet mark()}
        <SessionMark
          id={worker.id}
          place={sessionPlace(worker.id)}
          status={worker.working ? "live" : "idle"}
        />
      {/snippet}
      <span
        class="block overflow-x-clip text-ellipsis whitespace-nowrap font-medium text-ink-strong"
        >{worker.self ? planWords.thisSession : worker.name}</span
      >
      <span
        class="mt-space-1 block overflow-x-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
        >{worker.working ? worker.now : worker.status}</span
      >
      {#snippet below()}
        {@render tasks(held)}
      {/snippet}
    </LeadRow>
  {/each}
  {#if unheld.length > 0}
    <LeadRow step="head">
      <span class="block font-medium text-ink-muted">{planWords.noSession}</span
      >
      {#snippet below()}
        {@render tasks(unheldShown)}
        {#if !laterOpen && later.length >= 2}
          <ul class="flex flex-col">
            <PlanFoldRow
              onpress={() => {
                laterOpen = true;
              }}
              open={false}
              state="future"
              words={planWords.laterFold(later.length)}
            />
          </ul>
        {/if}
      {/snippet}
    </LeadRow>
  {/if}
</ul>
