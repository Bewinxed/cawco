<script lang="ts">
  /**
   * The floating thread's head as it ships (project/CawThread, its head):
   * "Caw" over his line (`said`: the cap's line, "Answers when you write"
   * while off, else his sentence, "Awake · resting" at rest), then New
   * thread and Open as a tab. Drawn here, with the same words, because the
   * shipped thread (ThreadPane, docked) reads its messages from the hub, and
   * the card comparing it with one panel draws both on one conversation.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconMaximize, IconPlus } from "#lib/icons.js";
</script>

<div
  class="flex min-h-c-btn-h-lg shrink-0 items-center gap-space-2 border-b border-border-hairline py-space-1 ps-space-3 pe-space-1"
  data-panel-head="today"
>
  <span class="flex min-w-0 flex-col">
    <span class="text-ink-strong text-label">Caw</span>
    <span class="min-w-0 truncate text-ink-muted text-meta"
      >Awake · resting</span
    >
  </span>
  <span class="ms-auto flex shrink-0 items-center">
    <Button
      aria-label="New thread"
      icon={IconPlus}
      size="icon-sm"
      variant="ghost"
    />
    <Button
      aria-label="Open as a tab"
      icon={IconMaximize}
      size="icon-sm"
      variant="ghost"
    />
  </span>
</div>
