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
  import { type Account, accountsWords as words } from "@cawco/core";
  import { SvelteMap } from "svelte/reactivity";
  import { cawco, signOutOn } from "#lib/cawco/client.svelte.js";
  import RowMenu from "#lib/cawco/config/RowMenu.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  import { IconLogout, IconWarningTriangle } from "#lib/icons.js";
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
  /** A row's one action: a key is sent, any other account signs in. */
  const verb = $derived(key ? words.machines.sendKey : words.machines.signIn);

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
      refusals.set(machineId, failureWords(error));
    }
  }

  /** What a row says: nothing for a machine it is signed in on. */
  const WORDS = words.machines.state;
</script>

<NsPopoverGroup>
  <!-- literal: minmax(0, 1fr) max-content -->
  <ul
    aria-label={words.editor.machines}
    class="m-0 grid grid-cols-(--rows-cols) list-none p-0"
    style:--rows-cols="minmax(0, 1fr) max-content"
    {@attach reflow()}
  >
    {#each machines as machine (machine.machineId)}
      {@const name = machineName(machine)}
      {@const online = machineOnline(machine)}
      {@const state = signinState(signins, account.id, machine.machineId)}
      {@const shown = online ? state : "offline"}
      {@const flow = flows.get(machine.machineId)}
      {@const open = openOn === machine.machineId}
      <li
        class="col-span-full grid min-h-c-btn-h-lg grid-cols-subgrid items-center gap-x-space-4 px-space-2 py-space-1 not-first:border-t not-first:border-border-hairline"
        data-flip
      >
        <span class="type-label truncate text-ink-strong">{name}</span>
        <span class="flex min-w-0 items-center justify-end gap-space-3">
          {#if shown !== "signed-in"}
            <span
              class="mark-line inline-flex items-center gap-space-1 type-meta whitespace-nowrap text-ink-muted transition-[color] dur-panel ease-out state-mismatch:text-status-attn-ink"
              data-state={shown}
            >
              {#if shown === "mismatch"}
                <IconWarningTriangle aria-hidden="true" class="size-icon-sm flex-none" />
              {/if}
              <span>{WORDS[shown]}</span>
            </span>
          {/if}
          <span class="flex min-w-0 justify-end">
            {#if online && (state !== "signed-in" || open)}
              <NsPopover
                align="end"
                id="signin-{account.id}-{machine.machineId}"
                label={words.machines.signInOn(verb, nameOf(account), name)}
                onchange={(next) => setOpen(machine.machineId, next)}
                {open}
                triggerClass={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
                width={340}
              >
                {#snippet trigger()}
                  {verb}
                {/snippet}
                <div class="flex flex-col gap-space-3 p-space-2">
                  <p data-slot="title" class="type-label text-ink-strong">{name}</p>
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
                    label: words.machines.signOut,
                    icon: IconLogout,
                    destructive: true,
                    onselect: () => signOut(machine.machineId),
                  },
                ]}
                label={words.machines.accountOn(nameOf(account), name)}
              />
            {/if}
          </span>
        </span>
        {#if refusals.get(machine.machineId)}
          <p
            data-slot="refused"
            class="col-span-full pb-space-2 type-meta text-status-fail-ink"
            data-flip
            role="alert"
          >
            {refusals.get(machine.machineId)}
          </p>
        {/if}
      </li>
    {:else}
      <li class="col-span-full px-space-4 py-space-3 type-meta text-ink-muted">{words.machines.none}</li>
    {/each}
  </ul>
</NsPopoverGroup>
