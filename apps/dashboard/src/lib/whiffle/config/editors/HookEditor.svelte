<script lang="ts">
  import type { HookDraft, HookEvent, HookHandler } from "@whiffle/core";
  import {
    HOOK_EVENTS,
    hookEventInfo,
    hookProblem,
    hookSentence,
    hookTakesMatcher,
  } from "@whiffle/core";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    IconClockDuo,
    IconHistoryDuo,
    IconMapPointDuo,
    IconPlayDuo,
    IconTuningDuo,
  } from "$lib/icons";
  import { appear } from "$lib/whiffle/motion/curves.svelte";
  import { whiffle } from "../../client.svelte";
  import { confirm } from "../../confirm.svelte";
  import HookTester from "../../HookTester.svelte";
  import {
    blankHook,
    draftOf,
    type FleetHook,
    type HookVersion,
    loadHookVersions,
    message,
    removeHook,
    restoreHookVersion,
    saveHook,
  } from "../../hooks";
  import { newId } from "../../id";
  import Choice from "../Choice.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import Field from "../Field.svelte";
  import PickerChip from "../PickerChip.svelte";
  import ReadingWell from "../ReadingWell.svelte";
  import SwitchField from "../SwitchField.svelte";
  import { configStore, upsert } from "../store.svelte";
  import TitleInput from "../TitleInput.svelte";

  const WHITESPACE = /\s+/;
  const LATEST = 5;

  /**
   * The hook editor. A hook reads back as a sentence like a rule does, but it
   * also carries a matcher whose meaning is easy to get silently wrong, and
   * saving one writes executable material to every machine — so it has a live
   * tester for the matcher and a confirmation naming the blast radius.
   */
  let { hook, taken }: { hook: FleetHook | null; taken: string[] } = $props();

  const store = configStore();
  const HUE = "var(--hue-cyan-500)";

  let draft = $state<HookDraft>(
    untrack(() => (hook ? draftOf(hook) : blankHook()))
  );
  let sample = $state("");
  let busy = $state(false);
  let deleting = $state(false);
  let failed = $state<string | undefined>(undefined);
  let touched = $state<Record<string, boolean>>({});
  let attempted = $state(false);

  const id = $derived(hook?.id ?? null);
  const wrong = $derived(hookProblem(draft));
  const shown = (field: string): string | undefined =>
    attempted || touched[field] ? wrong[field] : undefined;

  const duplicate = $derived(
    draft.name.trim() !== "" && taken.includes(draft.name.trim())
      ? "Another hook already has that name. Two hooks called the same thing are two hooks you cannot tell apart in a machine’s registration."
      : undefined
  );
  const ready = $derived(
    Object.keys(wrong).length === 0 && duplicate === undefined
  );

  const eventInfo = $derived(hookEventInfo(draft.event));

  /** Switching to an event with no matcher clears one. */
  function setEvent(next: HookEvent) {
    draft.event = next;
    if (!hookTakesMatcher(next)) {
      draft.matcher = "";
    }
  }

  type HandlerType = HookHandler["type"];
  const HANDLERS: { value: HandlerType; label: string }[] = [
    { value: "command", label: "Command" },
    { value: "http", label: "HTTP" },
    { value: "mcp_tool", label: "MCP tool" },
    { value: "prompt", label: "Prompt" },
    { value: "agent", label: "Agent" },
  ];

  /** Swapping type keeps the three fields every handler shares and drops the rest. */
  function setHandlerType(next: HandlerType) {
    if (draft.handler.type === next) {
      return;
    }
    const { if: cond, timeout, statusMessage } = draft.handler;
    const shared = { if: cond, timeout, statusMessage };
    if (next === "command") {
      draft.handler = { type: "command", ...shared };
    } else if (next === "http") {
      draft.handler = { type: "http", url: "", ...shared };
    } else if (next === "mcp_tool") {
      draft.handler = {
        type: "mcp_tool",
        mcp_server_name: "",
        tool_name: "",
        ...shared,
      };
    } else if (next === "prompt") {
      draft.handler = { type: "prompt", prompt: "", ...shared };
    } else {
      draft.handler = { type: "agent", prompt: "", ...shared };
    }
  }

  /** The command handler's `args` as one line of text. */
  let commandArgs = $state(
    untrack(() =>
      draft.handler.type === "command"
        ? (draft.handler.args ?? []).join(" ")
        : ""
    )
  );
  $effect(() => {
    if (draft.handler.type !== "command") {
      return;
    }
    const parts = commandArgs.trim().split(WHITESPACE).filter(Boolean);
    draft.handler.args = parts.length > 0 ? parts : undefined;
  });

  const scoped = $derived(draft.scope === "project" || draft.scope === "local");

  function setProject(projectId: string) {
    if (projectId === "") {
      draft.scope = undefined;
      draft.projectId = undefined;
      return;
    }
    draft.scope = "project";
    draft.projectId = projectId;
  }

  /** What this hook used to be, for a hook that has already been saved. */
  let versions = $state<HookVersion[]>([]);
  let versionsFailed = $state<string | undefined>(undefined);
  let versionsLoading = $state(false);
  let restoring = $state<number | null>(null);
  let allVersions = $state(false);
  const visibleVersions = $derived(
    allVersions ? versions : versions.slice(0, LATEST)
  );
  $effect(() => {
    const current = id;
    if (!current) {
      return;
    }
    versionsLoading = true;
    versionsFailed = undefined;
    loadHookVersions(current)
      .then((rows) => {
        versions = rows;
      })
      .catch((error: unknown) => {
        versionsFailed = message(error);
      })
      .finally(() => {
        versionsLoading = false;
      });
  });

  async function restore(version: HookVersion) {
    restoring = version.id;
    try {
      const restored = await restoreHookVersion(version.id);
      draft = draftOf(restored);
      touched = {};
      attempted = false;
      if (store.hooks.value) {
        upsert(store.hooks.value, restored, (row) => row.id === restored.id);
      }
      toast.success(`Restored — this is now what ${restored.name} runs.`);
    } catch (error) {
      toast.error(message(error));
    } finally {
      restoring = null;
    }
  }

  async function save() {
    attempted = true;
    if (!ready || busy) {
      return;
    }
    const total = whiffle.machines.length;
    const project = whiffle.projects.find(
      (candidate) => candidate.id === draft.projectId
    );
    const ok = await confirm({
      title: id
        ? `Save ${draft.name.trim()}?`
        : `Write ${draft.name.trim()} to the fleet?`,
      body: scoped
        ? `This writes a script and registers it to run with no prompt, on every machine that has ${project?.name ?? "this project"} checked out.`
        : `This writes a script and registers it to run with no prompt, on every machine in the fleet — ${total} machine${total === 1 ? "" : "s"} right now.`,
      confirmLabel: id ? "Save changes" : "Create hook",
    });
    if (!ok) {
      return;
    }
    busy = true;
    failed = undefined;
    try {
      const saved = await saveHook(id ?? newId(), {
        ...draft,
        name: draft.name.trim(),
      });
      if (store.hooks.value) {
        upsert(store.hooks.value, saved, (row) => row.id === saved.id);
      }
      store.mark(saved.id);
      toast.success(`${saved.name} is written to every machine it applies to.`);
      await goto("/config/hooks");
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
    const ok = await confirm({
      title: `Delete ${draft.name || "this hook"}?`,
      body: "This removes it from every machine that has it — not just switches it off. There's no undo.",
      confirmLabel: "Delete hook",
      destructive: true,
    });
    if (!ok) {
      return;
    }
    deleting = true;
    try {
      await removeHook(id, draft.name);
      if (store.hooks.value) {
        store.hooks.value = store.hooks.value.filter((row) => row.id !== id);
      }
      await goto("/config/hooks");
    } catch (error) {
      failed = message(error);
      deleting = false;
    }
  }
</script>

<EditorFrame
  deleteLabel={id ? 'Delete hook' : undefined}
  {deleting}
  oncancel={() => goto('/config/hooks')}
  ondelete={id ? askRemove : undefined}
  onsubmit={save}
  saveLabel={id ? 'Save changes' : 'Create hook'}
  saving={busy}
  title={id ? draft.name || 'Hook' : 'New hook'}
>
  {#snippet header()}
    <TitleInput
      invalid={Boolean(shown('name') || duplicate)}
      label="Hook name"
      onblur={() => {
        touched.name = true;
      }}
      placeholder="Name this hook"
      bind:value={draft.name}
    />
    {#if shown('name')}
      <p class="problem" in:appear>{wrong.name}</p>
    {:else if duplicate}
      <p class="problem" in:appear>{duplicate}</p>
    {/if}
    <ReadingWell>{hookSentence(draft)}</ReadingWell>
    <SwitchField
      hint={draft.enabled ? 'Registered on every machine it applies to' : 'Off — nothing is registered'}
      id="hook-enabled"
      label="Enabled"
      bind:checked={draft.enabled}
    />
    {#if failed}
      <p class="problem" role="alert" in:appear>{failed}</p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconClockDuo} label="When it runs">
    <p class="note">
      One lifecycle event. The events with a matcher are the ones Claude Code
      lets you narrow further.
    </p>
    <div>
      <PickerChip
        label="Event"
        onpick={(next) => {
          touched.event = true;
          setEvent(next as HookEvent);
        }}
        options={HOOK_EVENTS.map((info) => ({ value: info.event, label: info.event, group: info.group }))}
        value={draft.event}
      />
    </div>
    {#if shown('event')}
      <p class="problem" in:appear>{wrong.event}</p>
    {:else if eventInfo}
      <p class="note">Runs {eventInfo.blurb}.</p>
    {/if}
    {#if hookTakesMatcher(draft.event)}
      <Field
        id="hook-matcher"
        label="Matcher — {eventInfo?.filters}"
        problem={shown('matcher')}
      >
        {#snippet hint()}
          Empty or <span class="font-mono">*</span> matches every value. The
          tester below shows what this one actually does.
        {/snippet}
        <Input
          aria-invalid={shown('matcher') ? 'true' : undefined}
          autocomplete="off"
          class="font-mono"
          id="hook-matcher"
          onblur={() => {
            touched.matcher = true;
          }}
          placeholder={eventInfo?.suggests?.[0] ?? '*'}
          spellcheck="false"
          bind:value={draft.matcher}
        />
      </Field>
      <HookTester
        event={draft.event}
        bind:matcher={draft.matcher}
        bind:sample
      />
    {/if}
  </EditorSection>

  <EditorSection hue={HUE} icon={IconPlayDuo} label="What it runs">
    <p class="note">
      Whiffle writes this to every machine it applies to and registers it — no
      prompt, no approval, every time the event fires.
    </p>
    <Choice
      label="Handler"
      onchange={(next) => setHandlerType(next as HandlerType)}
      options={HANDLERS}
      value={draft.handler.type}
    />
    {#if draft.handler.type === 'command'}
      <Field
        hint="Written to every machine, at a path Whiffle picks — the hook always points at that copy, never at one you keep locally."
        id="hook-script"
        label="Script"
        problem={shown('script')}
      >
        <Textarea
          aria-invalid={shown('script') ? 'true' : undefined}
          class="resize-y font-mono"
          id="hook-script"
          onblur={() => {
            touched.script = true;
          }}
          placeholder={'#!/bin/bash\nset -euo pipefail\n\n# The event JSON arrives on stdin.'}
          rows={10}
          spellcheck="false"
          bind:value={draft.script}
        />
      </Field>
      <Field id="hook-args" label="Arguments (optional)">
        <Input
          autocomplete="off"
          class="font-mono"
          id="hook-args"
          placeholder="--flag value"
          spellcheck="false"
          bind:value={commandArgs}
        />
      </Field>
      <SwitchField
        checked={draft.handler.async === true}
        hint="Claude Code does not wait for it before continuing."
        id="hook-async"
        label="Run in the background"
        onchange={(next) => {
          if (draft.handler.type === 'command') {
            draft.handler.async = next;
          }
        }}
      />
      <Choice
        label="Shell"
        onchange={(next) => {
          if (draft.handler.type === 'command') {
            draft.handler.shell = next === 'bash' ? undefined : (next as 'powershell');
          }
        }}
        options={[
          { value: 'bash', label: 'bash' },
          { value: 'powershell', label: 'PowerShell' },
        ]}
        value={draft.handler.shell ?? 'bash'}
      />
    {:else if draft.handler.type === 'http'}
      <Field
        hint="Every machine posts the event's own JSON here — https, or localhost for something running on the same box."
        id="hook-url"
        label="URL"
        problem={shown('url')}
      >
        <Input
          aria-invalid={shown('url') ? 'true' : undefined}
          autocomplete="off"
          class="font-mono"
          id="hook-url"
          onblur={() => {
            touched.url = true;
          }}
          placeholder="https://example.com/hooks/whiffle"
          spellcheck="false"
          bind:value={draft.handler.url}
        />
      </Field>
    {:else if draft.handler.type === 'mcp_tool'}
      <div class="pair">
        <Field
          id="hook-server"
          label="MCP server"
          problem={shown('mcp_server_name')}
        >
          <Input
            aria-invalid={shown('mcp_server_name') ? 'true' : undefined}
            autocomplete="off"
            class="font-mono"
            id="hook-server"
            onblur={() => {
              touched.mcp_server_name = true;
            }}
            placeholder="filesystem"
            spellcheck="false"
            bind:value={draft.handler.mcp_server_name}
          />
        </Field>
        <Field id="hook-tool" label="Tool" problem={shown('tool_name')}>
          <Input
            aria-invalid={shown('tool_name') ? 'true' : undefined}
            autocomplete="off"
            class="font-mono"
            id="hook-tool"
            onblur={() => {
              touched.tool_name = true;
            }}
            placeholder="read_file"
            spellcheck="false"
            bind:value={draft.handler.tool_name}
          />
        </Field>
      </div>
    {:else}
      <Field id="hook-prompt" label="Prompt" problem={shown('prompt')}>
        <Textarea
          aria-invalid={shown('prompt') ? 'true' : undefined}
          class="resize-y"
          id="hook-prompt"
          onblur={() => {
            touched.prompt = true;
          }}
          placeholder="Decide whether this change needs a changelog entry, and say why."
          rows={4}
          bind:value={draft.handler.prompt}
        />
      </Field>
      {#if draft.handler.type === 'agent'}
        <Field id="hook-agent" label="Subagent (optional)">
          <Input
            autocomplete="off"
            class="font-mono"
            id="hook-agent"
            placeholder="Inherits Claude Code's default"
            spellcheck="false"
            bind:value={draft.handler.agent}
          />
        </Field>
      {/if}
    {/if}
  </EditorSection>

  <EditorSection hue={HUE} icon={IconTuningDuo} label="Common fields">
    <Field
      hint="A permission rule narrowing when this runs. Only read on tool events."
      id="hook-if"
      label="Condition (optional)"
      problem={shown('if')}
    >
      <Input
        aria-invalid={shown('if') ? 'true' : undefined}
        autocomplete="off"
        class="font-mono"
        id="hook-if"
        onblur={() => {
          touched.if = true;
        }}
        oninput={(event) => {
          draft.handler.if = event.currentTarget.value || undefined;
        }}
        placeholder="Bash(git *)"
        spellcheck="false"
        value={draft.handler.if ?? ''}
      />
    </Field>
    <div class="pair">
      <Field
        id="hook-timeout"
        label="Timeout, seconds (optional)"
        problem={shown('timeout')}
      >
        <Input
          aria-invalid={shown('timeout') ? 'true' : undefined}
          class="font-mono"
          id="hook-timeout"
          min="1"
          oninput={(event) => {
            const raw = event.currentTarget.value;
            draft.handler.timeout = raw === '' ? undefined : Number(raw);
          }}
          placeholder="Claude Code's default"
          step="1"
          type="number"
          value={draft.handler.timeout ?? ''}
        />
      </Field>
      <Field id="hook-status" label="Status message (optional)">
        <Input
          autocomplete="off"
          id="hook-status"
          oninput={(event) => {
            draft.handler.statusMessage = event.currentTarget.value || undefined;
          }}
          placeholder="Formatting…"
          spellcheck="false"
          value={draft.handler.statusMessage ?? ''}
        />
      </Field>
    </div>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconMapPointDuo} label="Where it applies">
    <p class="note">
      Every machine in the fleet unless you narrow it to one project.
    </p>
    <div>
      <PickerChip
        label="Scope"
        onpick={setProject}
        options={[
          { value: '', label: 'Every machine in the fleet' },
          ...whiffle.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
        value={draft.projectId ?? ''}
      />
    </div>
    {#if shown('scope')}
      <p class="problem" in:appear>{wrong.scope}</p>
    {/if}
  </EditorSection>

  {#if id}
    <EditorSection hue={HUE} icon={IconHistoryDuo} label="Previous versions">
      <p class="note">
        Every save keeps what it replaced. Restoring writes an old version back
        as this one.
      </p>
      {#if versionsLoading}
        <p class="note">Loading…</p>
      {:else if versionsFailed}
        <p class="caution" role="alert">{versionsFailed}</p>
      {:else if versions.length === 0}
        <p class="note">Nothing has been saved over yet.</p>
      {:else}
        <ul class="versions">
          {#each visibleVersions as version (version.id)}
            <li class="version">
              <span class="vtext">
                <span class="vname">{version.name}</span>
                <span class="note">
                  {new Date(version.createdAt).toLocaleString()}
                  · <span class="font-mono">{version.hash.slice(0, 7)}</span>
                </span>
              </span>
              <Button
                disabled={restoring !== null}
                onclick={() => restore(version)}
                size="sm"
                variant="outline"
              >
                {restoring === version.id ? 'Restoring…' : 'Restore'}
              </Button>
            </li>
          {/each}
        </ul>
        {#if versions.length > LATEST}
          <Button
            class="self-start"
            onclick={() => {
              allVersions = !allVersions;
            }}
            size="sm"
            variant="ghost"
          >
            {allVersions ? 'Show the latest 5' : `Show all ${versions.length}`}
          </Button>
        {/if}
      {/if}
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
  .pair {
    display: grid;
    gap: 8px 12px;
  }
  @media (min-width: 640px) {
    .pair {
      grid-template-columns: 1fr 1fr;
    }
  }
  .versions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .version {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .vtext {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .vname {
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
