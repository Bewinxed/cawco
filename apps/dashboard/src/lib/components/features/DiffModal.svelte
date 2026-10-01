<script lang="ts">
  /**
   * A diff at full size, in the kit dialog: the file, what changed, and the
   * layout (unified or split) as a segmented control. Each layout is drawn
   * into its own layer, so switching cross-fades the new one in over the
   * old over --dur-control instead of redrawing in place.
   */
  import {
    type FileContents,
    FileDiff,
    parseDiffFromFile,
  } from "@pierre/diffs";
  import { crossIn, crossOut } from "$lib/cawco/motion/curves.svelte";
  import { CopyButton } from "$lib/components/ui/copy-button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "$lib/components/ui/dialog";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { IconAlignLeft, IconColumns } from "$lib/icons";
  import { fileName, languageOf } from "./diff-language";

  interface Props {
    filePath: string;
    newContent: string;
    oldContent: string;
    onClose: () => void;
  }

  let { filePath, oldContent, newContent, onClose }: Props = $props();
  // The parent unmounts us on `onClose`, so the close runs through the
  // dialog first and only hands back once its exit has finished.
  let open = $state(true);
  let diffStyle = $state<"unified" | "split">("unified");

  /** Draws the diff into a layer in `style`, and clears it when the layer goes. */
  const drawn = (style: "unified" | "split") => (layer: HTMLElement) => {
    const lang = languageOf(filePath) as FileContents["lang"];
    const name = fileName(filePath);
    const diff = new FileDiff({
      disableFileHeader: true,
      diffStyle: style,
      expandUnchanged: true,
      hunkSeparators: "line-info",
    });
    diff.render({
      oldFile: { name, contents: oldContent, lang },
      newFile: { name, contents: newContent, lang },
      containerWrapper: layer,
    });
    return () => diff.cleanUp();
  };

  const stats = $derived.by(() => {
    const name = fileName(filePath);
    const fileDiff = parseDiffFromFile(
      { name, contents: oldContent },
      { name, contents: newContent }
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
  <Dialog.Content
    aria-label={`Diff: ${filePath}`}
    bodyClass="flex h-full flex-col gap-0 overflow-hidden p-0"
    class="h-[90vh] w-[95vw] sm:max-w-7xl"
  >
    <header class="head">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <Dialog.Title class="truncate font-mono text-label"
            >{filePath}</Dialog.Title
          >
          <CopyButton
            class="h-6 w-6"
            size="icon-sm"
            text={filePath}
            variant="ghost"
          />
        </div>
        <div class="num flex items-center gap-2 text-meta">
          <span class="text-success">+{stats.additions}</span>
          <span class="text-error">-{stats.deletions}</span>
        </div>
      </div>
      <ToggleGroup.Root
        aria-label="Diff layout"
        onValueChange={(next) => {
          if (next) {
            diffStyle = next as 'unified' | 'split';
          }
        }}
        type="single"
        value={diffStyle}
      >
        <ToggleGroup.Item value="unified"
          ><IconAlignLeft />Unified</ToggleGroup.Item
        >
        <ToggleGroup.Item value="split"><IconColumns />Split</ToggleGroup.Item>
      </ToggleGroup.Root>
    </header>

    <div class="scroll">
      {#key diffStyle}
        <div
          class="layer"
          in:crossIn
          out:crossOut
          {@attach drawn(diffStyle)}
        ></div>
      {/key}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* Room on the inline end for the dialog's own close button. */
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    padding: 12px 52px 12px 16px;
    border-bottom: 1px solid var(--border-hairline);
  }
  .scroll {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  /* @pierre/diffs renders into a shadowRoot, so it can only be themed through
     the inherited custom properties it documents in its core stylesheet. */
  .layer {
    min-height: 100%;
    --diffs-font-size: 0.8125rem;
    --diffs-line-height: 1.6;
    --diffs-bg-addition-override: var(--diff-add-bg);
    --diffs-bg-deletion-override: var(--diff-del-bg);
    --diffs-bg-separator-override: var(--muted);
  }
</style>
