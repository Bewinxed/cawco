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
    CLAUDE_PROVIDER,
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
  import {
    appear,
    dur,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { depart, land } from "#lib/cawco/motion/share.svelte.js";
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

  // ── Provider ───────────────────────────────────────────────────────────
  const choices = $derived(choicesOf());
  const keyOf = (one: ProviderChoice) => `${one.provider}:${one.kind}`;
  let query = $state("");
  const shownChoices = $derived.by(() => {
    const words = query.trim().toLowerCase();
    return words
      ? choices.filter((one) => choiceLabel(one).toLowerCase().includes(words))
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
        label: "Sign in",
        rows: shownChoices.filter((one) => one.signin !== "api-key"),
      },
      {
        id: "keys",
        label: "API keys",
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
  const HARNESS: Record<HarnessKind, string> = {
    claude: "Claude Code",
    opencode: "OpenCode",
    pi: "pi",
  };

  let choice = $state<ProviderChoice | null>(null);
  /** The provider's one account, when this is its second: the setup goes on to routing. */
  let existing = $state<Account | null>(null);
  const provider = $derived(choice?.provider ?? null);
  const limits = $derived(provider !== null && providerLimits(provider));
  const full = $derived(existing !== null);
  const STEPS = $derived([
    "Provider",
    "Sign in",
    "Name it",
    ...(full
      ? [
          "Your sessions",
          "Delegates",
          ...(limits ? ["At the limit"] : []),
          "Done",
        ]
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
      return Promise.reject(new Error("Choose a provider first."));
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
    at === "Provider" ? false : at !== "Sign in" || signedIn > 0
  );
  /** A key not yet on any machine: Send key is the step's one primary, not Continue. */
  const keyFirst = $derived(
    at === "Sign in" && choice?.signin === "api-key" && signedIn === 0
  );
  const nextLabel = $derived.by(() => {
    if (step === LAST && full) {
      return "Open Accounts";
    }
    return step === LAST ? "Save account" : "Continue";
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
        refused = error instanceof Error ? error.message : String(error);
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
      if (at === "Name it" && createdId) {
        await patchAccount(createdId, {
          label: nickname.trim() || null,
          hue,
        });
      }
      const lastRouting = limits ? "At the limit" : "Delegates";
      if (at === lastRouting && full && provider) {
        await putRouting(provider, {
          yours: $state.snapshot(yours),
          delegates: $state.snapshot(delegates),
          atLimit: $state.snapshot(atLimit),
        });
        await saveOrder();
      }
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
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
        refused = error instanceof Error ? error.message : String(error);
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
    if (!(node.classList.contains("picker") && toward === 1)) {
      return { duration: 0 };
    }
    const { offsetTop, offsetLeft, offsetWidth } = node;
    Object.assign(node.style, {
      position: "absolute",
      top: `${offsetTop}px`,
      left: `${offsetLeft}px`,
      width: `${offsetWidth}px`,
      pointerEvents: "none",
    });
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
</script>

<SectionFrame title="Add account">
  {#snippet actions()}
    <Button disabled={busy} label="Cancel" onclick={cancel} variant="outline" />
  {/snippet}

  <div class="host">
    <div class="setup">
      <ol aria-label="Steps" class="steps">
        {#each STEPS as name, place (name)}
          <li
            aria-current={place === step ? "step" : undefined}
            class={["step", place < step && "done", place === step && "cur"]}
          >
            {#if place < step}
              <IconSuccess aria-hidden="true" />
            {:else}
              <span aria-hidden="true" class="dot"></span>
            {/if}
            <span class="name">{name}</span>
          </li>
        {/each}
      </ol>

      <div class="work">
        <div class="box" {@attach morph()}>
          {#key step}
            <div
              class={["in", at === "Provider" && "picker"]}
              in:stepIn
              out:stepOut
            >
              {#if at === "Provider"}
                {@render pick()}
              {:else if at === "Sign in"}
                {@render signIn()}
              {:else if at === "Name it"}
                {@render nameIt()}
              {:else if at === "Your sessions" && pair}
                {@render strategy("Your sessions", yours, (c) => {
                  yours = c;
                })}
              {:else if at === "Delegates" && pair}
                {@render strategy("Delegates", delegates, (c) => {
                  delegates = c;
                })}
              {:else if at === "At the limit" && pair}
                <section class="sec">
                  <h2>At the limit</h2>
                  <AtLimitBlock
                    accounts={[pair[1], pair[0]]}
                    terms={provider === CLAUDE_PROVIDER}
                    bind:atLimit
                  />
                </section>
              {:else if at === "Done" && pair}
                <section class="sec">
                  <h2>{nameOf(pair[0])} and {nameOf(pair[1])} are set up</h2>
                  <p class="lead">
                    {routingLine(pair, { yours, delegates })}{limits &&
                    atLimit.move
                      ? " · Moves at the limit"
                      : ""}
                  </p>
                </section>
              {/if}
            </div>
          {/key}
        </div>
        {#if refused}
          <p class="problem" role="alert" in:appear>{refused}</p>
        {/if}
        <div class="foot">
          <Button
            disabled={step === 0 || busy || (step === 1 && signedIn > 0)}
            label="Back"
            onclick={back}
            variant="outline"
          />
          <Button
            disabled={!canGo}
            label={nextLabel}
            onclick={next}
            pending={busy}
            pendingLabel="Saving…"
            variant={keyFirst ? "outline" : "default"}
          />
        </div>
      </div>
    </div>
  </div>
</SectionFrame>

{#snippet pick()}
  <section class="sec">
    {#if choices.length > 8}
      <Input
        aria-label="Search providers"
        autocomplete="off"
        class="search"
        placeholder="Search providers"
        spellcheck="false"
        type="search"
        bind:value={query}
      />
    {/if}
    {#each pickGroups as group (group.label)}
      <h3 class="ghead" id="pick-{group.id}">{group.label}</h3>
      {@render choiceRows(group.rows, group.id)}
    {:else}
      <p class="none">No provider matches “{query.trim()}”</p>
    {/each}
  </section>
{/snippet}

{#snippet choiceRows(
  rows: ProviderChoice[],
  group: string
)}
  <ul
    aria-labelledby="pick-{group}"
    class="choices"
    {@attach highlight({ rows: ".choice:not([aria-disabled='true'])" })}
  >
    {#each rows as row (keyOf(row))}
      {@const free = runsOn(row.harnesses).length > 0}
      {@const label = choiceLabel(row)}
      {#snippet button(
        props: Record<string, unknown>
      )}
        <button
          {...props}
          aria-disabled={free ? undefined : "true"}
          class="choice"
          onclick={(event) => {
            if (free) {
              choose(
                row,
                event.currentTarget.querySelector<HTMLElement>(".ptile")
              );
            }
          }}
          type="button"
        >
          <span class="ptile"><ProviderMark provider={row.provider} /></span>
          <span class="plabel">{label}</span>
          <span aria-hidden="true" class="chev"><IconChevronRight /></span>
        </button>
      {/snippet}
      <li class="crow">
        {#if free}
          {@render button({})}
        {:else}
          <Tip
            label="No machine runs {row.harnesses
              .map((one) => HARNESS[one])
              .join(" or ")}"
          >
            {#snippet children(
              props
            )}
              {@render button(props)}
            {/snippet}
          </Tip>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet signIn()}
  <section class="sec">
    {#if choice}
      <h2 class="titled">
        <span
          class="ptile"
          {@attach land(() =>
            choice ? `provider:${keyOf(choice)}` : undefined
          )}
          ><ProviderMark provider={choice.provider} /></span
        >
        {choiceLabel(choice)}
      </h2>
    {/if}
    {#if signedIn > 0 && choice?.signin !== "device-code"}
      <div class="signed-as" in:unfold out:unfold>
        <IconSuccess aria-hidden="true" />
        <span>Signed in as <b>{email ?? "the account"}</b></span>
      </div>
    {/if}
    {#if choice?.signin === "api-key"}
      <KeyPanel account={ensureAccount} {machines} primary={keyFirst} />
    {:else}
      <ul class="machines">
        {#each machines as machine (machine.machineId)}
          {@const name = machineName(machine)}
          {@const online = machineOnline(machine)}
          {@const state = stateOn(machine.machineId)}
          {@const done = doneOn(machine.machineId)}
          {@const paste = pastes.get(machine.machineId)}
          {@const device = devices.get(machine.machineId)}
          {#if device}
            <li class="mrow device">
              <b class="mname">{name}</b>
              <div class="controls">
                <DevicePanel flow={device} machine={name} {online} />
              </div>
              <span class={["st", state === "mismatch" && "warn"]}>
                {#if !done && state === "mismatch"}
                  <IconWarningTriangle aria-hidden="true" />Someone else
                {:else if !online}
                  Offline
                {/if}
              </span>
            </li>
          {:else if paste}
            <!-- One control per machine: Sign in opens Claude Code's link in
                 a new tab and opens the row onto the link, the paste field
                 and Done. Continue is how a machine is skipped. -->
            {@const asked = paste.phase !== "idle" || paste.url !== null}
            <li class="mrow paste">
              <b class="mname">{name}</b>
              <span
                class={["st", done && "ok", state === "mismatch" && "warn"]}
              >
                {#if done}
                  <IconSuccess aria-hidden="true" />Signed in
                {:else if paste.phase === "mismatch" || state === "mismatch"}
                  <IconWarningTriangle aria-hidden="true" />Someone else
                {:else if !online}
                  Offline
                {:else if !asked}
                  <Button
                    label="Sign in"
                    onclick={() => paste.open()}
                    size="sm"
                    variant="outline"
                  />
                {/if}
              </span>
              {#if asked && !done}
                <div class="controls" in:unfold>
                  {#if paste.url}
                    <Button
                      href={paste.url}
                      icon={IconArrowUpRight}
                      label="Open sign-in link"
                      rel="noopener noreferrer"
                      size="sm"
                      target="_blank"
                      variant="outline"
                    />
                  {:else}
                    <Button
                      disabled
                      icon={IconArrowUpRight}
                      label="Open sign-in link"
                      pending={paste.phase === "opening"}
                      pendingLabel="Opening…"
                      size="sm"
                      variant="outline"
                    />
                  {/if}
                  <Input
                    aria-invalid={paste.problem ? "true" : undefined}
                    aria-label="Code for {name}"
                    autocomplete="off"
                    class="code h-[30px]"
                    disabled={paste.url === null}
                    onkeydown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        paste.done();
                      }
                    }}
                    placeholder="Paste the code"
                    spellcheck="false"
                    bind:value={paste.code}
                  />
                  <Button
                    disabled={paste.url === null || paste.code.trim() === ""}
                    failed={paste.problem !== null}
                    label="Done"
                    onclick={() => paste.done()}
                    pending={paste.phase === "checking"}
                    pendingLabel="Checking…"
                    size="sm"
                  />
                </div>
              {/if}
              {#if paste.problem}
                <p class="row-problem" role="alert" in:appear>
                  {paste.problem}
                </p>
              {:else if paste.phase === "mismatch"}
                <p class="row-warn" role="alert" in:appear>
                  {name}
                  signed in as {paste.email ?? "another account"}, so it signed
                  out again. Open the link again and sign in as the account
                  you're adding.
                </p>
              {/if}
            </li>
          {/if}
        {:else}
          <li class="none">
            No machine runs
            {harnessWords(choice?.provider ?? CLAUDE_PROVIDER)}
            yet. Install it on one, and it shows here.
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

{#snippet nameIt()}
  <section class="sec">
    <h2>Name it</h2>
    <div class="fld">
      <span class="label">How it shows</span>
      <div class="preview">
        <AccountTile {hue} provider={choice?.provider ?? ""} size={28} />
        <AccountName account={shown} />
      </div>
    </div>
    <div class="fld">
      <label class="label" for="setup-nickname">
        Nickname <span class="optional">optional</span>
      </label>
      <Input
        autocomplete="off"
        class="nickname"
        id="setup-nickname"
        placeholder="Leave empty to use the email"
        bind:value={nickname}
      />
    </div>
    <div class="fld">
      <span class="label">Colour</span>
      <Swatches bind:value={hue} />
    </div>
  </section>
{/snippet}

{#snippet strategy(
  heading: string,
  value: StrategyChoice,
  onchoice: (choice: StrategyChoice) => void
)}
  <section class="sec">
    <h2>{heading}</h2>
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
  .host {
    min-width: 0;
    container: setup / inline-size;
  }
  .setup {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    align-items: start;
    gap: var(--space-7);
  }
  .steps {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .step {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-muted);
    transition:
      background-color var(--dur-fade) var(--ease-out),
      color var(--dur-fade) var(--ease-out);
  }
  .step :global(svg) {
    flex: none;
    width: 16px;
    height: 16px;
    color: var(--status-done-glyph);
  }
  .dot {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
  }
  .dot::after {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--neutral-8);
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .step.cur {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  .step.cur .dot::after {
    background: var(--selected-icon);
  }
  .step.done {
    color: var(--ink-row);
  }
  .work {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .box {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-lg);
    background: var(--surface-well);
    --swatch-ground: var(--surface-well);
  }
  .in {
    padding: var(--space-6);
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-block-start: var(--space-5);
  }
  .problem {
    margin-block-start: var(--space-3);
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .sec {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .sec h2 {
    margin-block-end: var(--space-5);
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  .sec h2.titled {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .lead {
    color: var(--ink-muted);
    text-wrap: pretty;
  }

  /* The provider picker: flat rows in the step's one container, in two
     groups under their headings. */
  .sec :global(.search) {
    margin-block-end: var(--space-4);
  }
  .ghead {
    padding: var(--space-4) var(--space-3) var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .ghead:first-of-type {
    padding-block-start: 0;
  }
  .choices {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .crow + .crow {
    border-block-start: 1px solid var(--border-hairline);
  }
  .choice {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) 16px;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--c-btn-h-lg);
    padding: 0 var(--space-4) 0 var(--space-3);
    border: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .choice:active:not([aria-disabled="true"]) {
    background-color: var(--surface-fill);
  }
  .choice:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .choice[aria-disabled="true"] {
    cursor: default;
    opacity: 0.5;
  }
  .ptile {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .plabel {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    display: flex;
    color: var(--ink-subtle);
  }
  .chev :global(svg) {
    width: 16px;
    height: 16px;
  }

  .fld {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 0;
    margin: 0 0 var(--space-5);
    padding: 0;
    border: 0;
  }
  .label {
    padding: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .optional {
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .fld :global(.nickname) {
    max-width: 280px;
  }
  .signed-as {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-block-end: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }
  .signed-as :global(svg) {
    flex: none;
    width: 16px;
    height: 16px;
    color: var(--status-done-glyph);
  }
  .signed-as b {
    font-weight: var(--weight-strong);
  }
  .machines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .mrow {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) auto;
    grid-template-areas:
      "name controls st"
      ". problem problem";
    align-items: center;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-3) 0;
    border-block-start: 1px solid var(--border-hairline);
  }
  /* Claude's rows: the name and its one control; asked, the link, the paste
     field and Done open on the line under them. */
  .mrow.paste {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "name st"
      "controls controls"
      "problem problem";
  }
  .mrow.device {
    align-items: start;
  }
  .mname {
    grid-area: name;
    min-width: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mrow.device .mname {
    line-height: var(--c-btn-h-sm);
  }
  .controls {
    grid-area: controls;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-width: 0;
  }
  .mrow.paste .controls {
    padding-block-start: var(--space-2);
  }
  .controls :global(.code) {
    flex: 1 1 140px;
    max-width: 180px;
    min-width: 0;
  }
  .st {
    grid-area: st;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    justify-self: end;
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .st.ok {
    color: var(--status-done-ink);
  }
  .st.warn {
    color: var(--status-attn-ink);
  }
  .st :global(svg) {
    width: 14px;
    height: 14px;
  }
  .st.ok :global(svg) {
    color: var(--status-done-glyph);
  }
  .row-problem,
  .row-warn {
    grid-area: problem;
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .row-warn {
    color: var(--status-attn-ink);
  }
  .none {
    padding: var(--space-3) var(--space-4);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .machines .none {
    padding-inline: 0;
    border-block-start: 1px solid var(--border-hairline);
  }
  .preview {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    max-width: 360px;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }

  /* A narrow page: the rail becomes a row of marks with the current step
     named, and each machine's controls go under its name. */
  @container setup (width < 640px) {
    .setup {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
    }
    .steps {
      position: static;
      flex-direction: row;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    .step {
      padding: 0 var(--space-2);
    }
    .step:not(.cur) .name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .in {
      padding: var(--space-4);
    }
    .mrow {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "name st"
        "controls controls"
        "problem problem";
    }
    .controls {
      padding-block-start: var(--space-2);
    }
  }
</style>
