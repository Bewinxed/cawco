<script lang="ts">
  /**
   * A diff at full size, in the kit dialog: the file, what changed, and the
   * layout (unified or split) as a segmented control. Each layout is drawn
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
    bodyClass="flex h-full flex-col overflow-hidden"
    bodyPad="flush"
    class="h-(--modal-h) w-(--modal-w)"
    style="--modal-h: 90vh; --modal-w: 95vw"
    width="document"
  >
    <!-- literal: gap 8px 12px, padding 12px 52px 12px 16px -->
    <header
      data-slot="head"
      class="flex flex-wrap items-center justify-between gap-y-(--head-gap-y) gap-x-(--head-gap-x) pt-(--head-pad-y) pr-(--head-pad-end) pb-(--head-pad-y) pl-(--head-pad-start) border-b border-b-border-hairline"
      style:--head-gap-y="8px"
      style:--head-gap-x="12px"
      style:--head-pad-y="12px"
      style:--head-pad-end="52px"
      style:--head-pad-start="16px"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <Dialog.Title look="path">{filePath}</Dialog.Title>
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
          style:--diffs-font-size="0.8125rem"
          style:--diffs-line-height="1.6"
          style:--diffs-bg-separator-override="var(--muted)"
          in:crossIn
          out:crossOut
          {@attach drawn(diffStyle)}
        ></div>
      {/key}
    </div>
  </Dialog.Content>
</Dialog.Root>
