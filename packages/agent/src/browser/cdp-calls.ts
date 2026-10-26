/**
 * The calls one side sends on a CDP socket, each answered by the message
 * carrying its id: numbered from `first`, so two senders on one socket
 * (the gate's own calls beside its client's) never share an id.
 */

type Json = Record<string, unknown>;

/** A CDP answer, as far as settling a call reads it. */
interface Answer {
  error?: { message: string };
  result?: Json;
}

export class CdpCalls {
  readonly #send: (text: string) => void;
  #next: number;
  readonly #waiting = new Map<
    number,
    { resolve: (result: Json) => void; reject: (error: Error) => void }
  >();

  constructor(send: (text: string) => void, first = 1) {
    this.#send = send;
    this.#next = first;
  }

  /** Sends one call; its answer settles the promise. An abort of `signal` stops waiting for it. */
  call(
    method: string,
    params: Json,
    sessionId?: string,
    signal?: AbortSignal
  ): Promise<Json> {
    return new Promise<Json>((resolve, reject) => {
      const id = this.#post(method, params, sessionId);
      signal?.addEventListener("abort", () => this.#waiting.delete(id));
      this.#waiting.set(id, { resolve, reject });
    });
  }

  /** Sends one call and waits for no answer. */
  post(method: string, params: Json, sessionId?: string): void {
    this.#post(method, params, sessionId);
  }

  #post(method: string, params: Json, sessionId?: string): number {
    const id = this.#next;
    this.#next += 1;
    this.#send(
      JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })
    );
    return id;
  }

  /** Settles call `id` with its answer, if it is one of ours waiting. */
  settle(id: number, message: Answer): void {
    const waiting = this.#waiting.get(id);
    this.#waiting.delete(id);
    if (message.error) {
      waiting?.reject(new Error(message.error.message));
    } else {
      waiting?.resolve(message.result ?? {});
    }
  }

  /** Fails every call still waiting with `why`: the connection is gone. */
  fail(why: string): void {
    for (const waiting of this.#waiting.values()) {
      waiting.reject(new Error(why));
    }
    this.#waiting.clear();
  }
}
