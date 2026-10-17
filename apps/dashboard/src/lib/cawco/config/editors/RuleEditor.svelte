<script lang="ts">
  import type {
    HarnessKind,
    RuleDraft,
    RuleMatchKind,
    RuleRow,
    RuleTiming,
    RuleWatch,
  } from "@cawco/core";
  import { HARNESSES, ruleProblem, ruleSentence } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import {
    appear,
    crossIn,
    crossOut,
    dur,
    ease,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { folds, unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import type { JevState } from "#lib/cawco/suggest.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconEye,
    IconHistory,
    IconMapPoint,
    IconPin,
    IconPlain,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { cawco } from "../../client.svelte";
  import { failureWords as message } from "../../hub-read";
  import RuleActivity from "../../RuleActivity.svelte";
  import RuleTester from "../../RuleTester.svelte";
  import { blankRule, createRule, draftOf, saveRule } from "../../rules";
  import Choice from "../Choice.svelte";
  import { deleteRule } from "../deletes";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import { savedShown } from "../EditorFooter.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import Field from "../Field.svelte";
  import PickerChip from "../PickerChip.svelte";
  import ReadingWell from "../ReadingWell.svelte";
  import SwitchField from "../SwitchField.svelte";
  import { configStore, upsert, withStats } from "../store.svelte";
  import TitleInput from "../TitleInput.svelte";

  /**
   * The rule editor. A rule is a sentence, and this screen is that sentence
   * twice: read back in English at the top, live, and as the fields that
   * compose it. The English is the one place the interaction between timing,
   * interruption and repetition is legible at a glance.
   */
  let { rule, taken }: { rule: RuleRow | null; taken: string[] } = $props();

  const store = configStore();
  const HUE = "var(--hue-green-500)";

  let draft = $state<RuleDraft>(
    untrack(() => (rule ? draftOf(rule) : blankRule()))
  );
  /** What is saved: the draft differs from it by what is unsaved. */
  const baseline = $derived(rule ? draftOf(rule) : blankRule());
  /** A new rule was just created: its draft is over, and a second Save would make a second rule. */
  let created = false;
  const kept = keepDraft(
    page.url.pathname,
    () => (sameFields(draft, baseline) ? null : draft),
    (stored: RuleDraft) => {
      draft = stored;
    }
  );
  let sample = $state("");
  let busy = $state(false);
  let deleting = $state(false);
  let failed = $state<string | undefined>(undefined);
  let touched = $state<Record<string, boolean>>({});
  let attempted = $state(false);
  let jevOn = $state(true);

  onMount(() => {
    fetch("/api/jev")
      .then(async (response) => {
        jevOn = response.ok
          ? ((await response.json()) as JevState).route !== null
          : false;
      })
      .catch(() => {
        jevOn = false;
      });
  });

  const id = $derived(rule?.id ?? null);
  const wrong = $derived(ruleProblem(draft));
  const shown = (field: string): string | undefined =>
    attempted || touched[field] ? wrong[field] : undefined;

  const duplicate = $derived(
    draft.name.trim() !== "" && taken.includes(draft.name.trim())
      ? "Another rule already has that name. Two rules called the same thing are two rules you cannot tell apart in a transcript."
      : undefined
  );

  /** Every model the fleet is actually running, so the filter is not free text. */
  const models = $derived(
    [
      ...new Set(
        cawco.instances
          .map((row) => row.model)
          .filter(
            (model): model is string =>
              typeof model === "string" && model !== ""
          )
      ),
    ].sort()
  );

  const TIMING: { value: RuleTiming; label: string; how: string }[] = [
    {
      value: "turn",
      label: "When the turn ends",
      how: "The session has stopped and is idle, so your reply wakes it into a new turn. This is the one that makes it keep working.",
    },
    {
      value: "message",
      label: "When the message ends",
      how: "Queued as soon as the message that tripped the rule is complete. The session reads it at the next turn boundary, uninterrupted.",
    },
    {
      value: "immediate",
      label: "The moment it appears",
      how: "Sent mid-message, as soon as the words show up in the stream.",
    },
  ];

  const WATCH: { value: RuleWatch; label: string }[] = [
    { value: "text", label: "What it says" },
    { value: "thinking", label: "What it thinks" },
    { value: "both", label: "Both" },
  ];

  const PATTERN_LABEL: Record<RuleMatchKind, string> = {
    phrase: "Phrase",
    regex: "Expression",
    meaning: "Question (answered yes or no)",
  };

  const how = $derived(
    TIMING.find((option) => option.value === draft.timing)?.how ?? ""
  );

  /** A meaning rule is a question Jev answers about a finished message or turn. */
  function setMatchKind(next: RuleMatchKind) {
    draft.matchKind = next;
    if (next === "meaning") {
      draft.caseSensitive = false;
      draft.wholeWord = false;
      if (draft.timing === "immediate") {
        draft.timing = "turn";
      }
    }
  }

  /** "Every" is stored as the key being absent. */
  function narrow(
    key: "machineId" | "projectId" | "harness" | "model",
    value: string
  ) {
    if (value === "") {
      delete draft.scope[key];
    } else if (key === "harness") {
      draft.scope.harness = value as HarnessKind;
    } else {
      draft.scope[key] = value;
    }
  }

  const ready = $derived(
    Object.keys(wrong).length === 0 && duplicate === undefined
  );

  /**
   * Saving a rule keeps the editor open on it, the Save button saying so
   * in place; a new rule shows the same, then returns to the list, where
   * it is marked.
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
      const trimmed = { ...draft, name: draft.name.trim() };
      const saved = withStats(
        await (id ? saveRule(id, trimmed) : createRule(trimmed)),
        rule?.stats
      );
      const rows = store.rules.value;
      if (rows) {
        upsert(rows, saved, (row) => row.id === saved.id);
      }
      if (id) {
        draft = draftOf(saved);
      } else {
        created = true;
        kept.drop();
        made = saved.id;
      }
    } catch (error) {
      failed = message(error);
    } finally {
      busy = false;
    }
    if (made) {
      await savedShown();
      store.mark(made);
      await goto("/config/rules");
    }
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/rules");
  }

  /**
   * Delete: at once, with Undo in the toast (deletes.ts). Back to the
   * list first, so the row is seen leaving it; a refusal stands in the
   * editor's head, the rule kept.
   */
  async function remove() {
    if (!id) {
      return;
    }
    deleting = true;
    failed = undefined;
    try {
      await deleteRule(store, { id, name: baseline.name }, () => {
        kept.drop();
        return goto("/config/rules");
      });
    } catch (error) {
      deleting = false;
      failed = message(error);
    }
  }

  /** Text-matching options fold away for a meaning rule: a panel's length,
      on the drawer curve, read when the fold plays. */
  const FOLD = {
    get ms() {
      return dur("--dur-panel");
    },
    get easing() {
      return ease("--ease-drawer");
    },
    fade: true,
    gap: 8,
  };
</script>

<EditorFrame
  deleteLabel={id ? "Delete rule" : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={cancel}
  ondelete={id ? remove : undefined}
  onsubmit={save}
  saveLabel={id ? "Save changes" : "Create rule"}
  saving={busy}
  title={id ? draft.name || "Rule" : "New rule"}
>
  {#snippet header()}
    <TitleInput
      invalid={Boolean(shown("name") || duplicate)}
      label="Rule name"
      onblur={() => {
        touched.name = true;
      }}
      placeholder="Name this rule"
      bind:value={draft.name}
    />
    {#if shown("name")}
      <p class="problem" in:appear>{wrong.name}</p>
    {:else if duplicate}
      <p class="problem" in:appear>{duplicate}</p>
    {/if}
    <ReadingWell>{ruleSentence(draft)}</ReadingWell>
    <SwitchField
      hint={draft.enabled
        ? "Watching every session it applies to"
        : "Off — it watches nothing"}
      id="rule-enabled"
      label="Enabled"
      bind:checked={draft.enabled}
    />
    {#if failed}
      <p class="problem" role="alert" in:appear>{failed}</p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconEye} label="What to watch for">
    <p data-slot="note" class="note">
      CawCo reads what a session writes, not what you write to it.
    </p>
    <div data-slot="fold" class="fold">
      <Choice
        label="Match"
        onchange={(next) => setMatchKind(next as RuleMatchKind)}
        options={[
          { value: "phrase", label: "A phrase" },
          { value: "regex", label: "A regular expression" },
          { value: "meaning", label: "Meaning" },
        ]}
        value={draft.matchKind}
      />
      {#snippet needsJev()}
        Meaning rules need Jev —
        <a class="underline underline-offset-2" href="/config/models"
          >set a TypeSafe key or connect OpenRouter in Models CawCo uses</a
        >
      {/snippet}
      <Field
        id="rule-pattern"
        label={PATTERN_LABEL[draft.matchKind]}
        problem={shown("pattern")}
        warn={draft.matchKind === "meaning" && !jevOn ? needsJev : undefined}
      >
        {#snippet hint()}
          {#if draft.matchKind === "meaning"}
            Jev answers it about each finished message or turn. The rule fires
            when the answer is yes.
          {:else if draft.matchKind === "regex"}
            JavaScript syntax. It is matched against the whole message, not line
            by line.
          {/if}
        {/snippet}
        {#if draft.matchKind === "meaning"}
          <Textarea
            aria-invalid={shown("pattern") ? "true" : undefined}
            class="resize-y"
            id="rule-pattern"
            onblur={() => {
              touched.pattern = true;
            }}
            placeholder="Is the agent proposing to keep old behaviour alongside the new, a compatibility shim, or a fallback path?"
            rows={3}
            bind:value={draft.pattern}
          />
        {:else}
          <Input
            aria-invalid={shown("pattern") ? "true" : undefined}
            autocomplete="off"
            class="font-mono"
            id="rule-pattern"
            onblur={() => {
              touched.pattern = true;
            }}
            placeholder={draft.matchKind === "phrase"
              ? "honest caveat"
              : "should (work|be fine)|probably works"}
            spellcheck="false"
            bind:value={draft.pattern}
          />
        {/if}
      </Field>
      <!-- Text-matching options fold away for a meaning rule rather than popping. -->
      <div
        data-slot="fold"
        class="fold"
        inert={draft.matchKind === "meaning"}
        {@attach folds(() => draft.matchKind !== "meaning", FOLD)}
      >
        <SwitchField
          id="rule-case"
          label="Case sensitive"
          bind:checked={draft.caseSensitive}
        />
        {#if draft.matchKind === "phrase"}
          <div in:unfold out:unfold>
            <SwitchField
              id="rule-whole"
              label="Whole words only"
              bind:checked={draft.wholeWord}
            />
          </div>
        {/if}
      </div>
      <Choice
        label="Read"
        onchange={(next) => {
          draft.watch = next as RuleWatch;
        }}
        options={WATCH}
        value={draft.watch}
      />
      {#if draft.watch !== "text" && draft.timing === "turn"}
        <p class="caution" in:unfold out:unfold>
          Reasoning is not kept once a turn is over. To watch thinking, fire on
          the message or the moment instead.
        </p>
      {/if}
      <div
        data-slot="fold"
        class="fold"
        inert={draft.matchKind === "meaning"}
        {@attach folds(() => draft.matchKind !== "meaning", FOLD)}
      >
        <RuleTester {draft} bind:sample />
      </div>
    </div>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconPlain} label="What CawCo sends back">
    <p data-slot="note" class="note">
      The session is told this is CawCo and not you, so it does not answer you
      for something you never said.
    </p>
    <div data-slot="fold" class="fold">
      <Field id="rule-reply" label="Reply" problem={shown("reply")}>
        <Textarea
          aria-invalid={shown("reply") ? "true" : undefined}
          class="resize-y"
          id="rule-reply"
          onblur={() => {
            touched.reply = true;
          }}
          placeholder="if there's an honest caveat that you are aware of and you're just reporting it to the user instead of fixing it, then your work is not done yet"
          rows={4}
          bind:value={draft.reply}
        />
      </Field>
      <Field
        hint={how}
        id="rule-timing"
        label="Send it"
        problem={shown("timing")}
      >
        <Choice
          label="Send it"
          onchange={(next) => {
            draft.timing = next as RuleTiming;
          }}
          options={TIMING.map((option) => ({
            value: option.value,
            label: option.label,
            disabled:
              option.value === "immediate" && draft.matchKind === "meaning",
          }))}
          value={draft.timing}
        />
      </Field>
    </div>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconMapPoint} label="Where it applies">
    <p data-slot="note" class="note">
      Everywhere unless you narrow it. Each filter you set has to match for the
      rule to fire. A model matches as a substring, so a family name covers
      every dated build of it.
    </p>
    <div class="pickers">
      <PickerChip
        label="Machine"
        onpick={(next) => narrow("machineId", next)}
        options={[
          { value: "", label: "Every machine" },
          ...cawco.machines.map((machine) => ({
            value: machine.machineId,
            label: machine.hostname,
          })),
        ]}
        value={draft.scope.machineId ?? ""}
      />
      <PickerChip
        label="Project"
        onpick={(next) => narrow("projectId", next)}
        options={[
          { value: "", label: "Every project" },
          ...cawco.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
        value={draft.scope.projectId ?? ""}
      />
      <PickerChip
        label="Harness"
        onpick={(next) => narrow("harness", next)}
        options={[
          { value: "", label: "Every harness" },
          ...HARNESSES.map((harness) => ({ value: harness, label: harness })),
        ]}
        value={draft.scope.harness ?? ""}
      />
      <PickerChip
        label="Model"
        onpick={(next) => narrow("model", next)}
        options={[
          { value: "", label: "Every model" },
          ...models.map((model) => ({ value: model, label: model })),
          ...(draft.scope.model && !models.includes(draft.scope.model)
            ? [{ value: draft.scope.model, label: draft.scope.model }]
            : []),
        ]}
        value={draft.scope.model ?? ""}
      />
    </div>
  </EditorSection>

  <div data-slot="fold" class="fold">
    <EditorSection hue={HUE} icon={IconPin} label="Making it stick">
      <SwitchField
        id="rule-repeat"
        label="Fire again every time it matches"
        bind:checked={draft.repeat}
      >
        {#snippet hint()}
          <!-- The two readings cross-fade in one box, its height following. -->
          <span data-slot="swap" class="swap" {@attach morph()}>
            {#if draft.repeat}
              <span in:crossIn out:crossOut>
                The session gets your reply each time it is tripped. It stops
                after ten in a row in one session.
              </span>
            {:else}
              <span in:crossIn out:crossOut>
                The rule fires once per session and then goes quiet, whether or
                not anything came of it.
              </span>
            {/if}
          </span>
        {/snippet}
      </SwitchField>
    </EditorSection>
  </div>

  {#if id}
    <EditorSection hue={HUE} icon={IconHistory} label="What it has caught">
      <RuleActivity ruleId={id} />
    </EditorSection>
  {/if}
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
  .caution {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  /* Folds shut to nothing, taking the section's 8px gap with it, then opens
     back to its content's height (motion/fold.svelte.ts). */
  .fold {
    display: flex;
    flex-direction: column;
    gap: inherit;
  }
  .swap {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
