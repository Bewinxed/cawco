<script lang="ts">
  import { type FleetMcpServer, machineLabel } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { IconKey } from "#lib/icons.js";
  import { cawco, type Machine } from "../client.svelte.js";
  import { startMcpSignIn } from "../fleet.js";
  import Field from "./Field.svelte";

  let { server }: { server: FleetMcpServer } = $props();
  let open = $state(false);
  let machines = $state<Machine[]>([]);
  let selected = $state("");
  let approving = $state<string | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  let problem = $state<string | null>(null);
  const signedIn = $derived(server.auth?.state === "signed-in");
  const eligible = $derived(
    machines.filter((machine) =>
      cawco.machines.some(
        (live) =>
          live.machineId === machine.machineId &&
          live.status === "online" &&
          live.browserAvailable
      )
    )
  );

  async function show() {
    open = true;
    approving = null;
    loading = true;
    problem = null;
    try {
      const response = await fetch(
        `/api/fleet/mcp/${encodeURIComponent(server.name)}/sign-in-machines`
      );
      if (!response.ok) {
        throw new Error(
          "The hub could not read available computers. Close this sheet and retry sign-in."
        );
      }
      const result = (await response.json()) as {
        machines: Machine[];
        selectedMachineId: string | null;
      };
      ({ machines } = result);
      selected = result.selectedMachineId ?? "";
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
    }
  }

  async function signIn() {
    busy = true;
    problem = null;
    approving = machineLabel(
      eligible.find((machine) => machine.machineId === selected)?.hostname ??
        selected
    );
    try {
      await startMcpSignIn(server.name, selected);
    } catch (error) {
      approving = null;
      problem = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

{#if server.auth?.mode === "oauth"}
  {#if signedIn}
    <span class="state" role="status">Signed in for the fleet</span>
  {:else}
    <Button
      disabled={!server.enabled}
      icon={IconKey}
      label="Sign in"
      onclick={show}
      size="sm"
      variant="outline"
    />
  {/if}
  <Sheet.Root bind:open>
    <Sheet.Content class="gap-[var(--space-4)] p-[var(--space-6)]">
      <Sheet.Header>
        <Sheet.Title>Sign in to {server.name}</Sheet.Title>
        <Sheet.Description
          >One sign-in gives every supported agent in the fleet
          access.</Sheet.Description
        >
      </Sheet.Header>
      {#if signedIn}
        <p class="state" role="status">Signed in for the whole fleet.</p>
      {:else if approving}
        <p role="status">Approve on {approving}.</p>
      {:else if loading}
        <p role="status">Reading available computers…</p>
      {:else if eligible.length === 0}
        <p>
          No online computer can open a desktop browser. Start CawCo in a
          desktop session, then retry sign-in.
        </p>
      {:else}
        <Field id="mcp-sign-in-machine" label="Open on">
          <select class="picker" id="mcp-sign-in-machine" bind:value={selected}>
            <option disabled value="">Pick a computer</option>
            {#each eligible as machine (machine.machineId)}
              <option value={machine.machineId}>
                {machineLabel(machine.hostname)}
              </option>
            {/each}
          </select>
        </Field>
        <Button
          disabled={!eligible.some((machine) => machine.machineId === selected)}
          icon={IconKey}
          label="Sign in"
          onclick={signIn}
          pending={busy}
          pendingLabel="Opening browser…"
        />
      {/if}
      {#if problem}
        <p class="problem" role="alert">{problem}</p>
      {/if}
    </Sheet.Content>
  </Sheet.Root>
{/if}

<style>
  .state {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-body);
    color: var(--status-fail-ink);
  }
  .picker {
    min-height: var(--c-input-h);
    padding: var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-body);
  }
  @media (pointer: coarse) {
    .picker {
      min-height: var(--c-btn-h-lg);
    }
  }
</style>
