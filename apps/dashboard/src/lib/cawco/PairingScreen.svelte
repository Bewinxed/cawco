<script lang="ts">
  /**
   * What a browser the hub does not know sees, in place of the app, while
   * the hub requires paired devices (hub-auth.svelte.ts). In the shape of
   * the empty fleet (MachinesEmpty): Caw at 80px over a title and one line,
   * then the code, set large in a well, for the person to match on a paired
   * device (RFC 8628 §5.4: the code on both screens is what
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

<!-- literal: 100dvh -->
<main
  data-slot="pairing"
  class="flex min-h-(--page-min) flex-col items-center justify-center gap-space-4 bg-(--background) px-space-5 py-space-8"
  style:--page-min="100dvh"
>
  <!-- literal: 80px -->
  <div
    data-slot="caw-80"
    class="grid min-h-(--caw-min) place-items-center"
    style:--caw-min="80px"
  >
    <Caw next={["ready", "idle"]} size={CAW_SIZE} status="idle" />
  </div>
  <!-- literal: 34rem -->
  <div
    data-slot="body"
    class="relative w-full max-w-(--body-measure)"
    style:--body-measure="34rem"
  >
    {#key stage.kind}
      <div
        data-slot="words"
        class="flex flex-col items-center gap-space-4"
        in:crossIn
        out:crossOut
      >
        {#if stage.kind === "waiting"}
          <h1
            data-slot="title"
            class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
          >
            Pair this browser
          </h1>
          <!-- literal: 26rem -->
          <p
            class="m-0 max-w-(--line-measure) type-body text-center text-pretty text-ink-muted"
            style:--line-measure="26rem"
          >
            This hub requires paired devices. Approve this code on a paired
            device, in Needs you or Configure › Devices.
          </p>
          <p
            data-num
            data-slot="code"
            class="num m-0 rounded-well bg-surface-recess px-space-5 py-space-3 type-kpi font-(family-name:--font-mono) text-ink-stat select-all"
          >
            <span class="sr-only">Pairing code </span>{stage.userCode}
          </p>
          <p
            data-num
            data-slot="meta"
            class="num m-0 type-meta text-center text-ink-muted"
          >
            Waiting for approval… The code expires {left < 60_000
              ? "in under a minute"
              : `in ${Math.ceil(left / 60_000)} min`}.
          </p>
        {:else if stage.kind === "denied"}
          <h1
            data-slot="title"
            class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
          >
            Pairing was denied
          </h1>
          <!-- literal: 26rem -->
          <p
            class="m-0 max-w-(--line-measure) type-body text-center text-pretty text-ink-muted"
            style:--line-measure="26rem"
          >
            A paired device denied this browser. If that was a mistake, start
            again and approve the new code.
          </p>
          <Button onclick={startPairing}>Start pairing</Button>
        {:else if stage.kind === "expired"}
          <h1
            data-slot="title"
            class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
          >
            The code expired
          </h1>
          <!-- literal: 26rem -->
          <p
            class="m-0 max-w-(--line-measure) type-body text-center text-pretty text-ink-muted"
            style:--line-measure="26rem"
          >
            Nobody approved it within 10 minutes. Start again for a new code.
          </p>
          <Button onclick={startPairing}>Start pairing</Button>
        {:else if stage.kind === "failed"}
          <h1
            data-slot="title"
            class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
          >
            Pairing didn't start
          </h1>
          <ErrorText
            message={stage.message}
            title="The hub refused to start pairing"
          />
          <Button onclick={startPairing}>Start pairing</Button>
        {:else}
          <h1
            data-slot="title"
            class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
          >
            Pair this browser
          </h1>
          <!-- literal: 26rem -->
          <p
            aria-live="polite"
            class="m-0 max-w-(--line-measure) type-body text-center text-pretty text-ink-muted"
            style:--line-measure="26rem"
          >
            Asking the hub for a code…
          </p>
        {/if}
      </div>
    {/key}
  </div>
</main>
