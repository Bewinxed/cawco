<script lang="ts">
  import {
    machineLabel,
    PREVIEW_LOCKED_MESSAGE,
    PREVIEW_PING_PATH,
    type PreviewDown,
    type PreviewSettings,
    type PreviewTicket,
    previewEnterUrl,
    previewOrigin,
    type ShownFailure,
  } from "@cawco/core";
  import { pinUnsent, type SendPicture } from "@cawco/core/comments";
  import { type Snippet, untrack } from "svelte";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    IconAlert,
    IconComment,
    IconExternal,
    IconPlus,
    IconRefresh,
    IconSend,
    IconUndock,
  } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import { goto } from "$app/navigation";
  import {
    artifactShown,
    createDraftCanvas,
    exportCanvas,
    showArtifact,
  } from "../artifact-api";
  import {
    handBack,
    holdStage,
    letGo,
    type Stage,
  } from "../canvas/stage.svelte";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import { resolveSessionTitle } from "../links";
  import { appear, dur } from "../motion/curves.svelte";
  import { closeInto } from "../motion/share.svelte";
  import { watchInput } from "../reload.svelte";
  import { sideExpand } from "../side/expand";
  import SideSurface from "../side/SideSurface.svelte";
  import ArtifactMenu from "./ArtifactMenu.svelte";
  import {
    type ArtifactDoc,
    type ArtifactView,
    artifactSyncPath,
    joinArtifact,
    sendArtifact,
  } from "./artifact-doc";
  import { heardInk } from "./ink.svelte";
  import PinCard from "./PinCard.svelte";
  import PinList from "./PinList.svelte";
  import PlacePick from "./PlacePick.svelte";
  import { paneFleet } from "./pane-fleet";
  import { pinDrafts } from "./pin-drafts.svelte";
  import { pinName } from "./pin-name";
  import { isSetupPage } from "./setup-page";
  import { previewPlace } from "./source";
  import {
    previewError,
    previewErrorOf,
    previewKey,
    previewPickPlace,
    previewPictures,
    previewPinAt,
    previewPinId,
    previewPng,
    previewTitle,
    previewUrl,
  } from "./wire";

  let {
    instanceId,
    switcher,
    sheet = false,
    linkSession = false,
    ownTab = false,
  }: {
    instanceId: string;
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
  /** Comment mode: a tap on the page pins a comment to what it lands on (key C). */
  let commenting = $state(false);
  let connected = $state(false);
  let loaded = $state(false);
  let captured = false;
  let reload = $state(0);
  /**
   * What last went wrong, and what trying again means: the frame's own
   * errors (a capture the page refused) reload the frame; a refused close
   * asks again; a refused send sends again. A field the hub's bounds
   * refused has no way back here: the page says so under the field, and
   * the band goes once the field is kept.
   */
  let failure = $state<{
    message: string;
    again: "reload" | "close" | "send" | null;
  } | null>(null);
  let well = $state<HTMLDivElement>();
  /** The session's panel, row and machines, from whichever store this tree set (pane-fleet.ts). */
  const fleet = paneFleet();
  const preview = $derived(fleet.preview(instanceId));
  const source = $derived(preview?.source);
  /**
   * The preview's own origin, never the dashboard's (core `previewOrigin`):
   * its port on the host this tab reached the dashboard by, or its own host
   * name. The page runs at its root as on its own server.
   */
  const paneOrigin = $derived(
    preview ? (previewOrigin(preview, location) ?? "") : ""
  );
  /**
   * Where the reader had gone inside this show, kept per session so a reload
   * of the tab (by hand, or by itself once idle: reload.svelte.ts) opens the
   * preview there again. A new show (another revision) starts at its root.
   */
  const keepKey = $derived(`cawco-preview-at:${instanceId}`);
  function keptAt(): string | null {
    try {
      const kept = JSON.parse(localStorage.getItem(keepKey) ?? "null") as {
        at?: unknown;
        revision?: unknown;
      } | null;
      return kept?.revision === preview?.revision &&
        typeof kept?.at === "string" &&
        kept.at.startsWith("/")
        ? kept.at
        : null;
    } catch {
      return null;
    }
  }
  /** `at` is the page's own place on its origin (the overlay's `url`). */
  function keepAt(at: URL): void {
    const place = `${at.pathname}${at.search}${at.hash}`;
    if (!(paneOrigin && preview)) {
      return;
    }
    localStorage.setItem(
      keepKey,
      JSON.stringify({ revision: preview.revision, at: place })
    );
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
   * Host mode: every name is locked to the hub's pass (hub
   * preview-access.ts), so each frame load enters with a ticket of its own,
   * asked for here, and the frame's address is the entry, which sets the
   * pass and goes on to the place. Port mode: the place, straight.
   */
  const byHost = $derived(!!preview?.origin);
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
  /** What previews need to be reached from this tab, from the fleet's mode. */
  async function previewsNeed(origin: string): Promise<string> {
    const settings = await fetch("/api/preview-settings")
      .then((answer) =>
        answer.ok ? (answer.json() as Promise<PreviewSettings>) : null
      )
      .catch(() => null);
    if (settings?.mode === "host") {
      return `Previews need ${new URL(origin).host} to reach the hub, or switch previews to ports`;
    }
    return `Previews need ports ${settings?.ports ?? "of the hub's range"} reachable on ${location.hostname}, or switch previews to a hostname pattern`;
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
  const frames = $derived(
    standing === null || standing === frameKey
      ? [frameKey]
      : [standing, frameKey]
  );
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
    if (!(byHost && origin && reached?.origin === origin && reached.ok)) {
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
  /** The way back from what a page's `cawco:error` names. */
  const AGAIN = { send: "send", field: null } as const;

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
   * The pane joins the same doc too (artifact-doc.ts): the picks and pins
   * the session has not heard, which Send N sends, and the pins' threads,
   * which the list and the card read and the person writes.
   */
  let view = $state.raw<ArtifactView | null>(null);
  let doc: ArtifactDoc | null = null;
  /** Picks the session has not heard sent. */
  const unsentPicks = $derived(
    view
      ? Object.values(view.choices).filter(
          (entry) => !view?.sentAt || entry.at > view.sentAt
        ).length
      : 0
  );
  /** N on Send N: every pick, pin and reply the session has not heard. */
  const owed = $derived(
    unsentPicks + (view ? view.pins.filter(pinUnsent).length : 0)
  );
  const pins = $derived(view?.pins ?? []);
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

  /**
   * A page's answers to the pane's asks (pictures for a send, a pin's
   * picture), each under the ask's number.
   */
  let nextAsk = 1;
  const asks = new Map<
    number,
    (pictures: SendPicture[] | null, url: string | null) => void
  >();
  /** How long a page has to draw a send's pictures. Our call: a page's rasters take a second or two. */
  const PICTURES_MS = 20_000;
  function pagePictures(): Promise<{
    pictures: SendPicture[];
    url: string | null;
  }> {
    const ask = nextAsk;
    nextAsk += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        asks.delete(ask);
        reject(
          new Error(
            "The page didn't draw its pins' pictures, so nothing was sent. Send again."
          )
        );
      }, PICTURES_MS);
      asks.set(ask, (pictures, address) => {
        clearTimeout(timer);
        asks.delete(ask);
        if (pictures) {
          resolve({ pictures, url: address });
        } else {
          reject(
            new Error(
              "The page's pictures weren't ones the hub takes, so nothing was sent. Send again."
            )
          );
        }
      });
      post({ type: "cawco:send-pictures", ask });
    });
  }
  /** A canvas's own picture, as the hub keeps it, with its pins. */
  async function canvasPictures(id: string): Promise<SendPicture[]> {
    const { png } = await exportCanvas(id);
    return png ? [{ pin: null, png }] : [];
  }

  /**
   * Send N: the hub's send, which applies a setup page's fleet choices and
   * place first, then tells the session it has new responses here to read,
   * with each pin's picture. A refusal is said where the person is: under
   * the open card's field, else in the band over the page, its way back
   * sending again.
   */
  async function send() {
    if (!artifact) {
      return;
    }
    sending = true;
    try {
      const drawn = isCanvas
        ? { pictures: await canvasPictures(artifact.id), url: null }
        : await pagePictures();
      await sendArtifact(instanceId, artifact.id, {
        pictures: drawn.pictures,
        ...(drawn.url ? { url: drawn.url } : {}),
      });
      cardError = null;
      if (failure?.again === "send") {
        failure = null;
      }
    } catch (error) {
      const message = failureWords(error);
      if (openPin) {
        cardError = message;
      } else {
        failure = { message, again: "send" };
      }
      return;
    } finally {
      sending = false;
    }
    // The setup page is done once sent: on a phone its sheet stands over the
    // thread, where Caw answers with the files and "Open the board".
    if (sheet && isSetupPage(artifact, owner?.projectId)) {
      await close();
    }
  }
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
  /** Comment mode on or off; `place` is the moved pin the next tap places again. */
  function comment(on: boolean, place: string | null = null) {
    commenting = on;
    placing = on ? place : null;
    post({ type: "cawco:mode", mode: on ? "comment" : "off", place: placing });
  }

  /*
   * The pins (Projects spec §5.7; tsk-3): the list under the head, the
   * card over the page beside its pin, J and K stepping through them.
   */
  /** The pin whose card is open. */
  let openPin = $state<string | null>(null);
  /** Its disc in the page's viewport, as the page tells it while it scrolls. */
  let pinAt = $state<{ r: number; x: number; y: number } | null>(null);
  /** The pin J and K stand on. */
  let focusedPin = $state<string | null>(null);
  /** The moved pin a tap places again, and whether Comment mode was off before. */
  let placing = $state<string | null>(null);
  let placingLeaves = false;
  let thumbs = $state<Record<string, string | null>>({});
  /** What went wrong with the open card's reply, resolve or send. */
  let cardError = $state<string | null>(null);
  let roomW = $state(0);
  let roomH = $state(0);
  const cardPin = $derived(pins.find((pin) => pin.id === openPin) ?? null);
  /** Pins the agent is working on: the last send carried them and its turn runs. */
  const live = $derived.by(() => {
    const sentAt = view?.sentAt;
    if (!(sentAt && fleet.working(instanceId))) {
      return new Set<string>();
    }
    return new Set(
      pins
        .filter(
          (pin) =>
            !pin.resolvedAt &&
            (pin.sentAt === sentAt ||
              pin.thread.some((entry) => entry.sentAt === sentAt))
        )
        .map((pin) => pin.id)
    );
  });
  /** The pins J and K step through: those on the page, by number. */
  const stepping = $derived(pins.filter((pin) => !pin.movedAt));

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
    if (!(id in thumbs)) {
      post({ type: "cawco:picture", id, thumb: true });
    }
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
  /** Place again: Comment mode until the next tap pins the moved pin anew. */
  function placeAgain(id: string) {
    placingLeaves = !commenting;
    closeCard();
    comment(true, id);
  }
  function reply(text: string): boolean {
    if (!openPin) {
      return false;
    }
    cardError = doc
      ? doc.reply(openPin, text)
      : "The pane lost the page's document, so the reply wasn't kept. Reload, then reply again.";
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
  /** A pin's picture full size, in the lightbox, out of its thumbnail. */
  let lightboxFrom: HTMLElement | null = null;
  function pictureOf(from: HTMLElement) {
    if (openPin) {
      lightboxFrom = from;
      post({ type: "cawco:picture", id: openPin, thumb: false });
    }
  }
  async function showPicture(id: string, png: string) {
    const src = `data:image/png;base64,${png}`;
    const image = new Image();
    image.src = src;
    await image.decode();
    const pin = pins.find((one) => one.id === id);
    lightbox.open({
      kind: "image",
      index: 0,
      shots: [
        {
          alt: pin ? `Pin ${pin.number}: ${pinName(pin)}` : "A pin's picture",
          src,
          width: image.naturalWidth,
          height: image.naturalHeight,
          cropped: true,
          ...(lightboxFrom ? { element: lightboxFrom } : {}),
        },
      ],
    });
  }

  /** The pane's keys: C toggles Comment, J and K step through the pins, Enter opens one, Esc closes. */
  function pressKey(name: "c" | "j" | "k" | "Enter" | "Escape") {
    if (name === "c" && !isCanvas) {
      comment(!commenting);
    } else if (name === "j") {
      step(1);
    } else if (name === "k") {
      step(-1);
    } else if (name === "Enter" && focusedPin) {
      openCard(focusedPin);
    } else if (name === "Escape") {
      if (openPin) {
        closeCard();
      } else if (commenting) {
        comment(false);
      } else {
        // Heard from the page (`cawco:key`): with nothing of the pane's to
        // close, Esc gives the split back. The window's Esc is SideSplit's.
        expand?.collapse();
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
      !(target instanceof Node && section?.contains(target)) ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
    ) {
      return;
    }
    const name = previewKey(
      event.key.length === 1 ? event.key.toLowerCase() : event.key
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
    if (openPin || commenting) {
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
          comment(commenting, placing);
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
          if (placingLeaves) {
            comment(false);
          } else {
            placing = null;
          }
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
      case "cawco:picture": {
        const id = previewPinId(message.id);
        if (!id) {
          return;
        }
        const png = previewPng(message.png);
        if (message.thumb === true) {
          thumbs = { ...thumbs, [id]: png };
        } else if (png) {
          showPicture(id, png);
        }
        break;
      }
      case "cawco:send-pictures": {
        const answer = asks.get(Number(message.ask));
        answer?.(
          previewPictures(message.pictures),
          previewUrl(message.url, paneOrigin)
        );
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
        commenting = false;
        placing = null;
        break;
      case "cawco:error": {
        const said = previewError(message.message);
        const of = previewErrorOf(message.of);
        if (said) {
          // A send the page made itself goes again from Send; a field's
          // problem is the page's to show under the field.
          failure = { message: said, again: of ? AGAIN[of] : "reload" };
        }
        retrying = false;
        break;
      }
      case "cawco:resolved":
        if (failure && failure.again === null) {
          failure = null;
        }
        break;
      case "cawco:ink":
        // The person's unsent ink, which the composer's Send carries.
        if (artifact && iframe?.contentWindow) {
          heardInk(
            instanceId,
            artifact.id,
            iframe.contentWindow,
            paneOrigin,
            message
          );
        }
        break;
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
  {#if artifact}
    <!-- Send N: every unsent pick, pin and reply as one turn (WORDS.md: the count is a number). -->
    <button
      aria-busy={sending || undefined}
      aria-disabled={sending || undefined}
      class="send touch-hit"
      disabled={owed === 0 && !sending}
      onclick={whileIdle(() => sending, send)}
      title={owed === 0 ? "Nothing new to send" : `Send ${owed} to the session`}
      type="button"
    >
      <PendingContent icon={IconSend} pending={sending} />
      <span class="send-label">{owed === 0 ? "Send" : `Send ${owed}`}</span>
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
      aria-label="Undock"
      class="other touch-hit"
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
      aria-label="Open in new tab"
      class="other touch-hit"
      href={`/artifact/${encodeURIComponent(artifact.id)}`}
      rel="noopener"
      target="_blank"
      title="Open in new tab"><IconExternal /></a
    >
  {/if}
  {#if !isCanvas}
    <button
      aria-keyshortcuts="C"
      aria-pressed={commenting}
      class="touch-hit"
      disabled={!connected}
      onclick={() => comment(!commenting)}
      title="Comment (C)"
      type="button"
    >
      <IconComment /><span class="comment-label">Comment</span>
    </button>
  {/if}
  <button
    aria-label="Reload"
    class="other touch-hit"
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
    <ArtifactMenu {instanceId} shown={artifact} />
  {/if}
{/snippet}

{#snippet pinList()}
  <PinList
    focused={focusedPin}
    {live}
    onopen={openCard}
    onplace={placeAgain}
    {pins}
    {placing}
  />
{/snippet}

<SideSurface
  actions={controls}
  below={pins.length > 0 ? pinList : undefined}
  class={commenting ? "preview-pane commenting" : "preview-pane"}
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
  {#if isCanvas}
    <!-- The canvas's stage stands over this box: its one iframe. -->
    <div aria-hidden="true" class="canvas-slot" bind:this={canvasSlot}></div>
  {:else if unreached}
    <!-- This tab can't reach the preview's own origin: what previews need,
         and where to switch how they are reached. -->
    <div class="down" role="alert" transition:appear>
      <EmptyState icon={IconAlert} title="This preview can't be reached">
        {#snippet line()}
          {unreachedWhy}.
        {/snippet}
        {#snippet action()}
          <div class="down-actions">
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
        class:ready={!current || loaded}
        {@attach (node) => {
          if (key === frameKey) {
            iframe = node;
          }
        }}
      ></iframe>
    {/each}
    <div
      aria-hidden="true"
      class="cover"
      class:ready={loaded || standing !== null}
    >
      <span
        class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
      ></span>
    </div>
  {/if}
  {#if down}
    <!-- What happened, why and the way back, where the page would be. -->
    <div class="down" role="alert" transition:appear>
      <EmptyState icon={IconAlert} title={downTitle}>
        {#snippet line()}
          {#if down === "workspace"}
            Its server can't be reached until the workspace runs again. Once a
            session there is back, try again.
          {:else if down === "server"}
            {downPort
              ? `Nothing is running on port ${downPort} on ${ownerMachine}, so the page can't load.`
              : `The page's server on ${ownerMachine} isn't running, so the page can't load.`}
            {#if offerSession}
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
  {#if picking}
    <PlacePick oncancel={cancelPick} onpick={pickedPlace} />
  {/if}
  <!-- The open pin's card, over the page beside its pin (the frame fills the well). -->
  <div class="pin-room" bind:clientHeight={roomH} bind:clientWidth={roomW}>
    {#if cardPin}
      <PinCard
        at={pinAt}
        live={live.has(cardPin.id)}
        onclose={closeCard}
        ondelete={deleteOpenPin}
        onpicture={pictureOf}
        onreply={reply}
        onresolve={resolvePin}
        pin={cardPin}
        problem={cardError}
        room={{ w: roomW, h: roomH }}
        {sheet}
        thumb={thumbs[cardPin.id] ?? null}
        bind:draft={
          () => drafts.text(cardPin.id), (text) => drafts.set(cardPin.id, text)
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
      {:else if failure.again === "send"}
        <Button
          label="Send again"
          onclick={send}
          pending={sending}
          pendingLabel="Sending…"
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
</SideSurface>

<style>
  /* The header's controls are the card's (SideSurface); in Comment mode
     the ones that would leave the page wait. */
  :global(.preview-pane.commenting .other) {
    opacity: 0.5;
  }
  /* The well is the card's (SideSurface). Comment mode turns the well's own border the accent, 2px, inside its
       box: never a second ring round it. */
  :global(.preview-pane .side-well) {
    outline: var(--focus-ring-width) solid transparent;
    outline-offset: var(--focus-ring-inset);
    transition: outline-color var(--dur-control) var(--ease-in-out);
  }
  :global(.preview-pane.commenting .side-well) {
    outline-color: var(--accent);
    cursor: crosshair;
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
  .send-label {
    font-variant-numeric: tabular-nums;
  }
  /* The replacement's load releases the old paint independently of the overlay. */
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
  @container (max-width: 469px) {
    .comment-label {
      display: none;
    }
  }
</style>
