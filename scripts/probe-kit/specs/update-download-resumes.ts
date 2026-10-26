/**
 * Updates › a build's download that keeps making progress always finishes,
 * however slow the link; only one that stops making progress is abandoned,
 * and the next attempt asks only for the rest (core resumable-download.ts).
 * Both legs: the hub fetching from its release host, and a machine fetching
 * from its hub. And a command is an attempt now, inside a failed attempt's
 * retry delay (agent binary-update.ts `#retryDelayed`).
 *
 * 2026-10-24, obelisk: nightly 5488's 117.7 MB archive came from GitHub at
 * about 237 KB/s, and a 600 s deadline on the whole body abandoned it on
 * every machine, each attempt from byte 0; Install now then answered the
 * last failure ("The operation timed out.") and tried nothing.
 *
 * A scratch fleet laid out as a binary install on nightly N
 * (binary-install.ts `installedOn`), its hub reading releases from a release
 * host of this spec's own, which publishes N+1 (the newest published
 * nightly, its signed manifest and its real linux archive as GitHub serves
 * them, downloaded once into `$TMPDIR/probe-kit/release-archives/`). The
 * machine reads its hub through a stand-in that passes every request on
 * and refuses the machine's `installing` report: the install stops there,
 * once the build is downloaded, verified, extracted and its binary checked
 * (staged), so no update helper or harness pin reaches this host. Each case
 * is one Install now, then a Cancel once its attempt is recorded; every
 * command after the first comes inside the last failure's retry delay.
 *
 * Both servers can trickle a body, stall it past the stall window
 * ({@link STALL_MS}, 60 s) then serve the rest only to an ask with `Range`
 * (an ask without it is refused 409), cut its connection, or flip one byte;
 * each logs every ask (its Range, its status, the bytes it sent).
 *
 * The hub's leg, the release host playing:
 * (t) a flipped byte: the hub refuses the archive, deletes its partial and
 *     holds nothing; the machine's attempt fails with those words.
 * (a) a trickle at 150 KB/s for 240 s (4× the stall window) with a 45 s
 *     silence in it, then the rest. At 150 KB/s the 117.7 MB archive takes
 *     785 s, past the old 600 s deadline; so a trickle 4× the window, with
 *     a silence of ¾ of it, stands for the slow link that failed. One ask,
 *     never abandoned, the machine meanwhile saying the hub's progress.
 * (b) a stall at 20 MB past the window; (c) a cut at 50 MB. Each: a second
 *     ask with `Range: bytes=<what the hub had>-`, answered 206 with only
 *     the rest, and the hub's copy verified.
 * The machine's leg, the stand-in playing on the hub's own body, which Bun
 * serves with Range: (a) a trickle at 150 KB/s for 180 s with a 45 s
 * silence, (b) a stall at 30 MB, (c) a cut at 50 MB, each staged as above
 * with only the rest asked again; (t) a flipped byte, refused, the
 * machine's partial deleted.
 *
 *   bun scripts/probe-kit/run.ts update-download-resumes
 */
import { readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cellFor } from "../../../apps/dashboard/src/lib/cawco/updates/model";
import {
  RELEASE_REPOSITORY,
  releaseTag,
} from "../../../packages/core/src/binary-distribution";
import { EXECUTABLE_IN_VERSION } from "../../../packages/core/src/binary-installation";
import type { BinaryUpdateState } from "../../../packages/core/src/binary-updates";
import type { ReleaseManifest } from "../../../packages/core/src/release-manifest";
import {
  downloadResumably,
  fileMatches,
  STALL_MS,
} from "../../../packages/core/src/resumable-download";
import { downloadWords } from "../../../packages/core/src/words/downloads";
import { type Fleet, MACHINE } from "../../scratch-fleet";
import {
  checkoutSchema,
  installedOn,
  newestNightlies,
  type Signed,
  until,
} from "../binary-install";
import type { Kit, Spec } from "../kit";
import { shaped } from "../words";

type Artifact = ReleaseManifest["artifacts"][number];

/** How a server sends one body. */
type Plan =
  | { kind: "whole" }
  | { forMs: number; kind: "trickle"; perSecond: number; silenceMs: number }
  | { at: number; kind: "stall" }
  | { at: number; kind: "cut" }
  | { at: number; kind: "tamper" };

