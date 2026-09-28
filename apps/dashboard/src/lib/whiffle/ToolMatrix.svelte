<script lang="ts">
  import type { ToolPolicy, ToolSpec } from "@whiffle/core";
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { EmptyState } from "$lib/components/ui/empty";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Popover from "$lib/components/ui/popover";
  import { Switch } from "$lib/components/ui/switch";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "$lib/components/ui/table";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Tooltip from "$lib/components/ui/tooltip";
  import {
    IconCheck,
    IconExternal,
    IconLaptop,
    IconSpinner,
    IconTerminal,
  } from "$lib/icons";
  import type { Machine } from "./client.svelte";
  import { machineLabel, machineOs } from "./machine";
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

  const CHIP = "h-auto min-h-6 gap-1.5 px-2";
  const columns = $derived(catalog.filter((spec) => !spec.dependencyOnly));
  let written = $state<Record<string, ToolPolicy>>({});
  const policyOf = (spec: ToolSpec): ToolPolicy =>
    written[spec.id] ?? policyFor(policies, spec.id);
  let saving = $state<Record<string, boolean>>({});
  let asked = $state<Record<string, boolean>>({});
  const cellKey = (machineId: string, toolId: string): string =>
    `${machineId}:${toolId}`;
  const installedOn = (spec: ToolSpec): number =>
    machines.filter(
      (machine) => machine.tools?.[spec.id]?.state === "installed"
    ).length;
  const message = (err: unknown) =>
    err instanceof Error ? err.message : String(err);

  async function install(machine: Machine, spec: ToolSpec) {
    const key = cellKey(machine.machineId, spec.id);
    asked[key] = true;
    try {
      await installTool(
        machine.machineId,
        spec.id,
        policyOf(spec).pinnedVersion
      );
    } catch (err) {
      toast.error(
        `${spec.name} on ${machineLabel(machine.hostname)}: ${message(err)}`
      );
    } finally {
      delete asked[key];
    }
  }

  async function requireEverywhere(spec: ToolSpec, required: boolean) {
    saving[spec.id] = true;
    try {
      written[spec.id] = await setPolicy(spec.id, { required });
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete saving[spec.id];
    }
  }
</script>

