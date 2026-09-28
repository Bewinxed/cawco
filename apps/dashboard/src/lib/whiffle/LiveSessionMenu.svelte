<script lang="ts">
  /**
   * Right-click on a running session or a side quest. Keep and Discard are what a
   * side quest is waiting on, so they only appear on one (NEW.md §1).
   */
  import type { HarnessKind } from "@whiffle/core";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import {
    IconArrowRight,
    IconCheck,
    IconExternal,
    IconFolder,
    IconStop,
    IconTrash,
  } from "$lib/icons";
  import {
    deleteTranscript,
    discardSession,
    type InstanceRow,
    keepSession,
    removeSession,
    stopSession,
    whiffle,
  } from "./client.svelte";
  import { confirm } from "./confirm.svelte";
  import { continueInNewSession } from "./continue.svelte";
  import { conversationHref } from "./links";
  import { sessionName } from "./session-name";

  interface Props {
    children: Snippet;
    instance: InstanceRow;
    /**
     * Set only where the rail has flattened this session's directory out of
     * its folder — the way back. A row drawn inside a folder is already
     * grouped, and offering it the verb would say nothing.
     */
    ongroup?: () => void;
  }

  let { instance, ongroup, children }: Props = $props();

  const href = $derived(conversationHref(instance.id, whiffle.instanceIndex));
  const scratch = $derived(instance.kind === "scratch");

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
  <ContextMenu.Trigger class="contents">
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content>
    <ContextMenu.Item onSelect={() => goto(href)}>
      <IconExternal />
      Open
    </ContextMenu.Item>
    <ContextMenu.Item
      onSelect={() => continueInNewSession({ instanceId: instance.id, machineId: instance.machineId, cwd: instance.cwd, harness: (instance.harness ?? 'claude') as HarnessKind, model: instance.model ?? undefined, title: sessionName(instance.id, {}, instance.cwd).label })}
    >
      <IconArrowRight />
      Continue in new session…
    </ContextMenu.Item>
    <ContextMenu.Item
      onSelect={() => stopSession(instance.id, instance.machineId)}
    >
      <IconStop />
      Stop
    </ContextMenu.Item>
    {#if ongroup}
      <ContextMenu.Item onSelect={ongroup}>
        <IconFolder />
        Group into folder
      </ContextMenu.Item>
    {/if}

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
