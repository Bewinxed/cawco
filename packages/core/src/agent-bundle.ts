/**
 * CawCo Agent.app: the one identity macOS gives a privacy grant to. Server-only.
 *
 * macOS keys a grant (Screen Recording, Accessibility, Files and Folders,
 * Automation…) on the responsible process: for the work a workspace runs, the
 * session keeper's launchd job, and for the agent's own work, the agent's. A
 * bare executable is keyed on its path, and an ad-hoc signature's designated
 * requirement is its cdhash, so a build at `versions/<v>/cawco` was a new
 * client to TCC on every update. The bundle fixes both: it sits at one path,
 * `<binary root>/CawCo Agent.app`, its identifier is `dev.cawco.agent`, and
 * every release signs it with the team's Developer ID (scripts/release.ts,
 * scripts/binary/sign-agent-bundle.sh), so its designated requirement names
 * the identifier and the team, never the code. TCC then keys the grant on the
 * bundle id and that requirement, and shows one row, "CawCo Agent".
 *
 * Its executable is always the build the `current` link names: every place
 * that moves `current` puts that build in here ({@link installAgentBundle}),
 * by renaming a copy over the executable, so the path and the requirement
 * never change, and a process already running from it keeps the file it was
 * started from. The agent, hub and dashboard start from it through the
 * service wrapper (binary-wrapper.ts), and every session keeper's job starts
 * from it (a keeper of another build runs its own, sessiond main.ts).
 *
 * The Mach-O's signature binds the bundle's Info.plist and its resource seal
 * (`_CodeSignature/CodeResources`). Neither depends on the executable: the
 * Info.plist is {@link AGENT_INFO_PLIST}, here, and the release seals an
 * empty bundle with it on the Mac before it compiles, and compiles that seal
 * in (`__CAWCO_AGENT_CODE_RESOURCES__`). So each build writes the exact two
 * files its own signature names, and nothing else rides in the release.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  constants,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import {
  binaryRoot,
  versionDirectory,
  writeJsonAtomic,
} from "./binary-installation";
import { runtimeVersion, standalone } from "./runtime";

declare const __CAWCO_AGENT_CODE_RESOURCES__: string | undefined;

/** The bundle's identifier: the code-signing identifier TCC and CawCo Helper know the agent by. */
export const AGENT_BUNDLE_ID = "dev.cawco.agent";

/** The name macOS shows for it in every privacy list and prompt. */
export const AGENT_BUNDLE_NAME = "CawCo Agent";

/** The bundle's executable, inside `Contents/MacOS`. */
export const AGENT_EXECUTABLE_NAME = "cawco";

/** The bundle, at its one path. */
export const agentBundlePath = (): string =>
  join(binaryRoot(), `${AGENT_BUNDLE_NAME}.app`);

/** The executable every launchd job of a macOS binary install starts. */
export const agentExecutable = (): string =>
  join(agentBundlePath(), "Contents", "MacOS", AGENT_EXECUTABLE_NAME);

/** Which build the bundle holds, written once it holds it. */
const stampPath = (): string => join(binaryRoot(), "agent-bundle.json");

/**
 * What macOS asks a person on the bundle's behalf. Every command a workspace
 * runs is the keeper's child, and tccd silently refuses a child whose
 * responsible app has no usage string for the service (and, under the
 * hardened runtime, no entitlement: scripts/binary/agent.entitlements), where
 * the bare executable before it was asked. Screen Recording and Accessibility
 * take no string.
 */
const USAGE: readonly (readonly [string, string])[] = [
  [
    "NSAppleEventsUsageDescription",
    "Work CawCo runs on this Mac wants to control another app.",
  ],
  [
    "NSCameraUsageDescription",
    "Work CawCo runs on this Mac wants to use the camera.",
  ],
  [
    "NSMicrophoneUsageDescription",
    "Work CawCo runs on this Mac wants to use the microphone.",
  ],
  [
    "NSAudioCaptureUsageDescription",
    "Work CawCo runs on this Mac wants to record audio.",
  ],
  [
    "NSDesktopFolderUsageDescription",
    "Work CawCo runs on this Mac wants to read files on your Desktop.",
  ],
  [
    "NSDocumentsFolderUsageDescription",
    "Work CawCo runs on this Mac wants to read files in Documents.",
  ],
  [
    "NSDownloadsFolderUsageDescription",
    "Work CawCo runs on this Mac wants to read files in Downloads.",
  ],
  [
    "NSRemovableVolumesUsageDescription",
    "Work CawCo runs on this Mac wants to read a removable drive.",
  ],
  [
    "NSNetworkVolumesUsageDescription",
    "Work CawCo runs on this Mac wants to read a network drive.",
  ],
  [
    "NSPhotoLibraryUsageDescription",
    "Work CawCo runs on this Mac wants to use your photos.",
  ],
  [
    "NSContactsUsageDescription",
    "Work CawCo runs on this Mac wants to use your contacts.",
  ],
  [
    "NSCalendarsFullAccessUsageDescription",
    "Work CawCo runs on this Mac wants to use your calendars.",
  ],
  [
    "NSRemindersFullAccessUsageDescription",
    "Work CawCo runs on this Mac wants to use your reminders.",
  ],
  [
    "NSLocationUsageDescription",
    "Work CawCo runs on this Mac wants to use this Mac's location.",
  ],
  [
    "NSAppleMusicUsageDescription",
    "Work CawCo runs on this Mac wants to use your media library.",
  ],
  [
    "NSSpeechRecognitionUsageDescription",
    "Work CawCo runs on this Mac wants to use speech recognition.",
  ],
];

