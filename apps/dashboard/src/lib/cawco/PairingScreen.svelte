<script lang="ts">
  import { detach } from "@cawco/core/detach";
  /**
   * What a browser the hub does not know sees, in place of the app, while
   * the hub requires paired devices (hub-auth.svelte.ts). In the shape of
   * the empty fleet (MachinesEmpty): Caw at 80px over a title and one line,
   * then the code, set large in a well, for the person to match on a paired
   * device (RFC 8628 §5.4: the code on both screens is what
   * tells this browser's ask apart from anyone else's).
   *
   * It asks for a code as it opens, unless this tab already holds one still
   * valid (a reload): that code is shown again and polled, never replaced
   * (hub-auth.svelte.ts `resumePairing`). Approved, the page reloads as this
   * device; denied or expired, it says so, through a reload too, and offers
   * to start again.
   */
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import ErrorText from "./ErrorText.svelte";
  import Caw from "./home/Caw.svelte";
  import { clock } from "./home/home-state.svelte";
  import { hubAuth, resumePairing, startPairing } from "./hub-auth.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";

  /** Caw's side, as on the empty fleet. */
  const CAW_SIZE = 80;

  onMount(() => {
    if (hubAuth.pairing.kind === "idle" && !resumePairing()) {
      detach(startPairing(), "startPairing");
    }
  });

  const stage = $derived(hubAuth.pairing);
  const left = $derived(
    stage.kind === "waiting" ? Math.max(0, stage.expiresAt - clock.now) : 0
  );
</script>

<main
  data-slot="pairing"
  class="flex min-h-dvh flex-col items-center justify-center gap-space-4 bg-surface-page px-space-5 py-space-8"
>
  <div
    data-slot="caw-80"
    class="grid min-h-(--caw-size) place-items-center"
    style:--caw-size="{CAW_SIZE}px"
  >
    <Caw next={["ready", "idle"]} size={CAW_SIZE} status="idle" />
  </div>
  <div data-slot="body" class="relative w-full max-w-c-page-column-w">
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
          <p
            class="m-0 max-w-c-page-line type-body text-center text-pretty text-ink-muted"
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
            class="num mark-line m-0 flex items-start justify-center gap-space-2 type-meta text-center text-pretty text-ink-muted"
          >
            <span class="mark-cell"><LiveDot /></span><span
              >Waiting for approval… The code expires {left < 60_000
                ? "in under a minute"
                : `in ${Math.ceil(left / 60_000)} min`}.</span
            >
          </p>
        {:else if stage.kind === "denied"}
          <h1
            data-slot="title"
            class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
          >
            Pairing was denied
          </h1>
          <p
            class="m-0 max-w-c-page-line type-body text-center text-pretty text-ink-muted"
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
          <p
            class="m-0 max-w-c-page-line type-body text-center text-pretty text-ink-muted"
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
          <p
            aria-live="polite"
            class="mark-line m-0 flex max-w-c-page-line items-start justify-center gap-space-2 type-body text-center text-pretty text-ink-muted"
          >
            <span class="mark-cell"><LiveDot /></span><span
              >Asking the hub for a code…</span
            >
          </p>
        {/if}
      </div>
    {/key}
  </div>
</main>
