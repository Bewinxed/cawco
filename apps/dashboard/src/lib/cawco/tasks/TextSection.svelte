<script lang="ts">
  /**
   * One of a task file's own text sections (its description, its acceptance
   * criteria): read as markdown, edited as the text it is. Save writes it
   * back through the hub, which commits it; a refusal stays under the field
   * with the draft kept.
   */
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
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }
</script>

<section class="part">
  <h3 class="kit-section-head">
    {heading}
    {#if draft === null}
      <Button
        class="count"
        onclick={() => {
          draft = text;
        }}
        size="xs"
        variant="ghost"
        >Edit</Button
      >
    {/if}
  </h3>
  {#if draft !== null}
    <div class="editing">
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
        <p class="problem" role="alert">{problem}</p>
      {/if}
      <div class="actions">
        <Button
          onclick={() => {
            draft = null;
            problem = null;
          }}
          size="sm"
          variant="ghost"
          >Cancel</Button
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
    <p class="empty">{empty}</p>
  {/if}
</section>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part :global(.kit-section-head) {
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .editing {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-1);
  }
  .empty {
    font: var(--type-body);
    color: var(--ink-subtle);
  }
  .problem {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
