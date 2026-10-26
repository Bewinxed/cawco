/**
 * What the binary-update specs share: the two newest signed nightlies, read
 * from GitHub as published, so the scratch hub and machine verify them
 * against the release key embedded in this checkout exactly as they verify
 * any release; a mirror that publishes one of them as a release host does;
 * and the scratch fleet laid out as a binary install on build N (role
 * `agent`, its hub and machine sharing one `cawco/binary/`).
 */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RELEASE_REPOSITORY } from "../../packages/core/src/binary-distribution";
import type { ReleaseManifest } from "../../packages/core/src/release-manifest";
import type { Fleet } from "../scratch-fleet";
import { ROOT } from "./kit";

export interface Signed {
  manifest: ReleaseManifest;
  signature: string;
}

interface GithubRelease {
  assets: { browser_download_url: string; name: string }[];
  draft: boolean;
  tag_name: string;
}

const NIGHTLY = /^nightly-(\d+)-/u;

/** The two newest published nightlies with a signed manifest, older first. */
export async function newestNightlies(): Promise<[Signed, Signed]> {
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
export const checkoutSchema = async (): Promise<number> =>
  (
    JSON.parse(
      await readFile(
        join(ROOT, "packages/hub/drizzle/meta/_journal.json"),
        "utf8"
      )
    ) as { entries: unknown[] }
  ).entries.length;

/** Polls `read` every 250 ms until `done` holds of it, or `ms` passes; its last reading. */
export async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  ms: number
): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < end) {
    await Bun.sleep(250);
    value = await read();
  }
  return value;
}

/**
 * A release host on loopback, laid out as a mirror is
 * (`<host>/nightly/release.json` and its `.sig`): it publishes `published`,
 * and answers every other path 404, each recorded in `asked`, so an install
 * stops at its download and no real build is extracted, no harness pin is
 * run and no update helper reaches this host's service manager.
 */
export function nightlyMirror(first: Signed): {
  asked: string[];
  publish: (release: Signed) => void;
  stop: () => Promise<void>;
  url: string;
} {
  let published = first;
  const asked: string[] = [];
  const server = Bun.serve({
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
  return {
    asked,
    publish: (release) => {
      published = release;
    },
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}`,
  };
}

/**
 * The scratch fleet as a binary install on `n`, before its services start:
 * its hub and machine share one `cawco/binary/` (role `agent`), both running
 * N, its signed manifest stored as the running build's (core
 * binary-installation.ts `readRunningManifest`; this checkout runs as
 * 0.0.0-dev) with its signature beside it, which the hub reads; the
 * machine's updater reads its hub at `hubUrl` and the hub its releases at
 * `releaseHost`; and the fleet's policy is the nightly channel, auto-update
 * off.
 */
export async function installedOn(
  fleet: Fleet,
  n: Signed,
  addresses: { hubUrl: string; releaseHost: string }
): Promise<void> {
  const dataHome = fleet.env.XDG_DATA_HOME;
  const dbPath = fleet.env.CAWCO_DB_PATH;
  if (!(dataHome && dbPath)) {
    throw new Error("the scratch fleet names no XDG_DATA_HOME or database");
  }
  const root = join(dataHome, "cawco", "binary");
  for (const version of ["0.0.0-dev", n.manifest.version]) {
    const dir = join(root, "versions", version);
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
      hubUrl: addresses.hubUrl,
      installedVersion: n.manifest.version,
      releaseHost: addresses.releaseHost,
      role: "agent",
      root,
    })}\n`
  );
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(
    join(dirname(dbPath), "update-policy.json"),
    `${JSON.stringify({ channel: "nightly", autoUpdate: false })}\n`
  );
}
