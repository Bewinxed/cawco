<script lang="ts">
  import type { HookDraft, HookEvent, HookHandler } from "@cawco/core/hooks";
  import {
    HOOK_EVENTS,
    hookEventInfo,
    hookProblem,
    hookSentence,
    hookTakesMatcher,
  } from "@cawco/core/hooks";
  import { machineLabel } from "@cawco/core/machine-names";
  import { untrack } from "svelte";
  import {
    appear,
    crossIn,
    crossOut,
    dur,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconClock,
    IconHistory,
    IconLaptop,
    IconMapPoint,
    IconPlay,
    IconTuning,
  } from "#lib/icons.js";
  import { page } from "$app/state";
  import { cawco, type Machine } from "../../client.svelte";
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
    restoreHookVersion,
    saveHook,
  } from "../../hooks";
  import { failureWords as message } from "../../hub-read";
  import { newId } from "../../id";
  import { machineOs } from "../../machine";
  import { orderMachines } from "../../rail.svelte";
  import Choice from "../Choice.svelte";
  import { deleteHook } from "../deletes";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorHead from "../EditorHead.svelte";
  import EditorSection from "../EditorSection.svelte";
  import { EditorForm, takenName } from "../editor-form.svelte";
  import Field from "../Field.svelte";
  import MachineCopyRow from "../MachineCopyRow.svelte";
  import { MachineCopies } from "../machine-copies.svelte";
  import NoMachines from "../NoMachines.svelte";
  import PickerChip from "../PickerChip.svelte";
  import PreviousVersions, {
    type ListedVersion,
  } from "../PreviousVersions.svelte";
  import ReadingWell from "../ReadingWell.svelte";
  import RolloutChip from "../RolloutChip.svelte";
  import SwitchField from "../SwitchField.svelte";
  import { configStore, upsert } from "../store.svelte";

  const WHITESPACE = /\s+/u;

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

  const id = $derived(hook?.id ?? null);
  const wrong = $derived(hookProblem(draft));
  const shown = (field: string): string | undefined =>
    form.seen(field) ? wrong[field] : undefined;

  const duplicate = $derived(
    takenName(
      draft.name,
      taken,
      "Another hook already has that name. Two hooks called the same thing are two hooks you cannot tell apart in a machine’s registration."
    )
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

  const form = new EditorForm("/config/hooks", kept, store);

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
  let restoreFailed = $state<{ id: number; reason: string } | null>(null);
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

  async function restore(version: ListedVersion) {
    restoring = version.id;
    restoreFailed = null;
    try {
      const restored = await restoreHookVersion(version.id);
      draft = draftOf(restored);
      form.reset();
      if (store.hooks.value) {
        upsert(store.hooks.value, restored, (row) => row.id === restored.id);
      }
      // The fields now hold it, and the rollout chip says where it lands.
    } catch (error) {
      restoreFailed = { id: version.id, reason: message(error) };
    } finally {
      restoring = null;
    }
  }

  /**
   * Saving a hook keeps the editor open on it, the Save button saying so in
   * place; a new hook shows the same, then returns to the list, where it is
   * marked.
   */
  /**
   * The machines a save writes the script to and registers it on, run with
   * no prompt: every machine in the fleet, or a project's hook only those
   * with the project checked out. Said on Save and named beside it, before
   * the press: this is the reach of the decision, and the only consequence
   * it has.
   */
  const reach = $derived.by(() => {
    if (!scoped) {
      return cawco.machines;
    }
    const project = cawco.projects.find(
      (candidate) => candidate.id === draft.projectId
    );
    const on = new Set(project?.places.map((place) => place.machineId) ?? []);
    return cawco.machines.filter((machine) => on.has(machine.machineId));
  });
  const reachCount = $derived(
    `${reach.length} machine${reach.length === 1 ? "" : "s"}`
  );

  /**
   * Saving a hook keeps the editor open on it: Save says what it writes to,
   * spins while the hub takes it, and the row's rollout chip beside it says
   * machine by machine where it has landed. A new hook shows the same, then
   * returns to the list, where it is marked. A refusal stays in the editor.
   */
  async function save() {
    await form.save(ready, async () => {
      const saved = await saveHook(id ?? newId(), {
        ...draft,
        name: draft.name.trim(),
      });
      if (store.hooks.value) {
        upsert(store.hooks.value, saved, (row) => row.id === saved.id);
      }
      if (!id) {
        return saved.id;
      }
      draft = draftOf(saved);
      ({ commandArgs } = fieldsOf(draft));
      return null;
    });
  }

  async function remove() {
    if (!id) {
      return;
    }
    const hookId = id;
    await form.remove((gone) =>
      deleteHook(store, { id: hookId, name: hook?.name ?? draft.name }, gone)
    );
  }

  // ── per machine ──────────────────────────────────────────────────────
  // A machine only ever gives back the script CawCo wrote it, so one edited
  // on the machine itself waits here until it is adopted or overwritten.
  const machines = $derived(orderMachines(cawco.machines));
  const copies = new MachineCopies();

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
    const hookId = id;
    await copies.compare(
      machine,
      async () => (await peekHook(machine.machineId, hookId))?.content ?? null
    );
  }

  async function adopt(machine: Machine) {
    if (!id) {
      return;
    }
    const hookId = id;
    await copies.settle(
      machine,
      "adopt",
      () => adoptHook(machine.machineId, hookId),
      (landed) => {
        if (store.hooks.value) {
          upsert(store.hooks.value, landed, (row) => row.id === landed.id);
        }
        // The fields hold its copy now, and its row turns "In sync" on the
        // machine's next report.
        draft = draftOf(landed);
        loadVersions(hookId);
      }
    );
  }

  async function overwrite(machine: Machine) {
    if (!id) {
      return;
    }
    // Its row turns "In sync" on the machine's next report.
    const hookId = id;
    await copies.settle(
      machine,
      "push",
      () => pushHook(machine.machineId, hookId),
      () => loadVersions(hookId)
    );
  }

  const SAID: Record<string, string> = {
    applied: "In sync",
    failed: "Not applied",
    removed: "Taken off",
  };

  /** The script field's placeholder, a hook script's first lines as core hooks.ts's templates write them. */
  const SCRIPT_PLACEHOLDER =
    // biome-ignore lint/plugin/no-system-path: display text; env is at /usr/bin/env on every OS, as core hooks.ts's templates say.
    "#!/usr/bin/env bash\nset -euo pipefail\n\n# The event JSON arrives on stdin.";
