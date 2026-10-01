import { hostname } from "node:os";
import type {
  ControlPayload,
  Envelope,
  FramePayload,
  PermissionResult,
  SendPayload,
  UserAnswers,
  UserQuestion,
} from "@cawco/core";
import {
  ASK_USER_QUESTION,
  CAWCO_ENV,
  RESOLVE_PERMISSION,
  readEnv,
} from "@cawco/core";
import type { DbShape } from "./db";
import type { PendingShape } from "./pending";
import { answerWorkflow } from "./pending";
import type { RegistryShape } from "./registry";
import type { Intake, TelegramMedia } from "./telegram-media";
import { carriesMedia, createMediaIntake } from "./telegram-media";

/** The parked ask, as the bridge reads it out of the envelope the hub kept. */
type PermissionRequest = Extract<FramePayload, { kind: "permission_request" }>;

/** A session's message to the owner, off the envelope the hub handed over. */
type UserMessage = Extract<FramePayload, { kind: "user_message" }>;

export interface TelegramBridge {
  /** A session is blocked on the reader; put it in their pocket. */
  readonly onAsk: (envelope: Envelope) => void;
  readonly onError: (instanceId: string, message: string) => void;
  /** Answered somewhere else, or died with its process: the buttons are stale. */
  readonly onSettled: (requestId: string) => void;
  /** The supervisor wants the operator's attention — escalation or question. */
  readonly onSupervisor: (instanceId: string, text: string) => void;
  /** A session's own words to the owner — no ask, no buttons, no answer. */
  readonly onUserMessage: (envelope: Envelope) => void;
  /**
   * The server's delegate-answer recorder, registered after construction: the
   * bridge sends its `resolvePermission` straight down the agent socket, so an
   * escalated delegate ask answered from Telegram would otherwise settle
   * without a `delegate_events` answer row.
   */
  readonly setAnswerRecorder: (
    record: (
      machineId: string,
      instanceId: string,
      requestId: string,
      result: PermissionResult
    ) => void
  ) => void;
  /**
   * The server's machine-image reader, registered after construction like
   * {@link setAnswerRecorder}: a `send_to_user` attachment is a path on the
   * session's machine, and only the server holds the tunnel that reads it.
   */
  readonly setImageReader: (read: ImageReader) => void;
  /**
   * The server's one send path, registered after construction like
   * {@link setAnswerRecorder}: a reply typed here is a message sent to the
   * session like any other — recorded, streamed, and the reader's hand on the
   * session to the supervisor — and only the server does those. True when the
   * machine took it.
   */
  readonly setSender: (
    send: (envelope: Envelope<SendPayload>) => boolean
  ) => void;
  readonly start: () => void;
}

