<script lang="ts">
  /**
   * The task's head (DESIGN.md, The Title Bars Follow Liquid Glass Rule):
   * one row with no ground of its own. Leading, Back on its glass, then the
   * task's title and its stage; trailing, Open session and More on one
   * capsule of glass, then the one prominent act. The act is coral only
   * while the stage is of kind `you` (Pass on); in every other state the
   * head carries none, as the project's one coral control is Ask Caw. On a
   * phone Open session goes under More, as the head keeps only what matters
   * most there.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChevronLeft, IconTranscript } from "#lib/icons.js";
  import MoreMenu from "./MoreMenu.svelte";

  let {
    title,
    stage,
    kind,
    back = null,
    form,
    sessionOpen = false,
    passOn = null,
    closed = false,
    onback,
    onsession,
    onpasson,
  }: {
    title: string;
    stage: string;
    /** The stage's kind, in words. */
    kind: string;
    /** Where Back goes when the task was opened in another task's place: that task's title. */
    back?: string | null;
    form: "desk" | "phone";
    sessionOpen?: boolean;
    /** The prominent act, while the stage is of kind `you`; its pending state while the hub answers. */
    passOn?: { pending: boolean } | null;
    /** The task is done or dropped: More offers Reopen in place of Drop. */
    closed?: boolean;
    onback?: () => void;
    onsession?: () => void;
    onpasson?: () => void;
  } = $props();

  const backLabel = $derived(back ? words.backToTask(back) : words.backToBoard);
  const sessionLabel = $derived(
    sessionOpen ? words.closeSession : words.openSession
  );
</script>

<header
  class="flex h-c-top-bar-h min-w-0 flex-none items-center gap-space-3"
  data-slot="task-head"
>
  <BarGlass form="group">
    <Button
      aria-label={backLabel}
      icon={IconChevronLeft}
      onclick={onback}
      size="icon-sm"
      title={backLabel}
      variant="ghost"
    />
  </BarGlass>
  <div class="flex min-w-0 flex-1 items-center gap-space-2">
    <h1 class="min-w-0 truncate type-row text-ink-strong" {title}>
      {title}
    </h1>
    <Badge aria-label={words.stageChip(stage, kind)} variant="secondary"
      ><span>{stage}</span></Badge
    >
  </div>
  <div class="flex flex-none items-center gap-space-2">
    <BarGlass form="group">
      {#if form === "desk"}
        <Button
          aria-label={sessionLabel}
          aria-pressed={sessionOpen}
          expanded="pressed"
          icon={IconTranscript}
          onclick={onsession}
          size="icon-sm"
          title={sessionLabel}
          variant="ghost"
        />
      {/if}
      <MoreMenu>
        {#if form === "phone"}
          <DropdownMenu.Item onSelect={onsession}
            >{words.openSession}</DropdownMenu.Item
          >
          <DropdownMenu.Separator />
        {/if}
        <DropdownMenu.Item>{words.moveTo}</DropdownMenu.Item>
        {#if closed}
          <DropdownMenu.Item>{words.reopen}</DropdownMenu.Item>
        {:else}
          <DropdownMenu.Item>{words.drop}</DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item>{words.link}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item>{words.archive}</DropdownMenu.Item>
      </MoreMenu>
    </BarGlass>
    {#if passOn}
      <Button
        label={words.passOn}
        onclick={onpasson}
        pending={passOn.pending}
        pendingLabel={words.passingOn}
        size={form === "phone" ? "sm" : "default"}
      />
    {/if}
  </div>
</header>
