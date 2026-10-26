/**
 * A release host, readied and checked (run through `bash scripts/release-setup.sh`,
 * which puts the pinned Bun in place first):
 *
 *   (no flag)                  installs what is missing (the system packages through apt-get and sudo, rcodesign
 *                              from its pinned release), then checks everything
 *   --check                    installs nothing: one line per thing missing, exit 1 when anything is
 *   --import-secrets PLACE     the release secrets from PLACE into the release env (release-signing.ts), then checks
 *
 * What a release needs on its host, beside a clone of the repository:
 * - git, curl, tar, gzip, zip, unzip, ar (binutils), the arm64 binfmt entry (qemu-user-binfmt) that runs the published
 *   linux-arm64 binary, podman with the user's subordinate ids (the container proofs, rootless), gh signed in with
 *   access to the release repository, and systemd's user manager with lingering (scripts/ship.sh's unit);
 * - rcodesign, pinned (release-tools.ts);
 * - the secrets, in the release env.
 *
 * THE SECRETS' ONE SOURCE is a place outside this host, named by `--import-secrets PLACE` or
 * `CAWCO_RELEASE_SECRETS`; the release env is a copy of it. The import is a function of the place
 * ({@link readerOf}); a place is `dir:/absolute/path` (or the path alone): a folder, wherever it is mounted from,
 * holding:
 * - `release-signing-key.pem`: the PKCS8 PEM that signs release manifests;
 * - `developer-id.p12` and `developer-id.p12.password`: the Mac keychain's identities as `security export` writes
 *   them; the Developer ID Application identity of team FN5LJSPX2R is taken out of it;
 * - `appstoreconnect.env` and `AuthKey_<KEY_ID>.p8`: the App Store Connect key as the Mac kept it
 *   (`*KEY_ID=` and `*ISSUER_ID=` lines), encoded for rcodesign (`encode-app-store-connect-api-key`).
 */
import { createPrivateKey } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { RELEASE_REPOSITORY } from "../packages/core/src/binary-distribution";
import { releaseEnvPath } from "../packages/core/src/paths";
import { APPLE_TEAM_ID } from "./binary/sign-agent-bundle";
import { SECRET_VARIABLES } from "./release-signing";
import {
  RCODESIGN_ARCHIVES,
  RCODESIGN_VERSION,
  rcodesignPath,
  releaseHost,
} from "./release-tools";

const argv = Bun.argv.slice(2);
const checking = argv.includes("--check");

/** A command's exit status and what it printed, both streams together; one that is not there did not run. */
const said = (command: string[]): { ok: boolean; text: string } => {
  try {
    const ran = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
    return {
      ok: ran.exitCode === 0,
      text: `${ran.stdout.toString()}${ran.stderr.toString()}`,
    };
  } catch (error) {
    return {
      ok: false,
      text: error instanceof Error ? error.message : String(error),
    };
  }
};
const has = (command: string): boolean => Bun.which(command) !== null;
/** Whether the pinned rcodesign is in place: it says its own version. */
const rcodesignInstalled = (): boolean => {
  const version = said([rcodesignPath(), "--version"]);
  return (
    version.ok && version.text.includes(`apple-codesign ${RCODESIGN_VERSION}`)
  );
};

/** The commands the release runs, each with the Debian/Ubuntu package that has it. */
const COMMANDS: [string, string][] = [
  ["git", "git"],
  ["curl", "curl"],
  ["tar", "tar"],
  ["gzip", "gzip"],
  ["unzip", "unzip"],
  ["zip", "zip"],
  ["ar", "binutils"],
  ["podman", "podman"],
  ["gh", "gh"],
  ["openssl", "openssl"],
  ["systemd-run", "systemd"],
];
/** The binfmt entry the published linux-arm64 binary runs through (release.ts `runPublished`). */
const BINFMT_ARM64 = "/proc/sys/fs/binfmt_misc/qemu-aarch64";

/** The packages a host lacks for the commands and the binfmt entry. */
const missingPackages = async (): Promise<string[]> => [
  ...COMMANDS.filter(([command]) => !has(command)).map(([, pkg]) => pkg),
  ...((await Bun.file(BINFMT_ARM64).exists()) ? [] : ["qemu-user-binfmt"]),
];

