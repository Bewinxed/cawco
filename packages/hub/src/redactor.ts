/**
 * THE ONE REDACTOR. Nothing the hub holds reaches a browser, an app, or
 * another session through a send but what passed here: every function that
 * sends to a client socket (wire-socket.ts `sendToClient`), broadcasts
 * (registry.ts), files a frame in a session's replay ring or fans it out
 * (stream.ts `sequence`, `planToFollowers`), relays an ask to a parent
 * session (ask-routing.ts `deliverDelegateAsk`) or pushes one to a phone
 * (push.ts `onAsk`) takes a {@link Redacted} value, and this module is the
 * only one that makes one. `bun run check` fails on a cast to the brand, or a
 * guard that answers it, anywhere else (scripts/lint/redacted-brand.grit), so
 * a value of the type has been through the rules below.
 *
 * What each kind of value loses on the way out:
 *
 * - **An ask** (a `permission_request`, as a `ParkedAsk` or inside any
 *   frame): its tool input with every value core `redact` reads as a
 *   credential replaced by `(hidden)`, as its card shows it, and a connector
 *   write's `config.url` cut to its open part. The pending ledger keeps the
 *   original, and ask-presentation.ts `answeredWithOriginal` puts it back on
 *   the way in, so an Approve runs the call as it was asked. A question is
 *   left whole: its answer is written into its input.
 * - **A problem's words**: an `error` frame's `message`, a `control_result`'s
 *   `error`, a failed `command.ack`'s `reason`, and the `detail` of every
 *   problem an HTTP route answers ({@link redactProblemDetail}), through
 *   secret-filter.ts `redactCredentialsNow`: a problem can quote a command
 *   line.
 * - **Anything else** (a transcript line, a tool result, the board, a plan,
 *   a notice) passes whole: the machine that sent it already replaced every
 *   CawCo credential in it (agent redaction.ts `outbound`), and the hub's own
 *   frames carry none. It still passes here, so there is one door.
 *
 * A command to a machine (wire-socket.ts `sendToMachine`) is not redacted
 * and never comes here: a machine runs it, keys and the call as asked
 * included.
 */
import { openUrl } from "@cawco/core/fleet-secrets";
import type { ParkedAsk } from "@cawco/core/frames";
import { redact } from "@cawco/core/permission-presentation";
import type { Envelope } from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import { ElysiaStatus } from "elysia";
import { redactCredentialsNow } from "./secret-filter";

declare const REDACTED: unique symbol;

/**
 * A value that went through this module (see the module): what every send,
 * broadcast, relay and push takes. On the wire it is the value itself: the
 * brand is the compiler's alone.
 */
export type Redacted<T> = T & { readonly [REDACTED]: true };

/** What leaves for a client: an envelope, a `{ type }` message, or a session stream frame. */
export type ClientFrame =
  Envelope | { readonly type: string } | { readonly kind: string };

/** The brand's one maker: `value` has been through the rules of this module. */
const passed = <T>(value: T): Redacted<T> => value as Redacted<T>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const MCP_SERVERS_WRITE = /^(?:mcp__cawco__|cawco_)?admin_mcp_servers_write$/u;

/** A connector write's `config.url` with its secret parts cut, as every read says it. */
const withOpenUrl = (
  input: Record<string, unknown>
): Record<string, unknown> => {
  const { config } = input;
  if (!(isRecord(config) && typeof config.url === "string")) {
    return input;
  }
  return { ...input, config: { ...config, url: openUrl(config.url) } };
};

/** A tool call's input as a card shows it (module: an ask); a question's whole. */
const hiddenInput = (
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> => {
  if (questionsOf(toolName, input)) {
    return input;
  }
  const hidden = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, redact(key, value)])
  );
  return MCP_SERVERS_WRITE.test(toolName) ? withOpenUrl(hidden) : hidden;
};

/** A parked ask as it leaves the hub for a client, a phone or a parent session (module: an ask). */
export const redactedAsk = (ask: ParkedAsk): Redacted<ParkedAsk> =>
  passed({
    ...ask,
    payload: {
      ...ask.payload,
      input: hiddenInput(ask.payload.toolName, ask.payload.input),
    },
  });

/** `field` of `body` through the problem pass, when it is words. */
const wordsCut = <T extends Record<string, unknown>>(
  body: T,
  field: string
): T => {
  const words = body[field];
  if (typeof words !== "string") {
    return body;
  }
  const cut = redactCredentialsNow(words);
  return cut === words ? body : { ...body, [field]: cut };
};

/**
 * A frame payload (a `kind`) as it leaves: an ask's input hidden, a
 * problem's words cut (module), anything else as it is.
 */
const payloadOut = <T>(payload: T): T => {
  if (!isRecord(payload)) {
    return payload;
  }
  switch (payload.kind) {
    case "permission_request":
      return typeof payload.toolName === "string" && isRecord(payload.input)
        ? { ...payload, input: hiddenInput(payload.toolName, payload.input) }
        : payload;
    case "error":
      return wordsCut(payload, "message");
    case "control_result":
      return wordsCut(payload, "error");
    default:
      return payload;
  }
};

/**
 * Any frame as it leaves the hub for a client (module): an envelope by its
 * payload, a session stream frame by its own `kind`, a `{ type }` message
 * (a failed command's `reason`) by its fields.
 */
export const redactedFrame = <T extends ClientFrame>(frame: T): Redacted<T> => {
  if ("payload" in frame) {
    const payload = payloadOut(frame.payload);
    // A copy only when something was cut: this runs on every frame.
    return passed(payload === frame.payload ? frame : { ...frame, payload });
  }
  if ("kind" in frame) {
    return passed(payloadOut(frame));
  }
  return passed(
    frame.type === "command.ack" && isRecord(frame)
      ? wordsCut(frame, "reason")
      : frame
  );
};

/**
 * Elysia's `mapResponse` (and the hub's `onError`, server.ts) for every
 * answer: a problem's `detail` through the problem pass (module) in place,
 * before Elysia writes it. Any other answer is left as it is.
 */
export const redactProblemDetail = ({
  responseValue,
}: {
  responseValue: unknown;
}): undefined => {
  const response: unknown =
    responseValue instanceof ElysiaStatus ? responseValue.response : undefined;
  if (isRecord(response) && typeof response.detail === "string") {
    response.detail = redactCredentialsNow(response.detail);
  }
};
