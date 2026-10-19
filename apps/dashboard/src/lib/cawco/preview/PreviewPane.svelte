<script lang="ts">
  import {
    artifactWords,
    machineLabel,
    PREVIEW_LOCKED_MESSAGE,
    PREVIEW_PING_PATH,
    type PreviewDown,
    type PreviewSettings,
    type PreviewTicket,
    previewEnterUrl,
    previewRoute,
    type ShownFailure,
    sheetWords,
  } from "@cawco/core";
  import { readWithin } from "@cawco/core/bounded";
  import { type PreviewMode, previewMode } from "@cawco/core/comments";
  import { STAGE_CLONE_MS, STAGE_READY_MS } from "@cawco/core/stage";
  import { type Snippet, untrack } from "svelte";
  import {
    failureClause,
    failureWords,
    hubRefusal,
  } from "#lib/cawco/hub-read.js";
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
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
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
  import { resolveSessionTitle } from "../links";
  import { appear, dur } from "../motion/curves.svelte";
  import { closeInto } from "../motion/share.svelte";
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
    type ListHold,
    sendArtifact,
  } from "./artifact-doc";
  import CanvasView from "./CanvasView.svelte";
  import { CanvasViewState } from "./canvas-view.svelte";
  import { loadedPanes } from "./loaded.svelte";
  import CanvasMap from "./map/CanvasMap.svelte";
  import PinCard from "./PinCard.svelte";
  import PinList from "./PinList.svelte";
  import PlacePick from "./PlacePick.svelte";
  import { paneFleet } from "./pane-fleet";
  import { pinDrafts } from "./pin-drafts.svelte";
  import SheetInspector from "./SheetInspector.svelte";
  import { isSetupPage } from "./setup-page";
  import { SheetInspector as Inspector } from "./sheet-inspector.svelte";
  import {
    type PaneKey,
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
   * The Comments panel, floating over the page's top-right from the head's
   * Comments; shut until opened, then kept per session as the mode is.
   */
  let listOpen = $state(false);
  const listKey = $derived(`cawco-preview-comments:${instanceId}`);
  $effect.pre(() => {
    const keys = { mode: modeKey, list: listKey };
    untrack(() => {
      mode = previewMode(stored("local", keys.mode)) ?? "interact";
      listOpen = stored("local", keys.list) === "open";
    });
  });
  function showList(open: boolean) {
    listOpen = open;
    store("local", listKey, open ? "open" : "shut");
    if (!open) {
      listYield = null;
    }
  }
  /** ⇧C: every pin on the page hidden, or shown (Figma's own key). */
  let pinsShown = $state(true);
  /** The open panel's width: a pin's card stands in the well beside it, never under it. */
  let listPanel = $state<HTMLElement | null>(null);
  let listWidth = $state(0);
  $effect(() => {
    const panel = listPanel;
    if (!panel) {
      listWidth = 0;
      return;
    }
    // Its layout width: its entrance scales it, and a scale is not its room.
    const watch = new ResizeObserver(() => {
      listWidth = panel.offsetWidth;
    });
    watch.observe(panel);
    return () => {
      watch.disconnect();
      listWidth = 0;
    };
  });
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
  /** Where a show starts: the page the agent named (`path`), else the root. */
  const startAt = $derived(
    (source && "path" in source ? source.path : undefined) ?? "/"
  );
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
   * Host mode's route: every name is locked to the hub's pass (hub
   * preview-access.ts), so each frame load enters with a ticket of its own,
   * asked for here, and the frame's address is the entry, which sets the
   * pass and goes on to the place. The port's route: the place, straight.
   */
  const byHost = $derived(!!route?.byHost);
  /**
   * Each frame's entry in host mode, by frame key, and the origin and place
   * it was asked for: a frame standing over its replacement keeps its own.
   */
  let entries = $state<Record<string, { for: string; src: string }>>({});
  /** How many entries in a row the page turned away (`cawco:locked`) without once saying it was ready. */
  let refusedEntries = 0;
  const TURNED_AWAY =
    "This preview turned away its pass twice: this browser didn't keep the preview's cookie. Reach previews over https, then try again.";
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
    // A ticket is spent by its frame's load: the next load asks again.
    entries = {};
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
  /*
   * Host mode: the current frame's ticket, asked for once its origin answered
   * the probe, again for each new frame (a reload, a new show) and whenever
   * the origin or the place it opens changes. A ticket the hub won't give is
   * the failure band, with Try again.
   */
  $effect(() => {
    const key = frameKey;
    const origin = paneOrigin;
    const at = framePlace;
    if (
      unloaded ||
      !(byHost && origin && reached?.origin === origin && reached.ok)
    ) {
      return;
    }
    const wanted = `${origin}${at}`;
    if (untrack(() => entries[key]?.for) === wanted) {
      return;
    }
    let live = true;
    fetch(`/api/instances/${encodeURIComponent(instanceId)}/preview-ticket`, {
      method: "POST",
    })
      .then(async (answer) => {
        if (!answer.ok) {
          throw await hubRefusal(answer);
        }
        return (await answer.json()) as PreviewTicket;
      })
      .then(({ ticket }) => {
        if (!live) {
          return;
        }
        const kept = Object.fromEntries(
          Object.entries(untrack(() => entries)).filter(([held]) =>
            untrack(() => frames).includes(held)
          )
        );
        entries = {
          ...kept,
          [key]: { for: wanted, src: previewEnterUrl(origin, ticket, at) },
        };
      })
      .catch((error: unknown) => {
        if (live) {
          failure = {
            message: `The hub didn't give this preview a pass: ${error instanceof Error ? error.message : String(error)}`,
            again: "reload",
          };
        }
      });
    return () => {
      live = false;
    };
  });
  /** The page turned the frame's pass away (`cawco:locked`): it lapsed, so the frame enters again, once in a row. */
  function turnedAway() {
    if (!byHost) {
      return;
    }
    refusedEntries += 1;
    if (refusedEntries > 1) {
      failure = { message: TURNED_AWAY, again: "reload" };
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
      default:
        return `${ownerMachine} isn't answering`;
    }
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
    const settled = new ResizeObserver(() => {
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
   * which the list and the card read and the person writes. The person's
   * pins, replies and ink go to the session by themselves once quiet (the
   * hub's artifacts/service.ts); their picks go by the page's own send.
   */
  let view = $state.raw<ArtifactView | null>(null);
  let doc: ArtifactDoc | null = null;
  const pins = $derived(view?.pins ?? []);
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
        return "ready";
      case "failed":
        return { failed: docSync.why };
      default:
        return readingLong ? "reading" : "quiet";
    }
  });
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
  /** The page has picks the session has not heard: the head offers to send them. */
  const unsentPicks = $derived(
    !!view &&
      Object.values(view.choices).some(
        (entry) => !view?.sentAt || entry.at > view.sentAt
      )
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
        return connected || served ? null : sheetWords.compiling;
      default:
        return null;
    }
  });
  const compileErrors = $derived(
    staged?.status === "live" ? staged.errors : []
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
        return connected || served ? null : STAGE_READY_MS;
      default:
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
  /** A right panel beside the page on a desk and a tablet; on a phone, where the pane is the sheet over the conversation, a sheet over the page's foot (the spec's §5). */
  const inspectorLayout = $derived(sheet ? "sheet" : "panel");
  /** A compile error's place, `file:line:column` as far as the toolchain's Vite payload names it (Astro and Nuxt run Vite inside). */
  const errorPlace = (error: {
    column: number | null;
    file: string;
    line: number | null;
  }) =>
    `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
  /**
   * The head's Comments count: the panel's Open tab, every pin not resolved,
   * a moved one too, as the hub counts them. Drawn only above 0 (The Earned
   * Count Rule), and 0 until the doc is held, so a count not read yet is
   * never drawn.
   */
  const openCount = $derived(
    docSync.state === "synced"
      ? pins.filter((pin) => !pin.resolvedAt).length
      : 0
  );
  /** The well's box: the Comments panel's room under the head. */
  let wellBox = $state({ w: 0, h: 0 });
  $effect(() => {
    const box = well;
    if (!box) {
      return;
    }
    const watch = new ResizeObserver(() => {
      wellBox = { w: box.clientWidth, h: box.clientHeight };
    });
    watch.observe(box);
    return () => watch.disconnect();
  });
  /** The well's gutter, px (`--space-2`): the panel's and the card's distance from its edges. */
  const GUTTER = 8;
  /**
   * Where the Comments panel hangs: the well's top-right corner, under the
   * head, so the panel's top and right stand a gutter inside the well
   * whatever the head's controls are.
   */
  const wellCorner = {
    getBoundingClientRect: () => {
      const box = well?.getBoundingClientRect();
      return box
        ? new DOMRect(box.right - GUTTER, box.top, 0, 0)
        : new DOMRect();
    },
  };
  /** The well's foot at its right: where the Comments panel stands when it makes room below a pin (`listYield`). */
  const wellFoot = {
    getBoundingClientRect: () => {
      const box = well?.getBoundingClientRect();
      return box
        ? new DOMRect(box.right - GUTTER, box.top + floorIn(box), 0, 0)
        : new DOMRect();
    },
  };
  let sending = $state(false);
  const artifactId = $derived(artifact?.id);
  $effect(() => {
    const id = artifactId;
    const session = instanceId;
    if (!id) {
      return;
    }
    docSync = { state: "reading" };
    const joined = joinArtifact(
      session,
      id,
      (next) => {
        view = next;
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
  /**
   * Send picks: the hub's send, which applies a setup page's fleet choices
   * and place first, then tells the session it has the page's picks to
   * read. A refusal is said in the band over the page.
   */
  async function sendPicks() {
    if (!artifact) {
      return;
    }
    sending = true;
    try {
      await sendArtifact(instanceId, artifact.id);
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
   * The pins (Projects spec §5.7; tsk-3): the Comments panel floating over
   * the page, the card over the page beside its pin, J and K stepping
   * through them.
   */
  /** The pin whose card is open. */
  let openPin = $state<string | null>(null);
  /** Its disc in the page's viewport, as the page tells it while it scrolls. */
  let pinAt = $state<{ r: number; x: number; y: number } | null>(null);
  /** The pin J and K stand on. */
  let focusedPin = $state<string | null>(null);
  /** The moved pin a tap places again, and the mode the pane goes back to once it is placed. */
  let placing = $state<string | null>(null);
  let placingFrom: PreviewMode | null = null;
  /** What went wrong with the open card's reply, resolve or send. */
  let cardError = $state<string | null>(null);
  let roomW = $state(0);
  let roomH = $state(0);
  const cardPin = $derived(pins.find((pin) => pin.id === openPin) ?? null);
  /**
   * The room the Comments panel makes for the open card's pin when no scroll
   * of the page brings the pin out from under it (the overlay's `stuck`: a
   * pin at the page's top, under the panel): the panel stands above the pin,
   * or at the well's foot below it, on the side with more room, no taller
   * than that room. Kept until the card closes, another opens or the panel
   * shuts; null, it hangs from the top, as tall as the well lets it.
   */
  let listYield = $state<{
    id: string;
    room: number;
    side: "top" | "bottom";
  } | null>(null);
  /** The card's gap from its pin, px (PinCard's `GAP`). */
  const PIN_GAP = 12;
  /** The panel's room beside a stuck pin `at` (the page's viewport px), on the side with more of it. */
  function yieldFor(
    id: string,
    at: { r: number; x: number; y: number },
    kept?: "top" | "bottom"
  ): NonNullable<typeof listYield> | null {
    const frame = iframe?.getBoundingClientRect();
    const box = well?.getBoundingClientRect();
    if (!(frame && box && iframe)) {
      return null;
    }
    const y = at.y + frame.top + iframe.clientTop - box.top;
    const above = y - at.r - PIN_GAP - GUTTER;
    const below = floorIn(box) - GUTTER - (y + at.r + PIN_GAP);
    const side = kept ?? (above >= below ? "top" : "bottom");
    return { id, side, room: Math.max(0, side === "top" ? above : below) };
  }
  /**
   * How far down the well the panel may reach, px from its top: its foot,
   * or on a phone the top of the open card standing there.
   */
  function floorIn(box: DOMRect): number {
    const room = pinRoom;
    const card = sheet
      ? room?.querySelector<HTMLElement>('[data-slot="pin-card"]')
      : null;
    // Its laid-out place, not its drawn one: it rises and scales in as it opens.
    return room && card
      ? Math.min(
          box.height,
          room.getBoundingClientRect().top + card.offsetTop - box.top
        )
      : box.height;
  }
  /** The open card's height on a phone, where it stands at the well's foot: the panel stands above it. */
  let cardHeight = $state(0);
  let pinRoom = $state<HTMLDivElement>();
  $effect(() => {
    const room = pinRoom;
    if (!(sheet && cardPin && room)) {
      cardHeight = 0;
      return;
    }
    const card = room.querySelector<HTMLElement>('[data-slot="pin-card"]');
    if (!card) {
      return;
    }
    const watch = new ResizeObserver(() => {
      cardHeight = card.offsetHeight;
    });
    watch.observe(card);
    return () => watch.disconnect();
  });
  /**
   * The panel's room, as its height reads it (`--pin-list-room`, its
   * max-block-size that less `--space-4`, two gutters): the well's, a stuck
   * pin's side of it, or on a phone the well above the open card.
   */
  const listRoom = $derived.by(() => {
    if (listYield) {
      return listYield.room + 2 * GUTTER;
    }
    if (sheet && cardHeight > 0) {
      return Math.max(0, wellBox.h - cardHeight - GUTTER);
    }
    return wellBox.h;
  });
  /**
   * What the host's chrome covers of the page, told to its overlay
   * (`cawco:covered`, the page's viewport px): the open panel and, on a
   * phone, the card at the well's foot. A pin the pane opens is brought out
   * from under them (pins.ts `reveal`). Told again as either resizes or
   * moves, and as nothing once the panel shuts.
   */
  $effect(() => {
    const frame = iframe;
    const panel = listPanel;
    const open = listOpen;
    const room = pinRoom;
    const card = sheet && cardPin ? cardHeight : 0;
    if (!(frame && connected)) {
      return;
    }
    if (!(open && panel)) {
      post({ type: "cawco:covered", boxes: [] });
      return;
    }
    let raf = 0;
    const say = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const framed = frame.getBoundingClientRect();
        const left = framed.left + frame.clientLeft;
        const top = framed.top + frame.clientTop;
        // The panel's wrapper stands where it is placed, at its laid-out size (its entrance scales the panel inside).
        const boxes = [
          panel.parentElement ?? panel,
          ...(card > 0 && room
            ? [room.querySelector('[data-slot="pin-card"]')]
            : []),
        ]
          .filter((el): el is Element => !!el)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: r.left - left,
              y: r.top - top,
              w: r.width,
              h: r.height,
            };
          });
        post({ type: "cawco:covered", boxes });
      });
    };
    const sized = new ResizeObserver(say);
    sized.observe(panel);
    const moved = new MutationObserver(say);
    if (panel.parentElement) {
      moved.observe(panel.parentElement, { attributeFilter: ["style"] });
    }
    say();
    return () => {
      cancelAnimationFrame(raf);
      sized.disconnect();
      moved.disconnect();
    };
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
  /** The pins J and K step through: those on the page, by number (a resolved pin has left it). */
  const stepping = $derived(
    pins.filter((pin) => !(pin.movedAt || pin.resolvedAt))
  );

  /** Each pin's half-written words, kept with the pin while its card is shut and across a reload. */
  const drafts = pinDrafts(() => artifactId);
  /**
   * The pin the open card was opened for as it was made (a tap in Comment
   * mode, the radial's Comment), until it is said something: dismissed with
   * nothing said or written, it is taken back.
   */
  let madePin: string | null = null;

  /** Pin `id`'s card opens; `made`, for the pin the person just made. Another pin's card is dismissed first. */
  function openCard(id: string, made = false) {
    if (openPin && openPin !== id) {
      closeCard();
    }
    if (made) {
      madePin = id;
    }
    openPin = id;
    focusedPin = id;
    cardError = null;
    pinAt = null;
    drafts.open(id);
    post({ type: "cawco:track-pin", id });
    post({ type: "cawco:focus-pin", id, scroll: true });
  }
  /**
   * The card is dismissed: a press outside it, on the page or anywhere in
   * the dashboard, Esc, its Close, another pin opened. Its words stay with
   * its pin; a pin just made that holds neither words nor a thread is taken
   * back (core `withdrawPin`), its ink left as it was.
   */
  function closeCard() {
    const id = openPin;
    openPin = null;
    pinAt = null;
    listYield = null;
    cardError = null;
    post({ type: "cawco:track-pin", id: null });
    if (id && id === madePin) {
      madePin = null;
      if (!drafts.text(id).trim()) {
        doc?.withdraw(id);
        drafts.discard(id);
      }
    }
  }
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
      openCard(next.id);
    }
  }
  /** A pin's own address (its card's Copy link): its artifact's tab, opening the pin's card. */
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
  /** Place again: Comment mode until the next tap pins the moved pin anew. */
  function placeAgain(id: string) {
    placingFrom = mode;
    closeCard();
    setMode("comment", id);
  }
  /** The person's words in the open pin's thread; a resolved pin's reply reopens it ("Reply to reopen"). */
  function reply(text: string): boolean {
    if (!openPin) {
      return false;
    }
    const reopens = !!cardPin?.resolvedAt;
    cardError = doc
      ? doc.reply(openPin, text)
      : "The pane lost the page's document, so the reply wasn't kept. Reload, then reply again.";
    if (cardError === null && reopens && doc) {
      cardError = doc.resolve(openPin, false);
    }
    if (cardError === null) {
      // Said: the words are in the thread, so no draft is left to keep, and the pin stays.
      drafts.discard(openPin);
      if (madePin === openPin) {
        madePin = null;
      }
    }
    return cardError === null;
  }
  function resolvePin(resolved: boolean) {
    if (openPin) {
      cardError = doc
        ? doc.resolve(openPin, resolved)
        : `The pane lost the page's document, so the pin wasn't ${resolved ? "resolved" : "reopened"}. Reload, then try again.`;
    }
  }
  /**
   * The card's Delete, once asked in place: the pin goes from the doc (core
   * `deletePin`), its disc from the page, and the card closes. A refusal
   * throws its sentence, which stays under the question.
   */
  function deleteOpenPin(): Promise<void> {
    const id = openPin;
    if (!id) {
      return Promise.resolve();
    }
    const refused = doc
      ? doc.delete(id)
      : "The pane lost the page's document, so the pin wasn't deleted. Reload, then try again.";
    if (refused) {
      return Promise.reject(new Error(refused));
    }
    if (focusedPin === id) {
      focusedPin = null;
    }
    drafts.discard(id);
    closeCard();
    return Promise.resolve();
  }

  /** A key's mode: V Interact, C Comment, D Draw (Figma's V and C). */
  const MODE_KEYS = { v: "interact", c: "comment", d: "draw" } as const;
  /**
   * The pane's keys: V, C and D its modes, ⇧C every pin hidden or shown, J
   * and K a step through the pins, Enter opens one, Esc closes the card,
   * then leaves Comment or Draw for Interact.
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
      openCard(focusedPin);
    } else if (name === "Escape") {
      if (openPin) {
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
      // The pane's own, or its Comments panel's, which stands in a portal.
      !(
        target instanceof Node &&
        (section?.contains(target) || listPanel?.contains(target))
      ) ||
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
    if (openPin || mode !== "interact") {
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
          // The frame Try again reloaded answered: what it was tried for is over.
          retrying = false;
          if (failure?.again === "reload") {
            failure = null;
          }
          setMode(mode, placing);
          if (!pinsShown) {
            showPins(false);
          }
          openLinkedPin();
          if (openPin) {
            post({ type: "cawco:track-pin", id: openPin });
          }
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
          // draw it. A canvas keeps its own.
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
        if (id === placing || (placing && message.made !== true)) {
          // Placed again: the mode goes back to how it was before.
          if (placingFrom && placingFrom !== "comment") {
            setMode(placingFrom);
          } else {
            placing = null;
          }
          placingFrom = null;
        }
        openCard(id, message.made === true);
        break;
      }
      case "cawco:press":
        // A press on the page, outside the card: the outside-press rule, heard from the page's own process.
        if (openPin) {
          closeCard();
        }
        break;
      case "cawco:pin-at": {
        if (previewPinId(message.id) === openPin) {
          pinAt = previewPinAt(message);
          // No scroll brings it out from under the panel: the panel makes room for it.
          // Its room follows the pin as the page settles (a scroll still
          // running when it was first told), on the side it first took.
          if (message.stuck === true && listOpen && openPin && pinAt) {
            listYield = yieldFor(
              openPin,
              pinAt,
              listYield?.id === openPin ? listYield.side : undefined
            );
          }
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
        `.preview-tool[data-share="preview:${CSS.escape(instanceId)}"][data-artifact="${CSS.escape(id)}"]`
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
      zIndex: "50",
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
    if (artifact && unsentPicks) {
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
        count: { n: openCount, of: "Comments" },
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
  <!-- The page's picks the session has not heard; pins and ink go by themselves. -->
  <button
    data-slot="send"
    aria-busy={sending || undefined}
    aria-disabled={sending || undefined}
    class="send touch-hit"
    onclick={whileIdle(() => sending, sendPicks)}
    title="Send the page's picks to the session"
    type="button"
  >
    <PendingContent icon={IconSend} pending={sending} />
    <span data-slot="send-label" class="send-label">Send picks</span>
  </button>
{/snippet}
{#snippet sendMenu()}
  <DropdownMenu.Item
    disabled={sending}
    onSelect={whileIdle(() => sending, sendPicks)}
  >
    <IconSend /><span>Send picks</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet createBar()}
  <button
    aria-busy={making || undefined}
    aria-disabled={making || undefined}
    aria-label="New canvas"
    class="touch-hit"
    onclick={whileIdle(() => making, newCanvas)}
    title="New canvas"
    type="button"
  >
    <PendingContent icon={IconPlus} pending={making} />
  </button>
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
  <button
    data-slot="other"
    aria-label="Undock"
    class="other touch-hit"
    disabled={!stage}
    onclick={() => giveBack(false)}
    title="Undock"
    type="button"
  >
    <IconUndock />
  </button>
{/snippet}
{#snippet undockMenu()}
  <DropdownMenu.Item disabled={!stage} onSelect={() => giveBack(false)}>
    <IconUndock /><span>Undock</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet openBar()}
  {#if artifact}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <a
      data-slot="other"
      aria-label="Open in new tab"
      class="other touch-hit"
      href={`/artifact/${encodeURIComponent(artifact.id)}`}
      rel="noopener"
      target="_blank"
      title="Open in new tab"><IconExternal /></a
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
  <button
    aria-label={artifactWords.inspect}
    aria-pressed={inspectOpen}
    class="inspect touch-hit"
    onclick={() => showInspector(!inspectOpen)}
    title={artifactWords.inspectTitle}
    type="button"
  >
    <IconTuning />
  </button>
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
  <div class="modes">
    <Tabs
      onValueChange={(next) => setMode(previewMode(next) ?? "interact")}
      size="compact"
      value={mode}
      values={["interact", "comment", "draw"]}
    >
      <TabsList aria-label="Preview mode">
        <TabItem
          aria-keyshortcuts="V"
          icon={IconInteract}
          label="Interact"
          title="Interact (V): the page gets every click"
          value="interact"
        />
        <TabItem
          aria-keyshortcuts="C"
          icon={IconComment}
          label="Comment"
          title="Comment (C): a click pins a comment"
          value="comment"
        />
        <TabItem
          aria-keyshortcuts="D"
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
      title={`Mode: ${MODE_WORDS[mode]} (V, C, D)`}
    >
      <Glyph />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-48">
      {@render modeMenu()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

{#snippet commentsBar()}
  <!-- The Comments panel, floating over the page's top-right; the count is the open pins'. -->
  <button
    data-slot="comments"
    aria-expanded={listOpen}
    aria-haspopup="dialog"
    aria-label={`Comments${openCount > 0 ? `, ${openCount} open` : ""}${pinsShown ? "" : ", pins hidden"}`}
    class="comments mark-line touch-hit"
    onclick={() => showList(!listOpen)}
    title={pinsShown
      ? "Comments (⇧C hides the pins)"
      : "Comments (⇧C shows the pins)"}
    type="button"
  >
    <IconChat /><span class="comments-label">Comments</span>
    {#if openCount > 0}
      <span data-slot="count" class="count">{openCount}</span>
    {/if}
    {#if !pinsShown}
      <!-- ⇧C hid the pins: said where the person looks for them. -->
      <IconEyeClosed class="pins-hidden" />
    {/if}
  </button>
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item onSelect={() => showList(!listOpen)}>
    <IconChat /><span>Comments</span>{#if openCount > 0}<span class="menu-count"
        >{openCount}</span
      >{/if}
  </DropdownMenu.Item>
{/snippet}

{#snippet reloadBar()}
  <button
    data-slot="other"
    aria-label="Reload"
    class="other touch-hit"
    onclick={reloadPage}
    title="Reload"
    type="button"
  >
    <IconRefresh />
  </button>
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

{#if !isCanvas}
  <!-- The Comments panel: the kit's Popover, anchored under the head's
       Comments at the page's top-right, over the page and never pushing it.
       It stays while the person works the page and opens threads (a press
       outside it is theirs), and goes with its Close, Comments again, or
       an Esc once no card is open and the mode is Interact. -->
  <Popover.Root onOpenChange={showList} open={listOpen && !!well}>
    <Popover.Content
      data-pin-list-pop
      align="end"
      class="pin-list-pop"
      bind:ref={listPanel}
      customAnchor={listYield?.side === "bottom" ? wellFoot : wellCorner}
      onEscapeKeydown={(event) => {
        // The panel's escape layer takes Esc before the window hears it, so
        // Esc unwinds from the innermost here: the card, then Comment or
        // Draw back to Interact, then the panel itself; the split's
        // expansion is the next Esc's.
        if (openPin || mode !== "interact") {
          event.preventDefault();
          pressKey("Escape");
        }
      }}
      onInteractOutside={(event) => event.preventDefault()}
      onOpenAutoFocus={(event) => event.preventDefault()}
      side={listYield?.side === "bottom" ? "top" : "bottom"}
      sideOffset={GUTTER}
      style={`--pin-list-room: ${listRoom}px; --pin-list-pane: ${wellBox.w}px`}
      trapFocus={false}
    >
      <PinList
        focused={focusedPin}
        {live}
        hold={listHold}
        onclose={() => showList(false)}
        onopen={openCard}
        onplace={placeAgain}
        onretry={() => doc?.retry()}
        {pins}
        {placing}
      />
    </Popover.Content>
  </Popover.Root>
{/if}

{#if inset}
  <!-- Inset: no head and no modes; the page as the panel draws it. -->
  <section
    data-slot="preview-pane"
    data-preview-inset
    aria-label={artifact?.name ?? "Preview"}
    class="preview-pane preview-inset"
    bind:this={section}
  >
    <div class="inset-well" bind:this={well}>{@render framed()}</div>
  </section>
{:else}
  <SideSurface
    class={["preview-pane", mode !== "interact" && !isCanvas && `mode-${mode}`]
      .filter(Boolean)
      .join(" ")}
    closeFailed={failure?.again === "close"}
    {closing}
    items={headItems}
    label="Preview"
    onclose={ownTab ? backToSession : close}
    subtitle={headLine}
    subtitleId={`${paneId}-line`}
    {switcher}
    titleControl={artifact ? artifactTitle : undefined}
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
      class="canvas-slot"
      bind:this={canvasSlot}
    ></div>
  {:else if unreached}
    <!-- This tab can't reach the preview's own origin: what failed, what
         previews need unless the hub itself answered, and where to switch
         how they are reached. -->
    <div data-slot="down" class="down" role="alert" transition:appear>
      <EmptyState icon={IconAlert} title="This preview can't be reached">
        {#snippet line()}
          {unreachedBy?.said}.
          {#if !unreachedBy?.hub && previewsNeedFor.origin === paneOrigin}{previewsNeedFor.said}.{/if}
          Trying again on its own.
        {/snippet}
        {#snippet action()}
          <div class="down-actions">
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
              class="px-0"
              href="/config/previews"
              label="Preview settings"
              size="sm"
              variant="link"
            />
          </div>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <!-- The frame loads once its origin answered the probe (and, in host mode, its entry is in hand); the cover stands meanwhile. -->
    {#each reached?.origin === paneOrigin ? frames.filter((held) => !byHost || entries[held]) : [] as key (key)}
      {@const current = key === frameKey}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
      <iframe
        data-ready={!current || loaded || undefined}
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
        src={byHost ? entries[key]?.src : `${paneOrigin}${framePlace}`}
        data-scheme={themedFrame ? theme.resolved : undefined}
        style:width={inspecting && inspectorLayout === "panel"
          ? "calc(100% - var(--c-sheet-inspector-w))"
          : undefined}
        title="Preview"
        class:ready={!current || loaded}
        {@attach (node) => {
          if (key === frameKey) {
            iframe = node;
          }
        }}
      ></iframe>
    {/each}
    <div
      data-ready={((loaded || standing !== null) && !stageWaiting) || undefined}
      data-slot="cover"
      aria-hidden={stageWaiting ? undefined : "true"}
      class="cover"
      class:ready={(loaded || standing !== null) && !stageWaiting}
      role={stageWaiting ? "status" : undefined}
    >
      <span
        data-slot="block"
        class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
      ></span>
      {#if stageWaiting}
        <!-- A sheet's stage on its way: the project's own dev toolchain (Vite, Astro or Nuxt), started or woken by the daemon. -->
        <p class="cover-state">{stageWaiting}</p>
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
      <div aria-hidden="true" class="sheet-dim" transition:appear></div>
      <div
        data-slot="sheet-error"
        class="sheet-error"
        role="alert"
        transition:appear
      >
        <p class="sheet-error-title">
          {sheetWords.errorTitle} <code>{errorPlace(first)}</code>
        </p>
        <p class="sheet-error-line">{first.message.split("\n")[0]}</p>
        {#if first.frame}
          <pre class="sheet-error-frame">{first.frame}</pre>
        {/if}
        <p class="sheet-error-next">
          {sheetWords.errorNext(compileErrors.length - 1)}
        </p>
      </div>
    {/if}
  {/if}
  {#if staged?.status === "error"}
    <!-- The stage or the server didn't start, or failed its restarts: where the page would be. -->
    <div data-slot="down" class="down" role="alert" transition:appear>
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
          <div class="down-actions">
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
            <p id={stageDetailsId} data-slot="details" class="down-details">
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
      class="down"
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
          <div class="down-actions">
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
            <p id={stageDetailsId} data-slot="details" class="down-details">
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
    <div data-slot="down" class="down" role="alert" transition:appear>
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
          <div class="down-actions">
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
                class="px-0"
                href={fleet.sessionHref(owner.id)}
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
  <!-- The open pin's card, over the page beside its pin (the frame fills the well). -->
  <div
    data-slot="pin-room"
    class="pin-room"
    bind:this={pinRoom}
    bind:clientHeight={roomH}
    bind:clientWidth={roomW}
  >
    {#if cardPin}
      <PinCard
        agentName={owner ? ownerName : "The session"}
        at={pinAt}
        link={pinLink(cardPin.number)}
        live={live.has(cardPin.id)}
        onclose={closeCard}
        ondelete={deleteOpenPin}
        onreply={reply}
        onresolve={resolvePin}
        pin={cardPin}
        problem={cardError}
        room={{
          w: listWidth > 0 && !sheet ? roomW - listWidth - GUTTER : roomW,
          h: roomH,
        }}
        {sheet}
        bind:draft={
          () => (cardPin ? drafts.text(cardPin.id) : ""),
          (text) => {
            // Read as the card leaves too, its pin already gone from the pane.
            if (cardPin) {
              drafts.set(cardPin.id, text);
            }
          }
        }
      />
    {/if}
  </div>
  {#if failure}
    <div class="error" role="alert" transition:appear>
      <p>{failure.message}</p>
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

<style>
  /* Inset: the host's surface around it; the well is the panel's own
     (SideSurface `.side-well`): the recess inside its hairline. */
  /* A size container, as the side card is: what stands in its well keys on
     the pane's width (the head's narrow line, a canvas's map). */
  .preview-inset {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-block-size: 0;
  }
  .inset-well {
    position: relative;
    flex: 1;
    min-block-size: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
  }
  /* The header's controls are the card's (SideSurface); in Comment and
     Draw the ones that would leave the page wait. */
  :global(.preview-pane:is(.mode-comment, .mode-draw) .other) {
    opacity: 0.5;
  }
  /* The well is the card's (SideSurface). Comment and Draw turn the well's
     own border the accent, 2px, inside its box: never a second ring round
     it. Interact leaves it as the page's own. */
  :global(.preview-pane .side-well) {
    outline: var(--focus-ring-width) solid transparent;
    outline-offset: var(--focus-ring-inset);
    transition: outline-color var(--dur-control) var(--ease-in-out);
  }
  :global(.preview-pane:is(.mode-comment, .mode-draw) .side-well) {
    outline-color: var(--accent);
    cursor: crosshair;
  }
  /* The mode's segmented control sits among the head's controls at their
     height, never wrapping its three segments. Its segments are their
     glyphs, as a canvas tool's toolbar is (Figma, Framer, Miro): each name
     stays its accessible name and its title, never drawn, so the control
     keeps one width at every pane width and its indicator never moves as
     the pane resizes (side-expand: the split slides on one clock). */
  .modes {
    display: flex;
    flex-shrink: 0;
  }
  .modes :global(.ff-tab .label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* Comments: the sm ghost with its glyph, its word and the open count in
     tabular figures; pressed while its panel is open. */
  .comments {
    font-variant-numeric: tabular-nums;
  }
  .comments[aria-expanded="true"],
  .inspect[aria-pressed="true"] {
    /* The kit Toggle's on state: by day a step past the hover. */
    background: var(--surface-pressed);
  }
  .count,
  .comments :global(.pins-hidden) {
    min-width: 1ch;
    color: var(--ink-muted);
  }
  /* The Comments panel: the kit's popover surface, about a fifth of the
     pane wide, at most the well's height less its gutter, the rows
     scrolling inside it. */
  :global(.pin-list-pop) {
    inline-size: clamp(
      var(--c-pin-list-min),
      calc(var(--pin-list-pane) * var(--c-pin-list-share)),
      min(var(--c-pin-list-max), calc(var(--pin-list-pane) - var(--space-4)))
    );
    max-block-size: min(
      calc(var(--pin-list-room) - var(--space-4)),
      var(--bits-popover-content-available-height, 100dvh)
    );
    padding: var(--space-2);
    gap: 0;
  }
  /* The room the open pin's card stands in: the well's box, letting every
     press through to the page but the card's own. */
  .pin-room {
    position: absolute;
    inset: 0;
    pointer-events: none;

    & > :global(*) {
      pointer-events: auto;
    }
  }
  /* The replacement's load releases the old paint independently of the overlay.
     A frame's `prefers-color-scheme` follows its element's `color-scheme`: a
     page or sheet hears the dashboard's theme (`data-scheme`), a preview
     the light it always had. */
  iframe {
    position: absolute;
    inset: 0;
    color-scheme: light;
    background: Canvas;
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);

    &[data-scheme="dark"] {
      color-scheme: dark;
    }
  }
  iframe.ready {
    opacity: 1;
  }
  /* The canvas's stage (canvas/) stands over the well's whole box. */
  .canvas-slot {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  /* Covers the frame until it connects, holding one kit skeleton line. */
  .cover {
    position: absolute;
    inset: 0;
    padding: var(--space-5);
    background: var(--surface-recess);
    pointer-events: none;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .cover.ready {
    opacity: 0;
  }
  /* Nothing until the wait has lasted the grace (DESIGN.md's Real Wait
     Rule): then the skeleton line and what the stage is doing fade up. */
  .cover > * {
    animation: kit-fade-in 1ms var(--dur-wait-grace) both;

    @media (prefers-reduced-motion: no-preference) {
      animation-duration: var(--dur-fade);
      animation-timing-function: var(--ease-out);
    }
  }
  /* What a sheet's stage is doing while its page is on its way, under the cover's line. */
  .cover-state {
    margin: var(--space-3) 0 0;
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  /* A sheet that doesn't compile: its last render dimmed under the scrim,
     the error's card at the well's foot, as the failure band stands. */
  .sheet-dim {
    position: absolute;
    inset: 0;
    background: var(--scrim);
    pointer-events: none;
  }
  .sheet-error {
    position: absolute;
    inset-inline: var(--space-3);
    bottom: var(--space-3);
    display: grid;
    gap: var(--space-2);
    max-block-size: 60%;
    overflow: auto;
    padding: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);

    & p {
      margin: 0;
    }
  }
  .sheet-error-title {
    color: var(--data-bad);
    font-size: var(--text-body);
    font-weight: var(--weight-strong);

    & code {
      font: var(--type-code);
    }
  }
  .sheet-error-line,
  .sheet-error-next {
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  .sheet-error-frame {
    margin: 0;
    overflow-x: auto;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-code);
  }
  /* A cover faded away is not loading: its sweep holds still. */
  .cover.ready :global(*),
  .cover.ready :global(*::after) {
    animation-play-state: paused;
  }
  /* Nothing serves the page: the kit's empty state stands over the well, on
     the well's own ground, at the column the page would have started on. */
  .down {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding-inline: var(--space-6);
    background: var(--surface-well);
  }
  /* Try again, and beside it the session that serves the page; under it
     when the pane is too narrow for both. */
  .down-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  /* What the stage said, word for word, under its Show details: the figure
     face in muted ink, a long machine path wrapping anywhere. */
  .down-details {
    margin: var(--space-2) 0 0;
    color: var(--ink-muted);
    font: var(--type-code);
    font-variant-ligatures: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* What went wrong, over the foot of the frame, and the one thing to do
     about it. */
  .error {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-raised);
    border-top: 1px solid var(--border-hairline);

    & p {
      flex: 1;
      min-width: 0;
      margin: 0;
      color: var(--data-bad);
      font-size: var(--text-body);
      font-weight: var(--weight-body);
    }
  }
  /* Send picks and Comments in their narrowest form keep their glyphs (and
     the count) and let their words go: the head's fit decides (side/head.ts,
     words only on a 640px pane and only where they fit). */
  :global([data-head-item][data-form="compact"]) .comments-label,
  :global([data-head-item][data-form="compact"]) .send-label {
    display: none;
  }
  /* Comments in More says its open count at the entry's end. */
  .menu-count {
    margin-inline-start: auto;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
