<script lang="ts">
  /**
   * Model (§1.6, §2.9): harness tabs, one search/custom-id field, the model
   * list with the slide-swap on harness change. Codex is shown but disabled
   * ("Coming soon"); the list is the app's catalogue, canonical names only.
   */
  import { HARNESSES, type HarnessKind } from "@cawco/core";
  import { untrack } from "svelte";
  import { crossfade } from "svelte/transition";
  import { autowidth } from "#lib/cawco/motion/autosize.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import Clear from "~icons/solar/close-square-bold-duotone";
  import Code from "~icons/solar/code-square-bold-duotone";
  import Cpu from "~icons/solar/cpu-bolt-bold-duotone";
  import Search from "~icons/solar/magnifer-bold-duotone";
  import HarnessLogo from "../HarnessLogo.svelte";
  import {
    ensureModels,
    models,
    providerOf,
    rememberModel,
  } from "../models.svelte";
  import {
    crossIn,
    crossOut,
    dur,
    easeInOut,
    lifting,
    motionOk,
    pinned,
  } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { ListSwap } from "../motion/list-swap.svelte";
  import Rail from "../motion/Rail.svelte";
  import AccountChip, { type AccountTool } from "./AccountChip.svelte";
  import {
    deriveModelEntries,
    groupModelEntries,
    isIdShaped,
    type ModelEntry,
    matchesQuery,
  } from "./model-entries";
  import { lastSpawnAt, lastUsedAt, type ModelUse } from "./modelUse.svelte";
  import ToolChips, { type ModelTools } from "./ToolChips.svelte";

  let {
    harness,
    onharness,
    installed,
    machineName,
    machineIds,
    model,
    onmodel,
    runtime = false,
    tools,
    account,
    label = "Model",
    unavailable,
  }: {
    harness: HarnessKind;
    onharness: (harness: HarnessKind) => void;
    installed: HarnessKind[];
    machineName: string;
    /** The machines the model will run on: only what they can resolve is listed. */
    machineIds: string[];
    model: string;
    onmodel: (id: string) => void;
    runtime?: boolean;
    tools?: ModelTools;
    /**
     * The account the session runs on, a chip on the heading's line: it
     * follows the harness, not the model row, so it never takes a row's room.
     * Absent where there is no choice.
     */
    account?: AccountTool | null;
    /** The section's heading. */
    label?: string;
    /** Why a model cannot be picked here, shown on its row; nothing when it can. */
    unavailable?: (entry: ModelEntry) => string | undefined;
  } = $props();
  const uid = $props.id();
  type TabId = HarnessKind | "codex";
  const TABS: { id: TabId; name: string; soon?: boolean }[] = [
    { id: "claude", name: "Claude Code" },
    { id: "codex", name: "Codex", soon: true },
    { id: "opencode", name: "OpenCode" },
    { id: "pi", name: "Pi" },
  ];
  const VENDOR: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    deepseek: "DeepSeek",
    moonshot: "Moonshot AI",
    qwen: "Qwen",
    xai: "xAI",
    zhipu: "Z.ai",
    minimax: "MiniMax",
    mistral: "Mistral",
    meta: "Meta",
    nvidia: "NVIDIA",
  };
  const harnessName = (kind: HarnessKind) =>
    TABS.find((tab) => tab.id === kind)?.name ?? kind;
  let listHarness = $state<HarnessKind>(untrack(() => harness));
  /** The harness change's list swap (motion/list-swap). */
  const swap = new ListSwap<ModelEntry>(untrack(() => !runtime));
  let query = $state("");
  let list = $state<HTMLDivElement>();
  /**
   * The rail (motion/Rail) shows marks only; the name rides one label that
   * slides and re-labels between them. Codex is listed but not pickable yet.
   */
  const railItems = $derived(
    TABS.map((tab) => ({
      id: tab.id,
      label: tab.name,
      soon: tab.soon,
      disabled: tab.soon || !installed.includes(tab.id as HarnessKind),
    }))
  );
  let accountOpen = $state(false);

  /**
   * The chosen option's height: its row, and the line its chips dropped to
   * when the row could not hold them beside its name. The fill stands on the
   * whole of it.
   */
  let chosenHeight = $state(44);
  const chosen = (node: HTMLElement) => {
    const sized = new ResizeObserver(() => {
      chosenHeight = node.offsetHeight;
    });
    sized.observe(node);
    chosenHeight = node.offsetHeight;
    return () => sized.disconnect();
  };

  /**
   * The chosen model's run settings glide from the row it leaves to the one
   * picked, beside the fill. The pair stands in the flow of each; the one
   * leaving is lifted out of it as it goes (motion/curves `lifting`), so only
   * the picked option is ever taller than a row. Without motion, or with no
   * pair to glide from, they cross-fade in place.
   */
  const [send, receive] = crossfade({
    duration: () => dur("--dur-toggle"),
    easing: easeInOut,
    fallback: (node) => crossIn(node),
  });
  const TOOLS = { key: "tools" };
  const toolsIn = (node: HTMLElement) =>
    motionOk.current ? receive(node, TOOLS) : crossIn(node);
  const toolsOut = (node: HTMLElement) => {
    if (!motionOk.current) {
      return crossOut(node);
    }
    const glide = send(node, TOOLS);
    return () => lifting(node, pinned(node), glide());
  };
  /**
   * The chips' line, on a line of its own under the name (a phone), folds
   * open and shut from its drawn height (motion/fold `unfold`): the option
   * leaving and the one picked change height together, so no row between
   * them steps by a line (DESIGN, The Interruptible Rule). Only the fold's
   * height and edges: its clip would cut the chips gliding in through the
   * line, and its fade would fade them twice. Beside the name the line is
   * the row's own, and has no height of its own to fold.
   */
  const FOLDS = /^(height|padding|border|margin)/;
  const line = (
    node: HTMLElement,
    _: unknown,
    options: { direction?: "in" | "out" | "both" }
  ) => {
    if (node.offsetTop === 0) {
      return { duration: 0 };
    }
    const fold = unfold(node, {}, options);
    const { css } = fold;
    // A whole line to itself while it folds: emptied of its chips as they
    // glide away, it would fit beside the name again and leave its line at once.
    return {
      ...fold,
      css:
        css &&
        ((t: number, u: number) =>
          [
            "flex-basis: 100%",
            ...css(t, u)
              .split("; ")
              .filter((one) => FOLDS.test(one)),
          ].join("; ")),
    };
  };

  $effect(() => {
    const next = harness;
    ensureModels(next);
    if (next === untrack(() => listHarness)) {
      return;
    }
    // The new list mounts immediately and the old rows keep animating in a
    // layer above it, so the two staggers overlap. Swapping only after the
    // exit finished left a dead beat between them, and it also froze `pick`
    // for the whole of that wait.
    swap.swap(
      untrack(() => rows),
      HARNESSES.indexOf(next) > HARNESSES.indexOf(untrack(() => listHarness))
        ? 1
        : -1
    );
    listHarness = next;
    query = "";
    // A different catalogue entirely; keeping the old scroll offset would
    // land mid-list and misalign the layer that is animating out.
    untrack(() => list)?.scrollTo({ top: 0 });
  });

  const catalog = $derived(models.forHarness(listHarness, machineIds));
  const use = $derived.by<ModelUse>(() => ({
    lastSpawnAt: lastSpawnAt(listHarness),
    lastUsedAt: Object.fromEntries(
      [
        ...catalog.map((row) => row.resolvedModel ?? row.value),
        ...models.recent,
      ].flatMap((id) => {
        const used = lastUsedAt(listHarness, id);
        return used ? [[id, used]] : [];
      })
    ),
  }));
  const entries = $derived(deriveModelEntries(catalog, use));
  const q = $derived(query.trim().toLowerCase());
  const rows = $derived(
    groupModelEntries(entries, use, models.recent).flatMap((group) =>
      group.entries.filter((entry) => !q || matchesQuery(entry, q))
    )
  );
  const selectedId = $derived(
    model || entries.find((entry) => entry.isDefault)?.id || ""
  );
  const exact = $derived(
    entries.some(
      (entry) =>
        entry.id.toLowerCase() === q ||
        entry.aliases.some((alias) => alias.toLowerCase() === q)
    ) || models.recent.some((id) => id.toLowerCase() === q)
  );
  const showCustomRow = $derived(
    q.length > 2 && !exact && isIdShaped(query.trim())
  );
  const noResults = $derived(rows.length === 0 && !showCustomRow);
  const modelIdx = $derived(
    Math.max(
      0,
      rows.findIndex((row) => row.id === selectedId)
    ) + (showCustomRow ? 1 : 0)
  );
  const hiOpacity = $derived(rows.some((row) => row.id === selectedId) ? 1 : 0);
  const ctx = (entry: ModelEntry) => (entry.name.endsWith("· 1M") ? "1M" : "");
  const vendor = (id: string) => VENDOR[providerOf(id) ?? ""] ?? "";
  /** One maker for the whole list says nothing per row; mixed lists do. */
  const mixedMakers = $derived(
    new Set(entries.map((entry) => providerOf(entry.id) ?? "")).size > 1
  );
  function pick(entry: ModelEntry) {
    if (entry.isCustom) {
      rememberModel(entry.id);
    }
    onmodel(entry.id);
  }
  function pickCustom() {
    const id = query.trim();
    rememberModel(id);
    onmodel(id);
    query = "";
  }
