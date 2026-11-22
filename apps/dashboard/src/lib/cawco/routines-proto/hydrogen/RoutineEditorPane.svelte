<script lang="ts">
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconSparkles } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import EditorScheduleFields from "./EditorScheduleFields.svelte";
  import FieldSelect from "./FieldSelect.svelte";
  import PaneFrame from "./PaneFrame.svelte";
  import { MOCK_MACHINE, type Routine } from "./routines-data";
  import {
    type BadDraftField,
    HARNESS_OPTIONS,
    initialDraftFromRoutine,
    type RoutineDraftSubmit,
    validateRoutineDraft,
  } from "./routines-state";

  interface Props {
    editing?: Routine | null;
    onaskcaw: (prompt: string) => void;
    onback?: () => void;
    onclose: () => void;
    onsubmit: (draft: RoutineDraftSubmit) => void;
    phone?: boolean;
    stale?: boolean;
  }

  let {
    editing = null,
    stale = false,
    phone = false,
    onback,
    onclose,
    onsubmit,
    onaskcaw,
  }: Props = $props();

  const isBuiltIn = $derived(Boolean(editing?.builtIn));
  const heading = $derived(editing ? `Edit · ${editing.name}` : "New routine");

  let draft = $state<RoutineDraftSubmit>(initialDraftFromRoutine(null));
  let fault = $state<string | null>(null);
  let badField = $state<BadDraftField>(null);
  let loadedKey = "";

  function resetFromTarget(target: Routine | null): void {
    fault = null;
    badField = null;
    draft = initialDraftFromRoutine(target);
  }

  $effect(() => {
    const nextKey = editing ? `edit:${editing.id}` : "create";
    if (nextKey !== loadedKey) {
      loadedKey = nextKey;
      resetFromTarget(editing);
    }
  });

  const hasDoneWhen = $derived(draft.doneWhenStatement.trim().length > 0);
  const isCommandRun = $derived(
    !isBuiltIn && hasDoneWhen && draft.doneWhenMethod === "command"
  );

  function cawPromptForDraft(): string {
    if (editing) {
      return `Change routine "${editing.name}": `;
    }
    const clean = draft.name.trim();
    return clean
      ? `Set up a routine called "${clean}": `
      : "Set up a routine that ";
  }

  function handleSave(event: SubmitEvent): void {
    event.preventDefault();
    fault = null;
    badField = null;

    const cleanName = draft.name.trim();
    const issue = validateRoutineDraft({
      cadence: draft.cadence,
      cleanName,
      cron: draft.cron,
      doneWhenCommand: draft.doneWhenCommand,
      doneWhenMethod: draft.doneWhenMethod,
      giveUpDate: draft.giveUpDate,
      hasDoneWhen,
      instructions: draft.instructions,
      isBuiltIn,
      isCommandRun,
    });
    if (issue) {
      badField = issue.field;
      fault = issue.reason;
      return;
    }

    const statement = draft.doneWhenStatement.trim();
    onsubmit({
      ...draft,
      cron: draft.cron.trim(),
      doneWhenCommand: draft.doneWhenCommand.trim(),
      doneWhenStatement: statement,
      instructions: draft.instructions.trim() || statement,
      name: cleanName,
    });
  }
</script>

<PaneFrame
  backLabel="Back to routine"
  backTo={editing ? editing.name : "Routines"}
  label={heading}
  {onback}
  {onclose}
  {phone}
  slotName="editor"
  title={heading}
