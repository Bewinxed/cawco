/**
 * A pin's thread: which is open and drawn, its card beside the pill or in the rail's sheet, J and K stepping through the pins, and the rail's list.
 */
import { newAnswer, type Pin, pinHeld } from "@cawco/core/comments/model";
import { pinName } from "@cawco/core/pin-name";
import { tick, untrack } from "svelte";
import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
import { frameSize } from "#lib/platform/frame-observer.js";
import { openAsked, takeOpen } from "../artifact-names.svelte";
import type { ChangeTour } from "./change-tour.svelte";
import type { CommentKit } from "./comment-kit.svelte";
import { saidIn } from "./comment-kit.svelte";
import type { RailList } from "./comment-rows";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PaneMode } from "./pane-mode.svelte";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import type { PinPeek } from "./pin-peek.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import {
  type PreviewPinAt,
  previewCompose,
  previewPinAt,
  previewPinId,
} from "./wire";

export interface PinThreadDeps {
  readonly changeTour: ChangeTour;
  readonly commentKit: CommentKit;
  readonly instanceId: () => string;
  readonly paneDoc: PaneDoc;
  readonly paneLayout: PaneLayout;
  readonly paneMode: PaneMode;
  readonly paneNotice: PaneNotice;
  readonly paneSubject: PaneSubject;
  readonly pinComposer: PinComposer;
  readonly pinPeek: PinPeek;
  readonly previewFrame: PreviewFrame;
}
export class PinThread {
  readonly #deps: PinThreadDeps;

  /*
   * The comments (Projects spec §5.7; the artifact panel's surface brief, Placing a comment, The
   * Comments rail, A thread beside its pin): the composer beside the pill
   * the press put down, the thread as a card beside its pin, the rail beside
   * the page, J and K stepping through them.
   */
  /** The pin whose thread is open. */
  openPin = $state<string | null>(null);

  /** Its pill in the page's viewport, as the page tells it while it scrolls. */
  pinAt = $state<PreviewPinAt | null>(null);

  /**
   * The pin the page has told where it stands since its thread opened (its
   * pill, or that it stands nowhere on the page). Beside its pill, a card
   * stands only once this is its own, so its first frame is where it stays,
   * never the last pin's place nor the well's corner.
   */
  pinHeard = $state<string | null>(null);

  /**
   * The pin whose card is going back into its pill, or whose sheet is
   * sliding down, closed: it stays drawn until it has (PinFloat and
   * ThreadSheet `onclosed`), so its pin opened again before then turns the
   * same card or sheet back (their `open`).
   */
  closingPin = $state<string | null>(null);

  /** The pin J and K stand on. */
  focusedPin = $state<string | null>(null);

  /** What went wrong with the open thread's reply, resolve or delete. */
  cardError = $state<string | null>(null);

  /** The open thread's reply is on its way. */
  replying = $state(false);

  /**
   * The room over the page a pin's card stands in: read as it mounts, and a
   * change in the next frame (frameSize).
   */
  roomW = $state(0);

  roomH = $state(0);

