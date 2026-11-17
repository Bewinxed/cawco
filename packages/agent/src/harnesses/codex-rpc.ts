/**
 * Codex's app-server, spoken to: JSON-RPC 2.0, one JSON object a line, in
 * the types its pinned release generates (`./codex-protocol`, `bun
 * scripts/codex-protocol.ts`). {@link CodexPeer} is the protocol alone, over
 * whatever carries its lines: a session's app-server held by the keeper
 * (codex-session.ts), or one this agent starts for a single read
 * ({@link withAppServer}).
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readWithin } from "@cawco/core/bounded";
import type {
  ClientRequest,
  InitializeResponse,
  ServerNotification,
  ServerRequest,
} from "./codex-protocol/root.gen";
import type * as V2 from "./codex-protocol/v2.gen";

/** The client CawCo initializes as: what `userAgent` names (`cawco/<codex version> …`). */
const CODEX_CLIENT = {
  name: "cawco",
  title: "CawCo",
  version: "1",
} as const;

/** Each request the adapter sends, by method, with what it answers. */
interface Results {
  "account/login/cancel": V2.CancelLoginAccountResponse;
  "account/login/start": V2.LoginAccountResponse;
  "account/rateLimits/read": V2.GetAccountRateLimitsResponse;
  "account/read": V2.GetAccountResponse;
  initialize: InitializeResponse;
  "mcpServerStatus/list": V2.ListMcpServerStatusResponse;
  "model/list": V2.ModelListResponse;
  "skills/list": V2.SkillsListResponse;
  "thread/attachment/add": V2.ThreadAttachmentAddResponse;
  "thread/backgroundTerminals/list": V2.ThreadBackgroundTerminalsListResponse;
  "thread/compact/start": V2.ThreadCompactStartResponse;
  "thread/delete": V2.ThreadDeleteResponse;
  "thread/fork": V2.ThreadForkResponse;
  "thread/inject_items": V2.ThreadInjectItemsResponse;
  "thread/list": V2.ThreadListResponse;
  "thread/loaded/list": V2.ThreadLoadedListResponse;
  "thread/name/set": V2.ThreadSetNameResponse;
  "thread/read": V2.ThreadReadResponse;
  "thread/resume": V2.ThreadResumeResponse;
  "thread/revert": V2.ThreadRevertResponse;
  "thread/start": V2.ThreadStartResponse;
  "thread/turns/list": V2.ThreadTurnsListResponse;
  "thread/unsubscribe": V2.ThreadUnsubscribeResponse;
  "turn/interrupt": V2.TurnInterruptResponse;
  "turn/start": V2.TurnStartResponse;
  "turn/steer": V2.TurnSteerResponse;
}

export type CodexMethod = keyof Results & ClientRequest["method"];
export type ParamsOf<M extends CodexMethod> = Extract<
  ClientRequest,
  { method: M }
>["params"];
export type ResultOf<M extends CodexMethod> = Results[M];

/** A notification Codex sends, by method. */
export type CodexNotification = ServerNotification;
/** A request Codex sends the client and waits on: an ask. */
export type CodexServerRequest = ServerRequest;

/** A JSON-RPC error Codex answered a request with. */
class CodexRpcError extends Error {
  readonly code: number;
  constructor(method: string, code: number, message: string) {
    super(`Codex refused ${method}: ${message}`);
    this.code = code;
  }
}

/** What a peer does with what Codex says on its own. */
export interface CodexHandlers {
  /** A notification. */
  notification: (message: CodexNotification) => void;
  /** An ask Codex waits on: answered later with {@link CodexPeer.answer}. */
  request: (message: CodexServerRequest) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A line Codex wrote with a `method` and no `id`: one of its notifications,
 * whose shape its generated protocol types.
 */
const isNotification = (
  message: Record<string, unknown>
): message is Record<string, unknown> & CodexNotification =>
  typeof message.method === "string" && message.id === undefined;

/** A line Codex wrote with a `method` and an `id`: an ask it waits on. */
const isServerRequest = (
  message: Record<string, unknown>
): message is Record<string, unknown> & CodexServerRequest =>
  typeof message.method === "string" &&
  (typeof message.id === "string" || typeof message.id === "number");

/**
 * The answer to a request of `method`, as Codex sent it: its result's shape
 * is the one its generated protocol gives the method. A result is always
 * some JSON value, `{}` at the least.
 */
const isResultOf = <M extends CodexMethod>(
  value: unknown,
  _method: M
): value is ResultOf<M> => value !== undefined;

/**
 * One connection's JSON-RPC: requests out with ids of its own, their answers
 * matched back, and Codex's notifications and asks handed on. Ids carry a
 * prefix of this peer's own, so an answer to a request an earlier agent sent
 * on the same connection (read again off the keeper's ring after a restart)
 * matches nothing here.
 */
export class CodexPeer {
  readonly #write: (line: string) => Promise<void>;
  readonly #handlers: CodexHandlers;
  readonly #prefix = `cawco-${crypto.randomUUID().slice(0, 8)}-`;
  #sent = 0;
  readonly #pending = new Map<
    string,
    {
      method: string;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  #closed: Error | undefined;

  constructor(write: (line: string) => Promise<void>, handlers: CodexHandlers) {
    this.#write = write;
    this.#handlers = handlers;
  }

  /** Requests waiting on an answer: the agent's memory line counts them. */
  get waiting(): number {
    return this.#pending.size;
  }

  /** `method` asked of Codex, and its answer. */
  async request<M extends CodexMethod>(
    method: M,
    params: ParamsOf<M>
  ): Promise<ResultOf<M>> {
    if (this.#closed) {
      throw this.#closed;
    }
    this.#sent += 1;
    const id = `${this.#prefix}${this.#sent}`;
    const answer = new Promise<unknown>((resolve, reject) =>
      this.#pending.set(id, { method, resolve, reject })
    );
    try {
      await this.#write(`${JSON.stringify({ id, method, params })}\n`);
    } catch (error) {
      this.#pending.delete(id);
      throw error;
    }
    const result = await answer;
    if (!isResultOf(result, method)) {
      throw new Error(`Codex answered ${method} with no result`);
    }
    return result;
  }

  /** A notification to Codex (`initialized`). */
  async notify(method: "initialized"): Promise<void> {
    await this.#write(`${JSON.stringify({ method })}\n`);
  }

  /** The answer to Codex's ask `id`. */
  async answer(id: string | number, result: unknown): Promise<void> {
    await this.#write(`${JSON.stringify({ id, result })}\n`);
  }

  /** Codex's ask `id` refused as a JSON-RPC error. */
  async refuse(id: string | number, message: string): Promise<void> {
    await this.#write(
      `${JSON.stringify({ id, error: { code: -32_000, message } })}\n`
    );
  }