/** One ask a server answered with a body, as it went. */
interface Served {
  at: number;
  ended: "open" | "whole" | "stalled" | "cut" | "let go";
  endedAt?: number;
  from: number;
  range: string | null;
  sent: number;
  status: number;
}

const MB = 1_000_000;
const TRICKLE_PER_S = 150_000;
const SILENCE_MS = 45_000;
const PIECE = 16 * 1024;
const RANGE = /^bytes=(\d+)-$/;
const CONTENT_RANGE = /^bytes (\d+)-/;

/** Where `plan` stops a body, if it does: a stall or a cut at its byte. */
const stopAt = (plan: Plan): number | undefined =>
  plan.kind === "stall" || plan.kind === "cut" ? plan.at : undefined;

/** `piece`, starting at byte `position`, with `plan`'s flipped byte flipped when it is in it. */
function tampered(plan: Plan, position: number, piece: Uint8Array): Uint8Array {
  if (
    plan.kind !== "tamper" ||
    plan.at < position ||
    plan.at >= position + piece.byteLength
  ) {
    return piece;
  }
  const copy = piece.slice();
  copy[plan.at - position] = 255 - (copy[plan.at - position] ?? 0);
  return copy;
}

/**
 * `source` (the bytes from `from` on) sent by `plan`, one 16 KiB piece per
 * pull, so what `record.sent` counts is what the reader took.
 */
function paced(
  source: ReadableStream<Uint8Array>,
  from: number,
  plan: Plan,
  record: Served
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let position = from;
  let pending: Uint8Array = new Uint8Array(0);
  let silenced = false;
  let stalled: PromiseWithResolvers<null> | undefined;
  const started = performance.now();
  const end = (how: Served["ended"]) => {
    record.ended = how;
    record.endedAt = Date.now();
  };
  /** A trickle's pace: the next piece no sooner than its rate allows, and its one silence halfway. */
  const trickle = async () => {
    if (plan.kind !== "trickle") {
      return;
    }
    const elapsed = performance.now() - started;
    if (elapsed >= plan.forMs) {
      return;
    }
    if (!silenced && elapsed >= plan.forMs / 2) {
      silenced = true;
      await Bun.sleep(plan.silenceMs);
    }
    const due =
      ((position - from) / plan.perSecond) * 1000 +
      (silenced ? plan.silenceMs : 0);
    const now = performance.now() - started;
    if (due > now) {
      await Bun.sleep(due - now);
    }
  };
  /** At a stall: held until the reader lets go. At a cut: the connection cut. */
  const stop = async (
    controller: ReadableStreamDefaultController<Uint8Array>
  ) => {
    if (plan.kind === "stall") {
      end("stalled");
      stalled = Promise.withResolvers<null>();
      await stalled.promise;
      return;
    }
    end("cut");
    controller.error(new Error("the spec cut the connection"));
    await reader.cancel();
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (pending.byteLength === 0) {
          const read = await reader.read();
          if (read.done) {
            end("whole");
            controller.close();
            return;
          }
          pending = read.value;
        }
        const at = stopAt(plan);
        if (at !== undefined && position >= at) {
          await stop(controller);
          return;
        }
        const length = Math.min(
          PIECE,
          pending.byteLength,
          at === undefined ? PIECE : at - position
        );
        await trickle();
        controller.enqueue(tampered(plan, position, pending.slice(0, length)));
        pending = pending.subarray(length);
        position += length;
        record.sent += length;
      },
      cancel() {
        if (record.ended === "open") {
          end("let go");
        }
        stalled?.resolve(null);
        return reader.cancel();
      },
    },
    { highWaterMark: 0 }
  );
}

/**
 * What a server sends for an ask of the archive: an ask with `Range` is
 * sent whole from there; one without is sent by `plan`, and after a stall
 * or a cut a second ask without `Range` is refused, so the rest comes only
 * to an ask for it.
 */
class Player {
  plan: Plan = { kind: "whole" };
  rangesOnly = false;
  readonly served: Served[] = [];

  play(plan: Plan): void {
    this.plan = plan;
    this.rangesOnly = false;
  }