/** rcodesign from its pinned release, checked against the release's SHA256SUMS line kept in release-tools.ts. */
const installRcodesign = async (): Promise<void> => {
  const pinned = RCODESIGN_ARCHIVES[releaseHost()];
  if (!pinned) {
    throw new Error(
      `rcodesign has no pinned build for ${releaseHost()}: a release host is ${Object.keys(RCODESIGN_ARCHIVES).join(" or ")}`
    );
  }
  const url = `https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F${RCODESIGN_VERSION}/${pinned.name}.tar.gz`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  const sha256 = new Bun.CryptoHasher("sha256").update(archive).digest("hex");
  if (sha256 !== pinned.sha256) {
    throw new Error(
      `${url} has sha256 ${sha256}, not the pinned ${pinned.sha256}`
    );
  }
  const scratch = await mkdtemp(join(tmpdir(), "rcodesign-"));
  try {
    await writeFile(join(scratch, "rcodesign.tar.gz"), archive);
    const unpacked = said([
      "tar",
      "-xzf",
      join(scratch, "rcodesign.tar.gz"),
      "-C",
      scratch,
    ]);
    if (!unpacked.ok) {
      throw new Error(`unpacking ${url} failed: ${unpacked.text}`);
    }
    await mkdir(dirname(rcodesignPath()), { recursive: true });
    const temp = `${rcodesignPath()}.${process.pid}`;
    await writeFile(
      temp,
      await Bun.file(join(scratch, pinned.name, "rcodesign")).bytes()
    );
    await chmod(temp, 0o755);
    await rename(temp, rcodesignPath());
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  console.log(`installed rcodesign ${RCODESIGN_VERSION} at ${rcodesignPath()}`);
};

/** The release env's lines, by variable; a file that is not there has none. */
const readEnv = async (): Promise<Map<string, string>> => {
  const text = await readFile(releaseEnvPath(), "utf8").catch(() => "");
  const lines = new Map<string, string>();
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && !line.trimStart().startsWith("#")) {
      lines.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
  }
  return lines;
};

