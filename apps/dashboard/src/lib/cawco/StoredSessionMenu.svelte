<script lang="ts">
  import type { NeutralSessionInfo } from "@cawco/core";
  /**
   * Right-click on a stored session, wherever one is listed. The row itself stays
   * a link — the trigger only wraps it, so it keeps its place in the tab order and
   * the context-menu key still reaches this menu from the keyboard.
   */
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import {
    IconArrowRight,
    IconExternal,
    IconFork,
    IconPenLine,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import {
    cawco,
    deleteTranscript,
    forkSession,
    loadCatalog,
    machineControl,
    renameInstance,
  } from "./client.svelte";
  import { continueInNewSession } from "./continue.svelte";
  import { conversationHref, instanceForSession, sessionTitle } from "./links";
  import RenameDialog from "./RenameDialog.svelte";

  let {
    machineId,
    info,
    children,
  }: { machineId: string; info: NeutralSessionInfo; children: Snippet } =
    $props();

  const href = $derived(
    conversationHref(info.sessionId, cawco.instanceIndex, {
      machineId,
      cwd: info.cwd,
    })
  );
  /** Every mutation names the directory the session was recorded under. */
  const where = $derived({ dir: info.cwd || undefined });

  let renaming = $state(false);
  /** Built the first time it is asked for, as LiveSessionMenu's is. */
  let renameAsked = $state(false);
  let confirmingDelete = $state(false);
  let busy = $state(false);

  /** The hub's row for this conversation, when the hub keeps one. */
  const row = $derived(
    instanceForSession(cawco.instanceIndex, info.sessionId, {
      machineId,
      cwd: info.cwd,
    })
  );
  const title = $derived(sessionTitle(info, row));

  /**
   * A session the hub keeps is named there, the one place every listing
   * reads; a transcript the hub never ran is named in the transcript itself.
   */
  async function rename(next: string) {
    if (row) {
      await renameInstance(row.id, next);
      return;
    }
    await machineControl(
      machineId,
      "renameSession",
      [info.sessionId, next, where],
      undefined,
      info.harness
    );
    await loadCatalog(machineId);
  }

  /** The last delete went through (a failed one leaves the dialog open). */
  let removed = $state(false);

  async function remove() {
    busy = true;
    removed = false;
    try {
      await deleteTranscript(
        machineId,
        info.sessionId,
        where.dir,
        info.harness
      );
      removed = true;
      confirmingDelete = false;
    } finally {
      busy = false;
    }
  }

  async function fork() {
    const instanceId = forkSession({
      machineId,
      cwd: info.cwd ?? "",
      sessionId: info.sessionId,
      harness: info.harness,
    });
    await goto(conversationHref(instanceId, cawco.instanceIndex));
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
      onSelect={() => continueInNewSession({ instanceId: info.sessionId, machineId, cwd: info.cwd ?? '', harness: info.harness, title })}
    >
      <IconArrowRight />
      Continue in new session…
    </ContextMenu.Item>
    <ContextMenu.Item onSelect={() => window.open(href, '_blank', 'noopener')}>
      <IconExternal />
      Open in new tab
    </ContextMenu.Item>
    <ContextMenu.Item onSelect={fork}>
      <IconFork />
      Fork from here
    </ContextMenu.Item>

    <ContextMenu.Separator />

    <ContextMenu.Item
      onSelect={() => {
        renameAsked = true;
        renaming = true;
      }}
    >
      <IconPenLine />
      Rename…
    </ContextMenu.Item>
    <ContextMenu.CopyItem
      disabled={!info.cwd}
      text={info.cwd ?? ''}
      what="Path"
    >
      Copy path
    </ContextMenu.CopyItem>
    <ContextMenu.CopyItem text={info.sessionId} what="Session id">
      Copy session id
    </ContextMenu.CopyItem>

    <ContextMenu.Separator />

    <ContextMenu.Item
      onSelect={() => {
        confirmingDelete = true;
      }}
      variant="destructive"
    >
      <IconTrash />
      Delete transcript
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>

{#if renameAsked}
  <RenameDialog current={title} onrename={rename} bind:open={renaming} />
{/if}

<AlertDialog.Root bind:open={confirmingDelete}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this transcript?</AlertDialog.Title>
      <AlertDialog.Description>
        “{title}” is removed from {info.cwd || 'this machine'}, for good.
        Nothing else on the machine is touched.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive">
        {#snippet child({ props })}
          <Button
            {...props}
            failed={!removed}
            label="Delete transcript"
            onclick={remove}
            pending={busy}
            pendingLabel="Deleting…"
            variant="destructive"
          />
        {/snippet}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
