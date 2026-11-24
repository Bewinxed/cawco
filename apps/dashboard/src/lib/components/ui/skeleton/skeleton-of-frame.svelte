<script lang="ts">
  /**
   * The kit's SkeletonOf in the shapes the product waits in: a list of rows
   * and a session's card, each waiting, its bones captured from the real
   * piece drawn with mock data (`bun run bones`, which draws this frame on
   * /dev/bones).
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import RowFrame from "#lib/components/ui/row/row-frame.svelte";
  import SkeletonOf from "./skeleton-of.svelte";

  let {
    piece,
  }: {
    /** What waits: a list of rows, or a session's card. */
    piece: "rows" | "card";
  } = $props();
</script>

{#snippet card()}
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
{/snippet}

{#snippet rows()}
  <RowFrame />
{/snippet}

<div class="w-sm max-w-full">
  <SkeletonOf
    fixture={piece === "rows" ? rows : card}
    loading={true}
    name={`kit-${piece}`}
  />
</div>
