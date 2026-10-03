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
  import { copyToClipboard } from "./copy";
  import { dur } from "./motion/curves.svelte";

  let {
    title,
    message,
    open: dialogOpen = $bindable(false),
  }: { title: string; message: string; open?: boolean } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  async function copy() {
    clearTimeout(timer);
    copied = await copyToClipboard("Error", message);
    timer = setTimeout(() => {
      copied = false;
    }, dur("--dur-hold"));
  }
</script>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <div class="flex flex-col gap-6">
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <IconAlert class="size-4 shrink-0 text-destructive" />
          {title}
        </Dialog.Title>
      </Dialog.Header>

      <pre
        class="error-text max-h-[60vh] overflow-auto whitespace-pre-wrap break-words"
        data-error-text
      >{message}</pre>

      <Dialog.Footer>
        <Button onclick={copy} type="button" variant="outline">
          <span class="icon-swap" style="--icon-swap-dur: var(--dur-control)">
            <span data-active={!copied}><IconCopy /></span>
            <span data-active={copied}><IconCheck /></span>
          </span>
          Copy error
        </Button>
        <Button
          onclick={() => {
            dialogOpen = false;
          }}
          type="button"
        >
          Close
        </Button>
      </Dialog.Footer>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .error-text {
    margin: 0;
    padding: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    line-height: 1.55;
    user-select: text;
  }
</style>
