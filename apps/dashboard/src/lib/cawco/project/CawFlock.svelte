<script lang="ts">
  /**
   * Caw's flock on a project's board before it is set up (SetupScene's
   * floor; decision page `onboarding-design`, card `board-before`, option
   * `scene`): a few of him, drawn by his rig (caw-rig/CawRig), about the
   * board's foot. While his setup is under way (`busy`) each goes about his
   * own small round on his own seeded clock: stands, walks a few steps,
   * pecks at the ground, looks about, so no two move in step. With nothing
   * under way they stand, breathing and blinking (the rig's idle life). He
   * walks only toward his beak: a bird that reaches the end of his patch
   * turns about while he stands (a mirror over `--dur-control`), then walks
   * back.
   *
   * Decoration, never the page's live Caw (that is his seat, or his panel's
   * setup element): it says nothing to a screen reader. With reduced motion
   * none of them walks or turns; each stands on his pose. The rig's clock
   * stops off screen and in a hidden tab, and so does each round here.
   */
  import { onMount } from "svelte";
  import CawRig from "#lib/cawco/caw-rig/CawRig.svelte";
  import { seeded } from "#lib/cawco/caw-rig/motion.js";
  import { dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { msOf } from "#lib/cawco/motion/time.js";

  type Pose = "ready" | "peck" | "stepL" | "stepR";

  let {
    busy,
    count = 3,
    size = 72,
  }: {
    /** His setup is under way: the flock goes about its rounds. */
    busy: boolean;
    /** How many stand on the floor (fewer on a narrow board). */
    count?: number;
    /** Each one's still box, px. */
    size?: number;
  } = $props();

  interface Bird {
    /** How far he has walked from it, in steps. */
    at: number;
    /** Where his patch starts, a share of the floor's width. */
    home: number;
    pose: Pose;
    /** Facing his beak's way (true) or mirrored. */
    right: boolean;
  }

  /** His steps in a patch, and one step's length as a share of his size. */
  const PATCH_STEPS = 4;
  const STEP = 0.32;

  const birds = $state<Bird[]>(
    Array.from({ length: 3 }, (_, i) => ({
      home: 0.08 + i * 0.3 + seeded(i + 1) * 0.06,
      at: Math.floor(seeded(i + 11) * PATCH_STEPS),
      right: seeded(i + 21) > 0.4,
      pose: "ready" as Pose,
    }))
  );
  const shown = $derived(birds.slice(0, Math.min(count, birds.length)));

  /** The page is shown: a hidden tab runs no round. */
  let visible = $state(true);
  const live = $derived(busy && visible && motionOk.current);

  const wait = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });

  /** `--breath` in ms: his rests are breaths (DESIGN.md, The One Loop Rule). */
  const breathMs = (): number =>
    msOf(
      getComputedStyle(document.documentElement).getPropertyValue("--breath")
    );

  /** A few steps toward his beak; at the end of his patch he turns about instead. */
  async function walk(bird: Bird, roll: number, signal: AbortSignal) {
    const ahead = bird.right ? PATCH_STEPS - bird.at : bird.at;
    if (ahead === 0) {
      bird.right = !bird.right;
      await wait(dur("--dur-control") + dur("--dur-caw-blend"), signal);
      return;
    }
    const steps = 1 + Math.floor(roll * Math.min(3, ahead));
    for (let step = 0; step < steps; step += 1) {
      bird.pose = step % 2 === 0 ? "stepL" : "stepR";
      bird.at += bird.right ? 1 : -1;
      await wait(dur("--dur-caw-blend"), signal);
    }
    bird.pose = "ready";
    await wait(dur("--dur-caw-blend"), signal);
  }

  /** A peck or two at the ground before him. */
  async function peck(bird: Bird, roll: number, signal: AbortSignal) {
    const pecks = 1 + Math.floor(roll * 2);
    for (let one = 0; one < pecks; one += 1) {
      bird.pose = "peck";
      await wait(dur("--dur-caw-blend"), signal);
      bird.pose = "ready";
      await wait(dur("--dur-caw-blend"), signal);
    }
  }

  /** One bird's round, on his own seeded clock, until the flock rests. */
  async function round(bird: Bird, seed: number, signal: AbortSignal) {
    let n = seed;
    const next = () => {
      n += 1;
      return seeded(n);
    };
    const breath = breathMs();
    await wait(next() * breath, signal);
    while (!signal.aborted) {
      const roll = next();
      if (roll < 0.4) {
        await walk(bird, next(), signal);
      } else if (roll < 0.75) {
        await peck(bird, next(), signal);
      } else {
        // He stands a while: his idle life glances and blinks.
        await wait(breath * (1 + next() * 2), signal);
      }
    }
  }

  $effect(() => {
    if (!live) {
      for (const bird of birds) {
        bird.pose = "ready";
      }
      return;
    }
    const stop = new AbortController();
    for (const [i, bird] of birds.entries()) {
      round(bird, 101 + i * 37, stop.signal).catch(() => undefined);
    }
    return () => stop.abort();
  });

  onMount(() => {
    const sync = () => {
      visible = document.visibilityState === "visible";
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  });
</script>

<div class="relative h-full w-full" data-slot="flock">
  {#each shown as bird, i (i)}
    <!-- Where he stands: his patch's start, and the steps he has walked from
         it, which glide at one step a pose (--dur-caw-blend), linear as a
         steady glide is. -->
    <div
      class="absolute bottom-0 left-(--home) translate-x-(--walked) motion-safe:transition-[translate] motion-safe:duration-(--dur-caw-blend) motion-safe:ease-linear"
      data-slot="bird"
      style:--home="{bird.home * 100}%"
      style:--walked="calc({bird.at} * {STEP} * {size}px)"
    >
      <div
        class={[
          "motion-safe:transition-[scale] motion-safe:duration-(--dur-control) motion-safe:ease-out",
          !bird.right && "-scale-x-100",
        ]}
      >
        <CawRig pose={bird.pose} {size} />
      </div>
    </div>
  {/each}
</div>
