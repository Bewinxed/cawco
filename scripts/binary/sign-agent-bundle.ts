/**
 * A darwin build as its own signed CawCo Agent.app, and the
 * release archive of it, made on the release host with rcodesign
 * (release-tools.ts): no Mac in the path. packages/core/src/agent-bundle.ts
 * says why it is a bundle. release.ts runs each step through its own runner
 * (`Run`), so each is a logged command of its own in its step graph.
 *
 * - {@link signBundle}: lays out DIR/CawCo Agent.app (Contents/Info.plist,
 *   Contents/MacOS/cawco) and signs it with the team's Developer ID, the
 *   hardened runtime and a secure timestamp (`--for-notarization` is rcodesign's
 *   mode that insists on both). Then reads
 *   the signature back: the identifier dev.cawco.agent, the runtime flag, the
 *   JIT entitlement, a Developer ID Application certificate of team
 *   FN5LJSPX2R, and a designated requirement that names the identifier and
 *   the team and no cdhash. The build is not sent to Apple for notarizing:
 *   macOS checks that only on files marked as downloaded by a browser or
 *   Finder, and the installer script and the updater set no such mark.
 * - {@link archiveBundle}: tars the bundle as signed, then unpacks
 *   the archive the way the installer and the updater do, into a scratch
 *   binary root's versions/VERSION, and checks the unpacked bundle: the same
 *   executable, a signature rcodesign verifies.
 *
 * The entitlements (agent.entitlements, beside this file), under the hardened runtime:
 * - JavaScriptCore's JIT: cs.allow-jit and cs.allow-unsigned-executable-memory
 *   (bun.com/docs/bundler/executables: "We recommend including an entitlements.plist
 *   file with JIT permissions"; a Developer ID bun binary without allow-jit dies at
 *   start with "Ran out of executable memory", happier-dev/happier#343).
 * - cs.disable-library-validation: the native addons a build extracts and loads
 *   are not signed by the team. cs.allow-dyld-environment-variables: in Bun's set.
 * - The rest: every command a workspace runs is the keeper's child, and tccd holds
 *   a child to its responsible app's entitlements ("kTCCServiceAppleEvents requires
 *   entitlement com.apple.security.automation.apple-events but it is missing",
 *   microsoft/vscode#107316; "kTCCServiceCalendar requires entitlement
 *   com.apple.security.personal-information.calendars", anthropics/claude-code#52712).
 *   Each still asks the person through its own prompt.
 *
 * What only a Mac could check is no longer checked before publishing:
 * Gatekeeper's verdict (`spctl --assess`) and a run of the signed executable.
 */
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  AGENT_BUNDLE,
  AGENT_BUNDLE_EXECUTABLE,
  AGENT_BUNDLE_ID,
} from "../../packages/core/src/agent-bundle";
import { rcodesignPath } from "../release-tools";

/** A command run as one of the release's steps: its stdout when `capture`. */
export type Run = (
  command: string[],
  cwd?: string,
  capture?: boolean
) => Promise<string>;

/** The team whose Developer ID signs every darwin build. */
export const APPLE_TEAM_ID = "FN5LJSPX2R";
const ENTITLEMENTS = join(import.meta.dir, "agent.entitlements");
/** The designated requirement as `rcodesign print-signature-info` prints it. */
const DESIGNATED = /designated\(3\): \d+: (.*)$/mu;

const fail = (what: string): never => {
  throw new Error(`Signing the agent bundle failed: ${what}`);
};

/**
 * Lays out `dir`/CawCo Agent.app from `dir`/Info.plist and `dir`/cawco (moved
 * in) and signs it with `identity` (a PEM file holding the Developer ID
 * Application certificate and its key), then checks the signature it reads
 * back. Prints SIGNED and the designated requirement.
 */
export async function signBundle(
  run: Run,
  dir: string,
  identity: string
): Promise<void> {
  const app = join(dir, AGENT_BUNDLE);
  await rm(app, { recursive: true, force: true });
  await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
  await cp(join(dir, "Info.plist"), join(app, "Contents", "Info.plist"));
  await rename(join(dir, "cawco"), join(dir, AGENT_BUNDLE_EXECUTABLE));
  await run([
    rcodesignPath(),
    "sign",
    "--pem-file",
    identity,
    "--code-signature-flags",
    "runtime",
    "--entitlements-xml-file",
    ENTITLEMENTS,
    "--for-notarization",
    app,
  ]);
  const info = await run(
    [rcodesignPath(), "print-signature-info", app],
    dir,
    true
  );
  const designated =
    DESIGNATED.exec(info)?.[1] ??
    fail(`${app} carries no designated requirement`);
  console.log(`DESIGNATED REQUIREMENT: ${designated}`);
  if (!(
    designated.includes(`identifier "${AGENT_BUNDLE_ID}"`) &&
    designated.includes("anchor apple generic") &&
    designated.includes("subject.OU") &&
    designated.includes(APPLE_TEAM_ID) &&
    !designated.includes("cdhash")
  )) {
    fail(
      `the designated requirement does not name ${AGENT_BUNDLE_ID} and team ${APPLE_TEAM_ID} alone`
    );
  }
  for (const [said, why] of [
    [
      `identifier: ${AGENT_BUNDLE_ID}`,
      `the identifier is not ${AGENT_BUNDLE_ID}`,
    ],
    ["flags: CodeSignatureFlags(RUNTIME)", "the hardened runtime is off"],
    [
      "com.apple.security.cs.allow-jit",
      "the signature carries no com.apple.security.cs.allow-jit",
    ],
    [
      "apple_certificate_profile: developer-id-application",
      "the certificate is not a Developer ID Application one",
    ],
    [
      `apple_team_id: ${APPLE_TEAM_ID}`,
      `the certificate is not team ${APPLE_TEAM_ID}'s`,
    ],
    [
      "chains_to_apple_root_ca: true",
      "the certificate does not chain to Apple's root",
    ],
  ] as const) {
    if (!info.includes(said)) {
      fail(why);
    }
  }
  console.log(`SIGNED ${app} as team ${APPLE_TEAM_ID}`);
}

/**
 * Tars `dir`/CawCo Agent.app, as signed, into `dir`/`archive`
 * (gzip, as the installer and the updater read), then unpacks it as they lay
 * a build down, into a scratch root's versions/`version`, and checks it there.
 * Prints ARCHIVED and UNPACKED.
 */
export async function archiveBundle(
  run: Run,
  dir: string,
  version: string,
  archive: string
): Promise<void> {
  // Owned by no one in particular: an extract as the installing user owns every file anyway.
  await run(
    [
      "tar",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-czf",
      join(dir, archive),
      "-C",
      dir,
      AGENT_BUNDLE,
    ],
    dir
  );
  console.log(`ARCHIVED ${archive}`);
  const versions = join(dir, "root", "versions", version);
  await rm(join(dir, "root"), { recursive: true, force: true });
  await mkdir(versions, { recursive: true });
  try {
    await run(
      ["tar", "-xzf", join(dir, archive), "-C", versions, AGENT_BUNDLE],
      dir
    );
    const unpacked = join(versions, AGENT_BUNDLE_EXECUTABLE);
    await run(
      ["cmp", "-s", unpacked, join(dir, AGENT_BUNDLE_EXECUTABLE)],
      dir
    ).catch(() => fail("the archive's executable is not the one signed"));
    await run([rcodesignPath(), "verify", unpacked], dir);
    console.log(`UNPACKED ${join(versions, AGENT_BUNDLE)}`);
  } finally {
    await rm(join(dir, "root"), { recursive: true, force: true });
  }
}
