<script lang="ts">
  /**
   * The home's first line: is the hub there, and what today has cost. The
   * machines live beside Jump (MachinesButton), whose glyph says when one
   * is down. A dead hub says so with its retry clock and Reconnect: a quiet
   * fleet and an unreachable hub must never read the same.
   */
  import { Button } from "$lib/components/ui/button";
  import { IconWarningTriangle } from "$lib/icons";
  import { reconnectNow, whiffle } from "../client.svelte";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { home } from "./home.svelte";

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
        <!-- Connected, but spend is not counted until the fleet is read. -->
        <span>Connected · reading the fleet…</span>
      {:else}
        <!-- Live is the quiet default; only what it cost is news. -->
        <span class="num">{spend}</span>
      {/if}
    </div>
  {/key}
</div>

<style>
  .status {
    position: relative;
    min-height: 28px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
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
</style>
