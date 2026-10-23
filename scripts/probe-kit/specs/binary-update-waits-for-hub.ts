/**
 * A machine other than the hub's own, told to install a build its hub does
 * not speak yet, waits for its hub: it never says failed, its install
 * stands, and it goes on by itself the moment its hub restarts into a build
 * that speaks it, with no check and no second press.
 *
 * A scratch fleet laid out as a binary install on nightly N, as
 * binary-update-found's (binary-install.ts `installedOn`), the mirror serving
 * the two newest published nightlies. The machine's updater reads its hub
 * through a stand-in (installation.json `hubUrl`) that passes every request
 * on, and plays the hub's wire protocol: while it plays the old hub, its
 * `/health` names a protocol below every one N+1 speaks, then answers 503
 * as a hub mid-restart does, and once the hub has restarted it passes the
 * hub's own `/health` on. The machine's socket reaches the hub itself, so
 * the hub's restart is a register with the restarted hub. In order:
 *
 * 1. N+1 published and found; one Install now on the machine. Its answer says
 *    it waits for its hub to take N+1 first; the hub records
 *    `waiting-for-hub`, `hubWait` behind, no error, and the Update cell says
 *    it in its words; nothing is downloaded.
 * 2. The hub answers 503 for its health, through one of the machine's own
 *    update ticks (60 s): it still waits, now for the hub to answer, and
 *    nothing is downloaded.
 * 3. The hub restarts and speaks N+1's protocol: within 20 s of the hub
 *    answering again, the machine asks for N+1's archive, through the hub,
 *    from the mirror.
 *
 * The mirror answers that archive 404, so the attempt ends at its download:
 * its error is the download's own, never the wait's. The hub's record of
 * the machine is read every 250 ms from the Install now to the download: it
 * never says failed while the machine waits, and the attempt carries no
 * error from before it.
 *
 *   bun scripts/probe-kit/run.ts binary-update-waits-for-hub
 */

import {
  cellFor,
  displayVersion,
} from "../../../apps/dashboard/src/lib/cawco/updates/model";
import type { BinaryUpdateState } from "../../../packages/core/src/binary-updates";
import { updatesWords } from "../../../packages/core/src/words/updates";
import { MACHINE } from "../../scratch-fleet";
import {
  checkoutSchema,
  installedOn,
  newestNightlies,
  nightlyMirror,
  until,
} from "../binary-install";
import type { Spec } from "../kit";

interface UpdateReport {
  installed: boolean;
  skipped?: string;
}

/** How the stand-in answers the machine's `/health`: as the old hub, as a hub mid-restart, or as the hub says. */
type Plays = "old" | "restarting" | "hub";

