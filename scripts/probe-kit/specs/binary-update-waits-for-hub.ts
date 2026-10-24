/**
 * A machine other than the hub's own, told to install a build its hub does
 * not speak yet, waits for its hub: it never says failed, its install
 * stands through a hub that fails to answer its offer, and it goes on by
 * itself once its hub runs a build that speaks it and has confirmed it,
 * with no check and no second press.
 *
 * A scratch fleet laid out as a binary install on nightly N, as
 * binary-update-found's (binary-install.ts `installedOn`), the mirror serving
 * the two newest published nightlies; auto-update is off, so only the one
 * Install now moves the machine. Its updater reads its hub through a
 * stand-in (installation.json `hubUrl`) that passes every request on and
 * plays the hub: its offer (`/latest`) answers 503 once when told to, and
 * its `/health` names a protocol below every one N+1 speaks (the old hub),
 * answers 503 (a hub mid-restart), names the hub's own protocol with its
 * machine's trial still open (`trial`), and then passes the hub's own
 * `/health` on (the trial confirmed). The machine's socket reaches the hub
 * itself, so the hub's restart is a register with the restarted hub. In
 * order:
 *
 * 1. N+1 published and found; one Install now while the offer answers 503:
 *    nothing is installed, downloaded or marked failed. At the machine's next
 *    tick the same command finds the hub behind: the hub records
 *    `waiting-for-hub`, `hubWait` behind, no error, and the Update cell says
 *    it in its words.
 * 2. The hub answers 503 for its health, through one update tick (60 s): it
 *    still waits, now for the hub to answer, and nothing is downloaded.
 * 3. The hub restarts into a build that speaks N+1's protocol, its trial
 *    open: at its register with the restarted hub the machine looks at once,
 *    waits for the trial (`hubWait` trial) and tells the hub so then, not at
 *    its next beat; through one more tick it still waits, nothing
 *    downloaded.
 * 4. The trial is confirmed: at its next tick the machine asks for N+1's
 *    archive. The stand-in answers it 200 and sends part of it, then holds.
 * 5. The hub is killed mid-download (it and its stand-in stop, the download's
 *    connection cut: ECONNRESET), and stays down through an update tick (every
 *    ask refused: ECONNREFUSED). The nightlies of 2026-10-23 recorded both as
 *    a failed attempt, retried on the retry schedule. Here no failure is
 *    recorded for N+1 (update-failures.json), and the machine's own state
 *    waits for its hub (`hubWait` unanswered), never `downloading` or failed.
 * 6. The hub comes back and answers the archive 500: at its register with the
 *    returned hub the machine asks for the archive again at once, no retry
 *    delay waited out; and that 500, an answer that refused, is a failed
 *    attempt: recorded for N+1 with its retry time a minute on, its error the
 *    download's own, never a wait's.
 *
 * No archive is ever whole, so no real build is extracted and no update
 * helper reaches this host's service manager. The hub's record of the
 * machine is read every 250 ms from the Install now to the 500 (a look the
 * downed hub did not answer is skipped): it never says failed before the
 * 500, and the attempt carries no error from before it.
 *
 *   bun scripts/probe-kit/run.ts binary-update-waits-for-hub
 */

import { join } from "node:path";
import {
  cellFor,
  displayVersion,
} from "../../../apps/dashboard/src/lib/cawco/updates/model";
import {
  type BinaryUpdateState,
  hubWaitWords,
} from "../../../packages/core/src/binary-updates";
import { downloadWords } from "../../../packages/core/src/words/downloads";
import { updatesWords } from "../../../packages/core/src/words/updates";
import { type Fleet, MACHINE } from "../../scratch-fleet";
import {
  checkoutSchema,
  installedOn,
  newestNightlies,
  nightlyMirror,
  until,
} from "../binary-install";
import type { Kit, Spec } from "../kit";
import { shaped } from "../words";

interface UpdateReport {
  installed: boolean;
  skipped?: string;
}

/**
 * How the stand-in answers the machine's `/health`: as the old hub, as a hub
 * mid-restart, as the restarted hub with its trial still open, or as the
 * hub says (its trial confirmed).
 */
type Plays = "old" | "restarting" | "trial" | "hub";

/** How the stand-in answers N+1's archive: passed to the hub, part sent then held (cut when the hub goes), or 500. */
type ArchivePlays = "pass" | "partial" | "500";

/** What the machine's updater wrote, read from its own folder: its failure record and its state. */
interface Failure {
  count: number;
  error: string;
  nextAt: number;
  version: string;
}
const readJson = async <T>(path: string): Promise<T | undefined> =>
  (await Bun.file(path)
    .json()
    .catch(() => undefined)) as T | undefined;

/** What the stand-in's 500 for the archive says. */
const ARCHIVE_REFUSED_WORDS = "the hub failed to supply it";

