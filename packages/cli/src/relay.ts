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

import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import {
  RELAY_PROVIDERS,
  type RelayProvider,
  type RelayView,
} from "@cawco/core/relays";
import { RelayViewSchema } from "@cawco/core/stored-shapes";
import { cutShort } from "@cawco/core/words/helpers";
import {
  type HubAnswer,
  type HubClient,
  type HubData,
  refusalText,
  unwrap,
} from "@cawco/hub/client";
import { z } from "zod";
import { ConnectionKeyError, pipedKey, typedKey } from "./connections";
import { ownerCall } from "./owner";
import { callTool, toolDoor } from "./tools";

class RelayError extends Error {}

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

const CreatedSchema = z.object({
  relay: RelayViewSchema,
  suggestedRoutes: z.object({
    note: z.string(),
    routines: z.array(z.object({ id: z.string(), name: z.string() })),
    source: z.string(),
  }),
});
type Created = z.infer<typeof CreatedSchema>;

/** The session this terminal is, when it is one. */
const sessionOf = (flag: string | undefined): string | undefined =>
  flag ?? (readEnv(CAWCO_ENV.instanceId)?.trim() || undefined);

const call = async <A extends HubAnswer>(
  hub: string | undefined,
  what: string,
  request: (client: HubClient) => Promise<A>
): Promise<HubData<A>> => {
  if (!hub) {
    throw new RelayError("no hub found");
  }
  return unwrap(
    await ownerCall(
      hub,
      "cawco relay",
      // Opening a relay waits on Tailscale and on GitHub's ping.
      180_000,
      RelayError,
      (seconds) =>
        `${hub} did not answer ${what} within ${seconds}s, so what it did is not known`,
      request
    ),
    (refusal) =>
      new RelayError(
        `${refusal.status}: ${cutShort(refusalText(refusal), 500)}`
      )
  );
};

/** A project named by id or by name. */
const projectId = async (
  hub: string | undefined,
  named: string | undefined
): Promise<string> => {
  if (!named) {
    throw new RelayError("name the project, by id or name");
  }
  const projects = await call(hub, "GET /api/projects", (client) =>
    client.api.projects.get()
  );
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
    const [only] = found;
    if (!only) {
      throw new RelayError(`no project ${named}`);
    }
    return only.id;
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

/** `--provider` as one the hub's relay routes take; any other is refused here, naming them. */
const providerOf = (named = "github"): RelayProvider => {
  const provider = RELAY_PROVIDERS.find((one) => one === named);
  if (!provider) {
    throw new RelayError(
      `the provider is one of ${RELAY_PROVIDERS.join(", ")}, not ${named}`
    );
  }
  return provider;
};

const relayInput = (args: RelayArgs) => ({
  provider: providerOf(args.provider),
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
      }),
      "record"
    );
    return createdLines(CreatedSchema.parse(JSON.parse(said)));
  }
  const id = await projectId(args.hub, args.rest[0]);
  const { public: shown } = await call(
    args.hub,
    `POST /api/projects/${id}/relays/preview`,
    (client) => client.api.projects({ id }).relays.preview.post(input)
  );
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
    await call(args.hub, `POST /api/projects/${id}/relays`, (client) =>
      client.api.projects({ id }).relays.post(input)
    )
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
  const view = await call(args.hub, `PUT /api/relays/${id}/secret`, (client) =>
    client.api.relays({ id }).secret.put({ secret })
  );
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
        ? z
            .object({ github: z.string(), relay: RelayViewSchema })
            .parse(
              JSON.parse(
                await callTool(
                  args.hub,
                  session,
                  "relay_remove",
                  JSON.stringify({ id }),
                  "record"
                )
              )
            )
        : await call(args.hub, `DELETE /api/relays/${id}`, (client) =>
            client.api.relays({ id }).delete()
          );
      return [...describe(said.relay), `GitHub: ${said.github}`];
    }
    case "list": {
      const views = session
        ? z
            .array(RelayViewSchema)
            .parse(
              JSON.parse(
                await callTool(args.hub, session, "relay_list", "{}", "record")
              )
            )
        : await call(args.hub, "GET /api/projects/:id/relays", async (client) =>
            client.api
              .projects({ id: await projectId(args.hub, args.rest[0]) })
              .relays.get()
          );
      return views.length === 0
        ? ["No relays."]
        : views.flatMap((view) => [...describe(view), ""]);
    }
    case "set-secret":
      return await setSecret(args);
    case undefined:
      break;
  }
  throw new RelayError("relay needs on, off, list or set-secret");
};

/** Whether this terminal reaches the hub only through its workspace's tool door. */
export const insideBoundary = (): boolean => toolDoor() !== undefined;