  /** The body for an ask, or the refusal of one that should have asked for the rest. */
  answer(
    range: string | null,
    status: number,
    from: number,
    source: ReadableStream<Uint8Array>,
    headers: Headers
  ): Response {
    const record: Served = {
      at: Date.now(),
      ended: "open",
      from,
      range,
      sent: 0,
      status,
    };
    this.served.push(record);
    if (!range && this.rangesOnly) {
      record.status = 409;
      record.ended = "whole";
      return new Response("this host sends the rest only to an ask for it", {
        status: 409,
      });
    }
    const plan = range ? ({ kind: "whole" } as const) : this.plan;
    if (plan.kind === "stall" || plan.kind === "cut") {
      this.rangesOnly = true;
    }
    return new Response(paced(source, from, plan, record), {
      status,
      headers,
    });
  }

  /** What it served since `mark`. */
  since(mark: number): Served[] {
    return this.served.slice(mark);
  }
}

/** A release host laid out as a mirror (`<host>/nightly/…`): N+1's manifest, its signature, and its archive by the player. */
function releaseHost(
  published: Signed,
  artifact: Artifact,
  file: string,
  player: Player
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/nightly/release.json") {
        return Response.json(published.manifest);
      }
      if (pathname === "/nightly/release.json.sig") {
        return new Response(published.signature);
      }
      if (pathname !== `/nightly/${artifact.archive}`) {
        return new Response("not served by this host", { status: 404 });
      }
      const range = request.headers.get("range");
      const from = Number(RANGE.exec(range ?? "")?.[1] ?? 0);
      const headers = new Headers({
        "content-length": String(artifact.size - from),
        "accept-ranges": "bytes",
        "content-type": "application/gzip",
      });
      if (range) {
        headers.set(
          "content-range",
          `bytes ${from}-${artifact.size - 1}/${artifact.size}`
        );
      }
      return player.answer(
        range,
        range ? 206 : 200,
        from,
        Bun.file(file).slice(from).stream(),
        headers
      );
    },
  });
  return {
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}`,
  };
}

/**
 * The machine's way to its hub: every request passed on, its archive's
 * body by the player, and its `installing` report refused, so nothing is
 * applied. Counts the asks of the archive and the installs it refused.
 */
function standIn(hubBase: () => string, archive: string, player: Player) {
  const archiveAsks: number[] = [];
  let installsRefused = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      headers.delete("host");
      let body: string | undefined;
      if (!["GET", "HEAD"].includes(request.method)) {
        body = await request.text();
        if (
          url.pathname.endsWith("/state") &&
          (JSON.parse(body) as { phase?: string }).phase === "installing"
        ) {
          installsRefused += 1;
          return new Response("this spec installs nothing", { status: 503 });
        }
      }
      const passed = await fetch(`${hubBase()}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
        timeout: false,
      });
      if (!url.pathname.endsWith(`/${archive}`)) {
        return passed;
      }
      archiveAsks.push(Date.now());
      if (!(passed.ok && passed.body)) {
        return passed;
      }
      const from = Number(
        CONTENT_RANGE.exec(passed.headers.get("content-range") ?? "")?.[1] ?? 0
      );
      const kept = new Headers();
      for (const name of ["content-length", "content-range", "content-type"]) {
        const value = passed.headers.get(name);
        if (value) {
          kept.set(name, value);
        }
      }
      return player.answer(
        request.headers.get("range"),
        passed.status,
        from,
        passed.body,
        kept
      );
    },
  });
  return {
    archiveAsks,
    installsRefused: () => installsRefused,
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}`,
  };
}

/** N+1's archive for this host, as GitHub serves it: kept in `$TMPDIR/probe-kit/release-archives/` by its hash, downloaded once. */
async function fixtureArchive(
  manifest: ReleaseManifest,
  artifact: Artifact
): Promise<string> {
  const dir = join(
    process.env.TMPDIR ?? tmpdir(),
    "probe-kit",
    "release-archives"
  );
  const file = join(dir, `${artifact.sha256}.tar.gz`);
  if (await fileMatches(file, artifact.size, artifact.sha256)) {
    return file;
  }
  await Bun.$`mkdir -p ${dir}`.quiet();
  const url = `https://github.com/${RELEASE_REPOSITORY}/releases/download/${releaseTag(manifest)}/${artifact.archive}`;
  console.log(`  downloading the fixture ${url} once`);
  await downloadResumably({
    url,
    partial: `${file}.partial`,
    size: artifact.size,
    what: artifact.archive,
    log: (line) => console.log(`  ${line}`),
  });
  if (!(await fileMatches(`${file}.partial`, artifact.size, artifact.sha256))) {
    await rm(`${file}.partial`, { force: true });
    throw new Error(`${url} does not match its signed manifest`);
  }
  await rename(`${file}.partial`, file);
  return file;
}

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

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

