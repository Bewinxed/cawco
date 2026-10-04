/** Passive custody inspection: never starts or asks a harness, model or provider. */
import type { UnownedSessionProcess } from "@cawco/core";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { parseProcId } from "./proc-id";
import { SessiondClient } from "./sessiond-client";

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

  get turnState(): boolean | null {
    return this.#running ?? null;
  }
}

type ProcLineListener = Parameters<SessiondClient["subscribe"]>[1];

/** Read a fixed ring snapshot, reopening at its oldest retained line after a reset. */
export const readRing = (
  client: SessiondClient,
  procId: string,
  afterSeq: number,
  head: number,
  line: NonNullable<ProcLineListener["line"]>
): Promise<number> => {
  let oldest = afterSeq + 1;
  return new Promise<number>((done) => {
    if (head <= afterSeq) {
      done(oldest);
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
          done(oldest);
        }
      },
      exit: () => done(oldest),
      reset: (nextSeq, from) => {
        oldest = from ?? nextSeq;
        if (reopened || oldest > head) {
          done(oldest);
          return;
        }
        reopened = true;
        client.subscribe(procId, listener, oldest - 1);
      },
    };
    client.subscribe(procId, listener, afterSeq);
  });
};

/** One independent sessiond connection keeps passive reads off the adopted sessions' listeners. */
export const readHeldProcesses = async (
  include: (instanceId: string) => boolean
): Promise<UnownedSessionProcess[]> => {
  const client = await SessiondClient.connect(
    process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
  );
  try {
    return await Promise.all(
      client.procs.flatMap((proc) => {
        const id = parseProcId(proc.procId);
        if (!proc.alive || (id.kind !== "claude" && id.kind !== "pi")) {
          return [];
        }
        if (!include(id.instanceId)) {
          return [];
        }
        const harness = id.kind;
        return [
          (async (): Promise<UnownedSessionProcess> => {
            const activity = new ChildActivity(harness);
            let timer: ReturnType<typeof setTimeout> | undefined;
            const read = readRing(
              client,
              proc.procId,
              0,
              proc.head,
              (event) => {
                let line: RingLine | undefined;
                try {
                  line = JSON.parse(event.data) as RingLine;
                } catch {
                  // Child bytes need not be protocol JSON. They cannot assert turn state.
                  return;
                }
                activity.read(line);
              }
            ).then(() => activity.turnState);
            try {
              // An unreadable ring field is unknown; the already-listed process remains visible.
              const turnRunning = await Promise.race([
                read,
                new Promise<null>((done) => {
                  timer = setTimeout(() => done(null), 2000);
                }),
              ]);
              return {
                instanceId: id.instanceId,
                harness,
                cwd: proc.cwd ?? null,
                pid: proc.pid,
                turnRunning,
              };
            } finally {
              clearTimeout(timer);
            }
          })(),
        ];
      })
    );
  } finally {
    client.close();
  }
};
