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

  /**
   * The sheet is built the first time it opens, and kept from then on so it
   * can leave as it leaves. A message row on a touch screen is built with
   * its handle, and a whole drawer under every handle (vaul's Root, its
   * trigger, its content's portal and their effects) came with each row a
   * transcript mounted: a hidden pane's rows read the window's size for
   * the snap points vaul keeps (`useSnapPoints`), each read laying the page
   * out while those rows were still being written, 22-30ms of a 121-151ms
   * task at 4x CPU (sidebar-lab settle, a hidden pane's build). Until then
   * the handle stands alone, with the attributes the closed trigger gives
   * it; a press opens the sheet, which the kit's Root opens as it opens
   * from a click whenever it mounts open (root-open). The open moves the
   * focus into the sheet, and its close hands it to the trigger then built.
   */
  let built = $state(false);
  $effect.pre(() => {
    if (open) {
      built = true;
    }
  });
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

<!-- The handle, as the sheet's trigger or standing in for it. -->
{#snippet handleButton(props: Record<string, unknown>)}
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

{#if built}
  <Drawer.Root bind:open>
    <Drawer.Trigger>
      {#snippet child({ props })}
        {@render handleButton(props)}
      {/snippet}
    </Drawer.Trigger>
    <Drawer.Content title={transcriptWords.messageSheet}>
      <!-- Its rows scroll beneath the kit's floating head (Drawer.scroller). -->
      <div
        data-slot="message-sheet"
        class={["flex min-h-0 flex-col overflow-y-auto", Drawer.scroller]}
      >
        {#each rows as row (row.label)}
          <button
            class={[
              menuItemVariants(),
              "flex items-center gap-space-3 px-space-3 type-label text-ink-strong can-hover:hover:bg-surface-hover",
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
{:else}
  {@render handleButton({
    "aria-expanded": "false",
    "aria-haspopup": "dialog",
    "data-state": "closed",
    onclick: () => {
      open = true;
    },
  })}
{/if}
