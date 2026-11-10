<script lang="ts">
  import {
    type ActivityLine,
    newAnswer,
    type Pin,
    type PreviewMode,
    pinHeld,
    previewMode,
  } from "@cawco/core/comments/model";
  import { pinProblem } from "@cawco/core/comments/validate";
  import { detach } from "@cawco/core/detach";
  import type { ChangedItem } from "@cawco/core/doc-meta";
  import type { FrameSays } from "@cawco/core/page-wire";
  import { pinName } from "@cawco/core/pin-name";
  import {
    PAGE_TOUCHED_MESSAGE,
    PREVIEW_LOCKED_MESSAGE,
  } from "@cawco/core/preview/routes";
  import type { PaneKey } from "@cawco/core/shell-shortcuts";
  import {
    canvasOf,
    STAGE_CLONE_MS,
    STAGE_READY_MS,
    type StageErrorKind,
  } from "@cawco/core/stage";
  import {
    STAGE_DIALS_WRITTEN,
    STAGE_DIFFERENCES,
    STAGE_FAULT,
    STAGE_LAID,
    STAGE_REACHED,
    STAGE_TIME,
    stageDialsWrittenOf,
    stageDifferencesOf,
    stageFaultOf,
    stageLaidOf,
    stageReachedOf,
    stageTimeOf,
  } from "@cawco/core/stage-graph";
  import { artifactWords } from "@cawco/core/words/artifacts";
  import { browserWords } from "@cawco/core/words/browser";
  import { commentWords } from "@cawco/core/words/comments";
  import { commonWords } from "@cawco/core/words/common";
  import { previewWords } from "@cawco/core/words/preview";
  import { sheetWords } from "@cawco/core/words/sheet";
  import { shellWords } from "@cawco/core/words/shell";
  import { type Snippet, untrack } from "svelte";
  import { z } from "zod";
  import { ComposeTargetSchema } from "#lib/cawco/stored-shapes.js";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconAlert,
    IconArchive,
    IconChat,
    IconExternal,
    IconExternalLinear,
    IconGlobe,
    IconInteract,
    IconInteractLinear,
    IconLock,
    IconPen,
    IconPenLinear,
    IconPin,
    IconPinLinear,
    IconRefresh,
    IconRefreshLinear,
    IconSend,
    IconTrash,
    IconTuning,
    IconTuningLinear,
    IconUndock,
    IconUndockLinear,
  } from "#lib/icons.js";
  import { frameObserver, frameSize } from "#lib/platform/frame-observer.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import {
    appear,
    dur,
    numberOf,
    revealOn,
  } from "#lib/platform/motion/curves.svelte.js";
  import { landKey } from "#lib/platform/motion/keyed.svelte.js";
  import { closeInto } from "#lib/platform/motion/share.svelte.js";
  import { readJson, store, stored, writeJson } from "#lib/platform/storage.js";
  import { theme } from "#lib/theme.svelte.js";
  import { formatTimestamp } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";
  import AskHere from "../AskHere.svelte";
  import { keepThumbnail, removeArtifact, writeSheet } from "../artifact-api";
  import { openAsked, takeOpen } from "../artifact-names.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import EmptyAsk from "../EmptyAsk.svelte";
  import { besideLine } from "../graph/beside";
  import DesignGraph from "../graph/DesignGraph.svelte";
  import { inspectKept, StageLink } from "../graph/stage-link.svelte";
  import {
    type MarkdownFleet,
    markdownFleetAbove,
    provideMarkdownFleet,
  } from "../markdown-fleet";
  import { pressOutside } from "../press-outside";
  import { refusals } from "../refusals.svelte";
  import { heardInput } from "../reload.svelte";
  import { runShellShortcut } from "../shell-shortcut";
  import { HEAD_PRIORITY, type HeadItem } from "../side/head";
  import RailFloat from "../side/RailFloat.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";
  import { afterPaint } from "../workspace/warm.svelte";
  import ArtifactMenu from "./ArtifactMenu.svelte";
  import { askAgain, NOT_REACHING } from "./artifact-doc";
  import BrowserAddress from "./BrowserAddress.svelte";
  import BrowserView from "./BrowserView.svelte";
  import { handBackFromPanel, takeOverFromPanel } from "./browser-acts";
  import { browserHead } from "./browser-head";
  import CanvasView from "./CanvasView.svelte";
  import ChangeLines, { type ChangeLine } from "./ChangeLines.svelte";
  import ChangesTag from "./ChangesTag.svelte";
  import CommentRail from "./CommentRail.svelte";
  import CommentsButton from "./CommentsButton.svelte";
  import CoverState, { type CoverWaiting } from "./CoverState.svelte";
  import { CanvasViewState } from "./canvas-view.svelte";
  import type { CommentDrafts } from "./comment-drafts.svelte";
  import {
    commentAttachments,
    NEXT_COMMENT,
    type RailList,
    type RailSort,
  } from "./comment-rows";
  import ModeButton from "./ModeButton.svelte";
  import ModeSwitch from "./ModeSwitch.svelte";
  import CanvasMap from "./map/CanvasMap.svelte";
  import PinFloat from "./PinFloat.svelte";
  import PlacePick from "./PlacePick.svelte";
  import { PaneCanvas } from "./pane-canvas.svelte";
  import { lostWhy, PaneDoc, pageRepliesOf } from "./pane-doc.svelte";
  import { PaneLayout } from "./pane-layout.svelte";
  import { type PaneAct, PaneNotice } from "./pane-notice.svelte";
  import { PaneSend } from "./pane-send.svelte";
  import { PaneSubject } from "./pane-subject.svelte";
  import { frameError, PreviewFrame } from "./preview-frame.svelte";
  import { PreviewReach } from "./preview-reach.svelte";
  import SheetInspector from "./SheetInspector.svelte";
  import { SheetInspector as Inspector } from "./sheet-inspector.svelte";
  import ThreadSheet from "./ThreadSheet.svelte";
  import {
    type ComposeTarget,
    type PreviewPinAt,
    pageMessage,
    previewBox,
    previewCompose,
    previewError,
    previewErrorOf,
    previewKey,
    previewOpenArtifact,
    previewPickPlace,
    previewPinAt,
    previewPinId,
    previewSheet,
    previewShortcut,
    previewThumbnail,
    previewTitle,
    previewUrl,
    SHORTCUT_MESSAGE,
  } from "./wire";

  let {
    instanceId,
    switcher,
    switcherAt = "start",
    sheet = false,
    ownTab = false,
    inset = false,
    onScreen = true,
  }: {
    instanceId: string;
    /**
     * Its conversation's tab is in view (SideSplit's `visible`). A tab kept
     * mounted off screen keeps its page loaded and held, up to the bound of
     * loaded.svelte.ts, and loads it again once its tab is back past it.
     */
    onScreen?: boolean;
    /**
     * Drawn inside another surface (a task's review, TaskReview's stage):
     * the page in its well and what stands over it, with no head of its
     * own. The surface around it names it and holds its controls.
     */
    inset?: boolean;
    /**
     * The artifact's own tab (routes/artifact/[id]): the same pane at full
     * width, with no Open in new tab, and Close back to the session.
     */
    ownTab?: boolean;
    /**
     * Drawn in the phone's sheet over the conversation (SideSheet): a sent
     * setup page puts the sheet away, so Caw's reply under it is read.
     */
    sheet?: boolean;
    /** The Plan | Preview switch, when the conversation has a plan beside it (SideSplit). */
    switcher?: Snippet;
    /** Where the switch stands in the bar (SideSurface `switcherAt`). */
    switcherAt?: "start" | "end";
  } = $props();
  /*
   * Off screen, the page is held (the overlay's hold.ts: no frames, timers
   * or animations run) and kept, up to the owner's bound of panes off
   * screen (loaded.svelte.ts); past it, the one hidden longest unloads. A
   * pane that mounts off screen loads nothing until its tab is shown, and
   * then only once the switch has painted (`afterPaint`).
   */
  const paneId = $props.id();
  const paneSubject = new PaneSubject({
    instanceId: () => instanceId,
    ownTab: () => ownTab,
  });
  const paneNotice = new PaneNotice({
    instanceId: () => instanceId,
    paneSubject,
  });
  const paneLayout = new PaneLayout({ sheet: () => sheet });
  const previewReach = new PreviewReach({
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    paneSubject,
  });
  const paneCanvas = new PaneCanvas({
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    ownTab: () => ownTab,
    paneSubject,
  });
  const previewFrame = new PreviewFrame({
    inset: () => inset,
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    ownTab: () => ownTab,
    paneId: () => paneId,
    paneSubject,
    paneNotice,
    paneLayout,
    previewReach,
    paneCanvas,
  });
  const paneDoc = new PaneDoc({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    previewReach,
    previewFrame,
    writeLooks: () => writeLooks(),
  });
  const paneSend = new PaneSend({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    previewFrame,
    paneDoc,
  });
  /** The cover (its skeleton) stood over the frame, so its going is the skeleton's reveal. */
  let coverStood = false;
  /**
   * The pane's mode, its head's segmented control, kept per session (core
   * `PreviewMode`): Interact (V), the page gets every press and its pins
   * stay pressable; Comment (C), a tap pins a comment to what it lands on;
   * Draw (D), any pointer inks. Esc goes back to Interact. A pen inks in
   * every mode.
   */
  let mode = $state<PreviewMode>("interact");
  const modeKey = $derived(`cawco-preview-mode:${instanceId}`);
  /**
   * The Comments rail beside the page, from the head's Comments, its pressed
   * toggle; shut until opened, then kept per session as the mode is, with
   * its order. It closes only by its Close or by Comments.
   */
  let listOpen = $state(false);
  let railSort = $state<RailSort>("newest");
  const listKey = $derived(`cawco-preview-comments:${instanceId}`);
  const sortKey = $derived(`cawco-preview-comments-sort:${instanceId}`);
  $effect.pre(() => {
    const keys = { mode: modeKey, list: listKey, sort: sortKey };
    untrack(() => {
      mode = previewMode(stored("local", keys.mode)) ?? "interact";
      listOpen = stored("local", keys.list) === "open";
      railSort = stored("local", keys.sort) === "top" ? "top" : "newest";
    });
  });
  $effect(() => {
    store("local", sortKey, railSort);
  });
  function showList(open: boolean) {
    listOpen = open;
    store("local", listKey, open ? "open" : "shut");
  }
  /** ⇧C: every pin on the page hidden, or shown (Figma's own key). */
  let pinsShown = $state(true);
  /** The rail, for `/`: its search field takes the keyboard. */
  let rail = $state<ReturnType<typeof CommentRail>>();
  const downTitle = $derived.by(() => {
    switch (shownDown) {
      case "server":
        return "The page's server stopped answering";
      case "workspace":
        return "That workspace isn't running";
      case "reach":
        return `${paneSubject.ownerMachine} couldn't reach the page's server`;
      case "closed":
        return "This preview is closed";
      case "gone":
        return previewWords.goneTitle;
      case "error":
        return previewWords.errorTitle;
      case "crashed":
        return previewWords.crashedTitle;
      case "machine":
      case null:
        break;
    }
    return previewWords.machineNotAnswering(paneSubject.ownerMachine);
  });
  /** His dial values as the artifact's doc keeps them (`dials`), by name: the design graph stands them again on open. */
  const keptDials = $derived.by(() => {
    const kept = paneDoc.view?.choices.dials?.value;
    return kept && typeof kept === "object" && !Array.isArray(kept)
      ? (kept as Record<string, number | string | boolean>)
      : {};
  });
  /** His tuning of every move as the artifact's doc keeps it (its `tuned` map): the design graph puts it back on each move's first read. */
  const keptTuned = $derived(paneDoc.view?.tuned ?? []);
  /** The design graph's room face the address names (`?face=move`, `map` or `dials`), opened on: the states when it names none. */
  const GRAPH_FACES = ["map", "move", "dials"] as const;
  const startFace =
    typeof location === "undefined"
      ? undefined
      : GRAPH_FACES.find(
          (one) => one === new URL(location.href).searchParams.get("face")
        );
  /**
   * The page's answer to a write the pane sent it: the pin as the page now
   * holds it, drawn again; a refusal under the open card, a reply's words
   * back in its field.
   */
  function heardPageWrite(type: string, message: Record<string, unknown>) {
    const id = typeof message.pin === "string" ? message.pin : null;
    if (!(id && (id in paneDoc.pagePins || paneDoc.pageWords.has(id)))) {
      return;
    }
    if ("now" in message && !paneDoc.view?.pins.some((one) => one.id === id)) {
      paneDoc.pageSays(id, message.now);
    }
    const words =
      type === "cawco:reply-result" ? paneDoc.pageWords.get(id) : undefined;
    if (type === "cawco:reply-result") {
      paneDoc.pageWords.delete(id);
      replying = false;
    }
    if (message.ok === true) {
      if (words !== undefined) {
        drafts?.discard(id);
      }
      return;
    }
    const draft = words === undefined ? null : (drafts?.draft(id) ?? null);
    if (draft?.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
    if (id === openPin) {
      cardError =
        typeof message.error === "string"
          ? message.error
          : "The page didn't keep that, so nothing changed. Try again.";
    }
  }
  /** The Comments control's title: why the comments aren't reaching the agent, else what ⇧C does. */
  const commentsTitle = $derived.by(() => {
    if (paneDoc.linkDown) {
      return `${NOT_REACHING}. Open them to try again.`;
    }
    return pinsShown
      ? "Comments (⇧C hides the pins)"
      : "Comments (⇧C shows the pins)";
  });
  const staged = $derived(
    paneSubject.artifact?.kind === "component" || paneSubject.served
      ? (paneDoc.view?.stage ?? null)
      : null
  );
  /**
   * The stage the cover waits on: none once this load's page answered
   * (`connected`, its overlay's `cawco:ready`), whatever the doc last said of
   * the stage. The doc's word is the agent's last frame, which can trail the
   * stage (a frame missed, a version opened over another's); a page that
   * answered is the stage serving. One that answered and then went silent is
   * the proxy's `down` and the doc's `docDown`, never a wait again.
   */
  const awaited = $derived(previewFrame.connected ? null : staged);
  /**
   * The hub's last read couldn't reach the stage (the doc's `meta.unreached`,
   * which the agent's read says too): said as the proxy's own down is, with
   * its why and since when, once this pane's own load has had its say and
   * the page did not answer (`silentKey`, PAGE_SILENT_MS after it loaded).
   * While a load is on its way, an earlier read is no word on it: the cover
   * stands, and a page its stage answers through the hub's relay clears the
   * doc's word (hub artifacts `stageAnswered`).
   */
  const docDown = $derived(
    staged &&
      !previewFrame.connected &&
      previewFrame.silentKey === previewFrame.frameKey &&
      paneDoc.view?.unreached
      ? paneDoc.view.unreached
      : null
  );
  const shownDown = $derived(previewFrame.down ?? docDown?.down ?? null);
  const shownWhy = $derived(
    previewFrame.down ? previewFrame.downWhy : (docDown?.why ?? null)
  );
  /** A down stage's own words stand unfolded (Show details). */
  let stageDetails = $state(false);
  const stageDetailsId = `${paneId}-stage-details`;
  /**
   * What the cover says while the page is on its way; null when nothing is,
   * or once it has stood past its time ({@link neverDrawn}). A sheet's stage
   * starting names its folder, which CoverState holds on one row.
   */
  const stageWaiting = $derived.by((): CoverWaiting | null => {
    if (neverDrawn) {
      return null;
    }
    switch (awaited?.status) {
      case "starting":
        return paneSubject.served
          ? { line: sheetWords.serverStarting }
          : { dir: awaited.dir };
      case "waking":
      case "asleep":
        return { line: sheetWords.waking };
      case "live":
        return compiling ? { line: sheetWords.compiling } : null;
      case "error":
      case undefined:
        break;
    }
    return null;
  });
  const compileErrors = $derived(
    staged?.status === "live" ? staged.errors : []
  );
  /** A sheet's page still compiling: its stage serves, the page hasn't said it is ready, and no compile error has ended the compile. */
  const compiling = $derived(
    awaited?.status === "live" &&
      !paneSubject.served &&
      compileErrors.length === 0
  );
  /**
   * How long the cover may stand: the time the daemon gives a stage to serve
   * once started (core `STAGE_READY_MS`), and a place's stage its clone and
   * install first (`STAGE_CLONE_MS`), counted on this pane's clock from when
   * it began waiting; none once the page answered ({@link awaited}). A page
   * still on its way past it was never drawn: the stage's word stopped
   * coming, or the page never compiled, and the pane says so with the ways
   * out, never an endless cover.
   */
  const waitingFor = $derived.by(() => {
    // A failure the proxy named says its own words (`down`).
    if (previewFrame.down) {
      return null;
    }
    switch (awaited?.status) {
      case "starting":
        return STAGE_CLONE_MS + STAGE_READY_MS;
      case "waking":
      case "asleep":
        return STAGE_READY_MS;
      case "live":
        return compiling ? STAGE_READY_MS : null;
      case "error":
      case undefined:
        return null;
    }
  });
  let neverDrawn = $state(false);
  $effect(() => {
    const budget = waitingFor;
    // Read so that a Try again (`reload`) or another artifact starts the wait over.
    if (
      budget === null ||
      previewFrame.reload < 0 ||
      paneSubject.artifactId === undefined
    ) {
      neverDrawn = false;
      return;
    }
    const timer = setTimeout(() => {
      neverDrawn = true;
    }, budget);
    return () => {
      clearTimeout(timer);
      neverDrawn = false;
    };
  });
  /** What the stage last said of a page never drawn: its own message, else the first compile error's line. */
  const stageSaid = $derived(
    staged?.message ?? compileErrors[0]?.message.split("\n")[0] ?? null
  );
  /** The never-drawn canvas's Remove: destructive, so asked in place under it (AskHere, The Open Page Rule), as the inspector's Remove is. */
  const removeAsks = new Asker<AskHereRequest>();
  function removeShown() {
    const shown = paneSubject.artifact;
    if (!shown) {
      return;
    }
    detach(
      removeAsks.ask({
        at: "never-drawn-remove",
        title: sheetWords.removeTitle(shown.title),
        body: sheetWords.removeBody,
        confirmLabel: sheetWords.removeConfirm,
        pendingLabel: sheetWords.removing,
        destructive: true,
        run: () => removeArtifact(instanceId, shown.id),
      }),
      "ask"
    );
  }
  /*
   * A sheet's inspector (live components spec §5): the chosen story's props
   * as controls, from the sheet its page says (`cawco:sheet`). Opened from
   * the head's Inspect and kept per session, as Comments is; a right panel
   * beside the page on a desk and a tablet, a sheet over the page's foot on
   * a phone. One per sheet: another sheet starts with nothing unsaved.
   */
  let inspectOpen = $state(false);
  const inspectKey = $derived(`cawco-preview-inspect:${instanceId}`);
  $effect.pre(() => {
    const key = inspectKey;
    untrack(() => {
      inspectOpen = stored("local", key) === "open";
    });
  });
  function showInspector(open: boolean) {
    inspectOpen = open;
    store("local", inspectKey, open ? "open" : "shut");
  }
  const inspector = $derived.by(() => {
    const id = paneSubject.artifactId;
    const session = instanceId;
    return id && paneSubject.isSheet
      ? new Inspector(
          previewFrame.post,
          (change) => writeSheet(session, id, change),
          // A story he picked in the inspector: the design graph keeps its state.
          (file, story) => link?.want(file, story)
        )
      : null;
  });
  const inspecting = $derived(!!inspector && inspectOpen);
  /** A compile error's place, `file:line:column` as far as the toolchain's Vite payload names it (Astro and Nuxt run Vite inside). */
  const errorPlace = (error: {
    column: number | null;
    file: string;
    line: number | null;
  }) =>
    `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
  /** The error card's title by its kind (core `StageError`): a missing states file is no compile error. */
  const errorTitle = (kind: StageErrorKind | undefined) => {
    switch (kind) {
      case "missing":
        return sheetWords.missingTitle;
      case "page":
        return sheetWords.pageTitle;
      case "compile":
      case undefined:
        return sheetWords.errorTitle;
    }
  };
  /**
   * The inspector stands in the design graph's room, under its states,
   * where the room stands beside the stage (a desk's wide pane): the states
   * and the props stand together, and the stage keeps its width. Elsewhere
   * it is the pane's own panel or sheet.
   */
  const inspectorInRoom = $derived(
    paneSubject.isSheet &&
      inspecting &&
      paneLayout.inspectorLayout === "panel" &&
      paneLayout.wellW > 0 &&
      paneLayout.wellW >= besideLine()
  );
  /**
   * What the sheet covers told again as it comes to rest (ThreadSheet
   * `onmoved`): measured as it mounts it stood below the well, covering
   * nothing, so no pin was lifted clear of it.
   */
  let sayCovered: (() => void) | null = null;
  /** The pane's mode, kept for the session and told to the page; `place` is the moved pin the next tap in Comment places again. */
  function setMode(next: PreviewMode, place: string | null = null) {
    // A mode switch leaves nothing of a comment being written.
    if (next !== mode) {
      cancelComposer();
    }
    mode = next;
    placing = next === "comment" ? place : null;
    store("local", modeKey, next);
    previewFrame.post({
      type: "cawco:mode",
      mode: next,
      place: placing,
    } satisfies FrameSays);
  }
  /** ⇧C: every pin shown on the page, or hidden. */
  function showPins(visible: boolean) {
    pinsShown = visible;
    previewFrame.post({ type: "cawco:pins-shown", shown: visible });
  }
  /*
   * The comments (Projects spec §5.7; the artifact panel's surface brief, Placing a comment, The
   * Comments rail, A thread beside its pin): the composer beside the pill
   * the press put down, the thread as a card beside its pin, the rail beside
   * the page, J and K stepping through them.
   */
  /** The pin whose thread is open. */
  let openPin = $state<string | null>(null);
  /** Its pill in the page's viewport, as the page tells it while it scrolls. */
  let pinAt = $state<PreviewPinAt | null>(null);
  /**
   * The pin the page has told where it stands since its thread opened (its
   * pill, or that it stands nowhere on the page). Beside its pill, a card
   * stands only once this is its own, so its first frame is where it stays,
   * never the last pin's place nor the well's corner.
   */
  let pinHeard = $state<string | null>(null);
  /**
   * The pin whose card is going back into its pill, or whose sheet is
   * sliding down, closed: it stays drawn until it has (PinFloat and
   * ThreadSheet `onclosed`), so its pin opened again before then turns the
   * same card or sheet back (their `open`).
   */
  let closingPin = $state<string | null>(null);
  /** The pin J and K stand on. */
  let focusedPin = $state<string | null>(null);
  /** The moved pin a tap places again, and the mode the pane goes back to once it is placed. */
  let placing = $state<string | null>(null);
  let placingFrom: PreviewMode | null = null;
  /** What went wrong with the open thread's reply, resolve or delete. */
  let cardError = $state<string | null>(null);
  /** The open thread's reply is on its way. */
  let replying = $state(false);
  /**
   * The room over the page a pin's card stands in: read as it mounts, and a
   * change in the next frame (frameSize).
   */
  let roomW = $state(0);
  let roomH = $state(0);
  const measureRoom = frameSize(
    (node: HTMLElement) => [node.clientWidth, node.clientHeight] as const,
    ([width, height]) => {
      roomW = width;
      roomH = height;
    }
  );
  /**
   * The pin whose card is drawn: the open one, beside its pill once the
   * page has said where that stands (`pinHeard`; at once as the foot sheet,
   * or with no page to answer). While another pin's place is still on its
   * way, the last card stays where it stood, so the swap is one frame: no
   * frame without a card, none with the new card anywhere but its place.
   * Closed, it is the one going back into its pill (`closingPin`), if any.
   */
  let lastDrawn: string | null = null;
  const drawnPin = $derived.by(() => {
    if (!openPin) {
      lastDrawn = closingPin;
    } else if (
      paneLayout.floatSheet ||
      threadPushed ||
      !previewFrame.connected ||
      pinHeard === openPin
    ) {
      lastDrawn = openPin;
    }
    return lastDrawn;
  });
  const cardPin = $derived(
    paneDoc.pins.find((pin) => pin.id === drawnPin) ?? null
  );
  /** The open thread's element's nearest parent, as the page names its chain (`cawco:pin-chain`). */
  let cardParent = $state<{ id: string; name: string | null } | null>(null);
  /**
   * The comment being written: what the press may stand on (innermost
   * first, out to the whole page), the one chosen, where its hollow pill
   * stands, and its words on their way. Nothing is written until Comment.
   */
  let composing = $state<{
    at: PreviewPinAt | null;
    chain: ComposeTarget[];
    chosen: number;
    error: string;
    sending: boolean;
  } | null>(null);
  /** The composer's float, whose outside presses close it. */
  let composerFloat = $state<HTMLElement>();
  /** The thread's or the composer's float: told to the page as what covers it on a phone. */
  let cardFloat = $state<HTMLElement>();
  /** The comment being written was asked for the whole page from the rail's + (its composer then hangs from the rail's glass beside the page). */
  let composingPage = $state(false);
  $effect(() => {
    if (!composing) {
      composingPage = false;
    }
  });
  /** Changed since you looked, over the page at the well's foot: told to the page as what covers it. */
  let changesTag = $state<HTMLFieldSetElement>();
  /** How tall the page's own foot bar stands over its viewport's foot, px (`cawco:page-foot`): the tag stands above it. */
  let pageFoot = $state(0);
  /** A whole-page comment asked from the rail beside the page: its composer hangs from the rail's glass, not over the page. */
  const pageHung = $derived(
    composingPage && !!composing && listOpen && !paneLayout.railSheet
  );
  /** The rail's foot sheet (a phone, a pane under 640px) stands aside while a composer or a place picker stands, so neither covers the other; a thread opens in it (`threadPushed`). */
  const railAway = $derived(
    listOpen && paneLayout.railSheet && (!!composing || !!previewFrame.picking)
  );
  /** The rail's tab and its rows' scroll, kept while it is shut or stands aside. */
  let listFilter = $state<RailList>("open");
  let listScroll = $state(0);
  /**
   * What the host's chrome covers of the page, told to its overlay
   * (`cawco:covered`, the page's viewport px): on a phone, the thread or the
   * composer standing at the well's foot; at every width, Changed since you
   * looked floating at the foot. A pin the pane opens is brought out from
   * under them (pins.ts `reveal`). Told again as any resizes, and as
   * nothing once none stands. The rail's foot sheet holding its list is a
   * layer over the page that never moves it, so no pin is brought out from
   * under it; holding a thread (`threadPushed`), it is told, so that
   * thread's pin is.
   */
  $effect(() => {
    const frame = previewFrame.iframe;
    const floating = paneLayout.floatSheet
      ? (cardFloat ?? composerFloat ?? null)
      : null;
    const sheetCard = threadPushed ? (railSurface ?? null) : floating;
    if (!(frame && previewFrame.connected)) {
      return;
    }
    const covering = [sheetCard, changesTag].filter(
      (el): el is HTMLElement => !!el
    );
    if (covering.length === 0) {
      previewFrame.post({ type: "cawco:covered", boxes: [] });
      return;
    }
    // Said in the next frame (frameObserver), whatever moved it.
    const sayNow = () => {
      const framed = frame.getBoundingClientRect();
      const left = framed.left + frame.clientLeft;
      const top = framed.top + frame.clientTop;
      previewFrame.post({
        type: "cawco:covered",
        boxes: covering.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - left, y: r.top - top, w: r.width, h: r.height };
        }),
      });
    };
    const sized = frameObserver(sayNow);
    for (const el of covering) {
      sized.observe(el);
    }
    sized.request();
    sayCovered = sayNow;
    return () => {
      sayCovered = null;
      sized.disconnect();
    };
  });
  /**
   * Room under the page's foot while Changed since you looked floats over it
   * (`cawco:foot-room`, px): from the tag's top to the frame's foot and a
   * gap, so the page scrolls that much further and its last line comes clear
   * of the tag, as iOS insets content under a floating bottom bar; none once
   * the tag goes.
   */
  $effect(() => {
    const frame = previewFrame.iframe;
    const tag = changesTag;
    if (!(frame && previewFrame.connected)) {
      return;
    }
    if (!tag) {
      previewFrame.post({ type: "cawco:foot-room", px: 0 });
      return;
    }
    const gap = numberOf("--space-2");
    const sayNow = () => {
      const foot = frame.getBoundingClientRect().bottom - frame.clientTop;
      previewFrame.post({
        type: "cawco:foot-room",
        px: Math.max(
          0,
          Math.ceil(foot - tag.getBoundingClientRect().top + gap)
        ),
      });
    };
    const sized = frameObserver(sayNow);
    sized.observe(tag);
    sized.observe(frame);
    sized.request();
    return () => sized.disconnect();
  });
  /**
   * The head's room over the page's top as the head is laid out now
   * (`cawco:head-room`, px), said again as it changes size (a finger's
   * taller controls): a document CawCo draws pads its scroller by it.
   */
  $effect(() => {
    const head = paneLayout.section?.querySelector<HTMLElement>(
      '[data-slot="side-head"]'
    );
    if (!(previewFrame.iframe && previewFrame.connected && head && !inset)) {
      return;
    }
    const sized = frameObserver(() =>
      previewFrame.post({ type: "cawco:head-room", px: head.offsetHeight })
    );
    sized.observe(head);
    sized.request();
    return () => sized.disconnect();
  });
  /** Pins the agent is working on: the last delivery carried them and its turn runs. */
  const live = $derived.by(() => {
    const stamps = paneDoc.pins.flatMap((pin) => [
      pin.sentAt ?? "",
      ...pin.thread.map((entry) => entry.sentAt ?? ""),
    ]);
    const last = stamps.reduce((a, b) => (b > a ? b : a), "");
    if (!(last && paneSubject.fleet.working(instanceId))) {
      return new Set<string>();
    }
    return new Set(
      paneDoc.pins
        .filter(
          (pin) =>
            !pin.resolvedAt &&
            (pin.sentAt === last ||
              pin.thread.some((entry) => entry.sentAt === last))
        )
        .map((pin) => pin.id)
    );
  });
  /**
   * The pins with an answer the person hasn't looked at (core `newAnswer`:
   * an agent's entry or resolve newer than his last look, the pin's
   * `seenAt` in the doc, so it holds on every device). The open thread is
   * being looked at.
   */
  const unread = $derived(
    new Set(
      paneDoc.pins
        .filter((pin) => pin.id !== openPin && newAnswer(pin))
        .map((pin) => pin.id)
    )
  );
  // The open thread is looked at: what the agent answered there is seen, on every device.
  $effect(() => {
    const pin = cardPin;
    if (!(pin && paneDoc.doc && newAnswer(pin)) || paneDoc.onlyOnPage(pin.id)) {
      return;
    }
    untrack(() => paneDoc.doc?.see(pin.id));
  });
  // Each pill's dot on the page: the agent at work on it, or an answer unread.
  $effect(() => {
    const working = [...live];
    const answered = [...unread];
    if (previewFrame.connected) {
      untrack(() =>
        previewFrame.post({
          type: "cawco:pin-marks",
          live: working,
          unread: answered,
        })
      );
    }
  });
  /*
   * Changed since you looked (PRD §5.7, "Pointing and what changed"): what
   * changed since he looked (the hub's `meta.changes`, carried across
   * revisions) less what he has looked at (the doc's `seen`), each ringed
   * on the page (`c-change-ring`); and the pins with an answer he hasn't
   * looked at. The tag at the well's top steps through them in the check
   * order, a pin and its changed element one stop: a step brings it out,
   * chooses it and pings its ring, and opens a pin's thread; each is seen
   * once its ping has played, and all of them on his Send (the hub's).
   */
  const unseenChanges = $derived.by((): ChangedItem[] => {
    const changes = paneDoc.view?.changes;
    const seen = paneDoc.view?.seen;
    return changes && seen
      ? changes.items.filter((item) => !seen.has(item.anchor))
      : [];
  });
  /** The stops as the page orders them (`cawco:change-stops`): each change's anchors and the pin standing with it. */
  let pageStops = $state.raw<PageStop[]>([]);
  interface PageStop {
    anchors: string[];
    pin: string | null;
  }
  $effect(() => {
    const anchors = unseenChanges
      .filter((item) => item.kind === "element" || item.kind === "card")
      .map((item) => item.anchor);
    const answered = [...unread];
    if (previewFrame.connected) {
      untrack(() =>
        previewFrame.post({ type: "cawco:changes", anchors, pins: answered })
      );
    }
  });
  /** One stop of the tag: what changed there, the pin standing with it, and its words. */
  interface ChangeStop {
    anchors: string[];
    label: string;
    pin: string | null;
  }
  /** The stops not looked at yet, in the check order, then what was taken out (no box to ring). */
  const changeStops = $derived.by((): ChangeStop[] => {
    const labels = new Map(
      unseenChanges.map((item) => [item.anchor, item.label])
    );
    const pinLabel = (id: string) => {
      const pin = paneDoc.pins.find((one) => one.id === id);
      return pin ? `Pin ${pin.number} · ${pinName(pin)}` : "";
    };
    const told = new Set<string>();
    const stops: ChangeStop[] = [];
    for (const stop of pageStops) {
      const anchors = stop.anchors.filter((anchor) => labels.has(anchor));
      const pin = stop.pin && unread.has(stop.pin) ? stop.pin : null;
      for (const anchor of anchors) {
        told.add(anchor);
      }
      if (anchors.length > 0 || pin) {
        stops.push({
          anchors,
          pin,
          label: anchors[0]
            ? (labels.get(anchors[0]) ?? "")
            : pinLabel(pin ?? ""),
        });
      }
    }
    for (const item of unseenChanges) {
      if (!told.has(item.anchor)) {
        stops.push({ anchors: [item.anchor], pin: null, label: item.label });
      }
    }
    // In the rail's check order: what answers him, what changed under him
    // with no answer, then the rest; page order within each.
    const items = new Map(unseenChanges.map((item) => [item.anchor, item]));
    const rank = (stop: ChangeStop) => {
      const of = stop.anchors.map((anchor) => items.get(anchor));
      if (of.some((item) => item?.answered)) {
        return 0;
      }
      return of.some((item) => item?.pin) ? 1 : 2;
    };
    return stops
      .map((stop, at) => ({ stop, at, rank: rank(stop) }))
      .sort((a, b) => a.rank - b.rank || a.at - b.at)
      .map(({ stop }) => stop);
  });
  /** The stops as they stood at the first step: "k of N" counts them while he steps. */
  let tour = $state.raw<ChangeStop[] | null>(null);
  let tourAt = $state(0);
  // Every stop looked at: the tag leaves, and the next revision starts afresh.
  $effect(() => {
    if (changeStops.length === 0 && tour) {
      tour = null;
    }
  });
  /** The page's stops as it said them, each a list of anchors and a pin or none; anything else left out. */
  const changeStopsOf = (value: unknown): PageStop[] =>
    Array.isArray(value)
      ? value.flatMap((one: unknown) => {
          const stop = one as { anchors?: unknown; pin?: unknown } | null;
          return stop &&
            Array.isArray(stop.anchors) &&
            stop.anchors.every((anchor) => typeof anchor === "string") &&
            (stop.pin === null || typeof stop.pin === "string")
            ? [{ anchors: stop.anchors as string[], pin: stop.pin }]
            : [];
        })
      : [];
  /**
   * A step of the tag: by one stop each way, or the first when it starts;
   * brought out, chosen and seen. `via`, a key or a press: a pin's thread a
   * press opens wears no keyboard ring on its pill.
   */
  function stepChange(by: 1 | -1 | 0, via: "key" | "pointer") {
    const stops = tour ?? changeStops;
    if (stops.length === 0) {
      return;
    }
    if (tour) {
      tourAt = (tourAt + by + stops.length) % stops.length;
    } else {
      tour = stops;
      tourAt = by === -1 ? stops.length - 1 : 0;
    }
    const stop = stops[tourAt];
    if (!stop) {
      return;
    }
    const [anchor] = stop.anchors;
    if (anchor && !anchor.startsWith("removed:")) {
      previewFrame.post({
        type: "cawco:show-element",
        selector: anchor,
        outline: "chosen",
      });
    }
    seeSoon(stop.anchors);
    if (stop.pin) {
      openCard(stop.pin, via);
    }
  }
  /** The person pressed a ringed element in Interact mode: he has looked at it. */
  function changePressed(anchor: unknown) {
    const revision = paneDoc.view?.changes?.revision;
    if (typeof anchor === "string" && revision !== undefined) {
      paneDoc.doc?.seeChanges(revision, [anchor]);
    }
  }
  /*
   * What to check (the owner's pick, B: change lines in each thread, the
   * rail as the inbox), from what changed since he looked: the comments an
   * update answered, then those whose element changed with no answer, then
   * what changed under no comment. A row leaves as he looks at it: its
   * thread opened, its spot stepped to, a chip pressed.
   */
  const checking = $derived.by(() => {
    const held = new Set(paneDoc.pins.map((pin) => pin.id));
    const byPin = new Map<string, ChangedItem[]>();
    const unasked: ChangedItem[] = [];
    for (const item of unseenChanges) {
      if (item.pin && held.has(item.pin)) {
        byPin.set(item.pin, [...(byPin.get(item.pin) ?? []), item]);
      } else if (item.kind !== "removed") {
        unasked.push(item);
      }
    }
    const number = (id: string) =>
      paneDoc.pins.find((pin) => pin.id === id)?.number ?? 0;
    const order = [...byPin.keys()].sort((a, b) => number(a) - number(b));
    const answers = (id: string) =>
      (byPin.get(id) ?? []).some((item) => item.answered);
    return {
      byPin,
      unasked,
      pins: [
        ...order.filter((id) => answers(id)),
        ...order.filter((id) => !answers(id)),
      ],
    };
  });
  const checkCount = $derived(checking.pins.length + checking.unasked.length);
  /** A changed thing as a line: what it is, its words then and now, its move, its revision, how often. */
  const lineOf = (item: ChangedItem): ChangeLine => ({
    element: item.element ?? item.label,
    after: item.after ?? item.label,
    anchor: item.anchor,
    ...(item.before === undefined ? {} : { before: item.before }),
    ...(item.moved ? { moved: item.moved } : {}),
    ...(item.revision === undefined ? {} : { revision: item.revision }),
    ...(item.times ? { times: item.times } : {}),
  });
  /** A thread's line, as the hub kept it (the doc's `activity`). */
  const lineOfActivity = (line: ActivityLine): ChangeLine => ({
    element: line.element,
    after: line.after,
    anchor: line.anchor,
    revision: line.revision,
    ...(line.before === undefined ? {} : { before: line.before }),
    ...(line.moved ? { moved: line.moved } : {}),
  });
  /**
   * Whether an update changed what pin `pin` stands on and the agent never
   * answered it: a line of its own the update left unanswered, with no reply
   * of the agent's in its thread since.
   */
  const changedNoAnswer = (pin: Pin): boolean => {
    const lines = paneDoc.view?.activity[pin.id] ?? [];
    const replied = pin.thread.findLast((entry) => entry.by === "agent")?.at;
    return lines.some(
      (line) => !line.answered && (!replied || replied < line.at)
    );
  };
  /** The comments whose Ask again is on its way. */
  let askingAgain = $state.raw<ReadonlySet<string>>(new Set());
  /** A comment's Ask again: it goes to the session again, whole; once it went, what changed under it is looked at. */
  async function askAgainPin(id: string) {
    if (!paneSubject.artifact || askingAgain.has(id)) {
      return;
    }
    askingAgain = new Set([...askingAgain, id]);
    try {
      await askAgain(instanceId, paneSubject.artifact.id, id);
      seeSoon(
        (checking.byPin.get(id) ?? []).map((item) => item.anchor),
        0
      );
    } catch (error) {
      paneNotice.say({ message: failureWords(error), again: null });
    } finally {
      askingAgain = new Set([...askingAgain].filter((one) => one !== id));
    }
  }
  /**
   * These changes looked at, once their ring's ping has played (`--dur-loop`,
   * or `after` ms): the step that brought him there pings it, and a ring
   * looked at fades off, so the look is written after the ping, not over it.
   */
  function seeSoon(anchors: string[], after = dur("--dur-loop")) {
    const revision = paneDoc.view?.changes?.revision;
    if (revision === undefined || anchors.length === 0) {
      return;
    }
    const look = {
      revision,
      anchors,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    };
    look.timer = setTimeout(() => {
      looks.delete(look);
      paneDoc.doc?.seeChanges(revision, anchors);
    }, after);
    looks.add(look);
  }
  /** Looks written once their ping has played; the pane going before then writes them at once, so no look is lost. */
  const looks = new Set<{
    anchors: string[];
    revision: number;
    timer: ReturnType<typeof setTimeout>;
  }>();
  /** Every look still waiting on its ping, written now: the doc it goes in is about to be let go. */
  function writeLooks() {
    for (const look of looks) {
      clearTimeout(look.timer);
      paneDoc.doc?.seeChanges(look.revision, look.anchors);
    }
    looks.clear();
  }
  /**
   * A change's spot brought out on the page (scrolled to, chosen, its ring
   * pinging), with its comment's thread open when one stands on it or it
   * answers one: a To check row, a change chip, the thread's own lines.
   */
  function stepToChange(anchor: string) {
    const item = paneDoc.view?.changes?.items.find(
      (one) => one.anchor === anchor
    );
    const its =
      item?.pin ??
      Object.entries(paneDoc.view?.activity ?? {}).find(([, lines]) =>
        lines.some((line) => line.anchor === anchor)
      )?.[0];
    if (its && paneDoc.pins.some((pin) => pin.id === its)) {
      openCard(its, "pointer");
    }
    if (!anchor.startsWith("removed:")) {
      previewFrame.post({
        type: "cawco:show-element",
        selector: anchor,
        outline: "chosen",
      });
    }
    seeSoon([anchor]);
  }
  /** A To check row pressed: its thread opens, and its first change is brought out. */
  function openChecked(id: string, via: "key" | "pointer") {
    const [first] = checking.byPin.get(id) ?? [];
    openCard(id, via);
    if (first && !first.anchor.startsWith("removed:")) {
      previewFrame.post({
        type: "cawco:show-element",
        selector: first.anchor,
        outline: "chosen",
      });
    }
  }
  // The open thread is looked at: what changed under it leaves To check once its ring has pinged.
  $effect(() => {
    const pin = cardPin;
    const mine = pin ? (checking.byPin.get(pin.id) ?? []) : [];
    if (mine.length > 0) {
      untrack(() => seeSoon(mine.map((item) => item.anchor)));
    }
  });
  /**
   * Back on a page with something to check, the rail opens itself on To
   * check beside the page, once per page as it is read; a change that
   * lands while he is here only counts in its tab. Where the rail is the
   * well's foot sheet (a phone, a pane under 640px) it would stand over the
   * page he came to see (the owner, on his iPhone: "the comments pane opens
   * by default on mobile so I have to dismiss it"): there it opens from
   * Comments alone.
   */
  let checkedFor: string | null = null;
  $effect(() => {
    const id = paneSubject.artifactId;
    if (
      !id ||
      paneDoc.listHold !== "ready" ||
      checkedFor === id ||
      paneSubject.isCanvas ||
      !paneLayout.railPlaced
    ) {
      return;
    }
    checkedFor = id;
    if (!paneLayout.railSheet && untrack(() => checkCount) > 0) {
      untrack(() => {
        listFilter = "check";
        showList(true);
      });
    }
  });
  /** The pins J and K step through: those on the page, by number (a resolved pin has left it). */
  const stepping = $derived(
    paneDoc.pins.filter((pin) => !(pin.movedAt || pin.resolvedAt))
  );
  /**
   * The comment kit: the composer, the thread and their drafts, loaded once
   * the page in the pane is up, or as soon as a composer or a thread is
   * asked for. They are the conversation's code (the chat composer, the
   * transcript's pieces), which an artifact's own tab never loads at first
   * paint (scripts/page-imports-check.ts).
   */
  let kit = $state.raw<{
    CommentComposer: typeof import("./CommentComposer.svelte").default;
    PinCard: typeof import("./PinCard.svelte").default;
    commentDrafts: typeof import("./comment-drafts.svelte").commentDrafts;
  } | null>(null);
  let kitLoading: Promise<void> | null = null;
  /**
   * What a thread's markdown reads of the fleet (markdown-fleet.ts): the
   * app's, under the app; on an artifact's own tab, the live one, loaded
   * with the kit, so a thread's references draw as they do in the app from
   * its first frame.
   */
  const markdownAbove = markdownFleetAbove();
  let ownMarkdown = $state.raw<MarkdownFleet | undefined>(undefined);
  if (!markdownAbove) {
    provideMarkdownFleet(() => ownMarkdown);
  }
  function loadKit(): Promise<void> {
    kitLoading ??= Promise.all([
      import("./CommentComposer.svelte"),
      import("./PinCard.svelte"),
      import("./comment-drafts.svelte"),
      markdownAbove ? null : import("../markdown-live"),
    ]).then(([composer, card, kept, markdown]) => {
      ownMarkdown = markdown?.liveMarkdown;
      kit = {
        CommentComposer: composer.default,
        PinCard: card.default,
        commentDrafts: kept.commentDrafts,
      };
    });
    return kitLoading;
  }
  $effect(() => {
    if (previewFrame.connected) {
      return untrack(() => afterPaint(loadKit));
    }
  });
  /** What the person has half-written: the next comment's, and each thread's reply, kept across a reload. */
  let drafts = $state.raw<CommentDrafts | null>(null);
  $effect(() => {
    const ready = kit;
    if (!ready) {
      return;
    }
    const held = ready.commentDrafts(() => paneSubject.artifactId);
    drafts = held;
    return () => {
      held.release();
      drafts = null;
    };
  });
  /** The next comment's draft: its words and chips stay for the next composer. */
  const nextDraft = $derived(
    drafts && paneSubject.artifactId ? drafts.draft(NEXT_COMMENT) : null
  );
  /** The open thread's reply. */
  const replyDraft = $derived(
    drafts && cardPin ? drafts.draft(cardPin.id) : null
  );
  /** What the person said in a draft just taken by its composer: its words, and its files by reference. */
  const saidIn = (
    draft: {
      unsent: { files: Parameters<typeof commentAttachments>[0] } | null;
    },
    text: string
  ) => ({ text, attachments: commentAttachments(draft.unsent?.files ?? []) });
  /**
   * Pin `id` focused on the page, with `scroll` brought into view (`instant`
   * in one step). Its pill wears the focus ring only when the keyboard got
   * it there (`keyed`, by default the last input): an open or stepped-to pin
   * reached by a press is marked by its card and its row, never a ring
   * (DESIGN.md, The One Ring Rule).
   */
  function focusPin(
    id: string,
    scroll: boolean,
    { instant = false, keyed = lastInput.current === "key" } = {}
  ) {
    previewFrame.post({ type: "cawco:focus-pin", id, scroll, instant, keyed });
  }
  /** Pin `id`'s thread opens; `via`, a key or a press. A composer standing goes, and another thread closes. */
  function openCard(id: string, via: "key" | "pointer" = "pointer") {
    loadKit();
    dropPeek();
    if (closingPin) {
      // Another pin's card going back into its pill goes at once; its own turns back.
      if (closingPin !== id) {
        lastDrawn = null;
      }
      closingPin = null;
    }
    if (composing) {
      cancelComposer();
    }
    if (openPin && openPin !== id) {
      closeCard(true);
    }
    // A key or a press inside the page, which the host never hears: the page's last input is it.
    lastInput.current = via;
    if (openPin !== id) {
      // Its place is the page's to say; the card drawn now keeps its own until it does (`drawnPin`).
      pinHeard = null;
    }
    openPin = id;
    focusedPin = id;
    cardError = null;
    cardParent = null;
    previewFrame.post({ type: "cawco:track-pin", id });
    // Brought into view in one step, not a glide: its card stands where its
    // pill lands, and the page tells that place once.
    focusPin(id, true, { instant: true, keyed: via === "key" });
  }
  /**
   * The thread closes: its Close, Esc, another row or pin opened (`swap`:
   * its card stays as it stands until the next one's place is heard, then
   * goes at once, so no frame shows it beside the next). Closed, its card
   * beside the pill goes back into it, and the phone's sheet slides down,
   * each drawn until it has (`closingPin`).
   * Its reply's words stay with its pin.
   */
  function closeCard(swap = false) {
    const id = openPin;
    if (!swap && id && drawnPin === id) {
      closingPin = id;
    }
    openPin = null;
    if (!swap) {
      pinAt = null;
    }
    pinHeard = null;
    cardError = null;
    replying = false;
    cardParent = null;
    if (id && id === placing) {
      placeElsewhere(false);
    }
    previewFrame.post({ type: "cawco:track-pin", id: null });
  }
  /**
   * The composer closes with nothing written (Esc, a press outside it, a
   * mode switch, a thread opened). Holding words or chips, it is parked
   * (The Work Outlives Its Surface Rule): its hollow pill stays at its
   * target saying it holds a draft, and one press on it opens the composer
   * again with them; its words and chips stay as the next comment's draft,
   * an upload in flight going on. Empty, its pill goes.
   */
  function cancelComposer() {
    if (!composing) {
      return;
    }
    composing = null;
    if (nextDraft?.hasContent) {
      previewFrame.post({ type: "cawco:compose-park" });
      keepDraftAt(keptDraft ? { ...keptDraft, parked: true } : null);
    } else {
      previewFrame.post({ type: "cawco:compose-cancel" });
      keepDraftAt(null);
    }
  }
  /**
   * Where the next comment's draft stands, kept on this device per artifact
   * beside its words (the draft store): its target as the page named it,
   * the point on it, and whether its composer is open or parked. A reload
   * brings it back at its target as it was.
   */
  const KeptDraftSchema = z.object({
    inkId: z.string().optional(),
    parked: z.boolean(),
    point: z.object({ x: z.number(), y: z.number() }).optional(),
    target: ComposeTargetSchema,
  });
  type KeptDraft = z.infer<typeof KeptDraftSchema>;
  let keptDraft: KeptDraft | null = null;
  const draftKey = $derived(
    paneSubject.artifactId
      ? `cawco-comment-draft:${paneSubject.artifactId}`
      : null
  );
  function keepDraftAt(next: KeptDraft | null) {
    keptDraft = next;
    if (draftKey) {
      writeJson(draftKey, next);
    }
  }
  /** What the page said of a draft it opened (`cawco:compose`): kept, open. */
  function keepComposed(
    said: { chain: ComposeTarget[]; chosen: number },
    message: Record<string, unknown>
  ) {
    const target = said.chain[said.chosen];
    if (!target) {
      return;
    }
    const point = message.point as { x?: unknown; y?: unknown } | undefined;
    keepDraftAt({
      target,
      parked: false,
      ...(typeof point?.x === "number" && typeof point.y === "number"
        ? { point: { x: point.x, y: point.y } }
        : {}),
      ...(typeof message.inkId === "string" ? { inkId: message.inkId } : {}),
    });
  }
  /** A page loaded again: the draft kept for it comes back at its target, parked or open, once per load. */
  function restoreDraft() {
    const key = draftKey;
    const kept = key ? readJson(key, KeptDraftSchema.nullable(), null) : null;
    keptDraft = kept;
    if (!kept?.target?.anchor || composing) {
      return;
    }
    if (!kept.parked) {
      loadKit();
    }
    previewFrame.post({
      type: "cawco:compose-restore",
      target: { ...kept.target, point: kept.point, inkId: kept.inkId },
      parked: kept.parked,
    });
  }
  /** Comment: the words and what they carry go to the page, which writes the pin and its first entry at once; `held`, kept to send with the others (core `ThreadEntry.held`). */
  function comment(text: string, held = false) {
    if (!(composing && nextDraft)) {
      return;
    }
    const said = saidIn(nextDraft, text);
    composing.error = "";
    composing.sending = true;
    previewFrame.post({ type: "cawco:comment", ...said, held });
  }
  /** The page's answer to Comment: written, the composer goes; refused, the words are back in it with why. */
  function heardComment(message: Record<string, unknown>) {
    // Written, it is heard whether or not its composer still stands: an Esc
    // that came before the page's answer closed the composer, not the
    // comment, which the page wrote.
    if (message.ok === true) {
      const { pin } = message;
      const written = !!pin && pinProblem(pin) === null;
      if (
        written &&
        !paneDoc.view?.pins.some((one) => one.id === (pin as Pin).id)
      ) {
        paneDoc.pageSays((pin as Pin).id, pin);
      }
      composing = null;
      keepDraftAt(null);
      // The newest comment is the one J and K step from.
      if (written) {
        markFocused((pin as Pin).id);
      }
      drafts?.discard(NEXT_COMMENT);
      return;
    }
    const draft = nextDraft;
    if (!(composing && draft)) {
      return;
    }
    if (draft.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
    composing.sending = false;
    composing.error =
      typeof message.error === "string"
        ? message.error
        : "The page didn't keep that comment. Try again.";
  }
  function markFocused(id: string) {
    focusedPin = id;
  }
  // A press anywhere in the dashboard outside the composer closes it; one in a
  // modal layer or a menu (its target chip's) is that layer's.
  $effect(() => {
    const float = composerFloat;
    if (!float) {
      return;
    }
    return pressOutside(float, (event) => {
      if (!(
        event.target instanceof Element &&
        event.target.closest("[aria-modal='true'], dialog[open], [role='menu']")
      )) {
        cancelComposer();
      }
    });
  });
  /** J and K: the next or the previous pin on the page, outlined and scrolled to. */
  function step(by: 1 | -1) {
    if (stepping.length === 0) {
      return;
    }
    const at = stepping.findIndex((pin) => pin.id === focusedPin);
    const next =
      stepping[(at + by + stepping.length) % stepping.length] ?? stepping[0];
    focusedPin = next.id;
    // J and K are the keyboard's own steps.
    focusPin(next.id, true, { keyed: true });
    if (openPin) {
      openCard(next.id, "key");
    }
  }
  /** A pin's own address (its thread's Copy link): its artifact's tab, opening the pin's thread. */
  const pinLink = (number: number): string =>
    paneSubject.artifactId
      ? `${location.origin}/artifact/${encodeURIComponent(paneSubject.artifactId)}?pin=${number}`
      : location.href;
  /**
   * The place the address names, opened once its page is ready and its pins
   * are read: a pin's thread (`?pin=N`), or a decision card (`?card=<id>`).
   */
  let linkedFor: string | null = null;
  function openLinkedPin() {
    const asked = new URL(location.href).searchParams;
    if (!paneSubject.artifactId || linkedFor === paneSubject.artifactId) {
      return;
    }
    const card = asked.get("card");
    if (card) {
      linkedFor = paneSubject.artifactId;
      showCard(card);
      return;
    }
    const change = asked.get("change");
    if (change) {
      linkedFor = paneSubject.artifactId;
      stepToChange(change);
      return;
    }
    const number = Number(asked.get("pin"));
    if (openPinNumbered(number)) {
      linkedFor = paneSubject.artifactId;
    }
  }
  $effect(() => {
    if (previewFrame.connected && paneDoc.view) {
      untrack(openLinkedPin);
    }
  });
  /** Pin `number`'s thread opened, when the page holds it; whether it did. */
  function openPinNumbered(number: number): boolean {
    const pin = Number.isInteger(number)
      ? paneDoc.pins.find((one) => one.number === number)
      : undefined;
    if (!pin) {
      return false;
    }
    if (pin.resolvedAt || pin.movedAt) {
      // Off the page: its thread opens from its row, in Resolved or Open.
      listFilter = pin.resolvedAt ? "resolved" : "open";
      showList(true);
    }
    openCard(pin.id);
    return true;
  }
  /** Decision card `card` brought into view and outlined for a moment. */
  function showCard(card: string) {
    previewFrame.post({
      type: "cawco:show-element",
      selector: `#decision-${CSS.escape(card)}`,
      outline: "flash",
    });
  }
  /*
   * A chip's press (artifact-names.svelte.ts `askOpen`): once the page is
   * up and its pins are read, the place it names opens, once: a pin's
   * thread, a decision card, or the artifact as it is.
   */
  $effect(() => {
    const id = paneSubject.artifactId;
    const at = id ? openAsked(id) : null;
    if (!(id && at && previewFrame.connected && paneDoc.view)) {
      return;
    }
    untrack(() => {
      takeOpen(id);
      if ("pin" in at) {
        openPinNumbered(at.pin);
      } else if ("card" in at) {
        showCard(at.card);
      } else if ("change" in at) {
        stepToChange(at.change);
      }
    });
  });
  /**
   * The open thread's Pin it somewhere else: Comment mode, its thread still
   * open, until the next tap on the page pins the gone pin anew; Cancel
   * (or the thread closing) puts the mode back as it was.
   */
  function placeElsewhere(on: boolean) {
    if (on && openPin) {
      placingFrom = mode;
      setMode("comment", openPin);
      return;
    }
    if (placingFrom && placingFrom !== "comment") {
      setMode(placingFrom);
    } else {
      setMode(mode);
    }
    placingFrom = null;
  }
  /** The person's words in the open thread; a resolved pin's reply reopens it ("Reply to reopen"). */
  function reply(text: string, held = false) {
    const draft = replyDraft;
    if (!(openPin && draft)) {
      return;
    }
    const said = { ...saidIn(draft, text), held };
    const reopens = !!cardPin?.resolvedAt;
    if (paneDoc.onlyOnPage(openPin)) {
      // The page holds the pin and keeps the words on its device until the
      // hub has them; its answer (`cawco:reply-result`) draws them, or puts
      // them back in the field with why.
      paneDoc.pageWords.set(openPin, text);
      replying = true;
      previewFrame.post({ type: "cawco:reply", pin: openPin, ...said });
      if (reopens) {
        previewFrame.post({
          type: "cawco:resolve",
          pin: openPin,
          resolved: false,
        });
      }
      cardError = null;
      return;
    }
    cardError = paneDoc.doc
      ? paneDoc.doc.reply(openPin, said)
      : "The pane lost the page's document, so the reply wasn't kept. Reload, then reply again.";
    if (cardError === null && reopens && paneDoc.doc) {
      cardError = paneDoc.doc.resolve(openPin, false);
    }
    if (cardError === null) {
      // Said: the words are in the thread, so no draft is left to keep.
      drafts?.discard(openPin);
    } else if (draft.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
  }
  /** A pin resolved or reopened: from its thread's head, or its row in the rail. */
  function resolvePin(resolved: boolean, id: string | null = openPin) {
    if (!id) {
      return;
    }
    focusPast(id, resolved);
    if (paneDoc.onlyOnPage(id)) {
      cardError = null;
      previewFrame.post({ type: "cawco:resolve", pin: id, resolved });
      return;
    }
    const refused = paneDoc.doc
      ? paneDoc.doc.resolve(id, resolved)
      : `The pane lost the page's document, so the comment wasn't ${resolved ? "resolved" : "reopened"}. Reload, then try again.`;
    if (id === openPin) {
      cardError = refused;
    } else if (refused) {
      paneNotice.say({ message: refused, again: null });
    }
  }
  /**
   * The rail's rows as it last drew them, in its tab and its order: what the
   * focus steps through once the comment it stood on leaves that tab. Kept
   * while the rail stands aside (a phone's sheet, while a thread stands).
   */
  let railOrder: string[] = [];
  /**
   * Comment `id` resolved (or reopened) leaves the tab in front of him when
   * that tab is Open (or Resolved): the tab stays, and the focus, when it
   * stood on it, moves to the row after it there, else the one before it,
   * else to none (the tab's empty state). So J and K walk the rows he sees,
   * and the rail never follows the comment to its new tab.
   */
  function focusPast(id: string, resolved: boolean) {
    const leaves =
      (listFilter === "open" && resolved) ||
      (listFilter === "resolved" && !resolved);
    if (!(leaves && focusedPin === id)) {
      return;
    }
    const at = railOrder.indexOf(id);
    const rest = railOrder.filter((one) => one !== id);
    const next = at === -1 ? null : (rest[at] ?? rest[at - 1] ?? null);
    focusedPin = next;
    if (next) {
      focusPin(next, false);
    }
  }
  /**
   * The thread's Delete, once asked in place: the pin goes from the doc (core
   * `deletePin`), its pill from the page, and the thread closes. A refusal
   * throws its sentence, which stays under the question.
   */
  function deleteOpenPin(): Promise<void> {
    const id = openPin;
    if (!id) {
      return Promise.resolve();
    }
    let refused: string | null = null;
    if (paneDoc.onlyOnPage(id)) {
      // The page holds it alone: deleted there, its answer saying any refusal.
      previewFrame.post({ type: "cawco:delete", pin: id });
      paneDoc.pageSays(id, null);
    } else {
      refused = paneDoc.doc
        ? paneDoc.doc.delete(id)
        : "The pane lost the page's document, so the comment wasn't deleted. Reload, then try again.";
    }
    if (refused) {
      return Promise.reject(new Error(refused));
    }
    if (focusedPin === id) {
      focusedPin = null;
    }
    drafts?.discard(id);
    closeCard();
    return Promise.resolve();
  }
  /**
   * The pill the pointer rests on, its peek beside it: its thread's card
   * holding his words and the latest reply (PinCard `peek`), after
   * `--dur-peek` the first time, at once while one is up or just went;
   * never under a finger. The pointer may leave the pill for the peek: it
   * goes `--dur-peek` after the pointer left them both.
   */
  let peekAt = $state<{ id: string; mark: PreviewPinAt["mark"] } | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the last peek went: the next within `--dur-peek` comes at once. */
  let peekWent = 0;
  /** The pointer rests on the peek itself. */
  let onPeek = false;
  function heardPeek(message: Record<string, unknown>) {
    clearTimeout(peekTimer);
    const id = previewPinId(message.id);
    const mark = previewBox(message.mark);
    // None under a finger, and none while a thread or a composer stands.
    if (paneLayout.coarse.current || openPin || composing) {
      dropPeek();
      return;
    }
    if (!(id && mark)) {
      // Off its pill: onto the peek, which stays, or away.
      if (peekAt && !onPeek) {
        peekTimer = setTimeout(dropPeek, dur("--dur-peek"));
      }
      return;
    }
    const wait = dur("--dur-peek");
    if (peekAt || performance.now() - peekWent < wait) {
      peekAt = { id, mark };
      return;
    }
    peekTimer = setTimeout(() => {
      peekAt = { id, mark };
    }, wait);
  }
  /** The pointer came onto the peek (it stays) or left it (it goes after `--dur-peek`, unless the pointer is back on its pill). */
  function restOnPeek(on: boolean) {
    onPeek = on;
    clearTimeout(peekTimer);
    if (!on) {
      peekTimer = setTimeout(dropPeek, dur("--dur-peek"));
    }
  }
  /** Every peek goes as a thread or a composer opens: one left up would stand over what it opens on. */
  function dropPeek() {
    clearTimeout(peekTimer);
    if (peekAt) {
      peekWent = performance.now();
    }
    peekAt = null;
    onPeek = false;
  }
  /** No peek while a thread or a composer stands: the card is what the person reads then. */
  const peekPin = $derived(
    peekAt && !openPin && !composing
      ? (paneDoc.pins.find((pin) => pin.id === peekAt?.id) ?? null)
      : null
  );
  /** What holds the focus as a control: a key it takes is its own. */
  const PANE_CONTROL =
    'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';
  /** A key's mode: V Interact, C Comment, D Draw (Figma's V and C). */
  const MODE_KEYS = { v: "interact", c: "comment", d: "draw" } as const;
  /**
   * The pane's keys: V, C and D its modes, ⇧C every pin hidden or shown, J
   * and K a step through the pins, Enter opens one, `/` the rail's search;
   * Esc unwinds one at a time: the composer, then the thread, then Comment
   * or Draw back to Interact (`parentEscape`).
   */
  function pressKey(name: PaneKey) {
    if (
      (name === "v" || name === "c" || name === "d") &&
      !paneSubject.isCanvas
    ) {
      setMode(MODE_KEYS[name]);
    } else if (name === "C" && !paneSubject.isCanvas) {
      showPins(!pinsShown);
    } else if (name === "j") {
      step(1);
    } else if (name === "k") {
      step(-1);
    } else if (
      name === "Enter" &&
      focusedPin &&
      paneDoc.pins.some((pin) => pin.id === focusedPin)
    ) {
      // Only a pin of this page: one J and K stood on elsewhere opens nothing.
      openCard(focusedPin, "key");
    } else if (name === "/" && listOpen) {
      rail?.focusSearch();
    } else if (name === "Escape") {
      if (composing) {
        cancelComposer();
      } else if (openPin) {
        closeCard();
      } else {
        setMode("interact");
      }
    }
  }
  /**
   * A key pressed inside the pane, outside a field: the page's are heard as
   * `cawco:key`. Enter on a focused control is the control's own (a rail's
   * row opens its own thread, a button presses): the pane's Enter, the pin
   * J and K stand on, is for where no control has the focus.
   */
  function paneKey(event: KeyboardEvent) {
    // A browser has no modes, pins or rail: its keys are the browser's own.
    if (paneSubject.isBrowser) {
      return;
    }
    const { target } = event;
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      // The pane's own: its rail stands in its card.
      !(target instanceof Node && paneLayout.section?.contains(target)) ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) ||
      (event.key === "Enter" &&
        target instanceof Element &&
        !!target.closest(PANE_CONTROL))
    ) {
      return;
    }
    const letter = event.key.length === 1 ? event.key.toLowerCase() : null;
    const name = previewKey(
      letter === "c" && event.shiftKey ? "C" : (letter ?? event.key)
    );
    if (name && name !== "Escape") {
      event.preventDefault();
      pressKey(name);
    }
  }
  /**
   * Esc pressed in the page and left to the host (overlay page.ts
   * `escapeToHost`): the focus in the frame keeps every key from this
   * document, so it is pressed here at the frame, where this document's
   * own Esc lands while the frame has the focus, and every Esc rule of the
   * host answers it in its own order: the topmost open layer first
   * (bits-ui's escape layer, on the document: a design graph's popover over
   * its stage, the preview's sheet), then the pane's unwinding
   * (`parentEscape`), the split's expansion (Split `escapeExpanded`) and
   * Full size (Shell).
   */
  function escapeFromPage() {
    previewFrame.iframe?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  }
  export function parentEscape(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest("dialog[open]"))
    ) {
      return;
    }
    if (composing || openPin || mode !== "interact") {
      pressKey("Escape");
      event.preventDefault();
    }
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one validated dispatch for the overlay's wire protocol.
  function receive(event: MessageEvent) {
    // The page's own frame, from its own origin: nothing else is heard.
    if (
      !previewReach.paneOrigin ||
      event.source !== previewFrame.iframe?.contentWindow ||
      event.origin !== previewReach.paneOrigin
    ) {
      return;
    }
    previewFrame.heardKey = previewFrame.frameKey;
    if (event.data?.type === PAGE_TOUCHED_MESSAGE) {
      heardInput();
      return;
    }
    if (event.data?.type === "cawco:down") {
      previewFrame.heardDown(event.data);
      return;
    }
    if (event.data?.type === PREVIEW_LOCKED_MESSAGE) {
      previewFrame.turnedAway();
      return;
    }
    // A decision page's Open to draw or Open full: the artifact opens where
    // a chip of it pressed in this session's conversation opens. Loaded on
    // the press, as a pin's chip loads it: the artifact's own tab never
    // reaches the conversation's code (page-imports-check.ts).
    const opening = previewOpenArtifact(event.data);
    if (opening) {
      import("../reference-open.svelte")
        .then(({ openReference }) =>
          openReference(opening.artifact, { top: true }, instanceId)
        )
        .then((refused) =>
          previewFrame.post({ jsonrpc: "2.0", id: opening.id, result: refused })
        );
      return;
    }
    const ask = previewPickPlace(event.data);
    if (ask !== null) {
      // A second ask replaces one still open: the page asked again.
      previewFrame.cancelPick();
      previewFrame.picking = { id: ask };
      return;
    }
    const message = pageMessage(event.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "cawco:ready":
      case "cawco:navigated": {
        const at = previewUrl(message.url, previewReach.paneOrigin);
        if (!at) {
          return;
        }
        // The page answers: whatever the proxy said of an earlier load is over.
        previewFrame.down = null;
        previewFrame.downWhy = null;
        const parsed = new URL(at);
        previewReach.keepAt(parsed);
        if (paneSubject.preview) {
          paneSubject.preview.title = previewTitle(message.title) ?? "";
        }
        if (message.type === "cawco:ready") {
          previewFrame.readyFrom = event.origin;
          previewFrame.connected = true;
          // A new page holds no drawing: the design graph reaches its state again.
          link?.loaded();
          previewFrame.refusedEntries = 0;
          // It was let in: a later turn-away is a pass lost since, which a new entry answers.
          previewFrame.frameSince = performance.now();
          // The frame Try again reloaded answered: what it was tried for is over.
          previewFrame.retrying = false;
          if (paneNotice.failure?.again === "reload") {
            paneNotice.say(null);
          }
          // A page loaded again holds no comment being written.
          composing = null;
          setMode(mode, placing);
          if (!pinsShown) {
            showPins(false);
          }
          openLinkedPin();
          restoreDraft();
          if (openPin) {
            previewFrame.post({ type: "cawco:track-pin", id: openPin });
          }
          previewFrame.post({
            type: "cawco:pin-marks",
            live: [...live],
            unread: [...unread],
          });
          if (!onScreen) {
            // Loaded while its tab is off screen: held from the start.
            previewFrame.post({ type: "cawco:hold" });
          }
        }
        break;
      }
      case "cawco:held":
        previewFrame.pageHeld = message.held === true;
        break;
      case "cawco:head-room":
        previewFrame.headRoomTaken = message.taken === true;
        break;
      case "cawco:captured": {
        // Both schemes in one answer, the other drawn off screen (overlay schemes.ts).
        const shot = previewThumbnail(message);
        if (shot && paneSubject.preview) {
          paneSubject.preview.thumbnail = shot;
          paneSubject.preview.thumbnailRevision = paneSubject.preview.revision;
          paneSubject.preview.thumbnailWanted = false;
          // The hub keeps it as the artifact's latest picture: Files' cards
          // draw it, whichever panel took it: its own or its delegation
          // tree's (the hub keeps it as the artifact's session's). A canvas
          // keeps its own.
          if (paneSubject.preview.artifact.kind !== "canvas") {
            keepThumbnail(
              instanceId,
              paneSubject.preview.artifact.id,
              shot
            ).catch((error: unknown) => {
              console.error("The page's thumbnail was not kept", error);
            });
          }
        }
        paneNotice.say(frameError(previewError(message.error)));
        previewFrame.retrying = false;
        break;
      }
      case "cawco:pin-open": {
        const id = previewPinId(message.id);
        if (!id) {
          return;
        }
        if (id === placing || placing) {
          // Placed again: the mode goes back to how it was before.
          if (placingFrom && placingFrom !== "comment") {
            setMode(placingFrom);
          } else {
            placing = null;
          }
          placingFrom = null;
        }
        // The pin as the page holds it: the card draws from it while the pane's doc doesn't hold it yet.
        if (
          message.pin !== undefined &&
          !paneDoc.view?.pins.some((one) => one.id === id)
        ) {
          paneDoc.pageSays(id, message.pin);
        }
        openCard(id, message.via === "key" ? "key" : "pointer");
        break;
      }
      case "cawco:compose": {
        // A press on the page (or a radial's Comment) opened a comment's composer: nothing is written yet.
        const said = previewCompose(message);
        if (!said) {
          return;
        }
        if (openPin) {
          closeCard();
        }
        loadKit();
        dropPeek();
        // The press was the page's, which the host never hears: the page's last input is it.
        lastInput.current = message.via === "key" ? "key" : "pointer";
        composing = {
          at: composing?.at ?? null,
          chain: said.chain,
          chosen: said.chosen,
          error: "",
          sending: false,
        };
        keepComposed(said, message);
        break;
      }
      case "cawco:compose-at":
        if (composing) {
          composing.at = previewPinAt(message);
        }
        break;
      case "cawco:comment-result":
        heardComment(message);
        break;
      case "cawco:pin-chain": {
        const id = previewPinId(message.id);
        const parent = previewCompose(message)?.chain[1];
        if (id && id === openPin) {
          cardParent = {
            id,
            name:
              parent && parent.anchor.selector !== "body"
                ? pinName({
                    anchor: parent.anchor,
                    elements: parent.elements,
                  } as unknown as Pin)
                : null,
          };
        }
        break;
      }
      case "cawco:peek":
        heardPeek(message);
        break;
      case "cawco:change-stops":
        pageStops = changeStopsOf(message.stops);
        break;
      // The page's own foot bar over the viewport's foot (its Send): Changed since you looked stands above it.
      case "cawco:page-foot":
        pageFoot =
          typeof message.px === "number" && Number.isFinite(message.px)
            ? Math.max(0, message.px)
            : 0;
        break;
      case "cawco:change-pressed":
        changePressed(message.anchor);
        break;
      // What the page said of a write the pane sent it for a pin it holds alone.
      case "cawco:reply-result":
      case "cawco:resolve-result":
      case "cawco:delete-result":
        heardPageWrite(message.type, message);
        break;
      case "cawco:page-pins":
        // The replies the hub refused that the page keeps, every one each time: they stand in their threads.
        paneDoc.pageReplies = pageRepliesOf(message.replies);
        // The pins the page holds while its link isn't synced (a reload's, given back by the device among them): those the pane's doc lacks stand as the page's.
        for (const pin of Array.isArray(message.pins) ? message.pins : []) {
          const one = pin as Partial<Pin> | null;
          const id = one?.id;
          if (
            !(typeof id === "string" && one) ||
            paneDoc.view?.pins.some((held) => held.id === id)
          ) {
            continue;
          }
          // One the hub refused breaks a bound by its nature (the hub's reason says which): it is listed whole, so its words stay in reach.
          if (
            one.notSent &&
            typeof one.number === "number" &&
            Array.isArray(one.thread)
          ) {
            paneDoc.pagePins = { ...paneDoc.pagePins, [id]: one as Pin };
          } else {
            paneDoc.pageSays(id, pin);
          }
        }
        break;
      case "cawco:sync":
        // The page's doc's link to the hub (overlay artifact.ts `Link`): a lost one is said once it has stood, or at once when lost to silence.
        paneDoc.pageLost =
          message.state === "lost" ? lostWhy(message.error) : null;
        paneDoc.pageSilent =
          message.state === "lost" && message.silent === true;
        break;
      case "cawco:press":
        // A press on the page, outside the composer: the outside-press rule,
        // heard from the page's own process. A thread stays: it closes by its
        // Close or Esc alone. The design graph's open layers close on it, a
        // press on its stage being outside them.
        cancelComposer();
        if (link) {
          link.presses += 1;
        }
        break;
      case "cawco:pin-at": {
        if (openPin && previewPinId(message.id) === openPin) {
          pinAt = previewPinAt(message);
          pinHeard = openPin;
        }
        break;
      }
      case "cawco:key": {
        const name = previewKey(message.key);
        if (name) {
          // A key the page's window heard: what it starts here lands at once
          // (motion/keyed), as for this window's own keys.
          landKey();
          if (name === "Escape") {
            escapeFromPage();
          } else {
            pressKey(name);
          }
        }
        break;
      }
      case "cawco:escape":
        // The page left Comment or Draw on its own Esc: the pane follows, and keeps it.
        cancelComposer();
        setMode("interact");
        break;
      case SHORTCUT_MESSAGE: {
        // A shell combo the page left unhandled: the shell's, as from its own keys.
        const name = previewShortcut(message);
        if (name) {
          runShellShortcut(name);
        }
        break;
      }
      case "cawco:error": {
        const said = previewError(message.message);
        const of = previewErrorOf(message.of);
        if (said) {
          // A send the page made itself goes again from its own button; a
          // field's problem is the page's to show under the field.
          paneNotice.say({ message: said, again: of ? null : "reload" });
        }
        previewFrame.retrying = false;
        break;
      }
      case "cawco:resolved":
        if (paneNotice.failure && paneNotice.failure.again === null) {
          paneNotice.say(null);
        }
        break;
      case "cawco:sheet": {
        // A sheet's page said its stories and props: the inspector's controls, and the design graph's model.
        const said = previewSheet(message.sheet);
        if (said) {
          link?.heardSheet(said);
        }
        break;
      }
      case STAGE_REACHED: {
        // The stage reached the state the design graph asked for.
        const said = stageReachedOf(message);
        if (said && link) {
          link.reached = said;
        }
        break;
      }
      case STAGE_LAID: {
        // The stage laid its drawing out: the design graph's split gives it what it needs.
        const said = stageLaidOf(message);
        if (said && link) {
          link.laid = said;
        }
        break;
      }
      case STAGE_FAULT: {
        // The component threw as it mounted: the page says so in the stage.
        const said = stageFaultOf(message);
        if (said && link) {
          link.fault = said;
        }
        break;
      }
      case STAGE_DIFFERENCES: {
        // What differs from the state the design graph compares with: its lines at the stage's head.
        const said = stageDifferencesOf(message);
        if (said && link) {
          link.heardDifferences(said);
        }
        break;
      }
      case STAGE_TIME: {
        // The move's clock: the Animation face's playhead runs from it.
        const said = stageTimeOf(message);
        if (said && link) {
          link.heardTime(said);
        }
        break;
      }
      case STAGE_DIALS_WRITTEN: {
        // The agent's dials as written, read off the drawing: the Dials face stands on them.
        const said = stageDialsWrittenOf(message);
        if (said && link) {
          link.dialsWritten = said.values;
        }
        break;
      }
    }
  }
  let shown = false;
  $effect(() => {
    const open = paneSubject.preview?.state === "open";
    if (
      shown &&
      !open &&
      !sheet &&
      paneLayout.section &&
      paneSubject.artifact
    ) {
      closeToRow(paneLayout.section, paneSubject.artifact.id);
    }
    shown = open;
  });
  function closeToRow(pane: HTMLElement, id: string) {
    const row = [
      ...document.querySelectorAll<HTMLElement>(
        `[data-slot="preview-tool"][data-share="preview:${CSS.escape(instanceId)}"][data-artifact="${CSS.escape(id)}"]`
      ),
    ].at(-1);
    if (!row) {
      return;
    }
    const box = row.getBoundingClientRect();
    if (box.height === 0 || box.bottom <= 0 || box.top >= innerHeight) {
      return;
    }
    const rect = pane.getBoundingClientRect();
    const stand = document.createElement("div");
    stand.setAttribute("aria-hidden", "true");
    stand.className = "preview-close-flight";
    Object.assign(stand.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-raised)",
      boxShadow: "var(--shadow-drawer)",
      pointerEvents: "none",
      zIndex: "var(--layer-flight)",
    });
    document.body.append(stand);
    const done = () => stand.remove();
    const flight = closeInto(stand, row, dur("--dur-panel"));
    if (flight) {
      flight.finished.then(done, done);
    } else {
      done();
    }
  }
  /** Close in the artifact's own tab: back to the session that made it. */
  async function backToSession() {
    await goto(paneSubject.fleet.sessionHref(instanceId));
  }
  /** The rail's bottom sheet stands up (ThreadSheet `open`). */
  const railSheetOpen = $derived(
    listOpen &&
      paneLayout.railPlaced &&
      !paneSubject.isCanvas &&
      paneLayout.railSheet &&
      !railAway
  );
  /** The rail's bottom sheet is drawn: from its open until it has slid down (ThreadSheet `onclosed`). */
  let railSheetDrawn = $state(false);
  /** The rail's bottom sheet's surface: what covers the page while a thread stands in it. */
  let railSurface = $state<HTMLElement>();
  /**
   * A thread opened while the Comments sheet stands opens in that sheet,
   * over its list, Back leading (HIG, Sheets: "Display only one sheet at a
   * time"), never as a second sheet after the list's goes.
   */
  const threadPushed = $derived(
    listOpen &&
      paneLayout.railPlaced &&
      !paneSubject.isCanvas &&
      paneLayout.railSheet &&
      openPin !== null
  );
  /**
   * The open thread's pin is being placed again (Pin it somewhere else): a
   * sheet holding it drops to its low stop, so the page above it takes the
   * tap while the card's bar and its Cancel stay in view.
   */
  const placingThread = $derived(placing !== null && placing === openPin);
  /** The list in front holds nothing: the sheet stands low, never half its room empty (ThreadSheet `short`). */
  const railEmpty = $derived.by(() => {
    switch (listFilter) {
      case "check":
        return checkCount === 0;
      case "held":
        return !paneDoc.pins.some(pinHeld);
      case "resolved":
        return !paneDoc.pins.some((pin) => !!pin.resolvedAt);
      case "open":
        return !paneDoc.pins.some((pin) => !pin.resolvedAt);
    }
  });
  /** The Comments sheet holds a line or two, or its thread is being placed again (ThreadSheet `short`). */
  const railShort = $derived(
    (railEmpty && !threadPushed) || (threadPushed && placingThread)
  );
  /** Back, in the sheet: the list again, the thread gone at once (no card goes back into a pill). */
  function backToList() {
    closeCard();
    closingPin = null;
  }
  /** The Comments sheet goes, with a thread standing in it. */
  function closeSheet() {
    if (threadPushed) {
      backToList();
    }
    showList(false);
  }
  $effect(() => {
    if (railSheetOpen) {
      railSheetDrawn = true;
    }
  });
  const browserRow = $derived(
    paneSubject.isBrowser ? paneSubject.fleet.browser(instanceId) : null
  );
  const browserMachine = $derived.by(() => {
    const machineId =
      paneSubject.owner?.machineId ?? browserRow?.machineId ?? "";
    const known = paneSubject.fleet.machines.find(
      (one) => one.machineId === machineId
    );
    return {
      machineId,
      name: browserRow?.machineName ?? known?.hostname ?? machineId,
      online: known?.online ?? false,
    };
  });
  /** The browser's stream is drawn in the well (BrowserView): there is a page to take over. */
  let browserViewing = $state(false);
  let browserActing = $state(false);
  /** Take over from the panel, or Hand back while the person holds it; a refusal on the pane's line. */
  async function browserControl() {
    const row = browserRow;
    if (!row) {
      return;
    }
    browserActing = true;
    const holding = !!row.takeover;
    const why = holding
      ? await handBackFromPanel(row.key, row.machineId)
      : await takeOverFromPanel(row.key, {
          instanceId,
          machineId: row.machineId,
        });
    browserActing = false;
    paneNotice.say(
      why
        ? {
            message: holding
              ? browserWords.cantHandBack(why)
              : browserWords.cantTakeOver(why),
            again: null,
          }
        : null
    );
  }
  let closing = $state(false);
  async function close() {
    closing = true;
    try {
      await paneSubject.fleet.closePreview(instanceId);
    } catch (error) {
      paneNotice.say({
        message: failureWords(error),
        again: "close",
      });
    } finally {
      closing = false;
    }
  }
  /** A component artifact's view in the head (Map, Verify), one for its head button and More's submenu alike. */
  const canvasView = $derived.by(() => {
    const session = instanceId;
    // Built untracked: the view depends on the session and the kind alone,
    // never on the state it holds (nightly 4202's crash was a view's effect
    // re-running on the state it wrote).
    return paneSubject.isSheet
      ? untrack(() => new CanvasViewState(session))
      : null;
  });
  /**
   * A component artifact's design graph's line to its stage page: what the
   * page said (its sheets, its drawing, its answers), and what the graph
   * asks of it, through `post`. One per session and kind, as the view.
   */
  const link = $derived.by(() => {
    const session = instanceId;
    return paneSubject.isSheet && session
      ? untrack(() => new StageLink(previewFrame.post))
      : null;
  });
  // The inspector's controls are for the story the stage stands at.
  inspectKept(
    () => link,
    () => inspector
  );
  /** The component artifact's states files and the agent's spec, as its address carries them (core `canvasPath`). */
  const sheetCanvas = $derived(
    paneSubject.isSheet ? canvasOf(previewReach.startAt) : null
  );
  /**
   * The frame stands in the design graph's stage, under the stage's own
   * head: the head's room is the graph page's, never the frame's.
   */
  const inGraph = $derived(
    paneSubject.isSheet && !!paneSubject.artifact && !!link && !!sheetCanvas
  );
  /** The mode's glyph and word, for its one-button form. */
  const MODE_GLYPHS = {
    interact: IconInteractLinear,
    comment: IconPinLinear,
    draw: IconPenLinear,
  } as const satisfies Record<PreviewMode, unknown>;
  const MODE_WORDS: Record<PreviewMode, string> = {
    interact: "Interact",
    comment: "Comment",
    draw: "Draw",
  };
  /** The head's controls in head order, each standing by the head's priority rule while there is room (side/head.ts). */
  const headItems = $derived.by(() => {
    const all: HeadItem[] = [];
    if (paneSubject.isBrowser && browserRow) {
      const shows = browserHead(browserRow, {
        online: browserMachine.online,
        viewing: browserViewing,
        sheet: !!sheet,
      });
      if (shows.control) {
        all.push({
          key: "control",
          priority: HEAD_PRIORITY.control,
          bar: controlBar,
          menu: controlMenu,
          place: "prominent",
        });
      }
      if (shows.address) {
        all.push({
          key: "address",
          priority: HEAD_PRIORITY.address,
          bar: addressBar,
          menu: addressMenu,
          place: "lead",
        });
      }
    }
    // A decision page's one Send is its own, at its foot (its doc's
    // `ownSend`): the head stands none for it.
    if (
      paneSubject.artifact &&
      paneDoc.unsentCount > 0 &&
      !paneDoc.view?.ownSend
    ) {
      all.push({
        key: "send",
        priority: HEAD_PRIORITY.send,
        bar: sendBar,
        menu: sendMenu,
        place: "prominent",
        words: true,
      });
    }
    if (paneCanvas.canUndock) {
      all.push({
        key: "undock",
        priority: HEAD_PRIORITY.undock,
        bar: undockBar,
        menu: undockMenu,
      });
    }
    if (paneSubject.artifact && !ownTab) {
      all.push({
        key: "open",
        priority: HEAD_PRIORITY.open,
        bar: openBar,
        menu: openMenu,
      });
    }
    if (canvasView) {
      all.push({
        key: "view",
        priority: HEAD_PRIORITY.view,
        bar: viewBar,
        menu: viewMenu,
        group: true,
      });
    }
    if (inspector) {
      all.push({
        key: "inspect",
        priority: HEAD_PRIORITY.inspect,
        bar: inspectBar,
        menu: inspectMenu,
      });
    }
    if (paneSubject.isBrowser) {
      return all;
    }
    if (!paneSubject.isCanvas) {
      all.push({
        key: "mode",
        priority: HEAD_PRIORITY.mode,
        bar: modeBar,
        compact: modeCompact,
        menu: modeMenu,
        group: true,
        place: "centre",
      });
      all.push({
        key: "comments",
        priority: HEAD_PRIORITY.comments,
        bar: commentsBar,
        menu: commentsMenu,
        count: {
          glyph: IconChat,
          n: listOpen ? 0 : paneDoc.openCount,
          of: "Comments",
        },
      });
    }
    all.push({
      key: "reload",
      priority: HEAD_PRIORITY.reload,
      bar: reloadBar,
      menu: reloadMenu,
    });
    return all;
  });
