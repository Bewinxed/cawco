/**
 * A session's credential ends with its process, asleep included: the hub
 * revokes it as the machine says the process went to sleep (server.ts, the
 * `asleep` frame; db `revokeSessionIdentity`), and its wake, a launch, runs
 * on one minted for it then (launches.ts `grantLaunch`). On a scratch fleet
 * (real hub, agent and sessiond; the real Claude Code CLI against the mock
 * model). Nothing here cuts a workspace, so it runs inside one too.
 *
 * - z1. Awake, the session's installed credential grants (`POST
 *   /api/session-identities/ack` answers 200).
 * - z2. Put to sleep, its credential grants nothing (401), and the agent's
 *   redaction store lets it go (core `CONTROL_FORGET_CREDENTIALS`).
 * - z3. Woken by a message, it answers it, on a credential of its own that
 *   is not the old one, which grants; the old one still grants nothing.
 *
 *   bun scripts/probe-kit/run.ts credential-sleep
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONTROL_SLEEP } from "../../../packages/core/src/session/controls";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../kit";

/** What the person says to wake it; its model answers with {@link WOKE}. */
const WAKE = "PROBE-CREDENTIAL-SLEEP-WAKE";
const WOKE = "PROBE-CREDENTIAL-SLEEP-WOKE";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.last.includes(WAKE) ? WOKE : "ok"],
});

const hashOf = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** The hub's answer to an installation ack carrying `credential`: 401 once it grants nothing. */
const ackStatus = async (fleet: KitFleet, credential: string) =>
  (
    await hubAt(fleet.base, {
      headers: { authorization: `Bearer ${credential}` },
    }).api["session-identities"].ack.post({})
  ).status;

/** The session's installed credential's hash, once one other than `not` is installed. */
const installed = (fleet: KitFleet, instanceId: string, not = "") =>
  until(
    "its credential installed",
    () => {
      const hash = fleet.query<{ credential_hash: string | null }>(
        "SELECT credential_hash FROM session_identities WHERE instance_id = ? AND installed_at IS NOT NULL AND pending_hash IS NULL",
        instanceId
      )[0]?.credential_hash;
      return hash && hash !== not ? hash : undefined;
    },
    Boolean,
    120_000
  );

/** The values the agent's redaction store holds (agent redaction.ts). */
const stored = (fleet: KitFleet): string[] => {
  try {
    const dir = join(dirname(fleet.sessiondSocket), "session-identity");
    const name = readdirSync(dir).find(
      (one) => one.startsWith("redact-") && one.endsWith(".json")
    );
    return name
      ? (JSON.parse(readFileSync(join(dir, name), "utf8")) as string[])
      : [];
  } catch {
    return [];
  }
};

const statusOf = (fleet: KitFleet, id: string): string | undefined =>
  fleet.query<{ status: string }>(
    "SELECT status FROM instances WHERE id = ?",
    id
  )[0]?.status;

const spec: Spec = {
  group: "The hub and machines",
  name: "credential-sleep",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const id = await fleet.spawn("claude", "Credential sleep");
    // A turn first: a session with no conversation yet has nothing to sleep on.
    await fleet.send(id, "PROBE-CREDENTIAL-SLEEP-HELLO");
    await until(
      "its first turn answered",
      () =>
        fleet.seen.some((one) =>
          one.last.includes("PROBE-CREDENTIAL-SLEEP-HELLO")
        ) || undefined,
      Boolean,
      120_000
    );
    const first = await installed(fleet, id);
    const before = await fleet.sessionCredential(id);
    check(
      "z1: awake, its installed credential grants",
      hashOf(before) === first && (await ackStatus(fleet, before)) === 200,
      `credential ${before ? "read" : "missing"}; hash ${hashOf(before) === first ? "matches" : "differs"}`
    );

    await fleet.control(id, CONTROL_SLEEP);
    const slept = await until(
      "it went to sleep",
      () => statusOf(fleet, id),
      (status) => status === "sleeping",
      120_000
    ).catch(() => statusOf(fleet, id));
    const asleepAck = await ackStatus(fleet, before);
    const dropped = await until(
      "its credential leaves the redaction store",
      () => !stored(fleet).includes(before),
      Boolean,
      30_000
    ).catch(() => false);
    check(
      "z2: put to sleep, its credential grants nothing, and the agent's redaction store lets it go",
      slept === "sleeping" && asleepAck === 401 && dropped,
      `status ${slept}; ack ${asleepAck}; store ${dropped ? "let it go" : "still holds it"}`
    );

    await fleet.send(id, `${WAKE} please`);
    const second = await installed(fleet, id, first).catch(() => undefined);
    const after = second ? await fleet.sessionCredential(id) : "";
    const answered = await until(
      "its answer to the wake",
      () => fleet.seen.some((one) => one.last.includes(WAKE)) || undefined,
      Boolean,
      120_000
    ).catch(() => false);
    check(
      "z3: woken by a message, it answers on a new credential that grants, and the old one still grants nothing",
      answered === true &&
        !!second &&
        after !== before &&
        hashOf(after) === second &&
        (await ackStatus(fleet, after)) === 200 &&
        (await ackStatus(fleet, before)) === 401,
      `answered ${answered}; new hash ${second ? "installed" : "none"}; ${after === before ? "same credential" : "a new credential"}`
    );
  },
};

export default spec;
