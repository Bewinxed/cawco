<script lang="ts">
  import { detach } from "@cawco/core/detach";
  import { findInWords } from "@cawco/core/words/find-in";
  /**
   * Attach: a press opens the system's picker (files, and on a phone its
   * photos and camera), and what is picked joins the draft
   * (`ComposerDraft.add`). A session's composer and New session's first
   * prompt both carry it. Its box is the composer's control size,
   * `--spacing-c-composer-field`, concentric with a shell inset by
   * `--spacing-c-composer-inset` inside its 1px edge.
   *
   * Where a session can draw (`ondraw`), Attach is a menu: Files and photos,
   * and Draw, which opens the composer's canvas (The pen's swipe: Draw is
   * how a finger, a mouse and a phone get there).
   *
   * In a comment's composer and a thread's reply (`ghost`) it is the kit's
   * `sm` ghost icon button with Solar's duotone paperclip at `--spacing-icon-md`,
   * 44px under a finger (commenting build note 1).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconArtifactCanvas,
    IconPaperclip,
    IconPlus,
    IconSearch,
  } from "#lib/icons.js";
  import type { ComposerDraft } from "./composer-draft.svelte";

  let {
    draft,
    ondraw,
    onfind,
    ghost = false,
  }: {
    draft: ComposerDraft;
    ondraw?: () => void;
    /** Find in this conversation: the way in for a pointer and a finger (Command-F's). */
    onfind?: () => void;
    ghost?: boolean;
  } = $props();

  let input = $state<HTMLInputElement>();
  /** Find was chosen: the focus goes to its field, not back to Attach. */
  let finding = false;

  // Asked for from outside the composer (Files' Attach a file): the picker
  // opens as Attach's own press opens it, inside the press's activation.
  $effect(() => {
    if (draft.pickWanted && input) {
      draft.pickWanted = false;
      input.click();
    }
  });

  function onpick(event: Event & { currentTarget: HTMLInputElement }): void {
    const picker = event.currentTarget;
    if (picker.files?.length) {
      // Copied first: `picker.files` is live, and clearing the input below
      // empties it while the reads are still walking it — a pick of several
      // files kept only the first.
      detach(draft.add([...picker.files]), "add");
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
{#if ghost}
  <Button
    data-att-btn
    aria-label="Attach a file or image"
    class="flex-none touch-hit"
    icon={IconPaperclip}
    onclick={() => input?.click()}
    size="icon-sm"
    title="Attach a file or image"
    variant="ghost"
  />
{:else if ondraw || onfind}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      data-att-btn
      aria-label={ondraw ? "Attach, draw or find" : "Attach or find"}
      class="flex-none"
      look="attach"
    >
      <IconPlus class="size-icon-md" />
    </DropdownMenu.Trigger>
    <!-- Find takes the focus to its field as the menu closes, rather than
         back to Attach. -->
    <DropdownMenu.Content
      align="start"
      onCloseAutoFocus={(event) => {
        if (finding) {
          finding = false;
          event.preventDefault();
        }
      }}
      side="top"
    >
      <DropdownMenu.Item onSelect={() => input?.click()}>
        <IconPaperclip />
        <span>Files and photos</span>
      </DropdownMenu.Item>
      {#if ondraw}
        <DropdownMenu.Item onSelect={ondraw}>
          <IconArtifactCanvas />
          <span>Draw</span>
          <DropdownMenu.Shortcut>⌘⇧D</DropdownMenu.Shortcut>
        </DropdownMenu.Item>
      {/if}
      {#if onfind}
        <DropdownMenu.Item
          onSelect={() => {
            finding = true;
            onfind();
          }}
        >
          <IconSearch />
          <span>{findInWords.menuItem}</span>
          <DropdownMenu.Shortcut>⌘F</DropdownMenu.Shortcut>
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <button
    data-att-btn
    aria-label="Attach a file or image"
    class="select-none touch-hit hit-edge-hair size-c-composer-field flex-none grid place-items-center concentric-xs border border-border-control bg-surface-raised text-ink-muted transition-[background-color,color] duration-(--duration-control) ease-out motion-safe:transition-[background-color,color,scale] hover:bg-surface-hover hover:text-ink-strong motion-safe:active:scale-(--press-scale) group-inert/ctrls:border-border-row-outline group-inert/ctrls:shadow-xs"
    onclick={() => input?.click()}
    type="button"
  >
    <IconPlus class="size-icon-md" />
  </button>
{/if}
