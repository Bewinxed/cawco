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
import { z } from "zod";
import { ConnectionKeyError, pipedKey, typedKey } from "./connections";
import { ownerAsk } from "./owner";

/** What `GET /api/jev` answers with. */
const JevViewSchema = z.object({
  route: z.enum(["typesafe", "openrouter"]).nullable(),
  suggestWhileTyping: z.boolean(),
  typesafe: z
    .object({ ends: z.string(), setAt: z.number().nullable() })
    .nullable(),
});
type JevView = z.infer<typeof JevViewSchema>;

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
  const { ok, said, status } = await ownerAsk(
    hub,
    "/api/jev/typesafe-key",
    init,
    "cawco jev",
    30_000,
    ConnectionKeyError,
    (seconds) =>
      `${hub} did not answer within ${seconds}s, so what it did with the TypeSafe key is not known`
  );
  if (!ok) {
    throw new ConnectionKeyError(
      `${hub} ${refused} (${status}): ${said.slice(0, 300)}`
    );
  }
  return JevViewSchema.parse(JSON.parse(said));
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