{#snippet cell(machine: Machine, spec: ToolSpec, online: boolean)}
  {@const toolStatus = machine.tools?.[spec.id]}
  {@const pending = asked[cellKey(machine.machineId, spec.id)] === true}
  {@const shown = pending ? 'installing' : (toolStatus?.state ?? 'unknown')}

  {#if shown === 'installed'}
    <span class="flex items-center gap-[var(--space-1)]">
      <Badge class="{CHIP} text-success" variant="ghost">
        <IconCheck class="size-4 shrink-0" />
        <span class="num font-mono">{toolStatus?.version ?? '—'}</span>
      </Badge>
      <span
        class="transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 md:opacity-0"
      >
        <Button
          class="text-muted-foreground"
          disabled={!online}
          onclick={() => install(machine, spec)}
          size="xs"
          variant="ghost"
        >
          Reinstall
        </Button>
      </span>
    </span>
  {:else if shown === 'installing'}
    <Badge class="{CHIP} text-muted-foreground" variant="ghost">
      <IconSpinner class="size-4 shrink-0 animate-spin" />
      Installing…
    </Badge>
  {:else if shown === 'missing'}
    <Button
      disabled={!online}
      onclick={() => install(machine, spec)}
      size="xs"
      variant="outline"
      >Install</Button
    >
  {:else if shown === 'failed'}
    <span class="flex items-center gap-[var(--space-1)]">
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Badge
              {...props}
              aria-label="Why {spec.name} did not install on {machineLabel(machine.hostname)}"
              class="{CHIP} cursor-pointer"
              variant="destructive"
            >
              <span class="size-2 shrink-0 rounded-full bg-error"></span>
              Failed
            </Badge>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content
          align="start"
          class="w-96 rounded-[var(--radius-lg)] p-0 shadow-xl"
        >
          <header
            class="flex items-baseline gap-[var(--space-1)] border-b border-border px-[var(--space-3)] py-[var(--space-2)]"
          >
            <span class="text-label text-foreground"
              >{spec.name}
              did not install</span
            >
            {#if toolStatus?.method}
              <span
                class="ml-auto shrink-0 font-mono text-label text-muted-foreground"
                >{toolStatus.method}</span
              >
            {/if}
          </header>
          <pre
            class="max-h-56 overflow-auto px-[var(--space-3)] py-[var(--space-2)] font-mono text-label whitespace-pre-wrap"
          >{toolStatus?.detail ?? 'The machine did not say why.'}</pre>
          <footer
            class="border-t border-border px-[var(--space-3)] py-[var(--space-2)]"
          >
            <Button
              disabled={!online}
              onclick={() => install(machine, spec)}
              size="xs"
              variant="outline"
              >Retry</Button
            >
          </footer>
        </Popover.Content>
      </Popover.Root>
      <Button
        class="text-muted-foreground"
        disabled={!online}
        onclick={() => install(machine, spec)}
        size="xs"
        variant="ghost"
        >Retry</Button
      >
    </span>
  {:else if shown === 'unsupported'}
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Badge
            {...props}
            aria-label="Why {spec.name} cannot run on {machineLabel(machine.hostname)}"
            class="{CHIP} cursor-pointer text-muted-foreground"
            variant="ghost"
          >
            Unsupported
          </Badge>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content
        align="start"
        class="w-80 rounded-[var(--radius-lg)] shadow-xl"
      >
        <p class="font-mono text-label">
          {toolStatus?.detail ?? 'no install method for this platform'}
        </p>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <span class="flex items-center gap-[var(--space-1)]">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Badge
              {...props}
              class="{CHIP} text-[var(--ink-subtle)]"
              variant="ghost"
              >Unknown</Badge
            >
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>The daemon has not reported this tool</Tooltip.Content>
      </Tooltip.Root>
      <Button
        class="text-muted-foreground"
        disabled={!online}
        onclick={() => install(machine, spec)}
        size="xs"
        variant="ghost"
        >Install</Button
      >
    </span>
  {/if}
{/snippet}

{#if columns.length === 0}
  <EmptyState
    icon={IconTerminal}
    line="The hub's catalog is empty, so there is nothing to install yet."
    title="Nothing to install"
  />
{:else if machines.length === 0}
  <EmptyState icon={IconLaptop} title="No machines yet">
    {#snippet line()}
      Tools install on your own machines, and none has registered with this hub.
      Run <code>WHIFFLE_HUB_URL=ws://&lt;this-host&gt;:3456/ws whiffle up</code>
      on one and it reports what it already has.
    {/snippet}
  </EmptyState>
{:else}
  <div class="matrix">
    <Table.Root class="border-collapse text-left">
      <Table.Header>
        <Table.Row class="align-top">
          <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          <Table.Head
            class="sticky left-0 z-10 h-auto bg-[var(--surface-raised)] px-[var(--space-4)] py-[var(--space-3)] text-meta text-muted-foreground"
            scope="col"
            >Machine</Table.Head
          >
          <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
          {#each columns as spec (spec.id)}
            {@const policy = policyOf(spec)}
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              class="h-auto min-w-56 border-l border-border px-[var(--space-4)] py-[var(--space-3)] whitespace-normal"
              scope="col"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <div class="flex flex-col items-start gap-[var(--space-2)]">
                <span class="flex items-center gap-1.5">
                  <span class="text-label text-foreground">{spec.name}</span>
                  <a
                    aria-label="{spec.name} homepage"
                    class="pointer-hit pressable text-muted-foreground transition-colors hover:text-foreground"
                    href={spec.homepage}
                    rel="noreferrer"
                    target="_blank"
                    title={spec.homepage}
                  >
                    <IconExternal class="size-3" />
                  </a>
                </span>
                <span class="num text-meta text-muted-foreground"
                  >{installedOn(spec)}/{machines.length}
                  installed</span
                >
                <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch is a bits-ui button[role=switch], which the label-click passthrough this markup relies on already recognizes as labelable — swapping to a `for`/id pairing would drop nothing biome can see but would change nothing real either. -->
                <label
                  class="flex items-center gap-[var(--space-2)] text-label text-muted-foreground"
                >
                  <Switch
                    checked={policy.required}
                    disabled={saving[spec.id] === true}
                    onCheckedChange={(next) => requireEverywhere(spec, next)}
                    size="sm"
                  />
                  Required on every machine
                </label>
              </div>
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each machines as machine (machine.machineId)}
          {@const os = machineOs(machine.os)}
          {@const online = machine.status === 'online'}
          <Table.Row class={online ? '' : 'opacity-50'}>
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head
              class="sticky left-0 z-10 h-auto bg-[var(--surface-raised)] px-[var(--space-4)] py-[var(--space-2)]"
              scope="row"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <span class="flex items-center gap-[var(--space-2)]">
                <OsMark
                  class="size-4 shrink-0 text-muted-foreground"
                  os={machine.os}
                />
                <span class="flex min-w-0 flex-col">
                  <span class="flex items-center gap-[var(--space-2)]">
                    <span class="truncate text-label text-foreground"
                      >{machineLabel(machine.hostname)}</span
                    >
                    <span
                      class="size-2 shrink-0 rounded-full {online ? 'bg-success' : 'bg-muted-foreground/40'}"
                    ></span>
                  </span>
                  <span class="text-label text-muted-foreground"
                    >{os.label}{online ? '' : ' · offline'}</span
                  >
                </span>
              </span>
            </Table.Head>
            {#each columns as spec (spec.id)}
              <Table.Cell
                class="group/cell border-l border-border px-[var(--space-4)] py-[var(--space-2)] whitespace-normal"
              >
                {@render cell(machine, spec, online)}
              </Table.Cell>
            {/each}
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}

<style>
  /* The matrix scrolls sideways inside the section; the page never does. */
  .matrix {
    overflow-x: auto;
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
</style>
