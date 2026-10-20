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
    skillsWords as words,
  } from "@cawco/core";
  import { tick } from "svelte";
  import Coded from "#lib/cawco/Coded.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { closeInto } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
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
        <span>{words.fetchSkill}</span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="w-c-panel-w max-w-(--bits-popover-content-available-width)"
    gap="form"
    pad="form"
    bind:ref={surface}
  >
    <form
      class="flex flex-col gap-space-3"
      onsubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) {
          // biome-ignore lint/complexity/noVoid: fetchIt tracks its own busy/failed state
          void fetchIt(source);
        }
      }}
    >
      <Field id="skill-source" label={words.source}>
        {#snippet hint()}
          {#if source !== "" && source !== typed.trim()}
            <Coded text={words.readsAs(source)} />
          {:else}
            <Coded text={words.sourceHint} />
          {/if}
        {/snippet}
        <Input
          autocomplete="off"
          face="mono"
          id="skill-source"
          oninput={() => {
            if (!named) {
              skillName = suggestSkillName(normalizeSkillSource(typed));
            }
          }}
          placeholder={words.sourcePlaceholder}
          spellcheck="false"
          bind:value={typed}
        />
      </Field>
      <Field
        id="skill-name"
        label={words.name}
        problem={skillName === "" ? undefined : nameProblem}
      >
        {#snippet hint()}
          {words.landsIn}
          <span class="font-(family-name:--font-mono)"
            >{project
              ? projectClaudeRelative("skills", skillName || "name")
              : userLayerLabel("skills", skillName || "name")}</span
          >{project ? words.inProjectFolders(project.name) : ""}
        {/snippet}
        <Input
          aria-invalid={skillName !== "" && nameProblem ? "true" : undefined}
          autocomplete="off"
          face="mono"
          id="skill-name"
          oninput={() => {
            named = true;
          }}
          placeholder={words.namePlaceholder}
          spellcheck="false"
          bind:value={skillName}
        />
      </Field>
      <div>
        <PickerChip
          label={words.scope}
          onpick={(next) => {
            projectId = next;
          }}
          options={[
            { value: "", label: words.everyMachine },
            ...cawco.projects.map((each) => ({
              value: each.id,
              label: each.name,
            })),
          ]}
          value={projectId}
        />
      </div>
      {#if choices.length > 0}
        <div
          class="flex flex-col max-h-c-choice-list-max-h overflow-y-auto"
          transition:unfold
        >
          <span data-slot="note" class="type-meta text-ink-muted"
            >{words.severalSkills}</span
          >
          {#each choices as choice (choice)}
            <button
              data-slot="choice"
              class={menuItemVariants({
                class:
                  "px-space-3 text-start font-(family-name:--font-mono) text-size-meta text-ink-strong focus-inset",
              })}
              data-menu-item
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
        <p
          class="type-meta text-status-fail-ink"
          role="alert"
          transition:unfold
        >
          {failed}
        </p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null || !ready}
        failed={failed !== undefined}
        label={words.fetchSkill}
        pending={busy}
        pendingLabel={words.fetching}
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>
