<script lang="ts">
  /**
   * Adding a Claude account, in steps beside a rail of them. Sign in comes
   * first, so the account's email is known and becomes its name; the account
   * itself is made when its first sign-in link is asked for. Adding the
   * second account goes on to how the two share the work: who your sessions
   * run on, who delegates run on, and what a session does at its limit.
   * Otherwise it ends at Name it, back on the list.
   *
   * Each step's box takes the next step's height (morph) while the step
   * rises into it. Cancel takes back an account no machine signed in.
   */
  import {
    type Account,
    type AccountHue,
    type AccountKind,
    DEFAULT_AT_LIMIT,
    type StrategyChoice,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
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
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    IconArrowUpRight,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import AccountName from "./AccountName.svelte";
  import AccountTile from "./AccountTile.svelte";
  import AtLimitBlock from "./AtLimitBlock.svelte";
  import {
    claudeMachines,
    machineName,
    machineOnline,
    nameOf,
    nextHue,
    routingLine,
    signinState,
  } from "./model.svelte";
  import StrategyPicker from "./StrategyPicker.svelte";
  import Swatches from "./Swatches.svelte";
  import { SigninFlow } from "./signin.svelte";

  let {
    existing,
  }: {
    /** The one account there was: set, this is the second account's setup. */
    existing: Account | null;
  } = $props();

  const full = untrack(() => existing !== null);
  const STEPS = full
    ? [
        "Sign in",
        "Name it",
        "Your sessions",
        "Delegates",
        "At the limit",
        "Done",
      ]
    : ["Sign in", "Name it"];
  const LAST = STEPS.length - 1;

  let step = $state(0);
  /** Which way the last step went: 1 on, -1 back. */
  let toward = 1;

  // ── Sign in ────────────────────────────────────────────────────────────
  let kind = $state<AccountKind>("subscription");
  let createdId = $state<string | null>(null);
  let creating: Promise<string> | null = null;
  /** The colour the account is made in: the first no account wears. */
  let hue = $state<AccountHue>(
    untrack(() => nextHue(cawco.accounts?.accounts ?? []))
  );

  /** The account's id, making it first: it is made when its first link is asked for. */
  function ensureAccount(): Promise<string> {
    if (createdId) {
      return Promise.resolve(createdId);
    }
    creating ??= createAccount({ provider: "anthropic", kind, hue }).then(
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
  const machines = $derived(claudeMachines());
  const flows = new SvelteMap<string, SigninFlow>();
  const later = new SvelteSet<string>();
  $effect.pre(() => {
    for (const machine of machines) {
      if (!untrack(() => flows.has(machine.machineId))) {
        flows.set(
          machine.machineId,
          new SigninFlow(ensureAccount, machine.machineId)
        );
      }
    }
  });

  const signins = $derived(cawco.accounts?.signins ?? []);
  const stateOn = (machineId: string) =>
    createdId ? signinState(signins, createdId, machineId) : "signed-out";
  const signedIn = $derived(
    machines.filter(
      (machine) =>
        stateOn(machine.machineId) === "signed-in" ||
        flows.get(machine.machineId)?.phase === "signed-in"
    ).length
  );
  const email = $derived(
    account?.email ??
      [...flows.values()].find((flow) => flow.phase === "signed-in")?.email ??
      null
  );

  // ── Name it ────────────────────────────────────────────────────────────
  let nickname = $state("");
  const shown = $derived({
    id: createdId ?? "new",
    email,
    label: nickname.trim() || null,
  });

  // ── Routing (the second account) ───────────────────────────────────────
  let yours = $state<StrategyChoice>(
    untrack(() => ({ strategy: "pinned", pinnedAccountId: existing?.id }))
  );
  let delegates = $state<StrategyChoice>({ strategy: "soonest-reset" });
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

  const canGo = $derived(step !== 0 || signedIn > 0);
  const nextLabel = $derived.by(() => {
    if (step === LAST && full) {
      return "Open Accounts";
    }
    return step === LAST ? "Save account" : "Continue";
  });

  async function next() {
    if (busy || !canGo) {
      return;
    }
    refused = null;
    busy = true;
    try {
      if (step === 1 && createdId) {
        await patchAccount(createdId, {
          label: nickname.trim() || null,
          hue,
        });
      }
      if (step === 4 && full) {
        await putRouting({
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
    for (const [at, id] of order.entries()) {
      const one = cawco.accounts?.accounts.find((a) => a.id === id);
      if (one && one.order !== at) {
        // biome-ignore lint/performance/noAwaitInLoops: one PATCH per account, in order, so a refusal stops the rest
        await patchAccount(id, { order: at });
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

  const title = full
    ? "Set up a second Claude account"
    : "Add a Claude account";
  const purpose = $derived(
    existing
      ? `${nameOf(existing)} is your only Claude account so far.`
      : "Sign it in on a machine, then name it."
  );
</script>

<SectionFrame {purpose} {title}>
  {#snippet actions()}
    <Button disabled={busy} label="Cancel" onclick={cancel} variant="outline" />
  {/snippet}

  <div class="host">
    <div class="setup">
      <ol aria-label="Steps" class="steps">
        {#each STEPS as name, at (name)}
          <li
            aria-current={at === step ? "step" : undefined}
            class={["step", at < step && "done", at === step && "cur"]}
          >
            {#if at < step}
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
            <div class="in" in:stepIn>
              {#if step === 0}
                {@render signIn()}
              {:else if step === 1}
                {@render nameIt()}
              {:else if step === 2 && pair}
                {@render strategy(
                  "Your sessions",
                  "Sessions you start yourself.",
                  yours,
                  (c) => {
                    yours = c;
                  }
                )}
              {:else if step === 3 && pair}
                {@render strategy(
                  "Delegates",
                  "Sessions your sessions start.",
                  delegates,
                  (c) => {
                    delegates = c;
                  }
                )}
              {:else if step === 4 && pair}
                <section class="sec">
                  <h2>At the limit</h2>
                  <p class="lead">
                    What happens to a running session when its account runs out.
                  </p>
                  <AtLimitBlock accounts={[pair[1], pair[0]]} bind:atLimit />
                </section>
              {:else if step === 5 && pair}
                <section class="sec">
                  <h2>{nameOf(pair[0])} and {nameOf(pair[1])} are set up</h2>
                  <p class="lead">
                    {routingLine(pair, { yours, delegates })}{atLimit.move
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
            disabled={step === 0 || busy}
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
          />
        </div>
      </div>
    </div>
  </div>
</SectionFrame>

{#snippet signIn()}
  <section class="sec">
    <h2>Sign in</h2>
    <p class="lead">
      Sign in on at least one machine. The account’s email becomes its name.
    </p>
    <fieldset class="fld" disabled={createdId !== null}>
      <legend class="label">Kind</legend>
      <Tabs
        onValueChange={(value) => {
          kind = value as AccountKind;
        }}
        value={kind}
      >
        <TabsList aria-label="Kind">
          <TabItem label="Subscription" value="subscription" />
          <TabItem label="Console" value="console" />
        </TabsList>
      </Tabs>
    </fieldset>
    {#if signedIn > 0}
      <div class="signed-as" in:unfold out:unfold>
        <IconSuccess aria-hidden="true" />
        <span>Signed in as <b>{email ?? "the account"}</b></span>
      </div>
    {/if}
    <ul class="machines">
      {#each machines as machine (machine.machineId)}
        {@const flow = flows.get(machine.machineId)}
        {@const name = machineName(machine)}
        {@const online = machineOnline(machine)}
        {@const state = stateOn(machine.machineId)}
        {@const done = state === "signed-in" || flow?.phase === "signed-in"}
        {#if flow}
          <li class="mrow">
            <b class="mname">{name}</b>
            <div class="controls">
              {#if flow.url && !done}
                <Button
                  href={flow.url}
                  icon={IconArrowUpRight}
                  label="Open sign-in link"
                  rel="noopener noreferrer"
                  size="sm"
                  target="_blank"
                  variant="outline"
                />
              {:else}
                <Button
                  disabled={!online || done}
                  icon={IconArrowUpRight}
                  label="Open sign-in link"
                  onclick={() => flow.open()}
                  pending={flow.phase === "opening"}
                  pendingLabel="Opening…"
                  size="sm"
                  variant="outline"
                />
              {/if}
              <Input
                aria-invalid={flow.problem ? "true" : undefined}
                aria-label="Code for {name}"
                autocomplete="off"
                class="code h-[30px]"
                disabled={flow.url === null || done}
                onkeydown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    flow.done();
                  }
                }}
                placeholder="Paste the code"
                spellcheck="false"
                bind:value={flow.code}
              />
              <Button
                disabled={flow.url === null || done || flow.code.trim() === ""}
                failed={flow.problem !== null}
                label="Done"
                onclick={() => flow.done()}
                pending={flow.phase === "checking"}
                pendingLabel="Checking…"
                size="sm"
              />
              <Button
                disabled={done}
                label="Later"
                onclick={() => later.add(machine.machineId)}
                size="sm"
                variant="ghost"
              />
            </div>
            <span class={["st", done && "ok", state === "mismatch" && "warn"]}>
              {#if done}
                <IconSuccess aria-hidden="true" />Signed in
              {:else if flow.phase === "mismatch" || state === "mismatch"}
                <IconWarningTriangle aria-hidden="true" />Someone else
              {:else if !online}
                Offline
              {:else if later.has(machine.machineId)}
                Later
              {/if}
            </span>
            {#if flow.problem}
              <p class="row-problem" role="alert" in:appear>{flow.problem}</p>
            {:else if flow.phase === "mismatch"}
              <p class="row-warn" role="alert" in:appear>
                {name}
                signed in as {flow.email ?? "another account"}, so it signed out
                again. Open the link again and sign in as the account you're
                adding.
              </p>
            {/if}
          </li>
        {/if}
      {:else}
        <li class="none">
          No machine has Claude Code yet. Install it on one, and it shows here.
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

{#snippet nameIt()}
  <section class="sec">
    <h2>Name it</h2>
    <p class="lead">
      It’s called by its email. Add a nickname if you’d like a shorter one.
    </p>
    <div class="fld">
      <span class="label">How it shows</span>
      <div class="preview">
        <AccountTile {hue} size={28} />
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
  line: string,
  choice: StrategyChoice,
  onchoice: (choice: StrategyChoice) => void
)}
  <section class="sec">
    <h2>{heading}</h2>
    <p class="lead">{line}</p>
    {#if pair}
      <StrategyPicker
        accounts={pair}
        {choice}
        label={heading}
        {onchoice}
        onorder={(next) => {
          dragged = next;
        }}
        {order}
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
    margin-block-end: var(--space-1);
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  .lead {
    margin-block-end: var(--space-5);
    color: var(--ink-muted);
    text-wrap: pretty;
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
  .mname {
    grid-area: name;
    min-width: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    grid-area: controls;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-width: 0;
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
    padding: var(--space-3) 0;
    border-block-start: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-muted);
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
