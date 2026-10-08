<script lang="ts">
  /**
   * Where an account is signed in: one chip per machine with Claude Code.
   * Filled, it is signed in there; one whose login was moved in from that
   * machine's own Claude Code says so, and when, on hover. Hollow, it is a button opening the
   * sign-in popover. Signed in as somebody else, it is hollow in the warning
   * tint with a warning mark, and says so on hover. The popovers are one
   * surface (the NsPopoverGroup around the page's chips), so moving to
   * another chip glides it there.
   */
  import type { Account } from "@cawco/core";
  import { SvelteMap } from "svelte/reactivity";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconWarningTriangle } from "#lib/icons.js";
  import "../spawn/ns-theme.css";
  import {
    claudeMachines,
    machineName,
    machineOnline,
    nameOf,
    signinState,
  } from "./model.svelte";
  import SigninPanel from "./SigninPanel.svelte";
  import { SigninFlow } from "./signin.svelte";

  let { account }: { account: Account } = $props();

  const machines = $derived(claudeMachines());
  const signins = $derived(cawco.accounts?.signins ?? []);

  /** The chip whose popover is open, and its sign-in. */
  let openOn = $state<string | null>(null);
  const flows = new SvelteMap<string, SigninFlow>();

  function setOpen(machineId: string, open: boolean) {
    if (open) {
      flows.set(
        machineId,
        new SigninFlow(() => Promise.resolve(account.id), machineId)
      );
      openOn = machineId;
    } else if (openOn === machineId) {
      openOn = null;
    }
  }

  // Signed in: the popover says as whom, then puts itself away.
  $effect(() => {
    const on = openOn;
    if (on === null || flows.get(on)?.phase !== "signed-in") {
      return;
    }
    const timer = setTimeout(() => setOpen(on, false), dur("--dur-hold"));
    return () => clearTimeout(timer);
  });
</script>

<div class="chips">
  {#each machines as machine (machine.machineId)}
    {@const state = signinState(signins, account.id, machine.machineId)}
    {@const name = machineName(machine)}
    {@const open = openOn === machine.machineId}
    {@const flow = flows.get(machine.machineId)}
    {@const movedAt = signins.find(
      (one) =>
        one.accountId === account.id && one.machineId === machine.machineId
    )?.movedAt}
    {#if state === "signed-in" && !open}
      {#if movedAt}
        {@const moved = `Moved from Claude Code’s own login on ${name}, ${new Date(movedAt).toLocaleString()}`}
        <Tip label={moved}>
          {#snippet children(
            props
          )}
            <span {...props} class="mchip is-signed-in">
              <i aria-hidden="true" class="mark"></i>
              <span class="text">{name}</span>
              <span class="sr-only">, signed in. {moved}</span>
            </span>
          {/snippet}
        </Tip>
      {:else}
        <span class="mchip is-signed-in">
          <i aria-hidden="true" class="mark"></i>
          <span class="text">{name}</span>
          <span class="sr-only">, signed in</span>
        </span>
      {/if}
    {:else}
      {#snippet chip()}
        <NsPopover
          id="signin-{account.id}-{machine.machineId}"
          label="Sign in {nameOf(account)} on {name}"
          onchange={(next) => setOpen(machine.machineId, next)}
          {open}
          triggerClass="mchip is-{state}"
          width={320}
        >
          {#snippet trigger()}
            <span class="face">
              {#if state === "mismatch"}
                <IconWarningTriangle aria-hidden="true" />
              {:else}
                <i aria-hidden="true" class="mark"></i>
              {/if}
              <span class="text">{name}</span>
            </span>
          {/snippet}
          {#if flow}
            <SigninPanel
              expected={account.email}
              {flow}
              machine={name}
              online={machineOnline(machine)}
              title="Sign in {nameOf(account)} on {name}"
            />
          {/if}
        </NsPopover>
      {/snippet}
      {#if state === "mismatch"}
        <Tip label="Signed in as someone else on {name}. Sign in again.">
          {#snippet children(
            props
          )}
            <span {...props} class="tip">{@render chip()}</span>
          {/snippet}
        </Tip>
      {:else}
        {@render chip()}
      {/if}
    {/if}
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }
  .tip {
    display: inline-flex;
  }
  /* The chip: a 24px hollow control, filled where the account is signed in. */
  .chips :global(.mchip) {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    height: var(--c-btn-h-xs);
    padding: 0 var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: transparent;
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
    transition:
      background-color var(--dur-fade) var(--ease-out),
      color var(--dur-fade) var(--ease-out),
      border-color var(--dur-fade) var(--ease-out);
  }
  .chips :global(button.mchip) {
    cursor: pointer;
  }
  @media (hover: hover) and (pointer: fine) {
    .chips :global(button.mchip:hover) {
      background: var(--surface-hover);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .chips :global(button.mchip) {
      transition:
        background-color var(--dur-fade) var(--ease-out),
        color var(--dur-fade) var(--ease-out),
        border-color var(--dur-fade) var(--ease-out),
        transform var(--dur-control) var(--ease-out);
    }
    .chips :global(button.mchip:active) {
      transform: scale(var(--press-scale));
    }
  }
  .chips :global(button.mchip:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .chips :global(button.mchip[data-state="open"]) {
    background: var(--surface-hover);
  }
  .face {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mark {
    flex: none;
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--neutral-8);
    border-radius: 50%;
    transition:
      background-color var(--dur-fade) var(--ease-out),
      border-color var(--dur-fade) var(--ease-out);
  }
  .chips :global(.mchip.is-signed-in) {
    background: var(--surface-fill);
    color: var(--ink-row);
  }
  .chips :global(.mchip.is-signed-in .mark) {
    border-color: var(--presence-online);
    background: var(--presence-online);
  }
  /* Signed in as somebody else: hollow, in the warning tint, with its mark. */
  .chips :global(.mchip.is-mismatch) {
    border-color: var(--status-attn-glyph);
    background: var(--meter-wash-near);
    color: var(--status-attn-ink);
  }
  .face :global(svg) {
    flex: none;
    width: 12px;
    height: 12px;
  }
</style>
