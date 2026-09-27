<script lang="ts">
  import {
    type FileContents,
    FileDiff,
    parseDiffFromFile,
  } from "@pierre/diffs";
  import { Dialog } from "bits-ui";
  import { onDestroy } from "svelte";
  import { quintOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";
  import { Button } from "$lib/components/ui/button";
  import { CopyButton } from "$lib/components/ui/copy-button";
  import { IconAlignLeft, IconClose, IconColumns } from "$lib/icons";

  interface Props {
    filePath: string;
    newContent: string;
    oldContent: string;
    onClose: () => void;
  }

  let { filePath, oldContent, newContent, onClose }: Props = $props();
  // The parent unmounts us on `onClose`, so the close runs through bits first
  // and only hands back once the exit transition has finished.
  let open = $state(true);
  let container = $state<HTMLDivElement | null>(null);
  let diffInstance: FileDiff | null = null;
  let diffStyle = $state<"unified" | "split">("unified");

  // Get file extension for syntax highlighting
  function getLanguageFromPath(path: string): string | undefined {
    const ext = path.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      svelte: "svelte",
      vue: "vue",
      py: "python",
      rb: "ruby",
      go: "go",
      rs: "rust",
      java: "java",
      kt: "kotlin",
      swift: "swift",
      c: "c",
      cpp: "cpp",
      h: "c",
      hpp: "cpp",
      cs: "csharp",
      php: "php",
      html: "html",
      css: "css",
      scss: "scss",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      md: "markdown",
      sql: "sql",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      dockerfile: "dockerfile",
      toml: "toml",
    };
    return ext ? langMap[ext] : undefined;
  }

  function getFileName(path: string): string {
    return path.split("/").pop() || path;
  }

  function renderDiff() {
    if (!container) {
      return;
    }

    // Clean up existing instance (though {#key} handles container recreation)
    if (diffInstance) {
      diffInstance.cleanUp();
      diffInstance = null;
    }

    const lang = getLanguageFromPath(filePath);
    const fileName = getFileName(filePath);

    const oldFile: FileContents = {
      name: fileName,
      contents: oldContent,
      lang: lang as FileContents["lang"],
    };

    const newFile: FileContents = {
      name: fileName,
      contents: newContent,
      lang: lang as FileContents["lang"],
    };

    diffInstance = new FileDiff({
      disableFileHeader: true,
      diffStyle,
      expandUnchanged: true,
      hunkSeparators: "line-info",
    });

    // Pass container as containerWrapper, not fileContainer
    // The library creates its own diffs-container custom element with shadowRoot
    diffInstance.render({
      oldFile,
      newFile,
      containerWrapper: container,
    });
  }

  onDestroy(() => {
    if (diffInstance) {
      diffInstance.cleanUp();
      diffInstance = null;
    }
  });

  // Re-render when diff style changes
  $effect(() => {
    if (container && diffStyle) {
      renderDiff();
    }
  });

  // Calculate stats
  const stats = $derived(() => {
    const fileName = getFileName(filePath);
    const fileDiff = parseDiffFromFile(
      { name: fileName, contents: oldContent },
      { name: fileName, contents: newContent }
    );

    let additions = 0;
    let deletions = 0;
    for (const hunk of fileDiff.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }

    return { additions, deletions };
  });
</script>

<Dialog.Root onOpenChangeComplete={(isOpen) => !isOpen && onClose()} bind:open>
  <Dialog.Portal>
    <Dialog.Overlay forceMount>
      {#snippet child({ props, open: isOpen })}
        {#if isOpen}
          <div
            {...props}
            class="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm"
            in:fade={{ duration: 200 }}
            out:fade={{ duration: 150 }}
          ></div>
        {/if}
      {/snippet}
    </Dialog.Overlay>

    <Dialog.Content aria-label={`Diff: ${filePath}`} forceMount>
      {#snippet child({ props, open: isOpen })}
        {#if isOpen}
          <div
            {...props}
            class="fixed top-1/2 left-1/2 z-50 w-[95vw] h-[90vh] max-w-7xl -translate-x-1/2 -translate-y-1/2 bg-background rounded-[var(--radius-lg)] shadow-2xl border border-border flex flex-col overflow-hidden"
            in:scale={{ duration: 200, start: 0.96, easing: quintOut }}
            out:scale={{ duration: 150, start: 0.96, easing: quintOut }}
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-4 py-3 border-b border-border bg-card"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-mono text-label text-foreground truncate"
                    >{filePath}</span
                  >
                  <CopyButton
                    class="h-6 w-6"
                    size="icon-sm"
                    text={filePath}
                    variant="ghost"
                  />
                </div>
                <div class="flex items-center gap-2 text-meta">
                  <span class="text-success">+{stats().additions}</span>
                  <span class="text-error">-{stats().deletions}</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <!-- Diff style toggle -->
                <!-- biome-ignore lint/a11y/useSemanticElements: a <fieldset> here would bring browser-default border/padding into this toggle group; it isn't a form control -->
                <div
                  aria-label="Diff layout"
                  class="flex items-center bg-[var(--surface-recess-deep)] rounded-[var(--radius-sm)] p-0.5 border border-border"
                  role="group"
                >
                  <Button
                    aria-pressed={diffStyle === 'unified'}
                    class="h-7 rounded-[14px] text-meta {diffStyle === 'unified'
                      ? 'bg-[var(--surface-lift)] border-border shadow-[var(--shadow-raised)]'
                      : ''}"
                    onclick={() => {
                      diffStyle = 'unified';
                    }}
                    size="sm"
                    title="Unified view"
                    variant={diffStyle === 'unified' ? 'outline' : 'ghost'}
                  >
                    <IconAlignLeft class="w-3.5 h-3.5" />
                    <span>Unified</span>
                  </Button>
                  <Button
                    aria-pressed={diffStyle === 'split'}
                    class="h-7 rounded-[14px] text-meta {diffStyle === 'split'
                      ? 'bg-[var(--surface-lift)] border-border shadow-[var(--shadow-raised)]'
                      : ''}"
                    onclick={() => {
                      diffStyle = 'split';
                    }}
                    size="sm"
                    title="Split view"
                    variant={diffStyle === 'split' ? 'outline' : 'ghost'}
                  >
                    <IconColumns class="w-3.5 h-3.5" />
                    <span>Split</span>
                  </Button>
                </div>

                <!-- Close button -->
                <Button
                  aria-label="Close diff modal"
                  onclick={() => {
                    // biome-ignore lint/suspicious/noGlobalAssign: `open` is the component's own $state prop (bound via `bind:open`), not window.open — Biome's Svelte scope resolution doesn't see the local declaration here
                    open = false;
                  }}
                  size="icon-sm"
                  title="Close (Esc)"
                  variant="ghost"
                >
                  <IconClose class="size-5" />
                </Button>
              </div>
            </div>

            <!-- Diff content -->
            <div class="flex-1 overflow-auto">
              {#key diffStyle}
                <div class="diff-modal-content" bind:this={container}></div>
              {/key}
            </div>
          </div>
        {/if}
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* @pierre/diffs renders into a shadowRoot, so it can only be themed through
     the inherited custom properties it documents in its core stylesheet. */
  .diff-modal-content {
    min-height: 100%;
    --diffs-font-size: 0.8125rem;
    --diffs-line-height: 1.6;
    --diffs-bg-addition-override: var(--diff-add-bg);
    --diffs-bg-deletion-override: var(--diff-del-bg);
    --diffs-bg-separator-override: var(--muted);
  }
</style>
