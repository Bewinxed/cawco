<script lang="ts" module>
  export type PairingStopName =
    | "asking"
    | "waiting"
    | "last-minute"
    | "approved"
    | "denied"
    | "expired"
    | "failed";
</script>

<script lang="ts">
  /**
   * One stop of the pairing sheet: the real PairingPanel at rest in the
   * stop's stage, and the control that plays the storyboard into it (T2 to
   * T7), from the stage before it. Start pairing on an answered stop plays
   * T7 then T2, as it does on the screen. Preview only.
   */
  import { onDestroy, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import IconPlay from "~icons/solar/play-bold-duotone";
  import type { PairingStage } from "../../hub-auth.svelte";
  import { dur } from "../../motion/curves.svelte";
  import PairingPanel from "../PairingPanel.svelte";
  import PickSwitch from "./PickSwitch.svelte";
  import { FIXTURE, picks, timeline, verification } from "./picks.svelte";

  let { stop }: { stop: PairingStopName } = $props();

  const SECOND = 1000;
  /** 9:41 and 0:41 left, the sheet's two countdown stops. */
  const AT_REST = 581 * SECOND;
  const LAST_MINUTE = 41 * SECOND;

  let now = $state(Date.now());
  let code = $state<string>(FIXTURE.code);
  let leaving = $state(false);
  /** A new run mounts the panel afresh in the stage a storyboard starts from. */
  let run = $state(0);

  const waiting = (left: number): PairingStage => ({
    kind: "waiting",
    verificationUriComplete: verification(FIXTURE.hub, code),
    userCode: code,
    expiresAt: now + left,
  });

  function rest(): PairingStage {
    switch (stop) {
      case "asking":
        return { kind: "asking" };
      case "waiting":
        return waiting(AT_REST);
      case "last-minute":
        return waiting(LAST_MINUTE);
      case "failed":
        return {
          kind: "failed",
          message:
            "Pairing is off on this hub. Turn it on in Configure › Devices.",
        };
      default:
        return { kind: stop, verificationUriComplete: verification(FIXTURE.hub, code), userCode: code };
    }
  }
  let stage = $state<PairingStage>(untrack(rest));

  /* The clock runs a second at a time while a code waits, except on the
     last-minute stop, which holds at 0:41 until played. A code that has run
     out (0:00 shown) expires on the next second, as the hub's poll answers. */
  let ticking = $state(untrack(() => stop !== "last-minute"));
  $effect(() => {
    if (stage.kind !== "waiting" || !ticking) {
      return;
    }
    const timer = setInterval(() => {
      now += SECOND;
      if (stage.kind === "waiting" && now > stage.expiresAt) {
        stage = { kind: "expired", verificationUriComplete: verification(FIXTURE.hub, code), userCode: code };
      }
    }, SECOND);
    return () => clearInterval(timer);
  });

  const steps = timeline();
  onDestroy(steps.stop);

  /** Mounts the panel afresh in `from`, then plays into the rest of it. */
  function replay(from: PairingStage, then: () => void): void {
    steps.stop();
    leaving = false;
    ({ code } = FIXTURE);
    stage = from;
    run += 1;
    steps.after(dur("--dur-hold"), then);
  }

  const PLAY: Partial<
    Record<PairingStopName, { label: string; play: () => void }>
  > = {
    waiting: {
      label: "Play: the code arrives",
      play: () =>
        replay({ kind: "asking" }, () => {
          stage = waiting(AT_REST);
        }),
    },
    "last-minute": {
      label: "Play: one tick into the last minute",
      play: () => {
        ticking = false;
        replay(waiting(60 * SECOND), () => {
          now += SECOND;
        });
      },
    },
    approved: {
      label: "Play: approved",
      play: () => {
        playing = true;
        replay(waiting(AT_REST), () => {
          stage = { kind: "approved", verificationUriComplete: verification(FIXTURE.hub, code), userCode: code };
        });
      },
    },
    denied: {
      label: "Play: denied",
      play: () =>
        replay(waiting(AT_REST), () => {
          stage = { kind: "denied", verificationUriComplete: verification(FIXTURE.hub, code), userCode: code };
        }),
    },
    expired: {
      label: "Play: the code runs out",
      play: () => {
        ticking = true;
        replay(waiting(3 * SECOND), () => undefined);
      },
    },
  };
  const control = $derived(PLAY[stop]);

  /** Approved and held: the screen leaves, then the stop comes back at rest. */
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

  /** Start pairing (T7): the hub is asked again, and a new code arrives (T2). */
  function start(): void {
    steps.stop();
    steps.after(dur("--dur-morph"), () => {
      stage = { kind: "asking" };
      steps.after(dur("--dur-hold"), () => {
        code = FIXTURE.nextCode;
        ticking = true;
        stage = waiting(AT_REST);
      });
    });
  }

  const payload = $derived(verification(FIXTURE.hub, code));
</script>

<div class="stop">
  {#if control || stop === "waiting"}
    <div class="controls">
      {#if control}
        <Button
          icon={IconPlay}
          label={control.label}
          onclick={control.play}
          size="xs"
          variant="secondary"
        />
      {/if}
      {#if stop === "waiting"}
        <PickSwitch
          choice="code-letters"
          onchange={(value) => {
            picks.arrive = value;
          }}
          options={[
            { value: "pop", label: "Code letters pop in (recommended)" },
            { value: "reel", label: "Code letters spin into place" },
          ]}
          question="How the code's letters arrive"
          value={picks.arrive}
        />
      {/if}
    </div>
  {/if}
  {#key run}
    <PairingPanel
      arrive={picks.arrive}
      {leaving}
      {now}
      onchangehub={() => undefined}
      onheld={playing ? held : undefined}
      onstart={start}
      {payload}
      {stage}
    />
  {/key}
</div>

<style>
  /* A phone's column of the screen: the panel's own width, never the
     viewport's height. */
  .stop {
    display: grid;
    gap: var(--space-3);
    inline-size: 34rem;
    max-inline-size: 100%;
  }
  .stop > :global([data-slot="pairing"]) {
    min-block-size: auto;
    padding-block: var(--space-6);
    border-radius: var(--radius-lg);
  }
  .controls {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }
</style>
