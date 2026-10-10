/**
 * Fixtures for prove-stage2.sh, run on the host by bun: throwaway signing keys,
 * the installer text, and release folders laid out like a mirror
 * (`<host>/<subdir>/<channel>/release.json`). Never publishes anything.
 */
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseTag } from "../../packages/core/src/binary-distribution";
import { generateInstallScript } from "../../packages/core/src/install-script";
import {
  type ReleaseManifest,
  signManifest,
} from "../../packages/core/src/release-manifest";
import { protocolRange } from "../../packages/core/src/runtime";
import { SESSIOND_V1 } from "../../packages/core/src/sessiond";

const TARGET = "linux-x64";

function keyPair() {
  return generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

async function sha256(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).bytes())
    .digest("hex");
}

async function run(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0) {
    throw new Error(`${argv.join(" ")} failed`);
  }
}

const [, , verb, ...args] = Bun.argv;

if (verb === "keys") {
  const [directory] = args;
  await mkdir(directory, { recursive: true });
  const keys = keyPair();
  await writeFile(
    join(directory, "test-release-private.pem"),
    keys.privateKey,
    {
      mode: 0o600,
    }
  );
  await writeFile(join(directory, "test-release-public.pem"), keys.publicKey);
} else if (verb === "installer") {
  const [publicKeyFile, outFile, releaseHost] = args;
  await writeFile(
    outFile,
    generateInstallScript({
      origin: "https://github.com/Bewinxed/cawco",
      publicKey: (await Bun.file(publicKeyFile).text()).trim(),
      ...(releaseHost ? { releaseHost } : {}),
    })
  );
} else if (verb === "release") {
  // release <hostDir> <subdir> <channel> <version> <commit> <binary> <privateKey> <sequence> <schemaVersion> [fault]
  const [
    hostDir,
    subdir,
    channel,
    version,
    commit,
    binary,
    privateKey,
    sequence,
    schemaVersion,
    fault,
  ] = args;
  const directory = join(hostDir, subdir, channel);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const staging = join(directory, ".stage");
  await mkdir(staging);
  await Bun.write(join(staging, "cawco"), Bun.file(binary));
  await chmod(join(staging, "cawco"), 0o755);
  // The hub ↔ agent contract the build speaks, as it says itself (build 1, from before the launch verb, speaks 1;
  // this tree's builds speak this tree's): a joined machine installs it only when it overlaps its hub's.
  const said = Bun.spawnSync([binary, "build-info"], { stderr: "inherit" });
  if (!said.success) {
    throw new Error(`${binary} build-info failed`);
  }
  const { protocol } = JSON.parse(said.stdout.toString()) as Pick<
    ReleaseManifest,
    "protocol"
  >;
  const manifest: ReleaseManifest = {
    version,
    commit,
    channel: channel as "stable" | "nightly",
    sequence: Number(sequence),
    schemaVersion: Number(schemaVersion),
    protocol,
    sessiondProtocol: SESSIOND_V1,
    notes: `Proof build ${version}`,
    testSigned: false,
    artifacts: [],
  };
  const archive = `cawco-${releaseTag(manifest)}-${TARGET}.tar.gz`;
  await run(["tar", "-czf", join(directory, archive), "-C", staging, "cawco"]);
  manifest.artifacts = [
    {
      target: TARGET,
      archive,
      sha256: await sha256(join(directory, archive)),
      size: Bun.file(join(directory, archive)).size,
      binarySha256: await sha256(join(staging, "cawco")),
      binarySize: Bun.file(join(staging, "cawco")).size,
    },
  ];
  await rm(staging, { recursive: true, force: true });
  if (fault === "tamper") {
    // The archive no longer matches what the signed manifest names, at the same size.
    const bytes = await Bun.file(join(directory, archive)).bytes();
    bytes[bytes.length - 1] = ((bytes.at(-1) ?? 0) + 1) % 256;
    await Bun.write(join(directory, archive), bytes);
  }
  const signingKey =
    fault === "bad-signature"
      ? keyPair().privateKey
      : await Bun.file(privateKey).text();
  await writeFile(join(directory, "release.json"), JSON.stringify(manifest));
  if (fault !== "no-signature") {
    await writeFile(
      join(directory, "release.json.sig"),
      `${signManifest(manifest, signingKey)}\n`
    );
  }
} else if (verb === "broken-binary") {
  // A program that signs and unpacks like a build and cannot start. It says
  // what it was built from as a build of this tree does (`build-info`, which
  // its release's manifest is written from). With `migrates` it first damages
  // the hub database, as a migration that then fails would leave it.
  const [outFile, mode] = args;
  const buildInfo = `if [ "$1" = build-info ]; then
  echo '${JSON.stringify({ version: "broken", protocol: protocolRange })}'
  exit 0
fi
`;
  await writeFile(
    outFile,
    mode === "migrates"
      ? `#!/bin/sh
${buildInfo}if [ "$1" = hub ]; then
  db="\${CAWCO_DB_PATH:-$HOME/.local/share/cawco/cawco.db}"
  printf 'migrated-and-broken' >> "$db"
fi
exit 1
`
      : `#!/bin/sh\n${buildInfo}exit 1\n`,
    { mode: 0o755 }
  );
} else {
  throw new Error(`unknown fixture verb ${verb}`);
}
