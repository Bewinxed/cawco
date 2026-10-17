/**
 * The person's own CLI commands (`cawco connections`, `cawco relay`, `cawco
 * jev`) acting as the person (hub hub-auth.ts). A hub that trusts its
 * network takes them as they are. One that requires paired devices refuses
 * them, and the command asks once per run, in RFC 8628's shape: it prints a
 * code, the person approves it on a paired device (Needs you), and the
 * command goes on with the token it was handed.
 *
 * The token is held in this process alone and dies with it: never written to
 * disk, where any process running as this user, a session's among them,
 * could read it. The hub keeps it for a quarter of an hour, in memory.
 */
import type { PairingPoll, PairingStart } from "@cawco/core";
import { OWNER_SCHEME } from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";

/** This run's approval, once the person gave it. */
let token: string | undefined;

/** Thrown when the person did not approve the command: a sentence for them. */
export class OwnerApprovalError extends Error {}

const withToken = (init: RequestInit): RequestInit => {
  if (!token) {
    return init;
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `${OWNER_SCHEME} ${token}`);
  return { ...init, headers };
};

/** How long one request of an approval is given to answer. */
const PAIR_ANSWER_MS = 15_000;

/** Asks the person to approve this run of `command`, and waits for the answer. */
const approve = async (origin: string, command: string): Promise<string> => {
  const started = await readWithin(PAIR_ANSWER_MS, async (signal) => {
    const response = await fetch(`${origin}/api/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "cli", name: command }),
      signal,
    });
    return response.ok
      ? { ok: true as const, pairing: (await response.json()) as PairingStart }
      : {
          ok: false as const,
          status: response.status,
          said: (await response.text()).slice(0, 300),
        };
  });
  let pairing: PairingStart;
  switch (started.kind) {
    case "unanswered":
      throw new OwnerApprovalError(
        `${origin} did not answer within ${Math.round(started.after / 1000)}s when asked to start an approval; nothing was sent.`
      );
    case "answered":
      if (!started.value.ok) {
        throw new OwnerApprovalError(
          `${origin} did not start an approval (${started.value.status}): ${started.value.said}`
        );
      }
      ({ pairing } = started.value);
      break;
    default: {
      const unhandled: never = started;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
  console.error(
    `This hub requires paired devices. Approve code ${pairing.userCode} on a paired device (Needs you) to run ${command}. Waiting…`
  );
  let interval = pairing.interval * 1000;
  const deadline = Date.now() + pairing.expiresIn * 1000;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: RFC 8628 §3.5: each poll waits its interval after the one before
    await Bun.sleep(interval);
    const polled = await readWithin(PAIR_ANSWER_MS, async (signal) => {
      const response = await fetch(`${origin}/api/pair/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: pairing.deviceCode }),
        signal,
      });
      return (await response.json()) as PairingPoll & { token?: string };
    });
    let answer: PairingPoll & { token?: string };
    switch (polled.kind) {
      case "unanswered":
        // The approval is still the person's to give: the next poll asks again.
        continue;
      case "answered":
        answer = polled.value;
        break;
      default: {
        const unhandled: never = polled;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    if (answer.status === "approved" && answer.token) {
      return answer.token;
    }
    if (answer.status === "access_denied") {
      throw new OwnerApprovalError(
        `The person denied ${command} (code ${pairing.userCode}); nothing was sent.`
      );
    }
    if (answer.status === "expired_token") {
      break;
    }
    if (answer.status === "slow_down") {
      interval += 5000;
    }
  }
  throw new OwnerApprovalError(
    `Nobody approved ${command} (code ${pairing.userCode}) in time; nothing was sent. Run it again to ask again.`
  );
};

/** What an owner request's answer said: its status and its body as text. */
export interface OwnerAnswer {
  ok: boolean;
  /** The hub said it requires paired devices. */
  pairing: boolean;
  said: string;
  status: number;
}

/**
 * `fetch` as the person: as it is first, and once more with this run's
 * approval when the hub says it requires paired devices. Each request, its
 * body read with it, is given `ms` to answer; the person's approval in
 * between is not. `init.body` must be one the second try can send again (a
 * string).
 */
export const ownerFetch = async (
  url: string,
  init: RequestInit,
  command: string,
  ms: number
): Promise<Bounded<OwnerAnswer>> => {
  const send = () =>
    readWithin(ms, async (signal): Promise<OwnerAnswer> => {
      const response = await fetch(url, { ...withToken(init), signal });
      return {
        ok: response.ok,
        status: response.status,
        pairing: response.headers.get("x-cawco-pairing") === "required",
        said: await response.text(),
      };
    });
  const first = await send();
  switch (first.kind) {
    case "unanswered":
      return first;
    case "answered":
      if (!(first.value.status === 401 && first.value.pairing)) {
        return first;
      }
      token = await approve(new URL(url).origin, command);
      return send();
    default: {
      const unhandled: never = first;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};
