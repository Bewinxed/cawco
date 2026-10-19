<script lang="ts">
  import {
    type FleetMcpConfig,
    type FleetMcpServer,
    mcpWords as words,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    appear,
    crossIn,
    crossOut,
    dur,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconKey, IconMapPoint, IconPlay } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Coded from "../../Coded.svelte";
  import { cawco } from "../../client.svelte";
  import {
    isRemoteMcp,
    mcpNameProblem,
    pairsToRecord,
    recordToPairs,
    saveMcpServer,
    splitArgs,
    suggestMcpName,
  } from "../../fleet";
  import KeyValueRows from "../../KeyValueRows.svelte";
  import Choice from "../Choice.svelte";
  import { deleteMcpServer } from "../deletes";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import { savedShown } from "../EditorFooter.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import Field from "../Field.svelte";
  import McpSignIn from "../McpSignIn.svelte";
  import PickerChip from "../PickerChip.svelte";
  import RolloutChip from "../RolloutChip.svelte";
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
    bunx: words.howBunx,
    command: words.howCommand,
    remote: words.howRemote,
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
  /** One project's only (placed at its checkouts and workspaces); "" for every machine. */
  let projectId = $state(untrack(() => server?.projectId ?? ""));
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
    untrack(() => ({ name: serverName.trim(), config: build(), projectId }))
  );
  /** A new server was just added (or a new name made one): its draft is over, and a second Save would add it again. */
  let created = false;
  const kept = keepDraft(
    page.url.pathname,
    () =>
      sameFields(
        { name: serverName.trim(), config: build(), projectId },
        baseline
      )
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
            projectId,
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
        projectId,
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
        server?.enabled ?? true,
        projectId || null
      );
      const fleet = store.fleet.value;
      if (fleet) {
        upsert(fleet.config.mcp, saved, (row) => row.name === saved.name);
      }
      if (server?.name === saved.name) {
        baseline = { name: saved.name, config: build(), projectId };
      } else {
        created = true;
        kept.drop();
        made = saved.name;
      }
    } catch (error) {
      failed = failureWords(error);
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

  /** Remove: at once, with Undo in the toast (deletes.ts). */
  async function remove() {
    if (!server) {
      return;
    }
    deleting = true;
    failed = undefined;
    try {
      await deleteMcpServer(store, server.name, () => {
        kept.drop();
        return goto("/config/mcp");
      });
    } catch (error) {
      deleting = false;
      failed = failureWords(error);
    }
  }
</script>

<EditorFrame
  canSave={filled && nameProblem === undefined}
  deleteLabel={server ? words.remove : undefined}
  {deleting}
  failed={failed !== undefined}
  oncancel={cancel}
  ondelete={server ? remove : undefined}
  onsubmit={save}
  saveLabel={server ? words.save : words.add}
  saving={busy}
  title={server ? server.name : words.newTitle}
>
  {#snippet result()}
    {#if server}
      <RolloutChip
        kind="mcp"
        machines={cawco.machines}
        name={server.name}
        what={server.name}
      />
    {/if}
  {/snippet}
  {#snippet header()}
    <TitleInput
      invalid={serverName !== "" && nameProblem !== undefined}
      label={words.nameLabel}
      mono
      placeholder={words.namePlaceholder}
      bind:value={serverName}
    />
    {#if serverName !== "" && nameProblem}
      <p class="type-meta text-status-fail-ink" in:appear>{nameProblem}</p>
    {:else if server && serverName.trim() !== "" && serverName.trim() !== server.name}
      <!-- Said before Save, where the name is changed: that is its consequence. -->
      <p data-slot="note" class="note" in:appear>
        {words.renamed(server.name)}
      </p>
    {:else}
      <p data-slot="note" class="note">
        <Coded text={words.callsAs(serverName || "name")} />
      </p>
    {/if}
    {#if failed}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>
        {failed}
      </p>
    {/if}
    {#if server}
      <McpSignIn {server} />
      {#if server.auth?.state === "failed"}
        <p class="type-meta text-status-fail-ink" role="alert">
          {server.auth.detail}
        </p>
      {/if}
    {/if}
  {/snippet}

  <EditorSection hue={HUE} icon={IconPlay} label={words.howItRuns}>
    <Choice
      label={words.kind}
      onchange={(next) => {
        mode = next as Mode;
      }}
      options={[
        { value: "bunx", label: words.kindBunx },
        { value: "command", label: words.kindCommand },
        { value: "remote", label: words.kindRemote },
      ]}
      value={mode}
    />
    <!-- One kind's note and fields cross-fade into the next's
         (--dur-control) in one box, whose height follows over --dur-pop on
         --ease-drawer. -->
    <div
      data-slot="kind"
      class="relative flex flex-col"
      {@attach morph({ ms: dur("--dur-pop") })}
    >
      {#if mode === "bunx"}
        <div data-slot="fold" class="fold" in:crossIn out:crossOut>
          <p data-slot="note" class="note">{HOW.bunx}</p>
          <Field id="mcp-package" label={words.package}>
            <Input
              autocomplete="off"
              face="mono"
              id="mcp-package"
              oninput={() => {
                if (!named) {
                  serverName = suggestMcpName(pkg);
                }
              }}
              placeholder={words.packagePlaceholder}
              spellcheck="false"
              bind:value={pkg}
            />
          </Field>
          <Field id="mcp-package-args" label={words.packageArgs}>
            <Input
              autocomplete="off"
              face="mono"
              id="mcp-package-args"
              placeholder={words.packageArgsPlaceholder}
              spellcheck="false"
              bind:value={pkgArgs}
            />
          </Field>
        </div>
      {:else if mode === "command"}
        <div data-slot="fold" class="fold" in:crossIn out:crossOut>
          <p data-slot="note" class="note">{HOW.command}</p>
          <Field id="mcp-command" label={words.command}>
            <Input
              autocomplete="off"
              face="mono"
              id="mcp-command"
              placeholder={words.commandPlaceholder}
              spellcheck="false"
              bind:value={command}
            />
          </Field>
          <Field hint={words.argsHint} id="mcp-args" label={words.args}>
            <Input
              autocomplete="off"
              face="mono"
              id="mcp-args"
              placeholder={words.argsPlaceholder}
              spellcheck="false"
              bind:value={argsLine}
            />
          </Field>
        </div>
      {:else}
        <div data-slot="fold" class="fold" in:crossIn out:crossOut>
          <p data-slot="note" class="note">{HOW.remote}</p>
          <Field id="mcp-url" label={words.url}>
            <Input
              autocomplete="off"
              face="mono"
              id="mcp-url"
              placeholder={words.urlPlaceholder}
              spellcheck="false"
              bind:value={url}
            />
          </Field>
          <Choice
            label={words.transport}
            onchange={(next) => {
              transport = next as "http" | "sse";
            }}
            options={[
              { value: "http", label: words.transportHttp },
              { value: "sse", label: words.transportSse },
            ]}
            value={transport}
          />
        </div>
      {/if}
    </div>
  </EditorSection>

  {#if mode !== "bunx"}
    <!-- A bunx package takes neither: the section folds in and out (240 /
         160), and between headers and environment its lines cross-fade. -->
    <div in:unfold out:unfold>
      <EditorSection
        hue={HUE}
        icon={IconKey}
        label={mode === "remote" ? words.headers : words.environment}
      >
        <p data-slot="note" class="note"><Coded text={words.expanded} /></p>
        <div
          data-slot="kind"
          class="relative flex flex-col"
          {@attach morph({ ms: dur("--dur-pop") })}
        >
          {#if mode === "remote"}
            <div in:crossIn out:crossOut>
              <KeyValueRows
                keyPlaceholder={words.headerKey}
                legend={words.headers}
                valuePlaceholder={words.headerValue}
                bind:rows={headers}
              />
            </div>
          {:else}
            <div in:crossIn out:crossOut>
              <KeyValueRows
                keyPlaceholder={words.envKey}
                legend={words.environment}
                valuePlaceholder={words.envValue}
                bind:rows={env}
              />
            </div>
          {/if}
        </div>
      </EditorSection>
    </div>
  {/if}

  <EditorSection hue={HUE} icon={IconMapPoint} label={words.where}>
    <p data-slot="note" class="note">{words.whereNote}</p>
    <div>
      <PickerChip
        label={words.scope}
        onpick={(next) => {
          projectId = next;
        }}
        options={[
          { value: "", label: words.everyMachine },
          ...cawco.projects.map((project) => ({
            value: project.id,
            label: project.name,
          })),
        ]}
        value={projectId}
      />
    </div>
  </EditorSection>
</EditorFrame>