</script>

<!-- literal: 8px gap -->
<section data-slot="model" class="grid gap-(--gap)" style:--gap="8px">
  {#if !runtime}
    <SectionHeader hue="var(--hue-cyan-500)" icon={Cpu} {label}>
      {#snippet right()}
        {#if account}
          <span class="flex min-w-0 justify-end">
            <AccountChip
              id={uid}
              onchange={(value) => {
                accountOpen = value;
              }}
              open={accountOpen}
              tool={account}
            />
          </span>
        {/if}
      {/snippet}
    </SectionHeader>
  {/if}
  <!-- literal: rail 40px step (44px on a coarse pointer), 36px radio, 6px padding -->
  <div
    data-slot="picker"
    class="relative grid rounded-md border border-border-control bg-surface-raised shadow-xs rail-step-(--rail-step-fine) coarse:rail-step-(--rail-step-coarse) data-railed:grid-cols-(--cols)"
    data-railed={!runtime || undefined}
    style:--cols="auto minmax(0, 1fr)"
    style:--hit-gap-x="calc(var(--rail-step) - var(--rail-radio))"
    style:--hit-gap-y="calc(var(--rail-step) - var(--rail-radio))"
    style:--rail-gap="calc(var(--rail-step) - var(--rail-radio))"
    style:--rail-pad="6px"
    style:--rail-radio="36px"
    style:--rail-step-coarse="44px"
    style:--rail-step-fine="40px"
  >
    {#if !runtime}
      <Rail
        axis="y"
        class="grid content-start gap-(--rail-gap) rounded-l-md border-r border-r-border-hairline bg-surface-recess p-(--rail-pad)"
        itemClass="ns-in touch-hit press-tint grid size-(--rail-radio) place-items-center"
        stagger={30}
        items={railItems}
        label="Harness"
        onpick={(id: string) => onharness(id as HarnessKind)}
        value={harness}
      >
        {#snippet item(tab: (typeof railItems)[number])}
          {#if tab.id === "codex"}
            <ProviderLogo
              class="size-icon-md flex-none"
              provider="openai"
              size={16}
            />
          {:else}
            <HarnessLogo harness={tab.id as HarnessKind} />
          {/if}
          {#if tab.disabled}
            <span class="sr-only"
              >{tab.soon
                ? "Coming soon"
                : `Not installed on ${machineName}`}</span
            >
          {/if}
        {/snippet}
        {#snippet tipExtra(tab: (typeof railItems)[number])}
          {#if tab.soon}
            <span
              class="font-body text-size-label leading-none font-medium tracking-caps uppercase opacity-60"
              >soon</span
            >
          {:else if tab.disabled}
            <span
              class="font-body text-size-label leading-none font-medium tracking-caps uppercase opacity-60"
              >not installed</span
            >
          {/if}
        {/snippet}
      </Rail>
    {/if}
    <div data-slot="pick" class="grid min-w-0">
      <!-- literal: 8px gap, 42px / 44px height, 12px inline padding -->
      <label
        data-slot="search"
        class="field-underline flex h-(--h) max-phone:h-(--h-phone) items-center gap-(--gap) border-b border-b-border-hairline px-(--pad-x)"
        style:--gap="8px"
        style:--h="42px"
        style:--h-phone="44px"
        style:--pad-x="12px"
      >
        <Search
          data-model-section-lead
          class="size-icon-md flex-none text-ink-subtle"
        />
        <!-- literal: 1.4 line height, 1rem on a phone -->
        <input
          aria-controls={`${uid}-models`}
          aria-label="Search models"
          autocapitalize="off"
          autocorrect="off"
          class="h-full min-w-0 flex-1 border-none border-current bg-transparent p-0 font-body text-size-body leading-(--lh) font-normal text-ink-strong max-phone:text-(length:--fs-phone)"
          id={`${uid}-search`}
          oninput={(event) => {
            query = event.currentTarget.value;
          }}
          onkeydown={(event) => {
            if (event.key === "Enter" && showCustomRow) {
              event.preventDefault();
              pickCustom();
            } else if (event.key === "Escape" && query) {
              event.stopPropagation();
              query = "";
            }
          }}
          placeholder="Search or paste a model id…"
          spellcheck="false"
          style:--fs-phone="1rem"
          style:--lh="1.4"
          value={query}
          {@attach autowidth(() => query)}
        />
        {#if query}
          <!-- literal: 22px box -->
          <button
            data-slot="clear"
            aria-label="Clear"
            class="inline-flex size-(--box) cursor-pointer items-center justify-center rounded-xs border-none border-current bg-transparent text-ink-subtle hover:text-ink-strong"
            onclick={() => {
              query = "";
            }}
            style:--box="22px"
            type="button"
          >
            <Clear class="size-icon-md" />
          </button>
        {/if}
      </label>

      <!-- literal: 300px height, 4px padding -->
      <div
        data-slot="list"
        aria-label={`${harnessName(listHarness)} models`}
        class="fai-scroll relative grid h-(--h) content-start gap-space-row overflow-x-hidden overflow-y-auto p-space-1"
        id={`${uid}-models`}
        role="listbox"
        style:--h="300px"
        tabindex="-1"
        bind:this={list}
        {@attach highlight({ rows: "[data-fh]" })}
      >
        <!-- Every option above the chosen one is a row (46px a step), so the
             fill travels by its index; it is as tall as the chosen option. -->
        <span
          data-slot="fill"
          aria-hidden="true"
          class="pointer-events-none absolute top-space-1 right-space-1 left-space-1 h-(--h) transform-(--shift) rounded-sm bg-surface-fill opacity-(--o) transition-[opacity] dur-control ease-out motion-safe:transition-panel-resize"
          style:--h={`${chosenHeight}px`}
          style:--o={hiOpacity}
          style:--shift={`translateY(calc(${modelIdx} * 46px))`}
        ></span>
        {#if swap.leaving.length}
          <div
            aria-hidden="true"
            class="pointer-events-none absolute top-space-1 right-space-1 left-space-1 grid content-start gap-space-row"
            data-leaving
            inert
          >
            {#each swap.leaving as entry, i (entry.id)}
              <!-- literal: 10px gap, 44px height, 6px 8px padding -->
              <div
                data-slot="row"
                class="group relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm px-(--pad-x) py-(--pad-y) text-left text-ink-strong disabled:cursor-not-allowed animate-(--anim) border border-transparent bg-transparent"
                style:--anim={swap.leaveAnim(i)}
                style:--gap="10px"
                style:--h="44px"
                style:--pad-x="8px"
                style:--pad-y="6px"
              >
                {@render rowBody(entry)}
              </div>
            {/each}
          </div>
        {/if}
        <!-- One slot for the custom row and the empty line, ahead of the rows:
             the one leaving keeps its place while the other fades in. -->
        {#if showCustomRow}
          <!-- literal: 10px gap, 44px height, 6px 8px padding, 26px tile -->
          <button
            data-slot="row"
            class="group relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm px-(--pad-x) py-(--pad-y) text-left text-ink-strong disabled:cursor-not-allowed press-tint border border-dashed border-neutral-8 bg-surface-raised hover:bg-surface-hover"
            data-fh="1"
            onclick={pickCustom}
            style:--gap="10px"
            style:--h="44px"
            style:--pad-x="8px"
            style:--pad-y="6px"
            type="button"
            in:crossIn
            out:crossOut
          >
            <span
              data-slot="tile"
              class="ns-tile size-(--tile)"
              data-variant="ink"
              style:--tile="26px"><Code class="size-icon-md" /></span
            >
            <span data-slot="text" class="min-w-0 flex-1">
              <span
                data-slot="name"
                class="type-label block truncate group-disabled:opacity-50"
                >Use custom model id</span
              >
              <span
                data-slot="meta"
                class="block truncate font-(family-name:--font-mono) text-size-meta leading-meta font-normal text-ink-muted"
                >{query}</span
              >
            </span>
            <span
              class="font-body text-size-meta leading-none font-normal whitespace-nowrap text-ink-subtle"
              >↵ Enter</span
            >
          </button>
        {:else if noResults}
          <!-- literal: 6px gap, 22px 12px padding -->
          <div
            class="type-meta grid place-items-center gap-(--gap) px-(--pad-x) py-(--pad-y) text-center text-pretty text-ink-subtle"
            style:--gap="6px"
            style:--pad-x="12px"
            style:--pad-y="22px"
            in:crossIn
            out:crossOut
          >
            {#if q}
              No {harnessName(listHarness)} models match "{query}"
            {:else}
              No {harnessName(listHarness)} models reported yet
            {/if}
          </div>
        {/if}
        {#each rows as entry, i (`${swap.gen}:${entry.id}`)}
          {@const reason = unavailable?.(entry)}
          {@const picked = entry.id === selectedId}
          <!-- A row, and on the chosen one its run settings, in its flow: at
               the row's end while the row holds its name beside them, on a
               line of their own under it where it cannot (a phone). -->
          <div
            data-slot="option"
            class="relative flex animate-(--anim) flex-wrap items-center justify-end"
            style:--anim={swap.rowAnim(i)}
            {@attach picked && tools ? chosen : undefined}
          >
            <!-- literal: 10px gap, 44px height, 6px 8px padding, 12rem basis -->
            <button
              data-slot="row"
              aria-disabled={reason ? true : undefined}
              aria-selected={picked}
              class="group relative flex h-(--h) w-full cursor-pointer items-center gap-(--gap) rounded-sm px-(--pad-x) py-(--pad-y) text-left text-ink-strong disabled:cursor-not-allowed press-tint min-w-0 shrink grow basis-(--basis) border border-transparent bg-transparent"
              data-fh="1"
              data-model={entry.id}
              disabled={Boolean(reason)}
              onclick={() => pick(entry)}
              role="option"
              style:--basis="12rem"
              style:--gap="10px"
              style:--h="44px"
              style:--pad-x="8px"
              style:--pad-y="6px"
              type="button"
            >
              {@render rowBody(entry, reason)}
            </button>
            {#if picked && tools}
              <!-- The chips' line folds open and shut under the name, so the
                   rows after it glide; the chips glide between rows in it. -->
              <!-- literal: 44px height, 4px / 6px inline padding, 28px chips -->
              <div
                data-slot="tools"
                class="flex h-(--h) flex-none items-center justify-end ps-space-1 pe-(--pe)"
                style:--chip-h="28px"
                style:--h="44px"
                style:--pe="6px"
                in:line
                out:line
              >
                <div
                  data-slot="chips"
                  class="flex items-center gap-space-1"
                  in:toolsIn
                  out:toolsOut
                >
                  <ToolChips {tools} />
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

{#snippet rowBody(entry: ModelEntry, reason?: string)}
  {@const provider = providerOf(entry.id)}
  {#if mixedMakers}
    <!-- literal: 26px tile -->
    <span
      data-slot="tile"
      class="ns-tile size-(--tile) overflow-hidden group-disabled:opacity-50"
      style:--tile="26px"
    >
      {#if provider}
        <ProviderLogo class="size-icon-md" model={entry.id} size={16} />
      {:else}
        <HarnessLogo harness={listHarness} />
      {/if}
    </span>
  {/if}
  <span data-slot="text" class="min-w-0 flex-1">
    <span
      data-slot="name"
      class="type-label block truncate group-disabled:opacity-50 data-mono:font-(family-name:--font-mono)"
      data-mono={entry.mono || undefined}>{entry.name}</span
    >
    {#if reason}
      <span
        data-slot="reason"
        data-meta
        class="type-meta block truncate text-ink-muted">{reason}</span
      >
    {:else}
      <span data-slot="meta" class="type-meta block truncate text-ink-subtle"
        ><span class="font-(family-name:--font-mono)">{entry.id}</span>
        {vendor(entry.id) ? ` · ${vendor(entry.id)}` : ""}</span
      >
    {/if}
  </span>
  {#if ctx(entry)}
    <span
      class="font-(family-name:--font-mono) text-size-meta leading-none font-normal whitespace-nowrap text-ink-subtle"
      >{ctx(entry)}</span
    >
  {/if}
{/snippet}

<style>
  /* residual: foreign-dom */
  [data-slot="tools"] :global(.ns-chip-btn[data-tool]) {
    height: var(--chip-h);
    background: var(--surface-raised);
  }
</style>
