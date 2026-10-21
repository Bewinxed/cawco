<!--
  The artifact panel at desk width, as DESIGN.md's "Artifact panel, canvas
  and ink" draws its head, and comment-design §1 changes it: the 44px head
  (the artifact's name over its ask; Send with its count, only above 0; the
  mode, the kit's segmented control; Comments, a pressed toggle with the open
  count; Reload; Close, each the `sm` ghost), then the well holding the page,
  its edge the 2px accent in Comment mode, and the Comments rail beside it
  when Comments is pressed.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "$kit/components/ui/fluid-tabs/index.js";
  import {
    IconChat,
    IconChevronDown,
    IconClose,
    IconComment,
    IconInteract,
    IconPen,
    IconRefresh,
    IconSend,
  } from "$kit/icons.js";

  let {
    mode = "comment",
    comments = false,
    open = 3,
    send = 0,
    ask = "Pin anything that reads wrong",
    height = "560px",
    page,
    rail,
  }: {
    mode?: "interact" | "comment";
    comments?: boolean;
    open?: number;
    send?: number;
    ask?: string;
    /** The panel's height; `auto` fits it to the page and the rail, so the whole page shows. */
    height?: string;
    page: Snippet;
    rail?: Snippet;
  } = $props();
</script>

<section
  class="flex w-[760px] flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile"
  data-panel
  style:height={height}
>
  <header
    class="flex h-c-sheet-inspector-head-h flex-none items-center gap-space-2 border-b border-border-hairline px-space-3"
    data-sweep="row"
  >
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="flex min-w-0 items-center gap-space-1 type-label text-ink-strong">
        <span class="truncate">New routine</span><IconChevronDown
          class="size-icon-sm flex-none text-ink-muted"
        />
      </span>
      <span class="truncate type-meta text-ink-muted">{ask}</span>
    </div>
    {#if send > 0}
      <Button data-send size="sm" variant="ghost"
        ><IconSend /><span>Send</span><span class="num">{send}</span></Button
      >
    {/if}
    <Tabs size="compact" value={mode} values={["interact", "comment", "draw"]}>
      <TabsList aria-label="Preview mode">
        <TabItem glyphOnly icon={IconInteract} label="Interact" value="interact" />
        <TabItem glyphOnly icon={IconComment} label="Comment" value="comment" />
        <TabItem glyphOnly icon={IconPen} label="Draw" value="draw" />
      </TabsList>
    </Tabs>
    <Button
      aria-expanded={comments}
      aria-label="Comments"
      expanded="pressed"
      size="sm"
      variant="ghost"
      ><IconChat /><span>Comments</span>{#if open > 0}<span
          class="min-w-c-count-digit num">{open}</span
        >{/if}</Button
    >
    <Button aria-label="Reload" size="icon-sm" variant="ghost"
      ><IconRefresh /></Button
    >
    <Button aria-label="Close" size="icon-sm" variant="ghost"
      ><IconClose /></Button
    >
  </header>
  <div class="flex min-h-0 flex-1">
    <div class="relative min-w-0 flex-1 overflow-hidden bg-surface-page" data-well>
      {@render page()}
      {#if mode === "comment"}
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 z-20 border-2 border-brand-solid"
        ></span>
      {/if}
    </div>
    {#if rail}
      <aside
        class="flex w-(--c-comments-w) flex-none flex-col border-s border-border-hairline bg-surface-raised"
        data-rail
      >
        {@render rail()}
      </aside>
    {/if}
  </div>
</section>
