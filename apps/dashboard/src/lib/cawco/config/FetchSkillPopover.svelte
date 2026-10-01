<script lang="ts">
  /**
   * Fetch a skill, from the section's primary button: a source and a name,
   * then — when the repo holds several — which one. The hub downloads the
   * files once and every machine writes them into ~/.claude/skills.
   */
  import type { FleetSkillMeta } from "@cawco/core";
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { unfold } from "$lib/cawco/motion/fold.svelte";
  import { closeInto } from "$lib/cawco/motion/share.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import { IconPlus } from "$lib/icons";
  import {
    formatBytes,
    normalizeSkillSource,
    pickSkill,
    saveSkill,
    skillNameProblem,
    suggestSkillName,
  } from "../fleet";
  import Field from "./Field.svelte";

  let {
    taken,
    down,
    onsaved,
  }: {
    taken: string[];
    /** Why the hub cannot take a write, or null: the trigger and the submit
        are disabled on it and say it as their title. */
    down: string | null;
    onsaved: (row: FleetSkillMeta) => void;
  } = $props();

  let expanded = $state(false);
  let typed = $state("");
  let skillName = $state("");
  let named = $state(false);
  let busy = $state(false);
  let failed = $state<string | undefined>(undefined);
  let choices = $state<string[]>([]);
  let surface = $state<HTMLElement | null>(null);

  const source = $derived(normalizeSkillSource(typed));
  const nameProblem = $derived(skillNameProblem(skillName, taken));
  const ready = $derived(source !== "" && nameProblem === undefined);

  function reset() {
    typed = "";
    skillName = "";
    named = false;
    failed = undefined;
    choices = [];
  }

  async function fetchIt(from: string) {
    busy = true;
    failed = undefined;
    try {
      const row = await saveSkill(skillName.trim(), {
        source: from,
        enabled: true,
      });
      onsaved(row);
      if (row.choices && row.choices.length > 0) {
        ({ choices } = row);
        return;
      }
      // The form closes into the row it made.
      await tick();
      const made = document.querySelector<HTMLElement>(
        `[data-row-name="${CSS.escape(row.name)}"]`
      );
      const closing = surface && made ? closeInto(surface, made) : undefined;
      await closing?.finished.catch(() => undefined);
      expanded = false;
      reset();
      if (!row.error) {
        toast.success(
          row.bytes === undefined
            ? `${row.name} is on its way to every machine.`
            : `${row.name} — ${formatBytes(row.bytes)} on its way to every machine.`
        );
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  function choose(choice: string) {
    typed = pickSkill(source, choice);
    choices = [];
    // biome-ignore lint/complexity/noVoid: fetchIt tracks its own busy/failed state
    void fetchIt(typed);
  }
</script>

<Popover.Root
  onOpenChange={(next) => {
    if (!next) {
      reset();
    }
  }}
  bind:open={expanded}
>
  <Popover.Trigger disabled={down !== null}>
    {#snippet child({ props })}
      <Button {...props} disabled={down !== null} title={down ?? undefined}>
        <IconPlus />
        Fetch skill
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="w-[380px] max-w-[calc(100vw-2rem)] gap-3 p-3"
    bind:ref={surface}
  >
    <form
      class="form"
      onsubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) {
          // biome-ignore lint/complexity/noVoid: fetchIt tracks its own busy/failed state
          void fetchIt(source);
        }
      }}
    >
      <Field id="skill-source" label="Source">
        {#snippet hint()}
          {#if source !== '' && source !== typed.trim()}
            Reads as <span class="font-mono">{source}</span>
          {:else}
            The install command, an <span class="font-mono">owner/repo</span>
            slug, or a <span class="font-mono">skills:</span>,
            <span class="font-mono">github:</span>,
            <span class="font-mono">npm:</span>
            or
            <span class="font-mono">https://</span>
            source.
          {/if}
        {/snippet}
        <Input
          autocomplete="off"
          class="font-mono"
          id="skill-source"
          oninput={() => {
            if (!named) {
              skillName = suggestSkillName(normalizeSkillSource(typed));
            }
          }}
          placeholder="bunx skills add pbakaus/impeccable"
          spellcheck="false"
          bind:value={typed}
        />
      </Field>
      <Field
        id="skill-name"
        label="Name"
        problem={skillName === '' ? undefined : nameProblem}
      >
        {#snippet hint()}
          The directory it lands in —
          <span class="font-mono">~/.claude/skills/{skillName || 'name'}</span>
        {/snippet}
        <Input
          aria-invalid={skillName !== '' && nameProblem ? 'true' : undefined}
          autocomplete="off"
          class="font-mono"
          id="skill-name"
          oninput={() => {
            named = true;
          }}
          placeholder="impeccable"
          spellcheck="false"
          bind:value={skillName}
        />
      </Field>
      {#if choices.length > 0}
        <div class="choices" transition:unfold>
          <span class="note"
            >That repo holds several skills. Pick the one to fetch.</span
          >
          {#each choices as choice (choice)}
            <button
              class="kit-item choice focus-inset"
              disabled={busy}
              onclick={() => choose(choice)}
              type="button"
            >
              {choice}
            </button>
          {/each}
        </div>
      {/if}
      {#if failed}
        <p class="problem" role="alert" transition:unfold>{failed}</p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null || !ready}
        failed={failed !== undefined}
        label="Fetch skill"
        pending={busy}
        pendingLabel="Fetching…"
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .choices {
    display: flex;
    flex-direction: column;
    max-height: 13rem;
    overflow-y: auto;
  }
  .choice {
    padding: 0 10px;
    text-align: left;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
  }
</style>