/** The stand-in's answer for N+1's archive, as it plays it; undefined passes it to the hub. */
const archiveAnswer = (plays: ArchivePlays): Response | undefined => {
  switch (plays) {
    case "pass":
      return;
    case "500":
      return new Response(ARCHIVE_REFUSED_WORDS, { status: 500 });
    case "partial":
      // A first part, then nothing until the hub goes and cuts it.
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(64 * 1024));
          },
        })
      );
    default: {
      const unhandled: never = plays;
      throw new Error(`unhandled archive play: ${String(unhandled)}`);
    }
  }
};

/** Where the machine's updater keeps its failure record and its state (core binary-installation.ts `binaryRoot`). */
const updaterFiles = (fleet: Fleet) => {
  const binary = join(fleet.env.XDG_DATA_HOME ?? "", "cawco", "binary");
  return {
    failures: join(binary, "update-failures.json"),
    state: join(binary, "update-state.json"),
  };
};

/**
 * Leg 5's reading, the hub down through an update tick after it cut the
 * download: both connection errors said as a hub that did not answer, no
 * failure recorded for `version`, and the machine's own state waiting for
 * its hub.
 */
async function checkCutIsNoFailure(
  check: Kit["check"],
  fleet: Fleet,
  version: string
): Promise<void> {
  const files = updaterFiles(fleet);
  const kept = await readJson<Failure>(files.failures);
  const local = await readJson<BinaryUpdateState>(files.state);
  const dropped = shaped(updatesWords.hubDropped);
  const retried = shaped(downloadWords.retrying);
  const lines = (await fleet.logs("agent")).split("\n");
  const said = lines.filter((line) => dropped.test(line));
  const codes = new Set(said.map((line) => dropped.exec(line)?.[2]));
  const cutThenAsked = lines.filter(
    (line) =>
      retried.test(line) && line.includes(downloadWords.cut("ECONNRESET"))
  );
  check(
    "a hub killed mid-download is a cut the download goes on from at once (ECONNRESET, its next attempt logged), and a hub refusing every ask after it through an update tick is one that did not answer (ECONNREFUSED): both said so in the agent's log",
    cutThenAsked.length > 0 && codes.has("ECONNREFUSED"),
    JSON.stringify([...cutThenAsked.slice(0, 2), ...said.slice(0, 3)])
  );
  check(
    "no failure is recorded for N+1",
    kept?.version !== version,
    JSON.stringify(kept ?? null)
  );
  check(
    "the machine's own state waits for its hub to answer: not downloading, not failed, no error",
    local?.phase === "waiting-for-hub" &&
      local.hubWait === "unanswered" &&
      local.availableVersion === version &&
      local.error === undefined,
    JSON.stringify(local)
  );
}

/**
 * Leg 6's reading, the returned hub having answered the archive 500 to the
 * ask at `again`: a failed attempt, said with the download's own error, and
 * recorded for `version`, its first, retried a minute on.
 */
