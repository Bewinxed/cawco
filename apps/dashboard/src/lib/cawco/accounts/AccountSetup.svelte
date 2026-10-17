<script lang="ts">
  /**
   * Adding an account, in steps beside a rail of them. Provider first: the
   * picker's rows (a provider and how it signs in), and choosing one moves
   * on, its tile flying to the Sign in step's while the other rows leave.
   * Sign in follows the row's kind: Claude Code's own login with a pasted
   * code, a device code entered on any device, or a key sent to the
   * machines. Then Name it. A provider's second account goes on to how the
   * two share the work: your sessions, delegates, and, where CawCo reads the
   * provider's limits, what a session does at its limit.
   *
   * The account itself is made by its first sign-in (a link, a code, a key),
   * so its email is known and becomes its name. Each step's box takes the
   * next step's height (morph) while the step rises into it. Cancel takes
   * back an account no machine signed in.
   */
  import {
    type Account,
    type AccountHue,
    accountsWords,
    CLAUDE_PROVIDER,
    configureWords,
    DEFAULT_AT_LIMIT,
    defaultRouting,
    type HarnessKind,
    type ProviderChoice,
    type StrategyChoice,
  } from "@cawco/core";
  import { onDestroy, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import {
    cawco,
    createAccount,
    deleteAccount,
    patchAccount,
    putRouting,
  } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    appear,
    dur,
    easeOut,
    lifting,
    motionOk,
    pinned,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { depart, land } from "#lib/cawco/motion/share.svelte.js";
  import { aboveKeyboard } from "#lib/cawco/visible-viewport.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArrowUpRight,
    IconChevronRight,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import AccountName from "./AccountName.svelte";
  import AccountTile from "./AccountTile.svelte";
  import AtLimitBlock from "./AtLimitBlock.svelte";
  import DevicePanel from "./DevicePanel.svelte";
  import { DeviceFlow } from "./device.svelte";
  import KeyPanel from "./KeyPanel.svelte";
  import {
    accountsOf,
    choiceLabel,
    choicesOf,
    harnessWords,
    machineName,
    machineOnline,
    machinesFor,
    nameOf,
    nextHue,
    providerLimits,
    routingLine,
    signinState,
  } from "./model.svelte";
  import ProviderMark from "./ProviderMark.svelte";
  import StrategyPicker from "./StrategyPicker.svelte";
  import Swatches from "./Swatches.svelte";
  import { SigninFlow } from "./signin.svelte";

  const words = accountsWords.setup;

  // ── Provider ───────────────────────────────────────────────────────────
  const choices = $derived(choicesOf());
  const keyOf = (one: ProviderChoice) => `${one.provider}:${one.kind}`;
  let query = $state("");
  const shownChoices = $derived.by(() => {
    const asked = query.trim().toLowerCase();
    return asked
      ? choices.filter((one) => choiceLabel(one).toLowerCase().includes(asked))
      : choices;
  });
  /**
   * The rows in two groups, by how the account signs in: a sign-in (pasted
   * code or device code), or a key. Each row is named by its provider alone.
   */
  const pickGroups = $derived(
    [
      {
        id: "signin",
        label: words.pickSignin,
        rows: shownChoices.filter((one) => one.signin !== "api-key"),
      },
      {
        id: "keys",
        label: words.pickKeys,
        rows: shownChoices.filter((one) => one.signin === "api-key"),
      },
    ].filter((group) => group.rows.length > 0)
  );
  /** The machines that run any of a row's harnesses. */
  const runsOn = (harnesses: HarnessKind[]) =>
    cawco.machines.filter((machine) =>
      machine.harnesses?.some((entry) =>
        harnesses.includes(entry.harness as HarnessKind)
      )
    );

  let choice = $state<ProviderChoice | null>(null);
  /** The provider's one account, when this is its second: the setup goes on to routing. */
  let existing = $state<Account | null>(null);
  const provider = $derived(choice?.provider ?? null);
  const limits = $derived(provider !== null && providerLimits(provider));
  const full = $derived(existing !== null);
  /** A step, as the rail names it (`words.steps`). */
  type Step = keyof typeof words.steps;
  const STEPS = $derived<Step[]>([
    "provider",
    "signIn",
    "nameIt",
    ...(full
      ? ([
          "yourSessions",
          "delegates",
          ...(limits ? (["atLimit"] as const) : []),
          "done",
        ] as const)
      : []),
  ]);
  const LAST = $derived(STEPS.length - 1);

  let step = $state(0);
  const at = $derived(STEPS[step]);
  /** Which way the last step went: 1 on, -1 back. */
  let toward = 1;

  // ── Sign in ────────────────────────────────────────────────────────────
  let createdId = $state<string | null>(null);
  let creating: Promise<string> | null = null;
  /** The colour the account is made in: the first its provider's accounts don't wear. */
  let hue = $state<AccountHue>("orange");

  /** The account's id, making it first: it is made by its first sign-in. */
  function ensureAccount(): Promise<string> {
    if (createdId) {
      return Promise.resolve(createdId);
    }
    const row = choice;
    if (!row) {
      return Promise.reject(new Error(words.chooseFirst));
    }
    creating ??= createAccount({
      provider: row.provider,
      kind: row.kind,
      hue,
    }).then(
      (made) => {
        createdId = made.id;
        return made.id;
      },
      (error) => {
        creating = null;
        throw error;
      }
    );
    return creating;
  }

  const account = $derived(
    cawco.accounts?.accounts.find((one) => one.id === createdId) ?? null
  );
  const machines = $derived(choice ? runsOn(choice.harnesses) : []);
  const pastes = new SvelteMap<string, SigninFlow>();
  const devices = new SvelteMap<string, DeviceFlow>();
  $effect.pre(() => {
    const kind = choice?.signin;
    for (const machine of machines) {
      const { machineId } = machine;
      if (kind === "paste-code" && !untrack(() => pastes.has(machineId))) {
        pastes.set(machineId, new SigninFlow(ensureAccount, machineId));
      }
      if (kind === "device-code" && !untrack(() => devices.has(machineId))) {
        devices.set(machineId, new DeviceFlow(ensureAccount, machineId));
      }
    }
  });
  onDestroy(() => {
    for (const flow of devices.values()) {
      flow.dispose();
    }
  });

  const signins = $derived(cawco.accounts?.signins ?? []);
  const stateOn = (machineId: string) =>
    createdId ? signinState(signins, createdId, machineId) : "signed-out";
  const doneOn = (machineId: string) =>
    stateOn(machineId) === "signed-in" ||
    pastes.get(machineId)?.phase === "signed-in" ||
    devices.get(machineId)?.phase === "signed-in";
  const signedIn = $derived(
    machines.filter((machine) => doneOn(machine.machineId)).length
  );
  const email = $derived(
    account?.email ??
      [...pastes.values(), ...devices.values()].find(
        (flow) => flow.phase === "signed-in"
      )?.email ??
      null
  );

  // ── Name it ────────────────────────────────────────────────────────────
  let nickname = $state("");
  const shown = $derived({
    id: createdId ?? "new",
    email,
    label: nickname.trim() || null,
    kind: choice?.kind,
  });

  // ── Routing (a provider's second account) ──────────────────────────────
  // The provider's defaults (core `defaultRouting`), taken when a row is chosen.
  let yours = $state<StrategyChoice>({ strategy: "pinned" });
  let delegates = $state<StrategyChoice>({ strategy: "fill-first" });
  let atLimit = $state({ ...DEFAULT_AT_LIMIT });
  /** Both accounts, the one there was first; the new one goes last. */
  const pair = $derived(
    existing && account ? ([existing, account] as [Account, Account]) : null
  );
  /** Fill-first order as dragged here; until then, the one there was first. */
  let dragged = $state<string[] | null>(null);
  const order = $derived(dragged ?? (pair ? pair.map((one) => one.id) : []));

  // ── Moving through ─────────────────────────────────────────────────────
  let busy = $state(false);
  let refused = $state<string | null>(null);

  const canGo = $derived(
    at === "provider" ? false : at !== "signIn" || signedIn > 0
  );
  /** A key not yet on any machine: Send key is the step's one primary, not Continue. */
  const keyFirst = $derived(
    at === "signIn" && choice?.signin === "api-key" && signedIn === 0
  );
  const nextLabel = $derived.by(() => {
    if (step === LAST && full) {
      return words.openAccounts;
    }
    return step === LAST ? words.save : words.next;
  });

  /**
   * A row chosen: its tile takes off for the Sign in step's, and the setup
   * moves on. Another row than the one an unsigned account was made for
   * takes that account back first.
   */
  async function choose(row: ProviderChoice, tile: HTMLElement | null) {
    if (busy) {
      return;
    }
    if (choice && keyOf(choice) !== keyOf(row) && createdId) {
      busy = true;
      try {
        await deleteAccount(createdId);
      } catch (error) {
        refused = failureWords(error);
        busy = false;
        return;
      }
      busy = false;
      createdId = null;
      creating = null;
      pastes.clear();
      for (const flow of devices.values()) {
        flow.dispose();
      }
      devices.clear();
    }
    const theirs = accountsOf(row.provider).filter(
      (one) => one.id !== createdId
    );
    existing = theirs.length === 1 ? theirs[0] : null;
    // Its defaults: a pin goes to the account there was.
    const defaults = defaultRouting(row.provider);
    yours =
      defaults.yours.strategy === "pinned"
        ? { strategy: "pinned", pinnedAccountId: existing?.id }
        : { ...defaults.yours };
    delegates = { ...defaults.delegates };
    if (!createdId) {
      hue = nextHue(theirs);
    }
    choice = row;
    if (tile) {
      tile.dataset.share = `provider:${keyOf(row)}`;
      depart(tile);
    }
    refused = null;
    toward = 1;
    step = 1;
  }

  async function next() {
    if (busy || !canGo) {
      return;
    }
    refused = null;
    busy = true;
    try {
      if (at === "nameIt" && createdId) {
        await patchAccount(createdId, {
          label: nickname.trim() || null,
          hue,
        });
      }
      const lastRouting: Step = limits ? "atLimit" : "delegates";
      if (at === lastRouting && full && provider) {
        await putRouting(provider, {
          yours: $state.snapshot(yours),
          delegates: $state.snapshot(delegates),
          atLimit: $state.snapshot(atLimit),
        });
        await saveOrder();
      }
    } catch (error) {
      refused = failureWords(error);
      busy = false;
      return;
    }
    busy = false;
    if (step === LAST) {
      await goto("/config/accounts");
      return;
    }
    toward = 1;
    step += 1;
  }

  /** Each account whose place the drag changed takes it, from 0. */
  async function saveOrder() {
    for (const [place, id] of order.entries()) {
      const one = cawco.accounts?.accounts.find((a) => a.id === id);
      if (one && one.order !== place) {
        // biome-ignore lint/performance/noAwaitInLoops: one PATCH per account, in order, so a refusal stops the rest
        await patchAccount(id, { order: place });
      }
    }
  }

  function back() {
    if (step > 0 && !busy) {
      refused = null;
      toward = -1;
      step -= 1;
    }
  }

  /** Cancel takes back an account no machine signed in; one signed in stays. */
  async function cancel() {
    if (createdId && signedIn === 0) {
      busy = true;
      try {
        await deleteAccount(createdId);
      } catch (error) {
        refused = failureWords(error);
        busy = false;
        return;
      }
    }
    await goto("/config/accounts");
  }

  /** A step rises into its box as the box takes its height. */
  function stepIn(_node: Element): TransitionConfig {
    const rise = motionOk.current ? 6 * toward : 0;
    return {
      duration: dur("--dur-panel"),
      easing: easeOut,
      css: (t) => `opacity: ${t}; transform: translateY(${(1 - t) * rise}px)`,
    };
  }
  /**
   * The provider rows leaving as one is chosen: pinned where they stood,
   * they fade over the exit's length while the chosen tile flies on. Every
   * other step hands over at once.
   */
  function stepOut(node: HTMLElement): TransitionConfig {
    if (!(node.hasAttribute("data-picker") && toward === 1)) {
      return { duration: 0 };
    }
    return lifting(node, pinned(node), {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    });
  }
</script>

<SectionFrame title={words.title}>
  {#snippet actions()}
    <Button
      disabled={busy}
      label={configureWords.cancel}
      onclick={cancel}
      variant="outline"
    />
  {/snippet}

  <div data-slot="host" class="@container/setup min-w-0">
    <!-- literal: 184px minmax(0, 1fr) -->
    <div
      class="grid grid-cols-(--setup-cols) items-start gap-space-7 @max-setup/setup:grid-cols-(--setup-cols-narrow) @max-setup/setup:gap-space-4"
      style:--setup-cols="184px minmax(0, 1fr)"
      style:--setup-cols-narrow="minmax(0, 1fr)"
    >
      <ol
        aria-label={words.stepsLabel}
        class="sticky top-0 m-0 flex list-none flex-col gap-space-row p-0 @max-setup/setup:static @max-setup/setup:flex-row @max-setup/setup:flex-wrap @max-setup/setup:gap-space-1"
      >
        {#each STEPS as id, place (id)}
          <!-- literal: 34px, 6px -->
          <li
            data-account-setup-done={place < step || undefined}
            aria-current={place === step ? "step" : undefined}
            class="group mark-line flex h-(--step-h) items-center gap-space-3 rounded-sm px-space-3 type-label text-ink-muted transition-[background-color,color] dur-fade ease-out @max-setup/setup:px-space-2 data-account-setup-done:text-ink-row data-cur:bg-selected-bg data-cur:not-data-account-setup-done:text-selected-ink"
            data-cur={place === step || undefined}
            style:--step-h="34px"
          >
            {#if place < step}
              <IconSuccess
                aria-hidden="true"
                class="size-icon-md flex-none text-status-done-glyph"
              />
            {:else}
              <span
                data-slot="dot"
                aria-hidden="true"
                class="grid size-icon-md flex-none place-items-center"
                data-box
                style:--core="6px"
              ></span>
            {/if}
            <span
              data-slot="name"
              class="@max-setup/setup:group-not-data-cur:absolute @max-setup/setup:group-not-data-cur:size-px @max-setup/setup:group-not-data-cur:overflow-clip @max-setup/setup:group-not-data-cur:whitespace-nowrap @max-setup/setup:group-not-data-cur:clip-path-(--name-clip)"
              style:--name-clip="inset(50%)">{words.steps[id]}</span
            >
          </li>
        {/each}
      </ol>

      <div class="flex min-w-0 flex-col">
        <div
          class="relative overflow-hidden rounded-lg border border-border-well bg-surface-well"
          style:--swatch-ground="var(--surface-well)"
          {@attach morph()}
        >
          {#key step}
            <div
              data-picker={at === "provider" || undefined}
              class="p-space-6 @max-setup/setup:p-space-4"
              in:stepIn
              out:stepOut
            >
              {#if at === "provider"}
                {@render pick()}
              {:else if at === "signIn"}
                {@render signIn()}
              {:else if at === "nameIt"}
                {@render nameIt()}
              {:else if at === "yourSessions" && pair}
                {@render strategy(words.steps.yourSessions, yours, (c) => {
                  yours = c;
                })}
              {:else if at === "delegates" && pair}
                {@render strategy(words.steps.delegates, delegates, (c) => {
                  delegates = c;
                })}
              {:else if at === "atLimit" && pair}
                <section class="flex min-w-0 flex-col">
                  <h2
                    class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
                  >
                    {words.steps.atLimit}
                  </h2>
                  <AtLimitBlock
                    accounts={[pair[1], pair[0]]}
                    terms={provider === CLAUDE_PROVIDER}
                    bind:atLimit
                  />
                </section>
              {:else if at === "done" && pair}
                {@const line = routingLine(pair, { yours, delegates })}
                <section class="flex min-w-0 flex-col">
                  <h2
                    class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
                  >
                    {words.setUp(nameOf(pair[0]), nameOf(pair[1]))}
                  </h2>
                  <p data-slot="lead" class="text-pretty text-ink-muted">
                    {limits && atLimit.move ? words.withMoves(line) : line}
                  </p>
                </section>
              {/if}
            </div>
          {/key}
        </div>
        {#if refused}
          <p
            class="type-meta mt-space-3 text-status-fail-ink"
            role="alert"
            in:appear
          >
            {refused}
          </p>
        {/if}
        <div
          data-slot="foot"
          class="mt-space-5 flex justify-end gap-space-3 @max-setup/setup:sticky @max-setup/setup:bottom-0 @max-setup/setup:z-1 @max-setup/setup:mx-(--foot-pull) @max-setup/setup:bg-surface-raised @max-setup/setup:px-space-7 @max-setup/setup:pt-space-3 @max-setup/setup:pb-space-2"
          style:--foot-pull="calc(-1 * var(--space-7))"
          {@attach aboveKeyboard()}
        >
          <Button
            disabled={step === 0 || busy || (step === 1 && signedIn > 0)}
            label={words.back}
            onclick={back}
            variant="outline"
          />
          <Button
            disabled={!canGo}
            label={nextLabel}
            onclick={next}
            pending={busy}
            pendingLabel={configureWords.saving}
            variant={keyFirst ? "outline" : "default"}
          />
        </div>
      </div>
    </div>
  </div>
</SectionFrame>

{#snippet pick()}
  <section class="flex min-w-0 flex-col">
    {#if choices.length > 8}
      <Input
        data-search
        aria-label={words.search}
        autocomplete="off"
        class="mb-space-4"
        placeholder={words.search}
        spellcheck="false"
        type="search"
        bind:value={query}
      />
    {/if}
    {#each pickGroups as group (group.label)}
      <h3
        data-slot="ghead"
        class="type-label px-space-3 pt-space-4 pb-space-1 text-ink-muted first-of-type:pt-0"
        id="pick-{group.id}"
      >
        {group.label}
      </h3>
      {@render choiceRows(group.rows, group.id)}
    {:else}
      <p class="type-meta px-space-4 py-space-3 text-ink-muted">
        {words.noMatch(query.trim())}
      </p>
    {/each}
  </section>
{/snippet}

{#snippet choiceRows(rows: ProviderChoice[], group: string)}
  <ul
    data-slot="choices"
    aria-labelledby="pick-{group}"
    class="m-0 flex list-none flex-col p-0"
    {@attach highlight({ rows: "[data-choice]:not([aria-disabled='true'])" })}
  >
    {#each rows as row (keyOf(row))}
      {@const free = runsOn(row.harnesses).length > 0}
      {@const label = choiceLabel(row)}
      {#snippet button(props: Record<string, unknown>)}
        <!-- literal: 26px minmax(0, 1fr) 16px -->
        <button
          data-choice
          {...props}
          aria-disabled={free ? undefined : "true"}
          class="mark-line grid min-h-c-btn-h-lg w-full cursor-pointer grid-cols-(--choice-cols) items-center gap-space-3 border-none border-current bg-transparent pr-space-4 pl-space-3 text-start text-inherit active:not-aria-disabled:bg-surface-fill focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) aria-disabled:cursor-default aria-disabled:opacity-50"
          onclick={(event) => {
            if (free) {
              choose(
                row,
                event.currentTarget.querySelector<HTMLElement>(
                  '[data-slot="ptile"]'
                )
              );
            }
          }}
          style:--choice-cols="26px minmax(0, 1fr) 16px"
          style:--ptile="26px"
          type="button"
        >
          <span
            data-slot="ptile"
            class="grid size-(--ptile) flex-none place-items-center rounded-sm bg-surface-raised shadow-tile"
            data-box><ProviderMark provider={row.provider} /></span
          >
          <span
            data-slot="plabel"
            class="type-label min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-row"
            >{label}</span
          >
          <span
            data-slot="chev"
            aria-hidden="true"
            class="flex text-ink-subtle"
            data-box><IconChevronRight class="size-icon-md" /></span
          >
        </button>
      {/snippet}
      <li class="not-first:border-t not-first:border-t-border-hairline">
        {#if free}
          {@render button({})}
        {:else}
          <Tip
            label={words.noMachineRuns(
              row.harnesses.map((one) => accountsWords.harnesses[one])
            )}
          >
            {#snippet children(props)}
              {@render button(props)}
            {/snippet}
          </Tip>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet signIn()}
  <section class="flex min-w-0 flex-col">
    {#if choice}
      <h2
        class="mark-line type-title tracking-title mb-space-5 flex items-center gap-space-3 text-balance text-ink-strong"
      >
        <!-- literal: 26px -->
        <span
          data-slot="ptile"
          class="grid size-(--ptile) flex-none place-items-center rounded-sm bg-surface-raised shadow-tile"
          data-box
          style:--ptile="26px"
          {@attach land(() =>
            choice ? `provider:${keyOf(choice)}` : undefined
          )}><ProviderMark provider={choice.provider} /></span
        >
        <span>{choiceLabel(choice)}</span>
      </h2>
    {/if}
    {#if signedIn > 0 && choice?.signin !== "device-code"}
      <div
        class="mark-line mb-space-4 flex items-center gap-space-3 rounded-md bg-surface-raised px-space-4 py-space-3"
        in:unfold
        out:unfold
      >
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md flex-none text-status-done-glyph"
        />
        <span
          >{accountsWords.signin.signedInAs}
          <b class="font-medium">{email ?? accountsWords.signin.theAccount}</b
          ></span
        >
      </div>
    {/if}
    {#if choice?.signin === "api-key"}
      <KeyPanel account={ensureAccount} {machines} primary={keyFirst} />
    {:else}
      <!-- literal: 150px minmax(0, 1fr) auto, 14px -->
      <ul
        data-slot="machines"
        class="m-0 flex list-none flex-col p-0"
        style:--mrow-areas={'"name controls st" ". problem problem"'}
        style:--mrow-areas-stack={'"name st" "controls controls" "problem problem"'}
        style:--mrow-cols="150px minmax(0, 1fr) auto"
        style:--mrow-cols-two="minmax(0, 1fr) auto"
        style:--st-icon="14px"
      >
        {#each machines as machine (machine.machineId)}
          {@const name = machineName(machine)}
          {@const online = machineOnline(machine)}
          {@const state = stateOn(machine.machineId)}
          {@const done = doneOn(machine.machineId)}
          {@const paste = pastes.get(machine.machineId)}
          {@const device = devices.get(machine.machineId)}
          {#if device}
            <li
              class="group grid grid-areas-(--mrow-areas) grid-cols-(--mrow-cols) items-center gap-x-space-3 gap-y-space-1 border-t border-t-border-hairline py-space-3 @max-setup/setup:grid-areas-(--mrow-areas-stack) @max-setup/setup:grid-cols-(--mrow-cols-two) data-device:items-start"
              data-device
            >
              <b
                class="col-(--area) row-(--area) type-label min-w-0 truncate text-ink-strong group-data-device:leading-(--c-btn-h-sm)"
                style:--area="name">{name}</b
              >
              <div
                data-slot="controls"
                class="col-(--area) row-(--area) flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2 @max-setup/setup:pt-space-2"
                style:--area="controls"
              >
                <DevicePanel flow={device} machine={name} {online} />
              </div>
              <span
                class="mark-line col-(--area) row-(--area) flex items-center gap-space-2 justify-self-end type-meta whitespace-nowrap text-ink-muted data-warn:text-status-attn-ink"
                data-warn={state === "mismatch" || undefined}
                style:--area="st"
              >
                {#if !done && state === "mismatch"}
                  <IconWarningTriangle
                    aria-hidden="true"
                    class="size-(--st-icon)"
                  /><span>{words.someoneElse}</span>
                {:else if !online}
                  <span>{words.offline}</span>
                {/if}
              </span>
            </li>
          {:else if paste}
            <!-- One control per machine: Sign in opens Claude Code's link in
                 a new tab and opens the row onto the link, the paste field
                 and Done. Continue is how a machine is skipped. -->
            {@const asked = paste.phase !== "idle" || paste.url !== null}
            <li
              class="group grid grid-areas-(--mrow-areas) grid-cols-(--mrow-cols) items-center gap-x-space-3 gap-y-space-1 border-t border-t-border-hairline py-space-3 @max-setup/setup:grid-areas-(--mrow-areas-stack) @max-setup/setup:grid-cols-(--mrow-cols-two) data-paste:grid-areas-(--mrow-areas-stack) data-paste:grid-cols-(--mrow-cols-two)"
              data-paste
            >
              <b
                class="col-(--area) row-(--area) type-label min-w-0 truncate text-ink-strong group-data-device:leading-(--c-btn-h-sm)"
                style:--area="name">{name}</b
              >
              <span
                class="mark-line col-(--area) row-(--area) flex items-center gap-space-2 justify-self-end type-meta whitespace-nowrap text-ink-muted data-ok:not-data-warn:text-status-done-ink data-warn:text-status-attn-ink"
                data-ok={done || undefined}
                data-warn={state === "mismatch" || undefined}
                style:--area="st"
              >
                {#if done}
                  <IconSuccess
                    aria-hidden="true"
                    class="size-(--st-icon) text-status-done-glyph"
                  /><span>{words.signedIn}</span>
                {:else if paste.phase === "mismatch" || state === "mismatch"}
                  <IconWarningTriangle
                    aria-hidden="true"
                    class="size-(--st-icon)"
                  /><span>{words.someoneElse}</span>
                {:else if !online}
                  <span>{words.offline}</span>
                {:else if !asked}
                  <Button
                    data-box
                    label={words.signIn}
                    onclick={() => paste.open()}
                    size="sm"
                    variant="outline"
                  />
                {/if}
              </span>
              {#if asked && !done}
                <!-- literal: 140px, 30px -->
                <div
                  data-slot="controls"
                  class="col-(--area) row-(--area) flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2 group-data-paste:pt-space-2 @max-setup/setup:pt-space-2"
                  in:unfold
                  style:--area="controls"
                  style:--code-flex="1 1 140px"
                  style:--code-h="30px"
                >
                  {#if paste.url}
                    <Button
                      href={paste.url}
                      icon={IconArrowUpRight}
                      label={accountsWords.signin.openLink}
                      rel="noopener noreferrer"
                      size="sm"
                      target="_blank"
                      variant="outline"
                    />
                  {:else}
                    <Button
                      disabled
                      icon={IconArrowUpRight}
                      label={accountsWords.signin.openLink}
                      pending={paste.phase === "opening"}
                      pendingLabel={accountsWords.signin.opening}
                      size="sm"
                      variant="outline"
                    />
                  {/if}
                  <Input
                    data-account-setup-code
                    aria-invalid={paste.problem ? "true" : undefined}
                    aria-label={words.codeFor(name)}
                    autocomplete="off"
                    class="h-(--code-h)"
                    flex="code"
                    measure="shrink"
                    disabled={paste.url === null}
                    onkeydown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        paste.done();
                      }
                    }}
                    placeholder={words.pasteCode}
                    spellcheck="false"
                    bind:value={paste.code}
                  />
                  <Button
                    disabled={paste.url === null || paste.code.trim() === ""}
                    failed={paste.problem !== null}
                    label={accountsWords.signin.done}
                    onclick={() => paste.done()}
                    pending={paste.phase === "checking"}
                    pendingLabel={accountsWords.signin.checking}
                    size="sm"
                  />
                </div>
              {/if}
              {#if paste.problem}
                <p
                  data-slot="row-problem"
                  class="col-(--area) row-(--area) type-meta text-status-fail-ink"
                  role="alert"
                  in:appear
                  style:--area="problem"
                >
                  {paste.problem}
                </p>
              {:else if paste.phase === "mismatch"}
                <p
                  data-slot="row-warn"
                  class="col-(--area) row-(--area) type-meta text-status-attn-ink"
                  role="alert"
                  in:appear
                  style:--area="problem"
                >
                  {words.mismatch(name, paste.email)}
                </p>
              {/if}
            </li>
          {/if}
        {:else}
          <li
            class="type-meta border-t border-t-border-hairline px-0 py-space-3 text-ink-muted"
          >
            {words.none(harnessWords(choice?.provider ?? CLAUDE_PROVIDER))}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

{#snippet nameIt()}
  <section class="flex min-w-0 flex-col">
    <h2
      class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
    >
      {words.steps.nameIt}
    </h2>
    <!-- literal: 280px -->
    <div
      class="flex min-w-0 flex-col items-start gap-space-2 mb-space-5"
      style:--nick-max="280px"
    >
      <span data-slot="account-setup-label" class="type-label text-ink-strong"
        >{words.howItShows}</span
      >
      <!-- literal: 360px -->
      <div
        class="flex max-w-(--preview-max) min-w-0 items-center gap-space-3 rounded-md border border-border-hairline bg-surface-raised px-space-4 py-space-3"
        style:--preview-max="360px"
      >
        <AccountTile {hue} provider={choice?.provider ?? ""} size={28} />
        <AccountName account={shown} />
      </div>
    </div>
    <!-- literal: 280px -->
    <div
      class="flex min-w-0 flex-col items-start gap-space-2 mb-space-5"
      style:--nick-max="280px"
    >
      <label
        data-slot="account-setup-label"
        class="type-label text-ink-strong"
        for="setup-nickname"
      >
        {words.nickname}
        <span class="font-normal text-ink-muted">{words.optional}</span>
      </label>
      <Input
        autocomplete="off"
        class="max-w-(--nick-max)"
        id="setup-nickname"
        placeholder={words.nicknamePlaceholder}
        bind:value={nickname}
      />
    </div>
    <!-- literal: 280px -->
    <div
      class="flex min-w-0 flex-col items-start gap-space-2 mb-space-5"
      style:--nick-max="280px"
    >
      <span data-slot="account-setup-label" class="type-label text-ink-strong"
        >{accountsWords.colour}</span
      >
      <Swatches bind:value={hue} />
    </div>
  </section>
{/snippet}

{#snippet strategy(
  heading: string,
  value: StrategyChoice,
  onchoice: (choice: StrategyChoice) => void
)}
  <section class="flex min-w-0 flex-col">
    <h2
      class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
    >
      {heading}
    </h2>
    {#if pair}
      <StrategyPicker
        accounts={pair}
        choice={value}
        label={heading}
        {onchoice}
        onorder={(next) => {
          dragged = next;
        }}
        {order}
        provider={pair[0].provider}
      />
    {/if}
  </section>
{/snippet}

<style>
  /* residual: pseudo */
  [data-slot="dot"]::after {
    content: "";
    width: var(--core);
    height: var(--core);
    border-radius: 50%;
    background: var(--neutral-8);
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  [data-cur] [data-slot="dot"]::after {
    background: var(--selected-icon);
  }
</style>
