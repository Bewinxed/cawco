<script lang="ts">
  import type { FleetMcpConfig, FleetMcpServer } from "@whiffle/core";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { Input } from "$lib/components/ui/input";
  import { IconKeyDuo, IconPlayDuo } from "$lib/icons";
  import { appear } from "$lib/whiffle/motion/curves.svelte";
  import { confirm } from "../../confirm.svelte";
  import {
    isRemoteMcp,
    mcpNameProblem,
    pairsToRecord,
    recordToPairs,
    removeMcpServer,
    saveMcpServer,
    splitArgs,
    suggestMcpName,
  } from "../../fleet";
  import KeyValueRows from "../../KeyValueRows.svelte";
  import Choice from "../Choice.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import Field from "../Field.svelte";
  import { configStore, upsert } from "../store.svelte";
  import TitleInput from "../TitleInput.svelte";

  /**
   * One MCP server: how every machine starts it, and what sessions call it.
   * A new name makes a new server; the old one stays until it is removed.
   */
  let { server, taken }: { server: FleetMcpServer | null; taken: string[] } =
    $props();

  const store = configStore();
  const HUE = "var(--hue-cyan-400)";

  type Mode = "bunx" | "command" | "remote";
  const HOW: Record<Mode, string> = {
    bunx: "Every machine runs the package with bunx. Nothing to install first.",
    command: "Runs a command the machines already have on their PATH.",
    remote: "Calls an endpoint. No process runs on the machines.",
  };

  const remote = untrack(() =>
    server && isRemoteMcp(server.config) ? server.config : null
  );
  const local = untrack(() =>
    server && !isRemoteMcp(server.config) ? server.config : null
  );

  const startMode = (): Mode => {
    if (remote) {
      return "remote";
    }
    return local ? "command" : "bunx";
  };
  let mode = $state<Mode>(startMode());
  let serverName = $state(untrack(() => server?.name ?? ""));
  let named = $state(untrack(() => server !== null));
  let pkg = $state("");
  let pkgArgs = $state("");
  let command = $state(local?.command ?? "");
  let argsLine = $state((local?.args ?? []).join(" "));
  let env = $state(recordToPairs(local?.env));
  let url = $state(remote?.url ?? "");
  let transport = $state<"http" | "sse">(remote?.type ?? "http");
  let headers = $state(recordToPairs(remote?.headers));
  let busy = $state(false);
  let deleting = $state(false);
  let failed = $state<string | undefined>(undefined);

  const nameProblem = $derived(mcpNameProblem(serverName, taken));
  const filled = $derived.by(() => {
    if (mode === "bunx") {
      return pkg.trim() !== "";
    }
    if (mode === "command") {
      return command.trim() !== "";
    }
    return url.trim() !== "";
  });

  function build(): FleetMcpConfig {
    if (mode === "remote") {
      const sent = pairsToRecord(headers);
      return {
        type: transport,
        url: url.trim(),
        ...(Object.keys(sent).length > 0 ? { headers: sent } : {}),
      };
    }
    if (mode === "bunx") {
      return { command: "bunx", args: [pkg.trim(), ...splitArgs(pkgArgs)] };
    }
    const passed = pairsToRecord(env);
    const args = splitArgs(argsLine);
    return {
      command: command.trim(),
      ...(args.length > 0 ? { args } : {}),
      ...(Object.keys(passed).length > 0 ? { env: passed } : {}),
    };
  }

  async function save() {
    if (nameProblem || !filled || busy) {
      return;
    }
    busy = true;
    failed = undefined;
    try {
      const saved = await saveMcpServer(
        serverName.trim(),
        build(),
        server?.enabled ?? true
      );
      const fleet = store.fleet.value;
      if (fleet) {
        upsert(fleet.config.mcp, saved, (row) => row.name === saved.name);
      }
      if (server && server.name !== saved.name) {
        toast.info(
          `${server.name} is still there — a new name makes a new server.`
        );
      }
      store.mark(saved.name);
      await goto("/config/mcp");
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function askRemove() {
    if (!server) {
      return;
    }
    const ok = await confirm({
      title: `Remove ${server.name}?`,
      body: `This removes ${server.name} from every machine in the fleet — not just this one. It can't be undone.`,
      confirmLabel: "Remove everywhere",
      destructive: true,
    });
    if (!ok) {
      return;
    }
    deleting = true;
    try {
      await removeMcpServer(server.name);
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.config.mcp = fleet.config.mcp.filter(
          (row) => row.name !== server.name
        );
      }
      await goto("/config/mcp");
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
      deleting = false;
    }
  }
</script>

<EditorFrame
  canSave={filled && nameProblem === undefined}
  deleteLabel={server ? 'Remove everywhere' : undefined}
  {deleting}
  oncancel={() => goto('/config/mcp')}
  ondelete={server ? askRemove : undefined}
  onsubmit={save}
  saveLabel={server ? 'Save changes' : 'Add server'}
  saving={busy}
  title={server ? server.name : 'New MCP server'}
>
  {#snippet header()}
    <TitleInput
      invalid={serverName !== '' && nameProblem !== undefined}
      label="Server name"
      mono
      placeholder="Name this server"
      bind:value={serverName}
    />
    {#if serverName !== '' && nameProblem}
      <p class="problem" in:appear>{nameProblem}</p>
    {:else}
      <p class="note">
        What sessions call its tools —
        <span class="font-mono">mcp__{serverName || 'name'}__…</span>. New
        sessions pick it up; a running session keeps the servers it started
        with.
      </p>
    {/if}
    {#if failed}
      <p class="problem" role="alert" in:appear>{failed}</p>
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconPlayDuo} label="How machines run it">
    <Choice
      label="Kind"
      onchange={(next) => {
        mode = next as Mode;
      }}
      options={[
        { value: 'bunx', label: 'bunx package' },
        { value: 'command', label: 'Command' },
        { value: 'remote', label: 'Remote' },
      ]}
      value={mode}
    />
    <p class="note">{HOW[mode]}</p>
    {#if mode === 'bunx'}
      <Field id="mcp-package" label="Package">
        <Input
          autocomplete="off"
          class="font-mono"
          id="mcp-package"
          oninput={() => {
            if (!named) {
              serverName = suggestMcpName(pkg);
            }
          }}
          placeholder="@modelcontextprotocol/server-filesystem"
          spellcheck="false"
          bind:value={pkg}
        />
      </Field>
      <Field id="mcp-package-args" label="Arguments (optional)">
        <Input
          autocomplete="off"
          class="font-mono"
          id="mcp-package-args"
          placeholder="/home/you/projects"
          spellcheck="false"
          bind:value={pkgArgs}
        />
      </Field>
    {:else if mode === 'command'}
      <Field id="mcp-command" label="Command">
        <Input
          autocomplete="off"
          class="font-mono"
          id="mcp-command"
          placeholder="uvx"
          spellcheck="false"
          bind:value={command}
        />
      </Field>
      <Field
        hint="Split on spaces. Quotes are not honoured."
        id="mcp-args"
        label="Arguments"
      >
        <Input
          autocomplete="off"
          class="font-mono"
          id="mcp-args"
          placeholder="mcp-server-git --repository /home/you/repo"
          spellcheck="false"
          bind:value={argsLine}
        />
      </Field>
    {:else}
      <Field id="mcp-url" label="URL">
        <Input
          autocomplete="off"
          class="font-mono"
          id="mcp-url"
          placeholder="https://mcp.example.com/sse"
          spellcheck="false"
          bind:value={url}
        />
      </Field>
      <Choice
        label="Transport"
        onchange={(next) => {
          transport = next as 'http' | 'sse';
        }}
        options={[
          { value: 'http', label: 'HTTP' },
          { value: 'sse', label: 'SSE · deprecated' },
        ]}
        value={transport}
      />
    {/if}
  </EditorSection>

  {#if mode !== 'bunx'}
    <EditorSection
      hue={HUE}
      icon={IconKeyDuo}
      label={mode === 'remote' ? 'Headers' : 'Environment'}
    >
      <p class="note">
        <span class="font-mono">&#36;&#123;VAR&#125;</span>
        is expanded on each machine, from that machine's own environment —
        secrets never pass through the hub.
      </p>
      {#if mode === 'remote'}
        <KeyValueRows
          keyPlaceholder="Authorization"
          legend="Headers"
          valuePlaceholder="Bearer &#36;&#123;MY_TOKEN&#125;"
          bind:rows={headers}
        />
      {:else}
        <KeyValueRows
          keyPlaceholder="API_KEY"
          legend="Environment"
          valuePlaceholder="&#36;&#123;MY_API_KEY&#125;"
          bind:rows={env}
        />
      {/if}
    </EditorSection>
  {/if}
</EditorFrame>

<style>
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
