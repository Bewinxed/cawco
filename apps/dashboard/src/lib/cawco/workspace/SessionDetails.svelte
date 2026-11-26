<script lang="ts" module>
  import { traitsOf } from "@cawco/core/harness/traits";
  import { storedStore } from "../stores/stored.svelte";

  const HOME = /^\/(home|Users)\/[^/]+/u;
</script>

<script lang="ts">
  import { accountProvidersOf, modelScope } from "@cawco/core/accounts";
  import { detach } from "@cawco/core/detach";
  import {
    EFFORT_NONE,
    type EffortLevel,
    type HarnessKind,
    harnessName,
    isEffortLevel,
  } from "@cawco/core/harness/kinds";
  import type { PermissionMode } from "@cawco/core/harness/modes";
  import { commonWords } from "@cawco/core/words/common";
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import { sessionStatWords } from "@cawco/core/words/session-stats";
  import { spawnWords } from "@cawco/core/words/spawn";
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { onDestroy, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { z } from "zod";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MiddleClip from "#lib/components/ui/middle-clip/middle-clip.svelte";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronDown as Down,
    IconCheck,
    IconRefresh,
    IconConnection as Link,
  } from "#lib/icons.js";
  import { copyRefused, copyToClipboard } from "#lib/platform/copy.js";
  import {
    CURVE,
    crossIn,
    crossOut,
    dur,
    easeOut,
  } from "#lib/platform/motion/curves.svelte.js";
  import { standsOpen } from "#lib/platform/motion/hang.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import AccountSwitch from "../accounts/AccountSwitch.svelte";
  import { forcePast, pickPastLimit } from "../accounts/limit-checks.svelte";
  import { nameOf } from "../accounts/model.svelte";
  import { chipQuota, type LimitRow, limitRowOf } from "../accounts/room";
  import { roomOf } from "../accounts/room-of";
  import {
    accountFault,
    movingTo,
    movingWords,
    pickWords,
  } from "../accounts/switch.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import HarnessLogo from "../HarnessLogo.svelte";
  import { signedInOn } from "../harness-offer.svelte";
  import { answeredOr } from "../hub/control";
  import { connectionStore } from "../hub/socket.svelte";
  import { describingRow, modelLabel } from "../models.svelte";
  import { bypasses, permissionModesFor } from "../permission-modes";
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";
  import ModelSection from "../spawn/ModelSection.svelte";
  import NsPopover from "../spawn/NsPopover.svelte";
  import ToolChips, {
    type EffortOff,
    effortNotExposed,
    NO_EFFORT_MODEL,
  } from "../spawn/ToolChips.svelte";
  import { accountsStore } from "../stores/accounts.svelte";
  import { boardStore, machineConnected } from "../stores/board.svelte";
  import { settingFault, submitCommand } from "../stores/commands.svelte";
  import { latestCommandFor } from "../stores/ledger.svelte";
  import {
    holdDetails,
    refreshContext,
    showContext,
  } from "../stores/session-detail.svelte";
  import { sessionsStore } from "../stores/sessions.svelte";
  import { relaunchSession } from "../stores/turns.svelte";
  import { usageStore } from "../stores/usage.svelte";
  import { fillState, firstToStop, limitRows, speakingReading } from "../usage";
  import ContextMeter, {
    type ContextReading,
  } from "../usage/ContextMeter.svelte";
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
     * project's conversation keeps its project's (ProjectConversationView): the model chip opens whether
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
  let contextEl = $state<HTMLElement>();
  let statsEl = $state<HTMLElement>();
  /** The harness mark arrives from the side the card moved toward. */
  function harnessIn(_node: Element): TransitionConfig {
    return {
      duration: reduceMotion.current ? 0 : dur("--duration-morph"),
      easing: easeOut,
      css: (t) =>
        `transform: translateX(calc(var(--pop-rise) * ${1 - t} * var(--dir))); opacity: ${t}`,
    };
  }
  const uid = $props.id();
  const session = $derived(sessionsStore.session(sessionId));
  const row = $derived(boardStore.instanceIndex.byId.get(sessionId));
  const context = $derived(contextOf(sessionId));
  const machineId = $derived(
    session?.machineId || row?.machineId || context?.machine
  );
  const machine = $derived(
    boardStore.machines.find((item) => item.machineId === machineId)
  );
  const harness = $derived(
    kept?.harness || session?.harness || row?.harness || context?.harness
  );
  const report = $derived(
    machine?.harnesses?.find((item) => item.harness === harness)
  );
  const cwd = $derived(session?.cwd || row?.cwd || context?.cwd || "");
  const stats = $derived(sessionsStore.statsOf(sessionId));
  /**
   * A transcript started outside CawCo that no session wraps: what its
   * first message resumes it with (client `ResumePlan`), read on its
   * machine from what it ran with. The settings below show it and pick it:
   * a pick changes what it launches with, and asks nothing of any machine.
   */
  const resume = $derived(
    kept
      ? null
      : storedStore.resumePlan(
          sessionId,
          machineId && harness ? { machineId, cwd, harness } : null
        )
  );
  const model = $derived.by(() => {
    if (kept) {
      return kept.model;
    }
    return resume ? resume.model : (session?.model ?? null);
  });
  /**
   * A model picked while the session waits to move (its row's
   * `owedMove.model`): the hub carries it with the move, and the process it
   * leaves keeps the one it runs. The chip and the list show it from the
   * pick, as the account chip shows the account it is moving to.
   */
  const picked = $derived(kept || resume ? undefined : row?.owedMove?.model);
  const shownModel = $derived(picked ?? model);

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
    if (traitsOf(harness).providerLimit === "account") {
      const accountId = row?.accountId;
      const claude = accountId ? usageStore.claudeLimits[accountId] : undefined;
      // The windows that bind the model it runs: every model's, and its
      // family's own (core `modelScope`), never another family's week.
      const scope = modelScope(model);
      const binding = claude && {
        ...claude,
        windows: claude.windows.filter(
          (one) => one.scopeLabel === null || one.scopeLabel === scope
        ),
      };
      const limit = firstToStop(limitRows("Claude", binding, limitNow));
      return limit && claude ? { ...limit, seenAt: claude.fetchedAt } : null;
    }
    if (
      traitsOf(harness).providerLimit === "go" &&
      model?.startsWith("opencode-go/")
    ) {
      const go = speakingReading(usageStore.openCodeGoLimits)?.reading;
      const limit = firstToStop(limitRows("opencode", go, limitNow));
      return limit && go ? { ...limit, seenAt: go.fetchedAt } : null;
    }
    return null;
  });
  const modelInfo = $derived(model ? describingRow(model) : null);
  const efforts = $derived(
    report?.capabilities.effort
      ? (modelInfo?.supportedEffortLevels ?? []).filter(isEffortLevel)
      : []
  );
  /**
   * Why the effort chip shows no level, when it shows none: the harness has no
   * effort, the session sends none, or its reading has not landed yet.
   */
  const effortOff = $derived.by((): EffortOff | null => {
    if (harness && report?.capabilities.effort === false) {
      return effortNotExposed(harness);
    }
    if (resume) {
      if (resume.effort) {
        return null;
      }
      return resume.run
        ? {
            label: transcriptWords.ownDefault,
            reason: transcriptWords.ownDefaultWhy(
              harness ? harnessName(harness) : ""
            ),
          }
        : { label: "Effort…", reason: transcriptWords.readingRun };
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
    // A session that runs is read; one that doesn't runs at what is picked
    // here, the harness's own default until then.
    if (effort === null && live) {
      return { label: "Effort…", reason: "Reading the session's effort" };
    }
    return null;
  });
  /** The effort the chip shows: a stored transcript's resume, else the session's. */
  const shownEffort = $derived.by(() => {
    if (resume) {
      return resume.effort;
    }
    return isEffortLevel(session?.effort) ? session.effort : null;
  });
  const modes = $derived(
    harness
      ? permissionModesFor(harness).filter((mode) =>
          report?.capabilities.permissionModes.includes(mode.value)
        )
      : []
  );
  const machineAway = $derived(!(machineId && machineConnected(machineId)));
  /** Its process runs, as the hub last heard: a switch into Bypass or Full Send starts it again. */
  const running = $derived(boardStore.liveId(sessionId));
  /** Its process runs and its machine is connected: it answers reads (its context). */
  const live = $derived(!machineAway && running);
  /**
   * A setting can be picked: the hub takes the model, effort, permission and
   * account in any state of the session, and one no process takes now is
   * kept for its next launch (hub setting-picks.ts, accounts/switch.svelte.ts).
   */
  const hubOpen = $derived(connectionStore.status === "connected");
  /** The settings take picks: the session's, or a stored transcript's resume once its machine has said what it ran with. */
  const settable = $derived(resume ? !!resume.run : hubOpen);
  /*
   * The reading only arrives when something asks for it, and the transcript
   * asks at the end of a turn it watched. A tab opened after a reload, or a
   * session mid-way through a long turn, has had nothing ask — so opening the
   * details asks, once per session shown, as soon as the session can answer.
   * Once: `live` re-derives on every change to the running list, and each
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
    if (!(live && mid && asked !== id && rootEl)) {
      return;
    }
    asked = id;
    // `live` re-derives on every change to the running list, so only a
    // new session (or the card closing) ends the wait, never a re-run.
    stopWaiting();
    stopWaiting = untrack(() =>
      whenOpen(() => detach(refreshContext(id, mid), "refreshContext"))
    );
  });
  onDestroy(() => stopWaiting());
  // The card draws this session's reading while it is mounted: its turns'
  // ends read it again only while one does (stores/session-detail.svelte.ts `showContext`).
  $effect(() => showContext(sessionId));
  /**
   * A copy the browser refused (the link, the working directory): said
   * under the head where it was pressed, with Try again and the text under
   * Show details; never a toast.
   */
  const CopyAskedSchema = z.object({ what: z.string(), text: z.string() });
  const copyKey = $derived(`copy:details:${sessionId}`);
  const copyFault = $derived(
    CopyAskedSchema.safeParse(refusals.get(copyKey)?.asked).data
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
  // under the control that asked, and nowhere else (stores/commands.svelte.ts).
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
      ? sessionStatWords.contextHeld
      : sessionStatWords.contextRefused(error);
  });
  /** When a session that can no longer answer was last read. */
  const readAt = $derived(
    !live && session?.context?.readAt
      ? new Date(session.context.readAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null
  );
  // @limit external: a percentage runs from 0 to 100
  const percent = $derived(
    stats.totalTokens !== null && stats.maxTokens
      ? Math.min(100, Math.round((stats.totalTokens / stats.maxTokens) * 100))
      : null
  );
  /**
   * This conversation's room in its model's window (its context), with its
   * exact numbers; else that it is being read, or why it wasn't; null with
   * none of these.
   */
  const contextRead = $derived.by((): ContextReading | null => {
    if (
      percent !== null &&
      stats.totalTokens !== null &&
      stats.maxTokens !== null
    ) {
      return {
        kind: "read",
        used: percent,
        state: fillState(percent),
        detail: sessionStatWords.contextTokens(
          tokens(stats.totalTokens),
          tokens(stats.maxTokens),
          readAt
        ),
      };
    }
    if (reading) {
      return { kind: "reading" };
    }
    return refusal ? { kind: "refused", why: refusal } : null;
  });
  /**
   * The account's room for the model the session runs: the window that
   * binds first, its share left, and when it resets; null with no reading.
   */
  const quota = $derived(
    providerLimit
      ? chipQuota(providerLimit, providerLimit.seenAt, limitNow)
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
    const account = accountsStore.accounts?.accounts.find(
      (one) => one.id === id
    );
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
      for (const el of [metaEl, contextEl, statsEl]) {
        el?.animate(
          [
            {
              transform: `translateX(calc(var(--pop-rise) * ${dir}))`,
              opacity: 0.6,
            },
            { transform: "none", opacity: 1 },
          ],
          { duration: dur("--duration-morph"), easing: CURVE.out }
        );
      }
    });
  });
  const shownPermission = $derived.by(() => {
    if (resume) {
      return resume.permissionMode;
    }
    return relaunching
      ? permissionBeforeRelaunch
      : (session?.permissionMode ?? null);
  });

  /** Whether this tab's change of `slot` is on its way, not yet answered. */
  function inFlight(slot: Exclude<Slot, "account">) {
    const record = latestCommandFor(sessionId, kinds[slot]);
    return record?.stage === "submitted" || record?.stage === "accepted";
  }
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
    // A model picked to go with a move waits for it to land.
    return inFlight(slot) || (slot === "model" && picked !== undefined);
  }
  /**
   * A model pick that rides a move to another account, with no newer pick
   * on its way: the account's line says the two together
   * ({@link movingWords}), so the model's says nothing.
   */
  const ridesMove = $derived(
    picked !== undefined &&
      !!row &&
      movingTo(row) !== undefined &&
      !inFlight("model")
  );
  /** What a change on its way says on its line. */
  function pendingWords(slot: Slot): string | undefined {
    if (slot === "account") {
      return row ? movingWords(row) : undefined;
    }
    if (slot === "model" && !inFlight("model") && row) {
      return pickWords(row);
    }
    return "Applying change…";
  }
  function failure(slot: Slot) {
    // A move refused as it was asked is moveTo's toast, the one place the
    // menu and the card both say it. A move shown waiting that then didn't
    // happen, or a stop at its account's limit, is the account line's error,
    // and its way out the picker right above it.
    if (slot === "account") {
      return row ? (accountFault(row) ?? null) : null;
    }
    if (slot === "permission" && relaunchFailure) {
      return relaunchFailure;
    }
    if (slot === "model" && kept) {
      return kept.refused;
    }
    // Kept for the session (stores/commands.svelte.ts `settingFault`), so a reload
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
   * the hold (--duration-hold), in the place its pending and failed lines take.
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
  /**
   * The model last picked to go with a move: it landed only when the row
   * runs it, never when the move, and the pick with it, was dropped.
   */
  let pickedBefore = untrack(() => picked);
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
    const runs = row?.model ?? null;
    const pick = picked;
    untrack(() => {
      const moved = id !== doneFor;
      for (const slot of SLOTS) {
        const landed =
          !moved &&
          wasPending[slot] &&
          !now[slot] &&
          !failed[slot] &&
          (slot !== "account" || account !== accountBefore) &&
          (slot !== "model" ||
            pickedBefore === undefined ||
            runs === pickedBefore);
        if (landed || moved || now[slot]) {
          clearTimeout(holds.get(slot));
          done[slot] = landed;
        }
        if (landed) {
          holds.set(
            slot,
            setTimeout(() => {
              done[slot] = false;
            }, dur("--duration-hold"))
          );
        }
      }
      doneFor = id;
      wasPending = now;
      if (!now.account) {
        accountBefore = account;
      }
      if (pick !== undefined || !now.model) {
        pickedBefore = pick;
      }
    });
  });
  onDestroy(() => {
    for (const hold of holds.values()) {
      clearTimeout(hold);
    }
  });

  /**
   * The account a model picked here runs on: the one the session is moving
   * to, else its own. Its readings say each model's limit there, and its
   * catalog what it offers.
   */
  const modelAccount = $derived(
    kept || resume || !row ? null : (movingTo(row) ?? row.accountId ?? null)
  );
  const modelKey = (id: string): string => `model:${modelAccount}:${id}`;
  /** A model's limit on {@link modelAccount}, for its row; none while it has room. */
  function modelLimitOf(id: string): LimitRow | undefined {
    if (!modelAccount) {
      return;
    }
    const there = roomOf(usageStore.claudeLimits[modelAccount], id, limitNow);
    return there?.kind === "limit"
      ? limitRowOf(modelKey(id), there, limitNow)
      : undefined;
  }
  /** Why a model can't run on {@link modelAccount}: its catalog doesn't list it. */
  function notOffered(entry: { id: string }): string | undefined {
    const catalog = accountsStore.accounts?.catalogs.find(
      (one) => one.accountId === modelAccount
    );
    if (
      !catalog ||
      catalog.models.some(
        (one) => one.value === entry.id || one.resolvedModel === entry.id
      )
    ) {
      return;
    }
    return limitPickWords.notOffered;
  }
  /** A model picked: changed, and the list shut. */
  function modelPicked(id: string): void {
    changeModel(id);
    modelOpen = false;
    browsing = undefined;
  }

  function changeModel(next: string) {
    if (resume) {
      storedStore.pickResume(sessionId, { model: next });
      return;
    }
    if (!(hubOpen && machineId) || inFlight("model") || next === shownModel) {
      return;
    }
    submitCommand(sessionId, machineId, {
      kind: "set-model",
      intent: { model: next },
    });
  }
  function changeEffort(next: EffortLevel) {
    if (resume) {
      storedStore.pickResume(sessionId, { effort: next });
      return;
    }
    if (
      !(hubOpen && machineId) ||
      pending("effort") ||
      next === session?.effort
    ) {
      return;
    }
    submitCommand(sessionId, machineId, {
      kind: "set-effort",
      intent: { effort: next },
    });
  }
  async function changePermission(next: PermissionMode) {
    if (resume) {
      storedStore.pickResume(sessionId, { permissionMode: next });
      return;
    }
    if (
      !(hubOpen && machineId) ||
      pending("permission") ||
      next === session?.permissionMode
    ) {
      return;
    }
    relaunchFailure = null;
    // Bypass, and Full Send on top of it, are launch-time decisions for the
    // harness: entering them from another mode starts a running session
    // again in place. Between the two the CLI stays in bypass, and a switch
    // is enough. A session whose process doesn't run now, or whose machine
    // is away, is kept on the mode by the hub and launches in it.
    const relaunches =
      live && bypasses(next) && !bypasses(session?.permissionMode);
    if (!relaunches) {
      submitCommand(sessionId, machineId, {
        kind: "set-permission-mode",
        intent: {
          mode: next,
        },
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
  <ProviderLogo model={shownModel ?? ""} size="control" />
  <span data-slot="chip-label"
    >{shownModel ? modelLabel(shownModel, harness) : "Model not reported"}</span
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
        class="m-0 min-w-0 flex-initial type-body wrap-anywhere text-status-fail-ink"
      >
        {failure(slot)}
      </p>
      {#if again}
        <Button
          data-again
          class="flex-none"
          icon={IconRefresh}
          label={commonWords.tryAgain}
          onclick={again}
          size="xs"
          variant="ghost"
        />
      {/if}
    </div>
  {:else if pending(slot) && !(slot === "model" && ridesMove)}
    <p
      data-slot="feedback"
      class="mark-line mt-space-2 flex items-start gap-space-2 type-body wrap-anywhere text-ink-muted"
      role="status"
      in:crossIn
      out:crossOut
    >
      <!-- A move says when it takes effect, in its rows' words (switch.svelte.ts). -->
      <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
        >{pendingWords(slot)}</span
      >
    </p>
  {:else if done[slot]}
    <p
      data-feedback
      data-slot="done"
      class="mark-line mt-space-2 flex items-center gap-space-1 type-body wrap-anywhere text-ink-muted"
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
            aria-label={commonWords.copyLink}
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
            aria-label={harnessName(harness)}
            class="inline-flex h-c-btn-h-sm flex-none items-center"
            role="img"
            title={harnessName(harness)}
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
        class={[
          "m-0 flex flex-wrap items-center gap-space-2 px-space-5 pt-0 text-size-meta font-normal leading-body text-ink-muted",
          contextRead ? "pb-0" : "pb-space-3",
        ]}
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
            <MiddleClip text={cwd.replace(HOME, "~")} />
          </button>
        {/if}
        <!-- Started clean, so a comparison tells it from one started with its
             context (core `SpawnPayload.clean`). -->
        {#if row?.clean}
          <span aria-hidden="true">·</span>
          <span data-slot="clean">{spawnWords.context.mark}</span>
        {/if}
      </p>
      <!-- The conversation's context, under what the conversation is, on
           the head's text column: the head's in-group step (space-1, as
           title to meta) above it, the head's foot (space-3) under it. -->
      {#if contextRead}
        <div class="px-space-5 pt-space-1 pb-space-3" bind:this={contextEl}>
          <ContextMeter reading={contextRead} />
        </div>
      {/if}
      <!-- A copy pressed in the head that the browser refused, under it. -->
      <RowFault
        again={() => (copyFault ? copy(copyFault.what, copyFault.text) : null)}
        class="pb-space-2"
        data-copy-refused
        details={copyFault?.text}
        end="var(--spacing-space-5)"
        indent="var(--spacing-space-5)"
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
             wraps. Under a finger the rows stand 16px apart, as a row of
             chips does (ui/chip `chipsVariants`), so each chip's 44px
             area (`touch-hit`, 28 drawn + 8 above + 8 below) meets the next
             row's at the midpoint; the chip itself stays the compact row's
             height. -->
        <!-- The card's width holds the longest names whole ("Fable 5.1 (1M context)",
             "medium", "Accept edits") with the chips' insides drawn in a little;
             a phone's row is ~350px, so the three chips fit it whole, the
             model's name included, with the chips' sides and gaps drawn in. A
             bordered chip already reads as tappable; its chevron is the room
             the model's name needs. The account chip keeps its own: it is the
             only hint that it opens anything. -->
        <div
          data-slot="settings"
          class="session-details-chips flex min-w-0 flex-wrap items-center gap-space-1 hit-gap-x-space-1 hit-gap-y-space-1 coarse:gap-y-space-4 coarse:hit-gap-y-space-4"
        >
          {#if settable || kept}
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
              prebuild
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
                  unsigned={kept && machineId
                    ? keptHarnesses.filter(
                        (kind) => !signedInOn(kind, machineId)
                      )
                    : []}
                  machineName={machine?.hostname ?? ""}
                  model={shownHarness === harness ? (shownModel ?? "") : ""}
                  onharness={(next) => {
                    // A running session keeps its harness; a kept one's
                    // rail is browsed, and a model picked there chooses both.
                    browsing = next;
                  }}
                  limitOf={modelLimitOf}
                  onforce={(id) =>
                    forcePast(modelKey(id), () => modelPicked(id))}
                  onmodel={(id) => {
                    if (kept) {
                      kept.onchoose({ harness: shownHarness, model: id });
                      modelOpen = false;
                      browsing = undefined;
                      return;
                    }
                    // A model at its limit on the account it would run on is
                    // checked again before the pick goes (limit-checks).
                    if (modelAccount && modelLimitOf(id)?.limited) {
                      detach(
                        pickPastLimit(modelKey(id), modelAccount, id, () =>
                          modelPicked(id)
                        ),
                        "pickPastLimit"
                      );
                      return;
                    }
                    modelPicked(id);
                  }}
                  unavailable={kept ? undefined : notOffered}
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
            readonly={!settable}
            size="compact"
            tools={{
              efforts,
              effort: shownEffort,
              effortOff,
              oneffort: changeEffort,
              modes: modes.map((mode) => ({
                value: mode.value,
                disabled: !settable || pending("permission"),
              })),
              harness,
              permission: shownPermission,
              onpermission: changePermission,
              // A resume, or a session that doesn't run, starts in the mode
              // picked: nothing runs to start again.
              restartsOnFullSend:
                !resume && running && !bypasses(session?.permissionMode),
            }}
          />
          <!-- The account the session bills: the group's fourth setting,
               wrapping with the others when the row runs out. -->
          {#if row?.accountId}
            <AccountSwitch
              instance={row}
              {quota}
              readonly={!hubOpen}
              size="compact"
            />
          {:else if resume?.run && resume.run.account !== undefined && machineId && harness}
            <!-- The account it resumes on: the one its transcript is kept
                 under, or, kept under the machine's own sign-in, the
                 account signed in here as that login. With none, it names
                 none until one is picked. A pick is the resume's, no move
                 of any session. -->
            <AccountSwitch
              instance={{
                id: sessionId,
                machineId,
                accountId: resume.account,
              }}
              none={{
                label: transcriptWords.machineSignIn,
                provider: accountProvidersOf(harness, resume.model)[0] ?? "",
              }}
              onpick={(account) =>
                storedStore.pickResume(sessionId, { account })}
              readonly={!hubOpen}
              size="compact"
            />
          {/if}
        </div>
        <!-- One line is always held for what a change says, so its pending,
             done and failed lines arriving or leaving never resize the card. -->
        <!-- The margin above the line plus the line itself. -->
        <div
          class="relative grid min-h-(--feedback-min) text-size-body leading-body"
          style:--feedback-min="calc(var(--spacing-space-2) + 1lh)"
        >
          {@render feedback("model")}
          {@render feedback("effort")}
          {@render feedback("permission")}
          {@render feedback("account")}
          <!-- The held line says one thing: a change's own line outranks
               what a stored transcript resumes with. -->
          {#if resume && !machineAway}
            <!-- A stored transcript's settings are what its first message
                 resumes it with. -->
            <p
              data-slot="feedback"
              data-resumes
              class="mt-space-2 type-body wrap-anywhere text-ink-muted"
              in:crossIn
              out:crossOut
            >
              {resume.run
                ? transcriptWords.resumesWith
                : transcriptWords.readingRun}
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <!-- The conversation's MCP servers. Its context is the meter under the
       head; the account's limit is no stat of the conversation, and stands
       on its account chip. -->
  {#if session?.mcp}
    <div
      data-slot="stats"
      class="flex flex-none items-center border-t border-t-border-hairline px-space-5 pt-space-3 pb-0 text-size-meta font-normal leading-body num text-ink-strong"
      bind:this={statsEl}
      {@attach morph()}
    >
      <a
        data-slot="tools"
        class="inline-flex items-center text-ink-strong hover:text-ink-strong"
        href="/config/mcp">{@render figure(`${session.mcp.length} MCP`)}</a
      >
    </div>
  {/if}
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