export type ImageReader = (
  machineId: string,
  path: string
) => Promise<
  | { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
  | "offline"
  | "timeout"
  | "missing"
>;

/** Bot API `sendPhoto` stops here; a bigger picture goes as a document. */
const PHOTO_LIMIT_BYTES = 10 * 1024 * 1024;

export interface TelegramServices {
  readonly db: DbShape;
  readonly pending: PendingShape;
  readonly registry: RegistryShape;
}

/** The row of the credentials table the pinned chat lives in. */
const CREDENTIAL_ID = "telegram";

/** Overridable so a test can point the bridge at a local stand-in. */
const API_BASE = Bun.env.CAWCO_TELEGRAM_API ?? "https://api.telegram.org";

/** Telegram's own ceiling on a message, and how long a `getUpdates` may hang. */
const MESSAGE_LIMIT = 4096;
const POLL_SECONDS = 50;
const POLL_TIMEOUT_MS = (POLL_SECONDS + 15) * 1000;
const BACKOFF_FLOOR_MS = 2000;
const BACKOFF_CEILING_MS = 30_000;

/** How many bridged messages stay answerable, and for how long. */
const TRACKED_MESSAGES = 500;
const TRACK_TTL_MS = 24 * 60 * 60_000;
const SWEEP_INTERVAL_MS = 60 * 60_000;

/**
 * The explicit answer, for a hub whose public URL it cannot see: behind a
 * reverse proxy or a tunnel, the origin a browser used is the proxy's, not the
 * one the operator wants in a message. Read directly rather than through core's
 * `readEnv`: `CAWCO_ENV` has no key for it.
 */
const DASHBOARD_URL_OVERRIDE = Bun.env.CAWCO_DASHBOARD_URL;

/**
 * The port the dashboard is served on, for the composed fallback below. The
 * default matches the one the installer gives the dashboard unit
 * (`packages/cli/src/service.ts`, `PORT ?? '3000'`); a hub that cannot import
 * the CLI has to be told separately when that is changed.
 */
const DASHBOARD_PORT = Bun.env.CAWCO_DASHBOARD_PORT ?? "3000";

/**
 * Where a message that is too big to answer here sends the reader instead.
 *
 * Observed rather than configured, because a hub cannot know its own
 * externally-reachable address: it may be reached by tailnet name, by LAN
 * address, through a container's published port or a proxy, and nothing in its
 * own environment distinguishes those. But it is the thing dashboards connect
 * TO — so rather than being told an address, it watches one arrive. Every
 * dashboard websocket carries the `Origin` its browser reached the hub from,
 * which is by construction a URL that worked for a real client, which is
 * exactly the property a link sent to a phone needs.
 *
 * In precedence order: the operator's override, then the last origin observed
 * (loopback and unparseable ones already discarded by the registry), then a URL
 * composed from this machine's hostname — the best guess available on a hub no
 * dashboard has ever connected to, and better than no link at all.
 */
const dashboardUrl = (registry: RegistryShape): string =>
  DASHBOARD_URL_OVERRIDE ??
  registry.dashboardOrigin() ??
  `http://${hostname()}:${DASHBOARD_PORT}`;

/** One bridged message, and what replying to it means. */
interface Tracked {
  at: number;
  instanceId: string;
  machineId: string;
  /** The ask it carries, while that ask is still open. */
  requestId?: string;
  /** Kept so an edit can append to the message rather than replace it. */
  text: string;
}

interface TelegramMessage extends TelegramMedia {
  chat?: { id?: number };
  message_id: number;
  reply_to_message?: { message_id?: number };
  text?: string;
}

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
  };
  message?: TelegramMessage;
  update_id: number;
}

interface InlineButton {
  callback_data: string;
  text: string;
}

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Clipped before escaping, so a cut never lands inside an entity. */
const clip = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

/**
 * Whole lines go, never half a tag. Every line the bridge writes closes what it
 * opens, so dropping trailing ones leaves the HTML Telegram parses intact —
 * which cutting the assembled string at a character count would not.
 */
const fit = (lines: string[]): string => {
  const kept = [...lines];
  const note = "\n\n… (truncated — open it in the dashboard)";
  let body = kept.join("\n");
  if (body.length <= MESSAGE_LIMIT) {
    return body;
  }
  while (kept.length > 1 && body.length > MESSAGE_LIMIT - note.length) {
    kept.pop();
    body = kept.join("\n");
  }
  return `${body.slice(0, MESSAGE_LIMIT - note.length)}${note}`;
};

/** The directory a session is in, as the reader would name it. */
const leaf = (cwd: string): string =>
  cwd.split("/").filter(Boolean).at(-1) ?? cwd;

const looksLikeQuestion = (value: unknown): value is UserQuestion =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as UserQuestion).question === "string" &&
  Array.isArray((value as UserQuestion).options);

/**
 * What a parked tool call is asking the reader, when it is asking rather than
 * requesting permission. Mirrors the dashboard's `questionsOf`; the hub cannot
 * import a browser module, and neither end should re-model the SDK's schema.
 */
const questionsOf = (request: PermissionRequest): UserQuestion[] | null => {
  if (request.toolName !== ASK_USER_QUESTION) {
    return null;
  }
  const { questions } = request.input as { questions?: unknown };
  if (!Array.isArray(questions) || questions.length === 0) {
    return null;
  }
  return questions.every(looksLikeQuestion)
    ? (questions as UserQuestion[])
    : null;
};

/**
 * One line of what a tool is about to do, off whichever field carries it. Best
 * effort by design: the fleet's tools are not a closed set, so a glance that
 * cannot be taken is simply not shown.
 */
