<script lang="ts">
  /**
   * Where an account stands on each machine that runs its provider's
   * harnesses. A machine it is signed in on is its name and its ⋯ (Sign out
   * on this machine): a healthy row says nothing (The Idle Has No Fill
   * Rule). Any other row says what is wrong and carries its one action: Sign
   * in (Send key, for a key account), which opens a popover anchored to it
   * with that sign-in's panel for that machine; an offline machine only says
   * so. Word and action share one trailing column, at one x on every row.
   * The popovers are one surface (NsPopoverGroup), gliding from row to row.
   * Signed in, the check draws, holds for --dur-hold, and the popover puts
   * itself away.
   */
  import type { Account } from "@cawco/core";
  import { SvelteMap } from "svelte/reactivity";
  import { cawco, signOutOn } from "#lib/cawco/client.svelte.js";
  import RowMenu from "#lib/cawco/config/RowMenu.svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  import { IconLogout, IconWarningTriangle } from "#lib/icons.js";
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

  /** What a row says: nothing for a machine it is signed in on. */
  const WORDS = {
    "signed-out": "Not signed in",
    mismatch: "Signed in as someone else",
    offline: "Offline",
  } as const;
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
        <span class="trail">
          {#if shown !== "signed-in"}
            <span class="state" data-state={shown}>
              {#if shown === "mismatch"}
                <IconWarningTriangle aria-hidden="true" />
              {/if}
              {WORDS[shown]}
            </span>
          {/if}
          <span class="act">
            {#if online && (state !== "signed-in" || open)}
              <NsPopover
                align="end"
                id="signin-{account.id}-{machine.machineId}"
                label="{key ? "Send key" : "Sign in"} {nameOf(
                  account
                )} on {name}"
                onchange={(next) => setOpen(machine.machineId, next)}
                {open}
                triggerClass={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
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
                        flows.set(machine.machineId, {
                          kind: "key",
                          sent: true,
                        });
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
  /* Flat rows under hairlines, as the Accounts list draws its rows. One grid
     for every row (each row a subgrid of it): the trailing column, the word
     and its action, starts at one x on every row and ends on one edge. */
  .rows {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .mrow {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    column-gap: var(--space-4);
    min-height: var(--c-btn-h-lg);
    padding: var(--space-1) var(--space-2);
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
  .trail {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    min-width: 0;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
    transition: color var(--dur-panel) var(--ease-out);
  }
  .state[data-state="mismatch"] {
    color: var(--status-attn-ink);
  }
  .state :global(svg) {
    flex: none;
    width: 12px;
    height: 12px;
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
</style>
