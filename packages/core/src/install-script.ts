import { CAWCO_ENV, CAWCO_HUB_PORT } from "./index";
import { INSTALL_STEP_PREFIX } from "./join";
import { RELEASE_PUBLIC_KEY } from "./release-key";

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * The one installer, for a first machine or a machine joining a hub: it
 * installs the signed binary release of a channel and nothing else. It needs
 * only `curl`, `tar`, a SHA-256 tool and `openssl` (which it installs on Linux
 * through the system's package manager, showing the command); no git, Bun or
 * Node. It checks the manifest's ECDSA P-256 signature against the public key
 * written into this text and the archive's checksum against the signed
 * manifest, and stops with nothing placed if either fails. Run on a machine
 * that already has CawCo it reports the installed version and changes nothing:
 * updates are installed from the app.
 *
 * `origin` is the GitHub repository releases are published to. `releaseHost`
 * and `publicKey` exist so a proof can stand a local folder and a throwaway
 * key in for them; a real installer takes the embedded key.
 */
export const generateInstallScript = ({
  origin,
  hub,
  publicKey = RELEASE_PUBLIC_KEY,
  releaseHost,
}: {
  origin: string;
  hub?: string;
  publicKey?: string;
  releaseHost?: string;
}): string => {
  if (!publicKey) {
    throw new Error(
      "No release public key is embedded: an installer cannot be generated before publishing is enabled"
    );
  }
  return `#!/bin/sh
# ${hub ? `Adds this machine to the CawCo fleet whose hub is ${hub}.` : "Installs this machine as your first CawCo hub, dashboard and agent."}
set -eu

${hub ? `HUB=${shellQuote(hub)}\n` : ""}REPO=${shellQuote(origin)}
PUBLIC_KEY=${shellQuote(publicKey)}
RELEASE_HOST="\${CAWCO_RELEASE_HOST:-${releaseHost ?? ""}}"
CHANNEL="\${CAWCO_CHANNEL:-stable}"
ROOT="\${CAWCO_BINARY_ROOT:-\${XDG_DATA_HOME:-$HOME/.local/share}/cawco/binary}"

say() { printf '${INSTALL_STEP_PREFIX}%s\\n' "$*"; }
fail() { printf 'cawco: %s\\n' "$*" >&2; exit 1; }

# A machine that has CawCo is not touched: one way to update, and it is the app.
if [ -f "$ROOT/installation.json" ]; then
  installed="$(sed -n 's/.*"installedVersion":"\\([^"]*\\)".*/\\1/p' "$ROOT/installation.json")"
  channel="$(sed -n 's/.*"channel":"\\([^"]*\\)".*/\\1/p' "$ROOT/update-state.json" 2>/dev/null || :)"
  printf 'CawCo %s is already installed on this machine (channel: %s).\\n' "\${installed:-unknown}" "\${channel:-not reported yet}"
  printf 'Updates are installed from the CawCo app, automatically when this machine is idle or with Install now. Nothing was changed.\\n'
  exit 0
fi

case "$(uname -s)" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  *) fail "CawCo runs on Linux and macOS." ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) fail "CawCo has builds for x86_64 and arm64 machines; this one is $(uname -m)." ;;
esac
TARGET="$OS-$ARCH"
case "$CHANNEL" in stable|nightly) ;; *) fail "CAWCO_CHANNEL must be stable or nightly." ;; esac

for tool in curl tar; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is needed to download CawCo and this machine has none. Install it with the system's package manager, then run this again."
done
if command -v sha256sum >/dev/null 2>&1; then
  sha256_of() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_of() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
  fail "A SHA-256 tool (sha256sum or shasum) is needed to check the download and this machine has none."
fi

# The signature is checked with the system's own openssl. It is never skipped.
if ! command -v openssl >/dev/null 2>&1; then
  [ "$OS" = linux ] || fail "openssl is missing and this Mac should have one at /usr/bin/openssl. Install it, then run this again."
  if command -v apt-get >/dev/null 2>&1; then
    INSTALL="apt-get install -y openssl"
  elif command -v dnf >/dev/null 2>&1; then
    INSTALL="dnf install -y openssl"
  elif command -v yum >/dev/null 2>&1; then
    INSTALL="yum install -y openssl"
  elif command -v zypper >/dev/null 2>&1; then
    INSTALL="zypper --non-interactive install openssl"
  elif command -v pacman >/dev/null 2>&1; then
    INSTALL="pacman --noconfirm -S openssl"
  elif command -v apk >/dev/null 2>&1; then
    INSTALL="apk add openssl"
  else
    fail "openssl is missing and no supported package manager was found. Install openssl, then run this again."
  fi
  SUDO=""
  if [ "$(id -u)" != 0 ]; then
    command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null || fail "openssl is missing and installing it needs administrator access. Ask an administrator to run: sudo $INSTALL, then run this again."
    SUDO="sudo "
  fi
  say "installing openssl, to check the release signature; command: $SUDO$INSTALL"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update >/dev/null || fail "refreshing package indexes failed; run: \${SUDO}apt-get update, then run this again."
  fi
  $SUDO $INSTALL >/dev/null || fail "installing openssl failed; run: $SUDO$INSTALL, then run this again."
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
trap '' HUP

download() { curl -fsSL --retry 3 --connect-timeout 15 "$1" -o "$2" || fail "could not download $1"; }

say "finding the newest $CHANNEL release"
if [ -n "$RELEASE_HOST" ]; then
  BASE="\${RELEASE_HOST%/}/$CHANNEL"
else
  SLUG="\${REPO#https://github.com/}"
  if [ "$CHANNEL" = stable ]; then
    TAG="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$REPO/releases/latest" | sed 's|.*/tag/||')" || fail "could not reach $REPO"
  else
    download "https://api.github.com/repos/$SLUG/releases?per_page=30" "$WORK/releases.json"
    TAG="$(grep -o '"tag_name": *"nightly-[^"]*"' "$WORK/releases.json" | head -n 1 | sed 's/.*"\\(nightly-[^"]*\\)"/\\1/')"
  fi
  [ -n "\${TAG:-}" ] || fail "no published $CHANNEL release was found at $REPO"
  BASE="$REPO/releases/download/$TAG"
fi
download "$BASE/release.json" "$WORK/release.json"
download "$BASE/release.json.sig" "$WORK/release.json.sig"

say "verifying the release signature"
printf '%s\\n' "$PUBLIC_KEY" > "$WORK/release.pub"
openssl base64 -d -A -in "$WORK/release.json.sig" -out "$WORK/release.sig" 2>/dev/null \\
  || fail "the release signature is not readable. Nothing was installed."
openssl dgst -sha256 -verify "$WORK/release.pub" -signature "$WORK/release.sig" "$WORK/release.json" >/dev/null 2>&1 \\
  || fail "the release signature does not match CawCo's release key. Nothing was installed."

MANIFEST="$(cat "$WORK/release.json")"
VERSION="$(printf '%s' "$MANIFEST" | sed -n 's/^{"version":"\\([^"]*\\)".*/\\1/p')"
[ -n "$VERSION" ] || fail "the signed release names no version. Nothing was installed."
printf '%s' "$MANIFEST" | grep -q "\\"channel\\":\\"$CHANNEL\\"" || fail "the signed release is not on the $CHANNEL channel. Nothing was installed."
ENTRY="$(printf '%s' "$MANIFEST" | grep -o "{\\"target\\":\\"$TARGET\\",\\"archive\\":\\"[^\\"]*\\",\\"sha256\\":\\"[0-9a-f]*\\",\\"size\\":[0-9]*,\\"binarySha256\\":\\"[0-9a-f]*\\"")" \\
  || fail "this release has no build for $TARGET. Nothing was installed."
ARCHIVE="$(printf '%s' "$ENTRY" | sed 's/.*"archive":"\\([^"]*\\)".*/\\1/')"
ARCHIVE_SHA="$(printf '%s' "$ENTRY" | sed 's/.*"sha256":"\\([0-9a-f]*\\)".*/\\1/')"
BINARY_SHA="$(printf '%s' "$ENTRY" | sed 's/.*"binarySha256":"\\([0-9a-f]*\\)".*/\\1/')"

say "downloading CawCo $VERSION for $TARGET"
download "$BASE/$ARCHIVE" "$WORK/$ARCHIVE"
[ "$(sha256_of "$WORK/$ARCHIVE")" = "$ARCHIVE_SHA" ] || fail "the download does not match the signed checksum. Nothing was installed."
mkdir "$WORK/extract"
tar -xzf "$WORK/$ARCHIVE" -C "$WORK/extract" cawco || fail "the download could not be unpacked. Nothing was installed."
[ "$(sha256_of "$WORK/extract/cawco")" = "$BINARY_SHA" ] || fail "the unpacked program does not match the signed checksum. Nothing was installed."

say "installing CawCo $VERSION into $ROOT"
mkdir -p "$ROOT/versions/$VERSION" "$HOME/.local/bin"
chmod 700 "$ROOT" "$ROOT/versions"
mv "$WORK/extract/cawco" "$ROOT/versions/$VERSION/cawco"
chmod 700 "$ROOT/versions/$VERSION/cawco"
cp "$WORK/release.json" "$ROOT/versions/$VERSION/release.json"
printf '{"signature":"%s"}\\n' "$(cat "$WORK/release.json.sig")" > "$ROOT/versions/$VERSION/release.signature.json"
ln -sfn "versions/$VERSION" "$ROOT/current"
ln -sf "$ROOT/current/cawco" "$HOME/.local/bin/cawco"

AUTO=""
ASK=""
if [ -t 1 ] && (: </dev/tty) 2>/dev/null; then
  ASK=--ask
${
  hub
    ? ""
    : `  if [ -z "\${CAWCO_AUTO_UPDATE:-}" ]; then
    printf 'Install CawCo updates automatically when this machine is idle? [y/N] ' >/dev/tty
    read -r answer </dev/tty || answer=n
    case "$answer" in y|Y|yes|YES) CAWCO_AUTO_UPDATE=1 ;; esac
  fi
`
}fi
[ "\${CAWCO_AUTO_UPDATE:-0}" = 1 ] && AUTO=--auto-update

if [ "$OS" = linux ]; then
  [ -d /run/systemd/system ] || fail "this machine is not running systemd; CawCo needs systemd user services."
  if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != yes ]; then
    if [ "$(id -u)" = 0 ]; then
      say "enabling persistent user services; command: loginctl enable-linger $(id -un)"
      loginctl enable-linger "$(id -un)" || fail "enable lingering as an administrator with: sudo loginctl enable-linger $(id -un), then run this again."
    else
      say "enabling persistent user services; command: sudo loginctl enable-linger $(id -un)"
      command -v sudo >/dev/null 2>&1 && sudo loginctl enable-linger "$(id -un)" || fail "enable lingering as an administrator with: sudo loginctl enable-linger $(id -un), then run this again."
    fi
  fi
fi

HOSTFLAG=""
[ -z "$RELEASE_HOST" ] || HOSTFLAG="--release-host $RELEASE_HOST"
${
  hub
    ? `say "joining $HUB"
# shellcheck disable=SC2086
if [ -n "$ASK" ]; then
  "$ROOT/current/cawco" binary-install agent --hub "$HUB" --channel "$CHANNEL" $ASK $HOSTFLAG </dev/tty
else
  "$ROOT/current/cawco" binary-install agent --hub "$HUB" --channel "$CHANNEL" $HOSTFLAG </dev/null
fi
`
    : `# Fix the socket address explicitly so the printed URL names this install.
PORT="\${PORT:-3000}"
HOST="\${HOST:-0.0.0.0}"
${CAWCO_ENV.hubPort}="\${${CAWCO_ENV.hubPort}:-${CAWCO_HUB_PORT}}"
export PORT HOST ${CAWCO_ENV.hubPort}
say "starting the hub, dashboard and agent"
# shellcheck disable=SC2086
if [ -n "$ASK" ]; then
  "$ROOT/current/cawco" binary-install hub --hub "http://127.0.0.1:$${CAWCO_ENV.hubPort}" --channel "$CHANNEL" $ASK $AUTO $HOSTFLAG </dev/tty
else
  "$ROOT/current/cawco" binary-install hub --hub "http://127.0.0.1:$${CAWCO_ENV.hubPort}" --channel "$CHANNEL" $AUTO $HOSTFLAG </dev/null
fi
case "$HOST" in
  0.0.0.0|::) DASHBOARD_HOST=localhost ;;
  *:*) DASHBOARD_HOST="[$HOST]" ;;
  *) DASHBOARD_HOST="$HOST" ;;
esac
printf '\\nCawCo is ready. Open your dashboard:\\n  %s\\n' "http://$DASHBOARD_HOST:$PORT"
`
}`;
};
