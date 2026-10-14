# Sourced by a bash script that is a heavy run (scripts/lib/heavy-run.ts):
#   source scripts/lib/heavy-run.sh; heavy_run <command words to name it by>
# takes one of the machine's heavy-run slots for the rest of this shell's
# life, waiting for one when all are held. The slot is held by a bun process
# on fd 9's other end, a child of this shell, which lets it go within 0.2 s
# of this shell ending, however it ends. Bash 3.2 (the Mac's) runs it.
# How many slots there are is heavy-run.ts's alone (`heavy-run.ts count`).
heavy_run() {
  if [[ -n ${CAWCO_HEAVY_RUN_HELD:-} ]]; then return 0; fi
  local line=
  exec 9< <(exec bun "${BASH_SOURCE[0]%/*}/heavy-run.ts" hold "$$" "$@")
  IFS= read -r line <&9 || true
  if [[ $line != held ]]; then
    echo "no heavy-run slot was taken: scripts/lib/heavy-run.ts hold ended without one" >&2
    exit 2
  fi
  export CAWCO_HEAVY_RUN_HELD=1
}
