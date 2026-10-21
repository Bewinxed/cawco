<!--
  One comment's thread (comment-design §6), in the rail or as a card beside
  its pin (pick 1).
  - Head: in the rail Back, the marker and the element's name, Resolve and
    ⋯; as a card the same with Close in Back's place.
  - The chain in meta, one line, then ‹ 3 / 12 › (rail only).
  - The thread: the transcript's own turns (Turn, Who, Well), unchanged.
  - Foot: the reply field and Reply, Reply off while the field is empty.
-->
<script lang="ts">
  import Turn from "$kit/cawco/turn/Turn.svelte";
  import TurnWell from "$kit/cawco/turn/Well.svelte";
  import Who from "$kit/cawco/turn/Who.svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import { Textarea } from "$kit/components/ui/textarea/index.js";
  import {
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconClose,
    IconMore,
  } from "$kit/icons.js";
  import { AGENT, THREAD } from "../data";
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
    <span class="min-w-0 flex-1 truncate type-label text-ink-strong">Save</span>
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
      >on Form › Actions › Save</span
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
          <Who name="You" timestamp={entry.at} you />
          <TurnWell><p class="type-body text-ink-strong">{entry.text}</p></TurnWell>
        </Turn>
      {:else}
        <Turn>
          <Who name={AGENT} timestamp={entry.at} />
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
  <div
    class={[
      "flex flex-none flex-col gap-space-2",
      as === "rail" ? "border-t border-border-hairline p-space-3" : "pt-space-2",
    ]}
  >
    <Textarea placeholder="Reply" rows={1} />
    <div class="flex justify-end">
      <Button disabled size="sm">Reply</Button>
    </div>
  </div>
</div>
