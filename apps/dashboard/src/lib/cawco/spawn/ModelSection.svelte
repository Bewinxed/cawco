<script lang="ts">
  import {
    descriptorOf,
    HARNESSES,
    type HarnessKind,
  } from "@cawco/core/harness/kinds";
  import { modelRun } from "@cawco/core/model-names";
  /**
   * Model (§1.6, §2.9): harness tabs, one search/custom-id field, the model
   * list with the slide-swap on harness change; the list is the app's
   * catalogue, canonical names only.
   */
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import { spawnWords } from "@cawco/core/words/spawn";
  import { untrack } from "svelte";
  import { crossfade } from "svelte/transition";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { pressVariants } from "#lib/components/ui/button/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { provideGlide } from "#lib/components/ui/tooltip/glide.js";
  import GlideTip from "#lib/components/ui/tooltip/glide-tip.svelte";
  import {
    IconCloseTab as Clear,
    IconTerminal as Code,
    IconCpuBolt as Cpu,
    IconSearch as Search,
  } from "#lib/icons.js";
  import { autowidth } from "#lib/platform/motion/autosize.svelte.js";
  import {
    crossIn,
    crossOut,
    dur,
    easeInOut,
    lifting,
    motionOk,
    pinned,
  } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { ListSwap } from "#lib/platform/motion/list-swap.svelte.js";
  import Rail from "#lib/platform/motion/Rail.svelte";
  import type { LimitRow } from "../accounts/room";
  import HarnessLogo from "../HarnessLogo.svelte";
  import { models, rememberModel } from "../models.svelte";
  import PickRow from "../pick/PickRow.svelte";
  import { providerOf } from "../provider";
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
    label = spawnWords.form.model,
    unavailable,
    limitOf,
    onforce,
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
    /**
     * A model's limit on the account it would run on (accounts/room.ts
     * `limitRowOf`): its row's second line, and whether it is at its limit,
     * checked again, or holding its pick. Absent where no account binds it.
     */
    limitOf?: (id: string) => LimitRow | undefined;
    /** Pick anyway on a row holding its pick past a limit. */
    onforce?: (id: string) => void;
  } = $props();
  const uid = $props.id();
  /** The list's one tooltip, gliding row to row (glide.ts), as a bar's glass has one. */
  const tips = provideGlide();
  const TABS: { id: HarnessKind; name: string }[] = HARNESSES.map((id) => ({
    id,
    name: descriptorOf(id).words.name,
  }));
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
   * slides and re-labels between them.
   */
  const railItems = $derived(
    TABS.map((tab) => ({
      id: tab.id,
      label: tab.name,
      disabled: !installed.some((kind) => kind === tab.id),
    }))
  );
  let accountOpen = $state(false);

  /**
   * The chosen model's run settings glide from the row it leaves to the one
   * picked, beside the fill. The pair stands in the flow of each; the one
   * leaving is lifted out of it as it goes (motion/curves `lifting`), so only
   * the picked option is ever taller than a row. Without motion, or with no
   * pair to glide from, they cross-fade in place.
   */
  const [send, receive] = crossfade({
    duration: () => dur("--duration-fade"),
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
  const FOLDS = /^(height|padding|border|margin)/u;
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
  const recent = $derived(models.recentFor(listHarness, machineIds));
  const use = $derived.by<ModelUse>(() => ({
    lastSpawnAt: lastSpawnAt(listHarness),
    lastUsedAt: Object.fromEntries(
      [...catalog.map(modelRun), ...recent].flatMap((id) => {
        const used = lastUsedAt(listHarness, id);
        return used ? [[id, used]] : [];
      })
    ),
  }));
  const entries = $derived(deriveModelEntries(catalog, use));
  const q = $derived(query.trim().toLowerCase());
  const rows = $derived(
    groupModelEntries(entries, use, recent).flatMap((group) =>
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
    ) || recent.some((id) => id.toLowerCase() === q)
  );
  /**
   * The typed id as a row of its own, when it is one the hub would start a
   * session on here (models `admits`); one it would refuse is never offered.
   */
  const showCustomRow = $derived(
    q.length > 2 &&
      !exact &&
      isIdShaped(query.trim()) &&
      models.admits(listHarness, query.trim(), machineIds)
  );
  /** Why the harness lists nothing to pick here, when its list is unread. */
  const unread = $derived(models.unread(listHarness, machineIds));
  const noResults = $derived(rows.length === 0 && !showCustomRow);
  const vendor = (id: string) => VENDOR[providerOf(id) ?? ""] ?? "";
  function pick(entry: ModelEntry) {
    if (entry.isCustom) {
      rememberModel(entry.id, listHarness);
    }
    onmodel(entry.id);
  }
  function pickCustom() {
    const id = query.trim();
    rememberModel(id, listHarness);
    onmodel(id);
    query = "";
  }
</script>

<section data-slot="model" class="grid gap-space-2">
  {#if !runtime}
    <SectionHeader hue="var(--color-mark-6)" icon={Cpu} {label}>
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
  <div
    data-slot="picker"
    class="field-edge transition-control relative grid rounded-md border bg-surface-raised shadow-xs rail-step-(--rail-step-fine) coarse:rail-step-(--spacing-control-lg) data-railed:grid-cols-(--cols)"
    data-railed={!runtime || undefined}
    style:--cols="auto minmax(0, 1fr)"
    style:--rail-gap="calc(var(--rail-step) - var(--spacing-control-md))"
    style:--rail-step-fine={"calc(var(--spacing-control-md) + var(--spacing-space-1))"}
  >
    {#if !runtime}
      <Rail
        axis="y"
        class="grid content-box-start gap-(--rail-gap) hit-gap-x-(--rail-gap) hit-gap-y-(--rail-gap) rounded-s-md concentric-in r-outer-md r-inset-space-2 border-e border-e-border-hairline bg-surface-recess p-space-2"
        itemClass="ns-in touch-hit press-tint grid size-control-md place-items-center"
        stagger
        items={railItems}
        label={spawnWords.model.harness}
        onpick={(id: string) => {
          const picked = TABS.find((tab) => tab.id === id);
          if (picked) {
            onharness(picked.id);
          }
        }}
        value={harness}
      >
        {#snippet item(tab: (typeof railItems)[number])}
          <HarnessLogo harness={tab.id} />
          {#if tab.disabled}
            <span class="sr-only"
              >{spawnWords.model.notInstalledOn(machineName)}</span
            >
          {/if}
        {/snippet}
        {#snippet tipExtra(tab: (typeof railItems)[number])}
          {#if tab.disabled}
            <span
              class="font-sans text-size-label leading-none font-medium tracking-caps uppercase opacity-60"
              >{spawnWords.model.notInstalled}</span
            >
          {/if}
        {/snippet}
      </Rail>
    {/if}
    <div data-slot="pick" class="grid min-w-0">
      <label
        data-slot="search"
        class="flex h-control-lg items-center gap-space-2 border-b border-b-border-hairline px-space-3"
      >
        <Search
          data-model-section-lead
          class="size-icon-md flex-none text-ink-subtle"
        />
        <input
          aria-controls={`${uid}-models`}
          aria-label={spawnWords.searchModels}
          autocapitalize="off"
          autocorrect="off"
          class="h-full min-w-0 flex-1 border-none border-current bg-transparent p-0 type-body text-ink-strong placeholder:text-ink-muted"
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
          placeholder={spawnWords.model.search}
          spellcheck="false"
          value={query}
          {@attach autowidth(() => query)}
        />
        {#if query}
          <button
            data-slot="clear"
            aria-label={spawnWords.model.clear}
            class={pressVariants({
              press: "scale",
              class:
                "select-none inline-flex size-space-6 items-center justify-center rounded-xs border-none border-current bg-transparent text-ink-subtle hover:text-ink-strong",
            })}
            onclick={() => {
              query = "";
            }}
            type="button"
          >
            <Clear class="size-icon-md" />
          </button>
        {/if}
      </label>

      <div
        data-slot="list"
        aria-label={spawnWords.model.list(harnessName(listHarness))}
        class="fai-scroll relative grid h-75 content-box-start gap-space-row overflow-x-hidden overflow-y-auto p-space-1"
        id={`${uid}-models`}
        role="listbox"
        tabindex="-1"
        bind:this={list}
        {@attach highlight({ rows: "[data-pick-row]" })}
      >
        {#if swap.leaving.length}
          <div
            aria-hidden="true"
            class="pointer-events-none absolute top-space-1 right-space-1 left-space-1 grid content-box-start gap-space-row"
            data-leaving
            inert
          >
            {#each swap.leaving as entry (entry.id)}
              <div style:animation={swap.leaveAnim()}>
                {@render row(entry, false)}
              </div>
            {/each}
          </div>
        {/if}
        <!-- One slot for the custom row and the empty line, ahead of the rows:
             the one leaving keeps its place while the other fades in. -->
        {#if showCustomRow}
          <div in:crossIn out:crossOut>
            <PickRow
              detail={query}
              full={query}
              mono
              name={spawnWords.model.custom}
              onpick={pickCustom}
              picked={false}
            >
              {#snippet lead()}
                <Code class="size-icon-md text-ink-muted" />
              {/snippet}
            </PickRow>
          </div>
        {:else if noResults}
          <div
            data-slot="none"
            class="type-meta grid place-items-center gap-space-2 px-space-3 py-space-6 text-center text-pretty text-ink-subtle"
            in:crossIn
            out:crossOut
          >
            {#if unread}
              {unread}
            {:else if q}
              {spawnWords.model.noMatch(harnessName(listHarness), query)}
            {:else}
              {spawnWords.model.noneReported(harnessName(listHarness))}
            {/if}
          </div>
        {/if}
        {#each rows as entry, i (`${swap.gen}:${entry.id}`)}
          {@const picked = entry.id === selectedId}
          <!-- A row, and on the chosen one its run settings, in its flow: at
               the row's end while the row holds its name beside them, on a
               line of their own under it where it cannot (a phone). -->
          <div
            data-slot="option"
            class="relative flex flex-wrap items-center justify-end"
            style:animation={swap.rowAnim(i)}
          >
            <div class="min-w-0 shrink grow basis-48">
              {@render row(entry, true)}
            </div>
            {#if picked && tools}
              <!-- The chips' line folds open and shut under the name, so the
                   rows after it glide; the chips glide between rows in it. -->
              <div
                data-slot="tools"
                class="flex h-control-lg flex-none items-center justify-end ps-space-1 pe-space-2"
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
<GlideTip tether={tips} />

<!-- Every model is a PickRow (one row for every account and model list):
     its maker's mark, its name, and its second line: why it can't be picked,
     the limit it is at on the account it would run on (`limitOf`), or its
     id. -->
{#snippet row(entry: ModelEntry, live: boolean)}
  {@const reason = unavailable?.(entry)}
  {@const limit = reason ? undefined : limitOf?.(entry.id)}
  {@const detail = reason ?? limit?.detail ?? entry.id}
  <PickRow
    checking={live && Boolean(limit?.checking)}
    {detail}
    disabled={Boolean(reason)}
    force={live && limit?.held && onforce
      ? {
          action: limitPickWords.pickAnyway,
          onforce: () => onforce(entry.id),
        }
      : undefined}
    full={[
      `${entry.id}${vendor(entry.id) ? ` · ${vendor(entry.id)}` : ""}`,
      reason || limit ? detail : null,
      limit?.why,
    ]
      .filter(Boolean)
      .join("\n")}
    limited={Boolean(limit?.limited)}
    mono={!(reason || limit)}
    name={entry.name}
    onpick={() => {
      if (live) {
        pick(entry);
      }
    }}
    picked={live && entry.id === selectedId}
  >
    {#snippet lead()}
      {#if providerOf(entry.id)}
        <ProviderLogo model={entry.id} size="control" />
      {:else}
        <HarnessLogo harness={listHarness} />
      {/if}
    {/snippet}
  </PickRow>
{/snippet}
