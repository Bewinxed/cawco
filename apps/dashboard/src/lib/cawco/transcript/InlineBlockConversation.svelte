<script lang="ts">
  /**
   * Fixture for the design graph: a conversation's replies drawn as a
   * transcript draws them, their named `openui` fences through the
   * transcript's own block (TranscriptBlock) over the conversation's
   * versions (inline-blocks.svelte.ts), so a block's state is the one the
   * transcript gives it: the newest under its name `latest` (or `promoted`
   * once kept), every earlier one a frozen `fossil`.
   */
  import type { ArtifactSummary } from "@cawco/core/protocol";
  import MessageBody from "../MessageBody.svelte";
  import { provideMarkdownBlocks } from "../markdown-blocks";
  import Turn from "../turn/Turn.svelte";
  import Who from "../turn/Who.svelte";
  import type { Message } from "../types";
  import {
    ConversationBlocks,
    provideInlineBlocks,
  } from "./inline-blocks.svelte";
  import TranscriptBlock from "./TranscriptBlock.svelte";

  let {
    replies,
    kept = [],
  }: {
    /** The agent's replies, oldest first. */
    replies: string[];
    /** The artifacts its blocks were kept as, by slug and title. */
    kept?: { slug: string; title: string }[];
  } = $props();

  /** Its own session: each story's replies are a conversation of their own. */
  const uid = $props.id();
  const session = `inline-block-story-${uid}`;
  const messages = $derived(
    replies.map((content, at): Message => ({
      id: `reply-${at}`,
      instanceId: session,
      type: "assistant",
      content,
      timestamp: new Date(Date.UTC(2026, 10, 11, 14, at)).toISOString(),
    }))
  );
  provideInlineBlocks(
    new ConversationBlocks(
      () => ({ instanceId: session, messages, streaming: "" }),
      (slug) => {
        const one = kept.find((each) => each.slug === slug);
        return one
          ? ({
              id: `artifact-${slug}`,
              kind: "page",
              name: slug,
              title: one.title,
            } as ArtifactSummary)
          : undefined;
      }
    )
  );
  provideMarkdownBlocks(TranscriptBlock);
</script>

<div
  data-slot="transcript"
  class="tx-columns min-h-0 ps-space-7 pe-space-6 pt-space-2 pb-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
>
  {#each messages as message (message.id)}
    <Turn>
      <Who name="Claude" timestamp={message.timestamp} />
      <MessageBody at={message.id} source={message.content} />
    </Turn>
  {/each}
</div>