const glance = (input: Record<string, unknown>): string | undefined => {
  for (const key of ["command", "description", "file_path", "url"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  for (const value of Object.values(input)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
};

/**
 * The hub's own line to its owner's Telegram: every ask the fleet parks lands
 * in one chat with the buttons that settle it, and what the owner types back
 * reaches the session that asked. `null` without a token — the bridge is opt-in
 * and its absence costs the hub nothing.
 */
export const createTelegramBridge = ({
  registry,
  db,
  pending,
}: TelegramServices): TelegramBridge | null => {
  const token = readEnv(CAWCO_ENV.telegramToken);
  if (!token) {
    console.log(`[telegram] no ${CAWCO_ENV.telegramToken} — bridge off`);
    return null;
  }

  const stored = db.getCredential(CREDENTIAL_ID);
  let chatId = typeof stored?.chatId === "number" ? stored.chatId : undefined;

  /** Bridged messages by Telegram id, for routing a reply back to a session. */
  const tracked = new Map<number, Tracked>();
  /** Open asks by `requestId`, for editing their message once they settle. */
  const asked = new Map<string, number>();
  /** Asks this bridge answered itself, so `onSettled` does not overwrite them. */
  const settledHere = new Set<string>();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - TRACK_TTL_MS;
    for (const [messageId, entry] of tracked) {
      if (entry.at >= cutoff) {
        continue;
      }
      tracked.delete(messageId);
      if (entry.requestId) {
        asked.delete(entry.requestId);
        settledHere.delete(entry.requestId);
      }
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  const call = async <T>(
    method: string,
    body: unknown
  ): Promise<T | undefined> => {
    const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    const answer = (await response.json()) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!answer.ok) {
      console.warn(
        `[telegram] ${method} refused: ${answer.description ?? response.status}`
      );
      return undefined;
    }
    return answer.result;
  };

  const media = createMediaIntake({
    call,
    filesBase: `${API_BASE}/file/bot${token}`,
  });

  /** `call`, for a method that carries bytes: multipart, not JSON. */
  const upload = async (
    method: string,
    form: FormData
  ): Promise<TelegramMessage | undefined> => {
    const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS * 3),
    });
    const answer = (await response.json()) as {
      ok?: boolean;
      result?: TelegramMessage;
      description?: string;
    };
    if (!answer.ok) {
      console.warn(
        `[telegram] ${method} refused: ${answer.description ?? response.status}`
      );
      return undefined;
    }
    return answer.result;
  };

  let readImage: ImageReader | undefined;

  /**
   * One attached image, read off its machine now and pushed as a photo — or as
   * a document when Telegram's photo limits will not have it (size, a refused
   * aspect ratio). A path that is no longer there is said so in words.
   */
  const sendAttachment = async (
    machineId: string,
    path: string
  ): Promise<TelegramMessage | undefined> => {
    if (chatId === undefined || !readImage) {
      return undefined;
    }
    const answer = await readImage(machineId, path);
    if (typeof answer === "string") {
      const why =
        answer === "missing"
          ? "is not there any more"
          : `could not be read (machine ${answer})`;
      return send(`<code>${esc(clip(path, 512))}</code> ${why}`);
    }
    const name = path.split("/").pop() ?? "image";
    const form = (field: string): FormData => {
      const body = new FormData();
      body.set("chat_id", String(chatId));
      body.set(
        field,
        new Blob([answer.bytes], { type: answer.mediaType }),
        name
      );
      body.set("caption", clip(path, 1024));
      return body;
    };
    const asPhoto = answer.bytes.byteLength <= PHOTO_LIMIT_BYTES;
    const sent = asPhoto ? await upload("sendPhoto", form("photo")) : undefined;
    return sent ?? (await upload("sendDocument", form("document")));
  };

  /**
   * Sends and tracks one attachment, so a reply to the picture reaches the
   * session that sent it. A failed upload is logged and skipped rather than
   * ending the run: the ones after it are still owed.
   */
  const deliverAttachment = async (
    machineId: string,
    instanceId: string,
    path: string
  ): Promise<void> => {
    try {
      const sent = await sendAttachment(machineId, path);
      if (sent) {
        track(sent.message_id, { instanceId, machineId, text: path });
      }
    } catch (error) {
      console.warn(
        `[telegram] attachment ${path} not sent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // biome-ignore lint/suspicious/useAwait: the declared Promise return type is what callers await; the body is a tail call into `call`, nothing here needs its own await
  const send = async (
    text: string,
    buttons?: InlineButton[][]
  ): Promise<TelegramMessage | undefined> => {
    if (chatId === undefined) {
      return undefined;
    }
    return call<TelegramMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(buttons && { reply_markup: { inline_keyboard: buttons } }),
    });
  };

  /** Records what replying to a bridged message means, newest crowding out oldest. */
  const track = (messageId: number, entry: Omit<Tracked, "at">): void => {
    tracked.set(messageId, { ...entry, at: Date.now() });
    if (entry.requestId) {
      asked.set(entry.requestId, messageId);
    }
    while (tracked.size > TRACKED_MESSAGES) {
      const oldest = tracked.keys().next();
      if (oldest.done) {
        break;
      }
      const dropped = tracked.get(oldest.value);
      tracked.delete(oldest.value);
      if (dropped?.requestId) {
        asked.delete(dropped.requestId);
        settledHere.delete(dropped.requestId);
      }
    }
  };

  /** Stamps an ask's message with how it ended and takes its buttons away. */
  const close = async (requestId: string, verdict: string): Promise<void> => {
    const messageId = asked.get(requestId);
    const entry = messageId === undefined ? undefined : tracked.get(messageId);
    if (messageId === undefined || !entry || chatId === undefined) {
      return;
    }
    const text = fit([entry.text, "", verdict]);
    entry.text = text;
    entry.requestId = undefined;
    asked.delete(requestId);
    await call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] },
    });
  };

  /**
   * Where a session is, in the words its reader knows it by. Scanned rather than
   * looked up: the hub has no single-instance read, and the table is small.
   */
  const header = (instanceId: string, mark: string): string => {
    const row = db
      .listInstances()
      .find((instance) => instance.id === instanceId);
    if (!row) {
      return `${mark} <b>${esc(instanceId.slice(0, 8))}</b>`;
    }
    const machineLabel =
      db.listAgents().find((agent) => agent.machineId === row.machineId)
        ?.hostname ?? row.machineId;
    const project = row.projectId
      ? db.listProjects().find((candidate) => candidate.id === row.projectId)
          ?.name
      : undefined;
    const parts = [`<b>${esc(leaf(row.cwd))}</b>`, esc(machineLabel)];
    if (project) {
      parts.push(esc(project));
    }
    return `${mark} ${parts.join(" · ")}`;
  };

  /** The one place a hub-originated envelope reaches the machine that owns it. */
  const toAgent = (envelope: Envelope): boolean => {
    const agent = registry.agent(envelope.machineId);
    if (!agent) {
      return false;
    }
    agent.send(envelope);
    return true;
  };

  /** Set by the server once its recorder exists; called on every resolve. */
  let recordAnswer:
    | ((
        machineId: string,
        instanceId: string,
        requestId: string,
        result: PermissionResult
      ) => void)
    | undefined;
  /** Set by the server: the one path a message takes into a session. */
  let sendMessage: ((envelope: Envelope<SendPayload>) => boolean) | undefined;

  /**
   * Settles an ask: true when it reached its session or workflow, false when
   * its machine is offline, and the reason when a workflow question refused
   * the answer (it then stays open to be answered again).
   */
  const resolve = (
    envelope: Envelope,
    requestId: string,
    result: PermissionResult
  ): boolean | Error => {
    const request = envelope.payload as PermissionRequest;
    try {
      if (answerWorkflow(pending, requestId, result)) {
        settledHere.add(requestId);
        return true;
      }
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
    const payload: ControlPayload = {
      instanceId: request.instanceId,
      requestId,
      method: RESOLVE_PERMISSION,
      args: [requestId, result],
    };
    const reached = toAgent({
      verb: "control",
      machineId: envelope.machineId,
      instanceId: request.instanceId,
      requestId,
      payload,
    });
    if (!reached) {
      return false;
    }
    // The control went straight down the agent socket, past the server's own
    // recording sites — file the answer here or a Telegram-settled delegate
    // ask stays `pending` forever.
    recordAnswer?.(envelope.machineId, request.instanceId, requestId, result);
    settledHere.add(requestId);
    pending.resolve(requestId);
    return true;
  };

  /** The owner typing here is the human the SDK gates on, so the turn says so. */
  const talkBack = (
    entry: Tracked,
    text: string,
    carried?: Extract<Intake, { kind: "media" }>
  ): boolean => {
    const payload: SendPayload = {
      instanceId: entry.instanceId,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
      ...(carried?.images && { images: carried.images }),
      ...(carried?.attachments && { attachments: carried.attachments }),
    };
    return (
      sendMessage?.({
        verb: "send",
        machineId: entry.machineId,
        instanceId: entry.instanceId,
        payload,
      }) ?? false
    );
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds the ask's message, buttons and tracking entry from one permission request in a single pass
  const onAsk = (envelope: Envelope): void => {
    if (chatId === undefined || !envelope.requestId) {
      return;
    }
    const request = envelope.payload as PermissionRequest;
    const { requestId } = envelope;
    const lines = [header(request.instanceId, "❓")];
    let buttons: InlineButton[][] | undefined;

    const questions = questionsOf(request);
    if (questions && questions.length === 1) {
      const [question] = questions;
      lines.push("", esc(clip(question.question, 1200)));
      if (question.multiSelect) {
        lines.push("", "<i>(multi-select — full control in the dashboard)</i>");
      }
      buttons = question.options.map((option, index) => [
        {
          text: clip(option.label, 60),
          callback_data: `q:${requestId}:${index}`,
        },
      ]);
    } else if (questions) {
      // Several questions at once is more than three buttons can settle, and a
      // partial answer runs the tool as if the rest were skipped.
      for (const question of questions) {
        lines.push("", `<b>${esc(clip(question.question, 400))}</b>`);
        for (const option of question.options) {
          lines.push(`• ${esc(clip(option.label, 200))}`);
        }
      }
      lines.push(
        "",
        `Answer in the dashboard → ${esc(dashboardUrl(registry))}/session/${request.instanceId}`
      );
    } else {
      lines.push("", `<b>${esc(request.toolName)}</b>`);
      const detail = glance(request.input);
      if (detail) {
        lines.push(`<code>${esc(clip(detail, 900))}</code>`);
      }
      buttons = [
        [
          { text: "Allow", callback_data: `p:${requestId}:a` },
          ...(request.suggestions?.length
            ? [{ text: "Always allow", callback_data: `p:${requestId}:w` }]
            : []),
          { text: "Deny", callback_data: `p:${requestId}:d` },
        ],
      ];
    }

    const text = fit(lines);
    // biome-ignore lint/complexity/noVoid: fire-and-forget; onAsk has nothing to return to and a failed send is not this handler's business
    void send(text, buttons).then((message) => {
      if (!message) {
        return;
      }
      track(message.message_id, {
        instanceId: request.instanceId,
        machineId: envelope.machineId,
        // A multi-question ask keeps no `requestId`: nothing sent from here can
        // settle it, so a reply to it should talk to the session instead.
        ...(buttons && { requestId }),
        text,
      });
    });
  };

  const onSettled = (requestId: string): void => {
    if (settledHere.delete(requestId)) {
      return;
    }
    if (!asked.has(requestId)) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: fire-and-forget; onSettled has nothing to return to and a failed close is not this handler's business
    void close(requestId, "☑️ Answered in the dashboard");
  };

  const onError = (instanceId: string, message: string): void => {
    if (chatId === undefined) {
      return;
    }
    const row = db
      .listInstances()
      .find((instance) => instance.id === instanceId);
    if (!row) {
      return;
    }
    const text = fit([
      `${header(instanceId, "💥")} — <code>${esc(clip(message, 900))}</code>`,
    ]);
    // biome-ignore lint/complexity/noVoid: fire-and-forget; onError has nothing to return to and a failed send is not this handler's business
    void send(text).then((sent) => {
      if (sent) {
        track(sent.message_id, { instanceId, machineId: row.machineId, text });
      }
    });
  };

  const onSupervisor = (instanceId: string, message: string): void => {
    if (chatId === undefined) {
      return;
    }
    const row = db
      .listInstances()
      .find((instance) => instance.id === instanceId);
    if (!row) {
      return;
    }
    const lines = [
      `${header(instanceId, "🤖")}`,
      `<code>${esc(clip(message, 900))}</code>`,
      `→ ${esc(dashboardUrl(registry))}/session/${instanceId}`,
    ];
    const text = fit(lines);
    // biome-ignore lint/complexity/noVoid: fire-and-forget; onSupervisor has nothing to return to and a failed send is not this handler's business
    void send(text).then((sent) => {
      if (sent) {
        track(sent.message_id, { instanceId, machineId: row.machineId, text });
      }
    });
  };

  const onUserMessage = (envelope: Envelope): void => {
    if (chatId === undefined) {
      return;
    }
    const {
      instanceId,
      text: raw,
      attachments,
    } = envelope.payload as UserMessage;
    const text = esc(clip(raw, MESSAGE_LIMIT));
    // biome-ignore lint/complexity/noVoid: fire-and-forget; onUserMessage has nothing to return to and a failed send is not this handler's business
    void send(text)
      .then((sent) => {
        if (sent) {
          track(sent.message_id, {
            instanceId,
            machineId: envelope.machineId,
            text,
          });
        }
      })
      .then(() =>
        // After the words, in order: each attachment is its own message.
        (attachments ?? []).reduce<Promise<unknown>>(
          (chain, path) =>
            chain.then(() =>
              deliverAttachment(envelope.machineId, instanceId, path)
            ),
          Promise.resolve()
        )
      );
  };

  const onCallback = async (
    query: NonNullable<TelegramUpdate["callback_query"]>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parses the callback tag, acks Telegram first, then routes permission/allow-always/deny through their settlement and message-edit paths
  ): Promise<void> => {
    const [tag, requestId, arg] = (query.data ?? "").split(":");
    const envelope = requestId ? pending.get(requestId) : undefined;
    // Answered before anything is awaited: Telegram spins the button until the
    // callback is acknowledged, and a resolve is slower than a map read.
    await call("answerCallbackQuery", {
      callback_query_id: query.id,
      ...(envelope ? {} : { text: "Already answered elsewhere" }),
    });
    if (!requestId) {
      return;
    }
    if (!envelope) {
      await close(requestId, "☑️ Answered in the dashboard");
      return;
    }

    const request = envelope.payload as PermissionRequest;
    let result: PermissionResult | undefined;
    if (tag === "p") {
      if (arg === "d") {
        result = { behavior: "deny", message: "User denied permission" };
      } else {
        result = {
          behavior: "allow",
          updatedInput: request.input,
          ...(arg === "w" && { updatedPermissions: request.suggestions }),
        };
      }
    } else if (tag === "q") {
      const [question] = questionsOf(request) ?? [];
      const option = question?.options[Number(arg)];
      if (!(question && option)) {
        return;
      }
      const answers: UserAnswers = {
        [question.question]: question.multiSelect
          ? [option.label]
          : option.label,
      };
      result = {
        behavior: "allow",
        updatedInput: { ...request.input, answers },
      };
    }
    if (!result) {
      return;
    }

    const settled = resolve(envelope, requestId, result);
    if (settled instanceof Error) {
      await send(`⚠️ ${esc(settled.message)}`);
      return;
    }
    if (!settled) {
      await close(requestId, "⚠️ That machine is offline");
      return;
    }
    await close(
      requestId,
      result.behavior === "deny"
        ? "⛔ Denied via Telegram"
        : "✅ Allowed via Telegram"
    );
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: routes one incoming Telegram message across reply-to-ask, media intake, and plain-text-to-session paths
  const onMessage = async (message: TelegramMessage): Promise<void> => {
    const typed = message.text?.trim();
    if (!(typed || carriesMedia(message))) {
      return;
    }

    const repliedTo = message.reply_to_message?.message_id;
    const entry = repliedTo === undefined ? undefined : tracked.get(repliedTo);
    if (!entry) {
      await send(
        "Reply to one of my messages: to an open ask to answer it, to any other to type into that session."
      );
      return;
    }

    // Fetched only once there is somewhere for it to go — a voice note nobody
    // replied to is not worth waking a model for.
    const carried = await media.intake(message);
    if (carried?.kind === "refused") {
      await send(esc(carried.reason));
      return;
    }
    // What the turn says, which media speaks for: a transcript, or the caption
    // that came with the picture.
    const text = carried ? carried.text : (typed ?? "");
    const attached = carried?.kind === "media" ? carried : undefined;
    /** What was heard, so the reader can see it rather than trust it. */
    const heard =
      carried?.kind === "text"
        ? `🎤 <i>"${esc(clip(carried.transcript, 200))}"</i>\n`
        : "";

    const open = entry.requestId ? pending.get(entry.requestId) : undefined;
    // Nothing but words settles an ask. An image is for the session to look at,
    // so it goes there and the ask is left standing.
    if (entry.requestId && open && !attached) {
      const request = open.payload as PermissionRequest;
      const [question] = questionsOf(request) ?? [];
      const result: PermissionResult = question
        ? {
            behavior: "allow",
            updatedInput: {
              ...request.input,
              answers: {
                [question.question]: question.multiSelect ? [text] : text,
              },
            },
          }
        : // The reader's own words, which is what a denial is for: the model is
          // told why, not merely that it was refused.
          { behavior: "deny", message: text };
      const settled = resolve(open, entry.requestId, result);
      if (settled instanceof Error) {
        await send(`${heard}⚠️ ${esc(settled.message)}`);
        return;
      }
      if (!settled) {
        await close(entry.requestId, `${heard}⚠️ That machine is offline`);
        return;
      }
      await close(
        entry.requestId,
        `${heard}${result.behavior === "deny" ? "⛔ Denied via Telegram" : "✅ Allowed via Telegram"}`
      );
      return;
    }

    if (!talkBack(entry, text, attached)) {
      await send("That machine is offline.");
      return;
    }
    const note = `${heard}→ sent${open ? " — answer that ask with text or a button" : ""}`;
    const sent = await send(note);
    if (sent) {
      track(sent.message_id, {
        instanceId: entry.instanceId,
        machineId: entry.machineId,
        text: note,
      });
    }
  };

  const onUpdate = async (update: TelegramUpdate): Promise<void> => {
    const chat =
      update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (chatId === undefined) {
      // First contact pins the chat. Whoever reaches the bot first owns the
      // fleet, which is the same trust the token itself carries.
      if (typeof chat !== "number" || !update.message) {
        return;
      }
      chatId = chat;
      db.putCredential(CREDENTIAL_ID, { chatId: chat });
      console.log(`[telegram] pinned to chat ${chat}`);
      await send("This chat now runs your fleet. Asks will land here.");
      return;
    }
    if (chat !== chatId) {
      return;
    }
    if (update.callback_query) {
      await onCallback(update.callback_query);
    } else if (update.message) {
      await onMessage(update.message);
    }
  };

  const start = (): void => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the poll loop below runs for the process's whole life and reports its own failures via console.warn
    void (async () => {
      let offset = 0;
      let backoff = BACKOFF_FLOOR_MS;
      console.log(
        `[telegram] bridge on${chatId === undefined ? " — waiting to be pinned" : ""}`
      );
      for (;;) {
        try {
          const updates =
            // biome-ignore lint/performance/noAwaitInLoops: long-polls Telegram in an infinite loop; the next getUpdates must start from the offset the previous one returned
            (await call<TelegramUpdate[]>("getUpdates", {
              offset,
              timeout: POLL_SECONDS,
            })) ?? [];
          backoff = BACKOFF_FLOOR_MS;
          for (const update of updates) {
            offset = update.update_id + 1;
            // biome-ignore lint/performance/noAwaitInLoops: updates must be handled in Telegram's own order — offset only advances after each one settles
            await onUpdate(update);
          }
        } catch (error) {
          console.warn(
            `[telegram] poll failed, retrying in ${backoff}ms:`,
            error
          );
          await new Promise<void>((wake) => setTimeout(wake, backoff).unref());
          backoff = Math.min(backoff * 2, BACKOFF_CEILING_MS);
        }
      }
    })();
  };

  return {
    onAsk,
    onSettled,
    onError,
    onSupervisor,
    onUserMessage,
    start,
    setAnswerRecorder(record) {
      recordAnswer = record;
    },
    setImageReader(read) {
      readImage = read;
    },
    setSender(deliver) {
      sendMessage = deliver;
    },
  };
};
