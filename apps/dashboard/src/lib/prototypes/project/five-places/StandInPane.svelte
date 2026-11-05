<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * The pane a task (or a decision page) opens in, drawn as a plain stand-in
   * of its real size: the task's insides are designed separately. At 900
   * and up it slides over the right third of the list, which stays live
   * beneath it; under 900 it rises from the foot as a drawer. Its one way
   * back returns to the list with the card where it was.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowLeft, IconClose } from "#lib/icons.js";
  import { paneSlide } from "./motion";

  let {
    id,
    title,
    stage,
    line,
    onclose,
  }: {
    id: string;
    title: string;
    stage?: string;
    /** What will be here. */
    line: string;
    onclose: () => void;
  } = $props();
</script>

<aside
  in:paneSlide={{ leaving: false }}
  out:paneSlide={{ leaving: true }}
  aria-label={`${words.taskPane}: ${title}`}
  class="absolute inset-x-0 bottom-0 z-2 flex h-5/6 flex-col rounded-t-lg bg-surface-raised shadow-drawer @desk/five:inset-y-0 @desk/five:start-auto @desk/five:end-0 @desk/five:h-full @desk/five:w-1/3 @desk/five:min-w-c-panel-w @desk/five:rounded-none @desk/five:rounded-s-lg"
>
  <div class="flex h-c-top-bar-h flex-none items-center gap-space-2 px-space-3">
    <span class="@desk/five:hidden">
      <Button
        aria-label={words.closeTask}
        icon={IconArrowLeft}
        onclick={onclose}
        size="icon-sm"
        variant="ghost"
      />
    </span>
    <span
      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap font-mono type-meta text-ink-muted"
      >{id}{stage ? ` · ${stage}` : ""}</span
    >
    <span class="hidden @desk/five:inline-flex">
      <Button
        aria-label={words.closeTask}
        icon={IconClose}
        onclick={onclose}
        size="icon-sm"
        variant="ghost"
      />
    </span>
  </div>
  <div class="flex min-h-0 flex-1 flex-col gap-space-4 px-space-6 pb-space-6">
    <h2 class="type-title text-ink-strong text-balance">{title}</h2>
    <div
      class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border-control p-space-6"
    >
      <p
        class="max-w-c-measure-short text-center type-body text-ink-muted text-pretty"
      >
        {line}
      </p>
    </div>
  </div>
</aside>
