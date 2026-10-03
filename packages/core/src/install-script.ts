import { CAWCO_ENV, CAWCO_HUB_PORT } from "./index";
import { INSTALL_STEP_PREFIX } from "./join";

/** Shared with deploy init: installers always clone the deployment branch. */
export const DEPLOY_BRANCH = "main";
export const DEPLOY_MARKER = ".cawco-deploy";

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * One POSIX installer for a first machine or a worker joining an existing hub.
 * Nothing runs until the complete main function has arrived. The detached body
 * and followed log keep an SSH hangup from interrupting a deployment.
 */
export const generateInstallScript = ({
  origin,
  hub,
}: {
  origin: string;
  hub?: string;
}): string => `#!/bin/sh
# ${hub ? `Adds this machine to the CawCo fleet whose hub is ${hub}.` : "Installs this machine as your first CawCo hub, dashboard and agent."}
set -eu

${hub ? `HUB=${shellQuote(hub)}\n` : ""}ORIGIN=${shellQuote(origin)}

say() { printf '${INSTALL_STEP_PREFIX}%s\\n' "$*"; }
fail() { printf 'cawco: %s\\n' "$*" >&2; exit 1; }

main() {
  say "checking for git, curl and unzip"
  missing=""
  for tool in git curl; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  if [ "$(uname -s)" = Linux ] && ! command -v unzip >/dev/null 2>&1; then
    missing="$missing unzip"
  fi
  if [ -n "$missing" ]; then
    fail "this machine is missing:$missing. Install them with its package manager, then run this again."
  fi

  PATH="$HOME/.bun/bin:$PATH"
  export PATH
  if command -v bun >/dev/null 2>&1; then
    say "using Bun $(bun --version)"
  else
    say "installing Bun"
    # Bun's installer is a bash script; nothing else here needs bash.
    command -v bash >/dev/null 2>&1 || fail "Bun's installer needs bash, and this machine has none. Install bash with its package manager, then run this command again."
    curl -fsSL https://bun.com/install | bash
    command -v bun >/dev/null 2>&1 || fail "Bun did not install. Its installer's output is above."
  fi

  ROOT="\${${CAWCO_ENV.deployRoot}:-$HOME/.cawco/app}"
  if [ -z "$(ls -A "$ROOT" 2>/dev/null)" ]; then
    say "cloning $ORIGIN into $ROOT"
    git clone --quiet --branch ${DEPLOY_BRANCH} --single-branch "$ORIGIN" "$ROOT"
  elif [ -f "$ROOT/${DEPLOY_MARKER}" ]; then
    say "$ROOT is already this machine's deployment clone"
  else
    fail "$ROOT already exists and is not a deployment clone (no ${DEPLOY_MARKER}). Refusing to touch it — move it aside, or point elsewhere with ${CAWCO_ENV.deployRoot}."
  fi

  cd "$ROOT"
${
  hub
    ? ""
    : `  # Install Node before dependencies: native install scripts need it too.
  PATH="$HOME/.cawco/node/bin:$PATH"
  export PATH
  if ! command -v node >/dev/null 2>&1; then
    say "installing Node.js 24 LTS"
    command -v tar >/dev/null 2>&1 || fail "installing Node.js needs tar. Install it with this machine's package manager, then run this again."
    case "$(uname -s)" in
      Darwin) NODE_OS=darwin ;;
      Linux) NODE_OS=linux ;;
      *) fail "CawCo services require macOS or Linux." ;;
    esac
    case "$(uname -m)" in
      x86_64) NODE_ARCH=x64 ;;
      arm64|aarch64) NODE_ARCH=arm64 ;;
      *) fail "Node.js installation supports x86_64 and arm64 machines." ;;
    esac
    NODE_VERSION=v24.21.0
    NODE_ARCHIVE="node-$NODE_VERSION-$NODE_OS-$NODE_ARCH.tar.gz"
    NODE_TMP="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$NODE_ARCHIVE" -o "$NODE_TMP/$NODE_ARCHIVE"
    mkdir -p "$HOME/.cawco/node"
    tar -xzf "$NODE_TMP/$NODE_ARCHIVE" -C "$HOME/.cawco/node" --strip-components=1
    rm -rf "$NODE_TMP"
  fi
  say "using Node.js $(node --version)"

`
}
  # The CLI imports its workspace packages the moment it starts, so a fresh
  # clone needs them before the setup command can run at all.
  say "installing dependencies"
  bun install --frozen-lockfile

${
  hub
    ? `  say "running cawco join"
  bun packages/cli/src/cli.ts join --hub "$HUB"`
    : `  if [ "$(uname -s)" = Linux ]; then
    [ -d /run/systemd/system ] || fail "this machine is not running systemd; CawCo needs systemd user services."
    say "enabling persistent user services"
    [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" = yes ] || loginctl enable-linger || fail "enable lingering as an administrator with: sudo loginctl enable-linger $(id -un), then run this again."
  fi

  # Fix the socket address explicitly so the printed URL names this install.
  PORT="\${PORT:-3000}"
  HOST="\${HOST:-0.0.0.0}"
  ${CAWCO_ENV.hubPort}="\${${CAWCO_ENV.hubPort}:-${CAWCO_HUB_PORT}}"
  export PORT HOST ${CAWCO_ENV.hubPort}
  say "running cawco deploy init"
  bun packages/cli/src/cli.ts deploy init --origin "$ORIGIN" --hub "http://127.0.0.1:$${CAWCO_ENV.hubPort}"

  case "$HOST" in
    0.0.0.0|::) DASHBOARD_HOST=localhost ;;
    *:*) DASHBOARD_HOST="[$HOST]" ;;
    *) DASHBOARD_HOST="$HOST" ;;
  esac
  DASHBOARD_URL="http://$DASHBOARD_HOST:$PORT"
  # deploy init checked hub health, sessiond, this machine's online agent and
  # the dashboard before returning. A dashboard redirect alone proves nothing.
  printf '\\nCawCo is ready. Open your dashboard:\\n  %s\\n' "$DASHBOARD_URL"`
}
}

# A dropped session loses only the follower; the install ignores hangup.
trap '' HUP
LOG="$(mktemp)"
main > "$LOG" 2>&1 &
INSTALL=$!
tail -f "$LOG" &
FOLLOWER=$!
STATUS=0
wait "$INSTALL" || STATUS=$?
sleep 1
kill "$FOLLOWER" 2>/dev/null || :
rm -f "$LOG"
exit "$STATUS"
`;
