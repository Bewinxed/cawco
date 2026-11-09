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

import {
  dataOf,
  type HubClient,
  hubClient,
  reached,
  refusalText,
  unwrap,
} from "@cawco/agent/hub-client";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import type { PairingPoll, PairingStart } from "@cawco/core/hub-auth";
import { OWNER_SCHEME } from "@cawco/core/hub-auth";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";

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
    const answer = reached(
      await hubClient(origin, (url, init) =>
        fetch(url, { ...init, signal })
      ).api.pair.post({ kind: "cli", name: command })
    );
    return answer.error === null
      ? { ok: true as const, pairing: dataOf(answer) }
      : {
          ok: false as const,
          status: answer.status,
          said: refusalText({
            status: answer.status,
            value: answer.error.value,
          }).slice(0, 300),
        };
  });
  let pairing: PairingStart;
  switch (started.kind) {
    case "unanswered":
      throw new OwnerApprovalError(
        `${origin} did not answer within ${secondsOf(started.after)}s when asked to start an approval; nothing was sent.`
      );
    case "answered":
      if (!started.value.ok) {
        throw new OwnerApprovalError(
          `${origin} did not start an approval (${started.value.status}): ${started.value.said}`
        );
      }
      ({ pairing } = started.value);
      break;
    default:
      unhandled("read", started);
  }
  console.error(
    `This hub requires paired devices. Approve code ${pairing.userCode} on a paired device (Needs you) to run ${command}. Waiting…`
  );
  let interval = pairing.interval * 1000;
  const deadline = Date.now() + pairing.expiresIn * 1000;
  while (Date.now() < deadline) {
    await Bun.sleep(interval);
    const polled = await readWithin(PAIR_ANSWER_MS, async (signal) => {
      const answer = await hubClient(origin, (url, init) =>
        fetch(url, { ...init, signal })
      ).api.pair.poll.post({ deviceCode: pairing.deviceCode });
      return unwrap(
        answer,
        ({ status }) =>
          new OwnerApprovalError(
            `${origin} did not read the approval (${status})`
          )
      );
    });
    let answer: PairingPoll & { token?: string };
    switch (polled.kind) {
      case "unanswered":
        // The approval is still the person's to give: the next poll asks again.
        continue;
      case "answered":
        answer = polled.value;
        break;
      default:
        unhandled("read", polled);
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
  contentType: string;
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
        contentType: response.headers.get("content-type") ?? "",
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
    default:
      unhandled("read", first);
  }
};

/** `answer` as the response Eden reads (a 204's body is none). */
export const ownerResponse = (answer: OwnerAnswer): Response =>
  new Response(answer.said || null, {
    status: answer.status,
    headers: { "content-type": answer.contentType },
  });

/**
 * The hub at `hub` (its http base) as the person, for a command that stops on
 * any failure: the person's no, a hub that could not be reached and one that
 * did not answer each throw a `Fail` with a sentence for the person;
 * `unanswered` says the last from the seconds waited.
 */
export const ownerClient = (
  hub: string,
  command: string,
  ms: number,
  Fail: new (message: string) => Error,
  unanswered: (seconds: number) => string
): HubClient =>
  hubClient(hub, async (url, init) => {
    const answer = await ownerFetch(url, init, command, ms).catch(
      (error: unknown) => {
        if (error instanceof OwnerApprovalError) {
          throw new Fail(error.message);
        }
        throw new Fail(
          `${hub} could not be reached: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    );
    switch (answer.kind) {
      case "unanswered":
        throw new Fail(unanswered(secondsOf(answer.after)));
      case "answered":
        return ownerResponse(answer.value);
      default:
        unhandled("read", answer);
    }
  });
