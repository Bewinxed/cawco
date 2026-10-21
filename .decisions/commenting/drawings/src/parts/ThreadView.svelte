<!--
  One comment's thread (comment-design §6), in the rail or as a card beside
  its pin (pick 1).
  - Head: in the rail Back, the marker and the element's name, Resolve and
    ⋯; as a card the same with Close in Back's place.
  - The chain in meta, one line: the element's parents only, the head
    already naming it (none for the whole page); then ‹ 3 / 12 › (rail
    only).
  - The thread: the transcript's own turns (Turn, Who, Well), unchanged,
    each speaker line ending in its turn's age at rest (Who `shown`); an
    entry's attachments under its words in the transcript's gallery
    (MessageRow's `chips`): a picture as `Shot size="thumb"`, a file as
    its DocThumb (attachments-design §4).
  - Foot: the chat composer as the reply (Docked; commenting addendum
    §2), no band and no card: its pill `--space-3` in from the rail's sides.
-->
<script lang="ts">
  import DocThumb from "$kit/cawco/transcript/DocThumb.svelte";
  import Shot from "$kit/cawco/transcript/Shot.svelte";
  import Turn from "$kit/cawco/turn/Turn.svelte";
  import TurnWell from "$kit/cawco/turn/Well.svelte";
  import Who from "$kit/cawco/turn/Who.svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import {
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconClose,
    IconMore,
  } from "$kit/icons.js";
  import { AGENT, screenshot, THREAD } from "../data";
  import Docked from "./Docked.svelte";
  import Marker from "./Marker.svelte";

  let {
    as = "rail",
    shape = "tail",
  }: { as?: "rail" | "card"; shape?: "tail" | "stem" } = $props();
</script>

<div class="flex min-h-0 flex-1 flex-col" data-thread={as}>
  <div
    class={[
      "flex flex-none items-center gap-space-2",
      as === "rail" ? "h-c-sheet-inspector-head-h ps-space-2 pe-space-2" : "",
    ]}
    data-sweep="row"
  >
    {#if as === "rail"}
      <Button aria-label="Back to comments" size="icon-sm" variant="ghost"
        ><IconChevronLeft /></Button
      >
    {/if}
    <Marker
      focused
      n={14}
      state="sent"
      tail={shape === "tail" ? "bottom-start" : "none"}
    />
    <span class="min-w-0 flex-1 truncate type-label text-ink-strong">Create routine</span>
    <Button aria-label="Resolve" size="icon-sm" variant="ghost"
      ><IconCheck /></Button
    >
    <Button aria-label="More" size="icon-sm" variant="ghost"><IconMore /></Button>
    {#if as === "card"}
      <Button aria-label="Close" size="icon-sm" variant="ghost"
        ><IconClose /></Button
      >
    {/if}
  </div>
  <div
    class={[
      "flex flex-none items-center gap-space-2",
      as === "rail" ? "px-space-4 pb-space-2" : "pt-space-1",
    ]}
    data-sweep="row"
  >
    <span class="min-w-0 flex-1 truncate type-meta text-ink-muted"
      >on Routine form</span
    >
    {#if as === "rail"}
      <span class="flex flex-none items-center">
        <Button aria-label="Previous comment" size="icon-xs" variant="ghost"
          ><IconChevronLeft /></Button
        >
        <span class="type-meta num text-ink-muted">3 / 12</span>
        <Button aria-label="Next comment" size="icon-xs" variant="ghost"
          ><IconChevronRight /></Button
        >
      </span>
    {/if}
  </div>
  <div
    class={[
      "min-h-0 flex-1 overflow-y-auto overscroll-contain",
      as === "rail" ? "border-t border-border-hairline px-space-4 pb-space-3" : "pb-space-2",
    ]}
  >
    {#each THREAD as entry (entry.at)}
      {#if entry.by === "you"}
        <Turn you>
          <Who name="You" shown timestamp={entry.at} you />
          <TurnWell><p class="type-body text-ink-strong">{entry.text}</p></TurnWell>
          {#if entry.attachments?.length}
            <div class="mt-space-2 flex flex-wrap items-center gap-space-2" data-gallery data-slot="chips">
              {#each entry.attachments as one (one.name)}
                {#if one.kind === "image"}
                  <Shot alt={`${one.name}, attached to comment 14`} size="thumb" src={screenshot()} />
                {:else}
                  <DocThumb href={`/api/files/${one.name}`} name={one.name} size={one.size ?? 0} />
                {/if}
              {/each}
            </div>
          {/if}
        </Turn>
      {:else}
        <Turn>
          <Who name={AGENT} shown timestamp={entry.at} />
          <p class="type-body text-ink-strong">{entry.text}</p>
          {#if entry.file}
            <p class="mt-space-1">
              <code class="rounded-xs bg-surface-recess px-space-1 type-code text-ink-muted"
                >{entry.file}</code
              >
            </p>
          {/if}
        </Turn>
      {/if}
    {/each}
  </div>
  <div class={["flex-none", as === "rail" && "px-space-3"]}>
    <Docked action="Reply" focus={false} placeholder="Reply" />
  </div>
</div>
