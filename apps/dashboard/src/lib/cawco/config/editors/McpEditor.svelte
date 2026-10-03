<script lang="ts">
  import type { FleetMcpConfig, FleetMcpServer } from "@cawco/core";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    appear,
    crossIn,
    crossOut,
    dur,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconKey, IconPlay } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
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
  import { keepDraft, sameFields } from "../drafts.svelte";
  import { savedShown } from "../EditorFooter.svelte";
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

  /** What is saved, as the server it would write: an edit that comes back to it is no edit. */
  let baseline = $state(
    untrack(() => ({ name: serverName.trim(), config: build() }))
  );
  /** A new server was just added (or a new name made one): its draft is over, and a second Save would add it again. */
  let created = false;
  const kept = keepDraft(
    page.url.pathname,
    () =>
      sameFields({ name: serverName.trim(), config: build() }, baseline)
        ? null
        : {
            mode,
            serverName,
            named,
            pkg,
            pkgArgs,
            command,
            argsLine,
            env,
            url,
            transport,
            headers,
          },
    (stored) => {
      ({
        mode,
        serverName,
        named,
        pkg,
        pkgArgs,
        command,
        argsLine,
        env,
        url,
        transport,
        headers,
      } = stored);
    }
  );

  /**
   * Saving a server keeps the editor open on it, the Save button saying so
   * in place. A new server, or a new name (which makes a new server),
   * shows the same, then returns to the list, where it is marked.
   */
  async function save() {
    if (nameProblem || !filled || busy || created) {
      return;
    }
    busy = true;
    failed = undefined;
    let made: string | undefined;
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
      if (server?.name === saved.name) {
        baseline = { name: saved.name, config: build() };
      } else {
        if (server) {
          toast.info(
            `${server.name} is still there — a new name makes a new server.`
          );
        }
        created = true;
        kept.drop();
        made = saved.name;
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
    if (made) {
      await savedShown();
      store.mark(made);
      await goto("/config/mcp");
    }
  }

  /** Cancel leaves the edits behind: the draft is dropped, not kept. */
  function cancel() {
    kept.drop();
    // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
    void goto("/config/mcp");
  }

  async function askRemove() {
    if (!server) {
      return;
    }
    await confirm({
      title: `Remove ${server.name}?`,
      body: `This removes ${server.name} from every machine in the fleet — not just this one. It can't be undone.`,
      confirmLabel: "Remove everywhere",
      destructive: true,
      pendingLabel: "Removing…",
      run: async () => {
        deleting = true;
        try {
          await removeMcpServer(server.name);
          kept.drop();
          // Back to the list first, so the row is seen leaving it.
          await goto("/config/mcp");
          const fleet = store.fleet.value;
          if (fleet) {
            fleet.config.mcp = fleet.config.mcp.filter(
              (row) => row.name !== server.name
            );
          }
        } catch (error) {
          deleting = false;
          throw error;
        }
      },
    });
  }
</script>

<EditorFrame
  canSave={filled && nameProblem === undefined}
  deleteLabel={server ? 'Remove everywhere' : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={cancel}
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

  <EditorSection hue={HUE} icon={IconPlay} label="How machines run it">
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
    <!-- One kind's note and fields cross-fade into the next's
         (--dur-control) in one box, whose height follows over --dur-pop on
         --ease-drawer. -->
    <div class="kind" {@attach morph({ ms: dur('--dur-pop') })}>
      {#if mode === 'bunx'}
        <div class="fold" in:crossIn out:crossOut>
          <p class="note">{HOW.bunx}</p>
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
        </div>
      {:else if mode === 'command'}
        <div class="fold" in:crossIn out:crossOut>
          <p class="note">{HOW.command}</p>
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
        </div>
      {:else}
        <div class="fold" in:crossIn out:crossOut>
          <p class="note">{HOW.remote}</p>
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
        </div>
      {/if}
    </div>
  </EditorSection>

  {#if mode !== 'bunx'}
    <!-- A bunx package takes neither: the section folds in and out (240 /
         160), and between headers and environment its lines cross-fade. -->
    <div in:unfold out:unfold>
      <EditorSection
        hue={HUE}
        icon={IconKey}
        label={mode === 'remote' ? 'Headers' : 'Environment'}
      >
        <p class="note">
          <span class="font-mono">&#36;&#123;VAR&#125;</span>
          is expanded on each machine, from that machine's own environment —
          secrets never pass through the hub.
        </p>
        <div class="kind" {@attach morph({ ms: dur('--dur-pop') })}>
          {#if mode === 'remote'}
            <div in:crossIn out:crossOut>
              <KeyValueRows
                keyPlaceholder="Authorization"
                legend="Headers"
                valuePlaceholder="Bearer &#36;&#123;MY_TOKEN&#125;"
                bind:rows={headers}
              />
            </div>
          {:else}
            <div in:crossIn out:crossOut>
              <KeyValueRows
                keyPlaceholder="API_KEY"
                legend="Environment"
                valuePlaceholder="&#36;&#123;MY_API_KEY&#125;"
                bind:rows={env}
              />
            </div>
          {/if}
        </div>
      </EditorSection>
    </div>
  {/if}
</EditorFrame>

<style>
  /* The kind's box: the set leaving is pinned in it (crossOut) while the
     one arriving sets its height. */
  .kind {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .fold {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
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
