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
    IconLaptop,
    IconServer,
    IconTerminal,
  } from "#lib/icons.js";
  import { didntAnswer, type Machine } from "./client.svelte";
  import { addMachine } from "./join/join.svelte";
  import { machineOs } from "./machine";
  import OsMark from "./OsMark.svelte";
  import { installTool, policyFor, setPolicy } from "./tools";

  let {
    machines,
    catalog,
    policies,
  }: {
    machines: Machine[];
    catalog: ToolSpec[];
    policies: ToolPolicy[];
  } = $props();

  const columns = $derived(catalog.filter((spec) => !spec.dependencyOnly));
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
          refused[key] = didntAnswer(
            machine.machineId,
            read,
            "whether the install finished is not known"
          );
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

  {#if shown === "installed"}
    <span class="flex items-center gap-space-1">
      <Badge class="h-auto" size="cell" tone="success" variant="ghost">
        <IconCheck class="size-icon-md shrink-0" />
        <span data-slot="num" class="num font-(family-name:--font-mono)"
          >{toolStatus?.version ?? "—"}</span
        >
      </Badge>
      <span
        class="transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 min-[48rem]:opacity-0"
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
    <Badge class="h-auto" size="cell" tone="muted" variant="ghost">
      <Spinner class="size-icon-md shrink-0" />
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
              aria-label="Why {spec.name} did not install on {machineLabel(
                machine.hostname
              )}"
              class="h-auto cursor-pointer"
              size="cell"
              variant="destructive"
            >
              <span class="size-2 shrink-0 rounded-full bg-error-9" data-box
              ></span>
              <span>Failed</span>
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
            class="flex items-baseline gap-space-1 border-b border-border px-space-3 py-space-2"
          >
            <span class="text-label text-ink-strong"
              >{spec.name}
              did not install</span
            >
            {#if toolStatus?.method}
              <span
                class="ml-auto shrink-0 font-(family-name:--font-mono) text-label text-ink-muted"
                >{toolStatus.method}</span
              >
            {/if}
          </header>
          <pre
            class="max-h-56 overflow-auto px-space-3 py-space-2 font-mono text-label whitespace-pre-wrap">{toolStatus?.detail ??
              "The machine did not say why."}</pre>
          <footer class="border-t border-border px-space-3 py-space-2">
            <Button
              disabled={!online}
              {failed}
              label="Retry"
              onclick={() => install(machine, spec)}
              {pending}
              pendingLabel="Installing…"
              size="xs"
              variant="outline"
            />
          </footer>
        </Popover.Content>
      </Popover.Root>
      <Button
        disabled={!online}
        {failed}
        label="Retry"
        onclick={() => install(machine, spec)}
        {pending}
        pendingLabel="Installing…"
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
            class="h-auto cursor-pointer"
            size="cell"
            tone="muted"
            variant="ghost"
          >
            <span>Unsupported</span>
          </Badge>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="start" frame="panel-high" width="wide">
        <p class="font-(family-name:--font-mono) text-label">
          {toolStatus?.detail ?? "no install method for this platform"}
        </p>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <span class="flex items-center gap-space-1">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Badge
              {...props}
              class="h-auto"
              size="cell"
              tone="subtle"
              variant="ghost"><span>Unknown</span></Badge
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

{#if columns.length === 0}
  <EmptyState
    icon={IconTerminal}
    line="The hub's catalog is empty, so there is nothing to install yet."
    title="Nothing to install"
  />
{:else if machines.length === 0}
  <EmptyState
    icon={IconLaptop}
    line="Tools install on your own machines, and none has joined this hub. Add one and it reports what it already has."
    title="No machines yet"
  >
    {#snippet action()}
      <Button onclick={() => addMachine.show()}>
        <IconServer />
        <span>Add machine</span>
      </Button>
    {/snippet}
  </EmptyState>
{:else}
  <!-- The matrix scrolls sideways inside the section; the page never does. -->
  <div
    class="overflow-x-auto rounded-md bg-surface-raised inset-ring inset-ring-border-hairline"
  >
    <Table.Root class="border-collapse text-left">
      <Table.Header>
        <Table.Row class="align-top">
          <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          <Table.Head
            class="sticky z-10 h-auto"
            scope="col"
            variant="matrix-corner-pinned">Machine</Table.Head
          >
          <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          {#each columns as spec (spec.id)}
            {@const policy = policyOf(spec)}
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              class="h-auto whitespace-normal"
              scope="col"
              variant="matrix-column-wide-plain"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <div class="flex flex-col items-start gap-space-2">
                <span class="mark-line flex items-center gap-1.5">
                  <span class="text-label text-ink-strong">{spec.name}</span>
                  <a
                    data-box
                    aria-label="{spec.name} homepage"
                    class="pointer-hit pressable text-ink-muted transition-colors hover:text-ink-strong"
                    href={spec.homepage}
                    rel="noreferrer"
                    target="_blank"
                    title={spec.homepage}
                  >
                    <IconExternal class="size-icon-sm" />
                  </a>
                </span>
                <span data-slot="num" class="num text-meta text-ink-muted"
                  >{installedOn(spec)}/{machines.length}
                  installed</span
                >
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch is a bits-ui button[role=switch], which the label-click passthrough this markup relies on already recognizes as labelable — swapping to a `for`/id pairing would drop nothing biome can see but would change nothing real either. -->
                <label
                  class="flex items-center gap-space-2 text-label text-ink-muted"
                >
                  <Switch
                    checked={policy.required}
                    disabled={saving[spec.id] === true}
                    onCheckedChange={(next) => requireEverywhere(spec, next)}
                    size="sm"
                  />
                  Required on every machine
                </label>
                <RowFault
                  again={() => requireEverywhere(spec, !policy.required)}
                  reason={policyRefused[spec.id]}
                />
              </div>
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each machines as machine (machine.machineId)}
          {@const os = machineOs(machine.os)}
          {@const online = machine.status === "online"}
          <Table.Row inactive={!online}>
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              class="sticky z-10 h-auto"
              scope="row"
              variant="matrix-row-pinned"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <span class="flex items-center gap-space-2">
                <OsMark
                  class="size-icon-md shrink-0 text-ink-muted"
                  os={machine.os}
                />
                <span class="flex min-w-0 flex-col">
                  <span class="flex items-center gap-space-2">
                    <span class="truncate text-label text-ink-strong"
                      >{machineLabel(machine.hostname)}</span
                    >
                    <span
                      class="size-2 shrink-0 rounded-full {online
                        ? 'bg-success-9'
                        : 'bg-ink-muted/40'}"
                    ></span>
                  </span>
                  <span class="text-label text-ink-muted"
                    >{os.label}{online ? "" : " · offline"}</span
                  >
                </span>
              </span>
            </Table.Head>
            {#each columns as spec (spec.id)}
              <Table.Cell class="group/cell whitespace-normal" variant="matrix">
                {@render cell(machine, spec, online)}
              </Table.Cell>
            {/each}
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}
