<script lang="ts">
  import type { NeutralSessionInfo } from "@whiffle/core";
  /**
   * Right-click on a stored session, wherever one is listed. The row itself stays
   * a link — the trigger only wraps it, so it keeps its place in the tab order and
   * the context-menu key still reaches this menu from the keyboard.
   */
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "$lib/components/ui/context-menu";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import {
    IconArrowRight,
    IconExternal,
    IconFork,
    IconPenLine,
    IconTrash,
  } from "$lib/icons";
  import {
    deleteTranscript,
    forkSession,
    loadCatalog,
    machineControl,
    whiffle,
  } from "./client.svelte";
  import { continueInNewSession } from "./continue.svelte";
  import { conversationHref, sessionTitle } from "./links";

  let {
    machineId,
    info,
    children,
  }: { machineId: string; info: NeutralSessionInfo; children: Snippet } =
    $props();

  const href = $derived(
    conversationHref(info.sessionId, whiffle.instanceIndex, {
      machineId,
      cwd: info.cwd,
    })
  );
  /** Every mutation names the directory the session was recorded under. */
  const where = $derived({ dir: info.cwd || undefined });

  let renaming = $state(false);
  let title = $state("");
  let confirmingDelete = $state(false);
  let busy = $state(false);
  /** The last rename went through (a failed one leaves the dialog open). */
  let renamed = $state(false);

  function openRename() {
    title = sessionTitle(info);
    renaming = true;
  }

  async function rename(event: SubmitEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next || busy) {
      return;
    }
    busy = true;
    renamed = false;
    try {
      await machineControl(
        machineId,
        "renameSession",
        [info.sessionId, next, where],
        undefined,
        info.harness
      );
      await loadCatalog(machineId);
      renamed = true;
      renaming = false;
    } finally {
      busy = false;
    }
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
    await goto(conversationHref(instanceId, whiffle.instanceIndex));
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
      onSelect={() => continueInNewSession({ instanceId: info.sessionId, machineId, cwd: info.cwd ?? '', harness: info.harness, title: sessionTitle(info) })}
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

    <ContextMenu.Item onSelect={openRename}>
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

<Dialog.Root bind:open={renaming}>
  <Dialog.Content>
    <form class="grid gap-6" onsubmit={rename}>
      <Dialog.Header>
        <Dialog.Title>Rename session</Dialog.Title>
        <Dialog.Description>
          What this session is called in your history. It does not change the
          transcript.
        </Dialog.Description>
      </Dialog.Header>
      <!-- First tabbable thing in the dialog, so it is what opens focused. -->
      <Input aria-label="Session title" autocomplete="off" bind:value={title} />
      <Dialog.Footer>
        <Button
          onclick={() => {
            renaming = false;
          }}
          type="button"
          variant="outline"
          >Cancel</Button
        >
        <Button
          disabled={!title.trim()}
          failed={!renamed}
          label="Rename"
          pending={busy}
          pendingLabel="Renaming…"
          type="submit"
        />
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={confirmingDelete}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this transcript?</AlertDialog.Title>
      <AlertDialog.Description>
        “{sessionTitle(info)}” is removed from {info.cwd || 'this machine'}, for
        good. Nothing else on the machine is touched.
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