/** What is wrong with each secret the release env holds, or that it has none: one line each. */
const secretProblems = async (): Promise<string[]> => {
  const env = await readEnv();
  const problems: string[] = [];
  const decoded = (variable: string): string | undefined => {
    const value = env.get(variable);
    if (!value) {
      problems.push(`${variable} in ${releaseEnvPath()}`);
      return;
    }
    return Buffer.from(value, "base64").toString("utf8");
  };
  const manifestKey = decoded(SECRET_VARIABLES.manifestKey);
  if (manifestKey) {
    try {
      createPrivateKey(manifestKey);
    } catch {
      problems.push(`${SECRET_VARIABLES.manifestKey}: not a private key PEM`);
    }
  }
  const developerId = decoded(SECRET_VARIABLES.developerId);
  if (developerId) {
    const scratch = await mkdtemp(join(tmpdir(), "developer-id-"));
    try {
      await writeFile(join(scratch, "identity.pem"), developerId, {
        mode: 0o600,
      });
      const analyzed = said([
        rcodesignPath(),
        "analyze-certificate",
        "--pem-file",
        join(scratch, "identity.pem"),
      ]).text;
      for (const [line, why] of [
        [
          "Guessed Certificate Profile: DeveloperIdApplication",
          "not a Developer ID Application certificate",
        ],
        [
          `Team ID:                     ${APPLE_TEAM_ID}`,
          `not team ${APPLE_TEAM_ID}'s`,
        ],
        ["Signed by Apple?:            true", "not signed by Apple"],
      ] as const) {
        if (!analyzed.includes(line)) {
          problems.push(`${SECRET_VARIABLES.developerId}: ${why}`);
        }
      }
      if (!developerId.includes("PRIVATE KEY-----")) {
        problems.push(`${SECRET_VARIABLES.developerId}: holds no private key`);
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  const apiKey = decoded(SECRET_VARIABLES.appStoreConnectKey);
  if (apiKey) {
    try {
      const key = JSON.parse(apiKey) as Record<string, unknown>;
      if (!(key.issuer_id && key.key_id && key.private_key)) {
        problems.push(
          `${SECRET_VARIABLES.appStoreConnectKey}: not rcodesign's API key JSON (issuer_id, key_id, private_key)`
        );
      }
    } catch {
      problems.push(`${SECRET_VARIABLES.appStoreConnectKey}: not JSON`);
    }
  }
  return problems;
};

/** Everything a release needs that this host lacks, one line each. */
const missingNow = async (): Promise<string[]> => {
  const missing = (await missingPackages()).map(
    (pkg) => `package ${pkg}: sudo apt-get install -y ${pkg}`
  );
  if (!rcodesignInstalled()) {
    missing.push(
      `rcodesign ${RCODESIGN_VERSION} at ${rcodesignPath()}: bash scripts/release-setup.sh installs it`
    );
  }
  const user = userInfo().username;
  if (
    !(await readFile("/etc/subuid", "utf8").catch(() => ""))
      .split("\n")
      .some((line) => line.startsWith(`${user}:`))
  ) {
    missing.push(
      `subordinate ids for ${user} (rootless podman): sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${user}`
    );
  }
  if (
    has("gh") &&
    said([
      "gh",
      "api",
      `repos/${RELEASE_REPOSITORY}`,
      "--jq",
      ".permissions.push",
    ]).text.trim() !== "true"
  ) {
    missing.push(
      `gh signed in as someone who may publish releases to ${RELEASE_REPOSITORY}: gh auth login`
    );
  }
  if (
    has("loginctl") &&
    !said([
      "loginctl",
      "show-user",
      user,
      "--property=Linger",
      "--value",
    ]).text.includes("yes")
  ) {
    missing.push(
      `lingering for ${user}, so a release unit outlives the session: sudo loginctl enable-linger ${user}`
    );
  }
  missing.push(
    ...(await secretProblems()).map(
      (problem) =>
        `secret ${problem}: bash scripts/release-setup.sh --import-secrets PLACE`
    )
  );
  return missing;
};

/** A place's files by name: the one function a new kind of place adds a case to. */
const readerOf = (place: string): ((name: string) => Promise<Uint8Array>) => {
  const folder = place.startsWith("dir:") ? place.slice("dir:".length) : place;
  if (!isAbsolute(folder)) {
    throw new Error(
      `The secrets' place is dir:/absolute/path (or the path alone); "${place}" is not one`
    );
  }
  return async (name) => {
    const file = Bun.file(join(folder, name));
    if (!(await file.exists())) {
      throw new Error(`${join(folder, name)} is not there`);
    }
    return file.bytes();
  };
};

/** A PEM block's text with the lines `openssl pkcs12` printed above it. */
interface Bag {
  attributes: string;
  pem: string;
}
const PEM_BLOCK = /-----BEGIN ([A-Z ]+)-----[\s\S]*?-----END \1-----/gu;
const KEY_ID = /localKeyID:\s*([0-9A-F ]+)/iu;
const FRIENDLY_NAME = /friendlyName: (.*)/u;
const EXPORT = /^export /u;

/** The team's Developer ID Application certificate and its key, out of `openssl pkcs12 -nodes`' text. */
const developerIdentity = (text: string): string => {
  const bags: Bag[] = [];
  let from = 0;
  for (const block of text.matchAll(PEM_BLOCK)) {
    bags.push({ attributes: text.slice(from, block.index), pem: block[0] });
    from = (block.index ?? 0) + block[0].length;
  }
  const certificate = bags.find(
    (bag) =>
      bag.pem.includes("BEGIN CERTIFICATE") &&
      bag.attributes.includes("Developer ID Application:") &&
      bag.attributes.includes(`(${APPLE_TEAM_ID})`)
  );
  const id = certificate && KEY_ID.exec(certificate.attributes)?.[1]?.trim();
  const key = bags.find(
    (bag) =>
      bag.pem.includes("PRIVATE KEY") &&
      id !== undefined &&
      KEY_ID.exec(bag.attributes)?.[1]?.trim() === id
  );
  if (!(certificate && key)) {
    throw new Error(
      `developer-id.p12 holds no "Developer ID Application: … (${APPLE_TEAM_ID})" certificate with its key (it holds: ${bags
        .map(
          (bag) => FRIENDLY_NAME.exec(bag.attributes)?.[1] ?? "an unnamed item"
        )
        .join("; ")})`
    );
  }
  return `${certificate.pem}\n${key.pem}\n`;
};

/** The App Store Connect key's ids from the Mac's env file, as sign-agent-bundle.sh read them. */
const connectIds = (text: string): { issuer: string; keyId: string } => {
  let keyId = "";
  let issuer = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(EXPORT, "");
    const at = line.indexOf("=");
    if (at < 0) {
      continue;
    }
    const name = line.slice(0, at);
    const value = line
      .slice(at + 1)
      .replaceAll('"', "")
      .replaceAll("'", "")
      .trim();
    if (name.endsWith("KEY_ID")) {
      keyId = value;
    } else if (name.endsWith("ISSUER_ID")) {
      issuer = value;
    }
  }
  if (!(keyId && issuer)) {
    throw new Error("appstoreconnect.env names no *KEY_ID and *ISSUER_ID");
  }
  return { keyId, issuer };
};

/** The secrets from `place` written into the release env, each base64 on its line; other lines are kept. */
const importSecrets = async (place: string): Promise<void> => {
  const read = readerOf(place);
  const scratch = await mkdtemp(join(tmpdir(), "release-secrets-"));
  await chmod(scratch, 0o700);
  try {
    const manifestKey = new TextDecoder().decode(
      await read("release-signing-key.pem")
    );
    createPrivateKey(manifestKey);
    await writeFile(join(scratch, "id.p12"), await read("developer-id.p12"), {
      mode: 0o600,
    });
    await writeFile(
      join(scratch, "id.password"),
      await read("developer-id.p12.password"),
      { mode: 0o600 }
    );
    // -legacy: a keychain export's PKCS#12 may use the RC2/3DES ciphers OpenSSL 3 keeps in its legacy provider.
    const opened = said([
      "openssl",
      "pkcs12",
      "-in",
      join(scratch, "id.p12"),
      "-passin",
      `file:${join(scratch, "id.password")}`,
      "-nodes",
      "-legacy",
    ]);
    if (!opened.ok) {
      throw new Error(
        `openssl could not open developer-id.p12: ${opened.text.trim()}`
      );
    }
    const identity = developerIdentity(opened.text);
    const { issuer, keyId } = connectIds(
      new TextDecoder().decode(await read("appstoreconnect.env"))
    );
    await writeFile(
      join(scratch, "key.p8"),
      await read(`AuthKey_${keyId}.p8`),
      { mode: 0o600 }
    );
    const encoded = said([
      rcodesignPath(),
      "encode-app-store-connect-api-key",
      "-o",
      join(scratch, "key.json"),
      issuer,
      keyId,
      join(scratch, "key.p8"),
    ]);
    if (!encoded.ok) {
      throw new Error(
        `rcodesign could not encode the App Store Connect key: ${encoded.text.trim()}`
      );
    }
    const values: Record<string, string> = {
      [SECRET_VARIABLES.manifestKey]:
        Buffer.from(manifestKey).toString("base64"),
      [SECRET_VARIABLES.developerId]: Buffer.from(identity).toString("base64"),
      [SECRET_VARIABLES.appStoreConnectKey]: Buffer.from(
        await Bun.file(join(scratch, "key.json")).bytes()
      ).toString("base64"),
    };
    const kept = (await readFile(releaseEnvPath(), "utf8").catch(() => ""))
      .split("\n")
      .filter(
        (line) =>
          line.trim() &&
          !Object.keys(values).some((name) => line.startsWith(`${name}=`))
      );
    await mkdir(dirname(releaseEnvPath()), { recursive: true, mode: 0o700 });
    const temp = `${releaseEnvPath()}.${process.pid}`;
    await writeFile(
      temp,
      `${[...kept, ...Object.entries(values).map(([name, value]) => `${name}=${value}`)].join("\n")}\n`,
      { mode: 0o600 }
    );
    await rename(temp, releaseEnvPath());
    console.log(
      `imported ${Object.keys(values).join(", ")} from ${place} into ${releaseEnvPath()}`
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

if (process.platform !== "linux") {
  console.error(
    "A release host is Linux: the container proofs run on podman there."
  );
  process.exit(1);
}
const importAt = argv.indexOf("--import-secrets");
if (importAt >= 0) {
  const place = argv[importAt + 1] ?? process.env.CAWCO_RELEASE_SECRETS;
  if (!place) {
    console.error(
      "Name the secrets' place: --import-secrets dir:/absolute/path, or CAWCO_RELEASE_SECRETS"
    );
    process.exit(2);
  }
  await importSecrets(place);
} else if (!checking) {
  const packages = await missingPackages();
  if (packages.length > 0) {
    if (!has("apt-get")) {
      console.error(
        `Install these with this host's package manager, then run this again: ${packages.join(" ")}`
      );
      process.exit(1);
    }
    const sudo = process.getuid?.() === 0 ? [] : ["sudo"];
    console.log(
      `installing ${packages.join(" ")}: ${[...sudo, "apt-get", "install", "-y", ...packages].join(" ")}`
    );
    const installed = Bun.spawnSync(
      [...sudo, "apt-get", "install", "-y", ...packages],
      {
        stdio: ["inherit", "inherit", "inherit"],
      }
    );
    if (installed.exitCode !== 0) {
      process.exit(1);
    }
  }
  if (!rcodesignInstalled()) {
    await installRcodesign();
  }
}
const missing = await missingNow();
if (missing.length > 0) {
  console.log(
    `This host cannot release yet. Missing:\n${missing.map((line) => `- ${line}`).join("\n")}`
  );
  process.exit(1);
}
console.log(
  `This host can release: Bun ${Bun.version}, rcodesign ${RCODESIGN_VERSION}, podman, gh, the arm64 binfmt entry and every secret in ${releaseEnvPath()}.`
);
