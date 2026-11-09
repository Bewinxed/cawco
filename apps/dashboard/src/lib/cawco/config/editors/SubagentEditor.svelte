<script lang="ts">
  import { userLayerLabel } from "@cawco/core/claude-dirs";
  import { detach } from "@cawco/core/detach";
  import {
    agentProblem,
    type FleetAgent,
    parseAgentFrontMatter,
  } from "@cawco/core/fleet";
  import { commonWords } from "@cawco/core/words/common";
  import { memoryWords } from "@cawco/core/words/memory";
  import { untrack } from "svelte";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconDocument } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { saveAgent } from "../../fleet";
  import { deleteAgent } from "../deletes";
  import { keepDraft } from "../drafts.svelte";
  import { savedShown } from "../EditorFooter.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import { configStore, upsert } from "../store.svelte";

  /**
   * One subagent, edited as what it is: a markdown file. There is no form —
   * Claude Code reads many optional front-matter fields and adds more with
   * every release, so a form would be a second, always-older schema. The line
   * above the text says what the file currently claims to be.
   */
  let { agent }: { agent: FleetAgent | null } = $props();

  const store = configStore();
  const HUE = "var(--color-mark-2)";

  /** The docs' own shape: two required fields, then a role line and its rules. */
  const TEMPLATE = `---
name: new-subagent
description: Use this agent proactively when <the situation it is for>.
---

You are a <role>, working in one repository at a time.

<What you do, what you never do, and what you hand back.>
  `;

  let draft = $state(untrack(() => agent?.content ?? TEMPLATE));
  let saving = $state(false);
  /** The save running is "Save mine anyway", over a conflict. */
  let forcing = $state(false);
  let deleting = $state(false);
  let refused = $state<string | undefined>(undefined);
  /** The file the hub has instead, when a save found it moved: a save writes nothing over what it never saw. */
  let conflict = $state<FleetAgent | null>(null);

  const front = $derived(parseAgentFrontMatter(draft));
  const problem = $derived(agentProblem(front, agent?.name));
  /** Where the file goes: the row being edited, or whatever this one calls itself. */
  const target = $derived(agent?.name ?? front.name);
  const dirty = $derived(draft !== (agent?.content ?? TEMPLATE));
  /**
   * The version the edit started from, "" for a new file, as the memory
   * editor keeps it: a save names it, so a file that moved since (another
   * tab, an agent's admin write, a draft kept across a reload) is refused
   * and the conflict shows. With nothing unsaved it is the saved version.
   */
  let base = $state(untrack(() => agent?.hash ?? ""));
  $effect.pre(() => {
    if (!dirty) {
      base = agent?.hash ?? "";
    }
  });
  /** A new subagent was just created: its draft is over, and a second Save would write it again. */
  let created = false;
  const kept = keepDraft<{ draft: string; base: string }>(
    page.url.pathname,
    () => (dirty ? { draft, base } : null),
    // A draft kept before it carried its base was the bare text: not
    // brought back, since no save could name what it started from.
    (stored) => {
      if (typeof stored === "object") {
        ({ draft, base } = stored);
      }
    }
  );

  const claims = $derived(
    [
      front.model && front.model !== "inherit" ? front.model : null,
      front.tools ? `${front.tools.length} tools` : null,
      front.effort ? `${front.effort} effort` : null,
    ].filter((part): part is string => part !== null)
  );

  /**
   * Saving a subagent keeps the editor open on it, the Save button saying
   * so in place; a new one shows the same, then returns to the list, where
   * it is marked.
   */
  async function save(expectedHash = base) {
    if (!target || saving || created) {
      return;
    }
    saving = true;
    forcing = conflict !== null && expectedHash === conflict.hash;
    refused = undefined;
    let made: string | undefined;
    try {
      const written = await saveAgent(target, draft, expectedHash);
      if (!written.ok) {
        conflict = written.latest;
        return;
      }
      conflict = null;
      const saved = written.done;
      const fleet = store.fleet.value;
      if (fleet) {
        upsert(fleet.agents, saved, (row) => row.name === saved.name);
      }
      if (!agent) {
        created = true;
        kept.drop();
        made = saved.name;
      }
    } catch (error) {
      refused = failureWords(error);
    } finally {
      saving = false;
      forcing = false;
    }
    if (made) {
      await savedShown();
      store.mark(made);
      await goto("/config/subagents");
    }
  }

  function takeLatest() {
    if (!conflict) {
      return;
    }
    const latest = conflict;
    const fleet = store.fleet.value;
    if (fleet) {
      upsert(fleet.agents, latest, (row) => row.name === latest.name);
    }
    draft = latest.content;
    conflict = null;
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    detach(goto("/config/subagents"), "goto");
  }

  /** Remove: at once, with Undo in the toast (deletes.ts). */
  async function forget() {
    if (!agent) {
      return;
    }
    deleting = true;
    refused = undefined;
    try {
      await deleteAgent(store, agent, () => {
        kept.drop();
        return goto("/config/subagents");
      });
    } catch (error) {
      deleting = false;
      refused = failureWords(error);
    }
  }
</script>

<EditorFrame
  canSave={Boolean(target) && dirty}
  deleteLabel={agent ? "Remove from the fleet" : undefined}
  {deleting}
  failed={refused !== undefined || conflict !== null}
  oncancel={cancel}
  ondelete={agent ? forget : undefined}
  onsubmit={() => save()}
  saveLabel={agent ? commonWords.saveChanges : "Create subagent"}
  saving={saving && !forcing}
  title={agent ? agent.name : "New subagent"}
>
  {#snippet header()}
    <h1 data-slot="title" class="type-title wrap-anywhere text-ink-strong">
      {agent ? agent.name : front.name || "New subagent"}
    </h1>
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      The file is the definition. It lands at
      <span class="type-code"
        >{userLayerLabel("agents", `${target ?? "name"}.md`)}</span
      >
      on every machine, and Claude Code picks it up within seconds.
    </p>
    {#if refused}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>
        {refused}
      </p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconDocument} label="Definition">
    {#snippet right()}
      <span data-slot="num" class="num type-meta max-w-c-measure text-ink-muted"
        >{claims.join(" · ")}</span
      >
    {/snippet}
    {#if conflict}
      <div class="flex flex-col gap-space-2" in:unfold out:unfold>
        <p class="type-meta text-status-attn-ink">
          {memoryWords.changedElsewhere}
        </p>
        {#key conflict.hash}
          <DiffView
            filePath="{conflict.name}.md"
            newContent={draft}
            oldContent={conflict.content}
          />
        {/key}
        <div data-slot="acts" class="flex flex-wrap gap-space-2">
          <Button
            disabled={saving}
            onclick={takeLatest}
            size="sm"
            variant="outline"
          >
            {memoryWords.takeLatest}
          </Button>
          <Button
            disabled={saving && !forcing}
            label={memoryWords.saveMine}
            onclick={() => save(conflict?.hash)}
            pending={saving && forcing}
            pendingLabel={memoryWords.saving}
            size="sm"
            variant="outline"
          />
        </div>
      </div>
    {/if}
    {#if problem}
      <p class="type-meta text-status-attn-ink">
        Not storable yet — {problem}.
      </p>
    {:else if front.description}
      <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
        {front.description}
      </p>
    {/if}
    <Textarea
      aria-label="{target ?? 'New'} definition"
      face="mono"
      height="tall"
      resize="block"
      spellcheck="false"
      bind:value={draft}
    />
  </EditorSection>
</EditorFrame>
