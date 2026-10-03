<script lang="ts">
  /**
   * The home's first line: is the hub there, and what today has cost. The
   * machines live beside Jump (MachinesButton), whose glyph says when one
   * is down. A dead hub says so with its retry clock and Reconnect: a quiet
   * fleet and an unreachable hub must never read the same.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { cawco, reconnectNow } from "../client.svelte";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { money } from "../usage";
  import { home } from "./home.svelte";

  /** The retry countdown is a clock, not a frame: a quarter second is never seen stuck. */
  let now = $state(Date.now());
  $effect(() => {
    if (cawco.status === "connected") {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(timer);
  });
  const retryIn = $derived(
    cawco.retryAt ? Math.max(0, Math.ceil((cawco.retryAt - now) / 1000)) : 0
  );

  /** Which line is up; each change cross-fades. */
  const phase = $derived.by(() => {
    if (cawco.hub !== "connected") {
      return cawco.hub;
    }
    return home.ready ? "connected" : "reading";
  });

  /** The hub's figure (`cawco.spend`), the one the Usage page shows too. */
  const spend = $derived.by(() => {
    if (cawco.spend) {
      return `${money(cawco.spend.today)} today`;
    }
    return cawco.spendFailed ? "Spend not read from the hub" : "";
  });
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
            {cawco.status === 'connecting' ? 'retrying now' : `retrying in ${retryIn}s`}</span
          >
        </span>
        <Button
          label="Reconnect"
          onclick={reconnectNow}
          pending={cawco.status === 'connecting'}
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
