/** Local, trigger-free release pipeline. Never publishes, tags or uploads. */
// biome-ignore-all lint/performance/noAwaitInLoops: the owner requires one build at a time, including signing and promotion.
import { createPublicKey } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { freemem, homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  type ReleaseManifest,
  signManifest,
  verifyManifest,
} from "../packages/core/src/release-manifest";
import { SESSIOND_V1 } from "../packages/core/src/sessiond";
import { PINNED_BUN, TARGETS } from "./build-binary";
import { publishRelease } from "./publish-release";
import { signingPem, takeSigningKey } from "./release-signing";

const repo = resolve(import.meta.dir, "..");
const argv = Bun.argv.slice(2);
function argument(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
}
const commitInput = argument("--commit");
const channel = argument("--channel");
const output = argument("--output");
if (
  !(commitInput && output && isAbsolute(output)) ||
  (channel !== "stable" && channel !== "nightly")
) {
  throw new Error(
    "Usage: bun scripts/release.ts --commit REF --channel stable|nightly --output /absolute/path [--tag vX.Y.Z] [--mac-host mac]"
  );
}
if (Bun.version !== PINNED_BUN) {
  throw new Error(`Release pipeline requires Bun ${PINNED_BUN}`);
}
const signingKeyBase64 = await takeSigningKey();
async function run(
  command: string[],
  cwd = repo,
  capture = false
): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
  });
  const text = capture ? await new Response(child.stdout).text() : "";
  if ((await child.exited) !== 0) {
    throw new Error(`Release command failed: ${command.join(" ")}`);
  }
  return text.trim();
}
const commit = await run(
  ["git", "rev-parse", `${commitInput}^{commit}`],
  repo,
  true
);
const state = join(homedir(), ".cache", "cawco", "release-pipeline");
await mkdir(state, { recursive: true });
const queued = join(state, "queued.json");
const request: {
  commit: string;
  channel: "stable" | "nightly";
  tag?: string;
  macHost: string;
  output: string;
} = {
  commit,
  channel,
  tag: argument("--tag"),
  macHost: argument("--mac-host") ?? "mac",
  output,
};
const previous = (await Bun.file(queued)
  .json()
  .catch(() => undefined)) as typeof request | undefined;