/** Where each side keeps what this spec reads. */
const placesOf = (fleet: Fleet, version: string, artifact: Artifact) => {
  const binary = join(fleet.env.XDG_DATA_HOME ?? "", "cawco", "binary");
  const hubCopy = join(
    dirname(fleet.env.CAWCO_DB_PATH ?? ""),
    "binary-releases",
    version,
    artifact.archive
  );
  return {
    failures: join(binary, "update-failures.json"),
    hubCopy,
    hubPartial: `${hubCopy}.partial`,
    machinePartial: join(binary, "downloads", `${artifact.archive}.partial`),
    staged: join(binary, "versions", version),
  };
};

/** Whether `served` is one ask cut short by `how`, then one asking for the rest, answered 206 with it alone. */
function resumedOnce(
  served: Served[],
  how: "stalled" | "cut",
  size: number
): { detail: string; ok: boolean } {
  const [first, second, ...more] = served.filter(
    (one) => one.status === 200 || one.status === 206 || one.status === 409
  );
  const start = Number(RANGE.exec(second?.range ?? "")?.[1] ?? -1);
  const ok =
    more.length === 0 &&
    first?.range === null &&
    first.status === 200 &&
    first.ended === how &&
    second?.status === 206 &&
    start > 0 &&
    start <= first.sent &&
    second.ended === "whole" &&
    second.sent === size - start;
  return { ok, detail: JSON.stringify(served) };
}

/** The two players, the servers they play on, and what each case reads. */
interface Stage {
  artifact: Artifact;
  check: Kit["check"];
  fleet: Fleet;
  fromHost: Player;
  fromHub: Player;
  host: ReturnType<typeof releaseHost>;
  places: ReturnType<typeof placesOf>;
  /** The hub's record of the machine, every second ({@link sample}). */
  samples: BinaryUpdateState[];
  stand: ReturnType<typeof standIn>;
  version: string;
}

/** A log line of a stopped attempt, any download (its first group the download's name). */
const RETRIED = shaped(downloadWords.retrying);
const STALLED = downloadWords.stalled(Math.round(STALL_MS / 1000));
const CUT = downloadWords.cut("ECONNRESET");

/** The log of `role`, every line. */
const logLines = async (fleet: Fleet, role: "agent" | "hub") =>
  (await fleet.logs(role)).split("\n");

/** What each leg's log calls the archive's download. */
const downloadOf = (stage: Stage, leg: "hub" | "machine"): string =>
  leg === "hub"
    ? `${stage.artifact.archive} from ${stage.host.url}`
    : downloadWords.fromHub(stage.artifact.archive);

/** The hub's record of the machine, every second, until `stop`. */
function sample(fleet: Fleet, into: BinaryUpdateState[]) {
  let sampling = true;
  const read = async (): Promise<BinaryUpdateState | undefined> => {
    const said = await fleet
      .api<{ machines: Record<string, BinaryUpdateState> }>(
        "/api/binary-updates/machines"
      )
      .catch(() => undefined);
    return said?.machines[MACHINE];
  };
  const running = (async () => {
    while (sampling) {
      // biome-ignore lint/performance/noAwaitInLoops: a sampler, one look at a time
      const state = await read();
      if (state) {
        into.push(state);
      }
      await Bun.sleep(1000);
    }
  })();
  return async () => {
    sampling = false;
    await running;
  };
}

/** What a machine's Update cell says for `state`. */
const cellOf = (state: BinaryUpdateState) =>
  cellFor(
    {
      machineId: MACHINE,
      hostname: MACHINE,
      status: "online",
      binaryUpdate: state,
    },
    { autoUpdate: false, channel: "nightly" }
  );

/**
 * One case: an Install now, its attempt to its recorded end (the install
 * the stand-in refuses, or a failure), then a Cancel. A command inside the
 * last failure's retry delay is checked to be attempted at once.
 */
