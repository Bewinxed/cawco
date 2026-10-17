<script lang="ts">
  /**
   * The home's first line: is the hub there. Live and read is the quiet
   * default, and says nothing: the line is not drawn and takes no room. The
   * machines live beside Jump (MachinesButton), whose glyph says when one
   * is down. A dead hub says so with its retry clock and Reconnect: a quiet
   * fleet and an unreachable hub must never read the same.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
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

<!-- Down and on the way are two lines of their own, cross-faded in place;
     on the way, "Connecting…" turns into "Connected · reading the fleet…"
     as one line whose words morph (MorphText), never two sentences printed
     over each other mid-fade. Live and read has no line: the whole block
     leaves the same way. -->
{#if home.status !== "connected"}
  <!-- literal: 28px -->
  <div
    class="relative min-h-(--line-h) type-meta text-ink-muted"
    role="status"
    style:--line-h="28px"
    out:crossOut
  >
    {#key home.status === "unreachable"}
      <div
        class="flex min-h-(--line-h) flex-wrap items-center gap-x-space-2 gap-y-space-1"
        in:crossIn
        out:crossOut
      >
        {#if home.status === "unreachable"}
          <span
            data-slot="down"
            class="mark-line inline-flex items-center gap-space-1 text-status-fail-ink"
          >
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
        {:else}
          <MorphText
            text={home.status === "connecting"
              ? "Connecting…"
              : "Connected · reading the fleet…"}
          />
        {/if}
      </div>
    {/key}
  </div>
{/if}

<style>
  /* residual: foreign-dom */
  [role="status"] :global(svg) {
    width: var(--icon-sm);
    height: var(--icon-sm);
    flex: none;
  }
</style>
