<script lang="ts">
  import type { ToolPolicy, ToolSpec } from "@cawco/core";
  import { machineLabel } from "@cawco/core";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconCheck,
    IconExternal,
    IconTerminal,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { didntAnswer, type Machine } from "./client.svelte";
  import NoMachines from "./config/NoMachines.svelte";
  import { EMPTY_LINES } from "./empty-asks";
  import { machineOs } from "./machine";
  import OsMark from "./OsMark.svelte";
  import { installTool, policyFor, setPolicy } from "./tools";
  import { TRY_AGAIN } from "./unanswered";

  let {
    machines,
    catalog,
    policies,
  }: {
    machines: Machine[];
    catalog: ToolSpec[];
    policies: ToolPolicy[];
  } = $props();

  let written = $state<Record<string, ToolPolicy>>({});
  const policyOf = (spec: ToolSpec): ToolPolicy =>
    written[spec.id] ?? policyFor(policies, spec.id);
  let saving = $state<Record<string, boolean>>({});
  let asked = $state<Record<string, boolean>>({});
  /** Why a cell's last install request was refused: said in the cell. */
  let refused = $state<Record<string, string>>({});
  /** Why a column's Required switch did not save: said under it. */
  let policyRefused = $state<Record<string, string>>({});
  const cellKey = (machineId: string, toolId: string): string =>
    `${machineId}:${toolId}`;
  const installedOn = (spec: ToolSpec): number =>
    machines.filter(
      (machine) => machine.tools?.[spec.id]?.state === "installed"
    ).length;

  async function install(machine: Machine, spec: ToolSpec) {
    const key = cellKey(machine.machineId, spec.id);
    asked[key] = true;
    delete refused[key];
    try {
      const read = await installTool(
        machine.machineId,
        spec.id,
        policyOf(spec).pinnedVersion
      );
      switch (read.kind) {
        case "answered":
          break;
        case "unanswered":
          // The cell follows the hub's publish; this says the machine went quiet.
          refused[key] = didntAnswer(machine.machineId, read, {
            outcome: "whether the install finished is not known",
            again: TRY_AGAIN,
          });
          break;
        default: {
          const unhandled: never = read;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    } catch (err) {
      refused[key] = message(err);
    } finally {
      delete asked[key];
    }
  }

  async function requireEverywhere(spec: ToolSpec, required: boolean) {
    saving[spec.id] = true;
    delete policyRefused[spec.id];
    try {
      written[spec.id] = await setPolicy(spec.id, { required });
    } catch (err) {
      policyRefused[spec.id] = message(err);
    } finally {
      delete saving[spec.id];
    }
  }
</script>

{#snippet cell(machine: Machine, spec: ToolSpec, online: boolean)}
  {@const toolStatus = machine.tools?.[spec.id]}
  {@const pending = asked[cellKey(machine.machineId, spec.id)] === true}
  {@const shown = toolStatus?.state ?? "unknown"}
  {@const failed = cellKey(machine.machineId, spec.id) in refused}
  <!-- A copy there at a version CawCo doesn't run (older than its floor, or
       not its one version) is the probe's, and carries that version; an
       attempt that failed carries none (agent tools.ts). -->
  {@const outdated = toolStatus?.state === "failed" && !!toolStatus.version}

  {#if shown === "installed"}
    <!-- Installed is the quiet state: the check and the version in ink, no
         chip (DESIGN.md, The Idle Has No Fill Rule's quiet row). -->
    <span class="flex items-center gap-space-2">
      <span
        class="mark-line inline-flex items-center gap-space-1 text-ink-strong"
      >
        <IconCheck class="size-icon-md shrink-0 text-status-done-glyph" />
        <code data-slot="num" class="num type-code"
          >{toolStatus?.version ?? "—"}</code
        >
      </span>
      <span
        class="transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 hover-hover:opacity-0"
      >
        <Button
          disabled={!online}
          {failed}
          label="Reinstall"
          onclick={() => install(machine, spec)}
          {pending}
          pendingLabel="Installing…"
          size="xs"
          tone="muted"
          variant="ghost"
        />
      </span>
    </span>
  {:else if shown === "installing"}
    <Badge size="cell" tone="muted" variant="ghost">
      <Spinner class="shrink-0" />
      <span>Installing…</span>
    </Badge>
  {:else if shown === "missing"}
    <Button
      disabled={!online}
      {failed}
      label="Install"
      onclick={() => install(machine, spec)}
      {pending}
      pendingLabel="Installing…"
      size="xs"
      variant="outline"
    />
  {:else if shown === "failed"}
    <span class="flex items-center gap-space-1">
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Badge
              {...props}
              aria-label="Why {spec.name} {outdated
                ? `${toolStatus?.version} can't run`
                : 'did not install'} on {machineLabel(machine.hostname)}"
              size="cell"
              variant="destructive"
            >
              <IconWarningTriangle class="size-icon-sm shrink-0" />
              {#if outdated}
                <code data-slot="num" class="num type-code"
                  >{toolStatus?.version}</code
                >
              {:else}
                <span>Failed</span>
              {/if}
            </Badge>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content
          align="start"
          frame="panel-high"
          pad="none"
          width="widest"
        >
          <header
            class="flex items-baseline gap-space-1 border-b border-border-hairline px-space-3 py-space-2"
          >
            <span class="type-label text-ink-strong"
              >{spec.name}
              {outdated
                ? `${toolStatus?.version} isn't one CawCo runs`
                : "did not install"}</span
            >
            {#if toolStatus?.method}
              <code class="ml-auto shrink-0 type-code text-ink-muted"
                >{toolStatus.method}</code
              >
            {/if}
          </header>
          {#if toolStatus?.detail}
            <pre
              class="max-h-56 overflow-auto px-space-3 py-space-2 type-code whitespace-pre-wrap wrap-anywhere">{toolStatus.detail}</pre>
          {:else}
            <p class="px-space-3 py-space-2 type-body text-ink-muted">
              The machine did not say why.
            </p>
          {/if}
          <footer class="border-t border-border-hairline px-space-3 py-space-2">
            <Button
              disabled={!online}
              {failed}
              label={outdated ? "Update" : "Retry"}
              onclick={() => install(machine, spec)}
              {pending}
              pendingLabel={outdated ? "Updating…" : "Installing…"}
              size="xs"
              variant="outline"
            />
          </footer>
        </Popover.Content>
      </Popover.Root>
      <Button
        disabled={!online}
        {failed}
        label={outdated ? "Update" : "Retry"}
        onclick={() => install(machine, spec)}
        {pending}
        pendingLabel={outdated ? "Updating…" : "Installing…"}
        size="xs"
        tone="muted"
        variant="ghost"
      />
    </span>
  {:else if shown === "unsupported"}
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Badge
            {...props}
            aria-label="Why {spec.name} cannot run on {machineLabel(
              machine.hostname
            )}"
            size="cell"
            tone="muted"
            variant="ghost"
          >
            <span>Unsupported</span>
          </Badge>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="start" frame="panel-high" width="wide">
        <p class="type-body text-ink-strong">
          {toolStatus?.detail ?? "No install method for this platform."}
        </p>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <span class="flex items-center gap-space-1">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Badge {...props} size="cell" tone="subtle" variant="ghost"
              ><span>Unknown</span></Badge
            >
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>The daemon has not reported this tool</Tooltip.Content>
      </Tooltip.Root>
      <Button
        disabled={!online}
        {failed}
        label="Install"
        onclick={() => install(machine, spec)}
        {pending}
        pendingLabel="Installing…"
        size="xs"
        tone="muted"
        variant="ghost"
      />
    </span>
  {/if}
  <!-- An install the hub refused, in its words, in the cell it was asked in. -->
  <RowFault
    again={online ? () => install(machine, spec) : undefined}
    reason={refused[cellKey(machine.machineId, spec.id)]}
  />
{/snippet}

{#if catalog.length === 0}
  <!-- The catalog ships in the hub's build (core TOOL_CATALOG), so no
       session can fill it (The Empty Starts Work Rule's second sentence):
       the line says so, and the way by hand is updating the hub. -->
  <EmptyState
    icon={IconTerminal}
    line={EMPTY_LINES.cliTools}
    title="Nothing to install"
  >
    {#snippet action()}
      <Button href="/config/updates" label="Open Updates" variant="outline" />
    {/snippet}
  </EmptyState>
{:else if machines.length === 0}
  <NoMachines
    line="Tools install on your own machines, and none has joined this hub. Add one and it reports what it already has."
  />
{:else}
  <!-- One ledger per tool (DESIGN.md, ledger-header and ledger-row): its head
       names the tool, how many machines have it and whether every machine
       must; under it a 32px band and a 44px row per machine. Nothing
       scrolls sideways: under 640px each row is a card, the machine across
       its start and the tool's state at its end. An offline machine says so
       in words; its row keeps full ink. -->
  <div class="flex flex-col gap-space-6">
    {#each catalog as spec (spec.id)}
      {@const policy = policyOf(spec)}
      <section
        aria-labelledby="tool-{spec.id}"
        class="flex min-w-0 flex-col gap-space-2"
        data-tool={spec.id}
      >
        <header
          class="flex flex-wrap items-center justify-between gap-x-space-4 gap-y-space-2"
        >
          <span class="mark-line flex min-w-0 items-center gap-space-2">
            <h2 id="tool-{spec.id}" class="type-label text-ink-strong">
              {spec.name}
            </h2>
            <a data-box
              aria-label="{spec.name} homepage"
              class="pointer-hit touch-hit pressable text-ink-muted transition-colors hover:text-ink-strong"
              href={spec.homepage}
              rel="noreferrer"
              target="_blank"
              title={spec.homepage}
            >
              <IconExternal class="size-icon-sm" />
            </a>
            <span data-slot="num" class="num type-meta text-ink-muted"
              >{installedOn(spec)}/{machines.length} installed</span
            >
          </span>
          <label
            class="mark-line flex items-center gap-space-2 type-label text-ink-muted"
          >
            <Switch
              data-box
              checked={policy.required}
              disabled={saving[spec.id] === true}
              onCheckedChange={(next) => requireEverywhere(spec, next)}
              size="sm"
            />
            <span>Required on every machine</span>
          </label>
        </header>
        <RowFault
          again={() => requireEverywhere(spec, !policy.required)}
          reason={policyRefused[spec.id]}
        />
        <Table.Root
          layout="ledger"
          stacks="phone"
          style="--card-cols: minmax(0, 1fr) auto"
        >
          <Table.Header>
            <Table.Row variant="band">
              <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head scope="col" variant="band">Machine</Table.Head>
              <Table.Head class="w-c-matrix-col-w" scope="col" variant="band"
                >State</Table.Head
              >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each machines as machine (machine.machineId)}
              {@const os = machineOs(machine.os)}
              {@const online = machine.status === "online"}
              <Table.Row class="group/cell" variant="stacks">
                <Table.Cell variant="ledger-stacks">
                  <span class="flex min-w-0 items-center gap-space-2">
                    <OsMark
                      class="size-icon-md shrink-0 text-ink-muted"
                      os={machine.os}
                    />
                    <span class="flex min-w-0 flex-col">
                      <span
                        class="mark-line flex min-w-0 items-center gap-space-2"
                      >
                        <span
                          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
                          >{machineLabel(machine.hostname)}</span
                        >
                        <span
                          data-box
                          class="size-(--status-dot-size) shrink-0 rounded-pill {online
                            ? 'bg-presence-online'
                            : 'bg-presence-off'}"
                        ></span>
                      </span>
                      <span class="truncate type-meta text-ink-muted"
                        >{os.label}{online ? "" : " · offline"}</span
                      >
                    </span>
                  </span>
                </Table.Cell>
                <Table.Cell variant="ledger-stacks">
                  <div class="flex flex-col gap-space-1 whitespace-normal">
                    {@render cell(machine, spec, online)}
                  </div>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
    {/each}
  </div>
{/if}
