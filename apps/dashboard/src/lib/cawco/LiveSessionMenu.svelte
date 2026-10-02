<script lang="ts">
  /**
   * Right-click (long-press on touch, the menu key on a focused row) on a
   * session, wherever one is listed: the rail, a project's page, the Fleet
   * board. Keep and Discard are what a side quest is waiting on, so they only
   * appear on one (NEW.md §1). Fork and Stop decide as the peek header's menu
   * does: Fork needs a conversation and its machine, Stop a live process.
   *
   * The row is the trigger itself: `children` is handed the trigger's props
   * and spreads them on its own root element, so a table row stays a `<tr>`.
   */
  import type { HarnessKind } from "@cawco/core";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import {
    IconArchive,
    IconArrowRight,
    IconCheck,
    IconExternal,
    IconFolder,
    IconFork,
    IconPenLine,
    IconStop,
    IconTrash,
  } from "$lib/icons";
  import {
    cawco,
    deleteTranscript,
    discardSession,
    forkSession,
    type InstanceRow,
    keepSession,
    removeSession,
    renameInstance,
    stopSession,
  } from "./client.svelte";
  import { confirm } from "./confirm.svelte";
  import { continueInNewSession } from "./continue.svelte";
  import { conversationHref } from "./links";
  import RenameDialog from "./RenameDialog.svelte";
  import { sessionName } from "./session-name";

  interface Props {
    /** The row, spreading the trigger's props on its root element. */
    children: Snippet<[Record<string, unknown>]>;
    instance: InstanceRow;
    /** Set only where the row is listed as finished: takes it off the list. */
    onarchive?: () => void;
    /**
     * Set only where the rail has flattened this session's directory out of
     * its folder — the way back. A row drawn inside a folder is already
     * grouped, and offering it the verb would say nothing.
     */
    ongroup?: () => void;
  }

  let { instance, ongroup, onarchive, children }: Props = $props();

  let renaming = $state(false);
  /**
   * The rename dialog is built the first time it is asked for, then kept so
   * it closes with its own motion: built for every row of a long list, it
   * made opening a tree of sessions run past a frame.
   */
  let renameAsked = $state(false);

  const href = $derived(conversationHref(instance.id, cawco.instanceIndex));
  const scratch = $derived(instance.kind === "scratch");
  const running = $derived(
    instance.status === "running" || instance.status === "starting"
  );

  const session = $derived(cawco.session(instance.id) ?? null);
  /** The SDK session a fork branches from. */
  const forkable = $derived(session?.sessionId ?? instance.sessionId ?? null);
  const machine = $derived(
    cawco.machines.find((entry) => entry.machineId === instance.machineId) ??
      null
  );

  async function fork() {
    if (!(forkable && machine)) {
      return;
    }
    const forked = forkSession({
      machineId: machine.machineId,
      cwd: session?.cwd || instance.cwd,
      sessionId: forkable,
      harness: (session?.harness ??
        instance.harness ??
        "claude") as HarnessKind,
    });
    await goto(conversationHref(forked, cawco.instanceIndex));
  }

  /**
   * A start that failed before the harness named a conversation: there is no
   * transcript to delete and no process to discard, so this is the only way
   * its row leaves the board.
   */
  const neverStarted = $derived(
    !instance.sessionId &&
      instance.status !== "running" &&
      instance.status !== "starting"
  );

  /**
   * Asleep with a transcript: the conversation lives on its machine, and
   * deleting it there is how the session leaves — the hub drops the row once
   * the machine confirms.
   */
  const asleepWithTranscript = $derived(
    Boolean(instance.sessionId) &&
      instance.status !== "running" &&
      instance.status !== "starting"
  );

  async function askDeleteTranscript() {
    const sessionId = instance.sessionId as string;
    await confirm({
      title: "Delete this transcript?",
      body: `“${sessionName(instance.id, {}, instance.cwd).label}” is removed from ${instance.cwd || "this machine"}, for good. Nothing else on the machine is touched.`,
      confirmLabel: "Delete transcript",
      destructive: true,
      pendingLabel: "Deleting…",
      run: () =>
        deleteTranscript(
          instance.machineId,
          sessionId,
          instance.cwd || undefined,
          (instance.harness ?? undefined) as HarnessKind | undefined
        ),
    });
  }

  async function askRemove() {
    await confirm({
      title: "Remove this session?",
      body: "It never started, so there is no transcript to lose.",
      confirmLabel: "Remove session",
      destructive: true,
      pendingLabel: "Removing…",
      run: () => removeSession(instance.id),
    });
  }

  async function askDiscard() {
    await confirm({
      title: "Discard this side quest?",
      body: "The session stops, and whatever the spawn created for it — its worktree, its transcript — goes with it, for good.",
      confirmLabel: "Discard side quest",
      destructive: true,
      pendingLabel: "Discarding…",
      run: () => discardSession(instance.id, instance.machineId),
    });
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>
    {#snippet child({ props })}
      {@render children(props)}
    {/snippet}
  </ContextMenu.Trigger>

  <ContextMenu.Content>
    <ContextMenu.Item onSelect={() => goto(href)}>
      <IconExternal />
      Open
    </ContextMenu.Item>
    <ContextMenu.Item disabled={!(forkable && machine)} onSelect={fork}>
      <IconFork />
      Fork
    </ContextMenu.Item>
    <ContextMenu.Item
      onSelect={() => continueInNewSession({ instanceId: instance.id, machineId: instance.machineId, cwd: instance.cwd, harness: (instance.harness ?? 'claude') as HarnessKind, model: instance.model ?? undefined, title: sessionName(instance.id, {}, instance.cwd).label })}
    >
      <IconArrowRight />
      Continue in new session…
    </ContextMenu.Item>
    {#if running}
      <ContextMenu.Item
        onSelect={() => stopSession(instance.id, instance.machineId)}
      >
        <IconStop />
        Stop
      </ContextMenu.Item>
    {/if}
    {#if ongroup}
      <ContextMenu.Item onSelect={ongroup}>
        <IconFolder />
        Group into folder
      </ContextMenu.Item>
    {/if}
    {#if onarchive}
      <ContextMenu.Item onSelect={onarchive}>
        <IconArchive />
        Archive
      </ContextMenu.Item>
    {/if}
    <ContextMenu.Item
      onSelect={() => {
        renameAsked = true;
        renaming = true;
      }}
    >
      <IconPenLine />
      Rename…
    </ContextMenu.Item>

    {#if asleepWithTranscript}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={askDeleteTranscript} variant="destructive">
        <IconTrash />
        Delete transcript
      </ContextMenu.Item>
    {/if}

    {#if neverStarted}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={askRemove} variant="destructive">
        <IconTrash />
        Remove session
      </ContextMenu.Item>
    {/if}

    {#if scratch}
      <ContextMenu.Separator />
      <ContextMenu.PendingItem
        icon={IconCheck}
        label="Keep"
        pendingLabel="Keeping…"
        run={() => keepSession(instance.id)}
      />
      <ContextMenu.Item onSelect={askDiscard} variant="destructive">
        <IconTrash />
        Discard
      </ContextMenu.Item>
    {/if}

    <ContextMenu.Separator />

    <ContextMenu.CopyItem
      disabled={!instance.cwd}
      text={instance.cwd}
      what="Path"
    >
      Copy path
    </ContextMenu.CopyItem>
    <ContextMenu.CopyItem text={instance.id} what="Session id">
      Copy id
    </ContextMenu.CopyItem>
  </ContextMenu.Content>
</ContextMenu.Root>

{#if renameAsked}
  <RenameDialog
    current={sessionName(instance.id, {}, instance.cwd).label}
    onrename={(title) => renameInstance(instance.id, title)}
    bind:open={renaming}
  />
{/if}
