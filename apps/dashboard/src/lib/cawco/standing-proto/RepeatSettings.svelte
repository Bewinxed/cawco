<script lang="ts">
  import type { When } from "#lib/cawco/routines/when.js";
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * How a task repeats, at the head of its Details: what it checks, when it
   * checks something ("What it checks: Staging is healthy"), what starts each run in
   * words ("Every weekday at 09:00", "When a pull request merges to main"),
   * when it stops ("Keeps running", "Until it's true"), and, when it is not
   * simply running, where it stands. Edit turns it into the fields New task
   * asks them in (RepeatFields), Never left out; Change with Caw puts the
   * ask in Caw's composer. Laid out as the task's Fields are, so the two
   * key columns stand on one line.
   */
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { IconPen, IconSparkles } from "#lib/icons.js";
  import RepeatFields from "./RepeatFields.svelte";
  import {
    EVENTS,
    type RepeatDraft,
    type RepeatKind,
    scheduleWords,
    whenOfWords,
  } from "./repeat-draft";
  import { endWords, standingWords } from "./repeat-words";
  import type { Repeat } from "./repeating-data";

  let {
    repeat,
    title,
    onchange,
    onaskcaw,
  }: {
    repeat: Repeat;
    /** The task's title: what it states. */
    title: string;
    /** Saves how it repeats, as Edit set it. */
    onchange: (draft: RepeatDraft) => void;
    /** Puts the words in Caw's composer, his panel open. */
    onaskcaw: (prompt: string) => void;
  } = $props();

  const standing = $derived(standingWords(repeat));

  /** Edit open, with its fields as they read when it opened. */
  let editing = $state<{
    doneWhen: string;
    event: string;
    kind: RepeatKind;
    when: When;
  } | null>(null);

  function edit() {
    editing = {
      doneWhen: repeat.end === "until-true" ? title : "",
      event: repeat.trigger.kind === "event" ? repeat.trigger.words : EVENTS[0],
      kind: repeat.trigger.kind,
      when: whenOfWords(repeat.trigger.words),
    };
  }

  function save() {
    if (!editing) {
      return;
    }
    onchange({
      doneWhen: editing.doneWhen.trim(),
      event: editing.event,
      kind: editing.kind,
      words: scheduleWords(editing.when),
    });
    editing = null;
  }
</script>

<section class="flex flex-col gap-space-2" data-slot="repeats">
  <h3 class={sectionHeadVariants({ inset: "flush" })}>Repeats</h3>
  {#if editing}
    <form
      class="flex flex-col gap-space-3"
      onsubmit={(submitted) => {
        submitted.preventDefault();
        save();
      }}
    >
      <RepeatFields
        id="repeat-edit"
        never={false}
        bind:doneWhen={editing.doneWhen}
        bind:happens={editing.event}
        bind:kind={editing.kind}
        bind:when={editing.when}
      />
      <div class="flex items-center gap-space-2">
        <Button label="Save" size="sm" type="submit" />
        <Button
          label="Cancel"
          onclick={() => {
            editing = null;
          }}
          size="sm"
          variant="ghost"
        />
      </div>
    </form>
  {:else}
    {#if repeat.kind === "check"}
      <p class="m-0 type-body text-pretty text-ink-strong" data-slot="checks">
        <span class="text-ink-muted">What it checks:</span>
        {title}
      </p>
    {/if}
    <!-- The Fields' key column, so the two parts' values stand on one line. -->
    <dl
      class="m-0 grid grid-cols-(--cols) gap-x-space-2 gap-y-space-1"
      style:--cols="calc(var(--spacing) * 24) minmax(0, 1fr)"
    >
      <dt class="pt-space-1 type-meta text-ink-muted">Runs</dt>
      <dd class="m-0 px-space-2 py-space-1 type-body text-ink-strong">
        {repeat.trigger.words}
      </dd>
      <dt class="pt-space-1 type-meta text-ink-muted">Stops</dt>
      <dd class="m-0 px-space-2 py-space-1 type-body text-ink-strong">
        {endWords(repeat.end)}
      </dd>
    </dl>
    {#if standing}
      <p class="m-0 type-meta text-pretty text-ink-muted">{standing}</p>
    {/if}
    <div class="flex flex-wrap items-center gap-space-2">
      <Button
        icon={IconPen}
        label="Edit"
        onclick={edit}
        size="sm"
        variant="outline"
      />
      <Button
        icon={IconSparkles}
        label="Change with Caw"
        onclick={() => onaskcaw(`Change how "${title}" repeats: `)}
        size="sm"
        variant="outline"
      />
    </div>
  {/if}
</section>
