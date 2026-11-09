/**
 * `cawco jev set-key` and `cawco jev remove-key`: the TypeSafe key the hub
 * reaches Jev with directly (PRD §5.9: "a Typesafe key held by the hub"),
 * from the owner's own terminal straight to the hub, as `cawco connections
 * set-key` gives a connection its key (connections.ts): typed unseen at a
 * TTY or piped whole on stdin, never on argv, and refused inside a session,
 * so it lands in no transcript. What is printed is the key's length, its
 * last four characters as the hub shows them, and the route Jev takes now;
 * never the key.
 */

import {
  type HubAnswer,
  type HubClient,
  refusalText,
  unwrap,
} from "@cawco/agent/hub-client";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { ConnectionKeyError, pipedKey, typedKey } from "./connections";
import { ownerClient } from "./owner";

const ROUTE_LINE = {
  typesafe: "Jev goes to TypeSafe directly with this key.",
  openrouter: "Jev goes through the OpenRouter connection.",
  off: "Jev is off: no TypeSafe key, and OpenRouter is not connected.",
} as const;

const routeLine = (route: keyof typeof ROUTE_LINE | null): string =>
  ROUTE_LINE[route ?? "off"];

/** Sends `request` (the TypeSafe key's route) to the hub; answers the view it returns. */
const callHub = async <A extends HubAnswer>(
  hub: string,
  request: (client: HubClient) => Promise<A>,
  refused: string
): Promise<Extract<A, { error: null }>["data"]> =>
  unwrap(
    await request(
      ownerClient(
        hub,
        "cawco jev",
        30_000,
        ConnectionKeyError,
        (seconds) =>
          `${hub} did not answer within ${seconds}s, so what it did with the TypeSafe key is not known`
      )
    ),
    (refusal) =>
      new ConnectionKeyError(
        `${hub} ${refused} (${refusal.status}): ${refusalText(refusal).slice(0, 300)}`
      )
  );

/** Reads the key and has the hub at `hub` (its http base) hold it. Answers the lines to print. */
export const setJevKey = async (hub: string): Promise<string[]> => {
  // A key typed into a session's shell passes through the session, which is
  // the one place it must never be.
  if (readEnv(CAWCO_ENV.instanceId) || readEnv(CAWCO_ENV.sessionCredential)) {
    throw new ConnectionKeyError(
      "jev set-key runs in your own terminal, never inside a CawCo session: a key that passes through a session can land in its transcript"
    );
  }
  const key = (
    process.stdin.isTTY
      ? await typedKey("TypeSafe key (not shown): ")
      : await pipedKey()
  ).trim();
  if (!key) {
    throw new ConnectionKeyError("no key was given; nothing was sent");
  }
  const view = await callHub(
    hub,
    (client) => client.api.jev["typesafe-key"].put({ key }),
    "refused the TypeSafe key"
  );
  return [
    `TypeSafe key held (${key.length} characters, ends …${view.typesafe?.ends ?? "?"})`,
    routeLine(view.route),
  ];
};

/** Has the hub at `hub` forget the TypeSafe key. Answers the lines to print. */
export const removeJevKey = async (hub: string): Promise<string[]> => {
  const view = await callHub(
    hub,
    (client) => client.api.jev["typesafe-key"].delete(),
    "did not remove the TypeSafe key"
  );
  return ["TypeSafe key removed", routeLine(view.route)];
};
