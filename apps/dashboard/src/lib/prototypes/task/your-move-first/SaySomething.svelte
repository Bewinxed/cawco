<script lang="ts">
  /**
   * Say something: a comment field whose helper line says where the words
   * go before they are sent: to the live session at its next step, to the
   * ended session that continues with them, or into the task for the next
   * attempt. A comment appears once, in the history.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconSend } from "#lib/icons.js";
  import type { TaskRead } from "./fixtures/types";

  const uid = $props.id();

  let {
    task,
    draft = $bindable(""),
  }: {
    task: TaskRead;
    draft?: string;
  } = $props();

  const newest = $derived(task.attempts[0]);
  const goes = $derived.by(() => {
    if (task.kind === "done" || task.kind === "dropped" || !newest) {
      return words.say.toFile;
    }
    if (newest.state === "running") {
      return words.say.toLive(newest.session.title);
    }
    return words.say.toEnded(newest.session.title);
  });
</script>

<div class="flex flex-col gap-space-2" data-slot="say">
  <label class="sr-only" for={`${uid}-say-field`}>{words.say.heading}</label>
  <Textarea
    id={`${uid}-say-field`}
    placeholder={words.say.placeholder}
    rows={2}
    bind:value={draft}
  />
  <div class="flex items-center justify-between gap-space-3">
    <span class="min-w-0 type-meta text-ink-muted text-pretty">{goes}</span>
    <Button
      class="flex-none"
      disabled={draft.trim() === ""}
      icon={IconSend}
      label={words.say.send}
      size="sm"
      variant="outline"
    />
  </div>
</div>
