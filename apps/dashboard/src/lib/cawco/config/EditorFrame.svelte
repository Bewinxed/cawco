<script lang="ts">
  /**
   * The one editor template: a scrolling raised body on the recess, and the
   * commit row under it. The header holds the name as a title input; the
   * sections below are divided by a line each.
   *
   * An editor whose parts arrive after it opens (`settling`: a document
   * editor still drawing, a history still read) stands at the height it
   * settled at last time (cards) with skeleton rows over its sections, and
   * shows them, all at once and in place, when they are all in: nothing in
   * it moves while it assembles.
   *
   * Every editor's sections also stand veiled under the skeleton for the
   * frame after they mount: a textarea fits its text in that frame, and a
   * section drawn before it would move down once it has. They cross-fade in
   * over --dur-control from their final places.
   */
  import { configureWords } from "@cawco/core";
  import { onMount, type Snippet, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import {
    CURVE,
    dur,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore, IconTrash } from "#lib/icons.js";
  import { page } from "$app/state";
  import { cawco } from "../client.svelte";
  import { type Cards, rememberCard } from "./cards";
  import EditorFooter, { type EditorQuestion } from "./EditorFooter.svelte";
  import { hubDown } from "./hub.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import { SECTIONS } from "./sections";

  let {
    title,
    tile,
    header,
    children,
    onsubmit,
    oncancel,
    saving,
    saveLabel,
    canSave = true,
    deleteLabel,
    deleting = false,
    failed = false,
    ondelete,
    settling = false,
    result,
    question,
  }: {
    /** The document title. */
    title: string;
    /** What the header's tile holds in place of its section's glyph (a provider's mark), in the same tile. */
    tile?: Snippet;
    header: Snippet;
    children: Snippet;
    onsubmit: () => void;
    oncancel: () => void;
    saving: boolean;
    saveLabel: string;
    canSave?: boolean;
    deleteLabel?: string;
    deleting?: boolean;
    /** The save or delete that just ended failed: its button shows no check. */
    failed?: boolean;
    ondelete?: () => void;
    /** Parts of the editor are still arriving. */
    settling?: boolean;
    /** What the save reaches and where it landed, beside Save (EditorFooter). */
    result?: Snippet;
    /** The editor's own question (its delete's), drawn in its footer. */
    question?: EditorQuestion;
  } = $props();

  /** The fields have taken their size (autosize fits in the next frame). */
  let fitted = $state(false);
  onMount(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        fitted = true;
      });
    });
    return () => cancelAnimationFrame(frame);
  });
  const veiled = $derived(settling || !fitted);

  /** Held at the kept height from opening until the parts are in. */
  let holding = $state(untrack(() => settling));
  const card = $derived(
    holding
      ? ((page.data.cards as Cards | undefined)?.[page.url.pathname] ?? null)
      : null
  );
  let body = $state<HTMLElement | null>(null);
  let scroller = $state<HTMLElement | null>(null);
  // Let go once everything is in: any difference from the kept height is
  // tweened, not jumped.
  $effect(() => {
    if (settling || !holding || !body) {
      return;
    }
    const from = body.getBoundingClientRect().height;
    holding = false;
    const node = body;
    requestAnimationFrame(() => {
      const to = node.getBoundingClientRect().height;
      if (motionOk.current && Math.abs(to - from) > 0.5) {
        node.animate(
          [
            { height: `${from}px`, overflow: "hidden" },
            { height: `${to}px`, overflow: "hidden" },
          ],
          { duration: dur("--dur-morph"), easing: CURVE.drawer }
        );
      }
    });
  });

  const down = $derived(hubDown());
  /** The section this editor belongs to: its tile heads the editor, the same tile its row carries in the list. */
  const section = $derived(
    SECTIONS.find((entry) => entry.slug === page.url.pathname.split("/")[2])
  );
</script>

<svelte:head><title>{configureWords.documentTitle(title)}</title></svelte:head>

<form
  data-slot="editor"
  class="flex flex-auto flex-col min-w-0 min-h-0 bg-surface-recess"
  onsubmit={(event) => {
    event.preventDefault();
    onsubmit();
  }}
