import { chmod, rename } from "node:fs/promises";
import { join } from "node:path";

/**
 * The script the hub, dashboard, agent and session keeper units start through.
 *
 * An update's trial is decided by one process, the update helper (`cawco
 * binary-apply`), and nothing here decides it. What this script does is see
 * that a decider is running: a unit (hub, dashboard, agent, keeper; not the
 * boundary hook, which runs through here on every shell call of a bounded
 * session) that starts while `trial.json` is open and
 * no helper holds the lock (the helper died, or the machine rebooted mid-trial)
 * launches one, `binary-apply --resume`, from the build the trial would put
 * back. That build ran before the swap, so the decider does not depend on the
 * new build being able to start. It is launched as a job of the service
 * manager, not of this unit, so the rollback it may decide, which restarts
 * this unit, does not end it.
 *
 * A build's session keeper runs from its own folder, in a job of its own
 * (keepers.ts), and not through here. A legacy keeper's unit, from before
 * keepers ran side by side, still starts through `sessiond`, from the
 * `keeper` link, until the handover that retires it removes the unit.
 *
 * Written by the installer, and afterwards only by a build the update helper
 * has confirmed ({@link writeWrapper}): the script that recovers a trial is
 * always one a confirmed build wrote, never the build on trial.
 */
export const BINARY_WRAPPER = `#!/bin/sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
TRIAL="$ROOT/trial.json"
# A helper is live when the lock names a process that is still the one that wrote it: same start time, same
# boot (a killed helper leaves its lock, and its pid can be reused).
helper_live() {
  [ -f "$ROOT/apply.lock" ] || return 1
  lock_pid="$(sed -n 's/.*"pid":\\([0-9][0-9]*\\).*/\\1/p' "$ROOT/apply.lock")"
  lock_start="$(sed -n 's/.*"procStart":"\\([^"]*\\)".*/\\1/p' "$ROOT/apply.lock")"
  lock_boot="$(sed -n 's/.*"bootId":"\\([^"]*\\)".*/\\1/p' "$ROOT/apply.lock")"
  [ -n "$lock_pid" ] && [ -n "$lock_start" ] && kill -0 "$lock_pid" 2>/dev/null || return 1
  if [ -r "/proc/$lock_pid/stat" ]; then
    live_start="$(sed 's/^.*) //' "/proc/$lock_pid/stat" | cut -d ' ' -f 20)"
    live_boot="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)"
  else
    live_start="$(ps -o lstart= -p "$lock_pid" | sed 's/^ *//;s/ *$//')"
    live_boot="$(sysctl -n kern.boottime 2>/dev/null)"
  fi
  [ -n "$live_start" ] && [ "$live_start" = "$lock_start" ] && [ "$live_boot" = "$lock_boot" ]
}
# What the decider is given of this unit's environment: CawCo's own settings, and where things are.
forwarded() {
  env | grep -E '^(CAWCO_[A-Z0-9_]*|PATH|HOME|XDG_[A-Z_]*)='
}
# Starts the update helper given as $1 as a one-shot job of the service manager.
launch_decider() {
  stamp="$(date +%s)-$$"
  if [ "$(uname)" = Darwin ]; then
    label="dev.cawco.binary-apply.resume-$stamp"
    plist="$ROOT/$label.plist"
    {
      printf '<?xml version="1.0" encoding="UTF-8"?>\\n<plist version="1.0"><dict><key>Label</key><string>%s</string>' "$label"
      printf '<key>ProgramArguments</key><array><string>%s</string><string>binary-apply</string><string>--resume</string></array>' "$1"
      printf '<key>EnvironmentVariables</key><dict>'
      while IFS='=' read -r key value; do
        printf '<key>%s</key><string>%s</string>' "$key" "$(printf '%s' "$value" | sed 's/&/\\&amp;/g;s/</\\&lt;/g;s/>/\\&gt;/g')"
      done <<EOF
$(forwarded)
EOF
      printf '</dict><key>RunAtLoad</key><true/></dict></plist>\\n'
    } > "$plist"
    launchctl bootstrap "gui/$(id -u)" "$plist"
  else
    decider="$1"
    set --
    while IFS= read -r pair; do
      set -- "$@" "--setenv=$pair"
    done <<EOF
$(forwarded)
EOF
    XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" systemd-run --user --collect --quiet \\
      --unit="cawco-binary-apply-resume-$stamp" --property=Type=exec "$@" "$decider" binary-apply --resume
  fi
}
# Only a unit's start looks for an orphaned trial: every other verb (a session's boundary hook runs through this
# script on every shell call) goes straight to the build, and says nothing.
case "$1" in hub | dashboard | up | sessiond) unit_start=1 ;; *) unit_start=0 ;; esac
if [ "$unit_start" = 1 ] && [ -f "$TRIAL" ] && ! helper_live; then
  previous="$(sed -n 's/.*"previous":"\\([^"]*\\)".*/\\1/p' "$TRIAL")"
  version="$(sed -n 's/.*"version":"\\([^"]*\\)".*/\\1/p' "$TRIAL")"
  if [ -n "$previous" ] && [ -x "$ROOT/versions/$previous/cawco" ]; then
    echo "cawco: the trial of $version is open and no update helper is deciding it; starting one from $previous" >&2
    launch_decider "$ROOT/versions/$previous/cawco" || echo "cawco: the update helper could not be started" >&2
  fi
fi
if [ "$1" = sessiond ]; then
  exec "$ROOT/keeper/cawco" sessiond
fi
exec "$ROOT/current/cawco" "$@"
`;

/**
 * Puts {@link BINARY_WRAPPER} at `<root>/run`, atomically: a shell already
 * reading the old script keeps reading the file it opened.
 */
export async function writeWrapper(root: string): Promise<void> {
  const path = join(root, "run");
  const temporary = `${path}.${process.pid}.tmp`;
  await Bun.write(temporary, BINARY_WRAPPER);
  await chmod(temporary, 0o700);
  await rename(temporary, path);
}
