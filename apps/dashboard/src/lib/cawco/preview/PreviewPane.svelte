<script lang="ts">
  import type { TakeoverLayout } from "@cawco/core/browser";
  import {
    type ActivityLine,
    type ChangedItem,
    keepAside,
    newAnswer,
    type Pin,
    type PreviewMode,
    pinHeld,
    pinProblem,
    pinUnsent,
    previewMode,
    type RefusedReplies,
    type RefusedWrites,
    type ThreadEntry,
    withKeptReplies,
    writeAgain,
  } from "@cawco/core/comments";
  import { detach } from "@cawco/core/detach";
  import {
    PAGE_TOUCHED_MESSAGE,
    PREVIEW_LOCKED_MESSAGE,
    type PreviewAddress,
    type PreviewSettings,
    previewRoute,
    projectPagePlace,
  } from "@cawco/core/frames";
  import { hubRequest } from "@cawco/core/hub-request";
  import { machineLabel } from "@cawco/core/machine-names";
  import { pinName } from "@cawco/core/pin-name";
  import {
    askHubReach,
    PAGE_SILENT_MS,
    previewsNeedWords,
    previewUnreachedWords,
    probePreview,
    unreachedOf,
  } from "@cawco/core/preview-reach";
  import {
    PREVIEW_DOWNS,
    type PreviewDown,
    type ShownFailure,
  } from "@cawco/core/protocol";
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
    STAGE_SCROLLED,
    STAGE_TIME,
    stageDialsWrittenOf,
    stageDifferencesOf,
    stageFaultOf,
    stageLaidOf,
    stageReachedOf,
    stageScrolledOf,
    stageTimeOf,
  } from "@cawco/core/stage-graph";
  import { artifactWords } from "@cawco/core/words/artifacts";
  import { browserWords } from "@cawco/core/words/browser";
  import { commentWords } from "@cawco/core/words/comments";
  import { commonWords } from "@cawco/core/words/common";
  import { previewWords } from "@cawco/core/words/preview";
  import { sheetWords } from "@cawco/core/words/sheet";
  import { shellWords } from "@cawco/core/words/shell";
  import { Portal } from "bits-ui";
  import { type Snippet, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { z } from "zod";
  import {
    failureClause,
    failureWords,
    hubFetch,
  } from "#lib/cawco/hub-read.js";
  import {
    ComposeTargetSchema,
    ThreadEntrySchema,
  } from "#lib/cawco/stored-shapes.js";
  import { track } from "#lib/cawco/track.js";
  import { BarItem, BarSegments } from "#lib/components/ui/bar-glass/index.js";
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
    IconComment,
    IconCommentLinear,
    IconExternal,
    IconExternalLinear,
    IconGlobe,
    IconInteract,
    IconInteractLinear,
    IconLock,
    IconMonitor,
    IconMonitorLinear,
    IconPen,
    IconPenLinear,
    IconPhone,
    IconPhoneLinear,
    IconRefresh,
    IconRefreshLinear,
    IconSend,
    IconTrash,
    IconUndock,
    IconUndockLinear,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { formatTimestamp } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";
  import AskHere from "../AskHere.svelte";
  import {
    artifactShown,
    keepThumbnail,
    removeArtifact,
    showArtifact,
    writeSheet,
  } from "../artifact-api";
  import {
    holdArtifact,
    noteArtifact,
    openAsked,
    releaseArtifact,
    takeOpen,
  } from "../artifact-names.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import {
    handBack,
    holdStage,
    letGo,
    type Stage,
  } from "../canvas/stage.svelte";
  import EmptyAsk from "../EmptyAsk.svelte";
  import { artifactReached } from "../files/reached";
  import { frameObserver, frameSize } from "../frame-observer";
  import DesignGraph from "../graph/DesignGraph.svelte";
  import type { GraphHead } from "../graph/graph-head";
  import { inspectKept, StageLink } from "../graph/stage-link.svelte";
  import { resolveSessionTitle } from "../links";
  import {
    type MarkdownFleet,
    markdownFleetAbove,
    provideMarkdownFleet,
  } from "../markdown-fleet";
  import { appear, dur, numberOf, revealOn } from "../motion/curves.svelte";
  import { landKey } from "../motion/keyed.svelte";
  import { settleAway } from "../motion/rest.js";
  import { closeInto } from "../motion/share.svelte";
  import { pageVisible } from "../page-visible.svelte";
  import { pressOutside } from "../press-outside";
  import { refusals } from "../refusals.svelte";
  import { heardInput } from "../reload.svelte";
  import { runShellShortcut } from "../shell-shortcut";
  import { HEAD_PRIORITY, type HeadItem } from "../side/head";
  import SideSurface from "../side/SideSurface.svelte";
  import { readJson, store, stored, unstore, writeJson } from "../storage";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";
  import { floor as visibleFloor } from "../visible-viewport.svelte";
  import { afterPaint, warm } from "../workspace/warm.svelte";
  import {
    type ArtifactDoc,
    type ArtifactView,
    artifactSyncPath,
    askAgain,
    type DocSync,
    joinArtifact,
    LINK_DOWN_MS,
    type ListHold,
    NOT_REACHING,
    retryComment,
    sendArtifact,
  } from "./artifact-doc";
  import BrowserAddress from "./BrowserAddress.svelte";
  import BrowserView from "./BrowserView.svelte";
  import { handBackFromPanel, takeOverFromPanel } from "./browser-acts";
  import { browserHead } from "./browser-head";
  import ChangeLines, { type ChangeLine } from "./ChangeLines.svelte";
  import ChangesTag from "./ChangesTag.svelte";
  import CommentRail from "./CommentRail.svelte";
  import CommentsButton from "./CommentsButton.svelte";
  import CommentsCard from "./CommentsCard.svelte";
  import CoverState, { type CoverWaiting } from "./CoverState.svelte";
  import type { CommentDrafts } from "./comment-drafts.svelte";
  import {
    commentAttachments,
    NEXT_COMMENT,
    type RailList,
    type RailSort,
  } from "./comment-rows";
  import { FrameLinks } from "./frame-links.svelte";
  import { loadedPanes } from "./loaded.svelte";
  import ModeButton from "./ModeButton.svelte";
  import ModeSwitch from "./ModeSwitch.svelte";
  import { frameHand, holdOpen } from "./open-pages";
  import PinFloat from "./PinFloat.svelte";
  import PlacePick from "./PlacePick.svelte";
  import PreviewTools from "./PreviewTools.svelte";
  import { artifactAddress } from "./page-source";
  import { paneFleet } from "./pane-fleet";
  import { enterPreviews, turnedAwayWords } from "./pass";
  import { SheetInspector } from "./sheet-inspector.svelte";
  import ThreadSheet from "./ThreadSheet.svelte";
  import {
    type ComposeTarget,
    type PageMessage,
    type PreviewPinAt,
    pageMessage,
    previewBox,
    previewCompose,
    previewError,
    previewErrorOf,
    previewKey,
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
  let iframe = $state<HTMLIFrameElement>();
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
  /**
   * The Comments list opened or shut, by its Close, by Comments or by its
   * menu item alike. A thread standing with the list (joined to its card,
   * or pushed into its sheet) goes with it: left open, it fell back beside
   * its pill, and on a phone its own sheet stood up, modal over the bar, as
   * the list's went down.
   */
  function showList(open: boolean) {
    if (!open && openPin && (threadPushed || threadHung)) {
      backToList();
    }
    listOpen = open;
    store("local", listKey, open ? "open" : "shut");
  }
  /** ⇧C: every pin on the page hidden, or shown (Figma's own key). */
  let pinsShown = $state(true);
  /** The rail, for `/`: its search field takes the keyboard. */
  let rail = $state<ReturnType<typeof CommentRail>>();
  let connected = $state(false);
  /**
   * The page in the frame takes the head's room itself (overlay
   * `cawco:head-room`): a document CawCo draws (a decision page, a canvas)
   * whose own scroller pads its top by it, so the frame runs to the card's
   * top beneath the head. Any other page stands under the room: its layout
   * is not ours to push down.
   */
  let headRoomTaken = $state(false);
  let loaded = $state(false);
  let reload = $state(0);
  /**
   * What last went wrong, and what trying again means: the frame's own
   * errors (a capture the page refused) reload the frame. A page's own send
   * the hub refused, and a field the hub's bounds refused, have no way back
   * here: the page sends again from its own button, and says a field's
   * problem under the field; the band goes once the page is heard from
   * again.
   */
  let failure = $state<{
    message: string;
    again: "reload" | null;
  } | null>(null);
  /**
   * An act of the pane's own the hub refused (a show from the artifacts'
   * menu): said on the same line, with Try again, kept through a
   * reload (refusals.svelte.ts), until a try goes.
   */
  interface PaneAct {
    act: "show";
    id: string;
    title: string;
  }
  const actKey = $derived(`pane:${instanceId}`);
  const paneRefused = $derived(refusals.get(actKey));
  /** The refused act's Try again is running. */
  let rerunning = $state(false);
  async function rerun(): Promise<void> {
    const asked = paneRefused?.asked as PaneAct | undefined;
    if (!asked) {
      return;
    }
    rerunning = true;
    try {
      try {
        await showArtifact(instanceId, asked.id);
        refusals.delete(actKey);
      } catch (error) {
        refusals.set(actKey, {
          reason: `${asked.title} was not shown: ${failureClause(error)}.`,
          asked,
        });
      }
    } finally {
      rerunning = false;
    }
  }
  let well = $state<HTMLDivElement>();
  /** The session's panel, row and machines, from whichever store this tree set (pane-fleet.ts). */
  const fleet = paneFleet();
  const preview = $derived(fleet.preview(instanceId));
  const source = $derived(preview?.source);
  /**
   * The preview's own origin, never the dashboard's, picked by where this
   * tab reached the dashboard (core `previewRoute`): host mode's name when
   * under the pattern's domain, else its port on this tab's host. The page
   * runs at its root as on its own server.
   */
  /** The frame names an origin of its own: a port, or host mode's name. */
  const namesOrigin = (address: { origin?: string; port?: number }): boolean =>
    address.port !== undefined || !!address.origin;
  /**
   * What the hub said when this pane asked where its open frame is served,
   * the frame naming no origin (the hub opened none for it as it told the
   * frame: every preview port was in use): the address it opened then, or
   * its refusal in its own words (page-source.ts `artifactAddress`), said
   * over the well with Try again, never a cover that waits for nothing.
   */
  let hubSaid = $state<
    | { id: string; address: PreviewAddress }
    | { id: string; problem: string }
    | null
  >(null);
  /** Try again's presses: each asks the hub again. */
  let addressTries = $state(0);
  let addressAsking = $state(false);
  const unnamedId = $derived(
    preview?.state === "open" &&
      preview.artifact.kind !== "browser" &&
      !namesOrigin(preview)
      ? preview.artifact.id
      : null
  );
  $effect(() => {
    const id = unnamedId;
    track(addressTries);
    if (!id) {
      hubSaid = null;
      return;
    }
    let live = true;
    addressAsking = true;
    artifactAddress(id).then((found) => {
      if (live) {
        hubSaid = { id, ...found };
        addressAsking = false;
      }
    });
    return () => {
      live = false;
    };
  });
  /** The hub's refusal for this pane's frame, while it names no origin. */
  const unopened = $derived(
    hubSaid && "problem" in hubSaid && hubSaid.id === unnamedId
      ? hubSaid.problem
      : null
  );
  // A browser is drawn here from its stream (BrowserView), never framed from an origin.
  const route = $derived.by(() => {
    if (!preview || preview.artifact.kind === "browser") {
      return null;
    }
    if (namesOrigin(preview)) {
      return previewRoute(preview, location);
    }
    return hubSaid && "address" in hubSaid && hubSaid.id === unnamedId
      ? previewRoute(hubSaid.address, location)
      : null;
  });
  const paneOrigin = $derived(route?.origin ?? "");
  /**
   * Where the reader had gone inside this show, kept per session so a reload
   * of the tab (by hand, or by itself once idle: reload.svelte.ts) opens the
   * preview there again. A new show (another revision) starts at its root.
   */
  const keepKey = $derived(`cawco-preview-at:${instanceId}`);
  function keptAt(): string | null {
    const kept = readJson(
      keepKey,
      z
        .object({
          at: z.unknown().optional(),
          revision: z.unknown().optional(),
        })
        .nullable(),
      null
    );
    return kept?.revision === preview?.revision &&
      typeof kept?.at === "string" &&
      kept.at.startsWith("/")
      ? kept.at
      : null;
  }
  /** `at` is the page's own place on its origin (the overlay's `url`). */
  function keepAt(at: URL): void {
    const place = `${at.pathname}${at.search}${at.hash}`;
    if (!(paneOrigin && preview)) {
      return;
    }
    writeJson(keepKey, { revision: preview.revision, at: place });
  }
  /**
   * Where a show starts: a page at its own place on the origin that serves
   * it (core `projectPagePlace`: its project's, else its session's), which
   * holds that page whatever the session's panel shows, so an artifact's
   * own tab never loads another; else, on a machine artifact's own origin,
   * the page the agent named (`path`), else the root.
   */
  const startAt = $derived.by(() => {
    if (preview?.project || preview?.artifact.kind === "page") {
      return projectPagePlace(preview.artifact.id);
    }
    return (source && "path" in source ? source.path : undefined) ?? "/";
  });
  /**
   * The place the frame opens, a path on the preview's origin: the start
   * page, or where the reader was in this show; read once per show, so their
   * going on inside it never reloads the frame.
   */
  const framePlace = $derived.by(() => {
    if (!(preview?.revision && paneOrigin)) {
      return startAt;
    }
    return untrack(keptAt) ?? startAt;
  });
  /**
   * Host mode's route, its names under the pattern's domain; else the
   * preview's port on this tab's host. Either route is locked to the
   * browser's pass (hub preview-access.ts), which the frame's own load
   * carries, and loads the place straight.
   */
  const byHost = $derived(!!route?.byHost);
  /** How many entries in a row the page turned away (`cawco:locked`) without once saying it was ready. */
  let refusedEntries = 0;
  /**
   * When the current frame last stood without the pass it may hold now
   * (`performance.now()`): its mount, or its page's last word that it was
   * let in. An entry that landed since stands for it (preview/pass.ts).
   */
  let frameSince = 0;

  /**
   * Whether this tab reaches the preview's origin (its `/__cawco/ping`,
   * which answers any page with no credentials, and with the hub's words,
   * still a 200, when the session's machine listener doesn't answer the hub:
   * core `PreviewPingDown`), before the frame loads. Unreached, the pane says
   * what failed by its own cause (core preview-reach.ts: offline, refused at
   * once, no answer in time, answered without its CORS header, the hub's
   * word that it is down, another answerer's status, and whether the hub
   * itself reaches the origin), the fix, and probes again by itself
   * (`PROBE_FIRST_MS`, doubling to `PROBE_MOST_MS`, and at once when its tab
   * is back in view) until one answers: never a fallback. Reached, the
   * browser enters its previews (pass.ts), so the lock never sees this tab
   * without a pass; an entry the hub won't give is unreached the same way,
   * in the hub's words. Once reached and entered, the frame loads, once.
   */
  let reached = $state<
    | { origin: string; ok: true }
    | { origin: string; ok: false; said: string; tries: number }
    | null
  >(null);
  /** Each one probes the origin again: Try again's press, the backoff's timer, the tab back in view. */
  let probe = $state(0);
  let probing = $state(false);
  /** Our calls: the first probe again 2 s after a failure, doubling to every 30 s. */
  const PROBE_FIRST_MS = 2000;
  const PROBE_MOST_MS = 30_000;
  /** Why this tab can't load a frame of `origin` yet, or null once it reached it and entered its previews. */
  async function unreachedWords(origin: string): Promise<string | null> {
    // The preview's own server down is the origin reached (core
    // `unreachedOf`): its load gets the proxy's page naming the hop
    // (`heardDown`), so the pane draws that hop's down state and tells the
    // hub (`artifactShown`).
    const failed = unreachedOf(
      await probePreview(origin, (asked) =>
        askHubReach(
          hubRequest("GET /api/preview-reach", { query: { origin: asked } })
            .path
        )
      )
    );
    if (failed) {
      return previewUnreachedWords(
        new URL(origin).host,
        failed,
        await previewsNeed(origin)
      );
    }
    const refused = await enterPreviews(origin);
    return refused && `The hub didn't give this preview a pass: ${refused}`;
  }
  $effect(() => {
    const origin = paneOrigin;
    track(probe);
    if (!origin || untrack(() => reached?.origin === origin && reached.ok)) {
      return;
    }
    let live = true;
    probing = true;
    unreachedWords(origin).then((said) => {
      if (!live) {
        return;
      }
      probing = false;
      const was = untrack(() => reached);
      reached = said
        ? {
            origin,
            ok: false,
            said,
            tries: was?.origin === origin && !was.ok ? was.tries + 1 : 1,
          }
        : { origin, ok: true };
    });
    return () => {
      live = false;
      probing = false;
    };
  });
  let seenBefore = true;
  $effect(() => {
    const failed = reached;
    const seen = pageVisible.current && onScreen;
    const back = seen && !seenBefore;
    seenBefore = seen;
    if (!(seen && failed && !failed.ok && failed.origin === paneOrigin)) {
      return;
    }
    if (back) {
      untrack(() => {
        probe += 1;
      });
      return;
    }
    const timer = setTimeout(
      () => {
        probe += 1;
      },
      Math.min(PROBE_FIRST_MS * 2 ** (failed.tries - 1), PROBE_MOST_MS)
    );
    return () => clearTimeout(timer);
  });
  const unreachedBy = $derived(
    reached && !reached.ok && reached.origin === paneOrigin ? reached : null
  );
  const unreached = $derived(!!paneOrigin && !!unreachedBy);
  /** What previews need to be reached from this tab, by the route it took (core `previewsNeedWords`); the hub's port range read once. */
  let portsRead: Promise<PreviewSettings | null> | null = null;
  async function previewsNeed(origin: string): Promise<string> {
    if (byHost) {
      return previewsNeedWords({ byHost: true, host: new URL(origin).host });
    }
    portsRead ??= hubFetch(hubRequest("GET /api/preview-settings"))
      .then((answer) =>
        answer.ok ? (answer.json() as Promise<PreviewSettings>) : null
      )
      .catch(() => null);
    const settings = await portsRead;
    return previewsNeedWords({
      byHost: false,
      hostname: location.hostname,
      ports: settings?.ports ?? null,
      hostMode: settings?.mode === "host",
    });
  }
  const artifact = $derived(preview?.artifact);
  const frameKey = $derived(`${preview?.revision}:${reload}`);
  // The old paint bridges navigation only until the replacement finishes loading.
  let standing = $state<string | null>(null);
  /*
   * Off screen, the page is held (the overlay's hold.ts: no frames, timers
   * or animations run) and kept, up to the owner's bound of panes off
   * screen (loaded.svelte.ts); past it, the one hidden longest unloads. A
   * pane that mounts off screen loads nothing until its tab is shown, and
   * then only once the switch has painted (`afterPaint`).
   */
  const paneId = $props.id();
  /** No page: mounted off screen, or let go past the bound; the cover waits for the next load. */
  let unloaded = $state(untrack(() => !onScreen));
  /** The page said it is held (`cawco:held`). */
  let pageHeld = $state(false);
  /** The hold's pass over the pane its page was let go from, while it is still away (motion/rest.ts `settleAway`). */
  let settling: (() => void) | null = null;
  function unload() {
    unloaded = true;
    standing = null;
    loaded = false;
    connected = false;
    pageHeld = false;
    // Let go off screen, the cover stands waiting again in a pane put away:
    // what that starts is finished there, as the put-away's own pass does.
    settling?.();
    settling = section ? settleAway(section) : null;
  }
  $effect(() => {
    if (isCanvas) {
      return;
    }
    const id = paneId;
    // Entered once per pane, never again as its tab comes and goes: the
    // registry reads `onScreen` as the bound is applied, not as it was here.
    untrack(() => loadedPanes.enter({ id, onScreen: () => onScreen, unload }));
    return () => loadedPanes.leave(id);
  });
  $effect(() => {
    if (isCanvas) {
      return;
    }
    if (!onScreen) {
      untrack(() => post({ type: "cawco:hold" }));
      loadedPanes.hidden(paneId);
      return;
    }
    loadedPanes.shown(paneId);
    settling?.();
    settling = null;
    untrack(() => post({ type: "cawco:release" }));
    if (untrack(() => unloaded)) {
      return afterPaint(() => {
        unloaded = false;
      });
    }
  });
  /**
   * Its conversation's tab reached for (warm.svelte.ts `reached`: the
   * pointer onto it or pressing it, the focus on it), whichever tab of its
   * group's slot holds it: read off the slot it is docked in (PaneLeaf's
   * `data-pane`).
   */
  const tabReached = $derived.by(() => {
    const docked = section
      ?.closest<HTMLElement>('[data-slot="pane"][data-pane]')
      ?.getAttribute("data-pane");
    return !!docked && warm.reached(docked);
  });
  /*
   * Off screen and reached for, the page is let go in the reach's own task,
   * well before the switch's frame: posted from the switch, its release
   * raced that frame on WebKit and lost, and the page's first frame came a
   * frame later, 112-134ms after the press (warm.svelte.ts). Its tab chosen,
   * the switch's own release is a second one, which the page keeps as a
   * no-op (the overlay's `holdPage`). The reach over with its tab still off
   * screen, it is held again.
   */
  $effect(() => {
    if (isCanvas || onScreen) {
      return;
    }
    const message = tabReached ? "cawco:release" : "cawco:hold";
    untrack(() => post({ type: message }));
  });
  const frames = $derived.by(() => {
    if (unloaded) {
      return [];
    }
    return standing === null || standing === frameKey
      ? [frameKey]
      : [standing, frameKey];
  });
  function arrived(key: string) {
    if (key !== frameKey) {
      return;
    }
    loaded = true;
    standing = key;
  }
  /**
   * The page turned the frame away (`cawco:locked`: the pass entered before
   * its first load ran out or was revoked since): the browser enters its
   * previews again and the frame loads again, once in a row. An entry the hub
   * won't give is the failure band, with Try again.
   */
  async function turnedAway() {
    const origin = paneOrigin;
    if (!origin) {
      return;
    }
    refusedEntries += 1;
    if (refusedEntries > 1) {
      failure = {
        message: turnedAwayWords(origin),
        again: "reload",
      };
      return;
    }
    const refused = await enterPreviews(origin, frameSince);
    if (refused) {
      failure = {
        message: `The hub didn't give this preview a pass: ${refused}`,
        again: "reload",
      };
      return;
    }
    reload += 1;
  }
  /**
   * Try again after a frame failure: reload the frame. Pending until the
   * reloaded page says it is ready, which clears the failure, or states a
   * new one.
   */
  let retrying = $state(false);
  function retry() {
    retrying = true;
    refusedEntries = 0;
    reload += 1;
  }
  const frameError = (message: string | null) =>
    message ? { message, again: "reload" as const } : null;

  /*
   * Nothing serves the page: the proxy answered with its own page, which
   * names the hop that did not answer (core `PreviewDown`). The pane draws
   * what happened over the well, in the kit's empty state, with Try again
   * (a reload of the frame) as its way back; it stands until a load serves
   * the page again.
   */
  let down = $state<PreviewDown | null>(null);
  /** The machine's own words for a `reach` failure, from the proxy's page. */
  let downWhy = $state<string | null>(null);
  /** The proxy's page says which hop failed (`cawco:down`): the pane cannot read a preview origin's document. */
  function heardDown(message: { down?: unknown; why?: unknown }) {
    const said = PREVIEW_DOWNS.find((kind) => kind === message.down);
    if (!said) {
      return;
    }
    down = said;
    downWhy = typeof message.why === "string" ? message.why : null;
    retrying = false;
  }
  /*
   * A down page comes back by itself: while the frame stands on the proxy's
   * down page (any hop but `closed`, which only a show reopens; `gone`,
   * whose workspace no longer is: only its session making it again brings
   * it back, as a new open; and `error` and `crashed`, whose server answers:
   * its page is what is broken, and Try again loads it once its session fixed it) in a pane
   * someone has on screen, the origin's ping is probed on the unreached
   * state's backoff (`PROBE_FIRST_MS` doubling to `PROBE_MOST_MS`), and once
   * it answers the frame loads again. Only a pane on screen asks, so a
   * machine coming back starts a listener for the previews being looked at
   * alone (the hub's register starts none). The tries count across the
   * loads, so a hop that stays down is asked ever less often; a page that
   * says it is ready starts the count again.
   */
  let downTries = 0;
  /** The hops that come back by themselves once what didn't answer does. */
  const COMES_BACK: ReadonlySet<PreviewDown> = new Set([
    "server",
    "machine",
    "workspace",
    "reach",
  ]);
  /** Each one probes the down page's origin again: a probe that failed, waiting out its backoff. */
  let downProbe = $state(0);
  $effect(() => {
    const hop = down;
    const origin = paneOrigin;
    const seen = pageVisible.current && onScreen;
    track(downProbe);
    if (!(hop && origin && seen && COMES_BACK.has(hop))) {
      return;
    }
    let live = true;
    const timer = setTimeout(
      () => {
        downTries += 1;
        probePreview(origin, (asked) =>
          askHubReach(
            hubRequest("GET /api/preview-reach", { query: { origin: asked } })
              .path
          )
        ).then((failed) => {
          if (!live) {
            return;
          }
          if (failed) {
            downProbe += 1;
            return;
          }
          reload += 1;
        });
      },
      Math.min(PROBE_FIRST_MS * 2 ** downTries, PROBE_MOST_MS)
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  });
  $effect(() => {
    if (connected) {
      downTries = 0;
    }
  });
  const owner = $derived(fleet.session(instanceId));
  const ownerMachine = $derived.by(() => {
    const machine = fleet.machines.find(
      (one) => one.machineId === owner?.machineId
    );
    return machine ? machineLabel(machine.hostname) : "its machine";
  });
  const ownerName = $derived(
    owner
      ? resolveSessionTitle({
          title: owner.title,
          cwd: owner.cwd,
          id: owner.id,
        })
      : "the session"
  );
  const downPort = $derived(source && "port" in source ? source.port : null);
  const downTitle = $derived.by(() => {
    switch (shownDown) {
      case "server":
        return "The page's server stopped answering";
      case "workspace":
        return "That workspace isn't running";
      case "reach":
        return `${ownerMachine} couldn't reach the page's server`;
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
    return previewWords.machineNotAnswering(ownerMachine);
  });
  /** Open its session, beside Try again, wherever this pane is not that session's own. */
  const offerSession = $derived(!!owner && ownTab);

  $effect(() => {
    if (frameKey) {
      connected = false;
      loaded = false;
      pageHeld = false;
      // A new load says again whether it is served.
      down = null;
      downWhy = null;
      // A pick the old page asked for has no page left to answer.
      picking = null;
    }
  });
  /**
   * The origin whose page last said it is ready in the frame. While the
   * frame still holds another origin's page (the panel moving to another
   * artifact, served on its own origin), nothing is posted into it: the
   * engine refuses a post whose target origin is not the page's, and logs
   * it. The new page's ready says everything again.
   */
  let readyFrom = "";
  // While its page stands ready here, a Send the dashboard makes elsewhere
  // (the head's, a Needs you row's) carries what this page shows
  // (open-pages.ts).
  $effect(() => {
    const id = connected ? artifact?.id : undefined;
    if (!id) {
      return;
    }
    return holdOpen(
      id,
      frameHand(
        () => iframe,
        () => (readyFrom === paneOrigin ? paneOrigin : null)
      )
    );
  });
  /** To the page, on its own origin alone, once that origin's page said it is ready (`hello`, the answer to it, goes at once). */
  function post(message: object, hello = false) {
    if (paneOrigin && (hello || readyFrom === paneOrigin)) {
      iframe?.contentWindow?.postMessage(message, paneOrigin);
    }
  }
  /** The page's links, as its program names them (a page's only; none for one with no program): their faces said, and an ask to open one answered. */
  const links = new FrameLinks(
    post,
    () => instanceId,
    () => (artifact?.kind === "page" ? artifact.id : null)
  );
  /*
   * This view's word to the hub that the artifact is on screen at the open
   * frame's revision, or why it could not be: the agent's artifact_create and
   * artifact_show answer `opened` from it (Projects spec §5.10). On screen is
   * a page whose overlay said it was ready, or a canvas whose stage stands in
   * this pane and said so, in a tab the person has in view. Could not be is
   * the proxy's own page naming the hop that failed, or a load no overlay
   * answered within PAGE_SILENT_MS (core preview-reach). Said once per revision.
   */
  /** The frame that last finished loading, and whether it then said nothing. */
  let loadedKey = $state<string | null>(null);
  let silentKey = $state<string | null>(null);
  /** The frame whose page last said anything at all to the pane (its overlay, the proxy's down page, the lock's turn-away). */
  let heardKey = $state<string | null>(null);
  /**
   * The frame finished loading and its page never said a word: no overlay
   * answered in PAGE_SILENT_MS and no proxy's page named a hop, though the
   * proxy puts one or the other in every page it serves. So the browser
   * drew its own error page (a connection closed with no answer, a refused
   * one) or the answer was no page at all: said where the page would be,
   * with Try again, never Chromium's grey page left standing.
   */
  const notLoaded = $derived(
    !unloaded &&
      silentKey === frameKey &&
      heardKey !== frameKey &&
      !connected &&
      !down
  );
  let saidFor: string | null = null;
  function loadedFrame(key: string) {
    loadedKey = key;
    silentKey = null;
    setTimeout(() => {
      if (key === frameKey && loadedKey === key && !connected && !down) {
        silentKey = key;
        // A Try again that loaded nothing again is over: its state says so.
        retrying = false;
      }
    }, PAGE_SILENT_MS);
  }
  $effect(() => {
    const revision = preview?.state === "open" ? preview.revision : undefined;
    const id = artifact?.id;
    if (!(revision && id && pageVisible.current) || saidFor === revision) {
      return;
    }
    const current = loadedKey === frameKey;
    let word: { ok: true } | { ok: false; error: ShownFailure } | null = null;
    if (isCanvas) {
      word = stage?.connected && stage.at === "panel" ? { ok: true } : null;
    } else if (current && down) {
      word = { ok: false, error: down };
    } else if (current && connected) {
      word = { ok: true };
    } else if (silentKey === frameKey) {
      word = { ok: false, error: "page" };
    }
    if (!word) {
      return;
    }
    saidFor = revision;
    const sawIt = word.ok;
    artifactShown(instanceId, id, { revision, ...word }).then(
      () => {
        // On screen and heard: it reached the person, and Files lists it.
        if (sawIt) {
          artifactReached(instanceId, id);
        }
      },
      () => {
        // Unheard: the next change of state says it again.
        saidFor = null;
      }
    );
  });

  /**
   * How long the page has said ready and its frame's size has stood still
   * before its thumbnail is taken: its first paints and fonts land, and the
   * pane opening around it settles its width. Our call.
   */
  const CAPTURE_AFTER_MS = 1000;
  /*
   * The thumbnail, on demand: taken once per revision, when the transcript
   * card that shows it is on screen (ToolGroup sets `thumbnailWanted`) and
   * the page stands in view, loaded and not held. A page nobody's card shows
   * is never drawn for one; a whole-page capture costs the page 80-150 ms.
   * The page is drawn at its frame's width, so a frame still resizing (the
   * pane opening) is waited for: a capture taken mid-open drew the page at
   * 467, 422 and 479 px on three walks.
   */
  $effect(() => {
    const record = preview;
    const frame = iframe;
    if (!(
      frame &&
      record?.thumbnailWanted &&
      record.thumbnailRevision !== record.revision &&
      onScreen &&
      connected &&
      !pageHeld &&
      !ownTab
    )) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Its first report is the frame's size now: every report starts the wait again.
    const settled = frameObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(
        () => post({ type: "cawco:capture" }),
        CAPTURE_AFTER_MS
      );
    });
    settled.observe(frame);
    return () => {
      clearTimeout(timer);
      settled.disconnect();
    };
  });

  /*
   * The page keeps its own state (Projects spec §5.10): the overlay joins
   * the artifact's live document itself, on the path `cawco:hello` names.
   * The pane joins the same doc too (artifact-doc.ts): the pins' threads,
   * which the rail and the thread read and the person writes. The person's
   * comments, replies, resolves, ink and picks go to the session on their
   * Send (the hub's artifacts/service.ts `send`).
   */
  let view = $state.raw<ArtifactView | null>(null);
  /** His dial values as the artifact's doc keeps them (`dials`), by name: the design graph stands them again on open. */
  const keptDials = $derived.by(() => {
    const kept = view?.choices.dials?.value;
    return kept && typeof kept === "object" && !Array.isArray(kept)
      ? (kept as Record<string, number | string | boolean>)
      : {};
  });
  /** His tuning of every move as the artifact's doc keeps it (its `tuned` map): the design graph puts it back on each move's first read. */
  const keptTuned = $derived(view?.tuned ?? []);
  /** The design graph's room face the address names (`?face=move`, `map` or `dials`), opened on: the states when it names none. */
  const GRAPH_FACES = ["map", "move", "dials"] as const;
  const startFace =
    typeof location === "undefined"
      ? undefined
      : GRAPH_FACES.find(
          (one) => one === new URL(location.href).searchParams.get("face")
        );
  let doc: ArtifactDoc | null = null;
  /**
   * Pins the page's doc holds that the pane's doesn't yet, as the page last
   * said them (`cawco:pin-open`'s pin, a write's result): one made while the
   * page's link to the hub is down reaches the pane's doc only through the
   * hub. The card and the list read them beside the pane's own, and their
   * words, resolve and delete go through the page ({@link onlyOnPage}).
   */
  let pagePins = $state.raw<Record<string, Pin>>({});
  /**
   * The person's writes on a pin the hub refused (artifact-doc.ts
   * `refusedBy`, core `lostWrites`), by pin: each reply as written, a
   * resolve or reopen, a delete, and the hub's reason. Kept on the device
   * apart from the doc, as the page keeps its refused comments (overlay
   * artifact.ts `keepRefused`), and said on the pin where it was made, not
   * sent, with the reason and Try again ({@link retryPin}), its replies in
   * their thread where they stood. A reload keeps them.
   */
  let refusedReplies = $state.raw<RefusedReplies>({});
  const refusedKey = (id: string) => `cawco-refused-replies:${id}`;
  /** `next` as the pane keeps it, on the device too. */
  function keepReplies(id: string, next: RefusedReplies) {
    refusedReplies = next;
    if (Object.keys(next).length > 0) {
      writeJson(refusedKey(id), next);
    } else {
      unstore("local", refusedKey(id));
    }
  }
  /**
   * Send all the hub refused: the note it went with and the hub's reason,
   * said in the rail's note where it was pressed (CommentRail `sendRefused`),
   * the held comments still held and the note as written, ready to send
   * again. Kept on the device; a reload keeps it.
   */
  let sendRefused = $state.raw<{ note: string; why: string } | null>(null);
  const sendRefusedKey = (id: string) => `cawco-refused-send:${id}`;
  /** `next` as the pane keeps it, on the device too. */
  function keepSendRefused(
    id: string,
    next: { note: string; why: string } | null
  ) {
    sendRefused = next;
    if (next) {
      writeJson(sendRefusedKey(id), next);
    } else {
      unstore("local", sendRefusedKey(id));
    }
  }
  /** A refusal's writes the hub doesn't hold, each kept aside with its reason where it was made. */
  function keepRefused(id: string, why: string, lost: RefusedWrites) {
    const next = keepAside(refusedReplies, lost, why);
    keepReplies(id, next);
    if (lost.sendHeld) {
      keepSendRefused(id, { note: lost.sendHeld.note, why });
    }
  }
  /**
   * The person's writes on a pin the hub refused that the page keeps (its
   * replies, resolve or reopen and delete, written through the page, as the
   * app writes them: overlay artifact.ts `refusedReplies`), by pin, as the
   * page last said them
   * (`cawco:page-pins`). Drawn in their thread beside the pane's own, with
   * the reason and Try again, which the page writes again
   * (`cawco:resend-pin`).
   */
  let pageReplies = $state.raw<RefusedReplies>({});
  /** `said` as the page's refused replies, each part checked: what isn't one is left out. */
  function pageRepliesOf(said: unknown): RefusedReplies {
    if (!said || typeof said !== "object" || Array.isArray(said)) {
      return {};
    }
    const kept: RefusedReplies = {};
    for (const [pin, one] of Object.entries(said)) {
      const { entries, why, resolved, deleted } = (one ?? {}) as {
        deleted?: unknown;
        entries?: unknown;
        resolved?: unknown;
        why?: unknown;
      };
      if (typeof why !== "string" || !Array.isArray(entries)) {
        continue;
      }
      const valid = entries.filter(
        (entry): entry is ThreadEntry =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as ThreadEntry).id === "string" &&
          typeof (entry as ThreadEntry).text === "string" &&
          (entry as ThreadEntry).by === "person"
      );
      // Its delete, or its resolve or reopen, the hub refused, beside its replies.
      const act = {
        ...(typeof resolved === "boolean" ? { resolved } : {}),
        ...(deleted === true ? { deleted: true as const } : {}),
      };
      if (valid.length > 0 || Object.keys(act).length > 0) {
        kept[pin] = { entries: valid, why, ...act };
      }
    }
    return kept;
  }
  const pins = $derived.by(() => {
    const held = (view?.pins ?? []).map((pin) => {
      const thread = withKeptReplies(pin.thread, [
        ...(refusedReplies[pin.id]?.entries ?? []),
        ...(pageReplies[pin.id]?.entries ?? []),
      ]);
      return thread === pin.thread ? pin : { ...pin, thread };
    });
    const known = new Set(held.map((pin) => pin.id));
    const more = Object.values(pagePins).filter((pin) => !known.has(pin.id));
    return more.length > 0
      ? [...held, ...more].sort((a, b) => a.number - b.number)
      : held;
  });
  /** Whether pin `id` stands only in the page's doc yet: written through the page's own messages, as the app's are. */
  const onlyOnPage = (id: string) =>
    id in pagePins && !view?.pins.some((pin) => pin.id === id);
  /** Pin `id` as the page says it now (a valid pin), or gone from it (null). */
  function pageSays(id: string, now: unknown) {
    const { [id]: _was, ...rest } = pagePins;
    pagePins =
      now !== null && pinProblem(now) === null && (now as Pin).id === id
        ? { ...rest, [id]: now as Pin }
        : rest;
  }
  /** Words sent through the page, kept until it says they were written: a refusal puts them back in the field. */
  const pageWords = new Map<string, string>();
  /**
   * The page's answer to a write the pane sent it: the pin as the page now
   * holds it, drawn again; a refusal under the open card, a reply's words
   * back in its field.
   */
  function heardPageWrite(type: string, message: Record<string, unknown>) {
    const id = typeof message.pin === "string" ? message.pin : null;
    if (!(id && (id in pagePins || pageWords.has(id)))) {
      return;
    }
    if ("now" in message && !view?.pins.some((one) => one.id === id)) {
      pageSays(id, message.now);
    }
    const words = type === "cawco:reply-result" ? pageWords.get(id) : undefined;
    if (type === "cawco:reply-result") {
      pageWords.delete(id);
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
  /** Whether the pane holds the doc yet: until it does, no count or list reads as none. */
  let docSync = $state<DocSync>({ state: "reading" });
  /** The first sync has outlasted `--duration-wait-grace`: the list's skeleton stands in (The Real Wait Rule). */
  let readingLong = $state(false);
  $effect(() => {
    if (docSync.state !== "reading") {
      readingLong = false;
      return;
    }
    const grace = setTimeout(() => {
      readingLong = true;
    }, dur("--duration-wait-grace"));
    return () => clearTimeout(grace);
  });
  /** What the Comments list stands on: quiet inside the grace, then reading, the pins once held, or why they weren't. */
  const listHold = $derived.by<ListHold>(() => {
    switch (docSync.state) {
      case "synced":
      case "lost":
        return "ready";
      case "failed":
        return { failed: docSync.why };
      case "reading":
        break;
    }
    return readingLong ? "reading" : "quiet";
  });
  /** The page's doc's link to the hub, as the page says it (`cawco:sync`): what closed it, while it stands lost. */
  let pageLost = $state<string | null>(null);
  const pageIsLost = $derived(pageLost !== null);
  /** The page's link was lost to silence (overlay artifact.ts `Link.silent`): its silence was the grace. */
  let pageSilent = $state(false);
  /** The page's link has stood lost {@link LINK_DOWN_MS} from its first close, whatever each close said, or was lost to silence. */
  let pageDown = $state(false);
  $effect(() => {
    if (!pageIsLost) {
      pageDown = false;
      return;
    }
    if (pageSilent) {
      pageDown = true;
      return;
    }
    const said = setTimeout(() => {
      pageDown = true;
    }, LINK_DOWN_MS);
    return () => clearTimeout(said);
  });
  /**
   * The comments aren't reaching the agent: the page's link or the pane's
   * has stood lost {@link LINK_DOWN_MS} (the pane's own is graced in
   * artifact-doc.ts), or fell silent (core doc-link.ts `SILENT_MS`), so a
   * drop y-websocket reopens says nothing; what
   * closed it, word for word. What the person marks meanwhile is kept on
   * the device (artifact-doc.ts, overlay artifact.ts).
   */
  const linkDown = $derived(
    (pageDown ? pageLost : null) ??
      (docSync.state === "lost" ? docSync.why : null)
  );
  /** What closed the page's link, as the page said it (artifact.ts `closedBecause`). */
  const lostWhy = (error: unknown): string =>
    typeof error === "string" ? error : "The page's link to the hub closed.";
  /** The Comments control's title: why the comments aren't reaching the agent, else what ⇧C does. */
  const commentsTitle = $derived.by(() => {
    if (linkDown) {
      return `${NOT_REACHING}. Open them to try again.`;
    }
    return pinsShown
      ? "Comments (⇧C hides the pins)"
      : "Comments (⇧C shows the pins)";
  });
  /**
   * The page's socket opened again through the entry a frame's load takes
   * (preview/pass.ts): the lock refuses a socket whose pass ended or was
   * replaced since the page loaded (hub preview.ts `atTheLock`, a 401 the
   * browser says only as code 1006), and only a new entry gives the browser
   * a pass its next open carries, with no reload. `said`: the person asked
   * (Try again), so an entry the hub won't give is the failure band.
   */
  async function enterAgain(said: boolean) {
    const origin = paneOrigin;
    if (!origin) {
      return;
    }
    const refused = await enterPreviews(origin, performance.now());
    if (refused && said) {
      failure = {
        message: `The hub didn't give this preview a pass: ${refused}`,
        again: null,
      };
    }
    post({ type: "cawco:reconnect" });
  }
  /** Try again on the comments' links: the pane's socket opened again now, and the page's through a new entry. */
  function relink() {
    doc?.retry();
    enterAgain(true);
  }
  // The page's link stood down: its socket's own backoff goes on, carrying a
  // pass entered once in the spell, whatever ended the one it loaded with.
  $effect(() => {
    if (pageDown) {
      untrack(() => enterAgain(false));
    }
  });
  /**
   * The head's line under the name (the artifact panel's surface brief, Artifact panel): the ask the
   * session gave it, carried by the panel's frame, so it stands from the
   * first frame in every state from on its way to failed; once the person's
   * Send is in and the session has not changed the artifact or its ask since
   * (the doc's `sentAt` past its `revisedAt`), "Sent to <session>", so
   * nothing reads as asked of them.
   */
  const headLine = $derived(
    view?.sentAt && (!view.revisedAt || view.sentAt > view.revisedAt)
      ? artifactWords.sentTo(ownerName)
      : (artifact?.ask ?? "")
  );
  /*
   * A sheet's stage (live components): the project's own dev toolchain
   * (Vite, Astro or Nuxt), which the
   * daemon runs in its workspace; or a workspace preview's server, the
   * command it names (`serve`), run the same way. Its state is in the doc:
   * starting, waking (from sleep) and a sheet's page compiling stand on the
   * loading cover; a sheet's compile errors on a card over the last render,
   * dimmed; a stage that didn't start or stopped, where the page would be.
   */
  const served = $derived(
    source && "port" in source && source.serve ? source : null
  );
  const staged = $derived(
    artifact?.kind === "component" || served ? (view?.stage ?? null) : null
  );
  /**
   * The stage the cover waits on: none once this load's page answered
   * (`connected`, its overlay's `cawco:ready`), whatever the doc last said of
   * the stage. The doc's word is the agent's last frame, which can trail the
   * stage (a frame missed, a version opened over another's); a page that
   * answered is the stage serving. One that answered and then went silent is
   * the proxy's `down` and the doc's `docDown`, never a wait again.
   */
  const awaited = $derived(connected ? null : staged);
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
    staged && !connected && silentKey === frameKey && view?.unreached
      ? view.unreached
      : null
  );
  const shownDown = $derived(down ?? docDown?.down ?? null);
  const shownWhy = $derived(down ? downWhy : (docDown?.why ?? null));
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
        return served
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
    awaited?.status === "live" && !served && compileErrors.length === 0
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
    if (down) {
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
    if (budget === null || reload < 0 || artifactId === undefined) {
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
  /** The never-drawn canvas's Remove: destructive, so asked in place under it (AskHere, The Open Page Rule). */
  const removeAsks = new Asker<AskHereRequest>();
  function removeShown() {
    const shown = artifact;
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
  const isSheet = $derived(artifact?.kind === "component");
  /**
   * A page or a sheet draws in the dashboard's theme (the overlay's
   * `themed`): its frame's `color-scheme` is that theme too, so a page that
   * styles dark by `prefers-color-scheme` hears it. A preview is its own app.
   */
  const themedFrame = $derived(artifact?.kind === "page" || isSheet);
  /*
   * The props of the state on a component canvas's stage (live components
   * spec §5), from the sheet its page says (`cawco:sheet`): the design
   * graph's Dials card lists them under the agent's dials. One per sheet:
   * another sheet starts with nothing unsaved.
   */
  const inspector = $derived.by(() => {
    const id = artifactId;
    const session = instanceId;
    return id && isSheet
      ? new SheetInspector(
          post,
          (change) => writeSheet(session, id, change),
          // A state saved as new: the design graph keeps it.
          (file, story) => link?.want(file, story),
          (why) => {
            failure = { message: why, again: null };
          }
        )
      : null;
  });
  /** A phone's screen (DESIGN.md's phone line). */
  const phone = new MediaQuery("(width < 640px)");
  /** The rail is the well's foot sheet on a phone; elsewhere a card hung from the head's glass, at every pane width. */
  const railSheet = $derived(sheet || phone.current);
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
   * The head's Comments count: the rail's Open tab, every pin not resolved,
   * a moved one too, as the hub counts them. Drawn only above 0 (The Earned
   * Count Rule), only while the rail is shut (its Open tab says it while it
   * stands), and 0 until the doc is held, so a count not read yet is never
   * drawn.
   */
  const openCount = $derived(
    docSync.state === "synced"
      ? pins.filter((pin) => !pin.resolvedAt).length
      : 0
  );
  /** The comments the person holds to send together (core `pinHeld`): Send all's count. */
  const heldCount = $derived(pins.filter(pinHeld).length);
  /** Send all: every held comment and reply let go in one write with the note; the hub's next delivery carries them (core `sendHeld`). */
  const sendHeldNow = (note: string): string | null => {
    if (!doc) {
      return "The pane lost the page's document, so nothing was sent. Reload, then send again.";
    }
    const refused = doc.sendHeld(note);
    // Gone to the hub: a refusal of it comes back (`keepRefused`).
    if (refused === null && artifactId) {
      keepSendRefused(artifactId, null);
    }
    return refused;
  };
  /**
   * What Send sends (the artifact panel's surface brief, How comments reach the session): each pick
   * since the last Send. The person's comments go by themselves. Drawn only
   * above 0.
   */
  const unsentCount = $derived(
    view
      ? Object.values(view.choices).filter(
          (entry) => !view?.sentAt || entry.at > view.sentAt
        ).length
      : 0
  );
  /** The pane's own width, px: the rail's room is the pane's, not the window's. */
  let paneW = $state(0);
  $effect(() => {
    const pane = section;
    if (!pane) {
      return;
    }
    const read = () => {
      paneW = pane.clientWidth;
    };
    read();
    const watch = frameObserver(read);
    watch.observe(pane);
    return () => watch.disconnect();
  });
  /**
   * Where the rail stands is known: on a phone or in the drawer at once,
   * else once the pane's width is read. Until then neither rail is drawn,
   * so a narrow pane never draws the rail beside its page for a frame and
   * trades it for the foot sheet.
   */
  const railPlaced = $derived(sheet || phone.current || paneW > 0);
  /**
   * The Comments list stands only in a pane on screen. A session pane kept
   * mounted under another tab is hidden by its own `visibility`, but the
   * list's card and sheet are portalled to the body and escaped it: left
   * open in one session, the card floated over every other session's
   * transcript, in every browser tab, its open state kept per session (the
   * owner, 2026-11-12: "now it's stuck like this even across all tabs").
   * Its open state is kept as it was; it stands again when the pane does.
   */
  const listShown = $derived(railPlaced && onScreen);
  /**
   * What the sheet covers told again as it comes to rest (ThreadSheet
   * `onmoved`): measured as it mounts it stood below the well, covering
   * nothing, so no pin was lifted clear of it.
   */
  let sayCovered: (() => void) | null = null;
  /** A composer and a thread are the well's foot sheet: on a phone, and under a finger (comment design §3). */
  const coarse = new MediaQuery("(pointer: coarse)");
  const floatSheet = $derived(sheet || phone.current || coarse.current);
  let sending = $state(false);
  const artifactId = $derived(artifact?.id);
  $effect(() => {
    const id = artifactId;
    const session = instanceId;
    // A browser keeps nothing in a doc: no pins, no ink, no picks (§5.11, "Private").
    if (!id || isBrowser) {
      return;
    }
    docSync = { state: "reading" };
    pageLost = null;
    pageSilent = false;
    pagePins = {};
    pageReplies = {};
    pageWords.clear();
    refusedReplies = readJson(
      refusedKey(id),
      z.record(
        z.string(),
        z.object({
          entries: z.array(ThreadEntrySchema),
          why: z.string(),
          resolved: z.boolean().optional(),
          deleted: z.literal(true).optional(),
        })
      ),
      {}
    );
    sendRefused = readJson(
      sendRefusedKey(id),
      z.object({ note: z.string(), why: z.string() }).nullable(),
      null
    );
    const joined = joinArtifact(
      session,
      id,
      (next) => {
        view = next;
        // A chip naming this artifact, a pin or a card of it reads it live from here.
        holdArtifact(id, { pins: next.pins, choices: next.choices });
        // A pin the pane's doc holds now is its own from here on: the page's
        // copy goes, so a later delete or take-back there never brings it back.
        const held = new Set(next.pins.map((pin) => pin.id));
        if (Object.keys(pagePins).some((pinId) => held.has(pinId))) {
          pagePins = Object.fromEntries(
            Object.entries(pagePins).filter(([pinId]) => !held.has(pinId))
          );
        }
      },
      (sync) => {
        docSync = sync;
      },
      // The hub didn't keep a write of the pane's: said where the page's own
      // refusals are, and the person's words in it kept aside in their thread.
      (why, lost) => {
        failure = { message: why, again: null };
        keepRefused(id, why, lost);
      }
    );
    doc = joined;
    view = null;
    return () => {
      // A look waiting on its ping is written before its doc goes (the pane laid out again, closed, another artifact).
      writeLooks();
      joined.destroy();
      releaseArtifact(id);
      doc = null;
    };
  });
  // What this pane holds names itself to the chips that name it: no chip asks the hub for it.
  $effect(() => {
    const shown = artifact;
    const session = instanceId;
    if (shown) {
      // Untracked: the note reads what it writes, so two panes naming one
      // artifact for two sessions (a states file's drawings) re-ran each
      // other's effect without end.
      untrack(() =>
        noteArtifact(shown.id, {
          instanceId: session,
          kind: shown.kind,
          name: shown.name,
          title: shown.title,
        })
      );
    }
  });

  /*
   * The setup page is done once the person sends it from the page (its own
   * `cawco.send`, which stamps the doc's `sentAt`): on a phone its sheet
   * stands over the thread, where Caw answers with the files and "Open the
   * board". The `sentAt` it opened with is not a send.
   */
  /**
   * Send: the hub's send, which applies a setup page's name, shape and
   * place first and tells the session of the page's picks. A refusal is
   * said in the band over the page, and the picks stay unsent.
   */
  async function sendAll(control: "panel-head" | "panel-more") {
    if (!artifact || sending) {
      return;
    }
    sending = true;
    try {
      await sendArtifact(instanceId, artifact.id, control);
    } catch (error) {
      failure = { message: failureWords(error), again: null };
    } finally {
      sending = false;
    }
  }
  /** The comments whose Try again is on its way. */
  let pinsRetrying = $state.raw<ReadonlySet<string>>(new Set());
  /**
   * Why comment `id` hasn't reached the session, in words, when it is
   * owed for a reason: a delivery of it no one took (the hub's `notSent`),
   * or it stands only in the page's doc while the page's link has stood down
   * past its grace ({@link linkDown}): the hub can't be reached, and it goes
   * once the hub is back. Inside the grace a reopening link says nothing,
   * and no close code is ever his to read here. Said while it is unsent,
   * and on a sent one too while a resolve, reopen or delete of it the hub
   * refused is kept (core `keepAside`): that act hasn't reached the hub.
   */
  const notSentWhy = (pin: Pin): string | null => {
    const kept = refusedReplies[pin.id] ?? pageReplies[pin.id];
    if (kept && (kept.resolved !== undefined || kept.deleted)) {
      return kept.why;
    }
    if (pin.resolvedAt || !pinUnsent(pin)) {
      return null;
    }
    return (
      kept?.why ??
      pin.notSent?.why ??
      (onlyOnPage(pin.id) && linkDown ? commentWords.hubUnreached : null)
    );
  };
  /** How long a comment only the page holds is given to reach the hub, once its link is opened again, before its Try again says it didn't. Our call. */
  const REACH_HUB_MS = 10_000;
  /** Resolves once the pane's doc holds comment `id` (the page's link carried it to the hub); rejects, saying why, when it doesn't within {@link REACH_HUB_MS}. */
  const reachedHub = (id: string) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const look = setInterval(() => {
        if (view?.pins.some((pin) => pin.id === id)) {
          clearInterval(look);
          resolve();
        } else if (Date.now() - started > REACH_HUB_MS) {
          clearInterval(look);
          reject(new Error(commentWords.notReachedHub));
        }
      }, 200);
    });
  /**
   * A comment's Try again (its row's, its thread's), for one not sent. One
   * only the page holds yet has its link opened again, and goes by itself
   * once it is on the hub. One whose delivery no one took goes now. A Try
   * again no one took says why on the pin itself (the hub's `notSent`,
   * which the doc brings back) as well as in the band over the page.
   */
  async function retryPin(id: string) {
    if (!artifact || pinsRetrying.has(id)) {
      return;
    }
    pinsRetrying = new Set([...pinsRetrying, id]);
    try {
      if (refusedReplies[id] || pageReplies[id]) {
        // The page's are written into its doc again, which tells what it still keeps; the pane's into the pane's.
        if (pageReplies[id]) {
          post({ type: "cawco:resend-pin", id });
        }
        if (refusedReplies[id]) {
          retryRefused(artifact.id, id);
        }
      } else if (onlyOnPage(id)) {
        // One the hub refused is written into the page's doc again; one its link held back goes as the link opens.
        post({ type: "cawco:resend-pin", id });
        relink();
        await reachedHub(id);
      } else {
        await retryComment(instanceId, artifact.id, id);
      }
    } catch (error) {
      failure = { message: failureWords(error), again: null };
    } finally {
      pinsRetrying = new Set([...pinsRetrying].filter((one) => one !== id));
    }
  }
  /**
   * A refused write's Try again on pin `id`: its delete, or its resolve or
   * reopen, and each of its replies' words written into the pane's doc
   * again, now the hub's (artifact-doc.ts `again`), and let go of once
   * written; one still refused stays with why.
   */
  function retryRefused(artifactKey: string, id: string) {
    const kept = refusedReplies[id];
    if (!(kept && doc)) {
      throw new Error(
        "The pane lost the page's document, so it wasn't written again. Reload, then try again."
      );
    }
    const { left, why } = writeAgain(refusedReplies, id, doc);
    keepReplies(artifactKey, left);
    if (why) {
      throw new Error(why);
    }
  }
  /** A page's `cawco.pickPlace()` waiting on the person: the request it answers. */
  let picking = $state<{ id: number | string } | null>(null);
  /** The place picked goes back to the page, which keeps it in its state. */
  function pickedPlace(place: {
    label: string;
    machineId: string;
    path: string;
  }): Promise<void> {
    const asked = picking;
    picking = null;
    if (asked) {
      post({ jsonrpc: "2.0", id: asked.id, result: place });
    }
    return Promise.resolve();
  }
  function cancelPick() {
    const asked = picking;
    picking = null;
    if (asked) {
      post({ jsonrpc: "2.0", id: asked.id, result: null });
    }
  }
  /** The floating head's room over the well's top, px: its own height as laid out; none without a head. */
  function headRoomPx(): number {
    return (
      section?.querySelector<HTMLElement>('[data-slot="side-head"]')
        ?.offsetHeight ?? 0
    );
  }
  /** Tells the page which artifact it is, where its doc is synced, and the dashboard's theme. */
  function announce() {
    connected = false;
    post(
      {
        type: "cawco:hello",
        theme: theme.resolved,
        // The head names the page by its title: a page that says it too (a
        // decision page's own title) leaves it out (overlay `data-cawco-headed`).
        headed: !inset,
        // The panel draws no scrollbar beside the page: the page's own is
        // left undrawn (overlay `data-cawco-bare-scroll`), as its rail's is.
        bareScroll: !inset,
        // The head's room over the page's top, px: a document CawCo draws
        // takes it on its own scroller and says so (`cawco:head-room`).
        headRoom: inset ? 0 : headRoomPx(),
        ...(artifact
          ? {
              artifact: {
                id: artifact.id,
                kind: artifact.kind,
                name: artifact.name,
                title: artifact.title,
              },
              sync: artifactSyncPath(artifact.id),
            }
          : {}),
      },
      true
    );
  }
  // The dashboard's theme turning tells the page: a page artifact draws in it
  // (the overlay), never in the OS's; a preview is its own app and keeps its
  // own. Only a page that said ready hears it: one still loading takes the
  // theme from its hello.
  $effect(() => {
    const scheme = theme.resolved;
    untrack(() => {
      if (connected) {
        post({ type: "cawco:theme", theme: scheme });
      }
    });
  });
  /** The pane's mode, kept for the session and told to the page; `place` is the moved pin the next tap in Comment places again. */
  function setMode(next: PreviewMode, place: string | null = null) {
    // A mode switch leaves nothing of a comment being written.
    if (next !== mode) {
      cancelComposer();
    }
    mode = next;
    placing = next === "comment" ? place : null;
    store("local", modeKey, next);
    post({ type: "cawco:mode", mode: next, place: placing });
  }
  /** ⇧C: every pin shown on the page, or hidden. */
  function showPins(visible: boolean) {
    pinsShown = visible;
    post({ type: "cawco:pins-shown", shown: visible });
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
      floatSheet ||
      threadPushed ||
      !connected ||
      pinHeard === openPin
    ) {
      lastDrawn = openPin;
    }
    return lastDrawn;
  });
  const cardPin = $derived(pins.find((pin) => pin.id === drawnPin) ?? null);
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
  /** The page's tools over the well's foot (PreviewTools), px tall: Changed since you looked stands above them. */
  let toolsHeight = $state(0);
  /** A whole-page comment asked from the rail beside the page: its composer hangs from the rail's glass, not over the page. */
  const pageHung = $derived(
    composingPage && !!composing && listOpen && !railSheet
  );
  /** The rail's foot sheet (a phone, a pane under 640px) stands aside while a composer or a place picker stands, so neither covers the other; a thread opens in it (`threadPushed`). */
  const railAway = $derived(
    listOpen && railSheet && (!!composing || !!picking)
  );
  /**
   * How much of the well's foot a software keyboard covers, px: what stands
   * at the foot over the page (the Comments sheet, a thread's or the
   * composer's foot sheet) is lifted by it, so the
   * field being typed in stands over the keyboard while the page under them
   * keeps its box (a phone's preview sheet holds its place for a field of
   * its own: SideSheet). Written on the well as `--keyboard-lift`; 0 with
   * no keyboard (visible-viewport's `data-keyboard`), and under a pinch
   * zoom (`floor.bottom` 0). Read as the visible area is published and as
   * the well resizes, in the frame after. With no keyboard up it is 0
   * wherever the well stands: read while a phone's sheet stood at its
   * first stop, the well's foot below the screen, it lifted a foot sheet
   * 168px off the foot once the sheet stood at full, the sheet's move
   * resizing nothing.
   */
  $effect(() => {
    const node = well;
    const { bottom } = visibleFloor;
    if (!node) {
      return;
    }
    const read = () => {
      const covered =
        bottom > 0 && document.documentElement.hasAttribute("data-keyboard")
          ? Math.max(
              0,
              Math.round(node.getBoundingClientRect().bottom - bottom)
            )
          : 0;
      node.style.setProperty("--keyboard-lift", `${covered}px`);
    };
    read();
    const watch = frameObserver(read);
    watch.observe(node);
    return () => {
      watch.disconnect();
      node.style.removeProperty("--keyboard-lift");
    };
  });
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
    const frame = iframe;
    const floating = floatSheet ? (cardFloat ?? composerFloat ?? null) : null;
    const sheetCard = threadPushed ? (railSurface ?? null) : floating;
    if (!(frame && connected)) {
      return;
    }
    const covering = [sheetCard, changesTag].filter(
      (el): el is HTMLElement => !!el
    );
    if (covering.length === 0) {
      post({ type: "cawco:covered", boxes: [] });
      return;
    }
    // Said in the next frame (frameObserver), whatever moved it.
    const sayNow = () => {
      const framed = frame.getBoundingClientRect();
      const left = framed.left + frame.clientLeft;
      const top = framed.top + frame.clientTop;
      post({
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
    const frame = iframe;
    const tag = changesTag;
    if (!(frame && connected)) {
      return;
    }
    if (!tag) {
      post({ type: "cawco:foot-room", px: 0 });
      return;
    }
    const gap = numberOf("--spacing-space-2");
    const sayNow = () => {
      const foot = frame.getBoundingClientRect().bottom - frame.clientTop;
      post({
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
    const head = section?.querySelector<HTMLElement>('[data-slot="side-head"]');
    if (!(iframe && connected && head && !inset)) {
      return;
    }
    const sized = frameObserver(() =>
      post({ type: "cawco:head-room", px: head.offsetHeight })
    );
    sized.observe(head);
    sized.request();
    return () => sized.disconnect();
  });
  /** Pins the agent is working on: the last delivery carried them and its turn runs. */
  const live = $derived.by(() => {
    const stamps = pins.flatMap((pin) => [
      pin.sentAt ?? "",
      ...pin.thread.map((entry) => entry.sentAt ?? ""),
    ]);
    const last = stamps.reduce((a, b) => (b > a ? b : a), "");
    if (!(last && fleet.working(instanceId))) {
      return new Set<string>();
    }
    return new Set(
      pins
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
      pins
        .filter((pin) => pin.id !== openPin && newAnswer(pin))
        .map((pin) => pin.id)
    )
  );
  // The open thread is looked at: what the agent answered there is seen, on every device.
  $effect(() => {
    const pin = cardPin;
    if (!(pin && doc && newAnswer(pin)) || onlyOnPage(pin.id)) {
      return;
    }
    untrack(() => doc?.see(pin.id));
  });
  // Each pill's dot on the page: the agent at work on it, or an answer unread.
  $effect(() => {
    const working = [...live];
    const answered = [...unread];
    if (connected) {
      untrack(() =>
        post({ type: "cawco:pin-marks", live: working, unread: answered })
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
    const changes = view?.changes;
    const seen = view?.seen;
    return changes && seen
      ? changes.items.filter((item) => !seen.has(item.anchor))
      : [];
  });
  /** The stops as the page orders them (`cawco:change-stops`): each change's anchors and the pin standing with it. */
  let pageStops = $state.raw<{ anchors: string[]; pin: string | null }[]>([]);
  // Ringed on the page only while the tour is on (ChangesTag turned on).
  $effect(() => {
    const anchors = tour
      ? unseenChanges
          .filter((item) => item.kind === "element" || item.kind === "card")
          .map((item) => item.anchor)
      : [];
    const answered = [...unread];
    if (connected) {
      untrack(() => post({ type: "cawco:changes", anchors, pins: answered }));
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
      const pin = pins.find((one) => one.id === id);
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
  const changeStopsOf = (value: unknown): typeof pageStops =>
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
      post({ type: "cawco:show-element", selector: anchor, outline: "chosen" });
    }
    seeSoon(stop.anchors);
    if (stop.pin) {
      openCard(stop.pin, via);
    }
  }
  /** The person pressed a ringed element in Interact mode: he has looked at it. */
  function changePressed(anchor: unknown) {
    const revision = view?.changes?.revision;
    if (typeof anchor === "string" && revision !== undefined) {
      doc?.seeChanges(revision, [anchor]);
    }
  }
  /**
   * What changed since he looked under each comment, by its pin: its
   * thread's lines are seen once he opens it. Shown on the page and in the
   * thread, never as a list of its own (the owner's pick: "On the page
   * only").
   */
  const changedUnder = $derived.by(() => {
    const held = new Set(pins.map((pin) => pin.id));
    const byPin = new Map<string, ChangedItem[]>();
    for (const item of unseenChanges) {
      if (item.pin && held.has(item.pin)) {
        byPin.set(item.pin, [...(byPin.get(item.pin) ?? []), item]);
      }
    }
    return byPin;
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
    const lines = view?.activity[pin.id] ?? [];
    const replied = pin.thread.findLast((entry) => entry.by === "agent")?.at;
    return lines.some(
      (line) => !line.answered && (!replied || replied < line.at)
    );
  };
  /** The comments whose Ask again is on its way. */
  let askingAgain = $state.raw<ReadonlySet<string>>(new Set());
  /** A comment's Ask again: it goes to the session again, whole; once it went, what changed under it is looked at. */
  async function askAgainPin(id: string) {
    if (!artifact || askingAgain.has(id)) {
      return;
    }
    askingAgain = new Set([...askingAgain, id]);
    try {
      await askAgain(instanceId, artifact.id, id);
      seeSoon(
        (changedUnder.get(id) ?? []).map((item) => item.anchor),
        0
      );
    } catch (error) {
      failure = { message: failureWords(error), again: null };
    } finally {
      askingAgain = new Set([...askingAgain].filter((one) => one !== id));
    }
  }
  /**
   * These changes looked at, once their ring's ping has played (`--duration-loop`,
   * or `after` ms): the step that brought him there pings it, and a ring
   * looked at fades off, so the look is written after the ping, not over it.
   */
  function seeSoon(anchors: string[], after = dur("--duration-loop")) {
    const revision = view?.changes?.revision;
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
      doc?.seeChanges(revision, anchors);
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
      doc?.seeChanges(look.revision, look.anchors);
    }
    looks.clear();
  }
  /**
   * A change's spot brought out on the page (scrolled to, chosen, its ring
   * pinging), with its comment's thread open when one stands on it or it
   * answers one: a To check row, a change chip, the thread's own lines.
   */
  function stepToChange(anchor: string) {
    const item = view?.changes?.items.find((one) => one.anchor === anchor);
    const its =
      item?.pin ??
      Object.entries(view?.activity ?? {}).find(([, lines]) =>
        lines.some((line) => line.anchor === anchor)
      )?.[0];
    if (its && pins.some((pin) => pin.id === its)) {
      openCard(its, "pointer");
    }
    if (!anchor.startsWith("removed:")) {
      post({ type: "cawco:show-element", selector: anchor, outline: "chosen" });
    }
    seeSoon([anchor]);
  }
  // The open thread is looked at: what changed under it is seen once its ring has pinged.
  $effect(() => {
    const pin = cardPin;
    const mine = pin ? (changedUnder.get(pin.id) ?? []) : [];
    if (mine.length > 0) {
      untrack(() => seeSoon(mine.map((item) => item.anchor)));
    }
  });
  /** The pins J and K step through: those on the page, by number (a resolved pin has left it). */
  const stepping = $derived(
    pins.filter((pin) => !(pin.movedAt || pin.resolvedAt))
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
    if (connected) {
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
    const held = ready.commentDrafts(() => artifactId);
    drafts = held;
    return () => {
      held.release();
      drafts = null;
    };
  });
  /** The next comment's draft: its words and chips stay for the next composer. */
  const nextDraft = $derived(
    drafts && artifactId ? drafts.draft(NEXT_COMMENT) : null
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
    post({ type: "cawco:focus-pin", id, scroll, instant, keyed });
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
    post({ type: "cawco:track-pin", id });
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
    // The thread joined to the Comments card leaves by its own transition.
    if (!swap && id && drawnPin === id && !threadHung) {
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
    post({ type: "cawco:track-pin", id: null });
  }
  /**
   * The composer closes with nothing written (Esc, a press outside it, a
   * mode switch, a thread opened). Holding words or chips, it is parked
   * (The Work Outlives Its Surface Rule): its hollow pill stays at its
   * target saying it holds a draft, and one press on it opens the composer
   * again with them; its words and chips stay as the next comment's draft,
   * an upload in flight going on. Empty, its pill goes.
   */
  /**
   * A comment written or let go, or a thread closed: the card that held the
   * focus is gone, and the browser drops the focus on the body, outside the
   * pane, where none of its keys reach (V, C and D, J and K): after a
   * comment, V did nothing until he pressed into the page again (the
   * owner, 2026-11-12). The page's frame takes the focus back, where he
   * was working; a focus he moved elsewhere himself stays where it is.
   */
  let carded = false;
  $effect(() => {
    const now = !!composing || !!openPin;
    if (carded && !now) {
      tick().then(() => {
        const at = document.activeElement;
        if (!at || at === document.body) {
          iframe?.focus({ preventScroll: true });
        }
      });
    }
    carded = now;
  });
  function cancelComposer() {
    if (!composing) {
      return;
    }
    composing = null;
    if (nextDraft?.hasContent) {
      postComposer({ type: "cawco:compose-park" });
      keepDraftAt(keptDraft ? { ...keptDraft, parked: true } : null);
    } else {
      postComposer({ type: "cawco:compose-cancel" });
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
    artifactId ? `cawco-comment-draft:${artifactId}` : null
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
    post({
      type: "cawco:compose-restore",
      target: { ...kept.target, point: kept.point, inkId: kept.inkId },
      parked: kept.parked,
    });
  }
  /** The page's words on the comment being written ({@link heardComposer}). */
  type ComposerMessage = PageMessage & {
    type: "cawco:compose" | "cawco:compose-at" | "cawco:comment-result";
  };
  const COMPOSER_MESSAGES: readonly string[] = [
    "cawco:compose",
    "cawco:compose-at",
    "cawco:comment-result",
  ] satisfies ComposerMessage["type"][];
  const isComposerMessage = (
    message: PageMessage
  ): message is ComposerMessage => COMPOSER_MESSAGES.includes(message.type);
  /**
   * To the page the comment being written stands on: a canvas's is its
   * stage's frame (canvas/stage.svelte.ts), which the pane's own `iframe`
   * never is; any other page's, the pane's.
   */
  function postComposer(message: object) {
    if (isCanvas) {
      stage?.post(message);
    } else {
      post(message);
    }
  }
  /**
   * The page's word on the comment being written: a press (or a radial's
   * Comment on ink) opened its composer, where its pill stands, and its
   * answer to Comment. The pane's page says it through `receive`, a
   * canvas's through its stage (CanvasStages, `SlotActions.composer`).
   */
  function heardComposer(message: ComposerMessage) {
    switch (message.type) {
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
    }
  }
  /** Comment: the words and what they carry go to the page, which writes the pin and its first entry at once; `held`, kept to send with the others (core `ThreadEntry.held`). */
  function comment(text: string, held = false) {
    if (!(composing && nextDraft)) {
      return;
    }
    const said = saidIn(nextDraft, text);
    composing.error = "";
    composing.sending = true;
    postComposer({ type: "cawco:comment", ...said, held });
  }
  /** The page's answer to Comment: written, the composer goes; refused, the words are back in it with why. */
  function heardComment(message: Record<string, unknown>) {
    // Written, it is heard whether or not its composer still stands: an Esc
    // that came before the page's answer closed the composer, not the
    // comment, which the page wrote.
    if (message.ok === true) {
      const { pin } = message;
      const written = !!pin && pinProblem(pin) === null;
      if (written && !view?.pins.some((one) => one.id === (pin as Pin).id)) {
        pageSays((pin as Pin).id, pin);
      }
      composing = null;
      keepDraftAt(null);
      // The newest comment is the one J and K step from.
      if (written) {
        focusedPin = (pin as Pin).id;
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
    artifactId
      ? `${location.origin}/artifact/${encodeURIComponent(artifactId)}?pin=${number}`
      : location.href;
  /**
   * The place the address names, opened once its page is ready and its pins
   * are read: a pin's thread (`?pin=N`), or a decision card (`?card=<id>`).
   */
  let linkedFor: string | null = null;
  function openLinkedPin() {
    const asked = new URL(location.href).searchParams;
    if (!artifactId || linkedFor === artifactId) {
      return;
    }
    const card = asked.get("card");
    if (card) {
      linkedFor = artifactId;
      showCard(card);
      return;
    }
    const change = asked.get("change");
    if (change) {
      linkedFor = artifactId;
      stepToChange(change);
      return;
    }
    const number = Number(asked.get("pin"));
    if (openPinNumbered(number)) {
      linkedFor = artifactId;
    }
  }
  $effect(() => {
    if (connected && view) {
      untrack(openLinkedPin);
    }
  });
  /** Pin `number`'s thread opened, when the page holds it; whether it did. */
  function openPinNumbered(number: number): boolean {
    const pin = Number.isInteger(number)
      ? pins.find((one) => one.number === number)
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
    post({
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
    const id = artifactId;
    const at = id ? openAsked(id) : null;
    if (!(id && at && connected && view)) {
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
    if (onlyOnPage(openPin)) {
      // The page holds the pin and keeps the words on its device until the
      // hub has them; its answer (`cawco:reply-result`) draws them, or puts
      // them back in the field with why.
      pageWords.set(openPin, text);
      replying = true;
      post({ type: "cawco:reply", pin: openPin, ...said });
      if (reopens) {
        post({ type: "cawco:resolve", pin: openPin, resolved: false });
      }
      cardError = null;
      return;
    }
    cardError = doc
      ? doc.reply(openPin, said)
      : "The pane lost the page's document, so the reply wasn't kept. Reload, then reply again.";
    if (cardError === null && reopens && doc) {
      cardError = doc.resolve(openPin, false);
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
    if (onlyOnPage(id)) {
      cardError = null;
      post({ type: "cawco:resolve", pin: id, resolved });
      return;
    }
    const refused = doc
      ? doc.resolve(id, resolved)
      : `The pane lost the page's document, so the comment wasn't ${resolved ? "resolved" : "reopened"}. Reload, then try again.`;
    if (id === openPin) {
      cardError = refused;
    } else if (refused) {
      failure = { message: refused, again: null };
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
    if (onlyOnPage(id)) {
      // The page holds it alone: deleted there, its answer saying any refusal.
      post({ type: "cawco:delete", pin: id });
      pageSays(id, null);
    } else {
      refused = doc
        ? doc.delete(id)
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
   * `--duration-peek` the first time, at once while one is up or just went;
   * never under a finger. The pointer may leave the pill for the peek: it
   * goes `--duration-peek` after the pointer left them both.
   */
  let peekAt = $state<{ id: string; mark: PreviewPinAt["mark"] } | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the last peek went: the next within `--duration-peek` comes at once. */
  let peekWent = 0;
  /** The pointer rests on the peek itself. */
  let onPeek = false;
  function heardPeek(message: Record<string, unknown>) {
    clearTimeout(peekTimer);
    const id = previewPinId(message.id);
    const mark = previewBox(message.mark);
    // None under a finger, and none while a thread or a composer stands.
    if (coarse.current || openPin || composing) {
      dropPeek();
      return;
    }
    if (!(id && mark)) {
      // Off its pill: onto the peek, which stays, or away.
      if (peekAt && !onPeek) {
        peekTimer = setTimeout(dropPeek, dur("--duration-peek"));
      }
      return;
    }
    const wait = dur("--duration-peek");
    if (peekAt || performance.now() - peekWent < wait) {
      peekAt = { id, mark };
      return;
    }
    peekTimer = setTimeout(() => {
      peekAt = { id, mark };
    }, wait);
  }
  /** The pointer came onto the peek (it stays) or left it (it goes after `--duration-peek`, unless the pointer is back on its pill). */
  function restOnPeek(on: boolean) {
    onPeek = on;
    clearTimeout(peekTimer);
    if (!on) {
      peekTimer = setTimeout(dropPeek, dur("--duration-peek"));
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
      ? (pins.find((pin) => pin.id === peekAt?.id) ?? null)
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
    if ((name === "v" || name === "c" || name === "d") && !isCanvas) {
      setMode(MODE_KEYS[name]);
    } else if (name === "C" && !isCanvas) {
      showPins(!pinsShown);
    } else if (name === "j") {
      step(1);
    } else if (name === "k") {
      step(-1);
    } else if (
      name === "Enter" &&
      focusedPin &&
      pins.some((pin) => pin.id === focusedPin)
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
    if (isBrowser) {
      return;
    }
    const { target } = event;
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      // The pane's own: its rail stands in its card.
      !(target instanceof Node && section?.contains(target)) ||
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
    iframe?.dispatchEvent(
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
      !paneOrigin ||
      event.source !== iframe?.contentWindow ||
      event.origin !== paneOrigin
    ) {
      return;
    }
    heardKey = frameKey;
    if (event.data?.type === PAGE_TOUCHED_MESSAGE) {
      heardInput();
      return;
    }
    if (event.data?.type === "cawco:down") {
      heardDown(event.data);
      return;
    }
    if (event.data?.type === PREVIEW_LOCKED_MESSAGE) {
      turnedAway();
      return;
    }
    // A reference in a decision page's words, its Canvas's Open to draw,
    // its Preview's Open full: opened only when the page links to it.
    if (links.heard(event.data)) {
      return;
    }
    const ask = previewPickPlace(event.data);
    if (ask !== null) {
      // A second ask replaces one still open: the page asked again.
      cancelPick();
      picking = { id: ask };
      return;
    }
    const message = pageMessage(event.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "cawco:ready":
      case "cawco:navigated": {
        const at = previewUrl(message.url, paneOrigin);
        if (!at) {
          return;
        }
        // The page answers: whatever the proxy said of an earlier load is over.
        down = null;
        downWhy = null;
        const parsed = new URL(at);
        keepAt(parsed);
        if (preview) {
          preview.title = previewTitle(message.title) ?? "";
        }
        if (message.type === "cawco:ready") {
          readyFrom = event.origin;
          connected = true;
          // A new page holds no drawing: the design graph reaches its state again.
          link?.loaded();
          refusedEntries = 0;
          // It was let in: a later turn-away is a pass lost since, which a new entry answers.
          frameSince = performance.now();
          // The frame Try again reloaded answered: what it was tried for is over.
          retrying = false;
          if (failure?.again === "reload") {
            failure = null;
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
            post({ type: "cawco:track-pin", id: openPin });
          }
          post({
            type: "cawco:pin-marks",
            live: [...live],
            unread: [...unread],
          });
          if (!onScreen) {
            // Loaded while its tab is off screen: held from the start.
            post({ type: "cawco:hold" });
          }
        }
        break;
      }
      case "cawco:held":
        pageHeld = message.held === true;
        break;
      case "cawco:head-room":
        headRoomTaken = message.taken === true;
        break;
      case "cawco:captured": {
        // Both schemes in one answer, the other drawn off screen (overlay schemes.ts).
        const shot = previewThumbnail(message);
        if (shot && preview) {
          preview.thumbnail = shot;
          preview.thumbnailRevision = preview.revision;
          preview.thumbnailWanted = false;
          // The hub keeps it as the artifact's latest picture: Files' cards
          // draw it, whichever panel took it: its own or its delegation
          // tree's (the hub keeps it as the artifact's session's). A canvas
          // keeps its own.
          if (preview.artifact.kind !== "canvas") {
            keepThumbnail(instanceId, preview.artifact.id, shot).catch(
              (error: unknown) => {
                console.error("The page's thumbnail was not kept", error);
              }
            );
          }
        }
        failure = frameError(previewError(message.error));
        retrying = false;
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
          !view?.pins.some((one) => one.id === id)
        ) {
          pageSays(id, message.pin);
        }
        openCard(id, message.via === "key" ? "key" : "pointer");
        break;
      }
      case "cawco:compose":
      case "cawco:compose-at":
      case "cawco:comment-result":
        if (isComposerMessage(message)) {
          heardComposer(message);
        }
        break;
      case "cawco:pin-chain": {
        const id = previewPinId(message.id);
        const parent = previewCompose(message)?.chain[1];
        if (id && id === openPin) {
          cardParent = {
            id,
            name:
              parent &&
              !(
                "selector" in parent.anchor && parent.anchor.selector === "body"
              )
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
        pageReplies = pageRepliesOf(message.replies);
        // The pins the page holds while its link isn't synced (a reload's, given back by the device among them): those the pane's doc lacks stand as the page's.
        for (const pin of Array.isArray(message.pins) ? message.pins : []) {
          const one = pin as Partial<Pin> | null;
          const id = one?.id;
          if (
            !(typeof id === "string" && one) ||
            view?.pins.some((held) => held.id === id)
          ) {
            continue;
          }
          // One the hub refused breaks a bound by its nature (the hub's reason says which): it is listed whole, so its words stay in reach.
          if (
            one.notSent &&
            typeof one.number === "number" &&
            Array.isArray(one.thread)
          ) {
            pagePins = { ...pagePins, [id]: one as Pin };
          } else {
            pageSays(id, pin);
          }
        }
        break;
      case "cawco:sync":
        // The page's doc's link to the hub (overlay artifact.ts `Link`): a lost one is said once it has stood, or at once when lost to silence.
        pageLost = message.state === "lost" ? lostWhy(message.error) : null;
        pageSilent = message.state === "lost" && message.silent === true;
        break;
      case "cawco:press":
        // A press on the page, outside the composer: the outside-press rule,
        // heard from the page's own process. A thread stays: it closes by its
        // Close or Esc alone. The design graph's open layers close on it, a
        // press on its stage being outside them.
        cancelComposer();
        if (link) {
          link.presses += 1;
          // A press brings the tools back, as a tap does an iOS toolbar.
          link.scrolledDown = false;
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
          failure = { message: said, again: of ? null : "reload" };
        }
        retrying = false;
        break;
      }
      case "cawco:resolved":
        if (failure && failure.again === null) {
          failure = null;
        }
        break;
      case "cawco:sheet": {
        // A sheet's page said its stories and props: the design graph's model, and the props on its Dials card.
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
      case STAGE_SCROLLED: {
        // Which way the drawing's page scrolled: the tools over its foot step aside going down.
        const said = stageScrolledOf(message);
        if (said && link) {
          link.scrolledDown = said.down;
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
  /**
   * Closing goes back where it came from: the preview opened out of its tool
   * row's box (`preview:<session>`), so as it closes, a stand-in the size of
   * the pane shrinks into that row and fades (closeInto, --ease-drawer) while
   * the pane itself leaves. A row scrolled away or not mounted has nothing
   * to land in, and the pane simply leaves. In the phone's sheet the sheet
   * sliding down is its one exit (SideSheet), so nothing flies.
   */
  let section = $state<HTMLElement>();
  let shown = false;
  $effect(() => {
    const open = preview?.state === "open";
    if (shown && !open && !sheet && section && artifact) {
      closeToRow(section, artifact.id);
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
      background: "var(--color-surface-raised)",
      boxShadow: "var(--shadow-drawer)",
      pointerEvents: "none",
      zIndex: "var(--layer-flight)",
    });
    document.body.append(stand);
    const done = () => stand.remove();
    const flight = closeInto(stand, row, dur("--duration-panel"));
    if (flight) {
      flight.finished.then(done, done);
    } else {
      done();
    }
  }
  /** Close in the artifact's own tab: back to the session that made it. */
  async function backToSession() {
    await goto(fleet.sessionHref(instanceId));
  }
  /*
   * A canvas stands on its stage (canvas/stage.svelte.ts), one iframe for it
   * wherever it is: the well holds a slot the stage stands over, so Dock and
   * Undock fly that same iframe between the composer and here.
   */
  const isCanvas = $derived(artifact?.kind === "canvas");
  /**
   * The open thread stands joined to the hung Comments card, on its leading
   * side, while that card stands (the owner's pick on pin 51: selecting a
   * comment shows its thread as a second card, connected), never beside
   * its pill across the page from the list it was picked in. Its pill is
   * lit and brought into view as before.
   */
  const threadHung = $derived(
    listOpen && listShown && !railSheet && !isCanvas && !floatSheet
  );
  /** The rail's bottom sheet stands up (ThreadSheet `open`). */
  const railSheetOpen = $derived(
    listOpen && listShown && !isCanvas && railSheet && !railAway
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
    listOpen && listShown && !isCanvas && railSheet && openPin !== null
  );
  /** The thread standing joined to the Comments card: the open one, at once, its place on the page not waited for. */
  const hungPin = $derived(
    threadHung && openPin && !threadPushed
      ? (pins.find((pin) => pin.id === openPin) ?? null)
      : null
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
      case "held":
        return !pins.some(pinHeld);
      case "resolved":
        return !pins.some((pin) => !!pin.resolvedAt);
      case "open":
        return !pins.some((pin) => !pin.resolvedAt);
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
  $effect(() => {
    if (railSheetOpen) {
      railSheetDrawn = true;
    }
  });
  /*
   * A browser (Projects spec §5.11, "The view") is its stream in the well
   * (BrowserView), its head's own control Take over, or Hand back while the
   * person holds it. It has no modes, comments or ink: what the person sees
   * there reaches no agent.
   */
  const isBrowser = $derived(artifact?.kind === "browser");
  const browserRow = $derived(isBrowser ? fleet.browser(instanceId) : null);
  const browserMachine = $derived.by(() => {
    const machineId = owner?.machineId ?? browserRow?.machineId ?? "";
    const known = fleet.machines.find((one) => one.machineId === machineId);
    return {
      machineId,
      name: browserRow?.machineName ?? known?.hostname ?? machineId,
      online: known?.online ?? false,
    };
  });
  /** The browser's stream is drawn in the well (BrowserView): there is a page to take over. */
  let browserViewing = $state(false);
  /** The layout the taken-over page is in (BrowserView `form`): the head's switch. */
  let browserForm = $state<TakeoverLayout["form"]>("desk");
  let browserView = $state<BrowserView>();
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
    failure = why
      ? {
          message: holding
            ? browserWords.cantHandBack(why)
            : browserWords.cantTakeOver(why),
          again: null,
        }
      : null;
  }
  const holder = Symbol("panel");
  let canvasSlot = $state<HTMLElement>();
  let stage = $state<Stage>();
  /** This session's composer can take the canvas back: not a conversation's shown beside a thread, not its own tab. */
  const canUndock = $derived(isCanvas && !ownTab);
  $effect(() => {
    const canvas = isCanvas ? artifact : undefined;
    const slot = canvasSlot;
    const session = instanceId;
    if (!(canvas && slot)) {
      return;
    }
    // Held, placed and stood here once per canvas and slot: what this reads
    // of the stages is what it writes, so none of it is a dependency.
    const held = untrack(() => {
      const one = holdStage(holder, session, canvas.id, canvas.name);
      stage = one;
      one.slots.panel = slot;
      one.actions.panel = {
        undock: () => giveBack(false),
        done: () => giveBack(true),
        // A Comment on the canvas's ink opens this panel's composer, as a page's does.
        composer: (data) => {
          const message = pageMessage(data);
          if (message && isComposerMessage(message)) {
            heardComposer(message);
          }
        },
      };
      one.standAt("panel");
      one.changed();
      return one;
    });
    return () => {
      if (held.slots.panel === slot) {
        held.slots.panel = undefined;
        held.actions.panel = undefined;
        if (held.at === "panel") {
          held.standAt(null);
        }
      }
      letGo(holder, held.id);
      stage = undefined;
    };
  });
  /*
   * The canvas, standing in this panel while its conversation's tab is off
   * screen, is held as a page is (the overlay's hold.ts, in its host page);
   * it is never let go, as the stage keeps its one iframe wherever it stands.
   * Anywhere else (the tab in view, the canvas in the composer) it runs, and
   * a page loaded again while held (`connected` anew) is held again.
   */
  $effect(() => {
    const one = isCanvas ? stage : undefined;
    if (!one?.connected) {
      return;
    }
    one.post({
      type: !onScreen && one.at === "panel" ? "cawco:hold" : "cawco:release",
    });
  });
  /** Undock (or Done here): the session's composer takes the canvas back, open or as its chip. */
  function giveBack(folded: boolean) {
    if (!(canUndock && artifact)) {
      return;
    }
    handBack.ask = {
      instanceId,
      id: artifact.id,
      name: artifact.name,
      folded,
    };
  }
  /** Close: the panel goes in this tab alone (closed-here.ts). */
  function close() {
    fleet.closePreview(instanceId);
  }
  /** What a component artifact's design graph hands the head: its state's title, its steps, its view, its components (graph-head.ts). */
  let graphHead = $state<GraphHead | null>(null);
  /**
   * A component artifact's design graph's line to its stage page: what the
   * page said (its sheets, its drawing, its answers), and what the graph
   * asks of it, through `post`. One per session and kind, as the view.
   */
  const link = $derived.by(() => {
    const session = instanceId;
    return isSheet && session ? untrack(() => new StageLink(post)) : null;
  });
  // The Dials card's props are for the story the stage stands at.
  inspectKept(
    () => link,
    () => inspector
  );
  /** The component artifact's states files and the agent's spec, as its address carries them (core `canvasPath`). */
  const sheetCanvas = $derived(isSheet ? canvasOf(startAt) : null);
  /**
   * The frame stands in the design graph's stage, under the stage's own
   * head: the head's room is the graph page's, never the frame's.
   */
  const inGraph = $derived(isSheet && !!artifact && !!link && !!sheetCanvas);
  /**
   * Where the frame stands in the well: in the design graph's stage, or
   * under the floating head's room (`--page-top`) beside a side card's
   * head. The pins' room takes that box, so a place the page says is a
   * place on the page.
   */
  let frameBox = $state<{ h: number; w: number; x: number; y: number } | null>(
    null
  );
  /**
   * A canvas's box on the screen while a comment on its ink is written: its
   * stage's fixed layer (CanvasStages), over the panel's slot, which the
   * composer's room stands over.
   */
  let canvasBox = $state<{
    h: number;
    w: number;
    x: number;
    y: number;
  } | null>(null);
  $effect(() => {
    const node = isCanvas && composing ? stage?.el : undefined;
    if (!node) {
      canvasBox = null;
      return;
    }
    const measure = () => {
      const box = node.getBoundingClientRect();
      canvasBox = { x: box.left, y: box.top, w: box.width, h: box.height };
    };
    const watch = frameObserver(measure);
    watch.observe(node);
    measure();
    return () => watch.disconnect();
  });
  $effect(() => {
    const frameNode = iframe;
    const wellNode = well;
    if (!(frameNode && wellNode)) {
      frameBox = null;
      return;
    }
    const measure = () => {
      const box = frameNode.getBoundingClientRect();
      const origin = wellNode.getBoundingClientRect();
      frameBox = {
        x: box.left - origin.left,
        y: box.top - origin.top,
        w: box.width,
        h: box.height,
      };
    };
    const watch = frameObserver(measure);
    watch.observe(frameNode);
    watch.observe(wellNode);
    measure();
    return () => watch.disconnect();
  });
  /** The mode's glyph and word, for its one-button form. */
  /** The taken-over page's layouts, as the head's switch names them. */
  const LAYOUT_SEGMENTS = [
    {
      value: "phone",
      label: browserWords.phoneLayout,
      icon: IconPhoneLinear,
    },
    {
      value: "desk",
      label: browserWords.deskLayout,
      icon: IconMonitorLinear,
    },
  ] as const;

  const MODE_GLYPHS = {
    interact: IconInteractLinear,
    comment: IconCommentLinear,
    draw: IconPenLinear,
  } as const satisfies Record<PreviewMode, unknown>;
  const MODE_WORDS: Record<PreviewMode, string> = {
    interact: "Interact",
    comment: "Comment",
    draw: "Draw",
  };

  /** Reload: a canvas's stage frame from its address, any other page by a new frame. */
  function reloadPage() {
    if (isCanvas && stage?.frame) {
      stage.frame.src = stage.src;
    } else {
      reload += 1;
    }
  }

  /** A browser's head controls: Take over or Hand back, while held its layout switch and Reload page, and its address. */
  function browserItems(row: NonNullable<typeof browserRow>): HeadItem[] {
    const all: HeadItem[] = [];
    const shows = browserHead(row, {
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
    // Held, the page's layout is the head's to switch, in the mode's
    // place (its centre, one glyph where the head is narrow). Reload page
    // stands in the glass on a desk, as a page's Reload does; a phone's
    // head holds Close, the switch and Hand back alone (a More beside them
    // leaves the switch no room), so there it stands at the page's foot
    // (BrowserView).
    if (row.takeover) {
      all.push({
        key: "layout",
        priority: HEAD_PRIORITY.mode,
        bar: layoutBar,
        compact: layoutCompact,
        menu: layoutMenu,
        group: true,
        place: "centre",
      });
      if (!sheet) {
        all.push({
          key: "reload-page",
          priority: HEAD_PRIORITY.reload,
          bar: reloadPageBar,
          menu: reloadPageMenu,
        });
      }
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
    return all;
  }

  /** The head's controls in head order, each standing by the head's priority rule while there is room (side/head.ts). */
  const headItems = $derived.by(() => {
    const all: HeadItem[] =
      isBrowser && browserRow ? browserItems(browserRow) : [];
    // A decision page's one Send is its own, at its foot (its doc's
    // `ownSend`): the head stands none for it.
    if (artifact && unsentCount > 0 && !view?.ownSend) {
      all.push({
        key: "send",
        priority: HEAD_PRIORITY.send,
        bar: sendBar,
        menu: sendMenu,
        place: "prominent",
        words: true,
      });
    }
    // What acts on an artifact as a whole (the design graph's components
    // and view, Undock) stands in the head's More, last in
    // the glass; More stands only while it holds one of them, never as an
    // empty menu (a page or a preview has none of the graph's).
    const documentMenu = !!artifact && (!!graphHead || canUndock);
    if (canUndock && !documentMenu) {
      all.push({
        key: "undock",
        priority: HEAD_PRIORITY.undock,
        bar: undockBar,
        menu: undockMenu,
      });
    }
    if (isBrowser) {
      return all;
    }
    if (!isCanvas) {
      all.push({
        key: "comments",
        priority: HEAD_PRIORITY.comments,
        bar: commentsBar,
        menu: commentsMenu,
        count: { glyph: IconChat, n: listOpen ? 0 : openCount, of: "Comments" },
      });
    }
    // What acts on the artifact as a whole, rare: in the head's More, last
    // in the glass.
    if (documentMenu) {
      all.push({
        key: "actions",
        priority: HEAD_PRIORITY.reload,
        bar: documentCommands,
        menu: documentCommands,
        group: true,
        place: "more",
      });
    }
    all.push({
      key: "reload",
      priority: HEAD_PRIORITY.reload,
      bar: reloadBar,
      menu: reloadMenu,
    });
    if (artifact && !ownTab) {
      all.push({
        key: "open",
        priority: HEAD_PRIORITY.open,
        bar: openBar,
        menu: openMenu,
      });
    }
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
      onclick={retry}
      pending={retrying}
      pendingLabel={previewWords.reloading}
      size="sm"
      variant="outline"
    />
    {#if offerSession && owner}
      {@render sessionOpen()}
    {/if}
  </div>
{/snippet}

<!-- Its session, beside Try again, or the way by hand where it can't be asked here. -->
{#snippet sessionOpen()}
  {#if owner}
    <Button
      href={fleet.sessionHref(owner.id)}
      pad="none"
      label={`Open ${ownerName}`}
      size="sm"
      variant="link"
    />
  {/if}
{/snippet}

<!-- A version whose workspace is gone fills again only as its session makes
     it again (The Empty Starts Work Rule): asked in that session's composer
     where it stands beside this pane, unsent; else its session opened. -->
{#snippet goneAsk()}
  {@const composer = fleet.composer?.(instanceId)}
  <EmptyAsk
    byHand={sessionOpen}
    canStart={!!composer}
    label={previewWords.goneAskLabel(composer?.agent ?? ownerName)}
    onask={() =>
      composer?.ask(previewWords.goneAskWords(artifact?.title ?? ""))}
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
    onclick={retry}
    pending={retrying}
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
    aria-label={`${commentWords.send}, ${unsentCount} unsent`}
    onclick={() => sendAll("panel-head")}
    pending={sending}
    shape="capsule"
    title="Send what the session hasn't heard"
  >
    <PendingContent icon={IconSend} pending={sending} />
    <span data-slot="send-label" class="in-form-compact:hidden"
      >{commentWords.send}</span
    ><span data-slot="send-count" class="num">{unsentCount}</span>
  </Button>
{/snippet}
{#snippet sendMenu()}
  <DropdownMenu.Item
    disabled={sending}
    onSelect={whileIdle(
      () => sending,
      () => sendAll("panel-more")
    )}
  >
    <IconSend /><span>{commentWords.sendCount(unsentCount)}</span>
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

<!-- The taken-over page's layout, the head's segmented control (the
     kit's BarSegments): the phone's or the desktop's, symbols alone. -->
{#snippet layoutBar()}
  <BarSegments
    label={browserWords.layout}
    onValueChange={(next) => {
      browserForm = next;
    }}
    segments={LAYOUT_SEGMENTS}
    value={browserForm}
  />
{/snippet}
<!-- Where the head has no room for both segments: one bare symbol in the
     head's glass (SideSurface puts a compact centre control there), the
     glyph and the name of the layout a press gives. -->
{#snippet layoutCompact()}
  <BarItem
    icon={browserForm === "phone" ? IconMonitorLinear : IconPhoneLinear}
    label={browserForm === "phone"
      ? browserWords.toDeskLayout
      : browserWords.toPhoneLayout}
    onclick={() => {
      browserForm = browserForm === "phone" ? "desk" : "phone";
    }}
    props={{ "data-slot": "browser-layout" }}
  />
{/snippet}
{#snippet layoutMenu()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>{browserWords.layout}</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(next) => {
        browserForm = next === "phone" ? "phone" : "desk";
      }}
      value={browserForm}
    >
      <DropdownMenu.RadioItem value="phone"
        ><IconPhone /><span>{browserWords.phoneLayout}</span
        ></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="desk"
        ><IconMonitor /><span>{browserWords.deskLayout}</span
        ></DropdownMenu.RadioItem
      >
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
{/snippet}
{#snippet reloadPageBar()}
  <BarItem
    data-slot="other"
    icon={IconRefreshLinear}
    label={browserWords.reloadPage}
    onclick={() => browserView?.reloadPage()}
  />
{/snippet}
{#snippet reloadPageMenu()}
  <DropdownMenu.Item onSelect={() => browserView?.reloadPage()}>
    <IconRefresh /><span>{browserWords.reloadPage}</span>
  </DropdownMenu.Item>
{/snippet}

<!-- A browser's address, in the head's centre (BrowserAddress). -->
{#snippet addressBar()}
  <BrowserAddress
    connecting={!browserViewing}
    mine={!!browserRow?.takeover}
    origin={browserRow?.origin ?? null}
  />
{/snippet}
{#snippet addressMenu()}
  <BrowserAddress
    as="menu"
    connecting={!browserViewing}
    mine={!!browserRow?.takeover}
    origin={browserRow?.origin ?? null}
  />
{/snippet}

{#snippet undockBar()}
  <BarItem
    data-slot="other"
    aria-disabled={!stage || undefined}
    icon={IconUndockLinear}
    label="Undock"
    onclick={() => {
      if (stage) {
        giveBack(false);
      }
    }}
  />
{/snippet}
{#snippet undockMenu()}
  <DropdownMenu.Item disabled={!stage} onSelect={() => giveBack(false)}>
    <IconUndock /><span>Undock</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet openBar()}
  {#if artifact}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <BarItem
      data-slot="other"
      href={`/artifact/${encodeURIComponent(artifact.id)}`}
      icon={IconExternalLinear}
      label="Open in new tab"
      props={{ rel: "noopener", target: "_blank" }}
    />
  {/if}
{/snippet}
{#snippet openMenu()}
  {#if artifact}
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

<!-- The artifact's document commands, in its title's menu (ArtifactMenu
     `commands`): what acts on it as a whole. -->
{#snippet documentCommands()}
  {#if graphHead?.components}
    {@render graphHead.components()}
    <DropdownMenu.Separator />
  {/if}
  {#if graphHead}
    {@render graphHead.more()}
    <DropdownMenu.Separator />
  {/if}
  {#if canUndock}
    {@render undockMenu()}
  {/if}
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
        ><IconComment /><span>Comment</span><DropdownMenu.Shortcut
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
<!-- The mode as one button where the tools have no room for its three
     segments (a phone, a narrow card): the chosen mode's glyph, opening the
     three. -->
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
        postComposer({ type: "cawco:compose-target", index })}
      onhold={(text) => comment(text, true)}
      onsubmit={(text) => comment(text)}
      placeholder={commentWords.composeHint}
      sendError={composing.error}
      sending={composing.sending}
    />
  {/if}
{/snippet}

<!-- The composer beside its pill, in a room `w` by `h`: the pane's over a
     page, or one over a canvas's own layer. -->
{#snippet composerCard(w: number, h: number)}
  {#if composing && kit && nextDraft}
    <PinFloat
      bare
      box={composing.at?.box ?? null}
      label={commentWords.comment}
      mark={composing.at?.mark ?? null}
      room={{ w, h }}
      sheet={floatSheet}
      slot="pin-composer"
      bind:float={composerFloat}
    >
      {@render composerBody()}
    </PinFloat>
  {/if}
{/snippet}

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
      agentName={owner ? ownerName : "The session"}
      changes={(view?.activity[pin.id]?.length ?? 0) > 0
        ? threadChanges
        : undefined}
      marked={peek || !!pinAt?.mark}
      session={owner ? instanceId : null}
      {draft}
      link={pinLink(pin.number)}
      live={live.has(pin.id)}
      name={pin.movedAt ? commentWords.elementGone : pinName(pin)}
      back={pushed
        ? { to: commentWords.comments, onback: backToList }
        : undefined}
      onclose={pushed ? () => showList(false) : () => closeCard()}
      sheet={pushed || sheet}
      ondelete={deleteOpenPin}
      ondraft={() => drafts?.changed(pin.id)}
      onfind={() => focusPin(pin.id, true)}
      onplace={placeElsewhere}
      onhold={(text) => reply(text, true)}
      onreply={(text) => reply(text)}
      onresolve={(resolved) => resolvePin(resolved)}
      onretry={() => retryPin(pin.id)}
      parent={!peek && cardParent?.id === pin.id ? cardParent.name : null}
      {peek}
      {pin}
      placing={placing === pin.id}
      problem={peek ? null : cardError}
      sending={!peek && replying}
      retrying={pinsRetrying.has(pin.id)}
      whyNotSent={notSentWhy(pin)}
    />
  {/if}
{/snippet}
<!-- The open thread, joined to the comments card's leading edge (CommentsCard `thread`, `hungPin`). -->
{#snippet hungThread()}
  {#if hungPin && drafts}
    {@render thread(hungPin, drafts.draft(hungPin.id), false)}
  {/if}
{/snippet}
<!-- Comments: on a phone the toggle of the well's foot sheet; elsewhere
     the card hangs from the head's glass, one shape with it as Caw's card
     is with his (the owner's pin on the Working area: "connected to the
     comments icon just like the top-right caw bar"), down to the card's
     foot. It stays while he works on the page: only Comments shuts it. -->
{#snippet commentsBar()}
  {#if railSheet || isCanvas}
    <CommentsButton
      count={openCount}
      down={linkDown ? NOT_REACHING : null}
      label={commentsTitle}
      onclick={() => showList(!listOpen)}
      open={railSheet ? railSheetOpen : listOpen}
      held={heldCount}
      {pinsShown}
      answers={unread.size}
    />
  {:else}
    <CommentsCard
      label={commentWords.comments}
      onOpenChange={(open) => showList(open)}
      open={listOpen && listShown}
      panel={section}
      thread={hungPin && kit && drafts ? hungThread : null}
      threadKey={hungPin?.id}
      threadLabel={hungPin ? `Comment ${hungPin.number}` : undefined}
    >
      {#snippet trigger(props)}
        <CommentsButton
          count={openCount}
          down={linkDown ? NOT_REACHING : null}
          label={commentsTitle}
          open={listOpen}
          held={heldCount}
          {pinsShown}
          {props}
          answers={unread.size}
        />
      {/snippet}
      {@render railOf("beside")}
    </CommentsCard>
  {/if}
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item onSelect={() => showList(!listOpen)}>
    <IconChat /><span>Comments</span>{#if openCount > 0}<span
        class="ms-auto text-ink-muted num"
        data-slot="count">{openCount}</span
      >{/if}
  </DropdownMenu.Item>
{/snippet}

{#snippet reloadBar()}
  <BarItem
    data-slot="other"
    icon={IconRefreshLinear}
    label="Reload"
    onclick={reloadPage}
  />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item onSelect={reloadPage}>
    <IconRefresh /><span>Reload</span>
  </DropdownMenu.Item>
{/snippet}

<!-- A thread's change lines, under its replies: every one the hub kept for it. -->
{#snippet threadChanges(pin: Pin)}
  <ChangeLines
    asking={askingAgain.has(pin.id)}
    lines={(view?.activity[pin.id] ?? []).map(lineOfActivity)}
    onask={() => askAgainPin(pin.id)}
    step={stepToChange}
    unanswered={changedNoAnswer(pin)}
  />
{/snippet}

{#snippet railOf(layout: "beside" | "sheet")}
  <CommentRail
    bind:this={rail}
    down={linkDown}
    held={heldCount}
    onsendheld={sendHeldNow}
    onsendrefusedclosed={() => {
      if (artifactId) {
        keepSendRefused(artifactId, null);
      }
    }}
    {sendRefused}
    focused={focusedPin}
    hold={listHold}
    {layout}
    {live}
    onclose={() => showList(false)}
    onhover={(id) => post({ type: "cawco:hover-pin", id })}
    onopen={openCard}
    onpage={() => {
      if (openPin) {
        closeCard();
      }
      composingPage = true;
      post({ type: "cawco:compose-page" });
    }}
    onpageclose={cancelComposer}
    pageComposer={composerBody}
    pageOpen={pageHung}
    onresolve={(id, resolved) => resolvePin(resolved, id)}
    onretry={relink}
    onretrypin={retryPin}
    onshown={(ids) => {
      railOrder = ids;
    }}
    open={openPin}
    whyNotSent={notSentWhy}
    {pins}
    retrying={pinsRetrying}
    {unread}
    bind:filter={listFilter}
    bind:scroll={listScroll}
    bind:sort={railSort}
  />
{/snippet}

<!-- The Comments rail beside the page as a floating glass panel, outside
     the page's mode seam (the artifact panel's surface brief, The Comments
     rail; the owner's pick "Beside the page"). -->

{#if inset}
  <!-- Inset: no head and no modes; the page as the panel draws it. -->
  <section
    data-slot="preview-pane"
    data-preview-inset
    aria-label={artifact?.title ?? "Preview"}
    class="@container flex flex-col flex-1 min-h-0"
    bind:this={section}
  >
    <div
      class="relative flex flex-col flex-1 min-h-0 overflow-hidden border border-border-well rounded-sm bg-surface-well"
      bind:this={well}
    >
      {@render framed()}
    </div>
  </section>
{:else}
  <SideSurface
    of="preview"
    mode={isCanvas || isBrowser ? undefined : mode}
    items={headItems}
    label="Preview"
    onclose={ownTab ? backToSession : close}
    placement={sheet ? "sheet" : "beside"}
    subtitle={graphHead ? graphHead.line : headLine}
    subtitleId={`${paneId}-line`}
    {switcher}
    {switcherAt}
    bind:section
    bind:well
  >
    {@render framed()}
  </SideSurface>
{/if}

<!-- Changed since you looked: a glass among the tools over the drawing's foot (ChangesTag). -->
{#snippet changesBar()}
  {#if changeStops.length > 0 && !isCanvas}
    <ChangesTag
      at={tour ? tourAt : null}
      onoff={() => {
        tour = null;
      }}
      onstep={stepChange}
      total={tour?.length ?? changeStops.length}
      bind:ref={changesTag}
    />
  {/if}
{/snippet}

<!-- The page's frame (and, while a new one loads, the one it replaces): in
     the well, or in a component artifact's design graph's stage. -->
{#snippet frameTags()}
  {#each reached?.origin === paneOrigin ? frames : [] as key (key)}
    {@const current = key === frameKey}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
    <!-- biome-ignore lint/security/useIframeSandbox: the previewed app runs on its own origin (the preview proxy's), which is the boundary; a sandbox would take the forms, popups and downloads it is being tried with. -->
    <iframe
      data-ready={!current || loaded || undefined}
      class="absolute inset-x-0 top-(--page-top) block h-(--page-h) w-full scheme-light scheme-dark:scheme-dark bg-system-canvas border-none border-current opacity-0 transition-[opacity] duration-(--duration-control) ease-out data-ready:opacity-100"
      style:--page-top={headRoomTaken || inGraph
        ? "0px"
        : "var(--side-room, 0px)"}
      style:--page-h="calc(100% - var(--page-top))"
      allow="clipboard-write"
      inert={!current}
      onerror={() => arrived(key)}
      onload={() => {
        arrived(key);
        if (key === frameKey) {
          loadedFrame(key);
          announce();
        }
      }}
      src={`${paneOrigin}${framePlace}`}
      data-scheme={themedFrame ? theme.resolved : undefined}
      title="Preview"
      {@attach (node) => {
        if (key === frameKey) {
          iframe = node;
          frameSince = performance.now();
        }
      }}
    ></iframe>
  {/each}
{/snippet}

<!-- The page in the well, and what stands over it: the panel's and an
     inset's alike. -->
{#snippet framed()}
  {#if isCanvas}
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
      bind:this={canvasSlot}
    ></div>
  {:else if isBrowser && artifact}
    <BrowserView
      bind:this={browserView}
      addressAtFoot={!!sheet}
      artifactId={artifact.id}
      browser={browserRow}
      bind:form={browserForm}
      {instanceId}
      machine={browserMachine}
      bind:viewing={browserViewing}
    />
  {:else if unopened}
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
          {unopened}
        {/snippet}
        {#snippet action()}
          <Button
            icon={IconRefresh}
            label={commonWords.tryAgain}
            onclick={() => {
              addressTries += 1;
            }}
            pending={addressAsking}
            pendingLabel="Trying again…"
            size="sm"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else if unreached}
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
          {unreachedBy?.said}
          {previewWords.tryingAgain}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              icon={IconRefresh}
              label={commonWords.tryAgain}
              onclick={() => {
                probe += 1;
              }}
              pending={probing}
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
         stage (the graph's chrome round it, the panel's DOM). -->
    {#if inGraph && artifact && link && sheetCanvas}
      <div data-slot="graph-host" class="absolute inset-0">
        <!-- The graph runs to the card's top under the floating head and
             takes its room on its own page (DesignGraph). -->
        <DesignGraph
          bind:head={graphHead}
          changesTools={changesBar}
          modeTools={modeBar}
          {modeCompact}
          ask={artifact.ask ?? ""}
          files={sheetCanvas.files}
          frame={frameTags}
          {inspector}
          {link}
          {keptDials}
          memory={`cawco-graph-kept:${artifact.id}`}
          {keptTuned}
          {startFace}
          ondials={(values) => {
            // His dial values are the artifact's: its doc's `dials`, which
            // the panel's Send counts and artifact_read answers.
            const refused = doc?.keep("dials", values);
            if (refused) {
              failure = { message: refused, again: null };
            }
          }}
          ontuned={(records) => {
            // His tuning of every move is the artifact's: its doc's `tuned` map, which artifact_read answers.
            const refused = doc?.keepTuned(records);
            if (refused) {
              failure = { message: refused, again: null };
            }
          }}
          spec={sheetCanvas.spec}
          stale={linkDown !== null}
        />
      </div>
    {:else}
      {@render frameTags()}
    {/if}
    <div
      data-ready={((loaded || standing !== null) && !stageWaiting) || undefined}
      data-slot="cover"
      aria-hidden={stageWaiting ? undefined : "true"}
      class="group/cover absolute inset-x-0 top-(--side-room,0px) bottom-0 p-space-5 bg-surface-recess pointer-events-none transition-[opacity] duration-(--duration-control) ease-out data-ready:opacity-0"
      role={stageWaiting ? "status" : undefined}
      {@attach (node) => {
        // Ready, the cover and its skeleton go in the skeleton's reveal and
        // the frame comes out of its blur on the same clock (motion/curves).
        if (!((loaded || standing !== null) && !stageWaiting)) {
          coverStood = true;
        } else if (coverStood) {
          coverStood = false;
          revealOn(node, "out");
          if (iframe) {
            revealOn(iframe, "in");
          }
        }
      }}
    >
      <!-- Unseen until the wait has lasted --duration-wait-grace, then fading up
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
        <p class="m-0 text-error-9 text-size-body font-medium">
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
        title={served
          ? sheetWords.serverDownTitle(served.port)
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
            {downPort
              ? `${previewWords.nothingOnPort(downPort)} on ${ownerMachine}, so the page can't load.`
              : `The page's server on ${ownerMachine} isn't running, so the page can't load.`}
            {#if served}
              CawCo starts it again by itself; try again in a moment.
            {:else if offerSession}
              {previewWords.startFromSession}
            {:else}
              Start it again, then try again.
            {/if}
          {:else if shownDown === "reach"}
            The way to the page's server on {ownerMachine} didn't open{shownWhy
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
            The preview comes from {ownerMachine}, which isn't answering the hub{shownWhy
              ? `: ${shownWhy}`
              : "."} Once it answers, try again.
          {/if}
          {#if !down && docDown}
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
  {#if notLoaded && !shownDown && staged?.status !== "error" && !neverDrawn}
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
          {previewWords.notLoadedLine(ownerMachine)}
        {/snippet}
        {#snippet action()}
          {@render frameRetry()}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if picking}
    <PlacePick oncancel={cancelPick} onpick={pickedPlace} />
  {/if}
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
      onclose={() => showList(false)}
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
  <!-- The size container a card's width reads (`--spacing-c-pin-card-reading-w`, two fifths of the well).
       It stands where the frame stands (a component artifact's stage, a page under the head's room), so a place the page says is a place on it. -->
  <div
    data-slot="pin-room"
    class={[
      "@container absolute pointer-events-none",
      frameBox
        ? "start-(--frame-x) top-(--frame-y) w-(--frame-w) h-(--frame-h)"
        : "inset-0",
    ]}
    style:--frame-x={frameBox ? `${frameBox.x}px` : undefined}
    style:--frame-y={frameBox ? `${frameBox.y}px` : undefined}
    style:--frame-w={frameBox ? `${frameBox.w}px` : undefined}
    style:--frame-h={frameBox ? `${frameBox.h}px` : undefined}
    data-mode={mode !== "interact" && !isCanvas ? mode : undefined}
    {@attach measureRoom}
  >
    {#if !(pageHung || isCanvas)}
      {@render composerCard(roomW, roomH)}
    {/if}
    <!-- The drawn pin's card (`drawnPin`); each pin's card is its own, so
         another's never moves to it. -->
    {#if cardPin && kit && replyDraft && !threadPushed && !threadHung}
      {#key cardPin.id}
        {#if floatSheet}
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
  {#if isCanvas && canvasBox}
    <!-- A canvas stands on its own layer over the panel (CanvasStages):
         the composer of a Comment on its ink stands in a room over that
         layer, in the canvas's box, so a place the canvas says is a place
         on it. -->
    <Portal>
      <div
        data-slot="canvas-pin-room"
        class="@container fixed z-(--layer-float) pointer-events-none left-(--frame-x) top-(--frame-y) w-(--frame-w) h-(--frame-h)"
        style:--frame-x={`${canvasBox.x}px`}
        style:--frame-y={`${canvasBox.y}px`}
        style:--frame-w={`${canvasBox.w}px`}
        style:--frame-h={`${canvasBox.h}px`}
      >
        {@render composerCard(canvasBox.w, canvasBox.h)}
      </div>
    </Portal>
  {/if}
  {#if failure || paneRefused}
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
        class="flex-1 basis-c-draft-line min-w-0 m-0 text-error-9 text-size-body font-normal text-pretty wrap-anywhere"
      >
        {failure ? failure.message : paneRefused?.reason}
      </p>
      {#if failure?.again === "reload"}
        <Button
          label={commonWords.tryAgain}
          onclick={retry}
          pending={retrying}
          pendingLabel="Reloading…"
          size="sm"
          variant="outline"
        />
      {:else if !failure && paneRefused}
        <Button
          data-again
          label={commonWords.tryAgain}
          onclick={rerun}
          pending={rerunning}
          pendingLabel="Trying again…"
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
  {/if}
  {#if !(isCanvas || isBrowser || inGraph)}
    <PreviewTools lift={pageFoot} bind:height={toolsHeight}>
      {@render modeBar()}
      {@render changesBar()}
    </PreviewTools>
  {/if}
{/snippet}
