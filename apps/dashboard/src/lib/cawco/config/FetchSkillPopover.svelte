<script lang="ts" module>
  import { z } from "zod";
  import { ParkedPopover } from "./parked-popover.svelte";

  /**
   * The popover's held state: open or not, what was typed and picked, and
   * the skill whose fetch it started. The fetch itself is the hub's row;
   * this only names it.
   */
  const parked = new ParkedPopover(
    "cawco:fetch-skill",
    z.object({
      open: z.boolean(),
      at: z.string(),
      typed: z.string(),
      skillName: z.string(),
      named: z.boolean(),
      projectId: z.string(),
      asked: z.string().nullable(),
      refused: z.string().nullable(),
    }),
    () => ({
      open: false,
      at: "head",
      typed: "",
      skillName: "",
      named: false,
      projectId: "",
      asked: null,
      refused: null,
    })
  );
  const { draft } = parked;

  /** The skill whose fetch the popover is following, parked on its row while it is put away. */
  export const fetchParkedOn = (): string | null =>
    draft.value.open ? null : draft.value.asked;

  /** One press on the parked row: the popover again, where it was, beside that row. */
  export function reopenFetch(row: HTMLElement | null): void {
    parked.reopen(row);
  }
</script>

<script lang="ts">
  import {
    projectClaudeRelative,
    userLayerLabel,
  } from "@cawco/core/claude-dirs";
  import { detach } from "@cawco/core/detach";
  /**
   * Fetch a skill, from the section's primary button: a source and a name,
   * then — when the repo holds several — which one. The hub downloads the
   * files once and every machine writes them into ~/.claude/skills.
   *
   * The fetch belongs to the hub's row, not to this popover: ×, Esc or a
   * press outside put the popover away into that row, which says how the
   * fetch goes and carries Open fetch back here; a reload opens it again as
   * it was (`draft`). It closes for good into the row once the fetch lands.
   */
  import type { FleetSkillMeta } from "@cawco/core/fleet";
  import { skillsWords as words } from "@cawco/core/words/skills";
  import Coded from "#lib/cawco/Coded.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
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
  import HubAskFoot from "./HubAskFoot.svelte";
  import PickerChip from "./PickerChip.svelte";
  import { PopoverSeat, rowOf } from "./parked-popover.svelte";
  import WriteTrigger from "./WriteTrigger.svelte";

  let {
    skills,
    down,
    where = "head",
    onasking,
    onsaved,
  }: {
    /** The fleet's skill rows (null until read): the one this popover asked for says how its fetch goes. */
    skills: FleetSkillMeta[] | null;
    /** Why the hub cannot take a write, or null: the trigger and the submit
        are disabled on it and say it as their title. */
    down: string | null;
    /** Where it stands: the section's header ("head"), or an empty group's action, named by its group. */
    where?: string;
    /** A fetch of `name` is about to be asked for. */
    onasking: (name: string) => void;
    /** The row the hub answered with, and the row once its fetch landed. */
    onsaved: (row: FleetSkillMeta) => void;
  } = $props();

  const seat = new PopoverSeat(parked, () => where);
  const held = draft.value;

  /** The ask is on its way to the hub. */
  let sending = $state(false);

  const project = $derived(
    cawco.projects.find((each) => each.id === held.projectId)
  );
  /** The row this popover's fetch went on in, as the hub says it stands. */
  const asked = $derived(
    held.asked === null
      ? undefined
      : skills?.find((row) => row.name === held.asked)
  );
  const choices = $derived(asked?.fetching ? [] : (asked?.choices ?? []));
  const busy = $derived(sending || asked?.fetching === true);
  const failed = $derived(
    held.refused ??
      (asked && !asked.fetching && asked.error && choices.length === 0
        ? words.fetchRefused(asked.name, asked.error)
        : null)
  );

  const source = $derived(normalizeSkillSource(held.typed));
  const nameProblem = $derived(
    skillNameProblem(
      held.skillName,
      (skills ?? [])
        .map((row) => row.name)
        .filter((name) => name !== held.asked)
    )
  );
  const ready = $derived(source !== "" && nameProblem === undefined);

  // The fetch landed with its files: the popover closes into the row it
  // made, and the row says the rest (its rollout chip, machine by machine).
  // Put away meanwhile, it simply lets go of the fetch.
  $effect(() => {
    const row = asked;
    if (
      !row ||
      row.fetching ||
      row.error ||
      (row.choices?.length ?? 0) > 0 ||
      sending
    ) {
      return;
    }
    onsaved(row);
    if (seat.open) {
      seat.closeOnto(rowOf(row.name));
    }
    draft.clear();
  });

  // A reload finds the row gone (removed meanwhile): nothing is followed.
  $effect(() => {
    if (held.asked !== null && !sending && skills !== null && !asked) {
      held.asked = null;
    }
  });

  async function fetchIt(from: string) {
    const name = held.skillName.trim();
    sending = true;
    held.refused = null;
    onasking(name);
    try {
      const row = await saveSkill(name, {
        source: from,
        enabled: true,
        projectId: held.projectId || null,
      });
      held.asked = row.name;
      onsaved(row);
    } catch (error) {
      held.refused = failureWords(error);
    } finally {
      sending = false;
    }
  }

  function choose(choice: string) {
    held.typed = pickSkill(source, choice);
    detach(fetchIt(held.typed), "fetchIt");
  }
