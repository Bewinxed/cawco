<script lang="ts">
  /**
   * Caw's line, the briefing's first (TOM tasks 1 and 5): his face in the
   * row's lead column, his status as glyph and word, his one sentence, and
   * the way into his conversation. A project with nothing in it yet adds
   * the one starter that fills it (DESIGN.md, The Empty Starts Work Rule):
   * Ask Caw to plan the project, with what he will do.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import cawFace from "#lib/assets/brand/cawco-icon.png";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChat, IconSparkles } from "#lib/icons.js";
  import type { Caw } from "./model";

  let {
    caw,
    starter = false,
    stale = false,
    onopen,
  }: {
    caw: Caw;
    /** Nothing in the project yet: the starter stands under his sentence. */
    starter?: boolean;
    stale?: boolean;
    onopen?: () => void;
  } = $props();

  const inkOf = {
    working: "text-status-live-ink",
    idle: "text-ink-muted",
    asks: "text-status-attn-ink",
    off: "text-ink-muted",
    unreachable: "text-status-fail-ink",
  } as const;
</script>

<!-- mark-line: Caw's face stands beside his name's line; his sentence starts under it. -->
<section
  class="flex items-start gap-space-3 rounded-lg bg-surface-raised p-space-4 ps-space-3 shadow-tile"
  aria-label={words.caw.name}
>
  <span class="grid w-c-row-lead place-items-center pt-space-row" data-box>
    <img
      alt=""
      class="size-c-mark rounded-sm"
      height="26"
      src={cawFace}
      width="26"
    />
  </span>
  <div class="flex min-w-0 flex-1 flex-col gap-space-1">
    <p class="m-0 flex flex-wrap items-baseline gap-x-space-2 gap-y-space-1">
      <span class="type-label text-ink-strong">{words.caw.name}</span>
      <span class={["type-label", inkOf[caw.status]]}>
        {words.caw.status[caw.status]}
      </span>
      {#if stale}
        <span class="type-meta text-ink-muted">· {words.staleRow}</span>
      {/if}
    </p>
    <p class="m-0 type-body text-ink-strong text-pretty">{caw.sentence}</p>
    {#if starter}
      <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
        {words.empty.starterLine}
      </p>
      <div class="mt-space-2">
        <Button
          data-icon="inline-start"
          onclick={onopen}
          size="sm"
          variant="outline"
        >
          <IconSparkles aria-hidden="true" />
          <span>{words.empty.starter}</span>
        </Button>
      </div>
    {:else}
      <div class="mt-space-2 flex">
        <Button
          data-icon="inline-start"
          onclick={onopen}
          size="sm"
          variant="outline"
        >
          <IconChat aria-hidden="true" />
          <span>{words.caw.open}</span>
        </Button>
      </div>
    {/if}
  </div>
</section>
