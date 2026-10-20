<script lang="ts">
  /**
   * A diff at full size, in the kit dialog: the file, what changed, and the
   * layout (unified or split) as a segmented control. It only shows, so it
   * holds nothing (DESIGN.md, The Open Page Rule): no scrim, the page live
   * under it, as tall as the diff up to the dialog's cap. Each layout is drawn
   * into its own layer, so switching cross-fades the new one in over the
   * old over --dur-control instead of redrawing in place.
   */
  import {
    type FileContents,
    type FileDiffMetadata,
    parseDiffFromFile,
  } from "@pierre/diffs";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconAlignLeft, IconColumns } from "#lib/icons.js";
  import { fileName, languageOf } from "./diff-language";
  import { houseDiff } from "./diff-theme.svelte";

  interface Props {
    fileDiff?: FileDiffMetadata;
    filePath: string;
    newContent: string;
    oldContent: string;
    onClose: () => void;
  }

  let { filePath, oldContent, newContent, onClose, fileDiff }: Props = $props();
  // The parent unmounts us on `onClose`, so the close runs through the
  // dialog first and only hands back once its exit has finished.
  let open = $state(true);
  let diffStyle = $state<"unified" | "split">("unified");

  /** Draws the diff into a layer in `style`, and clears it when the layer goes. */
  const drawn = (style: "unified" | "split") => (layer: HTMLElement) => {
    const lang = languageOf(filePath) as FileContents["lang"];
    const name = fileName(filePath);
    const diff = houseDiff({
      disableFileHeader: true,
      diffStyle: style,
      expandUnchanged: !fileDiff?.isPartial,
      hunkSeparators: "line-info",
    });
    diff.render({
      ...(fileDiff
        ? { fileDiff }
        : {
            oldFile: { name, contents: oldContent, lang },
            newFile: { name, contents: newContent, lang },
          }),
      containerWrapper: layer,
    });
    return () => diff.cleanUp();
  };

  const stats = $derived.by(() => {
    const name = fileName(filePath);
    const parsed =
      fileDiff ??
      parseDiffFromFile(
        { name, contents: oldContent },
        { name, contents: newContent }
      );
    let additions = 0;
    let deletions = 0;
    for (const hunk of parsed.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
    return { additions, deletions };
  });
</script>

<Dialog.Root onOpenChangeComplete={(isOpen) => !isOpen && onClose()} bind:open>
  <Dialog.Content
    aria-label={`Diff: ${filePath}`}
    body="document"
    bodyPad="flush"
    class="w-c-dialog-document-w"
    modal={false}
    width="document"
  >
    <header
      data-slot="head"
      class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2 py-space-3 ps-space-5 pe-c-dialog-close-clear border-b border-b-border-hairline"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <!-- Cut from the start, as every path is: the leaf tells two
               files apart (DESIGN.md, The Truncate Inside Rule). -->
          <Dialog.Title look="path"><bdi>{filePath}</bdi></Dialog.Title>
          <CopyButton
            fit="square-24"
            size="icon-sm"
            text={filePath}
            variant="ghost"
          />
        </div>
        <div data-slot="num" class="num flex items-center gap-2 text-meta">
          <span class="text-success-9">+{stats.additions}</span>
          <span class="text-error-9">-{stats.deletions}</span>
        </div>
      </div>
      <ToggleGroup.Root
        aria-label="Diff layout"
        onValueChange={(next) => {
          if (next) {
            diffStyle = next as "unified" | "split";
          }
        }}
        type="single"
        value={diffStyle}
      >
        <ToggleGroup.Item value="unified"
          ><IconAlignLeft /><span>Unified</span></ToggleGroup.Item
        >
        <ToggleGroup.Item value="split"
          ><IconColumns /><span>Split</span></ToggleGroup.Item
        >
      </ToggleGroup.Root>
    </header>

    <div class="relative flex-auto min-h-0 overflow-auto">
      {#key diffStyle}
        <div
          data-slot="layer"
          class="min-h-full"
          style:--diffs-font-size="var(--text-label)"
          style:--diffs-line-height="var(--leading-code)"
          style:--diffs-bg-separator-override="var(--muted)"
          in:crossIn
          out:crossOut
          {@attach drawn(diffStyle)}
        ></div>
      {/key}
    </div>
  </Dialog.Content>
</Dialog.Root>
