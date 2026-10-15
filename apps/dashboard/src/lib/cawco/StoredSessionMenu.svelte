<script lang="ts">
  import type { NeutralSessionInfo } from "@cawco/core";
  /**
   * Right-click on a stored session, wherever one is listed. The row itself stays
   * a link — the trigger only wraps it, so it keeps its place in the tab order and
   * the context-menu key still reaches this menu from the keyboard.
   *
   * As LiveSessionMenu: Fork stays pending in the menu and says a refusal
   * there, Rename edits the row's title where it stands (`onrename`), and
   * Delete transcript asks under the row (its `asker`), which keeps the
   * machine's refusal under its question.
   */
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import {
    IconArrowRight,
    IconColumns,
    IconExternal,
    IconFork,
    IconPenLine,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import type { Asker, AskHereRequest } from "./ask-here.svelte";
  import { cawco, deleteTranscript, forkSession } from "./client.svelte";
  import { continueInNewSession } from "./continue.svelte";
  import { conversationHref, instanceForSession, sessionTitle } from "./links";
  import {
    canOpenBeside,
    focusAfterMenu,
    openBeside,
  } from "./workspace/open-beside.svelte";

  let {
    asker,
    machineId,
    info,
    onrename,
    children,
  }: {
    /** The row's questions: its `<AskHere at={info.sessionId}>` draws them under it. */
    asker: Asker<AskHereRequest>;
    machineId: string;
    info: NeutralSessionInfo;
    /** The row's title becomes a field where it stands. */
    onrename: () => void;
    children: Snippet;
  } = $props();

  const href = $derived(
    conversationHref(info.sessionId, cawco.instanceIndex, {
      machineId,
      cwd: info.cwd,
    })
  );

  /** The hub's row for this conversation, when the hub keeps one. */
  const row = $derived(
    instanceForSession(cawco.instanceIndex, info.sessionId, {
      machineId,
      cwd: info.cwd,
    })
  );
  const title = $derived(sessionTitle(info, row));

  /**
   * Rename opens the field once the menu has let go of focus, and a question
   * asked under the row keeps the focus it took (LiveSessionMenu).
   */
  let renameAsked = false;
  function closeFocus(event: Event): void {
    if (renameAsked) {
      renameAsked = false;
      event.preventDefault();
      onrename();
      return;
    }
    if (asker.pending?.at === info.sessionId) {
      event.preventDefault();
      return;
    }
    focusAfterMenu(event);
  }

  async function askDelete() {
    await asker.ask({
      at: info.sessionId,
      title: "Delete this transcript?",
      body: `“${title}” is removed from ${info.cwd || "this machine"}, for good. Nothing else on the machine is touched.`,
      confirmLabel: "Delete transcript",
      destructive: true,
      pendingLabel: "Deleting…",
      run: () =>
        deleteTranscript(
          machineId,
          info.sessionId,
          info.cwd || undefined,
          info.harness
        ),
    });
  }

  /** The page leaves for the fork once the hub has made it; a refusal stays in the item. */
  async function fork() {
    const instanceId = await forkSession({
      machineId,
      cwd: info.cwd ?? "",
      sessionId: info.sessionId,
      harness: info.harness,
    });
    await goto(conversationHref(instanceId, cawco.instanceIndex));
  }
</script>

<!-- Built on the row's first hover or focus, as LiveSessionMenu's is. -->
<ContextMenu.Lazy class="contents">
  {#snippet trigger(props)}
    <div {...props}>{@render children()}</div>
  {/snippet}

  <ContextMenu.Content onCloseAutoFocus={closeFocus}>
    <ContextMenu.Item onSelect={() => goto(href)}>
      <IconExternal />
      <span>Open</span>
    </ContextMenu.Item>
    {#if canOpenBeside(info.sessionId)}
      <ContextMenu.Item
        onSelect={() =>
          openBeside(info.sessionId, {
            machine: machineId,
            cwd: info.cwd ?? "",
            harness: info.harness ?? "claude",
          })}
      >
        <IconColumns />
        <span>Open in split view</span>
      </ContextMenu.Item>
    {/if}
    <ContextMenu.Item
      onSelect={() =>
        continueInNewSession({
          instanceId: info.sessionId,
          machineId,
          cwd: info.cwd ?? "",
          harness: info.harness,
          title,
        })}
    >
      <IconArrowRight />
      <span>Continue in new session…</span>
    </ContextMenu.Item>
    <ContextMenu.Item onSelect={() => window.open(href, "_blank", "noopener")}>
      <IconExternal />
      <span>Open in new tab</span>
    </ContextMenu.Item>
    <ContextMenu.PendingItem
      icon={IconFork}
      label="Fork from here"
      pendingLabel="Forking…"
      run={fork}
    />

    <ContextMenu.Separator />

    <ContextMenu.Item
      onSelect={() => {
        renameAsked = true;
      }}
    >
      <IconPenLine />
      <span>Rename</span>
    </ContextMenu.Item>
    <ContextMenu.CopyItem
      disabled={!info.cwd}
      text={info.cwd ?? ""}
      what="Path"
    >
      Copy path
    </ContextMenu.CopyItem>
    <ContextMenu.CopyItem text={info.sessionId} what="Session id">
      Copy session id
    </ContextMenu.CopyItem>

    <ContextMenu.Separator />

    <ContextMenu.Item onSelect={askDelete} variant="destructive">
      <IconTrash />
      <span>Delete transcript</span>
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Lazy>