  readonly measureRoom = frameSize(
    (node: HTMLElement) => [node.clientWidth, node.clientHeight] as const,
    ([width, height]) => {
      this.roomW = width;
      this.roomH = height;
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
  lastDrawn: string | null = null;

  readonly drawnPin = $derived.by(() => {
    if (!this.openPin) {
      this.lastDrawn = this.closingPin;
    } else if (
      this.#deps.paneLayout.floatSheet ||
      this.threadPushed ||
      !this.#deps.previewFrame.connected ||
      this.pinHeard === this.openPin
    ) {
      this.lastDrawn = this.openPin;
    }
    return this.lastDrawn;
  });

  readonly cardPin = $derived.by(
    () =>
      this.#deps.paneDoc.pins.find((pin) => pin.id === this.drawnPin) ?? null
  );

  /** The open thread's element's nearest parent, as the page names its chain (`cawco:pin-chain`). */
  cardParent = $state<{ id: string; name: string | null } | null>(null);

  /** The thread's or the composer's float: told to the page as what covers it on a phone. */
  cardFloat = $state<HTMLElement>();

  /** A whole-page comment asked from the rail beside the page: its composer hangs from the rail's glass, not over the page. */
  readonly pageHung = $derived.by(
    () =>
      this.#deps.pinComposer.composingPage &&
      !!this.#deps.pinComposer.composing &&
      this.#deps.paneMode.listOpen &&
      !this.#deps.paneLayout.railSheet
  );

  /** The rail's foot sheet (a phone, a pane under 640px) stands aside while a composer or a place picker stands, so neither covers the other; a thread opens in it (`threadPushed`). */
  readonly railAway = $derived.by(
    () =>
      this.#deps.paneMode.listOpen &&
      this.#deps.paneLayout.railSheet &&
      (!!this.#deps.pinComposer.composing || !!this.#deps.previewFrame.picking)
  );

  /** The rail's tab and its rows' scroll, kept while it is shut or stands aside. */
  listFilter = $state<RailList>("open");

  listScroll = $state(0);

  /** Pins the agent is working on: the last delivery carried them and its turn runs. */
  readonly live = $derived.by(() => {
    const stamps = this.#deps.paneDoc.pins.flatMap((pin) => [
      pin.sentAt ?? "",
      ...pin.thread.map((entry) => entry.sentAt ?? ""),
    ]);
    const last = stamps.reduce((a, b) => (b > a ? b : a), "");
    if (!(
      last && this.#deps.paneSubject.fleet.working(this.#deps.instanceId())
    )) {
      return new Set<string>();
    }
    return new Set(
      this.#deps.paneDoc.pins
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
  readonly unread = $derived.by(
    () =>
      new Set(
        this.#deps.paneDoc.pins
          .filter((pin) => pin.id !== this.openPin && newAnswer(pin))
          .map((pin) => pin.id)
      )
  );

  /** The pins J and K step through: those on the page, by number (a resolved pin has left it). */
  readonly stepping = $derived.by(() =>
    this.#deps.paneDoc.pins.filter((pin) => !(pin.movedAt || pin.resolvedAt))
  );

  /** Pin `id`'s thread opens; `via`, a key or a press. A composer standing goes, and another thread closes. */
  openCard = (id: string, via: "key" | "pointer" = "pointer") => {
    this.#deps.commentKit.loadKit();
    this.#deps.pinPeek.dropPeek();
    if (this.closingPin) {
      // Another pin's card going back into its pill goes at once; its own turns back.
      if (this.closingPin !== id) {
        this.lastDrawn = null;
      }
      this.closingPin = null;
    }
    if (this.#deps.pinComposer.composing) {
      this.#deps.pinComposer.cancelComposer();
    }
    if (this.openPin && this.openPin !== id) {
      this.closeCard(true);
    }
    // A key or a press inside the page, which the host never hears: the page's last input is it.
    lastInput.current = via;
    if (this.openPin !== id) {
      // Its place is the page's to say; the card drawn now keeps its own until it does (`drawnPin`).
      this.pinHeard = null;
    }
    this.openPin = id;
    this.focusedPin = id;
    this.cardError = null;
    this.cardParent = null;
    this.#deps.previewFrame.post({ type: "cawco:track-pin", id });
    // Brought into view in one step, not a glide: its card stands where its
    // pill lands, and the page tells that place once.
    this.focusPin(id, true, { instant: true, keyed: via === "key" });
  };

  markFocused = (id: string) => {
    this.focusedPin = id;
  };

  /** A pin's own address (its thread's Copy link): its artifact's tab, opening the pin's thread. */
  readonly pinLink = (number: number): string =>
    this.#deps.paneSubject.artifactId
      ? `${location.origin}/artifact/${encodeURIComponent(this.#deps.paneSubject.artifactId)}?pin=${number}`
      : location.href;

  /**
   * The place the address names, opened once its page is ready and its pins
   * are read: a pin's thread (`?pin=N`), or a decision card (`?card=<id>`).
   */
  linkedFor: string | null = null;

  openLinkedPin = () => {
    const asked = new URL(location.href).searchParams;
    if (
      !this.#deps.paneSubject.artifactId ||
      this.linkedFor === this.#deps.paneSubject.artifactId
    ) {
      return;
    }
    const card = asked.get("card");
    if (card) {
      this.linkedFor = this.#deps.paneSubject.artifactId;
      this.showCard(card);
      return;
    }
    const change = asked.get("change");
    if (change) {
      this.linkedFor = this.#deps.paneSubject.artifactId;
      this.#deps.changeTour.stepToChange(change);
      return;
    }
    const number = Number(asked.get("pin"));
    if (this.openPinNumbered(number)) {
      this.linkedFor = this.#deps.paneSubject.artifactId;
    }
  };

  /**
   * The rail's rows as it last drew them, in its tab and its order: what the
   * focus steps through once the comment it stood on leaves that tab. Kept
   * while the rail stands aside (a phone's sheet, while a thread stands).
   */
  railOrder: string[] = [];

  /**
   * The thread's Delete, once asked in place: the pin goes from the doc (core
   * `deletePin`), its pill from the page, and the thread closes. A refusal
   * throws its sentence, which stays under the question.
   */
  deleteOpenPin = (): Promise<void> => {
    const id = this.openPin;
    if (!id) {
      return Promise.resolve();
    }
    let refused: string | null = null;
    if (this.#deps.paneDoc.onlyOnPage(id)) {
      // The page holds it alone: deleted there, its answer saying any refusal.
      this.#deps.previewFrame.post({ type: "cawco:delete", pin: id });
      this.#deps.paneDoc.pageSays(id, null);
    } else {
      refused = this.#deps.paneDoc.doc
        ? this.#deps.paneDoc.doc.delete(id)
        : "The pane lost the page's document, so the comment wasn't deleted. Reload, then try again.";
    }
    if (refused) {
      return Promise.reject(new Error(refused));
    }
    if (this.focusedPin === id) {
      this.focusedPin = null;
    }
    this.#deps.commentKit.drafts?.discard(id);
    this.closeCard();
    return Promise.resolve();
  };

  /** The rail's bottom sheet stands up (ThreadSheet `open`). */
  readonly railSheetOpen = $derived.by(
    () =>
      this.#deps.paneMode.listOpen &&
      this.#deps.paneLayout.listShown &&
      !this.#deps.paneSubject.isCanvas &&
      this.#deps.paneLayout.railSheet &&
      !this.railAway
  );

  /** The rail's bottom sheet is drawn: from its open until it has slid down (ThreadSheet `onclosed`). */
  railSheetDrawn = $state(false);

  /** The rail's bottom sheet's surface: what covers the page while a thread stands in it. */
  railSurface = $state<HTMLElement>();

  /**
   * A thread opened while the Comments sheet stands opens in that sheet,
   * over its list, Back leading (HIG, Sheets: "Display only one sheet at a
   * time"), never as a second sheet after the list's goes.
   */
  readonly threadPushed = $derived.by(
    () =>
      this.#deps.paneMode.listOpen &&
      this.#deps.paneLayout.listShown &&
      !this.#deps.paneSubject.isCanvas &&
      this.#deps.paneLayout.railSheet &&
      this.openPin !== null
  );

  /**
   * The open thread stands joined to the hung Comments card, on its leading
   * side, while that card stands (the owner's pick on pin 51: selecting a
   * comment shows its thread as a second card, connected), never beside
   * its pill across the page from the list it was picked in. Its pill is
   * lit and brought into view as before.
   */
  readonly threadHung = $derived.by(
    () =>
      this.#deps.paneMode.listOpen &&
      this.#deps.paneLayout.listShown &&
      !this.#deps.paneLayout.railSheet &&
      !this.#deps.paneSubject.isCanvas &&
      !this.#deps.paneLayout.floatSheet
  );

  /** The thread standing joined to the Comments card: the open one, at once, its place on the page not waited for. */
  readonly hungPin = $derived.by(() =>
    this.threadHung && this.openPin && !this.threadPushed
      ? (this.#deps.paneDoc.pins.find((pin) => pin.id === this.openPin) ?? null)
      : null
  );

  /**
   * The open thread's pin is being placed again (Pin it somewhere else): a
   * sheet holding it drops to its low stop, so the page above it takes the
   * tap while the card's bar and its Cancel stay in view.
   */
  readonly placingThread = $derived.by(
    () =>
      this.#deps.paneMode.placing !== null &&
      this.#deps.paneMode.placing === this.openPin
  );

  /** The list in front holds nothing: the sheet stands low, never half its room empty (ThreadSheet `short`). */
  readonly railEmpty = $derived.by(() => {
    switch (this.listFilter) {
      case "held":
        return !this.#deps.paneDoc.pins.some(pinHeld);
      case "resolved":
        return !this.#deps.paneDoc.pins.some((pin) => !!pin.resolvedAt);
      case "open":
        return !this.#deps.paneDoc.pins.some((pin) => !pin.resolvedAt);
    }
  });

  /** The Comments sheet holds a line or two, or its thread is being placed again (ThreadSheet `short`). */
  readonly railShort = $derived(
    (this.railEmpty && !this.threadPushed) ||
      (this.threadPushed && this.placingThread)
  );

  /** Back, in the sheet: the list again, the thread gone at once (no card goes back into a pill). */
  backToList = () => {
    this.closeCard();
    this.closingPin = null;
  };

  constructor(deps: PinThreadDeps) {
    this.#deps = deps;
    // The open thread is looked at: what the agent answered there is seen, on every device.
    $effect(() => {
      const pin = this.cardPin;
      if (
        !(pin && this.#deps.paneDoc.doc && newAnswer(pin)) ||
        this.#deps.paneDoc.onlyOnPage(pin.id)
      ) {
        return;
      }
      untrack(() => this.#deps.paneDoc.doc?.see(pin.id));
    });
    // Each pill's dot on the page: the agent at work on it, or an answer unread.
    $effect(() => {
      const working = [...this.live];
      const answered = [...this.unread];
      if (this.#deps.previewFrame.connected) {
        untrack(() =>
          this.#deps.previewFrame.post({
            type: "cawco:pin-marks",
            live: working,
            unread: answered,
          })
        );
      }
    });
    $effect(() => {
      if (this.#deps.previewFrame.connected && this.#deps.paneDoc.view) {
        untrack(this.openLinkedPin);
      }
    });
    /*
     * A chip's press (artifact-names.svelte.ts `askOpen`): once the page is
     * up and its pins are read, the place it names opens, once: a pin's
     * thread, a decision card, or the artifact as it is.
     */
    $effect(() => {
      const id = this.#deps.paneSubject.artifactId;
      const at = id ? openAsked(id) : null;
      if (!(
        id &&
        at &&
        this.#deps.previewFrame.connected &&
        this.#deps.paneDoc.view
      )) {
        return;
      }
      untrack(() => {
        takeOpen(id);
        if ("pin" in at) {
          this.openPinNumbered(at.pin);
        } else if ("card" in at) {
          this.showCard(at.card);
        } else if ("change" in at) {
          this.#deps.changeTour.stepToChange(at.change);
        }
      });
    });
    /**
     * A comment written or let go, or a thread closed: the card that held the
     * focus is gone, and the browser drops the focus on the body, outside the
     * pane, where none of its keys reach (V, C and D, J and K): after a
     * comment, V did nothing until he pressed into the page again (the
     * owner, 2026-11-12). The page's frame takes the focus back, where he
     * was working; a focus he moves elsewhere himself stays where it is.
     */
    let carded = false;
    $effect(() => {
      const now = !!this.#deps.pinComposer.composing || !!this.openPin;
      if (carded && !now) {
        tick().then(() => {
          const at = document.activeElement;
          if (!at || at === document.body) {
            this.#deps.previewFrame.iframe?.focus({ preventScroll: true });
          }
        });
      }
      carded = now;
    });
    $effect(() => {
      if (this.railSheetOpen) {
        this.railSheetDrawn = true;
      }
    });
  }

  /**
   * The page's answer to a write the pane sent it: the pin as the page now
   * holds it, drawn again; a refusal under the open card, a reply's words
   * back in its field.
   */
  heardPageWrite(type: string, message: Record<string, unknown>) {
    const id = typeof message.pin === "string" ? message.pin : null;
    if (!(
      id &&
      (id in this.#deps.paneDoc.pagePins ||
        this.#deps.paneDoc.pageWords.has(id))
    )) {
      return;
    }
    if (
      "now" in message &&
      !this.#deps.paneDoc.view?.pins.some((one) => one.id === id)
    ) {
      this.#deps.paneDoc.pageSays(id, message.now);
    }
    const words =
      type === "cawco:reply-result"
        ? this.#deps.paneDoc.pageWords.get(id)
        : undefined;
    if (type === "cawco:reply-result") {
      this.#deps.paneDoc.pageWords.delete(id);
      this.replying = false;
    }
    if (message.ok === true) {
      if (words !== undefined) {
        this.#deps.commentKit.drafts?.discard(id);
      }
      return;
    }
    const draft =
      words === undefined
        ? null
        : (this.#deps.commentKit.drafts?.draft(id) ?? null);
    if (draft?.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
    if (id === this.openPin) {
      this.cardError =
        typeof message.error === "string"
          ? message.error
          : "The page didn't keep that, so nothing changed. Try again.";
    }
  }

  /**
   * Pin `id` focused on the page, with `scroll` brought into view (`instant`
   * in one step). Its pill wears the focus ring only when the keyboard got
   * it there (`keyed`, by default the last input): an open or stepped-to pin
   * reached by a press is marked by its card and its row, never a ring
   * (DESIGN.md, The One Ring Rule).
   */
  focusPin(
    id: string,
    scroll: boolean,
    { instant = false, keyed = lastInput.current === "key" } = {}
  ) {
    this.#deps.previewFrame.post({
      type: "cawco:focus-pin",
      id,
      scroll,
      instant,
      keyed,
    });
  }

  /**
   * The thread closes: its Close, Esc, another row or pin opened (`swap`:
   * its card stays as it stands until the next one's place is heard, then
   * goes at once, so no frame shows it beside the next). Closed, its card
   * beside the pill goes back into it, and the phone's sheet slides down,
   * each drawn until it has (`closingPin`).
   * Its reply's words stay with its pin.
   */
  closeCard(swap = false) {
    const id = this.openPin;
    // The thread joined to the Comments card leaves by its own transition.
    if (!swap && id && this.drawnPin === id && !this.threadHung) {
      this.closingPin = id;
    }
    this.openPin = null;
    if (!swap) {
      this.pinAt = null;
    }
    this.pinHeard = null;
    this.cardError = null;
    this.replying = false;
    this.cardParent = null;
    if (id && id === this.#deps.paneMode.placing) {
      this.#deps.paneMode.placeElsewhere(false);
    }
    this.#deps.previewFrame.post({ type: "cawco:track-pin", id: null });
  }

  /** J and K: the next or the previous pin on the page, outlined and scrolled to. */
  step(by: 1 | -1) {
    if (this.stepping.length === 0) {
      return;
    }
    const at = this.stepping.findIndex((pin) => pin.id === this.focusedPin);
    const next =
      this.stepping[(at + by + this.stepping.length) % this.stepping.length] ??
      this.stepping[0];
    this.focusedPin = next.id;
    // J and K are the keyboard's own steps.
    this.focusPin(next.id, true, { keyed: true });
    if (this.openPin) {
      this.openCard(next.id, "key");
    }
  }

  /** Pin `number`'s thread opened, when the page holds it; whether it did. */
  openPinNumbered(number: number): boolean {
    const pin = Number.isInteger(number)
      ? this.#deps.paneDoc.pins.find((one) => one.number === number)
      : undefined;
    if (!pin) {
      return false;
    }
    if (pin.resolvedAt || pin.movedAt) {
      // Off the page: its thread opens from its row, in Resolved or Open.
      this.listFilter = pin.resolvedAt ? "resolved" : "open";
      this.#deps.paneMode.showList(true);
    }
    this.openCard(pin.id);
    return true;
  }

  /** Decision card `card` brought into view and outlined for a moment. */
  showCard(card: string) {
    this.#deps.previewFrame.post({
      type: "cawco:show-element",
      selector: `#decision-${CSS.escape(card)}`,
      outline: "flash",
    });
  }

  /** The person's words in the open thread; a resolved pin's reply reopens it ("Reply to reopen"). */
  reply(text: string, held = false) {
    const draft = this.#deps.commentKit.replyDraft;
    if (!(this.openPin && draft)) {
      return;
    }
    const said = { ...saidIn(draft, text), held };
    const reopens = !!this.cardPin?.resolvedAt;
    if (this.#deps.paneDoc.onlyOnPage(this.openPin)) {
      // The page holds the pin and keeps the words on its device until the
      // hub has them; its answer (`cawco:reply-result`) draws them, or puts
      // them back in the field with why.
      this.#deps.paneDoc.pageWords.set(this.openPin, text);
      this.replying = true;
      this.#deps.previewFrame.post({
        type: "cawco:reply",
        pin: this.openPin,
        ...said,
      });
      if (reopens) {
        this.#deps.previewFrame.post({
          type: "cawco:resolve",
          pin: this.openPin,
          resolved: false,
        });
      }
      this.cardError = null;
      return;
    }
    this.cardError = this.#deps.paneDoc.doc
      ? this.#deps.paneDoc.doc.reply(this.openPin, said)
      : "The pane lost the page's document, so the reply wasn't kept. Reload, then reply again.";
    if (this.cardError === null && reopens && this.#deps.paneDoc.doc) {
      this.cardError = this.#deps.paneDoc.doc.resolve(this.openPin, false);
    }
    if (this.cardError === null) {
      // Said: the words are in the thread, so no draft is left to keep.
      this.#deps.commentKit.drafts?.discard(this.openPin);
    } else if (draft.unsent) {
      draft.fill(draft.unsent);
      draft.settle();
    }
  }

