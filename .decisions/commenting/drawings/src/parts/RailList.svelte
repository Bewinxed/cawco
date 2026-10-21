<!--
  The Comments rail's list (comment-design §5): its 44px head (Comments;
  sort, a whole-page comment and Close as `sm` ghost glyphs), the search
  field, the Open / Resolved segmented filter with counts only above 0, then
  the rows, newest first by last activity. A row is one press in three lines
  (comment-rail hierarchy, The Row Dress Rule): the same marker as on the
  page, in its mark cell; line 1 the place, the element's name in label at
  500 in the row ink, what it carries and its age at the line's end in meta;
  line 2 the words in body, two lines at most; line 3 what came back, in
  meta, after its speaker's mark (the speaker line's own glyph, bare at
  12px in a box cell: the agent's ghost in the line's ink, the person's in
  the brand ink; the speaker's word for a screen reader alone): in the
  strong ink while unread, "Working on it…" while the agent is, "Unsent" in the brand ink while the session
  hasn't heard it, and nothing for a comment sent and unanswered (its filled
  pill says so). The foot is the caller's: the Send bar while anything is
  unsent, or the composer (pick 4).
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
  import {
    IconAgent,
    IconClose,
    IconDocument,
    IconPaperclip,
    IconPlus,
    IconSearch,
    IconSort,
    IconUser,
  } from "$kit/icons.js";
  import { type Comment, screenshot } from "../data";
  import Marker from "./Marker.svelte";

  let {
    rows,
    shape = "tail",
    resolved = 12,
    selected = null,
    mark = "count",
    foot,
  }: {
    rows: Comment[];
    shape?: "tail" | "stem";
    resolved?: number;
    selected?: number | null;
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
  <Button aria-label="Sort" size="icon-sm" variant="ghost"
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
          "flex min-h-c-artifact-row-h w-full items-start gap-space-3 rounded-sm px-space-2 py-space-2 text-start can-hover:hover:bg-surface-hover",
          selected === row.n && "bg-surface-pressed",
        ]}
        data-row={row.n}
        type="button"
      >
        <span class="mark-cell flex-none">
          <Marker
            dot={row.live ? "live" : null}
            n={row.n}
            state={row.state}
            tail={shape === "tail" ? "bottom-start" : "none"}
          />
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="flex min-w-0 items-baseline gap-space-2" data-line="place">
            <span class="min-w-0 truncate type-label text-ink-row">{row.on}</span>
            <span class="ms-auto flex flex-none items-center gap-space-1 type-meta num text-ink-muted">
              {#if mark === "count" && attached.length > 0}
                <IconPaperclip aria-hidden="true" class="size-icon-sm self-center" /><span
                  >{attached.length}<span class="sr-only"> attached</span></span
                ><span aria-hidden="true">·</span>
              {/if}
              <span>{row.age}</span>
            </span>
          </span>
          <span class="mt-space-row line-clamp-2 type-body text-pretty text-ink-strong wrap-anywhere" data-line="words"
            >{row.words || attached.map((one) => one.name).join(", ")}</span
          >
          {#if mark === "strip" && attached.length > 0}
            <span class="mt-space-1 flex items-center gap-space-1" data-attach-strip>
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
          {#if row.state === "unsent"}
            <span class="mt-space-1 type-meta text-brand-ink" data-line="back">Unsent</span>
          {:else if row.last}
            {@const Mark = row.last.by === "agent" ? IconAgent : IconUser}
            <span
              class={["mt-space-1 flex min-w-0 items-center gap-space-1 type-meta mark-line", row.last.unread ? "text-ink-strong" : "text-ink-muted"]}
              data-line="back"
              data-unread={row.last.unread || undefined}
              ><span class="sr-only">{row.last.by === "agent" ? "Agent: " : "You: "}</span><span
                aria-hidden="true"
                class={["grid size-icon-sm flex-none place-items-center", row.last.by === "you" && "text-brand-ink"]}
                data-box
                data-speaker={row.last.by}><Mark class="size-icon-sm" /></span
              ><span class="min-w-0 truncate">{row.last.text}</span></span
            >
          {:else if row.live}
            <span class="mt-space-1 flex min-w-0 items-center gap-space-1 type-meta text-ink-muted mark-line" data-line="back"
              ><span class="sr-only">{"Agent: "}</span><span
                aria-hidden="true"
                class="grid size-icon-sm flex-none place-items-center"
                data-box
                data-speaker="agent"><IconAgent class="size-icon-sm" /></span
              ><span class="min-w-0 truncate">Working on it…</span></span
            >
          {/if}
        </span>
      </button>
    </li>
  {/each}
</ol>
{#if foot}
  <div class="flex-none">
    {@render foot()}
  </div>
{/if}
