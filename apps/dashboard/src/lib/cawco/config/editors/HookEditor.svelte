<script lang="ts">
  import type { HookDraft, HookEvent, HookHandler } from "@cawco/core";
  import {
    HOOK_EVENTS,
    hookEventInfo,
    hookProblem,
    hookSentence,
    hookTakesMatcher,
    machineLabel,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    appear,
    crossIn,
    crossOut,
    dur,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconClock,
    IconHistory,
    IconLaptop,
    IconMapPoint,
    IconPlay,
    IconTuning,
  } from "#lib/icons.js";
  import { cawco, type Machine } from "../../client.svelte";
  import { confirm } from "../../confirm.svelte";
  import { adoptHook, peekHook, pushHook } from "../../fleet";
  import { causeOf } from "../../fleet-faults";
  import HookTester from "../../HookTester.svelte";
  import {
    blankHook,
    draftOf,
    type FleetHook,
    type HookVersion,
    hooksOf,
    loadHookVersions,
    message,
    removeHook,
    restoreHookVersion,
    saveHook,
  } from "../../hooks";
  import { newId } from "../../id";
  import { machineOs } from "../../machine";
  import { orderMachines } from "../../rail.svelte";
  import Choice from "../Choice.svelte";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import { savedShown } from "../EditorFooter.svelte";
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

  /**
   * What is kept of an edit: the draft, less the command's `args`, which
   * are only ever the arguments line split on spaces, and that line.
   */
  const fieldsOf = (from: HookDraft) => ({
    draft: { ...from, handler: { ...from.handler, args: undefined } },
    commandArgs:
      from.handler.type === "command"
        ? (from.handler.args ?? []).join(" ")
        : "",
  });
  /** What is saved: the draft differs from it by what is unsaved. */
  const baseline = $derived(fieldsOf(hook ? draftOf(hook) : blankHook()));
  /** A new hook was just created: its draft is over, and a second Save would make a second hook. */
  let created = false;
  const kept = keepDraft(
    page.url.pathname,
    () => {
      const now = {
        draft: { ...draft, handler: { ...draft.handler, args: undefined } },
        commandArgs,
      };
      return sameFields(now, baseline) ? null : { draft, commandArgs };
    },
    (stored: { draft: HookDraft; commandArgs: string }) => {
      ({ draft, commandArgs } = stored);
    }
  );

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
  /** From the first frame for a saved hook: the editor stands settling until they are in. */
  let versionsLoading = $state(untrack(() => hook !== null));
  let restoring = $state<number | null>(null);
  let restoreFailed = $state<number | null>(null);
  let allVersions = $state(false);
  const visibleVersions = $derived(
    allVersions ? versions : versions.slice(0, LATEST)
  );
  function loadVersions(current: string) {
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
  }
  $effect(() => {
    const current = id;
    if (current) {
      untrack(() => loadVersions(current));
    }
  });

  async function restore(version: HookVersion) {
    restoring = version.id;
    restoreFailed = null;
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
      restoreFailed = version.id;
      toast.error(message(error));
    } finally {
      restoring = null;
    }
  }

  /**
   * Saving a hook keeps the editor open on it, the Save button saying so in
   * place; a new hook shows the same, then returns to the list, where it is
   * marked.
   */
  async function save() {
    attempted = true;
    if (!ready || busy || created) {
      return;
    }
    let made: string | undefined;
    const total = cawco.machines.length;
    const project = cawco.projects.find(
      (candidate) => candidate.id === draft.projectId
    );
    await confirm({
      title: id
        ? `Save ${draft.name.trim()}?`
        : `Write ${draft.name.trim()} to the fleet?`,
      body: scoped
        ? `This writes a script and registers it to run with no prompt, on every machine that has ${project?.name ?? "this project"} checked out.`
        : `This writes a script and registers it to run with no prompt, on every machine in the fleet — ${total} machine${total === 1 ? "" : "s"} right now.`,
      confirmLabel: id ? "Save changes" : "Create hook",
      pendingLabel: "Saving…",
      run: async () => {
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
          if (id) {
            draft = draftOf(saved);
            ({ commandArgs } = fieldsOf(draft));
          } else {
            created = true;
            kept.drop();
            made = saved.id;
          }
          toast.success(
            `${saved.name} is written to every machine it applies to.`
          );
        } finally {
          busy = false;
        }
      },
    });
    if (made) {
      await savedShown();
      store.mark(made);
      await goto("/config/hooks");
    }
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/hooks");
  }

  async function askRemove() {
    if (!id) {
      return;
    }
    await confirm({
      title: `Delete ${draft.name || "this hook"}?`,
      body: "This removes it from every machine that has it — not just switches it off. There's no undo.",
      confirmLabel: "Delete hook",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        deleting = true;
        try {
          await removeHook(id, draft.name);
          kept.drop();
          // Back to the list first, so the row is seen leaving it.
          await goto("/config/hooks");
          if (store.hooks.value) {
            store.hooks.value = store.hooks.value.filter(
              (row) => row.id !== id
            );
          }
        } catch (error) {
          deleting = false;
          throw error;
        }
      },
    });
  }

  // ── per machine ──────────────────────────────────────────────────────
  // A machine only ever gives back the script CawCo wrote it, so one edited
  // on the machine itself waits here until it is adopted or overwritten.
  const machines = $derived(orderMachines(cawco.machines));
  let comparing = $state<string | null>(null);
  let copies = $state<Record<string, string | null>>({});
  let peeking = $state<Record<string, boolean>>({});
  let unread = $state<Record<string, string>>({});
  /** Per machine, the settle whose request is out. */
  let settling = $state<Record<string, "adopt" | "push">>({});
  /** Per machine, the last settle failed: its button shows no check. */
  let settleFailed = $state<Record<string, boolean>>({});

  /** Where a kept version came from: the fleet's own row, or a machine's edited copy. */
  function sourceLabel(source: string): string {
    if (!source.startsWith("machine:")) {
      return "the fleet";
    }
    const machineId = source.slice("machine:".length);
    const machine = machines.find((row) => row.machineId === machineId);
    return machine ? machineLabel(machine.hostname) : machineId;
  }

  const stateOn = (machine: Machine) =>
    id ? hooksOf(machine)?.[id] : undefined;
  const applied = $derived(
    machines.filter((row) => stateOn(row)?.state === "applied")
  );
  const asleep = $derived(applied.filter((row) => row.status !== "online"));

  async function compare(machine: Machine) {
    if (!id) {
      return;
    }
    if (comparing === machine.machineId) {
      comparing = null;
      return;
    }
    comparing = machine.machineId;
    if (
      Object.hasOwn(copies, machine.machineId) ||
      peeking[machine.machineId]
    ) {
      return;
    }
    peeking[machine.machineId] = true;
    delete unread[machine.machineId];
    try {
      copies[machine.machineId] =
        (await peekHook(machine.machineId, id))?.content ?? null;
    } catch (caught) {
      unread[machine.machineId] = message(caught);
    } finally {
      delete peeking[machine.machineId];
    }
  }

  async function adopt(machine: Machine) {
    if (!id) {
      return;
    }
    settling[machine.machineId] = "adopt";
    delete settleFailed[machine.machineId];
    try {
      const landed = await adoptHook(machine.machineId, id);
      if (store.hooks.value) {
        upsert(store.hooks.value, landed, (row) => row.id === landed.id);
      }
      draft = draftOf(landed);
      comparing = null;
      delete copies[machine.machineId];
      toast.success(
        `The fleet now keeps ${machineLabel(machine.hostname)}'s copy.`
      );
      loadVersions(id);
    } catch (caught) {
      settleFailed[machine.machineId] = true;
      toast.error(message(caught));
    } finally {
      delete settling[machine.machineId];
    }
  }

  async function overwrite(machine: Machine) {
    if (!id) {
      return;
    }
    settling[machine.machineId] = "push";
    delete settleFailed[machine.machineId];
    try {
      await pushHook(machine.machineId, id);
      comparing = null;
      delete copies[machine.machineId];
      toast.success(
        `${machineLabel(machine.hostname)} takes the fleet's copy.`
      );
      loadVersions(id);
    } catch (caught) {
      settleFailed[machine.machineId] = true;
      toast.error(message(caught));
    } finally {
      delete settling[machine.machineId];
    }
  }

  const SAID: Record<string, string> = {
    applied: "In sync",
    failed: "Not applied",
    removed: "Taken off",
  };
