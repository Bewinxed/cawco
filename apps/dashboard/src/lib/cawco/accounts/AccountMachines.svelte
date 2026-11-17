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
   * Signed in, the check draws, holds for --duration-hold, and the popover puts
   * itself away.
   *
   * A sign-in outlives its popover (DESIGN.md, The Work Outlives Its
   * Surface Rule): put away, the row says it is waiting on a code (a device
   * code's wait goes on) and its button reads Open sign-in, which opens the
   * same link or code again; a refusal stays said on the row. A reload opens
   * the popover again, on the link or code the hub kept.
   *
   * A machine whose Claude Code CawCo refuses (too old, or none) offers no
   * sign-in that can't succeed: the popover holds why in its place
   * (HarnessBlock: Install Claude Code with none there; with one too old,
   * the update CawCo runs by itself, and Retry once it failed), the row says
   * so, and an update in flight parks on the row. Once it lands the popover
   * offers the sign-in, saying which Claude Code is there now.
   *
   * A ChatGPT account signs in twice on a machine that runs Codex: its own
   * sign-in for pi and OpenCode, and Codex's own into the account's Codex
   * home there, in a row of its own under the machine's first, named once
   * (the owner's pick "A row per sign-in", 2026-11-17). Each row says under
   * the name what it signs in for, and carries its own state, Sign in (a
   * device code) and Sign out.
   */
  import { type Account, isChatgptPlan } from "@cawco/core/accounts";
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import { accountsWords as words } from "@cawco/core/words/accounts";
  import { onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { z } from "zod";

  import RowMenu from "#lib/cawco/config/RowMenu.svelte";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import {
    accountsStore,
    keepCodexOn,
    signOutCodexOn,
    signOutOn,
  } from "#lib/cawco/stores/accounts.svelte.js";
  import { TabDraft } from "#lib/cawco/tab-draft.svelte.js";
  import { Button, buttonVariants } from "#lib/components/ui/button/index.js";
  import { IconLogout, IconWarningTriangle } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { dur } from "#lib/platform/motion/curves.svelte.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
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
    codexFlow,
    codexKey,
    deviceFlow,
    dropFlow,
    flowKey,
    heldFlow,
    pasteFlow,
    pendingOf,
  } from "./flows.svelte";
  import KeyPanel from "./KeyPanel.svelte";
  import {
    type AccountMachine,
    codexLeaving,
    codexState,
    harnessesOn,
    machineName,
    machineOnline,
    machinesFor,
    nameOf,
    signinState,
  } from "./model.svelte";
  import SigninFor from "./SigninFor.svelte";
  import SigninPanel from "./SigninPanel.svelte";
  import { SigninFlow } from "./signin.svelte";

  let { account }: { account: Account } = $props();

  const machines = $derived(machinesFor(account.provider));
  const signins = $derived(accountsStore.accounts?.signins ?? []);
  const claude = $derived(account.provider === "anthropic");
  const key = $derived(account.kind === "api_key");
  /**
   * A ChatGPT account signs in twice where Codex runs: the provider's own
   * sign-in for pi and OpenCode, and Codex's own into the account's Codex
   * home (the owner's pick "Codex's own sign-in", 2026-11-17).
   */
  const chatgpt = $derived(isChatgptPlan(account));

  /**
   * One row of the list: one sign-in on a machine. `codex` is Codex's own,
   * in a row of its own under the machine's other (the owner's pick "A row
   * per sign-in", 2026-11-17); `harnesses` what the row signs in for.
   */
  interface Place {
    codex: boolean;
    harnesses: HarnessKind[];
    /** The row's key, and its popover's: the machine, then `:codex` for Codex's row. */
    key: string;
    machine: AccountMachine;
  }

  const places = $derived(
    machines.flatMap((machine): Place[] => {
      const all = harnessesOn(machine, account.provider);
      if (!(chatgpt && all.includes("codex"))) {
        return [
          { machine, codex: false, harnesses: all, key: machine.machineId },
        ];
      }
      const others = all.filter((one) => one !== "codex");
      return [
        ...(others.length > 0
          ? [
              {
                machine,
                codex: false,
                harnesses: others,
                key: machine.machineId,
              },
            ]
          : []),
        {
          machine,
          codex: true,
          harnesses: ["codex" as const],
          key: `${machine.machineId}:codex`,
        },
      ];
    })
  );

  /** A row's one action: a key is sent, any other account signs in. */
  const verb = $derived(key ? words.machines.sendKey : words.machines.signIn);

  /**
   * The row whose popover is open, kept in this tab: a reload opens it
   * again on the same sign-in (The Work Outlives Its Surface Rule).
   */
  const shown = new TabDraft(
    "cawco:account-signin",
    z.object({ on: z.string().nullable() }),
    () => ({ on: null })
  );
  onMount(() => shown.keep());
  const openOn = $derived(
    shown.value.on?.startsWith(`${account.id}:`)
      ? shown.value.on.slice(account.id.length + 1)
      : null
  );
  /** A key sent from a row's popover, by machine; a key is never kept. */
  const sent = new SvelteMap<string, boolean>();

  const own = () => Promise.resolve(account.id);

  /**
   * The provider's sign-in for the account on that machine, kept while its
   * popover is put away (flows.svelte.ts), or a new one.
   */
  function flowOn(machineId: string): SigninFlow | DeviceFlow {
    const at = flowKey(account.id, machineId);
    return claude
      ? pasteFlow(at, own, machineId, account.id)
      : deviceFlow(at, own, machineId, account.id);
  }

  /** Codex's own sign-in for the account on that machine. */
  const codexOn = (machineId: string): DeviceFlow =>
    codexFlow(own, account.id, machineId);

  /** The sign-in a row draws, once one is made: the provider's, or Codex's own. */
  const flowOf = (place: Place): SigninFlow | DeviceFlow | undefined =>
    heldFlow(
      place.codex
        ? codexKey(account.id, place.machine.machineId)
        : flowKey(account.id, place.machine.machineId)
    );

  /** Where a row stands: the account's own sign-in there, or Codex's. */
  const stateOf = (place: Place) =>
    place.codex
      ? codexState(account.id, place.machine.machineId)
      : signinState(signins, account.id, place.machine.machineId);

  /**
   * Opening draws the row's sign-in, the same one if it is under way; ×,
   * Esc or a press outside put the popover away and leave the sign-in going,
   * said on its row. One that landed is let go.
   */
  function setOpen(place: Place, open: boolean) {
    const id = place.machine.machineId;
    if (open) {
      if (place.codex) {
        codexOn(id);
      } else if (!key) {
        flowOn(id);
      }
      sent.delete(id);
      shown.value.on = `${account.id}:${place.key}`;
    } else if (openOn === place.key) {
      shown.value.on = null;
      const at = place.codex
        ? codexKey(account.id, id)
        : flowKey(account.id, id);
      const flow = heldFlow(at);
      if (flow && !flow.live) {
        dropFlow(at);
      }
    }
  }

  /**
   * A popover a reload opens again draws its sign-in from its first frame:
   * the flow is made as the page is, taken up from the hub where it was
   * under way. Only a press opens a popover after that (`setOpen`), and an
   * accounts read that lands later is taken up in flows.svelte.ts.
   */
  function reopen() {
    const place = places.find((one) => one.key === openOn);
    if (place) {
      setOpen(place, true);
    }
  }
  reopen();

  const landed = (place: Place): boolean =>
    key && !place.codex
      ? sent.get(place.machine.machineId) === true
      : flowOf(place)?.phase === "signed-in";

  // Signed in: the check draws and holds, then the popover goes, and the
  // Claude Code this tab brought up there, having done its work, is said no
  // more. Both are written once the hold is over, outside the effect:
  // `settleHarness` reads the list it writes, so written in here it made the
  // effect its reader and ran it again, without end.
  $effect(() => {
    const place = places.find((one) => one.key === openOn);
    if (!(place && landed(place))) {
      return;
    }
    const timer = setTimeout(() => {
      settleHarness(place.machine.machineId, "claude");
      setOpen(place, false);
    }, dur("--duration-hold"));
    return () => clearTimeout(timer);
  });

  /**
   * What a row says of its sign-in while the popover is put away: waiting
   * on a code or a pasted code, or nothing when none is under way.
   */
  function parkedWord(place: Place): string | null {
    const flow = flowOf(place);
    if (place.codex) {
      return flow?.live || pendingOf(account.id, place.machine.machineId, true)
        ? words.machines.waitingCode
        : null;
    }
    if (flow?.live || pendingOf(account.id, place.machine.machineId)) {
      return flow instanceof SigninFlow || (!flow && claude)
        ? words.machines.waitingPaste
        : words.machines.waitingCode;
    }
    return null;
  }

  /** Why a sign-out was refused, by row, in the hub's words. */
  const refusals = new SvelteMap<string, string>();

  async function signOut(place: Place) {
    refusals.delete(place.key);
    try {
      await (place.codex ? signOutCodexOn : signOutOn)(
        account.id,
        place.machine.machineId
      );
    } catch (error) {
      refusals.set(place.key, failureWords(error));
    }
  }

  /** Rows whose waiting Codex sign-out is being taken back. */
  const keeping = new SvelteMap<string, boolean>();

  /** Takes back a Codex sign-out that waits for its sessions on the row's machine. */
  async function keepCodex(place: Place) {
    refusals.delete(place.key);
    keeping.set(place.key, true);
    try {
      await keepCodexOn(account.id, place.machine.machineId);
    } catch (error) {
      refusals.set(place.key, failureWords(error));
    } finally {
      keeping.delete(place.key);
    }
  }

  /** What a row says: nothing for a machine it is signed in on. */
  const WORDS = words.machines.state;
</script>

<NsPopoverGroup>
  <ul
    aria-label={words.editor.machines}
    class="m-0 grid grid-cols-(--rows-cols) list-none p-0"
    style:--rows-cols="minmax(0, 1fr) fit-content(55%)"
    {@attach reflow()}
  >
    {#each places as place, at (place.key)}
      {@const machine = place.machine}
      {@const again = places[at - 1]?.machine.machineId === machine.machineId}
      {@const name = machineName(machine)}
      {@const online = machineOnline(machine)}
      {@const state = stateOf(place)}
      {@const word = online ? state : "offline"}
      {@const flow = flowOf(place)}
      {@const open = openOn === place.key}
      {@const block = claude ? harnessBlockOf(machine, "claude") : null}
      {@const parked = open ? null : parkedWord(place)}
      {@const leaving = place.codex
        ? codexLeaving(account.id, machine.machineId)
        : null}
      {@const resume =
        parked === words.machines.waitingPaste
          ? words.machines.pasteCode
          : words.machines.openSignIn}
      {@const landedHere = claude ? landedOn(machine, "claude") : undefined}
      <li
        class="col-span-full grid min-h-c-btn-h-lg grid-cols-subgrid items-center gap-x-space-4 px-space-2 py-space-1 not-first:not-data-again:border-t not-first:not-data-again:border-t-border-hairline"
        data-again={again || undefined}
        data-flip
      >
        <!-- A machine's second sign-in sits under its first, named once;
             each says what it signs in for under the name. -->
        <span class="flex min-w-0 flex-col">
          <span
            class={["type-label truncate text-ink-strong", again && "sr-only"]}
            >{name}</span
          >
          {#if chatgpt}
            <SigninFor harnesses={place.harnesses} />
          {/if}
        </span>
        <!-- On a narrow screen a long word lets its button wrap under it,
             so the machine's name keeps its room. -->
        <span
          class="flex min-w-0 flex-wrap items-center justify-end gap-x-space-3 gap-y-space-1"
        >
          {#if word !== "signed-in"}
            <span
              data-slot="machine-state"
              class="mark-line inline-flex items-center gap-space-1 type-meta whitespace-nowrap text-ink-muted transition-[color] duration-(--duration-panel) ease-out state-mismatch:text-status-attn-ink"
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
                >{#if block && online}{blockWords.row(
                    block
                  )}{:else if parked && online}{parked}{:else if leaving !== null && online}{words.machines.codexLeaving(
                    leaving
                  )}{:else}{WORDS[word]}{/if}</span
              >
            </span>
          {/if}
          <span class="flex min-w-0 justify-end">
            {#if online && leaving !== null && !open}
              <Button
                label={words.machines.keepSignedIn}
                onclick={() => keepCodex(place)}
                pending={keeping.get(place.key) === true}
                size="sm"
                variant="outline"
              />
            {:else if online && (state !== "signed-in" || open)}
              <NsPopover
                align="end"
                id="signin-{account.id}-{place.key}"
                label={words.machines.signInOn(
                  parked ? resume : verb,
                  nameOf(account),
                  name
                )}
                onchange={(next) => setOpen(place, next)}
                {open}
                triggerClass={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
                width="var(--spacing-c-signin-pop-w)"
              >
                {#snippet trigger()}
                  {parked ? resume : verb}
                {/snippet}
                <div class="flex flex-col gap-space-3 p-space-2">
                  <p
                    data-slot="title"
                    class="flex items-baseline justify-between gap-space-3 type-label text-ink-strong"
                  >
                    <span class="truncate">{name}</span>
                    {#if place.codex}
                      <SigninFor harnesses={["codex"]} />
                    {/if}
                  </p>
                  {#if place.codex}
                    <DevicePanel
                      flow={flow instanceof DeviceFlow ? flow : undefined}
                      machine={name}
                      {online}
                      start={() => codexOn(machine.machineId).start()}
                    />
                  {:else if key}
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
                    {#if landedHere && flow.phase === "idle"}
                      <p
                        data-slot="landed"
                        class="type-meta flex items-start gap-space-2 text-ink-muted"
                        role="status"
                      >
                        <Check />
                        <span>{landedHere}</span>
                      </p>
                    {/if}
                    <SigninPanel
                      expected={account.email}
                      {flow}
                      machine={name}
                      {online}
                    />
                  {:else if flow instanceof DeviceFlow}
                    <DevicePanel
                      {flow}
                      machine={name}
                      {online}
                      start={() => flow.start()}
                    />
                  {/if}
                </div>
              </NsPopover>
            {:else if online && state === "signed-in"}
              <RowMenu
                actions={[
                  {
                    label: place.codex
                      ? words.machines.signOutCodex
                      : words.machines.signOut,
                    icon: IconLogout,
                    destructive: true,
                    onselect: () => signOut(place),
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
        {#if refusals.get(place.key)}
          <p
            data-slot="refused"
            class="col-span-full pb-space-2 type-meta text-status-fail-ink"
            data-flip
            role="alert"
          >
            {refusals.get(place.key)}
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
