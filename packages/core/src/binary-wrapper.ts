/**
 * The script the hub, dashboard, agent and session keeper units start through.
 * Most verbs run the current build, but first put the previous build back when
 * an update's trial ran out without the new build confirming itself: the
 * recovery for an update helper that died after the swap, which does not depend
 * on the new build being able to start. The keeper is started through the same
 * script, from its own link, and gets the same recovery for a keeper move: a
 * move writes `keeper-trial.json` before it changes the link, and the keeper's
 * next start after the deadline puts the previous build back. Nothing is
 * restored while a helper is live: the helper owns the outcome and rolls back
 * itself. Written once at install and never replaced by an update.
 */
export const BINARY_WRAPPER = `#!/bin/sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
TRIAL="$ROOT/trial.json"
# A helper is live when the lock names a pid that answers.
helper_live() {
  [ -f "$ROOT/apply.lock" ] || return 1
  lock_pid="$(sed -n 's/.*"pid":\\([0-9][0-9]*\\).*/\\1/p' "$ROOT/apply.lock")"
  [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null
}
# Atomic: a temporary link, then a rename onto the link (GNU mv -T, BSD mv -h).
swap_link() {
  ln -sfn "$1" "$2.swap" && { mv -T "$2.swap" "$2" 2>/dev/null || mv -h "$2.swap" "$2"; }
}
if [ "$1" = sessiond ]; then
  KEEPER_TRIAL="$ROOT/keeper-trial.json"
  if [ -f "$KEEPER_TRIAL" ] && ! helper_live; then
    keeper_deadline="$(sed -n 's/.*"deadline":\\([0-9][0-9]*\\).*/\\1/p' "$KEEPER_TRIAL")"
    keeper_from="$(sed -n 's/.*"from":"\\([^"]*\\)".*/\\1/p' "$KEEPER_TRIAL")"
    if [ -n "$keeper_deadline" ] && [ -n "$keeper_from" ] && [ "$(date +%s)" -gt "$keeper_deadline" ]; then
      swap_link "versions/$keeper_from" "$ROOT/keeper"
      cp "$KEEPER_TRIAL" "$ROOT/keeper-trial.recovered"
      rm -f "$KEEPER_TRIAL"
    fi
  fi
  exec "$ROOT/keeper/cawco" sessiond
fi
if [ -f "$TRIAL" ] && ! helper_live; then
  field() { sed -n "s/.*\\"$1\\":\\"\\([^\\"]*\\)\\".*/\\1/p" "$TRIAL"; }
  deadline="$(sed -n 's/.*"deadline":\\([0-9][0-9]*\\).*/\\1/p' "$TRIAL")"
  if [ -n "$deadline" ] && [ "$(date +%s)" -gt "$deadline" ]; then
    previous="$(field previous)"
    version="$(field version)"
    role="$(field role)"
    db="$(field dbPath)"
    backup="$(field dbBackup)"
    migrating=0
    if [ -n "$db" ] && [ -f "$db.migrating" ]; then
      mfield() { sed -n "s/.*\\"$1\\":\\"\\([^\\"]*\\)\\".*/\\1/p" "$db.migrating"; }
      pid="$(sed -n 's/.*"pid":\\([0-9]*\\).*/\\1/p' "$db.migrating")"
      # A marker is live only if its process is still the one that wrote it: same start time, same boot.
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        if [ -r "/proc/$pid/stat" ]; then
          now_start="$(sed 's/^.*) //' "/proc/$pid/stat" | cut -d ' ' -f 20)"
          now_boot="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)"
        else
          now_start="$(ps -o lstart= -p "$pid" | sed 's/^ *//;s/ *$//')"
          now_boot="$(sysctl -n kern.boottime 2>/dev/null)"
        fi
        if [ -n "$now_start" ] && [ "$now_start" = "$(mfield procStart)" ] && [ "$now_boot" = "$(mfield bootId)" ]; then migrating=1; fi
      fi
    fi
    if [ -n "$previous" ] && [ "$migrating" = 0 ]; then
      ln -sfn "versions/$previous" "$ROOT/current"
      [ ! -f "$ROOT/installation.previous.json" ] || cp "$ROOT/installation.previous.json" "$ROOT/installation.json"
      # One service finishes the recovery: the hub restores its database, an agent-only machine's agent has none.
      if { [ "$role" = hub ] && [ "$1" = hub ]; } || { [ "$role" != hub ] && [ "$1" = up ]; }; then
        if [ -n "$backup" ] && [ -f "$backup" ] && [ -n "$db" ]; then
          mv "$db" "$db.migrated-$version"
          rm -f "$db-wal" "$db-shm"
          cp "$backup" "$db"
        fi
        printf '%s\\n' "$version" > "$ROOT/trial.recovered"
        rm -f "$TRIAL" "$ROOT/installation.previous.json"
      fi
    fi
  fi
fi
exec "$ROOT/current/cawco" "$@"
`;
