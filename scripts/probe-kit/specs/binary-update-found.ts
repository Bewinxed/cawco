/**
 * An install asked for right after a check takes the release that check
 * found, on the first call, on a machine other than the hub's own; never the
 * build the hub still runs, reported as "update is installed".
 *
 * A scratch fleet whose hub and machine share one binary install (their
 * HOME's `cawco/binary/`, role `agent`): both run nightly N, its signed
 * manifest stored as the running build's (core binary-installation.ts
 * `readRunningManifest`), and the hub reads releases from a release host of
 * the spec's own (`releaseHost`), laid out as a mirror is
 * (`<host>/nightly/release.json` and its `.sig`). The mirror serves real
 * signed nightlies, the two newest published, read from GitHub at the start,
 * so the hub and the machine verify them against the release key embedded
 * in this checkout, exactly as they verify any release. In order:
 *
 * 1. The mirror publishes N; a check (`POST /api/binary-updates/check`)
 *    finds N, and the machine polls it: nothing newer.
 * 2. The mirror publishes N+1; a check finds N+1.
 * 3. One install on the machine (`POST /api/agents/<machine>/update` naming
 *    N+1, as `update_machines` sends it): its answer names N+1 as the build
 *    it pulled, and the machine asks the hub for N+1's archive, which the
 *    hub fetches from the mirror.
 *
 * The mirror answers that archive 404: the install stops at its download,
 * so no real build is extracted, its harness pins are never run and no
 * update helper reaches this host's service manager. The answer must say
 * why it installed nothing (the hub could not supply the build), never
 * "update is installed".
 *
 *   bun scripts/probe-kit/run.ts binary-update-found
 */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RELEASE_REPOSITORY } from "../../../packages/core/src/binary-distribution";
import type { ReleaseManifest } from "../../../packages/core/src/release-manifest";
import { MACHINE } from "../../scratch-fleet";
import { ROOT, type Spec } from "../kit";

interface Signed {
  manifest: ReleaseManifest;
  signature: string;
}

interface GithubRelease {
  assets: { browser_download_url: string; name: string }[];
  draft: boolean;
  tag_name: string;
}

interface UpdateReport {
  installed: boolean;
  pulled: string;
  skipped?: string;
  to?: string;
}

const NIGHTLY = /^nightly-(\d+)-/;

/** The two newest published nightlies with a signed manifest, older first. */
async function newestNightlies(): Promise<[Signed, Signed]> {
  const response = await fetch(
    `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=30`,
    { headers: { accept: "application/vnd.github+json" } }
  );
  if (!response.ok) {
    throw new Error(
      `GitHub's release list answered ${response.status}: ${await response.text()}`
    );
  }
  const signed = ((await response.json()) as GithubRelease[])
    .filter((release) => !release.draft && NIGHTLY.test(release.tag_name))
    .map((release) => ({
      sequence: Number(NIGHTLY.exec(release.tag_name)?.[1]),
      manifest: release.assets.find((a) => a.name === "release.json"),
      signature: release.assets.find((a) => a.name === "release.json.sig"),
    }))
    .filter((row) => row.manifest && row.signature)
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 2)
    .reverse();
  if (signed.length < 2) {
    throw new Error("GitHub lists fewer than two signed nightlies");
  }
  const read = async (url: string | undefined): Promise<string> => {
    const answer = await fetch(url ?? "");
    if (!answer.ok) {
      throw new Error(`${url} answered ${answer.status}`);
    }
    return answer.text();
  };
  const [older, newer] = await Promise.all(
    signed.map(async (row) => ({
      manifest: JSON.parse(
        await read(row.manifest?.browser_download_url)
      ) as ReleaseManifest,
      signature: (await read(row.signature?.browser_download_url)).trim(),
    }))
  );
  return [older as Signed, newer as Signed];
}

/** This checkout's migrations: what the scratch hub's database holds. */
const checkoutSchema = async (): Promise<number> =>
  (
    JSON.parse(
      await readFile(
        join(ROOT, "packages/hub/drizzle/meta/_journal.json"),
        "utf8"
      )
    ) as { entries: unknown[] }
  ).entries.length;

/** Polls `read` every 500 ms until `done` holds of it, or `ms` passes; its last reading. */
async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  ms: number
): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll, one look at a time
    await Bun.sleep(500);
    value = await read();
  }
  return value;
}

