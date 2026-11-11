<script lang="ts">
  /**
   * Fixture for the design graph: a stretch of a transcript as the session
   * pane draws it (Transcript's column padding, MessageRow's turns): the
   * person's message in its well, then the agent's reply with a block
   * (InlineBlock) between its two paragraphs, so the block is judged where
   * it lives. Its files and pages are the story's own (block-fixture.ts).
   */
  import type { ComponentProps } from "svelte";
  import MessageBody from "../MessageBody.svelte";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import { provideBlockSources } from "../views/openui/block-media";
  import { type FixturePage, fixtureSources } from "./block-fixture";
  import InlineBlock from "./InlineBlock.svelte";
  import { REPLY_FRAME } from "./reply-frame";

  let {
    asked,
    before,
    after = "",
    files = {},
    pages = [],
    ...block
  }: {
    /** The person's message the reply answers. */
    asked: string;
    /** The reply's words above the block. */
    before: string;
    /** Its words under the block. */
    after?: string;
    /** The files its block names, by the address each is served from. */
    files?: Record<string, string>;
    /** The page artifacts its conversation made. */
    pages?: FixturePage[];
  } & ComponentProps<typeof InlineBlock> = $props();
  provideBlockSources(
    fixtureSources(
      () => files,
      () => pages
    )
  );
</script>

<div
  data-slot="transcript"
  class="tx-columns min-h-0 ps-space-7 pe-space-6 pt-space-2 pb-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
>
  <Turn you>
    <Who name="You" timestamp="2026-11-11T14:02:00Z" you />
    <Well><MessageBody said source={asked} /></Well>
  </Turn>
  <Turn>
    <Who name="Claude" timestamp="2026-11-11T14:03:00Z" />
    <MessageBody source={before} streaming={block.streaming} />
    <!-- Where the reply's markdown stands its block (MessageBody, TranscriptBlock). -->
    <div class={[REPLY_FRAME, "text-size-body"]}>
      <div class="min-w-0" data-block-key="story">
        <InlineBlock {...block} />
      </div>
    </div>
    {#if after}<MessageBody source={after} />{/if}
  </Turn>
</div>
