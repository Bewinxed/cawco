<script lang="ts">
  /**
   * A provider's routing: how a person's sessions and a session's delegates
   * each choose among its accounts, the order Fill first fills them in, and,
   * where CawCo reads the provider's limits, what a running session does at
   * its limit. Two tabs share one picker's place;
   * switching slides the one out and the other in from the side it stands
   * on, and the place takes the new height. Save writes the routing, then
   * the order of every account whose place changed.
   */
  import type { Account, ProviderRouting } from "@cawco/core";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { patchAccount, putRouting } from "#lib/cawco/client.svelte.js";
  import { savedShown } from "#lib/cawco/config/EditorFooter.svelte";
  import EditorFrame from "#lib/cawco/config/EditorFrame.svelte";
  import {
    appear,
    dur,
    easeDrawer,
    easeOut,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { goto } from "$app/navigation";
  import AtLimitBlock from "./AtLimitBlock.svelte";
  import { providerLimits, providerName, strategyLabel } from "./model.svelte";
  import StrategyPicker from "./StrategyPicker.svelte";

  let {
    provider,
    accounts,
    routing,
  }: {
    provider: string;
    /** In fill-first order; two or more. */
    accounts: Account[];
    routing: ProviderRouting;
  } = $props();

  const title = $derived(`${providerName(provider)} routing`);
  const limits = $derived(providerLimits(provider));

  type Kind = "yours" | "delegates";
  let tab = $state<Kind>("yours");
  /** Which way the last switch went: 1 toward Delegates, -1 back. */
  let toward = $state(1);

  let draft = $state(
    untrack(() => ({
      yours: { ...routing.yours },
      delegates: { ...routing.delegates },
      atLimit: { ...routing.atLimit },
    }))
  );
  let order = $state(untrack(() => accounts.map((account) => account.id)));

  const dirty = $derived(
    JSON.stringify(draft) !==
      JSON.stringify({
        yours: routing.yours,
        delegates: routing.delegates,
        atLimit: routing.atLimit,
      }) || order.join() !== accounts.map((account) => account.id).join()
  );
  const limitLanes = $derived([accounts[0], accounts[1]] as [Account, Account]);

  let saving = $state(false);
  let refused = $state<string | undefined>(undefined);

  async function save() {
    if (saving) {
      return;
    }
    saving = true;
    refused = undefined;
    try {
      await putRouting(provider, $state.snapshot(draft));
      // Every account takes its place in the order, from 0, where it differs.
      for (const [at, id] of order.entries()) {
        const account = accounts.find((one) => one.id === id);
        if (account && account.order !== at) {
          // biome-ignore lint/performance/noAwaitInLoops: one PATCH per account, in order, so a refusal stops the rest
          await patchAccount(id, { order: at });
        }
      }
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
      saving = false;
      return;
    }
    saving = false;
    await savedShown();
    await goto("/config/accounts");
  }

  /** The picker leaving: pinned where it stood, it slides away from the tab chosen. */
  function slideOut(node: HTMLElement): TransitionConfig {
    const { offsetTop, offsetLeft, offsetWidth } = node;
    Object.assign(node.style, {
      position: "absolute",
      top: `${offsetTop}px`,
      left: `${offsetLeft}px`,
      width: `${offsetWidth}px`,
      pointerEvents: "none",
    });
    const by = -32 * toward;
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) =>
        motionOk.current
          ? `opacity: ${t}; transform: translateX(${(1 - t) * by}px)`
          : `opacity: ${t}`,
    };
  }
  /** The picker arriving from the side its tab stands on. */
  function slideIn(_node: HTMLElement): TransitionConfig {
    const by = 32 * toward;
    return {
      delay: motionOk.current ? 40 : 0,
      duration: dur(motionOk.current ? "--dur-panel" : "--dur-control"),
      easing: easeDrawer,
      css: (t) =>
        motionOk.current
          ? `opacity: ${t}; transform: translateX(${(1 - t) * by}px)`
          : `opacity: ${t}`,
    };
  }
</script>

<EditorFrame
  canSave={dirty}
  failed={refused !== undefined}
  oncancel={() => goto("/config/accounts")}
  onsubmit={save}
  saveLabel="Save routing"
  {saving}
  {title}
>
  {#snippet header()}
    <h1 class="title">{title}</h1>
    {#if refused}
      <p class="problem" role="alert" in:appear>{refused}</p>
    {/if}
  {/snippet}

  <section class="kinds">
    <Tabs
      onValueChange={(value) => {
        toward = value === "delegates" ? 1 : -1;
        tab = value as Kind;
      }}
      value={tab}
    >
      <TabsList aria-label="Which sessions">
        {#each [
          ["yours", "Your sessions"],
          ["delegates", "Delegates"],
        ] as [kind, label] (kind)}
          <TabItem {label} value={kind}>
            {#snippet trail()}
              <span class="strategy"
                >· {strategyLabel(draft[kind as Kind].strategy)}</span
              >
            {/snippet}
          </TabItem>
        {/each}
      </TabsList>
    </Tabs>
    <div class="slide" {@attach morph()}>
      {#key tab}
        <div class="pane" in:slideIn out:slideOut>
          <StrategyPicker
            {accounts}
            choice={draft[tab]}
            label={tab === "yours" ? "Your sessions" : "Delegates"}
            onchoice={(choice) => {
              draft[tab] = choice;
            }}
            onorder={(next) => {
              order = next;
            }}
            {order}
            {provider}
          />
        </div>
      {/key}
    </div>
  </section>

  {#if limits}
    <section class="well">
      <AtLimitBlock
        accounts={limitLanes}
        terms={provider === "anthropic"}
        bind:atLimit={draft.atLimit}
      />
    </section>
  {/if}
</EditorFrame>

<style>
  .title {
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
  .kinds {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    min-width: 0;
    container: kinds / inline-size;
  }
  /* Where the two tabs and their strategies don't fit on one row, the tabs
     keep their whole names and the strategy is the chosen card's to say. */
  @container kinds (width < 480px) {
    .strategy {
      display: none;
    }
  }
  .strategy {
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .slide {
    position: relative;
    align-self: stretch;
    min-width: 0;
  }
  .well {
    padding: var(--space-5) var(--space-6);
    border: 1px solid var(--border-well);
    border-radius: var(--radius-lg);
    background: var(--surface-well);
  }
  @media (max-width: 640px) {
    .well {
      padding: var(--space-4);
    }
  }
</style>
