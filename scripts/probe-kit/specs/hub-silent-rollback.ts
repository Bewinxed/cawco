/**
 * A machine's update rolled back only because its hub gave no answer is
 * taken up again once the hub answers; one rolled back for the build's own
 * fault is not (the 6688 rollout, 2026-11-04: the hub hung for twenty
 * minutes on its new build, every other machine's trial asked it for its
 * row, got no answer, rolled 6688 back and marked it failed, and
 * auto-update never took it again).
 *
 * Each leg drives the real module in process; no fleet, so it runs inside
 * a workspace.
 *
 * (a) The trial's probe (core binary-health.ts `probeHealth`), against a
 *     hub of the spec's own that takes the request and never answers: on a
 *     machine other than the hub's, the problem is the hub's silence
 *     (`hubSilent`), said once the trial's deadline (`byMs`) is reached, not
 *     a request bound later; on the hub's own machine, where the hub is the
 *     new build, it is the build's. A hub that answers the row offline is
 *     the build's too, and so is its 404 for a machine it does not know; an
 *     answer that is not about the row (a refusal of the probe's own
 *     request, a forward's 502) is the hub's silence.
 * (b) The failed-version rule (core binary-updates.ts `rolledBack`,
 *     `failedForGood`, which agent binary-update.ts `#takeUp` reads): a
 *     rollback for the hub's silence leaves the build to be taken up again,
 *     up to `HUB_SILENT_TRIALS` such rollbacks in a row, the last of which
 *     fails it for good; a rollback for the build's own fault fails it for
 *     good at once, after any number of silent ones, and a state written
 *     before the rule (a `failedVersion` alone) stays failed for good.
 *
 *   bun scripts/probe-kit/run.ts hub-silent-rollback
 */
import { probeHealth } from "../../../packages/core/src/binary-health";
import {
  type BinaryUpdateState,
  failedForGood,
  HUB_SILENT_TRIALS,
  rolledBack,
} from "../../../packages/core/src/binary-updates";
import type { Spec } from "../kit";

const VERSION = "0.0.1-test.6688";
const MACHINE = "b106e1516d863601";
/** How far the trial's deadline stands from each probe here: what a silent hub is waited on. */
const DEADLINE_MS = 1500;

type Failed = Pick<BinaryUpdateState, "failedVersion" | "hubSilentTrials">;

const spec: Spec = {
  group: "Release checks",
  name: "hub-silent-rollback",
  async run(kit) {
    const { check } = kit;

    // (a) A hub that takes every request and answers none, and one that
    // answers this machine's row offline.
    const silent = Bun.serve({
      port: 0,
      fetch: () => new Promise<Response>(() => undefined),
    });
    const refusing = Bun.serve({
      port: 0,
      fetch: () => new Response("pairing required", { status: 401 }),
    });
    const forward502 = Bun.serve({
      port: 0,
      fetch: () => new Response("hub did not answer", { status: 502 }),
    });
    const unknown = Bun.serve({
      port: 0,
      fetch: () => new Response("unknown machine", { status: 404 }),
    });
    const offline = Bun.serve({
      port: 0,
      fetch: () =>
        Response.json({
          machineId: MACHINE,
          status: "offline",
          build: { version: VERSION, startedAt: Date.now() },
        }),
    });
    try {
      const probe = (hubUrl: string, role: "agent" | "hub") =>
        probeHealth({
          installation: { hubUrl, role },
          machineId: MACHINE,
          sinceMs: Date.now() - 60_000,
          byMs: Date.now() + DEADLINE_MS,
          version: VERSION,
        });
      const asked = performance.now();
      const agentSilent = await probe(silent.url.origin, "agent");
      const waited = performance.now() - asked;
      check(
        "(a) a machine other than the hub's: its hub's silence is no fault of the build",
        agentSilent?.hubSilent === true &&
          agentSilent.said.includes(`/api/agents/${MACHINE}`),
        JSON.stringify(agentSilent)
      );
      check(
        `(a) a silent hub is waited on until the trial's deadline (${DEADLINE_MS} ms away), not past it`,
        waited >= DEADLINE_MS - 50 && waited < DEADLINE_MS + 1000,
        `${Math.round(waited)} ms`
      );
      for (const [what, hub] of [
        ["refuses the probe's request (401)", refusing],
        ["answers through its forward 502", forward502],
      ] as const) {
        const said = await probe(hub.url.origin, "agent");
        check(
          `(a) a hub that ${what}: its silence, not the build's`,
          said?.hubSilent === true,
          JSON.stringify(said)
        );
      }
      const notKnown = await probe(unknown.url.origin, "agent");
      check(
        "(a) a hub that knows no such machine (404): the build's own",
        notKnown?.hubSilent === false && notKnown.said.includes("HTTP 404"),
        JSON.stringify(notKnown)
      );
      const hubSilent = await probe(silent.url.origin, "hub");
      check(
        "(a) the hub's own machine: its hub's silence is the new build's own",
        hubSilent?.hubSilent === false,
        JSON.stringify(hubSilent)
      );
      const rowOffline = await probe(offline.url.origin, "agent");
      check(
        "(a) a hub that answers the row offline: the build's own",
        rowOffline?.hubSilent === false,
        JSON.stringify(rowOffline)
      );
    } finally {
      await silent.stop(true);
      await refusing.stop(true);
      await forward502.stop(true);
      await unknown.stop(true);
      await offline.stop(true);
    }

    // (b) The incident's machine: one rollback for the hub's silence.
    let state: Failed = rolledBack({}, VERSION, true);
    check(
      "(b) rolled back once for the hub's silence: taken up again once the hub answers",
      state.failedVersion === VERSION && !failedForGood(state, VERSION),
      JSON.stringify(state)
    );
    const trials: boolean[] = [failedForGood(state, VERSION)];
    for (let n = 2; n <= HUB_SILENT_TRIALS; n += 1) {
      state = rolledBack(state, VERSION, true);
      trials.push(failedForGood(state, VERSION));
    }
    check(
      `(b) ${HUB_SILENT_TRIALS} rollbacks in a row for the hub's silence fail it for good, fewer do not`,
      trials.at(-1) === true && trials.slice(0, -1).every((v) => !v),
      `failed for good after each: ${trials.join(", ")}`
    );

    const own = rolledBack({}, VERSION, false);
    check(
      "(b) rolled back for the build's own fault: failed for good at once",
      failedForGood(own, VERSION) && own.hubSilentTrials === undefined,
      JSON.stringify(own)
    );
    const ownAfterSilent = rolledBack(
      rolledBack({}, VERSION, true),
      VERSION,
      false
    );
    check(
      "(b) the build's own fault after a silent rollback: failed for good",
      failedForGood(ownAfterSilent, VERSION),
      JSON.stringify(ownAfterSilent)
    );
    const otherBuild = rolledBack(
      { failedVersion: "0.0.1-test.6687", hubSilentTrials: 2 },
      VERSION,
      true
    );
    check(
      "(b) another build's silent rollbacks do not count toward this one's",
      otherBuild.hubSilentTrials === 1 && !failedForGood(otherBuild, VERSION),
      JSON.stringify(otherBuild)
    );
    check(
      "(b) a failed version written before the rule stays failed for good; a newer build is not held by it",
      failedForGood({ failedVersion: VERSION }, VERSION) &&
        !failedForGood({ failedVersion: VERSION }, "0.0.1-test.6689"),
      ""
    );
  },
};

export default spec;
