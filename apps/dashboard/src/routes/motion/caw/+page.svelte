<script lang="ts">
  /**
   * CAW BENCH — the real `Caw`, put through his statuses on a schedule.
   *
   * Where Caw stands in the app depends on the fleet: an empty one, a wait,
   * a hub out of reach. Judging how he comes in, changes and leaves there
   * means arranging the fleet first, and nothing about his clips needs it.
   *
   * So this route mounts `Caw` itself, with the same props the home and the
   * detail area give him, and is driven from `window.__caw`, so a script can
   * sequence a scenario and record what was drawn. The controls below are
   * the same primitives for driving it by hand.
   */
  import Caw, { type CawStatus } from "#lib/cawco/home/Caw.svelte";

  const STATUSES: CawStatus[] = [
    "loading",
    "reconnecting",
    "needs-you",
    "ready",
    "sleeping",
  ];

  let status = $state<CawStatus>("loading");
  let present = $state(true);
  /** Bumped by `mount` so a scenario starts from a Caw that was never there. */
  let generation = $state(0);
  let mounted = $state(false);
  /** What he has reported, in order, with when (performance.now). */
  let log = $state<{ what: string; at: number }[]>([]);

  const note = (what: string) => {
    log = [...log, { what, at: Math.round(performance.now()) }];
  };

  const bench = {
    /** Puts a fresh Caw on the page at `first`: he comes in by his enter. */
    mount(first: CawStatus) {
      log = [];
      status = first;
      present = true;
      generation += 1;
      mounted = true;
      note(`mount ${first}`);
    },
    /** A status change: he leaves by his still and arrives by the clip. */
    change(next: CawStatus) {
      status = next;
      note(`change ${next}`);
    },
    /** The place is done with him: his exit, then `gone`. */
    leave() {
      present = false;
      note("leave");
    },
    log: () => log,
  };
  Object.assign(globalThis, { __caw: bench });
</script>

<main>
  <div class="stage">
    {#if mounted}
      {#key generation}
        <Caw
          next={STATUSES}
          onentered={() => note("entered")}
          ongone={() => {
            note("gone");
            mounted = false;
          }}
          {present}
          size={160}
          {status}
        />
      {/key}
    {/if}
  </div>
  <div class="controls">
    {#each STATUSES as s (s)}
      <button
        onclick={() => (mounted ? bench.change(s) : bench.mount(s))}
        type="button"
      >
        {s}
      </button>
    {/each}
    <button onclick={bench.leave} type="button">leave</button>
  </div>
  <ol>
    {#each log as entry, k (k)}
      <li>{entry.at} ms: {entry.what}</li>
    {/each}
  </ol>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-7);
    background: var(--surface-recess);
    color: var(--ink-muted);
    font: var(--type-body);
    min-height: 100vh;
  }
  .stage {
    display: grid;
    place-items: center;
    width: 320px;
    height: 320px;
  }
  .controls {
    display: flex;
    gap: var(--space-2);
  }
</style>
