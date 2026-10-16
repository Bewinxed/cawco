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
import { CAWCO_ENV, readEnv } from "@cawco/core";
import { ConnectionKeyError, pipedKey, typedKey } from "./connections";
import { OwnerApprovalError, ownerFetch } from "./owner";

/** What `GET /api/jev` answers with. */
interface JevView {
  route: "typesafe" | "openrouter" | null;
  suggestWhileTyping: boolean;
  typesafe: { ends: string; setAt: number | null } | null;
}

const ROUTE_LINE: Record<NonNullable<JevView["route"]> | "off", string> = {
  typesafe: "Jev goes to TypeSafe directly with this key.",
  openrouter: "Jev goes through the OpenRouter connection.",
  off: "Jev is off: no TypeSafe key, and OpenRouter is not connected.",
};

const routeLine = (view: JevView): string => ROUTE_LINE[view.route ?? "off"];

/** Sends `init` to the hub's `/api/jev/typesafe-key`; answers the view it returns. */
const callHub = async (
  hub: string,
  init: RequestInit,
  refused: string
): Promise<JevView> => {
  const response = await ownerFetch(
    `${hub}/api/jev/typesafe-key`,
    { ...init, signal: AbortSignal.timeout(30_000) },
    "cawco jev"
  ).catch((error: unknown) => {
    if (error instanceof OwnerApprovalError) {
      throw new ConnectionKeyError(error.message);
    }
    throw new ConnectionKeyError(
      `${hub} could not be reached: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  const said = await response.text();
  if (!response.ok) {
    throw new ConnectionKeyError(
      `${hub} ${refused} (${response.status}): ${said.slice(0, 300)}`
    );
  }
  return JSON.parse(said) as JevView;
};

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
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    },
    "refused the TypeSafe key"
  );
  return [
    `TypeSafe key held (${key.length} characters, ends …${view.typesafe?.ends ?? "?"})`,
    routeLine(view),
  ];
};

/** Has the hub at `hub` forget the TypeSafe key. Answers the lines to print. */
export const removeJevKey = async (hub: string): Promise<string[]> => {
  const view = await callHub(
    hub,
    { method: "DELETE" },
    "did not remove the TypeSafe key"
  );
  return ["TypeSafe key removed", routeLine(view)];
};
