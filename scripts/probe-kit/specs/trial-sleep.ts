/**
 * An update's trial judges the build, never the machine's sleep; and a
 * build a retiring keeper still runs from is waited for, never failed (the
 * Mac, 2026-11-07: five trials in a row began inside a DarkWake, the Mac
 * slept seconds later, each deadline passed asleep, the first probe after the
 * wake found no network, and each build was rolled back on "the hub's
 * silence" while it had registered healthy; the third such rollback failed
 * 7145 for good; and after each rollback the restarted agent's first attempt
 * was refused for the rolled-back build's retiring keeper, "This version is
 * one that is already running", which overwrote the rollback's cause).
 *
 * No fleet: a hub of the spec's own answers this machine's row, and the
 * update helper's own verification (cli binary-apply.ts `verify`, through
 * trial-verify-child.ts) runs in a child of its own data dir. The sleep is
 * the child held (SIGSTOP, then SIGCONT): to a process a sleep is exactly
 * that, the wall clock moving on while it does not run.
 *
 * (a) Healthy at once, then held asleep past its whole deadline while the
 *     hub falls silent, and the hub silent for a few seconds more after the
 *     wake (the network not back): the build is confirmed once the hub
 *     answers, the sleep written on the trial and said.
 * (b) The same sleep, the hub never answering after it: the hub is given
 *     its grace after the wake before the verdict, the rollback is the
 *     hub's silence, and its cause is the sleep (`rollbackCause` `slept`):
 *     after two silent trials it leaves the count at two, the build taken
 *     up again.
 * (c) A build whose retiring keeper is still there (its endpoint beside
 *     the machine's) is one an attempt waits for (agent binary-update.ts
 *     `runsFrom`, which `#takeUp` reads before it stages or records
 *     anything); once the keeper is gone, nothing holds the attempt.
 *
 *   bun scripts/probe-kit/run.ts trial-sleep
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runsFrom } from "../../../packages/agent/src/binary-update";
import { hubPath } from "../../../packages/agent/src/hub-client";
import {
  rollbackCause,
  WAKE_GRACE_MS,
} from "../../../packages/cli/src/binary-apply";
import type { TrialMarker } from "../../../packages/core/src/binary-installation";
import {
  failedForGood,
  rolledBack,
} from "../../../packages/core/src/binary-updates";
import { readWithin } from "../../../packages/core/src/bounded";
import { signal, spawnedPid } from "../../../packages/core/src/signal";
import { updatesWords } from "../../../packages/core/src/words/updates";
import type { Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const CHILD = join(ROOT, "scripts", "probe-kit", "trial-verify-child.ts");

const VERSION = "0.0.1-test.7145";
const MACHINE = "271a214a5d568e4c";
/** The trial's deadline from the verification's start: shorter than the sleep, as each of the Mac's was. */
const TRIAL_S = 15;
/** How long the helper is held asleep: past its whole deadline. */
const ASLEEP_MS = 25_000;
/** (a): how long the hub stays silent after the wake, the network coming back. */
const NETWORK_BACK_MS = 8000;
/** The longest one verification is waited on. */
const VERIFY_WAIT_MS = 200_000;

/** What a machine's SSH door answers when the hub does not answer behind it: the hub's silence (cli binary-health.ts). */
const DOOR_UNREACHABLE = 502;