</script>

<svelte:window
  onkeydown={(event) => {
    parentEscape(event);
    paneKey(event);
  }}
  onmessage={receive}
/>

<!-- A frame that loaded no page, or the proxy's page naming the hop that
     failed: Try again (a reload of the frame), and the session that serves
     it, as the kit draws a link (Button `link`, as Caw's panel offers its
     settings). -->
{#snippet frameRetry()}
  <div class="flex flex-wrap items-center gap-space-2">
    <Button
      icon={IconRefresh}
      label={commonWords.tryAgain}
      onclick={previewFrame.retry}
      pending={previewFrame.retrying}
      pendingLabel={previewWords.reloading}
      size="sm"
      variant="outline"
    />
    {#if paneSubject.offerSession && paneSubject.owner}
      {@render sessionOpen()}
    {/if}
  </div>
{/snippet}

<!-- Its session, beside Try again, or the way by hand where it can't be asked here. -->
{#snippet sessionOpen()}
  {#if paneSubject.owner}
    <Button
      href={paneSubject.fleet.sessionHref(paneSubject.owner.id)}
      pad="none"
      label={`Open ${paneSubject.ownerName}`}
      size="sm"
      variant="link"
    />
  {/if}
{/snippet}

<!-- A version whose workspace is gone fills again only as its session makes
     it again (The Empty Starts Work Rule): asked in that session's composer
     where it stands beside this pane, unsent; else its session opened. -->
{#snippet goneAsk()}
  {@const composer = paneSubject.fleet.composer?.(instanceId)}
  <EmptyAsk
    byHand={sessionOpen}
    canStart={!!composer}
    label={previewWords.goneAskLabel(composer?.agent ?? paneSubject.ownerName)}
    onask={() =>
      composer?.ask(
        previewWords.goneAskWords(paneSubject.artifact?.title ?? "")
      )}
    reason={previewWords.goneCantAsk}
    size="sm"
  />
{/snippet}

<!-- A stage that went down or never drew: Try again, and its own words
     folded under Show details, as RowFault folds a machine's. -->
{#snippet stageRetry()}
  <Button
    icon={IconRefresh}
    label={sheetWords.tryAgain}
    onclick={previewFrame.retry}
    pending={previewFrame.retrying}
    pendingLabel={sheetWords.tryingAgain}
    size="sm"
    variant="outline"
  />
{/snippet}
{#snippet stageDetailsToggle()}
  <Button
    data-details
    aria-controls={stageDetailsId}
    aria-expanded={stageDetails}
    label={stageDetails ? shellWords.hideDetails : shellWords.showDetails}
    onclick={() => {
      stageDetails = !stageDetails;
    }}
    size="sm"
    variant="ghost"
  />
{/snippet}
{#snippet stageDetailsText(said: string | null | undefined)}
  {#if said && stageDetails}
    <p
      id={stageDetailsId}
      data-slot="details"
      class="mt-space-2 text-ink-muted type-code liga-none whitespace-pre-wrap wrap-anywhere"
    >
      {said}
    </p>
  {/if}
{/snippet}

<!-- The head's controls, each as the head draws it and as More's entries
     (SideSurface `items`, by the head's priority rule): the bare symbols of
     its glass, the mode in its centre, and Send (or a browser's Take over)
     the one prominent action after the glass, on the coral. -->
{#snippet sendBar()}
  <!-- What of the page the session hasn't heard, picks and comments alike: one press sends it all. -->
  <Button
    data-slot="send"
    aria-label={`${commentWords.send}, ${paneDoc.unsentCount} unsent`}
    onclick={() => paneSend.sendAll("panel-head")}
    pending={paneSend.sending}
    shape="capsule"
    title="Send what the session hasn't heard"
  >
    <PendingContent icon={IconSend} pending={paneSend.sending} />
    <span data-slot="send-label" class="in-form-compact:hidden"
      >{commentWords.send}</span
    ><span data-slot="send-count" class="num">{paneDoc.unsentCount}</span>
  </Button>
{/snippet}
{#snippet sendMenu()}
  <DropdownMenu.Item
    disabled={paneSend.sending}
    onSelect={whileIdle(
      () => paneSend.sending,
      () => paneSend.sendAll("panel-more")
    )}
  >
    <IconSend /><span>{commentWords.sendCount(paneDoc.unsentCount)}</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet controlBar()}
  <!-- A browser's Take over, or Hand back while the person holds it (core `words/browser.ts`). -->
  {@const holding = !!browserRow?.takeover}
  <Button
    data-slot="browser-take"
    label={holding ? browserWords.handBack : browserWords.takeOver}
    onclick={browserControl}
    pending={browserActing}
    pendingLabel={holding ? browserWords.handingBack : browserWords.takingOver}
    shape="capsule"
    variant={holding ? "outline" : "default"}
  />
{/snippet}
{#snippet controlMenu()}
  {@const holding = !!browserRow?.takeover}
  <DropdownMenu.Item
    disabled={browserActing}
    onSelect={whileIdle(() => browserActing, browserControl)}
  >
    {#if holding}<IconLock />{:else}<IconGlobe />{/if}<span
      >{holding ? browserWords.handBack : browserWords.takeOver}</span
    >
  </DropdownMenu.Item>
{/snippet}

<!-- A browser's address, in the head's centre (BrowserAddress). -->
{#snippet addressBar()}
  <BrowserAddress
    mine={!!browserRow?.takeover}
    origin={browserRow?.origin ?? null}
  />
{/snippet}
{#snippet addressMenu()}
  <BrowserAddress
    as="menu"
    mine={!!browserRow?.takeover}
    origin={browserRow?.origin ?? null}
  />
{/snippet}

{#snippet undockBar()}
  <BarItem
    data-slot="other"
    aria-disabled={!paneCanvas.stage || undefined}
    icon={IconUndockLinear}
    label="Undock"
    onclick={() => {
      if (paneCanvas.stage) {
        paneCanvas.giveBack(false);
      }
    }}
  />
{/snippet}
{#snippet undockMenu()}
  <DropdownMenu.Item
    disabled={!paneCanvas.stage}
    onSelect={() => paneCanvas.giveBack(false)}
  >
    <IconUndock /><span>Undock</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet openBar()}
  {#if paneSubject.artifact}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <BarItem
      data-slot="other"
      href={`/artifact/${encodeURIComponent(paneSubject.artifact.id)}`}
      icon={IconExternalLinear}
      label="Open in new tab"
      props={{ rel: "noopener", target: "_blank" }}
    />
  {/if}
{/snippet}
{#snippet openMenu()}
  {#if paneSubject.artifact}
    {@const artifact = paneSubject.artifact}
    <DropdownMenu.Item>
      {#snippet child({ props })}
        <a
          {...props}
          class={[props.class, "mark-line"]}
          href={`/artifact/${encodeURIComponent(artifact.id)}`}
          rel="noopener"
          target="_blank"><IconExternal /><span>Open in new tab</span></a
        >
      {/snippet}
    </DropdownMenu.Item>
  {/if}
{/snippet}

{#snippet viewBar()}
  {#if canvasView}
    <!-- A component artifact's view: Map and Verify. -->
    <CanvasView
      onverify={paneNotice.verify}
      view={canvasView}
      verifying={paneNotice.verifying}
    />
  {/if}
{/snippet}
{#snippet viewMenu()}
  {#if canvasView}
    <CanvasView
      as="sub"
      onverify={paneNotice.verify}
      view={canvasView}
      verifying={paneNotice.verifying}
    />
  {/if}
{/snippet}

{#snippet roomInspector()}
  {#if inspector}
    <SheetInspector
      {inspector}
      layout="room"
      onclose={() => showInspector(false)}
    />
  {/if}
{/snippet}

{#snippet inspectBar()}
  <!-- A sheet's inspector: its stories' props as controls, beside the page or over its foot. -->
  <BarItem
    aria-pressed={inspectOpen}
    icon={IconTuningLinear}
    label={artifactWords.inspect}
    onclick={() => showInspector(!inspectOpen)}
    open={inspectOpen}
    tip={artifactWords.inspectTitle}
  />
{/snippet}
{#snippet inspectMenu()}
  <!-- Its glyph as the bar's, so its words start where More's other entries' do. -->
  <DropdownMenu.CheckboxItem
    checked={inspectOpen}
    onCheckedChange={(open) => showInspector(open)}
    ><IconTuning /><span>{artifactWords.inspect}</span
    ></DropdownMenu.CheckboxItem
  >
{/snippet}

{#snippet modeBar()}
  <ModeSwitch onchange={setMode} {mode} />
{/snippet}
{#snippet modeMenu()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>Mode</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(next) => setMode(previewMode(next) ?? "interact")}
      value={mode}
    >
      <DropdownMenu.RadioItem value="interact"
        ><IconInteract /><span>Interact</span><DropdownMenu.Shortcut
          >V</DropdownMenu.Shortcut
        ></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="comment"
        ><IconPin /><span>Comment</span><DropdownMenu.Shortcut
          >C</DropdownMenu.Shortcut
        ></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="draw"
        ><IconPen /><span>Draw</span><DropdownMenu.Shortcut
          >D</DropdownMenu.Shortcut
        ></DropdownMenu.RadioItem
      >
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
{/snippet}

<!-- The mode as one button where the head has no room for its three
     segments: the chosen mode's glyph, opening the three. -->
{#snippet modeCompact()}
  <ModeButton
    glyph={MODE_GLYPHS[mode]}
    keys="V, C, D"
    menu={modeMenu}
    word={MODE_WORDS[mode]}
  />
{/snippet}

<!-- The comment being written: in its float by its target, or, a whole-page
     comment asked from the rail beside the page, hung from the rail's glass
     (CommentRail `pageComposer`). -->
{#snippet composerBody()}
  {#if composing && kit && nextDraft}
    {@const Composer = kit.CommentComposer}
    <Composer
      action="Comment"
      chain={composing.chain.map((one) =>
        pinName({
          anchor: one.anchor,
          elements: one.elements,
        } as unknown as Pin)
      )}
      chosen={composing.chosen}
      draft={nextDraft}
      focus
      onchange={() => drafts?.changed(NEXT_COMMENT)}
      onchoose={(index) =>
        previewFrame.post({ type: "cawco:compose-target", index })}
      onhold={(text) => comment(text, true)}
      onsubmit={(text) => comment(text)}
      placeholder={commentWords.composeHint}
      sendError={composing.error}
      sending={composing.sending}
    />
  {/if}
{/snippet}

{#snippet commentsBar()}
  <CommentsButton
    count={paneDoc.openCount}
    down={paneDoc.linkDown ? NOT_REACHING : null}
    label={commentsTitle}
    onclick={() => showList(!listOpen)}
    open={paneLayout.railSheet ? railSheetOpen : listOpen}
    held={paneDoc.heldCount}
    {pinsShown}
    toCheck={checkCount}
  />
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item onSelect={() => showList(!listOpen)}>
    <IconChat /><span>Comments</span>{#if paneDoc.openCount > 0}<span
        class="ms-auto text-ink-muted num"
        data-slot="count">{paneDoc.openCount}</span
      >{/if}
  </DropdownMenu.Item>
{/snippet}

{#snippet reloadBar()}
  <BarItem
    data-slot="other"
    icon={IconRefreshLinear}
    label="Reload"
    onclick={previewFrame.reloadPage}
  />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item onSelect={previewFrame.reloadPage}>
    <IconRefresh /><span>Reload</span>
  </DropdownMenu.Item>
{/snippet}

<!-- The card beside the conversation (SideSurface): the switch, the
     page's name and place (never "Preview" again under the switch that says
     it), the preview's own controls, Close; the page in the well. -->
{#snippet artifactTitle()}
  {#if paneSubject.artifact}
    <ArtifactMenu
      {instanceId}
      held={paneSubject.preview?.artifacts}
      line={paneDoc.headLine}
      lineId={`${paneId}-line`}
      onrefused={(reason, chosen) => {
        refusals.set(paneNotice.actKey, {
          reason,
          asked: {
            act: "show",
            id: chosen.id,
            title: chosen.title,
          } satisfies PaneAct,
        });
      }}
      shown={paneSubject.artifact}
    />
  {/if}
{/snippet}

<!-- A To check row's change lines: what changed under its comment, and Ask again when the agent didn't answer it. -->
{#snippet checkChanges(pin: Pin)}
  <ChangeLines
    asking={askingAgain.has(pin.id)}
    inset="rail"
    lines={(checking.byPin.get(pin.id) ?? []).map(lineOf)}
    onask={() => askAgainPin(pin.id)}
    unanswered={!(checking.byPin.get(pin.id) ?? []).some(
      (item) => item.answered
    )}
  />
{/snippet}
<!-- The last To check row: what changed under no comment, each line a step to its spot. -->
{#snippet checkUnasked()}
  <div class="flex flex-col gap-space-1 px-space-2 py-space-2">
    <p class="m-0 text-ink-row type-label font-medium">
      {commentWords.unasked}
    </p>
    <ChangeLines lines={checking.unasked.map(lineOf)} step={stepToChange} />
  </div>
{/snippet}
<!-- A thread's change lines, under its replies: every one the hub kept for it. -->
{#snippet threadChanges(pin: Pin)}
  <ChangeLines
    asking={askingAgain.has(pin.id)}
    lines={(paneDoc.view?.activity[pin.id] ?? []).map(lineOfActivity)}
    onask={() => askAgainPin(pin.id)}
    step={stepToChange}
    unanswered={changedNoAnswer(pin)}
  />
{/snippet}

{#snippet railOf(layout: "beside" | "sheet")}
  <CommentRail
    bind:this={rail}
    down={paneDoc.linkDown}
    held={paneDoc.heldCount}
    onsendheld={paneDoc.sendHeldNow}
    onsendrefusedclosed={() => {
      if (paneSubject.artifactId) {
        paneDoc.keepSendRefused(paneSubject.artifactId, null);
      }
    }}
    sendRefused={paneDoc.sendRefused}
    focused={focusedPin}
    hold={paneDoc.listHold}
    {layout}
    {live}
    onclose={() => showList(false)}
    onhover={(id) => previewFrame.post({ type: "cawco:hover-pin", id })}
    onopen={(id, via) =>
      listFilter === "check" ? openChecked(id, via) : openCard(id, via)}
    checks={paneSubject.isCanvas
      ? undefined
      : {
          count: checkCount,
          pins: checking.pins,
          changes: checkChanges,
          unasked: checking.unasked.length > 0 ? checkUnasked : null,
        }}
    onpage={() => {
      if (openPin) {
        closeCard();
      }
      composingPage = true;
      previewFrame.post({ type: "cawco:compose-page" });
    }}
    onpageclose={cancelComposer}
    pageComposer={composerBody}
    pageOpen={pageHung}
    onresolve={(id, resolved) => resolvePin(resolved, id)}
    onretry={paneDoc.relink}
    onretrypin={paneSend.retryPin}
    onshown={(ids) => {
      railOrder = ids;
    }}
    open={openPin}
    whyNotSent={paneSend.notSentWhy}
    pins={paneDoc.pins}
    retrying={paneSend.pinsRetrying}
    {unread}
    bind:filter={listFilter}
    bind:scroll={listScroll}
    bind:sort={railSort}
  />
{/snippet}

<!-- The Comments rail beside the page as a floating glass panel, outside
     the page's mode seam (the artifact panel's surface brief, The Comments
     rail; the owner's pick "Beside the page"). -->
{#snippet railBeside()}
  {#if listOpen && paneLayout.railPlaced && !paneSubject.isCanvas && !paneLayout.railSheet}
    <RailFloat>
      {@render railOf("beside")}
    </RailFloat>
  {/if}
{/snippet}

{#if inset}
  <!-- Inset: no head and no modes; the page as the panel draws it. -->
  <section
    data-slot="preview-pane"
    data-preview-inset
    aria-label={paneSubject.artifact?.title ?? "Preview"}
    class="@container flex flex-col flex-1 min-h-0"
    bind:this={paneLayout.section}
  >
    <div
      class="relative flex flex-col flex-1 min-h-0 overflow-hidden border border-border-well rounded-sm bg-surface-well"
      bind:this={paneLayout.well}
    >
      {@render framed()}
    </div>
  </section>
{:else}
  <SideSurface
    of="preview"
    mode={paneSubject.isCanvas || paneSubject.isBrowser ? undefined : mode}
    closeFailed={paneNotice.failure?.again === "close"}
    {closing}
    items={headItems}
    label="Preview"
    onclose={ownTab ? backToSession : close}
    placement={sheet ? "sheet" : "beside"}
    subtitle={paneDoc.headLine}
    subtitleId={`${paneId}-line`}
    {switcher}
    {switcherAt}
    titleControl={paneSubject.artifact ? artifactTitle : undefined}
    beside={railBeside}
    bind:section={paneLayout.section}
    bind:well={paneLayout.well}
  >
    {@render framed()}
  </SideSurface>
{/if}

<!-- Changed since you looked: a glass over the page at the well's foot (ChangesTag). -->
{#snippet changesBar()}
  {#if changeStops.length > 0 && !paneSubject.isCanvas}
    <ChangesTag
      above={pageFoot}
      at={tour ? tourAt : null}
      onstep={stepChange}
      total={tour?.length ?? changeStops.length}
      bind:ref={changesTag}
    />
  {/if}
{/snippet}

<!-- The page's frame (and, while a new one loads, the one it replaces): in
     the well, or in a component artifact's design graph's stage. -->
{#snippet frameTags()}
  {#each previewReach.reached?.origin === previewReach.paneOrigin ? previewFrame.frames : [] as key (key)}
    {@const current = key === previewFrame.frameKey}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
    <!-- biome-ignore lint/security/useIframeSandbox: the previewed app runs on its own origin (the preview proxy's), which is the boundary; a sandbox would take the forms, popups and downloads it is being tried with. -->
    <iframe
      data-ready={!current || previewFrame.loaded || undefined}
      data-panel-inspector={(!paneSubject.isSheet &&
        inspecting &&
        paneLayout.inspectorLayout === "panel") ||
        undefined}
      class="absolute inset-x-0 top-(--page-top) block h-(--page-h) w-full scheme-light scheme-dark:scheme-dark bg-system-canvas border-none border-current opacity-0 transition-[opacity] duration-(--dur-control) ease-out data-ready:opacity-100 data-panel-inspector:w-(--frame-w)"
      style:--frame-w="calc(100% - var(--c-sheet-inspector-w))"
      style:--page-top={previewFrame.headRoomTaken || inGraph
        ? "0px"
        : "var(--side-room, 0px)"}
      style:--page-h="calc(100% - var(--page-top))"
      allow="clipboard-write"
      inert={!current}
      onerror={() => previewFrame.arrived(key)}
      onload={() => {
        previewFrame.arrived(key);
        if (key === previewFrame.frameKey) {
          previewFrame.loadedFrame(key);
          previewFrame.announce();
        }
      }}
      src={`${previewReach.paneOrigin}${previewReach.framePlace}`}
      data-scheme={paneSubject.themedFrame ? theme.resolved : undefined}
      title="Preview"
      {@attach (node) => {
        if (key === previewFrame.frameKey) {
          previewFrame.iframe = node;
          previewFrame.frameSince = performance.now();
        }
      }}
    ></iframe>
  {/each}
{/snippet}

<!-- The page in the well, and what stands over it: the panel's and an
     inset's alike. -->
{#snippet framed()}
  {#if paneSubject.isCanvas}
    <!-- The canvas's stage stands over this box: its one iframe. The stage
         is a layer on the body over every page layer (CanvasStages,
         `--layer-stage`), so it can never run beneath the head's glass as a
         page in a frame does: the box starts under the head's room, and the
         head's title, controls and Close stand whatever the canvas holds. -->
    <div
      data-slot="canvas-slot"
      aria-hidden="true"
      class="absolute inset-x-0 bottom-0 top-(--slot-top) pointer-events-none"
      style:--slot-top={inset ? "0px" : "var(--side-room, 0px)"}
      bind:this={paneCanvas.canvasSlot}
    ></div>
  {:else if paneSubject.isBrowser && paneSubject.artifact}
    <BrowserView
      addressAtFoot={!!sheet}
      artifactId={paneSubject.artifact.id}
      browser={browserRow}
      {instanceId}
      machine={browserMachine}
      bind:viewing={browserViewing}
    />
  {:else if previewReach.unopened}
    <!-- The hub opened no origin for it (every preview port in use): its
         words, and Try again asks it again. -->
    <div
      data-slot="down"
      data-unopened
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={previewWords.notOpenedTitle}>
        {#snippet line()}
          {previewReach.unopened}
        {/snippet}
        {#snippet action()}
          <Button
            icon={IconRefresh}
            label={commonWords.tryAgain}
            onclick={() => {
              previewReach.addressTries += 1;
            }}
            pending={previewReach.addressAsking}
            pendingLabel="Trying again…"
            size="sm"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else if previewReach.unreached}
    <!-- This tab can't reach the preview's own origin: what failed, by its
         own cause, its fix, and where to switch how previews are reached. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={previewWords.cantBeReached}>
        {#snippet line()}
          {previewReach.unreachedBy?.said}
          {previewWords.tryingAgain}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              icon={IconRefresh}
              label={commonWords.tryAgain}
              onclick={() => {
                previewReach.probe += 1;
              }}
              pending={previewReach.probing}
              pendingLabel="Trying again…"
              size="sm"
              variant="outline"
            />
            <Button
              href="/config/previews"
              pad="none"
              label="Preview settings"
              size="sm"
              variant="link"
            />
          </div>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <!-- The frame loads once its origin answered the probe; the cover stands
         meanwhile. A component artifact's frame stands in its design graph's
         stage (the graph's chrome round it, the panel's DOM), the inspector's
         panel beside the graph. -->
    {#if inGraph && paneSubject.artifact && link && sheetCanvas}
      <div
        data-slot="graph-host"
        data-panel-inspector={(inspecting &&
          paneLayout.inspectorLayout === "panel" &&
          !inspectorInRoom) ||
          undefined}
        class="absolute inset-0 data-panel-inspector:w-(--frame-w)"
        style:--frame-w="calc(100% - var(--c-sheet-inspector-w))"
      >
        <!-- The graph runs to the card's top under the floating head and
             takes its room on its own page (DesignGraph). -->
        <DesignGraph
          ask={paneSubject.artifact.ask ?? ""}
          files={sheetCanvas.files}
          frame={frameTags}
          inspector={inspectorInRoom ? roomInspector : undefined}
          {link}
          {keptDials}
          memory={`cawco-graph-kept:${paneSubject.artifact.id}`}
          {keptTuned}
          {startFace}
          ondials={(values) => {
            // His dial values are the artifact's: its doc's `dials`, which
            // the panel's Send counts and artifact_read answers.
            const refused = paneDoc.doc?.keep("dials", values);
            if (refused) {
              paneNotice.say({ message: refused, again: null });
            }
          }}
          ontuned={(records) => {
            // His tuning of every move is the artifact's: its doc's `tuned` map, which artifact_read answers.
            const refused = paneDoc.doc?.keepTuned(records);
            if (refused) {
              paneNotice.say({ message: refused, again: null });
            }
          }}
          onroom={() => showInspector(false)}
          paneSheet={inspecting && paneLayout.inspectorLayout === "sheet"}
          spec={sheetCanvas.spec}
          stale={paneDoc.linkDown !== null}
        />
      </div>
    {:else}
      {@render frameTags()}
    {/if}
    <div
      data-ready={((previewFrame.loaded || previewFrame.standing !== null) &&
        !stageWaiting) ||
        undefined}
      data-slot="cover"
      aria-hidden={stageWaiting ? undefined : "true"}
      class="group/cover absolute inset-x-0 top-(--side-room,0px) bottom-0 p-space-5 bg-surface-recess pointer-events-none transition-[opacity] duration-(--dur-control) ease-out data-ready:opacity-0"
      role={stageWaiting ? "status" : undefined}
      {@attach (node) => {
        // Ready, the cover and its skeleton go in the skeleton's reveal and
        // the frame comes out of its blur on the same clock (motion/curves).
        if (!(
          (previewFrame.loaded || previewFrame.standing !== null) &&
          !stageWaiting
        )) {
          coverStood = true;
        } else if (coverStood) {
          coverStood = false;
          revealOn(node, "out");
          if (previewFrame.iframe) {
            revealOn(previewFrame.iframe, "in");
          }
        }
      }}
    >
      <!-- Unseen until the wait has lasted --dur-wait-grace, then fading up
           (The Real Wait Rule); held still, pulse and all, once the cover is
           ready and fading out. The wrapper carries the wait, so the
           skeleton's own opacity is its pulse's. -->
      <div
        class="animate-wait-grace-in group-data-ready/cover:animation-paused"
      >
        <Skeleton
          class="w-2/5"
          data-slot="block"
          hold="cover"
          line="body"
          radius="text"
        />
      </div>
      {#if stageWaiting}
        <CoverState waiting={stageWaiting} />
      {/if}
    </div>
    {#if canvasView?.map && paneSubject.artifact && paneSubject.isSheet}
      <!-- Map mode: the canvas's component among what renders it and what it renders, over the page, which stays loaded under it. -->
      <CanvasMap
        address={previewReach.paneOrigin
          ? `${previewReach.paneOrigin}${previewReach.startAt}`
          : null}
        artifactId={paneSubject.artifact.id}
        component={link?.front
          ? (link.sheets[link.front]?.meta.component ?? null)
          : null}
        {instanceId}
        ready={previewFrame.loaded}
        revision={paneSubject.preview?.revision ?? ""}
      />
    {/if}
    {#if compileErrors.length > 0}
      {@const first = compileErrors[0]}
      <!-- The last good render stays under it, dimmed; the session is told of it on its own. -->
      <div
        aria-hidden="true"
        class="absolute inset-0 bg-scrim pointer-events-none"
        transition:appear
      ></div>
      <div
        data-slot="sheet-error"
        class="absolute inset-x-space-3 bottom-space-3 grid gap-space-2 max-h-3/5 overflow-auto p-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-tile"
        role="alert"
        transition:appear
      >
        <p class="m-0 text-data-bad text-size-body font-medium">
          {errorTitle(first.kind)}
          <code class="type-code">{errorPlace(first)}</code>
        </p>
        <p class="m-0 text-ink-muted type-meta">
          {first.message.split("\n")[0]}
        </p>
        {#if first.frame}
          <pre
            class="m-0 overflow-x-auto p-space-2 rounded-sm bg-surface-recess text-ink-strong type-code">{first.frame}</pre>
        {/if}
        <p class="m-0 text-ink-muted type-meta">
          {first.kind === "missing"
            ? sheetWords.missingNext(compileErrors.length - 1)
            : sheetWords.errorNext(compileErrors.length - 1)}
        </p>
      </div>
    {/if}
  {/if}
  {#if staged?.status === "error"}
    <!-- The stage or the server didn't start, or failed its restarts: where the page would be. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState
        icon={IconAlert}
        title={paneSubject.served
          ? sheetWords.serverDownTitle(paneSubject.served.port)
          : sheetWords.downTitle(staged.dir)}
      >
        {#snippet line()}
          {staged.runs === "sheet"
            ? sheetWords.downLine(sheetWords.toolchains[staged.toolchain])
            : sheetWords.serverDownLine}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            {@render stageRetry()}
            {#if staged.message}
              <!-- The stage's own words, as RowFault folds a machine's: under Show details. -->
              {@render stageDetailsToggle()}
            {/if}
          </div>
          {@render stageDetailsText(staged.message)}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if neverDrawn && staged?.status !== "error"}
    <!-- On its way past the time its stage is given: never an endless cover. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      data-never-drawn
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={sheetWords.neverDrawnTitle}>
        {#snippet line()}
          {sheetWords.neverDrawnLine(
            Math.round((waitingFor ?? STAGE_READY_MS) / 1000)
          )}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            {@render stageRetry()}
            <Button
              icon={IconTrash}
              label={sheetWords.remove}
              onclick={removeShown}
              size="sm"
              variant="ghost"
            />
            {#if stageSaid}
              <!-- The stage's own last words, folded as the down stage's are. -->
              {@render stageDetailsToggle()}
            {/if}
          </div>
          {@render stageDetailsText(stageSaid)}
          <AskHere asker={removeAsks} at="never-drawn-remove" />
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if shownDown && staged?.status !== "error" && !neverDrawn}
    <!-- What happened, why and the way back, where the page would be; a stage in error says it above. -->
    <div
      data-slot="down"
      data-down={shownDown}
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <!-- A version whose workspace is gone is no fault that may pass: it is archived, and says so. -->
      <EmptyState
        icon={shownDown === "gone" ? IconArchive : IconAlert}
        title={downTitle}
        action={shownDown === "gone" ? goneAsk : frameRetry}
      >
        {#snippet line()}
          {#if shownDown === "gone"}
            {previewWords.goneLine}
          {:else if shownDown === "workspace"}
            Its server can't be reached until the workspace runs again. Once a
            session there is back, try again.
          {:else if shownDown === "server"}
            {paneSubject.downPort
              ? `${previewWords.nothingOnPort(paneSubject.downPort)} on ${paneSubject.ownerMachine}, so the page can't load.`
              : `The page's server on ${paneSubject.ownerMachine} isn't running, so the page can't load.`}
            {#if paneSubject.served}
              CawCo starts it again by itself; try again in a moment.
            {:else if paneSubject.offerSession}
              {previewWords.startFromSession}
            {:else}
              Start it again, then try again.
            {/if}
          {:else if shownDown === "reach"}
            The way to the page's server on {paneSubject.ownerMachine} didn't open{shownWhy
              ? `: ${shownWhy}`
              : "."}
            Try again; if it fails again, start the server again from its session.
          {:else if shownDown === "closed"}
            Its session shows something else now, or has ended, so there is no
            page here. Open its session to show it again.
          {:else if shownDown === "error"}
            {previewWords.errorLine(shownWhy ?? "with an error")}
          {:else if shownDown === "crashed"}
            {previewWords.crashedLine(shownWhy ?? "no message")}
          {:else}
            The preview comes from {paneSubject.ownerMachine}, which isn't
            answering the hub{shownWhy ? `: ${shownWhy}` : "."} Once it answers, try
            again.
          {/if}
          {#if !previewFrame.down && docDown}
            <span
              class="block mt-space-2 text-ink-muted type-meta"
              data-slot="unreached"
              >{sheetWords.unreachedSince(
                formatTimestamp(new Date(docDown.since)),
                docDown.why
              )}</span
            >
          {/if}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if previewFrame.notLoaded && !shownDown && staged?.status !== "error" && !neverDrawn}
    <!-- The browser's own error page stands in the frame: said in words, with the way back. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      data-not-loaded
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={previewWords.notLoadedTitle}>
        {#snippet line()}
          {previewWords.notLoadedLine(paneSubject.ownerMachine)}
        {/snippet}
        {#snippet action()}
          {@render frameRetry()}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if inspector && inspecting && !previewReach.unreached && !inspectorInRoom}
    <SheetInspector
      {inspector}
      layout={paneLayout.inspectorLayout}
      onclose={() => showInspector(false)}
    />
  {/if}
  {#if previewFrame.picking}
    <PlacePick
      oncancel={previewFrame.cancelPick}
      onpick={previewFrame.pickedPlace}
    />
  {/if}
  <!-- A pin's thread as its card holds it: the drawn pin's whole, or the
       rested-on pin's as its peek (`peek`), the same card; `pushed`, opened
       in the Comments sheet over its list, Back leading. -->
  {#snippet thread(
    pin: Pin,
    draft: ComposerDraft,
    peek: boolean,
    pushed = false,
    sheet = false
  )}
    {#if kit}
      {@const Card = kit.PinCard}
      <Card
        agentName={paneSubject.owner ? paneSubject.ownerName : "The session"}
        changes={(paneDoc.view?.activity[pin.id]?.length ?? 0) > 0
          ? threadChanges
          : undefined}
        marked={peek || !!pinAt?.mark}
        session={paneSubject.owner ? instanceId : null}
        {draft}
        link={pinLink(pin.number)}
        live={live.has(pin.id)}
        name={pin.movedAt ? commentWords.elementGone : pinName(pin)}
        back={pushed
          ? { to: commentWords.comments, onback: backToList }
          : undefined}
        onclose={pushed ? closeSheet : () => closeCard()}
        sheet={pushed || sheet}
        ondelete={deleteOpenPin}
        ondraft={() => drafts?.changed(pin.id)}
        onfind={() => focusPin(pin.id, true)}
        onplace={placeElsewhere}
        onhold={(text) => reply(text, true)}
        onreply={(text) => reply(text)}
        onresolve={(resolved) => resolvePin(resolved)}
        onretry={() => paneSend.retryPin(pin.id)}
        parent={!peek && cardParent?.id === pin.id ? cardParent.name : null}
        {peek}
        {pin}
        placing={placing === pin.id}
        problem={peek ? null : cardError}
        sending={!peek && replying}
        retrying={paneSend.pinsRetrying.has(pin.id)}
        whyNotSent={paneSend.notSentWhy(pin)}
      />
    {/if}
  {/snippet}
  {#if railSheetDrawn}
    <!-- The rail as the well's bottom sheet, on a phone and in a pane under
         640px: the kit's drawer (ThreadSheet's host), its grabber and two
         stops, half its room where it opens and the whole room (HIG, Sheets:
         "Include a grabber in a resizable sheet"; the medium and large
         detents), dragged below the lower one it goes, as Close does. A
         layer over the page: the frame keeps its whole box under it, so the
         page neither moves, resizes nor scrolls as it opens, drags or
         closes. A thread opened while it stands opens in it, over the list,
         Back leading (HIG, Sheets: "Display only one sheet at a time"); it
         stands aside while a composer or a place picker stands, and comes
         back as it was. In the phone's preview sheet (`sheet`) its room is
         the panel's card under its head, itself a share of the screen, and
         half of it held the bar and the lists' tabs alone: there it opens
         at its whole room, the comments under its bar, and a drag takes it
         to half. -->
    <ThreadSheet
      label={threadPushed && cardPin
        ? `Comment ${cardPin.number}`
        : commentWords.comments}
      onclose={closeSheet}
      onclosed={() => {
        if (!railSheetOpen) {
          railSheetDrawn = false;
        }
      }}
      onmoved={() => sayCovered?.()}
      open={railSheetOpen}
      short={railShort}
      tall={sheet && !railShort}
      bind:surface={railSurface}
    >
      {#if threadPushed && cardPin && kit && replyDraft}
        {#key cardPin.id}
          {@render thread(cardPin, replyDraft, false, true, true)}
        {/key}
      {:else}
        {@render railOf("sheet")}
      {/if}
    </ThreadSheet>
  {/if}
  <!-- What stands over the page beside a pill, in the frame's box:
       the composer while a comment is written, the thread once it is, and
       the peek while the pointer rests on one. -->
  <!-- The size container a card's width reads (`--c-pin-card-reading-w`, two fifths of the well).
       It stands where the frame stands (a component artifact's stage, a page under the head's room), so a place the page says is a place on it. -->
  <div
    data-slot="pin-room"
    class={[
      "@container absolute pointer-events-none",
      previewFrame.frameBox
        ? "start-(--frame-x) top-(--frame-y) w-(--frame-w) h-(--frame-h)"
        : "inset-0",
    ]}
    style:--frame-x={previewFrame.frameBox
      ? `${previewFrame.frameBox.x}px`
      : undefined}
    style:--frame-y={previewFrame.frameBox
      ? `${previewFrame.frameBox.y}px`
      : undefined}
    style:--frame-w={previewFrame.frameBox
      ? `${previewFrame.frameBox.w}px`
      : undefined}
    style:--frame-h={previewFrame.frameBox
      ? `${previewFrame.frameBox.h}px`
      : undefined}
    data-mode={mode !== "interact" && !paneSubject.isCanvas ? mode : undefined}
    {@attach measureRoom}
  >
    {#if composing && kit && nextDraft && !pageHung}
      <PinFloat
        bare
        box={composing.at?.box ?? null}
        label={commentWords.comment}
        mark={composing.at?.mark ?? null}
        room={{ w: roomW, h: roomH }}
        sheet={paneLayout.floatSheet}
        slot="pin-composer"
        bind:float={composerFloat}
      >
        {@render composerBody()}
      </PinFloat>
    {/if}
    <!-- The drawn pin's card (`drawnPin`); each pin's card is its own, so
         another's never moves to it. -->
    {#if cardPin && kit && replyDraft && !threadPushed}
      {#key cardPin.id}
        {#if paneLayout.floatSheet}
          <!-- On a phone and under a finger, the thread is the well's
               bottom sheet, dragged between its stops (ThreadSheet): it
               opens at half its room, the page lifted so the pin's pill
               and its element stand above it (what the comment is about
               in view), and goes to the whole room on a drag. -->
          <ThreadSheet
            label={`Comment ${cardPin.number}`}
            onclose={() => closeCard()}
            onclosed={() => {
              if (!openPin) {
                closingPin = null;
              }
            }}
            onmoved={() => sayCovered?.()}
            open={openPin !== null}
            short={placingThread}
            bind:surface={cardFloat}
          >
            {@render thread(cardPin, replyDraft, false, false, true)}
          </ThreadSheet>
        {:else}
          <PinFloat
            box={pinAt?.box ?? null}
            label={`Comment ${cardPin.number}`}
            mark={pinAt?.mark ?? null}
            onclosed={() => {
              if (!openPin) {
                closingPin = null;
              }
            }}
            open={openPin !== null}
            pin={cardPin.number}
            room={{ w: roomW, h: roomH }}
            slot="pin-card"
            bind:float={cardFloat}
          >
            {@render thread(cardPin, replyDraft, false)}
          </PinFloat>
        {/if}
      {/key}
    {/if}
    <!-- The rested-on pin's peek: the same card beside its pill, his words
         and the latest reply alone; a press on it opens the whole thread. -->
    {#if peekPin && peekAt && drafts}
      {#key peekPin.id}
        <PinFloat
          label={`Comment ${peekPin.number}`}
          mark={peekAt.mark}
          onpress={() => {
            const id = peekPin?.id;
            if (id) {
              openCard(id);
            }
          }}
          onrest={restOnPeek}
          pin={peekPin.number}
          room={{ w: roomW, h: roomH }}
          slot="pin-peek"
        >
          {@render thread(peekPin, drafts.draft(peekPin.id), true)}
        </PinFloat>
      {/key}
    {/if}
  </div>
  {#if paneNotice.failure || paneNotice.paneRefused}
    <!-- The pane's own line: a frame's failure, or an act of the pane's the
         hub refused, kept through a reload. -->
    <div
      data-slot="failure"
      data-pane-failure
      class="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-space-3 gap-y-space-2 px-space-3 py-space-2 bg-surface-raised border-t border-border-hairline"
      role="alert"
      transition:appear
    >
      <p
        class="flex-1 basis-c-draft-line min-w-0 m-0 text-data-bad text-size-body font-normal text-pretty wrap-anywhere"
      >
        {paneNotice.failure
          ? paneNotice.failure.message
          : paneNotice.paneRefused?.reason}
      </p>
      {#if paneNotice.failure?.again === "reload"}
        <Button
          label={commonWords.tryAgain}
          onclick={previewFrame.retry}
          pending={previewFrame.retrying}
          pendingLabel="Reloading…"
          size="sm"
          variant="outline"
        />
      {:else if paneNotice.failure?.again === "close"}
        <Button
          label={commonWords.tryAgain}
          onclick={close}
          pending={closing}
          pendingLabel="Closing…"
          size="sm"
          variant="outline"
        />
      {:else if !paneNotice.failure && paneNotice.paneRefused}
        <Button
          data-again
          label={commonWords.tryAgain}
          onclick={paneNotice.rerun}
          pending={paneNotice.rerunning}
          pendingLabel="Trying again…"
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
  {/if}
  {@render changesBar()}
{/snippet}
