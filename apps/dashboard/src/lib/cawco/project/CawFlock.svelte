<script lang="ts">
  /**
   * Caw's rests on a project's board before it is set up (SetupScene's
   * floor; decision page `onboarding-design`, card `board-before`, option
   * `scene`): a few of his approved stills (CawFace: asleep, nodding off,
   * ready, done) standing about the board's foot, pictures around the one
   * live Caw, who is his seat or his panel's setup element. No Rive runs for
   * them and nothing moves.
   *
   * Each stands in a place of his own, a share of the floor's width, so a
   * later walk or peck (his rig, once the person approves it) can take each
   * from where he stands without moving the layout. Decoration: a screen
   * reader does not hear it.
   */
  import type { CawFile } from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";

  let {
    count = 4,
  }: {
    /** How many stand on the floor (fewer on a narrow board). */
    count?: number;
  } = $props();

  /** His rests, each where it stands on the floor and its size. */
  const RESTS: { status: CawFile; at: string; size: number }[] = [
    { status: "sleeping", at: "10%", size: 56 },
    { status: "idle", at: "36%", size: 64 },
    { status: "ready", at: "63%", size: 48 },
    { status: "done", at: "88%", size: 56 },
  ];
  const shown = $derived(
    count >= RESTS.length ? RESTS : [RESTS[0], RESTS[2]].slice(0, count)
  );
</script>

<div class="relative h-full w-full" data-slot="flock">
  {#each shown as rest (rest.status)}
    <div
      class="absolute bottom-space-4 left-(--at) -translate-x-1/2"
      data-slot="rest"
      style:--at={rest.at}
    >
      <CawFace size={rest.size} status={rest.status} />
    </div>
  {/each}
</div>
