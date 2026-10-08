<script lang="ts">
  import {
    agentProblem,
    type FleetAgent,
    parseAgentFrontMatter,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconDocument } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { confirm } from "../../confirm.svelte";
  import { removeAgent, saveAgent } from "../../fleet";
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
  const HUE = "var(--hue-orange-500)";

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
  let deleting = $state(false);
  let refused = $state<string | undefined>(undefined);

  const front = $derived(parseAgentFrontMatter(draft));
  const problem = $derived(agentProblem(front, agent?.name));
  /** Where the file goes: the row being edited, or whatever this one calls itself. */
  const target = $derived(agent?.name ?? front.name);
  const dirty = $derived(draft !== (agent?.content ?? TEMPLATE));
  /** A new subagent was just created: its draft is over, and a second Save would write it again. */
  let created = false;
  const kept = keepDraft(
    page.url.pathname,
    () => (dirty ? draft : null),
    (stored: string) => {
      draft = stored;
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
  async function save() {
    if (!target || saving || created) {
      return;
    }
    saving = true;
    refused = undefined;
    let made: string | undefined;
    try {
      const saved = await saveAgent(target, draft);
      const fleet = store.fleet.value;
      if (fleet) {
        upsert(fleet.agents, saved, (row) => row.name === saved.name);
      }
      if (!agent) {
        created = true;
        kept.drop();
        made = saved.name;
      }
      toast.success(`${target} is on its way to every machine that is online.`);
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
    if (made) {
      await savedShown();
      store.mark(made);
      await goto("/config/subagents");
    }
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/subagents");
  }

  async function askForget() {
    if (!agent) {
      return;
    }
    await confirm({
      title: `Remove ${agent.name}?`,
      body: "The fleet forgets it. Every machine keeps the file it was already given, and lists it as unmanaged, until the daemon can take one away itself.",
      confirmLabel: "Remove",
      pendingLabel: "Removing…",
      run: async () => {
        deleting = true;
        try {
          await removeAgent(agent.name);
          kept.drop();
          // Back to the list first, so the row is seen leaving it.
          await goto("/config/subagents");
          const fleet = store.fleet.value;
          if (fleet) {
            fleet.agents = fleet.agents.filter(
              (row) => row.name !== agent.name
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
  canSave={Boolean(target) && dirty}
  deleteLabel={agent ? "Remove from the fleet" : undefined}
  {deleting}
  failed={refused !== undefined}
  oncancel={cancel}
  ondelete={agent ? askForget : undefined}
  onsubmit={save}
  saveLabel={agent ? "Save changes" : "Create subagent"}
  {saving}
  title={agent ? agent.name : "New subagent"}
>
  {#snippet header()}
    <h1 class="title">{agent ? agent.name : front.name || "New subagent"}</h1>
    <p class="note">
      The file is the definition. It lands at
      <span class="font-mono">~/.claude/agents/{target ?? "name"}.md</span>
      on every machine, and Claude Code picks it up within seconds.
    </p>
    {#if refused}
      <p class="problem" role="alert" in:appear>{refused}</p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconDocument} label="Definition">
    {#snippet right()}
      <span class="claims num">{claims.join(" · ")}</span>
    {/snippet}
    {#if problem}
      <p class="caution">Not storable yet — {problem}.</p>
    {:else if front.description}
      <p class="note">{front.description}</p>
    {/if}
    <Textarea
      aria-label="{target ?? "New"} definition"
      class="min-h-80 resize-y font-mono"
      spellcheck="false"
      bind:value={draft}
    />
  </EditorSection>
</EditorFrame>

<style>
  .title {
    font: var(--type-title);
    font-family: var(--font-mono);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .note,
  .claims {
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
</style>
