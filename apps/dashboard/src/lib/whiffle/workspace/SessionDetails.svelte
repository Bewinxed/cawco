<script lang="ts" module>
  const HOME = /^\/(home|Users)\/[^/]+/;
</script>

<script lang="ts">
  import type { EffortLevel, HarnessKind, PermissionMode } from "@whiffle/core";
  import { onDestroy, untrack } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { TextMorph } from "torph/svelte";
  import ProviderLogo from "$lib/components/features/ProviderLogo.svelte";
  import { IconCheck } from "$lib/icons";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Link from "~icons/solar/link-bold-duotone";
  import {
    latestCommandFor,
    refreshContext,
    relaunchSession,
    submitCommand,
    whiffle,
  } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import { copyToClipboard } from "../copy";
  import HarnessLogo from "../HarnessLogo.svelte";
  import { describingRow, ensureModels } from "../models.svelte";
  import { crossIn, crossOut, dur } from "../motion/curves.svelte";
  import { PERMISSION_MODES } from "../permission-modes";
  import ModelSection from "../spawn/ModelSection.svelte";
  import { modelName } from "../spawn/model-entries";
  import NsPopover from "../spawn/NsPopover.svelte";
  import ToolChips from "../spawn/ToolChips.svelte";
  import "../spawn/ns-theme.css";
  import SessionStatus from "./SessionStatus.svelte";
  import { contextOf } from "./workspace.svelte";

  let {
    sessionId,
    title,
    href,
    onclose,
    dir,
  }: {
    sessionId: string;
    title: string;
    href: string;
    onclose: () => void;
    /** Which way the card moved to reach this session: 1 rightward, -1 leftward. */
    dir: 1 | -1;
  } = $props();
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  const morphMs = $derived(reduceMotion.current ? 0 : 150);
  let metaEl = $state<HTMLElement>();
  let statsEl = $state<HTMLElement>();
  /** The harness mark arrives from the side the card moved toward. */
  function harnessIn(_node: Element): TransitionConfig {
    return {
      duration: reduceMotion.current ? 0 : 180,
      easing: cubicOut,
      css: (t) =>
        `transform: translateX(calc(${(1 - t) * 8}px * var(--dir))); opacity: ${t}`,
    };
  }
  const uid = $props.id();
  const session = $derived(whiffle.session(sessionId));
  const row = $derived(whiffle.instanceIndex.byId.get(sessionId));
  const context = $derived(contextOf(sessionId));
  const machineId = $derived(
    session?.machineId || row?.machineId || context?.machine
  );
  const machine = $derived(
    whiffle.machines.find((item) => item.machineId === machineId)
  );
  const harness = $derived(
    (session?.harness || row?.harness || context?.harness) as
      | HarnessKind
      | undefined
  );
  const report = $derived(
    machine?.harnesses?.find((item) => item.harness === harness)
  );
  const cwd = $derived(session?.cwd || row?.cwd || context?.cwd || "");
  const stats = $derived(whiffle.statsOf(sessionId));
  const model = $derived(session?.model ?? null);
  const modelInfo = $derived(model ? describingRow(model) : null);
  const efforts = $derived(
    report?.capabilities.effort ? (modelInfo?.supportedEffortLevels ?? []) : []
  );
  const modes = $derived(
    PERMISSION_MODES.filter((mode) =>
      report?.capabilities.permissionModes.includes(mode.value)
    )
  );
  const editable = $derived(
    whiffle.status === "connected" &&
      !!machineId &&
      whiffle.runningInstances.some((item) => item.id === sessionId)
  );
  const harnessNames: Record<HarnessKind, string> = {
    claude: "Claude Code",
    opencode: "OpenCode",
    pi: "Pi",
  };
  /** `~/…/leaf`: the folder name is what tells sessions apart. */
  const shortPath = (path: string) => {
    const parts = path.replace(HOME, "~").split("/");
    return parts.length > 3 ? `${parts[0]}/…/${parts.at(-1)}` : parts.join("/");
  };
  /*
   * The reading only arrives when something asks for it, and the transcript
   * asks at the end of a turn it watched. A tab opened after a reload, or a
   * session mid-way through a long turn, has had nothing ask — so opening the
   * details asks, once per session shown, as soon as the session can answer.
   * Once: `editable` re-derives on every change to the running list, and each
   * of those is not a reason to ask again.
   */
  let asked: string | null = null;
  $effect(() => {
    const id = sessionId;
    const mid = machineId;
    if (editable && mid && asked !== id) {
      asked = id;
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the reading lands in the session's state and the popover follows it
      untrack(() => void refreshContext(id, mid));
    }
  });
  const reading = $derived(
    !!session?.contextPending && stats.totalTokens === null
  );
  /** Why there is no reading, when the session said why. */
  const refusal = $derived.by(() => {
    const error = session?.contextError;
    if (!error) {
      return null;
    }
    // Custody: the agent restarted under a running turn and holds the session
    // until that turn hands it back; the SDK cannot be asked until then.
    return error.includes("(custody)")
      ? "Unavailable until this turn ends"
      : `Couldn't read: ${error}`;
  });
  /** When a session that can no longer answer was last read. */
  const readAt = $derived(
    !editable && session?.context?.readAt
      ? new Date(session.context.readAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null
  );
  const percent = $derived(
    stats.totalTokens !== null && stats.maxTokens
      ? Math.min(100, Math.round((stats.totalTokens / stats.maxTokens) * 100))
      : null
  );
  function tokens(value: number) {
    if (value >= 1_000_000) {
      return `${Number((value / 1_000_000).toFixed(1))}M`;
    }
    return value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;
  }
  type Slot = "model" | "permission" | "effort";
  const kinds = {
    model: "set-model",
    permission: "set-permission-mode",
    effort: "set-effort",
  } as const;
  let modelOpen = $state(false);
  let relaunching = $state(false);
  let relaunchFailure = $state<string | null>(null);
  let permissionBeforeRelaunch = $state<PermissionMode | null>(null);
  /*
   * The card stays mounted while it moves between tabs, so what belonged to
   * the previous session is cleared when the session changes.
   */
  let clearedFor = untrack(() => sessionId);
  $effect.pre(() => {
    const id = sessionId;
    if (id === clearedFor) {
      return;
    }
    clearedFor = id;
    untrack(() => {
      relaunching = false;
      relaunchFailure = null;
      permissionBeforeRelaunch = null;
    });
  });
  /* A session change nudges the meta line and the stats in from the side the card moved toward. */
  let nudgedFor = untrack(() => sessionId);
  $effect(() => {
    const id = sessionId;
    if (id === nudgedFor) {
      return;
    }
    nudgedFor = id;
    untrack(() => {
      if (reduceMotion.current) {
        return;
      }
      for (const el of [metaEl, statsEl]) {
        el?.animate(
          [
            { transform: `translateX(${8 * dir}px)`, opacity: 0.6 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 180, easing: "cubic-bezier(0.215, 0.61, 0.355, 1)" }
        );
      }
    });
  });
  const shownPermission = $derived(
    relaunching ? permissionBeforeRelaunch : (session?.permissionMode ?? null)
  );

  $effect(() => {
    const kind = harness;
    if (kind) {
      untrack(() => ensureModels(kind));
    }
  });

  function pending(slot: Slot) {
    if (slot === "permission" && relaunching) {
      return true;
    }
    const record = latestCommandFor(sessionId, kinds[slot]);
    return record?.stage === "submitted" || record?.stage === "accepted";
  }
  function failure(slot: Slot) {
    if (slot === "permission" && relaunchFailure) {
      return relaunchFailure;
    }
    const record = latestCommandFor(sessionId, kinds[slot]);
    return record?.stage === "failed"
      ? record.reason || "Change refused. Try again."
      : null;
  }
  /*
   * A change that lands says so where it was made: a check on its line for
   * the hold (--dur-hold), in the place its pending and failed lines take.
   * Only a change seen going from pending to settled while the card is on
   * this session counts — opening the card shows no old news.
   */
  const SLOTS: Slot[] = ["model", "effort", "permission"];
  const DONE: Record<Slot, string> = {
    model: "Model changed",
    effort: "Effort changed",
    permission: "Permission changed",
  };
  let done = $state<Record<Slot, boolean>>({
    model: false,
    effort: false,
    permission: false,
  });
  const holds = new Map<Slot, ReturnType<typeof setTimeout>>();
  let doneFor = untrack(() => sessionId);
  let wasPending = untrack(() => ({
    model: pending("model"),
    effort: pending("effort"),
    permission: pending("permission"),
  }));
  $effect(() => {
    const id = sessionId;
    const now = {
      model: pending("model"),
      effort: pending("effort"),
      permission: pending("permission"),
    };
    const failed = {
      model: failure("model") !== null,
      effort: failure("effort") !== null,
      permission: failure("permission") !== null,
    };
    untrack(() => {
      const moved = id !== doneFor;
      for (const slot of SLOTS) {
        const landed =
          !moved && wasPending[slot] && !now[slot] && !failed[slot];
        if (landed || moved || now[slot]) {
          clearTimeout(holds.get(slot));
          done[slot] = landed;
        }
        if (landed) {
          holds.set(
            slot,
            setTimeout(() => {
              done[slot] = false;
            }, dur("--dur-hold"))
          );
        }
      }
      doneFor = id;
      wasPending = now;
    });
  });
  onDestroy(() => {
    for (const hold of holds.values()) {
      clearTimeout(hold);
    }
  });

  function changeModel(next: string) {
    if (!(editable && machineId) || pending("model") || next === model) {
      return;
    }
    submitCommand(sessionId, machineId, "set-model", { model: next });
  }
  function changeEffort(next: EffortLevel) {
    if (
      !(editable && machineId) ||
      pending("effort") ||
      next === session?.effort
    ) {
      return;
    }
    submitCommand(sessionId, machineId, "set-effort", { effort: next });
  }
  async function changePermission(next: PermissionMode) {
    if (
      !(editable && machineId) ||
      pending("permission") ||
      next === session?.permissionMode
    ) {
      return;
    }
    relaunchFailure = null;
    if (next !== "bypassPermissions") {
      submitCommand(sessionId, machineId, "set-permission-mode", {
        mode: next,
      });
      return;
    }
    // Full access is a launch-time decision for the harness.
    permissionBeforeRelaunch = session?.permissionMode ?? null;
    relaunching = true;
    const id = sessionId;
    try {
      await relaunchSession(id, machineId, next);
    } catch (error) {
      if (id === sessionId) {
        relaunchFailure =
          error instanceof Error ? error.message : "Change refused. Try again.";
      }
    } finally {
      if (id === sessionId) {
        relaunching = false;
      }
    }
  }
</script>

{#snippet modelChip()}
  <ProviderLogo model={model ?? ''} size={15} />
  <span class="chip-label"
    >{model ? modelName(model, modelInfo?.displayName).name : 'Model not reported'}</span
  >
{/snippet}

<!-- One line per field, whatever it is saying: the lines cross-fade at the
     control tier (crossIn / crossOut), the one leaving lifted out of the
     flow so the card only ever holds the one arriving. -->
{#snippet feedback(slot: Slot)}
  {#if failure(slot)}
    <p class="failure" role="alert" in:crossIn out:crossOut>
      {failure(slot)}
    </p>
  {:else if pending(slot)}
    <p class="feedback" role="status" in:crossIn out:crossOut>
      Applying change…
    </p>
  {:else if done[slot]}
    <p class="feedback done" role="status" in:crossIn out:crossOut>
      <IconCheck aria-hidden="true" />
      {DONE[slot]}
    </p>
  {/if}
{/snippet}

<div class="session-details ns-theme" style:--dir={dir}>
  <div class="details-body">
    <div class="identity">
      <div class="title">
        <h2 id={`${uid}-title`} {title}>
          <TextMorph as="span" duration={morphMs} text={title} />
        </h2>
        <button
          aria-label="Copy link"
          class="icon-action touch-hit"
          onclick={() => copyToClipboard('Link', new URL(href, location.origin).href)}
          type="button"
        >
          <Link />
        </button>
      </div>
      {#if harness}
        <span
          aria-label={harnessNames[harness]}
          class="harness"
          role="img"
          title={harnessNames[harness]}
        >
          {#key harness}
            <span class="harness-mark" in:harnessIn>
              <HarnessLogo {harness} />
            </span>
          {/key}
        </span>
      {/if}
    </div>
    <p class="meta" bind:this={metaEl}>
      <SessionStatus duration={morphMs} {sessionId} />
      {#if machine?.hostname || machineId}
        <span aria-hidden="true" class="sep">·</span>
        <span class="host"
          ><TextMorph
            as="span"
            duration={morphMs}
            text={machine?.hostname || machineId || ''}
          /></span
        >
      {/if}
      {#if cwd}
        <span aria-hidden="true" class="sep">·</span>
        <button
          aria-label={`Copy working directory ${cwd}`}
          class="cwd"
          onclick={() => copyToClipboard('Working directory', cwd)}
          title={cwd}
          type="button"
        >
          <TextMorph as="span" duration={morphMs} text={shortPath(cwd)} />
        </button>
      {/if}
    </p>

    {#if harness}
      <div class="configuration">
        <div class="settings">
          {#if editable}
            <NsPopover
              aria-label="Models"
              haspopup="listbox"
              id="details-model"
              onchange={(value) => { modelOpen = value; }}
              open={modelOpen}
              triggerClass="ns-chip-btn tool"
              width={360}
            >
              {#snippet trigger()}
                {@render modelChip()}
                <Down class="chevron" />
              {/snippet}
              <div class="model-pop">
                <ModelSection
                  {harness}
                  installed={[harness]}
                  machineIds={machineId ? [machineId] : []}
                  machineName={machine?.hostname ?? ''}
                  model={model ?? ''}
                  onharness={() => { /* Running sessions retain their harness. */ }}
                  onmodel={(id) => { changeModel(id); modelOpen = false; }}
                  runtime
                />
              </div>
            </NsPopover>
          {:else}
            <span class="ns-chip-btn tool static">{@render modelChip()}</span>
          {/if}
          <ToolChips
            closeOnCommit
            id="details"
            readonly={!editable}
            tools={{
            efforts,
            effort: session?.effort ?? null,
            oneffort: changeEffort,
            modes: modes.map(mode => ({ value: mode.value, disabled: !editable || pending('permission') })),
            permission: shownPermission,
            onpermission: changePermission,
          }}
          />
        </div>
        <!-- One line is always held for what a change says, so its pending,
             done and failed lines arriving or leaving never resize the card. -->
        <div class="feedback-slot">
          {@render feedback('model')}
          {@render feedback('effort')}
          {@render feedback('permission')}
          {#if !editable}
            <p class="feedback">Controls unlock while the session is running.</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <div class="stats" bind:this={statsEl}>
    <div class="context">
      {#if percent !== null && stats.totalTokens !== null && stats.maxTokens !== null}
        <!-- biome-ignore lint/a11y/useSemanticElements: a native meter's fill cannot be animated -->
        <span
          aria-label="Context used"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          class="context-meter"
          role="meter"
          title={readAt ? `Read at ${readAt}` : undefined}
        >
          <span
            class="context-fill"
            style:transform={`scaleX(${percent / 100})`}
          ></span>
        </span>
        <TextMorph
          as="span"
          duration={morphMs}
          text={`${percent}% · ${tokens(stats.totalTokens)}/${tokens(stats.maxTokens)}`}
        />
      {:else if reading}
        <span>Reading…</span>
      {:else if refusal}
        <span class="refusal" title={refusal}>{refusal}</span>
      {:else}
        <span>Context not reported</span>
      {/if}
    </div>
    {#if session?.mcp}
      <a class="tools" href="/config/mcp"
        ><TextMorph
          as="span"
          duration={morphMs}
          text={`${session.mcp.length} MCP`}
        /></a
      >
    {/if}
    {#if stats.cost !== null}
      <span class="cost"
        ><TextMorph
          as="span"
          duration={morphMs}
          text={`$${stats.cost.toFixed(2)}`}
        /></span
      >
    {/if}
  </div>
  <div class="footer">
    <button
      class="ns-btn primary xs"
      onclick={() => { onclose(); continueInNewSession(continueSourceOf(sessionId, title)); }}
      type="button"
    >
      Continue in new session…
    </button>
  </div>
</div>

<style>
  .session-details {
    color: var(--ink-strong);
    min-width: 0;
    min-height: 0;
    width: 100%;
    max-height: inherit;
    display: flex;
    flex-direction: column;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
  }
  .details-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    scrollbar-width: thin;
    scrollbar-color: var(--border-control) transparent;
  }
  .identity {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) var(--space-1);
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }
  /* Wraps; only a title past three lines is cut. */
  h2 {
    min-width: 0;
    margin: 0;
    color: var(--ink-strong);
    font-size: var(--text-title);
    font-weight: var(--weight-strong);
    line-height: var(--leading-body);
    text-wrap: pretty;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }
  /* TextMorph keeps one line by default; the title wraps between words. */
  h2 :global([torph-root]) {
    display: inline;
    white-space: normal;
  }
  /* Level with the title's first line, like the copy button beside it. */
  .harness {
    display: inline-flex;
    align-items: center;
    flex: none;
    height: 28px;
  }
  .harness-mark {
    display: inline-flex;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0 var(--space-5) var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-muted);
  }
  .cwd {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font-family: var(--font-mono);
    font-size: var(--text-label);
    text-align: left;
    overflow-wrap: anywhere;
  }
  button {
    cursor: pointer;
  }
  .icon-action {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
    background: transparent;
  }
  .icon-action :global(svg) {
    width: 16px;
    height: 16px;
  }
  .configuration {
    position: relative;
    border-top: 1px solid var(--border-hairline);
    padding: var(--space-3) var(--space-5);
  }
  /* Model, effort and permission on one line, wrapping between chips. */
  .settings {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .settings :global(.ns-chip-btn) {
    height: 28px;
  }
  /* The model list, sized to its widest row and scrolled in whole rows. */
  :global(.ns-theme.ns-pop:has(> .model-pop)) {
    width: max-content;
    min-width: min(360px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: none;
    overflow: visible;
  }
  .model-pop :global(.picker) {
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  /* The search is as wide as what is typed in it (motion/autosize.svelte.ts
     autowidth), and tweens there a character at a time. */
  .model-pop :global(.search input) {
    --autowidth: 1;
    @media (prefers-reduced-motion: no-preference) {
      transition: width var(--dur-control) var(--ease-out);
    }
  }
  .model-pop :global(.list) {
    height: auto;
    /* Five whole rows: 4px padding, five 44px rows, four 2px gaps. */
    max-height: 232px;
    overflow: hidden auto;
    scroll-snap-type: y mandatory;
    /* The 2px row gap, so a snapped row's neighbour shows none of itself. */
    scroll-padding: 2px;
  }
  .model-pop :global(.row) {
    scroll-snap-align: start;
  }
  .feedback-slot {
    position: relative;
    display: grid;
    font-size: var(--text-body);
    line-height: var(--leading-body);
    /* The margin above the line plus the line itself. */
    min-block-size: calc(var(--space-2) + 1lh);
  }
  .feedback,
  .failure {
    margin-top: var(--space-2);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    overflow-wrap: anywhere;
  }
  .feedback {
    color: var(--ink-muted);
  }
  .failure {
    color: var(--status-fail-ink);
  }
  .done {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .done :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--status-live-ink);
  }
  .stats {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--border-hairline);
    background: var(--surface-recess);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    font-variant-numeric: tabular-nums;
    flex-wrap: wrap;
    row-gap: var(--space-2);
    color: var(--ink-strong);
  }
  .context {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .tools {
    display: inline-flex;
    align-items: center;
    color: var(--ink-strong);
  }
  .cost {
    margin-left: auto;
    color: var(--ink-strong);
  }
  .context-meter {
    flex: 1;
    min-width: 48px;
    max-width: 96px;
    height: 4px;
    border-radius: var(--radius-pill);
    overflow: hidden;
    background: var(--border-control);
  }
  .context-fill {
    display: block;
    height: 100%;
    background: var(--ink-muted);
    transform-origin: left;
    transition: transform var(--dur-panel) var(--ease-out);
  }
  /* The modal's action row (SessionFooter): right-aligned, 8px apart. */
  .footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--border-hairline);
    background: var(--surface-raised);
  }
  @media (hover: hover) {
    .icon-action:hover {
      background: var(--surface-hover);
    }
    .cwd:hover,
    .tools:hover {
      color: var(--ink-strong);
    }
  }
  @media (max-width: 640px) {
    .footer {
      padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
    }
    .ns-btn,
    .settings :global(.ns-chip-btn) {
      height: 44px;
    }
    .ns-btn {
      flex: 1;
    }
  }
</style>