if (previous && previous.commit !== commit) {
  const ancestry = Bun.spawn(
    ["git", "merge-base", "--is-ancestor", commit, previous.commit],
    { cwd: repo, stdout: "ignore", stderr: "ignore" }
  );
  if ((await ancestry.exited) === 0) {
    console.log(`Superseded by newer queued commit ${previous.commit}`);
    process.exit(0);
  }
}
const temp = `${queued}.${process.pid}`;
await writeFile(temp, JSON.stringify(request));
await rename(temp, queued);
const lock = join(state, "build.lock");
try {
  await mkdir(lock);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
    throw error;
  }
  console.log(`Queued ${commit}; one build is already running`);
  process.exit(0);
}
await writeFile(join(lock, "pid"), String(process.pid));
try {
  let current = request;
  for (;;) {
    // A newer request may have arrived before this lease started doing work.
    current = (await Bun.file(queued).json()) as typeof request;
    if (freemem() < 4 * 1024 ** 3) {
      throw new Error(
        "Release build refused: less than 4 GiB available memory"
      );
    }
    const checkout = join(state, `checkout-${current.commit.slice(0, 12)}`);
    await run(["git", "worktree", "add", "--detach", checkout, current.commit]);
    const staging = join(state, `staging-${current.commit.slice(0, 12)}`);
    await mkdir(staging, { recursive: true });
    try {
      await run([process.execPath, "install", "--frozen-lockfile"], checkout);
      await run([process.execPath, "run", "typecheck"], checkout);
      await run([process.execPath, "run", "lint"], checkout);
      const base = (
        await Bun.file(join(checkout, "packages/cli/package.json")).json()
      ).version as string;
      let version: string;
      let notes: string;
      if (current.channel === "stable") {
        if (
          current.tag !== `v${base}` ||
          (await run(
            ["git", "rev-parse", `${current.tag}^{commit}`],
            checkout,
            true
          )) !== current.commit
        ) {
          throw new Error(
            "Stable builds require a matching vX.Y.Z tag at the input commit"
          );
        }
        version = base;
        notes = await readFile(
          join(checkout, "docs/releases", `${version}.md`),
          "utf8"
        );
        if (!notes.trim()) {
          throw new Error("Stable end-user release notes are empty");
        }
      } else {
        const count = await run(
          ["git", "rev-list", "--first-parent", "--count", current.commit],
          checkout,
          true
        );
        version = `${base}-nightly.${count}+${current.commit.slice(0, 12)}`;
        const last = (await Bun.file(join(current.output, "release.json"))
          .json()
          .catch(() => undefined)) as ReleaseManifest | undefined;
        const range =
          last?.channel === "nightly"
            ? `${last.commit}..${current.commit}`
            : current.commit;
        notes = await run(
          [
            "git",
            "log",
            "--format=%s",
            range,
            "--",
            "packages",
            "apps/dashboard",
            "scripts/build-binary.ts",
          ],
          checkout,
          true
        );
      }
      // One compile at a time, sharing only immutable prepared assets.
      const proofBinary = join(staging, "cawco-proof");
      await run(
        [
          process.execPath,
          "scripts/build-binary.ts",
          "linux-x64",
          proofBinary,
          version,
          current.commit,
          "--proof",
        ],
        checkout
      );
      const podman = Bun.which("podman");
      if (podman) {
        await run(
          [
            "bash",
            "scripts/binary/prove-stage1.sh",
            join(staging, "container-proof"),
            proofBinary,
          ],
          checkout
        );
      } else {
        console.log(
          "Container runtime absent: proof must be run by the operator before accepting this build"
        );
      }
      const manifest: ReleaseManifest = {
        version,
        commit: current.commit,
        channel: current.channel,
        protocol: { min: 1, max: 1 },
        sessiondProtocol: SESSIOND_V1,
        notes,
        testSigned: false,
        artifacts: [],
      };
      for (const target of TARGETS) {
        if (freemem() < 4 * 1024 ** 3) {
          throw new Error(
            "Release build refused: less than 4 GiB available memory"
          );
        }
        const dir = join(staging, target);
        await mkdir(dir, { recursive: true });
        const binary = join(dir, "cawco");
        await run(
          [
            process.execPath,
            "scripts/build-binary.ts",
            target,
            binary,
            version,
            current.commit,
            "--skip-prepare",
          ],
          checkout
        );
        if (target.startsWith("darwin")) {
          const remote = `/tmp/cawco-binary-sign-${current.commit.slice(0, 12)}-${target}`;
          await run(["ssh", current.macHost, "mkdir", "-p", remote]);
          try {
            await run(["scp", binary, `${current.macHost}:${remote}/cawco`]);
            await run([
              "ssh",
              current.macHost,
              `codesign --force --sign - --preserve-metadata=entitlements '${remote}/cawco' && codesign --verify --strict '${remote}/cawco'`,
            ]);
            await run(["scp", `${current.macHost}:${remote}/cawco`, binary]);
          } finally {
            await run(["ssh", current.macHost, "rm", "-rf", remote]);
          }
        }
        const archive = `cawco-${version}-${target}.tar.gz`;
        await run(
          ["tar", "-czf", join(staging, archive), "-C", dir, "cawco"],
          checkout
        );
        const sha256 = new Bun.CryptoHasher("sha256")
          .update(await Bun.file(join(staging, archive)).bytes())
          .digest("hex");
        const binarySha256 = new Bun.CryptoHasher("sha256")
          .update(await Bun.file(binary).bytes())
          .digest("hex");
        manifest.artifacts.push({
          target,
          archive,
          sha256,
          size: (await stat(join(staging, archive))).size,
          binarySha256,
          binarySize: (await stat(binary)).size,
        });
        await writeFile(
          join(staging, `${archive}.sha256`),
          `${sha256}  ${archive}\n`
        );
      }
      await writeFile(
        join(staging, "SHA256SUMS"),
        manifest.artifacts.map((a) => `${a.sha256}  ${a.archive}\n`).join("")
      );
      const privatePem = signingPem(signingKeyBase64);
      const signature = signManifest(manifest, privatePem);
      verifyManifest(
        manifest,
        signature,
        createPublicKey(privatePem)
          .export({ type: "spki", format: "pem" })
          .toString()
      );
      const manifestText = JSON.stringify(manifest);
      // The installer reads the version off the front of the signed text.
      if (!manifestText.startsWith(`{"version":"${version}",`)) {
        throw new Error("The manifest must begin with its version");
      }
      await writeFile(join(staging, "release.json"), manifestText);
      await writeFile(join(staging, "release.json.sig"), `${signature}\n`);
      const next = (await Bun.file(queued).json()) as typeof request;
      if (next.commit !== current.commit) {
        console.log(
          `Built ${current.commit} was superseded; artifacts are not promoted`
        );
        current = next;
        continue;
      }
      await mkdir(current.output, { recursive: true });
      const published = join(current.output, version);
      await rename(staging, published);
      await writeFile(
        join(current.output, "release.json"),
        JSON.stringify(manifest)
      );
      console.log(`Local artifacts ready: ${published}`);
      if (argv.includes("--publish")) {
        await publishRelease(published, manifest);
      }
      break;
    } finally {
      await run(["git", "worktree", "remove", "--force", checkout]);
    }
  }
} finally {
  await rm(lock, { recursive: true, force: true });
}
