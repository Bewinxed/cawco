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
   *
   * A sign-in outlives its popover (DESIGN.md, The Work Outlives Its
   * Surface Rule): put away, the row says it is waiting on a code (a device
   * code's wait goes on) and its button reads Open sign-in, which opens the
   * same link or code again; a refusal stays said on the row. A reload opens
   * the popover again, on the link or code the hub kept.
   *
   * A machine whose Claude Code CawCo refuses (too old, or none) offers no
   * sign-in that can't succeed: the popover holds why and Update Claude Code
   * in its place (HarnessBlock), the row says so, and an update in flight
   * parks on the row. Once it lands the popover offers the sign-in, saying
   * which Claude Code is there now.
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
  import { TabDraft } from "#lib/cawco/tab-draft.svelte.js";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  import { IconLogout, IconWarningTriangle } from "#lib/icons.js";
  import HarnessBlock from "../HarnessBlock.svelte";
  import {
    harnessWords as blockWords,
    harnessBlockOf,
    landedOn,
    settleHarness,
  } from "../harness-block.svelte";
  import Check from "./Check.svelte";
  import DevicePanel from "./DevicePanel.svelte";
  import { DeviceFlow } from "./device.svelte";
  import {
    deviceFlow,
    dropFlow,
    flowKey,
    heldFlow,
    pasteFlow,
    pendingOf,
  } from "./flows.svelte";
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

  /**
   * The row whose popover is open, kept in this tab: a reload opens it
   * again on the same sign-in (The Work Outlives Its Surface Rule).
   */
  const shown = new TabDraft("cawco:account-signin", () => ({
    on: null as string | null,
  }));
  const openOn = $derived(
    shown.value.on?.startsWith(`${account.id}:`)
      ? shown.value.on.slice(account.id.length + 1)
      : null
  );
  /** A key sent from a row's popover, by machine; a key is never kept. */
  const sent = new SvelteMap<string, boolean>();

  const own = () => Promise.resolve(account.id);

  /**
   * The row's sign-in: the one under way for the account on that machine,
   * kept while its popover is put away (flows.svelte.ts), or a new one.
   */
  function flowOn(machineId: string): SigninFlow | DeviceFlow {
    const at = flowKey(account.id, machineId);
    return claude
      ? pasteFlow(at, own, machineId, account.id)
      : deviceFlow(at, own, machineId, account.id);
  }

  /**
   * Opening draws the row's sign-in, the same one if it is under way; ×,
   * Esc or a press outside put the popover away and leave the sign-in going,
   * said on its row. One that landed is let go.
   */
  function setOpen(machineId: string, open: boolean) {
    if (open) {
      if (!key) {
        flowOn(machineId);
      }
      sent.delete(machineId);
      shown.value.on = flowKey(account.id, machineId);
    } else if (openOn === machineId) {
      shown.value.on = null;
      const flow = heldFlow(flowKey(account.id, machineId));
      if (flow && !flow.live) {
        dropFlow(flowKey(account.id, machineId));
      }
    }
  }

  // A popover a reload opened again draws its sign-in, taken up from the
  // hub where it was under way.
  $effect(() => {
    if (openOn !== null && !key) {
      flowOn(openOn);
    }
  });

  // The accounts read after a flow was made: an idle one takes up the
  // sign-in the hub says is under way.
  $effect(() => {
    for (const machine of machines) {
      heldFlow(flowKey(account.id, machine.machineId))?.resume(
        pendingOf(account.id, machine.machineId)
      );
    }
  });

  const landed = (machineId: string): boolean =>
    key
      ? sent.get(machineId) === true
      : heldFlow(flowKey(account.id, machineId))?.phase === "signed-in";

  // Signed in: the check draws and holds, then the popover goes, and the
  // Claude Code this tab brought up there, having done its work, is said no
  // more. Both are written once the hold is over, outside the effect:
  // `settleHarness` reads the list it writes, so written in here it made the
  // effect its reader and ran it again, without end.
  $effect(() => {
    const on = openOn;
    if (on === null || !landed(on)) {
      return;
    }
    const timer = setTimeout(() => {
      settleHarness(on, "claude");
      setOpen(on, false);
    }, dur("--dur-hold"));
    return () => clearTimeout(timer);
  });

  /**
   * What a row says of its sign-in while the popover is put away: waiting
   * on a code or a pasted code, or nothing when none is under way.
   */
  function parkedWord(machineId: string): string | null {
    const flow = heldFlow(flowKey(account.id, machineId));
    if (flow?.live || pendingOf(account.id, machineId)) {
      return flow instanceof SigninFlow || (!flow && claude)
        ? words.machines.waitingPaste
        : words.machines.waitingCode;
    }
    return null;
  }

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
      {@const word = online ? state : "offline"}
      {@const flow = heldFlow(flowKey(account.id, machine.machineId))}
      {@const open = openOn === machine.machineId}
      {@const block = claude ? harnessBlockOf(machine, "claude") : null}
      {@const parked = open ? null : parkedWord(machine.machineId)}
      {@const resume =
        parked === words.machines.waitingPaste
          ? words.machines.pasteCode
          : words.machines.openSignIn}
      {@const landed = claude ? landedOn(machine, "claude") : undefined}
      <li
        class="col-span-full grid min-h-c-btn-h-lg grid-cols-subgrid items-center gap-x-space-4 px-space-2 py-space-1 not-first:border-t not-first:border-t-border-hairline"
        data-flip
      >
        <span class="type-label truncate text-ink-strong">{name}</span>
        <span class="flex min-w-0 items-center justify-end gap-space-3">
          {#if word !== "signed-in"}
            <span
              data-slot="machine-state"
              class="mark-line inline-flex items-center gap-space-1 type-meta whitespace-nowrap text-ink-muted transition-[color] duration-(--dur-panel) ease-out state-mismatch:text-status-attn-ink"
              data-parked={parked ? "" : undefined}
              data-state={word}
            >
              {#if word === "mismatch"}
                <IconWarningTriangle
                  aria-hidden="true"
                  class="size-icon-sm flex-none"
                />
              {/if}
              <span
                >{#if block && online}{blockWords.row(block)}{:else}{parked &&
                  online
                    ? parked
                    : WORDS[word]}{/if}</span
              >
            </span>
          {/if}
          <span class="flex min-w-0 justify-end">
            {#if online && (state !== "signed-in" || open)}
              <NsPopover
                align="end"
                id="signin-{account.id}-{machine.machineId}"
                label={words.machines.signInOn(
                  parked ? resume : verb,
                  nameOf(account),
                  name
                )}
                onchange={(next) => setOpen(machine.machineId, next)}
                {open}
                triggerClass={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
                width="var(--c-signin-pop-w)"
              >
                {#snippet trigger()}
                  {parked ? resume : verb}
                {/snippet}
                <div class="flex flex-col gap-space-3 p-space-2">
                  <p data-slot="title" class="type-label text-ink-strong">
                    {name}
                  </p>
                  {#if key}
                    <KeyPanel
                      account={own}
                      machines={[machine]}
                      onsent={() => {
                        sent.set(machine.machineId, true);
                      }}
                    />
                  {:else if block}
                    <HarnessBlock
                      {block}
                      machineId={machine.machineId}
                      {online}
                    />
                  {:else if flow instanceof SigninFlow}
                    {#if landed && flow.phase === "idle"}
                      <p
                        data-slot="landed"
                        class="type-meta flex items-start gap-space-2 text-ink-muted"
                        role="status"
                      >
                        <Check />
                        <span>{landed}</span>
                      </p>
                    {/if}
                    <SigninPanel
                      expected={account.email}
                      {flow}
                      machine={name}
                      {online}
                    />
                  {:else if flow instanceof DeviceFlow}
                    <DevicePanel {flow} machine={name} {online} />
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
        {#if !open && flow?.problem}
          <!-- The sign-in's refusal, said on its row while the popover is
               put away, until it is opened and tried again. -->
          <p
            data-slot="refused"
            class="col-span-full pb-space-2 type-meta text-status-fail-ink"
            data-flip
            role="alert"
          >
            {flow.problem}
          </p>
        {/if}
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
      <li class="col-span-full px-space-4 py-space-3 type-meta text-ink-muted">
        {words.machines.none}
      </li>
    {/each}
  </ul>
</NsPopoverGroup>
