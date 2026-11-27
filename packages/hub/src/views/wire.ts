/**
 * What the hub's thread and the views thread (views/worker.ts) say to each
 * other: one ordered line of structured-clone messages each way. The hub's
 * thread tells what moved (views/changes.ts) and asks; the views thread
 * answers, asks back what only the hub's thread can do (a machine's
 * answer, a project's stages, which pages are kept blocks), and tells when
 * Recent's stored list changed.
 */
import type {
  FindConversation,
  FindCoverage,
  FindResult,
  MomentAuthor,
  TranscriptAnswer,
  TranscriptQuery,
  WaitingAnswer,
} from "@cawco/core/find";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import type { StageKind } from "@cawco/core/views";
import { Effect, Schema } from "effect";
import type { Listed } from "./catalogs";
import type { ViewChanges } from "./changes";
import type { FindPage, FindRequest, WaitingFrom } from "./find-engine";
import type { StoredHeld } from "./stored";

/** The live facts each ask carries: which machines' sockets the hub holds, which sessions wait on the person. */
export interface LiveFacts {
  needsYou: string[];
  online: string[];
}

/** What the hub's thread asks the views thread, each with what it answers. */
export interface ViewOps {
  /** The machine's stored transcripts moved, each as it reads now, and these left. */
  catalogMoved: {
    arg: {
      machineId: string;
      moved: NeutralSessionInfo[];
      removed: string[];
    };
    answer: null;
  };
  /** These sessions of a machine's catalog, as last read. */
  catalogSessions: {
    arg: { machineId: string; sessionIds: string[] };
    answer: NeutralSessionInfo[];
  };
  find: {
    arg: { live: LiveFacts; request: FindRequest };
    answer: FindPage | { cursor: string };
  };
  listing: {
    arg: {
      live: LiveFacts;
      request: Omit<FindRequest, "cursor" | "limit" | "q"> & {
        author: MomentAuthor;
      };
    };
    answer: { atLimit: boolean; coverage: FindCoverage; results: FindResult[] };
  };
  named: {
    arg: { live: LiveFacts; names: string[] };
    answer: Record<string, FindConversation | null>;
  };
  /** A machine's catalog listed again (a listing under way is the one waited on). */
  relist: { arg: string; answer: null };
  waiting: {
    arg: { from: WaitingFrom; live: LiveFacts };
    answer: WaitingAnswer;
  };
}

/** What the views thread asks the hub's thread, each with what it answers. */
export interface HubOps {
  askMachine: {
    arg: {
      caller: string;
      machineId: string;
      options: TranscriptQuery & { limit: number };
      query: string;
      requestId: number;
    };
    answer: TranscriptAnswer | { error: string };
  };
  /** Of these page artifacts, the kept blocks. */
  blockPages: { arg: string[]; answer: string[] };
  listStored: { arg: string; answer: Listed };
  /** A project's stages by name with their kinds; null when its stages.md does not read. */
  stageKinds: { arg: string; answer: [string, StageKind][] | null };
}

/** A set of asks: each op's argument and its answer. */
type OpsShape<Ops> = { [Op in keyof Ops]: { answer: unknown; arg: unknown } };

/** One ask of `Ops`: its op and its argument. */
export type AskOf<Ops extends OpsShape<Ops>> = {
  [Op in keyof Ops]: { arg: Ops[Op]["arg"]; op: Op };
}[keyof Ops];

/** One answer of `Ops`: its op and its value. */
export type AnswerOf<Ops extends OpsShape<Ops>> = {
  [Op in keyof Ops]: { op: Op; value: Ops[Op]["answer"] };
}[keyof Ops];

/** An ask on the line, by the number its answer comes back under. */
type Asking<Ops extends OpsShape<Ops>> = AskOf<Ops> & {
  id: number;
  kind: "ask";
};

/** An answer on the line to the ask of that number, or why it failed. */
type Answering<Ops extends OpsShape<Ops>> =
  | (AnswerOf<Ops> & { id: number; kind: "answer" })
  | { id: number; kind: "failed"; message: string };

/** From the hub's thread to the views thread. */
export type ToViews =
  | { kind: "start"; path: string }
  | { changes: ViewChanges; kind: "changes" }
  | Asking<ViewOps>
  | Answering<HubOps>;

/** From the views thread to the hub's thread. */
export type FromViews =
  { held: StoredHeld; kind: "stored" } | Asking<HubOps> | Answering<ViewOps>;

/**
 * Why an ask on the line got no answer of its own op: the other side failed
 * it, answered another op, the line went, or its asker stopped waiting.
 */
export class AskFailed extends Schema.TaggedError<AskFailed>()("AskFailed", {
  message: Schema.String,
}) {}

/**
 * Asks on one line and the answers they wait on: each ask is sent with a
 * number, and its answer settled by `pick`, which takes the answer of its
 * own op (a literal check, so the value is typed without an assertion).
 */
export const createAsking = <Ops extends OpsShape<Ops>>(
  send: (asking: Asking<Ops>) => void
) => {
  let next = 0;
  /** Each ask waiting, by its number: what its answer, or its failure, resumes. */
  const waiting = new Map<
    number,
    (settled: Effect.Effect<AnswerOf<Ops>, AskFailed>) => void
  >();
  return {
    /**
     * Asks `asked`, sent as the effect starts; `pick` reads its answer, or
     * undefined for another op's. `signal` aborts the wait, not the work, as
     * interrupting the effect does.
     */
    ask<Answer>(
      asked: AskOf<Ops>,
      pick: (answer: AnswerOf<Ops>) => { value: Answer } | undefined,
      signal?: AbortSignal
    ): Effect.Effect<Answer, AskFailed> {
      return Effect.callback<AnswerOf<Ops>, AskFailed>((resume) => {
        next += 1;
        const id = next;
        waiting.set(id, resume);
        const gone = (): void => {
          if (waiting.delete(id)) {
            resume(
              Effect.fail(
                new AskFailed({ message: "its asker no longer waits" })
              )
            );
          }
        };
        signal?.addEventListener("abort", gone, { once: true });
        send({ ...asked, id, kind: "ask" });
        return Effect.sync(() => {
          waiting.delete(id);
          signal?.removeEventListener("abort", gone);
        });
      }).pipe(
        Effect.flatMap((answer) => {
          const picked = pick(answer);
          return picked
            ? Effect.succeed(picked.value)
            : Effect.fail(
                new AskFailed({
                  message: `${String(asked.op)} was answered as ${String(answer.op)}`,
                })
              );
        })
      );
    },
    /** An answer came back: the ask it answers is settled. */
    answered(message: Answering<Ops>): void {
      const resume = waiting.get(message.id);
      if (!resume) {
        return;
      }
      waiting.delete(message.id);
      resume(
        message.kind === "answer"
          ? Effect.succeed(message)
          : Effect.fail(new AskFailed({ message: message.message }))
      );
    },
    /** The line went: every ask waiting fails with `why`. */
    lost(why: string): void {
      const lost = [...waiting.values()];
      waiting.clear();
      for (const resume of lost) {
        resume(Effect.fail(new AskFailed({ message: why })));
      }
    },
  };
};