async function attempt(
  stage: Stage,
  label: string,
  ms: number
): Promise<{ failure?: Failure; sampled: BinaryUpdateState[] }> {
  const { check, fleet, places, samples, stand } = stage;
  const before = await readJson<Failure>(places.failures);
  const asks = stand.archiveAsks.length;
  const sampleMark = samples.length;
  const at = Date.now();
  fleet
    .api(`/api/agents/${MACHINE}/update`, {
      version: stage.version,
      commandId: crypto.randomUUID(),
    })
    .catch(() => undefined);
  await until(
    () => Promise.resolve(stand.archiveAsks.length),
    (count) => count > asks,
    20_000
  );
  const askedAfter = (stand.archiveAsks[asks] ?? Number.NaN) - at;
  if (before && before.nextAt > at) {
    check(
      `${label}: Install now inside the last failure's retry delay (${Math.round((before.nextAt - at) / 1000)} s left, ${before.count} failed so far) is attempted at once`,
      askedAfter >= 0 && askedAfter < 10_000,
      `the machine asked its hub for the archive ${askedAfter} ms after the command; ${JSON.stringify(before)}`
    );
  }
  const failure = await until(
    () => readJson<Failure>(places.failures),
    (now) => (now?.count ?? 0) > (before?.count ?? 0),
    ms
  );
  await fleet
    .api(`/api/binary-updates/machines/${MACHINE}/cancel`, {})
    .catch(() => undefined);
  return { failure, sampled: samples.slice(sampleMark) };
}

/** That the machine staged N+1 (its binary as signed) and went on to the install the stand-in refused; the staged folder is removed after, for the next case to make again. */
async function checkStaged(
  stage: Stage,
  label: string,
  refusedBefore: number
): Promise<void> {
  const { artifact, check, places, stand } = stage;
  const binary = join(places.staged, EXECUTABLE_IN_VERSION);
  const ok = await fileMatches(
    binary,
    artifact.binarySize,
    artifact.binarySha256
  );
  check(
    `${label}: the machine staged N+1, its binary as the signed manifest names it, and went on to install it (refused here, so nothing is applied)`,
    ok && stand.installsRefused() === refusedBefore + 1,
    `${binary} ${ok ? "matches" : "does not match"}; installs refused ${stand.installsRefused()} (before ${refusedBefore})`
  );
  check(
    `${label}: the machine's partial is gone once the archive was extracted`,
    !(await exists(places.machinePartial)),
    places.machinePartial
  );
  await rm(places.staged, { recursive: true, force: true });
}

/** That the hub holds the verified archive and no partial. */
async function checkHubHolds(stage: Stage, label: string): Promise<void> {
  const { artifact, places } = stage;
  stage.check(
    `${label}: the hub holds the verified archive, and no partial`,
    (await fileMatches(places.hubCopy, artifact.size, artifact.sha256)) &&
      !(await exists(places.hubPartial)),
    places.hubCopy
  );
}

/** The hub's copy deleted, for the next case's ask to fetch again. */
async function hubDrops(stage: Stage): Promise<void> {
  await rm(stage.places.hubCopy, { force: true });
  await rm(stage.places.hubPartial, { force: true });
}

/** (t) on the hub's leg: a flipped byte from the release host. */
async function hubTampered(stage: Stage): Promise<void> {
  const { artifact, check, fromHost, places, stand } = stage;
  fromHost.play({ kind: "tamper", at: 10 * MB });
  const mark = fromHost.served.length;
  const refused = stand.installsRefused();
  const { failure } = await attempt(stage, "hub (t)", 180_000);
  const served = fromHost.since(mark);
  check(
    "hub (t): the release host sent the whole archive once, one byte flipped",
    served.length === 1 && served[0]?.sent === artifact.size,
    JSON.stringify(served)
  );
  check(
    "hub (t): the hub refused it, deleted its partial and holds nothing; the machine's attempt failed with those words, installing nothing",
    (failure?.error ?? "").includes(
      downloadWords.mismatch(`${artifact.archive} from ${stage.host.url}`)
    ) &&
      !(await exists(places.hubCopy)) &&
      !(await exists(places.hubPartial)) &&
      stand.installsRefused() === refused,
    JSON.stringify(failure)
  );
}

