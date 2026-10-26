/**
 * The agent's redaction store holds only credentials that still grant
 * something (agent redaction.ts): a session credential leaves it once the
 * hub has revoked it, on the hub's word, never on a guess or a timer.
 *
 * On a scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model), two Claude sessions, A and B, each with its own
 * credential installed:
 *
 * 1. A is stopped. Its end confirmed, the hub revokes A's credential (hub db
 *    `revokeIdentities`): it no longer authenticates (`POST
 *    /api/session-identities/ack` answers 401), and the hub's word reaches
 *    the connected agent (core `CONTROL_FORGET_CREDENTIALS`), whose store
 *    lets A's credential go. B's stays, and still authenticates. B's model
 *    then prints B's credential: B's transcript, read through the hub, shows
 *    the redaction mark and never the value.
 * 2. With the agent stopped, a value the hub never issued is put in its
 *    store. The agent's register names what its store holds by hash (agent
 *    daemon.ts `credentialHashes`); the hub's ack names the ones it does not
 *    honour (`revokedCredentials`), and the store lets that one go and keeps
 *    B's.
 *
 *   bun scripts/probe-kit/run.ts credential-revoke
 */
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** What the agent puts in place of a credential (agent redaction.ts `REDACTED`). */
const REDACTED = "[cawco credential]";
/** The person's word to B: its model answers with B's credential. */
const LEAK_ASK = "PROBE-PRINT-YOUR-CREDENTIAL";

/** B's credential, once the probe has read it: what B's model prints when asked. */
let leak = "";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [
    request.tools && request.last.includes(LEAK_ASK) && leak
      ? `CAWCO_SESSION_CREDENTIAL=${leak}`
      : "ok",
  ],
});

const hashOf = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** The agent's redaction store file: one per hub, in the session identity dir beside the keeper's socket. */
const storeFile = (fleet: KitFleet): string => {
  const dir = join(dirname(fleet.sessiondSocket), "session-identity");
  const name = readdirSync(dir).find(
    (one) => one.startsWith("redact-") && one.endsWith(".json")
  );
  if (!name) {
    throw new Error(`no redaction store in ${dir}`);
  }
  return join(dir, name);
};

const stored = (fleet: KitFleet): string[] => {
  try {
    return JSON.parse(readFileSync(storeFile(fleet), "utf8")) as string[];
  } catch {
    return [];
  }
};

/** The value in the store whose hash is `hash`. */
const storedFor = (fleet: KitFleet, hash: string): string | undefined =>
  stored(fleet).find((value) => hashOf(value) === hash);

/** The hub's answer to an installation ack carrying `credential`: 401 once it grants nothing. */
const ackStatus = async (fleet: KitFleet, credential: string) =>
  (
    await fetch(`${fleet.base}/api/session-identities/ack`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: "{}",
    })
  ).status;

/** A session's credential, installed: its hash as the hub keeps it. */
const installed = (fleet: KitFleet, instanceId: string) =>
  until(
    `${instanceId.slice(0, 8)}: its credential installed`,
    () =>
      fleet.query<{ credential_hash: string | null }>(
        "SELECT credential_hash FROM session_identities WHERE instance_id = ? AND installed_at IS NOT NULL AND pending_hash IS NULL",
        instanceId
      )[0]?.credential_hash ?? undefined,
    Boolean,
    60_000
  );

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const a = await fleet.spawn("claude", "Credential A");
  const b = await fleet.spawn("claude", "Credential B");
  const hashA = await installed(fleet, a);
  const hashB = await installed(fleet, b);
  const credA = storedFor(fleet, hashA);
  const credB = storedFor(fleet, hashB);
  kit.check(
    "each session's installed credential is in the agent's redaction store",
    !!credA && !!credB,
    `A ${credA ? "held" : "missing"}, B ${credB ? "held" : "missing"}; ${stored(fleet).length} value(s) in the store`
  );
  if (!(credA && credB)) {
    return;
  }

  // 1. A ends: the hub revokes its credential and the agent lets it go.
  await fleet.stopSession(a);
  const ended = await until(
    "A's end confirmed",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM instances WHERE id = ?",
        a
      )[0]?.status,
    (status) => status === "stopped",
    120_000
  ).catch(() => undefined);
  const refusedA = await ackStatus(fleet, credA);
  const grantedB = await ackStatus(fleet, credB);
  kit.check(
    "1: A's end confirmed, the hub revokes A's credential and B's still grants",
    ended === "stopped" && refusedA === 401 && grantedB === 200,
    `A ${ended ?? "not stopped"}; ack with A's credential ${refusedA}, with B's ${grantedB}`
  );
  const dropped = await until(
    "A's credential leaves the store",
    () => !stored(fleet).includes(credA),
    Boolean,
    30_000
  ).catch(() => false);
  const said =
    (await fleet.logs("agent"))
      .split("\n")
      .filter((line) => line.includes("[redaction]"))
      .at(-1) ?? "nothing of it";
  kit.check(
    "1: the agent's store lets A's revoked credential go and keeps B's live one, with no restart",
    dropped && stored(fleet).includes(credB),
    `A ${dropped ? "gone" : "still held"}, B ${stored(fleet).includes(credB) ? "held" : "gone"}; the agent says: ${said}`
  );

  leak = credB;
  await fleet.send(b, `${LEAK_ASK} please`);
  const page = await until(
    "B's transcript holds its answer",
    async () => {
      const read = await fleet.api<{ blocks: { content: string }[] }>(
        `/api/instances/${b}/transcript?limit=400`
      );
      const text = read.blocks.map((one) => one.content).join("\n");
      return text.includes("CAWCO_SESSION_CREDENTIAL=") ? text : undefined;
    },
    Boolean,
    120_000
  ).catch(() => undefined);
  kit.check(
    "1: B's credential, still live, printed by its model, reads redacted in its transcript",
    !!page && !page.includes(credB) && page.includes(REDACTED),
    page
      ? `the value ${page.includes(credB) ? "shows" : "never shows"}; the mark ${page.includes(REDACTED) ? "shows" : "is missing"}`
      : "B's answer never reached its transcript"
  );

  // 2. A credential revoked while the agent was away goes at its register.
  await fleet.stop("agent");
  const stale = randomBytes(32).toString("base64url");
  writeFileSync(storeFile(fleet), JSON.stringify([...stored(fleet), stale]));
  fleet.launch("agent");
  await fleet.agentUp();
  const forgot = await until(
    "the stale value leaves the store",
    () => !stored(fleet).includes(stale),
    Boolean,
    30_000
  ).catch(() => false);
  kit.check(
    "2: at its register the agent lets go of a value the hub does not honour, and keeps B's",
    forgot && stored(fleet).includes(credB),
    `the stale value ${forgot ? "gone" : "still held"}, B ${stored(fleet).includes(credB) ? "held" : "gone"}; ${stored(fleet).length} value(s) in the store`
  );
};

export default {
  group: "The hub and machines",
  name: "credential-revoke",
  run,
} satisfies Spec;
