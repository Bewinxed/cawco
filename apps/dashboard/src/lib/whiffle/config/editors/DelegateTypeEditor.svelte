<script lang="ts">
  import { EFFORT_LEVELS } from "@whiffle/core";
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "$lib/components/ui/alert";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { IconCpu, IconDocument, IconKey } from "$lib/icons";
  import { appear } from "$lib/whiffle/motion/curves.svelte";
  import { confirm } from "../../confirm.svelte";
  import {
    blankDelegateType,
    DELEGATE_HARNESSES,
    type DelegateType,
    delegateTypeProblem,
    message,
    removeDelegateType,
    saveDelegateType,
  } from "../../delegate-types";
  import ModelCombobox from "../../ModelCombobox.svelte";
  import Choice from "../Choice.svelte";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import { savedShown } from "../EditorFooter.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
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
  let busy = $state(false);
  let deleting = $state(false);
  let failed = $state<string | undefined>(undefined);
  let touched = $state<Record<string, boolean>>({});
  let attempted = $state(false);

  const name = $derived(type?.name ?? null);

  const fieldsOf = (from: DelegateType) => ({
    draft: from,
    skillsText: (from.skills ?? []).join(", "),
    denyToolsText: (from.denyTools ?? []).join(", "),
    canDelegate: from.canDelegate === true,
  });
  /** What is saved: the fields differ from it by what is unsaved. */
  const baseline = $derived(fieldsOf(type ? { ...type } : blankDelegateType()));
  /** A new type was just created: its draft is over, and a second Save would write it again. */
  let created = false;
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
  const shown = (field: string): boolean =>
    attempted || touched[field] === true;
  const problemFor = (field: string): string | undefined =>
    shown(field) && problem?.includes(field) ? problem : undefined;

  const duplicate = $derived(
    submission.name !== "" && taken.includes(submission.name)
      ? "Another delegate type already has that name. Two types called the same thing are two a calling agent cannot tell apart."
      : undefined
  );

  const ready = $derived(problem === undefined && duplicate === undefined);

  /**
   * Saving a type keeps the editor open on it, the Save button saying so in
   * place; a new one shows the same, then returns to the list, where it is
   * marked.
   */
  async function save() {
    attempted = true;
    if (!ready || busy || created) {
      return;
    }
    busy = true;
    failed = undefined;
    let made: string | undefined;
    try {
      const saved = await saveDelegateType(submission);
      if (store.types.value) {
        upsert(store.types.value, saved, (row) => row.name === saved.name);
      }
      if (name) {
        ({ draft, skillsText, denyToolsText, canDelegate } = fieldsOf({
          ...saved,
        }));
      } else {
        created = true;
        kept.drop();
        made = saved.name;
      }
    } catch (error) {
      failed = message(error);
    } finally {
      busy = false;
    }
    if (made) {
      await savedShown();
      store.mark(made);
      await goto("/config/delegate-types");
    }
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/delegate-types");
  }

  async function askRemove() {
    if (!name) {
      return;
    }
    await confirm({
      title: `Delete ${draft.name || "this delegate type"}?`,
      body: "A session already running keeps the type list it started with — the prompt cache is frozen for its lifetime. This only stops the name from being offered to new sessions.",
      confirmLabel: "Delete delegate type",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        deleting = true;
        try {
          await removeDelegateType(name);
          kept.drop();
          // Back to the list first, so the row is seen leaving it.
          await goto("/config/delegate-types");
          if (store.types.value) {
            store.types.value = store.types.value.filter(
              (row) => row.name !== name
            );
          }
        } catch (error) {
          deleting = false;
          throw error;
        }
      },
    });
  }
</script>