  /** A pin resolved or reopened: from its thread's head, or its row in the rail. */
  resolvePin(resolved: boolean, id: string | null = this.openPin) {
    if (!id) {
      return;
    }
    this.focusPast(id, resolved);
    if (this.#deps.paneDoc.onlyOnPage(id)) {
      this.cardError = null;
      this.#deps.previewFrame.post({
        type: "cawco:resolve",
        pin: id,
        resolved,
      });
      return;
    }
    const refused = this.#deps.paneDoc.doc
      ? this.#deps.paneDoc.doc.resolve(id, resolved)
      : `The pane lost the page's document, so the comment wasn't ${resolved ? "resolved" : "reopened"}. Reload, then try again.`;
    if (id === this.openPin) {
      this.cardError = refused;
    } else if (refused) {
      this.#deps.paneNotice.say({ message: refused, again: null });
    }
  }

  /**
   * Comment `id` resolved (or reopened) leaves the tab in front of him when
   * that tab is Open (or Resolved): the tab stays, and the focus, when it
   * stood on it, moves to the row after it there, else the one before it,
   * else to none (the tab's empty state). So J and K walk the rows he sees,
   * and the rail never follows the comment to its new tab.
   */
  focusPast(id: string, resolved: boolean) {
    const leaves =
      (this.listFilter === "open" && resolved) ||
      (this.listFilter === "resolved" && !resolved);
    if (!(leaves && this.focusedPin === id)) {
      return;
    }
    const at = this.railOrder.indexOf(id);
    const rest = this.railOrder.filter((one) => one !== id);
    const next = at === -1 ? null : (rest[at] ?? rest[at - 1] ?? null);
    this.focusedPin = next;
    if (next) {
      this.focusPin(next, false);
    }
  }

  /** The page named the open thread's element's nearest parent (`cawco:pin-chain`). */
  heardChain(message: Record<string, unknown>) {
    const id = previewPinId(message.id);
    const parent = previewCompose(message)?.chain[1];
    if (id && id === this.openPin) {
      this.cardParent = {
        id,
        name:
          parent &&
          !("selector" in parent.anchor && parent.anchor.selector === "body")
            ? pinName({
                anchor: parent.anchor,
                elements: parent.elements,
              } as unknown as Pin)
            : null,
      };
    }
  }

  /** The page told where the open thread's pill stands (`cawco:pin-at`). */
  heardPinAt(message: Record<string, unknown>) {
    if (this.openPin && previewPinId(message.id) === this.openPin) {
      this.pinAt = previewPinAt(message);
      this.pinHeard = this.openPin;
    }
  }
}
