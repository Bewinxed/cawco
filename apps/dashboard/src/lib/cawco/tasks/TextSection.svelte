<script lang="ts">
  /**
   * One of a task file's own text sections (its description, its acceptance
   * criteria): read as markdown, edited as the text it is. Save writes it
   * back through the hub, which commits it; a refusal stays under the field
   * with the draft kept.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";

  let {
    heading,
    text,
    empty,
    onsave,
  }: {
    heading: string;
    text: string;
    /** What the section says while it holds nothing, and why it would. */
    empty: string;
    onsave: (text: string) => Promise<void>;
  } = $props();

  let draft = $state<string | null>(null);
  let saving = $state(false);
  let problem = $state<string | null>(null);

  async function save() {
    if (draft === null) {
      return;
    }
    saving = true;
    problem = null;
    try {
      await onsave(draft);
      draft = null;
    } catch (error) {
      problem = failureWords(error);
    } finally {
      saving = false;
    }
  }
</script>

<section class="flex flex-col gap-space-2">
  <h3 class="kit-section-head min-h-c-btn-h-xs m-0 px-0">
    <span>{heading}</span>
    {#if draft === null}
      <Button
        data-text-section-count
        data-box
        class="count"
        onclick={() => {
          draft = text;
        }}
        size="xs"
        variant="ghost">Edit</Button
      >
    {/if}
  </h3>
  {#if draft !== null}
    <div class="flex flex-col gap-space-2">
      <Textarea
        aria-label={heading}
        class="font-mono text-label"
        onkeydown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            draft = null;
            problem = null;
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            save();
          }
        }}
        spellcheck="true"
        bind:value={draft}
      />
      {#if problem}
        <p class="type-meta text-error-11" role="alert">{problem}</p>
      {/if}
      <div data-slot="actions" class="flex justify-end gap-space-1">
        <Button
          onclick={() => {
            draft = null;
            problem = null;
          }}
          size="sm"
          variant="ghost">Cancel</Button
        >
        <Button
          failed={problem !== null}
          label="Save"
          onclick={save}
          pending={saving}
          pendingLabel="Saving…"
          size="sm"
          variant="outline"
        />
      </div>
    </div>
  {:else if text.trim()}
    <div class="prose prose-sm dark:prose-invert max-w-none">
      <Markdown source={text} />
    </div>
  {:else}
    <p data-slot="text-section-empty" class="type-body text-ink-subtle">
      {empty}
    </p>
  {/if}
</section>
