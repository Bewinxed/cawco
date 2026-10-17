<script lang="ts" module>
  export type ScanStopName = "idle" | "matched" | "nomatch";
</script>

<script lang="ts">
  /**
   * One stop of the pairing sheet's scanner: the real ScanSheet on a
   * phone's width, at rest in the stop's phase, and the control that plays
   * T9 (open, match, approve) or T10 (no match). The sheet slides in over
   * dur-panel on ease-drawer and leaves over dur-exit, as the kit's sheets
   * do. Preview only.
   */
  import { onDestroy, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import IconPlay from "~icons/solar/play-bold-duotone";
  import { dur } from "../../motion/curves.svelte";
  import ScanSheet, { type ScanPhase } from "../ScanSheet.svelte";
  import PickSwitch from "./PickSwitch.svelte";
  import { FIXTURE, picks, timeline, verification } from "./picks.svelte";

  let { stop }: { stop: ScanStopName } = $props();

  const rest = (): { code: string | null; phase: ScanPhase } => {
    switch (stop) {
      case "matched":
        return { phase: "matched", code: FIXTURE.code };
      case "nomatch":
        return { phase: "nomatch", code: FIXTURE.otherCode };
      default:
        return { phase: "idle", code: null };
    }
  };
  let phase = $state<ScanPhase>(untrack(rest).phase);
  let code = $state<string | null>(untrack(rest).code);
  let open = $state(true);
  let shake = $state(0);
  let run = $state(0);

  const seen = $derived(
    stop === "nomatch"
      ? verification(FIXTURE.otherHub, FIXTURE.otherCode)
      : verification(FIXTURE.hub, FIXTURE.code)
  );

  const steps = timeline();
  onDestroy(steps.stop);

  /** How long a code takes to land in all six cells, by how it arrives. */
  const landed = () =>
    picks.arrive === "reel"
      ? dur("--dur-settle") + 5 * dur("--dur-ghost")
      : dur("--dur-pop") + 5 * dur("--dur-stagger");

  /** Back at rest, the sheet open, a beat after a storyboard ends. */
  function backToRest(): void {
    steps.after(dur("--dur-hold"), () => {
      ({ phase, code } = rest());
      open = true;
      run += 1;
    });
  }

  /** Approved: the done wave and the check are held, then the sheet goes. */
  function approve(): void {
    phase = "approved";
    steps.after(dur("--dur-hold"), () => {
      open = false;
      steps.after(dur("--dur-exit"), backToRest);
    });
  }

  function deny(): void {
    open = false;
    steps.after(dur("--dur-exit"), backToRest);
  }

  /** T9: the sheet opens on the camera, the code is read, and (A) approved at once. */
  function playMatch(): void {
    steps.stop();
    phase = "idle";
    code = null;
    open = false;
    run += 1;
    steps.after(dur("--dur-exit"), () => {
      open = true;
      steps.after(dur("--dur-panel") + dur("--dur-hold"), () => {
        phase = "matched";
        ({ code } = FIXTURE);
        if (picks.scan === "approve") {
          steps.after(landed(), approve);
        }
      });
    });
  }

  /** T10: a code this hub has nothing waiting for: the tint, the shake, then the wells empty. */
  function playNoMatch(): void {
    steps.stop();
    phase = "idle";
    code = null;
    run += 1;
    steps.after(dur("--dur-hold"), () => {
      code = FIXTURE.otherCode;
      steps.after(landed(), () => {
        phase = "nomatch";
        shake += 1;
        steps.after(dur("--dur-panel") + dur("--dur-hold"), () => {
          phase = "idle";
          code = null;
          backToRest();
        });
      });
    });
  }
</script>

<div class="stop">
  {#if stop !== "idle"}
    <div class="controls">
      <Button
        icon={IconPlay}
        label={stop === "matched"
          ? "Play: open, scan and match"
          : "Play: a code that matches nothing"}
        onclick={stop === "matched" ? playMatch : playNoMatch}
        size="xs"
        variant="secondary"
      />
      {#if stop === "matched"}
        <PickSwitch
          choice="scan-does"
          onchange={(value) => {
            picks.scan = value;
          }}
          options={[
            {
              value: "approve",
              label: "A scan approves at once (recommended)",
            },
            { value: "ask", label: "A scan shows the code, then asks" },
          ]}
          question="What a scan does"
          value={picks.scan}
        />
      {/if}
    </div>
  {/if}
  <div class="phone">
    <div class="slide" data-open={open || undefined}>
      {#key run}
        <ScanSheet
          arrive={picks.arrive}
          ask={picks.scan === "ask"}
          {code}
          device={FIXTURE.device}
          onapprove={approve}
          onclose={deny}
          ondeny={deny}
          {phase}
          {seen}
          {shake}
        />
      {/key}
    </div>
  </div>
</div>

<style>
  .stop {
    display: grid;
    gap: var(--space-3);
    /* An iPhone's width: the app's scanner, drawn for it. */
    inline-size: 24rem;
    max-inline-size: 100%;
  }
  .controls {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }
  /* The screen the sheet rises from: it keeps the sheet's height while the
     sheet is away, so the stop never jumps. */
  .phone {
    display: grid;
    align-items: end;
    overflow: clip;
    border-radius: var(--radius-lg);
    background: var(--background);
  }
  .slide {
    opacity: 0;
    transition: opacity var(--dur-exit) var(--ease-out);
  }
  .slide[data-open] {
    opacity: 1;
    transition-duration: var(--dur-panel);
  }
  @media (prefers-reduced-motion: no-preference) {
    .slide {
      translate: 0 100%;
      transition:
        opacity var(--dur-exit) var(--ease-out),
        translate var(--dur-exit) var(--ease-out);
    }
    .slide[data-open] {
      translate: 0;
      transition:
        opacity var(--dur-panel) var(--ease-drawer),
        translate var(--dur-panel) var(--ease-drawer);
    }
  }
</style>
