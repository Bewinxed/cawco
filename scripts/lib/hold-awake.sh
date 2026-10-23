# Sourced: defines
#   hold_awake <pid> <why>
# which keeps the machine from idle-sleeping for as long as process <pid>
# runs, through the platform's own primitive, and returns when <pid> ends.
# Every long run the repo ships (the release, a probe kit run, the stage-2
# builds and proofs, a scratch fleet) holds it for its whole life, whether it
# started from a terminal, a systemd unit or a session; a TypeScript entry
# calls it through hold-awake.ts, a bash one as `hold_awake "$$" "…" & disown`.
#
#  - Linux: `systemd-inhibit --what=idle:sleep --mode=block` around
#    `tail --pid=<pid> -f /dev/null` (systemd-inhibit(1): the lock is held
#    "until the command line exits"; tail(1): "--pid … terminate after process
#    ID, PID dies"). It shows in `systemd-inhibit --list` as Who `CawCo`, What
#    `sleep:idle`, Mode `block`, Why <why>.
#  - macOS: `caffeinate -i -w <pid>` ("-i Create an assertion to prevent the
#    system from idle sleeping", "-w … Once the process exits, the assertion
#    is also released"). It shows in `pmset -g assertions` as a
#    PreventUserIdleSystemSleep assertion held by caffeinate.
#
# Either way the hold is a child of the run's own process (never an orphan)
# and ends on its own when the run ends, however it ends: a SIGKILL included.
# Where the primitive is refused (no systemd-inhibit, no logind bus inside a
# workspace's boundary, polkit saying no), the run is not held awake and goes
# on: one line on stderr says so, with the primitive's own words. Bash 3.2
# (the Mac's) runs it.
#
# Why: until 2026-10-23 every such run held a heavy-run slot, which agent
# awake.ts read; with the slots gone (48129327f), a release started by
# scripts/ship.sh as a `systemd-run --user` unit held nothing, and obelisk
# could idle-sleep in the middle of one.
hold_awake() {
  local pid=$1 why=$2 said
  case $(uname -s) in
    Linux)
      if ! command -v systemd-inhibit > /dev/null; then
        echo "$why is not kept awake: systemd-inhibit is not on PATH" >&2
        return 4
      fi
      said=$( { systemd-inhibit --what=idle:sleep --mode=block --who=CawCo --why="$why" \
        tail --pid="$pid" -f /dev/null > /dev/null; } 2>&1)
      ;;
    Darwin)
      said=$( { /usr/bin/caffeinate -i -w "$pid" > /dev/null; } 2>&1)
      ;;
    *)
      echo "$why is not kept awake: $(uname -s) has neither systemd-inhibit nor caffeinate" >&2
      return 4
      ;;
  esac
  local rc=$?
  # A hold that ended with its run is the hold doing its job; one that ended while the run goes on was refused.
  if kill -0 "$pid" 2> /dev/null; then
    echo "$why is not kept awake: the hold exited $rc${said:+: $said}" >&2
    return 4
  fi
  return 0
}
