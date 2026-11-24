<script lang="ts" module>
  import type { snapshotBones } from "boneyard-js";

  type Bones = ReturnType<typeof snapshotBones>;

  /**
   * Bones measured, by piece and width: every skeleton of one piece at one
   * width shares one measure, taken the first time it waits.
   */
  const measured = new Map<string, Bones>();
</script>

<script lang="ts">
  /**
   * The skeleton of a piece, taken from the piece itself (boneyard-js,
   * owner's pick 2026-11-24): where a piece waits for its data, its bones
   * stand at exactly the boxes it will draw, so the wait never moves
   * anything when the piece arrives, and no hand-drawn shape drifts from the
   * piece it stands for.
   *
   * `fixture` is the piece drawn with mock data shaped like the product's.
   * It mounts once, unseen and out of the reading order, at this skeleton's
   * width; boneyard reads every box it draws (`snapshotBones`) and the
   * fixture goes. Its bones are kept by `name` and width, so the next
   * skeleton of the piece at that width measures nothing. A width it has
   * not seen is measured again.
   *
   * The bones are the kit's Skeleton blocks: the `ui` fill (one role,
   * light and dark), pulsing on the one loop every placeholder pulses on
   * (The One Loop Rule: `--duration-loop`, `--loop-at`), still with less
   * motion. When `loading` ends they fade over --duration-base and the
   * piece stands where they stood.
   */
  import { snapshotBones as snapshot } from "boneyard-js";
  import Skeleton from "boneyard-js/svelte";
  import type { Snippet } from "svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { dur } from "#lib/platform/motion/curves.svelte.js";
  import { inStep } from "#lib/platform/motion/in-step.svelte.js";

  let {
    name,
    loading,
    fixture,
    children,
  }: {
    /** The piece, one name for every skeleton of it. */
    name: string;
    /** The piece's data is still coming. */
    loading: boolean;
    /** The piece drawn with mock data, measured for its bones. */
    fixture: Snippet;
    /** The piece itself, drawn once it has its data. */
    children?: Snippet;
  } = $props();

  let width = $state(0);
  const key = $derived(`${name}@${width}`);
  let bones = $state<Bones | undefined>();
  $effect(() => {
    bones = measured.get(key);
  });

  const size = frameSize(
    (node: HTMLElement) => Math.round(node.getBoundingClientRect().width),
    (value) => {
      width = value;
    }
  );

  /** Reads the fixture's boxes once it has drawn, and keeps them. */
  const measure = (node: HTMLElement) => {
    const at = key;
    const frame = requestAnimationFrame(() => {
      const taken = snapshot(node, name);
      measured.set(at, taken);
      if (at === key) {
        bones = taken;
      }
    });
    return () => cancelAnimationFrame(frame);
  };

  const step = inStep();

  /** The fade from bones to the piece, read off the page once it runs. */
  let fade = $state(0);
  $effect(() => {
    fade = dur("--duration-base");
  });
</script>

<div
  class="relative w-full"
  data-slot="skeleton-of"
  style:--loop-at={step.delay}
  {@attach size}
>
  {#if loading && width > 0 && !bones}
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 opacity-0"
      inert
    >
      {#key key}
        <div {@attach measure}>{@render fixture()}</div>
      {/key}
    </div>
  {/if}
  <Skeleton
    animate="solid"
    boneClass="loops motion-safe:animate-pulse motion-safe:[animation-delay:var(--loop-at)]"
    color="var(--color-ui)"
    darkColor="var(--color-ui)"
    initialBones={bones}
    {loading}
    {name}
    transition={fade}
  >
    {@render children?.()}
  </Skeleton>
</div>
