/**
 * The person's own CLI commands (`cawco connections`, `cawco relay`, `cawco
 * jev`) acting as the person (hub hub-auth.ts). A hub that trusts its
 * network takes them as they are. One that requires paired devices refuses
 * them, and the command asks once per run, in RFC 8628's shape: it prints a
 * code, the person approves it on a paired device (Needs you) or in Telegram,
 * and the command goes on with the token it was handed.
 *
 * The token is held in this process alone and dies with it: never written to
 * disk, where any process running as this user, a session's among them,
 * could read it. The hub keeps it for a quarter of an hour, in memory.
 */
import type { PairingPoll, PairingStart } from "@cawco/core";
import { OWNER_SCHEME } from "@cawco/core";

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

/** Asks the person to approve this run of `command`, and waits for the answer. */
const approve = async (origin: string, command: string): Promise<string> => {
  const started = await fetch(`${origin}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "cli", name: command }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!started.ok) {
    throw new OwnerApprovalError(
      `${origin} did not start an approval (${started.status}): ${(await started.text()).slice(0, 300)}`
    );
  }
  const pairing = (await started.json()) as PairingStart;
  console.error(
    `This hub requires paired devices. Approve code ${pairing.userCode} on a paired device (Needs you) or in Telegram to run ${command}. Waiting…`
  );
  let interval = pairing.interval * 1000;
  const deadline = Date.now() + pairing.expiresIn * 1000;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: RFC 8628 §3.5: each poll waits its interval after the one before
    await Bun.sleep(interval);
    const answer = (await fetch(`${origin}/api/pair/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode: pairing.deviceCode }),
      signal: AbortSignal.timeout(15_000),
    }).then((response) => response.json())) as PairingPoll & {
      token?: string;
    };
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

/**
 * `fetch` as the person: as it is first, and once more with this run's
 * approval when the hub says it requires paired devices. `init.body` must
 * be one the second try can send again (a string).
 */
export const ownerFetch = async (
  url: string,
  init: RequestInit,
  command: string
): Promise<Response> => {
  const first = await fetch(url, withToken(init));
  if (!(
    first.status === 401 && first.headers.get("x-cawco-pairing") === "required"
  )) {
    return first;
  }
  await first.body?.cancel();
  token = await approve(new URL(url).origin, command);
  return fetch(url, withToken(init));
};
