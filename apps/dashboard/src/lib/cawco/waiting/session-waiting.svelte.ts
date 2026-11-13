/**
 * What one session waits on the person for, as its pane's tray row shows
 * it (WaitingChip, WaitingCard): what its delegation tree asked him, read
 * from the hub (`GET /api/instances/:id/questions`, core
 * session-questions.ts), after the asks its tree's turns are parked on,
 * which the pane already holds (SessionPane `parked`, its connect asks).
 *
 * The hub's list is read while the pane is on screen, and again whenever it
 * may have moved (stores/needs.svelte.ts `questionsMoved`: an answer, a new ask, a
 * session ending, a take or a withdrawal). A read that fails keeps the last
 * list and says why, with its way to try again.
 *
 * A row's press opens what asks it where it asks: an artifact in this
 * session's panel at its card, its pin or its top (a delegate's too: the
 * panel opens what its tree made), the list staying open beside it (DESIGN.md,
 * The Open Page Rule); a parked ask where it is answered, the list put away
 * so the ask stands clear.
 */
import { detach } from "@cawco/core/detach";
import { hubRequest } from "@cawco/core/hub-request";
import type {
  SessionQuestion,
  SessionQuestionsRead,
} from "@cawco/core/session-questions";
import {
  failureClause,
  hubFetch,
  hubRefusal,
  refusedOf,
} from "#lib/platform/hub-read.js";
import { artifactOpenKey, openArtifactIn } from "../reference-open.svelte";
import { refusals } from "../refusals.svelte";
import { needsStore } from "../stores/needs.svelte";
import { isAsk, type WaitingAsk, type WaitingRow, waitingRows } from "./rows";

export interface SessionWaitingInput {
  /** The asks its tree's turns are parked on, as rows read them. */
  asks: () => WaitingAsk[];
  /** The session the pane shows. */
  instanceId: () => string;
  /** The pane is on screen: only then is the hub's list read. */
  onScreen: () => boolean;
  /** A parked ask's row pressed: the ask comes into view where it is answered. */
  showAsk: (row: WaitingRow & { requestId: string }) => void;
}

export class SessionWaiting {
  /** The hub's last list; null before the first read lands. */
  questions = $state<SessionQuestion[] | null>(null);
  /** Why the last read failed, in a clause; null once one went. */
  failure = $state<string | null>(null);
  /** The list stands open over the tray row. */
  shown = $state(false);
  readonly rows = $derived.by((): WaitingRow[] =>
    waitingRows(this.questions ?? [], this.#input.asks())
  );
  readonly #input: SessionWaitingInput;
  #reading: AbortController | null = null;

  /** Reads the session's list while the component that made it stands. */
  constructor(input: SessionWaitingInput) {
    this.#input = input;
    $effect(() => {
      if (!input.onScreen()) {
        return;
      }
      needsStore.questionsMoved();
      this.#read(input.instanceId());
      return () => this.#reading?.abort();
    });
    // Nothing left to list takes the open list with it.
    $effect(() => {
      if (this.rows.length === 0) {
        this.shown = false;
      }
    });
  }

  /** Reads again now (a failure's Try again). */
  again = (): void => {
    this.#read(this.#input.instanceId());
  };

  /** Row `row` pressed. */
  open = (row: WaitingRow): void => {
    if (isAsk(row)) {
      this.shown = false;
      this.#input.showAsk(row);
      return;
    }
    detach(
      openArtifactIn(this.#input.instanceId(), row.artifact.id, row.stop),
      "openArtifactIn"
    );
  };

  /** Why row `row`'s last open did not go (the Needs-you row's own record of it). */
  faultOf = (row: WaitingRow): string | null =>
    isAsk(row) ? null : refusals.reason(artifactOpenKey(row.artifact.id));

  #read(id: string): void {
    this.#reading?.abort();
    const reading = new AbortController();
    this.#reading = reading;
    hubFetch(hubRequest("GET /api/instances/:id/questions", { path: { id } }), {
      signal: reading.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw hubRefusal(await refusedOf(response));
        }
        const read = (await response.json()) as SessionQuestionsRead;
        this.questions = read.questions;
        this.failure = null;
      })
      .catch((error: unknown) => {
        if (!reading.signal.aborted) {
          this.failure = failureClause(error);
        }
      });
  }
}
