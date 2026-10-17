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
  import {
    type Account,
    accountsWords,
    type ProviderRouting,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { patchAccount, putRouting } from "#lib/cawco/client.svelte.js";
  import { savedShown } from "#lib/cawco/config/EditorFooter.svelte";
  import EditorFrame from "#lib/cawco/config/EditorFrame.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    appear,
    dur,
    easeDrawer,
    easeOut,
    lifting,
    motionOk,
    pinned,
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
  import ProviderMark from "./ProviderMark.svelte";
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

  const words = accountsWords.routingEditor;
  const title = $derived(words.title(providerName(provider)));
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
      refused = failureWords(error);
      saving = false;
      return;
    }
    saving = false;
    await savedShown();
    await goto("/config/accounts");
  }

  /** The picker leaving: pinned where it stood, it slides away from the tab chosen. */
  function slideOut(node: HTMLElement): TransitionConfig {
    const by = -32 * toward;
    return lifting(node, pinned(node), {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) =>
        motionOk.current
          ? `opacity: ${t}; transform: translateX(${(1 - t) * by}px)`
          : `opacity: ${t}`,
    });
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
  saveLabel={words.save}
  {saving}
  {title}
>
  {#snippet tile()}
    <ProviderMark {provider} />
  {/snippet}
  {#snippet header()}
    <h1 data-slot="title" class="type-title text-ink-strong">{title}</h1>
    {#if refused}
      <p class="type-meta text-status-fail-ink" role="alert" in:appear>{refused}</p>
    {/if}
  {/snippet}

  <section
    class="@container/kinds flex min-w-0 flex-col items-start gap-space-4"
  >
    <Tabs
      onValueChange={(value) => {
        toward = value === "delegates" ? 1 : -1;
        tab = value as Kind;
      }}
      value={tab}
    >
      <TabsList aria-label={words.whichSessions}>
        {#each [["yours", words.yours], ["delegates", words.delegates]] as [kind, label] (kind)}
          <TabItem {label} value={kind}>
            {#snippet trail()}
              <!-- literal: 0.25em -->
              <span
                class="ms-(--strategy-gap) font-normal text-ink-muted @max-kinds/kinds:hidden"
                style:--strategy-gap="0.25em"
                >{words.trail(
                  strategyLabel(draft[kind as Kind].strategy)
                )}</span
              >
            {/snippet}
          </TabItem>
        {/each}
      </TabsList>
    </Tabs>
    <div class="relative min-w-0 self-stretch" {@attach morph()}>
      {#key tab}
        <div data-slot="pane" in:slideIn out:slideOut>
          <StrategyPicker
            {accounts}
            choice={draft[tab]}
            label={tab === "yours" ? words.yours : words.delegates}
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
    <section
      data-slot="well"
      class="rounded-lg border border-border-well bg-surface-well px-space-6 py-space-5 max-phone:p-space-4"
    >
      <AtLimitBlock
        accounts={limitLanes}
        terms={provider === "anthropic"}
        bind:atLimit={draft.atLimit}
      />
    </section>
  {/if}
</EditorFrame>
