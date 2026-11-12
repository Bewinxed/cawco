<script lang="ts">
  import { setupWords } from "@cawco/core/words/onboarding";
  /**
   * The draft bar once the setup is sent, while the board has no task yet
   * (way `board` of the decision page `onboarding-first-minutes`): the same
   * bar, where it stood, saying the project is set up and the next step in
   * the words Caw uses, with Ask Caw to tell him; Add task stands in the
   * first to-do column under it. It goes once a task is on the board.
   */
  import { projectWords } from "@cawco/core/words/project";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconSuccess } from "#lib/icons.js";

  let {
    name,
    first,
    onask,
  }: {
    /** The project's name. */
    name: string;
    /** The stage new work lands in (the first of kind to do). */
    first: string;
    /** Opens his panel to tell him what to work on. */
    onask: () => void;
  } = $props();
</script>

<div
  class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2 rounded-lg bg-surface-recess px-space-3 py-space-2 inset-ring inset-ring-border-hairline"
  data-slot="draft-bar"
  data-state="set"
>
  <div aria-live="polite" class="min-w-0 shrink grow basis-c-draft-line">
    <p class="mark-line m-0 flex items-center gap-space-2">
      <IconSuccess
        aria-hidden="true"
        class="size-icon-md flex-none text-status-done-glyph"
      />
      <span class="type-label text-ink-strong">{setupWords.isSetUp(name)}</span>
    </p>
    <p class="m-0 type-meta text-ink-muted">{setupWords.firstTask(first)}</p>
  </div>
  <Button
    label={projectWords.askCaw}
    onclick={onask}
    size="sm"
    variant="outline"
  />
</div>