const spec: Spec = {
  name: "binary-update-found",
  async run(kit) {
    const { check } = kit;
    const [n, next] = await newestNightlies();
    const schema = await checkoutSchema();
    console.log(
      `  N ${n.manifest.version}, N+1 ${next.manifest.version}; this checkout's hub holds ${schema} migrations`
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

    // The mirror: what it publishes, and every archive it is asked for.
    let published: Signed = n;
    const asked: string[] = [];
    const mirror = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/nightly/release.json") {
          return Response.json(published.manifest);
        }
        if (pathname === "/nightly/release.json.sig") {
          return new Response(published.signature);
        }
        asked.push(pathname);
        return new Response("not served by this mirror", { status: 404 });
      },
    });
    try {
      const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
      const dataHome = fleet.env.XDG_DATA_HOME;
      const dbPath = fleet.env.CAWCO_DB_PATH;
      if (!(dataHome && dbPath)) {
        throw new Error("the scratch fleet names no XDG_DATA_HOME or database");
      }
      const root = join(dataHome, "cawco", "binary");
      // Both run N: its manifest as the running build's (this checkout runs
      // as 0.0.0-dev), and its signature beside it, which the hub reads.
      for (const version of ["0.0.0-dev", n.manifest.version]) {
        const dir = join(root, "versions", version);
        // biome-ignore lint/performance/noAwaitInLoops: two folders, written in order
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "release.json"),
          `${JSON.stringify(n.manifest)}\n`
        );
        await writeFile(
          join(dir, "release.signature.json"),
          `${JSON.stringify({ signature: n.signature })}\n`
        );
      }
      await symlink(
        join(root, "versions", n.manifest.version),
        join(root, "current")
      );
      await writeFile(
        join(root, "installation.json"),
        `${JSON.stringify({
          hubUrl: fleet.base,
          installedVersion: n.manifest.version,
          releaseHost: `http://127.0.0.1:${mirror.port}`,
          role: "agent",
          root,
        })}\n`
      );
      await mkdir(dirname(dbPath), { recursive: true });
      await writeFile(
        join(dirname(dbPath), "update-policy.json"),
        `${JSON.stringify({ channel: "nightly", autoUpdate: false })}\n`
      );

      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.launch("agent");
      await fleet.agentUp();

      const machineState = async () =>
        (
          await fleet.api<{
            machines: Record<
              string,
              { availableVersion?: string; channel: string; phase: string }
            >;
          }>("/api/binary-updates/machines")
        ).machines[MACHINE];

      // 1. N published: found, polled, nothing newer.
      const foundN = await fleet.api<{ version: string }>(
        "/api/binary-updates/check",
        {}
      );
      check(
        "N published: the check finds N",
        foundN.version === n.manifest.version,
        `found ${foundN.version}`
      );
      const polled = await until(
        machineState,
        (state) => state?.channel === "nightly",
        60_000
      );
      check(
        "the machine polled the hub on the nightly channel, and N is nothing newer",
        polled?.channel === "nightly" &&
          polled.availableVersion !== n.manifest.version,
        JSON.stringify(polled)
      );

      // 2. N+1 published: the check finds it.
      published = next;
      const foundNext = await fleet.api<{ version: string }>(
        "/api/binary-updates/check",
        {}
      );
      check(
        "N+1 published: the check finds N+1",
        foundNext.version === next.manifest.version,
        `found ${foundNext.version}`
      );

      // 3. One install on the machine, as update_machines sends it.
      const before = asked.length;
      const report = await fleet.api<UpdateReport>(
        `/api/agents/${MACHINE}/update`,
        { version: foundNext.version, commandId: crypto.randomUUID() }
      );
      const archive = next.manifest.artifacts.find(
        (row) => row.target === `${process.platform}-${process.arch}`
      )?.archive;
      const fetched = asked.slice(before);
      check(
        "the first install pulls N+1",
        report.to === next.manifest.version &&
          report.pulled === `signed release ${next.manifest.version}`,
        JSON.stringify(report)
      );
      check(
        "the first install downloads N+1's archive, through the hub, from the release host",
        archive !== undefined && fetched.includes(`/nightly/${archive}`),
        `the mirror was asked for ${fetched.join(", ") || "nothing"}`
      );
      check(
        "its answer says why it installed nothing (the mirror holds no archive), never that the update is installed",
        !report.installed &&
          report.skipped !== undefined &&
          report.skipped.includes("could not supply the build"),
        report.skipped ?? "no reason given"
      );
    } finally {
      await mirror.stop(true);
    }
  },
};

export default spec;