/** (a) on either leg: a trickle at 150 KB/s for `forMs`, a 45 s silence in it, taken whole in one ask. */
async function trickled(
  stage: Stage,
  leg: "hub" | "machine",
  forMs: number
): Promise<BinaryUpdateState[]> {
  const { artifact, check, fleet, stand } = stage;
  const player = leg === "hub" ? stage.fromHost : stage.fromHub;
  const role = leg === "hub" ? "hub" : "agent";
  player.play({
    kind: "trickle",
    perSecond: TRICKLE_PER_S,
    forMs,
    silenceMs: SILENCE_MS,
  });
  const mark = player.served.length;
  const refused = stand.installsRefused();
  const label = `${leg} (a)`;
  const { sampled } = await attempt(stage, label, forMs + 180_000);
  const served = player.since(mark);
  const [one] = served;
  const took = (one?.endedAt ?? 0) - (one?.at ?? 0);
  check(
    `${label}: one ask of the trickled archive, taken whole and never abandoned: at least ${forMs / 1000} s of body, a ${SILENCE_MS / 1000} s silence in it`,
    served.length === 1 &&
      one?.ended === "whole" &&
      one.sent === artifact.size &&
      took >= forMs &&
      !(await logLines(fleet, role)).some(
        (line) => RETRIED.exec(line)?.[1] === downloadOf(stage, leg)
      ),
    `${took} ms; ${JSON.stringify(served)}`
  );
  if (leg === "hub") {
    await checkHubHolds(stage, label);
  }
  await checkStaged(stage, label, refused);
  return sampled;
}

/** That the samples rose through at least three readings of `read`, and the cell said the last in `words`. */
function checkProgressSaid(
  stage: Stage,
  label: string,
  sampled: BinaryUpdateState[],
  read: (state: BinaryUpdateState) => BinaryUpdateState["download"],
  words: (received: number, total: number) => string
): void {
  const reads = sampled.filter(
    (state) => state.phase === "downloading" && read(state)
  );
  const seen = new Set(reads.map((state) => read(state)?.received));
  const last = reads.at(-1);
  const progress = last ? read(last) : undefined;
  const cell = last ? cellOf(last) : undefined;
  stage.check(
    label,
    seen.size >= 3 &&
      progress !== undefined &&
      cell?.meta === words(progress.received, progress.total),
    `${seen.size} readings, the last ${JSON.stringify(progress)}; its cell ${JSON.stringify(cell)}`
  );
}

/** (b) and (c) on either leg: the body stopped by `plan`, then only the rest asked for and sent. */
async function stopped(
  stage: Stage,
  leg: "hub" | "machine",
  plan: Extract<Plan, { kind: "stall" | "cut" }>
): Promise<void> {
  const { artifact, check, fleet, stand } = stage;
  const player = leg === "hub" ? stage.fromHost : stage.fromHub;
  const role = leg === "hub" ? "hub" : "agent";
  const label = `${leg} (${plan.kind === "stall" ? "b" : "c"})`;
  player.play(plan);
  const mark = player.served.length;
  const refused = stand.installsRefused();
  await attempt(stage, label, 300_000);
  const served = player.since(mark);
  const once = resumedOnce(
    served,
    plan.kind === "stall" ? "stalled" : "cut",
    artifact.size
  );
  check(
    `${label}: the ${leg}'s second ask carried Range from where its first stopped, and only the rest was sent (206)`,
    once.ok,
    once.detail
  );
  if (plan.kind === "stall") {
    const [first, rest] = served;
    const waited = (rest?.at ?? 0) - (first?.endedAt ?? 0);
    check(
      `${label}: the stall was waited out a whole window (${STALL_MS / 1000} s) before the next ask, never less`,
      waited >= STALL_MS,
      `${waited} ms`
    );
  }
  const start = Number(RANGE.exec(served[1]?.range ?? "")?.[1] ?? -1);
  const what = downloadOf(stage, leg);
  const lines = await logLines(fleet, role);
  const expected = [
    downloadWords.retrying(
      what,
      start,
      artifact.size,
      plan.kind === "stall" ? STALLED : CUT,
      2,
      1000
    ),
    downloadWords.resumed(what, start, artifact.size),
  ];
  check(
    `${label}: the ${role}'s log says where it stopped, why, and that it went on from there`,
    expected.every((line) => lines.some((said) => said.includes(line))),
    `${JSON.stringify(expected)}; the log's lines of it: ${lines
      .filter((line) => line.includes(artifact.archive))
      .slice(-4)
      .join("\n")}`
  );
  if (leg === "hub") {
    await checkHubHolds(stage, label);
  }
  await checkStaged(stage, label, refused);
}