<EditorFrame
  deleteLabel={name ? 'Delete delegate type' : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={cancel}
  ondelete={name ? askRemove : undefined}
  onsubmit={save}
  saveLabel={name ? 'Save changes' : 'Create delegate type'}
  saving={busy}
  title={name ? draft.name : 'New delegate type'}
>
  {#snippet header()}
    <TitleInput
      disabled={name !== null}
      invalid={Boolean(problemFor('name') || duplicate)}
      label="Delegate type name"
      mono
      onblur={() => {
        touched.name = true;
      }}
      placeholder="explore"
      bind:value={draft.name}
    />
    <p class="note">
      {name
        ? 'The name is the key a running call already asks for by; renaming means creating a new type.'
        : "Lowercase letters, digits and hyphens — the exact string a delegate call's type param names."}
    </p>
    {#if problemFor('name')}
      <p class="problem" in:appear>{problem}</p>
    {:else if duplicate}
      <p class="problem" in:appear>{duplicate}</p>
    {/if}
    <Alert.Root>
      <Alert.Description>
        Changes apply to new sessions only — running sessions keep the type list
        they started with.
      </Alert.Description>
    </Alert.Root>
    {#if failed}
      <p class="problem" role="alert" in:appear>{failed}</p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconDocument} label="Description">
    <Field
      hint="What the calling model reads to decide whether this is the type to route to — not a note for you, a routing signal for it."
      id="type-description"
      label="Description"
      problem={problemFor('description')}
    >
      <Textarea
        aria-invalid={problemFor('description') ? 'true' : undefined}
        class="resize-y"
        id="type-description"
        onblur={() => {
          touched.description = true;
        }}
        placeholder="Read-only codebase exploration and fan-out search; returns conclusions, not file dumps."
        rows={4}
        bind:value={draft.description}
      />
    </Field>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconCpu} label="What it runs on">
    <p class="note">
      The harness and model the delegate spawns on, and how hard it should
      think.
    </p>
    <Choice
      label="Harness"
      onchange={(next) => {
        draft.harness = next as DelegateType['harness'];
      }}
      options={DELEGATE_HARNESSES.map((harness) => ({ value: harness, label: harness }))}
      value={draft.harness}
    />
    <Field id="type-model" label="Model" problem={problemFor('model')}>
      <ModelCombobox
        class="w-full min-w-0 max-w-md"
        harness={draft.harness}
        onchoose={(model) => {
          draft.model = model;
          touched.model = true;
        }}
        size="default"
        value={draft.model}
      />
    </Field>
    <Choice
      label="Effort"
      onchange={(next) => {
        if (next === 'unset') {
          // biome-ignore lint/performance/noDelete: an unset effort is omitted from the saved payload, not serialized as effort: undefined
          delete draft.effort;
        } else {
          draft.effort = next as DelegateType['effort'];
        }
      }}
      options={[
        { value: 'unset', label: 'Unset' },
        ...EFFORT_LEVELS.map((effort) => ({ value: effort, label: effort })),
      ]}
      value={draft.effort ?? 'unset'}
    />
  </EditorSection>

  <EditorSection hue={HUE} icon={IconKey} label="What it can reach">
    <p class="note">
      Comma-separated. Both are optional narrowings — empty means the delegate
      has the harness's ordinary defaults.
    </p>
    <Field id="type-skills" label="Skills">
      <Input
        autocomplete="off"
        class="font-mono"
        id="type-skills"
        placeholder="svelte-foundations:coding, ui-observer"
        spellcheck="false"
        bind:value={skillsText}
      />
    </Field>
    <Field id="type-deny" label="Tools denied">
      <Input
        autocomplete="off"
        class="font-mono"
        id="type-deny"
        placeholder="Write, Edit, NotebookEdit"
        spellcheck="false"
        bind:value={denyToolsText}
      />
    </Field>
    <SwitchField
      hint={canDelegate
        ? 'It can spawn delegates and sessions of its own.'
        : 'Leaf — it does the work itself and cannot delegate further.'}
      id="type-delegate"
      label="May delegate"
      bind:checked={canDelegate}
    />
  </EditorSection>
</EditorFrame>

<style>
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
