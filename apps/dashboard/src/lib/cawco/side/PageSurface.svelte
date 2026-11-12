<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  /**
   * What SideSurface holds on a desk, as its own page on a phone (The Open
   * Page Rule): a task's (TaskPane), a folder file's (FolderFile). Its head
   * follows DESIGN.md, The Title Bars Follow Liquid Glass Rule as every bar
   * does:
   * - Back is the chevron alone in its glass group, named by where it goes
   *   ("Back and Close are symbols, named by where they go, never the words
   *   Back or Close"), as Shell's crumb on a Configure section;
   * - then the item's name where one helps (`title`), never its id or path
   *   ("A title is the view's own short name, never the app's name, an id,
   *   a path or a breadcrumb"); what it holds says those in its body.
   *
   * The head floats over the page (`--side-room`, the top bar's height),
   * the scroll edge effect under it (HeadFade); what it holds runs to its
   * top, its scroller padding its top by the room (`pt-(--side-room)`) and
   * naming the timeline the effect plays on, as in SideSurface.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconChevronLeft } from "#lib/icons.js";

  let {
    label,
    backTo,
    onclose,
    title,
    children,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    /** What the page is, read out. */
    label: string;
    /** Where Back goes (the view's name): Back's tooltip and accessible name. */
    backTo: string;
    onclose: () => void;
    /** The item's name, where one helps; never an id or a path. */
    title?: string;
    children: Snippet;
  } = $props();
</script>

<section
  {...rest}
  aria-label={label}
  class="relative flex min-h-0 flex-1 flex-col timeline-scope-transcript-head"
  style:--side-room="var(--spacing-c-top-bar-h)"
>
  <HeadFade band="var(--side-room)" tint="bg-surface-recess" />
  <header
    data-slot="page-head"
    class="absolute inset-x-0 top-0 z-2 flex h-(--side-room) items-center gap-space-2 pe-space-5 ps-space-3"
  >
    <BarGlass form="group">
      <BarItem
        data-slot="back"
        icon={IconChevronLeft}
        label={commonWords.backTo(backTo)}
        onclick={onclose}
      />
    </BarGlass>
    {#if title}
      <span
        data-slot="title"
        class="min-w-0 truncate type-label text-ink-strong">{title}</span
      >
    {/if}
  </header>
  {@render children()}
</section>
