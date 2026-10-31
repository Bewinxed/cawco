<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconSend } from "#lib/icons.js";
  import { sendLabel, WORDS } from "./words.js";

  /**
   * The thread's one act after picking: words and Send together. Words with
   * no pick are him talking back; one Send carries every pick in the thread
   * and the words with them. Send stays named for what it sends.
   */
  let {
    draft = $bindable(""),
    picks,
    pending = false,
    onsend,
  }: {
    draft?: string;
    /** Picks held and not yet sent. */
    picks: number;
    pending?: boolean;
    onsend?: () => void;
  } = $props();

  const words = $derived(draft.trim().length > 0);
  const label = $derived(sendLabel(picks, words));
</script>

<form
  class="grid min-w-0 grid-cols-fluid-auto items-end gap-space-2 rounded-lg border border-border-control bg-material-panel p-space-2 ps-space-3 shadow-tile"
  onsubmit={(event) => {
    event.preventDefault();
    if (picks > 0 || words) {
      onsend?.();
    }
  }}
>
  <Textarea
    area={false}
    aria-label={WORDS.composerLabel}
    bind:value={draft}
    look="note"
    onkeydown={(event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    }}
    placeholder={WORDS.composerPlaceholder}
    rows={1}
  />
  <Button
    disabled={!(picks > 0 || words)}
    icon={IconSend}
    {label}
    {pending}
    pendingLabel="Sending…"
    shape="inset"
    size="composer"
    type="submit"
  />
</form>
