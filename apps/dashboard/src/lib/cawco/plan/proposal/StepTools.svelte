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

<div class="tools" data-slot="step-tools">
  <!-- The house ghost buttons at the 30px size, one group that fits one
       line: moving is two icon buttons, named for assistive tech. -->
  <div aria-label="Change this step" class="acts" role="toolbar">
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
      class="edit"
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
        class="field"
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
  <div class="thread" data-slot="thread">
    {#each thread as message, index (index)}
      <p class="message" data-answer={message.answer || undefined}>
        <span class="by">{message.by}</span>
        <span>{message.text}</span>
      </p>
    {/each}
    <form
      class="say"
      onsubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label class="sr-only" for="say-{uid}">Comment on this step</label>
      <textarea
        bind:value={comment}
        class="field"
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

<style>
  .tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding-inline-start: calc(
      var(--lead-w, var(--pv-tile, 18px)) + var(--space-2)
    );
  }
  /* One group: it moves to a line of its own as a whole rather than
     leaving a button orphaned on the next. */
  .acts {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 2px;
    margin-inline-start: calc(-1 * var(--space-2));
    min-inline-size: 0;
  }
  .edit,
  .say {
    display: flex;
    align-items: end;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .field {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: 30px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-body);
    resize: vertical;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  }
  .thread {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .message {
    margin: 0;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-meta);
    overflow-wrap: anywhere;
    text-wrap: pretty;

    &[data-answer] {
      background: none;
      padding-inline: 0;
    }
  }
  .by {
    font-weight: var(--weight-strong);

    &::after {
      content: " ";
    }
  }
  :global([data-coarse]) .field {
    min-block-size: 44px;
    font-size: 16px;
  }
  /* In a narrow column (Lanes' steps side by side) the group cannot stand
     on one line: it wraps, its moving pair kept together by its gap. */
  @container step-row (inline-size < 15rem) {
    .acts {
      flex-wrap: wrap;
      margin-inline-start: 0;
    }
  }
</style>
