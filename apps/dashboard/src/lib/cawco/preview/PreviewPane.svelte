<script lang="ts">
  import {
    type ActivityLine,
    type ChangedItem,
    newAnswer,
    type PageAnchor,
    type Pin,
    type PreviewMode,
    type PreviewScheme,
    pinProblem,
    previewMode,
    replyAgain,
    type ThreadEntry,
  } from "@cawco/core/comments";
  import type { StagePoint } from "@cawco/core/design-graph";
  import { detach } from "@cawco/core/detach";
  import {
    PREVIEW_LOCKED_MESSAGE,
    type PreviewSettings,
    previewRoute,
    projectPagePlace,
  } from "@cawco/core/frames";
  import { machineLabel } from "@cawco/core/machine-names";
  import { pinName } from "@cawco/core/pin-name";
  import {
    askHubReach,
    PAGE_SILENT_MS,
    PREVIEW_REACH_API,
    previewsNeedWords,
    previewUnreachedWords,
    probePreview,
  } from "@cawco/core/preview-reach";
  import {
    PREVIEW_DOWNS,
    type PreviewDown,
    type ShownFailure,
  } from "@cawco/core/protocol";
  import type { PaneKey } from "@cawco/core/shell-shortcuts";
  import {
    STAGE_CLONE_MS,
    STAGE_READY_MS,
    type StageErrorKind,
  } from "@cawco/core/stage";
  import { humanize } from "@cawco/core/tool-presentation";
  import { artifactWords } from "@cawco/core/words/artifacts";
  import { browserWords } from "@cawco/core/words/browser";
  import { commentWords } from "@cawco/core/words/comments";
  import { commonWords } from "@cawco/core/words/common";
  import { previewWords } from "@cawco/core/words/preview";
  import { sheetWords } from "@cawco/core/words/sheet";
  import { shellWords } from "@cawco/core/words/shell";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { z } from "zod";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import {
    ComposeTargetSchema,
    ThreadEntrySchema,
  } from "#lib/cawco/stored-shapes.js";
  import { track } from "#lib/cawco/track.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import {
    IconAlert,
    IconChat,
    IconChevronLeft,
    IconChevronRight,
    IconComment,
    IconExternal,
    IconEyeClosed,
    IconGlobe,
    IconInteract,
    IconLock,
    IconPen,
    IconPlus,
    IconRefresh,
    IconSend,
    IconTrash,
    IconTuning,
    IconUndock,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { formatTimestamp } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";
  import AskHere from "../AskHere.svelte";
  import {
    artifactShown,
    createDraftCanvas,
    keepThumbnail,
    removeArtifact,
    showArtifact,
    verifyArtifact,
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
  import { artifactReached } from "../files/reached";
  import { frameObserver, frameSize } from "../frame-observer";
  import { resolveSessionTitle } from "../links";
  import {
    type MarkdownFleet,
    markdownFleetAbove,
    provideMarkdownFleet,
  } from "../markdown-fleet";
  import {
    appear,
    dur,
    easeDrawer,
    easeOut,
    motionOk,
    numberOf,
    revealOn,
    rise,
    sheetSlide,
  } from "../motion/curves.svelte";
  import { settleAway } from "../motion/rest.js";
  import { closeInto } from "../motion/share.svelte";
  import { pressOutside } from "../press-outside";
  import { refusals } from "../refusals.svelte";
  import { watchInput } from "../reload.svelte";
  import { runShellShortcut } from "../shell-shortcut";
  import { sideExpand } from "../side/expand";
  import { HEAD_PRIORITY, type HeadItem } from "../side/head";
  import SideSurface from "../side/SideSurface.svelte";
  import { readJson, store, stored, unstore, writeJson } from "../storage";
  import { toast } from "../toasts";
  import { floor as visibleFloor } from "../visible-viewport.svelte";
  import { afterPaint, warm } from "../workspace/warm.svelte";
  import ArtifactMenu from "./ArtifactMenu.svelte";
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
    type RefusedEntries,
    retryComment,
    sendArtifact,
  } from "./artifact-doc";
  import BrowserView from "./BrowserView.svelte";
  import { handBackFromPanel, takeOverFromPanel } from "./browser-acts";
  import CanvasView from "./CanvasView.svelte";
  import ChangeLines, { type ChangeLine } from "./ChangeLines.svelte";
  import CommentRail from "./CommentRail.svelte";
  import CoverState, { type CoverWaiting } from "./CoverState.svelte";
  import { CanvasViewState } from "./canvas-view.svelte";
  import type { CommentDrafts } from "./comment-drafts.svelte";
  import {
    commentAttachments,
    NEXT_COMMENT,
    type RailSort,
  } from "./comment-rows";
  import { DesignGraph } from "./graph/design-graph.svelte";
  import GraphPanel from "./graph/GraphPanel.svelte";
  import { graphOptions } from "./graph/options.svelte";
  import type { NodePin } from "./graph/StateNode.svelte";
  import { loadedPanes } from "./loaded.svelte";
  import CanvasMap from "./map/CanvasMap.svelte";
  import PinFloat from "./PinFloat.svelte";
  import { markFace, markState } from "./PinMark.svelte";
  import PinPeek from "./PinPeek.svelte";
  import PlacePick from "./PlacePick.svelte";
  import { paneFleet } from "./pane-fleet";
  import { enterPreviews, turnedAwayWords } from "./pass";
  import SheetInspector from "./SheetInspector.svelte";
  import { isSetupPage } from "./setup-page";
  import { SheetInspector as Inspector } from "./sheet-inspector.svelte";
  import ThreadSheet from "./ThreadSheet.svelte";
  import {
    type ComposeTarget,
    type PreviewPinAt,
    pageMessage,
    previewBox,
    previewCompose,
    previewDials,
    previewError,
    previewErrorOf,
    previewGraph,
    previewKey,
    previewMove,
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
  } = $props();
  /** The split's expansion, beside a conversation on a desk (SideSplit). */
  const expand = sideExpand();
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
  function showList(open: boolean) {
    listOpen = open;
    store("local", listKey, open ? "open" : "shut");
  }
  /** ⇧C: every pin on the page hidden, or shown (Figma's own key). */
  let pinsShown = $state(true);
  /** The rail, for `/`: its search field takes the keyboard. */
  let rail = $state<ReturnType<typeof CommentRail>>();
  /** The rail in from the well's end, its width growing from none over `--dur-panel` on `--ease-drawer`; with less motion it fades. */
  function railIn(node: HTMLElement) {
    const width = node.offsetWidth;
    return motionOk.current
      ? {
          duration: dur("--dur-panel"),
          easing: easeDrawer,
          css: (t: number) => `width: ${t * width}px; opacity: ${t}`,
        }
      : { duration: dur("--dur-fade"), css: (t: number) => `opacity: ${t}` };
  }
  /** The rail out over `--dur-exit`, its width closing to none; with less motion it fades. */
  function railOut(node: HTMLElement) {
    const width = node.offsetWidth;
    return motionOk.current
      ? {
          duration: dur("--dur-exit"),
          easing: easeOut,
          css: (t: number) => `width: ${t * width}px; opacity: ${t}`,
        }
      : { duration: dur("--dur-exit"), css: (t: number) => `opacity: ${t}` };
  }
  let connected = $state(false);
  let loaded = $state(false);
  let reload = $state(0);
  /**
   * What last went wrong, and what trying again means: the frame's own
   * errors (a capture the page refused) reload the frame; a refused close
   * asks again. A page's own send the hub refused, and a field the hub's
   * bounds refused, have no way back here: the page sends again from its
   * own button, and says a field's problem under the field; the band goes
   * once the page is heard from again.
   */
  let failure = $state<{
    message: string;
    again: "reload" | "close" | null;
  } | null>(null);
  /**
   * An act of the pane's own the hub refused (Verify, a show from the
   * title's menu): said on the same line, with Try again, kept through a
   * reload (refusals.svelte.ts), until a try goes.
   */
  type PaneAct = { act: "verify" } | { act: "show"; id: string; name: string };
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
      if (asked.act === "verify") {
        await verify();
        return;
      }
      try {
        await showArtifact(instanceId, asked.id);
        refusals.delete(actKey);
      } catch (error) {
        refusals.set(actKey, {
          reason: `${asked.name} was not shown: ${failureClause(error)}.`,
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
  // A browser is drawn here from its stream (BrowserView), never framed from an origin.
  const route = $derived(
    preview && preview.artifact.kind !== "browser"
      ? previewRoute(preview, location)
      : null
  );
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
    const failed = await probePreview(origin, (asked) =>
      askHubReach(`${PREVIEW_REACH_API}?origin=${encodeURIComponent(asked)}`)
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
    const seen = inView && onScreen;
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
    portsRead ??= fetch("/api/preview-settings")
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
   * down page (any hop but `closed`, which only a show reopens) in a pane
   * someone has on screen, the origin's ping is probed on the unreached
   * state's backoff (`PROBE_FIRST_MS` doubling to `PROBE_MOST_MS`), and once
   * it answers the frame loads again. Only a pane on screen asks, so a
   * machine coming back starts a listener for the previews being looked at
   * alone (the hub's register starts none). The tries count across the
   * loads, so a hop that stays down is asked ever less often; a page that
   * says it is ready starts the count again.
   */
  let downTries = 0;
  /** Each one probes the down page's origin again: a probe that failed, waiting out its backoff. */
  let downProbe = $state(0);
  $effect(() => {
    const hop = down;
    const origin = paneOrigin;
    const seen = inView && onScreen;
    track(downProbe);
    if (!(hop && hop !== "closed" && origin && seen)) {
      return;
    }
    let live = true;
    const timer = setTimeout(
      () => {
        downTries += 1;
        probePreview(origin, (asked) =>
          askHubReach(
            `${PREVIEW_REACH_API}?origin=${encodeURIComponent(asked)}`
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
  /** To the page, on its own origin alone, once that origin's page said it is ready (`hello`, the answer to it, goes at once). */
  function post(message: object, hello = false) {
    if (paneOrigin && (hello || readyFrom === paneOrigin)) {
      iframe?.contentWindow?.postMessage(message, paneOrigin);
    }
  }
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
  let inView = $state(true);
  let saidFor: string | null = null;
  $effect(() => {
    const seen = () => {
      inView = document.visibilityState === "visible";
    };
    seen();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  });
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
    if (!(revision && id && inView) || saidFor === revision) {
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
   * The person's replies of the pane's the hub refused (artifact-doc.ts
   * `refusedBy`), by pin: each entry as written, and the hub's reason. Kept
   * on the device apart from the doc, as the page keeps its refused
   * comments (overlay artifact.ts `keepRefused`), and drawn in their
   * thread where they stood, unsent, with the reason and Try again
   * ({@link retryPin}). A reload keeps them.
   */
  let refusedReplies = $state.raw<
    Record<string, { entries: ThreadEntry[]; why: string }>
  >({});
  const refusedKey = (id: string) => `cawco-refused-replies:${id}`;
  /** `next` as the pane keeps it, on the device too. */
  function keepReplies(
    id: string,
    next: Record<string, { entries: ThreadEntry[]; why: string }>
  ) {
    refusedReplies = next;
    if (Object.keys(next).length > 0) {
      writeJson(refusedKey(id), next);
    } else {
      unstore("local", refusedKey(id));
    }
  }
  /** A refusal's entries the hub doesn't hold, kept aside with its reason. */
  function keepRefused(id: string, why: string, lost: RefusedEntries[]) {
    const next = { ...refusedReplies };
    for (const { pin, entries } of lost) {
      const was = next[pin]?.entries ?? [];
      const ids = new Set(entries.map((entry) => entry.id));
      next[pin] = {
        entries: [...was.filter((entry) => !ids.has(entry.id)), ...entries],
        why,
      };
    }
    keepReplies(id, next);
  }
  /**
   * The person's replies the hub refused that the page keeps (written
   * through the page, as the app writes them: overlay artifact.ts
   * `refusedReplies`), by pin, as the page last said them
   * (`cawco:page-pins`). Drawn in their thread beside the pane's own, with
   * the reason and Try again, which the page writes again
   * (`cawco:resend-pin`).
   */
  let pageReplies = $state.raw<
    Record<string, { entries: ThreadEntry[]; why: string }>
  >({});
  /** `said` as the page's refused replies, each part checked: what isn't one is left out. */
  function pageRepliesOf(said: unknown) {
    if (!said || typeof said !== "object" || Array.isArray(said)) {
      return {};
    }
    const kept: Record<string, { entries: ThreadEntry[]; why: string }> = {};
    for (const [pin, one] of Object.entries(said)) {
      const { entries, why } = (one ?? {}) as {
        entries?: unknown;
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
      if (valid.length > 0) {
        kept[pin] = { entries: valid, why };
      }
    }
    return kept;
  }
  const pins = $derived.by(() => {
    const held = (view?.pins ?? []).map((pin) => {
      const refused = [
        ...(refusedReplies[pin.id]?.entries ?? []),
        ...(pageReplies[pin.id]?.entries ?? []),
      ];
      return refused.length > 0
        ? { ...pin, thread: [...pin.thread, ...refused] }
        : pin;
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
  /** The first sync has outlasted `--dur-wait-grace`: the list's skeleton stands in (The Real Wait Rule). */
  let readingLong = $state(false);
  $effect(() => {
    if (docSync.state !== "reading") {
      readingLong = false;
      return;
    }
    const grace = setTimeout(() => {
      readingLong = true;
    }, dur("--dur-wait-grace"));
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
  /** Try again on the comments' links: the pane's socket and the page's, each opened again now. */
  function relink() {
    doc?.retry();
    post({ type: "cawco:reconnect" });
  }
  /**
   * The head's line under the name (DESIGN.md, Artifact panel): the ask the
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
  /** Whether the head has room for its line under the name (SideSurface's rule); else the menu says it first. */
  let lineStands = $state(true);
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
    switch (staged?.status) {
      case "starting":
        return served
          ? { line: sheetWords.serverStarting }
          : { dir: staged.dir };
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
    staged?.status === "live" &&
      !(connected || served) &&
      compileErrors.length === 0
  );
  /**
   * How long the cover may stand: the time the daemon gives a stage to serve
   * once started (core `STAGE_READY_MS`), and a place's stage its clone and
   * install first (`STAGE_CLONE_MS`), counted on this pane's clock from when
   * it began waiting. A page still on its way past it was never drawn: the
   * stage's word stopped coming, or the page never compiled, and the pane
   * says so with the ways out, never an endless cover.
   */
  const waitingFor = $derived.by(() => {
    // A failure the proxy named says its own words (`down`).
    if (down) {
      return null;
    }
    switch (staged?.status) {
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
  /** The never-drawn canvas's Remove: destructive, so asked in place under it (AskHere, The Open Page Rule), as the inspector's Remove is. */
  const removeAsks = new Asker<AskHereRequest>();
  function removeShown() {
    const shown = artifact;
    if (!shown) {
      return;
    }
    detach(
      removeAsks.ask({
        at: "never-drawn-remove",
        title: sheetWords.removeTitle(shown.name),
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
  const isSheet = $derived(artifact?.kind === "component");
  /**
   * A page or a sheet draws in the dashboard's theme (the overlay's
   * `themed`): its frame's `color-scheme` is that theme too, so a page that
   * styles dark by `prefers-color-scheme` hears it. A preview is its own app.
   */
  const themedFrame = $derived(artifact?.kind === "page" || isSheet);
  const inspector = $derived.by(() => {
    const id = artifactId;
    const session = instanceId;
    return id && isSheet
      ? new Inspector(post, (change) => writeSheet(session, id, change))
      : null;
  });
  const inspecting = $derived(!!inspector && inspectOpen);
  /** A right panel beside the page on a desk and a tablet; on a phone (the pane as the sheet over the conversation, or the artifact's own tab), a sheet over the page's foot (the spec's §5). */
  const phone = new MediaQuery("(width < 640px)");
  const inspectorLayout = $derived(sheet || phone.current ? "sheet" : "panel");
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
  /**
   * What Send sends (DESIGN.md, How comments reach the session): each pick
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
  /** A pane this wide or wider holds the rail beside its page (DESIGN.md, The Comments rail: "a pane under 640px" takes it as the foot sheet). */
  const RAIL_BESIDE_FROM = 640;
  /** The rail is the well's foot sheet: on a phone, and in a pane under 640px. */
  const railSheet = $derived(
    sheet || phone.current || (paneW > 0 && paneW < RAIL_BESIDE_FROM)
  );
  /**
   * Where the rail stands is known: on a phone or in the drawer at once,
   * else once the pane's width is read. Until then neither rail is drawn,
   * so a narrow pane never draws the rail beside its page for a frame and
   * trades it for the foot sheet.
   */
  const railPlaced = $derived(sheet || phone.current || paneW > 0);
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
        z.object({ entries: z.array(ThreadEntrySchema), why: z.string() })
      ),
      {}
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
    if (shown) {
      noteArtifact(shown.id, {
        instanceId,
        kind: shown.kind,
        name: shown.name,
      });
    }
  });

  /*
   * The setup page is done once the person sends it from the page (its own
   * `cawco.send`, which stamps the doc's `sentAt`): on a phone its sheet
   * stands over the thread, where Caw answers with the files and "Open the
   * board". The `sentAt` it opened with is not a send.
   */
  /**
   * Send: the hub's send, which applies a setup page's fleet choices and
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
   * or it stands only in the page's doc, which hasn't reached the hub (what
   * closed its link, else that it hasn't yet), kept on the device meanwhile.
   */
  const notSentWhy = (pin: Pin): string | null =>
    refusedReplies[pin.id]?.why ??
    pageReplies[pin.id]?.why ??
    pin.notSent?.why ??
    (onlyOnPage(pin.id) ? (linkDown ?? commentWords.notOnHub) : null);
  /** How long a comment only the page holds is given to reach the hub, once its link is opened again, before its Try again says it didn't. Our call. */
  const REACH_HUB_MS = 10_000;
  /** A reason's own full stop, which the sentence that quotes it puts back. */
  const REASON_STOP = /\.$/u;
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
          reject(
            new Error(
              `This comment hasn't reached the hub: ${(linkDown ?? commentWords.notOnHub).replace(REASON_STOP, "")}. It's kept on this device, and goes once its link is back.`
            )
          );
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
   * A refused reply's Try again: each of its words written into the pane's
   * doc again, now the hub's (artifact-doc.ts `again`), and let go of once
   * written; one still refused stays with why.
   */
  function retryRefused(artifactKey: string, id: string) {
    const kept = refusedReplies[id];
    if (!(kept && doc)) {
      throw new Error(
        "The pane lost the page's document, so the reply wasn't kept. Reload, then try again."
      );
    }
    const live = doc;
    const { left, why } = replyAgain(refusedReplies, id, (said) =>
      live.reply(id, said)
    );
    keepReplies(artifactKey, left);
    if (why) {
      throw new Error(why);
    }
  }
  let sentSeen: string | null | undefined;
  $effect(() => {
    if (!view) {
      sentSeen = undefined;
      return;
    }
    const at = view.sentAt;
    const was = sentSeen;
    sentSeen = at;
    if (
      was !== undefined &&
      at &&
      at !== was &&
      sheet &&
      isSetupPage(artifact, owner?.projectId)
    ) {
      untrack(close);
    }
  });
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
  /** Tells the page which artifact it is, where its doc is synced, and the dashboard's theme. */
  function announce() {
    connected = false;
    post(
      {
        type: "cawco:hello",
        theme: theme.resolved,
        ...(artifact
          ? {
              artifact: {
                id: artifact.id,
                kind: artifact.kind,
                name: artifact.name,
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
   * The comments (Projects spec §5.7; DESIGN.md, Placing a comment, The
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
   * The pin whose card is going back into its pill, closed: it stays drawn
   * until it has (PinFloat `onclosed`), so its pin opened again before then
   * turns the same card back (PinFloat `open`).
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
  let roomEl: HTMLElement | null = null;
  const measureRoom = frameSize<HTMLElement>((node) => {
    roomEl = node;
    roomW = node.clientWidth;
    roomH = node.clientHeight;
  });

  /* --- Pins on a design graph's state (the primitives spec §4.3) ------------ */

  /** A comment being written on a state as a whole: the state, its name; null while a page element's is (or none). */
  let nodeComposing = $state.raw<{ name: string; point: StagePoint } | null>(
    null
  );
  /** A state's node in the graph, as a pill's place: its box in the pin room, the pill's at its top-right. */
  function nodeAt(point: StagePoint): PreviewPinAt | null {
    const graphEl = roomEl?.parentElement?.querySelector(
      `[data-design-graph="${CSS.escape(point.file)}"]`
    );
    const node =
      graphEl?.querySelector<HTMLElement>(
        `[data-chip="${CSS.escape(`${point.story}|${point.interaction}`)}"]`
      ) ??
      graphEl?.querySelector<HTMLElement>(
        `[data-node="${CSS.escape(point.story)}"]`
      );
    if (!(node && roomEl)) {
      return null;
    }
    const at = roomEl.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const pill = numberOf("--c-pin");
    return {
      box: {
        x: box.left - at.left,
        y: box.top - at.top,
        w: box.width,
        h: box.height,
      },
      mark: {
        x: box.right - at.left - pill - numberOf("--space-1"),
        y: box.top - at.top - pill / 2,
        w: pill,
        h: pill,
      },
    };
  }
  /** Comment mode, a press on a state in the graph: the composer opens beside its node, to pin the state as a whole. */
  function pinNode(point: StagePoint) {
    if (openPin) {
      closeCard();
    }
    loadKit();
    dropPeek();
    const name = humanize(point.story);
    nodeComposing = { name, point };
    composing = {
      at: nodeAt(point),
      chain: [
        {
          anchor: { selector: "", text: name },
          elements: [],
        },
      ],
      chosen: 0,
      error: "",
      sending: false,
    };
  }
  // Call 6's side, told to the page: pins on other states dimmed there, or hidden.
  $effect(() => {
    const dimmed = graphOptions.sides.otherPins === "dimmed";
    if (designGraph && loaded) {
      post({ type: "cawco:other-pins", dimmed });
    }
  });
  /** A rail row on another state: that state is kept, and once the page stands it, the thread opens there. */
  function goToPinState(pin: Pin) {
    const point = designGraph?.pointOfPin(pin.anchor);
    if (!(designGraph && point)) {
      openCard(pin.id);
      return;
    }
    designGraph.keepAt(point);
    // The page stands the state in its next frames; the thread asks its pill's place after it.
    requestAnimationFrame(() => requestAnimationFrame(() => openCard(pin.id)));
  }
  /** A pin's scheme as the canvas's view stands: light or dark where it is set, else the page's own. */
  const schemeOfView = (
    scheme: PreviewScheme | undefined
  ): NonNullable<NonNullable<PageAnchor["sheet"]>["state"]>["scheme"] =>
    scheme === "both" || scheme === undefined ? "page" : scheme;
  /** The pins on each state's node, by story, for the graph to draw: open ones, and a resolved one while its thread is open. */
  const nodePins = $derived.by(() => {
    const held = new Map<string, NodePin[]>();
    for (const pin of view?.pins ?? []) {
      const onNode = "sheet" in pin.anchor ? pin.anchor.sheet : undefined;
      if (!onNode?.node || (pin.resolvedAt && pin.id !== openPin)) {
        continue;
      }
      held.set(onNode.story, [
        ...(held.get(onNode.story) ?? []),
        { id: pin.id, number: pin.number, state: markState(pin) },
      ]);
    }
    return held;
  });
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
    } else if (floatSheet || !connected || pinHeard === openPin) {
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
  /** The rail's foot sheet (a phone, a pane under 640px) stands aside while a thread, a composer or a place picker stands, so neither covers the other. */
  const railAway = $derived(
    listOpen && railSheet && (!!cardPin || !!composing || !!picking)
  );
  /**
   * How much of the well's foot a software keyboard covers, px: what stands
   * at the foot over the page (the Comments sheet, a thread's or the
   * composer's foot sheet, the inspector's sheet) is lifted by it, so the
   * field being typed in stands over the keyboard while the page under them
   * keeps its box (a phone's preview sheet holds its place for a field of
   * its own: SideSheet). Written on the well as `--keyboard-lift`; 0 with
   * no keyboard, and under a pinch zoom (`floor.bottom` 0). Read as the
   * visible area is published and as the well resizes, in the frame after.
   */
  $effect(() => {
    const node = well;
    const { bottom } = visibleFloor;
    if (!node) {
      return;
    }
    const read = () => {
      const covered =
        bottom > 0
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
  let listFilter = $state<"check" | "open" | "resolved">("open");
  let listScroll = $state(0);
  /**
   * What the host's chrome covers of the page, told to its overlay
   * (`cawco:covered`, the page's viewport px): on a phone, the thread or the
   * composer standing at the well's foot. A pin the pane opens is brought
   * out from under them (pins.ts `reveal`). Told again as either resizes,
   * and as nothing once neither stands. The rail's foot sheet is a layer
   * over the page that never moves it: it stands aside for a thread
   * (`railAway`), so no pin is brought out from under it.
   */
  $effect(() => {
    const frame = iframe;
    const sheetCard = floatSheet ? (cardFloat ?? composerFloat ?? null) : null;
    if (!(frame && connected)) {
      return;
    }
    const covering = [sheetCard].filter((el): el is HTMLElement => !!el);
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
  $effect(() => {
    const anchors = unseenChanges
      .filter((item) => item.kind === "element" || item.kind === "card")
      .map((item) => item.anchor);
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
  /** A step of the tag: by one stop each way, or the first when it starts; brought out, chosen and seen. */
  function stepChange(by: 1 | -1 | 0) {
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
      openCard(stop.pin, "key");
    }
  }
  /** The person pressed a ringed element in Interact mode: he has looked at it. */
  function changePressed(anchor: unknown) {
    const revision = view?.changes?.revision;
    if (typeof anchor === "string" && revision !== undefined) {
      doc?.seeChanges(revision, [anchor]);
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
    const held = new Set(pins.map((pin) => pin.id));
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
      pins.find((pin) => pin.id === id)?.number ?? 0;
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
        (checking.byPin.get(id) ?? []).map((item) => item.anchor),
        0
      );
    } catch (error) {
      failure = { message: failureWords(error), again: null };
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
  /** A To check row pressed: its thread opens, and its first change is brought out. */
  function openChecked(id: string, via: "key" | "pointer") {
    const [first] = checking.byPin.get(id) ?? [];
    openCard(id, via);
    if (first && !first.anchor.startsWith("removed:")) {
      post({
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
    const id = artifactId;
    if (
      !id ||
      listHold !== "ready" ||
      checkedFor === id ||
      isCanvas ||
      !railPlaced
    ) {
      return;
    }
    checkedFor = id;
    if (!railSheet && untrack(() => checkCount) > 0) {
      untrack(() => {
        listFilter = "check";
        showList(true);
      });
    }
  });

  /** J and K step the tag while it holds the focus; elsewhere they step the pins. */
  function tagKey(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (key === "j" || key === "k") {
      event.preventDefault();
      stepChange(key === "j" ? 1 : -1);
    }
  }

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
    // A pin on a state as a whole stands on its node: its card beside it, no page to ask.
    const opening = pins.find((one) => one.id === id);
    const onNode =
      opening && "sheet" in opening.anchor ? opening.anchor.sheet : undefined;
    if (onNode?.node && onNode.state) {
      pinAt = nodeAt({
        file: onNode.file,
        story: onNode.story,
        interaction: onNode.state.interaction,
      });
      pinHeard = id;
      return;
    }
    post({ type: "cawco:track-pin", id });
    // Brought into view in one step, not a glide: its card stands where its
    // pill lands, and the page tells that place once.
    focusPin(id, true, { instant: true, keyed: via === "key" });
  }
  /**
   * The thread closes: its Close, Esc, another row or pin opened (`swap`:
   * its card stays as it stands until the next one's place is heard, then
   * goes at once, so no frame shows it beside the next). Closed, its card
   * beside the pill goes back into it, drawn until it has (`closingPin`).
   * Its reply's words stay with its pin.
   */
  function closeCard(swap = false) {
    const id = openPin;
    if (!swap && id && drawnPin === id && !floatSheet) {
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
  function cancelComposer() {
    if (!composing) {
      return;
    }
    composing = null;
    if (nodeComposing) {
      nodeComposing = null;
      return;
    }
    if (nextDraft?.hasContent) {
      post({ type: "cawco:compose-park" });
      keepDraftAt(keptDraft ? { ...keptDraft, parked: true } : null);
    } else {
      post({ type: "cawco:compose-cancel" });
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
  /** Comment: the words and what they carry go to the page, which writes the pin and its first entry at once. */
  function comment(text: string) {
    if (!(composing && nextDraft)) {
      return;
    }
    const said = saidIn(nextDraft, text);
    composing.error = "";
    if (nodeComposing) {
      // A state as a whole: the pane writes it on the doc it joins, no element of the page's.
      const { name, point } = nodeComposing;
      const written = doc?.comment(
        {
          anchor: {
            selector: "",
            source: null,
            text: name,
            sheet: {
              file: point.file,
              story: point.story,
              node: true,
              state: {
                interaction: point.interaction,
                scheme: schemeOfView(canvasView?.chosen.scheme),
                width: null,
              },
            },
          },
          elements: [],
          title: name,
        },
        said
      );
      if (typeof written === "string" || !written) {
        composing.error =
          written ?? "The page didn't keep that comment. Try again.";
        return;
      }
      composing = null;
      nodeComposing = null;
      drafts?.discard(NEXT_COMMENT);
      focusedPin = written.id;
      return;
    }
    composing.sending = true;
    post({ type: "cawco:comment", ...said });
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
  function reply(text: string) {
    const draft = replyDraft;
    if (!(openPin && draft)) {
      return;
    }
    const said = saidIn(draft, text);
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
   * The pill the pointer rests on, its peek beside it (comment design §4):
   * after `--dur-peek` the first time, at once while one is up or
   * just went; never under a finger.
   */
  let peekAt = $state<{ id: string; mark: PreviewPinAt["mark"] } | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the last peek went: the next within `--dur-peek` comes at once. */
  let peekWent = 0;
  function heardPeek(message: Record<string, unknown>) {
    clearTimeout(peekTimer);
    const id = previewPinId(message.id);
    const mark = previewBox(message.mark);
    // None under a finger, and none while a thread or a composer stands.
    if (!(id && mark) || coarse.current || openPin || composing) {
      if (peekAt) {
        peekWent = performance.now();
      }
      peekAt = null;
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
  /** Every peek goes as a thread or a composer opens: one left up would stand over what it opens on. */
  function dropPeek() {
    clearTimeout(peekTimer);
    peekAt = null;
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
   * or Draw back to Interact.
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
      } else if (mode === "interact") {
        // Heard from the page (`cawco:key`): with nothing of the pane's to
        // close, Esc gives the split back. The window's Esc is SideSplit's.
        expand?.collapse();
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
    if (event.data?.type === "cawco:down") {
      heardDown(event.data);
      return;
    }
    if (event.data?.type === PREVIEW_LOCKED_MESSAGE) {
      turnedAway();
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
        // Close or Esc alone.
        cancelComposer();
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
          pressKey(name);
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
      case "cawco:graph": {
        // A component canvas's page said its sections and stories: the design graph's.
        const said = previewGraph(message.graph);
        if (said && designGraph) {
          designGraph.heard(said);
        }
        break;
      }
      case "cawco:move":
        // Its kept move as the page played it, or none: the design graph's dock.
        designGraph?.heardMove(previewMove(message.move));
        break;
      case "cawco:dials":
        // The agent's dials and the values its frames draw with: under the design graph.
        designGraph?.heardDials(previewDials(message.dials));
        break;
      case "cawco:sheet": {
        // A sheet's page said its stories and props: the inspector's controls.
        const said = previewSheet(message.sheet);
        if (said && inspector) {
          inspector.heard(said);
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
   * to land in, and the pane simply leaves.
   */
  let section = $state<HTMLElement>();
  let shown = false;
  $effect(() => {
    const open = preview?.state === "open";
    if (shown && !open && section && artifact) {
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
    await goto(fleet.sessionHref(instanceId));
  }
  /*
   * A canvas stands on its stage (canvas/stage.svelte.ts), one iframe for it
   * wherever it is: the well holds a slot the stage stands over, so Dock and
   * Undock fly that same iframe between the composer and here.
   */
  const isCanvas = $derived(artifact?.kind === "canvas");
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
  /** The head's +: a new canvas, standing here at once. */
  let making = $state(false);
  async function newCanvas() {
    making = true;
    try {
      const made = await createDraftCanvas(instanceId);
      await showArtifact(instanceId, made.id);
    } catch (error) {
      failure = {
        message: `The canvas couldn't be made: ${failureClause(error)}. Try + again.`,
        again: null,
      };
    } finally {
      making = false;
    }
  }

  let closing = $state(false);
  async function close() {
    closing = true;
    try {
      await fleet.closePreview(instanceId);
    } catch (error) {
      failure = {
        message: failureWords(error),
        again: "close",
      };
    } finally {
      closing = false;
    }
  }
  /** A component canvas's view, one for its head button and More's submenu alike; each load of the page takes the view kept for this session. */
  const canvasView = $derived.by(() => {
    const session = instanceId;
    // Built untracked: the view depends on the session and the kind alone,
    // never on the state it holds, which the effect below sends (nightly
    // 4202's crash was a view's effect re-running on the state it wrote).
    return isSheet ? untrack(() => new CanvasViewState(session, post)) : null;
  });
  $effect(() => {
    const held = canvasView;
    if (connected && held) {
      untrack(() => held.send(held.chosen));
    }
  });
  /**
   * A component canvas's design graph (Projects spec §5.10, "The design
   * graph"): built once per session and kind, as the view is; the page says
   * what it holds (`cawco:graph`) and the graph asks it what to stand.
   */
  const designGraph = $derived.by(() => {
    const session = instanceId;
    return isSheet ? untrack(() => new DesignGraph(session, post)) : null;
  });
  $effect(() => {
    const held = designGraph;
    if (connected && held) {
      untrack(() => held.again());
    }
  });
  // The inspector's controls are for the state the graph keeps: the one standing on the page.
  $effect(() => {
    const story = designGraph?.keptHere?.story;
    const held = inspector;
    if (
      story &&
      held?.sheet?.stories.some((one) => one.name === story) &&
      untrack(() => held.chosen) !== story
    ) {
      untrack(() => held.choose(story));
    }
  });
  /** The canvas view's Verify: a design system round on the canvas, its verdict to the session; the hub's sentence says what it did. */
  let verifying = $state(false);
  async function verify() {
    if (!artifact) {
      return;
    }
    verifying = true;
    const key = actKey;
    try {
      toast.info(await verifyArtifact(instanceId, artifact.id));
      if ((refusals.get(key)?.asked as PaneAct | undefined)?.act === "verify") {
        refusals.delete(key);
      }
    } catch (error) {
      // Said on the pane's own line, with Try again, never a toast
      // (DESIGN.md, The Work Outlives Its Surface Rule).
      refusals.set(key, {
        reason: `${artifact.name} was not verified: ${failureClause(error)}. The canvas stays as it is.`,
        asked: { act: "verify" } satisfies PaneAct,
      });
    } finally {
      verifying = false;
    }
  }

  /** The mode's glyph and word, for its one-button form. */
  const MODE_GLYPHS = {
    interact: IconInteract,
    comment: IconComment,
    draw: IconPen,
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

  /** The head's controls in head order, each standing by the head's priority rule while there is room (side/head.ts). */
  const headItems = $derived.by(() => {
    const all: HeadItem[] = [];
    if (isBrowser && browserRow) {
      all.push({
        key: "control",
        priority: HEAD_PRIORITY.control,
        bar: controlBar,
        menu: controlMenu,
      });
    }
    // A decision page's one Send is its own, at its foot (its doc's
    // `ownSend`): the head stands none for it.
    if (artifact && unsentCount > 0 && !view?.ownSend) {
      all.push({
        key: "send",
        priority: HEAD_PRIORITY.send,
        bar: sendBar,
        menu: sendMenu,
        words: true,
      });
    }
    if (!ownTab) {
      all.push({
        key: "create",
        priority: HEAD_PRIORITY.create,
        bar: createBar,
        menu: createMenu,
      });
    }
    if (canUndock) {
      all.push({
        key: "undock",
        priority: HEAD_PRIORITY.undock,
        bar: undockBar,
        menu: undockMenu,
      });
    }
    if (artifact && !ownTab) {
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
    if (isBrowser) {
      return all;
    }
    if (!isCanvas) {
      all.push({
        key: "mode",
        priority: HEAD_PRIORITY.mode,
        bar: modeBar,
        compact: modeCompact,
        menu: modeMenu,
        group: true,
      });
      all.push({
        key: "comments",
        priority: HEAD_PRIORITY.comments,
        bar: commentsBar,
        menu: commentsMenu,
        count: { glyph: IconChat, n: listOpen ? 0 : openCount, of: "Comments" },
        words: true,
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
      onclick={retry}
      pending={retrying}
      pendingLabel={previewWords.reloading}
      size="sm"
      variant="outline"
    />
    {#if offerSession && owner}
      <Button
        href={fleet.sessionHref(owner.id)}
        pad="none"
        label={`Open ${ownerName}`}
        size="sm"
        variant="link"
      />
    {/if}
  </div>
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
     (SideSurface `items`, by the head's priority rule). -->
{#snippet sendBar()}
  <!-- What of the page the session hasn't heard, picks and comments alike: one press sends it all. -->
  <Button
    data-slot="send"
    aria-label={`${commentWords.send}, ${unsentCount} unsent`}
    onclick={() => sendAll("panel-head")}
    pending={sending}
    size="sm"
    title="Send what the session hasn't heard"
    variant="ghost"
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
    size="sm"
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

{#snippet createBar()}
  <Button
    aria-label="New canvas"
    icon={IconPlus}
    onclick={newCanvas}
    pending={making}
    size="icon-sm"
    title="New canvas"
    variant="ghost"
  />
{/snippet}
{#snippet createMenu()}
  <DropdownMenu.Item
    disabled={making}
    onSelect={whileIdle(() => making, newCanvas)}
  >
    <IconPlus /><span>New canvas</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet undockBar()}
  <Button
    data-slot="other"
    aria-label="Undock"
    dimmed={mode !== "interact" && !isCanvas}
    disabled={!stage}
    onclick={() => giveBack(false)}
    size="icon-sm"
    title="Undock"
    variant="ghost"
  >
    <IconUndock />
  </Button>
{/snippet}
{#snippet undockMenu()}
  <DropdownMenu.Item disabled={!stage} onSelect={() => giveBack(false)}>
    <IconUndock /><span>Undock</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet openBar()}
  {#if artifact}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <Button
      data-slot="other"
      aria-label="Open in new tab"
      dimmed={mode !== "interact" && !isCanvas}
      href={`/artifact/${encodeURIComponent(artifact.id)}`}
      rel="noopener"
      size="icon-sm"
      target="_blank"
      title="Open in new tab"
      variant="ghost"><IconExternal /></Button
    >
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

{#snippet viewBar()}
  {#if canvasView}
    <!-- A component canvas's view: its frames' scheme, widths, motion and zoom. -->
    <CanvasView
      graph={designGraph}
      onverify={verify}
      view={canvasView}
      {verifying}
    />
  {/if}
{/snippet}
{#snippet viewMenu()}
  {#if canvasView}
    <CanvasView
      as="sub"
      graph={designGraph}
      onverify={verify}
      view={canvasView}
      {verifying}
    />
  {/if}
{/snippet}

{#snippet inspectBar()}
  <!-- A sheet's inspector: its stories' props as controls, beside the page or over its foot. -->
  <Toggle
    aria-label={artifactWords.inspect}
    onPressedChange={(open) => showInspector(open)}
    pressed={inspectOpen}
    size="sm"
    title={artifactWords.inspectTitle}
  >
    <IconTuning />
  </Toggle>
{/snippet}
{#snippet inspectMenu()}
  <DropdownMenu.CheckboxItem
    checked={inspectOpen}
    onCheckedChange={(open) => showInspector(open)}
    >{artifactWords.inspect}</DropdownMenu.CheckboxItem
  >
{/snippet}

{#snippet modeBar()}
  <!-- The mode: Interact, Comment, Draw (V, C, D; Esc back to Interact),
       the kit's segmented control, its indicator on the chosen one. -->
  <div data-slot="modes">
    <Tabs
      onValueChange={(next) => setMode(previewMode(next) ?? "interact")}
      size="compact"
      value={mode}
      values={["interact", "comment", "draw"]}
    >
      <TabsList aria-label={previewWords.previewMode}>
        <TabItem
          aria-keyshortcuts="V"
          glyphOnly
          icon={IconInteract}
          label="Interact"
          title="Interact (V): the page gets every click"
          value="interact"
        />
        <TabItem
          aria-keyshortcuts="C"
          glyphOnly
          icon={IconComment}
          label="Comment"
          title="Comment (C): a click pins a comment"
          value="comment"
        />
        <TabItem
          aria-keyshortcuts="D"
          glyphOnly
          icon={IconPen}
          label="Draw"
          title="Draw (D): drag to draw on the page"
          value="draw"
        />
      </TabsList>
    </Tabs>
  </div>
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

<!-- The mode as one button where the head has no room for its three
     segments: the chosen mode's glyph, opening the three. -->
{#snippet modeCompact()}
  {@const Glyph = MODE_GLYPHS[mode]}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label={`Mode: ${MODE_WORDS[mode]}`}
      size="icon-sm"
      title={`Mode: ${MODE_WORDS[mode]} (V, C, D)`}
      variant="ghost"
    >
      <Glyph />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" width="compact">
      {@render modeMenu()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

{#snippet commentsBar()}
  <!-- The Comments rail's toggle; the count is the open comments', drawn only while the rail is shut. -->
  <Button
    data-slot="comments"
    aria-expanded={listOpen}
    aria-label={`Comments${openCount > 0 ? `, ${openCount} open` : ""}${pinsShown ? "" : ", pins hidden"}${linkDown ? `, ${NOT_REACHING}` : ""}`}
    data-link-down={linkDown ? "" : undefined}
    expanded="pressed"
    onclick={() => showList(!listOpen)}
    size="sm"
    title={commentsTitle}
    variant="ghost"
  >
    <IconChat /><span class="in-form-compact:hidden" data-slot="comments-label"
      >Comments</span
    >
    {#if openCount > 0 && !listOpen}
      <span data-slot="count" class="min-w-c-count-digit">{openCount}</span>
    {/if}
    {#if !pinsShown}
      <!-- ⇧C hid the pins: said where the person looks for them. -->
      <IconEyeClosed />
    {/if}
    {#if linkDown}
      <!-- The comments aren't reaching the agent: said where the person looks for them, why in the panel. -->
      <IconWarningTriangle class="text-data-bad" />
    {/if}
  </Button>
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
  <Button
    data-slot="other"
    aria-label="Reload"
    dimmed={mode !== "interact" && !isCanvas}
    onclick={reloadPage}
    size="icon-sm"
    title="Reload"
    variant="ghost"
  >
    <IconRefresh />
  </Button>
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item onSelect={reloadPage}>
    <IconRefresh /><span>Reload</span>
  </DropdownMenu.Item>
{/snippet}

<!-- The card beside the conversation (SideSurface): the switch, the
     page's name and place (never "Preview" again under the switch that says
     it), the preview's own controls, Close; the page in the well. -->
{#snippet artifactTitle()}
  {#if artifact}
    <ArtifactMenu
      {instanceId}
      held={preview?.artifacts}
      line={headLine}
      lineDropped={!lineStands}
      lineId={`${paneId}-line`}
      onrefused={(reason, chosen) => {
        refusals.set(actKey, {
          reason,
          asked: {
            act: "show",
            id: chosen.id,
            name: chosen.name,
          } satisfies PaneAct,
        });
      }}
      shown={artifact}
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
    onother={designGraph ? goToPinState : undefined}
    stateOf={designGraph
      ? (pin) => ({
          here: designGraph.onKept(pin.anchor),
          words: designGraph.stateWords(pin.anchor),
        })
      : undefined}
    focused={focusedPin}
    hold={listHold}
    {layout}
    {live}
    onclose={() => showList(false)}
    onhover={(id) => post({ type: "cawco:hover-pin", id })}
    onopen={(id, via) =>
      listFilter === "check" ? openChecked(id, via) : openCard(id, via)}
    checks={isCanvas
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
      post({ type: "cawco:compose-page" });
    }}
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

<!-- The Comments rail beside the well, on the card, outside the page's
     mode seam (DESIGN.md, The Comments rail): in from its end over
     `--dur-panel` on `--ease-drawer`, out over `--dur-exit`; with less
     motion it fades. -->
{#snippet railBeside()}
  {#if listOpen && railPlaced && !isCanvas && !railSheet}
    <div
      class="flex flex-none min-h-0 overflow-hidden"
      data-slot="rail-beside"
      in:railIn
      out:railOut
    >
      {@render railOf("beside")}
    </div>
  {/if}
{/snippet}

{#if inset}
  <!-- Inset: no head and no modes; the page as the panel draws it. -->
  <section
    data-slot="preview-pane"
    data-preview-inset
    aria-label={artifact?.name ?? "Preview"}
    class="@container flex flex-col flex-1 min-h-0"
    bind:this={section}
  >
    {@render changesBar()}
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
    closeFailed={failure?.again === "close"}
    {closing}
    items={headItems}
    label="Preview"
    onclose={ownTab ? backToSession : close}
    subtitle={headLine}
    subtitleId={`${paneId}-line`}
    {switcher}
    titleControl={artifact ? artifactTitle : undefined}
    above={changesBar}
    beside={railBeside}
    bind:section
    bind:subtitleStands={lineStands}
    bind:well
  >
    {@render framed()}
  </SideSurface>
{/if}

<!-- Changed since you looked, in its own room above the well (DESIGN.md, Changed since you looked). -->
{#snippet changesBar()}
  {#if changeStops.length > 0 && !isCanvas}
    {@const total = tour?.length ?? changeStops.length}
    <!-- Changed since you looked: its own bar between the head and the
           well, so it never stands over the page (the page starts under
           it), stepping through the stops (‹ ›; J and K while it holds the
           focus). -->
    <div
      data-slot="changes-bar"
      class="flex flex-none justify-center min-w-0 pb-space-2"
      in:rise={"--dur-panel"}
      out:rise={"--dur-exit"}
    >
      <fieldset
        data-slot="changes-tag"
        aria-label={commentWords.changedSince(total)}
        class="mark-line w-fit max-w-full p-0 m-0 min-w-0 flex items-center h-c-btn-h-sm coarse:h-c-btn-h-lg border border-border-hairline rounded-md bg-surface-raised text-size-label font-medium text-ink-strong"
      >
        <button
          aria-label={commentWords.previousChange}
          class="touch-hit grid place-items-center h-full px-space-2 rounded-s-md text-ink-muted can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
          data-box
          data-slot="change-previous"
          onkeydown={tagKey}
          onclick={() => stepChange(-1)}
          title={commentWords.previousChange}
          type="button"
        >
          <IconChevronLeft class="size-icon-md" />
        </button>
        <button
          class="touch-hit min-w-0 h-full px-space-1 overflow-clip text-ellipsis whitespace-nowrap num can-hover:hover:bg-surface-hover"
          data-slot="change-count"
          onkeydown={tagKey}
          onclick={() => stepChange(tour ? 0 : 1)}
          type="button"
        >
          {tour
            ? commentWords.changeOf(tourAt + 1, total)
            : commentWords.changedSince(total)}
        </button>
        <button
          aria-label={commentWords.nextChange}
          class="touch-hit grid place-items-center h-full px-space-2 rounded-e-md text-ink-muted can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
          data-box
          data-slot="change-next"
          onkeydown={tagKey}
          onclick={() => stepChange(1)}
          title={commentWords.nextChange}
          type="button"
        >
          <IconChevronRight class="size-icon-md" />
        </button>
      </fieldset>
    </div>
  {/if}
{/snippet}

<!-- The page in the well, and what stands over it: the panel's and an
     inset's alike. -->
{#snippet framed()}
  {#if isCanvas}
    <!-- The canvas's stage stands over this box: its one iframe. -->
    <div
      data-slot="canvas-slot"
      aria-hidden="true"
      class="absolute inset-0 pointer-events-none"
      bind:this={canvasSlot}
    ></div>
  {:else if isBrowser && artifact}
    <BrowserView
      artifactId={artifact.id}
      browser={browserRow}
      {instanceId}
      machine={browserMachine}
    />
  {:else if unreached}
    <!-- This tab can't reach the preview's own origin: what failed, by its
         own cause, its fix, and where to switch how previews are reached. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
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
    <!-- The frame loads once its origin answered the probe; the cover stands meanwhile. -->
    {#each reached?.origin === paneOrigin ? frames : [] as key (key)}
      {@const current = key === frameKey}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
      <!-- biome-ignore lint/security/useIframeSandbox: the previewed app runs on its own origin (the preview proxy's), which is the boundary; a sandbox would take the forms, popups and downloads it is being tried with. -->
      <iframe
        data-ready={!current || loaded || undefined}
        data-panel-inspector={(inspecting && inspectorLayout === "panel") ||
          undefined}
        class="absolute inset-0 scheme-light scheme-dark:scheme-dark bg-system-canvas block size-full border-none border-current opacity-0 transition-[opacity] duration-(--dur-control) ease-out data-ready:opacity-100 data-panel-inspector:w-(--frame-w)"
        style:--frame-w="calc(100% - var(--c-sheet-inspector-w))"
        allow="clipboard-write"
        inert={!current}
        onerror={() => arrived(key)}
        onload={(event) => {
          arrived(key);
          // Input inside the frame never reaches this page: heard there, it
          // keeps a tab in use from reloading under its reader.
          try {
            const inner = (event.currentTarget as HTMLIFrameElement)
              .contentWindow;
            if (inner) {
              watchInput(inner);
            }
          } catch {
            // A frame of another origin: its input is not ours to hear.
          }
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
    <div
      data-ready={((loaded || standing !== null) && !stageWaiting) || undefined}
      data-slot="cover"
      aria-hidden={stageWaiting ? undefined : "true"}
      class="group/cover absolute inset-0 p-space-5 bg-surface-recess pointer-events-none transition-[opacity] duration-(--dur-control) ease-out data-ready:opacity-0"
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
    {#if designGraph && !canvasView?.map}
      <!-- The design graph over the page: a state previewed on a hover, kept on a press; clear of an inspector beside it. -->
      <GraphPanel
        address={paneOrigin && loaded ? `${paneOrigin}${startAt}` : null}
        commenting={mode === "comment"}
        end={inspecting && inspectorLayout === "panel"}
        graph={designGraph}
        {nodePins}
        onopenpin={(id) => openCard(id)}
        onpin={pinNode}
      />
    {/if}
    {#if canvasView?.map && artifact && isSheet}
      <!-- Map mode: the canvas's component among what renders it and what it renders, over the page, which stays loaded under it. -->
      <CanvasMap
        address={paneOrigin ? `${paneOrigin}${startAt}` : null}
        artifactId={artifact.id}
        {instanceId}
        ready={loaded}
        revision={preview?.revision ?? ""}
        view={canvasView.chosen}
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
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
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
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
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
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={downTitle}>
        {#snippet line()}
          {#if shownDown === "workspace"}
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
          {:else}
            The preview comes from {ownerMachine}, which isn't connected to the
            hub right now. Once it's back, try again.
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
        {#snippet action()}
          {@render frameRetry()}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if notLoaded && !shownDown && staged?.status !== "error" && !neverDrawn}
    <!-- The browser's own error page stands in the frame: said in words, with the way back. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
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
  {#if inspector && inspecting && !unreached}
    <SheetInspector
      {inspector}
      layout={inspectorLayout}
      onclose={() => showInspector(false)}
    />
  {/if}
  {#if picking}
    <PlacePick oncancel={cancelPick} onpick={pickedPlace} />
  {/if}
  {#if listOpen && railPlaced && !isCanvas && railSheet && !railAway}
    <!-- The rail as the well's foot sheet, at most 60% of it: on a phone and
         in a pane under 640px. A layer over the page (DESIGN.md, The
         Comments rail): the frame keeps its whole box under it, so the page
         neither moves, resizes nor scrolls as it opens, drags or closes.
         A keyboard's lift stands it over the keyboard, no taller than the
         well's room above it. -->
    <div
      class="absolute inset-x-0 bottom-(--keyboard-lift,0px) z-2 flex max-h-over-keyboard-60"
      data-slot="rail-sheet"
      in:sheetSlide={{ leaving: false }}
      out:sheetSlide={{ leaving: true }}
    >
      {@render railOf("sheet")}
    </div>
  {/if}
  <!-- What stands over the page beside a pill (the frame fills the well):
       the composer while a comment is written, the thread once it is, and
       the peek while the pointer rests on one. -->
  <!-- The size container a card's width reads (`--c-pin-card-reading-w`, two fifths of the well). -->
  <div
    data-slot="pin-room"
    class="@container absolute inset-0 pointer-events-none"
    data-mode={mode !== "interact" && !isCanvas ? mode : undefined}
    {@attach measureRoom}
  >
    {#if composing && kit && nextDraft}
      {@const Composer = kit.CommentComposer}
      <PinFloat
        bare
        box={composing.at?.box ?? null}
        label={commentWords.comment}
        mark={composing.at?.mark ?? null}
        room={{ w: roomW, h: roomH }}
        sheet={floatSheet}
        slot="pin-composer"
        bind:float={composerFloat}
      >
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
          onchoose={(index) => post({ type: "cawco:compose-target", index })}
          onsubmit={(text) => comment(text)}
          placeholder={commentWords.composeHint}
          sendError={composing.error}
          sending={composing.sending}
        />
      </PinFloat>
    {/if}
    <!-- The drawn pin's card (`drawnPin`); each pin's card is its own, so
         another's never moves to it. -->
    {#if cardPin && kit && replyDraft}
      {@const Card = kit.PinCard}
      {#key cardPin.id}
        {#snippet thread(pin: Pin)}
          <Card
            agentName={owner ? ownerName : "The session"}
            changes={(view?.activity[pin.id]?.length ?? 0) > 0
              ? threadChanges
              : undefined}
            marked={!!pinAt?.mark}
            session={owner ? instanceId : null}
            draft={replyDraft}
            link={pinLink(pin.number)}
            live={live.has(pin.id)}
            name={pin.movedAt ? commentWords.elementGone : pinName(pin)}
            onState={designGraph?.stateWords(pin.anchor) ?? null}
            onclose={() => closeCard()}
            ondelete={deleteOpenPin}
            ondraft={() => drafts?.changed(pin.id)}
            onfind={() => focusPin(pin.id, true)}
            onplace={placeElsewhere}
            onreply={(text) => reply(text)}
            onresolve={(resolved) => resolvePin(resolved)}
            onretry={() => retryPin(pin.id)}
            parent={cardParent?.id === pin.id ? cardParent.name : null}
            {pin}
            placing={placing === pin.id}
            problem={cardError}
            sending={replying}
            retrying={pinsRetrying.has(pin.id)}
            whyNotSent={notSentWhy(pin)}
          />
        {/snippet}
        {#if floatSheet}
          <!-- On a phone and under a finger, the thread is the well's
               bottom sheet, dragged between its stops (ThreadSheet). -->
          <ThreadSheet
            label={`Comment ${cardPin.number}`}
            onclose={() => closeCard()}
            open
            bind:surface={cardFloat}
          >
            {@render thread(cardPin)}
          </ThreadSheet>
        {:else}
          <PinFloat
            box={pinAt?.box ?? null}
            face={markFace(markState(cardPin))}
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
            {@render thread(cardPin)}
          </PinFloat>
        {/if}
      {/key}
    {/if}
    {#if peekPin && peekAt}
      <PinPeek mark={peekAt.mark} pin={peekPin} room={{ w: roomW, h: roomH }} />
    {/if}
  </div>
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
        class="flex-1 basis-c-draft-line min-w-0 m-0 text-data-bad text-size-body font-normal text-pretty wrap-anywhere"
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
      {:else if failure?.again === "close"}
        <Button
          label={commonWords.tryAgain}
          onclick={close}
          pending={closing}
          pendingLabel="Closing…"
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
{/snippet}
