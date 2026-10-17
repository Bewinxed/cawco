<script lang="ts">
  import {
    isMemoryRole,
    type MemoryScope,
    machineLabel,
    scoped,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import MarkdownEditor from "#lib/components/features/MarkdownEditor.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconDocument, IconHistory, IconLaptop } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";
  import { cawco, type Machine } from "../../client.svelte";
  import {
    adoptMemory,
    adoptMemoryDoc,
    type FleetMemoryRow,
    type FleetMemoryVersion,
    formatBytes,
    memoryHistory,
    memoryVersion,
    peekMemory,
    pushMemory,
    removeMemory,
    removeMemoryDoc,
    restoreMemory,
    saveMemory,
    saveMemoryDoc,
  } from "../../fleet";
  import AddMachineLink from "../../join/AddMachineLink.svelte";
  import { machineOs } from "../../machine";
  import { orderMachines } from "../../rail.svelte";
  import { drafts, keepDraft } from "../drafts.svelte";
  import { EditorQuestion } from "../EditorFooter.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import {
    byteLength,
    docLabel,
    fileHref,
    fileLabel,
    loadedInto,
    MAIN,
    memoryStateOf,
  } from "../memory";
  import PickerChip from "../PickerChip.svelte";
  import RolloutChip from "../RolloutChip.svelte";
  import { configStore, upsert } from "../store.svelte";

  /**
   * One memory file: the editor, then what it used to say, then what each
   * machine has. A machine only ever gives back the copy CawCo wrote it, so
   * one edited on the machine itself waits here until it is adopted or
   * overwritten.
   */
  let { path }: { path: string } = $props();

  const store = configStore();
  const HUE = "var(--hue-blue-600)";
  const LATEST = 5;
  const main = untrack(() => path === MAIN);

  const fleet = $derived(store.fleet.value);
  const saved = $derived<FleetMemoryRow | null>(
    main
      ? (fleet?.memory ?? null)
      : (fleet?.memoryDocs.find((doc) => doc.path === path) ?? null)
  );
  const machines = $derived(orderMachines(cawco.machines));

  let text = $state(untrack(() => saved?.content ?? ""));
  /**
   * The sessions a document is loaded into, as the editor holds it: saved
   * with the text. The main file has none; every session loads it.
   */
  const savedScope = $derived<MemoryScope>(
    saved && "scope" in saved ? (saved.scope ?? {}) : {}
  );
  let scope = $state<MemoryScope>(untrack(() => ({ ...savedScope })));
  const scopeMoved = $derived(
    (scope.role ?? "") !== (savedScope.role ?? "") ||
      [...(scope.projectIds ?? [])].sort().join() !==
        [...(savedScope.projectIds ?? [])].sort().join()
  );
  const dirty = $derived(text !== (saved?.content ?? "") || scopeMoved);
  /** A role's document reaches its sessions as they start, from the hub: it is on no machine. */
  const onMachines = $derived(!savedScope.role);
  /**
   * The version the edit started from. A save names it, so if the fleet's
   * copy has moved on since (another tab, another day, a draft kept across
   * a reload) the save is refused and the conflict shows, rather than
   * writing over what it never saw. With nothing unsaved it is simply the
   * saved version.
   */
  let base = $state(untrack(() => saved?.hash));
  $effect.pre(() => {
    if (!dirty) {
      base = saved?.hash;
    }
  });
  const kept = keepDraft<{
    text: string;
    base: string | undefined;
    scope?: MemoryScope;
  }>(
    untrack(() => fileHref(path)),
    () => (dirty ? { text, base, scope } : null),
    (back) => {
      ({ text, base } = back);
      scope = back.scope ?? scope;
    }
  );
  const bytes = $derived(byteLength(text));
  /** Roughly what this costs a session, at the usual ~4 bytes a token. */
  const tokens = $derived(Math.round(bytes / 4));

  let busy = $state(false);
  /** The save running is "Save mine anyway", over a conflict. */
  let forcing = $state(false);
  let saveFailed = $state(false);
  /** Why the last save was refused (not a conflict): said under the title. */
  let saveProblem = $state<string | null>(null);
  let deleting = $state(false);
  let deleteFailed = $state(false);
  let conflict = $state<FleetMemoryRow | null>(null);

  /** Puts a row the hub answered with where the section reads it. */
  function stored(row: FleetMemoryRow) {
    if (!fleet) {
      return;
    }
    if (main) {
      fleet.memory = row;
    } else {
      upsert(fleet.memoryDocs, { ...row, path }, (doc) => doc.path === path);
    }
  }

  async function write(expectedHash: string | undefined): Promise<boolean> {
    if (main) {
      const result = await saveMemory(text, expectedHash);
      if (result.ok) {
        stored(result.memory);
        return true;
      }
      conflict = result.latest;
      return false;
    }
    const result = await saveMemoryDoc(path, text, expectedHash, {
      ...(scope.role ? { role: scope.role } : {}),
      ...(scope.projectIds?.length ? { projectIds: scope.projectIds } : {}),
    });
    if (result.ok) {
      stored(result.doc);
      return true;
    }
    conflict = result.latest;
    return false;
  }

  /** Saving keeps the editor open on the file, the Save button saying so in place. */
  async function save(expectedHash = base) {
    if (busy || !dirty) {
      return;
    }
    busy = true;
    forcing = conflict !== null && expectedHash === conflict.hash;
    saveFailed = false;
    saveProblem = null;
    try {
      const written = await write(expectedHash);
      saveFailed = !written;
      if (written) {
        // Where it lands is the rollout chip's to say, beside Save.
        conflict = null;
        text = saved?.content ?? text;
      }
    } catch (caught) {
      saveFailed = true;
      saveProblem = message(caught);
    } finally {
      busy = false;
      forcing = false;
    }
  }

  function takeLatest() {
    if (!conflict) {
      return;
    }
    stored(conflict);
    text = conflict.content;
    conflict = null;
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/memory");
  }

  async function askRemove() {
    if (!fleet) {
      return;
    }
    await question.ask({
      title: `Delete ${label}?`,
      body: "It is taken off every machine that still has CawCo's copy. A machine's own edited copy is left where it is.",
      confirmLabel: "Delete everywhere",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        deleting = true;
        deleteFailed = false;
        try {
          if (main) {
            await removeMemory();
          } else {
            await removeMemoryDoc(path);
          }
          kept.drop();
          // Back to the list first, so the file is seen leaving it.
          await goto("/config/memory");
          if (main) {
            fleet.memory = null;
          } else {
            fleet.memoryDocs = fleet.memoryDocs.filter(
              (doc) => doc.path !== path
            );
          }
        } catch (caught) {
          deleteFailed = true;
          deleting = false;
          throw caught;
        }
      },
    });
  }

  function keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: save owns its errors
      void save();
    }
  }

  const files = $derived([
    { value: MAIN, label: fileLabel(MAIN) },
    ...(fleet?.memoryDocs ?? []).map((doc) => ({
      value: doc.path,
      label: `${docLabel(doc.path, doc.scope)}${drafts.paths.has(fileHref(doc.path)) ? " · unsaved" : ""}`,
    })),
  ]);
  const label = $derived(main ? fileLabel(path) : docLabel(path, savedScope));

  /** The scope's two narrowings, each "None" when it names nothing. */
  const ROLE_OPTIONS = [
    { value: "", label: "None" },
    { value: "orchestrator", label: "Orchestrator" },
    { value: "leaf", label: "Leaf" },
  ];
  const projectOptions = $derived([
    { value: "", label: "None" },
    ...cawco.projects
      .map((project) => ({ value: project.id, label: project.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ]);
  const pickRole = (next: string) => {
    scope = {
      ...(isMemoryRole(next) ? { role: next } : {}),
      ...(scope.projectIds ? { projectIds: scope.projectIds } : {}),
    };
  };
  /** A project picked toggles in or out; "None" clears them all. */
  const pickProject = (next: string) => {
    const had = scope.projectIds ?? [];
    let projectIds: string[] = [];
    if (next) {
      projectIds = had.includes(next)
        ? had.filter((id) => id !== next)
        : [...had, next];
    }
    scope = {
      ...(scope.role ? { role: scope.role } : {}),
      ...(projectIds.length > 0 ? { projectIds } : {}),
    };
  };

  // ── history ──────────────────────────────────────────────────────────
  let versions = $state<FleetMemoryVersion[] | null>(null);
  let historyError = $state<string | null>(null);
  /** The contents editor has drawn the document. */
  let drawn = $state(false);
  let allVersions = $state(false);
  let shown = $state<number | null>(null);
  let contents = $state<Record<number, string>>({});
  let reading = $state<Record<number, boolean>>({});
  let restoring = $state<number | null>(null);
  let restoreFailed = $state<{ id: number; reason: string } | null>(null);
  /** Why a version could not be read, by version: said under its row. */
  let versionProblem = $state<Record<number, string>>({});
  const visibleVersions = $derived(
    allVersions ? (versions ?? []) : (versions ?? []).slice(0, LATEST)
  );

  async function loadHistory() {
    historyError = null;
    try {
      versions = await memoryHistory(main ? undefined : path);
    } catch (caught) {
      historyError = message(caught);
    }
  }
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: the list fills in when it lands
    void untrack(loadHistory);
  });

  function sourceLabel(source: string): string {
    if (!source.startsWith("machine:")) {
      return "the fleet";
    }
    const machineId = source.slice("machine:".length);
    const machine = machines.find((row) => row.machineId === machineId);
    return machine ? machineLabel(machine.hostname) : machineId;
  }

  async function openVersion(row: FleetMemoryVersion) {
    if (shown === row.id) {
      shown = null;
      return;
    }
    shown = row.id;
    if (contents[row.id] !== undefined || reading[row.id]) {
      return;
    }
    reading[row.id] = true;
    delete versionProblem[row.id];
    try {
      contents[row.id] = (await memoryVersion(row.id)).content;
    } catch (caught) {
      shown = null;
      versionProblem[row.id] = message(caught);
    } finally {
      delete reading[row.id];
    }
  }

  async function restore(row: FleetMemoryVersion) {
    restoring = row.id;
    restoreFailed = null;
    try {
      // The contents are it now, and the rollout chip says where it lands.
      const landed = await restoreMemory(row.id);
      stored(landed);
      text = landed.content;
      shown = null;
      await loadHistory();
    } catch (caught) {
      restoreFailed = { id: row.id, reason: message(caught) };
    } finally {
      restoring = null;
    }
  }

  // ── per machine ──────────────────────────────────────────────────────
  let comparing = $state<string | null>(null);
  let copies = $state<Record<string, string | null>>({});
  let peeking = $state<Record<string, boolean>>({});
  let unread = $state<Record<string, string>>({});
  /** Per machine, the settle whose request is out. */
  let settling = $state<Record<string, "adopt" | "push">>({});
  /** Per machine, why its last settle was refused: said under its row. */
  let settleFailed = $state<Record<string, string>>({});

  const applied = $derived(
    machines.filter((row) => memoryStateOf(row, path)?.state === "applied")
  );
  const asleep = $derived(applied.filter((row) => row.status !== "online"));

  async function compare(machine: Machine) {
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
      const set = await peekMemory(machine.machineId);
      copies[machine.machineId] = main
        ? (set?.content ?? null)
        : (set?.docs?.find((doc) => doc.path === path)?.content ?? null);
    } catch (caught) {
      unread[machine.machineId] = message(caught);
    } finally {
      delete peeking[machine.machineId];
    }
  }

  async function adopt(machine: Machine) {
    settling[machine.machineId] = "adopt";
    delete settleFailed[machine.machineId];
    try {
      const landed = main
        ? await adoptMemory(machine.machineId)
        : await adoptMemoryDoc(machine.machineId, path);
      // Its row turns "In sync" on the machine's next report.
      stored(landed);
      text = landed.content;
      comparing = null;
      delete copies[machine.machineId];
      await loadHistory();
    } catch (caught) {
      settleFailed[machine.machineId] = message(caught);
    } finally {
      delete settling[machine.machineId];
    }
  }

  async function overwrite(machine: Machine) {
    settling[machine.machineId] = "push";
    delete settleFailed[machine.machineId];
    try {
      // Its row turns "In sync" on the machine's next report.
      await pushMemory(machine.machineId, main ? undefined : path);
      comparing = null;
      delete copies[machine.machineId];
    } catch (caught) {
      settleFailed[machine.machineId] = message(caught);
    } finally {
      delete settling[machine.machineId];
    }
  }

  const SAID: Record<string, string> = {
    applied: "In sync",
    failed: "Kept its own copy",
    removed: "Taken off",
  };

  /** Delete asks in this editor's own footer. */
  const question = new EditorQuestion();
