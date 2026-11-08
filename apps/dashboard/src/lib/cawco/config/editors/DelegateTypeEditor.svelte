<script lang="ts">
  import {
    delegateTypeProblem,
    mayStartProblem,
    type StartingSet,
    startingSetProblem,
  } from "@cawco/core/delegate-types";
  import { EFFORT_LEVELS, HARNESSES } from "@cawco/core/harness/kinds";
  import { delegateTypesWords as words } from "@cawco/core/words/delegate-types";
  import { untrack } from "svelte";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconCpu, IconDocument, IconInfo, IconKey } from "#lib/icons.js";
  import { page } from "$app/state";
  import {
    blankDelegateType,
    type DelegateType,
    saveDelegateType,
  } from "../../delegate-types";
  import ModelCombobox from "../../ModelCombobox.svelte";
  import Choice from "../Choice.svelte";
  import { deleteDelegateType } from "../deletes";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import { EditorForm, takenName } from "../editor-form.svelte";
  import Field from "../Field.svelte";
  import { configStore, upsert } from "../store.svelte";
  import TitleInput from "../TitleInput.svelte";

  /**
   * The delegate-type editor. The description is the whole of how a calling
   * agent routes here, so it gets the largest field, above harness, model and
   * effort rather than beside them.
   *
   * It follows `type` while mounted: each field is a writable derived of it
   * (svelte.dev/docs/svelte/$derived, "you can temporarily override their
   * values by reassigning them"), so what the person types holds until the
   * type itself changes, and a type set in place on a mounted editor is the
   * one it shows. A reload that reads the same type back changes nothing.
   */
  let { type, taken }: { type: DelegateType | null; taken: string[] } =
    $props();

  const store = configStore();
  const HUE = "var(--color-mark-6)";

  const name = $derived(type?.name ?? null);

  const fieldsOf = (from: DelegateType) => ({
    draft: from,
    skillsText: (from.skills ?? []).join(", "),
    denyToolsText: (from.denyTools ?? []).join(", "),
    mayStartText: (from.mayStart ?? []).join(", "),
    startSkillsText: (from.startingSet?.skills ?? []).join(", "),
    startServersText: (from.startingSet?.servers ?? []).join(", "),
  });
  type Fields = ReturnType<typeof fieldsOf>;

  /** The type as saved, by its content: a list read again with it unchanged is the same. */
  const savedAs = $derived(JSON.stringify(type));
  /** `type`, taken again only when its content changed: `savedAs` is the one dependency. */
  const opened = $derived(savedAs === undefined ? null : untrack(() => type));
  /** What is saved: the fields differ from it by what is unsaved. */
  const baseline = $derived(
    fieldsOf(opened ? { ...opened } : blankDelegateType())
  );
  /** The type the fields were last put back to (a kept draft, a save), over the saved one. */
  let reopened = $state<DelegateType | null>(null);
  const draft = $derived.by(() => {
    const fields = $state<DelegateType>({
      ...(reopened ?? baseline.draft),
    });
    return fields;
  });
  let skillsText = $derived(baseline.skillsText);
  let denyToolsText = $derived(baseline.denyToolsText);
  let mayStartText = $derived(baseline.mayStartText);
  let startSkillsText = $derived(baseline.startSkillsText);
  let startServersText = $derived(baseline.startServersText);

  /** Puts every field back to `fields`. */
  const takeFields = (fields: Fields) => {
    reopened = fields.draft;
    ({
      skillsText,
      denyToolsText,
      mayStartText,
      startSkillsText,
      startServersText,
    } = fields);
  };

  const kept = keepDraft(
    page.url.pathname,
    () => {
      const now = {
        draft,
        skillsText,
        denyToolsText,
        mayStartText,
        startSkillsText,
        startServersText,
      };
      return sameFields(now, baseline) ? null : now;
    },
    takeFields
  );

  const form = new EditorForm("/config/delegate-types", kept, store);

  const parsedList = (text: string): string[] | undefined => {
    const items = text
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return items.length ? items : undefined;
  };

  /**
   * A starting set's list keeps a blank between two commas, so its field can
   * say so; a comma at either end is only trailing.
   */
  const setNames = (text: string): string[] => {
    const items = text.split(",").map((item) => item.trim());
    while (items[0] === "") {
      items.shift();
    }
    while (items.at(-1) === "") {
      items.pop();
    }
    return items;
  };

  /** Both lists empty is no set: its sessions start with everything installed. */
  const startingSet = $derived.by((): StartingSet | undefined => {
    const skills = setNames(startSkillsText);
    const servers = setNames(startServersText);
    return skills.length || servers.length ? { skills, servers } : undefined;
  });

  const submission = $derived<DelegateType>({
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    model: draft.model.trim(),
    skills: parsedList(skillsText),
    denyTools: parsedList(denyToolsText),
    mayStart: parsedList(mayStartText),
    startingSet,
  });

  const problem = $derived(delegateTypeProblem(submission));
  /** The refusal each header field says, matched whole: a list's problem stays under its own field. */
  const fieldProblems: Record<string, string> = {
    name: words.problemName,
    description: words.problemDescription,
    model: words.problemModel,
  };
  const problemFor = (field: string): string | undefined =>
    form.seen(field) &&
    problem !== undefined &&
    problem === fieldProblems[field]
      ? problem
      : undefined;

  /** The may-start list's own problem, once its field was left or Save pressed. */
  const mayStartShown = $derived(
    form.seen("mayStart")
      ? mayStartProblem(submission.mayStart ?? [])
      : undefined
  );

  /** Each starting-set list's own problem, once its field was left or Save pressed. */
  const startSkillsShown = $derived(
    form.seen("startSkills")
      ? startingSetProblem({ skills: startingSet?.skills ?? [], servers: [] })
      : undefined
  );
  const startServersShown = $derived(
    form.seen("startServers")
      ? startingSetProblem({ skills: [], servers: startingSet?.servers ?? [] })
      : undefined
  );

  const duplicate = $derived(
    takenName(submission.name, taken, words.duplicate)
  );

  const ready = $derived(problem === undefined && duplicate === undefined);

  /**
   * Saving a type keeps the editor open on it, the Save button saying so in
   * place; a new one shows the same, then returns to the list, where it is
   * marked.
   */
  async function save() {
    await form.save(ready, async () => {
      const saved = await saveDelegateType(submission);
      if (store.types.value) {
        upsert(store.types.value, saved, (row) => row.name === saved.name);
      }
      if (!name) {
        return saved.name;
      }
      takeFields(fieldsOf({ ...saved }));
      return null;
    });
  }

  async function remove() {
    if (!name) {
      return;
    }
    const typeName = name;
    await form.remove((gone) => deleteDelegateType(store, typeName, gone));
  }
