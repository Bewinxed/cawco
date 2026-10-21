<script lang="ts">
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
  import { Markdown } from "#lib/components/ui/markdown/index.js";

  let {
    source,
    streaming = false,
    fades = false,
    said = false,
  }: {
    source: string;
    streaming?: boolean;
    /** Mounted streaming: each chunk's words fade in as they land. */
    fades?: boolean;
    /** The person's own words: a skill they name is its chip. */
    said?: boolean;
  } = $props();
</script>

<div
  data-slot="msg"
  class="max-w-c-measure text-size-body leading-body font-normal text-ink-strong"
>
  <Markdown {fades} {said} {source} {streaming} />
</div>
