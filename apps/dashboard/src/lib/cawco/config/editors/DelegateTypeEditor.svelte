<script lang="ts">
  import {
    delegateTypeProblem,
    EFFORT_LEVELS,
    HARNESSES,
    delegateTypesWords as words,
  } from "@cawco/core";
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
  import SwitchField from "../SwitchField.svelte";
  import { configStore, upsert } from "../store.svelte";
  import TitleInput from "../TitleInput.svelte";

  /**
   * The delegate-type editor. The description is the whole of how a calling
   * agent routes here, so it gets the largest field, above harness, model and
   * effort rather than beside them.
   */
  let { type, taken }: { type: DelegateType | null; taken: string[] } =
    $props();

  const store = configStore();
  const HUE = "var(--hue-blue-500)";

  let draft = $state<DelegateType>(
    untrack(() => (type ? { ...type } : blankDelegateType()))
  );
  let skillsText = $state(untrack(() => (type?.skills ?? []).join(", ")));
  let denyToolsText = $state(untrack(() => (type?.denyTools ?? []).join(", ")));
  let canDelegate = $state(untrack(() => type?.canDelegate === true));

  const name = $derived(type?.name ?? null);

  const fieldsOf = (from: DelegateType) => ({
    draft: from,
    skillsText: (from.skills ?? []).join(", "),
    denyToolsText: (from.denyTools ?? []).join(", "),
    canDelegate: from.canDelegate === true,
  });
  /** What is saved: the fields differ from it by what is unsaved. */
  const baseline = $derived(fieldsOf(type ? { ...type } : blankDelegateType()));
  const kept = keepDraft(
    page.url.pathname,
    () => {
      const now = { draft, skillsText, denyToolsText, canDelegate };
      return sameFields(now, baseline) ? null : now;
    },
    (stored) => {
      ({ draft, skillsText, denyToolsText, canDelegate } = stored);
    }
  );

  const form = new EditorForm("/config/delegate-types", kept, store);

  const parsedList = (text: string): string[] | undefined => {
    const items = text
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return items.length ? items : undefined;
  };

  const submission = $derived<DelegateType>({
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    model: draft.model.trim(),
    skills: parsedList(skillsText),
    denyTools: parsedList(denyToolsText),
    canDelegate,
  });

  const problem = $derived(delegateTypeProblem(submission));
  const problemFor = (field: string): string | undefined =>
    form.seen(field) && problem?.includes(field) ? problem : undefined;

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
      ({ draft, skillsText, denyToolsText, canDelegate } = fieldsOf({
        ...saved,
      }));
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
    <Field id="type-deny" label={words.denied}>
      <Input
        autocomplete="off"
        id="type-deny"
        placeholder={words.deniedPlaceholder}
        spellcheck="false"
        bind:value={denyToolsText}
      />
    </Field>
    <SwitchField
      hint={canDelegate ? words.mayDelegateOn : words.mayDelegateOff}
      id="type-delegate"
      label={words.mayDelegate}
      bind:checked={canDelegate}
    />
  </EditorSection>
</EditorFrame>
