/**
 * The page's frame: its load, its hold while its tab is off screen, the proxy's down page and the way back, the lock's turn-away, what the hub is told of it, its thumbnail, and what is posted into it.
 */

import type { FrameSays } from "@cawco/core/page-wire";
import {
  PREVIEW_DOWNS,
  type PreviewDown,
  type ShownFailure,
} from "@cawco/core/preview/protocol";
import { PAGE_SILENT_MS, probePreview } from "@cawco/core/preview/reach";
import { sheetWords } from "@cawco/core/words/sheet";
import { untrack } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { settleAway } from "#lib/platform/motion/rest.js";
import { track } from "#lib/platform/track.js";
import { theme } from "#lib/theme.svelte.js";
import { artifactShown, keepThumbnail } from "../artifact-api";
import { artifactReached } from "../files/reached";
import { pageVisible } from "../page-visible.svelte";
import { afterPaint, warm } from "../workspace/warm.svelte";
import { artifactSyncPath } from "./artifact-doc";
import { hubReach } from "./hub-reach";
import { loadedPanes } from "./loaded.svelte";
import { frameHand, holdOpen } from "./open-pages";
import type { PaneCanvas } from "./pane-canvas.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import { enterPreviews, turnedAwayWords } from "./pass";
import type { PreviewReach } from "./preview-reach.svelte";
import { PROBE_FIRST_MS, PROBE_MOST_MS } from "./preview-reach.svelte";
import {
  previewError,
  previewErrorOf,
  previewPngTooLong,
  previewThumbnail,
} from "./wire";

const frameError = (message: string | null) =>
  message ? { message, again: "reload" as const } : null;
/** The hops that come back by themselves once what didn't answer does. */
const COMES_BACK: ReadonlySet<PreviewDown> = new Set([
  "server",
  "machine",
  "workspace",
  "reach",
]);
/**
 * How long the page has said ready and its frame's size has stood still
 * before its thumbnail is taken: its first paints and fonts land, and the
 * pane opening around it settles its width. Our call.
 */
const CAPTURE_AFTER_MS = 1000;
export interface PreviewFrameDeps {
  readonly inset: () => boolean;
  readonly instanceId: () => string;
  readonly onScreen: () => boolean;
  readonly ownTab: () => boolean;
  readonly paneCanvas: PaneCanvas;
  readonly paneId: () => string;
  readonly paneLayout: PaneLayout;
  readonly paneNotice: PaneNotice;
  readonly paneSubject: PaneSubject;
  readonly previewReach: PreviewReach;
}
export class PreviewFrame {
  readonly #deps: PreviewFrameDeps;

  iframe = $state<HTMLIFrameElement>();

  connected = $state(false);

  /**
   * The page in the frame takes the head's room itself (overlay
   * `cawco:head-room`): a document CawCo draws (a decision page, a canvas)
   * whose own scroller pads its top by it, so the frame runs to the card's
   * top beneath the head. Any other page stands under the room: its layout
   * is not ours to push down.
   */
  headRoomTaken = $state(false);

  loaded = $state(false);

  reload = $state(0);

  /** How many entries in a row the page turned away (`cawco:locked`) without once saying it was ready. */
  refusedEntries = 0;

  /**
   * When the current frame last stood without the pass it may hold now
   * (`performance.now()`): its mount, or its page's last word that it was
   * let in. An entry that landed since stands for it (preview/pass.ts).
   */
  frameSince = 0;

  readonly frameKey = $derived.by(
    () => `${this.#deps.paneSubject.preview?.revision}:${this.reload}`
  );

  // The old paint bridges navigation only until the replacement finishes loading.
  standing = $state<string | null>(null);

  /** No page: mounted off screen, or let go past the bound; the cover waits for the next load. */
  unloaded = $state(false);

  /** The page said it is held (`cawco:held`). */
  pageHeld = $state(false);

  /** The hold's pass over the pane its page was let go from, while it is still away (motion/rest.ts `settleAway`). */
  settling: (() => void) | null = null;

