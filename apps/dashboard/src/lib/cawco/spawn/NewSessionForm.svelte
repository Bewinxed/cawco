<script lang="ts">
  import {
    type AccountProvider,
    accountNameAmong,
    CLAUDE_PROVIDER,
    contextFitRefusal,
    type EffortLevel,
    HARNESSES,
    type HarnessKind,
    isGitUrl,
    type MoveEstimate,
    type PermissionMode,
    type PlacementPreview,
    providerOf,
    repoPath,
    SUMMARISER_OUTPUT_RESERVE_TOKENS,
    moveSize as sizeWords,
    TARGET_HEADROOM_TOKENS,
  } from "@cawco/core";
  import type { Bounded } from "@cawco/core/bounded";
  import { tick, untrack } from "svelte";
  import { awayOf, failureWords, hubRefusal } from "#lib/cawco/hub-read.js";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button, pressVariants } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { sheetHeadVariants } from "#lib/components/ui/drawer/sheet-head.js";
  import {
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  /**
   * The New Session form, the one every start with no form of its own opens.
   * This file owns the logic — open-reset boundary, submission generation
   * guard, draft snapshot, dual location verification, the exact
   * `spawnSession` payload — and composes the designed sections. Its frame is
   * a popover hanging from the trigger pressed (NewSessionPopover), the
   * bottom sheet under 640px (NewSessionDialog). The frame calls `close` when
   * it is dismissed and `escapeStep` on Esc.
   *
   * A start belongs to its work, not to this form (DESIGN.md, The Work
   * Outlives Its Surface Rule): Start parks it in the tab's parked starts
   * (spawn/parked), which it runs into, and the form shows it from there
   * (`spawning.shown`) while it is open. Dismissed, the form closes and the
   * start goes on as its own row; only the form's Cancel drops what it
   * holds. Its picks are kept in the tab's storage and its prompt in the
   * draft store, so a reload opens it again as it was.
   */
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronLeft,
    IconKey,
    IconShield,
    IconClose as X,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import Bolt from "~icons/solar/bolt-bold-duotone";
  import Book from "~icons/solar/book-2-bold-duotone";
  import Chat from "~icons/solar/chat-round-line-bold-duotone";
  import Files from "~icons/solar/folder-with-files-bold-duotone";
  import Stars from "~icons/solar/stars-bold-duotone";
  import {
    answeredOr,
    cawco,
    didntAnswer,
    type ForkSource,
    forkSession,
    machineFs,
    placementFor,
    projectAtFolder,
    spawnSession,
  } from "../client.svelte";
  import {
    type ContinueSource,
    cancelContinuation,
    continuationStageWords,
    type SessionDraft,
    startContinuation,
  } from "../continue.svelte";
  import type { DraftContent } from "../draft-store";
  import { EFFORT_LEVELS } from "../effort-levels";
  import { type FleetSnapshot, inspectMachine } from "../fleet";
  import { newId } from "../id";
  import { conversationHref } from "../links";
  import MachineAway from "../MachineAway.svelte";
  import { awayWords, MachineWait } from "../machine-wait.svelte";
  import { loadModelWindows, models } from "../models.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import { handOver } from "../motion/share.svelte";
  import MoveAskBody from "../move/MoveAsk.svelte";
  import { moveEstimate, startMove } from "../move.svelte";
  import {
    fullSendCopy,
    modeRefusal,
    permissionModesFor,
  } from "../permission-modes";
  import { checkoutOf, checkoutOn, placedOn } from "../projects";
  import {
    rememberedMachine,
    rememberMachine,
    rememberSpawn,
    spawnPrefs,
  } from "../spawnPrefs.svelte";
  import { readJson, store, stored, unstore, writeJson } from "../storage";
  import AttachButton from "../transcript/AttachButton.svelte";
  import AttachmentChips from "../transcript/AttachmentChips.svelte";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import { keepDraft } from "../transcript/keep-draft.svelte";
  import { TRY_AGAIN } from "../unanswered";
  import { startForecast, usage } from "../usage/forecast.svelte";
  import { fmt, type Part } from "../usage/rings";
  import type { AccountTool } from "./AccountChip.svelte";
  import LifetimeChip from "./LifetimeChip.svelte";
  import LocationChip from "./LocationChip.svelte";
  import MachinesChip from "./MachinesChip.svelte";
  import ModelSection from "./ModelSection.svelte";
  import { deriveModelEntries, type ModelEntry } from "./model-entries";
  import { lastSpawnAt, lastUsedAt, recordModelUse } from "./modelUse.svelte";
  import NsPopoverGroup from "./NsPopoverGroup.svelte";
  import { placeOf, type SpawnPrefill, spawning } from "./new-session.svelte";
  import type {
    LeadChip,
    MachineItem,
    MenuItem,
    ProjectItem,
  } from "./ns-types";
  import ProjectChip from "./ProjectChip.svelte";
  import PromptEditor from "./PromptEditor.svelte";
  import {
    askedFor,
    beginStart,
    dropStart,
    failStart,
    followJob,
    keepDraftOf,
    type ParkedStart,
    parkedStart,
    parkKey,
    planAsks,
    sentTo,
    stageStart,
    startedStart,
  } from "./parked.svelte";
  import Segmented from "./Segmented.svelte";
  import SessionFooter from "./SessionFooter.svelte";
  import { effortNotExposed } from "./ToolChips.svelte";

  let {
    open,
    prefill,
    continueFrom,
    onclose,
    onparked,
    onexitcontinue,
    sheet = false,
  }: {
    open: boolean;
    /**
     * In the kit's bottom sheet (NewSessionDialog under 640px): the sheet's
     * header is the kit's, titled `title()`, with its Close, so the form
     * draws no head of its own; step 2's way back is the form's first row.
     */
    sheet?: boolean;
    prefill?: SpawnPrefill;
    /**
     * Continue in new session: the form starts a session seeded with a summary
     * of this one. Mutually exclusive with `prefill` — the source says where.
     */
    continueFrom?: ContinueSource;
    onclose: () => void;
    /**
     * Dismissed on a start, which goes on as its own row (spawn/parked): its
     * id, for the frame to travel into that row as it closes.
     */
    onparked?: (id: string) => void;
    /** The operator deleted the source chip: the dialog stays open as a plain New Session. */
    onexitcontinue?: () => void;
  } = $props();
  /** The card's head and its Close, as every kit sheet draws them. */
  const sheetHead = sheetHeadVariants();
  /** A home folder at the start of a path (Linux, macOS). */
  const HOME = /^\/(home|Users)\/[^/]+(?=\/|$)/;
  /**
   * The first prompt, its words and its attachments, as a session's composer
   * holds a message: attached, uploaded and sent the same way.
   */
  const firstMessage = new ComposerDraft();
  /** Where this tab names its key for the first prompt in the draft store. */
  const KEPT_KEY = "cawco:new-session-draft";
  /**
   * This tab's key for the first prompt in the draft store: minted once and
   * kept in the tab's own storage, so a reload finds the same draft and
   * another tab keeps its own.
   */
  let mintedKey: string | null = null;
  function keptKey(): string {
    let id = stored("session", KEPT_KEY);
    if (!id) {
      mintedKey ??= newId();
      id = mintedKey;
      store("session", KEPT_KEY, id);
    }
    return `new-session:${id}`;
  }
  // The first prompt outlives a reload of this tab (`reload.svelte.ts`), and
  // a dismissal, as a session's draft does: kept as it is written while the
  // form is open, read back as it opens, gone on Cancel or once it has
  // started a session. A form showing a parked start keeps that start's
  // prompt under the start's own key instead (spawn/parked `parkKey`).
  const keptDraft = keepDraft(firstMessage, () => {
    if (!open) {
      return null;
    }
    return parkedStart(spawning.shown)
      ? parkKey(spawning.shown as string)
      : keptKey();
  });
  /** Where the tab keeps the form's picks while it is open on no start. */
  const FORM_KEY = "cawco:new-session-form";
  /** The form's picks as kept: what it was opened with, the picks, and whether step 2 stood. */
  interface KeptPicks {
    opening: string;
    picks: SessionDraft;
    step: boolean;
  }
  const STILL_UPLOADING = "Wait for your file to finish uploading.";
  /** Start's word while the machine reads the folder it starts in. */
  const CHECKING = "Checking the folder…";
  const NOT_UPLOADED =
    "A file couldn't upload. Tap it to try again, or remove it.";
  // Either holds Start only while its file does: settled, it is gone.
  $effect(() => {
    const { uploading, unready } = firstMessage;
    untrack(() => {
      if (
        (error === STILL_UPLOADING && !uploading) ||
        (error === NOT_UPLOADED && !unready)
      ) {
        error = "";
      }
    });
  });
  let editor = $state<HTMLDivElement>();
  /**
   * A location set with Enter or "Use this folder": its popover closes and
   * the prompt takes the keys again, caret after what is already written.
   * Focus moves as the popover closes (`promptAfterClose`): while it is open
   * it keeps focus inside itself. A popover closed any other way (Escape)
   * returns focus to its chip.
   */
  let promptNext = false;
  function backToPrompt() {
    promptNext = true;
    popover = null;
  }
  function promptAfterClose(): boolean {
    if (!(promptNext && editor)) {
      return false;
    }
    promptNext = false;
    focusPrompt();
    return true;
  }
  /**
   * The prompt, the form's first field, takes the keys, caret after what is
   * already written: a frame opened from a trigger starts the form here.
   */
  export function focusPrompt(): void {
    if (!editor) {
      return;
    }
    editor.focus({ preventScroll: true });
    const caret = document.createRange();
    caret.selectNodeContents(editor);
    caret.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
  }
  let submission = 0;
  let machineIds = $state<string[]>([]);
  /** Set once the operator picks machines themselves; stops the late-arrival adoption below. */
  let machinesTouched = $state(false);
  /** The machine the form last started a session on, read as it opens (spawnPrefs `rememberedMachine`). */
  let remembered = $state<string | null>(null);
  let cwd = $state("");
  let repo = $state<string>();
  let harness = $state<HarnessKind>(spawnPrefs.harness);
  let model = $state("");
  let effort = $state<EffortLevel | null>(null);
  /** None until the person picks one, when no start of theirs is remembered: Start waits for it. */
  let permissionMode = $state<PermissionMode | null>(spawnPrefs.permissionMode);
  /**
   * Full Send came with the form (the last start's mode, or a failed
   * continuation's) rather than from a pick in it: the warning says where
   * it came from. A pick in the picker, confirmed there, clears it.
   */
  let fullSendCarried = $state(false);
  let projectId = $state<string>();
  let editing = $state(false);
  let spinOff = $state(false);
  /** Why Start held back before anything was sent (a file uploading, a form that doesn't hold); "" otherwise. */
  let error = $state("");
  let unreadable = $state(false);
  /**
   * The estimate and the folder checks whose machine went away: said in
   * place, and asked again once it is back.
   */
  const waits = new MachineWait();
  /** A machine that did not answer the folder check in time, in its sentence; "" when none. */
  let unanswered = $state("");
  let missingMachines = $state<string[]>([]);
  let verifiedLocation = $state("");
  /**
   * A Start pressed while the machine was still reading the folder: the
   * location it was pressed for. The session starts the moment that check
   * lands (or the press is answered with its refusal), never a press lost.
   */
  let pressedFor = $state<string | null>(null);
  let popover = $state<"machines" | "project" | "location" | "lifetime" | null>(
    null
  );
  let skills = $state<string[]>([]);
  let plugins = $state<string[]>([]);
  /** Continue mode: who writes the summary. Reset on every open; never remembered. */
  let summarizerHarness = $state<HarnessKind>(spawnPrefs.harness);
  let summarizerModel = $state("");
  /**
   * Continue mode: what the new session opens on. `summary`: a summary, the
   * artifact index and the last turns. `asks`: the person's own messages
   * alone, verbatim and in order; nothing is summarised. Reset on every open.
   */
  let carry = $state<"summary" | "asks">("summary");
  /** Continue mode: the hub's sizing of what the continuation carries. */
  let estimate = $state<{
    /** How many of the person's messages a restart from them carries. */
    asks: number;
    liveContextTokens: number;
    summariseInputTokens: number;
    openingTokens: number;
  } | null>(null);
  /**
   * The parked start the form shows (spawn/parked): its stage while it
   * runs, its failure, the session it started. None for a form not started.
   */
  const showing = $derived(open ? parkedStart(spawning.shown) : undefined);
  /** A start runs: the form takes no input, and Start says its stage. */
  const busy = $derived(showing?.state === "running");
  /** What the form says went wrong: its own hold, or the start's failure. */
  const failure = $derived(
    error || (showing?.state === "failed" ? showing.error : "")
  );
  const machineId = $derived(machineIds[0] ?? "");
  const locationKey = $derived(JSON.stringify([machineIds, cwd.trim()]));
  const locationUnverified = $derived(
    Boolean(machineIds.length && cwd.trim()) && verifiedLocation !== locationKey
  );
  const machine = $derived(
    cawco.machines.find((row) => row.machineId === machineId)
  );
  /**
   * Whether the first machine is connected, as a value: every board publish
   * hands over a new `machine` row, and the location check below must run
   * again when the machine comes or goes, never because the board moved.
   */
  const machineOnline = $derived(machine?.status === "online");
  const offlineMachine = $derived(
    cawco.machines.find(
      (row) => machineIds.includes(row.machineId) && row.status !== "online"
    )
  );
  const report = $derived(
    machine?.harnesses?.find((row) => row.harness === harness)
  );
  const installedHarnesses = $derived(
    HARNESSES.filter((kind) =>
      machine?.harnesses?.some(
        (entry) => entry.harness === kind && entry.installed
      )
    )
  );
  /**
   * Where a session here would start, as the hub's placement preview says
   * (`/api/accounts/placement`): the account it would run on (a Claude
   * session's catalog is what the picker offers), and the model it was read
   * for as the session would start on it, in its own directory: pi's
   * `default` is what pi picks in that folder (its `.pi/settings.json`
   * included). The account chip names its provider by that model and nothing
   * else, so it never offers another provider's accounts than placement
   * places on. Null while unread and for no machine. A new answer replaces
   * the last only when it lands: until then the chip keeps what it showed.
   * Placement weighs every account's readings and bench, so it is asked again
   * whenever the hub's accounts view moves (`cawco.accounts` is replaced only
   * when it differs): Auto never names an account that has since run out.
   */
  /** How long a folder being typed rests before placement is asked about it, ms. */
  const PLACEMENT_SETTLE_MS = 250;
  let placement = $state<{
    preview: PlacementPreview;
    provider: AccountProvider | undefined;
  } | null>(null);
  /**
   * Why no session can start here, in the hub's words: no account of its
   * provider is signed in on the machine, or none of them is allowed. Start
   * waits on it.
   */
  let placementRefusal = $state<string | null>(null);
  $effect(() => {
    const view = cawco.accounts;
    const query = {
      harness,
      machineId,
      ...(model ? { model } : {}),
      ...(workdir ? { cwd: workdir } : {}),
      ...(projectId ? { projectId } : {}),
    };
    if (!(machineId && view)) {
      placement = null;
      placementRefusal = null;
      return;
    }
    let stale = false;
    // A folder being typed is asked about once it rests.
    const timer = setTimeout(() => {
      placementFor(query)
        .then((preview) => {
          if (!stale && preview) {
            placement = {
              preview,
              provider: providerOf(query.harness, preview.model),
            };
            placementRefusal = null;
          }
        })
        .catch((cause: unknown) => {
          if (!stale) {
            placement = null;
            placementRefusal = failureWords(cause);
          }
        });
    }, PLACEMENT_SETTLE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });
  /** The account picked for this session alone; null: Auto, where placement puts it. */
  let account = $state<string | null>(null);
  $effect(() => {
    startForecast();
  });
  const placedAccount = $derived(
    account ?? placement?.preview.accountId ?? null
  );
  const offered = $derived(
    models.forHarness(
      harness,
      machineIds,
      harness === "claude" ? placedAccount : undefined
    )
  );
  /**
   * The account chip on the model section's heading, when two or more of the
   * session's provider's accounts are signed in on the chosen machine: Auto
   * with placement's reason, and each account with its rings and a key
   * line. Not on a continuation: its request (the hub's `continueBody`) has
   * no account to carry a pick in. Not on a fork either: it runs on its
   * parent's account.
   */
  const accountTool = $derived.by((): AccountTool | null => {
    const provider = placement?.provider;
    if (!provider) {
      return null;
    }
    // The provider's accounts signed in on the chosen machine: those a
    // session there can run on.
    const signedIn = new Set(
      (cawco.accounts?.signins ?? [])
        .filter(
          (one) => one.machineId === machineId && one.state === "signed-in"
        )
        .map((one) => one.accountId)
    );
    const own = (cawco.accounts?.accounts ?? [])
      .filter((one) => one.provider === provider && signedIn.has(one.id))
      .sort((a, b) => a.order - b.order);
    if (continueFrom || forking || own.length < 2) {
      return null;
    }
    const { now } = usage;
    return {
      value: account,
      auto: {
        id: placement?.preview.accountId ?? null,
        why: placement?.preview.why ?? "",
      },
      onpick: (id) => {
        account = id;
      },
      options: own.map((one) => {
        const ring =
          usage.claude?.accounts.find((r) => r.id === one.id) ?? null;
        // Only Claude's accounts have rings here; another provider's says
        // nothing it can't read.
        let line: Part[] =
          provider === CLAUDE_PROVIDER ? ["no reading yet"] : [];
        if (ring?.state === "limit") {
          line = [
            "at its limit, back in ",
            { strong: ring.backAt === null ? "" : fmt(ring.backAt - now) },
          ];
        } else if (one.neverBackup) {
          line = ["never a backup, only when picked"];
        } else if (ring?.w5) {
          line = [
            { strong: `${ring.w5.left}% left` },
            ...(ring.w5.resetsAt === null
              ? [" of 5 hours"]
              : [` of 5 hours, resets in ${fmt(ring.w5.resetsAt - now)}`]),
          ];
        }
        return {
          id: one.id,
          name: accountNameAmong(one, cawco.accounts?.accounts ?? []),
          nick: one.label,
          email: one.email,
          color: `var(--account-${one.hue})`,
          ring,
          line,
          disabled: ring?.state === "limit",
        };
      }),
    };
  });
  const entries = $derived(
    deriveModelEntries(offered, {
      lastSpawnAt: lastSpawnAt(harness),
      lastUsedAt: Object.fromEntries(
        offered.flatMap((row) => {
          const id = row.resolvedModel ?? row.value;
          const used = lastUsedAt(harness, id);
          return used ? [[id, used]] : [];
        })
      ),
    })
  );
  const selected = $derived(
    entries.find((row) => row.id === model) ??
      (model ? undefined : entries.find((row) => row.isDefault))
  );
  const stops = $derived(
    EFFORT_LEVELS.map((stop) => ({
      ...stop,
      reachable:
        report?.capabilities.effort === true &&
        (selected?.effort.includes(stop.value) ?? false),
    }))
  );
  const efforts = $derived(
    stops.filter((stop) => stop.reachable).map((stop) => stop.value)
  );
  /**
   * What the slider shows while `effort` is untouched (`null`, omitted from
   * the payload): the level the model ran at on its account when nobody chose
   * one, once a session has said it; until then no level, which reads
   * "Default".
   */
  const effortShown = $derived.by(
    (): EffortLevel | null => effort ?? selected?.defaultEffort ?? null
  );
  /** A harness that reports no permission modes (pi) has none to pick, so no control shows and none is sent. */
  const modeless = $derived(report?.capabilities.permissionModes.length === 0);
  const modes = $derived(
    modeless
      ? []
      : permissionModesFor(harness).map((mode) => {
          const refused = machineId
            ? modeRefusal(
                machine?.hostname ?? machineId,
                harness,
                mode.value,
                report
              )
            : null;
          return {
            value: mode.value,
            disabled: refused !== null,
            reason: refused ?? undefined,
          };
        })
  );
  /**
   * Why the form's mode can't go out on the chosen machine ({@link
   * modeRefusal}). The mode is never swapped for another: Start waits until
   * the machine reports its harness, or the person picks a mode it takes.
   */
  const modeRefused = $derived(
    machineId && !modeless && permissionMode !== null
      ? modeRefusal(
          machine?.hostname ?? machineId,
          harness,
          permissionMode,
          report
        )
      : null
  );
  const workdir = $derived(
    repo === undefined
      ? cwd.trim()
      : `${cwd.trim().replace(/\/+$/, "")}/${repoPath(repo).split("/").pop() ?? ""}`
  );
  const project = $derived(cawco.projects.find((row) => row.id === projectId));
  /** A fork its source had no mode for (spawn/new-session `startFork`): Start forks it. Never on a continuation. */
  const forking = $derived(continueFrom ? undefined : prefill?.fork);
  /**
   * The project of the session being continued: the hub starts the new
   * session in it whatever the form says, so it is named, not picked. Null
   * when the source has none, and the picker chooses one.
   */
  const sourceProject = $derived.by(() => {
    const id = continueFrom
      ? cawco.instanceIndex.byId.get(continueFrom.instanceId)?.projectId
      : undefined;
    return id ? cawco.project(id) : null;
  });
  const locked = $derived(
    Boolean(
      (prefill?.machineId ||
        prefill?.cwd ||
        prefill?.projectId ||
        projectId ||
        continueFrom) &&
      !editing
    ) && repo === undefined
  );
  /**
   * The project moves to the machine first (Projects §5.1; the design's
   * §1b): a project is chosen, one machine, and the project has no checkout
   * there. A continuation and a repository's clone never move.
   */
  const moveTo = $derived(
    project &&
      machineIds.length === 1 &&
      !continueFrom &&
      repo === undefined &&
      !checkoutOn(project, machineIds[0])
      ? machineIds[0]
      : null
  );
  /** A folder there the person typed instead of the hub's (the destination was taken). */
  let moveAt = $state<string>();
  /** The destination's chip was unlocked to type another folder. */
  let moveEditing = $state(false);
  /** The machines a move reads from and to, online or not: a change reads it again. */
  const moveMachinesOnline = $derived(
    project && moveTo
      ? [moveTo, checkoutOf(project)?.machineId ?? ""].map(
          (id) =>
            cawco.machines.find((row) => row.machineId === id)?.status ===
            "online"
        )
      : []
  );
  /** What the estimate below is asked about: the project, the machine, the folder. */
  const moveFor = $derived(
    project && moveTo
      ? JSON.stringify([project.id, moveTo, moveAt ?? "", moveMachinesOnline])
      : ""
  );
  /** The hub's estimate of the move, or why it couldn't read one, for what `moveFor` names. */
  let moveRead = $state<{
    for: string;
    estimate?: MoveEstimate;
    error?: string;
  } | null>(null);
  const moveAnswer = $derived(moveRead?.for === moveFor ? moveRead : null);
  const moveEstimated = $derived(moveAnswer?.estimate);
  /** A move is needed and can run: Start says "Move & start". */
  const moving = $derived(
    Boolean(
      moveTo &&
      moveEstimated?.needed &&
      !moveEstimated.refused &&
      moveEstimated.ask
    )
  );
  /** The folder there is already a clone of the project: Start starts in it. */
  const movedAlready = $derived(
    Boolean(moveTo && moveEstimated && !moveEstimated.needed)
  );
  /**
   * Step 2 (the owner's revision of C): "Move & start" morphs the form to
   * what moving does and its yes; Back returns to the form as it was.
   */
  let moveStep = $state(false);
  $effect(() => {
    if (!moving) {
      moveStep = false;
    }
  });
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — a new machine or project starts the destination over
    void moveTo;
    untrack(() => {
      moveAt = undefined;
      moveEditing = false;
    });
  });
  $effect(() => {
    const key = moveFor;
    const id = project?.id;
    const target = moveTo;
    if (!(open && key && id && target) || cawco.hub !== "connected") {
      return;
    }
    if (untrack(() => moveRead?.for === key)) {
      return;
    }
    const at = untrack(() => moveAt);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      moveEstimate(id, target, at, controller.signal).then(
        (read) => {
          moveRead = { for: key, estimate: read };
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) {
            moveRead = {
              for: key,
              error: failureWords(cause),
            };
          }
        }
      );
    }, PLACEMENT_SETTLE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });
  /** A machine's home as `~`, as the chips say a folder. */
  const tilde = (path: string): string => path.replace(HOME, "~");
  /** Where the project goes on the machine: the folder typed, the hub's, or its default until read. */
  const moveDestination = $derived(
    moveAt ??
      (moveEstimated?.display ||
        `~/${cwd.trim().split("/").filter(Boolean).pop() ?? ""}`)
  );
  /** Bytes a clone of the project fetches, large files too, once any estimate of it is read. */
  const moveBytes = $derived(
    project && moveRead?.estimate?.needed && moveRead.for.includes(project.id)
      ? moveRead.estimate.bytes + moveRead.estimate.lfsBytes
      : undefined
  );
  const HUES = [
    "var(--hue-amber-500)",
    "var(--hue-green-500)",
    "var(--hue-cyan-400)",
    "var(--hue-blue-500)",
    "var(--hue-orange-500)",
  ];
  const loadLabel = (online: boolean, running: number) => {
    if (!online) {
      return "Offline";
    }
    return running === 0
      ? "Idle"
      : `${running} session${running === 1 ? "" : "s"}`;
  };
  const machineItems = $derived<MachineItem[]>(
    cawco.machines.map((row, i) => {
      const online = row.status === "online";
      const running = cawco.liveOn(row.machineId).length;
      // With a project chosen, each row says where it is there, or that
      // Start clones it there first (design §1b).
      const place = project ? checkoutOn(project, row.machineId) : undefined;
      let moves: string | undefined;
      if (project && !place) {
        moves =
          moveBytes === undefined
            ? "will clone"
            : `will clone · ${sizeWords(moveBytes)}`;
      }
      return {
        id: row.machineId,
        name: row.hostname,
        os: row.os,
        icon: machineIcon(row.os),
        online,
        load: loadLabel(online, running),
        hue: machineHue(i, online),
        place: place ? tilde(place.path) : moves,
      };
    })
  );
  /**
   * A project is offered on every chosen machine where it has a checkout,
   * as the folder it is there: the first chosen machine that has one, its
   * primary place first.
   */
  /**
   * With no machine chosen yet, every project is offered on every machine
   * the hub knows where it has a checkout, one row each, named for its
   * machine: picking one picks both (`pickProject`). Nothing is chosen
   * without a press.
   */
  /** A project offered where it has a checkout, and the machine named when every machine's are listed. */
  interface Offered {
    machine: string | undefined;
    place: NonNullable<ReturnType<typeof checkoutOn>>;
    row: (typeof cawco.projects)[number];
  }
  const projectItems = $derived<ProjectItem[]>(
    cawco.projects
      .flatMap((row): Offered[] => {
        if (machineIds.length === 0) {
          return cawco.machines.flatMap((one) => {
            const place = checkoutOn(row, one.machineId);
            return place ? [{ row, place, machine: one.hostname }] : [];
          });
        }
        const place = machineIds
          .map((id) => checkoutOn(row, id))
          .find((found) => found !== undefined);
        return place ? [{ row, place, machine: undefined }] : [];
      })
      .map(({ row, place, machine: on }, i) => ({
        id: row.id,
        machineId: place.machineId,
        ...(on ? { machine: on } : {}),
        name: row.name,
        path: place.path,
        hue: HUES[(i + 3) % 5],
      }))
      // The chosen project stays chosen on a machine it moves to, where it goes.
      .concat(
        project && moveTo && !checkoutOn(project, moveTo)
          ? [
              {
                id: project.id,
                machineId: moveTo,
                name: project.name,
                path: moveDestination,
                hue: HUES[3],
              },
            ]
          : []
      )
  );
  const locationReading = $derived.by(() => {
    if (offlineMachine) {
      return `${offlineMachine.hostname} is offline. Pick another machine, or start when it returns.`;
    }
    if (unreadable) {
      return `That directory can't be read on ${machine?.hostname ?? machineId}. Check the path and try again.`;
    }
    if (unanswered) {
      return unanswered;
    }
    // A folder check whose machine went away waits for it, and says so here.
    const away = machineIds
      .map((id) => waits.away(`location:${id}`))
      .find((one) => one !== null);
    if (away) {
      return awayWords(away, Date.now());
    }
    if (!locationUnverified && missingMachines.length) {
      const names = missingMachines.map(
        (id) =>
          cawco.machines.find((row) => row.machineId === id)?.hostname ?? id
      );
      return `Folder missing. Start creates it on ${names.join(", ")}.`;
    }
    return "";
  });
  /**
   * A move's reading (design §1b, §1c): what Move & start does first and how
   * much it fetches, or the hub's reason it can't move.
   */
  const moveReading = $derived.by(() => {
    if (!(project && moveTo)) {
      return "";
    }
    if (moveAnswer?.error) {
      return moveAnswer.error;
    }
    if (!moveEstimated) {
      return "Reading…";
    }
    if (moveEstimated.refused) {
      return moveEstimated.refused;
    }
    if (!moveEstimated.needed) {
      return "";
    }
    const there =
      cawco.machines.find((row) => row.machineId === moveTo)?.hostname ??
      moveTo;
    const from = checkoutOf(project)?.machineId;
    const source =
      cawco.machines.find((row) => row.machineId === from)?.hostname ?? from;
    // One size, history and large files together: step 2 splits them.
    const { bytes, lfsBytes, uncommittedFiles } = moveEstimated;
    const size =
      bytes + lfsBytes > 0 ? ` (${sizeWords(bytes + lfsBytes)})` : "";
    const work =
      uncommittedFiles > 0 ? `, with your uncommitted work on ${source}` : "";
    return `${project.name} isn't on ${there} yet. Move & start clones it there first${work}${size}.`;
  });
  const reading = $derived.by(() => {
    if (cawco.hub !== "connected") {
      return "No spawn while the hub is unreachable. Reconnect to continue.";
    }
    if (moveTo) {
      return failure || moveReading;
    }
    return failure || locationReading || (locationUnverified ? "Reading…" : "");
  });
  const locationInformational = $derived(
    moveTo
      ? !(failure || moveAnswer?.error || moveEstimated?.refused)
      : Boolean(
          !(
            failure ||
            locationUnverified ||
            unreadable ||
            unanswered ||
            offlineMachine
          ) &&
          missingMachines.length &&
          cawco.hub === "connected"
        )
  );
  const summarizerEntries = $derived(
    deriveModelEntries(models.forHarness(summarizerHarness, machineIds), {
      lastSpawnAt: lastSpawnAt(summarizerHarness),
      lastUsedAt: {},
    })
  );
  const summarizerSelected = $derived(
    summarizerEntries.find((row) => row.id === summarizerModel) ??
      (summarizerModel
        ? undefined
        : summarizerEntries.find((row) => row.isDefault))
  );
  /** Why a model cannot summarise this session: it would not fit what it reads. */
  const summarizerRefusal = (entry: ModelEntry) =>
    estimate?.summariseInputTokens
      ? contextFitRefusal(
          entry.contextWindow,
          estimate.summariseInputTokens + SUMMARISER_OUTPUT_RESERVE_TOKENS
        )
      : undefined;
  /** Why a model cannot continue this session: its opening would leave no room. */
  const targetRefusal = (entry: ModelEntry) =>
    estimate
      ? contextFitRefusal(
          entry.contextWindow,
          estimate.openingTokens + TARGET_HEADROOM_TOKENS
        )
      : undefined;
  const tokens = (count: number) =>
    count < 1000 ? String(count) : `${Math.round(count / 1000)}k`;
  const continueBlocked = $derived(
    Boolean(continueFrom) &&
      (!(estimate && selected) ||
        Boolean(targetRefusal(selected)) ||
        (carry === "summary" &&
          estimate.summariseInputTokens > 0 &&
          (!summarizerSelected ||
            Boolean(summarizerRefusal(summarizerSelected)))))
  );
  /** The line over the pickers: what the continuation carries, sized. */
  const sizing = $derived.by(() => {
    if (!estimate) {
      return "Reading the session's context…";
    }
    if (carry === "asks") {
      return `Current context ${tokens(estimate.liveContextTokens)} → your ${estimate.asks} message${estimate.asks === 1 ? "" : "s"}, ${tokens(estimate.openingTokens)}`;
    }
    return `Current context ${tokens(estimate.liveContextTokens)} → ${tokens(estimate.summariseInputTokens)} to summarise`;
  });
  /** Continue mode: the other start, sized afresh by the hub. */
  function chooseCarry(value: "summary" | "asks") {
    if (value === carry || !continueFrom) {
      return;
    }
    carry = value;
    estimate = null;
    loadEstimate(continueFrom.instanceId, submission);
  }
  /** A harness with modes and none picked: Start waits for the person's pick. */
  const modeUnchosen = $derived(!modeless && permissionMode === null);
  /** The last start failed: the footer shows no check. */
  const startFailed = $derived(failure !== "");
  /** The line under the chips says why Start can't go: it stays on step 2 too. */
  const readingSaysWhy = $derived(cawco.hub !== "connected" || failure !== "");
  const cantStart = $derived(
    firstMessage.uploading ||
      continueBlocked ||
      placementRefusal !== null ||
      modeRefused !== null ||
      modeUnchosen ||
      cawco.hub !== "connected" ||
      machineIds.length === 0 ||
      Boolean(offlineMachine) ||
      unreadable ||
      (repo !== undefined && !isGitUrl(repo)) ||
      (moveTo !== null && !(moving || movedAlready))
  );
  /** The source as the prompt's opening chip; a session title is often its first prompt, so it is cut short. */
  const sourceChip = $derived<LeadChip | undefined>(
    continueFrom && {
      key: "continue-source",
      harness: continueFrom.harness,
      label:
        continueFrom.title.length > 28
          ? `${continueFrom.title.slice(0, 27).trimEnd()}…`
          : continueFrom.title,
      title: continueFrom.title,
    }
  );
  /** What Start says while its press waits: on the folder check, then the start's own stage (spawn/parked). */
  const busyLabel = $derived(
    pressedFor === null
      ? showing?.stage || continuationStageWords.starting
      : CHECKING
  );
  const startLabel = $derived.by(() => {
    if (continueFrom) {
      return "Continue";
    }
    if (forking) {
      return "Fork";
    }
    if (moving) {
      return moveStep ? "Move it" : "Move & start";
    }
    return machineIds.length > 1
      ? `Start ${machineIds.length} sessions`
      : "Start session";
  });
  function chooseHarness(value: HarnessKind) {
    harness = value;
    model = "";
    effort = null;
    account = null;
  }
  let lastMachine = "";
  $effect(() => {
    const id = machineId;
    const installed = installedHarnesses;
    if (id === lastMachine) {
      return;
    }
    lastMachine = id;
    untrack(() => {
      const [first] = installed;
      if (first && !installed.includes(harness)) {
        chooseHarness(first);
      }
    });
  });
  $effect(() => {
    if (
      effort &&
      !stops.some((stop) => stop.reachable && stop.value === effort)
    ) {
      effort = null;
    }
  });
  /**
   * The form starts in Full Send: chosen, and offered on this machine. It is
   * never started silently: a warning stands in the form while it is chosen.
   */
  const fullSendWarning = $derived(
    permissionMode === "fullSend" &&
      modes.some((mode) => mode.value === "fullSend" && !mode.disabled)
      ? fullSendCopy(harness)?.warning
      : undefined
  );
  /** The harness the form opens on: a fork's own (it goes on in its conversation's), else the last start's. */
  function openingHarness(): HarnessKind {
    return prefill?.fork?.harness ?? spawnPrefs.harness;
  }
  /** What the form was opened with, as its kept picks name it: they are read back only for the same. */
  function openingKey(): string {
    return JSON.stringify({
      prefill: placeOf(prefill) ?? null,
      continueFrom: continueFrom ?? null,
    });
  }
  /** The picks the form was left on, when it is opened again with the same: a reload, a dismissal. */
  function keptPicks(): KeptPicks | null {
    const kept = readJson<KeptPicks | null>(FORM_KEY, null, "session");
    return kept?.opening === openingKey() ? kept : null;
  }
  /**
   * Step 2 stood when the form was left: it stands again once the move's
   * estimate is read again (`moving`).
   */
  let stepWanted = false;
  $effect(() => {
    if (moving && stepWanted) {
      stepWanted = false;
      moveStep = true;
    }
  });
  /** The form as it was left, or as a start was submitted with: its picks over what it opened with. */
  function applyPicks(kept: SessionDraft): void {
    ({ repo, projectId, harness, effort, permissionMode } = kept);
    fullSendCarried = permissionMode === "fullSend";
    ({ harness: summarizerHarness, model: summarizerModel } = kept.summarizer);
    carry = kept.asks ? "asks" : "summary";
    const [openedOn] = machineIds;
    const openedIn = cwd;
    machineIds = [...kept.machineIds];
    machinesTouched = true;
    cwd = kept.baseCwd;
    model = kept.usedModel;
    account = kept.account ?? null;
    spinOff = kept.scratch !== undefined;
    editing = kept.baseCwd !== openedIn || kept.machineIds[0] !== openedOn;
    lastMachine = kept.machineIds[0] ?? "";
  }
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — each opening (a row reopening its start) reads the form again
    void spawning.opening;
    if (!open) {
      return;
    }
    untrack(() => {
      const seeded = prefill?.projectId
        ? cawco.project(prefill.projectId)
        : undefined;
      projectId = seeded?.id;
      const primary = seeded ? checkoutOf(seeded) : undefined;
      const first =
        continueFrom?.machineId ||
        prefill?.machineId ||
        primary?.machineId ||
        "";
      machineIds = first ? [first] : [];
      machinesTouched = false;
      remembered = rememberedMachine();
      cwd = continueFrom?.cwd || prefill?.cwd || primary?.path || "";
      harness = openingHarness();
      ({ permissionMode } = spawnPrefs);
      fullSendCarried = permissionMode === "fullSend";
      summarizerHarness = spawnPrefs.harness;
      summarizerModel = "";
      carry = "summary";
      estimate = null;
      model = "";
      effort = null;
      account = null;
      repo = undefined;
      editing = false;
      spinOff = Boolean(prefill?.spinOff);
      error = "";
      popover = null;
      verifiedLocation = "";
      moveRead = null;
      moveStep = false;
      stepWanted = false;
      moveAt = undefined;
      moveEditing = false;
      // A parked start opens on what it was started with (its prompt read
      // back from the draft store, `keptDraft`); a form left as it was, on
      // what it was left on.
      const shown = parkedStart(spawning.shown);
      const kept = shown ? null : keptPicks();
      if (shown) {
        applyPicks(shown.draft);
      } else if (kept) {
        applyPicks(kept.picks);
        stepWanted = kept.step;
      } else if (prefill?.prompt) {
        // A refused send picked up here: its words and what rode them are
        // the first prompt (the kept draft, read back after, yields to it).
        firstMessage.restore(prefill.prompt.text, prefill.prompt.extras);
      }
      if (continueFrom) {
        loadEstimate(continueFrom.instanceId, submission);
      }
      loadFleetMenu(submission);
    });
    return () => {
      submission += 1;
    };
  });
  /**
   * The form's picks, kept as they change: under the tab's own key while
   * it is on no start (a reload and a dismissal open it on them again), on
   * a failed start it shows while it is (its Reopen opens on them).
   */
  $effect(() => {
    if (!open) {
      return;
    }
    const now = picks();
    const step = moveStep;
    const { shown } = spawning;
    untrack(() => {
      if (shown) {
        keepDraftOf(shown, { ...now, prompt: firstMessage.text });
        return;
      }
      writeJson(
        FORM_KEY,
        { opening: openingKey(), picks: now, step } satisfies KeptPicks,
        "session"
      );
    });
  });
  // The start the form shows has started: the form leaves for its session.
  $effect(() => {
    const shown = showing;
    if (shown?.state === "started" && shown.target) {
      untrack(() => exitTo(shown));
    }
  });
  // With nothing else naming one, the form opens on the machine it last
  // started a session on, once the fleet lists it: the fleet arrives over the
  // websocket, so the dialog can open before it does. With none remembered,
  // or one the fleet no longer has, no machine is chosen until the operator
  // picks one.
  $effect(() => {
    const id = remembered;
    const known =
      id !== null && cawco.machines.some((row) => row.machineId === id);
    if (open && !machinesTouched && !machineIds.length && known) {
      untrack(() => {
        machineIds = [id];
      });
    }
  });
  /**
   * What continuing `instanceId` would carry, sized by the hub, and the claude
   * windows the pickers size models by. The source is only read.
   */
  async function loadEstimate(instanceId: string, request: number) {
    const asked = carry;
    const current = () => request === submission && asked === carry;
    try {
      const [sized] = await Promise.all([
        waits.run("estimate", async () => {
          const response = await fetch(
            `/api/instances/${encodeURIComponent(instanceId)}/continue${asked === "asks" ? "?asks=true" : ""}`
          );
          if (!response.ok) {
            throw (await awayOf(response)) ?? (await hubRefusal(response));
          }
          return (await response.json()) as NonNullable<typeof estimate>;
        }),
        loadModelWindows(),
      ]);
      if (current()) {
        estimate = sized;
      }
    } catch (cause) {
      if (current()) {
        error = failureWords(cause);
      }
    }
  }
  async function loadFleetMenu(request: number) {
    try {
      const response = await fetch("/api/fleet");
      if (!response.ok) {
        return;
      }
      const snapshot = (await response.json()) as FleetSnapshot;
      if (request !== submission) {
        return;
      }
      skills = snapshot.skills.map((row) => row.name);
      plugins = snapshot.config.plugins.map((row) => row.id);
    } catch {
      // A hub without a fleet catalog leaves the `/` menu with nothing to offer.
    }
  }
  $effect(() => {
    const ids = machineIds;
    const path = cwd.trim();
    const key = locationKey;
    if (verifiedLocation === key) {
      return;
    }
    verifiedLocation = "";
    unreadable = false;
    unanswered = "";
    missingMachines = [];
    // A project moving there goes where the hub's estimate says, which
    // reads that folder itself: this one is the project's on its source.
    if (moveTo) {
      verifiedLocation = key;
      return;
    }
    if (!(open && ids.length && path && machineOnline)) {
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      Promise.all(ids.map((id) => inspectLocation(id, path)))
        .then((reads) => {
          if (stale) {
            return;
          }
          const quiet = ids
            .map((id, index) => quietOn(id, reads[index] as Bounded<boolean>))
            .find(Boolean);
          if (quiet) {
            // Not verified: a press waits on nothing, and says this.
            unanswered = quiet;
            return;
          }
          missingMachines = ids.filter((_, index) => {
            const read = reads[index] as Bounded<boolean>;
            return read.kind === "answered" && read.value;
          });
          verifiedLocation = key;
        })
        .catch(() => {
          if (!stale) {
            unreadable = true;
          }
        });
    }, 600);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });
  /**
   * Why a fork can't go as the form stands: it branches its conversation
   * where that conversation is, so on its machine alone, in its folder and
   * on its harness. "" when it can.
   */
  function forkHeld(): string {
    if (
      !forking ||
      (machineIds.length === 1 &&
        machineIds[0] === forking.machineId &&
        cwd.trim() === forking.cwd &&
        harness === forking.harness &&
        repo === undefined)
    ) {
      return "";
    }
    const where =
      cawco.machines.find((row) => row.machineId === forking.machineId)
        ?.hostname ?? forking.machineId;
    return `A fork runs where its session ran: ${forking.harness} on ${where}, in ${tilde(forking.cwd)}.`;
  }
  function validate() {
    const held = forkHeld();
    if (held) {
      return held;
    }
    if (!machineIds.length) {
      return "Choose a machine to run this session on.";
    }
    if (repo !== undefined && !isGitUrl(repo)) {
      return "Enter the repository's git URL.";
    }
    if (!cwd.trim()) {
      return "Enter the directory this session should work in.";
    }
    if (unreadable || offlineMachine) {
      return locationReading;
    }
    return "";
  }
  // The press held for the folder check, played once the check has landed:
  // `start` then goes, or says the check's refusal. A press for a location
  // edited since is the old form's, and goes with it.
  $effect(() => {
    const held = pressedFor;
    if (held === null) {
      return;
    }
    if (held !== locationKey) {
      pressedFor = null;
      return;
    }
    if (locationUnverified && !unreadable && !unanswered && !offlineMachine) {
      return;
    }
    pressedFor = null;
    untrack(start);
  });
  /**
   * ×, Esc, a press outside: the form closes and drops nothing. Its prompt
   * and picks are kept for the next opening; a start it shows goes on as
   * its own row (spawn/parked), and a press the folder check was holding
   * goes now, as that start. Returns the start it parked, for its frame to
   * travel into its row; null when it parked none.
   */
  export function close(): string | null {
    submission += 1;
    if (pressedFor !== null && !busy) {
      pressedFor = null;
      // biome-ignore lint/complexity/noVoid: the start parks itself as it begins, and says how it ends on its row
      void start(true);
    }
    pressedFor = null;
    const left = spawning.shown;
    onclose();
    if (left) {
      onparked?.(left);
    }
    return left;
  }
  /**
   * Cancel: the form is done with, and what it holds goes with it: its
   * prompt, its picks, and a failed start it shows. A start still running
   * is the hub's to stop (`cancelContinue`).
   */
  function cancel(): void {
    submission += 1;
    pressedFor = null;
    const { shown } = spawning;
    firstMessage.text = "";
    firstMessage.dropAttachments();
    keptDraft.discard();
    unstore("session", FORM_KEY);
    if (shown) {
      dropStart(shown);
    }
    onclose();
  }
  /** Cancel while a continuation runs: the hub stops it, and the form closes. */
  async function cancelContinue() {
    const job = showing?.job;
    if (!job) {
      return;
    }
    try {
      await cancelContinuation(job);
      cancel();
    } catch (cause) {
      error = failureWords(cause);
    }
  }
  function toggleMachine(id: string) {
    machinesTouched = true;
    machineIds = machineIds.includes(id)
      ? machineIds.filter((row) => row !== id)
      : [...machineIds, id];
    // One machine without the project keeps it: it moves there (design §1b).
    // Several, and none has it, start no project.
    if (
      project &&
      machineIds.length !== 1 &&
      !machineIds.some((chosen) => placedOn(project, chosen))
    ) {
      projectId = undefined;
    }
    editing = true;
  }
  function pickProject(row: ProjectItem) {
    projectId = row.id;
    if (!machineIds.includes(row.machineId)) {
      machineIds = [row.machineId, ...machineIds];
    }
    cwd = row.path;
    repo = undefined;
    editing = false;
    popover = null;
  }
  function clearProject() {
    projectId = undefined;
    cwd = "";
    editing = true;
    popover = null;
  }
  async function createFromChip(draft: { name: string; path: string }) {
    const created = await projectAtFolder({
      machineId,
      cwd: draft.path,
      name: draft.name,
    });
    // The folder asked about, which may have joined a project whose primary
    // place is on another machine.
    pickProject({
      id: created.id,
      machineId: created.place.machineId,
      name: created.name,
      path: created.place.path,
      hue: HUES[0],
    });
  }
  function menuItems(type: "@" | "/", query: string): MenuItem[] {
    const q = query.toLowerCase();
    const hit = (text: string) => !q || text.toLowerCase().includes(q);
    if (type === "@") {
      return [
        ...machineItems
          .filter((row) => row.online && hit(row.name))
          .map((row) => ({
            key: `machine:${row.id}`,
            label: row.name,
            kind: "Machine" as const,
            icon: row.icon,
            hue: row.hue,
            serial: `@${row.name}`,
            apply: () => {
              if (!machineIds.includes(row.id)) {
                machineIds = [...machineIds, row.id];
              }
            },
          })),
        ...projectItems
          .filter((row) => hit(row.name))
          .map((row) => ({
            key: `project:${row.id}:${row.machineId}`,
            label: row.name,
            kind: "Project" as const,
            icon: Files,
            hue: row.hue,
            serial: `@${row.name}`,
            apply: () => pickProject(row),
          })),
      ];
    }
    return [
      ...skills.filter(hit).map((name, i) => ({
        key: `skill:${name}`,
        label: `/${name}`,
        kind: "Skill" as const,
        icon: Stars,
        hue: HUES[i % 5],
        serial: `/${name}`,
        apply: () => {
          // A skill chip only changes the prompt text.
        },
      })),
      ...plugins.filter(hit).map((id, i) => ({
        key: `plugin:${id}`,
        label: id,
        kind: "Plugin" as const,
        icon: Book,
        hue: HUES[(i + 2) % 5],
        serial: `/${id}`,
        apply: () => {
          // A plugin chip only changes the prompt text.
        },
      })),
    ];
  }
  /** Whether the folder is missing on `id`; `unanswered` when its machine did not say in time. */
  async function inspectLocation(
    id: string,
    path: string
  ): Promise<Bounded<boolean>> {
    const [, missing] = await Promise.all([
      waits.run(`location:${id}`, () => inspectMachine(id, path)),
      machineFs(id, "list", path).then(
        (read): Bounded<boolean> => {
          switch (read.kind) {
            case "answered":
              return { kind: "answered", value: false };
            case "unanswered":
              return read;
            default: {
              const unhandled: never = read;
              throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
            }
          }
        },
        (cause: unknown): Bounded<boolean> => {
          if (cause instanceof Error && cause.message.startsWith("ENOENT:")) {
            return { kind: "answered", value: true };
          }
          throw cause;
        }
      ),
    ]);
    return missing;
  }
  /** The sentence for a folder check `id` did not answer, or "" when it answered. */
  function quietOn(id: string, read: Bounded<boolean>): string {
    switch (read.kind) {
      case "answered":
        return "";
      case "unanswered":
        return didntAnswer(id, read, {
          outcome: "whether the folder is there is not known",
          again: TRY_AGAIN,
        });
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }
  /**
   * Whether `path` holds on `target` before anything is asked of it: ""
   * when it does, else why not, in the words the form's line says it in.
   */
  async function verifyBeforeSpawn(
    target: string,
    path: string
  ): Promise<string> {
    try {
      const quiet = quietOn(target, await inspectLocation(target, path));
      if (quiet) {
        unanswered = quiet;
      }
      return quiet;
    } catch {
      unreadable = true;
      const host =
        cawco.machines.find((row) => row.machineId === target)?.hostname ??
        target;
      if (open) {
        await tick();
        document.getElementById("session-dir")?.focus();
      }
      return `That directory can't be read on ${host}. Check the path and try again.`;
    }
  }
  /**
   * The model a start names: the person's pick, or "" when they left the
   * harness's default, which is sent as no model at all.
   */
  function shownModel(draft: SessionDraft): string {
    return draft.usedModel === "default" ? "" : draft.usedModel;
  }
  /** A project a start on `target` belongs to: one with a place on that machine. */
  function attachable(
    id: string | undefined,
    target: string
  ): string | undefined {
    const attached = id ? cawco.project(id) : null;
    return attached && placedOn(attached, target) ? attached.id : undefined;
  }
  /**
   * Starts one session on `target` under `instanceId`, minted before it is
   * asked for (spawn/parked `planAsks`), for start `id`; a hub that did not
   * answer throws saying so, for the start's row and the form to say.
   */
  async function spawnOne(
    id: string,
    target: string,
    instanceId: string | undefined,
    draft: SessionDraft
  ): Promise<string> {
    if (forking) {
      askedFor(id);
      return await forkOne(target, draft, forking);
    }
    const toAttach = attachable(draft.projectId, target);
    if (instanceId) {
      askedFor(id, instanceId);
    }
    const started = await spawnSession({
      ...(instanceId ? { instanceId } : {}),
      machineId: target,
      cwd: draft.cwd,
      prompt: draft.prompt,
      extras: draft.extras,
      harness: draft.harness,
      ...(modeless || draft.permissionMode === null
        ? {}
        : { permissionMode: draft.permissionMode }),
      ...(shownModel(draft) ? { model: shownModel(draft) } : {}),
      ...(draft.effort ? { effort: draft.effort } : {}),
      scratch: draft.scratch,
      bootstrap:
        draft.repo === undefined
          ? undefined
          : { repo: draft.repo, baseDir: draft.baseCwd },
      projectId: toAttach,
      ...(draft.account ? { account: draft.account } : {}),
    });
    const spawned = answeredOr(
      target,
      started,
      "whether the session started is not known"
    );
    // Taken, its first prompt went with it (`spawnSession`).
    sentTo(id, spawned);
    return spawned;
  }
  /** Forks `source` on the form's picks; a hub that did not answer throws saying so. */
  async function forkOne(
    target: string,
    draft: SessionDraft,
    source: ForkSource
  ): Promise<string> {
    const forked = await forkSession({
      ...source,
      ...(modeless || draft.permissionMode === null
        ? {}
        : { permissionMode: draft.permissionMode }),
      ...(shownModel(draft) ? { model: shownModel(draft) } : {}),
      ...(draft.effort ? { effort: draft.effort } : {}),
      prompt: draft.prompt,
      extras: draft.extras,
    });
    if (forked.kind === "unchosen") {
      throw new Error("Choose a permission mode for the fork.");
    }
    return answeredOr(target, forked, "whether the fork started is not known");
  }
  /**
   * What holds Start before anything is sent, saying why: a file still on
   * its way or one the hub never got (as a session's Send is held, in the
   * same words), or a form that doesn't hold. Move & start goes no further
   * either: it morphs the form to step 2, and Move it starts the move.
   */
  function heldBack(force: boolean): boolean {
    if (firstMessage.uploading) {
      error = STILL_UPLOADING;
      return true;
    }
    if (firstMessage.unready) {
      error = NOT_UPLOADED;
      return true;
    }
    error = validate();
    if (error) {
      document.getElementById("session-dir")?.focus();
      return true;
    }
    // What disables Start holds every other way in (Ctrl/⌘+Enter, a held
    // press played back): one rule, `cantStart` (no mode chosen or one the
    // machine doesn't take among it).
    if (cantStart) {
      return true;
    }
    // The folder not read yet: the press waits for it (`pressedFor`),
    // unless the form is closing on it, when the start's own check reads it.
    if (locationUnverified && !force) {
      pressedFor = locationKey;
      return true;
    }
    if (moving && !moveStep) {
      moveStep = true;
      popover = null;
      return true;
    }
    return false;
  }
  /** The form's picks, without the prompt: what a start goes with, and what is kept as it changes. */
  function picks(): SessionDraft {
    return {
      machineIds: [...machineIds],
      baseCwd: cwd.trim(),
      cwd: workdir,
      prompt: "",
      harness,
      permissionMode,
      model,
      effort,
      scratch: spinOff ? { worktree: false, baseCwd: workdir } : undefined,
      repo: repo?.trim(),
      projectId,
      summarizer: {
        harness: summarizerHarness,
        model: summarizerModel,
      },
      asks: carry === "asks",
      // The person's own pick; "" when they left the harness's default.
      usedModel: model,
      ...(accountTool && account ? { account } : {}),
      extras: {},
    };
  }
  /** What a start leaves its form with, remembered for the next. */
  function remember(draft: SessionDraft): void {
    recordModelUse(draft.harness, draft.usedModel);
    rememberSpawn({
      harness: draft.harness,
      model: shownModel(draft),
      permissionMode: draft.permissionMode,
      effort: draft.effort,
    });
    rememberMachine(draft.machineIds);
  }
  /**
   * Start: the start is parked as it begins (spawn/parked `beginStart`) and
   * runs there, whatever becomes of the form; the form shows it while open.
   * `force`: the form is closing on a press the folder check held.
   */
  async function start(force = false) {
    if (busy || cawco.hub !== "connected" || heldBack(force)) {
      return;
    }
    submission += 1;
    const draft: SessionDraft = {
      ...picks(),
      prompt: firstMessage.text,
      extras: firstMessage.extras(),
    };
    const id = newId();
    beginStart({
      id,
      draft,
      content: $state.snapshot(firstMessage.keep) as DraftContent,
      ...(continueFrom ? { continueFrom } : {}),
      ...(prefill ? { prefill: placeOf(prefill) } : {}),
      replacing: spawning.shown,
      stage:
        continueFrom && !draft.asks
          ? continuationStageWords.summarising
          : CHECKING,
    });
    // The prompt and picks went with the start: the next form is a new one.
    keptDraft.discard();
    unstore("session", FORM_KEY);
    spawning.shown = id;
    popover = null;
    try {
      if (continueFrom) {
        await startContinue(id, continueFrom, draft);
        return;
      }
      if (moving) {
        await startMoving(id, draft);
        return;
      }
      // The folder there is already the project's: the session starts in it.
      if (movedAlready && moveEstimated) {
        draft.baseCwd = moveEstimated.path;
        draft.cwd = moveEstimated.path;
      }
      // Each session's id, minted before it is asked for: a reload while
      // the hub answers finds it on the board (spawn/parked). A fork's is
      // the hub's to name.
      const asks = forking
        ? []
        : draft.machineIds.map((on) => ({
            instanceId: newId(),
            machineId: on,
            asked: false,
            sent: false,
          }));
      planAsks(id, asks);
      let first = "";
      for (const [at, target] of draft.machineIds.entries()) {
        stageStart(id, CHECKING);
        // biome-ignore lint/performance/noAwaitInLoops: each machine is verified, then spawned, in order — one failure must stop the batch before the next spawn.
        const refused = await verifyBeforeSpawn(target, draft.baseCwd);
        if (refused) {
          failStart(id, refused);
          return;
        }
        stageStart(id, continuationStageWords.starting);
        // Every machine gets spawned; `first` only remembers which one to
        // open. `first ||= spawnOne(…)` short-circuited after machine one, so
        // "Start 3 sessions" started exactly one. Each waits for the hub's
        // answer: one it refuses throws its reason, and nothing navigates.
        const spawned = await spawnOne(id, target, asks[at]?.instanceId, draft);
        first ||= spawned;
      }
      remember(draft);
      startedStart(id, first);
    } catch (cause) {
      failStart(id, failureWords(cause));
    }
  }
  /**
   * Move it: the hub moves the project to the machine and starts the session
   * there, as a job it owns; the yes said here goes with it, so it asks for
   * none. The form leaves for the session as a spawn does, and its pane
   * follows the move until the session starts (design §2, E1).
   */
  async function startMoving(id: string, draft: SessionDraft) {
    const ask = moveEstimated?.ask;
    const target = moveTo;
    const moved = projectId;
    if (!(ask && target && moved)) {
      failStart(
        id,
        "The move changed before it started. Open it and start it again."
      );
      return;
    }
    stageStart(id, continuationStageWords.starting);
    askedFor(id);
    let started: Awaited<ReturnType<typeof startMove>>;
    try {
      started = await startMove(moved, {
        machineId: target,
        ...(moveAt ? { path: moveAt } : {}),
        ...(ask.key ? { approved: ask.key } : {}),
        spawn: {
          harness: draft.harness,
          ...(modeless || draft.permissionMode === null
            ? {}
            : { permissionMode: draft.permissionMode }),
          ...(shownModel(draft) ? { model: shownModel(draft) } : {}),
          ...(draft.effort ? { effort: draft.effort } : {}),
          ...(draft.account ? { account: draft.account } : {}),
        },
        ...(draft.prompt.trim() ? { prompt: draft.prompt } : {}),
        ...(draft.extras.images ? { images: draft.extras.images } : {}),
        ...(draft.extras.attachments
          ? { attachments: draft.extras.attachments }
          : {}),
      });
    } catch (cause) {
      // What moving does changed since it was read: read it again, so the
      // step shows what a yes now covers.
      moveRead = null;
      throw cause;
    }
    remember(draft);
    startedStart(id, started.targetInstanceId);
  }

  /** Back from step 2: the form as it was. */
  function back() {
    moveStep = false;
    error = "";
    // Back, pressed, goes with the step it led out of: the keys go to the
    // prompt, the form's first field, rather than to the page.
    tick().then(() => {
      if (document.activeElement === document.body) {
        focusPrompt();
      }
    });
  }
  /** Esc in step 2 goes back to the form; anywhere else it closes (the frame's dismissal). */
  export function escapeStep(event: KeyboardEvent): void {
    if (moveStep) {
      event.preventDefault();
      back();
    }
  }
  /** The head says what step 2 asks; the form's own name otherwise. */
  const headTitle = $derived.by(() => {
    if (moveStep && moveEstimated?.ask) {
      return moveEstimated.ask.title;
    }
    if (continueFrom) {
      return "Continue session";
    }
    return forking ? "Fork session" : "New session";
  });
  /** The form's name as its head says it, for a frame that draws the head (the sheet). */
  export function title(): string {
    return headTitle;
  }
  const readingMorph = morph({ on: ["data-why", "data-two"] });

  /**
   * Continue in new session: the hub summarises the source with the chosen
   * summariser and starts the new session with this form's options, as a job
   * it owns. Its parked start follows the job's stages over the socket
   * (spawn/parked), and the form, while it shows it, leaves for the new
   * session exactly as a spawn does once it has started.
   */
  async function startContinue(
    id: string,
    source: ContinueSource,
    draft: SessionDraft
  ) {
    const [target] = draft.machineIds;
    const refused = await verifyBeforeSpawn(target, draft.baseCwd);
    if (refused) {
      failStart(id, refused);
      return;
    }
    const toAttach = attachable(draft.projectId, target);
    askedFor(id);
    const job = await startContinuation(source, {
      ...(draft.asks
        ? { asksOnly: true }
        : {
            summarizer: {
              harness: draft.summarizer.harness,
              ...(draft.summarizer.model
                ? { model: draft.summarizer.model }
                : {}),
            },
          }),
      target: {
        machineId: target,
        cwd: draft.cwd,
        harness: draft.harness,
        ...(draft.usedModel ? { model: draft.usedModel } : {}),
        ...(modeless || draft.permissionMode === null
          ? {}
          : { permissionMode: draft.permissionMode }),
        ...(draft.effort ? { effort: draft.effort } : {}),
        ...(draft.scratch ? { scratch: draft.scratch } : {}),
        ...(draft.repo === undefined
          ? {}
          : { bootstrap: { repo: draft.repo, baseDir: draft.baseCwd } }),
        ...(toAttach ? { projectId: toAttach } : {}),
      },
      ...(draft.prompt.trim() ? { note: draft.prompt.trim() } : {}),
      // They ride the new session's opening message; the summariser reads
      // the note's words alone.
      ...(draft.extras.images ? { images: draft.extras.images } : {}),
      ...(draft.extras.attachments
        ? { attachments: draft.extras.attachments }
        : {}),
    });
    followJob(id, job);
    if (!draft.asks) {
      recordModelUse(draft.summarizer.harness, draft.summarizer.model);
    }
    remember(draft);
  }
  /**
   * The start the form shows has started: leave for its session as the
   * form starts to close, not after: the form is portaled, so its exit
   * plays out over the page arriving, and the new tab rises from where
   * Start was pressed (motion/share: `session:new`, handed to the session
   * it started) while the form fades around it. Waiting for the exit left a
   * moment with neither on screen. Its prompt and its start go with it.
   */
  async function exitTo(started: ParkedStart) {
    const { target } = started;
    if (!target) {
      return;
    }
    handOver("session:new", `session:${target}`);
    firstMessage.text = "";
    firstMessage.dropAttachments();
    keptDraft.discard();
    dropStart(started.id);
    submission += 1;
    onclose();
    await tick();
    await goto(conversationHref(target, cawco.instanceIndex));
  }
  function keydown(event: KeyboardEvent) {
    if (!open || event.defaultPrevented || event.isComposing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: the start says how it ends on its row and in the form
      void start();
    }
  }
  function bodyScroll() {
    if (popover) {
      popover = null;
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<!-- The form's head, body, notices and footer, as children of its frame
     (NewSessionPopover, NewSessionDialog's sheet); in the sheet the head is
     the kit's, titled `title()`, and step 2's Back is the form's first row. -->
<!-- While a start runs the form takes no input; the footer stays live so
     the pending Start keeps its focus (a focused element in an inert
     subtree drops focus to the body). -->
{#if sheet}
  {#if moveStep}
    <div data-slot="back" class="flex flex-none pb-space-2" inert={busy}>
      <Button data-vaul-no-drag onclick={back} size="sm" variant="ghost">
        <IconChevronLeft />
        <span>Back</span>
      </Button>
    </div>
  {/if}
{:else}
  <div
    data-slot="head"
    class={sheetHead.head({
      class: "gap-space-3 px-space-1 pt-space-1 pb-space-2",
    })}
    inert={busy}
  >
    <div class="flex min-w-0 items-center gap-space-3">
      {#if moveStep}
        <!-- Step 2's way back to the form leads the head, where the form's
           mark stands; Esc goes back too. Close keeps the trailing edge
           (DESIGN.md, Dialog and Drawer: the title, then Close). -->
        <Tip keys="Esc" label="Back">
          {#snippet children(tip)}
            <button
              {...tip}
              aria-label="Back"
              class={pressVariants({
                press: "scale",
                class: ["select-none", sheetHead.close()],
              })}
              data-vaul-no-drag
              onclick={back}
              type="button"
            >
              <IconChevronLeft />
            </button>
          {/snippet}
        </Tip>
      {:else}
        <span
          class="inline-flex size-space-6 flex-none items-center justify-center rounded-xs bg-ink-solid text-on-ink"
          ><Bolt class="size-icon-sm" /></span
        >
      {/if}
      <!-- Step 2's title is the move's question, "Move ~/code/chip to
         obelisk?": it wraps whole, so its destination is never the part an
         ellipsis takes (DESIGN.md, Don't: "send the reader away from where
         they asked"; the question names where). The form's own names stay
         on one line. -->
      <h2
        data-slot="title"
        class="type-title tracking-title m-0 min-w-0 text-ink-strong not-data-wraps:truncate data-wraps:text-balance"
        data-wraps={moveStep || undefined}
      >
        <MorphText text={headTitle} wrap={moveStep} />
      </h2>
    </div>
    <Tip keys={moveStep ? undefined : "Esc"} label="Close">
      {#snippet children(tip)}
        <button
          {...tip}
          aria-label="Close"
          class={pressVariants({
            press: "scale",
            class: ["select-none", sheetHead.close()],
          })}
          data-vaul-no-drag
          onclick={() => close()}
          type="button"
        >
          <X />
        </button>
      {/snippet}
    </Tip>
  </div>
{/if}
<!-- Step 2 (the owner's revision of C) is the same form with only what a
       move asks left in it: the chips that say where it runs, and what
       moving does. Everything else is kept as it was, out of sight, for
       Back. -->
<!-- A capped body fades the edge it has more to scroll to (the house edge
       fade): where the system hides its scrollbar (macOS), that edge is
       what says the form runs on past it. -->
<div
  data-slot="body"
  class="fai-scroll kit-sheet-scroll kit-edge-fade-block group min-h-0 flex-initial overflow-auto rounded-lg bg-surface-raised px-space-5 pt-space-5 pb-space-6 max-phone:-mx-space-1 max-phone:touch-pan-y max-phone:overscroll-contain max-phone:rounded-none max-phone:bg-transparent max-phone:px-space-1 max-phone:pt-space-3 max-phone:pb-space-4"
  data-stepped={moveStep || undefined}
  data-vaul-no-drag
  inert={busy}
  onscroll={bodyScroll}
>
  <!-- One popover surface for every chip in the form: the composer's and
         the chosen model's effort and permission chips glide between each
         other. -->
  <NsPopoverGroup>
    <!-- One track as wide as the body (`grid-cols-1`, a minmax(0, 1fr)
         track), here and in the composer: a chip's long folder never widens
         the sheet past the screen, its label ends in its ellipsis instead. -->
    <section
      data-slot="prompt-sec"
      class="relative z-1 grid grid-cols-1 gap-space-2 motion-safe:animate-ns-sec"
      style="--delay:0ms"
    >
      <div class="group-data-stepped:hidden">
        <SectionHeader
          hue="var(--hue-blue-500)"
          icon={Chat}
          label={continueFrom ? "Next step (optional)" : "First prompt"}
        />
      </div>
      <div
        data-slot="composer"
        class="field-shell relative grid grid-cols-1 rounded-lg border border-border-control bg-surface-raised shadow-xs transition-control"
      >
        <div class="contents group-data-stepped:hidden">
          <PromptEditor
            lead={sourceChip}
            {menuItems}
            onleadremove={onexitcontinue}
            onpaste={(data) => firstMessage.paste(data)}
            onsubmit={() => start()}
            bind:element={editor}
            bind:value={firstMessage.text}
          />
          <div class="px-space-2 not-empty:pb-space-2">
            <AttachmentChips draft={firstMessage} />
          </div>
        </div>
        <div
          data-slot="chips"
          class="flex flex-wrap items-center gap-space-2 px-space-3 pt-space-2 pb-space-3 hit-gap-x-space-2 hit-gap-y-space-2 coarse:gap-y-space-4 coarse:hit-gap-y-space-4"
          inert={moveStep}
        >
          <MachinesChip
            machines={machineItems}
            onchange={(value) => {
              popover = value ? "machines" : null;
            }}
            ontoggle={toggleMachine}
            open={popover === "machines"}
            selected={machineIds}
          />
          {#if sourceProject}
            <span
              data-variant="static"
              class={chipVariants({ variant: "setting" })}
              title={`The new session starts in ${sourceProject.name}, the project of the session it continues`}
            >
              <Files class="text-hue-amber-500" />
              <span data-slot="chip-label">Starts in {sourceProject.name}</span>
            </span>
          {:else}
            <ProjectChip
              home={cawco.machines.find((row) => row.machineId === machineId)
                ?.home}
              onchange={(value) => {
                popover = value ? "project" : null;
              }}
              onclear={clearProject}
              oncreate={createFromChip}
              onpick={pickProject}
              open={popover === "project"}
              {projectId}
              projects={projectItems}
            />
          {/if}
          <LocationChip
            dir={moveTo ? moveDestination : cwd}
            informational={locationInformational}
            locked={moveTo ? !moveEditing : locked}
            {machineId}
            machineName={machine?.hostname ?? ""}
            mode={repo === undefined ? "dir" : "repo"}
            onchange={(value) => {
              popover = value ? "location" : null;
            }}
            onclosefocus={promptAfterClose}
            oncommit={backToPrompt}
            ondir={(value) => {
              // Moving, the folder typed is where the project goes there.
              if (moveTo) {
                moveAt = value.trim() || undefined;
                return;
              }
              cwd = value;
              editing = true;
              projectId = undefined;
            }}
            onmode={(value) => {
              repo = value === "repo" ? (repo ?? "") : undefined;
              if (value === "repo") {
                projectId = undefined;
                editing = true;
                cwd ||= "~";
              }
            }}
            onoverride={() => {
              if (moveTo) {
                moveEditing = true;
              } else {
                editing = true;
              }
            }}
            onrepo={(value) => {
              repo = value;
            }}
            open={popover === "location"}
            {reading}
            repo={repo ?? ""}
          />
          <LifetimeChip
            ephemeral={spinOff}
            onchange={(value) => {
              popover = value ? "lifetime" : null;
            }}
            onlifetime={(value) => {
              spinOff = value;
            }}
            open={popover === "lifetime"}
          />
          <!-- Attach acts on the prompt, not on where it runs: it stands
               apart from the setting chips, at the row's end. -->
          <span class="ms-auto inline-flex">
            <AttachButton draft={firstMessage} />
          </span>
        </div>
      </div>
      <!-- A move's line may take two lines; its height follows (morph). -->
      <p
        data-slot="reading"
        data-why={readingSaysWhy || undefined}
        aria-live="polite"
        class="type-meta m-0 truncate text-status-fail-ink group-data-stepped:not-data-why:hidden data-informational:text-ink-muted data-two:line-clamp-2 data-two:text-pretty data-two:whitespace-normal"
        data-informational={locationInformational || undefined}
        data-two={moveTo !== null || undefined}
        title={reading}
        {@attach readingMorph}
      >
        {reading || "\u00a0"}
      </p>
      {#if moveStep && moveEstimated?.ask}
        <div data-slot="tray" class="pt-space-2" in:unfold out:unfold>
          <MoveAskBody ask={moveEstimated.ask} />
        </div>
      {/if}
    </section>
    <!-- The prompt and the settings are two regions, parted by the hairline
         (DESIGN.md, Borders are graded). -->
    <hr
      class="mt-space-5 mb-0 mx-0 h-px border-0 bg-border-hairline group-data-stepped:hidden"
    />
    <div
      data-slot="stack"
      class="mt-space-5 grid gap-space-5 group-data-stepped:hidden"
    >
      {#if continueFrom}
        <div
          class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2"
          in:unfold|global
          out:unfold
        >
          <Segmented
            items={[
              { value: "summary", label: "From a summary" },
              { value: "asks", label: "From my asks" },
            ]}
            label="What the new session opens on"
            onchange={chooseCarry}
            value={carry}
          />
          <p aria-live="polite" class="type-meta m-0 text-ink-muted num">
            {sizing}
          </p>
          <MachineAway away={waits.away("estimate")} />
        </div>
      {/if}
      <div
        class="data-pair:grid data-pair:grid-cols-2 data-pair:gap-space-4 max-phone:data-pair:grid-cols-1"
        data-pair={(Boolean(continueFrom) && carry === "summary") || undefined}
      >
        {#if continueFrom && carry === "summary"}
          <div
            class="grid gap-space-2 motion-safe:animate-ns-sec"
            style="--delay:60ms"
          >
            <ModelSection
              harness={summarizerHarness}
              installed={installedHarnesses}
              label="Summarise with"
              {machineIds}
              machineName={machine?.hostname ?? machineId}
              model={summarizerModel}
              onharness={(value) => {
                summarizerHarness = value;
                summarizerModel = "";
              }}
              onmodel={(id) => {
                summarizerModel = id;
              }}
              unavailable={summarizerRefusal}
            />
          </div>
        {/if}
        <div
          class="grid gap-space-2 motion-safe:animate-ns-sec"
          style="--delay:80ms"
        >
          <ModelSection
            account={accountTool}
            {harness}
            installed={installedHarnesses}
            label={continueFrom ? "Continue on" : "Model"}
            {machineIds}
            machineName={machine?.hostname ?? machineId}
            {model}
            onharness={chooseHarness}
            onmodel={(id) => {
              model = id;
              effort = null;
            }}
            tools={{
              efforts,
              effort: effortShown,
              effortOff:
                report?.capabilities.effort === false
                  ? effortNotExposed(harness)
                  : null,
              oneffort: (level) => {
                effort = level;
              },
              harness,
              modes,
              permission: permissionMode,
              onpermission: (value) => {
                permissionMode = value;
                fullSendCarried = false;
              },
            }}
            unavailable={continueFrom ? targetRefusal : undefined}
          />
        </div>
      </div>
    </div>
  </NsPopoverGroup>
</div>
<!-- No Claude account can take it on this machine: why, beside Start,
       and where to sign one in. -->
{#if placementRefusal}
  <div
    class="flex-none pt-space-2"
    data-slot="start-notice"
    data-vaul-no-drag
    in:unfold|global
    out:unfold
  >
    <Alert role="status" variant="warning">
      <IconKey />
      <AlertTitle>{placementRefusal}</AlertTitle>
      <AlertDescription>
        <a
          class="rounded-xs text-link-ink no-underline hover:text-link-hover"
          href="/config/accounts">Open Configure → Accounts</a
        >
      </AlertDescription>
    </Alert>
  </div>
{/if}
<!-- The chosen permission mode can't go out on this machine: why, beside
       Start, which waits for a mode the machine takes. -->
{#if modeRefused && !placementRefusal}
  <div
    class="flex-none pt-space-2"
    data-slot="start-notice"
    data-vaul-no-drag
    in:unfold|global
    out:unfold
  >
    <Alert role="status" variant="warning">
      <IconShield />
      <AlertTitle>{modeRefused}</AlertTitle>
    </Alert>
  </div>
{/if}
<!-- Full Send in the form, however it got there, stands outside the body's
       scroll, beside Start: it is in view whenever the form can start. -->
{#if fullSendWarning}
  <div
    class="flex-none pt-space-2"
    data-slot="start-notice"
    data-vaul-no-drag
    in:unfold|global
    out:unfold
  >
    <Alert role="status" variant="warning">
      <IconShield />
      <AlertTitle
        >{fullSendCarried
          ? "Full Send is on, from your last start"
          : "Full Send is on"}</AlertTitle
      >
      <AlertDescription>{fullSendWarning}</AlertDescription>
    </Alert>
  </div>
{/if}
<div class="contents" data-vaul-no-drag>
  <SessionFooter
    busy={busy || pressedFor !== null}
    {busyLabel}
    cancellable={(busy && Boolean(showing?.job)) || pressedFor !== null}
    disabled={cantStart}
    failed={startFailed}
    oncancel={busy && showing?.job ? cancelContinue : cancel}
    onstart={() => start()}
    {startLabel}
  />
</div>