const spec: Spec = {
  name: "binary-update-waits-for-hub",
  async run(kit) {
    const { check } = kit;
    const [n, next] = await newestNightlies();
    const schema = await checkoutSchema();
    const speaks = next.manifest.protocol;
    console.log(
      `  N ${n.manifest.version}, N+1 ${next.manifest.version} speaking ${speaks.min}–${speaks.max}; this checkout's hub holds ${schema} migrations`
    );
    if (
      !check(
        "N+1 carries at least the migrations this checkout's hub holds",
        next.manifest.schemaVersion >= schema,
        `N+1 carries ${next.manifest.schemaVersion}, the hub ${schema}: a hub ahead of every nightly offers none, and this spec waits for the next nightly`
      )
    ) {
      return;
    }
    const below = { min: speaks.min - 1, max: speaks.min - 1 };

    const mirror = nightlyMirror(n);
    let plays: Plays = "old";
    let hubBase = "";
    // The stand-in, on one port for the whole run; down while the hub is,
    // as the hub's own address is (a refused connection, never an answer).
    const standInOn = (port: number) =>
      Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(request) {
          const url = new URL(request.url);
          if (url.pathname === "/health" && plays === "restarting") {
            return new Response("the hub is starting", { status: 503 });
          }
          const headers = new Headers(request.headers);
          headers.delete("host");
          const passed = await fetch(`${hubBase}${url.pathname}${url.search}`, {
            method: request.method,
            headers,
            body: ["GET", "HEAD"].includes(request.method)
              ? undefined
              : await request.arrayBuffer(),
          });
          if (url.pathname !== "/health" || plays === "hub") {
            return passed;
          }
          const health = (await passed.json()) as {
            build?: { protocol?: unknown };
          };
          return Response.json({
            ...health,
            build: { ...health.build, protocol: below },
          });
        },
      });
    let standIn = standInOn(0);
    const standInPort = standIn.port;
    if (standInPort === undefined) {
      throw new Error("the hub's stand-in listens on no port");
    }
    try {
      const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
      hubBase = fleet.base;
      await installedOn(fleet, n, {
        hubUrl: `http://127.0.0.1:${standInPort}`,
        releaseHost: mirror.url,
      });
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.launch("agent");
      await fleet.agentUp();

      const machineState = async (): Promise<BinaryUpdateState | undefined> =>
        (
          await fleet.api<{ machines: Record<string, BinaryUpdateState> }>(
            "/api/binary-updates/machines"
          )
        ).machines[MACHINE];
      // The hub's record of the machine, every 250 ms until `sampling` is ended; a look the hub did not answer is skipped.
      const samples: BinaryUpdateState[] = [];
      const sampling = new AbortController();
      const sampler = (async () => {
        while (!sampling.signal.aborted) {
          // biome-ignore lint/performance/noAwaitInLoops: a sampler, one look at a time
          const state = await machineState().catch(() => undefined);
          if (state) {
            samples.push(state);
          }
          await Bun.sleep(250);
        }
      })();
      const archive = next.manifest.artifacts.find(
        (row) => row.target === `${process.platform}-${process.arch}`
      )?.archive;
      const archiveAsked = () => mirror.asked.includes(`/nightly/${archive}`);

      // 1. N+1 found; one Install now on the machine while its hub speaks below it.
      await fleet.api("/api/binary-updates/check", {});
      mirror.publish(next);
      const found = await fleet.api<{ version: string }>(
        "/api/binary-updates/check",
        {}
      );
      check(
        "N+1 published: the check finds N+1",
        found.version === next.manifest.version,
        `found ${found.version}`
      );
      const report = await fleet.api<UpdateReport>(
        `/api/agents/${MACHINE}/update`,
        { version: found.version, commandId: crypto.randomUUID() }
      );
      const waits = updatesWords.waitsForHub(next.manifest.version, true);
      check(
        "the Install now's answer says the machine waits for its hub to take N+1 first",
        !report.installed && report.skipped === waits,
        JSON.stringify(report)
      );
      const waiting = await until(
        machineState,
        (state) => state?.phase === "waiting-for-hub",
        30_000
      );
      check(
        "the hub records the machine waiting for its hub, behind, with no error",
        waiting?.phase === "waiting-for-hub" &&
          waiting.hubWait === "behind" &&
          waiting.availableVersion === next.manifest.version &&
          waiting.error === undefined,
        JSON.stringify(waiting)
      );
      const cell = waiting
        ? cellFor(
            {
              machineId: MACHINE,
              hostname: MACHINE,
              status: "online",
              binaryUpdate: waiting,
            },
            { autoUpdate: false, channel: "nightly" }
          )
        : undefined;
      check(
        "its Update cell says it waits for its hub, no failure, with Cancel",
        cell !== undefined &&
          !cell.fail &&
          cell.icon === "clock" &&
          cell.buttons.join() === "cancel" &&
          cell.text ===
            updatesWords.waitsForHub(
              displayVersion(next.manifest.version),
              true
            ),
        JSON.stringify(cell)
      );

      // 2. The hub does not answer for its health, through one update tick.
      plays = "restarting";
      const silent = await until(
        machineState,
        (state) => state?.hubWait === "unanswered",
        75_000
      );
      check(
        "through an update tick while the hub does not answer for its health, it waits for the hub to answer, never failed",
        silent?.phase === "waiting-for-hub" &&
          silent.hubWait === "unanswered" &&
          silent.error === undefined,
        JSON.stringify(silent)
      );
      check(
        "while it waits, nothing is downloaded",
        !archiveAsked(),
        `the mirror was asked for ${mirror.asked.join(", ") || "nothing"}`
      );

      // 3. The hub restarts into a build that speaks N+1's protocol.
      const restarted = Date.now();
      await fleet.stop("hub");
      await standIn.stop(true);
      plays = "hub";
      standIn = standInOn(standInPort);
      fleet.launch("hub");
      await fleet.hubUp();
      const answered = Date.now();
      await until(async () => archiveAsked(), Boolean, 60_000);
      const took = Date.now() - answered;
      check(
        "within 20 s of the restarted hub answering, the machine asks for N+1's archive by itself (its register with the hub, not its next tick)",
        archiveAsked() && took <= 20_000,
        `${archiveAsked() ? `asked after ${took} ms` : "never asked"}; the mirror was asked for ${mirror.asked.join(", ") || "nothing"}`
      );
      const ended = await until(
        machineState,
        (state) => state?.phase === "failed",
        30_000
      );
      sampling.abort();
      await sampler;
      check(
        "the attempt ends at its download (the mirror holds no archive), its error its own, never the wait's",
        ended?.phase === "failed" &&
          ended.error !== undefined &&
          ended.error !== waits &&
          ended.error !==
            updatesWords.waitsForHub(next.manifest.version, false),
        JSON.stringify(ended)
      );
      // What the machine said before the hub restarted: its download's failure comes after.
      const waited = samples.filter((state) => state.updatedAt < restarted);
      const phases = [...new Set(samples.map((state) => state.phase))];
      check(
        "while it waited for its hub, the hub never recorded the machine as failed",
        waited.some((state) => state.phase === "waiting-for-hub") &&
          waited.every((state) => state.phase !== "failed"),
        `phases seen in order: ${phases.join(" → ")}; ${waited.length} looks before the hub restarted`
      );
      check(
        "no attempt carried an error from before it",
        samples.every(
          (state) =>
            !["available", "downloading", "ready", "installing"].includes(
              state.phase
            ) || state.error === undefined
        ),
        JSON.stringify(
          samples.find(
            (state) =>
              ["available", "downloading", "ready", "installing"].includes(
                state.phase
              ) && state.error !== undefined
          ) ?? null
        )
      );
    } finally {
      await standIn.stop(true);
      await mirror.stop();
    }
  },
};

export default spec;
