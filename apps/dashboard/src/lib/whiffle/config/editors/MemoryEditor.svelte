<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import DiffView from "$lib/components/features/DiffView.svelte";
  import MarkdownEditor from "$lib/components/features/MarkdownEditor.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "$lib/components/ui/machine-row";
  import { Spinner } from "$lib/components/ui/spinner";
  import { IconDocument, IconHistory, IconLaptop } from "$lib/icons";
  import { formatDistanceToNow } from "$lib/utils/time";
  import { crossIn, crossOut } from "$lib/whiffle/motion/curves.svelte";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import { morph } from "$lib/whiffle/motion/morph.svelte";
  import { reflow } from "$lib/whiffle/motion/rows.svelte";
  import { type Machine, whiffle } from "../../client.svelte";
  import { confirm } from "../../confirm.svelte";
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
  import { machineLabel, machineOs } from "../../machine";
  import { orderMachines } from "../../rail.svelte";
  import { drafts, keepDraft } from "../drafts.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import {
    byteLength,
    fileHref,
    fileLabel,
    MAIN,
    memoryStateOf,
  } from "../memory";
  import PickerChip from "../PickerChip.svelte";
  import { configStore, upsert } from "../store.svelte";

  /**
   * One memory file: the editor, then what it used to say, then what each
   * machine has. A machine only ever gives back the copy Whiffle wrote it, so
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
  const machines = $derived(orderMachines(whiffle.machines));

  let text = $state(untrack(() => saved?.content ?? ""));
  const dirty = $derived(text !== (saved?.content ?? ""));
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
  const kept = keepDraft(
    untrack(() => fileHref(path)),
    () => (dirty ? { text, base } : null),
    (back) => {
      ({ text, base } = back);
    }
  );
  const bytes = $derived(byteLength(text));
  /** Roughly what this costs a session, at the usual ~4 bytes a token. */
  const tokens = $derived(Math.round(bytes / 4));

  let busy = $state(false);
  /** The save running is "Save mine anyway", over a conflict. */
  let forcing = $state(false);
  let saveFailed = $state(false);
  let deleting = $state(false);
  let deleteFailed = $state(false);
  let conflict = $state<FleetMemoryRow | null>(null);

  const message = (caught: unknown) =>
    caught instanceof Error ? caught.message : String(caught);

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
    const result = await saveMemoryDoc(path, text, expectedHash);
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
    try {
      const written = await write(expectedHash);
      saveFailed = !written;
      if (written) {
        conflict = null;
        text = saved?.content ?? text;
        toast.success(`${fileLabel(path)} is on its way to every machine.`);
      }
    } catch (caught) {
      saveFailed = true;
      toast.error(message(caught));
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
    await confirm({
      title: `Delete ${fileLabel(path)}?`,
      body: "It is taken off every machine that still has Whiffle's copy. A machine's own edited copy is left where it is.",
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
      label: `${fileLabel(doc.path)}${drafts.paths.has(fileHref(doc.path)) ? " · unsaved" : ""}`,
    })),
  ]);

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
  let restoreFailed = $state<number | null>(null);
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
    try {
      contents[row.id] = (await memoryVersion(row.id)).content;
    } catch (caught) {
      shown = null;
      toast.error(message(caught));
    } finally {
      delete reading[row.id];
    }
  }

  async function restore(row: FleetMemoryVersion) {
    restoring = row.id;
    restoreFailed = null;
    try {
      const landed = await restoreMemory(row.id);
      stored(landed);
      text = landed.content;
      shown = null;
      toast.success("Restored — every machine gets it.");
      await loadHistory();
    } catch (caught) {
      restoreFailed = row.id;
      toast.error(message(caught));
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
  /** Per machine, the last settle failed: its button shows no check. */
  let settleFailed = $state<Record<string, boolean>>({});

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
      stored(landed);
      text = landed.content;
      comparing = null;
      delete copies[machine.machineId];
      toast.success(
        `The fleet now keeps ${machineLabel(machine.hostname)}'s copy.`
      );
      await loadHistory();
    } catch (caught) {
      settleFailed[machine.machineId] = true;
      toast.error(message(caught));
    } finally {
      delete settling[machine.machineId];
    }
  }

  async function overwrite(machine: Machine) {
    settling[machine.machineId] = "push";
    delete settleFailed[machine.machineId];
    try {
      await pushMemory(machine.machineId, main ? undefined : path);
      comparing = null;
      delete copies[machine.machineId];
      toast.success(
        `${machineLabel(machine.hostname)} takes the fleet's copy.`
      );
    } catch (caught) {
      settleFailed[machine.machineId] = true;
      toast.error(message(caught));
    } finally {
      delete settling[machine.machineId];
    }
  }

  const SAID: Record<string, string> = {
    applied: "In sync",
    failed: "Kept its own copy",
    removed: "Taken off",
  };
