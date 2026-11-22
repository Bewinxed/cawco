<script lang="ts">
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import EditorScheduleFields from "./EditorScheduleFields.svelte";
  import PaneFrame from "./PaneFrame.svelte";
  import type { Routine } from "./routines-data";
  import {
    type BadDraftField,
    initialDraft,
    type RoutineDraft,
    validateDraft,
  } from "./routines-state";

  interface Props {
    editing?: Routine | null;
    onback?: () => void;
    onclose: () => void;
    onsubmit: (draft: RoutineDraft) => void;
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
  }: Props = $props();

  const builtIn = $derived(Boolean(editing?.builtIn));
  const heading = $derived(editing ? `Edit ${editing.name}` : "New routine");

  let draft = $state<RoutineDraft>(initialDraft(null));
  let fault = $state<string | null>(null);
  let badField = $state<BadDraftField>(null);
  let loadedKey = "";

  // The form is the person's own draft: it starts from the routine it edits
  // and resets only when it moves to another one.
  $effect(() => {
    const key = editing ? `edit:${editing.id}` : "create";
    if (key !== loadedKey) {
      loadedKey = key;
      fault = null;
      badField = null;
      draft = initialDraft(editing);
    }
  });

  function save(event: SubmitEvent): void {
    event.preventDefault();
    const issue = validateDraft(draft, builtIn);
    fault = issue?.reason ?? null;
    badField = issue?.field ?? null;
    if (!issue) {
      onsubmit(draft);
    }
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
  <form class="flex flex-col gap-space-4" data-routine-editor onsubmit={save}>
    {#if builtIn}
      <p class="m-0 type-meta text-ink-muted">
        This routine is CawCo's own: you can change when it runs, and what it
        does stays fixed.
      </p>
    {:else}
      <div class="flex flex-col gap-space-1">
        <label class="type-label text-ink-strong" for="rtn-name">Name</label>
        <Input
          aria-invalid={badField === "name" || undefined}
          id="rtn-name"
          placeholder="Morning PR triage"
          bind:value={draft.name}
        />
      </div>

      <div class="flex flex-col gap-space-1">
        <label class="type-label text-ink-strong" for="rtn-instructions">
          What each run does
        </label>
        <Textarea
          aria-invalid={badField === "instructions" || undefined}
          id="rtn-instructions"
          bind:value={draft.instructions}
        />
      </div>

      <div class="flex flex-col gap-space-1">
        <label class="type-label text-ink-strong" for="rtn-guardrail">
          Only run when (optional)
        </label>
        <Input
          id="rtn-guardrail"
          placeholder="At least one release pull request is blocked"
          bind:value={draft.guardrail}
        />
      </div>
    {/if}

    <EditorScheduleFields bind:draft />

    {#if !editing}
      <p class="m-0 type-meta text-ink-muted">
        Adding it runs it once right away, so you can see what it does.
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
        label={editing ? "Save changes" : "Add routine"}
        size="sm"
        type="submit"
        variant="default"
      />
    </footer>
  </form>
</PaneFrame>