</script>

<EditorFrame
  deleteLabel={name ? words.remove : undefined}
  deleting={form.deleting}
  failed={form.failed !== undefined}
  oncancel={form.cancel}
  ondelete={name ? remove : undefined}
  onsubmit={save}
  saveLabel={name ? words.save : words.create}
  saving={form.busy}
  title={name ? draft.name : words.newTitle}
>
  {#snippet header()}
    <TitleInput
      disabled={name !== null}
      invalid={Boolean(problemFor("name") || duplicate)}
      label={words.nameLabel}
      onblur={() => {
        form.touched.name = true;
      }}
      placeholder={words.namePlaceholder}
      bind:value={draft.name}
    />
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      {name ? words.nameKept : words.nameRule}
    </p>
    {#if problemFor("name")}
      <p class="type-meta text-status-fail-ink" in:appear>{problem}</p>
    {:else if duplicate}
      <p class="type-meta text-status-fail-ink" in:appear>{duplicate}</p>
    {/if}
    {#if form.failed}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>
        {form.failed}
      </p>
    {/if}
  {/snippet}

  <!-- On the page's column, the editor's first row (DESIGN.md, Alert: a
       compact tinted row with its 16px glyph). -->
  <Alert.Root>
    <IconInfo />
    <Alert.Description>{words.newSessions}</Alert.Description>
  </Alert.Root>

  <EditorSection hue={HUE} icon={IconDocument} label={words.description}>
    <Field
      hint={words.descriptionHint}
      id="type-description"
      label={words.description}
      problem={problemFor("description")}
    >
      <Textarea
        aria-invalid={problemFor("description") ? "true" : undefined}
        id="type-description"
        resize="block"
        onblur={() => {
          form.touched.description = true;
        }}
        placeholder={words.descriptionPlaceholder}
        rows={4}
        bind:value={draft.description}
      />
    </Field>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconCpu} label={words.runsOn}>
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      {words.runsOnNote}
    </p>
    <Choice
      label={words.harness}
      onchange={(next) => {
        draft.harness = next as DelegateType["harness"];
      }}
      options={HARNESSES.map((harness) => ({
        value: harness,
        label: harness,
      }))}
      value={draft.harness}
    />
    <Field id="type-model" label={words.model} problem={problemFor("model")}>
      <ModelCombobox
        class="w-full"
        harness={draft.harness}
        onchoose={(model) => {
          draft.model = model;
          form.touched.model = true;
        }}
        size="default"
        width="capped"
        value={draft.model}
      />
    </Field>
    <Choice
      label={words.effort}
      onchange={(next) => {
        if (next === "unset") {
          // biome-ignore lint/performance/noDelete: an unset effort is omitted from the saved payload, not serialized as effort: undefined
          delete draft.effort;
        } else {
          draft.effort = next as DelegateType["effort"];
        }
      }}
      options={[
        { value: "unset", label: words.unset },
        ...EFFORT_LEVELS.map((effort) => ({ value: effort, label: effort })),
      ]}
      value={draft.effort ?? "unset"}
    />
  </EditorSection>

  <EditorSection hue={HUE} icon={IconKey} label={words.reach}>
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      {words.reachNote}
    </p>
    <Field id="type-skills" label={words.skills}>
      <Input
        autocomplete="off"
        id="type-skills"
        placeholder={words.skillsPlaceholder}
        spellcheck="false"
        bind:value={skillsText}
      />
    </Field>
    <Field
      hint={words.startingSetHint}
      id="type-start-skills"
      label={words.startingSkills}
      problem={startSkillsShown}
    >
      <Input
        aria-invalid={startSkillsShown ? "true" : undefined}
        autocomplete="off"
        id="type-start-skills"
        onblur={() => {
          form.touched.startSkills = true;
        }}
        placeholder={words.startingSkillsPlaceholder}
        spellcheck="false"
        bind:value={startSkillsText}
      />
    </Field>
    <Field
      id="type-start-servers"
      label={words.startingServers}
      problem={startServersShown}
    >
      <Input
        aria-invalid={startServersShown ? "true" : undefined}
        autocomplete="off"
        id="type-start-servers"
        onblur={() => {
          form.touched.startServers = true;
        }}
        placeholder={words.startingServersPlaceholder}
        spellcheck="false"
        bind:value={startServersText}
      />
    </Field>
    <Field id="type-deny" label={words.denied}>
      <Input
        autocomplete="off"
        id="type-deny"
        placeholder={words.deniedPlaceholder}
        spellcheck="false"
        bind:value={denyToolsText}
      />
    </Field>
    <Field
      hint={words.mayStartHint}
      id="type-may-start"
      label={words.mayStart}
      problem={mayStartShown}
    >
      <Input
        aria-invalid={mayStartShown ? "true" : undefined}
        autocomplete="off"
        id="type-may-start"
        onblur={() => {
          form.touched.mayStart = true;
        }}
        placeholder={words.mayStartPlaceholder}
        spellcheck="false"
        bind:value={mayStartText}
      />
    </Field>
  </EditorSection>
</EditorFrame>
