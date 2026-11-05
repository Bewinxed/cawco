<script lang="ts">
  /**
   * Asking in the page (DESIGN.md's recipe): the question unfolds in the
   * flow under the control that asked, a raised tile holding the title, the
   * consequence, then Cancel and the verb. It takes the focus on Cancel; the
   * verb stays pending until the hub answers, and a refusal stays under the
   * question in the hub's words.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    title,
    consequence,
    verb,
    pendingVerb,
    pending = false,
    oncancel,
    onconfirm,
  }: {
    title: string;
    consequence: string;
    verb: string;
    pendingVerb: string;
    pending?: boolean;
    oncancel?: () => void;
    onconfirm?: () => void;
  } = $props();

  const id = $props.id();

  /** In hand as it opens: the focus on Cancel, Escape puts it away. */
  function arrive(node: HTMLElement) {
    const frame = requestAnimationFrame(() => {
      node.querySelector<HTMLElement>("[data-ask-cancel]")?.focus();
    });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.stopPropagation();
        oncancel?.();
      }
    };
    node.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("keydown", onEscape);
    };
  }
</script>

<section
  aria-labelledby="{id}-title"
  class="min-w-0 py-space-1"
  transition:unfold
  {@attach arrive}
>
  <div
    class="grid grid-cols-1 gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
  >
    <p class="type-label text-balance text-ink-strong" id="{id}-title">
      {title}
    </p>
    <p class="type-meta text-pretty text-ink-muted">{consequence}</p>
    <div class="flex items-center justify-end gap-space-2 pt-space-1">
      <Button
        data-ask-cancel
        disabled={pending}
        label={words.cancel}
        onclick={oncancel}
        size="sm"
        variant="ghost"
      />
      <Button
        label={verb}
        onclick={onconfirm}
        {pending}
        pendingLabel={pendingVerb}
        size="sm"
        variant="destructive"
      />
    </div>
  </div>
</section>
