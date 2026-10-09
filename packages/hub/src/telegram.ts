import { hostname } from "node:os";
import type {
  Envelope,
  FramePayload,
  PermissionResult,
  SendPayload,
  UserAnswers,
  UserQuestion,
} from "@cawco/core";
import {
  questionsOf as askedIn,
  CAWCO_ENV,
  changeStat,
  commandOf,
  readEnv,
} from "@cawco/core";
import { detach, failureOf } from "@cawco/core/detach";
import type { DbShape } from "./db";
import { sessionLabel } from "./labels";
import type { HubLifetimeShape } from "./lifetime";
import type { PendingShape } from "./pending";
import { answerPermission } from "./pending";
import type { RegistryShape } from "./registry";
import type { Intake, TelegramMedia } from "./telegram-media";
import { carriesMedia, createMediaIntake } from "./telegram-media";

/** The parked ask, as the bridge reads it out of the envelope the hub kept. */
type PermissionRequest = Extract<FramePayload, { kind: "permission_request" }>;

/** A session's message to the owner, off the envelope the hub handed over. */
type UserMessage = Extract<FramePayload, { kind: "user_message" }>;

export interface TelegramBridge {
  /**
   * `send_to_user`: the words, then each attachment, in order. Answers with
   * what did not reach the chat and why, one line each; empty when all did.
   */
  readonly deliver: (
    machineId: string,
    instanceId: string,
    text: string,
    attachments: string[]
  ) => Promise<string[]>;
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
   * The server's machine-media reader, registered after construction like
   * {@link setSender}: a `send_to_user` attachment is a path on the
   * session's machine, and only the server holds the tunnel that reads it.
   */
  readonly setMediaReader: (read: MediaReader) => void;
  /**
   * The server's one send path, registered after construction like
   * {@link setMediaReader}: a reply typed here is a message sent to the
   * session like any other — recorded, streamed, and the reader's hand on the
   * session to the supervisor — and only the server does those. True when the
   * machine took it.
   */
  readonly setSender: (
    send: (envelope: Envelope<SendPayload>) => boolean
  ) => void;
  readonly start: () => void;
}