/** (t) on the machine's leg: a flipped byte from the hub. */
async function machineTampered(stage: Stage): Promise<void> {
  const { check, fromHub, places, stand } = stage;
  fromHub.play({ kind: "tamper", at: 10 * MB });
  const mark = fromHub.served.length;
  const refused = stand.installsRefused();
  const { failure } = await attempt(stage, "machine (t)", 180_000);
  check(
    "machine (t): the machine refused the flipped archive, deleted its partial, staged and installed nothing",
    failure?.error === downloadWords.mismatch(`build ${stage.version}`) &&
      !(await exists(places.machinePartial)) &&
      !(await exists(places.staged)) &&
      stand.installsRefused() === refused &&
      fromHub.since(mark).length === 1,
    `${JSON.stringify(failure)}; ${JSON.stringify(fromHub.since(mark))}; downloads ${JSON.stringify(await readdir(dirname(places.machinePartial)).catch(() => []))}`
  );
}

/** Every case, in order: the hub's leg, then the machine's against the archive the hub then holds. */
async function cases(stage: Stage): Promise<void> {
  await hubTampered(stage);
  // The hub answers its failed fetch for a minute (core `FAILURE_KEPT_MS`).
  await Bun.sleep(62_000);
  const hubSampled = await trickled(stage, "hub", 240_000);
  checkProgressSaid(
    stage,
    "hub (a): while the hub fetched, the machine's row said downloading and how far the hub was, rising, in megabytes",
    hubSampled,
    (state) => state.hubFetch,
    downloadWords.hubFetching
  );
  await hubDrops(stage);
  await stopped(stage, "hub", { kind: "stall", at: 20 * MB });
  await hubDrops(stage);
  await stopped(stage, "hub", { kind: "cut", at: 50 * MB });
  const sampled = await trickled(stage, "machine", 180_000);
  checkProgressSaid(
    stage,
    "machine (a): its row said downloading and how far it was, rising, in megabytes",
    sampled,
    (state) => state.download,
    downloadWords.progress
  );
  await stopped(stage, "machine", { kind: "stall", at: 30 * MB });
  await stopped(stage, "machine", { kind: "cut", at: 50 * MB });
  await machineTampered(stage);
}

async function run(kit: Kit): Promise<void> {
  const { check } = kit;
  const [n, next] = await newestNightlies();
  const { version } = next.manifest;
  const target = `${process.platform}-${process.arch}`;
  const artifact = next.manifest.artifacts.find((row) => row.target === target);
  const schema = await checkoutSchema();
  const fits = check(
    `N+1 (${version}) has a ${target} archive and at least the migrations this checkout's hub holds`,
    artifact !== undefined && next.manifest.schemaVersion >= schema,
    `N+1 carries ${next.manifest.schemaVersion}, the hub ${schema}`
  );
  if (!(fits && artifact)) {
    return;
  }
  const file = await fixtureArchive(next.manifest, artifact);
  const fromHost = new Player();
  const fromHub = new Player();
  const host = releaseHost(next, artifact, file, fromHost);
  let hubBase = "";
  const stand = standIn(() => hubBase, artifact.archive, fromHub);
  try {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    hubBase = fleet.base;
    await installedOn(fleet, n, { hubUrl: stand.url, releaseHost: host.url });
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const found = await fleet.api<{ version: string }>(
      "/api/binary-updates/check",
      {}
    );
    check(
      "the hub finds N+1 on the release host",
      found.version === version,
      found.version
    );
    const samples: BinaryUpdateState[] = [];
    const stopSampling = sample(fleet, samples);
    try {
      await cases({
        artifact,
        check,
        fleet,
        fromHost,
        fromHub,
        host,
        places: placesOf(fleet, version, artifact),
        samples,
        stand,
        version,
      });
    } finally {
      await stopSampling();
    }
  } finally {
    await stand.stop();
    await host.stop();
  }
}

export default {
  group: "Release checks",
  name: "update-download-resumes",
  run,
} satisfies Spec;