>
  <form
    class="flex flex-col gap-space-5"
    data-routine-editor
    onsubmit={handleSave}
  >
    <header class="flex flex-wrap items-center justify-between gap-space-2">
      <h2 class="m-0 type-title text-ink-strong">{heading}</h2>
      <Button
        disabled={stale}
        icon={IconSparkles}
        label="Tell Caw instead"
        onclick={() => onaskcaw(cawPromptForDraft())}
        size="xs"
        variant="ghost"
      />
    </header>

    {#if isBuiltIn}
      <Alert variant="default">
        <AlertDescription>
          Built-in CawCo routine: schedule changes apply, while its name and
          instructions stay fixed.
        </AlertDescription>
      </Alert>
    {/if}

    <div class="flex flex-col gap-space-1">
      <label class="type-label text-ink-strong" for="rtn-name">Name</label>
      <Input
        aria-invalid={badField === "name" || undefined}
        disabled={isBuiltIn}
        id="rtn-name"
        placeholder="e.g. Morning PR triage"
        bind:value={draft.name}
      />
      <div class="flex justify-end">
        <span
          class={[
            "type-meta tabular-nums",
            draft.name.trim().length > 64
              ? "text-status-fail-ink"
              : "text-ink-subtle",
          ]}
        >
          {draft.name.trim().length}/64 characters
        </span>
      </div>
    </div>

    {#if !isBuiltIn}
      <div class="flex flex-col gap-space-1">
        <label class="type-label text-ink-strong" for="rtn-instructions">
          What each run does
        </label>
        <Textarea
          aria-invalid={badField === "instructions" || undefined}
          id="rtn-instructions"
          placeholder="Write plain instructions for each run…"
          bind:value={draft.instructions}
        />
      </div>

      <section
        class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
      >
        <div class="flex flex-col gap-space-1">
          <label class="type-label text-ink-strong" for="rtn-done-when">
            Done when (optional)
          </label>
          <Textarea
            aria-invalid={badField === "statement" || undefined}
            id="rtn-done-when"
            placeholder="e.g. Release v2.4.0 is live on GitHub with signed tarballs."
            bind:value={draft.doneWhenStatement}
          />
          <p class="m-0 type-meta text-ink-muted">
            Leave blank to repeat on schedule. Fill in to let tasks wait on this
            and stop once true.
          </p>
        </div>

        {#if hasDoneWhen}
          <div class="flex flex-col gap-space-3" transition:unfold>
            <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
              <legend class="type-label text-ink-strong">How to check</legend>
              <OptionGroup
                aria-label="How to check"
                bind:value={
                  () => [draft.doneWhenMethod],
                  (next) => {
                    const [picked] = next;
                    if (picked === "model" || picked === "command") {
                      draft.doneWhenMethod = picked;
                    }
                  }
                }
              >
                <OptionGroupItem value="model">Ask an agent</OptionGroupItem>
                <OptionGroupItem value="command">
                  Check with a command
                </OptionGroupItem>
              </OptionGroup>
            </fieldset>

            {#if draft.doneWhenMethod === "command"}
              <div class="flex flex-col gap-space-1">
                <label class="type-label text-ink-strong" for="rtn-command">
                  Shell command
                </label>
                <Textarea
                  aria-describedby="rtn-command-help"
                  aria-invalid={badField === "command" || undefined}
                  face="mono"
                  id="rtn-command"
                  placeholder="curl -sf https://staging.cawco.dev/health"
                  bind:value={draft.doneWhenCommand}
                />
                <p class="m-0 type-meta text-ink-muted" id="rtn-command-help">
                  Runs sandboxed on {MOCK_MACHINE.hostname} without your credentials
                  (1m max): exit 0 means done, 124/126/127 or signal couldn't check,
                  anything else not yet.
                </p>
              </div>
            {/if}

            <div class="flex flex-col gap-space-1">
              <label class="type-label text-ink-strong" for="rtn-giveup">
                Stop trying after (optional)
              </label>
              <Input
                aria-invalid={badField === "date" || undefined}
                id="rtn-giveup"
                measure="cap-sm"
                min="2026-11-22"
                type="date"
                bind:value={draft.giveUpDate}
              />
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <EditorScheduleFields badCron={badField === "cron"} bind:draft />

    {#if !(isBuiltIn || isCommandRun)}
      <section
        class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
      >
        <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
          <legend class="type-label text-ink-strong">Who runs it</legend>
          <OptionGroup
            aria-label="Who runs it"
            bind:value={
              () => [draft.executorMode],
              (next) => {
                const [picked] = next;
                if (picked === "delegate" || picked === "orchestrator") {
                  draft.executorMode = picked;
                }
              }
            }
          >
            <OptionGroupItem value="delegate">Single session</OptionGroupItem>
            <OptionGroupItem value="orchestrator">
              Orchestrating session
            </OptionGroupItem>
          </OptionGroup>
        </fieldset>

        <FieldSelect
          ariaLabel="Harness"
          items={HARNESS_OPTIONS}
          label="Harness"
          onchange={(next) => {
            draft.harness = next;
          }}
          value={draft.harness}
        />
      </section>
    {/if}

    {#if !editing}
      <p class="m-0 type-meta text-ink-muted">
        Saving creates the routine and starts an immediate test run so you can
        inspect the result.
      </p>
    {/if}

    <RowFault reason={fault} />

    <footer
      class="flex flex-wrap items-center justify-end gap-space-2 border-t border-t-border-hairline pt-space-4"
    >
      <Button
        label="Cancel"
        onclick={onback ?? onclose}
        size="sm"
        variant="ghost"
      />
      <Button
        disabled={stale}
        label={editing ? "Save changes" : "Create routine"}
        size="sm"
        type="submit"
        variant="default"
      />
    </footer>
  </form>
</PaneFrame>
