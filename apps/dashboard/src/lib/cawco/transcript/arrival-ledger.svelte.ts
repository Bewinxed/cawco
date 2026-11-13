/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import { dur } from "#lib/platform/motion/curves.svelte.js";
import { waiting } from "#lib/platform/motion/share.svelte.js";
import { browser } from "$app/env";
import type { SessionState } from "../stores/sessions.svelte";
import { type Motion, type Ticket, watchedSessions } from "./arrivals.svelte";
import { LIVE_KINDS, tailStart } from "./row-build.svelte";
import type { Fold, Row } from "./rows";

/** Rows that land together cascade --duration-stagger apart, and no more than five deep. */
const STAGGER_ROWS = 5;

/** A tool call's id to the ledger: the run it sits in is not what arrives. */
export const callId = (m: {
  id?: string;
  toolCallId?: string | null;
}): string => `call:${m.id ?? m.toolCallId}`;
export interface ArrivalLedgerHost {
  readonly active: boolean;
  readonly landed: boolean;
  readonly rowBuild: {
    readonly catching: boolean;
    readonly frozen: Row[];
  };
  readonly session: SessionState;
  readonly shown: boolean;
  readonly visible: boolean;
}

export class ArrivalLedger {
  readonly #host: ArrivalLedgerHost;

  // The arrival ledger's state. Read by every build, so declared before
  // the first one (the server evaluates the rows during init).
  /** Every id this view has held: rows, the calls inside runs, the live tail's rows. */
  readonly known = new Set<string>();

  /**
   * The rows whose ids are all in `known`. A build keeps every row it did
   * not fold again as the same object, and a row's ids never change, so a
   * row seen once is never read for its ids again: a long transcript's every
   * row was, on every streamed frame. Declared here with the rest of the
   * ledger: a transcript mounting on a session whose sizes it kept builds
   * during init (`cache`), and read further down it was not yet initialised.
   */
  readonly recorded = new WeakSet<Row>();

  /** Arrivals decided and not yet mounted. A row takes its own, once. */
  readonly tickets = new Map<string, Ticket>();

  /** The array the last build folded. Live frames push onto it; history replaces it. */
  lastArray: unknown = null;

  /** Whether the ledger has seen a build: the first one is everything already there. */
  seeded: boolean;

  /** Whether the page is visible. Tracked, so the ledger and the rows can read it. */
  pageHidden = $state(browser && document.hidden);

  /**
   * Whether this view is being watched: landed and drawn, the transcript
   * being worked in, on screen, not replaying a catch-up, on a visible page.
   * A build outside this window is history for this view, whatever it
   * contains.
   */
  readonly watched = $derived.by(
    () =>
      this.#host.landed &&
      this.#host.shown &&
      this.#host.active &&
      this.#host.visible &&
      !this.#host.rowBuild.catching &&
      !this.pageHidden
  );

  readonly idsOf = (row: Row): string[] =>
    row.kind === "tools" ? row.messages.map(callId) : [row.key];

  // Arrivals
  // The rule and why it is read from data live in `arrivals.svelte.ts`. This
  // is where it runs: once per build, over every id the build holds.

  ledger(fold: Fold): void {
    const live = this.#host.session.messages === this.lastArray;
    this.lastArray = this.#host.session.messages;
    const open = this.seeded && untrack(() => this.watched);
    this.seeded = true;
    const fresh = this.unheld(fold.rows);
    if (!open) {
      this.tickets.clear();
      return;
    }
    let slot = 0;
    // The calls whose glance the last build drew: each is that glance, landed.
    // A glance is a tail row (`tailStart`): only the tail is read.
    const glanced = new Set(
      this.#host.rowBuild.frozen
        .slice(tailStart(this.#host.rowBuild.frozen))
        .flatMap((row) => (row.kind === "livetool" ? [row.glance.toolId] : []))
    );
    for (const { id, row } of fresh) {
      if (!(live || LIVE_KINDS.has(row.kind))) {
        continue;
      }
      if (row.kind === "tools" && this.wasGlanced(row, id, glanced)) {
        continue;
      }
      const ticket = this.ticketFor(row, fold.ended, slot);
      this.tickets.set(id, ticket);
      slot += ticket.kind === "arrive" ? 1 : 0;
    }
  }

  /**
   * Whether the call `id` in this run is one the reader already had on screen
   * as its glance: its line opened then, and this is that line settling.
   */
  wasGlanced(
    row: Extract<Row, { kind: "tools" }>,
    id: string,
    glanced: Set<string>
  ): boolean {
    return row.messages.some(
      (m) =>
        callId(m) === id &&
        glanced.has(m.metadata?.toolId ?? m.toolCallId ?? "")
    );
  }

  /** The ids this build holds that this view never has — recorded as held now. */
  unheld(candidates: Row[]): { id: string; row: Row }[] {
    const fresh: { id: string; row: Row }[] = [];
    for (const row of candidates) {
      if (this.recorded.has(row)) {
        continue;
      }
      this.recorded.add(row);
      for (const id of this.idsOf(row)) {
        if (!this.known.has(id)) {
          this.known.add(id);
          fresh.push({ id, row });
        }
      }
    }
    return fresh;
  }

  /**
   * What a new row gets. Reasoning settling into its own row is the same
   * object, so it does not arrive: it folds shut from where it was open. An
   * answer settles under the live row's own key, so it is never new.
   * Everything else arrives in its place in the burst.
   */
  ticketFor(row: Row, ended: Fold["ended"], slot: number): Ticket {
    if (row.key === ended?.into) {
      return { kind: "fold" };
    }
    return {
      kind: "arrive",
      lead: Math.min(slot, STAGGER_ROWS - 1) * dur("--duration-stagger"),
      start: null,
    };
  }

  /** How a row arrives, by what it is. */
  motionOf = (row: Row): Motion => {
    // The reader's own message, sent from the composer below, is its text
    // landing from the field in the one row the send drew, keyed by the
    // message's id: no entrance of the row's own.
    if (
      ((row.kind === "single" && row.message.type === "user") ||
        row.kind === "queued") &&
      waiting(`sent:${row.message.id}`)
    ) {
      return "emerge";
    }
    return "draw";
  };

  constructor(host: ArrivalLedgerHost) {
    this.#host = host;
    this.seeded = false;

    $effect(() => {
      const seen = (): void => {
        this.pageHidden = document.hidden;
        this.tickets.clear();
      };
      document.addEventListener("visibilitychange", seen);
      return () => document.removeEventListener("visibilitychange", seen);
    });

    $effect(() => {
      const id = this.#host.session.instanceId;
      if (!this.watched) {
        this.tickets.clear();
        return;
      }
      watchedSessions.add(id);
      return () => watchedSessions.delete(id);
    });
  }
}
