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
import { bytes, problem } from "elysia";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

/** How long one side waits for the other to arrive. */
const MEET_MS = 5 * 60_000;

interface Pipe {
  /** The put's body, once it came: the take reads it. */
  body: Promise<ReadableStream<Uint8Array>>;
  give: (body: ReadableStream<Uint8Array>) => void;
  given: boolean;
  stop: AbortController;
  timer: HubTimer;
}

const gone = () =>
  problem(404, {
    code: "folder-move-relay-gone",
    detail: "That copy's stream is over.",
  });

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
    pipe.stop.abort(new Error(why));
  };

  /** A new stream for one copy, by an unguessable token. */
  const open = (): string => {
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
      "-",
      ""
    );
    let give: Pipe["give"] = () => undefined;
    const body = new Promise<ReadableStream<Uint8Array>>((resolve) => {
      give = resolve;
    });
    pipes.set(token, {
      body,
      give,
      given: false,
      stop: new AbortController(),
      timer: lifetime.after("folder move relay meets", MEET_MS, () =>
        close(token, "the other computer never joined the copy")
      ),
    });
    return token;
  };

  /** The folder's machine puts the stream: answered once the take has read all of it. */
  const put = async (token: string, request: Request) => {
    const pipe = pipes.get(token);
    if (!pipe || pipe.given || !request.body) {
      return gone();
    }
    pipe.given = true;
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    pipe.give(readable);
    try {
      await request.body.pipeTo(writable, { signal: pipe.stop.signal });
      return { taken: true as const };
    } catch (error) {
      return problem(502, {
        code: "folder-move-relay-ended",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (pipes.get(token) === pipe) {
        pipes.delete(token);
        lifetime.cancel(pipe.timer);
      }
    }
  };

  /** The destination's machine takes the stream, as the put sends it (`application/octet-stream`, Elysia's `bytes`). */
  const take = async (token: string) => {
    const pipe = pipes.get(token);
    if (!pipe) {
      return gone();
    }
    const stopped = new Promise<never>((_, reject) => {
      pipe.stop.signal.addEventListener("abort", () =>
        reject(pipe.stop.signal.reason)
      );
    });
    try {
      return bytes(await Promise.race([pipe.body, stopped]));
    } catch (error) {
      return problem(410, {
        code: "folder-move-relay-ended",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return { open, close, put, take };
};
