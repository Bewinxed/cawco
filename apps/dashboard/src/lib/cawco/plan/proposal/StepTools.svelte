<script lang="ts">
  /**
   * WHAT THE PERSON CAN DO TO A STEP (proposal), inside its opened fold or
   * its page: reword it, move it up or down, add a step under it, remove
   * it, and comment on it, its thread living on the step. Each change is
   * told to whoever conducts the step (view.svelte.ts `receiverOf`), and
   * the row's acknowledgement line follows it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowDown, IconArrowUp } from "#lib/icons.js";
  import { ON_WORDS } from "./classes";
  import type { PlanFixture, Step } from "./fixtures";
  import { midSentence, receiverOf, useView } from "./view.svelte";

  let {
    step,
    plan,
    steps,
  }: {
    step: Step;
    plan: PlanFixture;
    /** The plan's rows as they stand, for a move. */
    steps: Step[];
  } = $props();

  const view = useView();
  const uid = $props.id();
  /** The one field open: rewording the step, or adding a step under it. */
  let editing = $state<"reword" | "add" | null>(null);
  let draft = $state("");
  let comment = $state("");
  const thread = $derived(view.threads.get(step.id) ?? []);
  const who = $derived(receiverOf(plan, step));
  const at = $derived(steps.findIndex((one) => one.id === step.id));

  function start(kind: "reword" | "add"): void {
    editing = kind;
    draft = kind === "reword" ? step.words : "";
  }

  function save(): void {
    const words = draft.trim();
    if (!words) {
      editing = null;
      return;
    }
    if (editing === "reword") {
      view.words.set(step.id, words);
      view.tell(step, "reworded");
    } else if (editing === "add") {
      view.addedSubs.set(step.id, [
        ...(view.addedSubs.get(step.id) ?? []),
        { id: `${step.id}-new-${Date.now()}`, words, state: "todo" },
      ]);
      view.tell(step, "added");
    }
    editing = null;
  }

  function send(): void {
    const text = comment.trim();
    if (!text) {
      return;
    }
    view.threads.set(step.id, [...thread, { by: "You", text }]);
    view.tell(step, "commented", text);
    comment = "";
  }
</script>

<div
  class={[ON_WORDS, "flex min-w-0 flex-col gap-space-2"]}
  data-slot="step-tools"
>
  <!-- The house ghost buttons at the 30px size, one group that fits one
       line: moving is two icon buttons, named for assistive tech. It moves
       to a line of its own as a whole rather than leaving a button
       orphaned on the next; in a narrow column (Lanes' steps side by side)
       it cannot stand on one line, and wraps, its moving pair kept together
       by its gap. -->
  <div
    aria-label="Change this step"
    class="-ms-space-2 flex min-w-0 flex-nowrap items-center gap-space-row @max-plan-step/step-row:ms-0 @max-plan-step/step-row:flex-wrap"
    role="toolbar"
  >
    <Button onclick={() => start("reword")} size="sm" variant="ghost"
      >Reword</Button
    >
    <Button
      aria-label="Move up"
      disabled={at <= 0}
      onclick={() => {
        view.move(steps, step.id, -1);
        view.tell(step, "moved");
      }}
      size="icon-sm"
      variant="ghost"><IconArrowUp aria-hidden="true" /></Button
    >
    <Button
      aria-label="Move down"
      disabled={at < 0 || at >= steps.length - 1}
      onclick={() => {
        view.move(steps, step.id, 1);
        view.tell(step, "moved");
      }}
      size="icon-sm"
      variant="ghost"><IconArrowDown aria-hidden="true" /></Button
    >
    <Button onclick={() => start("add")} size="sm" variant="ghost"
      >Add a step</Button
    >
    <Button
      onclick={() => {
        view.removed.add(step.id);
        view.tell(step, "removed");
      }}
      size="sm"
      variant="ghost">Remove</Button
    >
  </div>
  {#if editing}
    <form
      class="flex min-w-0 items-end gap-space-2"
      onsubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label class="sr-only" for="edit-{uid}"
        >{editing === "reword" ? "The step's words" : "The new step"}</label
      >
      <input
        bind:value={draft}
        class="focus-inset min-h-c-btn-h-sm min-w-0 flex-auto rounded-sm border border-border-control bg-surface-raised px-space-2 py-space-1 type-body text-ink-strong in-data-coarse:min-h-c-touch-floor"
        id="edit-{uid}"
        onkeydown={(event) => {
          if (event.key === "Escape") {
            editing = null;
          }
        }}
        placeholder={editing === "reword" ? "" : "What to do"}
      />
      <Button size="sm" type="submit" variant="outline">Save</Button>
      <Button
        onclick={() => {
          editing = null;
        }}
        size="sm"
        variant="ghost">Cancel</Button
      >
    </form>
  {/if}
  <div class="flex flex-col gap-space-1" data-slot="thread">
    {#each thread as message, index (index)}
      <p
        class={[
          "m-0 rounded-sm py-space-1 type-meta wrap-anywhere text-pretty text-ink-strong",
          message.answer ? "px-0" : "bg-surface-recess px-space-2",
        ]}
        data-answer={message.answer || undefined}
      >
        <span class="font-medium">{message.by}</span>
        <span>{message.text}</span>
      </p>
    {/each}
    <form
      class="flex min-w-0 items-end gap-space-2"
      onsubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label class="sr-only" for="say-{uid}">Comment on this step</label>
      <textarea
        bind:value={comment}
        class="focus-inset min-h-c-btn-h-sm min-w-0 flex-auto rounded-sm border border-border-control bg-surface-raised px-space-2 py-space-1 type-body text-ink-strong in-data-coarse:min-h-c-touch-floor resize-y"
        id="say-{uid}"
        onkeydown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
        placeholder="Comment for {midSentence(who.to)}"
        rows="1"></textarea>
      <!-- Outline, not the coral primary: disabled, the recipe's 50% keeps
           ink on paper rather than white on a pale coral. -->
      <Button
        disabled={!comment.trim()}
        size="sm"
        type="submit"
        variant="outline">Comment</Button
      >
    </form>
  </div>
</div>
