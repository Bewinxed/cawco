<script lang="ts">
  /**
   * What a browser the hub does not know sees, in place of the app, while
   * the hub requires paired devices (hub-auth.svelte.ts). In the shape of
   * the empty fleet (MachinesEmpty): Caw at 80px over a title and one line,
   * then the code, set large in a well, for the person to match on a paired
   * device or in Telegram (RFC 8628 §5.4: the code on both screens is what
   * tells this browser's ask apart from anyone else's).
   *
   * It asks for a code as it opens. Approved, the page reloads as this
   * device; denied or expired, it says so and offers to start again.
   */
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import ErrorText from "./ErrorText.svelte";
  import Caw from "./home/Caw.svelte";
  import { clock } from "./home/home-state.svelte";
  import { hubAuth, startPairing } from "./hub-auth.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";

  /** Caw's side, as on the empty fleet. */
  const CAW_SIZE = 80;

  onMount(() => {
    if (hubAuth.pairing.kind === "idle") {
      // biome-ignore lint/complexity/noVoid: the pairing reports its own outcome in its stage
      void startPairing();
    }
  });

  const stage = $derived(hubAuth.pairing);
  const left = $derived(
    stage.kind === "waiting" ? Math.max(0, stage.expiresAt - clock.now) : 0
  );
</script>

<main data-slot="pairing" class="pairing">
  <div data-slot="caw-80" class="caw-80">
    <Caw next={["ready", "idle"]} size={CAW_SIZE} status="idle" />
  </div>
  <div data-slot="body" class="body">
    {#key stage.kind}
      <div data-slot="words" class="words" in:crossIn out:crossOut>
        {#if stage.kind === "waiting"}
          <h1 data-slot="title" class="title">Pair this browser</h1>
          <p class="line">
            This hub requires paired devices. Approve this code on a paired
            device, in Needs you or Configure › Devices, or in Telegram.
          </p>
          <p data-num data-slot="code" class="code num">
            <span class="sr-only">Pairing code </span>{stage.userCode}
          </p>
          <p data-num data-slot="meta" class="meta num">
            Waiting for approval… The code expires {left < 60_000
              ? "in under a minute"
              : `in ${Math.ceil(left / 60_000)} min`}.
          </p>
        {:else if stage.kind === "denied"}
          <h1 data-slot="title" class="title">Pairing was denied</h1>
          <p class="line">
            A paired device denied this browser. If that was a mistake, start
            again and approve the new code.
          </p>
          <Button onclick={startPairing}>Start pairing</Button>
        {:else if stage.kind === "expired"}
          <h1 data-slot="title" class="title">The code expired</h1>
          <p class="line">
            Nobody approved it within 10 minutes. Start again for a new code.
          </p>
          <Button onclick={startPairing}>Start pairing</Button>
        {:else if stage.kind === "failed"}
          <h1 data-slot="title" class="title">Pairing didn't start</h1>
          <ErrorText
            message={stage.message}
            title="The hub refused to start pairing"
          />
          <Button onclick={startPairing}>Start pairing</Button>
        {:else}
          <h1 data-slot="title" class="title">Pair this browser</h1>
          <p aria-live="polite" class="line">Asking the hub for a code…</p>
        {/if}
      </div>
    {/key}
  </div>
</main>

<style>
  .pairing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    min-block-size: 100dvh;
    padding: var(--space-8) var(--space-5);
    background: var(--background);
  }
  .caw-80 {
    display: grid;
    place-items: center;
    min-block-size: 80px;
  }
  /* The stages share this cell: the one leaving is pinned in it (crossOut). */
  .body {
    position: relative;
    inline-size: 100%;
    max-inline-size: 34rem;
  }
  .words {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }
  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
    text-align: center;
    text-wrap: balance;
  }
  .line {
    margin: 0;
    max-inline-size: 26rem;
    font: var(--type-body);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
  }
  /* The stat well's recipe (DESIGN.md `stat-well`): the one figure here. */
  .code {
    margin: 0;
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-well);
    background: var(--surface-recess);
    font: var(--type-kpi);
    font-family: var(--font-mono);
    color: var(--ink-stat);
    user-select: all;
  }
  .meta {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: center;
  }
</style>
