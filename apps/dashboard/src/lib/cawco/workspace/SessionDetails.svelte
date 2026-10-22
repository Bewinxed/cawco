<script lang="ts" module>
  const HOME = /^\/(home|Users)\/[^/]+/;
</script>

<script lang="ts">
  import type { EffortLevel, HarnessKind, PermissionMode } from "@cawco/core";
  import { accountsWords, EFFORT_NONE, isEffortLevel } from "@cawco/core";
  import { onDestroy, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronDown as Down,
    IconCheck,
    IconRefresh,
    IconConnection as Link,
  } from "#lib/icons.js";
  import AccountSwitch from "../accounts/AccountSwitch.svelte";
  import { nameOf } from "../accounts/model.svelte";
  import { movingTo, movingWords, stopWords } from "../accounts/switch.svelte";
  import {
    answeredOr,
    cawco,
    holdDetails,
    latestCommandFor,
    machineConnected,
    refreshContext,
    relaunchSession,
    settingFault,
    showContext,
    submitCommand,
  } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import { copyRefused, copyToClipboard } from "../copy";
  import HarnessLogo from "../HarnessLogo.svelte";
  import { describingRow } from "../models.svelte";
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
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
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
   * provider first — its own account's for a Claude session (none on a
   * session that runs on no CawCo account), OpenCode Go's for an opencode
   * session on a Go model. Read against a minute clock.
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
      const accountId = row?.accountId;
      const claude = accountId ? cawco.claudeLimits[accountId] : undefined;
      const limit = firstToStop(limitRows("Claude", claude, limitNow));
      return limit && claude ? { ...limit, seenAt: claude.fetchedAt } : null;
    }
    if (harness === "opencode" && model?.startsWith("opencode-go/")) {
      const go = speakingReading(cawco.openCodeGoLimits)?.reading;
      const limit = firstToStop(limitRows("opencode", go, limitNow));
      return limit && go ? { ...limit, seenAt: go.fetchedAt } : null;
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
      ? permissionModesFor(harness).filter((mode) =>
          report?.capabilities.permissionModes.includes(mode.value)
        )
      : []
  );
  /**
   * The live process's controls (effort, permission, a running session's
   * model) take changes: its machine is connected and the session runs.
   * The account is the session's, not its process's: it moves whenever the
   * hub is reachable ({@link accountOpen}).
   */
  const machineAway = $derived(!(machineId && machineConnected(machineId)));
  const editable = $derived(
    !machineAway && cawco.runningInstances.some((item) => item.id === sessionId)
  );
  /** A move can be asked: the hub takes it in any state of the session (accounts/switch.svelte.ts). */
  const accountOpen = $derived(cawco.status === "connected");
  /** Why the live controls are locked, and until when. */
  const lockedWords = $derived.by(() => {
    const what = kept
      ? "Effort and permission"
      : "Model, effort and permission";
    return machineAway
      ? `${what} unlock once ${machine?.hostname || machineId || "its machine"} is connected again.`
      : `${what} unlock while the session is running.`;
  });
  const harnessNames: Record<HarnessKind, string> = accountsWords.harnesses;
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
  // The card draws this session's reading while it is mounted: its turns'
  // ends read it again only while one does (client.svelte.ts `showContext`).
  $effect(() => showContext(sessionId));
  /**
   * A copy the browser refused (the link, the working directory): said
   * under the head where it was pressed, with Try again and the text under
   * Show details; never a toast.
   */
  const copyKey = $derived(`copy:details:${sessionId}`);
  const copyFault = $derived(
    refusals.get(copyKey)?.asked as { what: string; text: string } | undefined
  );
  async function copy(what: string, text: string): Promise<void> {
    const key = copyKey;
    if (await copyToClipboard(what, text)) {
      refusals.delete(key);
    } else {
      refusals.set(key, { reason: copyRefused(what), asked: { what, text } });
    }
  }
  // While this card stands, its settings' failures are said on its lines,
  // under the control that asked, and nowhere else (client.svelte.ts).
  $effect(() => holdDetails(sessionId));
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
    // both say it. Stopped at its account's limit, the account line is the
    // error and its way out: the picker right above it.
    if (slot === "account") {
      return row ? (stopWords(row) ?? null) : null;
    }
    if (slot === "permission" && relaunchFailure) {
      return relaunchFailure;
    }
    if (slot === "model" && kept) {
      return kept.refused;
    }
    // Kept for the session (client.svelte.ts `settingFault`), so a reload
    // says it again here.
    return settingFault(sessionId, kinds[slot])?.words ?? null;
  }
  /** A failed change's Try again: the same change asked again. */
  function failureAgain(slot: Slot): (() => void) | undefined {
    if (slot === "account" || (slot === "model" && kept)) {
      return;
    }
    if (slot === "permission" && relaunchFailure) {
      return;
    }
    return settingFault(sessionId, kinds[slot])?.again;
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
    account: () => {
      const moved = `Moved to ${accountName(row?.accountId)}`;
      if (row?.status === "sleeping") {
        return `${moved}. It wakes there.`;
      }
      return row?.status === "stopped" || row?.status === "error"
        ? `${moved}. It runs there when it starts again.`
        : moved;
    },
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
  /**
   * The account the session ran on as its move began: a move landed only
   * when its row names another, never when it was called off.
   */
  let accountBefore = untrack(() => row?.accountId ?? null);
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
    const account = row?.accountId ?? null;
    untrack(() => {
      const moved = id !== doneFor;
      for (const slot of SLOTS) {
        const landed =
          !moved &&
          wasPending[slot] &&
          !now[slot] &&
          !failed[slot] &&
          (slot !== "account" || account !== accountBefore);
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
      if (!now.account) {
        accountBefore = account;
      }
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
  <ProviderLogo model={model ?? ""} size="control" />
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
    {@const again = failureAgain(slot)}
    <!-- What did not change, why and what stands, with the change asked
         again beside it where a try can go. -->
    <div
      data-slot="failure"
      class="mt-space-2 flex flex-wrap items-baseline gap-x-space-2 gap-y-space-1"
      role="alert"
      in:crossIn
      out:crossOut
    >
      <p
        class="m-0 min-w-0 flex-initial text-size-body font-normal leading-body wrap-anywhere text-status-fail-ink"
      >
        {failure(slot)}
      </p>
      {#if again}
        <Button
          data-again
          class="flex-none"
          icon={IconRefresh}
          label="Try again"
          onclick={again}
          size="xs"
          variant="ghost"
        />
      {/if}
    </div>
  {:else if pending(slot)}
    <p
      data-slot="feedback"
      class="mt-space-2 text-size-body font-normal leading-body wrap-anywhere text-ink-muted"
      role="status"
      in:crossIn
      out:crossOut
    >
      <!-- A move says when it takes effect, in its rows' words (switch.svelte.ts). -->
      {slot === "account" && row ? movingWords(row) : "Applying change…"}
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
      <IconCheck
        aria-hidden="true"
        class="size-icon-md flex-none text-status-done-glyph"
      />
      <span>{DONE[slot]()}</span>
    </p>
  {/if}
{/snippet}

<div
  data-slot="session-details"
  class="ns-theme flex max-h-inherit min-h-0 w-full min-w-0 flex-col text-size-body font-normal text-ink-strong"
  bind:this={rootEl}
  style:--dir={dir}
>
  <div
    data-slot="details-body"
    class="min-h-0 touch-pan-y overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-border-control scrollbar-track-transparent"
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
          <Button
            data-slot="icon-action"
            aria-label="Copy link"
            class="flex-none"
            onclick={() => copy("Link", new URL(href, location.origin).href)}
            size="icon-sm"
            tone="muted"
            variant="ghost"
          >
            <Link data-box />
          </Button>
        </div>
        {#if harness}
          <!-- Level with the title's first line, like the copy button beside
               it. -->
          <span
            aria-label={harnessNames[harness]}
            class="inline-flex h-c-btn-h-sm flex-none items-center"
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
            class="select-none min-w-0 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-label text-start wrap-anywhere text-inherit hover:text-ink-strong active:opacity-72"
            onclick={() => copy("Working directory", cwd)}
            title={cwd}
            type="button"
          >
            <MorphText text={shortPath(cwd)} />
          </button>
        {/if}
      </p>
      <!-- A copy pressed in the head that the browser refused, under it. -->
      <RowFault
        again={() => (copyFault ? copy(copyFault.what, copyFault.text) : null)}
        class="pb-space-2"
        data-copy-refused
        details={copyFault?.text}
        end="var(--space-5)"
        indent="var(--space-5)"
        reason={copyFault ? copyRefused(copyFault.what) : null}
      />
    </div>

    {#if harness}
      <!-- The harness the picker lists: a kept setting's browsed one, else the session's. -->
      {@const shownHarness = kept ? (browsing ?? harness) : harness}
      <!-- The body: one surface. Two levels in the card and no more (owner:
           "why don't we have proper heirachy y and have the controls as a
           coherent group?"): the head on the tab's own surface, and
           everything under it on the card's one body surface
           (`surface-raised`, the floating surface's) with no fill of its own: the
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
        <!-- The card's width holds the longest names whole ("Opus 5.5 · 1M",
             "medium", "Accept edits") with the chips' insides drawn in a little;
             a phone's row is ~350px, so the three chips fit it whole, the
             model's name included, with the chips' sides and gaps drawn in. A
             bordered chip already reads as tappable; its chevron is the room
             the model's name needs. The account chip keeps its own: it is the
             only hint that it opens anything. -->
        <div
          data-slot="settings"
          class="session-details-chips flex min-w-0 flex-wrap items-center gap-space-1"
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
              triggerClass={chipVariants({
                variant: "setting",
                size: "compact",
              })}
              triggerData={{ "data-model-chip": true }}
              width={360}
            >
              {#snippet trigger()}
                {@render modelChip()}
                <Down data-slot="chevron" />
              {/snippet}
              <!-- The model list, sized to its widest row and scrolled in
                   whole rows: five whole rows, 4px padding, five 44px rows,
                   four 2px gaps. The search is as wide as what is typed in it
                   (motion/autosize.svelte.ts autowidth), and tweens there a
                   character at a time. -->
              <div data-slot="model-pop" class="session-details-model-pop">
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
              data-model-chip
              data-variant="static"
              class={chipVariants({ variant: "setting", size: "compact" })}
              >{@render modelChip()}</span
            >
          {/if}
          <ToolChips
            closeOnCommit
            id="details"
            readonly={!editable}
            size="compact"
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
            <AccountSwitch
              instance={row}
              readonly={!accountOpen}
              size="compact"
            />
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
          <!-- The held line says one thing: a change's own line outranks
               why the live controls are locked. -->
          {#if !(editable || SLOTS.some((slot) => failure(slot) || pending(slot) || done[slot]))}
            <p
              data-slot="feedback"
              data-locked
              class="mt-space-2 text-size-body font-normal leading-body wrap-anywhere text-ink-muted"
              in:crossIn
              out:crossOut
            >
              {lockedWords}
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <!-- A meter wrapping to a second line tweens the strip's height (morph). -->
  <div
    data-slot="stats"
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
      data-slot="context"
      class="flex flex-auto flex-wrap items-center gap-x-space-2 gap-y-space-1"
    >
      {#if percent !== null && stats.totalTokens !== null && stats.maxTokens !== null}
        <span class="flex-none whitespace-nowrap text-ink-muted">Context</span>
        <span
          class="max-w-c-context-bar-max min-w-c-context-bar-min flex-1"
          title={readAt ? `Read at ${readAt}` : undefined}
        >
          <LimitBar
            elapsed={null}
            label="Context"
            reads="used"
            size="compact"
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
      <ProviderLimit
        label={providerLimit.label}
        meter={providerLimit.meter}
        now={limitNow}
        seenAt={providerLimit.seenAt}
      />
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
  <div
    data-slot="footer"
    class="flex flex-none items-center justify-end gap-space-2 px-space-5 py-space-4"
  >
    <Button
      class="max-phone:flex-1"
      onclick={() => {
        onclose();
        continueInNewSession(continueSourceOf(sessionId, title));
      }}
      size="sm"
    >
      Continue in new session…
    </Button>
  </div>
</div>
