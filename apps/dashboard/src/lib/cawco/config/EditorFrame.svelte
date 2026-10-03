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
  import { onMount, type Snippet, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { page } from "$app/state";
  import {
    CURVE,
    dur,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore, IconTrash } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { type Cards, rememberCard } from "./cards";
  import EditorFooter from "./EditorFooter.svelte";
  import { hubDown } from "./hub.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import { SECTIONS } from "./sections";

  let {
    title,
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
  }: {
    /** The document title. */
    title: string;
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

<svelte:head><title>{title} · Configure · CawCo</title></svelte:head>

<form
  class="editor"
  onsubmit={(event) => {
    event.preventDefault();
    onsubmit();
  }}
>
  <div class="scroll">
    <div
      class="body"
      bind:this={body}
      style:min-height={card === null ? undefined : `${card}px`}
      {@attach cawco.hub === 'connected' && !settling ? rememberCard(page.url.pathname) : undefined}
    >
      <header class="head">
        {#if section}
          <span
            class="tile"
            data-share="icon:{page.url.pathname}"
            style="color:{section.hue}"
            {@attach land(() => `icon:${page.url.pathname}`)}
          >
            <section.icon />
          </span>
        {/if}
        <div class="lead">{@render header()}</div>
        {#if ondelete && deleteLabel}
          <span class="narrow-menu">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="More"
                class={buttonVariants({ variant: 'ghost', size: 'icon' })}
              >
                <IconMore />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-auto min-w-44">
                <DropdownMenu.Item
                  disabled={down !== null || deleting || saving}
                  onSelect={ondelete}
                  title={down ?? undefined}
                  variant="destructive"
                >
                  <IconTrash />
                  {deleteLabel}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </span>
        {/if}
      </header>
      <div class="content" class:fill={veiled && card !== null}>
        <div class="slot" class:veiled>{@render children()}</div>
        {#if veiled}
          <div
            aria-hidden="true"
            class="slot"
            out:fade={{ duration: dur('--dur-control'), easing: easeOut }}
          >
            <SkeletonRows fill={card !== null} />
          </div>
        {/if}
      </div>
    </div>
  </div>
  <EditorFooter
    {canSave}
    {deleteLabel}
    {deleting}
    {down}
    {failed}
    {oncancel}
    {ondelete}
    {saveLabel}
    {saving}
  />
</form>

<style>
  .editor {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--surface-recess);
  }
  .scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 7px 21px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 980px;
    padding: 18px 18px 20px;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  /* The sections and the skeleton over them share one cell. While the parts
     arrive the sections lay out unseen under it, and at the kept height the
     cell takes the room the card has left, so they cannot push it. */
  .content {
    display: grid;
    min-width: 0;

    &.fill {
      flex: 1 1 0;
      min-height: 0;
      grid-template-rows: minmax(0, 1fr);
    }
  }
  .slot {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;

    &.veiled {
      visibility: hidden;
      opacity: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  /* The section's tile, the one its row carries in the list: 26px, raised,
     centred on the title's 29px line. */
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 26px;
    height: 26px;
    margin-top: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .tile :global(svg) {
    width: 16px;
    height: 16px;
  }
  .lead {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .narrow-menu {
    display: none;
  }
  @media (max-width: 900px) {
    .scroll {
      padding: 7px;
    }
  }
  @media (max-width: 640px) {
    .narrow-menu {
      display: inline-flex;
    }
  }
</style>
