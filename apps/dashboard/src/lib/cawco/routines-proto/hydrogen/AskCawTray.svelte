<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconClose, IconSend, IconSparkles } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

  let {
    draft = $bindable(""),
    stale = false,
    onclose,
    onsubmit,
  }: {
    draft?: string;
    onclose: () => void;
    onsubmit: (words: string) => void;
    stale?: boolean;
  } = $props();

  function handleFormSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const text = draft.trim();
    if (!text || stale) {
      return;
    }
    onsubmit(text);
  }
</script>

<form
  class="flex flex-col gap-space-3 rounded-lg border border-border-control bg-surface-raised p-space-4 shadow-tile"
  data-slot="ask-caw-tray"
  onsubmit={handleFormSubmit}
  transition:unfold
>
  <header class="flex items-center justify-between gap-space-3">
    <h3
      class="mark-line m-0 inline-flex items-center gap-space-2 type-label text-ink-strong"
    >
      <IconSparkles class="size-icon-md flex-none text-brand-ink" />
      <span>Tell Caw what to set up or change</span>
    </h3>
    <Button
      aria-label="Close Ask Caw"
      icon={IconClose}
      onclick={onclose}
      size="icon-xs"
      tone="quiet"
      variant="ghost"
    />
  </header>

  <Textarea
    aria-label="Message to Caw"
    placeholder="Describe a routine, a goal to check for, or an event trigger…"
    bind:value={draft}
  />

  <div class="flex flex-wrap items-center justify-end gap-space-2">
    <Button label="Cancel" onclick={onclose} size="sm" variant="ghost" />
    <Button
      disabled={stale || !draft.trim()}
      icon={IconSend}
      label="Send to Caw"
      size="sm"
      type="submit"
      variant="outline"
    />
  </div>
</form>
