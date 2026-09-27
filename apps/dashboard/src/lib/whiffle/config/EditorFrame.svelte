<script lang="ts">
  /**
   * The one editor template: a scrolling raised body on the recess, and the
   * commit row under it. The header holds the name as a title input; the
   * sections below are divided by a line each.
   */
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { buttonVariants } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { IconMore, IconTrash } from "$lib/icons";
  import { land } from "$lib/whiffle/motion/share.svelte";
  import EditorFooter from "./EditorFooter.svelte";
  import { hubDown } from "./hub.svelte";
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
    ondelete,
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
    ondelete?: () => void;
  } = $props();

  const down = $derived(hubDown());
  /** The section this editor belongs to: its tile heads the editor, the same tile its row carries in the list. */
  const section = $derived(
    SECTIONS.find((entry) => entry.slug === page.url.pathname.split("/")[2])
  );
</script>

<svelte:head><title>{title} · Configure · Whiffle</title></svelte:head>

<form
  class="editor"
  onsubmit={(event) => {
    event.preventDefault();
    onsubmit();
  }}
>
  <div class="scroll">
    <div class="body">
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
      {@render children()}
    </div>
  </div>
  <EditorFooter
    {canSave}
    {deleteLabel}
    {deleting}
    {down}
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
    width: 15px;
    height: 15px;
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
