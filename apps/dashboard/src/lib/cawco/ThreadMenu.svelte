<script lang="ts">
  /**
   * Right-click (long-press on touch, the menu key on a focused row) on a
   * thread with a project's Caw, wherever one is listed: the rail, his
   * panel's thread list. As LiveSessionMenu: the row is the trigger and
   * spreads its props on its own root, and Archive stays pending in the menu
   * and says a refusal there (DESIGN.md, The Stay In Context Rule).
   *
   * Archive takes the thread and the sessions its turns started off every
   * rail; the project's thread list keeps it under Archived, where its menu
   * brings it back with Unarchive, and a new message in it brings it back
   * on its own.
   */
  import { threadWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconArchive, IconExternal, IconUnarchive } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { archiveThread, cawco } from "./client.svelte";
  import { threadHref, threadIdOf } from "./thread-tabs";
  import { focusAfterMenu } from "./workspace/open-beside.svelte";

  let {
    id,
    projectId,
    children,
  }: {
    /** The thread's row id (`thread:<id>`, thread-tabs.ts). */
    id: string;
    projectId: string;
    /** The row, spreading the trigger's props on its root element. */
    children: Snippet<[Record<string, unknown>]>;
  } = $props();

  const threadId = $derived(threadIdOf(id));
  const archived = $derived(cawco.threadOf(id)?.archivedAt !== undefined);
</script>

<!-- Built on the row's first hover or focus (ContextMenu.Lazy), as a
     session row's menu is. -->
<ContextMenu.Lazy>
  {#snippet trigger(props)}
    {@render children(props)}
  {/snippet}

  <ContextMenu.Content onCloseAutoFocus={focusAfterMenu}>
    {#if threadId}
      <ContextMenu.Item onSelect={() => goto(threadHref(threadId))}>
        <IconExternal />
        <span>Open</span>
      </ContextMenu.Item>
      {#if archived}
        <ContextMenu.PendingItem
          icon={IconUnarchive}
          label={threadWords.unarchive}
          pendingLabel={threadWords.unarchiving}
          run={() => archiveThread(projectId, threadId, false)}
        />
      {:else}
        <ContextMenu.PendingItem
          icon={IconArchive}
          label={threadWords.archive}
          pendingLabel={threadWords.archiving}
          run={() => archiveThread(projectId, threadId, true)}
        />
      {/if}
    {/if}
  </ContextMenu.Content>
</ContextMenu.Lazy>
