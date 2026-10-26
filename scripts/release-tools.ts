/**
 * The tools a release host runs beside the repository's own, each pinned
 * here and put in place by `bash scripts/release-setup.sh` (release-setup.ts),
 * never by hand: a fresh clone on a freshly installed machine releases after
 * that one command and the secrets.
 *
 * rcodesign (apple-codesign) signs, notarizes and staples the darwin builds
 * on the release host itself, no Mac in the path
 * (https://gregoryszorc.com/docs/apple-codesign/stable/apple_codesign.html:
 * "you can sign, notarize, and release Apple software from non-Apple operating
 * systems (like Linux, Windows, and BSDs) without needing access to
 * proprietary Apple software"). 0.29.0 is the newest release (crates.io
 * `max_stable_version`, 2026-10-22); each archive's sha256 is its release's
 * own SHA256SUMS.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export const RCODESIGN_VERSION = "0.29.0";

/** The release archives rcodesign is installed from, per release host. */
export const RCODESIGN_ARCHIVES: Record<
  string,
  { name: string; sha256: string }
> = {
  "linux-x64": {
    name: `apple-codesign-${RCODESIGN_VERSION}-x86_64-unknown-linux-musl`,
    sha256: "dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002",
  },
  "linux-arm64": {
    name: `apple-codesign-${RCODESIGN_VERSION}-aarch64-unknown-linux-musl`,
    sha256: "4af92c87ddf52f5f2d1258a3b4e56c7dcb8f1b2468df744976c5f139e031961f",
  },
};

/** Where the release's own tools live on the release host, outside every checkout. */
const releaseToolsDir = (): string =>
  join(homedir(), ".local", "share", "cawco-release", "tools");

/** The pinned rcodesign, as setup installs it. */
export const rcodesignPath = (): string =>
  join(releaseToolsDir(), `rcodesign-${RCODESIGN_VERSION}`);

/** The release host's name for itself among {@link RCODESIGN_ARCHIVES}. */
export const releaseHost = (): string => `${process.platform}-${process.arch}`;
