<!--
  The Comments rail's list (comment-design §5): its 44px head (Comments;
  sort, a whole-page comment and Close as `sm` ghost glyphs), the search
  field, the Open / Resolved segmented filter with counts only above 0, then
  the rows, newest first by last activity. A row is one press: the same
  marker as on the page, "You · 2h · <element>", the words on two lines, the
  thread's last line once it has one, "Unsent" while the session hasn't heard
  it, the live dot at its end. The foot is the caller's: the Send bar while
  anything is unsent, or the composer (pick 4).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "$kit/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as InputGroup from "$kit/components/ui/input-group/index.js";
  import { IconClose, IconDocument, IconPaperclip, IconPlus, IconSearch, IconSort } from "$kit/icons.js";
  import { type Comment, screenshot } from "../data";
  import Marker from "./Marker.svelte";

  let {
    rows,
    shape = "tail",
    resolved = 12,
    selected = null,
    sentLine = false,
    mark = "count",
    foot,
  }: {
    rows: Comment[];
    shape?: "tail" | "stem";
    resolved?: number;
    selected?: number | null;
    /** Pick 3's "as written" way: a sent row says so. */
    sentLine?: boolean;
    /**
     * How a row shows what its comment carries (pick 7): `count`, "⎘ 2" at
     * the meta line's end, only above 0; `strip`, a third line of 20px
     * thumbs, four at most, then "+N".
     */
    mark?: "count" | "strip";
    foot?: Snippet;
  } = $props();

  const STRIP = 4;

  // A still of the list ends at a row's edge, never through a line: a row
  // the list's box can't hold whole is left out, with every row after it.
  let list = $state<HTMLOListElement>();
  $effect(() => {
    if (!list) { return; }
    const box = list;
    const fit = () => {
      const items = [...box.children] as HTMLElement[];
      for (const item of items) { item.hidden = false; }
      const end = box.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(box).paddingBottom);
      const from = items.findIndex((item) => item.getBoundingClientRect().bottom > end + 0.5);
      if (from >= 0) { for (const item of items.slice(from)) { item.hidden = true; } }
    };
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    document.fonts.ready.then(fit);
    return () => watch.disconnect();
  });
</script>

<div
  class="flex h-c-sheet-inspector-head-h flex-none items-center gap-space-1 ps-space-4 pe-space-2"
  data-sweep="row"
>
  <h2 class="min-w-0 flex-1 truncate type-label text-ink-strong">Comments</h2>
  <Button aria-label="Newest first" size="icon-sm" variant="ghost"
    ><IconSort /></Button
  >
  <Button aria-label="Comment on the whole page" size="icon-sm" variant="ghost"
    ><IconPlus /></Button
  >
  <Button aria-label="Close comments" size="icon-sm" variant="ghost"
    ><IconClose /></Button
  >
</div>
<div class="flex flex-none flex-col gap-space-2 px-space-3 pb-space-2">
  <InputGroup.Root>
    <InputGroup.Addon><IconSearch /></InputGroup.Addon>
    <InputGroup.Input placeholder="Search comments" />
  </InputGroup.Root>
  <Tabs size="compact" value="open" values={["open", "resolved"]}>
    <TabsList aria-label="Show">
      <TabItem label={`Open ${rows.length}`} value="open" />
      <TabItem label={`Resolved ${resolved}`} value="resolved" />
    </TabsList>
  </Tabs>
</div>
<ol
  bind:this={list}
  class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain border-t border-border-hairline px-space-2 py-space-2"
>
  {#each rows as row (row.n)}
    {@const attached = row.attachments ?? []}
    <li>
      <button
        class={[
          "flex min-h-c-artifact-row-h w-full select-none items-start gap-space-3 rounded-sm px-space-2 py-space-2 text-start can-hover:hover:bg-surface-hover",
          selected === row.n && "bg-surface-pressed",
        ]}
        data-row={row.n}
        type="button"
      >
        <span class="flex-none">
          <Marker
            dot={row.live ? "live" : null}
            n={row.n}
            state={row.state}
            tail={shape === "tail" ? "bottom-start" : "none"}
          />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex min-w-0 items-center gap-space-1 type-meta text-ink-muted">
            <span class="truncate">You · {row.age} · {row.on}</span>
            {#if mark === "count" && attached.length > 0}
              <span class="flex flex-none items-center gap-space-1" data-attach-count
                >·<IconPaperclip aria-hidden="true" class="size-icon-sm" /><span class="num"
                  >{attached.length}</span
                ><span class="sr-only">attached</span></span
              >
            {/if}
          </span>
          <span class="line-clamp-2 type-body text-ink-strong wrap-anywhere"
            >{row.words || attached.map((one) => one.name).join(", ")}</span
          >
          {#if mark === "strip" && attached.length > 0}
            <span class="flex items-center gap-space-1" data-attach-strip>
              {#each attached.slice(0, STRIP) as one, at (one.name)}
                {#if one.kind === "image"}
                  <img
                    alt={one.name}
                    class="size-icon-lg flex-none rounded-xs border border-border-hairline object-cover"
                    src={screenshot(200 + at * 40)}
                  />
                {:else}
                  <span
                    class="grid size-icon-lg flex-none place-items-center rounded-xs border border-border-hairline bg-surface-recess text-ink-muted"
                    title={one.name}><IconDocument aria-hidden="true" class="size-icon-sm" /></span
                  >
                {/if}
              {/each}
              {#if attached.length > STRIP}
                <span class="type-meta num text-ink-muted">+{attached.length - STRIP}</span>
              {/if}
            </span>
          {/if}
          {#if row.last}
            <span class="truncate type-meta text-ink-muted">{row.last}</span>
          {/if}
          {#if row.state === "unsent"}
            <span class="type-meta text-action-solid">Unsent</span>
          {:else if sentLine && row.state === "sent"}
            <span class="type-meta text-ink-muted">Sent</span>
          {/if}
        </span>
      </button>
    </li>
  {/each}
</ol>
{#if foot}
  <div class="flex-none border-t border-border-hairline p-space-3">
    {@render foot()}
  </div>
{/if}
