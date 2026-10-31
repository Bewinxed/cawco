<script lang="ts">
  /**
   * One comment that can't be drawn, in the real Comments rail
   * (FailedComment.stories.ts): three comments as the hub keeps them, the
   * middle one's reply kept with no words, so its row throws and fails as
   * one line in its place (CommentRail's RegionBoundary per row), its
   * siblings standing.
   */
  import type { Pin } from "@cawco/core/comments";
  import CommentRail from "../../preview/CommentRail.svelte";

  let {
    width,
    height,
  }: {
    /** The window's size, as the story's frame. */
    width: number;
    height: number;
  } = $props();

  const NOW = Date.parse("2026-10-30T21:17:00Z");
  const at = (minutes: number) =>
    new Date(NOW - minutes * 60_000).toISOString();
  const pin = (
    number: number,
    title: string,
    said: string,
    reply: string | undefined
  ): Pin =>
    ({
      id: `pin-${number}`,
      number,
      kind: "comment",
      by: "person",
      at: at(40 - number),
      title,
      anchor: { selector: `#part-${number}`, source: null },
      elements: [],
      thread: [
        { id: `e-${number}-1`, by: "person", at: at(40 - number), text: said },
        { id: `e-${number}-2`, by: "agent", at: at(30 - number), text: reply },
      ],
    }) as unknown as Pin;
  /** goo-card's comments that night; the second one's reply was kept with no words. */
  const PINS: Pin[] = [
    pin(
      1,
      "Comment card",
      "The neck doubles when I scroll.",
      "Fixed: one shape draws both."
    ),
    pin(2, "Pin 2", "Can the card open from the pin?", undefined),
    pin(
      3,
      "Thread",
      "Replies should stand under the comment.",
      "They do now, oldest first."
    ),
  ];
</script>

<div
  class="flex h-(--frame-h) w-(--frame-w) min-w-0 justify-end overflow-hidden bg-surface-recess p-space-2"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
  <div
    class="flex min-h-0 w-c-comments-w max-w-full flex-col rounded-lg bg-surface-raised shadow-drawer"
  >
    <CommentRail
      down={null}
      focused={null}
      hold="ready"
      layout="beside"
      live={new Set()}
      onclose={() => undefined}
      onhover={() => undefined}
      onopen={() => undefined}
      onpage={() => undefined}
      onresolve={() => undefined}
      onretry={() => undefined}
      onretrypin={() => undefined}
      open={null}
      pins={PINS}
      unread={new Set()}
    />
  </div>
</div>
