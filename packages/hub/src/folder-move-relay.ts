/**
 * The bytes of a folder move between two machines, relayed and stored
 * nowhere (core folder-move.ts `FolderMoveRelay`; the owner's condition for
 * moving secrets: "the bytes pass through the hub's memory and are stored
 * nowhere", advice project-folder-change.md §8). One stream per token, which
 * the move's job opens for one copy: the folder's machine puts it
 * (`PUT /api/folder-moves/relay/<token>`), the destination's takes it
 * (`GET`), each side's request held until the other's arrives. The put
 * answers once the take has read every byte, at the take's pace; either
 * side ending early ends the other's request too, and the job's own end
 * closes both. Off the control link: no heartbeat waits behind a folder.
 */
import { Deferred, Effect, Schema } from "effect";
import { bytes, problem } from "elysia";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

/** How long one side waits for the other to arrive. */
const MEET_MS = 5 * 60_000;

/** The stream ended for both sides before it was done: `message` says by what. */
class RelayEnded extends Schema.TaggedError<RelayEnded>()("RelayEnded", {
  message: Schema.String,
}) {}

interface Pipe {
  /** The put's body, once it came: the take reads it. */
  body: Deferred.Deferred<ReadableStream<Uint8Array>>;
  given: boolean;
  /** Fails once the stream ends for both sides ({@link RelayEnded}). */
  stopped: Deferred.Deferred<never, RelayEnded>;
  timer: HubTimer;
}

const gone = () =>
  problem(404, {
    code: "folder-move-relay-gone",
    detail: "That copy's stream is over.",
  });

/** What failed a side's request, in its words. */
const wordsOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createFolderMoveRelay = (lifetime: HubLifetimeShape) => {
  const pipes = new Map<string, Pipe>();

  /** The stream ended for both sides: by the job, or by a side that never came. */
  const close = (token: string, why: string): void => {
    const pipe = pipes.get(token);
    if (!pipe) {
      return;
    }
    pipes.delete(token);
    lifetime.cancel(pipe.timer);
    Deferred.doneUnsafe(
      pipe.stopped,
      Effect.fail(new RelayEnded({ message: why }))
    );
  };

  /** A new stream for one copy, by an unguessable token. */
  const open = (): string => {
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
      "-",
      ""
    );
    pipes.set(token, {
      body: Deferred.makeUnsafe(),
      given: false,
      stopped: Deferred.makeUnsafe(),
      timer: lifetime.after("folder move relay meets", MEET_MS, () =>
        close(token, "the other computer never joined the copy")
      ),
    });
    return token;
  };

  /**
   * The folder's machine puts the stream: answered once the take has read
   * all of it. The promise edge of the pipe, which the stream's end cuts.
   */
  const put = async (token: string, request: Request) => {
    const pipe = pipes.get(token);
    const { body } = request;
    if (!pipe || pipe.given || !body) {
      return gone();
    }
    pipe.given = true;
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    Deferred.doneUnsafe(pipe.body, Effect.succeed(readable));
    try {
      return await lifetime.run(
        Effect.raceFirst(
          Effect.tryPromise({
            try: (signal) => body.pipeTo(writable, { signal }),
            catch: (error) => error,
          }),
          Deferred.await(pipe.stopped)
        ).pipe(
          Effect.as({ taken: true as const }),
          Effect.catch((error) =>
            Effect.succeed(
              problem(502, {
                code: "folder-move-relay-ended",
                detail: wordsOf(error),
              })
            )
          )
        )
      );
    } finally {
      if (pipes.get(token) === pipe) {
        pipes.delete(token);
        lifetime.cancel(pipe.timer);
      }
    }
  };

  /**
   * The destination's machine takes the stream, as the put sends it
   * (`application/octet-stream`, Elysia's `bytes`). The promise edge of the
   * wait for the put's body, which the stream's end cuts.
   */
  const take = (token: string) => {
    const pipe = pipes.get(token);
    if (!pipe) {
      return Promise.resolve(gone());
    }
    return lifetime.run(
      Effect.raceFirst(
        Deferred.await(pipe.body),
        Deferred.await(pipe.stopped)
      ).pipe(
        Effect.map((stream) => bytes(stream)),
        Effect.catch((error) =>
          Effect.succeed(
            problem(410, {
              code: "folder-move-relay-ended",
              detail: error.message,
            })
          )
        )
      )
    );
  };

  return { open, close, put, take };
};
