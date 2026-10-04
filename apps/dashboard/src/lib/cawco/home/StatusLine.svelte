<script lang="ts">
  /**
   * The home's first line: is the hub there. Live and read is the quiet
   * default, and says nothing: the line is not drawn and takes no room. The
   * machines live beside Jump (MachinesButton), whose glyph says when one
   * is down. A dead hub says so with its retry clock and Reconnect: a quiet
   * fleet and an unreachable hub must never read the same.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { cawco, reconnectNow } from "../client.svelte";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { home } from "./home-state.svelte";

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
</script>

<!-- The hub's states cross-fade in place: the line that leaves is pinned
     where it stood (crossOut) while the one that arrives fades in. The last
     one, live and read, has no line: the whole block leaves the same way. -->
{#if home.status !== "connected"}
  <div class="status" role="status" out:crossOut>
    {#key home.status}
      <div class="line" in:crossIn out:crossOut>
        {#if home.status === "unreachable"}
          <span class="down">
            <IconWarningTriangle aria-hidden="true" />
            <span
              >Hub unreachable,
              {cawco.status === "connecting"
                ? "retrying now"
                : `retrying in ${retryIn}s`}</span
            >
          </span>
          <Button
            label="Reconnect"
            onclick={reconnectNow}
            pending={cawco.status === "connecting"}
            pendingLabel="Connecting…"
            size="xs"
            variant="outline"
          />
        {:else if home.status === "connecting"}
          <span>Connecting…</span>
        {:else}
          <span>Connected · reading the fleet…</span>
        {/if}
      </div>
    {/key}
  </div>
{/if}

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
