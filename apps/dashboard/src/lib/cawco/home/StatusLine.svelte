<script lang="ts">
  import { commonWords } from "@cawco/core";
  /**
   * The home's first line: whether the first read of the fleet is in. Live
   * and read is the quiet default, and says nothing: the line is not drawn
   * and takes no room. The hub's connection is never said here: the
   * connection band (HubBand) is the one place it is, and while the hub is
   * away the board holds its last rows under it. The machines live beside
   * Jump (MachinesButton), whose glyph says when one is down.
   */
  import { crossOut } from "../motion/curves.svelte";
  import { home } from "./home-state.svelte";
</script>

<!-- Reading leaves the same way it came: one fade. -->
{#if home.status === "reading"}
  <div
    class="flex min-h-c-row-lead items-center type-meta text-ink-muted"
    role="status"
    out:crossOut
  >
    {commonWords.readingTheFleet}
  </div>
{/if}
