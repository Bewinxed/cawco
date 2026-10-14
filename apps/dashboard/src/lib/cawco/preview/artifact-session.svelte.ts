/**
 * An artifact's own tab's store (pane-fleet.ts): the one session that made
 * the artifact, followed on the hub's `ARTIFACT_SESSION_PATH` socket. The
 * owner: "an artifact shouldn't load anything that is not needed for the
 * preview/artifact, no unnecessary connections etc". So the tab opens this
 * socket and its doc's sync socket, and nothing of the fleet store: no board,
 * no fleet socket, no fleet REST reads, no transcript model.
 *
 * The hub sends the whole frame on open and on every change; a socket that
 * drops opens again, and the next frame is the whole of it again.
 */
import {
  ARTIFACT_SESSION_PATH,
  type ArtifactSessionFrame,
  type FsEntry,
  type FsPayload,
} from "@cawco/core";
import type { FolderReader } from "#lib/components/features/DirectoryPicker.svelte";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { deletePreview } from "../artifact-api";
import { newId } from "../id";
import { rowHref } from "../links";
import type {
  PaneFleet,
  PaneMachine,
  PanePreview,
  PaneSession,
} from "./pane-fleet";

/** How often the tab asks the hub whether the socket still carries. Our call, as the fleet socket's beat. */
const BEAT_MS = 15_000;
/** Silence after which the socket is called dead and opened again. Our call: two beats and a margin. */
const DEAD_MS = 40_000;
/** The waits before opening again after a drop, longest last. Our call. */
const RETRY_MS = [500, 1000, 2000, 5000, 10_000] as const;

