/**
 * `cawco relay`: a project's public webhook path (Projects spec §5.5 Relay;
 * the hub's relay.ts), from a terminal.
 *
 * - `on <project> [--provider github|stripe|generic] [--connection <name>]
 *   [--signature-header <h>] [--timestamp-header <h>] [--id-path <path>]`:
 *   inside a CawCo session it is that session's `relay_create`, which waits
 *   for the owner to approve it like any admin write. In the owner's own
 *   terminal it prints what goes public and asks before calling the hub
 *   (`--yes` answers for a terminal that can't be asked).
 * - `off <relay>`, `list <project>`: `relay_remove` and `relay_list` in a
 *   session; the hub's routes outside one.
 * - `set-secret <relay>`: the provider's signing secret, typed unseen or
 *   piped, from the owner's terminal to the hub; refused inside a session,
 *   whose transcript a secret must never reach. Nothing prints it back.
 */
import { CAWCO_ENV, type RelayView, readEnv } from "@cawco/core";
import { ConnectionKeyError, pipedKey, typedKey } from "./connections";
import { OwnerApprovalError, ownerFetch } from "./owner";
import { callTool, toolDoor } from "./tools";

export class RelayError extends Error {}

export interface RelayArgs {
  action?: string;
  connection?: string;
  /** The hub's http base, when one was found (none inside a workspace's boundary). */
  hub?: string;
  idPath?: string;
  provider?: string;
  rest: string[];
  session?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  yes: boolean;
}

interface Created {
  relay: RelayView;
  suggestedRoutes: {
    note: string;
    routines: { id: string; name: string }[];
    source: string;
  };
}

/** The session this terminal is, when it is one. */
const sessionOf = (flag: string | undefined): string | undefined =>
  flag ?? (readEnv(CAWCO_ENV.instanceId)?.trim() || undefined);