/**
 * The bundle's Info.plist, byte for byte what every release signs. Nothing in
 * it names a release, so the bundle every build lays down is the same one.
 * `LSUIElement`: an agent, with no Dock icon, if anything ever opens it.
 */
export const AGENT_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleDisplayName</key>
\t<string>${AGENT_BUNDLE_NAME}</string>
\t<key>CFBundleExecutable</key>
\t<string>${AGENT_EXECUTABLE_NAME}</string>
\t<key>CFBundleIdentifier</key>
\t<string>${AGENT_BUNDLE_ID}</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>${AGENT_BUNDLE_NAME}</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleShortVersionString</key>
\t<string>1</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
\t<key>LSMinimumSystemVersion</key>
\t<string>13.0</string>
\t<key>LSUIElement</key>
\t<true/>
\t<key>NSHumanReadableCopyright</key>
\t<string>Petra Solutions LLC</string>
${USAGE.map(([key, text]) => `\t<key>${key}</key>\n\t<string>${text}</string>`).join("\n")}
</dict>
</plist>
`;

/** The resource seal this build was signed with, as the release compiled it in; none in a build not signed for the bundle. */
const SEAL =
  typeof __CAWCO_AGENT_CODE_RESOURCES__ === "string"
    ? __CAWCO_AGENT_CODE_RESOURCES__
    : undefined;

/**
 * A file this process writes before renaming it into the bundle: beside the
 * bundle, never in it, where one left by a process that died would be
 * content the seal does not cover, and the bundle would fail its signature.
 */
const temporaryFor = (name: string): string =>
  join(binaryRoot(), `.agent-bundle-${name}.${process.pid}.tmp`);

/** Writes `text` at `path` unless it is there already, by one rename. */
const place = async (path: string, text: string): Promise<void> => {
  if ((await readFile(path, "utf8").catch(() => undefined)) === text) {
    return;
  }
  const temporary = temporaryFor(basename(path));
  try {
    await writeFile(temporary, text, { mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

/**
 * Puts this build in CawCo Agent.app: its Info.plist and seal, then its
 * executable, copied from `versions/<this build>/cawco` and renamed over the
 * one there (a running process keeps the file it started from; a launch
 * meets one build or the other, never a half-written file). Then codesign
 * checks the bundle as a whole, and only a bundle that satisfies its own
 * designated requirement is recorded as holding this build. A bundle already
 * holding it is left alone.
 */
export async function installAgentBundle(): Promise<
  "installed" | "already held"
> {
  if (!(standalone && process.platform === "darwin")) {
    throw new Error(
      `${AGENT_BUNDLE_NAME}.app is a macOS binary install's, and this is not one`
    );
  }
  if (!SEAL) {
    throw new Error(
      `This build (${runtimeVersion}) was not signed as ${AGENT_BUNDLE_NAME}.app, so it cannot be put in it`
    );
  }
  const stamp = JSON.parse(
    await readFile(stampPath(), "utf8").catch(() => "{}")
  ) as { version?: string };
  if (stamp.version === runtimeVersion && existsSync(agentExecutable())) {
    return "already held";
  }
  // From here until it passes its check, the bundle holds no build on record:
  // one left half-written is written again by the next install, of any build.
  await rm(stampPath(), { force: true });
  const contents = join(agentBundlePath(), "Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true, mode: 0o700 });
  await mkdir(join(contents, "_CodeSignature"), {
    recursive: true,
    mode: 0o700,
  });
  await place(join(contents, "Info.plist"), AGENT_INFO_PLIST);
  await place(join(contents, "_CodeSignature", "CodeResources"), SEAL);
  // A copy, never a hard link: a vnode with two names may be reported by
  // either, and the process must be seen to run from the bundle.
  const temporary = temporaryFor(AGENT_EXECUTABLE_NAME);
  try {
    await copyFile(
      join(versionDirectory(runtimeVersion), "cawco"),
      temporary,
      constants.COPYFILE_FICLONE
    );
    await chmod(temporary, 0o700);
    await rename(temporary, agentExecutable());
  } finally {
    await rm(temporary, { force: true });
  }
  const checked = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--strict", agentBundlePath()],
    { encoding: "utf8" }
  );
  if (checked.status !== 0) {
    throw new Error(
      `${agentBundlePath()} holds ${runtimeVersion} but does not pass codesign --verify --strict: ${checked.stderr.trim() || `status ${checked.status}`}`
    );
  }
  await writeJsonAtomic(stampPath(), { version: runtimeVersion });
  return "installed";
}
