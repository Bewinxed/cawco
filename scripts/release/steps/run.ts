import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ReleaseManifest } from "../../../packages/core/src/release-manifest";
import { ask } from "../../lib/outside-call";
import type { Runner } from "../binary-tests";
import { alone, repo } from "./shared";

/** The arm64 userland a published linux-arm64 binary runs on here: see {@link arm64Sysroot}. */
const ARM64_LIBC = {
  url: "https://snapshot.debian.org/file/6ee536e6a461ca319776fac983202946f4d3dce8/libc6_2.41-12%2Bdeb13u4_arm64.deb",
  sha256: "8784eda966b189c777a384dac5ce009e8fc9b52d006926c5a013e7fa8aa688cc",
};
const arm64Root = join(homedir(), ".cache", "cawco-release", "arm64-sysroot");

/**
 * The arm64 userland a published linux-arm64 binary runs on here, through
 * the host's qemu-aarch64 binfmt entry: Debian trixie's glibc, which is all
 * a Bun binary links (libc, ld, libpthread, libdl, libm). Pinned by its
 * snapshot.debian.org address and sha256, unpacked once.
 */
const arm64Sysroot = async (run: Runner): Promise<string> => {
  if (
    await Bun.file(join(arm64Root, "lib", "ld-linux-aarch64.so.1")).exists()
  ) {
    return arm64Root;
  }
  const deb = (
    await ask("the arm64 glibc package", ARM64_LIBC.url, {}, 5 * 60_000)
  ).bytes;
  const sha256 = new Bun.CryptoHasher("sha256").update(deb).digest("hex");
  if (sha256 !== ARM64_LIBC.sha256) {
    throw new Error(
      `The arm64 glibc package's sha256 is ${sha256}, not the pinned ${ARM64_LIBC.sha256}`
    );
  }
  const temp = `${arm64Root}.${process.pid}`;
  await rm(temp, { recursive: true, force: true });
  await mkdir(temp, { recursive: true });
  await writeFile(join(temp, "libc6.deb"), deb);
  await run(["ar", "x", "libc6.deb"], temp);
  await run(
    [
      "sh",
      "-c",
      "tar -xf data.tar.* && rm -f libc6.deb data.tar.* control.tar.* debian-binary && ln -s usr/lib lib",
    ],
    temp
  );
  await rm(arm64Root, { recursive: true, force: true });
  await rename(temp, arm64Root);
  return arm64Root;
};

/** `env`'s exit status when it cannot execute the program: here, an arm64 binary with no binfmt entry. */
const CANNOT_EXECUTE = 126;

/**
 * A published linux binary run on this host before it is published, under a
 * scratch HOME and nothing else of this run's environment: `--version`, and
 * `build-info`, which must name the build's version, commit and protocol.
 * linux-arm64 runs through the qemu-aarch64 binfmt entry on the pinned glibc
 * above; a host without the entry cannot run it, and the release stops there.
 */
export const runPublished = async (
  run: Runner,
  target: string,
  binary: string,
  home: string,
  expect: Pick<ReleaseManifest, "commit" | "protocol" | "version">
): Promise<void> => {
  const env = [
    "env",
    "-i",
    `PATH=${process.env.PATH ?? ""}`,
    `HOME=${home}`,
    ...(target === "linux-arm64"
      ? [`QEMU_LD_PREFIX=${await arm64Sysroot(run)}`]
      : []),
  ];
  const say = (args: string[]): Promise<string> =>
    run([...env, binary, ...args], repo, true).catch((error: unknown) => {
      if (String(error).includes(`exit status ${CANNOT_EXECUTE}:`)) {
        throw new Error(
          `The published ${target} binary cannot run on this host: it has no qemu-aarch64 binfmt entry. Install it: sudo apt install qemu-user-binfmt`,
          { cause: error }
        );
      }
      throw error;
    });
  const version = await say(["--version"]);
  if (!version.includes(expect.version)) {
    throw new Error(
      `The published ${target} binary says ${version}, not ${expect.version}`
    );
  }
  const info = JSON.parse(await say(["build-info"])) as Pick<
    ReleaseManifest,
    "commit" | "protocol" | "version"
  >;
  if (
    info.version !== expect.version ||
    info.commit !== expect.commit ||
    JSON.stringify(info.protocol) !== JSON.stringify(expect.protocol)
  ) {
    throw new Error(
      `The published ${target} binary's build-info ${JSON.stringify(info)} is not this build's ${JSON.stringify(expect)}`
    );
  }
  console.log(`published ${target} binary ran: ${version}, build-info matches`);
};

await alone(
  import.meta,
  "bun scripts/release/steps/run.ts --commit SHA --target linux-x64|linux-arm64 [--staging DIR] [--version V]\n  The compiled linux binary run under a scratch HOME: --version and build-info must match the manifest (<staging>/manifest.json, or --version V).",
  ({ run, staging, infoHome, manifest }, flags) =>
    runPublished(
      run,
      flags.required("--target"),
      join(staging, flags.required("--target"), "cawco"),
      infoHome,
      manifest()
    )
);
