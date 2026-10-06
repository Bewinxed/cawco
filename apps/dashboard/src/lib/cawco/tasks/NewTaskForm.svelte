<script lang="ts">
  /**
   * A new task, inline where it will appear: a title, and the stage it
   * starts in. On the board the column is the stage; the table asks for one
   * (`stages`), starting from the project's first to-do stage. The form stays
   * open after an add, so a run of tasks is typed one after another, and the
   * hub's refusal is said under the field, in its own words.
   */
  import { tick } from "svelte";
  import { type Stage, stageLabel } from "#lib/cawco/project-tasks.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    open = $bindable(false),
    stage,
    stages,
    primary = false,
    oncreate,
  }: {
    open?: boolean;
    /** Closed, the form is the page's one action (a first-use empty state). */
    primary?: boolean;
    /** The stage a new task starts in. */
    stage: string;
    /** Offer a stage picker over these (the table); the board's column is the stage. */
    stages?: Stage[];
    oncreate: (title: string, stage: string) => Promise<void>;
  } = $props();

  let title = $state("");
  let picked = $state<string | null>(null);
  let pending = $state(false);
  let problem = $state<string | null>(null);
  let field = $state<HTMLInputElement | null>(null);
  const into = $derived(picked ?? stage);

  $effect(() => {
    if (open) {
      tick().then(() => field?.focus());
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text || pending) {
      return;
    }
    pending = true;
    problem = null;
    try {
      await oncreate(text, into);
      title = "";
      field?.focus();
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      pending = false;
    }
  }

  function close() {
    open = false;
    title = "";
    problem = null;
  }
</script>

{#if open}
  <form class="new-task" onsubmit={submit}>
    <Input
      aria-label="Task title"
      autocomplete="off"
      onkeydown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
      placeholder="What needs doing?"
      bind:ref={field}
      bind:value={title}
    />
    {#if problem}
      <p class="problem" role="alert">{problem}</p>
    {/if}
    <div class="actions">
      {#if stages}
        <Select.Root
          onValueChange={(value) => {
            picked = value;
          }}
          type="single"
          value={into}
        >
          <Select.Trigger aria-label="Stage" class="mr-auto" size="sm">
            {stageLabel(into)}
          </Select.Trigger>
          <Select.Content>
            {#each stages as each (each.name)}
              <Select.Item label={stageLabel(each.name)} value={each.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}
      <Button onclick={close} size="sm" type="button" variant="ghost">
        Cancel
      </Button>
      <Button
        disabled={!title.trim()}
        label="Add task"
        {pending}
        pendingLabel="Adding…"
        size="sm"
        type="submit"
      />
    </div>
  </form>
{:else if primary}
  <Button
    class="pressable"
    onclick={() => {
      open = true;
    }}
  >
    <IconPlus />
    Add task
  </Button>
{:else}
  <Button
    class="add-task justify-start text-muted-foreground"
    onclick={() => {
      open = true;
    }}
    press="tint"
    size="sm"
    variant="ghost"
  >
    <IconPlus />
    Add task
  </Button>
{/if}

<style>
  .new-task {
    display: flex;
    inline-size: 100%;
    flex-direction: column;
    gap: var(--space-2);
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
  }
  .problem {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
