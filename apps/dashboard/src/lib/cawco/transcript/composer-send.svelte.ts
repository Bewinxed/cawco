/**
 * The composer's send: Enter's and mod+Enter's, what stops one (a message
 * not written, a file still uploading, a held composer), the `/mcp auth`
 * sign-in a draft can be instead of a message, the canvas a send can carry,
 * and the words said over the field about all of it.
 */
import { failureWords } from "#lib/platform/hub-read.js";
import { newId } from "#lib/platform/id.js";
import { departBox } from "#lib/platform/motion/share.svelte.js";
import type { SendExtras } from "../send-store";
import type { CanvasRoom } from "./canvas-room.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";
import type { ComposerFleet } from "./composer-fleet";

export interface ComposerSendParts {
  busy: () => boolean;
  /** The canvas's chip, while it is folded. */
  canvasChip: () => HTMLElement | undefined;
  /** The `/` menu is put away: a send closes it. */
  dismissMenu: () => void;
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  fleet: () => ComposerFleet | undefined;
  held: () => boolean;
  heldWhy: () => string;
  onstop: () => void;
  onsubmit: (text: string, extras: SendExtras, id: string) => void;
  /** The canvas's room: a conversation's composer has one; a comment's reply draws none. */
  room: () => CanvasRoom | null;
  sendError: () => string;
  sending: () => boolean;
}

export class ComposerSend {
  sendBlock = $state("");
  /**
   * A fleet server this composer opened the sign-in for (`/mcp auth`): over
   * the composer, it waits for the provider until the hub reports the
   * server signed in, then says so.
   */
  signingIn = $state<string | null>(null);
  /** A word about `/mcp auth` that is not a failure ("already signed in"). */
  draftNote = $state("");
  readonly #parts: ComposerSendParts;
  readonly sendNotice = $derived.by(
    () =>
      this.#parts.sendError() ||
      this.sendBlock ||
      this.#canvasNotice() ||
      this.#parts.draft().notice
  );
  readonly signInNote = $derived.by(() => {
    if (this.signingIn === null) {
      return this.draftNote;
    }
    const { signingIn } = this;
    const server = (this.#parts.fleet()?.mcpServersStore.fleetMcp ?? []).find(
      (one) => one.name === signingIn
    );
    return server?.auth?.state === "signed-in"
      ? `${signingIn} is signed in for the fleet.`
      : `Waiting for ${signingIn}: sign in in the tab that opened.`;
  });
  readonly pending = $derived.by(
    () => this.#parts.sending() || this.#canvasWorking()
  );

  constructor(parts: ComposerSendParts) {
    this.#parts = parts;
  }

  /** What went wrong making, reading or sending the canvas, said over the field. */
  #canvasNotice(): string {
    return this.#parts.room()?.error ?? "";
  }

  /** The canvas is being made, or read for a send: Send waits, pending. */
  #canvasWorking(): boolean {
    return this.#parts.room()?.working ?? false;
  }

  /**
   * The words handed to the session. `cuts` is mod+Enter's "interrupt and
   * send": on a busy session the turn in flight is stopped first, through
   * the Stop control's own `onstop`, and the words follow through the same
   * send Enter uses; on an idle session it is that send and nothing else.
   * Busy is read here, as the words leave, so a send that waited (a canvas
   * being drawn) stops the turn running then, and none that has ended.
   */
  #deliver(text: string, extras: SendExtras, id: string, cuts: boolean): void {
    if (cuts && this.#parts.busy()) {
      this.#parts.onstop();
    }
    this.#parts.onsubmit(text, extras, id);
  }

  /** Sends the draft; `cuts` stops a busy session's turn first ({@link ComposerSend.#deliver}). */
  submit(cuts = false): void {
    const draft = this.#parts.draft();
    if (this.#parts.held()) {
      this.sendBlock = this.#parts.heldWhy();
      return;
    }
    if (!draft.hasContent) {
      this.sendBlock = "Write a message before sending.";
      return;
    }
    if (draft.uploading) {
      this.sendBlock = "Wait for your file to finish uploading.";
      return;
    }
    if (draft.unready) {
      this.sendBlock =
        "A file couldn't upload. Tap it to try again, or remove it.";
      return;
    }
    this.sendBlock = "";
    draft.notice = "";
    this.draftNote = "";
    this.signingIn = null;
    if (this.#signsIn()) {
      return;
    }
    if (draft.canvas) {
      this.#sendWithCanvas(cuts);
      return;
    }
    // The text leaves the field for the one row it becomes (motion/share),
    // keyed by the id the message is sent under. The field is measured
    // before it redraws empty.
    const { text, extras } = draft.take();
    const id = newId();
    departBox(`sent:${id}`, this.#parts.field() as HTMLDivElement);
    this.#parts.dismissMenu();
    this.#deliver(text, extras, id, cuts);
  }

  /**
   * `/mcp auth <server>` for a fleet server is this browser's own sign-in,
   * not a message: the agent's machine may have no browser at all (a phone
   * is the browser here), and the hub holds the credentials either way. Its
   * words stand over the composer, where it was typed; the session stays
   * where it is while the provider opens in a tab of its own. True when the
   * draft was that, and nothing is sent.
   */
  #signsIn(): boolean {
    const fleet = this.#parts.fleet();
    if (!fleet) {
      return false;
    }
    const intent = fleet.mcpSignInIntent(
      this.#parts.draft().text,
      fleet.mcpServersStore.fleetMcp ?? []
    );
    if (intent.kind === "go") {
      const { name } = intent;
      this.signingIn = name;
      fleet.signInToMcp(name).catch((error) => {
        this.signingIn = null;
        this.sendBlock = failureWords(error);
      });
      return true;
    }
    if (intent.kind === "say") {
      this.signingIn = null;
      if (intent.level === "error") {
        this.sendBlock = intent.message;
      } else {
        this.draftNote = intent.message;
      }
      return true;
    }
    return false;
  }

  /**
   * A message carrying the canvas: its picture is drawn now and its file,
   * outline and picture join the send, through the attachments and images
   * the send already carries. The canvas's chip flies into the row the
   * message becomes when no words go with it; the words do otherwise. What
   * cannot go says why under the chips and nothing is sent.
   */
  async #sendWithCanvas(cuts: boolean): Promise<void> {
    const room = this.#parts.room();
    const writing = this.#parts.draft();
    const { canvas } = writing;
    const extra = await room?.extras();
    const draft = this.#parts.draft();
    if (!extra || draft !== writing || draft.canvas !== canvas) {
      return;
    }
    const chip = canvas?.folded ? this.#parts.canvasChip() : undefined;
    const id = newId();
    if (draft.text.trim() || !chip) {
      departBox(`sent:${id}`, this.#parts.field() as HTMLDivElement);
    } else {
      departBox(`sent:${id}`, chip, false);
    }
    const { text, extras } = draft.take();
    this.#parts.dismissMenu();
    extras.attachments = [...(extras.attachments ?? []), ...extra.attachments];
    extras.images = [...(extras.images ?? []), ...extra.images];
    this.#deliver(text, extras, id, cuts);
    if (canvas) {
      room?.sent(canvas.id);
    }
  }
}
