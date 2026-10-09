<script lang="ts">
  /**
   * Where an account stands on each machine that runs its provider's
   * harnesses: the machine, then a dot and a word. A machine it isn't signed
   * in on carries Sign in (Send key, for a key account), which opens a
   * popover anchored to it with that sign-in's panel for that machine; the
   * popovers are one surface (NsPopoverGroup), gliding from row to row.
   * Signed in, the check draws, holds for --dur-hold, and the popover puts
   * itself away.
   */
  import type { Account, SigninState } from "@cawco/core";
  import { SvelteMap } from "svelte/reactivity";
  import { cawco, signOutOn } from "#lib/cawco/client.svelte.js";
  import RowMenu from "#lib/cawco/config/RowMenu.svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  import { IconLogout } from "#lib/icons.js";
  import "../spawn/ns-theme.css";
  import DevicePanel from "./DevicePanel.svelte";
  import { DeviceFlow } from "./device.svelte";
  import KeyPanel from "./KeyPanel.svelte";
  import {
    machineName,
    machineOnline,
    machinesFor,
    nameOf,
    signinState,
  } from "./model.svelte";
  import SigninPanel from "./SigninPanel.svelte";
  import { SigninFlow } from "./signin.svelte";

  let { account }: { account: Account } = $props();

  const machines = $derived(machinesFor(account.provider));
  const signins = $derived(cawco.accounts?.signins ?? []);
  const claude = $derived(account.provider === "anthropic");
  const key = $derived(account.kind === "api_key");

  type Flow =
    | { kind: "paste"; flow: SigninFlow }
    | { kind: "device"; flow: DeviceFlow }
    | { kind: "key"; sent: boolean };

  /** The row whose popover is open, and its sign-in. */
  let openOn = $state<string | null>(null);
  const flows = new SvelteMap<string, Flow>();

  function setOpen(machineId: string, open: boolean) {
    if (open) {
      const own = () => Promise.resolve(account.id);
      let flow: Flow;
      if (claude) {
        flow = { kind: "paste", flow: new SigninFlow(own, machineId) };
      } else if (key) {
        flow = { kind: "key", sent: false };
      } else {
        flow = { kind: "device", flow: new DeviceFlow(own, machineId) };
      }
      flows.set(machineId, flow);
      openOn = machineId;
    } else if (openOn === machineId) {
      const flow = flows.get(machineId);
      if (flow?.kind === "device") {
        flow.flow.dispose();
      }
      openOn = null;
    }
  }

  const landed = (flow: Flow | undefined): boolean => {
    if (!flow) {
      return false;
    }
    return flow.kind === "key" ? flow.sent : flow.flow.phase === "signed-in";
  };

  // Signed in: the check draws and holds, then the popover goes.
  $effect(() => {
    const on = openOn;
    if (on === null || !landed(flows.get(on))) {
      return;
    }
    const timer = setTimeout(() => setOpen(on, false), dur("--dur-hold"));
    return () => clearTimeout(timer);
  });

  /** Why a sign-out was refused, by machine, in the hub's words. */
  const refusals = new SvelteMap<string, string>();

  async function signOut(machineId: string) {
    refusals.delete(machineId);
    try {
      await signOutOn(account.id, machineId);
    } catch (error) {
      refusals.set(
        machineId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  const WORDS: Record<SigninState | "offline", string> = {
    "signed-in": "Signed in",
    "signed-out": "Not signed in",
    mismatch: "Signed in as someone else",
    offline: "Offline",
  };
</script>

<NsPopoverGroup>
  <ul aria-label="Machines" class="rows" {@attach reflow()}>
    {#each machines as machine (machine.machineId)}
      {@const name = machineName(machine)}
      {@const online = machineOnline(machine)}
      {@const state = signinState(signins, account.id, machine.machineId)}
      {@const shown = online ? state : "offline"}
      {@const flow = flows.get(machine.machineId)}
      {@const open = openOn === machine.machineId}
      <li class="mrow" data-flip>
        <span class="mname">{name}</span>
        <span class="state" data-state={shown}>
          <i aria-hidden="true" class="dot"></i>
          {WORDS[shown]}
        </span>
        <span class="act">
          {#if online && (state !== "signed-in" || open)}
            <NsPopover
              align="end"
              id="signin-{account.id}-{machine.machineId}"
              label="{key ? "Send key" : "Sign in"} {nameOf(account)} on {name}"
              onchange={(next) => setOpen(machine.machineId, next)}
              {open}
              triggerClass={buttonVariants({ variant: "outline", size: "sm" })}
              width={340}
            >
              {#snippet trigger()}
                {key ? "Send key" : "Sign in"}
              {/snippet}
              <div class="panel">
                <p class="title">{name}</p>
                {#if flow?.kind === "paste"}
                  <SigninPanel
                    expected={account.email}
                    flow={flow.flow}
                    machine={name}
                    {online}
                  />
                {:else if flow?.kind === "device"}
                  <DevicePanel flow={flow.flow} machine={name} {online} />
                {:else if flow?.kind === "key"}
                  <KeyPanel
                    account={() => Promise.resolve(account.id)}
                    machines={[machine]}
                    onsent={() => {
                      flows.set(machine.machineId, { kind: "key", sent: true });
                    }}
                  />
                {/if}
              </div>
            </NsPopover>
          {:else if online && state === "signed-in"}
            <RowMenu
              actions={[
                {
                  label: "Sign out on this machine",
                  icon: IconLogout,
                  destructive: true,
                  onselect: () => signOut(machine.machineId),
                },
              ]}
              label="{nameOf(account)} on {name}"
            />
          {/if}
        </span>
        {#if refusals.get(machine.machineId)}
          <p class="refused" data-flip role="alert">
            {refusals.get(machine.machineId)}
          </p>
        {/if}
      </li>
    {:else}
      <li class="none">No machine runs this account's agents yet.</li>
    {/each}
  </ul>
</NsPopoverGroup>

<style>
  /* One grid for every row (each row a subgrid of it), so the states stand
     in one column and the actions end on one edge, whatever each row's
     action is. */
  .rows {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content max-content;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg);
  }
  .mrow {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    column-gap: var(--space-4);
    min-height: var(--c-btn-h-lg);
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
  }
  .mrow + .mrow {
    border-block-start: 1px solid var(--border-hairline);
  }
  .mname {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
    transition: color var(--dur-panel) var(--ease-out);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--neutral-8);
    transition:
      background-color var(--dur-panel) var(--ease-out),
      box-shadow var(--dur-panel) var(--ease-out);
  }
  .state[data-state="signed-in"] {
    color: var(--ink-row);
  }
  .state[data-state="signed-in"] .dot {
    background: var(--presence-online);
  }
  .state[data-state="mismatch"] {
    color: var(--status-attn-ink);
  }
  .state[data-state="mismatch"] .dot {
    background: var(--status-attn-glyph);
  }
  /* Offline is hollow, as an unreachable machine is everywhere else. */
  .state[data-state="offline"] .dot {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--neutral-8);
  }
  .act {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .refused {
    grid-column: 1 / -1;
    padding-block-end: var(--space-2);
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .none {
    grid-column: 1 / -1;
    padding: var(--space-3) var(--space-4);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* A phone: the state under the machine's name, the action at the end. */
  @media (max-width: 640px) {
    .rows {
      grid-template-columns: minmax(0, 1fr) max-content;
    }
    .mrow {
      grid-template-areas:
        "name act"
        "state act"
        "refused refused";
      row-gap: 2px;
    }
    .mname {
      grid-area: name;
    }
    .state {
      grid-area: state;
    }
    /* At the row's foot: the popover opens under its trigger, so it then
       opens under the row, never over the state line. */
    .act {
      grid-area: act;
      align-self: end;
    }
    .refused {
      grid-area: refused;
    }
  }
</style>
