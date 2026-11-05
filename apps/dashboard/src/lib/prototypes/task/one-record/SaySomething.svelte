<script lang="ts">
  /**
   * Say something, at the record's foot: a field and Send comment, and
   * under them where the words go: the live session at its next step, or
   * the file, for the next attempt to read. The sent words come back as
   * one comment entry saying where they went, in the hub's words; until
   * the hub answers, Send comment stays pending and the words stay put.
   * Never coral: on a task, coral is the review's one move.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { Button } from "#lib/components/ui/button/index.js";
  import Textarea from "#lib/components/ui/textarea/textarea.svelte";
  import { IconSend } from "#lib/icons.js";

  let {
    session = null,
    pending = false,
    stale = false,
    onsend,
  }: {
    /** The live session the words go to; null: they wait in the file. */
    session?: string | null;
    pending?: boolean;
    stale?: boolean;
    onsend: () => void;
  } = $props();

  const id = $props.id();
  let text = $state("");
</script>

<form
  data-slot="say-something"
  class="sticky bottom-0 z-1 grid gap-space-1 bg-surface-page pt-space-3 pb-space-4"
  onsubmit={(event) => {
    event.preventDefault();
    onsend();
  }}
>
  <div
    class="flex items-end gap-space-2 rounded-lg border border-border-control bg-surface-raised p-space-2 ps-space-3 shadow-xs"
  >
    <label class="min-w-0 flex-1">
      <span class="sr-only">{words.saySomething}</span>
      <Textarea
        look="note"
        bind:value={text}
        rows={1}
        placeholder={words.saySomething}
        aria-describedby="{id}-goes"
      />
    </label>
    <Button
      size="icon"
      variant="outline"
      type="submit"
      aria-label={words.sendComment}
      icon={IconSend}
      {pending}
      disabled={stale || text.trim() === ""}
    />
  </div>
  <p class="m-0 ps-space-3 type-meta text-ink-muted" id="{id}-goes">
    {session ? words.goesToSession(session) : words.waitsInFile}
  </p>
</form>
