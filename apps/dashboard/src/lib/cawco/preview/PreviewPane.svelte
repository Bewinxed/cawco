<script lang="ts">
  import {
    machineLabel,
    PREVIEW_LOCKED_MESSAGE,
    PREVIEW_PING_PATH,
    type PreviewDown,
    type PreviewSettings,
    type PreviewTicket,
    previewEnterUrl,
    previewRoute,
    type ShownFailure,
  } from "@cawco/core";
  import { type PreviewMode, previewMode } from "@cawco/core/comments";
  import { type Snippet, untrack } from "svelte";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
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
    IconTuning,
    IconUndock,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { goto } from "$app/navigation";
  import {
    artifactShown,
    createDraftCanvas,
    showArtifact,
    writeSheet,
  } from "../artifact-api";
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
  import SideSurface from "../side/SideSurface.svelte";
  import { readJson, store, stored, writeJson } from "../storage";
  import ArtifactMenu from "./ArtifactMenu.svelte";
  import {
    type ArtifactDoc,
    type ArtifactView,
    artifactSyncPath,
    joinArtifact,
    sendArtifact,
  } from "./artifact-doc";
  import PinCard from "./PinCard.svelte";
  import PinList from "./PinList.svelte";
  import PlacePick from "./PlacePick.svelte";
  import { paneFleet } from "./pane-fleet";
  import { pinDrafts } from "./pin-drafts.svelte";
  import SheetInspector from "./SheetInspector.svelte";
  import { isSetupPage } from "./setup-page";
  import { SheetInspector as Inspector } from "./sheet-inspector.svelte";
  import { previewPlace } from "./source";
  import {
    type PaneKey,
    previewError,
    previewErrorOf,
    previewKey,
    previewPickPlace,
    previewPinAt,
    previewPinId,
    previewPng,
    previewSheet,
    previewShortcut,
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
     * mounted off screen keeps its page loaded for {@link PARK_MS}, then
     * unloads it, and loads it again once its tab is back.
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
  let captured = false;
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
   * which answers any page with no credentials): probed once per origin,
   * before the frame loads. Unreached, the pane says what previews need
   * and where to switch how they are reached: never a fallback.
   */
  let reached = $state<{ origin: string; ok: boolean } | null>(null);
  let unreachedWhy = $state("");
  $effect(() => {
    const origin = paneOrigin;
    if (!origin || reached?.origin === origin) {
      return;
    }
    let live = true;
    fetch(`${origin}${PREVIEW_PING_PATH}`, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    })
      .then((answer) => answer.ok)
      .catch(() => false)
      .then(async (ok) => {
        if (!live) {
          return;
        }
        if (!ok) {
          unreachedWhy = await previewsNeed(origin);
        }
        reached = { origin, ok };
      });
    return () => {
      live = false;
    };
  });
  const unreached = $derived(
    !!paneOrigin && reached?.origin === paneOrigin && !reached.ok
  );
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
  let displayPath = $state("");
  /**
   * A page is served at the root of its own address: the head names the
   * artifact, with no path under it.
   */
  const page = $derived(!!source && "page" in source);
  const artifact = $derived(preview?.artifact);
  const frameKey = $derived(`${preview?.revision}:${reload}`);
  // The old paint bridges navigation only until the replacement finishes loading.
  let standing = $state<string | null>(null);
  /**
   * How long a page whose conversation's tab is off screen stays loaded. A
   * preview is the dashboard's own process and thread wherever the browser
   * keeps a frame of the same site there (every WebKit, and Chromium over
   * plain http), so a page left running in every tab kept open adds up. Our
   * call: a glance at another tab and back keeps the page as it was.
   */
  const PARK_MS = 30_000;
  /** Off screen past {@link PARK_MS}: no frame stands, and the cover waits for the next load. */
  let parked = $state(false);
  $effect(() => {
    if (onScreen) {
      parked = false;
      return;
    }
    const timer = setTimeout(() => {
      parked = true;
      standing = null;
      loaded = false;
      connected = false;
      // A ticket is spent by its frame's load: the next load asks again.
      entries = {};
    }, PARK_MS);
    return () => clearTimeout(timer);
  });
  const frames = $derived.by(() => {
    if (parked) {
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
      parked ||
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
          throw new Error((await answer.text()) || `HTTP ${answer.status}`);
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
   * reloaded page answers with a capture, which either clears the failure or
   * states the new one.
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
      captured = false;
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
  /** The page has picks the session has not heard: the head offers to send them. */
  const unsentPicks = $derived(
    !!view &&
      Object.values(view.choices).some(
        (entry) => !view?.sentAt || entry.at > view.sentAt
      )
  );
  /*
   * A sheet's stage (live components): the project's own Vite, which the
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
    artifact?.kind === "sheet" || served ? (view?.stage ?? null) : null
  );
  /** What the cover says while the page is on its way; null when nothing is. */
  const stageWaiting = $derived.by(() => {
    switch (staged?.status) {
      case "starting":
        return served
          ? "Starting the server…"
          : `Starting the dev server in ${staged.dir}…`;
      case "waking":
      case "asleep":
        return "Waking…";
      case "live":
        return connected || served ? null : "Compiling…";
      default:
        return null;
    }
  });
  const compileErrors = $derived(
    staged?.status === "live" ? staged.errors : []
  );
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
  const isSheet = $derived(artifact?.kind === "sheet");
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
  /** A compile error's place, `file:line:column` as far as Vite's payload names it. */
  const errorPlace = (error: {
    column: number | null;
    file: string;
    line: number | null;
  }) =>
    `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
  /** The head's Comments count: the panel's Open tab, the pins on the page not resolved (the app's `ArtifactComments.open`). */
  const openCount = $derived(
    pins.filter((pin) => !(pin.resolvedAt || pin.movedAt)).length
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
  let sending = $state(false);
  const artifactId = $derived(artifact?.id);
  $effect(() => {
    const id = artifactId;
    const session = instanceId;
    if (!id) {
      return;
    }
    const joined = joinArtifact(session, id, (next) => {
      view = next;
    });
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
        displayPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        keepAt(parsed);
        if (preview) {
          preview.title = previewTitle(message.title) ?? "";
        }
        if (message.type === "cawco:ready") {
          connected = true;
          refusedEntries = 0;
          setMode(mode, placing);
          if (!pinsShown) {
            showPins(false);
          }
          openLinkedPin();
          if (openPin) {
            post({ type: "cawco:track-pin", id: openPin });
          }
          if (!captured) {
            captured = true;
            post({ type: "cawco:capture" });
          }
        }
        break;
      }
      case "cawco:capture": {
        const png = previewPng(message.png);
        if (png && preview) {
          preview.thumbnail = png;
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
</script>

<svelte:window
  onkeydown={(event) => {
    parentEscape(event);
    paneKey(event);
  }}
  onmessage={receive}
/>

{#snippet controls()}
  {#if artifact && unsentPicks}
    <!-- The page's picks the session has not heard; pins and ink go by themselves. -->
    <button
      data-slot="send"
      aria-busy={sending || undefined}
      aria-disabled={sending || undefined}
      class="touch-hit"
      onclick={whileIdle(() => sending, sendPicks)}
      title="Send the page's picks to the session"
      type="button"
    >
      <PendingContent icon={IconSend} pending={sending} />
      <span data-slot="send-label">Send picks</span>
    </button>
  {/if}
  {#if !(ownTab || linkSession)}
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
  {/if}
  {#if canUndock}
    <button
      data-slot="other"
      aria-label="Undock"
      class="touch-hit"
      disabled={!stage}
      onclick={() => giveBack(false)}
      title="Undock"
      type="button"
    >
      <IconUndock />
    </button>
  {/if}
  {#if artifact && !ownTab}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <a
      data-slot="other"
      aria-label="Open in new tab"
      class="touch-hit data-dimmed:opacity-50"
      data-dimmed={(mode !== "interact" && !isCanvas) || undefined}
      href={`/artifact/${encodeURIComponent(artifact.id)}`}
      rel="noopener"
      target="_blank"
      title="Open in new tab"><IconExternal /></a
    >
  {/if}
  {#if inspector}
    <!-- A sheet's inspector: its stories' props as controls, beside the page or over its foot. -->
    <button
      aria-label="Inspect"
      aria-pressed={inspectOpen}
      class="touch-hit aria-pressed:bg-surface-fill"
      onclick={() => showInspector(!inspectOpen)}
      title="Inspect: change the story's props, then Save them into its file"
      type="button"
    >
      <IconTuning />
    </button>
  {/if}
  {#if !isCanvas}
    <!-- The mode: Interact, Comment, Draw (V, C, D; Esc back to Interact),
         the kit's segmented control, its indicator on the chosen one. -->
    <div data-slot="modes" class="flex shrink-0">
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
    <!-- The Comments panel, floating over the page's top-right; the count is the open pins'. -->
    <button
      data-slot="comments"
      aria-expanded={listOpen}
      aria-haspopup="dialog"
      aria-label={`Comments, ${openCount} open${pinsShown ? "" : ", pins hidden"}`}
      class="mark-line touch-hit num aria-expanded:bg-surface-fill"
      onclick={() => showList(!listOpen)}
      style:--count-min="1ch"
      title={pinsShown
        ? "Comments (⇧C hides the pins)"
        : "Comments (⇧C shows the pins)"}
      type="button"
    >
      <IconChat /><span class="@max-phone:hidden">Comments</span>
      <span data-slot="count" class="min-w-(--count-min) text-ink-muted"
        >{openCount}</span
      >
      {#if !pinsShown}
        <!-- ⇧C hid the pins: said where the person looks for them. -->
        <IconEyeClosed class="min-w-(--count-min) text-ink-muted" />
      {/if}
    </button>
  {/if}
  <button
    data-slot="other"
    aria-label="Reload"
    class="touch-hit data-dimmed:opacity-50"
    data-dimmed={(mode !== "interact" && !isCanvas) || undefined}
    onclick={() => {
      if (isCanvas && stage?.frame) {
        stage.frame.src = stage.src;
      } else {
        reload += 1;
      }
    }}
    title="Reload"
    type="button"
  >
    <IconRefresh />
  </button>
{/snippet}

<!-- The card beside the conversation (SideSurface): the switch, the
     page's name and place (never "Preview" again under the switch that says
     it), the preview's own controls, Close; the page in the well. -->
{#snippet artifactTitle()}
  {#if artifact}
    <ArtifactMenu {instanceId} held={preview?.artifacts} shown={artifact} />
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
      class="w-(--pin-list-w) max-h-(--pin-list-h) p-space-2 gap-0"
      bind:ref={listPanel}
      customAnchor={wellCorner}
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
      side="bottom"
      sideOffset={GUTTER}
      style={`--pin-list-room: ${wellBox.h}px; --pin-list-pane: ${wellBox.w}px; --pin-list-w: clamp(var(--c-pin-list-min), calc(var(--pin-list-pane) * var(--c-pin-list-share)), min(var(--c-pin-list-max), calc(var(--pin-list-pane) - var(--space-4)))); --pin-list-h: min(calc(var(--pin-list-room) - var(--space-4)), var(--bits-popover-content-available-height, 100dvh))`}
      trapFocus={false}
    >
      <PinList
        focused={focusedPin}
        {live}
        onclose={() => showList(false)}
        onopen={openCard}
        onplace={placeAgain}
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
    class="flex flex-col flex-1 min-h-0"
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
    actions={controls}
    class={["preview-pane", mode !== "interact" && !isCanvas && `mode-${mode}`]
      .filter(Boolean)
      .join(" ")}
    closeFailed={failure?.again === "close"}
    {closing}
    label="Preview"
    onclose={ownTab ? backToSession : close}
    subtitle={page ? "" : displayPath || (source ? previewPlace(source) : "")}
    {switcher}
    titleControl={artifact ? artifactTitle : undefined}
    bind:section
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
    <!-- This tab can't reach the preview's own origin: what previews need,
         and where to switch how they are reached. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title="This preview can't be reached">
        {#snippet line()}
          {unreachedWhy}.
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              icon={IconRefresh}
              label="Try again"
              onclick={() => {
                reached = null;
              }}
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
        data-panel-inspector={(inspecting && inspectorLayout === "panel") ||
          undefined}
        class="absolute inset-0 scheme-light bg-(color:--frame-bg) block size-full border-none border-current opacity-0 transition-[opacity] dur-control ease-out data-ready:opacity-100 data-panel-inspector:w-(--frame-w)"
        style:--frame-bg="Canvas"
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
        src={byHost ? entries[key]?.src : `${paneOrigin}${framePlace}`}
        title="Preview"
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
      class="absolute inset-0 p-space-5 bg-surface-recess pointer-events-none transition-[opacity] dur-control ease-out data-ready:opacity-0"
      role={stageWaiting ? "status" : undefined}
    >
      <!-- literal: 11px, 42% -->
      <span
        data-slot="block"
        class="kit-skeleton block h-(--sk-h) w-(--sk-w) rounded-xs"
        style:--sk-h="11px"
        style:--sk-w="42%"
      ></span>
      {#if stageWaiting}
        <!-- A sheet's stage on its way: the project's own Vite, started or woken by the daemon. -->
        <p class="mt-space-3 mx-0 mb-0 text-ink-muted type-meta">
          {stageWaiting}
        </p>
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
        class="absolute inset-x-space-3 bottom-space-3 grid gap-space-2 max-h-(--err-max) overflow-auto p-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-tile"
        style:--err-max="60%"
        role="alert"
        transition:appear
      >
        <p class="m-0 text-data-bad text-size-body font-medium">
          Doesn't compile: <code class="type-code">{errorPlace(first)}</code>
        </p>
        <p class="m-0 text-ink-muted type-meta">
          {first.message.split("\n")[0]}
        </p>
        {#if first.frame}
          <pre
            class="m-0 overflow-x-auto p-space-2 rounded-sm bg-surface-recess text-ink-strong type-code">{first.frame}</pre>
        {/if}
        <p class="m-0 text-ink-muted type-meta">
          {compileErrors.length > 1
            ? `${compileErrors.length - 1} more besides. `
            : ""}The session is told; the sheet redraws once it compiles.
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
          ? `The server on port ${served.port} isn't running`
          : `The stage for ${staged.dir} didn't start`}
      >
        {#snippet line()}
          {staged.message ??
            (served
              ? "It ended before it answered."
              : "Vite ended before it served the sheet.")} Try again starts it again.
        {/snippet}
        {#snippet action()}
          <Button
            icon={IconRefresh}
            label="Try again"
            onclick={retry}
            pending={retrying}
            pendingLabel="Starting…"
            size="sm"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if down && staged?.status !== "error"}
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
    class="absolute inset-0 pointer-events-none"
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
          () => drafts.text(cardPin.id), (text) => drafts.set(cardPin.id, text)
        }
      />
    {/if}
  </div>
  {#if failure}
    <div
      class="absolute inset-x-0 bottom-0 flex items-center gap-space-3 px-space-3 py-space-2 bg-surface-raised border-t border-t-border-hairline"
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

<style>
  /* css-scope .preview-pane: this pane's root; SideSurface's notes name the rule below */
  /* residual: foreign-dom */
  /* The well is the card's (SideSurface). Comment and Draw turn the well's
     own border the accent, 2px, inside its box: never a second ring round
     it. Interact leaves it as the page's own. */
  :global(.preview-pane [data-slot="side-well"]) {
    outline: var(--focus-ring-width) solid transparent;
    outline-offset: var(--focus-ring-inset);
    transition: outline-color var(--dur-control) var(--ease-in-out);
  }
  :global(.preview-pane:is(.mode-comment, .mode-draw) [data-slot="side-well"]) {
    outline-color: var(--accent);
    cursor: crosshair;
  }
  /* The mode's segmented control keeps its segments to their glyphs: each
     name stays its accessible name and its title, never drawn. */
  [data-slot="modes"]
    :global([data-slot="ff-tab"] [data-slot="tab-item-label"]) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* The room the open pin's card stands in lets every press through to the
     page but the card's own. */
  [data-slot="pin-room"] > :global(*) {
    pointer-events: auto;
  }
  /* residual: unmapped */
  /* A cover faded away is not loading: its sweep holds still. */
  [data-slot="cover"][data-ready] :global(*) {
    animation-play-state: paused;
  }
  /* residual: pseudo */
  [data-slot="cover"][data-ready] :global(*::after) {
    animation-play-state: paused;
  }
</style>
