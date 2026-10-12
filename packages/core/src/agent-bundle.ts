/**
 * CawCo Agent.app: the identity macOS gives a privacy grant to.
 *
 * macOS keys a grant (Screen Recording, Accessibility, Files and Folders,
 * Automation…) on the responsible process: for the work a workspace runs, the
 * session keeper's launchd job, and for the agent's own work, the agent's. A
 * bare executable is keyed on its path, and an ad-hoc signature's designated
 * requirement is its cdhash, so a bare build was a new client to TCC on every
 * update. A bundle's grant is keyed on its identifier, `dev.cawco.agent`, and
 * its designated requirement, which names that identifier and the team's
 * Developer ID (scripts/release.ts, scripts/binary/sign-agent-bundle.sh) and
 * never the code or the path. So every build is its own signed bundle,
 * `versions/<v>/CawCo Agent.app`, shipped in the release exactly as the Mac
 * signed it, and the grant follows each update; TCC shows one row, "CawCo
 * Agent".
 *
 * A Developer ID, hardened-runtime executable signed as a bundle's main
 * executable is killed when run outside that bundle (`load code signature
 * error 4`): on macOS a build only ever runs from inside its bundle
 * (binary-installation.ts `versionExecutable`).
 */

/** The bundle's identifier: the code-signing identifier TCC and CawCo Helper know the agent by. */
export const AGENT_BUNDLE_ID = "dev.cawco.agent";

/** The name macOS shows for it in every privacy list and prompt. */
export const AGENT_BUNDLE_NAME = "CawCo Agent";

/** The bundle's executable, inside `Contents/MacOS`. */
export const AGENT_EXECUTABLE_NAME = "cawco";

/** The bundle's folder, in a build's folder and in the release archive. */
export const AGENT_BUNDLE = `${AGENT_BUNDLE_NAME}.app`;

/** The bundle's executable, from the folder that holds the bundle. */
export const AGENT_BUNDLE_EXECUTABLE = `${AGENT_BUNDLE}/Contents/MacOS/${AGENT_EXECUTABLE_NAME}`;

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
