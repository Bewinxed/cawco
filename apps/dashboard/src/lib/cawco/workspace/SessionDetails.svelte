<script lang="ts" module>
  const HOME = /^\/(home|Users)\/[^/]+/;
</script>

<script lang="ts">
  import type { EffortLevel, HarnessKind, PermissionMode } from "@cawco/core";
  import { EFFORT_NONE, isEffortLevel } from "@cawco/core";
  import { onDestroy, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconCheck } from "#lib/icons.js";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Link from "~icons/solar/link-bold-duotone";
  import AccountSwitch from "../accounts/AccountSwitch.svelte";
  import { nameOf } from "../accounts/model.svelte";
  import { movingTo } from "../accounts/switch.svelte";
  import {
    answeredOr,
    cawco,
    latestCommandFor,
    machineConnected,
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
  } from "../motion/curves.svelte";
  import { standsOpen } from "../motion/hang";
  import { morph } from "../motion/morph.svelte";
  import { bypasses, permissionModesFor } from "../permission-modes";
  import ModelSection from "../spawn/ModelSection.svelte";
  import { modelName } from "../spawn/model-entries";
  import NsPopover from "../spawn/NsPopover.svelte";
  import ToolChips, {
    type EffortOff,
    effortNotExposed,
    NO_EFFORT_MODEL,
  } from "../spawn/ToolChips.svelte";
  import { fillState, firstToStop, limitRows, speakingReading } from "../usage";
  import LimitBar from "../usage/LimitBar.svelte";
  import ProviderLimit from "../usage/ProviderLimit.svelte";
  import SessionStatus from "./SessionStatus.svelte";
  import { contextOf } from "./workspace.svelte";

  let {
    sessionId,
    title,
    href,
    onclose,
    dir,
    kept = null,
  }: {
    sessionId: string;
    title: string;
    href: string;
    onclose: () => void;
    /** Which way the card moved to reach this session: 1 rightward, -1 leftward. */
    dir: 1 | -1;
    /**
     * The harness and model are a setting kept off the session, as a
     * project's Caw keeps his lead's (CawView): the model chip opens whether
     * or not the session runs, and its picker's harness rail offers each of
     * `harnesses` this machine has. A harness on the rail is browsed, as New
     * session browses one; picking a model there chooses the two together
     * (`onchoose`), never the running session's. The change is `pending`
     * until the keeper answers, and `refused` says why it did not take.
     */
    kept?: {
      harness: HarnessKind;
      model: string | null;
      harnesses: HarnessKind[];
      onchoose: (choice: { harness: HarnessKind; model: string }) => void;
      pending: boolean;
      refused: string | null;
    } | null;
  } = $props();
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
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
    (kept?.harness || session?.harness || row?.harness || context?.harness) as
      HarnessKind | undefined
  );
  const report = $derived(
    machine?.harnesses?.find((item) => item.harness === harness)
  );
  const cwd = $derived(session?.cwd || row?.cwd || context?.cwd || "");
  const stats = $derived(cawco.statsOf(sessionId));
  const model = $derived(kept ? kept.model : (session?.model ?? null));

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
    harness
      ? permissionModesFor(harness, session?.permissionMode).filter((mode) =>
          report?.capabilities.permissionModes.includes(mode.value)
        )
      : []
  );
  const editable = $derived(
    !!machineId &&
      machineConnected(machineId) &&
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
  /*
   * Asked once the card stands open (its `grown`, motion/hang):
   * the reading re-wraps the stats strip, and its height tween landing
   * while the card grows resizes the card every frame, which takes the
   * growth's clip off the compositor. A card already open (moving between
   * tabs) asks at once.
   */
  let rootEl = $state<HTMLElement>();
  let asked: string | null = null;
  let stopWaiting: () => void = () => undefined;
  /** An ask waiting for the card to stand open: the strip says "Reading…" meanwhile. */
  let askPending = $state(false);
  function whenOpen(ask: () => void) {
    const card = rootEl?.closest<HTMLElement>("[data-session-details-popover]");
    // As the card's motion said it stands (motion/hang `standsOpen`): its
    // animations, asked, styled the page in the middle of a tab switch.
    if (!card || standsOpen(card)) {
      askPending = false;
      ask();
      return () => undefined;
    }
    askPending = true;
    const grown = () => {
      askPending = false;
      ask();
    };
    card.addEventListener("grown", grown, { once: true });
    return () => {
      askPending = false;
      card.removeEventListener("grown", grown);
    };
  }
  $effect(() => {
    const id = sessionId;
    const mid = machineId;
    if (!(editable && mid && asked !== id && rootEl)) {
      return;
    }
    asked = id;
    // `editable` re-derives on every change to the running list, so only a
    // new session (or the card closing) ends the wait, never a re-run.
    stopWaiting();
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the reading lands in the session's state and the popover follows it
    stopWaiting = untrack(() => whenOpen(() => void refreshContext(id, mid)));
  });
  onDestroy(() => stopWaiting());
  const reading = $derived(
    (askPending || !!session?.contextPending) && stats.totalTokens === null
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
  /**
   * The account the session is moving to, by name: what the account's
   * feedback line says while the move is in flight.
   */
  const accountName = (id: string | null | undefined) => {
    const account = cawco.accounts?.accounts.find((one) => one.id === id);
    return account ? nameOf(account) : "another account";
  };
  type Slot = "model" | "permission" | "effort" | "account";
  const kinds = {
    model: "set-model",
    permission: "set-permission-mode",
    effort: "set-effort",
  } as const;
  let modelOpen = $state(false);
  /**
   * A kept setting's harness the picker shows: the kept one each time the
   * picker opens, then the one browsed on its rail.
   */
  let browsing = $state<HarnessKind | undefined>();
  /** The kept setting's harnesses this machine has (all of them until its report is read). */
  const keptHarnesses = $derived(
    kept
      ? kept.harnesses.filter(
          (each) =>
            !machine?.harnesses ||
            machine.harnesses.some((reported) => reported.harness === each)
        )
      : []
  );
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
    if (slot === "account") {
      return row ? movingTo(row) !== undefined : false;
    }
    if (slot === "permission" && relaunching) {
      return true;
    }
    if (slot === "model" && kept) {
      return kept.pending;
    }
    const record = latestCommandFor(sessionId, kinds[slot]);
    return record?.stage === "submitted" || record?.stage === "accepted";
  }
  function failure(slot: Slot) {
    // A refused move is moveTo's toast, the one place the menu and the card
    // both say it.
    if (slot === "account") {
      return null;
    }
    if (slot === "permission" && relaunchFailure) {
      return relaunchFailure;
    }
    if (slot === "model" && kept) {
      return kept.refused;
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
  const SLOTS: Slot[] = ["model", "effort", "permission", "account"];
  const DONE: Record<Slot, () => string> = {
    model: () => "Model changed",
    effort: () => "Effort changed",
    permission: () => "Permission changed",
    account: () => `Moved to ${accountName(row?.accountId)}`,
  };
  let done = $state<Record<Slot, boolean>>({
    model: false,
    effort: false,
    permission: false,
    account: false,
  });
  const holds = new Map<Slot, ReturnType<typeof setTimeout>>();
  let doneFor = untrack(() => sessionId);
  let wasPending = untrack(() => ({
    model: pending("model"),
    effort: pending("effort"),
    permission: pending("permission"),
    account: pending("account"),
  }));
  $effect(() => {
    const id = sessionId;
    const now = {
      model: pending("model"),
      effort: pending("effort"),
      permission: pending("permission"),
      account: pending("account"),
    };
    const failed = {
      model: failure("model") !== null,
      effort: failure("effort") !== null,
      permission: failure("permission") !== null,
      account: failure("account") !== null,
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
    // Bypass, and Full Send on top of it, are launch-time decisions for the
    // harness: entering them from another mode starts the session again in
    // place. Between the two the CLI stays in bypass, and a switch is enough.
    if (!bypasses(next) || bypasses(session?.permissionMode)) {
      submitCommand(sessionId, machineId, "set-permission-mode", {
        mode: next,
      });
      return;
    }
    permissionBeforeRelaunch = session?.permissionMode ?? null;
    relaunching = true;
    const id = sessionId;
    try {
      answeredOr(
        machineId,
        await relaunchSession(id, machineId, next),
        "whether it runs on the new mode is not known"
      );
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
  <ProviderLogo model={model ?? ""} size={15} />
  <span data-slot="chip-label"
    >{model
      ? modelName(model, modelInfo?.displayName).name
      : "Model not reported"}</span
  >
{/snippet}

<!-- A changing figure in the stats strip. -->
{#snippet figure(text: string)}
  <span class="flex-none whitespace-nowrap"><MorphText {text} /></span>
{/snippet}

<!-- One line per field, whatever it is saying: the lines cross-fade at the
     control tier (crossIn / crossOut), the one leaving lifted out of the
     flow so the card only ever holds the one arriving. -->
{#snippet feedback(slot: Slot)}
  {#if failure(slot)}
    <p
      data-slot="failure"
      class="mt-space-2 text-size-body font-normal leading-body wrap-anywhere text-status-fail-ink"
      role="alert"
      in:crossIn
      out:crossOut
    >
      {failure(slot)}
    </p>
  {:else if pending(slot)}
    <p
      data-slot="feedback"
      class="mt-space-2 text-size-body font-normal leading-body wrap-anywhere text-ink-muted"
      role="status"
      in:crossIn
      out:crossOut
    >
      {slot === "account" && row
        ? `Moving to ${accountName(movingTo(row))}…`
        : "Applying change…"}
    </p>
  {:else if done[slot]}
    <p
      data-feedback
      data-slot="done"
      class="mark-line mt-space-2 flex items-center gap-space-1 text-size-body font-normal leading-body wrap-anywhere text-ink-muted"
      role="status"
      in:crossIn
      out:crossOut
    >
      <IconCheck aria-hidden="true" />
      <span>{DONE[slot]()}</span>
    </p>
  {/if}
{/snippet}

<div
  data-slot="session-details"
  class="ns-theme flex min-h-0 w-full min-w-0 flex-col text-size-body font-normal text-ink-strong"
  bind:this={rootEl}
  style:--dir={dir}
>
  <div
    data-slot="details-body"
    class="min-h-0 touch-pan-y overflow-y-auto overscroll-contain"
  >
    <!-- The head is the tab's own surface, continued through the junction
         where the card hangs from the tab: the folder's label band. A
         finger's vertical drag on the head is the card's own (a swipe up
         folds it back into its tab, PaneTabs `swipeCardShut`), never the
         body's scroll, which would take the touch away from it. -->
    <div data-slot="head" class="touch-pan-x bg-surface-recess">
      <div
        class="flex items-start gap-space-3 px-space-5 pt-space-4 pb-space-1"
      >
        <div
          data-slot="title"
          class="flex min-w-0 flex-1 items-start gap-space-1"
        >
          <!-- Wraps; only a title past three lines is cut. -->
          <h2
            id={`${uid}-title`}
            class="m-0 line-clamp-3 min-w-0 text-size-title font-medium leading-body text-pretty wrap-anywhere text-ink-strong"
            {title}
          >
            <MorphText text={title} wrap />
          </h2>
          <!-- literal: 28px -->
          <button
            data-slot="icon-action"
            aria-label="Copy link"
            class="touch-hit grid size-(--icon-action) flex-none cursor-pointer place-items-center rounded-sm border-none border-current bg-transparent hover:bg-surface-hover"
            style:--icon-action="28px"
            onclick={() =>
              copyToClipboard("Link", new URL(href, location.origin).href)}
            type="button"
          >
            <Link />
          </button>
        </div>
        {#if harness}
          <!-- Level with the title's first line, like the copy button beside
               it. -->
          <!-- literal: 28px -->
          <span
            aria-label={harnessNames[harness]}
            class="inline-flex h-(--harness-h) flex-none items-center"
            style:--harness-h="28px"
            role="img"
            title={harnessNames[harness]}
          >
            {#key harness}
              <span class="inline-flex" in:harnessIn>
                <HarnessLogo {harness} />
              </span>
            {/key}
          </span>
        {/if}
      </div>
      <p
        data-slot="meta"
        class="m-0 flex flex-wrap items-center gap-space-2 px-space-5 pt-0 pb-space-3 text-size-meta font-normal leading-body text-ink-muted"
        bind:this={metaEl}
      >
        <SessionStatus {sessionId} />
        {#if machine?.hostname || machineId}
          <span aria-hidden="true">·</span>
          <span data-slot="host"
            ><MorphText text={machine?.hostname || machineId || ""} /></span
          >
        {/if}
        {#if cwd}
          <span aria-hidden="true">·</span>
          <button
            data-slot="cwd"
            aria-label={`Copy working directory ${cwd}`}
            class="min-w-0 cursor-pointer border-none border-current bg-transparent p-0 text-left wrap-anywhere"
            onclick={() => copyToClipboard("Working directory", cwd)}
            title={cwd}
            type="button"
          >
            <MorphText text={shortPath(cwd)} />
          </button>
        {/if}
      </p>
    </div>

    {#if harness}
      <!-- The harness the picker lists: a kept setting's browsed one, else the session's. -->
      {@const shownHarness = kept ? (browsing ?? harness) : harness}
      <!-- The body: one surface. Two levels in the card and no more (owner:
           "why don't we have proper heirachy y and have the controls as a
           coherent group?"): the head on the tab's own surface, and
           everything under it on the card's one body surface
           (`surface-raised`, the kit-pop's) with no fill of its own: the
           controls, the meters, the action. Sections part by space, and by
           one hairline, between the controls and the meters; the action
           follows the meters by space alone. The head's edge is the hairline
           at the top of the controls. No pad at the foot: the held feedback
           line is the space under the group. -->
      <div
        class="relative border-t border-t-border-hairline px-space-5 pt-space-4 pb-0"
      >
        <!-- The four settings (model, effort, permission, account) as one
             group: the same chip height and the same gap across and down,
             wrapping as a unit when the card runs out of row. The model chip
             gives up room first (its name ellipsized) before anything
             wraps. -->
        <!-- literal: 28px, 44px, 6px -->
        <div
          data-slot="settings"
          class="flex min-w-0 flex-wrap items-center gap-space-1"
          style:--chip-h="28px"
          style:--chip-h-phone="44px"
          style:--chip-px-phone="6px"
        >
          {#if editable || kept}
            <NsPopover
              aria-label="Models"
              haspopup="listbox"
              id="details-model"
              onchange={(value) => {
                modelOpen = value;
                browsing = undefined;
              }}
              open={modelOpen}
              fit
              triggerClass="ns-chip-btn"
              triggerData={{ "data-model-chip": true }}
              width={360}
            >
              {#snippet trigger()}
                {@render modelChip()}
                <Down data-slot="chevron" />
              {/snippet}
              <!-- The model list, sized to its widest row and scrolled in
                   whole rows: five whole rows, 4px padding, five 44px rows,
                   four 2px gaps. -->
              <!-- literal: 232px -->
              <div data-slot="model-pop" style:--list-max="232px">
                <ModelSection
                  harness={shownHarness}
                  installed={kept ? keptHarnesses : [harness]}
                  machineIds={machineId ? [machineId] : []}
                  machineName={machine?.hostname ?? ""}
                  model={shownHarness === harness ? (model ?? "") : ""}
                  onharness={(next) => {
                    // A running session keeps its harness; a kept one's
                    // rail is browsed, and a model picked there chooses both.
                    browsing = next;
                  }}
                  onmodel={(id) => {
                    if (kept) {
                      kept.onchoose({ harness: shownHarness, model: id });
                    } else {
                      changeModel(id);
                    }
                    modelOpen = false;
                    browsing = undefined;
                  }}
                  runtime={!kept}
                />
              </div>
            </NsPopover>
          {:else}
            <span
              data-tool
              data-slot="ns-chip-btn"
              data-model-chip
              data-variant="static"
              class="ns-chip-btn">{@render modelChip()}</span
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
              modes: modes.map((mode) => ({
                value: mode.value,
                disabled: !editable || pending("permission"),
              })),
              harness,
              permission: shownPermission,
              onpermission: changePermission,
              restartsOnFullSend: !bypasses(session?.permissionMode),
            }}
          />
          <!-- The account the session bills: the group's fourth setting,
               wrapping with the others when the row runs out. -->
          {#if row?.accountId}
            <AccountSwitch instance={row} readonly={!editable} />
          {/if}
        </div>
        <!-- One line is always held for what a change says, so its pending,
             done and failed lines arriving or leaving never resize the card. -->
        <!-- The margin above the line plus the line itself. -->
        <div
          class="relative grid min-h-(--feedback-min) text-size-body leading-body"
          style:--feedback-min="calc(var(--space-2) + 1lh)"
        >
          {@render feedback("model")}
          {@render feedback("effort")}
          {@render feedback("permission")}
          {@render feedback("account")}
          {#if !editable}
            <p
              data-slot="feedback"
              class="mt-space-2 text-size-body font-normal leading-body wrap-anywhere text-ink-muted"
            >
              {kept
                ? "Effort and permission unlock while the session is running."
                : "Controls unlock while the session is running."}
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <!-- A meter wrapping to a second line tweens the strip's height (morph). -->
  <div
    class="flex flex-none flex-wrap items-center gap-space-4 gap-y-space-2 border-t border-t-border-hairline px-space-5 pt-space-3 pb-0 text-size-meta font-normal leading-body num text-ink-strong"
    bind:this={statsEl}
    {@attach morph()}
  >
    <!-- Each meter (context, the provider's limit, MCP) is one unit, sized
         by its content: a unit that does not fit beside the others moves to
         the next line. Only a unit wider than the whole strip wraps inside
         itself, a part to a line, and no part ever gets narrower than its
         own text. Context takes whatever the line has spare, its bar first:
         a word, a 4px bar of what is used (usage/LimitBar) and a figure;
         the provider's limit is its own unit (usage/ProviderLimit). -->
    <div
      class="flex flex-auto flex-wrap items-center gap-x-space-2 gap-y-space-1"
      style:--row-paint="var(--surface-raised)"
    >
      {#if percent !== null && stats.totalTokens !== null && stats.maxTokens !== null}
        <span class="flex-none whitespace-nowrap text-ink-muted">Context</span>
        <!-- literal: 48px, 96px -->
        <span
          class="max-w-(--bar-max) min-w-(--bar-min) flex-1"
          style:--bar-min="48px"
          style:--bar-max="96px"
          title={readAt ? `Read at ${readAt}` : undefined}
        >
          <LimitBar
            elapsed={null}
            label="Context"
            reads="used"
            size={4}
            state={fillState(percent)}
            used={percent}
          />
        </span>
        {@render figure(
          `${percent}% · ${tokens(stats.totalTokens)}/${tokens(stats.maxTokens)}`
        )}
      {:else if reading}
        <span>Reading…</span>
      {:else if refusal}
        <span data-slot="refusal" class="min-w-0 wrap-anywhere" title={refusal}
          >{refusal}</span
        >
      {:else}
        <span>Context not reported</span>
      {/if}
    </div>
    {#if providerLimit}
      <ProviderLimit label={providerLimit.label} meter={providerLimit.meter} />
    {/if}
    {#if session?.mcp}
      <a
        data-slot="tools"
        class="inline-flex flex-none items-center text-ink-strong hover:text-ink-strong"
        href="/config/mcp">{@render figure(`${session.mcp.length} MCP`)}</a
      >
    {/if}
  </div>
  <!-- The action row (SessionFooter's): right-aligned, 8px apart, on the
       body's surface under the meters, parted from them by space alone. -->
  <!-- literal: 8px, 44px -->
  <div
    data-slot="footer"
    class="flex flex-none items-center justify-end gap-(--footer-gap) px-space-5 py-space-4"
    style:--footer-gap="8px"
    style:--footer-btn-h="44px"
  >
    <button
      data-slot="primary"
      class="ns-btn cursor-pointer"
      data-size="xs"
      data-variant="primary"
      onclick={() => {
        onclose();
        continueInNewSession(continueSourceOf(sessionId, title));
      }}
      type="button"
    >
      Continue in new session…
    </button>
  </div>
</div>

<style>
  /* residual: unmapped — no utility says max-height: inherit (the card's
     cap, from the popover it stands in). */
  [data-slot="session-details"] {
    max-height: inherit;
  }
  /* residual: unmapped — no utility says scrollbar-width: thin or
     scrollbar-color. */
  [data-slot="details-body"] {
    scrollbar-width: thin;
    scrollbar-color: var(--border-control) transparent;
  }
  /* residual: unmapped — these outrank the shared sheet's unlayered
     `.ns-theme button { font: inherit; color: inherit }` (0,1,1), as they
     did at (0,2,0) and (0,3,0); as layered utilities they would lose to it
     (the path would lose its mono face, the copy button its muted ink). */
  [data-slot="cwd"] {
    color: inherit;
    font-family: var(--font-mono);
    font-size: var(--text-label);
  }
  [data-slot="icon-action"] {
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    [data-slot="cwd"]:hover {
      color: var(--ink-strong);
    }
  }
  /* The footer's button takes the row, 44px tall under a finger: the
     footer makes it outrank the shared sheet's `.ns-theme .ns-btn.xs`
     (0,3,0) at (0,4,0). */
  @media (max-width: 640px) {
    [data-slot="footer"] [data-slot="primary"] {
      flex: 1;
      height: var(--footer-btn-h);
    }
  }
  /* residual: foreign-dom — svg the icon components draw; the settings'
     chips, which NsPopover's trigger (the model chip, by its
     `triggerClass`), ToolChips and AccountSwitch render: the card's width
     holds the longest names whole ("Opus 5.5 · 1M", "medium", "Accept
     edits") with the chips' insides drawn in a little; and ModelSection's
     list inside the model popover. */
  [data-slot="icon-action"] :global(svg) {
    width: var(--icon-md);
    height: var(--icon-md);
  }
  [data-slot="done"] :global(svg) {
    width: var(--icon-md);
    height: var(--icon-md);
    flex: none;
    color: var(--status-done-glyph);
  }
  [data-slot="settings"] :global([data-model-chip]) {
    flex: 0 1 auto;
    min-width: 0;
  }
  [data-slot="settings"] :global(.tool-chips) {
    gap: var(--space-1);
  }
  [data-slot="settings"] :global(.ns-chip-btn) {
    gap: var(--space-1);
    height: var(--chip-h);
  }
  [data-slot="model-pop"] :global([data-slot="picker"]) {
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  /* The search is as wide as what is typed in it (motion/autosize.svelte.ts
     autowidth), and tweens there a character at a time. */
  [data-slot="model-pop"] :global([data-slot="search"] input) {
    --autowidth: 1;
    @media (prefers-reduced-motion: no-preference) {
      transition: width var(--dur-control) var(--ease-out);
    }
  }
  [data-slot="model-pop"] :global([data-slot="list"]) {
    height: auto;
    max-height: var(--list-max);
    overflow: hidden auto;
    scroll-snap-type: y mandatory;
    /* The 2px row gap, so a snapped row's neighbour shows none of itself. */
    scroll-padding: 2px;
  }
  [data-slot="model-pop"] :global([data-slot="row"]) {
    scroll-snap-align: start;
  }
  @media (max-width: 640px) {
    /* A phone's row is ~350px: the three chips fit it whole, the model's
       name included, with the chips' sides and gaps drawn in. */
    [data-slot="settings"] :global(.ns-chip-btn) {
      height: var(--chip-h-phone);
      padding-inline: var(--chip-px-phone);
    }
    /* A bordered chip already reads as tappable; its chevron is the room
       the model's name needs. The account chip keeps its own: it is the
       only hint that it opens anything. */
    [data-slot="settings"]
      :global(
        .ns-chip-btn:not([data-account-chip]) > svg[data-slot="chevron"]
      ) {
      display: none;
    }
  }
</style>
