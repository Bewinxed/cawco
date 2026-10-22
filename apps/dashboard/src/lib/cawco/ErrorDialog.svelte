<script lang="ts">
  /**
   * An error read in full. A daemon's failure (a git pull, an install, a
   * file read) is often several lines, and the one that names the cause is
   * rarely the first; squeezed into a menu item or a row it cannot be read or
   * copied. Here it is the whole text, selectable, with one button that puts
   * it on the clipboard exactly as it came.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { IconAlert, IconCheck, IconCopy } from "#lib/icons.js";
  import { copyRefused, copyToClipboard } from "./copy";
  import { dur } from "./motion/curves.svelte";
  import RowFault from "./RowFault.svelte";

  let {
    title,
    message,
    open: dialogOpen = $bindable(false),
  }: { title: string; message: string; open?: boolean } = $props();

  let copied = $state(false);
  /** The browser refused the last copy: said over the footer, with Try again. */
  let refused = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  async function copy() {
    clearTimeout(timer);
    copied = await copyToClipboard("Error", message);
    refused = !copied;
    timer = setTimeout(() => {
      copied = false;
    }, dur("--dur-hold"));
  }
</script>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content width="report">
    <div class="flex flex-col gap-space-7">
      <Dialog.Header>
        <Dialog.Title lead="glyph">
          <IconAlert class="size-icon-md shrink-0 text-error-9" />
          <span>{title}</span>
        </Dialog.Title>
      </Dialog.Header>

      <pre
        class="m-0 max-h-c-report-text-max min-w-0 overflow-auto wrap-anywhere whitespace-pre-wrap rounded-sm border border-border-hairline bg-surface-recess p-space-3 font-mono text-size-meta leading-prose text-ink-strong select-text"
        data-error-text>{message}</pre>

      <RowFault
        again={copy}
        data-copy-refused
        reason={refused ? copyRefused("Error", "from the text above") : null}
      />

      <Dialog.Footer>
        <Button onclick={copy} type="button" variant="outline">
          <span class="icon-swap" style:--icon-swap-dur="var(--dur-control)">
            <span data-active={!copied}><IconCopy /></span>
            <span data-active={copied}><IconCheck /></span>
          </span>
          <span>Copy error</span>
        </Button>
        <!-- A dismissal, not an action: no coral (DESIGN.md, The Coral Is
             Where You Act Rule). -->
        <Button
          onclick={() => {
            dialogOpen = false;
          }}
          type="button"
          variant="outline"
        >
          Close
        </Button>
      </Dialog.Footer>
    </div>
  </Dialog.Content>
</Dialog.Root>