export type MediaReader = (
  machineId: string,
  path: string
) => Promise<
  | { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
  | "offline"
  | "timeout"
  | { refused: string }
>;

/**
 * Bot API `sendPhoto`: "The photo must be at most 10 MB in size"; a bigger
 * picture goes as a document.
 */
const PHOTO_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * Which Bot API method carries a file, by its media type: a GIF as an
 * animation so it plays, a video as a video, any other picture as a photo.
 */
const uploadOf = (
  mediaType: string,
  size: number
): { method: string; field: string } | undefined => {
  if (mediaType === "image/gif") {
    return { method: "sendAnimation", field: "animation" };
  }
  if (mediaType.startsWith("video/")) {
    return { method: "sendVideo", field: "video" };
  }
  return size <= PHOTO_LIMIT_BYTES
    ? { method: "sendPhoto", field: "photo" }
    : undefined;
};

export interface TelegramServices {
  readonly db: DbShape;
  readonly lifetime: HubLifetimeShape;
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
export const dashboardUrl = (registry: RegistryShape): string =>
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

/** What a parked tool call is asking the reader, when it is asking rather than requesting permission (core's reading). */
const questionsOf = (request: PermissionRequest): UserQuestion[] | null =>
  askedIn(request.toolName, request.input);

/** How many of an ask's fields its message carries; the rest are in the app. */
const TELEGRAM_FIELDS = 3;

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
  lifetime,
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

  lifetime.every(SWEEP_INTERVAL_MS, () => {
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
  });
  /** Aborts every Telegram call in flight, the long poll among them, when the hub closes. */
  const closing = new AbortController();
  lifetime.onClose(() => closing.abort());

  /**
   * A transport failure, in words safe to log. The bot URL holds the token,
   * and a fetch error carries that URL in its other fields, so only the
   * error's name and message are read, with the token cut out of those too.
   */
  const failed = (what: string, error: unknown): void => {
    if (closing.signal.aborted) {
      return;
    }
    console.warn(
      `[telegram] ${what} failed: ${failureOf(error).replaceAll(token, "<token>")}`
    );
  };

  /**
   * One Bot API call. Never throws: a refusal and a transport failure both
   * answer `undefined`, each logged once here.
   */
  const call = async <T>(
    method: string,
    body: unknown
  ): Promise<T | undefined> => {
    let response: Response;
    let answer: { ok?: boolean; result?: T; description?: string };
    try {
      response = await fetch(`${API_BASE}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          AbortSignal.timeout(POLL_TIMEOUT_MS),
          closing.signal,
        ]),
      });
      answer = (await response.json()) as typeof answer;
    } catch (error) {
      failed(method, error);
      return undefined;
    }
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
    failed,
  });

  /** `call`, for a method that carries bytes: multipart, not JSON. Never throws. */
  const upload = async (
    method: string,
    form: FormData
  ): Promise<{ message: TelegramMessage } | { refused: string }> => {
    let response: Response;
    let answer: {
      ok?: boolean;
      result?: TelegramMessage;
      description?: string;
    };
    try {
      response = await fetch(`${API_BASE}/bot${token}/${method}`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(POLL_TIMEOUT_MS * 3),
      });
      answer = (await response.json()) as typeof answer;
    } catch (error) {
      failed(method, error);
      return { refused: `Telegram did not answer ${method}.` };
    }
    if (!(answer.ok && answer.result)) {
      const refused = `Telegram refused ${method}: ${answer.description ?? `HTTP ${response.status}`}`;
      console.warn(`[telegram] ${refused}`);
      return { refused };
    }
    return { message: answer.result };
  };

  let readMedia: MediaReader | undefined;

  /**
   * One attached picture or video, read off its machine now and pushed in the
   * form Telegram shows it: a GIF as an animation, a video as a video, a
   * picture as a photo. A photo or a video Telegram will not take in that form
   * (a photo's size or aspect ratio, a video format its clients do not play)
   * goes as a document. Answers with the message it made, or why it made none.
   */
  const sendAttachment = async (
    machineId: string,
    path: string
  ): Promise<{ message: TelegramMessage } | { refused: string }> => {
    if (chatId === undefined || !readMedia) {
      return { refused: "no Telegram chat is linked to this hub" };
    }
    const answer = await readMedia(machineId, path);
    if (typeof answer === "string") {
      return { refused: `could not be read (machine ${answer})` };
    }
    if ("refused" in answer) {
      return answer;
    }
    const name = path.split("/").pop() ?? "file";
    const form = (field: string): FormData => {
      const body = new FormData();
      body.set("chat_id", String(chatId));
      body.set(
        field,
        new Blob([answer.bytes], { type: answer.mediaType }),
        name
      );
      body.set("caption", clip(path, 1024));
      if (field === "video") {
        body.set("supports_streaming", "true");
      }
      return body;
    };
    const shown = uploadOf(answer.mediaType, answer.bytes.byteLength);
    const sent = shown && (await upload(shown.method, form(shown.field)));
    if (sent && ("message" in sent || shown.field === "animation")) {
      return sent;
    }
    return await upload("sendDocument", form("document"));
  };

  /**
   * Sends and tracks one attachment, so a reply to it reaches the session
   * that sent it. Answers with why it was not sent, or nothing when it was.
   */
  const deliverAttachment = async (
    machineId: string,
    instanceId: string,
    path: string
  ): Promise<string | undefined> => {
    try {
      const sent = await sendAttachment(machineId, path);
      if ("refused" in sent) {
        // The machine's reasons name the file already; Telegram's do not.
        return sent.refused.includes(path)
          ? sent.refused
          : `${path}: ${sent.refused}`;
      }
      track(sent.message.message_id, { instanceId, machineId, text: path });
      return undefined;
    } catch (error) {
      return `${path}: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  /** The words, then each attachment in order: what did not arrive, and why. */
  const deliver = async (
    machineId: string,
    instanceId: string,
    raw: string,
    attachments: string[]
  ): Promise<string[]> => {
    if (chatId === undefined) {
      return [
        "Nothing was sent: no Telegram chat is linked to this hub yet (the owner has not messaged the bot).",
      ];
    }
    const text = esc(clip(raw, MESSAGE_LIMIT));
    const sent = await send(text);
    const problems: string[] = [];
    if (sent) {
      track(sent.message_id, { instanceId, machineId, text });
    } else {
      problems.push("The message: Telegram refused sendMessage.");
    }
    for (const path of attachments) {
      // biome-ignore lint/performance/noAwaitInLoops: each attachment is its own message, in the order they were given
      const problem = await deliverAttachment(machineId, instanceId, path);
      if (problem) {
        problems.push(problem);
      }
    }
    return problems;
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

  /** Where a session is, in the words its reader knows it by: its row, by its key. */
  const header = (instanceId: string, mark: string): string => {
    const [row] = db.listedInstancesByIds([instanceId]);
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
    const parts = [`<b>${esc(sessionLabel(row).name)}</b>`, esc(machineLabel)];
    if (project) {
      parts.push(esc(project));
    }
    return `${mark} ${parts.join(" · ")}`;
  };

  /** Set by the server: the one path a message takes into a session. */
  let sendMessage: ((envelope: Envelope<SendPayload>) => boolean) | undefined;

  /**
   * Settles an ask: true when it reached its session or workflow, false when
   * its machine is offline, and the reason when a workflow question refused
   * the answer (it then stays open to be answered again).
   */
  const resolve = async (
    envelope: Envelope,
    requestId: string,
    result: PermissionResult
  ): Promise<boolean | Error> => {
    const request = envelope.payload as PermissionRequest;
    settledHere.add(requestId);
    try {
      await answerPermission(pending, request.instanceId, requestId, result);
      return true;
    } catch (error) {
      settledHere.delete(requestId);
      return error instanceof Error ? error : new Error(String(error));
    }
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
      // The card's own words (core permission-presentation.ts): what will
      // happen and to what, how much it changes, and who asks. The diff
      // itself stays in the app.
      const { presentation } = request;
      lines.push("", `<b>${esc(clip(presentation.summary, 600))}</b>`);
      if (presentation.changes.length > 0) {
        const stat = changeStat(presentation.changes);
        lines.push(
          esc(presentation.detail ? `${stat} · ${presentation.detail}` : stat)
        );
      } else if (presentation.detail) {
        lines.push(esc(presentation.detail));
      }
      const command = commandOf(request.input);
      if (command) {
        lines.push(`<code>${esc(clip(command, 900))}</code>`);
      }
      for (const field of presentation.fields.slice(0, TELEGRAM_FIELDS)) {
        lines.push(
          `${esc(field.key)}: <code>${esc(clip(field.value, 200))}</code>`
        );
      }
      lines.push(`<i>Asked by ${esc(presentation.asker)}</i>`);
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
    detach(
      send(text, buttons).then((message) => {
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
      }),
      "telegram ask"
    );
  };

  const onSettled = (requestId: string): void => {
    if (settledHere.delete(requestId)) {
      return;
    }
    if (!asked.has(requestId)) {
      return;
    }
    detach(close(requestId, "☑️ Answered in the dashboard"), "telegram settle");
  };

  const onError = (instanceId: string, message: string): void => {
    if (chatId === undefined) {
      return;
    }
    const [row] = db.listedInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    const text = fit([
      `${header(instanceId, "💥")} — <code>${esc(clip(message, 900))}</code>`,
    ]);
    detach(
      send(text).then((sent) => {
        if (sent) {
          track(sent.message_id, {
            instanceId,
            machineId: row.machineId,
            text,
          });
        }
      }),
      "telegram error"
    );
  };

  const onSupervisor = (instanceId: string, message: string): void => {
    if (chatId === undefined) {
      return;
    }
    const [row] = db.listedInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    const lines = [
      `${header(instanceId, "🤖")}`,
      `<code>${esc(clip(message, 900))}</code>`,
      `→ ${esc(dashboardUrl(registry))}/session/${instanceId}`,
    ];
    const text = fit(lines);
    detach(
      send(text).then((sent) => {
        if (sent) {
          track(sent.message_id, {
            instanceId,
            machineId: row.machineId,
            text,
          });
        }
      }),
      "telegram supervisor"
    );
  };

  const onUserMessage = (envelope: Envelope): void => {
    if (chatId === undefined) {
      return;
    }
    const { instanceId, text, attachments } = envelope.payload as UserMessage;
    detach(
      deliver(envelope.machineId, instanceId, text, attachments ?? []).then(
        (problems) => {
          for (const problem of problems) {
            console.warn(`[telegram] not sent for ${instanceId}: ${problem}`);
          }
        }
      ),
      "telegram message"
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
      ...(envelope ? {} : { text: "That request is no longer pending" }),
    });
    if (!requestId) {
      return;
    }
    if (!envelope) {
      await close(requestId, "☑️ That request is no longer pending");
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

    const settled = await resolve(envelope, requestId, result);
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
      const settled = await resolve(open, entry.requestId, result);
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

  /** Where the next `getUpdates` starts: one past the last update handled. */
  let offset = 0;

  /**
   * One `getUpdates` and the updates it brought, in Telegram's order. Answers
   * why the round failed, or nothing when it did not. A getUpdates that
   * answered nothing has had its reason logged by `call`, so that one
   * answers an empty reason.
   */
  const pollOnce = async (): Promise<string | undefined> => {
    try {
      const updates = await call<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: POLL_SECONDS,
      });
      if (!updates) {
        return "";
      }
      for (const update of updates) {
        offset = update.update_id + 1;
        // biome-ignore lint/performance/noAwaitInLoops: updates must be handled in Telegram's own order — offset only advances after each one settles
        await onUpdate(update);
      }
      return undefined;
    } catch (error) {
      return `: ${failureOf(error).replaceAll(token, "<token>")}`;
    }
  };

  const poll = async (): Promise<void> => {
    let backoff = BACKOFF_FLOOR_MS;
    console.log(
      `[telegram] bridge on${chatId === undefined ? " — waiting to be pinned" : ""}`
    );
    // Until the hub's lifetime closes: its close aborts the poll in flight.
    while (!lifetime.closed()) {
      // biome-ignore lint/performance/noAwaitInLoops: long-polls Telegram until the hub closes; the next getUpdates must start from the offset the previous one returned
      const failure = await pollOnce();
      if (failure === undefined) {
        backoff = BACKOFF_FLOOR_MS;
        continue;
      }
      if (lifetime.closed()) {
        return;
      }
      console.warn(
        `[telegram] poll failed, retrying in ${backoff}ms${failure}`
      );
      await lifetime.sleep(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_CEILING_MS);
    }
  };

  const start = (): void => {
    detach(poll(), "telegram poll");
  };

  return {
    onAsk,
    onSettled,
    onError,
    onSupervisor,
    onUserMessage,
    deliver,
    start,
    setMediaReader(read) {
      readMedia = read;
    },
    setSender(sender) {
      sendMessage = sender;
    },
  };
};