</script>

<svelte:window onkeydown={keydown} />

<EditorFrame
  canSave={dirty}
  deleteLabel={saved ? 'Delete everywhere' : undefined}
  {deleting}
  failed={saveFailed || deleteFailed}
  oncancel={cancel}
  ondelete={saved ? askRemove : undefined}
  onsubmit={() => save()}
  saveLabel="Save"
  saving={busy && !forcing}
  settling={!drawn || (versions === null && historyError === null)}
  title={fileLabel(path)}
>
  {#snippet header()}
    <div class="switch">
      <PickerChip
        label="File"
        onpick={(next) => goto(fileHref(next))}
        options={files}
        value={path}
      />
    </div>
    <h1 class="title">{fileLabel(path)}</h1>
    <p class="facts num">
      <span>{formatBytes(bytes)}</span>
      <span
        class="tokens"
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
        <span class="unsaved" in:crossIn out:crossOut
          >Unsaved changes · ⌘S saves</span
        >
      {/if}
    </p>
  {/snippet}

  <EditorSection hue={HUE} icon={IconDocument} label="Contents">
    {#if conflict}
      <div class="conflict" in:unfold out:unfold>
        <p class="caution">
          Changed elsewhere while you edited. Nothing was overwritten.
        </p>
        {#key conflict.hash}
          <DiffView
            filePath={path}
            newContent={text}
            oldContent={conflict.content}
          />
        {/key}
        <div class="acts">
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
    <div class="well">
      <!-- Crepe reads its text once, when it is made: it waits for a draft
           kept for this file to be back. -->
      {#if kept.restored}
        <MarkdownEditor
          label={fileLabel(path)}
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
      <p class="caution" role="alert">{historyError}</p>
    {:else if versions === null}
      <p class="note">Loading…</p>
    {:else if versions.length === 0}
      <p class="note">
        Nothing replaced yet. Every version a save, an adopt or an overwrite
        replaces is kept here.
      </p>
    {:else}
      <!-- Rows that come and go (Show all, a new version) go through
           reflow, what follows sliding; a row's compare folds open inside
           it. -->
      <div class="history" {@attach reflow()}>
        <ul class="list">
          {#each visibleVersions as row (row.id)}
            <li class="entry" data-flip>
              <div class="line">
                <span class="label"
                  >{formatDistanceToNow(new Date(row.createdAt))}</span
                >
                <span class="note">from {sourceLabel(row.source)}</span>
                <span class="note font-mono" title={row.hash}
                  >{row.hash.slice(0, 8)}</span
                >
                <span class="note">{formatBytes(row.bytes)}</span>
                <Button
                  class="ml-auto"
                  onclick={() => openVersion(row)}
                  size="sm"
                  variant={shown === row.id ? 'secondary' : 'outline'}
                >
                  {shown === row.id ? 'Hide' : 'Compare'}
                </Button>
              </div>
              {#if shown === row.id}
                <!-- The compare folds open (240 / 160); inside, reading
                   cross-fades to the diff as the box follows its height. -->
                <div class="reveal" in:unfold out:unfold>
                  <div class="swap" {@attach morph()}>
                    {#if reading[row.id]}
                      <p
                        class="note busy"
                        role="status"
                        in:crossIn
                        out:crossOut
                      >
                        <Spinner class="size-4 shrink-0" />Reading that version…
                      </p>
                    {:else if contents[row.id] !== undefined}
                      <div class="reveal" in:crossIn out:crossOut>
                        {#key `${row.id}:${saved?.hash ?? ''}`}
                          <DiffView
                            filePath={path}
                            newContent={saved?.content ?? ''}
                            oldContent={contents[row.id]}
                          />
                        {/key}
                        <Button
                          class="self-start"
                          failed={restoreFailed === row.id}
                          label="Restore this version"
                          onclick={() => restore(row)}
                          pending={restoring === row.id}
                          pendingLabel="Restoring…"
                          size="sm"
                          variant="outline"
                        />
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
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
      </div>
    {/if}
  </EditorSection>

  <EditorSection hue={HUE} icon={IconLaptop} label="Per machine">
    {#if machines.length === 0}
      <p class="note">
        No machines yet — this lands on the first one that registers.
      </p>
    {:else}
      {#if applied.length > 0}
        <p class="note">
          In sync on {applied.length} machine{applied.length === 1 ? '' : 's'}.
          {#if asleep.length > 0}
            {asleep.map((row) => machineLabel(row.hostname)).join(', ')}
            offline — they sync when back.
          {/if}
        </p>
      {/if}
      <ul class="list">
        {#each machines as machine, index (machine.machineId)}
          {@const item = memoryStateOf(machine, path)}
          {@const online = machine.status === 'online'}
          {@const drifted = item?.state === 'failed'}
          {@const comparingThis = comparing === machine.machineId}
          <li class="entry">
            <div class="line">
              <MachineRow
                hue={machineHue(index, online)}
                icon={machineIcon(machine.os)}
                meta="{SAID[item?.state ?? ''] ?? 'Not reported'} · {machineOs(machine.os).label}{online ? '' : ' · offline, it syncs when back'}"
                name={machineLabel(machine.hostname)}
                presence={online ? 'online' : 'off'}
              />
              {#if drifted || !saved}
                {@const settle = settling[machine.machineId]}
                <span class="acts" in:crossIn out:crossOut>
                  {#if drifted}
                    <Button
                      disabled={!online}
                      onclick={() => compare(machine)}
                      size="sm"
                      variant={comparingThis ? 'secondary' : 'outline'}
                    >
                      {comparingThis ? 'Hide' : 'Compare'}
                    </Button>
                  {/if}
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
                  {#if drifted}
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
                  {/if}
                </span>
              {/if}
            </div>
            {#if drifted && item?.detail}
              <pre class="said" in:unfold out:unfold>{item.detail}</pre>
            {/if}
            {#if comparingThis}
              <!-- The machine's copy folds open under its row; reading
                   cross-fades to what was read as the box follows. -->
              <div class="reveal" in:unfold out:unfold>
                <div class="swap" {@attach morph()}>
                  {#if peeking[machine.machineId]}
                    <p class="note busy" role="status" in:crossIn out:crossOut>
                      <Spinner class="size-4 shrink-0" />Reading this machine's
                      copy…
                    </p>
                  {:else if unread[machine.machineId]}
                    <p class="caution" role="alert" in:crossIn out:crossOut>
                      {unread[machine.machineId]}
                    </p>
                  {:else if copies[machine.machineId] === null}
                    <p class="note" in:crossIn out:crossOut>
                      This machine has no copy of this file.
                    </p>
                  {:else if copies[machine.machineId] !== undefined}
                    <div in:crossIn out:crossOut>
                      {#key `${machine.machineId}:${saved?.hash ?? ''}`}
                        <DiffView
                          filePath={path}
                          newContent={copies[machine.machineId] ?? ''}
                          oldContent={saved?.content ?? ''}
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
</EditorFrame>

<style>
  .switch {
    display: flex;
  }
  .title {
    font: var(--type-title);
    font-family: var(--font-mono);
    letter-spacing: -0.01em;
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .facts {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .tokens {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  .unsaved {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .well {
    min-height: 320px;
    padding: 4px 8px;
    border-radius: var(--radius-md);
    background: var(--surface-recess);
  }
  .conflict {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .note,
  .label {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .label {
    color: var(--ink-strong);
  }
  .busy {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .caution {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entry {
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
  .history,
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .more {
    align-self: flex-start;
  }
  /* One box the reading line and what was read take turns in: the one
     leaving is pinned in it (crossOut) while the one arriving sets its
     height. */
  .swap {
    position: relative;
    display: flex;
    flex-direction: column;
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
