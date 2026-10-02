<script lang="ts" module>
  const HOME = /^\/(home|Users)\/[^/]+/;
</script>

<script lang="ts">
  import type { EffortLevel, HarnessKind, PermissionMode } from "@cawco/core";
  import { EFFORT_NONE, isEffortLevel } from "@cawco/core";
  import { onDestroy, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { TextMorph } from "torph/svelte";
  import ProviderLogo from "$lib/components/features/ProviderLogo.svelte";
  import { IconCheck } from "$lib/icons";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Link from "~icons/solar/link-bold-duotone";
  import {
    cawco,
    latestCommandFor,
    refreshContext,
    relaunchSession,
    submitCommand,
  } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import { copyToClipboard } from "../copy";
  import HarnessLogo from "../HarnessLogo.svelte";
  import { describingRow, ensureModels } from "../models.svelte";
  import {
    CURVE,
    crossIn,
    crossOut,
    dur,
    easeOut,
    morphMs as morphDuration,
  } from "../motion/curves.svelte";
  import { morph } from "../motion/morph.svelte";
  import { PERMISSION_MODES } from "../permission-modes";
  import ModelSection from "../spawn/ModelSection.svelte";
  import { modelName } from "../spawn/model-entries";
  import NsPopover from "../spawn/NsPopover.svelte";
  import ToolChips, {
    type EffortOff,
    effortNotExposed,
    NO_EFFORT_MODEL,
  } from "../spawn/ToolChips.svelte";
  import "../spawn/ns-theme.css";
  import { fillState, firstToStop, limitRows, speakingReading } from "../usage";
  import LimitBar from "../usage/LimitBar.svelte";
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
  const morphMs = $derived(reduceMotion.current ? 0 : morphDuration());
  let metaEl = $state<HTMLElement>();
  let statsEl = $state<HTMLElement>();
  /** The harness mark arrives from the side the card moved toward. */
  function harnessIn(_node: Element): TransitionConfig {
    return {
      duration: reduceMotion.current ? 0 : dur("--dur-morph"),
      easing: easeOut,
      css: (t) =>
        `transform: translateX(calc(${(1 - t) * 8}px * var(--dir))); opacity: ${t}`,
    };
  }
  const uid = $props.id();
  const session = $derived(cawco.session(sessionId));
  const row = $derived(cawco.instanceIndex.byId.get(sessionId));
  const context = $derived(contextOf(sessionId));
  const machineId = $derived(
    session?.machineId || row?.machineId || context?.machine
  );
  const machine = $derived(
    cawco.machines.find((item) => item.machineId === machineId)
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
  const stats = $derived(cawco.statsOf(sessionId));
  const model = $derived(session?.model ?? null);

  /**
   * This session's provider limit (owner pick h): the window that stops its
   * provider first — Claude's for a Claude session, OpenCode Go's for an
   * opencode session on a Go model. Read against a minute clock.
   */
  let limitNow = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      limitNow = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });
  const providerLimit = $derived.by(() => {
    if (harness === "claude") {
      const claude = speakingReading(cawco.claudeLimits)?.reading;
      return firstToStop(limitRows("Claude", claude, limitNow));
    }
    if (harness === "opencode" && model?.startsWith("opencode-go/")) {
      const go = speakingReading(cawco.openCodeGoLimits)?.reading;
      return firstToStop(limitRows("opencode", go, limitNow));
    }
    return null;
  });
  const modelInfo = $derived(model ? describingRow(model) : null);
  const efforts = $derived(
    report?.capabilities.effort ? (modelInfo?.supportedEffortLevels ?? []) : []
  );
  /**
   * Why the effort chip shows no level, when it shows none: the harness has no
   * effort, the session sends none, or its reading has not landed yet.
   */
  const effortOff = $derived.by((): EffortOff | null => {
    if (harness && report?.capabilities.effort === false) {
      return effortNotExposed(harness);
    }
    const effort = session?.effort ?? null;
    if (effort === EFFORT_NONE) {
      return {
        label: "No effort",
        reason: efforts.length
          ? "Effort is off for this session"
          : NO_EFFORT_MODEL.reason,
      };
    }
    if (effort === null) {
      return editable
        ? { label: "Effort…", reason: "Reading the session's effort" }
        : {
            label: "Not read",
            reason: "Effort is read while the session runs",
          };
    }
    return null;
  });
  const modes = $derived(
    PERMISSION_MODES.filter((mode) =>
      report?.capabilities.permissionModes.includes(mode.value)
    )
  );
  const editable = $derived(
    cawco.status === "connected" &&
      !!machineId &&
      cawco.runningInstances.some((item) => item.id === sessionId)
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
          { duration: dur("--dur-morph"), easing: CURVE.out }
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

<!-- A changing figure in the stats strip. A still copy of the text sizes its
     box, so the strip lays out and wraps by the text's own width. The morph
     draws inside that box, clipped to it: torph animates its own width from the
     old size and draws leaving and moving letters outside it, which put the
     context figure over the next meter. -->
{#snippet figure(text: string)}
  <span class="figure">
    <span aria-hidden="true" class="figure-size">{text}</span>
    <TextMorph as="span" duration={morphMs} {text} />
  </span>
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
              triggerClass="ns-chip-btn tool model-chip"
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
            <span class="ns-chip-btn tool static model-chip"
              >{@render modelChip()}</span
            >
          {/if}
          <ToolChips
            closeOnCommit
            id="details"
            readonly={!editable}
            tools={{
            efforts,
            effort: isEffortLevel(session?.effort) ? session.effort : null,
            effortOff,
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
            <p class="feedback">
              Controls unlock while the session is running.
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <!-- A meter wrapping to a second line tweens the strip's height (morph). -->
  <div class="stats" bind:this={statsEl} {@attach morph()}>
    <div class="context">
      {#if percent !== null && stats.totalTokens !== null && stats.maxTokens !== null}
        <span class="stat-label">Context</span>
        <span class="stat-bar" title={readAt ? `Read at ${readAt}` : undefined}>
          <LimitBar
            elapsed={null}
            label="Context"
            size={4}
            state={fillState(percent)}
            used={percent}
          />
        </span>
        {@render figure(`${percent}% · ${tokens(stats.totalTokens)}/${tokens(stats.maxTokens)}`)}
      {:else if reading}
        <span>Reading…</span>
      {:else if refusal}
        <span class="refusal" title={refusal}>{refusal}</span>
      {:else}
        <span>Context not reported</span>
      {/if}
    </div>
    {#if providerLimit}
      {@const m = providerLimit.meter}
      <div class="limit">
        <span class="stat-label">{providerLimit.label}</span>
        <span class="stat-bar">
          <LimitBar
            elapsed={m.elapsed}
            label={providerLimit.label}
            size={4}
            state={m.state}
            used={m.used}
          />
        </span>
        <span class="stat-figure">{Math.round(m.used)}%</span>
      </div>
    {/if}
    {#if session?.mcp}
      <a class="tools" href="/config/mcp"
        >{@render figure(`${session.mcp.length} MCP`)}</a
      >
    {/if}
    {#if stats.cost !== null}
      <span class="cost">{@render figure(`$${stats.cost.toFixed(2)}`)}</span>
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
  /* Model, effort and permission on one line, never wrapping: the model chip
     gives up room (its name ellipsized), effort and permission keep theirs. */
  .settings {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .settings :global(.model-chip) {
    flex: 0 1 auto;
    min-width: 0;
  }
  /* The card's width holds the longest names whole ("Opus 5.5 · 1M",
     "medium", "Full access") with the chips' insides drawn in a little. */
  .settings :global(.ns-chip-btn) {
    gap: 4px;
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
    color: var(--status-done-glyph);
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
  /* Each meter (context, the provider's limit, MCP, cost) is one unit, sized
     by its content: a unit that does not fit beside the others moves to the
     next line. Only a unit wider than the whole strip wraps inside itself, a
     part to a line, and no part ever gets narrower than its own text. */
  .context,
  .limit {
    --row-paint: var(--surface-recess);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }
  /* Context takes whatever the line has spare, its bar first. */
  .context {
    flex: auto;
  }
  .limit,
  .tools,
  .cost {
    flex: none;
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
  /* Context and the provider's limit, each a word, a 4px bar and a figure
     (usage/LimitBar); the bar's pace gap shows the strip's own surface. */
  .stat-label,
  .stat-figure {
    flex: none;
    white-space: nowrap;
  }
  .stat-label {
    color: var(--ink-muted);
  }
  .stat-bar {
    flex: 1;
    min-width: 48px;
    max-width: 96px;
  }
  .limit .stat-bar {
    flex: none;
    width: 64px;
  }
  /* The still copy and the morph share one cell, so the cell is as wide as
     the wider of the two. Only the sideways overflow is clipped, so the
     letters' rise and fall still show. */
  .figure {
    display: inline-grid;
    flex: none;
    overflow-x: clip;
    white-space: nowrap;
  }
  .figure > :global(*) {
    grid-area: 1 / 1;
    justify-self: start;
  }
  .figure-size {
    visibility: hidden;
  }
  .refusal {
    min-width: 0;
    overflow-wrap: anywhere;
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
    /* A phone's row is ~350px: the three chips fit it whole, the model's
       name included, with the chips' sides and gaps drawn in. */
    .settings :global(.ns-chip-btn) {
      padding-inline: 6px;
    }
    /* A bordered chip already reads as tappable; its chevron is the room
       the model's name needs. */
    .settings :global(.ns-chip-btn > svg.chevron) {
      display: none;
    }
    .ns-btn {
      flex: 1;
    }
  }
</style>
