<script lang="ts" module>
  export type PairingStopName =
    | "asking"
    | "waiting"
    | "last-minute"
    | "checking"
    | "approved"
    | "denied"
    | "expired"
    | "failed";
</script>

<script lang="ts">
  /**
   * One stop of the pairing sheet: the real PairingPanel at rest in the
   * stop's state, and the control that plays the moment into it from the
   * state before. A take is picked on the decision page. Preview only.
   */
  import { onDestroy, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import IconPlay from "~icons/solar/play-bold-duotone";
  import { dur } from "../../motion/curves.svelte";
  import PairingPanel, {
    type ApprovedTake,
    type ExpiredTake,
    type PanelStage,
  } from "../PairingPanel.svelte";
  import type { QrWait } from "../PairingQr.svelte";
  import { FIXTURE, timeline, verification } from "./fixture";

  let {
    stop,
    wait = "ping",
    approved = "swallow",
    expired = "park",
    screen = false,
  }: {
    stop: PairingStopName;
    wait?: QrWait;
    approved?: ApprovedTake;
    expired?: ExpiredTake;
    /** The whole screen, as the browser shows it: the panel's own 100dvh column, its own top inset. */
    screen?: boolean;
  } = $props();

  const SECOND = 1000;
  /** 9:41 and 0:41 left. */
  const AT_REST = 581 * SECOND;
  const LAST = 41 * SECOND;

  let now = $state(Date.now());
  let code = $state<string>(FIXTURE.code);
  let leaving = $state(false);
  /** A new run mounts the panel afresh in the state a moment starts from. */
  let run = $state(0);

  const live = (left: number) => ({
    userCode: code,
    verificationUriComplete: verification(FIXTURE.hub, code),
    expiresAt: now + left,
  });
  const ended = (kind: "approved" | "denied" | "expired"): PanelStage => ({
    kind,
    userCode: code,
    verificationUriComplete: verification(FIXTURE.hub, code),
  });
  const FAILED: PanelStage = {
    kind: "failed",
    message:
      "This hub trusts its network, so there is nothing to pair: every device on it reaches the fleet.",
    status: 409,
  };

  function rest(): PanelStage {
    switch (stop) {
      case "asking":
        return { kind: "asking" };
      case "waiting":
        return { kind: "waiting", ...live(AT_REST) };
      case "last-minute":
        return { kind: "waiting", ...live(LAST) };
      case "checking":
        return { kind: "checking", ...live(AT_REST) };
      case "failed":
        return FAILED;
      case "expired":
        // A fresh code by itself: where that take comes to rest is a new code waiting.
        if (expired === "refresh") {
          code = FIXTURE.nextCode;
          return { kind: "waiting", ...live(AT_REST) };
        }
        return ended(stop);
      default:
        return ended(stop);
    }
  }
  let stage = $state<PanelStage>(untrack(rest));

  /* The clock runs a second at a time while a code waits, except on the
     last-minute stop, which holds at 0:41 until played. */
  let ticking = $state(untrack(() => stop !== "last-minute"));
  $effect(() => {
    if (stage.kind !== "waiting" || !ticking) {
      return;
    }
    const timer = setInterval(() => {
      now += SECOND;
      if (stage.kind === "waiting" && now > stage.expiresAt) {
        stage = ended("expired");
      }
    }, SECOND);
    return () => clearInterval(timer);
  });

  const steps = timeline();
  onDestroy(steps.stop);

  /** Mounts the panel afresh in `from`, then plays into the rest of it. */
  function replay(from: PanelStage, then: () => void): void {
    steps.stop();
    leaving = false;
    ({ code } = FIXTURE);
    stage = from;
    run += 1;
    steps.after(dur("--dur-hold"), then);
  }

  const waiting = () => ({ kind: "waiting" as const, ...live(AT_REST) });
  const checking = () => ({ kind: "checking" as const, ...live(AT_REST) });
  const PLAY: Partial<
    Record<PairingStopName, { label: string; play: () => void }>
  > = {
    waiting: {
      label: "Play: the key arrives",
      play: () =>
        replay({ kind: "asking" }, () => {
          stage = waiting();
        }),
    },
    "last-minute": {
      label: "Play: into the last minute",
      play: () => {
        ticking = false;
        replay({ kind: "waiting", ...live(61 * SECOND) }, () => {
          now += 2 * SECOND;
        });
      },
    },
    checking: {
      label: "Play: the phone scans it",
      play: () =>
        replay(waiting(), () => {
          stage = checking();
        }),
    },
    approved: {
      label: "Play: approved",
      play: () => {
        playing = true;
        replay(checking(), () => {
          stage = ended("approved");
        });
      },
    },
    denied: {
      label: "Play: denied",
      play: () =>
        replay(checking(), () => {
          stage = ended("denied");
        }),
    },
    expired: {
      label: "Play: the code runs out",
      play: () => {
        ticking = true;
        replay({ kind: "waiting", ...live(3 * SECOND) }, () => undefined);
      },
    },
    failed: {
      label: "Play: the hub refuses",
      play: () =>
        replay({ kind: "asking" }, () => {
          stage = FAILED;
        }),
    },
  };
  const control = $derived(PLAY[stop]);

  /** Approved: the dashboard opens; the stop comes back at rest after. */
  let playing = $state(false);
  function held(): void {
    leaving = true;
    steps.after(dur("--dur-fade") + dur("--dur-hold"), () => {
      playing = false;
      leaving = false;
      stage = rest();
      run += 1;
    });
  }

  /** Start again, New code, Try again, or the fresh code's own start. */
  function start(): void {
    steps.stop();
    stage = { kind: "asking" };
    steps.after(dur("--dur-hold"), () => {
      code = FIXTURE.nextCode;
      ticking = true;
      stage = waiting();
    });
  }

  const payload = $derived(verification(FIXTURE.hub, code));
</script>

<div class="stop" data-screen={screen || undefined}>
  {#if control}
    <div class="controls">
      <Button
        icon={IconPlay}
        label={control.label}
        onclick={control.play}
        size="xs"
        variant="secondary"
      />
    </div>
  {/if}
  {#key run}
    <PairingPanel
      {approved}
      {expired}
      {leaving}
      {now}
      onheld={playing ? held : undefined}
      onstart={start}
      {payload}
      {stage}
      {wait}
    />
  {/key}
</div>

<style>
  /* A phone's column of the screen: the panel's own width, never the
     viewport's height; on `screen`, the whole screen as the browser has it. */
  .stop {
    display: grid;
    gap: var(--space-3);
    inline-size: 34rem;
    max-inline-size: 100%;
  }
  .stop[data-screen] {
    inline-size: 100%;
  }
  .stop:not([data-screen]) > :global([data-slot="pairing"]) {
    min-block-size: auto;
    padding-block: var(--space-6);
    border-radius: var(--radius-lg);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
</style>
