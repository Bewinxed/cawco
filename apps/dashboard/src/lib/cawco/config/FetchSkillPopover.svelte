<script lang="ts">
  /**
   * Fetch a skill, from the section's primary button: a source and a name,
   * then — when the repo holds several — which one. The hub downloads the
   * files once and every machine writes them into ~/.claude/skills.
   */
  import {
    type FleetSkillMeta,
    projectClaudeRelative,
    userLayerLabel,
  } from "@cawco/core";
  import { tick } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { closeInto } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconPlus } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import {
    normalizeSkillSource,
    pickSkill,
    saveSkill,
    skillNameProblem,
    suggestSkillName,
  } from "../fleet";
  import Field from "./Field.svelte";
  import PickerChip from "./PickerChip.svelte";

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
  /** One project's only (placed in each of its checkouts and workspaces); "" for every machine. */
  let projectId = $state("");
  const project = $derived(
    cawco.projects.find((each) => each.id === projectId)
  );

  const source = $derived(normalizeSkillSource(typed));
  const nameProblem = $derived(skillNameProblem(skillName, taken));
  const ready = $derived(source !== "" && nameProblem === undefined);

  function reset() {
    typed = "";
    skillName = "";
    named = false;
    failed = undefined;
    choices = [];
    projectId = "";
  }

  async function fetchIt(from: string) {
    busy = true;
    failed = undefined;
    try {
      const row = await saveSkill(skillName.trim(), {
        source: from,
        enabled: true,
        projectId: projectId || null,
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
      // The row it made says the rest: its rollout chip, machine by machine.
      expanded = false;
      reset();
    } catch (error) {
      failed = failureWords(error);
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
        <span>Fetch skill</span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="w-(--pop-w) max-w-(--pop-max) gap-3 p-3"
    style="--pop-w: 380px; --pop-max: calc(100vw - 2rem)"
    bind:ref={surface}
  >
    <!-- literal: 12px -->
    <form
      class="flex flex-col gap-(--form-gap)"
      style:--form-gap="12px"
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
          {#if source !== "" && source !== typed.trim()}
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
        problem={skillName === "" ? undefined : nameProblem}
      >
        {#snippet hint()}
          The directory it lands in —
          <span class="font-mono"
            >{project
              ? projectClaudeRelative("skills", skillName || "name")
              : userLayerLabel("skills", skillName || "name")}</span
          >{project ? ` in each of ${project.name}'s folders` : ""}
        {/snippet}
        <Input
          aria-invalid={skillName !== "" && nameProblem ? "true" : undefined}
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
      <div>
        <PickerChip
          label="Scope"
          onpick={(next) => {
            projectId = next;
          }}
          options={[
            { value: "", label: "Every machine in the fleet" },
            ...cawco.projects.map((each) => ({
              value: each.id,
              label: each.name,
            })),
          ]}
          value={projectId}
        />
      </div>
      {#if choices.length > 0}
        <!-- literal: 13rem, 10px -->
        <div
          class="flex flex-col max-h-(--choices-max) overflow-y-auto"
          style:--choices-max="13rem"
          style:--choice-pad="10px"
          transition:unfold
        >
          <span data-slot="note" class="type-meta text-ink-muted"
            >That repo holds several skills. Pick the one to fetch.</span
          >
          {#each choices as choice (choice)}
            <button
              data-slot="choice"
              class="kit-item px-(--choice-pad) text-left font-(family-name:--font-mono) text-size-meta text-ink-strong focus-inset"
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
        <p class="type-meta text-status-fail-ink" role="alert" transition:unfold>{failed}</p>
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

