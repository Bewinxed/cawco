<script lang="ts">
  import { snapshotBones } from "boneyard-js";
  /**
   * A trial of boneyard (boneyard-js, owner's ask 2026-11-24: "show me how
   * these look with boneyard instead"): the skeleton of a real piece, taken
   * from the piece itself. The piece mounts unseen at the frame's width,
   * boneyard reads every box it draws (`snapshotBones`), and its Skeleton
   * draws those boxes as bones, pulsing, where the piece will stand.
   */
  import Skeleton from "boneyard-js/svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import RowFrame from "#lib/components/ui/row/row-frame.svelte";

  let {
    piece,
    animate = "pulse",
  }: {
    /** What waits: a list of rows, or a session's card. */
    piece: "rows" | "card";
    /** How the bones move. */
    animate?: "pulse" | "shimmer" | "solid";
  } = $props();

  let bones = $state<ReturnType<typeof snapshotBones> | null>(null);

  const capture = (node: HTMLElement) => {
    const frame = requestAnimationFrame(() => {
      bones = snapshotBones(node, piece);
    });
    return () => cancelAnimationFrame(frame);
  };
</script>

<div class="relative w-sm max-w-full">
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 opacity-0"
    inert
  >
    <div {@attach capture}>
      {#if piece === "rows"}
        <RowFrame />
      {:else}
        <div
          class="flex flex-col gap-space-2 rounded-lg border border-ui bg-bg p-space-4"
        >
          <div class="flex items-center justify-between gap-space-2">
            <span class="type-label">Deploy the hub to obelisk-of-light</span>
            <Badge variant="live"><span>Working</span></Badge>
          </div>
          <p class="text-tx-2 type-body">
            Started 2 min ago by Caw on main, 3 files changed so far.
          </p>
          <div class="flex gap-space-2">
            <Button size="sm" variant="outline">Open</Button>
            <Button size="sm" variant="ghost">Stop</Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
  {#if bones}
    <Skeleton {animate} initialBones={bones} loading={true} />
  {/if}
</div>
