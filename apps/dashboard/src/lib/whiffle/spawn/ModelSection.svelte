<script lang="ts">
  /**
   * Model (§1.6, §2.9): harness tabs, one search/custom-id field, the model
   * list with the slide-swap on harness change. Codex is shown but disabled
   * ("Coming soon"); the list is the app's catalogue, canonical names only.
   */
  import { HARNESSES, type HarnessKind } from "@whiffle/core";
  import { untrack } from "svelte";
  import ProviderLogo from "$lib/components/features/ProviderLogo.svelte";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import { SectionHeader } from "$lib/components/ui/section-header";
  import { autowidth } from "$lib/whiffle/motion/autosize.svelte";
  import OpenAiMark from "~icons/logos/openai-icon";
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
  import { crossIn, crossOut, motionOk } from "../motion/curves.svelte";
  import Rail from "../motion/Rail.svelte";
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
  /**
   * Exit and entrance run over each other. The entrance takes a short lead so
   * the exit is visibly under way first — overlapping them without one made
   * the whole swap land ~240ms sooner than before and read as hurried.
   */
  const OUT_MS = 200;
  const OUT_STAGGER = 18;
  const IN_LEAD = 80;
  const IN_MS = 300;
  const IN_STAGGER = 40;
  /** Rows past this all leave together; a stagger that keeps growing down a
      forty-model list is a wait, not a rhythm. */
  const STAGGER_CAP = 9;
  /** How many leaving rows keep animating. The list shows about five. */
  const LEAVING = 8;
  let listHarness = $state<HarnessKind>(untrack(() => harness));
  let phase = $state<"in" | "idle">(untrack(() => (runtime ? "idle" : "in")));
  let slideDir = $state(1);
  let gen = $state(0);
  let query = $state("");
  let list = $state<HTMLDivElement>();
  /** The rows the last harness had, still on screen while the new ones arrive. */
  let leaving = $state<ModelEntry[]>([]);
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
  let toolsWidth = $state(0);

  $effect(() => {
    const next = harness;
    ensureModels(next);
    if (next === untrack(() => listHarness)) {
      return;
    }
    slideDir =
      HARNESSES.indexOf(next) > HARNESSES.indexOf(untrack(() => listHarness))
        ? 1
        : -1;
    // The new list mounts immediately and the old rows keep animating in a
    // layer above it, so the two staggers overlap. Swapping only after the
    // exit finished left a dead beat between them, and it also froze `pick`
    // for the whole of that wait.
    leaving = untrack(() => rows.slice(0, LEAVING));
    listHarness = next;
    gen += 1;
    query = "";
    phase = "in";
    // A different catalogue entirely; keeping the old scroll offset would
    // land mid-list and misalign the layer that is animating out.
    untrack(() => list)?.scrollTo({ top: 0 });
    const clear = setTimeout(
      () => {
        leaving = [];
      },
      motionOk.current ? OUT_MS + OUT_STAGGER * LEAVING : 0
    );
    return () => clearTimeout(clear);
  });
  $effect(() => {
    if (phase !== "in") {
      return;
    }
    const idle = setTimeout(
      () => {
        phase = "idle";
      },
      motionOk.current ? IN_LEAD + STAGGER_CAP * IN_STAGGER + IN_MS : 0
    );
    return () => clearTimeout(idle);
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
  function rowAnim(i: number) {
    if (phase !== "in") {
      return "none";
    }
    const step = Math.min(i, STAGGER_CAP);
    return `${slideDir > 0 ? "ns-in-r" : "ns-in-l"} ${IN_MS}ms var(--ease-out) both ${IN_LEAD + step * IN_STAGGER}ms`;
  }
  const leaveAnim = (i: number) =>
    `${slideDir > 0 ? "ns-out-l" : "ns-out-r"} ${OUT_MS}ms var(--ease-out) both ${i * OUT_STAGGER}ms`;
</script>

<section class="model">
  {#if !runtime}
    <SectionHeader hue="var(--hue-cyan-500)" icon={Cpu} {label} />
  {/if}
  <div class="picker" class:railed={!runtime}>
    {#if !runtime}
      <Rail
        axis="y"
        class="harness-rail"
        itemClass="harness-tab ns-in touch-hit press-tint"
        itemStyle={(i: number) => `--delay:${i * 30}ms`}
        items={railItems}
        label="Harness"
        onpick={(id: string) => onharness(id as HarnessKind)}
        value={harness}
      >
        {#snippet item(tab: (typeof railItems)[number])}
          {#if tab.id === "codex"}
            <OpenAiMark aria-hidden="true" class="codex-mark" />
          {:else}
            <HarnessLogo harness={tab.id as HarnessKind} />
          {/if}
          {#if tab.disabled}
            <span class="sr-only"
              >{tab.soon ? "Coming soon" : `Not installed on ${machineName}`}</span
            >
          {/if}
        {/snippet}
        {#snippet tipExtra(tab: (typeof railItems)[number])}
          {#if tab.soon}
            <span class="soon">soon</span>
          {:else if tab.disabled}
            <span class="soon">not installed</span>
          {/if}
        {/snippet}
      </Rail>
    {/if}
    <div class="pick">
      <label class="search field-underline">
        <Search class="lead" />
        <input
          aria-controls={`${uid}-models`}
          aria-label="Search models"
          autocapitalize="off"
          autocorrect="off"
          id={`${uid}-search`}
          oninput={(event) => { query = event.currentTarget.value; }}
          onkeydown={(event) => { if (event.key === 'Enter' && showCustomRow) { event.preventDefault(); pickCustom(); } else if (event.key === 'Escape' && query) { event.stopPropagation(); query = ''; } }}
          placeholder={`Search ${harnessName(listHarness)} models or paste a model id…`}
          spellcheck="false"
          value={query}
          {@attach autowidth(() => query)}
        >
        {#if query}
          <button
            aria-label="Clear"
            class="clear"
            onclick={() => { query = ''; }}
            type="button"
          >
            <Clear />
          </button>
        {/if}
      </label>

      <div
        aria-label={`${harnessName(listHarness)} models`}
        class="list fai-scroll"
        id={`${uid}-models`}
        role="listbox"
        style={`--tools-w:${tools && hiOpacity ? toolsWidth : 0}px`}
        tabindex="-1"
        bind:this={list}
        {@attach highlight({ rows: "[data-fh]" })}
      >
        <span
          aria-hidden="true"
          class="fill"
          style={`transform:translateY(calc(${modelIdx} * 46px));opacity:${hiOpacity}`}
        ></span>
        {#if tools}
          <!-- The chosen model's run settings travel with the selection fill, so
           picking another model carries them across rather than redrawing. -->
          <div
            class="tools"
            inert={!hiOpacity}
            style={`transform:translateY(calc(${modelIdx} * 46px));opacity:${hiOpacity}`}
            bind:clientWidth={toolsWidth}
          >
            <ToolChips {tools} />
          </div>
        {/if}
        {#if leaving.length}
          <div aria-hidden="true" class="leaving" inert>
            {#each leaving as entry, i (entry.id)}
              <div class="row" style={`animation:${leaveAnim(i)}`}>
                {@render rowBody(entry)}
              </div>
            {/each}
          </div>
        {/if}
        <!-- One slot for the custom row and the empty line, ahead of the rows:
             the one leaving keeps its place while the other fades in. -->
        {#if showCustomRow}
          <button
            class="row custom press-tint"
            data-fh="1"
            onclick={pickCustom}
            type="button"
            in:crossIn
            out:crossOut
          >
            <span class="ns-tile tile ink"><Code /></span>
            <span class="text">
              <span class="name">Use custom model id</span>
              <span class="meta mono">{query}</span>
            </span>
            <span class="hint">↵ Enter</span>
          </button>
        {:else if noResults}
          <div class="none" in:crossIn out:crossOut>
            {#if q}
              No {harnessName(listHarness)} models match "{query}"
            {:else}
              No {harnessName(listHarness)} models reported yet
            {/if}
          </div>
        {/if}
        {#each rows as entry, i (`${gen}:${entry.id}`)}
          {@const reason = unavailable?.(entry)}
          <button
            aria-disabled={reason ? true : undefined}
            aria-selected={entry.id === selectedId}
            class="row press-tint"
            data-fh="1"
            data-model={entry.id}
            disabled={Boolean(reason)}
            onclick={() => pick(entry)}
            role="option"
            style={`animation:${rowAnim(i)}`}
            type="button"
            class:picked={entry.id === selectedId}
          >
            {@render rowBody(entry, reason)}
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>

{#snippet rowBody(entry: ModelEntry, reason?: string)}
  {@const provider = providerOf(entry.id)}
  {#if mixedMakers}
    <span class="ns-tile tile vendor">
      {#if provider}
        <ProviderLogo model={entry.id} size={16} />
      {:else}
        <HarnessLogo harness={listHarness} />
      {/if}
    </span>
  {/if}
  <span class="text">
    <span class="name" class:mono={entry.mono}>{entry.name}</span>
    {#if reason}
      <span class="meta reason">{reason}</span>
    {:else}
      <span class="meta"
        ><span class="mono">{entry.id}</span>
        {vendor(entry.id) ? ` · ${vendor(entry.id)}` : ""}</span
      >
    {/if}
  </span>
  {#if ctx(entry)}
    <span class="ctx">{ctx(entry)}</span>
  {/if}
{/snippet}

<style>
  .model {
    display: grid;
    gap: 8px;
  }
  /* One panel: the harness rail down its left edge, search and list beside. */
  .picker {
    position: relative;
    display: grid;
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xs);
  }
  .picker.railed {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .pick {
    display: grid;
    min-width: 0;
  }
  /* One 36px radio plus its gap, which the thumb and the tip travel by. On
     a coarse pointer the gap opens to 8px, so each radio's touch area
     reaches 44px before meeting its neighbour's. */
  /* The harness rail (motion/Rail) down the panel's left edge: one 36px
     radio plus its gap per step. On a coarse pointer the gap opens to 8px,
     so each radio's touch area reaches 44px before meeting its neighbour's. */
  :global(.harness-rail) {
    --rail-step: 40px;
    --hit-gap-x: calc(var(--rail-step) - 36px);
    --hit-gap-y: calc(var(--rail-step) - 36px);
    display: grid;
    align-content: start;
    gap: calc(var(--rail-step) - 36px);

    @media (pointer: coarse) {
      --rail-step: 44px;
    }
    padding: 6px;
    border-right: 1px solid var(--border-hairline);
    background: var(--surface-recess);
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }
  :global(.harness-tab) {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
  }
  :global(.harness-tab .harness-logo),
  :global(.harness-tab .codex-mark) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .soon {
    font: var(--weight-strong) var(--text-label) / 1 var(--font-body);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    opacity: 0.6;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border-hairline);
  }
  .search :global(svg.lead) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-subtle);
  }
  .search input {
    flex: 1;
    height: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    font: var(--weight-body) var(--text-body) / 1.4 var(--font-body);
    color: var(--ink-strong);
    padding: 0;
  }
  .clear {
    display: inline-flex;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--ink-subtle);
    cursor: pointer;
    border-radius: var(--radius-xs);
  }
  .clear :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) {
    .clear:hover {
      color: var(--ink-strong);
    }
    .custom:hover {
      background: var(--surface-hover);
    }
  }
  .list {
    position: relative;
    display: grid;
    gap: 2px;
    align-content: start;
    height: 300px;
    /* Scrolls down only: the rows' 18px sideways slide on a harness change
       would otherwise overflow it and flash a horizontal scrollbar. */
    overflow: hidden auto;
    padding: 4px;
  }
  /* The outgoing rows, over the incoming ones so both staggers run at once. */
  .leaving {
    position: absolute;
    left: 4px;
    right: 4px;
    top: 4px;
    display: grid;
    gap: 2px;
    align-content: start;
    pointer-events: none;
  }
  .fill {
    position: absolute;
    left: 4px;
    right: 4px;
    top: 4px;
    height: 44px;
    background: var(--surface-fill);
    border-radius: var(--radius-sm);
    transition: opacity var(--dur-control) var(--ease-out);
    pointer-events: none;
    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform var(--dur-toggle) var(--ease-in-out),
        opacity var(--dur-control) var(--ease-out);
    }
  }
  /* The chosen row's run settings: effort and permission chips, riding the
     selection fill's transform so they slide to whichever model is picked. */
  .tools {
    position: absolute;
    top: 4px;
    right: 10px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 44px;
    transition: opacity var(--dur-control) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform var(--dur-toggle) var(--ease-in-out),
        opacity var(--dur-control) var(--ease-out);
    }
  }
  .tools :global(.ns-chip-btn.tool) {
    height: 28px;
    background: var(--surface-raised);
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 44px;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--ink-strong);
  }
  /* Room for the chips, so the chosen row's name ends before them. */
  .row.picked {
    padding-right: calc(var(--tools-w, 0px) + 14px);
  }
  .custom {
    background: var(--surface-raised);
    border: 1px dashed var(--neutral-8);
  }
  .tile {
    width: 26px;
    height: 26px;
  }
  .tile :global(svg) {
    width: 16px;
    height: 16px;
  }
  .vendor {
    overflow: hidden;
  }
  .vendor :global(svg),
  .vendor :global(.harness-logo) {
    width: 16px;
    height: 16px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: block;
    font: var(--type-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: block;
    font: var(--type-meta);
    color: var(--ink-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .custom .meta {
    color: var(--ink-muted);
  }
  /* A model that cannot take the job stays listed, with why, but inert. */
  .row:disabled {
    cursor: not-allowed;
  }
  .row:disabled .name,
  .row:disabled .tile {
    opacity: 0.5;
  }
  .reason {
    color: var(--ink-muted);
  }
  .hint,
  .ctx {
    font: var(--weight-body) var(--text-meta) / 1 var(--font-mono);
    color: var(--ink-subtle);
    white-space: nowrap;
  }
  .hint {
    font-family: var(--font-body);
  }
  .none {
    display: grid;
    place-items: center;
    gap: 6px;
    padding: 22px 12px;
    color: var(--ink-subtle);
    font: var(--type-meta);
    text-align: center;
    text-wrap: pretty;
  }
  @media (max-width: 640px) {
    .search {
      height: 44px;
    }
    .search input {
      font-size: 1rem;
    }
  }
</style>
