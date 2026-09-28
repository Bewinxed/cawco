<script lang="ts">
  import { tick, untrack } from "svelte";
  import { Drawer } from "vaul-svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Popover from "$lib/components/ui/popover";
  import { IconWindow } from "$lib/icons";
  import { lightbox } from "../transcript/lightbox-state.svelte";
  import { NOTE_MAX, type PendingSelection, selectionLabel } from "./selection";

  let {
    selection,
    anchor,
    open = $bindable(false),
    phone = false,
    onremove,
  }: {
    selection: PendingSelection;
    anchor?: HTMLButtonElement;
    open?: boolean;
    phone?: boolean;
    onremove: () => void;
  } = $props();
  const label = $derived(selectionLabel(selection.element));
  const source = $derived(selection.element.source);
  let field = $state<HTMLInputElement>();
  let imageSize = $state({ width: 0, height: 0 });
  const imageFit = $derived(
    imageSize.width
      ? Math.min(
          1,
          240 / imageSize.width,
          (phone ? 120 : 160) / imageSize.height
        )
      : 1
  );
  // The capture phase runs before Shot opens the dialog; only the dialog's
  // state changes should spend this return-focus marker.
  let viewing = false;
  $effect(() => {
    const current = selection;
    untrack(() => {
      if (current && open) {
        tick().then(() => field?.focus({ preventScroll: true }));
      }
    });
  });

  function viewImage() {
    viewing = true;
    open = false;
    // The popover closes as the picture opens, so there is no thumbnail left
    // to zoom out of: PhotoSwipe fades it in.
    lightbox.open({
      kind: "image",
      index: 0,
      shots: [
        {
          src: `data:image/png;base64,${selection.png}`,
          alt: label,
          width: imageSize.width * selection.scale,
          height: imageSize.height * selection.scale,
        },
      ],
    });
  }

  function focusNote(event: Event) {
    event.preventDefault();
    tick().then(() => field?.focus({ preventScroll: true }));
  }
  function close() {
    open = false;
    anchor?.focus({ preventScroll: true });
  }
  function keydown(event: KeyboardEvent) {
    if (
      (event.key === "Enter" && !event.isComposing) ||
      event.key === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }
  function frameBlur() {
    setTimeout(() => {
      if (document.activeElement instanceof HTMLIFrameElement) {
        open = false;
      }
    }, 0);
  }
  // Native image dialogs take focus; the chip is the stable return address.
  $effect(() => {
    if (lightbox.current && open) {
      viewing = true;
      open = false;
    }
    if (!lightbox.current && viewing) {
      viewing = false;
      tick().then(() => anchor?.focus({ preventScroll: true }));
    }
  });
</script>

<svelte:window onblur={frameBlur} />

{#snippet content()}
  {#if selection.png}
    <button
      aria-label={`Open ${label}`}
      class="thumbnail"
      onclick={viewImage}
      type="button"
    >
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the PNG's decoded dimensions determine its natural CSS size. -->
      <img
        alt={label}
        onload={(event) => { const { naturalWidth, naturalHeight } = event.currentTarget as HTMLImageElement; imageSize = { width: naturalWidth / selection.scale, height: naturalHeight / selection.scale }; }}
        src={`data:image/png;base64,${selection.png}`}
        style:height={imageSize.height ? `${imageSize.height * imageFit}px` : undefined}
        style:width={imageSize.width ? `${imageSize.width * imageFit}px` : undefined}
      >
    </button>
  {:else}
    <span class="mark"><IconWindow /></span>
  {/if}
  <span class="name">{label}</span>
  {#if source?.file}
    <span class="source"
      >{source.file}:{source.line ?? '?'}:{source.column ?? '?'}
      ({source.framework})</span
    >
  {/if}
  <label class="note"
    >Note<input
      maxlength={NOTE_MAX}
      onkeydown={keydown}
      placeholder="What should change?"
      bind:this={field}
      bind:value={selection.note}
    ></label
  >
  <div class="actions">
    <button class="touch-hit" onclick={onremove} type="button">
      Remove selection
    </button>
    {#if phone}
      <button class="touch-hit" onclick={close} type="button">Done</button>
    {/if}
  </div>
{/snippet}

{#if phone}
  <Drawer.Root dismissible={false} modal={false} noBodyStyles bind:open>
    <Drawer.Portal>
      <Drawer.Content
        class="selection-popover selection-note-sheet"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={focusNote}
        trapFocus={false}
      >
        <Drawer.Title class="sr-only">Note</Drawer.Title>
        {@render content()}
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
{:else}
  <!-- The kit's floating surface: it grows out of the chip it is anchored
       to (bits' transform-origin) and leaves back into it. -->
  <Popover.Root bind:open>
    <Popover.Content
      align="start"
      class="selection-popover"
      collisionPadding={11}
      customAnchor={anchor}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onEscapeKeydown={(event) => { event.preventDefault(); close(); }}
      onOpenAutoFocus={focusNote}
      side="top"
      sideOffset={7}
      trapFocus={false}
    >
      {@render content()}
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  :global(.selection-popover) {
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 320px;
    max-width: calc(100vw - var(--space-6));
    padding: var(--space-3);
    color: var(--ink-strong);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
  }
  /* The phone's note sheet is not a floating surface: it draws its own. */
  :global(.selection-note-sheet) {
    background: var(--surface-raised);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-drawer);
  }
  :global(.selection-note-sheet) {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-width: none;
    padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
  }
  .name {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source {
    font: var(--text-meta) var(--font-mono);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: var(--radius-xs);
    background: var(--mark-overlay), var(--mark-6);
    color: var(--mark-glyph);
  }
  .mark :global(svg) {
    width: 12px;
    height: 12px;
  }
  .note {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  input {
    min-width: 0;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    padding: var(--space-2);
    font: inherit;
  }
  input::placeholder {
    color: var(--ink-muted);
  }
  .actions {
    display: flex;
    justify-content: space-between;
  }
  button {
    border: 0;
    background: transparent;
    border-radius: var(--radius-sm);
    color: var(--ink-strong);
    padding: var(--space-2);
    cursor: pointer;
  }
  .thumbnail {
    align-self: center;
    display: grid;
    place-items: center;
    padding: 0;
    max-width: 100%;
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .thumbnail img {
    display: block;
    max-width: 100%;
    object-fit: contain;
  }
  input:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  :global(.selection-note-sheet) input {
    font-size: 16px;
  }
</style>