</script>

<Popover.Root bind:open={() => seat.open, seat.setOpen}>
  <WriteTrigger {down} icon={IconPlus} label={words.fetchSkill} />
  <Popover.Content
    align="end"
    class="w-c-panel-w max-w-(--bits-popover-content-available-width)"
    customAnchor={parked.fromRow}
    gap="form"
    pad="form"
    bind:ref={seat.surface}
  >
    <form
      data-fetch-skill
      class="flex flex-col gap-space-3"
      onsubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) {
          detach(fetchIt(source), "fetchIt");
        }
      }}
    >
      <Field id="skill-source" label={words.source}>
        {#snippet hint()}
          {#if source !== "" && source !== held.typed.trim()}
            <Coded text={words.readsAs(source)} />
          {:else}
            <Coded text={words.sourceHint} />
          {/if}
        {/snippet}
        <Input
          autocomplete="off"
          id="skill-source"
          oninput={() => {
            if (!held.named) {
              held.skillName = suggestSkillName(
                normalizeSkillSource(held.typed)
              );
            }
          }}
          placeholder={words.sourcePlaceholder}
          spellcheck="false"
          bind:value={held.typed}
        />
      </Field>
      <Field
        id="skill-name"
        label={words.name}
        problem={held.skillName === "" ? undefined : nameProblem}
      >
        {#snippet hint()}
          {words.landsIn}
          <span class="type-code"
            >{project
              ? projectClaudeRelative("skills", held.skillName || "name")
              : userLayerLabel("skills", held.skillName || "name")}</span
          >{project ? words.inProjectFolders(project.name) : ""}
        {/snippet}
        <Input
          aria-invalid={held.skillName !== "" && nameProblem
            ? "true"
            : undefined}
          autocomplete="off"
          id="skill-name"
          oninput={() => {
            held.named = true;
          }}
          placeholder={words.namePlaceholder}
          spellcheck="false"
          bind:value={held.skillName}
        />
      </Field>
      <Field id="skill-scope" label={words.scope}>
        <PickerChip
          field={{ id: "skill-scope" }}
          label={words.scope}
          onpick={(next) => {
            held.projectId = next;
          }}
          options={[
            { value: "", label: words.everyMachine },
            ...cawco.projects.map((each) => ({
              value: each.id,
              label: each.name,
            })),
          ]}
          value={held.projectId}
        />
      </Field>
      {#if choices.length > 0}
        <div
          data-slot="choices"
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
                  "select-none px-space-3 text-start font-(family-name:--font-mono) text-size-meta text-ink-strong focus-inset",
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
      <HubAskFoot
        {down}
        {failed}
        label={words.fetchSkill}
        pending={busy}
        pendingLabel={words.fetching}
        {ready}
      />
    </form>
  </Popover.Content>
</Popover.Root>
