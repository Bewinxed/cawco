import { chmod, rename } from "node:fs/promises";
import { join } from "node:path";

/**
 * The script the hub, dashboard, agent and session keeper units start through.
 *
 * An update's trial is decided by one process, the update helper (`cawco
 * binary-apply`), and nothing here decides it. What this script does is see
 * that a decider is running: a unit that starts while `trial.json` is open and
 * no helper holds the lock (the helper died, or the machine rebooted mid-trial)
 * launches one, `binary-apply --resume`, from the build the trial would put
 * back. That build ran before the swap, so the decider does not depend on the
 * new build being able to start. It is launched as a job of the service
 * manager, not of this unit, so the rollback it may decide, which restarts
 * this unit, does not end it.
 *
 * The session keeper is started through the same script from its own link,
 * and keeps its own recovery for a keeper move: a move writes
 * `keeper-trial.json` before it changes the link, and the keeper's next start
 * after the deadline, with no helper live, puts the previous keeper back.
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
# Atomic: a temporary link, then a rename onto the link (GNU mv -T, BSD mv -h).
swap_link() {
  ln -sfn "$1" "$2.swap" && { mv -T "$2.swap" "$2" 2>/dev/null || mv -h "$2.swap" "$2"; }
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
if [ -f "$TRIAL" ] && ! helper_live; then
  previous="$(sed -n 's/.*"previous":"\\([^"]*\\)".*/\\1/p' "$TRIAL")"
  version="$(sed -n 's/.*"version":"\\([^"]*\\)".*/\\1/p' "$TRIAL")"
  if [ -n "$previous" ] && [ -x "$ROOT/versions/$previous/cawco" ]; then
    echo "cawco: the trial of $version is open and no update helper is deciding it; starting one from $previous" >&2
    launch_decider "$ROOT/versions/$previous/cawco" || echo "cawco: the update helper could not be started" >&2
  fi
fi
if [ "$1" = sessiond ]; then
  KEEPER_TRIAL="$ROOT/keeper-trial.json"
  if [ -f "$KEEPER_TRIAL" ] && ! helper_live; then
    keeper_deadline="$(sed -n 's/.*"deadline":\\([0-9][0-9]*\\).*/\\1/p' "$KEEPER_TRIAL")"
    keeper_from="$(sed -n 's/.*"from":"\\([^"]*\\)".*/\\1/p' "$KEEPER_TRIAL")"
    if [ -n "$keeper_deadline" ] && [ -n "$keeper_from" ] && [ "$(date +%s)" -gt "$keeper_deadline" ]; then
      swap_link "versions/$keeper_from" "$ROOT/keeper"
      cp "$KEEPER_TRIAL" "$ROOT/keeper-trial.recovered"
      rm -f "$KEEPER_TRIAL" "$ROOT/apply.lock"
    fi
  fi
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
