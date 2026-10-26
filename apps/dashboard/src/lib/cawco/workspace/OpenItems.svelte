<script lang="ts">
  /**
   * A session row's menu's first items: Open, and Open in split view where
   * the menu offers it right now (open-beside.svelte.ts). `context` is what
   * a drag from the board records for a session not yet on the board.
   */
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconColumns, IconExternal } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { canOpenBeside, openBeside } from "./open-beside.svelte";
  import type { AskedContext } from "./workspace.svelte";

  let {
    href,
    sessionId,
    context,
  }: { href: string; sessionId: string; context?: AskedContext } = $props();
</script>

<ContextMenu.Item onSelect={() => goto(href)}>
  <IconExternal />
  <span>Open</span>
</ContextMenu.Item>
{#if canOpenBeside(sessionId)}
  <ContextMenu.Item onSelect={() => openBeside(sessionId, context)}>
    <IconColumns />
    <span>Open in split view</span>
  </ContextMenu.Item>
{/if}