  /**
   * Its conversation's tab reached for (warm.svelte.ts `reached`: the
   * pointer onto it or pressing it, the focus on it), whichever tab of its
   * group's slot holds it: read off the slot it is docked in (PaneLeaf's
   * `data-pane`).
   */
  readonly tabReached = $derived.by(() => {
    const docked = this.#deps.paneLayout.section
      ?.closest<HTMLElement>('[data-slot="pane"][data-pane]')
      ?.getAttribute("data-pane");
    return !!docked && warm.reached(docked);
  });

  readonly frames = $derived.by(() => {
    if (this.unloaded) {
      return [];
    }
    return this.standing === null || this.standing === this.frameKey
      ? [this.frameKey]
      : [this.standing, this.frameKey];
  });

  /**
   * Try again after a frame failure: reload the frame. Pending until the
   * reloaded page says it is ready, which clears the failure, or states a
   * new one.
   */
  retrying = $state(false);

  retry = () => {
    this.retrying = true;
    this.refusedEntries = 0;
    this.reload += 1;
  };

  /*
   * Nothing serves the page: the proxy answered with its own page, which
   * names the hop that did not answer (core `PreviewDown`). The pane draws
   * what happened over the well, in the kit's empty state, with Try again
   * (a reload of the frame) as its way back; it stands until a load serves
   * the page again.
   */
  down = $state<PreviewDown | null>(null);

  /** The machine's own words for a `reach` failure, from the proxy's page. */
  downWhy = $state<string | null>(null);

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
  downTries = 0;

  /** Each one probes the down page's origin again: a probe that failed, waiting out its backoff. */
  downProbe = $state(0);

  /**
   * The origin whose page last said it is ready in the frame. While the
   * frame still holds another origin's page (the panel moving to another
   * artifact, served on its own origin), nothing is posted into it: the
   * engine refuses a post whose target origin is not the page's, and logs
   * it. The new page's ready says everything again.
   */
  readyFrom = "";

