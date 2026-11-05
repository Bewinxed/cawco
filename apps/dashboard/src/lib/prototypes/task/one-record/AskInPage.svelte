<script lang="ts">
  /**
   * A question unfolded in the page under the control that asked it
   * (DESIGN.md, Asking in the page): a raised tile holding the question in
   * label, its consequence in meta, a field when the act carries words
   * (Send back's note, Drop's reason), then Cancel and the verb. It takes
   * the focus on Cancel as it opens and nothing else: the page scrolls and
   * every other control still answers. The verb stays pending until the hub
   * answers; a refusal stays under the question in the hub's words.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Textarea from "#lib/components/ui/textarea/textarea.svelte";

  let {
    title,
    consequence,
    field = null,
    verb,
    pendingVerb,
    pending = false,
    destructive = false,
    refused = null,
    onconfirm,
    oncancel,
  }: {
    title: string;
    consequence: string;
    /** The field's label, when the act carries words. */
    field?: string | null;
    verb: string;
    pendingVerb: string;
    pending?: boolean;
    destructive?: boolean;
    /** The hub's refusal, in its words. */
    refused?: string | null;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  const id = $props.id();
  let note = $state("");

  function arrive(node: HTMLElement) {
    const frame = requestAnimationFrame(() => {
      node
        .querySelector<HTMLElement>("[data-ask-cancel]")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }
</script>

<section
  aria-labelledby="{id}-title"
  class="min-w-0 py-space-1"
  data-ask
  transition:unfold
  {@attach arrive}
>
  <div
    class="grid grid-cols-1 gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
  >
    <p class="m-0 type-label text-balance text-ink-strong" id="{id}-title">
      {title}
    </p>
    <p class="m-0 type-meta text-pretty text-ink-muted">{consequence}</p>
    {#if field}
      <label class="grid gap-space-1">
        <span class="type-meta text-ink-muted">{field}</span>
        <Textarea bind:value={note} rows={2} />
      </label>
    {/if}
    {#if refused}
      <p class="m-0 type-meta text-pretty text-error-11" role="alert">
        {refused}
      </p>
    {/if}
    <div class="flex flex-wrap justify-end gap-space-2">
      <Button
        data-ask-cancel
        disabled={pending}
        label={words.cancel}
        size="sm"
        variant="ghost"
        onclick={oncancel}
      />
      <Button
        label={verb}
        {pending}
        pendingLabel={pendingVerb}
        failed={refused !== null}
        size="sm"
        variant={destructive ? "destructive" : "outline"}
        onclick={onconfirm}
      />
    </div>
  </div>
</section>
