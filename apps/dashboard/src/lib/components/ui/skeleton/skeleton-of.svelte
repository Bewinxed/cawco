<script lang="ts" module>
  // Every piece's bones, captured at build time (`bun run bones`), registered
  // with boneyard once, before any skeleton draws.
  import "./bones/registry.js";
</script>

<script lang="ts">
  /**
   * The skeleton of a piece, taken from the piece itself (boneyard-js,
   * owner's pick 2026-11-24): where a piece waits for its data, its bones
   * stand at exactly the boxes it will draw, and its words' bones where
   * their ink stands (capitals to baseline, one per line), so lines that
   * read apart in the piece read apart in its skeleton, the wait never
   * moves anything when the piece arrives, and no hand-drawn shape drifts
   * from the piece it stands for.
   *
   * The bones are captured at build time and shipped as data (decision
   * d646f8d3, "Captured at build time"): `bun run bones` (scripts/bones.ts)
   * opens /dev/bones, where every SkeletonOf draws its `fixture`, in a
   * headless browser at each breakpoint and writes what boneyard reads to
   * `bones/` with its registry. Here boneyard draws the bones it registered
   * under `name`, at the breakpoint the window stands at; the fixture is
   * never drawn in the person's browser. A piece whose fixture changed is
   * captured again with `bun run bones`.
   *
   * The bones are the kit's Skeleton blocks: the `ui` fill (one role,
   * light and dark), pulsing on the one loop every placeholder pulses on
   * (The One Loop Rule: `--duration-loop`, `--loop-at`), still with less
   * motion. When `loading` ends they fade over --duration-base and the
   * piece stands where they stood.
   */
  import Skeleton from "boneyard-js/svelte";
  import type { Snippet } from "svelte";
  import { dur } from "#lib/platform/motion/curves.svelte.js";
  import { inStep } from "#lib/platform/motion/in-step.svelte.js";

  let {
    name,
    loading,
    fixture,
    children,
  }: {
    /** The piece, one name for every skeleton of it: its bones' name. */
    name: string;
    /** The piece's data is still coming. */
    loading: boolean;
    /** The piece drawn with mock data, drawn only for the capture. */
    fixture: Snippet;
    /** The piece itself, drawn once it has its data. */
    children?: Snippet;
  } = $props();

  const step = inStep();

  /** The fade from bones to the piece, read off the page once it runs. */
  let fade = $state(0);
  $effect(() => {
    fade = dur("--duration-base");
  });
</script>

<div class="w-full" data-slot="skeleton-of" style:--loop-at={step.delay}>
  <Skeleton
    animate="solid"
    boneClass="loops motion-safe:animate-pulse motion-safe:[animation-delay:var(--loop-at)]"
    color="var(--color-ui)"
    darkColor="var(--color-ui)"
    {fixture}
    {loading}
    {name}
    transition={fade}
  >
    {@render children?.()}
  </Skeleton>
</div>
