/**
 * Your queued message, edited in the composer. Its words lift out of their
 * bubble into the field (lift.svelte.ts) while the composer grows one row
 * out of its pill to say so; Enter puts the edit in its place,
 * Esc (or Keep it, on a touch screen) gives the words back as they were.
 * What the field held steps aside meanwhile and comes back after. The
 * edit belongs to its conversation's draft: a switch away leaves it
 * there, and coming back finds it as it was.
 */
import { tick, untrack } from "svelte";
import { felt } from "#lib/platform/feel.svelte.js";
import { failureWords } from "#lib/platform/hub-read.js";
import { dur, motionOk } from "#lib/platform/motion/curves.svelte.js";
import type MentionField from "../find/MentionField.svelte";
import type { Message } from "../types";
import type { ComposerDraft } from "./composer-draft.svelte";
import type { ComposerFleet } from "./composer-fleet";
import { GrownShape, measureShape } from "./grown";
import { opensTurn } from "./rows";

export interface QueuedEditParts {
  /** The agent answering here, by name. */
  agentName: () => string;
  /** An ask holds the composer. */
  askOpen: () => boolean;
  busy: () => boolean;
  /** The canvas stands over the field. */
  canvasUp: () => boolean;
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  fleet: () => ComposerFleet | undefined;
  mentionField: () => ReturnType<typeof MentionField> | undefined;
  /** The height the field's whole text takes. */
  natural: () => number;
  onstop: () => void;
  pill: () => HTMLFormElement | undefined;
  /** The session being written to, as the sessions store reads it. */
  recalled: () => { messages: Message[] } | null | undefined;
  /** The wheel is up. */
  recalling: () => boolean;
  /** The conversation whose queued message it lifts out of the transcript to edit. */
  recallOf: () => string | undefined;
  /** What stops the send, said over the field. */
  say: (words: string) => void;
  shell: () => HTMLElement | undefined;
}

export class QueuedEdit {
  /** The grown row while a queued message is edited, and where it stands. */
  edit = $state<{
    inset: number;
    base: number;
    row: number;
    shown: boolean;
  } | null>(null);
  editRow = $state<HTMLElement>();
  /** The field's words are flying: it draws them only once they land. */
  wordsLanded = $state(true);
  readonly #parts: QueuedEditParts;
  #editShape: GrownShape | null = null;
  /** The sizes a lift read before it wrote anything, for the row it grows. */
  #liftSizes: ReturnType<typeof measureShape> | null = null;
  /** The flight `wordsLanded` waits for; a newer one owns it. */
  #landingTurn = 0;

  constructor(parts: QueuedEditParts) {
    this.#parts = parts;

    $effect(() => {
      const fleet = parts.fleet();
      const lift = parts.draft().lifted;
      if (!(fleet && lift)) {
        return;
      }
      const message = fleet.sessionsStore
        .session(lift.instanceId)
        ?.messages.find((m) => m.id === lift.id);
      if (!(message && fleet.userTurnActions(message).edit === "queued")) {
        const { readFirst } = fleet.lift;
        untrack(() => this.#settleLift(readFirst(parts.agentName())));
      }
    });

    $effect(() => {
      const fleet = parts.fleet();
      const recallOf = parts.recallOf();
      if (fleet && recallOf) {
        return fleet.lift.writesTo(recallOf);
      }
    });

    // A row asked to lift its message (its Edit, or a tap on touch): the
    // composer writing to that conversation takes it.
    $effect(() => {
      const liftAsk = parts.fleet()?.lift.liftAsk;
      const asked = liftAsk?.message;
      if (!(liftAsk && asked) || asked.instanceId !== parts.recallOf()) {
        return;
      }
      untrack(() => {
        liftAsk.message = null;
        const draft = parts.draft();
        if (draft.lifted?.id !== asked.id) {
          if (draft.lifted) {
            this.returnEdit();
          }
          this.liftQueued(asked);
        }
      });
    });

    $effect(() => {
      const lifting = !!parts.draft().lifted;
      if (!(parts.shell() && parts.pill())) {
        return;
      }
      untrack(() => (lifting ? this.#growEdit() : this.#foldEdit()));
    });

    // The field grows and shrinks as the words are edited: the grown shape and
    // its row stay on the pill's top edge.
    $effect(() => {
      const node = parts.pill();
      if (!(node && this.edit)) {
        return;
      }
      // biome-ignore lint/style/noRestrictedGlobals: the grown shape (grown.ts, absolutely placed behind the pill) is redrawn, a path and its own height, which resize no box watched; it stands on the pill in the frame the pill grew
      const sizes = new ResizeObserver(([entry]) => {
        const base = entry.borderBoxSize[0].blockSize;
        if (
          this.#editShape &&
          this.edit &&
          Math.abs(base - this.edit.base) > 0.5
        ) {
          this.edit.base = base;
          this.#editShape.base = base;
        }
      });
      sizes.observe(node, { box: "border-box" });
      return () => sizes.disconnect();
    });

    $effect(() => {
      if (this.editRow && this.#editShape && this.edit) {
        // What it says comes up from inside the shape, never above its edge.
        this.#editShape.clip(this.editRow, () => ({
          left: this.edit?.inset ?? 0,
          bottom: this.edit?.base ?? 0,
          height: this.edit?.row ?? 0,
        }));
      }
    });

    $effect(() => () => {
      this.#editShape?.remove();
      this.#editShape = null;
    });
  }

