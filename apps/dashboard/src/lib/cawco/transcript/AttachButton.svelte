<script lang="ts">
  /**
   * Attach: a press opens the system's picker (files, and on a phone its
   * photos and camera), and what is picked joins the draft
   * (`ComposerDraft.add`). A session's composer and New session's first
   * prompt both carry it. Its box is the composer's control size,
   * `--c-composer-field`, concentric with a shell inset by
   * `--c-composer-inset`.
   *
   * Where a session can draw (`ondraw`), Attach is a menu: Files and photos,
   * and Draw, which opens the composer's canvas (The pen's swipe: Draw is
   * how a finger, a mouse and a phone get there).
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconArtifactCanvas, IconPaperclip, IconPlus } from "#lib/icons.js";
  import type { ComposerDraft } from "./composer-draft.svelte";

  let { draft, ondraw }: { draft: ComposerDraft; ondraw?: () => void } =
    $props();

  let input = $state<HTMLInputElement>();

  function onpick(event: Event): void {
    const picker = event.currentTarget as HTMLInputElement;
    if (picker.files?.length) {
      // Copied first: `picker.files` is live, and clearing the input below
      // empties it while the reads are still walking it — a pick of several
      // files kept only the first.
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the file input clears synchronously below, independent of the read.
      void draft.add([...picker.files]);
    }
    picker.value = "";
  }
</script>

<input
  data-slot="hidden-file"
  class="hidden"
  multiple
  onchange={onpick}
  type="file"
  bind:this={input}
/>
{#if ondraw}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      data-att-btn
      aria-label="Attach or draw"
      class="touch-hit size-c-composer-field flex-none grid place-items-center cursor-pointer rounded-(--att-radius) border border-border-control bg-surface-raised text-ink-muted transition-[background-color,color] dur-control ease-out motion-safe:transition-[background-color,color,transform] hover:bg-surface-hover hover:text-ink-strong motion-safe:active:transform-(--tpress)"
      style="--hit-edge: 1px; --att-radius: calc(var(--radius-lg) - var(--c-composer-inset)); --tpress: scale(var(--press-scale))"
    >
      <IconPlus class="size-icon-md" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" side="top">
      <DropdownMenu.Item onSelect={() => input?.click()}>
        <IconPaperclip />
        <span>Files and photos</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={ondraw}>
        <IconArtifactCanvas />
        <span>Draw</span>
        <DropdownMenu.Shortcut>⌘⇧D</DropdownMenu.Shortcut>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <button
    data-slot="att-btn"
    aria-label="Attach a file or image"
    class="touch-hit size-c-composer-field flex-none grid place-items-center cursor-pointer rounded-(--att-radius) border border-border-control bg-surface-raised text-ink-muted transition-[background-color,color] dur-control ease-out motion-safe:transition-[background-color,color,transform] hover:bg-surface-hover hover:text-ink-strong motion-safe:active:transform-(--tpress)"
    onclick={() => input?.click()}
    style:--hit-edge="1px"
    style:--tpress="scale(var(--press-scale))"
    style:--att-radius="calc(var(--radius-lg) - var(--c-composer-inset))"
    type="button"
  >
    <IconPlus class="size-icon-md" />
  </button>
{/if}
