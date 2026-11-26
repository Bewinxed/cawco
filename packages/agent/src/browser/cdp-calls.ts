/**
 * The calls one side sends on a CDP socket, each answered by the message
 * carrying its id: numbered from `first`, so two senders on one socket
 * (the gate's own calls beside its client's) never share an id.
 */

import { Gone } from "@cawco/core/effect/bounded";
import { Deferred, Effect, Schema } from "effect";
import { z } from "zod";
import { runPromise } from "../daemon-runtime";

type Json = Record<string, unknown>;

/** What a Chromium's DevTools answers at `/json/version`, as far as a connection reads it. */
export const DevtoolsVersion = z.object({
  webSocketDebuggerUrl: z.string().optional(),
});

/** A CDP answer, as far as settling a call reads it. */
interface Answer {
  error?: { message: string };
  result?: Json;
}

/** Chromium answered a call with an error: its message. */
export class CdpRefused extends Schema.TaggedError<CdpRefused>()("CdpRefused", {
  message: Schema.String,
}) {}

export class CdpCalls {
  readonly #send: (text: string) => void;
  #next: number;
  /** Each call waiting for its answer, by its id: failed with {@link Gone} when the connection goes. */
  readonly #waiting = new Map<
    number,
    Deferred.Deferred<Json, CdpRefused | Gone>
  >();

  constructor(send: (text: string) => void, first = 1) {
    this.#send = send;
    this.#next = first;
  }

  /**
   * Sends one call as the Effect runs, and answers with its answer:
   * {@link CdpRefused} when Chromium refused it, {@link Gone} when the
   * connection went first. Interrupting it stops waiting for the answer.
   */
  readonly request = Effect.fnUntraced(function* (
    this: CdpCalls,
    method: string,
    params: Json,
    sessionId?: string
  ) {
    const id = this.#post(method, params, sessionId);
    const answer = yield* Deferred.make<Json, CdpRefused | Gone>();
    this.#waiting.set(id, answer);
    return yield* Deferred.await(answer).pipe(
      Effect.ensuring(Effect.sync(() => this.#waiting.delete(id)))
    );
  });

  /**
   * The promise edge of {@link CdpCalls.request}: sends one call at once,
   * and rejects with an `Error` of Chromium's message, or of why the
   * connection went.
   */
  call(method: string, params: Json, sessionId?: string): Promise<Json> {
    return runPromise(
      this.request(method, params, sessionId).pipe(
        Effect.mapError((failed) =>
          failed._tag === "Gone" ? new Error(failed.what) : failed
        )
      )
    );
  }

  /** Sends one call and waits for no answer. */
  post(method: string, params: Json, sessionId?: string): void {
    this.#post(method, params, sessionId);
  }

  #post(method: string, params: Json, sessionId?: string): number {
    const id = this.#next;
    this.#next += 1;
    this.#send(
      JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      })
    );
    return id;
  }

  /** Settles call `id` with its answer, if it is one of ours waiting. */
  settle(id: number, message: Answer): void {
    const waiting = this.#waiting.get(id);
    this.#waiting.delete(id);
    if (!waiting) {
      return;
    }
    Deferred.doneUnsafe(
      waiting,
      message.error
        ? Effect.fail(new CdpRefused({ message: message.error.message }))
        : Effect.succeed(message.result ?? {})
    );
  }

  /** Fails every call still waiting with `why`: the connection is gone. */
  fail(why: string): void {
    const waiting = [...this.#waiting.values()];
    this.#waiting.clear();
    for (const answer of waiting) {
      Deferred.doneUnsafe(answer, Effect.fail(new Gone({ what: why })));
    }
  }
}