</script>

<EditorFrame
  deleteLabel={id ? "Delete hook" : undefined}
  deleting={form.deleting}
  failed={form.failed !== undefined}
  oncancel={form.cancel}
  ondelete={id ? remove : undefined}
  onsubmit={save}
  saveLabel={id ? `Write to ${reachCount}` : `Create on ${reachCount}`}
  saving={form.busy}
  settling={versionsLoading}
  title={id ? draft.name || "Hook" : "New hook"}
>
  {#snippet result()}
    {#if id}
      <RolloutChip
        kind="hooks"
        machines={cawco.machines}
        name={id}
        what={draft.name || "This hook"}
      />
    {/if}
    <span
      data-slot="reach"
      class="max-w-c-measure-meta truncate"
      title={reach.map((m) => machineLabel(m.hostname)).join(", ")}
      >{reach.length > 0
        ? reach.map((m) => machineLabel(m.hostname)).join(", ")
        : "No machine has it checked out"}</span
    >
  {/snippet}
  {#snippet header()}
    <EditorHead
      {duplicate}
      bind:enabled={draft.enabled}
      {form}
      label="Hook name"
      bind:name={draft.name}
      off="Off — nothing is registered"
      on="Registered on every machine it applies to"
      placeholder="Name this hook"
      problem={shown("name")}
      switchId="hook-enabled"
    />
  {/snippet}

  <!-- The hook read back as one sentence, on the page's column. -->
  <ReadingWell text={hookSentence(draft)} />

  <EditorSection hue={HUE} icon={IconClock} label="When it runs">
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      One lifecycle event. The events with a matcher are the ones Claude Code
      lets you narrow further.
    </p>
    <Field id="hook-event" label="Event">
      <PickerChip
        field={{ id: "hook-event" }}
        label="Event"
        onpick={(next) => {
          form.touched.event = true;
          setEvent(next as HookEvent);
        }}
        options={HOOK_EVENTS.map((info) => ({
          value: info.event,
          label: info.event,
          group: info.group,
        }))}
        value={draft.event}
      />
    </Field>
    {#if shown("event")}
      <p class="type-meta text-status-fail-ink" in:appear>{wrong.event}</p>
    {:else if eventInfo}
      <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
        Runs {eventInfo.blurb}.
      </p>
    {/if}
    {#if hookTakesMatcher(draft.event)}
      <!-- The matcher comes and goes with the event: it folds (240 / 160). -->
      <div
        data-slot="fold"
        class="flex flex-col gap-space-2"
        in:unfold
        out:unfold
      >
        <Field
          id="hook-matcher"
          label="Matcher — {eventInfo?.filters}"
          problem={shown("matcher")}
        >
          {#snippet hint()}
            Empty or <span class="type-code">*</span> matches every value. The tester
            below shows what this one actually does.
          {/snippet}
          <Input
            aria-invalid={shown("matcher") ? "true" : undefined}
            autocomplete="off"
            id="hook-matcher"
            onblur={() => {
              form.touched.matcher = true;
            }}
            placeholder={eventInfo?.suggests?.[0] ?? "*"}
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
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
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
    <div
      class="relative flex flex-col"
      {@attach morph({ ms: dur("--dur-pop") })}
    >
      {#if draft.handler.type === "command"}
        <div
          data-slot="fold"
          class="flex flex-col gap-space-2"
          in:crossIn
          out:crossOut
        >
          <Field
            hint="Written to every machine, at a path CawCo picks — the hook always points at that copy, never at one you keep locally."
            id="hook-script"
            label="Script"
            problem={shown("script")}
          >
            <Textarea
              aria-invalid={shown("script") ? "true" : undefined}
              face="mono"
              id="hook-script"
              resize="block"
              onblur={() => {
                form.touched.script = true;
              }}
              placeholder={SCRIPT_PLACEHOLDER}
              rows={10}
              spellcheck="false"
              bind:value={draft.script}
            />
          </Field>
          <Field id="hook-args" label="Arguments (optional)">
            <Input
              autocomplete="off"
              face="mono"
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
              if (draft.handler.type === "command") {
                draft.handler.async = next;
              }
            }}
          />
          <Choice
            label="Shell"
            onchange={(next) => {
              if (draft.handler.type === "command") {
                draft.handler.shell =
                  next === "bash" ? undefined : (next as "powershell");
              }
            }}
            options={[
              { value: "bash", label: "bash" },
              { value: "powershell", label: "PowerShell" },
            ]}
            value={draft.handler.shell ?? "bash"}
          />
        </div>
      {:else if draft.handler.type === "http"}
        <div
          data-slot="fold"
          class="flex flex-col gap-space-2"
          in:crossIn
          out:crossOut
        >
          <Field
            hint="Every machine posts the event's own JSON here — https, or localhost for something running on the same box."
            id="hook-url"
            label="URL"
            problem={shown("url")}
          >
            <Input
              aria-invalid={shown("url") ? "true" : undefined}
              autocomplete="off"
              face="mono"
              id="hook-url"
              onblur={() => {
                form.touched.url = true;
              }}
              placeholder="https://example.com/hooks/cawco"
              spellcheck="false"
              bind:value={draft.handler.url}
            />
          </Field>
        </div>
      {:else if draft.handler.type === "mcp_tool"}
        <div
          data-slot="pair"
          class="grid gap-x-space-3 gap-y-space-2 phone:grid-cols-2"
          in:crossIn
          out:crossOut
        >
          <Field
            id="hook-server"
            label="MCP server"
            problem={shown("mcp_server_name")}
          >
            <Input
              aria-invalid={shown("mcp_server_name") ? "true" : undefined}
              autocomplete="off"
              face="mono"
              id="hook-server"
              onblur={() => {
                form.touched.mcp_server_name = true;
              }}
              placeholder="filesystem"
              spellcheck="false"
              bind:value={draft.handler.mcp_server_name}
            />
          </Field>
          <Field id="hook-tool" label="Tool" problem={shown("tool_name")}>
            <Input
              aria-invalid={shown("tool_name") ? "true" : undefined}
              autocomplete="off"
              face="mono"
              id="hook-tool"
              onblur={() => {
                form.touched.tool_name = true;
              }}
              placeholder="read_file"
              spellcheck="false"
              bind:value={draft.handler.tool_name}
            />
          </Field>
        </div>
      {:else}
        <div
          data-slot="fold"
          class="flex flex-col gap-space-2"
          in:crossIn
          out:crossOut
        >
          <Field id="hook-prompt" label="Prompt" problem={shown("prompt")}>
            <Textarea
              aria-invalid={shown("prompt") ? "true" : undefined}
              id="hook-prompt"
              resize="block"
              onblur={() => {
                form.touched.prompt = true;
              }}
              placeholder="Decide whether this change needs a changelog entry, and say why."
              rows={4}
              bind:value={draft.handler.prompt}
            />
          </Field>
          {#if draft.handler.type === "agent"}
            <div
              data-slot="fold"
              class="flex flex-col gap-space-2"
              in:unfold
              out:unfold
            >
              <Field id="hook-agent" label="Subagent (optional)">
                <Input
                  autocomplete="off"
                  face="mono"
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
      problem={shown("if")}
    >
      <Input
        aria-invalid={shown("if") ? "true" : undefined}
        autocomplete="off"
        face="mono"
        id="hook-if"
        onblur={() => {
          form.touched.if = true;
        }}
        oninput={(event) => {
          draft.handler.if = event.currentTarget.value || undefined;
        }}
        placeholder="Bash(git *)"
        spellcheck="false"
        value={draft.handler.if ?? ""}
      />
    </Field>
    <div
      data-slot="pair"
      class="grid gap-x-space-3 gap-y-space-2 phone:grid-cols-2"
    >
      <Field
        id="hook-timeout"
        label="Timeout, seconds (optional)"
        problem={shown("timeout")}
      >
        <Input
          aria-invalid={shown("timeout") ? "true" : undefined}
          id="hook-timeout"
          min="1"
          oninput={(event) => {
            const raw = event.currentTarget.value;
            draft.handler.timeout = raw === "" ? undefined : Number(raw);
          }}
          placeholder="Claude Code's default"
          step="1"
          type="number"
          value={draft.handler.timeout ?? ""}
        />
      </Field>
      <Field id="hook-status" label="Status message (optional)">
        <Input
          autocomplete="off"
          id="hook-status"
          oninput={(event) => {
            draft.handler.statusMessage =
              event.currentTarget.value || undefined;
          }}
          placeholder="Formatting…"
          spellcheck="false"
          value={draft.handler.statusMessage ?? ""}
        />
      </Field>
    </div>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconMapPoint} label="Where it applies">
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      Every machine in the fleet unless you narrow it to one project.
    </p>
    <Field id="hook-scope" label="Scope">
      <PickerChip
        field={{ id: "hook-scope" }}
        label="Scope"
        onpick={setProject}
        options={[
          { value: "", label: "Every machine in the fleet" },
          ...cawco.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
        value={draft.projectId ?? ""}
      />
    </Field>
    {#if shown("scope")}
      <p class="type-meta text-status-fail-ink" in:appear>{wrong.scope}</p>
    {/if}
  </EditorSection>

  {#if id}
    <EditorSection hue={HUE} icon={IconLaptop} label="Per machine">
      {#if machines.length === 0}
        <NoMachines
          line="This hook lands on the first machine that registers."
        />
      {:else}
        {#if applied.length > 0}
          <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
            In sync on
            {applied.length}
            machine{applied.length === 1 ? "" : "s"}.
            {#if asleep.length > 0}
              {asleep.map((row) => machineLabel(row.hostname)).join(", ")}
              offline — they sync when back.
            {/if}
          </p>
        {/if}
        <ul data-slot="machines" class="m-0 flex list-none flex-col p-0">
          {#each machines as machine, index (machine.machineId)}
            {@const item = stateOn(machine)}
            {@const online = machine.status === "online"}
            {@const refused = item?.state === "failed"}
            {@const drifted = refused && causeOf(item?.detail) === "drifted"}
            <MachineCopyRow
              acts={drifted}
              {copies}
              detail={refused ? item?.detail : undefined}
              diff={{
                filePath: `${id}.sh`,
                oldContent: hook?.script ?? "",
                hash: hook?.hash ?? "",
              }}
              {drifted}
              foldSlot="fold"
              {index}
              {machine}
              meta="{drifted
                ? 'Kept its own copy'
                : (SAID[item?.state ?? ''] ?? 'Not reported')} · {machineOs(
                machine.os
              ).label}{online ? '' : ' · offline, it syncs when back'}"
              noCopy="This machine has no copy of this script."
              onadopt={() => adopt(machine)}
              oncompare={() => compare(machine)}
              onsend={() => overwrite(machine)}
              reading="Reading this machine's script…"
              slot="machine"
            />
          {/each}
        </ul>
      {/if}
    </EditorSection>

    <EditorSection hue={HUE} icon={IconHistory} label="Previous versions">
      <!-- Read while the editor stands settling (EditorFrame), so the list
           is here when it shows. -->
      <PreviousVersions
        failed={versionsFailed}
        onrestore={restore}
        {restoreFailed}
        {restoring}
        {versions}
      />
    </EditorSection>
  {/if}
</EditorFrame>