const call = async (
  hub: string | undefined,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> => {
  if (!hub) {
    throw new RelayError("no hub found");
  }
  const response = await ownerFetch(
    `${hub}${path}`,
    {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      // Opening a relay waits on Tailscale and on GitHub's ping.
      signal: AbortSignal.timeout(180_000),
    },
    "cawco relay"
  ).catch((error: unknown) => {
    if (error instanceof OwnerApprovalError) {
      throw new RelayError(error.message);
    }
    throw new RelayError(
      `${hub} could not be reached: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  const said = await response.text();
  if (!response.ok) {
    throw new RelayError(`${response.status}: ${said.slice(0, 500)}`);
  }
  return said ? (JSON.parse(said) as unknown) : undefined;
};

/** A project named by id or by name. */
const projectId = async (
  hub: string | undefined,
  named: string | undefined
): Promise<string> => {
  if (!named) {
    throw new RelayError("name the project, by id or name");
  }
  const projects = (await call(hub, "GET", "/api/projects")) as {
    id: string;
    name: string;
  }[];
  const found =
    projects.find((one) => one.id === named) ??
    projects.filter((one) => one.name === named);
  if (Array.isArray(found)) {
    if (found.length !== 1) {
      throw new RelayError(
        found.length === 0
          ? `no project ${named}`
          : `${found.length} projects are named ${named}; name it by id`
      );
    }
    return (found[0] as { id: string }).id;
  }
  return found.id;
};

/** One relay, as lines. */
const describe = (view: RelayView): string[] => [
  `Relay ${view.id} (${view.provider}): ${view.state}`,
  ...(view.publicUrl ? [`Public URL: ${view.publicUrl}`] : []),
  ...(view.reason ? [`Needs: ${view.reason}`] : []),
  view.inbound,
  ...(view.testedAt
    ? [`Test delivery: ${new Date(view.testedAt).toISOString()}`]
    : []),
];

const createdLines = (made: Created): string[] => [
  ...describe(made.relay),
  "",
  made.suggestedRoutes.note,
  ...made.suggestedRoutes.routines.map(
    (one) => `  routine ${one.id}: ${one.name}`
  ),
];

/** y, from the terminal; anything else is no. */
const confirmed = async (question: string): Promise<boolean> => {
  process.stderr.write(`${question} `);
  // Bun's console reads stdin a line at a time.
  for await (const line of console) {
    return line.trim().toLowerCase() === "y";
  }
  return false;
};

const relayInput = (args: RelayArgs) => ({
  provider: args.provider ?? "github",
  ...(args.connection ? { connection: args.connection } : {}),
  ...(args.signatureHeader ? { signatureHeader: args.signatureHeader } : {}),
  ...(args.timestampHeader ? { timestampHeader: args.timestampHeader } : {}),
  ...(args.idPath ? { idPath: args.idPath } : {}),
});

const on = async (args: RelayArgs): Promise<string[]> => {
  const session = sessionOf(args.session);
  const input = relayInput(args);
  if (session) {
    const said = await callTool(
      args.hub,
      session,
      "relay_create",
      JSON.stringify({
        provider: input.provider,
        ...(input.connection ? { connection: input.connection } : {}),
        ...(input.signatureHeader
          ? { signature_header: input.signatureHeader }
          : {}),
        ...(input.timestampHeader
          ? { timestamp_header: input.timestampHeader }
          : {}),
        ...(input.idPath ? { id_path: input.idPath } : {}),
      })
    );
    return createdLines(JSON.parse(said) as Created);
  }
  const id = await projectId(args.hub, args.rest[0]);
  const { public: shown } = (await call(
    args.hub,
    "POST",
    `/api/projects/${id}/relays/preview`,
    input
  )) as { public: string };
  console.log(shown);
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      throw new RelayError(
        "nothing was opened: run it again with --yes to open it"
      );
    }
    if (!(await confirmed("Open it? [y/N]"))) {
      return ["Nothing was opened."];
    }
  }
  return createdLines(
    (await call(
      args.hub,
      "POST",
      `/api/projects/${id}/relays`,
      input
    )) as Created
  );
};

const setSecret = async (args: RelayArgs): Promise<string[]> => {
  const [id] = args.rest;
  if (!id) {
    throw new RelayError("set-secret needs the relay's id");
  }
  if (readEnv(CAWCO_ENV.instanceId) || readEnv(CAWCO_ENV.sessionCredential)) {
    throw new RelayError(
      "relay set-secret runs in your own terminal, never inside a CawCo session: a secret that passes through a session can land in its transcript"
    );
  }
  const secret = (
    process.stdin.isTTY
      ? await typedKey(`Secret for relay ${id} (not shown): `)
      : await pipedKey()
  ).trim();
  if (!secret) {
    throw new ConnectionKeyError("no secret was given; nothing was sent");
  }
  const view = (await call(args.hub, "PUT", `/api/relays/${id}/secret`, {
    secret,
  })) as RelayView;
  return [
    `Secret set for relay ${id} (${secret.length} characters)`,
    ...describe(view),
  ];
};

/** Runs `cawco relay <action>`; answers the lines to print. */
export const runRelay = async (args: RelayArgs): Promise<string[]> => {
  const session = sessionOf(args.session);
  switch (args.action) {
    case "on":
      return await on(args);
    case "off": {
      const [id] = args.rest;
      if (!id) {
        throw new RelayError("off needs the relay's id");
      }
      const said = session
        ? (JSON.parse(
            await callTool(
              args.hub,
              session,
              "relay_remove",
              JSON.stringify({ id })
            )
          ) as { github: string; relay: RelayView })
        : ((await call(args.hub, "DELETE", `/api/relays/${id}`)) as {
            github: string;
            relay: RelayView;
          });
      return [...describe(said.relay), `GitHub: ${said.github}`];
    }
    case "list": {
      const views = session
        ? (JSON.parse(
            await callTool(args.hub, session, "relay_list", "{}")
          ) as RelayView[])
        : ((await call(
            args.hub,
            "GET",
            `/api/projects/${await projectId(args.hub, args.rest[0])}/relays`
          )) as RelayView[]);
      return views.length === 0
        ? ["No relays."]
        : views.flatMap((view) => [...describe(view), ""]);
    }
    case "set-secret":
      return await setSecret(args);
    default:
      throw new RelayError("relay needs on, off, list or set-secret");
  }
};

/** Whether this terminal reaches the hub only through its workspace's tool door. */
export const insideBoundary = (): boolean => toolDoor() !== undefined;