  /** One line Codex wrote. A line that is no JSON object (a log line) is dropped. */
  receive(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message)) {
      return;
    }
    if (isNotification(message)) {
      this.#handlers.notification(message);
      return;
    }
    if (isServerRequest(message)) {
      this.#handlers.request(message);
      return;
    }
    const { id } = message;
    if (typeof id !== "string") {
      return;
    }
    const pending = this.#pending.get(id);
    if (!pending) {
      return;
    }
    this.#pending.delete(id);
    const { error } = message;
    if (isRecord(error)) {
      pending.reject(
        new CodexRpcError(
          pending.method,
          typeof error.code === "number" ? error.code : 0,
          typeof error.message === "string" ? error.message : String(error)
        )
      );
    } else {
      pending.resolve(message.result);
    }
  }

  /** The connection ended: every request still waiting fails with `why`. */
  close(why: Error): void {
    this.#closed = why;
    for (const pending of this.#pending.values()) {
      pending.reject(why);
    }
    this.#pending.clear();
  }

  /** `initialize` as CawCo, then `initialized`: the handshake every connection opens with. */
  async handshake(): Promise<InitializeResponse> {
    const answer = await this.request("initialize", {
      clientInfo: CODEX_CLIENT,
      // The experimental API carries a thread's environments and its
      // background terminals (Codex audit 2026-11-17, C-a3, C-bg).
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    await this.notify("initialized");
    return answer;
  }
}

/** How long a one-off app-server may take for its whole read. */
const ONE_OFF_MS = 30_000;

/**
 * `work` run against an app-server this agent starts for it alone, with
 * `env` (its `CODEX_HOME`), in `cwd`: initialized, then stopped as `work`
 * ends. Its asks are refused: a read raises none.
 */
export const withAppServer = async <T>(
  bin: string,
  env: Record<string, string>,
  work: (peer: CodexPeer) => Promise<T>,
  options: {
    cwd?: string;
    notification?: (message: CodexNotification) => void;
    timeoutMs?: number;
  } = {}
): Promise<T> => {
  const child = spawn(bin, ["app-server"], {
    cwd: options.cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-2000);
  });
  const peer: CodexPeer = new CodexPeer(
    (line) =>
      new Promise<void>((resolve, reject) =>
        child.stdin.write(line, (error) => (error ? reject(error) : resolve()))
      ),
    {
      notification: (message) => options.notification?.(message),
      request: (message) => {
        peer
          .refuse(message.id, "CawCo's read asks nothing")
          .catch(() => undefined);
      },
    }
  );
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => peer.receive(line));
  const exited = new Promise<never>((_, reject) =>
    child.once("exit", (code, signal) =>
      reject(
        new Error(
          `codex app-server exited (${code ?? signal}) before the read ended: ${stderr.trim() || "no output"}`
        )
      )
    )
  );
  exited.catch(() => undefined);
  child.once("error", (error) => peer.close(error));
  try {
    const read = await readWithin(options.timeoutMs ?? ONE_OFF_MS, () =>
      Promise.race([
        (async () => {
          await peer.handshake();
          return await work(peer);
        })(),
        exited,
      ])
    );
    if (read.kind === "unanswered") {
      throw new Error(
        `codex app-server did not answer within ${read.after} ms (${read.reason})`
      );
    }
    return read.value;
  } finally {
    peer.close(new Error("the read ended"));
    lines.close();
    child.stdin.end();
    child.kill("SIGTERM");
  }
};
