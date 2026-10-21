<script lang="ts">
  import {
    artifactWords,
    hostModeDomain,
    machineLabel,
    PREVIEW_LOCKED_MESSAGE,
    PREVIEW_PING_PATH,
    type PreviewDown,
    type PreviewSettings,
    previewRoute,
    previewWords,
    projectPagePlace,
    type ShownFailure,
    sheetWords,
  } from "@cawco/core";
  import { readWithin } from "@cawco/core/bounded";
  import {
    type Pin,
    type PreviewMode,
    pinProblem,
    pinUnsent,
    previewMode,
  } from "@cawco/core/comments";
  import { STAGE_CLONE_MS, STAGE_READY_MS } from "@cawco/core/stage";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu (DropdownMenu.Root, .Item, …), as every menu of the app imports it
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
    IconComment,
    IconExternal,
    IconEyeClosed,
    IconInteract,
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
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import {
    handBack,
    holdStage,
    letGo,
    type Stage,
  } from "../canvas/stage.svelte";
  import { frameObserver } from "../frame-observer";
  import { resolveSessionTitle } from "../links";
  import {
    appear,
    dur,
    easeDrawer,
    easeOut,
    motionOk,
  } from "../motion/curves.svelte";
  import { closeInto } from "../motion/share.svelte";
  import { pressOutside } from "../press-outside";
  import { watchInput } from "../reload.svelte";
  import { runShellShortcut } from "../shell-shortcut";
  import { sideExpand } from "../side/expand";
  import { HEAD_PRIORITY, type HeadItem } from "../side/head";
  import SideSurface from "../side/SideSurface.svelte";
  import { readJson, store, stored, writeJson } from "../storage";
  import { toast } from "../toasts";
  import { afterPaint, warm } from "../workspace/warm.svelte";
  import ArtifactMenu from "./ArtifactMenu.svelte";
  import {
    type ArtifactDoc,
    type ArtifactView,
    artifactSyncPath,
    type DocSync,
    joinArtifact,
    LINK_DOWN_MS,
    type ListHold,
    NOT_REACHING,
    sendArtifact,
  } from "./artifact-doc";
  import CanvasView from "./CanvasView.svelte";
  import CommentRail from "./CommentRail.svelte";
  import { CanvasViewState } from "./canvas-view.svelte";
  import type { CommentDrafts } from "./comment-drafts.svelte";
  import {
    commentAttachments,
    NEXT_COMMENT,
    type RailSort,
  } from "./comment-rows";
  import { commentWords } from "./comment-words";
  import { loadedPanes } from "./loaded.svelte";
  import CanvasMap from "./map/CanvasMap.svelte";
  import PinFloat from "./PinFloat.svelte";
  import PinPeek from "./PinPeek.svelte";
  import PlacePick from "./PlacePick.svelte";
  import { paneFleet } from "./pane-fleet";
  import { enterPreviews } from "./pass";
  import { pinName } from "./pin-name";
  import SheetInspector from "./SheetInspector.svelte";
  import { isSetupPage } from "./setup-page";
  import { SheetInspector as Inspector } from "./sheet-inspector.svelte";
  import {
    type ComposeTarget,
    type PaneKey,
    type PreviewPinAt,
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
    sheet = false,
    linkSession = false,
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
     * The preview is another session's than the conversation beside it (a
     * thread shows its project's lead's): its states name that session, as
     * a link to it.
     */
    linkSession?: boolean;
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
  const route = $derived(preview ? previewRoute(preview, location) : null);
  const paneOrigin = $derived(route?.origin ?? "");
  /**
   * Where the reader had gone inside this show, kept per session so a reload
   * of the tab (by hand, or by itself once idle: reload.svelte.ts) opens the
   * preview there again. A new show (another revision) starts at its root.
   */
  const keepKey = $derived(`cawco-preview-at:${instanceId}`);
  function keptAt(): string | null {
    const kept = readJson<{ at?: unknown; revision?: unknown } | null>(
      keepKey,
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
   * Where a show starts: a project's page at its own place on its project's
   * origin (core `projectPagePlace`, the frame naming the project), else the
   * page the agent named (`path`), else the root.
   */
  const startAt = $derived.by(() => {
    if (preview?.project) {
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
   * Host mode's route: every name is locked to the browser's pass (hub
   * preview-access.ts), which the frame's own load carries; a frame turned
   * away enters and loads again (preview/pass.ts). Either route loads the
   * place, straight.
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
   * which answers any page with no credentials, and answers 502 with the
   * hub's words when the session's machine listener doesn't answer the hub),
   * before the frame loads. Unreached, the pane says what failed, what
   * previews need and where to switch how they are reached, and probes again
   * by itself (`PROBE_FIRST_MS`, doubling to `PROBE_MOST_MS`, and at once
   * when its tab is back in view) until one answers: never a fallback. Once
   * reached, the frame loads, once.
   */
  let reached = $state<
    | { origin: string; ok: true }
    | { origin: string; ok: false; said: string; hub: boolean; tries: number }
    | null
  >(null);
  /** Each one probes the origin again: Try again's press, the backoff's timer, the tab back in view. */
  let probe = $state(0);
  let probing = $state(false);
  let previewsNeedFor = $state({ origin: "", said: "" });
  /** Our call: a probe that hasn't answered in 10 s is a failed one, and the next goes on the backoff. */
  const PROBE_ANSWER_MS = 10_000;
  /** Our calls: the first probe again 2 s after a failure, doubling to every 30 s. */
  const PROBE_FIRST_MS = 2000;
  const PROBE_MOST_MS = 30_000;
  $effect(() => {
    const origin = paneOrigin;
    // biome-ignore lint/complexity/noVoid: read-only dependency — each bump probes again
    void probe;
    if (!origin || untrack(() => reached?.origin === origin && reached.ok)) {
      return;
    }
    let live = true;
    probing = true;
    pingOrigin(origin).then(async (failed) => {
      if (!live) {
        return;
      }
      if (failed && !failed.hub && previewsNeedFor.origin !== origin) {
        previewsNeedFor = { origin, said: await previewsNeed(origin) };
        if (!live) {
          return;
        }
      }
      probing = false;
      const was = untrack(() => reached);
      reached = failed
        ? {
            origin,
            ok: false,
            ...failed,
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
  /**
   * What `origin`'s probe failed on, after its host: no answer, a status,
   * or the hub's own words (`hub`, so the origin itself was reached); null
   * when it answered ok.
   */
  async function pingOrigin(
    origin: string
  ): Promise<{ said: string; hub: boolean } | null> {
    const { host } = new URL(origin);
    const read = await readWithin(PROBE_ANSWER_MS, (signal) =>
      fetch(`${origin}${PREVIEW_PING_PATH}`, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal,
      })
    ).catch(() => null);
    if (read?.kind !== "answered") {
      return {
        said: read
          ? `${host} didn't answer within ${PROBE_ANSWER_MS / 1000} s`
          : `${host} didn't answer`,
        hub: false,
      };
    }
    const answer = read.value;
    if (answer.ok) {
      return null;
    }
    const why = await answer
      .json()
      .then((body: { why?: unknown }) =>
        typeof body?.why === "string"
          ? body.why.replace(TRAILING_STOP, "")
          : null
      )
      .catch(() => null);
    return why
      ? { said: `${host} answered ${answer.status}: ${why}`, hub: true }
      : { said: `${host} answered ${answer.status}`, hub: false };
  }
  const TRAILING_STOP = /\.$/;
  /** What previews need to be reached from this tab, by the route it took. */
  async function previewsNeed(origin: string): Promise<string> {
    if (byHost) {
      return `Previews need ${new URL(origin).host} to reach the hub, or switch previews to ports`;
    }
    const settings = await fetch("/api/preview-settings")
      .then((answer) =>
        answer.ok ? (answer.json() as Promise<PreviewSettings>) : null
      )
      .catch(() => null);
    const ports = `Previews need ports ${settings?.ports ?? "of the hub's range"} reachable on ${location.hostname}`;
    return settings?.mode === "host"
      ? ports
      : `${ports}, or switch previews to a hostname pattern`;
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
  function unload() {
    unloaded = true;
    standing = null;
    loaded = false;
    connected = false;
    pageHeld = false;
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
   * `data-pane`), as a thread's tab shows its lead's preview.
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
   * The page turned the frame away (`cawco:locked`): the browser enters its
   * previews and the frame loads again, once in a row. An entry the hub
   * won't give is the failure band, with Try again.
   */
  async function turnedAway() {
    const origin = paneOrigin;
    if (!(byHost && origin)) {
      return;
    }
    refusedEntries += 1;
    if (refusedEntries > 1) {
      failure = {
        message: previewWords.passTurnedAway(
          hostModeDomain(origin),
          location.protocol === "https:"
        ),
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
  const DOWN_KINDS: readonly PreviewDown[] = [
    "server",
    "machine",
    "workspace",
    "reach",
    "closed",
  ];
  /** The proxy's page says which hop failed (`cawco:down`): the pane cannot read a preview origin's document. */
  function heardDown(message: { down?: unknown; why?: unknown }) {
    const said = DOWN_KINDS.find((kind) => kind === message.down);
    if (!said) {
      return;
    }
    down = said;
    downWhy = typeof message.why === "string" ? message.why : null;
    retrying = false;
  }
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
    switch (down) {
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
    return `${ownerMachine} isn't answering`;
  });
  /** Open its session, beside Try again, wherever this pane is not that session's own. */
  const offerSession = $derived(!!owner && (linkSession || ownTab));

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
  /** To the page, on its own origin alone. */
  function post(message: object) {
    if (paneOrigin) {
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
   * answered within PAGE_SILENT_MS. Said once per revision.
   */
  /** How long a loaded frame has for its overlay to answer the pane's hello. Our call: it answers in milliseconds. */
  const PAGE_SILENT_MS = 3000;
  /** The frame that last finished loading, and whether it then said nothing. */
  let loadedKey = $state<string | null>(null);
  let silentKey = $state<string | null>(null);
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
    artifactShown(instanceId, id, { revision, ...word }).catch(() => {
      // Unheard: the next change of state says it again.
      saidFor = null;
    });
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
  const pins = $derived.by(() => {
    const held = view?.pins ?? [];
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
  /** A down stage's own words stand unfolded (Show details). */
  let stageDetails = $state(false);
  const stageDetailsId = `${paneId}-stage-details`;
  /** What the cover says while the page is on its way; null when nothing is, or once it has stood past its time ({@link neverDrawn}). */
  const stageWaiting = $derived.by(() => {
    if (neverDrawn) {
      return null;
    }
    switch (staged?.status) {
      case "starting":
        return served
          ? sheetWords.serverStarting
          : sheetWords.starting(staged.dir);
      case "waking":
      case "asleep":
        return sheetWords.waking;
      case "live":
        return compiling ? sheetWords.compiling : null;
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
    // biome-ignore lint/complexity/noVoid: the question answers itself; a Cancel changes nothing
    void removeAsks.ask({
      at: "never-drawn-remove",
      title: sheetWords.removeTitle(shown.name),
      body: sheetWords.removeBody,
      confirmLabel: sheetWords.removeConfirm,
      pendingLabel: sheetWords.removing,
      destructive: true,
      run: () => removeArtifact(instanceId, shown.id),
    });
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
   * What Send sends (DESIGN.md, Sending comments): everything of the page
   * the session hasn't heard, picks and comments alike: each pick since the
   * last Send, each comment with something unsent (itself, a reply, a
   * resolve), each stroke group no comment stands on. Drawn only above 0.
   */
  const unsentCount = $derived(
    view
      ? Object.values(view.choices).filter(
          (entry) => !view?.sentAt || entry.at > view.sentAt
        ).length +
          pins.filter(pinUnsent).length +
          view.looseInk
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
    if (!id) {
      return;
    }
    docSync = { state: "reading" };
    pageLost = null;
    pageSilent = false;
    pagePins = {};
    pageWords.clear();
    const joined = joinArtifact(
      session,
      id,
      (next) => {
        view = next;
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
      // The hub didn't keep a write of the pane's: said where the page's own refusals are.
      (why) => {
        failure = { message: why, again: null };
      }
    );
    doc = joined;
    view = null;
    return () => {
      joined.destroy();
      doc = null;
    };
  });

  /*
   * The setup page is done once the person sends it from the page (its own
   * `cawco.send`, which stamps the doc's `sentAt`): on a phone its sheet
   * stands over the thread, where Caw answers with the files and "Open the
   * board". The `sentAt` it opened with is not a send.
   */
  /** The note for the agent the next Send carries first (the rail's Send bar). */
  let note = $state("");
  /** Waiting for the page to say its pictures reached the hub, before a Send. */
  let picturesWaiter: (() => void) | null = null;
  /** The page's pictures of what is unheard, to the hub before the Send that carries them; at most a while. Our call: 3 s. */
  function picturesFirst(): Promise<void> {
    if (!(connected && iframe)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(cap);
        picturesWaiter = null;
        resolve();
      };
      const cap = setTimeout(done, 3000);
      picturesWaiter = done;
      post({ type: "cawco:pictures-now" });
    });
  }
  /**
   * Send: the hub's send, which applies a setup page's fleet choices and
   * place first, delivers every comment, reply, resolve and stroke the
   * session hasn't heard as one message with the note first, and tells the
   * session of the page's picks. A refusal is said in the band over the
   * page, and what it carried stays unsent.
   */
  async function sendAll() {
    if (!artifact || sending) {
      return;
    }
    sending = true;
    try {
      await picturesFirst();
      await sendArtifact(instanceId, artifact.id, note);
      note = "";
    } catch (error) {
      failure = { message: failureWords(error), again: null };
    } finally {
      sending = false;
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
    post({
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
    });
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
  /** The pin J and K stand on. */
  let focusedPin = $state<string | null>(null);
  /** The moved pin a tap places again, and the mode the pane goes back to once it is placed. */
  let placing = $state<string | null>(null);
  let placingFrom: PreviewMode | null = null;
  /** What went wrong with the open thread's reply, resolve or delete. */
  let cardError = $state<string | null>(null);
  /** The open thread's reply is on its way. */
  let replying = $state(false);
  let roomW = $state(0);
  let roomH = $state(0);
  const cardPin = $derived(pins.find((pin) => pin.id === openPin) ?? null);
  /** The open thread's element's nearest parent, as the page names its chain (`cawco:pin-chain`). */
  let cardParent = $state<{ id: string; name: string | null } | null>(null);
  let pinRoom = $state<HTMLDivElement>();
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
  /** The rail's tab and its rows' scroll, kept while it is shut or stands aside. */
  let listFilter = $state<"open" | "resolved">("open");
  let listScroll = $state(0);
  /** The rail as the well's foot sheet, while it stands. */
  let railEl = $state<HTMLElement | null>(null);
  /**
   * What the host's chrome covers of the page, told to its overlay
   * (`cawco:covered`, the page's viewport px): on a phone, the rail at the
   * well's foot, or the thread or the composer standing there. A pin the
   * pane opens is brought out from under them (pins.ts `reveal`). Told again
   * as either resizes, and as nothing once neither stands.
   */
  $effect(() => {
    const frame = iframe;
    const sheetRail = listOpen && railSheet && !railAway ? railEl : null;
    const sheetCard = floatSheet ? (cardFloat ?? composerFloat ?? null) : null;
    if (!(frame && connected)) {
      return;
    }
    const covering = [sheetRail, sheetCard].filter(
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
   * The agent's answer the person has read, per pin: its newest agent entry
   * as it stood when its thread was last open, kept on this device per
   * artifact. A pin whose newest agent entry is another is unread.
   */
  let readUpTo = $state<Record<string, string>>({});
  const readKey = $derived(
    artifactId ? `cawco-comments-read:${artifactId}` : null
  );
  $effect.pre(() => {
    const key = readKey;
    untrack(() => {
      readUpTo = key ? readJson<Record<string, string>>(key, {}) : {};
    });
  });
  const lastAgent = (pin: Pin) =>
    pin.thread.findLast((entry) => entry.by === "agent") ?? null;
  const unread = $derived(
    new Set(
      pins
        .filter((pin) => {
          const answer = lastAgent(pin);
          return (
            !!answer &&
            !pin.resolvedAt &&
            pin.id !== openPin &&
            readUpTo[pin.id] !== answer.id
          );
        })
        .map((pin) => pin.id)
    )
  );
  // The open thread is read: its newest answer stops being unread.
  $effect(() => {
    const pin = cardPin;
    const key = readKey;
    const answer = pin ? lastAgent(pin) : null;
    if (!(pin && key && answer) || readUpTo[pin.id] === answer.id) {
      return;
    }
    untrack(() => {
      readUpTo = { ...readUpTo, [pin.id]: answer.id };
      writeJson(key, readUpTo);
    });
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
  function loadKit(): Promise<void> {
    kitLoading ??= Promise.all([
      import("./CommentComposer.svelte"),
      import("./PinCard.svelte"),
      import("./comment-drafts.svelte"),
    ]).then(([composer, card, kept]) => {
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

  /** How the open thread was opened: a key's draws its field's ring, a press's none (The One Target Rule). */
  /** Pin `id`'s thread opens; `via`, a key or a press. A composer standing goes, and another thread closes. */
  function openCard(id: string, via: "key" | "pointer" = "pointer") {
    loadKit();
    if (composing) {
      cancelComposer();
    }
    if (openPin && openPin !== id) {
      closeCard();
    }
    lastInput.current = via;
    openPin = id;
    focusedPin = id;
    cardError = null;
    pinAt = null;
    cardParent = null;
    post({ type: "cawco:track-pin", id });
    post({ type: "cawco:focus-pin", id, scroll: true });
  }
  /** The thread closes: its Close, Esc, another row or pin opened. Its reply's words stay with its pin. */
  function closeCard() {
    const id = openPin;
    openPin = null;
    pinAt = null;
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
   * mode switch): its hollow pill goes from the page. Its words and chips
   * stay as the next comment's draft, an upload in flight going on.
   */
  function cancelComposer() {
    if (!composing) {
      return;
    }
    composing = null;
    post({ type: "cawco:compose-cancel" });
    post({ type: "cawco:composer-ring", on: false });
  }
  /** Comment: the words and what they carry go to the page, which writes the pin and its first entry at once. */
  function comment(text: string) {
    if (!(composing && nextDraft)) {
      return;
    }
    const said = saidIn(nextDraft, text);
    composing.error = "";
    composing.sending = true;
    post({ type: "cawco:comment", ...said });
  }
  /** The page's answer to Comment: written, the composer goes; refused, the words are back in it with why. */
  function heardComment(message: Record<string, unknown>) {
    const draft = nextDraft;
    if (!(composing && draft)) {
      return;
    }
    if (message.ok === true) {
      const { pin } = message;
      if (
        pin &&
        pinProblem(pin) === null &&
        !view?.pins.some((one) => one.id === (pin as Pin).id)
      ) {
        pageSays((pin as Pin).id, pin);
      }
      composing = null;
      // The newest comment is the one J and K step from.
      if (pin && pinProblem(pin) === null) {
        focusedPin = (pin as Pin).id;
      }
      drafts?.discard(NEXT_COMMENT);
      post({ type: "cawco:composer-ring", on: false });
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
    post({ type: "cawco:focus-pin", id: next.id, scroll: true });
    if (openPin) {
      openCard(next.id, "key");
    }
  }
  /** A pin's own address (its thread's Copy link): its artifact's tab, opening the pin's thread. */
  const pinLink = (number: number): string =>
    artifactId
      ? `${location.origin}/artifact/${encodeURIComponent(artifactId)}?pin=${number}`
      : location.href;
  /** The pin the address names (`?pin=N`), opened once its page is ready and its pins are read. */
  let linkedFor: string | null = null;
  function openLinkedPin() {
    const number = Number(new URL(location.href).searchParams.get("pin"));
    const pin = Number.isInteger(number)
      ? pins.find((one) => one.number === number && !one.movedAt)
      : undefined;
    if (!(pin && artifactId) || linkedFor === artifactId) {
      return;
    }
    linkedFor = artifactId;
    openCard(pin.id);
  }
  $effect(() => {
    if (connected && view) {
      untrack(openLinkedPin);
    }
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
    if (!(id && mark) || coarse.current) {
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
  const peekPin = $derived(
    peekAt && peekAt.id !== openPin
      ? (pins.find((pin) => pin.id === peekAt?.id) ?? null)
      : null
  );

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
    } else if (name === "Enter" && focusedPin) {
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
  /** A key pressed inside the pane, outside a field: the page's are heard as `cawco:key`. */
  function paneKey(event: KeyboardEvent) {
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
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
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
    const message = event.data;
    switch (message?.type) {
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
          // draw it. A canvas keeps its own, and another session's artifact
          // this panel shows (its delegation tree's, not in its list) is
          // that session's to keep.
          if (
            preview.artifact.kind !== "canvas" &&
            (preview.artifacts?.includes(preview.artifact.id) ?? true)
          ) {
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
        // The press was the page's: the composer's field draws no ring.
        lastInput.current = message.via === "key" ? "key" : "pointer";
        composing = {
          at: composing?.at ?? null,
          chain: said.chain,
          chosen: said.chosen,
          error: "",
          sending: false,
        };
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
      case "cawco:pictures-sent":
        picturesWaiter?.();
        break;
      // What the page said of a write the pane sent it for a pin it holds alone.
      case "cawco:reply-result":
      case "cawco:resolve-result":
      case "cawco:delete-result":
        heardPageWrite(message.type, message);
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
        if (previewPinId(message.id) === openPin) {
          pinAt = previewPinAt(message);
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
      case "cawco:sheet": {
        // A sheet's page said its stories and props: the inspector's controls.
        const said = previewSheet(message.sheet);
        if (said && inspector) {
          inspector.heard(said);
        }
        break;
      }
      default:
        break;
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
  const holder = Symbol("panel");
  let canvasSlot = $state<HTMLElement>();
  let stage = $state<Stage>();
  /** This session's composer can take the canvas back: not a lead's shown beside a thread, not its own tab. */
  const canUndock = $derived(isCanvas && !(ownTab || linkSession));
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
  /** The canvas view's Verify: a design system round on the canvas, its verdict to the session; the hub's sentence says what it did. */
  let verifying = $state(false);
  async function verify() {
    if (!artifact) {
      return;
    }
    verifying = true;
    try {
      toast.info(await verifyArtifact(instanceId, artifact.id));
    } catch (error) {
      toast.error(failureWords(error));
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
    if (artifact && unsentCount > 0) {
      all.push({
        key: "send",
        priority: HEAD_PRIORITY.send,
        bar: sendBar,
        menu: sendMenu,
        words: true,
      });
    }
    if (!(ownTab || linkSession)) {
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
        count: { n: listOpen ? 0 : openCount, of: "Comments" },
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

<!-- The head's controls, each as the head draws it and as More's entries
     (SideSurface `items`, by the head's priority rule). -->
{#snippet sendBar()}
  <!-- What of the page the session hasn't heard, picks and comments alike: one press sends it all. -->
  <Button
    data-slot="send"
    aria-label={`${commentWords.send}, ${unsentCount} unsent`}
    onclick={sendAll}
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
    onSelect={whileIdle(() => sending, sendAll)}
  >
    <IconSend /><span>{commentWords.sendCount(unsentCount)}</span>
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
    <CanvasView onverify={verify} view={canvasView} {verifying} />
  {/if}
{/snippet}
{#snippet viewMenu()}
  {#if canvasView}
    <CanvasView as="sub" onverify={verify} view={canvasView} {verifying} />
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
      <TabsList aria-label="Preview mode">
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
      shown={artifact}
    />
  {/if}
{/snippet}

{#snippet railOf(layout: "beside" | "sheet")}
  <CommentRail
    bind:this={rail}
    down={linkDown}
    focused={focusedPin}
    hold={listHold}
    {layout}
    {live}
    onclose={() => showList(false)}
    onhover={(id) => post({ type: "cawco:hover-pin", id })}
    onopen={(id, via) => openCard(id, via)}
    onpage={() => {
      if (openPin) {
        closeCard();
      }
      post({ type: "cawco:compose-page" });
    }}
    onresolve={(id, resolved) => resolvePin(resolved, id)}
    onretry={relink}
    onsend={sendAll}
    open={openPin}
    {pins}
    {sending}
    {unread}
    unsent={unsentCount}
    bind:filter={listFilter}
    bind:note
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
      bind:this={railEl}
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
    mode={isCanvas ? undefined : mode}
    closeFailed={failure?.again === "close"}
    {closing}
    items={headItems}
    label="Preview"
    onclose={ownTab ? backToSession : close}
    subtitle={headLine}
    subtitleId={`${paneId}-line`}
    {switcher}
    titleControl={artifact ? artifactTitle : undefined}
    beside={railBeside}
    bind:section
    bind:subtitleStands={lineStands}
    bind:well
  >
    {@render framed()}
  </SideSurface>
{/if}

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
  {:else if unreached}
    <!-- This tab can't reach the preview's own origin: what failed, what
         previews need unless the hub itself answered, and where to switch
         how they are reached. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title="This preview can't be reached">
        {#snippet line()}
          {unreachedBy?.said}.
          {#if !unreachedBy?.hub && previewsNeedFor.origin === paneOrigin}{previewsNeedFor.said}.{/if}
          Trying again on its own.
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              icon={IconRefresh}
              label="Try again"
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
      <iframe
        data-ready={!current || loaded || undefined}
        data-panel-inspector={(inspecting && inspectorLayout === "panel") ||
          undefined}
        class="absolute inset-0 scheme-light scheme-dark:scheme-dark bg-(color:--frame-ground) block size-full border-none border-current opacity-0 transition-[opacity] duration-(--dur-control) ease-out data-ready:opacity-100 data-panel-inspector:w-(--frame-w)"
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
    >
      <Skeleton
        class="w-2/5"
        data-slot="block"
        line="body"
        radius="text"
        reveal="wait-grace"
      />
      {#if stageWaiting}
        <!-- A sheet's stage on its way: the project's own dev toolchain (Vite, Astro or Nuxt), started or woken by the daemon. -->
        <p
          class="mt-space-3 mx-0 mb-0 text-ink-muted type-meta animate-wait-grace-in group-data-ready/cover:animation-paused group-data-ready/cover:after:animation-paused"
          data-slot="cover-state"
        >
          {stageWaiting}
        </p>
      {/if}
    </div>
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
          {sheetWords.errorTitle}
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
          {sheetWords.errorNext(compileErrors.length - 1)}
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
            <Button
              icon={IconRefresh}
              label={sheetWords.tryAgain}
              onclick={retry}
              pending={retrying}
              pendingLabel={sheetWords.tryingAgain}
              size="sm"
              variant="outline"
            />
            {#if staged.message}
              <!-- The stage's own words, as RowFault folds a machine's: under Show details. -->
              <Button
                data-details
                aria-controls={stageDetailsId}
                aria-expanded={stageDetails}
                label={stageDetails ? "Hide details" : "Show details"}
                onclick={() => {
                  stageDetails = !stageDetails;
                }}
                size="sm"
                variant="ghost"
              />
            {/if}
          </div>
          {#if staged.message && stageDetails}
            <p
              id={stageDetailsId}
              data-slot="details"
              class="mt-space-2 text-ink-muted type-code liga-none whitespace-pre-wrap wrap-anywhere"
            >
              {staged.message}
            </p>
          {/if}
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
            <Button
              icon={IconRefresh}
              label={sheetWords.tryAgain}
              onclick={retry}
              pending={retrying}
              pendingLabel={sheetWords.tryingAgain}
              size="sm"
              variant="outline"
            />
            <Button
              icon={IconTrash}
              label={sheetWords.remove}
              onclick={removeShown}
              size="sm"
              variant="ghost"
            />
            {#if stageSaid}
              <!-- The stage's own last words, folded as the down stage's are. -->
              <Button
                data-details
                aria-controls={stageDetailsId}
                aria-expanded={stageDetails}
                label={stageDetails ? "Hide details" : "Show details"}
                onclick={() => {
                  stageDetails = !stageDetails;
                }}
                size="sm"
                variant="ghost"
              />
            {/if}
          </div>
          {#if stageSaid && stageDetails}
            <p
              id={stageDetailsId}
              data-slot="details"
              class="mt-space-2 text-ink-muted type-code liga-none whitespace-pre-wrap wrap-anywhere"
            >
              {stageSaid}
            </p>
          {/if}
          <AskHere asker={removeAsks} at="never-drawn-remove" />
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if down && staged?.status !== "error" && !neverDrawn}
    <!-- What happened, why and the way back, where the page would be; a stage in error says it above. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={downTitle}>
        {#snippet line()}
          {#if down === "workspace"}
            Its server can't be reached until the workspace runs again. Once a
            session there is back, try again.
          {:else if down === "server"}
            {downPort
              ? `Nothing is running on port ${downPort} on ${ownerMachine}, so the page can't load.`
              : `The page's server on ${ownerMachine} isn't running, so the page can't load.`}
            {#if served}
              CawCo starts it again by itself; try again in a moment.
            {:else if offerSession}
              Start it again from its session, then try again.
            {:else}
              Start it again, then try again.
            {/if}
          {:else if down === "reach"}
            The way to the page's server on {ownerMachine} didn't open{downWhy
              ? `: ${downWhy}`
              : "."}
            Try again; if it fails again, start the server again from its session.
          {:else if down === "closed"}
            Its session shows something else now, or has ended, so there is no
            page here. Open its session to show it again.
          {:else}
            The preview comes from {ownerMachine}, which isn't connected to the
            hub right now. Once it's back, try again.
          {/if}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              icon={IconRefresh}
              label="Try again"
              onclick={retry}
              pending={retrying}
              pendingLabel="Reloading…"
              size="sm"
              variant="outline"
            />
            {#if offerSession && owner}
              <!-- The session that serves the page, as the kit draws a link
                   (Button `link`, as Caw's panel offers its settings). -->
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
    <!-- The rail as the well's foot sheet, at most 60% of it: on a phone and in a pane under 640px. -->
    <div
      class="absolute inset-x-0 bottom-0 z-2 flex max-h-3/5"
      data-slot="rail-sheet"
      bind:this={railEl}
    >
      {@render railOf("sheet")}
    </div>
  {/if}
  <!-- What stands over the page beside a pill (the frame fills the well):
       the composer while a comment is written, the thread once it is, and
       the peek while the pointer rests on one. -->
  <div
    data-slot="pin-room"
    class="absolute inset-0 pointer-events-none"
    data-mode={mode !== "interact" && !isCanvas ? mode : undefined}
    bind:this={pinRoom}
    bind:clientHeight={roomH}
    bind:clientWidth={roomW}
  >
    {#if composing && kit && nextDraft}
      {@const Composer = kit.CommentComposer}
      <PinFloat
        bare
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
          onring={(on) => post({ type: "cawco:composer-ring", on })}
          onsubmit={(text) => comment(text)}
          placeholder={commentWords.composeHint}
          sendError={composing.error}
          sending={composing.sending}
        />
      </PinFloat>
    {/if}
    {#if cardPin && kit && replyDraft}
      {@const Card = kit.PinCard}
      <PinFloat
        label={`Comment ${cardPin.number}`}
        mark={pinAt?.mark ?? null}
        pin={cardPin.number}
        room={{ w: roomW, h: roomH }}
        sheet={floatSheet}
        slot="pin-card"
        bind:float={cardFloat}
      >
        <Card
          agentName={owner ? ownerName : "The session"}
          draft={replyDraft}
          link={pinLink(cardPin.number)}
          live={live.has(cardPin.id)}
          name={cardPin.movedAt ? commentWords.elementGone : pinName(cardPin)}
          onclose={closeCard}
          ondelete={deleteOpenPin}
          ondraft={() => {
            if (cardPin) {
              drafts?.changed(cardPin.id);
            }
          }}
          onfind={() => {
            if (cardPin) {
              post({ type: "cawco:focus-pin", id: cardPin.id, scroll: true });
            }
          }}
          onplace={placeElsewhere}
          onreply={(text) => reply(text)}
          onresolve={(resolved) => resolvePin(resolved)}
          onring={(on) => post({ type: "cawco:composer-ring", on })}
          parent={cardParent?.id === cardPin.id ? cardParent.name : null}
          pin={cardPin}
          placing={placing === cardPin.id}
          problem={cardError}
          sending={replying}
        />
      </PinFloat>
    {/if}
    {#if peekPin && peekAt}
      <PinPeek mark={peekAt.mark} pin={peekPin} room={{ w: roomW, h: roomH }} />
    {/if}
  </div>
  {#if failure}
    <div
      data-slot="failure"
      class="absolute inset-x-0 bottom-0 flex items-center gap-space-3 px-space-3 py-space-2 bg-surface-raised border-t border-border-hairline"
      role="alert"
      transition:appear
    >
      <p class="flex-1 min-w-0 m-0 text-data-bad text-size-body font-normal">
        {failure.message}
      </p>
      {#if failure.again === "reload"}
        <Button
          label="Try again"
          onclick={retry}
          pending={retrying}
          pendingLabel="Reloading…"
          size="sm"
          variant="outline"
        />
      {:else if failure.again === "close"}
        <Button
          label="Try again"
          onclick={close}
          pending={closing}
          pendingLabel="Closing…"
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
  {/if}
{/snippet}