interface Waiter {
  reject: (error: Error) => void;
  resolve: (result: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** What the hub sends on this socket: the frame, a beat's answer, and an `fs` ask's reply or refusal. */
type Heard =
  | ArtifactSessionFrame
  | { type: "heartbeat" }
  | {
      payload:
        | {
            error?: string;
            kind: "control_result";
            ok: boolean;
            result?: unknown;
          }
        | { kind: "error"; message: string };
      requestId?: string;
      verb: "frames";
    };

export class ArtifactSession implements PaneFleet {
  /** The session followed; null until the tab has found its artifact's. */
  #instanceId = $state<string | null>(null);
  #heard = $state<ArtifactSessionFrame | null>(null);
  /**
   * The panel as the pane holds it: the hub's frame, merged while its
   * revision stands (the page's title and capture the pane wrote stay), and
   * kept, closed, once the hub says it shows nothing.
   */
  #preview = $state<PanePreview | undefined>(undefined);
  #socket: WebSocket | null = null;
  #ended = false;
  #tries = 0;
  #beat: ReturnType<typeof setInterval> | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #lastHeard = 0;
  readonly #asks = new Map<string, Waiter>();

  /** Follows `instanceId`, the session that made the tab's artifact, from its first frame. */
  follow(instanceId: string): void {
    this.end();
    this.#ended = false;
    this.#tries = 0;
    this.#heard = null;
    this.#preview = undefined;
    this.#instanceId = instanceId;
    this.#open(instanceId);
  }

  /** Stops following: the socket closes, and nothing opens it again. */
  end(): void {
    this.#ended = true;
    clearInterval(this.#beat);
    clearTimeout(this.#retry);
    this.#socket?.close();
    this.#socket = null;
    for (const [id, waiter] of this.#asks) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error("The artifact's tab closed before its machine answered.")
      );
      this.#asks.delete(id);
    }
  }

  preview = (instanceId: string): PanePreview | undefined =>
    instanceId === this.#instanceId ? this.#preview : undefined;

  session = (instanceId: string): PaneSession | undefined =>
    instanceId === this.#instanceId
      ? (this.#heard?.session ?? undefined)
      : undefined;

  get machines(): readonly PaneMachine[] {
    return this.#heard?.machines ?? [];
  }

  working = (instanceId: string): boolean =>
    instanceId === this.#instanceId && (this.#heard?.working ?? false);

  sessionHref = (instanceId: string): string => rowHref(instanceId);

  closePreview = async (instanceId: string): Promise<void> => {
    await deletePreview(instanceId);
    if (instanceId === this.#instanceId && this.#preview) {
      this.#preview = { ...this.#preview, state: "closed" };
    }
  };

  readonly folders: FolderReader = {
    list: (machineId, path) => this.#fs<FsEntry[]>(machineId, "list", path),
    // The tab knows one session: on its machine, the picker opens on its folder.
    recent: (machineId) =>
      this.#heard?.session?.machineId === machineId
        ? this.#heard.session.cwd
        : null,
  };

  #open(instanceId: string): void {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${scheme}//${location.host}${ARTIFACT_SESSION_PATH}${encodeURIComponent(instanceId)}`
    );
    this.#socket = socket;
    socket.addEventListener("open", () => {
      this.#tries = 0;
      this.#lastHeard = Date.now();
      clearInterval(this.#beat);
      this.#beat = setInterval(() => {
        if (Date.now() - this.#lastHeard > DEAD_MS) {
          socket.close();
          return;
        }
        socket.send(JSON.stringify({ type: "heartbeat" }));
      }, BEAT_MS);
    });
    socket.addEventListener("message", (event) => {
      this.#lastHeard = Date.now();
      this.#take(JSON.parse(String(event.data)) as Heard);
    });
    socket.addEventListener("close", () => {
      clearInterval(this.#beat);
      if (this.#socket !== socket || this.#ended) {
        return;
      }
      this.#socket = null;
      const wait = RETRY_MS[Math.min(this.#tries, RETRY_MS.length - 1)];
      this.#tries += 1;
      this.#retry = setTimeout(() => this.#open(instanceId), wait);
    });
  }

  #take(heard: Heard): void {
    if ("type" in heard) {
      if (heard.type === "artifact.session") {
        this.#heard = heard;
        this.#keepPreview(heard.preview);
      }
      return;
    }
    const waiter = heard.requestId
      ? this.#asks.get(heard.requestId)
      : undefined;
    if (!(waiter && heard.requestId)) {
      return;
    }
    this.#asks.delete(heard.requestId);
    clearTimeout(waiter.timer);
    const { payload } = heard;
    if (payload.kind === "error") {
      waiter.reject(new Error(payload.message));
    } else if (payload.ok) {
      waiter.resolve(payload.result);
    } else {
      waiter.reject(
        new Error(
          payload.error ?? "The machine could not carry out that request."
        )
      );
    }
  }

  /** The fleet store's rule for a preview frame (client.svelte.ts `preview`), for one session. */
  #keepPreview(frame: ArtifactSessionFrame["preview"]): void {
    const previous = this.#preview;
    if (!frame) {
      if (previous && previous.state !== "closed") {
        this.#preview = { ...previous, state: "closed" };
      }
      return;
    }
    const sameRevision = previous?.revision === frame.revision;
    if (
      sameRevision &&
      previous.state === frame.state &&
      JSON.stringify(previous.artifact) === JSON.stringify(frame.artifact)
    ) {
      return;
    }
    this.#preview = { ...(sameRevision ? previous : {}), ...frame };
  }

  /** One `fs` ask of a machine, over this socket, answered by its `requestId`. */
  #fs<T>(machineId: string, op: FsPayload["op"], path: string): Promise<T> {
    const socket = this.#socket;
    if (socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new Error(
          "The hub isn't connected right now, so the folders can't be read. Try again."
        )
      );
    }
    const requestId = newId();
    const payload: FsPayload = { requestId, op, path };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#asks.delete(requestId)) {
          reject(
            new Error(
              `fs ${op} ${path} got no answer in time. The machine may be offline.`
            )
          );
        }
      }, CONTROL_TIMEOUT_MS);
      this.#asks.set(requestId, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
      });
      socket.send(
        JSON.stringify({ verb: "fs", machineId, requestId, payload })
      );
    });
  }
}
