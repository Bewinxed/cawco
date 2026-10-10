/**
 * axe on the Mac's iOS simulators, for the iOS probes (scripts/probe-ios-*.ts).
 *
 * Each probe passes its own `mac(script)` (bash on the Mac, over ssh or
 * here), so this module runs nothing itself.
 */

export const AXE = "/opt/homebrew/bin/axe";

/** Runs `script` in bash on the Mac; its stdout, or throws with its stderr. */
export type Mac = (script: string) => Promise<string>;

/**
 * axe's own failures to reach a simulator's automation session, which a
 * just-booted or busy simulator gives for a while ("No translation object
 * returned for simulator… invisible due to a fullscreen dialog", a timed-out
 * session); nothing was read or touched, so the call is made again.
 *
 * "Timed out creating the simulator remote automation session" is IDB's
 * accessibility bootstrap, which axe runs before every read of the screen
 * (`tap --label` included) on a runtime of 27 or later: it asks the
 * simulator's testmanagerd for a short-lived XCTest automation session and
 * waits 5 s for it (cameroncooke/idb@604c510,
 * FBSimulatorControl/Utility/FBSimulatorControlFrameworkLoader.m:283,
 * `FBSimulatorAccessibilityBootstrapError(4, @"Timed out creating the
 * simulator remote automation session")`; FBSimulatorAccessibilityCommands
 * .swift: `runtimeVersion.majorVersion >= 27`, `timeout: 5`). axe's own
 * recovery covers only a disconnected channel and DTX errno 24
 * (AXe AccessibilityFetcher.shouldRecoverTestManagerDaemon), and
 * `--wait-timeout` polls only for an element not found, so the bootstrap's
 * failure ends the command on its first read.
 */
const AXE_SESSION =
  /No translation object|remote automation session|Timed out creating/;
const AXE_TRIES = 4;
const AXE_PAUSE_MS = 2000;

/**
 * An `axe <args>` runner over `mac`: one axe command, tried up to 4 times 2s
 * apart while axe cannot reach the simulator; any other failure throws at once.
 */
export const axeOver =
  (mac: Mac) =>
  async (args: string): Promise<string> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each try follows the last one's failure
        return await mac(`${AXE} ${args}`);
      } catch (error) {
        if (attempt >= AXE_TRIES || !AXE_SESSION.test(String(error))) {
          throw error;
        }
        console.log(
          `  axe could not reach the simulator (try ${attempt}): ${String(error).slice(0, 160)}`
        );
        await Bun.sleep(AXE_PAUSE_MS);
      }
    }
  };

/**
 * Bash that boots a freshly created simulator so SpringBoard's accessibility
 * server answers clients that aren't apps, then installs `app`.
 *
 * From iOS 26.5 SpringBoard's AX server refuses non-app clients, so a system
 * prompt (notifications, location…) is missing from what axe reads; Apple's
 * switch is `com.apple.Accessibility IgnoreAXServerEntitlements`, read when
 * SpringBoard starts (software-mansion/argent d091421: "When set, the server
 * skips the entitlement check"; "The pref persists on the sim's disk").
 *
 * It is written on a first boot and read on a second: shutdown and boot
 * start SpringBoard, testmanagerd and CoreSimulatorBridge together. A
 * `launchctl kickstart -k` of SpringBoard alone restarts it under services
 * still bound to the old one (IDB, FBSimulatorAccessibilityCommands.swift:
 * "CoreSimulator's CoreSimulatorBridge is still bound to the dead pid"), and
 * the run that did that lost axe's automation session and never showed the
 * app's notification prompt. The second boot reads the preference back and
 * prints it; the script fails if it is not 1.
 */
export const bootForSystemPrompts = (udid: string, app: string) =>
  `xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl spawn ${udid} defaults write com.apple.Accessibility IgnoreAXServerEntitlements -bool true
xcrun simctl shutdown ${udid}
xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
IGNORE=$(xcrun simctl spawn ${udid} defaults read com.apple.Accessibility IgnoreAXServerEntitlements)
echo "IgnoreAXServerEntitlements $IGNORE"
test "$IGNORE" = 1
xcrun simctl install ${udid} "${app}"`;
