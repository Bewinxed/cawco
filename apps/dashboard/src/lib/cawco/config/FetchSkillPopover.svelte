<script lang="ts" module>
  import { TabDraft } from "../tab-draft.svelte";

  /**
   * Where the popover was opened from: the section's header ("head"), or an
   * empty group's action, named by its group.
   */
  type Where = string;

  /**
   * The popover's held state (DESIGN.md, The Work Outlives Its Surface
   * Rule): open or not, what was typed and picked, and the skill whose fetch
   * it started. The fetch itself is the hub's row; this only names it.
   */
  const draft = new TabDraft("cawco:fetch-skill", () => ({
    open: false,
    at: "head" as Where,
    typed: "",
    skillName: "",
    named: false,
    projectId: "",
    /** The skill this popover asked the hub for, until it lands. */
    asked: null as string | null,
    /** Why the hub refused the ask itself (no row to carry it). */
    refused: null as string | null,
  }));

  /** The popovers mounted on the page, by where: one put away opens in the header's when its own is gone. */
  const mounted = $state<Record<Where, number>>({});
  /** The row it is reopened from, which it opens beside and closes into. */
  let fromRow = $state<HTMLElement | null>(null);

  /** The skill whose fetch the popover is following, parked on its row while it is put away. */
  export const fetchParkedOn = (): string | null =>
    draft.value.open ? null : draft.value.asked;

  /** One press on the parked row: the popover again, where it was, beside that row. */
  export function reopenFetch(row: HTMLElement | null): void {
    fromRow = row;
    draft.value.open = true;
  }
</script>

<script lang="ts">
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
  import {
    type FleetSkillMeta,
    projectClaudeRelative,
    userLayerLabel,
    skillsWords as words,
  } from "@cawco/core";
  import { onMount } from "svelte";
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
    where?: Where;
    /** A fetch of `name` is about to be asked for. */
    onasking: (name: string) => void;
    /** The row the hub answered with, and the row once its fetch landed. */
    onsaved: (row: FleetSkillMeta) => void;
  } = $props();

  onMount(() => {
    mounted[where] = (mounted[where] ?? 0) + 1;
    return () => {
      mounted[where] = (mounted[where] ?? 1) - 1;
    };
  });

  const held = draft.value;
  const open = $derived(
    held.open &&
      (held.at === where || (where === "head" && (mounted[held.at] ?? 0) === 0))
  );

  /** The ask is on its way to the hub. */
  let sending = $state(false);
  let surface = $state<HTMLElement | null>(null);

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

  const rowOf = (name: string) =>
    document.querySelector<HTMLElement>(
      `[data-row-name="${CSS.escape(name)}"]`
    );

  /** The closed surface's flight into its row, while bits-ui still draws it. */
  let flight: Animation | undefined;

  /**
   * Closes at once, and the surface travels into `row` as it goes (The One
   * Object Rule): bits-ui keeps a closed surface drawn until its animations
   * end, the flight among them. The close never waits on the flight, so a
   * reload or a press made during it finds the popover already shut.
   */
  function closeOnto(row: HTMLElement | null) {
    flight?.cancel();
    flight = surface && row ? closeInto(surface, row) : undefined;
    held.open = false;
    fromRow = null;
  }

  // Opened again while its flight still runs (its trigger, or the row's
  // Open): it turns back, whole, before it is drawn.
  $effect.pre(() => {
    if (open) {
      flight?.cancel();
      flight = undefined;
    }
  });

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
    if (open) {
      closeOnto(rowOf(row.name));
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
    // biome-ignore lint/complexity/noVoid: fetchIt tracks its own state
    void fetchIt(held.typed);
  }

  /**
   * ×, Esc or a press outside: the popover goes, the fetch stays. With a
   * fetch to follow it travels into that row; with none, into its trigger.
   */
  function setOpen(next: boolean) {
    if (next) {
      held.at = where;
      held.open = true;
      return;
    }
    closeOnto(held.asked === null ? null : rowOf(held.asked));
  }
</script>

<Popover.Root bind:open={() => open, setOpen}>
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
    customAnchor={fromRow}
    gap="form"
    pad="form"
    bind:ref={surface}
  >
    <form
      data-fetch-skill
      class="flex flex-col gap-space-3"
      onsubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) {
          // biome-ignore lint/complexity/noVoid: fetchIt tracks its own state
          void fetchIt(source);
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
      {#if failed}
        <p
          data-slot="refused"
          class="type-meta wrap-anywhere text-status-fail-ink"
          role="alert"
          transition:unfold
        >
          {failed}
        </p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null || !ready}
        failed={failed !== null}
        label={words.fetchSkill}
        pending={busy}
        pendingLabel={words.fetching}
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>
