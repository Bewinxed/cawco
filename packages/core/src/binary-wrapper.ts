/**
 * The script the hub, dashboard and agent units start through. It runs the
 * current build, but first puts the previous build back when an update's trial
 * ran out without the new build confirming itself: the recovery for an update
 * helper that died after the swap, which does not depend on the new build being
 * able to start. It is written once at install and never replaced by an update.
 */
export const BINARY_WRAPPER = `#!/bin/sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
TRIAL="$ROOT/trial.json"
if [ -f "$TRIAL" ]; then
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
      pid="$(sed -n 's/.*"pid":\\([0-9]*\\).*/\\1/p' "$db.migrating")"
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then migrating=1; fi
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
