<script lang="ts" module>
  /** Where a part of the line leads: a place, narrowed to its waits. */
  export type NeedsTarget =
    "tasks" | "decisions" | "routines" | "session" | "spend";
</script>

<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * The needs-you line under the row, on every place: every wait across
   * kinds as counts, each a link into its place narrowed to those waits
   * (Tasks › Needs you, Decisions › Waits on you, Routines › Proposed, the
   * session's own page, Spend). Drawn only while something waits; while the
   * hub is not live it claims nothing and says since when it is stale.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { type Read, waitsOf } from "./derive";
  import type { ProjectRecords } from "./records";

  let {
    records,
    read,
    onfollow,
  }: {
    records: ProjectRecords;
    read: Read;
    onfollow: (target: NeedsTarget) => void;
  } = $props();

  const waits = $derived(waitsOf(records));

  const parts = $derived(
    [
      waits.tasks > 0 && {
        target: "tasks" as const,
        said: words.needsTasks(waits.tasks),
      },
      waits.decisions > 0 && {
        target: "decisions" as const,
        said: words.needsDecisions(waits.decisions),
      },
      waits.actions > 0 && {
        target: "routines" as const,
        said: words.needsActions(waits.actions),
      },
      waits.asks > 0 && {
        target: "session" as const,
        said: words.needsSessionAsks(waits.asks),
      },
      waits.cap && { target: "spend" as const, said: words.needsCap },
    ].filter((part) => part !== false)
  );
</script>

{#if read === "stale"}
  <p
    class="mark-line flex min-h-c-btn-h-sm items-center type-meta text-ink-muted"
    role="status"
  >
    {words.staleSince(records.lastGood)}
  </p>
{:else if read === "live" && waits.any}
  <p
    class="mark-line flex min-h-c-btn-h-sm flex-wrap items-center gap-x-space-2 gap-y-space-1 type-label"
    role="status"
  >
    <span
      aria-hidden="true"
      class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
      data-box
    ></span>
    <span class="text-status-attn-ink">{words.needsYou}</span>
    {#each parts as part, index (part.target)}
      {#if index > 0}<span aria-hidden="true" class="text-ink-subtle">·</span
        >{/if}
      <Button
        data-box
        onclick={() => onfollow(part.target)}
        pad="none"
        size="xs"
        variant="link"
      >
        <span class="num">{part.said}</span>
      </Button>
    {/each}
  </p>
{/if}