>
  <div
    class="flex flex-auto flex-col min-h-0 overflow-y-auto pt-space-2 px-space-5 pb-space-5 max-phone:pb-(--scroll-pb)"
    data-safe-bottom
    style:--scroll-pb={"calc(var(--c-btn-h-sm) + var(--space-8) + var(--safe-bottom))"}
    bind:this={scroller}
  >
    <!-- literal: 980px, 8px, 26px -->
    <div
      data-slot="body"
      class="flex grow shrink-0 basis-auto flex-col gap-space-6 max-w-(--body-max) py-space-6 px-space-7 rounded-lg bg-surface-raised min-h-(--card-h)"
      bind:this={body}
      style:--body-max="980px"
      style:--head-gap="8px"
      style:--tile="26px"
      style:--card-h={card === null ? undefined : `${card}px`}
      {@attach cawco.hub === "connected" && !settling
        ? rememberCard(page.url.pathname)
        : undefined}
    >
      <header data-slot="head" class="flex items-start gap-(--head-gap)">
        {#if tile}
          <span
            data-slot="tile"
            class="inline-flex items-center justify-center flex-none size-(--tile) mt-space-row rounded-sm bg-surface-raised shadow-tile"
            data-share="icon:{page.url.pathname}"
            {@attach land(() => `icon:${page.url.pathname}`)}
          >
            {@render tile()}
          </span>
        {:else if section}
          <span
            data-slot="tile"
            class="inline-flex items-center justify-center flex-none size-(--tile) mt-space-row rounded-sm bg-surface-raised shadow-tile text-(--tile-ink)"
            data-share="icon:{page.url.pathname}"
            style:--tile-ink={section.hue}
            {@attach land(() => `icon:${page.url.pathname}`)}
          >
            <section.icon />
          </span>
        {/if}
        <div
          data-slot="lead"
          class="flex flex-auto flex-col gap-(--head-gap) min-w-0"
        >
          {@render header()}
        </div>
        {#if ondelete && deleteLabel}
          <span class="hidden max-phone:inline-flex">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    aria-label={configureWords.more}
                    size="icon"
                    variant="ghost"
                  >
                    <IconMore />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-auto" min="regular">
                <DropdownMenu.Item
                  disabled={down !== null || deleting || saving}
                  onSelect={ondelete}
                  title={down ?? undefined}
                  variant="destructive"
                >
                  <IconTrash />
                  <span>{deleteLabel}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </span>
        {/if}
      </header>
      <div
        data-fill={(veiled && card !== null) || undefined}
        data-is-fill={(veiled && card !== null) || undefined}
        class="grid min-w-0 data-is-fill:grow data-is-fill:shrink data-is-fill:basis-0 data-is-fill:min-h-0 data-is-fill:grid-rows-(--fill-rows)"
        style:--fill-rows="minmax(0, 1fr)"
      >
        <div
          data-slot="slot"
          class="col-start-1 row-start-1 flex flex-col gap-space-5 min-w-0 data-veiled:invisible data-veiled:opacity-0 motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out"
          data-veiled={veiled || undefined}
        >
          {@render children()}
        </div>
        {#if veiled}
          <div
            data-slot="slot"
            aria-hidden="true"
            class="col-start-1 row-start-1 flex flex-col gap-space-5 min-w-0 motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out"
            out:fade={{ duration: dur("--dur-control"), easing: easeOut }}
          >
            <SkeletonRows fill={card !== null} />
          </div>
        {/if}
      </div>
    </div>
  </div>
  <EditorFooter
    body={scroller}
    {canSave}
    {deleteLabel}
    {deleting}
    {down}
    {failed}
    {oncancel}
    {ondelete}
    {question}
    {result}
    {saveLabel}
    {saving}
  />
</form>

<style>
  /* residual: foreign-dom */
  [data-slot="tile"] :global(svg) {
    width: var(--icon-md);
    height: var(--icon-md);
  }
</style>
