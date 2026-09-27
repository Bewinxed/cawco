<script lang="ts">
  /**
   * One MCP server, in full: what it is, whether it connected, what it offers
   * and the two verbs that fix it. Written once and read twice — the chip's
   * popover in the session header, and the context rail's MCP tab, which is the
   * same question asked with more room.
   */
  import type { McpServerStatus } from "@whiffle/core";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { restartMcpServer, setMcpServerEnabled } from "./client.svelte";
  import { faviconCandidates, mcpHost } from "./mcp";

  interface Props {
    instanceId: string;
    machineId: string;
    server: McpServerStatus;
  }

  let { server, instanceId, machineId }: Props = $props();

  const DOT: Record<string, string> = {
    connected: "bg-success",
    failed: "bg-destructive",
    "needs-auth": "bg-warning",
    pending: "bg-muted-foreground animate-pulse",
  };

  const WORD: Record<string, string> = {
    connected: "text-success",
    failed: "text-destructive",
    "needs-auth": "text-warning",
  };

  const host = $derived(mcpHost(server));
  const candidates = $derived(host ? faviconCandidates(host) : []);
  /** How far down the candidate list the failures have walked. */
  let step = $state(0);
  let busy = $state(false);

  async function run(action: () => Promise<void>) {
    busy = true;
    try {
      await action();
    } catch (error) {
      console.error(`[whiffle] ${server.name} did not answer:`, error);
      toast.error(`${server.name} did not respond`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      busy = false;
    }
  }

  const restart = () =>
    run(() => restartMcpServer(instanceId, machineId, server.name));
  const setEnabled = (enabled: boolean) =>
    run(() => setMcpServerEnabled(instanceId, machineId, server.name, enabled));
</script>

<div>
  <div class="flex items-center gap-2">
    {#if step < candidates.length}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: onerror is an image-load lifecycle event, not user interaction -->
      <img
        alt=""
        class="size-5 shrink-0 rounded-[var(--radius-xs)]"
        onerror={() => {
          step += 1;
        }}
        src={candidates[step]}
      >
    {:else}
      <span
        aria-hidden="true"
        class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-meta leading-none font-medium text-muted-foreground uppercase"
      >
        {server.name.charAt(0)}
      </span>
    {/if}
    <span class="truncate text-label font-medium">{server.name}</span>
    {#if server.serverInfo?.version}
      <span class="text-meta text-muted-foreground"
        >v{server.serverInfo.version}</span
      >
    {/if}
  </div>

  <div class="mt-2 flex items-center gap-1.5">
    <span
      class="size-2 shrink-0 rounded-full {DOT[server.status] ?? 'bg-muted-foreground/40'}"
    ></span>
    <span class="text-meta {WORD[server.status] ?? 'text-muted-foreground'}"
      >{server.status}</span
    >
    {#if server.scope}
      <span class="ml-auto text-meta text-muted-foreground"
        >{server.scope}</span
      >
    {/if}
  </div>

  {#if server.error}
    <p
      class="mt-2 max-h-24 overflow-y-auto rounded-[var(--radius-sm)] bg-destructive/10 p-2.5 font-mono text-label text-destructive"
    >
      {server.error}
    </p>
  {/if}

  {#if server.tools?.length}
    <p class="mt-2 text-meta font-medium text-muted-foreground">
      {server.tools.length}
      tools
    </p>
    <ul class="mt-1 max-h-40 overflow-y-auto">
      {#each server.tools as tool (tool.name)}
        <li
          class="truncate font-mono text-label leading-5"
          title={tool.description}
        >
          {tool.name}
        </li>
      {/each}
    </ul>
  {/if}

  <!-- A phone has no right-click, so the menu's verbs sit here too. -->
  <div class="mt-3 flex gap-1.5">
    <Button
      class="rounded-[var(--radius-sm)] text-meta"
      disabled={busy}
      onclick={restart}
      size="sm"
      variant="ghost"
    >
      Restart
    </Button>
    {#if server.status === 'disabled'}
      <Button
        class="rounded-[var(--radius-sm)] text-meta"
        disabled={busy}
        onclick={() => setEnabled(true)}
        size="sm"
        variant="ghost"
      >
        Start
      </Button>
    {:else}
      <Button
        class="rounded-[var(--radius-sm)] text-meta"
        disabled={busy}
        onclick={() => setEnabled(false)}
        size="sm"
        variant="ghost"
      >
        Stop
      </Button>
    {/if}
  </div>
</div>