/** One trial on a hub of its own: its verdict, the trial as the helper left it, and what the helper said. */
const trialAcrossSleep = async (hubBack: boolean) => {
  const rowPath = hubPath.api.agents({ machineId: MACHINE })["~path"];
  let silent = false;
  let firstHealthy: (() => void) | undefined;
  const healthy = new Promise<void>((resolve) => {
    firstHealthy = resolve;
  });
  const startedAt = Date.now();
  const hub = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname !== rowPath) {
        return new Response("not here", { status: 404 });
      }
      if (silent) {
        return new Response("The hub did not answer on its own port.\n", {
          status: DOOR_UNREACHABLE,
        });
      }
      firstHealthy?.();
      return Response.json({
        machineId: MACHINE,
        status: "online",
        build: { version: VERSION, startedAt },
        custody: { state: "available" },
      });
    },
  });
  const data = mkdtempSync(join(tmpdir(), "trial-sleep-"));
  const binary = join(data, "cawco", "binary");
  mkdirSync(binary, { recursive: true });
  writeFileSync(
    join(binary, "installation.json"),
    JSON.stringify({
      hubUrl: hub.url.origin,
      installedVersion: VERSION,
      role: "agent",
      root: binary,
    })
  );
  const trial: TrialMarker = {
    version: VERSION,
    previous: "0.0.1-test.7122",
    role: "agent",
    swappedAt: Math.floor(startedAt / 1000) - 10,
    decideBy: Math.floor(Date.now() / 1000) + TRIAL_S,
  };
  const child = Bun.spawn(["bun", CHILD, JSON.stringify(trial)], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: data,
      XDG_DATA_HOME: data,
      XDG_CONFIG_HOME: join(data, "config"),
      CAWCO_MACHINE_ID: MACHINE,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let wokeAt = Number.NaN;
  const pid = spawnedPid(child);
  try {
    if (!pid) {
      throw new Error("the helper's child did not start");
    }
    await healthy;
    // The hold has begun: the machine sleeps, and the hub is silent through it.
    silent = true;
    signal(pid, "SIGSTOP");
    await Bun.sleep(ASLEEP_MS);
    signal(pid, "SIGCONT");
    wokeAt = Date.now();
    if (hubBack) {
      await Bun.sleep(NETWORK_BACK_MS);
      silent = false;
    }
    const ended =
      (await readWithin(VERIFY_WAIT_MS, () => child.exited)).kind ===
      "answered";
    if (!ended) {
      child.kill("SIGKILL");
    }
    const [out, err] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const lines = out.trimEnd().split("\n");
    const verdict = lines.findLast((line) => line.startsWith("VERDICT "));
    const decidedAt = Number(
      lines.findLast((line) => line.startsWith("DECIDED "))?.slice(8)
    );
    const left = lines.findLast((line) => line.startsWith("TRIAL "));
    const helperSaid = lines.filter((line) => line.startsWith("update: "));
    return {
      confirmed: ended && verdict === "VERDICT confirm",
      decidedAt,
      wokeAt,
      problem: verdict?.startsWith("VERDICT roll-back ")
        ? (JSON.parse(verdict.slice(18)) as {
            hubSilent: boolean;
            said: string;
          })
        : undefined,
      trial: left ? (JSON.parse(left.slice(6)) as TrialMarker) : undefined,
      said: [
        ended ? (verdict ?? "no verdict") : "no verdict in time",
        ...helperSaid.slice(-10),
        err.trim()
          ? `stderr: ${err.trim().split("\n").slice(-6).join(" | ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n    "),
    };
  } finally {
    child.kill("SIGKILL");
    await hub.stop(true);
    rmSync(data, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Release checks",
  name: "trial-sleep",
  async run(kit) {
    const { check } = kit;
    const [back, never] = await Promise.all([
      trialAcrossSleep(true),
      trialAcrossSleep(false),
    ]);

    check(
      `(a) asleep ${ASLEEP_MS / 1000}s, past the ${TRIAL_S}s deadline, the hub silent ${NETWORK_BACK_MS / 1000}s after the wake: the build is confirmed once the hub answers`,
      back.confirmed,
      back.said
    );
    check(
      "(a) the sleep is written on the trial",
      (back.trial?.sleptMs ?? 0) >= ASLEEP_MS - 2000,
      `sleptMs ${back.trial?.sleptMs}`
    );

    const afterWake = never.decidedAt - never.wokeAt;
    check(
      `(b) the hub never answers after the wake: it is given its ${WAKE_GRACE_MS / 1000}s after the wake, then the rollback is the hub's silence`,
      !never.confirmed &&
        never.problem?.hubSilent === true &&
        afterWake >= WAKE_GRACE_MS - 2000,
      `decided ${(afterWake / 1000).toFixed(1)}s after the wake\n    ${never.said}`
    );
    const marker: TrialMarker | undefined = never.trial && {
      ...never.trial,
      hubSilent: true,
    };
    const cause = marker ? rollbackCause(marker) : undefined;
    const before = { failedVersion: VERSION, hubSilentTrials: 2 };
    const after = cause ? rolledBack(before, VERSION, cause) : undefined;
    check(
      "(b) its cause is the sleep: after two silent trials the count stays two, and the build is taken up again",
      cause === "slept" &&
        after?.hubSilentTrials === 2 &&
        !failedForGood(after, VERSION),
      `cause ${cause}; ${JSON.stringify(after)}`
    );
    check(
      "(b) a trial that never slept and ended on the hub's silence is still a silent one",
      rollbackCause({ ...trialOf(), hubSilent: true }) === "hub-silent" &&
        rollbackCause(trialOf()) === "own",
      ""
    );

    // (c) A retiring keeper of the rolled-back build, its endpoint beside the machine's.
    const run = mkdtempSync(join(tmpdir(), "trial-sleep-keepers-"));
    const machine = join(run, "sessiond.sock");
    const endpoint = join(run, `sessiond-${VERSION}.sock`);
    const keeper = Bun.listen({
      unix: endpoint,
      socket: { data: () => undefined },
    });
    try {
      const waits = await runsFrom(VERSION, machine);
      check(
        "(c) a build whose retiring keeper is still there: the attempt waits for it",
        waits === updatesWords.runsFromRetiringKeeper,
        String(waits)
      );
      const other = await runsFrom("0.0.1-test.7146", machine);
      check(
        "(c) another build is not held by it",
        other === undefined,
        String(other)
      );
    } finally {
      keeper.stop(true);
      rmSync(endpoint, { force: true });
    }
    const gone = await runsFrom(VERSION, machine);
    check(
      "(c) once the keeper is gone, nothing holds the attempt",
      gone === undefined,
      String(gone)
    );
    rmSync(run, { recursive: true, force: true });
  },
};

/** A trial marker with nothing in it but what every trial has. */
const trialOf = (): TrialMarker => ({
  version: VERSION,
  previous: "0.0.1-test.7122",
  role: "agent",
  swappedAt: 0,
});

export default spec;
