/**
 * A project's browser's pass to the dashboard (core `BROWSER_PASS_SCHEME`):
 * what its machine's dashboard door puts on every request that browser makes
 * to the dashboard (agent browser/dashboard-door.ts), so the hub reads it as
 * that browser, an agent of its project (hub-auth.ts `browserReaches`),
 * and never as the person.
 *
 * A pass is signed, not stored: its body names the machine, the browser's
 * key and when it stops standing, under an HMAC of a key derived from the
 * hub's own (secret-box.ts `derive`), so it holds across a restart of the
 * hub and lapses by itself ({@link PASS_MS}); the door asks for a new one
 * before then. Only the machine whose browser it is gets one: its agent
 * asks with its key's proof, and the hub signs the machine it proved (on a
 * hub that trusts its network, before any machine holds a key, the machine
 * the request names: that request is the person's).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { isBrowserKey } from "@cawco/core/browser";
import { BROWSER_PASS_SCHEME, type BrowserPass } from "@cawco/core/hub-auth";
import { HOUR_MS } from "@cawco/core/time";
import { Elysia, problem, t } from "elysia";
import { z } from "zod";
import { hidden } from "./hidden";
import { addressOf, type BrowserPassHolder, type Caller } from "./hub-auth";
import { hubSecrets } from "./secret-box";

/** How long a pass stands. Our call: a day, so a pass that leaves its machine soon stops opening anything. */
const PASS_MS = 24 * HOUR_MS;
const KEY_LABEL = "cawco browser pass v1";

let macKey: Buffer | undefined;
const mac = (body: string): string => {
  macKey ??= hubSecrets().derive(KEY_LABEL);
  return createHmac("sha256", macKey).update(body).digest("base64url");
};

const BodySchema = z.object({
  /** When it stops standing, ms epoch. */
  e: z.number(),
  /** The browser's key. */
  k: z.string(),
  /** The machine that runs it. */
  m: z.string(),
});

/** A pass for machine `machineId`'s browser `key`, and when it lapses. */
const mint = (
  machineId: string,
  key: string
): { expiresAt: number; pass: string } => {
  const expiresAt = Date.now() + PASS_MS;
  const body = Buffer.from(
    JSON.stringify({ e: expiresAt, k: key, m: machineId })
  ).toString("base64url");
  return { pass: `${body}.${mac(body)}`, expiresAt };
};

/** Whose browser `pass` is, when the hub signed it and it still stands; undefined otherwise. */
export const openBrowserPass = (
  pass: string
): BrowserPassHolder | undefined => {
  const dot = pass.indexOf(".");
  if (dot < 1) {
    return;
  }
  const body = pass.slice(0, dot);
  const want = Buffer.from(mac(body));
  const got = Buffer.from(pass.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return;
  }
  let read: z.infer<typeof BodySchema>;
  try {
    read = BodySchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    );
  } catch {
    return;
  }
  return read.e > Date.now() ? { machineId: read.m, key: read.k } : undefined;
};

/** What the routes read of the hub. */
export interface BrowserPassDeps {
  /** The request's caller, as the gate classified it (hub-auth.ts `callerOf`). */
  readonly callerOf: (request: Request, address: string | null) => Caller;
  /** Whether the hub knows machine `machineId`. */
  readonly knows: (machineId: string) => boolean;
  /** Every origin the hub knows its dashboard at (dashboard-url.ts `dashboardOrigins`). */
  readonly origins: () => string[];
}

/** The machine a pass is asked for: the one that proved its key, or the one the person names (`named`); undefined for anyone else. */
const machineOfAsk = (caller: Caller, named: string): string | undefined => {
  if (caller.kind === "machine") {
    return caller.machineId;
  }
  return caller.kind === "owner" ? named : undefined;
};

export const browserPassRoutes = ({
  callerOf,
  knows,
  origins,
}: BrowserPassDeps) =>
  new Elysia()
    // A browser's pass and the dashboard's origins, for its machine's
    // dashboard door (agent browser/dashboard-door.ts), for a browser key of
    // its own naming. The machine is the one that proved its key; on a hub
    // that trusts its network a machine holds no key until pairing is
    // turned on (agent hub-proof.ts), and its request is the person's, who
    // may name any machine for a pass that is less than their own: so the
    // query's `machine` names it then.
    .get(
      "/api/browser-passes/:key",
      {
        ...hidden,
        params: t.Object({ key: t.String() }),
        query: t.Object({ machine: t.String({ minLength: 1 }) }),
      },
      ({ params, query, request, server }) => {
        const caller = callerOf(request, addressOf(server, request));
        const machineId = machineOfAsk(caller, query.machine);
        if (!(machineId && knows(machineId))) {
          return problem(403, {
            code: "browser-pass-machine-only",
            detail: `A browser's pass (${BROWSER_PASS_SCHEME}) is a known machine's agent's to ask for, with its key's proof once the hub requires paired devices.`,
          });
        }
        if (!isBrowserKey(params.key)) {
          return problem(400, {
            code: "browser-key-unknown",
            detail: `${params.key} is no browser's key: a project's (project:<id>) or a machine's (machine:<id>).`,
          });
        }
        return {
          ...mint(machineId, params.key),
          origins: origins(),
        } satisfies BrowserPass;
      }
    );
