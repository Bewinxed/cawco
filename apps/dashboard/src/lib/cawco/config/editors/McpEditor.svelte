<script lang="ts">
  import type {
    FleetMcpConfigWrite,
    FleetMcpServerView,
  } from "@cawco/core/fleet-secrets";
  import { mcpWords as words } from "@cawco/core/words/mcp";
  import { untrack } from "svelte";
  import {
    appear,
    crossIn,
    crossOut,
    dur,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconKey, IconMapPoint, IconPlay } from "#lib/icons.js";
  import { page } from "$app/state";
  import Coded from "../../Coded.svelte";
  import { cawco } from "../../client.svelte";
  import {
    isRemoteMcp,
    mcpNameProblem,
    pairsToWrite,
    recordToPairs,
    saveMcpServer,
    splitArgs,
    suggestMcpName,
  } from "../../fleet";
  import KeyValueRows from "../../KeyValueRows.svelte";
  import Choice from "../Choice.svelte";
  import { deleteMcpServer } from "../deletes";
  import { keepDraft, sameFields } from "../drafts.svelte";
  import EditorFrame from "../EditorFrame.svelte";
  import EditorSection from "../EditorSection.svelte";
  import { EditorForm } from "../editor-form.svelte";
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
  let {
    server,
    taken,
  }: { server: FleetMcpServerView | null; taken: string[] } = $props();

  const store = configStore();
  const HUE = "var(--color-mark-6)";

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
  /**
   * The secrets the hub holds, as the last read named them: a held line that
   * is gone from the editor is cleared on save, one left empty is kept.
   */
  let heldEnv = $state(Object.keys(local?.env ?? {}));
  let heldHeaders = $state(Object.keys(remote?.headers ?? {}));
  /** The address carries a key the hub holds; `clearUrlKey` has it cleared on save. */
  let urlKeyHeld = $state(remote?.urlSecret !== undefined);
  let clearUrlKey = $state(false);
  /** One project's only (placed at its checkouts and workspaces); "" for every machine. */
  let projectId = $state(untrack(() => server?.projectId ?? ""));

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

  function build(): FleetMcpConfigWrite {
    if (mode === "remote") {
      const sent = pairsToWrite(headers, heldHeaders);
      return {
        type: transport,
        url: url.trim(),
        ...(Object.keys(sent).length > 0 ? { headers: sent } : {}),
        ...(urlKeyHeld && clearUrlKey ? { urlSecret: null } : {}),
      };
    }
    if (mode === "bunx") {
      return { command: "bunx", args: [pkg.trim(), ...splitArgs(pkgArgs)] };
    }
    const passed = pairsToWrite(env, heldEnv);
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
            // A secret is never kept through a reload: what is typed goes.
            env: env.map((row) => ({ ...row, value: "" })),
            url,
            transport,
            headers: headers.map((row) => ({ ...row, value: "" })),
            clearUrlKey,
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
        clearUrlKey,
        projectId,
      } = stored);
    }
  );
  const form = new EditorForm("/config/mcp", kept, store);

  /**
   * Saving a server keeps the editor open on it, the Save button saying so
   * in place. A new server, or a new name (which makes a new server),
   * shows the same, then returns to the list, where it is marked.
   */
  async function save() {
    await form.save(!nameProblem && filled, async () => {
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
      if (server?.name !== saved.name) {
        return saved.name;
      }
      // What was typed is in the hub now, and is no more shown: its lines
      // say set, as a read does.
      const { config } = saved;
      env = recordToPairs("env" in config ? config.env : undefined);
      headers = recordToPairs("headers" in config ? config.headers : undefined);
      heldEnv = Object.keys("env" in config ? (config.env ?? {}) : {});
      heldHeaders = Object.keys(
        "headers" in config ? (config.headers ?? {}) : {}
      );
      urlKeyHeld = "urlSecret" in config && config.urlSecret !== undefined;
      clearUrlKey = false;
      url = "url" in config ? config.url : url;
      baseline = { name: saved.name, config: build(), projectId };
      return null;
    });
  }

  async function remove() {
    if (!server) {
      return;
    }
    const removed = server.name;
    await form.remove((gone) => deleteMcpServer(store, removed, gone));
  }
</script>

<EditorFrame
  canSave={filled && nameProblem === undefined}
  deleteLabel={server ? words.remove : undefined}
  deleting={form.deleting}
  failed={form.failed !== undefined}
  oncancel={form.cancel}
  ondelete={server ? remove : undefined}
  onsubmit={save}
  saveLabel={server ? words.save : words.add}
  saving={form.busy}
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
      placeholder={words.namePlaceholder}
      bind:value={serverName}
    />
    {#if serverName !== "" && nameProblem}
      <p class="type-meta text-status-fail-ink" in:appear>{nameProblem}</p>
    {:else if server && serverName.trim() !== "" && serverName.trim() !== server.name}
      <!-- Said before Save, where the name is changed: that is its consequence. -->
      <p
        data-slot="note"
        class="type-meta max-w-c-measure text-ink-muted"
        in:appear
      >
        {words.renamed(server.name)}
      </p>
    {:else}
      <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
        <Coded text={words.callsAs(serverName || "name")} />
      </p>
    {/if}
    {#if form.failed}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>
        {form.failed}
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
         (--duration-control) in one box, whose height follows over --duration-pop on
         --ease-drawer. -->
    <div
      data-slot="kind"
      class="relative flex flex-col"
      {@attach morph({ ms: dur("--duration-pop") })}
    >
      {#if mode === "bunx"}
        <div
          data-slot="fold"
          class="flex flex-col gap-space-2"
          in:crossIn
          out:crossOut
        >
          <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
            {HOW.bunx}
          </p>
          <Field id="mcp-package" label={words.package}>
            <Input
              autocomplete="off"
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
        <div
          data-slot="fold"
          class="flex flex-col gap-space-2"
          in:crossIn
          out:crossOut
        >
          <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
            {HOW.command}
          </p>
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
        <div
          data-slot="fold"
          class="flex flex-col gap-space-2"
          in:crossIn
          out:crossOut
        >
          <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
            {HOW.remote}
          </p>
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
          {#if urlKeyHeld}
            <p
              data-slot="note"
              class="type-meta max-w-c-measure text-ink-muted"
            >
              {clearUrlKey ? words.urlKeyCleared : words.urlKeyHeld}
              <Button
                label={clearUrlKey ? words.urlKeyKeep : words.urlKeyClear}
                onclick={() => {
                  clearUrlKey = !clearUrlKey;
                }}
                pad="none"
                size="xs"
                tone="quiet"
                type="button"
                variant="link"
              />
            </p>
          {/if}
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
        <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
          <Coded text={words.expanded} />
        </p>
        <div
          data-slot="kind"
          class="relative flex flex-col"
          {@attach morph({ ms: dur("--duration-pop") })}
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
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      {words.whereNote}
    </p>
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
