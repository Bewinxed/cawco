<script lang="ts">
  /**
   * The home's first line: is the hub there, what machines, what today has
   * cost. A machine with something wrong is named in it, glyph and word
   * ("MacBook unreachable"), and opens the Machines sheet. A dead hub says
   * so with its retry clock and Reconnect: a quiet fleet and an unreachable
   * hub must never read the same.
   */
  import { Button } from "$lib/components/ui/button";
  import { IconServer, IconWarningTriangle } from "$lib/icons";
  import { reconnectNow, whiffle } from "../client.svelte";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { home } from "./home.svelte";
  import MachinesSheet from "./MachinesSheet.svelte";

  let sheetOpen = $state(false);
  function openSheet(): void {
    sheetOpen = true;
  }

  /** The retry countdown is a clock, not a frame: a quarter second is never seen stuck. */
  let now = $state(Date.now());
  $effect(() => {
    if (whiffle.status === "connected") {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(timer);
  });
  const retryIn = $derived(
    whiffle.retryAt ? Math.max(0, Math.ceil((whiffle.retryAt - now) / 1000)) : 0
  );

  /** Which line is up; each change cross-fades. */
  const phase = $derived.by(() => {
    if (whiffle.hub !== "connected") {
      return whiffle.hub;
    }
    return home.ready ? "connected" : "reading";
  });

  const machines = $derived(whiffle.machines.length);
  const spend = $derived(`$${home.spend.toFixed(2)} today`);
</script>

<!-- The hub's three states cross-fade in place: the line that leaves is
     pinned where it stood (crossOut) while the one that arrives fades in. -->
<div class="status" role="status">
  {#key phase}
    <div class="line" in:crossIn out:crossOut>
      {#if phase === 'unreachable'}
        <span class="down">
          <IconWarningTriangle aria-hidden="true" />
          <span
            >Hub unreachable,
            {whiffle.status === 'connecting' ? 'retrying now' : `retrying in ${retryIn}s`}</span
          >
        </span>
        <Button
          label="Reconnect"
          onclick={reconnectNow}
          pending={whiffle.status === 'connecting'}
          pendingLabel="Connecting…"
          size="xs"
          variant="outline"
        />
      {:else if phase === 'connecting'}
        <span>Connecting…</span>
      {:else if phase === 'reading'}
        <!-- Connected, but machines and spend are not counted until the
             fleet is read: "0 machines" would be a claim. -->
        <span>Connected · reading the fleet…</span>
      {:else}
        <span>Connected</span>
        <span aria-hidden="true">·</span>
        <button class="link" onclick={openSheet} type="button">
          <IconServer aria-hidden="true" />
          <span class="num">{machines}</span>
          machine{machines === 1 ? '' : 's'}
        </button>
        {#each home.exceptions as exception (exception.machineId)}
          <span class="exception-item" data-flip>
            <span aria-hidden="true">·</span>
            <button class="link exception" onclick={openSheet} type="button">
              <IconWarningTriangle aria-hidden="true" />
              {exception.text}
            </button>
          </span>
        {/each}
        <span aria-hidden="true">·</span>
        <span class="num">{spend}</span>
      {/if}
    </div>
  {/key}
</div>

<MachinesSheet bind:open={sheetOpen} />

<style>
  .status {
    position: relative;
    min-height: 28px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .line,
  .exception-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }
  .line {
    min-height: 28px;
  }
  .status :global(svg) {
    width: 12px;
    height: 12px;
    flex: none;
  }
  .down {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--status-fail-ink);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-1);
    margin: -2px calc(-1 * var(--space-1));
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transition: var(--transition-control);
  }
  @media (hover: hover) and (pointer: fine) {
    .link:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  /* A machine fault is not "needs you": strong ink, the warning hue on its glyph. */
  .exception {
    color: var(--ink-strong);
  }
  .exception :global(svg) {
    color: var(--warning);
  }
</style>
