<script lang="ts">
  import { EFFORT_LEVELS } from "@cawco/core";
  import { untrack } from "svelte";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconCpu, IconDocument, IconKey } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    blankDelegateType,
    DELEGATE_HARNESSES,
    type DelegateType,
    delegateTypeProblem,
    saveDelegateType,
  } from "../../delegate-types";
  import { failureWords as message } from "../../hub-read";
  import ModelCombobox from "../../ModelCombobox.svelte";
  import Choice from "../Choice.svelte";
  import { deleteDelegateType } from "../deletes";
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

  /** Delete: at once, with Undo in the toast (deletes.ts). */
  async function remove() {
    if (!name) {
      return;
    }
    deleting = true;
    failed = undefined;
    try {
      await deleteDelegateType(store, name, () => {
        kept.drop();
        return goto("/config/delegate-types");
      });
    } catch (error) {
      deleting = false;
      failed = message(error);
    }
  }
</script>

<EditorFrame
  deleteLabel={name ? "Delete delegate type" : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={cancel}
  ondelete={name ? remove : undefined}
  onsubmit={save}
  saveLabel={name ? "Save changes" : "Create delegate type"}
  saving={busy}
  title={name ? draft.name : "New delegate type"}
>
  {#snippet header()}
    <TitleInput
      disabled={name !== null}
      invalid={Boolean(problemFor("name") || duplicate)}
      label="Delegate type name"
      mono
      onblur={() => {
        touched.name = true;
      }}
      placeholder="explore"
      bind:value={draft.name}
    />
    <!-- literal: 72ch -->
    <p
      data-slot="note"
      class="type-meta max-w-(--measure) text-ink-muted"
      style:--measure="72ch"
    >
      {name
        ? "The name is the key a running call already asks for by; renaming means creating a new type."
        : "Lowercase letters, digits and hyphens — the exact string a delegate call's type param names."}
    </p>
    {#if problemFor("name")}
      <p class="type-meta text-status-fail-ink" in:appear>{problem}</p>
    {:else if duplicate}
      <p class="type-meta text-status-fail-ink" in:appear>{duplicate}</p>
    {/if}
    <Alert.Root>
      <Alert.Description>
        Changes apply to new sessions only — running sessions keep the type list
        they started with.
      </Alert.Description>
    </Alert.Root>
    {#if failed}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>
        {failed}
      </p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconDocument} label="Description">
    <Field
      hint="What the calling model reads to decide whether this is the type to route to — not a note for you, a routing signal for it."
      id="type-description"
      label="Description"
      problem={problemFor("description")}
    >
      <Textarea
        aria-invalid={problemFor("description") ? "true" : undefined}
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
    <!-- literal: 72ch -->
    <p
      data-slot="note"
      class="type-meta max-w-(--measure) text-ink-muted"
      style:--measure="72ch"
    >
      The harness and model the delegate spawns on, and how hard it should
      think.
    </p>
    <Choice
      label="Harness"
      onchange={(next) => {
        draft.harness = next as DelegateType["harness"];
      }}
      options={DELEGATE_HARNESSES.map((harness) => ({
        value: harness,
        label: harness,
      }))}
      value={draft.harness}
    />
    <Field id="type-model" label="Model" problem={problemFor("model")}>
      <ModelCombobox
        class="w-full"
        harness={draft.harness}
        onchoose={(model) => {
          draft.model = model;
          touched.model = true;
        }}
        size="default"
        width="capped"
        value={draft.model}
      />
    </Field>
    <Choice
      label="Effort"
      onchange={(next) => {
        if (next === "unset") {
          // biome-ignore lint/performance/noDelete: an unset effort is omitted from the saved payload, not serialized as effort: undefined
          delete draft.effort;
        } else {
          draft.effort = next as DelegateType["effort"];
        }
      }}
      options={[
        { value: "unset", label: "Unset" },
        ...EFFORT_LEVELS.map((effort) => ({ value: effort, label: effort })),
      ]}
      value={draft.effort ?? "unset"}
    />
  </EditorSection>

  <EditorSection hue={HUE} icon={IconKey} label="What it can reach">
    <!-- literal: 72ch -->
    <p
      data-slot="note"
      class="type-meta max-w-(--measure) text-ink-muted"
      style:--measure="72ch"
    >
      Comma-separated. Both are optional narrowings — empty means the delegate
      has the harness's ordinary defaults.
    </p>
    <Field id="type-skills" label="Skills">
      <Input
        autocomplete="off"
        face="mono"
        id="type-skills"
        placeholder="svelte-foundations:coding, ui-observer"
        spellcheck="false"
        bind:value={skillsText}
      />
    </Field>
    <Field id="type-deny" label="Tools denied">
      <Input
        autocomplete="off"
        face="mono"
        id="type-deny"
        placeholder="Write, Edit, NotebookEdit"
        spellcheck="false"
        bind:value={denyToolsText}
      />
    </Field>
    <SwitchField
      hint={canDelegate
        ? "It can spawn delegates and sessions of its own."
        : "Leaf — it does the work itself and cannot delegate further."}
      id="type-delegate"
      label="May delegate"
      bind:checked={canDelegate}
    />
  </EditorSection>
</EditorFrame>