</script>

<svelte:window onkeydown={keydown} />

<EditorFrame
  canSave={dirty}
  deleteLabel={saved ? "Delete everywhere" : undefined}
  {deleting}
  failed={saveFailed || deleteFailed}
  oncancel={cancel}
  ondelete={saved ? askRemove : undefined}
  onsubmit={() => save()}
  {question}
  saveLabel="Save"
  saving={busy && !forcing}
  settling={!drawn || (versions === null && historyError === null)}
  title={label}
>
  {#snippet result()}
    {#if saved && onMachines}
      <RolloutChip
        kind={main ? "memory" : "memoryDocs"}
        {machines}
        name={path}
        what={label}
      />
    {/if}
  {/snippet}
  {#snippet header()}
    <div class="flex">
      <PickerChip
        label="File"
        onpick={(next) => goto(fileHref(next))}
        options={files}
        value={path}
      />
      {#if !main}
        <PickerChip
          label="Role"
          onpick={pickRole}
          options={ROLE_OPTIONS}
          value={scope.role ?? ""}
        />
        <PickerChip
          label="Projects"
          onpick={pickProject}
          options={projectOptions}
          picked={scope.projectIds ?? []}
        />
      {/if}
    </div>
    <h1
      data-slot="title"
      class="text-size-title leading-ui font-medium font-mono tracking-title wrap-anywhere text-ink-strong"
    >{label}</h1>
    {#if !main}
      <!-- literal: 12px -->
      <p
        class="relative flex flex-wrap gap-x-(--facts-gap) gap-y-space-1 type-meta text-ink-muted"
        style:--facts-gap="12px"
      >
        <span>Loaded into: {loadedInto(scope, cawco.projects)}</span>
      </p>
    {/if}
    <!-- literal: 12px -->
    <p
      data-slot="num"
      class="num relative flex flex-wrap gap-x-(--facts-gap) gap-y-space-1 type-meta text-ink-muted"
      style:--facts-gap="12px"
    >
      <span>{formatBytes(bytes)}</span>
      <!-- literal: 3px -->
      <span
        class="underline decoration-dotted underline-offset-(--tokens-offset)"
        style:--tokens-offset="3px"
        title="Roughly what this file costs every session that loads it, at about four bytes a token"
        >~{tokens.toLocaleString()}
        tokens</span
      >
      {#if saved}
        <span>saved {formatDistanceToNow(new Date(saved.updatedAt))}</span>
        <span class="font-mono" title={saved.hash}
          >{saved.hash.slice(0, 8)}</span
        >
      {:else}
        <span>Not written yet</span>
      {/if}
      {#if dirty}
        <span class="font-medium text-ink-strong" in:crossIn out:crossOut
          >Unsaved changes · ⌘S saves</span
        >
      {/if}
    </p>
    <RowFault again={() => save()} reason={saveProblem} />
  {/snippet}

  <EditorSection hue={HUE} icon={IconDocument} label="Contents">
    {#if conflict}
      <!-- literal: 8px -->
      <div
        class="flex flex-col gap-(--stack-gap)"
        style:--stack-gap="8px"
        in:unfold
        out:unfold
      >
        <p class="type-meta text-status-attn-ink">
          Changed elsewhere while you edited. Nothing was overwritten.
        </p>
        {#key conflict.hash}
          <DiffView
            filePath={path}
            newContent={text}
            oldContent={conflict.content}
          />
        {/key}
        <!-- literal: 8px -->
        <div
          data-slot="acts"
          class="flex flex-wrap gap-(--acts-gap)"
          style:--acts-gap="8px"
        >
          <Button
            disabled={busy}
            onclick={takeLatest}
            size="sm"
            variant="outline"
          >
            Take latest
          </Button>
          <Button
            disabled={busy && !forcing}
            failed={saveFailed}
            label="Save mine anyway"
            onclick={() => save(conflict?.hash)}
            pending={busy && forcing}
            pendingLabel="Saving…"
            size="sm"
            variant="outline"
          />
        </div>
      </div>
    {/if}
    <!-- literal: 320px, 8px -->
    <div
      data-slot="well"
      class="min-h-(--well-min) rounded-md bg-surface-recess px-(--well-px) py-space-1"
      style:--well-min="320px"
      style:--well-px="8px"
    >
      <!-- Crepe reads its text once, when it is made: it waits for a draft
           kept for this file to be back. -->
      {#if kept.restored}
        <MarkdownEditor
          {label}
          onready={() => {
            drawn = true;
          }}
          bind:value={text}
        />
      {/if}
    </div>
  </EditorSection>

  <EditorSection hue={HUE} icon={IconHistory} label="History">
    {#if historyError}
      <p class="type-meta text-status-attn-ink" role="alert">{historyError}</p>
    {:else if versions === null}
      <!-- literal: 72ch -->
      <p data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch">Loading…</p>
    {:else if versions.length === 0}
      <!-- literal: 72ch -->
      <p data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch">
        Nothing replaced yet. Every version a save, an adopt or an overwrite
        replaces is kept here.
      </p>
    {:else}
      <!-- Rows that come and go (Show all, a new version) go through
           reflow, what follows sliding; a row's compare folds open inside
           it. -->
      <!-- literal: 8px -->
      <div
        class="flex flex-col gap-(--stack-gap)"
        style:--stack-gap="8px"
        {@attach reflow()}
      >
        <ul data-slot="list" class="m-0 flex list-none flex-col gap-space-row p-0">
          {#each visibleVersions as row (row.id)}
            <!-- literal: 8px, 10px -->
            <li
              data-slot="entry"
              class="flex flex-col gap-(--entry-gap) rounded-sm bg-surface-recess px-(--entry-px) py-(--entry-gap)"
              style:--entry-gap="8px"
              style:--entry-px="10px"
              data-flip
            >
              <!-- literal: 8px, 12px -->
              <div
                class="relative flex flex-wrap items-center gap-x-(--line-gap-x) gap-y-(--line-gap-y)"
                style:--line-gap-x="12px"
                style:--line-gap-y="8px"
              >
                <!-- literal: 72ch -->
                <span
                  data-slot="memory-editor-label"
                  class="type-meta max-w-(--measure) text-ink-strong"
                  style:--measure="72ch"
                  >{formatDistanceToNow(new Date(row.createdAt))}</span
                >
                <!-- literal: 72ch -->
                <span data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch"
                  >from {sourceLabel(row.source)}</span
                >
                <!-- literal: 72ch -->
                <span data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch" title={row.hash}
                  >{row.hash.slice(0, 8)}</span
                >
                <!-- literal: 72ch -->
                <span data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch"
                  >{formatBytes(row.bytes)}</span
                >
                <Button
                  class="ml-auto"
                  onclick={() => openVersion(row)}
                  size="sm"
                  variant={shown === row.id ? "secondary" : "outline"}
                >
                  {shown === row.id ? "Hide" : "Compare"}
                </Button>
              </div>
              {#if shown === row.id}
                <!-- The compare folds open (240 / 160); inside, reading
                   cross-fades to the diff as the box follows its height. -->
                <!-- literal: 8px -->
                <div class="flex flex-col gap-(--stack-gap)" style:--stack-gap="8px" in:unfold out:unfold>
                  <div data-slot="swap" class="relative flex flex-col" {@attach morph()}>
                    {#if reading[row.id]}
                      <!-- literal: 72ch, 8px -->
                      <p
                        data-slot="note"
                        class="mark-line flex items-center gap-(--note-gap) type-meta max-w-(--measure) text-ink-muted"
                        style:--measure="72ch"
                        style:--note-gap="8px"
                        role="status"
                        in:crossIn
                        out:crossOut
                      >
                        <Spinner class="size-icon-md shrink-0" /><span
                          >Reading that version…</span
                        >
                      </p>
                    {:else if contents[row.id] !== undefined}
                      <!-- literal: 8px -->
                      <div class="flex flex-col gap-(--stack-gap)" style:--stack-gap="8px" in:crossIn out:crossOut>
                        {#key `${row.id}:${saved?.hash ?? ""}`}
                          <DiffView
                            filePath={path}
                            newContent={saved?.content ?? ""}
                            oldContent={contents[row.id]}
                          />
                        {/key}
                        <Button
                          class="self-start"
                          failed={restoreFailed?.id === row.id}
                          label="Restore this version"
                          onclick={() => restore(row)}
                          pending={restoring === row.id}
                          pendingLabel="Restoring…"
                          size="sm"
                          variant="outline"
                        />
                        <RowFault
                          reason={restoreFailed?.id === row.id
                            ? restoreFailed.reason
                            : null}
                        />
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
              <RowFault
                again={() => openVersion(row)}
                reason={versionProblem[row.id]}
              />
            </li>
          {/each}
        </ul>
        {#if versions.length > LATEST}
          <div data-slot="more" class="self-start" data-flip>
            <Button
              onclick={() => {
                allVersions = !allVersions;
              }}
              size="sm"
              variant="ghost"
            >
              {allVersions
                ? "Show the latest 5"
                : `Show all ${versions.length}`}
            </Button>
          </div>
        {/if}
      </div>
    {/if}
  </EditorSection>

  <!-- A machine holds a copy of the main file and of a linked document
       alone: a scoped one is loaded into sessions, never adopted from one. -->
  {#if !scoped(savedScope)}
    <EditorSection hue={HUE} icon={IconLaptop} label="Per machine">
      {#if machines.length === 0}
        <!-- literal: 72ch -->
        <p data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch">
          <AddMachineLink>No machines yet</AddMachineLink>
          — this lands on the first one that registers.
        </p>
      {:else}
        {#if applied.length > 0}
          <!-- literal: 72ch -->
          <p data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch">
            In sync on {applied.length} machine{applied.length === 1
              ? ""
              : "s"}.
            {#if asleep.length > 0}
              {asleep.map((row) => machineLabel(row.hostname)).join(", ")}
              offline — they sync when back.
            {/if}
          </p>
        {/if}
        <ul data-slot="list" class="m-0 flex list-none flex-col gap-space-row p-0">
          {#each machines as machine, index (machine.machineId)}
            {@const item = memoryStateOf(machine, path)}
            {@const online = machine.status === "online"}
            {@const drifted = item?.state === "failed"}
            {@const comparingThis = comparing === machine.machineId}
            <!-- literal: 8px, 10px -->
            <li
              data-slot="entry"
              class="flex flex-col gap-(--entry-gap) rounded-sm bg-surface-recess px-(--entry-px) py-(--entry-gap)"
              style:--entry-gap="8px"
              style:--entry-px="10px"
            >
              <!-- literal: 8px, 12px -->
              <div
                class="relative flex flex-wrap items-center gap-x-(--line-gap-x) gap-y-(--line-gap-y)"
                style:--line-gap-x="12px"
                style:--line-gap-y="8px"
              >
                <MachineRow
                  hue={machineHue(index, online)}
                  icon={machineIcon(machine.os)}
                  meta="{SAID[item?.state ?? ''] ??
                    'Not reported'} · {machineOs(machine.os).label}{online
                    ? ''
                    : ' · offline, it syncs when back'}"
                  name={machineLabel(machine.hostname)}
                  presence={online ? "online" : "off"}
                />
                {#if drifted || !saved}
                  {@const settle = settling[machine.machineId]}
                  <!-- literal: 8px -->
                  <span
                    data-slot="acts"
                    class="flex flex-wrap gap-(--acts-gap)"
                    style:--acts-gap="8px"
                    in:crossIn
                    out:crossOut
                  >
                    {#if drifted}
                      <Button
                        disabled={!online}
                        onclick={() => compare(machine)}
                        size="sm"
                        variant={comparingThis ? "secondary" : "outline"}
                      >
                        {comparingThis ? "Hide" : "Compare"}
                      </Button>
                    {/if}
                    <Button
                      disabled={!online || settle === "push"}
                      failed={machine.machineId in settleFailed}
                      label="Adopt this copy"
                      onclick={() => adopt(machine)}
                      pending={settle === "adopt"}
                      pendingLabel="Adopting…"
                      size="sm"
                      variant="outline"
                    />
                    {#if drifted}
                      <Button
                        disabled={!online || settle === "adopt"}
                        failed={machine.machineId in settleFailed}
                        label="Send ours"
                        onclick={() => overwrite(machine)}
                        pending={settle === "push"}
                        pendingLabel="Sending…"
                        size="sm"
                        variant="outline"
                      />
                    {/if}
                  </span>
                {/if}
              </div>
              <RowFault reason={settleFailed[machine.machineId]} />
              {#if drifted && item?.detail}
                <!-- literal: 6rem, 6px, 8px -->
                <pre
                  class="max-h-(--said-max) overflow-auto rounded-sm bg-surface-raised px-(--said-px) py-(--said-py) font-mono text-size-meta wrap-anywhere whitespace-pre-wrap"
                  style:--said-max="6rem"
                  style:--said-px="8px"
                  style:--said-py="6px"
                  in:unfold
                  out:unfold
                >{item.detail}</pre>
              {/if}
              {#if comparingThis}
                <!-- The machine's copy folds open under its row; reading
                   cross-fades to what was read as the box follows. -->
                <!-- literal: 8px -->
                <div class="flex flex-col gap-(--stack-gap)" style:--stack-gap="8px" in:unfold out:unfold>
                  <div data-slot="swap" class="relative flex flex-col" {@attach morph()}>
                    {#if peeking[machine.machineId]}
                      <!-- literal: 72ch, 8px -->
                      <p
                        data-slot="note"
                        class="mark-line flex items-center gap-(--note-gap) type-meta max-w-(--measure) text-ink-muted"
                        style:--measure="72ch"
                        style:--note-gap="8px"
                        role="status"
                        in:crossIn
                        out:crossOut
                      >
                        <Spinner class="size-icon-md shrink-0" /><span
                          >Reading this machine's copy…</span
                        >
                      </p>
                    {:else if unread[machine.machineId]}
                      <p class="type-meta text-status-attn-ink" role="alert" in:crossIn out:crossOut>
                        {unread[machine.machineId]}
                      </p>
                    {:else if copies[machine.machineId] === null}
                      <!-- literal: 72ch -->
                      <p data-slot="note" class="type-meta max-w-(--measure) text-ink-muted" style:--measure="72ch" in:crossIn out:crossOut>
                        This machine has no copy of this file.
                      </p>
                    {:else if copies[machine.machineId] !== undefined}
                      <div in:crossIn out:crossOut>
                        {#key `${machine.machineId}:${saved?.hash ?? ""}`}
                          <DiffView
                            filePath={path}
                            newContent={copies[machine.machineId] ?? ""}
                            oldContent={saved?.content ?? ""}
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
  {/if}
</EditorFrame>