async function checkRefusalFails(
  check: Kit["check"],
  fleet: Fleet,
  version: string,
  ended: BinaryUpdateState | undefined,
  again: number
): Promise<void> {
  const recorded = await readJson<Failure>(updaterFiles(fleet).failures);
  check(
    "the hub's 500 for the archive is a failed attempt: the hub records the machine failed with the download's own error, never a wait's",
    ended?.phase === "failed" &&
      ended.error === downloadWords.hubRefused(500, ARCHIVE_REFUSED_WORDS) &&
      !(["behind", "unanswered", "trial"] as const).some(
        (wait) => ended.error === hubWaitWords(version, wait)
      ),
    JSON.stringify(ended)
  );
  check(
    "and records the failure for N+1, its first, with its retry time a minute on",
    recorded?.version === version &&
      recorded.count === 1 &&
      recorded.nextAt >= again + 60_000 &&
      recorded.nextAt <= again + 70_000,
    `${JSON.stringify(recorded ?? null)}; asked at ${again}`
  );
}

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
    /** How many of the next offers the stand-in answers 503, as a hub whose release host's read failed. */
    let offersRefused = 0;
    let archivePlays: ArchivePlays = "pass";
    /** When the machine asked the stand-in for an archive, each time. */
    const archiveAsks: number[] = [];
    let hubBase = "";
    /** What the stand-in answers itself on `pathname`, the hub unasked; undefined passes it on. */
    const playedAnswer = (pathname: string): Response | undefined => {
      if (pathname === "/health" && plays === "restarting") {
        return new Response("the hub is starting", { status: 503 });
      }
      if (pathname === "/api/binary-updates/latest" && offersRefused > 0) {
        offersRefused -= 1;
        return new Response("the release host did not answer", {
          status: 503,
        });
      }
      if (!pathname.startsWith("/api/binary-updates/artifacts/")) {
        return;
      }
      archiveAsks.push(Date.now());
      return archiveAnswer(archivePlays);
    };
    // The stand-in, on one port for the whole run; down while the hub is,
    // as the hub's own address is (a refused connection, never an answer).
    const standInOn = (port: number) =>
      Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(request) {
          const url = new URL(request.url);
          const played = playedAnswer(url.pathname);
          if (played) {
            return played;
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
          return Response.json(
            plays === "trial"
              ? { ...health, trial: true }
              : { ...health, build: { ...health.build, protocol: below } }
          );
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

      // 1. N+1 found; one Install now while the hub's offer answers 503, its hub speaking below N+1.
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
      offersRefused = 1;
      const report = await fleet.api<UpdateReport>(
        `/api/agents/${MACHINE}/update`,
        { version: found.version, commandId: crypto.randomUUID() }
      );
      const refused = await machineState();
      check(
        "an Install now whose offer the hub answers 503 installs nothing, downloads nothing and is not marked failed",
        offersRefused === 0 &&
          !report.installed &&
          refused?.phase !== "failed" &&
          !archiveAsked(),
        `${JSON.stringify(report)}; the hub records ${refused?.phase}`
      );
      const waiting = await until(
        machineState,
        (state) => state?.phase === "waiting-for-hub",
        75_000
      );
      check(
        "at its next tick the same command finds its hub behind: the hub records the machine waiting for its hub, with no error",
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
            hubWaitWords(displayVersion(next.manifest.version), "behind"),
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

      // 3. The hub restarts into a build that speaks N+1's protocol, its trial open.
      await fleet.stop("hub");
      await standIn.stop(true);
      plays = "trial";
      standIn = standInOn(standInPort);
      fleet.launch("hub");
      await fleet.hubUp();
      const answered = Date.now();
      const onTrial = await until(
        machineState,
        (state) => state?.hubWait === "trial",
        20_000
      );
      // On the hub's record, as the person's row reads it: told at once, not
      // at the machine's next beat (a hub's trial is shorter than a beat).
      const seen = Date.now() - answered;
      check(
        "within 10 s of the restarted hub answering, mid-trial, the hub's record of the machine says it waits for the trial (its register with the hub, told at once)",
        onTrial?.phase === "waiting-for-hub" &&
          onTrial.hubWait === "trial" &&
          onTrial.error === undefined &&
          seen <= 10_000,
        `seen on the hub ${seen} ms after it answered, written ${(onTrial?.updatedAt ?? 0) - answered} ms after; ${JSON.stringify(onTrial)}`
      );
      await Bun.sleep(65_000);
      const held = await machineState();
      check(
        "through an update tick with the hub's trial still open, it still waits, nothing downloaded",
        held?.phase === "waiting-for-hub" &&
          held.hubWait === "trial" &&
          !archiveAsked(),
        `the mirror was asked for ${mirror.asked.join(", ") || "nothing"}; ${JSON.stringify(held)}`
      );

      // 4. The trial is confirmed; the archive comes part-way, then holds.
      plays = "hub";
      archivePlays = "partial";
      const confirmed = Date.now();
      const downloading = await until(
        machineState,
        (state) => state?.phase === "downloading",
        75_000
      );
      check(
        "once the hub's trial is confirmed, the machine asks for N+1's archive by itself at its next tick, on the same command, and the hub records it downloading",
        archiveAsks.length === 1 && downloading?.phase === "downloading",
        `${archiveAsks.length} asks, the first ${(archiveAsks[0] ?? confirmed) - confirmed} ms after the confirm; ${JSON.stringify(downloading)}`
      );

      // 5. The hub is killed mid-download and stays down through an update tick.
      await fleet.stop("hub");
      await standIn.stop(true);
      await Bun.sleep(65_000);
      await checkCutIsNoFailure(check, fleet, next.manifest.version);

      // 6. The hub comes back, and answers the archive 500.
      archivePlays = "500";
      standIn = standInOn(standInPort);
      fleet.launch("hub");
      await fleet.hubUp();
      const back = Date.now();
      // The agent registers again at the hub's first answer (daemon.ts
      // `HUB_PROBE`; spec hub-down-reconnect).
      await fleet.agentUp();
      const registered = Date.now();
      await until(
        async () => archiveAsks.length,
        (asks) => asks >= 2,
        15_000
      );
      // Never asked again: the checks below fail on it.
      const [, again = Number.POSITIVE_INFINITY] = archiveAsks;
      check(
        "at its register with the returned hub, the machine asks for N+1's archive again within 5 s, no retry delay waited out",
        again >= back && again - registered <= 5000,
        `asked ${archiveAsks.length} times; registered ${registered - back} ms after the hub answered, asked again ${again - registered} ms after the register was seen`
      );
      const ended = await until(
        machineState,
        (state) => state?.phase === "failed",
        30_000
      );
      sampling.abort();
      await sampler;
      await checkRefusalFails(
        check,
        fleet,
        next.manifest.version,
        ended,
        again
      );
      // What the hub recorded before the 500. Its `downloading` is leg 4's
      // check: the hub is killed the moment it is seen, so a 250 ms look
      // may miss it.
      const before500 = samples.filter((state) => state.updatedAt < again);
      const phases = [...new Set(samples.map((state) => state.phase))];
      check(
        "until the hub's 500, the hub never recorded the machine as failed: through its waits, its download, and the hub's kill mid-download",
        before500.some((state) => state.phase === "waiting-for-hub") &&
          before500.every((state) => state.phase !== "failed"),
        `phases seen in order: ${phases.join(" → ")}; ${before500.length} looks before the 500`
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