  /** To the page, on its own origin alone, once that origin's page said it is ready (`hello`, the answer to it, goes at once). */
  post = (message: object, hello = false) => {
    if (
      this.#deps.previewReach.paneOrigin &&
      (hello || this.readyFrom === this.#deps.previewReach.paneOrigin)
    ) {
      this.iframe?.contentWindow?.postMessage(
        message,
        this.#deps.previewReach.paneOrigin
      );
    }
  };

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
  loadedKey = $state<string | null>(null);

  silentKey = $state<string | null>(null);

  /** The frame whose page last said anything at all to the pane (its overlay, the proxy's down page, the lock's turn-away). */
  heardKey = $state<string | null>(null);

  /**
   * The frame finished loading and its page never said a word: no overlay
   * answered in PAGE_SILENT_MS and no proxy's page named a hop, though the
   * proxy puts one or the other in every page it serves. So the browser
   * drew its own error page (a connection closed with no answer, a refused
   * one) or the answer was no page at all: said where the page would be,
   * with Try again, never Chromium's grey page left standing.
   */
  readonly notLoaded = $derived(
    !this.unloaded &&
      this.silentKey === this.frameKey &&
      this.heardKey !== this.frameKey &&
      !this.connected &&
      !this.down
  );

  saidFor: string | null = null;

  /** A page's `cawco.pickPlace()` waiting on the person: the request it answers. */
  picking = $state<{ id: number | string } | null>(null);

  /** The place picked goes back to the page, which keeps it in its state. */
  pickedPlace = (place: {
    label: string;
    machineId: string;
    path: string;
  }): Promise<void> => {
    const asked = this.picking;
    this.picking = null;
    if (asked) {
      this.post({ jsonrpc: "2.0", id: asked.id, result: place });
    }
    return Promise.resolve();
  };

  cancelPick = () => {
    const asked = this.picking;
    this.picking = null;
    if (asked) {
      this.post({ jsonrpc: "2.0", id: asked.id, result: null });
    }
  };

  /**
   * Where the frame stands in the well: in the design graph's stage, or
   * under the floating head's room (`--page-top`) beside a side card's
   * head. The pins' room takes that box, so a place the page says is a
   * place on the page.
   */
  frameBox = $state<{ h: number; w: number; x: number; y: number } | null>(
    null
  );

  /** Reload: a canvas's stage frame from its address, any other page by a new frame. */
  reloadPage = () => {
    if (this.#deps.paneSubject.isCanvas && this.#deps.paneCanvas.stage?.frame) {
      this.#deps.paneCanvas.stage.frame.src = this.#deps.paneCanvas.stage.src;
    } else {
      this.reload += 1;
    }
  };
  constructor(deps: PreviewFrameDeps) {
    this.#deps = deps;
    this.unloaded = untrack(() => !this.#deps.onScreen());
    $effect(() => {
      if (this.#deps.paneSubject.isCanvas) {
        return;
      }
      const id = this.#deps.paneId();
      // Entered once per pane, never again as its tab comes and goes: the
      // registry reads `onScreen` as the bound is applied, not as it was here.
      untrack(() =>
        loadedPanes.enter({
          id,
          onScreen: () => this.#deps.onScreen(),
          unload: this.unload,
        })
      );
      return () => loadedPanes.leave(id);
    });
    $effect(() => {
      if (this.#deps.paneSubject.isCanvas) {
        return;
      }
      if (!this.#deps.onScreen()) {
        untrack(() => this.post({ type: "cawco:hold" }));
        loadedPanes.hidden(this.#deps.paneId());
        return;
      }
      loadedPanes.shown(this.#deps.paneId());
      this.settling?.();
      this.settling = null;
      untrack(() => this.post({ type: "cawco:release" }));
      if (untrack(() => this.unloaded)) {
        return afterPaint(() => {
          this.unloaded = false;
        });
      }
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
      if (this.#deps.paneSubject.isCanvas || this.#deps.onScreen()) {
        return;
      }
      const message = this.tabReached ? "cawco:release" : "cawco:hold";
      untrack(() => this.post({ type: message }));
    });
    $effect(() => {
      const hop = this.down;
      const origin = this.#deps.previewReach.paneOrigin;
      const seen = pageVisible.current && this.#deps.onScreen();
      track(this.downProbe);
      if (!(hop && origin && seen && COMES_BACK.has(hop))) {
        return;
      }
      let live = true;
      const timer = setTimeout(
        () => {
          this.downTries += 1;
          probePreview(origin, hubReach).then((failed) => {
            if (!live) {
              return;
            }
            if (failed) {
              this.downProbe += 1;
              return;
            }
            this.reload += 1;
          });
        },
        Math.min(PROBE_FIRST_MS * 2 ** this.downTries, PROBE_MOST_MS)
      );
      return () => {
        live = false;
        clearTimeout(timer);
      };
    });
    $effect(() => {
      if (this.connected) {
        this.downTries = 0;
      }
    });
    $effect(() => {
      if (this.frameKey) {
        this.connected = false;
        this.loaded = false;
        this.pageHeld = false;
        // A new load says again whether it is served.
        this.down = null;
        this.downWhy = null;
        // A pick the old page asked for has no page left to answer.
        this.picking = null;
      }
    });
    // While its page stands ready here, a Send the dashboard makes elsewhere
    // (the head's, a Needs you row's) carries what this page shows
    // (open-pages.ts).
    $effect(() => {
      const id = this.connected
        ? this.#deps.paneSubject.artifact?.id
        : undefined;
      if (!id) {
        return;
      }
      return holdOpen(
        id,
        frameHand(
          () => this.iframe,
          () =>
            this.readyFrom === this.#deps.previewReach.paneOrigin
              ? this.#deps.previewReach.paneOrigin
              : null
        )
      );
    });
    $effect(() => this.#tellHub());
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
      const record = this.#deps.paneSubject.preview;
      const frame = this.iframe;
      if (!(
        frame &&
        record?.thumbnailWanted &&
        record.thumbnailRevision !== record.revision &&
        this.#deps.onScreen() &&
        this.connected &&
        !this.pageHeld &&
        !this.#deps.ownTab()
      )) {
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Its first report is the frame's size now: every report starts the wait again.
      const settled = frameObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(
          () => this.post({ type: "cawco:capture" }),
          CAPTURE_AFTER_MS
        );
      });
      settled.observe(frame);
      return () => {
        clearTimeout(timer);
        settled.disconnect();
      };
    });
    // The dashboard's theme turning tells the page: a page artifact draws in it
    // (the overlay), never in the OS's; a preview is its own app and keeps its
    // own. Only a page that said ready hears it: one still loading takes the
    // theme from its hello.
    $effect(() => {
      const scheme = theme.resolved;
      untrack(() => {
        if (this.connected) {
          this.post({ type: "cawco:theme", theme: scheme } satisfies FrameSays);
        }
      });
    });
    $effect(() => {
      const frameNode = this.iframe;
      const wellNode = this.#deps.paneLayout.well;
      if (!(frameNode && wellNode)) {
        this.frameBox = null;
        return;
      }
      const measure = () => {
        const box = frameNode.getBoundingClientRect();
        const origin = wellNode.getBoundingClientRect();
        this.frameBox = {
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
  }

  unload = () => {
    this.unloaded = true;
    this.standing = null;
    this.loaded = false;
    this.connected = false;
    this.pageHeld = false;
    // Let go off screen, the cover stands waiting again in a pane put away:
    // what that starts is finished there, as the put-away's own pass does.
    this.settling?.();
    this.settling = this.#deps.paneLayout.section
      ? settleAway(this.#deps.paneLayout.section)
      : null;
  };

  arrived(key: string) {
    if (key !== this.frameKey) {
      return;
    }
    this.loaded = true;
    this.standing = key;
  }

  /**
   * The page turned the frame away (`cawco:locked`: the pass entered before
   * its first load ran out or was revoked since): the browser enters its
   * previews again and the frame loads again, once in a row. An entry the hub
   * won't give is the failure band, with Try again.
   */
  async turnedAway() {
    const origin = this.#deps.previewReach.paneOrigin;
    if (!origin) {
      return;
    }
    this.refusedEntries += 1;
    if (this.refusedEntries > 1) {
      this.#deps.paneNotice.say({
        message: turnedAwayWords(origin),
        again: "reload",
      });
      return;
    }
    const refused = await enterPreviews(origin, this.frameSince);
    if (refused) {
      this.#deps.paneNotice.say({
        message: `The hub didn't give this preview a pass: ${refused}`,
        again: "reload",
      });
      return;
    }
    this.reload += 1;
  }

  /** The proxy's page says which hop failed (`cawco:down`): the pane cannot read a preview origin's document. */
  heardDown(message: { down?: unknown; why?: unknown }) {
    const said = PREVIEW_DOWNS.find((kind) => kind === message.down);
    if (!said) {
      return;
    }
    this.down = said;
    this.downWhy = typeof message.why === "string" ? message.why : null;
    this.retrying = false;
  }

  loadedFrame(key: string) {
    this.loadedKey = key;
    this.silentKey = null;
    setTimeout(() => {
      if (
        key === this.frameKey &&
        this.loadedKey === key &&
        !this.connected &&
        !this.down
      ) {
        this.silentKey = key;
        // A Try again that loaded nothing again is over: its state says so.
        this.retrying = false;
      }
    }, PAGE_SILENT_MS);
  }

  #tellHub() {
    const revision =
      this.#deps.paneSubject.preview?.state === "open"
        ? this.#deps.paneSubject.preview.revision
        : undefined;
    const id = this.#deps.paneSubject.artifact?.id;
    if (!(revision && id && pageVisible.current) || this.saidFor === revision) {
      return;
    }
    const current = this.loadedKey === this.frameKey;
    let word: { ok: true } | { ok: false; error: ShownFailure } | null = null;
    if (this.#deps.paneSubject.isCanvas) {
      word =
        this.#deps.paneCanvas.stage?.connected &&
        this.#deps.paneCanvas.stage.at === "panel"
          ? { ok: true }
          : null;
    } else if (current && this.down) {
      word = { ok: false, error: this.down };
    } else if (current && this.connected) {
      word = { ok: true };
    } else if (this.silentKey === this.frameKey) {
      word = { ok: false, error: "page" };
    }
    if (!word) {
      return;
    }
    this.saidFor = revision;
    const sawIt = word.ok;
    artifactShown(this.#deps.instanceId(), id, { revision, ...word }).then(
      () => {
        // On screen and heard: it reached the person, and Files lists it.
        if (sawIt) {
          artifactReached(this.#deps.instanceId(), id);
        }
      },
      () => {
        // Unheard: the next change of state says it again.
        this.saidFor = null;
      }
    );
  }

  /** Tells the page which artifact it is, where its doc is synced, and the dashboard's theme. */
  announce() {
    this.connected = false;
    this.post(
      {
        type: "cawco:hello",
        theme: theme.resolved,
        // The head names the page by its title: a page that says it too (a
        // decision page's own title) leaves it out (overlay `data-cawco-headed`).
        headed: !this.#deps.inset(),
        // The panel draws no scrollbar beside the page: the page's own is
        // left undrawn (overlay `data-cawco-bare-scroll`), as its rail's is.
        bareScroll: !this.#deps.inset(),
        // The head's room over the page's top, px: a document CawCo draws
        // takes it on its own scroller and says so (`cawco:head-room`).
        headRoom: this.#deps.inset() ? 0 : this.#deps.paneLayout.headRoomPx(),
        ...(this.#deps.paneSubject.artifact
          ? {
              artifact: {
                id: this.#deps.paneSubject.artifact.id,
                kind: this.#deps.paneSubject.artifact.kind,
                name: this.#deps.paneSubject.artifact.name,
                title: this.#deps.paneSubject.artifact.title,
              },
              sync: artifactSyncPath(this.#deps.paneSubject.artifact.id),
            }
          : {}),
      } satisfies FrameSays,
      true
    );
  }

  /** The page said something to the pane: its overlay, the proxy's down page, the lock's turn-away. */
  heard() {
    this.heardKey = this.frameKey;
  }

  /** A second ask replaces one still open: the page asked again. */
  askedPick(id: number | string) {
    this.cancelPick();
    this.picking = { id };
  }

  /** The page answers: whatever the proxy said of an earlier load is over. */
  answered() {
    this.down = null;
    this.downWhy = null;
  }

  /** The page said it is ready, from `origin`. */
  ready(origin: string) {
    this.readyFrom = origin;
    this.connected = true;
  }

  /** The page was let in. */
  letIn() {
    this.refusedEntries = 0;
    // It was let in: a later turn-away is a pass lost since, which a new entry answers.
    this.frameSince = performance.now();
    // The frame Try again reloaded answered: what it was tried for is over.
    this.retrying = false;
  }

  /** The page said whether it is held (`cawco:held`). */
  heardHeld(message: Record<string, unknown>) {
    this.pageHeld = message.held === true;
  }

  /** The page said whether it takes the head's room itself (`cawco:head-room`). */
  heardHeadRoom(message: Record<string, unknown>) {
    this.headRoomTaken = message.taken === true;
  }

  /** The page took its thumbnail (`cawco:captured`), or said why not. */
  heardCaptured(message: Record<string, unknown>) {
    const { preview } = this.#deps.paneSubject;
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
        keepThumbnail(this.#deps.instanceId(), preview.artifact.id, shot).catch(
          (error: unknown) => {
            console.error("The page's thumbnail was not kept", error);
          }
        );
      }
    }
    this.#deps.paneNotice.say(
      previewPngTooLong(message.png) || previewPngTooLong(message.other)
        ? { message: sheetWords.pictureTooLarge, again: null }
        : frameError(previewError(message.error))
    );
    this.retrying = false;
  }

  /** The page's own error (`cawco:error`). */
  heardError(message: Record<string, unknown>) {
    const said = previewError(message.message);
    const of = previewErrorOf(message.of);
    if (said) {
      // A send the page made itself goes again from its own button; a
      // field's problem is the page's to show under the field.
      this.#deps.paneNotice.say({ message: said, again: of ? null : "reload" });
    }
    this.retrying = false;
  }
}
