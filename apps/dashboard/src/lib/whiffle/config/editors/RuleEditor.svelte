<script lang="ts">
  import type {
    HarnessKind,
    RuleAction,
    RuleDraft,
    RuleMatchKind,
    RuleRow,
    RuleTiming,
    RuleTrigger,
    RuleWatch,
  } from "@whiffle/core";
  import { HARNESSES, ruleProblem, ruleSentence } from "@whiffle/core";
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    IconEye,
    IconHistory,
    IconMapPoint,
    IconPin,
    IconPlain,
    IconSparkles,
  } from "$lib/icons";
  import { appear } from "$lib/whiffle/motion/curves.svelte";
  import { folds } from "$lib/whiffle/motion/fold.svelte";
  import { whiffle } from "../../client.svelte";
  import { confirm } from "../../confirm.svelte";
  import RuleActivity from "../../RuleActivity.svelte";
  import RuleTester from "../../RuleTester.svelte";
  import {
    blankRule,
    createRule,
    draftOf,
    message,
    removeRule,
    saveRule,
    WHIP_PRESETS,
  } from "../../rules";
  import Choice from "../Choice.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import Field from "../Field.svelte";
  import PickerChip from "../PickerChip.svelte";
  import ReadingWell from "../ReadingWell.svelte";
  import RowList from "../RowList.svelte";
  import SectionRow from "../SectionRow.svelte";
  import SwitchField from "../SwitchField.svelte";
  import { configStore, upsert, withStats } from "../store.svelte";
  import TitleInput from "../TitleInput.svelte";

  /**
   * The rule editor. A rule is a sentence, and this screen is that sentence
   * twice: read back in English at the top, live, and as the fields that
   * compose it. The English is the one place the interaction between timing,
   * interruption and acknowledgement is legible at a glance.
   */
  let { rule, taken }: { rule: RuleRow | null; taken: string[] } = $props();

  const store = configStore();
  const HUE = "var(--hue-green-500)";

  let draft = $state<RuleDraft>(
    untrack(() => (rule ? draftOf(rule) : blankRule()))
  );
  let sample = $state("");
  let busy = $state(false);
  let deleting = $state(false);
  let failed = $state<string | undefined>(undefined);
  let touched = $state<Record<string, boolean>>({});
  let attempted = $state(false);
  let openrouterConnected = $state(true);

  onMount(() => {
    fetch("/api/openrouter")
      .then(async (response) => {
        openrouterConnected = response.ok
          ? ((await response.json()) as { connected: boolean }).connected
          : false;
      })
      .catch(() => {
        openrouterConnected = false;
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
        whiffle.instances
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

  function setTrigger(next: RuleTrigger) {
    draft.trigger = next;
    if (next === "every-turn") {
      draft.action = "llm";
      draft.timing = "turn";
      draft.interrupt = false;
      draft.requireAck = false;
    }
  }

  function setAction(next: RuleAction) {
    draft.action = next;
    if (next === "llm") {
      draft.timing = "turn";
      draft.interrupt = false;
      draft.requireAck = false;
    }
  }

  function usePreset(preset: (typeof WHIP_PRESETS)[number]) {
    draft.name = preset.name;
    draft.trigger = preset.trigger;
    draft.action = preset.action;
    draft.prompt = preset.prompt;
    draft.timing = "turn";
    draft.interrupt = false;
    draft.requireAck = false;
    draft.enabled = true;
  }

  /** A meaning rule is a question Jev answers about a finished message or turn. */
  function setMatchKind(next: RuleMatchKind) {
    draft.matchKind = next;
    if (next === "meaning") {
      draft.caseSensitive = false;
      draft.wholeWord = false;
      if (draft.timing === "immediate") {
        draft.timing = "turn";
        draft.interrupt = false;
      }
    }
  }

  function setTiming(next: RuleTiming) {
    draft.timing = next;
    if (next !== "immediate") {
      draft.interrupt = false;
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

  async function save() {
    attempted = true;
    if (!ready || busy) {
      return;
    }
    busy = true;
    failed = undefined;
    try {
      const trimmed = { ...draft, name: draft.name.trim() };
      const saved = await (id ? saveRule(id, trimmed) : createRule(trimmed));
      const rows = store.rules.value;
      if (rows) {
        upsert(
          rows,
          withStats(saved, rule?.stats),
          (row) => row.id === saved.id
        );
      }
      store.mark(saved.id);
      toast.success(`${trimmed.name} is live on every session it applies to.`);
      await goto("/config/rules");
    } catch (error) {
      failed = message(error);
    } finally {
      busy = false;
    }
  }

  async function askRemove() {
    if (!id) {
      return;
    }
    await confirm({
      title: `Delete ${draft.name || "this rule"}?`,
      body: "This rule stops applying to every session and is removed for good. You can always write it again, but there's no undo.",
      confirmLabel: "Delete rule",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        deleting = true;
        try {
          await removeRule(id, draft.name);
          if (store.rules.value) {
            store.rules.value = store.rules.value.filter(
              (row) => row.id !== id
            );
          }
          await goto("/config/rules");
        } catch (error) {
          failed = message(error);
          deleting = false;
        }
      },
    });
  }

  /** Text-matching options fold away for a meaning rule: 300ms, settling in. */
  const FOLD = {
    ms: 300,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    fade: true,
    gap: 8,
  };
</script>

<EditorFrame
  deleteLabel={id ? 'Delete rule' : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={() => goto('/config/rules')}
  ondelete={id ? askRemove : undefined}
  onsubmit={save}
  saveLabel={id ? 'Save changes' : 'Create rule'}
  saving={busy}
  title={id ? draft.name || 'Rule' : 'New rule'}
>
  {#snippet header()}
    <TitleInput
      invalid={Boolean(shown('name') || duplicate)}
      label="Rule name"
      onblur={() => {
        touched.name = true;
      }}
      placeholder="Name this rule"
      bind:value={draft.name}
    />
    {#if shown('name')}
      <p class="problem" in:appear>{wrong.name}</p>
    {:else if duplicate}
      <p class="problem" in:appear>{duplicate}</p>
    {/if}
    <ReadingWell>{ruleSentence(draft)}</ReadingWell>
    <SwitchField
      hint={draft.enabled ? 'Watching every session it applies to' : 'Off — it watches nothing'}
      id="rule-enabled"
      label="Enabled"
      bind:checked={draft.enabled}
    />
    {#if failed}
      <p class="problem" role="alert" in:appear>{failed}</p>
    {/if}
  {/snippet}

  {#if !id}
    <EditorSection hue={HUE} icon={IconSparkles} label="Start from a preset">
      <p class="note">
        Supervisor rules that catch the habits coding agents fall into. Using
        one fills the form; it is an ordinary rule once saved.
      </p>
      <RowList label="Presets">
        {#each WHIP_PRESETS as preset (preset.name)}
          <SectionRow
            hue={HUE}
            icon={IconSparkles}
            meta={preset.prompt}
            name={preset.name}
          >
            {#snippet trailing()}
              <Button
                onclick={() => usePreset(preset)}
                size="sm"
                variant="outline"
              >
                Use
              </Button>
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    </EditorSection>
  {/if}

  <EditorSection hue={HUE} icon={IconEye} label="What to watch for">
    <p class="note">
      Whiffle reads what a session writes, not what you write to it.
    </p>
    <Choice
      label="Trigger"
      onchange={(next) => setTrigger(next as RuleTrigger)}
      options={[
        { value: 'pattern', label: 'A pattern match' },
        { value: 'every-turn', label: 'Every turn' },
      ]}
      value={draft.trigger}
    />
    {#if shown('trigger')}
      <p class="problem" in:appear>{wrong.trigger}</p>
    {/if}
    {#if draft.trigger === 'every-turn'}
      <p class="note">
        The rule fires at the end of every turn — no pattern needed. The
        supervisor judges each turn and decides what to do.
      </p>
    {:else}
      <Choice
        label="Match"
        onchange={(next) => setMatchKind(next as RuleMatchKind)}
        options={[
          { value: 'phrase', label: 'A phrase' },
          { value: 'regex', label: 'A regular expression' },
          { value: 'meaning', label: 'Meaning' },
        ]}
        value={draft.matchKind}
      />
      <Field
        id="rule-pattern"
        label={PATTERN_LABEL[draft.matchKind]}
        problem={shown('pattern')}
      >
        {#snippet warn()}
          {#if draft.matchKind === 'meaning' && !openrouterConnected}
            Meaning rules need OpenRouter —
            <a class="underline underline-offset-2" href="/config/models"
              >connect it in Models Whiffle uses</a
            >
          {/if}
        {/snippet}
        {#snippet hint()}
          {#if draft.matchKind === 'meaning'}
            Jev answers it about each finished message or turn. The rule fires
            when the answer is yes.
          {:else if draft.matchKind === 'regex'}
            JavaScript syntax. It is matched against the whole message, not line
            by line.
          {/if}
        {/snippet}
        {#if draft.matchKind === 'meaning'}
          <Textarea
            aria-invalid={shown('pattern') ? 'true' : undefined}
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
            aria-invalid={shown('pattern') ? 'true' : undefined}
            autocomplete="off"
            class="font-mono"
            id="rule-pattern"
            onblur={() => {
              touched.pattern = true;
            }}
            placeholder={draft.matchKind === 'phrase' ? 'honest caveat' : 'should (work|be fine)|probably works'}
            spellcheck="false"
            bind:value={draft.pattern}
          />
        {/if}
      </Field>
      <!-- Text-matching options fold away for a meaning rule rather than popping. -->
      <div
        class="fold"
        inert={draft.matchKind === 'meaning'}
        {@attach folds(() => draft.matchKind !== 'meaning', FOLD)}
      >
        <SwitchField
          id="rule-case"
          label="Case sensitive"
          bind:checked={draft.caseSensitive}
        />
        {#if draft.matchKind === 'phrase'}
          <SwitchField
            id="rule-whole"
            label="Whole words only"
            bind:checked={draft.wholeWord}
          />
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
      {#if draft.watch !== 'text' && draft.timing === 'turn'}
        <p class="caution">
          Reasoning is not kept once a turn is over. To watch thinking, fire on
          the message or the moment instead.
        </p>
      {/if}
      <div
        class="fold"
        inert={draft.matchKind === 'meaning'}
        {@attach folds(() => draft.matchKind !== 'meaning', FOLD)}
      >
        <RuleTester {draft} bind:sample />
      </div>
    {/if}
  </EditorSection>

  <EditorSection hue={HUE} icon={IconPlain} label="What Whiffle sends back">
    <p class="note">
      The session is told this is Whiffle and not you, so it does not answer you
      for something you never said.
    </p>
    <Choice
      label="Action"
      onchange={(next) => setAction(next as RuleAction)}
      options={[
        { value: 'reply', label: 'Canned reply', disabled: draft.trigger === 'every-turn' },
        { value: 'llm', label: 'LLM verdict' },
      ]}
      value={draft.action}
    />
    {#if draft.action === 'reply'}
      <Field id="rule-reply" label="Reply" problem={shown('reply')}>
        <Textarea
          aria-invalid={shown('reply') ? 'true' : undefined}
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
        problem={shown('timing')}
      >
        <Choice
          label="Send it"
          onchange={(next) => setTiming(next as RuleTiming)}
          options={TIMING.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: option.value === 'immediate' && draft.matchKind === 'meaning',
          }))}
          value={draft.timing}
        />
      </Field>
      {#if draft.timing === 'immediate'}
        <SwitchField
          hint="A claude session reads it mid-turn without stopping. Other harnesses cut the turn short to deliver it, which loses whatever they were partway through."
          id="rule-interrupt"
          label="Interrupt the running turn"
          bind:checked={draft.interrupt}
        />
      {/if}
    {:else}
      <p class="note">
        The supervisor reads the turn and decides what to say. You write the
        standing instructions; it writes the reply.
      </p>
      <Field
        id="rule-prompt"
        label="Supervisor instructions"
        problem={shown('prompt')}
      >
        <Textarea
          aria-invalid={shown('prompt') ? 'true' : undefined}
          class="resize-y"
          id="rule-prompt"
          onblur={() => {
            touched.prompt = true;
          }}
          placeholder="If the agent claims work is done without pasting test output, reject the claim. Tell it to run the tests and paste the full output."
          rows={4}
          bind:value={draft.prompt}
        />
      </Field>
      {#if shown('timing')}
        <p class="problem" in:appear>{wrong.timing}</p>
      {/if}
    {/if}
  </EditorSection>

  <EditorSection hue={HUE} icon={IconMapPoint} label="Where it applies">
    <p class="note">
      Everywhere unless you narrow it. Each filter you set has to match for the
      rule to fire. A model matches as a substring, so a family name covers
      every dated build of it.
    </p>
    <div class="pickers">
      <PickerChip
        label="Machine"
        onpick={(next) => narrow('machineId', next)}
        options={[
          { value: '', label: 'Every machine' },
          ...whiffle.machines.map((machine) => ({ value: machine.machineId, label: machine.hostname })),
        ]}
        value={draft.scope.machineId ?? ''}
      />
      <PickerChip
        label="Project"
        onpick={(next) => narrow('projectId', next)}
        options={[
          { value: '', label: 'Every project' },
          ...whiffle.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
        value={draft.scope.projectId ?? ''}
      />
      <PickerChip
        label="Harness"
        onpick={(next) => narrow('harness', next)}
        options={[
          { value: '', label: 'Every harness' },
          ...HARNESSES.map((harness) => ({ value: harness, label: harness })),
        ]}
        value={draft.scope.harness ?? ''}
      />
      <PickerChip
        label="Model"
        onpick={(next) => narrow('model', next)}
        options={[
          { value: '', label: 'Every model' },
          ...models.map((model) => ({ value: model, label: model })),
          ...(draft.scope.model && !models.includes(draft.scope.model)
            ? [{ value: draft.scope.model, label: draft.scope.model }]
            : []),
        ]}
        value={draft.scope.model ?? ''}
      />
    </div>
  </EditorSection>

  {#if draft.action === 'reply'}
    <EditorSection hue={HUE} icon={IconPin} label="Making it stick">
      <SwitchField
        id="rule-ack"
        label="Keep firing until the session acknowledges"
        bind:checked={draft.requireAck}
      >
        {#snippet hint()}
          {#if draft.requireAck}
            The reply asks the session to call
            <span class="font-mono">note_for_user</span>
            and say what it did about it. Until then the rule fires again every
            time it is tripped. It stops after ten in one session.
          {:else}
            The rule fires once per session and then goes quiet, whether or not
            anything came of it.
          {/if}
        {/snippet}
      </SwitchField>
    </EditorSection>
  {/if}

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
  .pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
