<script lang="ts">
  /**
   * A touch screen's way to the reader's message's actions, where nothing
   * hovers (MessageRow): one handle on the speaker line, standing at rest,
   * the kit's ghost `icon-sm` with its 16px glyph and its finger's 44px area
   * (`touch-hit`), opening the kit's bottom sheet titled "Message" with Copy,
   * Edit and Fork from here as the kit's rows, 44px each under a finger (The
   * 44 Touch Rule). A row offers only what the row would: an action the
   * message has not is not drawn. A press runs it as the strip's button
   * would, and the sheet goes away.
   */
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { IconCopy, IconFork, IconMore, IconPenLine } from "#lib/icons.js";

  let {
    open = $bindable(false),
    copy,
    edit,
    fork,
  }: {
    open?: boolean;
    copy?: () => void;
    edit?: () => void;
    /** Fork from here: the handle is what a New Session form hangs from. */
    fork?: (anchor: HTMLElement | null) => void;
  } = $props();

  let handle = $state<HTMLElement | null>(null);
  const rows = $derived(
    [
      copy && {
        label: transcriptWords.copyRow,
        icon: IconCopy,
        run: copy,
      },
      edit && {
        label: transcriptWords.editRow,
        icon: IconPenLine,
        run: edit,
      },
      fork && {
        label: transcriptWords.forkFromHere,
        icon: IconFork,
        run: () => fork(handle),
      },
    ].filter((row) => !!row)
  );
</script>

<Drawer.Root bind:open>
  <Drawer.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        class="-my-space-1"
        aria-label={transcriptWords.messageActions}
        data-slot="handle"
        size="icon-sm"
        variant="ghost"
        bind:ref={handle}
      >
        <IconMore aria-hidden="true" />
      </Button>
    {/snippet}
  </Drawer.Trigger>
  <Drawer.Content title={transcriptWords.messageSheet}>
    <div data-slot="message-sheet" class="flex flex-col">
      {#each rows as row (row.label)}
        <button
          class={[
            menuItemVariants(),
            "flex items-center gap-space-3 px-space-3 text-label text-ink-strong can-hover:hover:bg-surface-hover",
          ]}
          data-menu-item
          onclick={() => {
            open = false;
            row.run();
          }}
          type="button"
          ><row.icon aria-hidden="true" data-box /><span>{row.label}</span
          ></button
        >
      {/each}
    </div>
  </Drawer.Content>
</Drawer.Root>