  /** Your newest message, when it is queued and can still be edited. */
  liftable(): Message | null {
    const messages = this.#parts.recalled()?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (opensTurn(messages[i])) {
        return this.#parts.fleet()?.userTurnActions(messages[i]).edit ===
          "queued"
          ? messages[i]
          : null;
      }
    }
    return null;
  }

  #landAfter(done: Promise<void> | number): void {
    this.#landingTurn += 1;
    const mine = this.#landingTurn;
    this.wordsLanded = false;
    const land = () => {
      if (this.#landingTurn === mine) {
        this.wordsLanded = true;
      }
    };
    if (typeof done === "number") {
      setTimeout(land, done);
    } else {
      done.then(land);
    }
  }

  async liftQueued(message: Message): Promise<void> {
    const { draft, field, fleet, shell, pill, recallOf } = this.#parts;
    const fieldEl = field();
    const fleetNow = fleet();
    if (
      !(fleetNow && fieldEl && recallOf()) ||
      draft().lifted ||
      this.#parts.recalling() ||
      this.#parts.askOpen() ||
      this.#parts.canvasUp()
    ) {
      return;
    }
    const { asBubble, asField, bubbleBox, bubbleWords, fieldBox, startFlight } =
      fleetNow.lift;
    // Both ends first, then the change: one layout.
    const shellEl = shell();
    const pillEl = pill();
    if (shellEl && pillEl) {
      this.#liftSizes = measureShape(shellEl, pillEl, fieldEl);
    }
    const words = bubbleWords(message.id);
    const from = words ? bubbleBox(words) : null;
    const trip = from && words ? startFlight(asBubble(words), from) : null;
    draft().lift(message.id, message.instanceId, message.content);
    felt("take");
    fieldEl.focus();
    await tick();
    this.#parts.mentionField()?.select(draft().text.length);
    if (!trip) {
      fieldEl.scrollTop = fieldEl.scrollHeight;
      return;
    }
    // The field fits its new words in the frame after they land in it
    // (motion/autosize): the height it is growing to is read once it has.
    const flown = new Promise<void>((done) => {
      requestAnimationFrame(async () => {
        const nowField = field();
        if (!nowField) {
          trip.cancel();
          done();
          return;
        }
        const height =
          Number.parseFloat(nowField.style.height) || nowField.offsetHeight;
        // A long message opens scrolled to its end, where the caret is.
        const to = fieldBox(nowField, {
          height,
          whole: this.#parts.natural(),
        });
        await trip.fly(asField(nowField, draft().text), to);
        done();
        nowField.scrollTop = nowField.scrollHeight;
      });
    });
    this.#landAfter(flown);
  }

  /**
   * The words go back to their bubble: as they were, or as `replaced` says
   * they now are. What stepped aside comes back into the field.
   */
  async returnEdit(replaced?: string): Promise<void> {
    const { draft, field, fleet } = this.#parts;
    const lift = draft().lifted;
    const fieldEl = field();
    const fleetNow = fleet();
    if (!(fleetNow && lift && fieldEl)) {
      return;
    }
    const {
      asBubble,
      asField,
      bubbleBox,
      bubbleWords,
      fieldBox,
      LEFT_BY,
      landing: landingWords,
      replacing,
      startFlight,
    } = fleetNow.lift;
    const leaving = draft().text;
    const from = fieldBox(fieldEl);
    const trip = startFlight(asField(fieldEl, leaving), from);
    // What the field holds again shows once the words leaving it are gone.
    if (motionOk.current) {
      this.#landAfter(dur("--duration-lift") * LEFT_BY);
    }
    if (replaced !== undefined) {
      replacing.set(lift.id, replaced);
    }
    landingWords.add(lift.id);
    felt("give back");
    draft().putBack();
    fieldEl.focus();
    await tick();
    const words = bubbleWords(lift.id);
    if (!words) {
      trip.cancel();
      landingWords.delete(lift.id);
      return;
    }
    // The bubble opens from its tag; on a transcript held at its foot it
    // opens upward, so its words land that much higher than they stand now.
    const log = words.closest('[role="log"]');
    const fold = words.parentElement;
    const atFoot =
      !!log && log.scrollHeight - log.scrollTop - log.clientHeight < 2;
    const grows = atFoot && fold ? words.offsetHeight - fold.offsetHeight : 0;
    const to = bubbleBox(words, grows);
    if (to) {
      await trip.fly(asBubble(words), to);
    } else {
      trip.cancel();
    }
    landingWords.delete(lift.id);
  }

  /**
   * Enter while editing: the field's words go in the queued message's place.
   * `cuts` (mod+Enter) then stops a busy session's turn, so the message is
   * taken now: the replace goes first, so the turn's end never hands the
   * session the words as they were. Unchanged words keep the queued message
   * and stop the turn all the same; a failed replace stops nothing.
   */
  async replaceLifted(cuts = false): Promise<void> {
    const { draft, fleet } = this.#parts;
    const lift = draft().lifted;
    const message = this.#parts
      .recalled()
      ?.messages.find((m) => m.id === lift?.id);
    const fleetNow = fleet();
    if (!(fleetNow && lift && message)) {
      return;
    }
    const { notEdited, watchReplace } = fleetNow.lift;
    const words = draft().text.trim();
    if (!words) {
      this.#parts.say("Write a message before sending.");
      return;
    }
    if (words === lift.words.trim()) {
      this.returnEdit();
      if (cuts && this.#parts.busy()) {
        this.#parts.onstop();
      }
      return;
    }
    try {
      const sent = await fleetNow.replaceQueued(message, words);
      if (cuts && this.#parts.busy()) {
        this.#parts.onstop();
      }
      // Read while the replace was on its way out: the edit is already
      // back in the field, and the withdraw can only say so again.
      if (draft().lifted !== lift) {
        return;
      }
      this.returnEdit(words);
      watchReplace(draft(), {
        id: lift.id,
        instanceId: lift.instanceId,
        withdraw: sent.withdraw,
        replacement: sent.replacement,
        words,
        agent: this.#parts.agentName(),
      });
    } catch (error) {
      // The words stay in the field, still the queued message's: Enter
      // tries again, Esc keeps it as it was.
      if (draft().lifted === lift) {
        this.#parts.say(notEdited(failureWords(error)));
      }
    }
  }

  /**
   * The queued message was read while its words were in the field: it can
   * no longer be edited, and the edit stays, with why, to send anew.
   */
  #settleLift(read: string): void {
    const draft = this.#parts.draft();
    const edited = draft.putBack();
    draft.keepEdit(edited);
    draft.notice = `${read} Your edit is still in the composer.`;
  }

  /** Grows the editing row out of the pill. */
  #growEdit(): void {
    const shell = this.#parts.shell();
    const pill = this.#parts.pill();
    const field = this.#parts.field();
    if (!(shell && pill && field)) {
      return;
    }
    if (this.#editShape) {
      this.#editShape.morphTo(1, this.#editShape.ext, dur("--duration-grow"));
      if (this.edit) {
        this.edit.shown = true;
      }
      return;
    }
    // Measured by the lift before it wrote; a draft lifted elsewhere (a
    // conversation switched to) is measured here.
    const { size } = this.#liftSizes ?? measureShape(shell, pill, field);
    this.#liftSizes = null;
    const { row } = size;
    const shape = new GrownShape(shell, size, row);
    this.#editShape = shape;
    // Inset past the shoulders' curve, so nothing sits against the slope.
    this.edit = {
      inset: Math.round(shape.taper() + size.r + size.headroom),
      base: size.base,
      row,
      shown: false,
    };
    this.#growRow(shape, row);
  }

  /**
   * The row's entrance: the shape grows `row` up, and its parts come up
   * partway, once there is room for them: --duration-control into the shape's
   * own clock, which runs on drawn frames (GrownShape `morphTo`). A lift's
   * focus that brings up an on-screen keyboard has iOS Safari hold its
   * frames until the keyboard has risen, and neither the shape nor its
   * parts spend that wait, so both are seen coming up once frames come.
   */
  #growRow(shape: GrownShape, row: number): void {
    shape.morphTo(1, row, dur("--duration-grow"), shape.base, {
      ms: motionOk.current ? dur("--duration-control") : 0,
      run: () => {
        if (this.edit && this.#editShape === shape) {
          this.edit.shown = true;
        }
      },
    });
  }

  async #foldEdit(): Promise<void> {
    const shape = this.#editShape;
    if (!shape) {
      return;
    }
    if (this.edit) {
      this.edit.shown = false;
    }
    await shape.morphTo(0, shape.ext, dur("--duration-grow-exit"));
    // Grown again while it folded: it stays.
    if (this.#editShape === shape && !this.#parts.draft().lifted) {
      shape.remove();
      this.#editShape = null;
      this.edit = null;
    }
  }
}