</script>

<EditorFrame
  deleteLabel={id ? 'Delete hook' : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={cancel}
  ondelete={id ? askRemove : undefined}
  onsubmit={save}
  saveLabel={id ? 'Save changes' : 'Create hook'}
  saving={busy}
  settling={versionsLoading}
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

  <EditorSection hue={HUE} icon={IconClock} label="When it runs">
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
      <!-- The matcher comes and goes with the event: it folds (240 / 160). -->
      <div class="fold" in:unfold out:unfold>
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
      </div>
    {/if}
  </EditorSection>

  <EditorSection hue={HUE} icon={IconPlay} label="What it runs">
    <p class="note">
      CawCo writes this to every machine it applies to and registers it — no
      prompt, no approval, every time the event fires.
    </p>
    <Choice
      label="Handler"
      onchange={(next) => setHandlerType(next as HandlerType)}
      options={HANDLERS}
      value={draft.handler.type}
    />
    <!-- One handler's fields cross-fade into the next's (--dur-control) in
         one box, whose height follows over --dur-pop on --ease-drawer. -->
    <div class="handler" {@attach morph({ ms: dur('--dur-pop') })}>
      {#if draft.handler.type === 'command'}
        <div class="fold" in:crossIn out:crossOut>
          <Field
            hint="Written to every machine, at a path CawCo picks — the hook always points at that copy, never at one you keep locally."
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
        </div>
      {:else if draft.handler.type === 'http'}
        <div class="fold" in:crossIn out:crossOut>
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
              placeholder="https://example.com/hooks/cawco"
              spellcheck="false"
              bind:value={draft.handler.url}
            />
          </Field>
        </div>
      {:else if draft.handler.type === 'mcp_tool'}
        <div class="pair" in:crossIn out:crossOut>
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
        <div class="fold" in:crossIn out:crossOut>
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
            <div class="fold" in:unfold out:unfold>
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
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconTuning} label="Common fields">
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

  <EditorSection hue={HUE} icon={IconMapPoint} label="Where it applies">
    <p class="note">
      Every machine in the fleet unless you narrow it to one project.
    </p>
    <div>
      <PickerChip
        label="Scope"
        onpick={setProject}
        options={[
          { value: '', label: 'Every machine in the fleet' },
          ...cawco.projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
        value={draft.projectId ?? ''}
      />
    </div>
    {#if shown('scope')}
      <p class="problem" in:appear>{wrong.scope}</p>
    {/if}
  </EditorSection>

  {#if id}
    <EditorSection hue={HUE} icon={IconLaptop} label="Per machine">
      {#if machines.length === 0}
        <p class="note">
          No machines yet — this lands on the first one that registers.
        </p>
      {:else}
        {#if applied.length > 0}
          <p class="note">
            In sync on
            {applied.length}
            machine{applied.length === 1 ? '' : 's'}.
            {#if asleep.length > 0}
              {asleep.map((row) => machineLabel(row.hostname)).join(', ')}
              offline — they sync when back.
            {/if}
          </p>
        {/if}
        <ul class="machines">
          {#each machines as machine, index (machine.machineId)}
            {@const item = stateOn(machine)}
            {@const online = machine.status === 'online'}
            {@const refused = item?.state === 'failed'}
            {@const drifted = refused && causeOf(item?.detail) === 'drifted'}
            {@const comparingThis = comparing === machine.machineId}
            {@const settle = settling[machine.machineId]}
            <li class="machine">
              <div class="line">
                <MachineRow
                  hue={machineHue(index, online)}
                  icon={machineIcon(machine.os)}
                  meta="{drifted ? 'Kept its own copy' : (SAID[item?.state ?? ''] ?? 'Not reported')} · {machineOs(machine.os).label}{online ? '' : ' · offline, it syncs when back'}"
                  name={machineLabel(machine.hostname)}
                  presence={online ? 'online' : 'off'}
                />
                {#if drifted}
                  <span class="acts" in:crossIn out:crossOut>
                    <Button
                      disabled={!online}
                      onclick={() => compare(machine)}
                      size="sm"
                      variant={comparingThis ? 'secondary' : 'outline'}
                    >
                      {comparingThis ? 'Hide' : 'Compare'}
                    </Button>
                    <Button
                      disabled={!online || settle === 'push'}
                      failed={settleFailed[machine.machineId] === true}
                      label="Adopt this copy"
                      onclick={() => adopt(machine)}
                      pending={settle === 'adopt'}
                      pendingLabel="Adopting…"
                      size="sm"
                      variant="outline"
                    />
                    <Button
                      disabled={!online || settle === 'adopt'}
                      failed={settleFailed[machine.machineId] === true}
                      label="Send ours"
                      onclick={() => overwrite(machine)}
                      pending={settle === 'push'}
                      pendingLabel="Sending…"
                      size="sm"
                      variant="outline"
                    />
                  </span>
                {/if}
              </div>
              {#if refused && item?.detail}
                <pre class="said" in:unfold out:unfold>{item.detail}</pre>
              {/if}
              {#if comparingThis}
                <!-- The machine's script folds open under its row; reading
                     cross-fades to what was read as the box follows. -->
                <div class="fold" in:unfold out:unfold>
                  <div class="handler" {@attach morph()}>
                    {#if peeking[machine.machineId]}
                      <p
                        class="note busy"
                        role="status"
                        in:crossIn
                        out:crossOut
                      >
                        <Spinner class="size-4 shrink-0" />Reading this
                        machine's script…
                      </p>
                    {:else if unread[machine.machineId]}
                      <p class="caution" role="alert" in:crossIn out:crossOut>
                        {unread[machine.machineId]}
                      </p>
                    {:else if copies[machine.machineId] === null}
                      <p class="note" in:crossIn out:crossOut>
                        This machine has no copy of this script.
                      </p>
                    {:else if copies[machine.machineId] !== undefined}
                      <div in:crossIn out:crossOut>
                        {#key `${machine.machineId}:${hook?.hash ?? ''}`}
                          <DiffView
                            filePath="{id}.sh"
                            newContent={copies[machine.machineId] ?? ''}
                            oldContent={hook?.script ?? ''}
                          />
                        {/key}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </EditorSection>

    <EditorSection hue={HUE} icon={IconHistory} label="Previous versions">
      <p class="note">
        Every save keeps what it replaced. Restoring writes an old version back
        as this one.
      </p>
      <!-- Read while the editor stands settling (EditorFrame), so the list
           is here when it shows. Rows that come and go (Show all, a
           restore's new version) go through reflow, what follows sliding. -->
      <div class="history" {@attach reflow()}>
        {#if versionsFailed}
          <p class="caution" role="alert">{versionsFailed}</p>
        {:else if versions.length === 0}
          <p class="note">Nothing has been saved over yet.</p>
        {:else}
          <ul class="versions">
            {#each visibleVersions as version (version.id)}
              <li class="version" data-flip>
                <span class="vtext">
                  <span class="vname">{version.name}</span>
                  <span class="note">
                    {new Date(version.createdAt).toLocaleString()}
                    · from {sourceLabel(version.source)}
                    · <span class="font-mono">{version.hash.slice(0, 7)}</span>
                  </span>
                </span>
                <Button
                  disabled={restoring !== null && restoring !== version.id}
                  failed={restoreFailed === version.id}
                  label="Restore"
                  onclick={() => restore(version)}
                  pending={restoring === version.id}
                  pendingLabel="Restoring…"
                  size="sm"
                  variant="outline"
                />
              </li>
            {/each}
          </ul>
          {#if versions.length > LATEST}
            <div class="more" data-flip>
              <Button
                onclick={() => {
                allVersions = !allVersions;
              }}
                size="sm"
                variant="ghost"
              >
                {allVersions ? 'Show the latest 5' : `Show all ${versions.length}`}
              </Button>
            </div>
          {/if}
        {/if}
      </div>
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
  .fold {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* The handler's fields: the set leaving is pinned in the box (crossOut)
     while the one arriving sets its height. */
  .handler {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .more {
    align-self: flex-start;
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
  .busy {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .machines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .machine {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .line {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .said {
    max-height: 6rem;
    overflow: auto;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
