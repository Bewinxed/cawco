<script lang="ts">
  import {
    contextFitRefusal,
    type EffortLevel,
    HARNESSES,
    type HarnessKind,
    type PermissionMode,
    repoPath,
    SUMMARISER_OUTPUT_RESERVE_TOKENS,
    TARGET_HEADROOM_TOKENS,
  } from "@cawco/core";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import {
    Dialog,
    DialogPortal,
    DialogTitle,
  } from "#lib/components/ui/dialog/index.js";
  import {
    Drawer,
    DrawerContent,
    DrawerTitle,
  } from "#lib/components/ui/drawer/index.js";
  import {
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  /**
   * The New Session modal. This file owns the logic — open-reset boundary,
   * submission generation guard, draft snapshot, dual location verification,
   * the exact `spawnSession` payload — and composes the designed sections.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconShield, IconClose as X } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import Bolt from "~icons/solar/bolt-bold-duotone";
  import Book from "~icons/solar/book-2-bold-duotone";
  import Chat from "~icons/solar/chat-round-line-bold-duotone";
  import Files from "~icons/solar/folder-with-files-bold-duotone";
  import Stars from "~icons/solar/stars-bold-duotone";
  import {
    cawco,
    machineFs,
    placementFor,
    projectAtFolder,
    spawnSession,
  } from "../client.svelte";
  import {
    type ContinueSource,
    cancelContinuation,
    detachContinuation,
    releaseContinuation,
    type SessionDraft,
    startContinuation,
  } from "../continue.svelte";
  import { EFFORT_LEVELS } from "../effort-levels";
  import { type FleetSnapshot, inspectMachine } from "../fleet";
  import { conversationHref } from "../links";
  import { loadModelWindows, models } from "../models.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import { handOver } from "../motion/share.svelte";
  import {
    fallbackMode,
    fullSendCopy,
    permissionModesFor,
  } from "../permission-modes";
  import { checkoutOf, checkoutOn, placedOn } from "../projects";
  import { rememberSpawn, spawnPrefs } from "../spawnPrefs.svelte";
  import LifetimeChip from "./LifetimeChip.svelte";
  import LocationChip from "./LocationChip.svelte";
  import MachinesChip from "./MachinesChip.svelte";
  import ModelSection from "./ModelSection.svelte";
  import { deriveModelEntries, type ModelEntry } from "./model-entries";
  import { lastSpawnAt, lastUsedAt, recordModelUse } from "./modelUse.svelte";
  import NsPopoverGroup from "./NsPopoverGroup.svelte";
  import type {
    LeadChip,
    MachineItem,
    MenuItem,
    ProjectItem,
  } from "./ns-types";
  import ProjectChip from "./ProjectChip.svelte";
  import PromptEditor from "./PromptEditor.svelte";
  import SessionFooter from "./SessionFooter.svelte";
  import { effortNotExposed } from "./ToolChips.svelte";
  import "./ns-theme.css";

  let {
    open,
    prefill,
    continueFrom,
    restore,
    onclose,
    onexitcontinue,
  }: {
    open: boolean;
    prefill?: { machineId?: string; cwd?: string; projectId?: string };
    /**
     * Continue in new session: the form starts a session seeded with a summary
     * of this one. Mutually exclusive with `prefill` — the source says where.
     */
    continueFrom?: ContinueSource;
    /** Continue mode: the form a failed continuation was submitted with, opened as it was. */
    restore?: SessionDraft;
    onclose: () => void;
    /** The operator deleted the source chip: the dialog stays open as a plain New Session. */
    onexitcontinue?: () => void;
  } = $props();
  const REPO = /^[\w.-]+\/[\w.-]+$/;
  /** Where this tab keeps the first prompt across a reload. */
  const KEPT_PROMPT = "cawco:new-session-prompt";
  const mobile = new MediaQuery("(max-width: 640px)");
  let card = $state<HTMLElement | null>(null);
  /**
   * The card tweens to its new height when its body changes, as every dialog
   * does (DESIGN.md, Dialog; ui/dialog's content): it renders its own
   * content, so it takes the same `morph()` here. The sheet on a phone is the
   * kit drawer's and is left to it.
   */
  const resize = morph();
  $effect(() => {
    if (card && !mobile.current) {
      return resize(card);
    }
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
    editor.focus();
    const caret = document.createRange();
    caret.selectNodeContents(editor);
    caret.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
    return true;
  }
  let opener: HTMLElement | null = null;
  let submission = 0;
  let prompt = $state("");
  let machineIds = $state<string[]>([]);
  /** Set once the operator picks machines themselves; stops the late-arrival adoption below. */
  let machinesTouched = $state(false);
  let cwd = $state("");
  let repo = $state<string>();
  let harness = $state<HarnessKind>(spawnPrefs.harness);
  let model = $state("");
  let effort = $state<EffortLevel | null>(null);
  let permissionMode = $state<PermissionMode>(spawnPrefs.permissionMode);
  /**
   * Full Send came with the form (the last start's mode, or a failed
   * continuation's) rather than from a pick in it: the warning says where
   * it came from. A pick in the picker, confirmed there, clears it.
   */
  let fullSendCarried = $state(false);
  let projectId = $state<string>();
  let editing = $state(false);
  let spinOff = $state(false);
  let busy = $state(false);
  let error = $state("");
  let unreadable = $state(false);
  let missingMachines = $state<string[]>([]);
  let verifiedLocation = $state("");
  let popover = $state<"machines" | "project" | "location" | "lifetime" | null>(
    null
  );
  let skills = $state<string[]>([]);
  let plugins = $state<string[]>([]);
  /** Continue mode: who writes the summary. Reset on every open; never remembered. */
  let summarizerHarness = $state<HarnessKind>(spawnPrefs.harness);
  let summarizerModel = $state("");
  /** Continue mode: the hub's sizing of what the continuation carries. */
  let estimate = $state<{
    liveContextTokens: number;
    summariseInputTokens: number;
    openingTokens: number;
  } | null>(null);
  /**
   * The continuation this dialog started and follows, by id. Closing the
   * dialog hands it to the tab (`detachContinuation`); only Cancel stops it.
   */
  let job = $state<string | null>(null);
  const followed = $derived(job ? cawco.continuation(job) : undefined);
  const machineId = $derived(machineIds[0] ?? "");
  const locationKey = $derived(JSON.stringify([machineIds, cwd.trim()]));
  const locationUnverified = $derived(
    Boolean(machineIds.length && cwd.trim()) && verifiedLocation !== locationKey
  );
  const machine = $derived(
    cawco.machines.find((row) => row.machineId === machineId)
  );
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
   * The account a Claude session here would start on, as the hub's placement
   * says (`/api/accounts/placement`): its catalog is what the picker offers.
   * Null while unread, for another harness, and with no account signed in.
   */
  let placedAccount = $state<string | null>(null);
  $effect(() => {
    const query = {
      harness,
      machineId,
      ...(model ? { model } : {}),
      ...(projectId ? { projectId } : {}),
    };
    if (harness !== "claude" || !machineId) {
      placedAccount = null;
      return;
    }
    let stale = false;
    placementFor(query)
      .then((placed) => {
        if (!stale) {
          placedAccount = placed?.accountId ?? null;
        }
      })
      .catch(() => {
        if (!stale) {
          placedAccount = null;
        }
      });
    return () => {
      stale = true;
    };
  });
  const offered = $derived(
    models.forHarness(
      harness,
      machineIds,
      harness === "claude" ? placedAccount : undefined
    )
  );
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
      : permissionModesFor(harness).map((mode) => ({
          value: mode.value,
          disabled: report
            ? !report.capabilities.permissionModes.includes(mode.value)
            : false,
          reason:
            report && !report.capabilities.permissionModes.includes(mode.value)
              ? "This agent cannot honor this permission mode."
              : undefined,
        }))
  );
  const workdir = $derived(
    repo === undefined
      ? cwd.trim()
      : `${cwd.trim().replace(/\/+$/, "")}/${repoPath(repo).split("/").pop() ?? ""}`
  );
  const project = $derived(cawco.projects.find((row) => row.id === projectId));
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
      return {
        id: row.machineId,
        name: row.hostname,
        os: row.os,
        icon: machineIcon(row.os),
        online,
        load: loadLabel(online, running),
        hue: machineHue(i, online),
      };
    })
  );
  /**
   * A project is offered on every chosen machine where it has a checkout,
   * as the folder it is there: the first chosen machine that has one, its
   * primary place first.
   */
  const projectItems = $derived<ProjectItem[]>(
    cawco.projects
      .flatMap((row) => {
        const place = machineIds
          .map((id) => checkoutOn(row, id))
          .find((found) => found !== undefined);
        return place ? [{ row, place }] : [];
      })
      .map(({ row, place }, i) => ({
        id: row.id,
        machineId: place.machineId,
        name: row.name,
        path: place.path,
        hue: HUES[(i + 3) % 5],
      }))
  );
  const locationReading = $derived.by(() => {
    if (offlineMachine) {
      return `${offlineMachine.hostname} is offline. Pick another machine, or start when it returns.`;
    }
    if (unreadable) {
      return `That directory can't be read on ${machine?.hostname ?? machineId}. Check the path and try again.`;
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
  const reading = $derived(
    cawco.hub === "connected"
      ? error || locationReading || (locationUnverified ? "Reading…" : "")
      : "No spawn while the hub is unreachable. Reconnect to continue."
  );
  const locationInformational = $derived(
    Boolean(
      !(error || locationUnverified || unreadable || offlineMachine) &&
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
        (estimate.summariseInputTokens > 0 &&
          (!summarizerSelected ||
            Boolean(summarizerRefusal(summarizerSelected)))))
  );
  /** The last start failed: the footer shows no check. */
  const startFailed = $derived(error !== "");
  const cantStart = $derived(
    continueBlocked ||
      cawco.hub !== "connected" ||
      machineIds.length === 0 ||
      Boolean(offlineMachine) ||
      unreadable ||
      locationUnverified ||
      (repo !== undefined && !REPO.test(repo.trim()))
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
  const startLabel = $derived.by(() => {
    if (continueFrom) {
      return "Continue";
    }
    return machineIds.length > 1
      ? `Start ${machineIds.length} sessions`
      : "Start session";
  });
  function chooseHarness(value: HarnessKind) {
    harness = value;
    model = "";
    effort = null;
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
      if (!installed.includes(harness)) {
        chooseHarness(installed[0] ?? "claude");
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
  $effect(() => {
    const honoured = modes
      .filter((mode) => !mode.disabled)
      .map((mode) => mode.value);
    const next = fallbackMode(permissionMode, honoured);
    if (next && !honoured.includes(permissionMode)) {
      permissionMode = next;
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
  $effect(() => {
    if (!open) {
      return;
    }
    untrack(() => {
      opener = document.activeElement as HTMLElement;
      const seeded = prefill?.projectId
        ? cawco.project(prefill.projectId)
        : undefined;
      projectId = seeded?.id;
      const primary = seeded ? checkoutOf(seeded) : undefined;
      const first =
        continueFrom?.machineId ||
        prefill?.machineId ||
        primary?.machineId ||
        cawco.onlineMachines[0]?.machineId ||
        "";
      machineIds = first ? [first] : [];
      machinesTouched = false;
      cwd = continueFrom?.cwd || prefill?.cwd || primary?.path || "";
      ({ harness, permissionMode } = spawnPrefs);
      fullSendCarried = permissionMode === "fullSend";
      summarizerHarness = spawnPrefs.harness;
      summarizerModel = "";
      estimate = null;
      model = "";
      effort = null;
      prompt = sessionStorage.getItem(KEPT_PROMPT) ?? "";
      repo = undefined;
      editing = false;
      spinOff = false;
      busy = false;
      error = "";
      popover = null;
      verifiedLocation = "";
      if (continueFrom && restore) {
        ({ repo, projectId, harness, effort, permissionMode, prompt } =
          restore);
        fullSendCarried = permissionMode === "fullSend";
        ({ harness: summarizerHarness, model: summarizerModel } =
          restore.summarizer);
        machineIds = [...restore.machineIds];
        machinesTouched = true;
        cwd = restore.baseCwd;
        model = restore.usedModel;
        spinOff = restore.scratch !== undefined;
        editing =
          restore.baseCwd !== continueFrom.cwd ||
          restore.machineIds[0] !== continueFrom.machineId;
        lastMachine = restore.machineIds[0] ?? "";
      }
      if (continueFrom) {
        loadEstimate(continueFrom.instanceId, submission);
      }
      loadFleetMenu(submission);
    });
    return () => {
      submission += 1;
      // Dismissed while a continuation runs: it runs on, and the tab opens
      // its new session when it starts.
      if (job) {
        detachContinuation(job);
        job = null;
      }
    };
  });
  // The first prompt outlives a reload of this tab (`reload.svelte.ts`):
  // kept as it is typed, read back as the dialog opens, gone once it closes.
  $effect(() => {
    if (!open) {
      return;
    }
    if (prompt) {
      sessionStorage.setItem(KEPT_PROMPT, prompt);
    } else {
      sessionStorage.removeItem(KEPT_PROMPT);
    }
  });
  // The continuation this dialog follows, stage by stage, as the hub publishes it.
  $effect(() => {
    const current = followed;
    if (!current) {
      return;
    }
    untrack(() => {
      if (current.stage === "started") {
        releaseContinuation(current.id);
        job = null;
        exitTo(current.targetInstanceId, () => open);
      } else if (current.stage === "failed") {
        releaseContinuation(current.id);
        job = null;
        error = current.error ?? "";
        busy = false;
      } else if (current.stage === "cancelled") {
        releaseContinuation(current.id);
        job = null;
        busy = false;
      }
    });
  });
  // The fleet arrives over the websocket, so the dialog can open before any
  // machine is known. Adopt the first one that shows up until the operator picks.
  $effect(() => {
    const fallback = cawco.onlineMachines[0]?.machineId;
    if (open && !machinesTouched && !machineIds.length && fallback) {
      untrack(() => {
        machineIds = [fallback];
      });
    }
  });
  /**
   * What continuing `instanceId` would carry, sized by the hub, and the claude
   * windows the pickers size models by. The source is only read.
   */
  async function loadEstimate(instanceId: string, request: number) {
    try {
      const [response] = await Promise.all([
        fetch(`/api/instances/${encodeURIComponent(instanceId)}/continue`),
        loadModelWindows(),
      ]);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const sized = (await response.json()) as NonNullable<typeof estimate>;
      if (request === submission) {
        estimate = sized;
      }
    } catch (cause) {
      if (request === submission) {
        error = cause instanceof Error ? cause.message : String(cause);
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
    missingMachines = [];
    if (!(open && ids.length && path) || machine?.status !== "online") {
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      Promise.all(ids.map((id) => inspectLocation(id, path)))
        .then((missing) => {
          if (!stale) {
            missingMachines = ids.filter((_, index) => missing[index]);
            verifiedLocation = key;
          }
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
  function validate() {
    if (!machineIds.length) {
      return "Choose a machine to run this session on.";
    }
    if (repo !== undefined && !REPO.test(repo.trim())) {
      return "Enter a repository as owner/repository.";
    }
    if (!cwd.trim()) {
      return "Enter the directory this session should work in.";
    }
    if (unreadable || offlineMachine) {
      return locationReading;
    }
    return locationUnverified ? "Reading…" : "";
  }
  function close() {
    submission += 1;
    sessionStorage.removeItem(KEPT_PROMPT);
    onclose();
  }
  /** Cancel while a continuation runs: the hub stops it, and the dialog closes. */
  async function cancelContinue() {
    const id = job;
    if (!id) {
      return;
    }
    try {
      await cancelContinuation(id);
      job = null;
      busy = false;
      close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  function toggleMachine(id: string) {
    machinesTouched = true;
    machineIds = machineIds.includes(id)
      ? machineIds.filter((row) => row !== id)
      : [...machineIds, id];
    if (project && !machineIds.some((chosen) => placedOn(project, chosen))) {
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
            key: `project:${row.id}`,
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
  async function inspectLocation(id: string, path: string): Promise<boolean> {
    const [, missing] = await Promise.all([
      inspectMachine(id, path),
      machineFs(id, "list", path).then(
        () => false,
        (cause: unknown) => {
          if (cause instanceof Error && cause.message.startsWith("ENOENT:")) {
            return true;
          }
          throw cause;
        }
      ),
    ]);
    return missing;
  }
  async function verifyBeforeSpawn(
    id: string,
    path: string,
    current: () => boolean
  ) {
    try {
      await inspectLocation(id, path);
      return current();
    } catch {
      if (!current()) {
        return false;
      }
      unreadable = true;
      busy = false;
      await tick();
      if (!current()) {
        return false;
      }
      document.getElementById("session-dir")?.focus();
      return false;
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
  function spawnOne(target: string, draft: SessionDraft): Promise<string> {
    const toAttach = attachable(draft.projectId, target);
    return spawnSession({
      machineId: target,
      cwd: draft.cwd,
      prompt: draft.prompt,
      harness: draft.harness,
      ...(modeless ? {} : { permissionMode: draft.permissionMode }),
      ...(shownModel(draft) ? { model: shownModel(draft) } : {}),
      ...(draft.effort ? { effort: draft.effort } : {}),
      scratch: draft.scratch,
      bootstrap:
        draft.repo === undefined
          ? undefined
          : { repo: draft.repo, baseDir: draft.baseCwd },
      projectId: toAttach,
    });
  }
  async function start() {
    if (busy || cawco.hub !== "connected") {
      return;
    }
    error = validate();
    if (error) {
      document.getElementById("session-dir")?.focus();
      return;
    }
    submission += 1;
    const id = submission;
    const current = () => open && id === submission;
    const draft: SessionDraft = {
      machineIds: [...machineIds],
      baseCwd: cwd.trim(),
      cwd: workdir,
      prompt,
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
      // The person's own pick; "" when they left the harness's default.
      usedModel: model,
    };
    busy = true;
    popover = null;
    let first = "";
    try {
      if (continueFrom) {
        await startContinue(continueFrom, draft, current);
        return;
      }
      for (const target of draft.machineIds) {
        // biome-ignore lint/performance/noAwaitInLoops: each machine is verified, then spawned, in order — one failure must stop the batch before the next spawn.
        const ok = await verifyBeforeSpawn(target, draft.baseCwd, current);
        if (!(ok && current())) {
          return;
        }
        // Every machine gets spawned; `first` only remembers which one to
        // open. `first ||= spawnOne(…)` short-circuited after machine one, so
        // "Start 3 sessions" started exactly one. Each waits for the hub's
        // answer: one it refuses throws its reason, and nothing navigates.
        const spawned = await spawnOne(target, draft);
        first ||= spawned;
      }
      if (!current()) {
        return;
      }
      recordModelUse(draft.harness, draft.usedModel);
      rememberSpawn({
        harness: draft.harness,
        model: shownModel(draft),
        permissionMode: draft.permissionMode,
        effort: draft.effort,
      });
      await exitTo(first, current);
    } catch (cause) {
      if (!current()) {
        return;
      }
      error = cause instanceof Error ? cause.message : String(cause);
      busy = false;
    }
  }
  /**
   * Continue in new session: the hub summarises the source with the chosen
   * summariser and starts the new session with this form's options, as a job
   * it owns. The dialog follows the job's stages over the socket and leaves
   * for the new session exactly as a spawn does once it has started.
   */
  async function startContinue(
    source: ContinueSource,
    draft: SessionDraft,
    current: () => boolean
  ) {
    const [target] = draft.machineIds;
    const ok = await verifyBeforeSpawn(target, draft.baseCwd, current);
    if (!(ok && current())) {
      return;
    }
    const toAttach = attachable(draft.projectId, target);
    const id = await startContinuation(source, draft, {
      summarizer: {
        harness: draft.summarizer.harness,
        ...(draft.summarizer.model ? { model: draft.summarizer.model } : {}),
      },
      target: {
        machineId: target,
        cwd: draft.cwd,
        harness: draft.harness,
        ...(draft.usedModel ? { model: draft.usedModel } : {}),
        ...(modeless ? {} : { permissionMode: draft.permissionMode }),
        ...(draft.effort ? { effort: draft.effort } : {}),
        ...(draft.scratch ? { scratch: draft.scratch } : {}),
        ...(draft.repo === undefined
          ? {}
          : { bootstrap: { repo: draft.repo, baseDir: draft.baseCwd } }),
        ...(toAttach ? { projectId: toAttach } : {}),
      },
      ...(draft.prompt.trim() ? { note: draft.prompt.trim() } : {}),
    });
    // Dismissed while the hub was starting it: the tab sees it through.
    if (current()) {
      job = id;
    } else {
      detachContinuation(id);
    }
    recordModelUse(draft.summarizer.harness, draft.summarizer.model);
    recordModelUse(draft.harness, draft.usedModel);
    rememberSpawn({
      harness: draft.harness,
      model: shownModel(draft),
      permissionMode: draft.permissionMode,
      effort: draft.effort,
    });
  }
  /**
   * Leave for the new session as the dialog starts to close, not after: the
   * dialog is portaled, so its exit plays out over the page arriving, and the
   * new tab rises from where Start was pressed (motion/share: `session:new`,
   * handed to the session it started)
   * while the dialog fades around it. Waiting for the exit left a moment with
   * neither on screen.
   */
  async function exitTo(instanceId: string, current: () => boolean) {
    if (!current()) {
      return;
    }
    handOver("session:new", `session:${instanceId}`);
    close();
    await tick();
    await goto(conversationHref(instanceId, cawco.instanceIndex));
  }
  function keydown(event: KeyboardEvent) {
    if (!open || event.defaultPrevented || event.isComposing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      start();
    }
  }
  function bodyScroll() {
    if (popover) {
      popover = null;
    }
  }
</script>

<svelte:window onkeydown={keydown} />
{#if mobile.current}
  <Drawer
    noBodyStyles
    onOpenChange={(value) => {
      if (!value) {
        close();
      }
    }}
    {open}
    shouldScaleBackground={false}
  >
    <DrawerContent
      aria-label="New Session"
      class="session-card ns-theme"
      data-ns-dialog
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        opener?.focus({ preventScroll: true });
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        card?.focus({ preventScroll: true });
      }}
      bind:ref={card}
    >
      <DrawerTitle class="sr-only">New session</DrawerTitle>
      {@render formContent()}
    </DrawerContent>
  </Drawer>
{:else}
  <Dialog
    onOpenChange={(value) => {
      if (!value) {
        close();
      }
    }}
    {open}
  >
    <DialogPortal>
      <DialogPrimitive.Overlay class="session-scrim ns-theme" />
      <DialogPrimitive.Content
        aria-label="New Session"
        class="session-card ns-theme"
        data-ns-dialog
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus({ preventScroll: true });
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          card?.focus({ preventScroll: true });
        }}
        bind:ref={card}
      >
        <DialogTitle class="sr-only">New session</DialogTitle>
        {@render formContent()}
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>
{/if}

{#snippet formContent()}
  <!-- While a start runs the form takes no input; the footer stays live so
       the pending Start keeps its focus (a focused element in an inert
       subtree drops focus to the body). -->
  <div class="head" inert={busy}>
    <div class="head-left">
      <span class="bolt"><Bolt /></span>
      <span class="title"
        >{continueFrom ? "Sessions · Continue" : "Sessions · New"}</span
      >
    </div>
    <Tip keys="Esc" label="Close">
      {#snippet children(
        tip
      )}
        <button
          {...tip}
          aria-label="Close"
          class="close touch-hit"
          data-vaul-no-drag
          onclick={close}
          type="button"
        >
          <X />
        </button>
      {/snippet}
    </Tip>
  </div>
  <div
    class="body fai-scroll"
    data-vaul-no-drag
    inert={busy}
    onscroll={bodyScroll}
  >
    <!-- One popover surface for every chip in the form: the composer's and
         the chosen model's effort and permission chips glide between each
         other. -->
    <NsPopoverGroup>
      <h2>New Session</h2>
      <section class="sec prompt-sec" style="--delay:0ms">
        <SectionHeader
          hue="var(--hue-blue-500)"
          icon={Chat}
          label={continueFrom ? "Next step (optional)" : "First prompt"}
        />
        <div class="fai-comb"></div>
        <div class="composer field-shell">
          <PromptEditor
            lead={sourceChip}
            {menuItems}
            onleadremove={onexitcontinue}
            onsubmit={start}
            bind:element={editor}
            bind:value={prompt}
          />
          <div class="chips">
            <MachinesChip
              machines={machineItems}
              onchange={(value) => {
                popover = value ? "machines" : null;
              }}
              ontoggle={toggleMachine}
              open={popover === "machines"}
              selected={machineIds}
            />
            <ProjectChip
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
            <LocationChip
              dir={cwd}
              informational={locationInformational}
              {locked}
              {machineId}
              machineName={machine?.hostname ?? ""}
              mode={repo === undefined ? "dir" : "repo"}
              onchange={(value) => {
                popover = value ? "location" : null;
              }}
              onclosefocus={promptAfterClose}
              oncommit={backToPrompt}
              ondir={(value) => {
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
                editing = true;
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
          </div>
        </div>
        <p
          aria-live="polite"
          class="reading"
          title={reading}
          class:informational={locationInformational}
        >
          {reading || "\u00a0"}
        </p>
      </section>
      <div class="fai-comb comb-gap"></div>
      <div class="stack">
        {#if continueFrom}
          <p aria-live="polite" class="sizing" in:unfold|global out:unfold>
            {estimate
              ? `Current context ${tokens(estimate.liveContextTokens)} → ${tokens(estimate.summariseInputTokens)} to summarise`
              : "Reading the session's context…"}
          </p>
        {/if}
        <div class="models" class:pair={Boolean(continueFrom)}>
          {#if continueFrom}
            <div class="sec" style="--delay:60ms">
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
          <div class="sec" style="--delay:80ms">
            <ModelSection
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
  <!-- Full Send in the form, however it got there, stands outside the body's
       scroll, beside Start: it is in view whenever the form can start. -->
  {#if fullSendWarning}
    <div class="full-send" data-vaul-no-drag in:unfold|global out:unfold>
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
  <div class="footer" data-vaul-no-drag>
    <SessionFooter
      {busy}
      busyLabel={continueFrom && followed?.stage !== "starting"
        ? "Summarising…"
        : "Starting…"}
      cancellable={job !== null}
      disabled={cantStart}
      failed={startFailed}
      oncancel={job ? cancelContinue : close}
      onstart={start}
      {startLabel}
    />
  </div>
{/snippet}

<style>
  .footer {
    display: contents;
  }
  .full-send {
    flex: none;
    padding-top: var(--space-2);
  }
  :global(.session-scrim) {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: var(--scrim);
    backdrop-filter: blur(var(--scrim-blur));
    -webkit-backdrop-filter: blur(var(--scrim-blur));
  }
  /* The dialog stands centred in the window; the sheet's place and height
     are the kit drawer's. */
  :global(.session-card:not([data-vaul-drawer])) {
    inset: 0;
    margin: auto;
    width: min(980px, 100vw - 48px);
    height: fit-content;
    max-height: calc(100dvh - 48px);
  }
  :global(.session-card) {
    position: fixed;
    z-index: 81;
    display: flex;
    flex-direction: column;
    background: var(--surface-recess);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    box-shadow: var(--shadow-modal);
    outline: none;
    transform-origin: center;
  }
  :global(.session-card:not([data-vaul-drawer])[data-state="open"]) {
    animation: ns-panel var(--dur-panel) var(--ease-out) both;
  }
  :global(.session-card:not([data-vaul-drawer])[data-state="closed"]) {
    animation: ns-panel-out var(--dur-exit) var(--ease-out) both;
  }
  :global(.session-scrim:not([data-vaul-overlay])[data-state="open"]) {
    animation: ns-scrim var(--dur-panel) var(--ease-out) both;
  }
  :global(.session-scrim:not([data-vaul-overlay])[data-state="closed"]) {
    animation: ns-scrim-out var(--dur-exit) var(--ease-out) both;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 4px 8px;
    flex: none;
  }
  .head-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .bolt {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    background: var(--ink-solid);
    color: var(--on-ink);
    flex: none;
  }
  .bolt :global(svg) {
    width: 12px;
    height: 12px;
  }
  .title {
    font: var(--weight-strong) var(--text-label) / 1 var(--font-body);
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .close {
    --hit-edge: 1px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .close :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) {
    .close:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  /* The body is as tall as what it holds and gives way when the card is
     capped. A zero flex basis counts for nothing in WebKit's fit-content
     height: on an iPhone in landscape the card came out 139px tall around a
     body of padding alone, the prompt out of reach. */
  .body {
    flex: 0 1 auto;
    min-height: 0;
    overflow: auto;
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    padding: 18px 18px 20px;
  }
  h2 {
    margin: 0;
    font: var(--type-title);
    letter-spacing: -0.01em;
    color: var(--ink-strong);
  }
  .sec {
    display: grid;
    gap: 8px;
    animation: ns-in var(--dur-pop) var(--ease-out) both;
    animation-delay: var(--delay, 0ms);
  }
  .prompt-sec {
    margin-top: 16px;
    position: relative;
    z-index: 30;
  }
  .comb-gap {
    margin-top: 18px;
  }
  .stack {
    display: grid;
    gap: 18px;
    margin-top: 18px;
  }
  .sizing {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  /* Continue mode: who summarises beside who continues, read left to right. */
  .models.pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .reading {
    margin: 0;
    font: var(--type-meta);
    color: var(--status-fail-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 16px;
  }
  .reading.informational {
    color: var(--ink-muted);
  }
  .composer {
    position: relative;
    display: grid;
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xs);
    transition: var(--transition-control);
  }
  /* 30px chips that wrap: on a coarse pointer the rows open to 14px apart,
     so each chip's touch area reaches 44px tall. */
  .chips {
    --hit-gap-x: 6px;
    --hit-gap-y: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 8px 10px 10px;

    @media (pointer: coarse) {
      --hit-gap-y: 14px;
      row-gap: 14px;
    }
  }
  @media (max-width: 640px) {
    /* The kit drawer (vaul) carries the sheet: it rises from the bottom,
       follows the finger from the header down and lets go past vaul's
       distance or flick thresholds. The kit rests it on the bottom of the
       visible viewport and caps it there (app.css, the rule for bottom
       sheets), so above a keyboard the header and Start stay on screen and
       the body scrolls between them. */
    :global(.session-card[data-vaul-drawer]) {
      --drawer-max-height: calc(100dvh - max(env(safe-area-inset-top), 24px));
      margin: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding: 0 7px max(env(safe-area-inset-bottom), 7px);
    }
    :global(.session-card[data-vaul-drawer])::before {
      display: none;
    }
    /* The sheet leaves as the dialog does: --dur-exit on --ease-out, with
       its scrim, instead of vaul's 500ms slide. */
    :global(.session-card[data-vaul-drawer][data-state="closed"]),
    :global(
      body:has(.session-card[data-vaul-drawer])
        [data-vaul-overlay][data-state="closed"]
    ) {
      animation-duration: var(--dur-exit);
      animation-timing-function: var(--ease-out);
    }
    .head {
      touch-action: none;
    }
    .models.pair {
      grid-template-columns: minmax(0, 1fr);
    }
    .body {
      padding: 14px 12px 16px;
      touch-action: pan-y;
      overscroll-behavior: contain;
    }
  }
  @keyframes ns-panel-out {
    to {
      transform: translateY(6px) scale(var(--press-scale));
      opacity: 0;
    }
  }
  @keyframes ns-scrim {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes ns-scrim-out {
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.session-card),
    :global(.session-scrim) {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
