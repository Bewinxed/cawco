<script lang="ts">
  import Markdown from "#lib/cawco/Markdown.svelte";
  /**
   * A turn's words — plain running text at 74ch, no card, no bubble. Markdown
   * so a fenced block or a list reads as one, and the `.msg` frame carries the
   * mock's inline-code and measure.
   *
   * The type and rhythm rules (the `msg-prose` component in the theme) reach
   * into the Markdown's own DOM on purpose. Streamdown puts
   * the `prose prose-sm …` class (see `#lib/prose.js`) on its own root div, and
   * `prose-sm` declares its own font-size, line-height and per-element em
   * margins there — so anything set on `.msg` alone is inherited into that root
   * and then immediately overridden. The scale lives on the token sheet, not in
   * the typography plugin, so the root is restated here.
   */
  import { REPLY_FRAME } from "./transcript/reply-frame";

  let {
    source,
    streaming = false,
    fades = false,
    said = false,
    at,
    wrap = "stable",
  }: {
    source: string;
    streaming?: boolean;
    /** Mounted streaming: each chunk's words fade in as they land. */
    fades?: boolean;
    /** The person's own words: a skill they name is its chip, and so is every session they mention. */
    said?: boolean;
    /** The agent's reply these words are, in a transcript: its named `openui` fences are its blocks (markdown-blocks.ts). */
    at?: string;
    /**
     * How its lines break: `stable` in a transcript, whose words may still be
     * landing (no line moves as the next words come); `pretty` for words that
     * are settled (a comment's thread), no word alone on a last line.
     */
    wrap?: "stable" | "pretty";
  } = $props();
</script>

<div
  data-slot="msg"
  data-wrap={wrap === "pretty" ? "pretty" : undefined}
  class={[REPLY_FRAME, "type-body text-ink-strong"]}
>
  <Markdown blocksAt={at} {fades} {said} {source} {streaming} />
</div>
