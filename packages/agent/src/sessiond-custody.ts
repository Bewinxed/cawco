/** Passive custody inspection: never starts or asks a harness, model or provider. */
import type { SessiondClient } from "./sessiond-client";

export interface RingLine {
  active?: unknown;
  command_uuid?: unknown;
  message?: RingLine;
  request?: { subtype?: unknown; input?: unknown };
  request_id?: unknown;
  session_id?: unknown;
  skip_transcript?: unknown;
  subtype?: unknown;
  type?: unknown;
  value?: { busy?: unknown };
}

const TURN_LINES: ReadonlySet<unknown> = new Set([
  "assistant",
  "user",
  "stream_event",
  "tool_progress",
  "control_request",
  "control_cancel_request",
]);

/** The last turn marker in already-written bytes; no marker means unknown. */
export class ChildActivity {
  #running: boolean | undefined;
  readonly #kind: "claude" | "pi";

  constructor(kind: "claude" | "pi") {
    this.#kind = kind;
  }

  read(line: RingLine | undefined): void {
    if (!line) {
      return;
    }
    if (this.#kind === "pi") {
      if (line.type === "busy" && typeof line.active === "boolean") {
        this.#running = line.active;
      } else if (
        line.type === "reply" &&
        typeof line.value?.busy === "boolean"
      ) {
        this.#running = line.value.busy;
      } else if (line.type === "frame" && line.message?.type === "result") {
        this.#running = false;
      }
      return;
    }
    if (line.type === "result") {
      this.#running = false;
    } else if (
      TURN_LINES.has(line.type) ||
      (line.type === "system" &&
        (line.subtype === "init" ||
          (line.subtype === "task_notification" &&
            line.skip_transcript !== true)))
    ) {
      this.#running = true;
    }
  }

  get decided(): boolean {
    return this.#running !== undefined;
  }

  /** Adoption's existing answer: no observed turn is not an observed running turn. */
  get turnRunning(): boolean {
    return this.#running === true;
  }
}

type ProcLineListener = Parameters<SessiondClient["subscribe"]>[1];

/**
 * What a read of a ring came to: read through `head` (or as far as the ring
 * still went, from `oldest`, or to the child's end), or `gone`: its keeper no
 * longer holds the child, which ended and was let go by another follower
 * (an update's old agent and new one follow the same children), so there is
 * no end left here to read.
 */
export type RingRead = { kind: "read"; oldest: number } | { kind: "gone" };

/**
 * Read a fixed ring snapshot, reopening at its oldest retained line after a
 * reset. NEVER WAITS ON A CHILD THE KEEPER NO LONGER HOLDS. A subscribe for an
 * id it does not hold is answered `{ type: "proc.backlog", events: [] }`
 * (from 0) or `{ type: "proc.reset", nextSeq: 1 }` with no `oldest` (from a
 * seq), sessiond server.ts `#subscribe`; a live child can be answered either
 * way too, so neither decides it. The listing behind the subscribe does
 * ({@link ProcLineListener.gone}): without it, the reset reopened at 0, its
 * empty backlog came, and the read waited for a line or an exit no keeper
 * would ever send.
 */
export const readRing = (
  client: SessiondClient,
  procId: string,
  afterSeq: number,
  head: number,
  line: NonNullable<ProcLineListener["line"]>
): Promise<RingRead> => {
  let oldest = afterSeq + 1;
  return new Promise<RingRead>((settle) => {
    // This read's own subscription, ended with the read: every other one to
    // the child on this connection goes on.
    let stop = (): void => undefined;
    const finish = (read: RingRead): void => {
      stop();
      settle(read);
    };
    const done = (): void => finish({ kind: "read", oldest });
    if (head <= afterSeq) {
      done();
      return;
    }
    let reopened = false;
    const listener: ProcLineListener = {
      line: (event) => {
        if (event.seq > head) {
          return;
        }
        line(event);
        if (event.seq === head) {
          done();
        }
      },
      exit: () => done(),
      gone: () => finish({ kind: "gone" }),
      reset: (nextSeq, from) => {
        oldest = from ?? nextSeq;
        if (reopened || oldest > head) {
          done();
          return;
        }
        reopened = true;
        stop();
        stop = client.subscribe(procId, listener, oldest - 1);
      },
    };
    stop = client.subscribe(procId, listener, afterSeq);
  });
};
