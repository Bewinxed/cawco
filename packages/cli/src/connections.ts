/**
 * `cawco connections set-key <name>`: gives a connection its key, from the
 * owner's own terminal straight to the hub that holds it (Projects spec
 * §5.5). A key never passes through a session, so it lands in no transcript:
 * the hub's `admin_connections_write` tells a session to have this run
 * instead of taking a key itself.
 *
 * The key is read with nothing echoed when the terminal is a TTY, or whole
 * from stdin when it is piped (`pbpaste | cawco connections set-key x-brand`),
 * and sent to `PUT /api/connections/<name>/key` on the hub this machine finds,
 * as the CLI's other hub calls are. What is printed is the name, the key's
 * length and the connection's state; never the key.
 */
import {
  CAWCO_ENV,
  CONNECTION_NAME,
  type ConnectionView,
  readEnv,
} from "@cawco/core";
import { OwnerApprovalError, ownerFetch } from "./owner";

export class ConnectionKeyError extends Error {}

const ENTER = new Set(["\r", "\n"]);
const ERASE = new Set(["\x7f", "\b"]);
const INTERRUPT = "\x03";
const END_OF_INPUT = "\x04";
/** The first printable character: what sorts below it is a terminal's control, never a key's. */
const FIRST_PRINTABLE = 0x20;
const TRAILING_NEWLINES = /[\r\n]+$/;

/** One keystroke on the key typed so far: the key it leaves, or that typing ended or was cancelled. */
const keystroke = (
  key: string,
  character: string
): { key: string } | "ended" | "cancelled" => {
  if (character === INTERRUPT) {
    return "cancelled";
  }
  if (ENTER.has(character) || character === END_OF_INPUT) {
    return "ended";
  }
  if (ERASE.has(character)) {
    return { key: key.slice(0, -1) };
  }
  return {
    key:
      (character.codePointAt(0) ?? 0) >= FIRST_PRINTABLE
        ? key + character
        : key,
  };
};

/** A secret typed at the terminal after `prompt`, echoing nothing; refused when it is interrupted. */
export const typedKey = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const input = process.stdin;
    process.stderr.write(prompt);
    let key = "";
    const done = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      process.stderr.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        const next = keystroke(key, character);
        if (next === "cancelled") {
          done(new ConnectionKeyError("cancelled; no key was sent"));
          return;
        }
        if (next === "ended") {
          done();
          return;
        }
        ({ key } = next);
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });

/** The key piped in, its trailing newline dropped. */
export const pipedKey = async (): Promise<string> =>
  (await Bun.stdin.text()).replace(TRAILING_NEWLINES, "");

/**
 * Reads the key and sets it on the hub at `hub` (its http base). Answers the
 * lines to print and whether the connection then reads signed in.
 */
export const setConnectionKey = async (
  hub: string,
  name: string | undefined
): Promise<{ lines: string[]; signedIn: boolean }> => {
  if (!(name && CONNECTION_NAME.test(name))) {
    throw new ConnectionKeyError(
      "connections set-key needs a connection's name, like github-petra"
    );
  }
  // A key typed into a session's shell passes through the session, which is
  // the one place it must never be.
  if (readEnv(CAWCO_ENV.instanceId) || readEnv(CAWCO_ENV.sessionCredential)) {
    throw new ConnectionKeyError(
      "connections set-key runs in your own terminal, never inside a CawCo session: a key that passes through a session can land in its transcript"
    );
  }
  const key = (
    process.stdin.isTTY
      ? await typedKey(`Key for ${name} (not shown): `)
      : await pipedKey()
  ).trim();
  if (!key) {
    throw new ConnectionKeyError("no key was given; nothing was sent");
  }
  const answer = await ownerFetch(
    `${hub}/api/connections/${encodeURIComponent(name)}/key`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    },
    `cawco connections ${name}`,
    90_000
  ).catch((error: unknown) => {
    if (error instanceof OwnerApprovalError) {
      throw new ConnectionKeyError(error.message);
    }
    throw new ConnectionKeyError(
      `${hub} could not be reached: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  switch (answer.kind) {
    case "unanswered":
      throw new ConnectionKeyError(
        `${hub} did not answer within ${Math.round(answer.after / 1000)}s, so whether it took the key for ${name} is not known. Run this again to set it.`
      );
    case "answered":
      break;
    default: {
      const unhandled: never = answer;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
  const response = answer.value;
  const { said } = response;
  if (!response.ok) {
    throw new ConnectionKeyError(
      `${hub} refused the key for ${name} (${response.status}): ${said.slice(0, 300)}`
    );
  }
  const view = JSON.parse(said) as ConnectionView;
  return {
    lines: [
      `Key set for ${name} (${key.length} characters)`,
      `State: ${view.state}${view.reason ? ` (${view.reason})` : ""}`,
    ],
    signedIn: view.state === "signed-in",
  };
};
