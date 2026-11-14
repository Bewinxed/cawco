#!/bin/bash
# End-to-end test of the binary installer and the app-driven updater, in rootless containers with real systemd: five
# rigs, each its own scenario on its own machines, all at once. Usage:
#   bun scripts/binary/build-e2e.ts /ABSOLUTE/BINARIES        # builds (or takes from the test cache) what this needs
#   bash scripts/binary/e2e-test.sh /ABSOLUTE/FRESH/OUTPUT /ABSOLUTE/BINARIES
# Needs podman and bun on the host. Each rig is its own podman instance (its own root, runroot, tmp dir, file locks and
# event log; see ISOLATION below) on an internal network with no route out: a release host (a folder served over
# HTTP) and the machines its checks need. Each check prints one line ending in PASS (with its seconds), FAIL or NOT RUN.
# TEST_ONLY (an extended regex) runs only the rigs whose name, or one of whose checks' names, matches it; TEST_LIST=1
# says which rigs and checks a run would run and stops. TEST_RIGS caps how many rigs run at once (default: all).
#   bash scripts/binary/e2e-test.sh --image-only [OUTPUT]
# builds only the test's images (host and machine) into the test cache's store, prints their tags, and exits 0, or
# with the build's error; it needs podman and bun, and no binaries. Its recipes go in OUTPUT (default: image-only in the
# test cache).
#   bash scripts/binary/e2e-test.sh --tags-only OUTPUT
# writes the images' recipes into OUTPUT and prints the tags they carry (`NAME=TAG`), building nothing: it needs bun,
# and no podman (test-cache-prune.sh keeps the images they name).
set -uo pipefail
IMAGE_ONLY=
TAGS_ONLY=
if [[ ${1:-} == --image-only || ${1:-} == --tags-only ]]; then
  IMAGE_ONLY=1
  [[ $1 == --tags-only ]] && TAGS_ONLY=1
  shift
  (( $# <= 1 )) || { echo "usage: $0 --image-only|--tags-only [output]" >&2; exit 2; }
  set -- "${1:-${CAWCO_TEST_CACHE:-$HOME/.cache/cawco-test}/image-only}"
else
  [[ $# == 2 && "$1" = /* && "$2" = /* ]] || { echo "usage: $0 /absolute/fresh/output /absolute/binaries" >&2; exit 2; }
fi
mkdir -p "$1"
out=$(realpath "$1")
bins=${2:+$(realpath "$2")}
here=$(dirname "$(realpath "$0")")
self=$(realpath "$0")
[[ "$out" != *" "* ]] || { echo "output path may not contain spaces" >&2; exit 2; }
# podman's exec with a terminal (every installer that answers prompts) makes its console socket in TMPDIR and binds
# it by that path as given (conmon src/conn_sock.c `setup_console_socket`: `g_build_filename(g_get_tmp_dir(),
# "conmon-term.XXXXXX", NULL)`, copied into `sun_path`), and a unix socket's path holds 107 bytes: past that the exec
# fails with "crun: error opening …/conmon-term.XXXXXX: No such file or directory" (run-2, a 109-byte path). So
# TMPDIR is a short link in the user's runtime dir to $out/tmp: the files stay on disk under the output, and the
# socket's path is short whatever the output's is (a host check's 90-character output was refused, 549538c11). Its
# name comes from the output, so the orchestrator and each rig it starts (this script again) name the same link; the
# orchestrator removes it as it ends (orchestrator_done), and so does an image-only run.
mkdir -p "$out/tmp"
TMPDIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cawco-proof-tmp-$(printf %s "$out" | sha256sum | cut -c1-12)"
ln -sfn "$out/tmp" "$TMPDIR"
export TMPDIR

# The builds (scripts/binary/build-e2e.ts): two of this tree. BASE is every rig's install; NEXT is newer, the build
# each update goes to.
export BASE=0.0.1-test.2 NEXT=0.0.1-test.3
# The test's own pace for the update's timed steps (packages/core/src/clock.ts, replaced in these builds by
# scripts/binary/test-clock.ts): the trial window (180 s), the confirm hold (60 s), the first retry delay (60 s) and
# how long a retiring keeper sits empty (20 s) run this many times faster. The rigs test each step's order; the
# lengths are the product's.
TEST_TIME_SCALE=6

# ---------------------------------------------------------------- which rigs run
# A rig is a function rig_<name> below; its checks are its `check "<name>" …` lines.
RIGS=(hubself rollback migration handover sandbox)
# How many systemd machines each rig boots (its `machines` refuses any other count): what it holds of the host user's
# inotify instances while it runs.
declare -A RIG_MACHINES=([hubself]=1 [rollback]=1 [migration]=1 [handover]=2 [sandbox]=2)
# THE HOST USER'S INOTIFY INSTANCES are every rig's to share. The kernel charges an instance to its user in each user
# namespace up to the initial one, and every rootless container's namespace is the host user's, so all machines of
# every rig, and the host user's own processes, draw on one fs.inotify.max_user_instances (384 on obelisk). Run A of
# 2026-10-15 ran out: the agent's watch failed with "EMFILE: too many open files, watch '/home/cawco/.pi/agent'". Each
# machine holds its instances for its whole life, so the orchestrator starts a rig only while the machines running and
# its own fit. INOTIFY_PER_MACHINE is a machine's budget: CawCo's own processes held 5 measured on a scratch fleet
# (hub 0, sessiond 4, agent 1), systemd, journald, logind, dbus and the user's manager more; 32 is our call until the
# boot lines (`boot`: "inotify N") measure it. INOTIFY_RESERVE is room for the host user's processes that start while
# the test runs. Raising the host's limit (`sudo sysctl -w fs.inotify.max_user_instances=8192`, kept in
# /etc/sysctl.d) lets every rig run at once.
INOTIFY_PER_MACHINE=32
INOTIFY_RESERVE=64
rig_checks() {
  awk -v rig="rig_$1()" '$1 == rig { inside = 1; next } inside && /^}/ { inside = 0 } inside && /^  check "/ { split($0, q, "\""); print q[2] }' "$self"
}
rig_selected() {
  [[ -z ${TEST_ONLY:-} || $1 =~ $TEST_ONLY ]] && return 0
  local name
  while IFS= read -r name; do [[ $name =~ $TEST_ONLY ]] && return 0; done < <(rig_checks "$1")
  return 1
}
if [[ -z ${RIG:-} ]]; then
  SELECTED_RIGS=()
  for rig in "${RIGS[@]}"; do rig_selected "$rig" && SELECTED_RIGS+=("$rig"); done
  (( ${#SELECTED_RIGS[@]} > 0 )) || { echo "TEST_ONLY matches no rig or check: $TEST_ONLY" >&2; exit 2; }
  if [[ -n ${TEST_LIST:-} ]]; then
    for rig in "${SELECTED_RIGS[@]}"; do
      echo "rig $rig:"
      rig_checks "$rig" | sed 's/^/  /'
    done
    exit 0
  fi
fi

# Every podman this test starts is an instance of its own, sharing nothing with the host's containers or another
# rig, and its images come from the test cache's store, kept between runs (scripts/binary/podman-instance.sh).
# shellcheck source=base-image.sh
source "$here/base-image.sh"
# shellcheck source=podman-instance.sh
source "$here/podman-instance.sh"

# ================================================================ THE IMAGES' RECIPES
# Written into $out/images, built from there by test_images (podman-instance.sh) once per recipe.
write_images() {
  mkdir -p "$out/images"
  cat > "$out/images/host.Containerfile" <<EOF
FROM $BASE_LOCAL
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
EOF
  # A machine with nothing CawCo uses: no git, Bun, Node or openssl. Its only package source is a local folder holding
  # openssl, so the installer's own package-manager step runs for real with no network, and git, which the workspace
  # rig installs on the joined machine (a workspace is a git clone). It has what a workspace's srt boundary runs on
  # (packages/agent/src/boundary.ts HOST_TOOLS, srt's own checkLinuxDependencies): bubblewrap and socat; srt's ripgrep
  # ships in the build. The installer offers git only at a terminal and installs nothing without one (offerTools in
  # packages/cli/src/binary-install.ts), so git stays uninstalled.
  # A machine has the task room of a real one: podman's default pids limit (2048) makes systemd's own defaults, which
  # are percents of it (DefaultTasksMax= "Defaults to 15% of the minimum of kernel.pid_max=, kernel.threads-max= and
  # root cgroup pids.max", systemd-system.conf(5)), give every unit of the user's 307 tasks, under one session's own
  # limit of 8,192. So each machine holds 65,536 tasks (`boot`), and these drop-ins give each unit of the user's 49,152,
  # with no lower limit on the user's slice or manager. The user's service manager runs every unit and job (hub,
  # dashboard, agent, keepers, update helpers) with the test's pace for the update's timed steps.
  # No system service takes a kernel keyring of its own (KeyringMode=inherit for every service, a top-level `service.d`
  # drop-in: systemd.unit(5), "a top-level drop-in with type.d/ … allows altering or adding to the settings of all
  # corresponding unit files"). systemd.exec(5): KeyringMode "Defaults to private for services of the system service
  # manager", and private allocates "a new session keyring" with "the unique invocation ID … added as a protected key".
  # A rootless container's root is the host user, so every service of every machine took keys from that one user's
  # kernel.keys.maxkeys (200): run A of 2026-10-15 booted three machines, and the rest never got user@1000.service's bus.
  # Each machine has Claude Code installed as a person installs it, with its own installer, for the user that runs
  # CawCo (https://code.claude.com/docs/en/setup: "curl -fsSL https://claude.ai/install.sh | bash"; "bash -s <version>"
  # pins one): CawCo ships none, and a machine is signed in by that Claude Code's `auth status` reading the account dir
  # (account-dir.sh). Pinned to the CLI the SDK in this tree is built against, so the image's recipe names it.
  # The installer runs in a stage of its own, `claude`: it downloads over HTTPS, and the base image has no CA bundle
  # (nightly 835fce0df: "curl: (77) error setting certificate file: /etc/ssl/certs/ca-certificates.crt"), and noble's
  # ca-certificates depends on openssl ("dep: openssl (>= 1.1.1)", packages.ubuntu.com/noble/ca-certificates), which
  # the machine must not have. The base has bash and su; curl comes in with the CA bundle. The machine takes only what
  # the installer put in the user's ~/.local: the launcher ~/.local/bin/claude, an absolute link to the version under
  # ~/.local/share/claude (\$XDG_DATA_HOME/claude when set, which `su -` leaves unset), at the same paths, so the link
  # holds. Not the ~/.claude and ~/.claude.json it also writes: the machine's own Claude dir stays untouched.
  local claude_version
  claude_version=$(sdk_claude_version) || return 1
  machine_recipe > "$out/images/machine.Containerfile"
}
# A machine's recipe (see write_images).
machine_recipe() {
  cat <<EOF
FROM $BASE_LOCAL AS claude
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \\
 && apt-get install -y --no-install-recommends ca-certificates curl \\
 && usermod -l cawco -d /home/cawco -m ubuntu && groupmod -n cawco ubuntu \\
 && su - cawco -c 'curl -fsSL https://claude.ai/install.sh | bash -s $claude_version' \\
 && test "\$(readlink /home/cawco/.local/bin/claude)" = /home/cawco/.local/share/claude/versions/$claude_version \\
 && /home/cawco/.local/bin/claude --version | grep -F '$claude_version'

FROM $BASE_LOCAL
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \\
 && apt-get install -y --no-install-recommends systemd systemd-sysv dbus dbus-user-session curl sudo socat bubblewrap openssh-server openssh-client iproute2 \\
 && apt-get install -y --download-only openssl git \\
 && mkdir /debs && cp /var/cache/apt/archives/*.deb /debs/ \\
 && apt-get install -y --no-install-recommends dpkg-dev \\
 && (cd /debs && dpkg-scanpackages . > Packages) \\
 && apt-get purge -y dpkg-dev && apt-get autoremove -y --purge \\
 && rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \\
 && echo 'deb [trusted=yes] file:/debs ./' > /etc/apt/sources.list \\
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb \\
 && usermod -l cawco -d /home/cawco -m ubuntu && groupmod -n cawco ubuntu \\
 && echo 'cawco ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/cawco \\
 && mkdir -p /etc/systemd/system/user@.service.d /etc/systemd/system/user-.slice.d /etc/systemd/user.conf.d /etc/systemd/system/service.d \\
 && printf '[Service]\\nKeyringMode=inherit\\n' > /etc/systemd/system/service.d/test-keyring.conf \\
 && printf '[Service]\\nTasksMax=infinity\\n' > /etc/systemd/system/user@.service.d/test-tasks.conf \\
 && printf '[Slice]\\nTasksMax=infinity\\n' > /etc/systemd/system/user-.slice.d/test-tasks.conf \\
 && printf '[Manager]\\nDefaultTasksMax=49152\\nDefaultEnvironment=CAWCO_TEST_TIME_SCALE=$TEST_TIME_SCALE\\n' > /etc/systemd/user.conf.d/test.conf
COPY --from=claude --chown=cawco:cawco /home/cawco/.local /home/cawco/.local
RUN HOME=/tmp/claude-check /home/cawco/.local/bin/claude --version | grep -F '$claude_version' \\
 && rm -rf /tmp/claude-check && ! command -v openssl
EOF
}

# ================================================================ THE ORCHESTRATOR (run below, once every
# function it uses is defined)
orchestrate() {
  python3 -c 'import pexpect' 2> /dev/null || { echo "python3 with pexpect is needed to answer the installer's prompts (pip install pexpect)" >&2; exit 2; }
  command -v flock > /dev/null || { echo "flock (util-linux) is needed: one test at a time builds into the image store" >&2; exit 2; }
  for need in cawco-2 cawco-3 keys/test-release-private.pem keys/test-release-public.pem; do
    [[ -e "$bins/$need" ]] || { echo "missing $bins/$need: run build-e2e.ts first" >&2; exit 2; }
  done
  free_gb=$(df -BG --output=avail "$out" | tail -n 1 | tr -dc 0-9)
  (( free_gb >= 25 )) || { echo "only ${free_gb}G is free where $out is; the test needs 25G (each rig's machines are vfs copies of the image; a full disk made podman fail with 'database or disk is full' in an earlier run)" >&2; exit 2; }
  # The machine stays awake while the tests run (lib/hold-awake.sh): a job of no one's, so no wait here meets it.
  source "$here/../lib/hold-awake.sh"
  hold_awake "$$" "The end-to-end tests into $out" &
  disown
  STARTED=$SECONDS
  mkdir -p "$out/tmp" "$out/shared" "$out/feeds" "$out/rigs" "$out/logs" "$out/images"
  orchestrator_done() {
    # It waits for every rig's cleanup to end: a second stop does not cut it short.
    trap '' INT TERM
    trap - EXIT
    # Every rig still running ends, and cleans up its own containers and storage on the way out (rig_done).
    local pids
    pids=$(jobs -rp)
    [[ -z $pids ]] || { kill $pids 2> /dev/null; wait 2> /dev/null; }
    rm -f "$bins/keys/test-release-private.pem" "$TMPDIR"
  }
  trap orchestrator_done EXIT
  trap 'trap "" INT TERM; exit 130' INT
  trap 'trap "" INT TERM; exit 143' TERM
  step() {
    local what=$1 log=$2 t0=$SECONDS
    shift 2
    if ! "$@" > "$log" 2>&1; then
      echo "setup failed at: $what after $((SECONDS - t0))s (log: $log)" >&2
      tail -n 20 "$log" >&2
      exit 3
    fi
    echo "setup: $what ($((SECONDS - t0))s)"
  }

  # ---------------------------------------------------------------- the images, from the test cache's store
  # Each built there once per recipe (test_images), and read by every rig as its additional image store.
  write_images

  # ---------------------------------------------------------------- what every rig reads: fixtures and feeds
  key="$bins/keys/test-release-private.pem"
  schema=$(bun -e "console.log(JSON.parse(await Bun.file('$(realpath "$here/../..")/packages/hub/drizzle/meta/_journal.json').text()).entries.length)")
  fixture() { bun "$here/e2e-fixture.ts" "$@"; }
  # Each feed is published once here, and a rig takes it by hard links (use_feed): no rig tars or signs a build.
  feed() { local name=$1; shift; fixture release "$out/feeds/$name" "$@"; }
  feeds() {
    local pids=() rc=0 pid
    feed base ok stable "$BASE" 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 20 "$schema" & pids+=($!)
    feed next ok stable "$NEXT" 3333333333333333333333333333333333333333 "$bins/cawco-3" "$key" 30 "$schema" & pids+=($!)
    feed broken ok stable 0.0.1-test.10 1010101010101010101010101010101010101010 "$out/shared/broken-cawco" "$key" 31 "$schema" & pids+=($!)
    feed migrating ok stable 0.0.1-test.8 8888888888888888888888888888888888888888 "$out/shared/migrating-cawco" "$key" 32 "$((schema + 1))" & pids+=($!)
    feed reshaped ok stable 0.0.1-test.9 9999999999999999999999999999999999999999 "$out/shared/reshaping-cawco" "$key" 33 "$schema" & pids+=($!)
    feed filling ok stable 0.0.1-test.11 1111111111111111111111111111111111111111 "$out/shared/filling-cawco" "$key" 34 "$schema" & pids+=($!)
    feed roomless ok stable 0.0.1-test.12 1212121212121212121212121212121212121212 "$out/shared/broken-cawco" "$key" 35 "$schema" & pids+=($!)
    for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
    return $rc
  }
  fixtures() {
    fixture installer "$bins/keys/test-release-public.pem" "$out/shared/installer.sh" &&
      fixture broken-binary "$out/shared/broken-cawco" &&
      fixture broken-binary "$out/shared/migrating-cawco" migrates &&
      fixture broken-binary "$out/shared/reshaping-cawco" reshapes &&
      fixture broken-binary "$out/shared/filling-cawco" fills &&
      bun -e "await Bun.write('$out/shared/rule.json', JSON.stringify({name: 'kept-through-rollback', enabled: false, pattern: 'kept', matchKind: 'phrase', caseSensitive: false, wholeWord: false, watch: 'text', reply: 'kept', timing: 'turn', repeat: false, scope: {}}))" &&
      machine_helpers "$out/shared" &&
      write_machine_scripts "$out/shared"
  }
  # The helpers the machines run from /shared (run_script), each bundled into one self-contained file under its own
  # name: /shared holds no repo tree, so a relative import left in a raw source has nothing to resolve to (nightly
  # cca90e213: "Cannot find module '../../packages/core/src/bounded' from '/shared/e2e-during-install.ts'").
  machine_helpers() {
    local dir=$1 helper
    for helper in start-session stop-session during-install db-rows; do
      bun build "$here/e2e-$helper.ts" --target=bun --outfile "$dir/e2e-$helper.ts" || return 1
    done
  }
  echo "preparing (images and fixtures at once)"
  test_images "$out/images" host machine > "$out/images/tags" 2> "$out/logs/images.log" &
  images=$!
  step "write the fixtures" "$out/logs/fixtures.log" fixtures
  step "publish every feed the rigs take" "$out/logs/feeds.log" feeds
  wait "$images" || { echo "setup failed at: the images (log: $out/logs/images.log)" >&2; tail -n 20 "$out/logs/images.log" >&2; exit 3; }
  HOST_IMAGE=$(sed -n 's/^host=//p' "$out/images/tags")
  MACHINE_IMAGE=$(sed -n 's/^machine=//p' "$out/images/tags")
  echo "setup: images and fixtures ($((SECONDS - STARTED))s): $HOST_IMAGE, $MACHINE_IMAGE"

  # ---------------------------------------------------------------- the rigs, at once
  export out bins here self schema HOST_IMAGE MACHINE_IMAGE
  cap=${TEST_RIGS:-${#SELECTED_RIGS[@]}}
  # The machines the host user's inotify instances leave room for (see INOTIFY_PER_MACHINE): its limit, less what its
  # own processes hold now and the reserve. Too little for one rig of two machines, and nothing would run: said, with
  # the limit to raise.
  inotify_max=$(cat /proc/sys/fs/inotify/max_user_instances)
  inotify_held=$(find /proc/[0-9]*/fd -lname 'anon_inode:inotify' 2> /dev/null | wc -l)
  room=$(( (inotify_max - inotify_held - INOTIFY_RESERVE) / INOTIFY_PER_MACHINE ))
  (( room >= 2 )) || { echo "the host user holds $inotify_held of its $inotify_max inotify instances (fs.inotify.max_user_instances), room for $room machine(s) at $INOTIFY_PER_MACHINE each beside a reserve of $INOTIFY_RESERVE; a rig needs up to 2: raise it (sudo sysctl -w fs.inotify.max_user_instances=8192)" >&2; exit 2; }
  echo "setup: the host user holds $inotify_held of its $inotify_max inotify instances: rigs run while their machines fit in $room ($INOTIFY_PER_MACHINE each), at most $cap at once"
  declare -A RIG_INDEX=() LIVE=() STATUS=()
  index=0
  for rig in "${RIGS[@]}"; do RIG_INDEX[$rig]=$index; index=$((index + 1)); done
  live=0
  # One rig ended: its machines' room is free again, and its exit status is kept.
  reap() {
    local ended rc=0
    wait -n -p ended || rc=$?
    [[ -n ${ended:-} ]] || return 0
    STATUS[$ended]=$rc
    live=$((live - LIVE[$ended]))
    unset "LIVE[$ended]"
  }
  RIGS_STARTED=$SECONDS
  for rig in "${SELECTED_RIGS[@]}"; do
    while (( ${#LIVE[@]} >= cap || live + RIG_MACHINES[$rig] > room )); do reap; done
    mkdir -p "$out/rigs/$rig"
    RIG=$rig RIG_NUMBER=${RIG_INDEX[$rig]} bash "$self" "$out" "$bins" > "$out/rigs/$rig/rig.out" 2>&1 &
    LIVE[$!]=${RIG_MACHINES[$rig]}
    live=$((live + RIG_MACHINES[$rig]))
    echo "rig $rig: started at $((SECONDS - RIGS_STARTED))s, $live of $room machines running"
  done
  while (( ${#LIVE[@]} > 0 )); do reap; done
  status=0
  for rc in "${STATUS[@]}"; do (( rc == 0 )) || status=1; done
  # Every rig's checks, in the rig's order: its verdict lines, and for a check its rig never reached, why.
  for rig in "${SELECTED_RIGS[@]}"; do
    dir="$out/rigs/$rig"
    echo "rig $rig: $(cat "$dir/seconds" 2> /dev/null || echo '?')s ($(cat "$dir/setup-seconds" 2> /dev/null || echo '?')s of setup)"
    while IFS= read -r name; do
      line=$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' "$dir/verdicts.tsv" 2> /dev/null)
      if [[ -n $line ]]; then
        echo "  $name: $line"
      elif [[ -s "$dir/setup-failed" ]]; then
        echo "  $name: NOT RUN (the rig's setup failed at: $(cat "$dir/setup-failed"))"
        status=1
      else
        echo "  $name: NOT RUN (the rig ended first; see $dir/rig.out)"
        status=1
      fi
    done < <(rig_checks "$rig")
  done
  echo "total: $((SECONDS - STARTED))s (setup $((RIGS_STARTED - STARTED))s, rigs $((SECONDS - RIGS_STARTED))s)"
  echo "Evidence: $out"
  exit $status
}

# Machine scripts every rig reads from /shared, written once by the orchestrator.
write_machine_scripts() {
  local dir=$1
# Signs a machine in to the CawCo account $1 the way `claude auth login` in that account's dir leaves it: the dir
# ~/.cawco/accounts/$1/claude holding a credential (Linux keeps it in .credentials.json) and the account's
# oauthAccount in the dir's own .claude.json. The token is fake; the installed Claude Code's `auth status` reads the
# dir as signed in without asking anyone, which is all a test machine's sessions (a held `sleep`) need.
cat > "$dir/account-dir.sh" <<'EOF'
set -eu
dir="$HOME/.cawco/accounts/$1/claude"
mkdir -p -m 700 "$dir"
umask 077
printf '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-test-not-a-token","refreshToken":"sk-ant-ort01-test-not-a-token","expiresAt":4102444800000,"scopes":["user:inference","user:profile"],"subscriptionType":"max"}}\n' > "$dir/.credentials.json"
printf '{"oauthAccount":{"accountUuid":"00000000-0000-4000-8000-000000000001","emailAddress":"test@cawco.test","organizationUuid":"00000000-0000-4000-8000-000000000002","organizationName":"CawCo test","organizationRole":"admin"}}\n' > "$dir/.claude.json"
EOF
cat > "$dir/diagnose-machine.sh" <<'EOF'
binary="$HOME/.local/share/cawco/binary"
data="$HOME/.local/share/cawco"
echo "== apply.log (last 60 lines)"
tail -n 60 "$binary/apply.log" 2>&1
cd "$binary" 2> /dev/null || { echo "no $binary"; exit 0; }
for f in installation.json update-state.json trial.json apply.lock; do
  if [ -e "$f" ]; then echo "== $f"; cat "$f"; echo; else echo "== $f: absent"; fi
done
echo "== current -> $(readlink current)"
echo "== keeper -> $(readlink keeper)"
echo "== keeper endpoints (the machine's names the current one)"
ls -la /run/user/1000/cawco 2>&1
echo "== keeper units"
systemctl --user list-unit-files --no-legend 'cawco-sessiond*' 2>&1
systemctl --user list-units --all --no-legend 'cawco-sessiond*' 2>&1
grep -H 'Requires\|After\|Before\|RequiredBy' "$HOME/.config/systemd/user/cawco-agent.service" "$HOME/.config/systemd/user"/cawco-sessiond*.service 2>&1
echo "== versions/"
ls -la versions
for w in "$HOME"/.cawco/workspaces/*/; do
  [ -d "$w" ] || continue
  echo "== workspace $w"
  ls -la "$w" "$w/boundaries" "$w"/boundaries/* 2>&1
  for f in "${w}boundary.json" "${w}boundary-decisions.json" "$w"retiring-*.json; do
    [ -f "$f" ] && { echo "-- $f"; cat "$f"; echo; }
  done
done
for m in "$data"/cawco.db.migrating "$data"/cawco.db.migrated-* "$data"/cawco.db.pre-*; do
  [ -e "$m" ] || continue
  echo "== $m"
  case "$m" in *.migrating) cat "$m"; echo ;; *) ls -la "$m" ;; esac
done
EOF
}
if [[ -n $IMAGE_ONLY ]]; then
  # The images alone, as the orchestrator's setup builds them: the tags on stdout, the build's output on stderr.
  command -v flock > /dev/null || { echo "flock (util-linux) is needed: one test at a time builds into the image store" >&2; exit 2; }
  trap 'rm -f "$TMPDIR"' EXIT
  write_images || exit 1
  if [[ -n $TAGS_ONLY ]]; then
    for name in host machine; do echo "$name=$(test_image_tag "$out/images" "$name")"; done
    exit 0
  fi
  test_images "$out/images" host machine || { echo "the images failed to build" >&2; exit 1; }
  exit 0
fi
if [[ -z ${RIG:-} ]]; then
  orchestrate "$@"
  exit $?
fi

# ================================================================ ONE RIG

rigdir="$out/rigs/$RIG"
mkdir -p "$rigdir/logs" "$rigdir/release"
export rigdir RIG_MACHINE_COUNT=${RIG_MACHINES[$RIG]}
RIG_STARTED=$SECONDS
# This rig's own podman instance, reading images from the test cache's store.
P=$(podman_instance "$RIG-$$" "$rigdir/storage" "$TEST_STORE")
export P
export prefix="cawco-proof-$RIG-$$"
export net="$prefix-net" hubc="$prefix-hub" joinerc="$prefix-joiner" releasec="$prefix-release"
# The hub's data dir on every machine, and its database there.
export DATA=/home/cawco/.local/share/cawco DB=/home/cawco/.local/share/cawco/cawco.db
subnet="10.231.$((10 + RIG_NUMBER))"
export release_ip=$subnet.2 hub_ip=$subnet.3 joiner_ip=$subnet.4
export feed="http://$release_ip:8000/ok"
export key="$bins/keys/test-release-private.pem"

RIG_STATUS=0
# The rig's way out, on every exit and on a stop (its orchestrator's, the release's group signal): its running check
# ended (its timeout ends the check's shell, whose on_exit steps run, within --kill-after), its containers removed and
# its network with them (the last container gone, podman tears its rootless netns down), through its own instance;
# then the instance gone whole, which ends whatever still names its run dir or storage (pasta, aardvark-dns, a conmon
# whose removal failed), unmounts and removes them (podman_instance_gone). A second stop does not cut it short.
rig_done() {
  local rc=$? pids
  trap '' INT TERM
  trap - EXIT
  echo $((SECONDS - RIG_STARTED)) > "$rigdir/seconds"
  pids=$(jobs -p)
  [[ -z $pids ]] || { kill $pids 2> /dev/null; wait 2> /dev/null; }
  $P rm -f -t 0 "$hubc" "$joinerc" "$releasec" > /dev/null 2>&1 || true
  $P network rm -f "$net" > /dev/null 2>&1 || true
  podman_instance_gone "$RIG-$$" "$rigdir/storage" || { echo "rig $RIG: its cleanup failed: something it started may still be running"; (( rc != 0 )) || rc=1; }
  exit "$rc"
}
trap rig_done EXIT
trap 'trap "" INT TERM; exit 130' INT
trap 'trap "" INT TERM; exit 143' TERM

# ---------------------------------------------------------------- helpers

# Setup steps stop the rig: a check run against a machine that was never set up shows nothing. The orchestrator
# names the step for every check the rig did not reach.
setup() {
  local what=$1 t0=$SECONDS log
  log="$rigdir/logs/setup-$(echo "$what" | tr -cs 'A-Za-z0-9' '-' | cut -c1-80).log"
  shift
  # Its own shell with -e, as a check has: inside `if`, a function's failing assertions would not stop it.
  if ! PS4='+ [${FUNCNAME[0]:-main}:${LINENO}] ' bash -eEx -c '"$@"' _ "$@" > "$log" 2>&1 < /dev/null; then
    echo "$what (log: $log)" > "$rigdir/setup-failed"
    echo "setup failed at: $what after $((SECONDS - t0))s (log: $log)"
    tail -n 20 "$log"
    timeout --kill-after=10 120 bash -c diagnose >> "$log" 2>&1 < /dev/null || true
    exit 3
  fi
  echo "setup: $what ($((SECONDS - t0))s)"
}
# The rig's setup is done: its seconds kept, and each machine's inotify instances with CawCo running on it said
# (INOTIFY_PER_MACHINE is sized from these and the boot lines').
setup_done() {
  local c
  echo $((SECONDS - RIG_STARTED)) > "$rigdir/setup-seconds"
  for c in "$hubc" "$joinerc"; do
    $P container exists "$c" 2> /dev/null || continue
    echo "inotify ${c##*-}: $(inotify_on "$c") with the rig set up"
  done
}

# One check: runs the function in its own shell (so set -e applies inside it) under a time limit (third argument,
# seconds, default 600), keeps its output in a log, prints one line and writes it to the rig's verdicts. A check
# that depends on another (fourth argument, check names joined by `|`, each an earlier check of this rig) says NOT RUN
# unless every one of them passed.
declare -A VERDICT
check() {
  local name=$1 fn=$2 limit=${3:-600} needs=${4:-} log rc=0 need t0=$SECONDS took verdict
  log="$rigdir/logs/$(echo "$name" | tr -cs 'A-Za-z0-9' '-' | cut -c1-120).log"
  local -a needed=()
  [[ -z $needs ]] || IFS='|' read -r -a needed <<< "$needs"
  for need in "${needed[@]}"; do
    if [[ ${VERDICT[$need]:-} != PASS ]]; then
      verdict="NOT RUN (depends on \"$need\", which did not pass)"
      echo "$name: $verdict"
      printf '%s\t%s\n' "$name" "$verdict" >> "$rigdir/verdicts.tsv"
      VERDICT[$name]=NOTRUN
      RIG_STATUS=1
      return
    fi
  done
  {
    echo "check: $name"
    echo "rig: $RIG"
    echo "function: $fn"
    echo "time limit: ${limit}s"
    echo "started: $(date -u +%FT%TZ)"
    echo "---- trace: every command the check runs is printed after a '+', with its output below it;"
    echo "---- a command that fails prints 'ERR: exit N from: <command>'"
  } > "$log"
  # -x prints each command, the ERR trap prints each failing command's exit status (-E: inside functions too). It runs
  # in the background and is waited for, so a stop reaches this rig's cleanup at once.
  PS4='+ [${FUNCNAME[0]:-main}:${LINENO}] ' timeout --kill-after=10 "$limit" \
    bash -eEx -c "trap 'echo \"ERR: exit \$? from: \$BASH_COMMAND\" >&2' ERR; $fn" >> "$log" 2>&1 < /dev/null &
  wait $! || rc=$?
  took=$((SECONDS - t0))
  echo "---- the check ended with exit status $rc at $(date -u +%FT%TZ), after ${took}s" >> "$log"
  if [[ $rc == 0 ]]; then
    verdict="PASS (${took}s)"
    VERDICT[$name]=PASS
  else
    VERDICT[$name]=FAIL
    RIG_STATUS=1
    # The check's own words on why, in the verdict itself: its first failed assertion or wait and the lines it printed
    # after it, without the trace. A host check's output folder is gone once the check ends, and with it the log the
    # verdict names (the run of e6d8fb5b6 said only "FAIL after 1s (see …)").
    local why
    why=$(grep -vE '^(\++ |ERR: exit )' "$log" \
      | awk '/^(ASSERTION FAILED|timed out after)/ { on = 1 } on && /^---- / { exit } on { print; if (++n == 9) exit }' \
      | tr '\t\n' '  ' | cut -c1-800)
    if [[ $rc == 124 || $rc == 137 ]]; then
      verdict="FAIL (timed out after ${limit}s${why:+: $why}, see $log)"
    else
      verdict="FAIL after ${took}s${why:+: $why} (see $log)"
    fi
    timeout --kill-after=10 300 bash -c diagnose >> "$log" 2>&1 < /dev/null || true
  fi
  echo "$name: $verdict"
  printf '%s\t%s\n' "$name" "$verdict" >> "$rigdir/verdicts.tsv"
}

# What a failed check or setup appends to its log, for every machine container that exists.
diagnose() {
  local c unit
  asu() { timeout 30 bash -c 'as_user "$@"' _ "$@" 2>&1; }
  echo
  echo "================ diagnostics after the failure ================"
  echo "host disk: $(df -h --output=avail "$out" | tail -n 1 | tr -d ' ') free where $out is"
  for c in "$hubc" "$joinerc"; do
    $P container exists "$c" 2> /dev/null || continue
    echo
    echo "################ $c"
    echo "---- systemctl --user status 'cawco-*' (first 40 lines)"
    asu "$c" systemctl --user --no-pager status 'cawco-*' | head -n 40
    for unit in hub dashboard agent 'sessiond*'; do
      echo "---- journal cawco-$unit.service (last 80)"
      asu "$c" journalctl --user --no-pager -n 80 -u "cawco-$unit.service"
    done
    echo "---- update helper log, installation, trial and migration files"
    asu "$c" sh /shared/diagnose-machine.sh
  done
  if $P container exists "$hubc" 2> /dev/null; then
    echo
    echo "---- the hub's /api/binary-updates/machines"
    asu "$hubc" curl -sS --max-time 10 http://127.0.0.1:3456/api/binary-updates/machines || echo "(the hub did not answer)"
    echo
  fi
}

# Commands as the unprivileged user, inside a machine container's systemd user session, with no standard input: a
# `podman exec -i` reads its stdin as soon as it starts (podman #24370, "As soon as podman exec is launched it spawns
# a goroutine that reads data from stdin"), so any command here took whatever its caller's stdin carried, a pipe or a
# loop's list meant for something else (survived's list, run-4).
as_user() { user_exec "" "$@"; }
# An executable written as the unprivileged user: standard input, to the path $2 on machine $1. The one command handed
# its caller's stdin.
put_executable() { user_exec -i "$1" sh -c 'cat > "$1" && chmod 755 "$1"' sh "$2"; }
user_exec() {
  local stdin=$1 c=$2
  shift 2
  $P exec ${stdin:+"$stdin"} --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="$feed" "$c" "$@"
}
# The test's own scripts (/shared/*.ts) run as Bun on machine $1 through TEST_RUNNER, a hard link to the build the
# machine was installed with, made as it is installed (test_runner). Never through ~/.local/bin/cawco: from there a
# script is a live process of the build `current` names, and the product keeps on disk every build a live process runs
# (core live-processes.ts `versionsInUse`), so a script that ran through an update held the build before. Nightly
# d0ca43009, handover: the sender started on 0.0.1-test.2 kept it after the hub's machine had moved on, and the wait
# for its removal timed out.
TEST_RUNNER=/home/cawco/.cawco-test/run
# Where the binary root is a mount of its own (the migration rig's hub, SMALL_DATA) the link would cross it, so the
# runner is a copy there: it runs from its own path all the same.
test_runner() { as_user "$1" sh -c 'mkdir -p "${1%/*}" && b=$(readlink -f "$HOME/.local/bin/cawco") && { ln -f "$b" "$1" 2> /dev/null || cp -f "$b" "$1"; }' sh "$TEST_RUNNER"; }
run_script() { local c=$1; shift; as_user "$c" env BUN_BE_BUN=1 "$TEST_RUNNER" "$@"; }
need_hub() {
  as_user "$hubc" curl -fsS --max-time 10 http://127.0.0.1:3456/health > /dev/null 2>&1 || { echo "the hub is not answering"; return 1; }
}
hub_api() { as_user "$hubc" curl -fsS "http://127.0.0.1:3456$1" "${@:2}"; }
json() { bun -e "const t = await Bun.stdin.text(); if (!t.trim()) process.exit(0); const d = JSON.parse(t); const v = ($1)(d); console.log(v === undefined ? '' : v)"; }
jsonl() { bun -e "const t = await Bun.stdin.text(); const d = t.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); const v = ($1)(d); console.log(v === undefined ? '' : v)"; }
machine_id() { hub_api /api/agents | json "d => d.find(a => a.hostname === '$1')?.machineId"; }
build_version() { hub_api /api/agents | json "d => d.find(a => a.machineId === '$1')?.build?.version"; }
phase() { hub_api /api/binary-updates/machines | json "d => d.machines['$1']?.phase"; }
field() { hub_api /api/binary-updates/machines | json "d => d.machines['$1']?.$2"; }
# The keepers of earlier builds still holding something on a machine, as its update state says: `<build>:<held> ...`.
retiring() { hub_api /api/binary-updates/machines | json "d => (d.machines['$1']?.retiringKeepers ?? []).map(k => k.version + ':' + k.sessions).join(' ')"; }
# The pids that keep machine $1's retiring keeper of build $2, as its update state says (`retiringKeepers[].kept`).
kept_of() { hub_api /api/binary-updates/machines | json "d => (d.machines['$1']?.retiringKeepers ?? []).find(k => k.version === '$2')?.kept?.map(p => p.pid).join(' ')"; }
# Machine $1's Update cell, in the words the dashboard draws it with (apps/dashboard updates/model.ts `cellFor`).
update_row() {
  hub_api /api/binary-updates/machines | bun -e "const { cellFor } = await import('$here/../../apps/dashboard/src/lib/cawco/updates/model.ts'); const d = JSON.parse(await Bun.stdin.text()); console.log(cellFor({ machineId: '$1', hostname: '$1', status: 'online', binaryUpdate: d.machines['$1'] }, { autoUpdate: true, channel: 'stable' }).text)"
}
# A process CawCo did not start, put into the cgroup of keeper pid $2 on machine $1, as podman left conmon in a keeper's
# unit for a session that carried its INVOCATION_ID: `sleep 86400`, started in a scope of its own and then moved, its
# parent outside every keeper's tree. Prints its pid. systemd-run is told not to expand `$` (systemd-run(1)
# --expand-environment: "Disabling variable expansion is useful if the specified command includes or may include a $
# sign").
plant_in_unit() {
  put_executable "$1" /home/cawco/cawco-plant.sh <<'PLANT'
#!/bin/sh
set -eu
group=$(sed -n 's/^0:://p' "/proc/$1/cgroup")
rm -f /home/cawco/cawco-planted.pid
nohup systemd-run --user --scope --quiet --collect --expand-environment=no --unit="cawco-planted-$1" -- sh -c 'echo $$ > /home/cawco/cawco-planted.pid; exec sleep 86400' > /dev/null 2>&1 < /dev/null &
i=0
until [ -s /home/cawco/cawco-planted.pid ]; do i=$((i + 1)); [ "$i" -lt 100 ] || exit 1; sleep 0.1; done
pid=$(cat /home/cawco/cawco-planted.pid)
echo "$pid" > "/sys/fs/cgroup$group/cgroup.procs"
echo "$pid"
PLANT
  as_user "$1" /home/cawco/cawco-plant.sh "$2"
}
wait_until() {
  local seconds=$1; shift
  local end=$((SECONDS + seconds))
  until eval "$*"; do
    (( SECONDS < end )) || { echo "timed out after ${seconds}s waiting for: $*"; return 1; }
    sleep 0.5
  done
}
# A feed the orchestrator published, put where this rig's release host serves it, by hard links: each channel it
# published in place of what that channel served, every other channel as it was.
use_feed() {
  local name=$1 dir sub channel
  for dir in "$out/feeds/$name"/*/*/; do
    dir=${dir%/}
    channel=$(basename "$dir")
    sub=$(basename "$(dirname "$dir")")
    mkdir -p "$rigdir/release/$sub"
    rm -rf "$rigdir/release/$sub/$channel"
    cp -al "$dir" "$rigdir/release/$sub/$channel"
  done
}
put_policy() { hub_api /api/binary-updates/settings -X PUT -H 'content-type: application/json' -d "{\"channel\":\"$1\",\"autoUpdate\":$2}"; }
# The hub looks at its release host, and every online machine looks at what the hub offers it now.
learn() { hub_api /api/binary-updates/check -X POST; }
install_now_request() { hub_api "/api/agents/$1/update" -X POST -H 'content-type: application/json' -d '{}'; }
# Starts a process the session keeper will hold, as a running session's process would be held.
spawn_child() {
  as_user "$1" sh -c 'printf "%s\n" "{\"type\":\"spawn\",\"commandId\":\"hold-$1\",\"procId\":\"boundary-$1\",\"spec\":{\"command\":\"sleep\",\"args\":[\"3000\"]}}" | socat -t1 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock > /dev/null' sh "$2"
}
# Starts the in-container watcher that fires at the moment a machine's phase becomes installing (see
# e2e-during-install.ts); its output goes to the file, ending with a `done` line.
watch_install() {
  local container=$1 hub=$2 machine=$3 prefix=$4 file=$5
  : > "$file"
  run_script "$container" /shared/e2e-during-install.ts "$hub" "$machine" "$prefix" > "$file" 2>&1 &
}
# The ids the watcher recorded as accepted while the machine was installing, one per line.
watched_ids() { sed -n 's/^accepted //p' "$1"; }
# Asks the hub, from inside its own container, to start a session on a machine, the way the dashboard does.
start_session() { run_script "$hubc" /shared/e2e-start-session.ts http://127.0.0.1:3456 "$1" "$2"; }
# What every keeper holds, current and retiring: one listing per line, each with the endpoint it answered on. The
# machine's endpoint, a symlink, names a keeper listed by its own endpoint.
keeper_lists() {
  as_user "$1" sh -c 'for s in /run/user/1000/cawco/sessiond-*.sock; do
    [ -S "$s" ] || continue
    printf "{\"type\":\"list\"}\n" | socat -t1 - UNIX-CONNECT:"$s" 2> /dev/null | head -n 1 | sed "s|^{|{\"endpoint\":\"$(basename "$s")\",|"
  done'
}
# The pids of the live children held under one id, on any keeper (one number when there is exactly one child, as there must be).
child_pids() { keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive && p.procId === '$2').map(p => p.pid).join(',')"; }
children_with() { keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive && p.procId.startsWith('$2')).length"; }
children_total() { keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive).length"; }
# The endpoint of the keeper holding a live child under the id (sessiond-<build>.sock), empty when none does.
holder_of() { keeper_lists "$1" | jsonl "d => d.find(k => k.procs.some(p => p.alive && p.procId === '$2'))?.endpoint"; }
# The current keeper's own endpoint, as the machine's endpoint names it.
current_endpoint() { as_user "$1" sh -c 'readlink /run/user/1000/cawco/sessiond.sock || true'; }
# A build's keeper's endpoint and unit (keeperService: what a unit name cannot carry becomes _).
endpoint_of() { echo "sessiond-$1.sock"; }
unit_of() { local v=$1; echo "cawco-sessiond-${v//[^A-Za-z0-9._-]/_}.service"; }
# The current keeper's unit: its build's own.
current_unit() {
  local e
  e=$(current_endpoint "$1")
  e=${e#sessiond-}
  unit_of "${e%.sock}"
}
session_running() { [[ "$(hub_api /api/instances | json "d => d.find(r => r.id === '$1')?.status")" == running ]]; }
# Starts sessions through the hub, waits until each runs, and writes down the pid of the process holding it.
start_before() {
  local machine=$1 container=$2 file=$3; shift 3
  : > "$file"
  for id in "$@"; do
    start_session "$machine" "$id" > /dev/null
    wait_until 60 "session_running $id"
    pid=$(child_pids "$container" "$id")
    [[ -n "$pid" && "$pid" != *,* ]]
    echo "$id $pid" >> "$file"
  done
}
# A session that ran before the update: the very same process still holds it, the machine's agent took it over
# again (the hub lists it as running only when the agent reports it), and nothing else holds it.
# Each of these loops reads its list on fd 3, out of reach of what its body runs: a command there that reads stdin
# swallows the rest of the list, so only the first entry is checked (run-4: one of seven accepted starts, when
# as_user's `podman exec -i` did).
survived() {
  local container=$1 file=$2 id pid
  while read -r -u 3 id pid; do
    [[ "$(child_pids "$container" "$id")" == "$pid" ]]
    as_user "$container" kill -0 "$pid"
    wait_until 120 "session_running $id"
  done 3< "$file"
}
# The live children of one kind of start on every keeper, each with the keeper holding it, and the hub's rows of that
# kind with their status: what a count that does not add up is read from.
starts_said() {
  local container=$1 prefix=$2
  echo "children: $(keeper_lists "$container" | jsonl "d => d.flatMap(k => k.procs.filter(p => p.alive && p.procId.startsWith('$prefix-')).map(p => p.procId + '@' + k.endpoint)).sort().join(' ')")"
  echo "rows: $(hub_api /api/instances | json "d => d.filter(r => r.id.startsWith('$prefix-')).map(r => r.id + ':' + r.status).sort().join(' ')")"
}
# Every start accepted during the update runs once: one child under its id, none extra on the machine.
accepted_ran_once() {
  local machine=$1 container=$2 prefix=$3 accepted=$4 id twice
  [[ "$(wc -l < "$accepted")" -ge 1 ]]
  wait_until 180 '[[ "$(phase '"$machine"')" != installing ]]'
  while read -r -u 3 id; do
    wait_until 120 "session_running $id"
    [[ "$(child_pids "$container" "$id")" =~ ^[0-9]+$ ]]
  done 3< "$accepted"
  # No start of this kind ran twice: no id has more than one live child, on any keeper.
  twice=$(keeper_lists "$container" | jsonl "d => { const n = {}; for (const p of d.flatMap(k => k.procs)) { if (p.alive && p.procId.startsWith('$prefix-')) { n[p.procId] = (n[p.procId] ?? 0) + 1; } } return Object.keys(n).filter(id => n[id] > 1).join(' '); }")
  [[ -z $twice ]] || { echo "more than one live child under: $twice"; starts_said "$container" "$prefix"; return 1; }
  # One child per running session of this kind on the hub, once the hub's rows have caught up with the children (the
  # last start the loop sent may still be on its way to running when the loop stops), and no process outside the
  # session holder.
  wait_until 60 '[[ "$(children_with "'"$container"'" "'"$prefix"'-")" == "$(hub_api /api/instances | json "d => d.filter(r => r.id.startsWith(\"'"$prefix"'-\") && r.status === \"running\").length")" ]]' \
    || { starts_said "$container" "$prefix"; return 1; }
  [[ "$(as_user "$container" sh -c 'pgrep -x sleep | wc -l')" == "$(children_total "$container")" ]]
}
# The main process of a keeper's unit (the current keeper's when no unit is named).
keeper_pid() { as_user "$1" systemctl --user show -p MainPID --value "${2:-$(current_unit "$1")}"; }
# Asks the hub, from inside its own container, to stop a session, the way the dashboard does.
stop_session() { run_script "$hubc" /shared/e2e-stop-session.ts http://127.0.0.1:3456 "$1" "$2"; }
# A check ends what it started, on every way out. on_exit adds a step, a command, to what the check runs as it exits,
# passed or failed; the steps run last-added first, and one that fails is passed over, so the next still runs and the
# check's verdict stays its own. ROW_STATUS is the check's exit status there.
on_exit() {
  EXIT_STEPS=("$1" ${EXIT_STEPS[@]+"${EXIT_STEPS[@]}"})
  trap 'ROW_STATUS=$?; for step in "${EXIT_STEPS[@]}"; do eval "$step" || true; done' EXIT
}
# The pids of the live children every keeper on a machine holds under the ids given; an id ending in `-` is a prefix.
pids_under() {
  local container=$1 list
  shift
  list=$(printf '"%s",' "$@")
  keeper_lists "$container" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive && [${list%,}].some(i => i.endsWith('-') ? p.procId.startsWith(i) : p.procId === i)).map(p => p.pid).join(' ')"
}
# Ends what one check started on a machine: every child a keeper holds under the ids given (an id ending in `-` is a
# prefix) is killed, and it waits until none of them is alive.
end_children() {
  local container=$1 pids
  shift
  pids=$(pids_under "$container" "$@")
  [[ -z $pids ]] || as_user "$container" kill $pids || true
  wait_until 60 '[[ -z "$(pids_under "'"$container"'" '"$*"')" ]]'
}
keeper_link() { as_user "$1" readlink /home/cawco/.local/share/cawco/binary/keeper; }
current_link() { as_user "$1" readlink /home/cawco/.local/share/cawco/binary/current; }
has_file() { as_user "$1" test -e "/home/cawco/.local/share/cawco/binary/$2"; }
has_version() { as_user "$1" test -d "/home/cawco/.local/share/cawco/binary/versions/$2"; }
install_order() { as_user "$1" sh -c 'cat /home/cawco/.local/share/cawco/binary/install-order.json 2> /dev/null || true' | json "d => d.join(' ')"; }
custody_of() { hub_api /api/agents | json "d => d.find(a => a.machineId === '$1')?.custody?.state"; }
# What machine $1's update helper did, as it records it beside apply.log (cli apply-record.ts, apply-record.json): each
# start, each build's units written, each keeper handover's units, each swap, with its version. $2 a JS function of the
# list, printed. apply.log says the same for people.
apply_record() { as_user "$1" sh -c 'cat /home/cawco/.local/share/cawco/binary/apply-record.json 2> /dev/null || echo "[]"' | json "$2"; }
# The machine has an IPv6 loopback (`::1` on lo), as the installer judges before it names [::1] in the dashboard socket.
has_ipv6_loopback() { as_user "$1" grep -q '^00000000000000000000000000000001 ' /proc/net/if_inet6; }
export TEST_RUNNER
export -f diagnose as_user put_executable user_exec test_runner run_script need_hub hub_api json jsonl machine_id build_version phase field retiring kept_of update_row plant_in_unit wait_until use_feed put_policy learn install_now_request spawn_child watch_install watched_ids start_session keeper_lists child_pids children_with children_total holder_of current_endpoint endpoint_of unit_of current_unit session_running start_before survived starts_said accepted_ran_once keeper_pid stop_session untouched on_exit pids_under end_children keeper_link current_link has_file has_version install_order custody_of apply_record has_ipv6_loopback

# ---------------------------------------------------------------- a rig's machines

# boot CONTAINER IP HOSTNAME [linger|nolinger] [EXTRA PODMAN RUN OPTION...]
# Each machine holds 65,536 tasks (see the machine image above), and is a real systemd machine, of the machine image
# or the one BOOT_IMAGE names.
boot() {
  local c=$1 ip=$2 name=$3 t0=$SECONDS created up
  shift 3
  $P run -d --name "$c" --hostname "$name" --systemd=always --pids-limit=65536 --network "$net" --ip "$ip" \
    --mount "type=bind,src=$out/shared,dst=/shared,ro" "$@" "$MACHINE_IMAGE" /sbin/init > /dev/null
  created=$((SECONDS - t0))
  wait_until 90 "[[ \$($P exec $c systemctl is-system-running 2>/dev/null) =~ ^(running|degraded)\$ ]]"
  up=$((SECONDS - t0))
  # Each machine's boot in its parts, for the rig's log: the container made and started (its root file system laid
  # down), systemd running in it, and its user's bus; and the inotify instances it holds (INOTIFY_PER_MACHINE).
  $P exec "$c" loginctl enable-linger cawco
  wait_until 60 "$P exec $c test -S /run/user/1000/bus"
  echo "boot $name: container ${created}s, systemd running at ${up}s, user bus at $((SECONDS - t0))s, inotify $(inotify_on "$c"), load $(cut -d' ' -f1-3 /proc/loadavg)"
}
# The inotify instances every process of a machine holds, read as its root, who reads every process's descriptors.
inotify_on() { $P exec "$1" sh -c "find /proc/[0-9]*/fd -lname 'anon_inode:inotify' 2> /dev/null | wc -l"; }
export -f boot inotify_on
# The network, the release host serving this rig's release folder, and the machines it names (hub, joiner), booted at
# once. The joined machine opens a delegate workspace in the sandbox rig, whose srt boundary is a bwrap
# sandbox with its own pid namespace and a fresh /proc. The kernel refuses that /proc mount in a user namespace while
# the /proc it can see has paths masked or bound read-only over it, which podman does by default ("bwrap: Can't mount
# proc on /newroot/proc: Operation not permitted"; github.com/containers/bubblewrap/issues/505: "The fix was to add
# --security-opt unmask=ALL"). Unmasking only stops hiding those /proc and /sys paths: the container is rootless, so
# its root is the host user and reads nothing that user cannot; it gains no capability, and it sits on the internal
# network with no route out.
# SMALL_DATA (a tmpfs size, the migration rig's): the hub's data dir, where its database and the update's copies of it
# lie, is a filesystem of that size, so a check can fill it (no loop device in a rootless container), and the binary
# root inside it a volume of the rig's own storage, which holds the builds.
machines() {
  local role pids=() rc=0 pid hub_opts=()
  [[ -z ${SMALL_DATA:-} ]] || hub_opts=(--tmpfs "$DATA:rw,exec,nosuid,nodev,size=$SMALL_DATA,mode=0700" --mount "type=volume,src=$prefix-binary,dst=$DATA/binary")
  # The orchestrator started this rig for the machines RIG_MACHINES names: what it holds of the inotify room.
  (( $# == RIG_MACHINE_COUNT )) || { echo "rig $RIG boots $# machine(s), and RIG_MACHINES names $RIG_MACHINE_COUNT: correct RIG_MACHINES"; return 1; }
  $P network create --internal --subnet "$subnet.0/24" "$net" > /dev/null || return 1
  $P run -d --name "$releasec" --network "$net" --ip "$release_ip" \
    --mount "type=bind,src=$rigdir/release,dst=/srv/release,ro" "$HOST_IMAGE" \
    python3 -m http.server 8000 --directory /srv/release --bind "$release_ip" > /dev/null || return 1
  for role in "$@"; do
    case $role in
      hub) boot "$hubc" "$hub_ip" hub "${hub_opts[@]}" & ;;
      joiner) boot "$joinerc" "$joiner_ip" joiner --security-opt unmask=ALL & ;;
    esac
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  # Both mounts are root's as podman makes them; the user CawCo runs as owns them, as it owns the dirs they stand for.
  [[ -z ${SMALL_DATA:-} ]] || $P exec "$hubc" chown cawco:cawco "$DATA" "$DATA/binary" || rc=1
  return $rc
}
export subnet
export -f machines

# ---------------------------------------------------------------- installing and joining, a check or a rig's setup

# The hub's machine serves its dashboard on 3455 alone: 127.0.0.1, its own address and [::1] where it has one are the
# dashboard, and nothing on the machine listens on 3000.
check_hub_dashboard_3455() {
  local at
  for at in 127.0.0.1 "$hub_ip"; do
    as_user "$hubc" curl -fsS --max-time 5 "http://$at:3455/session" | grep -q _app/immutable \
      || { echo "ASSERTION FAILED: $at:3455 is not the dashboard"; return 1; }
  done
  if has_ipv6_loopback "$hubc"; then
    as_user "$hubc" curl -fsS --max-time 5 -g 'http://[::1]:3455/session' | grep -q _app/immutable \
      || { echo "ASSERTION FAILED: [::1]:3455 is not the dashboard"; return 1; }
  fi
  local on3000
  on3000=$(as_user "$hubc" ss -Hltnp 'sport = :3000')
  [[ -z "$on3000" ]] || { echo "ASSERTION FAILED: something on the hub's machine listens on 3000: $on3000"; return 1; }
}
# The hub installs from the rig's feed (build $1, from channel $2 when one is named, the installer's own otherwise):
# pristine first (no git, Bun, Node or openssl), and the installer places none of git, Bun or Node.
install_hub() {
  local version=$1 channel=${2:-}
  as_user "$hubc" sh -c 'for tool in git bun node openssl; do if command -v $tool > /dev/null; then echo "$tool is already there"; exit 1; fi; done; echo pristine'
  as_user "$hubc" env ${channel:+CAWCO_CHANNEL=$channel} sh /shared/installer.sh
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  # On the hub's machine 3455 is the dashboard on every address its sockets name: the network's (0.0.0.0, so the
  # machine's own address and 127.0.0.1) and [::1] where the machine has it (the loopback socket names it there
  # alone). `/` answers 307 to /session, the page with the app's markup. Nothing listens on 3000.
  check_hub_dashboard_3455
  [[ "$(as_user "$hubc" grep -o '"dashboardUrl":"[^"]*"' /home/cawco/.local/share/cawco/binary/installation.json)" == '"dashboardUrl":"http://localhost:3455"' ]] \
    || { echo "ASSERTION FAILED: the install's record names another dashboard address than http://localhost:3455"; return 1; }
  [[ "$(hub_api /health | json 'd => d.build?.version')" == "$version" ]]
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == "versions/$version" ]]
  as_user "$hubc" sh -c 'for tool in git bun node; do if command -v $tool > /dev/null; then echo "$tool appeared"; exit 1; fi; done; echo still-none'
  test_runner "$hubc"
}
join_machine() {
  need_hub
  # The hub's own install.sh, the way the app's Connect a machine hands it out; pexpect types an "n" after each prompt appears.
  as_user "$joinerc" curl -fsS "http://$hub_ip:3456/install.sh" -o /tmp/join.sh
  local rc=0
  python3 "$here/e2e-answer-prompts.py" $P exec -it --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="$feed" "$joinerc" sh /tmp/join.sh > "$rigdir/join.out" || rc=$?
  cat "$rigdir/join.out"
  [[ $rc == 0 ]]
  grep -qE 'prompts answered: [1-9]' "$rigdir/join.out"
  [[ "$(hub_api /api/agents | json 'd => d.filter(a => a.status === "online").length')" == 2 ]]
  test_runner "$joinerc"
}
# The machines given (hub, joiner) are signed in to one CawCo account, made through the hub's API, each in its own
# dir; the hub records each sign-in before the first session starts. A Claude session runs only on such a machine.
signed_in_on() { hub_api /api/accounts | json "d => d.signins.filter(s => s.accountId === '$1' && s.state === 'signed-in').map(s => s.machineId).sort().join(' ')"; }
# A CawCo account made through the hub's API; its id is kept in $rigdir/account-id.
new_account() {
  local aid
  aid=$(hub_api /api/accounts -X POST -H 'content-type: application/json' -d '{"provider":"anthropic","kind":"subscription"}' | json 'd => d.id')
  [[ -n $aid ]]
  echo "$aid" > "$rigdir/account-id"
}
sign_in() {
  need_hub
  local aid role c ids=()
  new_account
  aid=$(cat "$rigdir/account-id")
  for role in "$@"; do
    c=${role}c
    c=${!c}
    as_user "$c" sh /shared/account-dir.sh "$aid"
    # The agent reads its account dirs as it registers.
    as_user "$c" systemctl --user restart cawco-agent.service
    ids+=("$(machine_id "$role")")
  done
  wait_until 120 '[[ "$(signed_in_on '"$aid"')" == "'"$(printf '%s\n' "${ids[@]}" | sort | paste -sd ' ')"'" ]]'
  wait_until 60 '[[ "$(hub_api /api/agents | json "d => d.filter(a => a.status === \"online\").length")" == '"$#"' ]]'
}
# A rig's fleet: its machines booted, the hub installed from the feed named (and the joined machine joined, when the
# rig has one), and the machines given signed in. Every rig installs this tree's build, BASE.
fleet() {
  local feed_name=$1 version=$2 roles=$3 signed=${4:-}
  use_feed "$feed_name"
  setup "boot the machines: $roles" machines $roles
  setup "install the hub from $version" install_hub "$version"
  export hid
  hid=$(machine_id hub)
  if [[ " $roles " == *" joiner "* ]]; then
    setup "join the second machine to the hub" join_machine
    export jid
    jid=$(machine_id joiner)
  fi
  [[ -z $signed ]] || setup "sign in $signed to a CawCo account" sign_in $signed
}
export -f check_hub_dashboard_3455 install_hub join_machine signed_in_on new_account sign_in

# ================================================================ THE RIGS
# A pristine machine installing the hub, and another joining it, is every rig's setup (`fleet`: install_hub,
# join_machine, with their assertions): a build whose installer cannot bring up a hub (user units, linger, sudo openssl)
# or whose Connect a machine is broken fails every rig at that step, by name.
# ---------------------------------------------------------------- hubself: the hub's own machine updates (the hub
# restarts itself) with a child held on its keeper and sessions asked for while it installs.
# Before it, the machine's units are put back to what builds before the dashboard moved to 3455 wrote: the dashboard's
# socket on 0.0.0.0:3000, its loopback socket on 127.0.0.1:3455 (and [::1]:3455 where the machine has ::1) named in the
# dashboard's `Sockets=`, the dashboard's port in the hub's unit as `CAWCO_DASHBOARD_PORT=3000`, and the install's
# record naming http://localhost:3000, the address the update's verification probes. So the update to NEXT carries units
# NEXT writes otherwise, and no `cawco service install` runs after it. The agent's and the hub's units are kept to
# compare after.
units_before_3455() {
  local v6=0
  has_ipv6_loopback "$hubc" && v6=1
  as_user "$hubc" sh -c '
    set -e
    u=/home/cawco/.config/systemd/user
    record=/home/cawco/.local/share/cawco/binary/installation.json
    systemctl --user stop cawco-dashboard.service
    systemctl --user disable --now cawco-dashboard-local.socket 2> /dev/null || true
    sed -i "s/^ListenStream=0\.0\.0\.0:3455\$/ListenStream=0.0.0.0:3000/" $u/cawco-dashboard.socket
    {
      printf "[Unit]\nDescription=CawCo dashboard dashboard-local socket\n\n[Socket]\nListenStream=127.0.0.1:3455\n"
      [ "$1" = 1 ] && printf "ListenStream=[::1]:3455\n"
      printf "FileDescriptorName=dashboard-local\nService=cawco-dashboard.service\nNoDelay=true\nFreeBind=true\nReusePort=true\n\n[Install]\nWantedBy=sockets.target\n"
    } > $u/cawco-dashboard-local.socket
    sed -i "/^Sockets=/d" $u/cawco-dashboard.service
    sed -i "/^WorkingDirectory=/a Sockets=cawco-dashboard.socket cawco-dashboard-local.socket" $u/cawco-dashboard.service
    sed -i "/^Environment=CAWCO_LOCAL_DASHBOARD_PORT=/i Environment=CAWCO_DASHBOARD_PORT=3000" $u/cawco-hub.service
    sed -i "s#\"dashboardUrl\":\"http://localhost:3455\"#\"dashboardUrl\":\"http://localhost:3000\"#" $record
    cp $u/cawco-agent.service /tmp/agent-before.service
    cp $u/cawco-hub.service /tmp/hub-before.service
    systemctl --user daemon-reload
    systemctl --user restart cawco-dashboard.socket
    systemctl --user enable --now cawco-dashboard-local.socket
    systemctl --user start cawco-dashboard.service' sh "$v6"
  as_user "$hubc" grep -qx 'ListenStream=0\.0\.0\.0:3000' /home/cawco/.config/systemd/user/cawco-dashboard.socket \
    || { echo "ASSERTION FAILED: the dashboard's socket was not put back on 0.0.0.0:3000"; return 1; }
  as_user "$hubc" grep -q '"dashboardUrl":"http://localhost:3000"' /home/cawco/.local/share/cawco/binary/installation.json \
    || { echo "ASSERTION FAILED: the install's record was not put back on http://localhost:3000"; return 1; }
  wait_until 30 'as_user "$hubc" curl -fsS --max-time 5 http://127.0.0.1:3000/session | grep -q _app/immutable'
  if as_user "$hubc" curl -fsS --max-time 5 -o /dev/null "http://$hub_ip:3455/"; then
    echo "ASSERTION FAILED: the hub's address answers on 3455 before the update, so the update shows nothing"
    return 1
  fi
}
hub_self_update() {
  need_hub
  units_before_3455
  spawn_child "$hubc" held
  child=$(child_pids "$hubc" boundary-held)
  keeper=$(keeper_pid "$hubc")
  [[ -n "$child" && -n "$keeper" ]]
  echo "$child $keeper $(current_unit "$hubc") $(current_endpoint "$hubc")" > "$rigdir/held.txt"
  # A watcher, started before the update is asked for, asks the hub to start sessions on its own machine the moment
  # that machine says installing.
  watch_install "$hubc" http://127.0.0.1:3456 "$hid" hubstart "$rigdir/watch-hub.txt"
  use_feed next
  learn
  install_now_request "$hid"
  wait_until 300 '[[ "$(build_version $hid)" == $NEXT ]]'
  wait_until 120 'grep -q "^done " "$rigdir/watch-hub.txt"'
  echo "== what the hub-machine watcher sent and what came back"
  cat "$rigdir/watch-hub.txt"
  watched_ids "$rigdir/watch-hub.txt" > "$rigdir/accepted-hub.txt"
}
hub_starts_held() {
  need_hub
  on_exit 'end_children "$hubc" hubstart-'
  accepted_ran_once "$hid" "$hubc" hubstart "$rigdir/accepted-hub.txt"
}
held_survives() {
  need_hub
  local child keeper unit endpoint
  read -r child keeper unit endpoint < "$rigdir/held.txt"
  # The child runs on, held by the very keeper process it started under, which the update did not touch.
  as_user "$hubc" kill -0 "$child"
  [[ "$(keeper_pid "$hubc" "$unit")" == "$keeper" ]]
  [[ "$(holder_of "$hubc" boundary-held)" == "$endpoint" ]]
  # The new build's keeper is the machine's: the keeper link and the machine's endpoint name it. Nothing waits: the
  # update is installed, and the state says the keeper before still holds what it holds.
  wait_until 120 '[[ "$(phase $hid)" == installed && "$(field $hid sessiondVersion)" == $NEXT ]]'
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/keeper)" == "versions/$NEXT" ]]
  [[ "$(current_endpoint "$hubc")" == "$(endpoint_of $NEXT)" ]]
  wait_until 60 '[[ "$(retiring $hid)" == *"$BASE:"* ]]'
  echo "retiring keepers: $(retiring $hid)"
}
# After the update, with no `cawco service install`: NEXT moved the dashboard to 3455. Its socket is 0.0.0.0:3455 alone;
# its loopback socket is [::1]:3455 alone where the machine has ::1 and gone where it has not (0.0.0.0 answers
# 127.0.0.1); 127.0.0.1, the hub's address and [::1] answer the dashboard on 3455 and nothing listens on 3000; the hub's
# unit lost `CAWCO_DASHBOARD_PORT=3000` and nothing else; the agent's unit is as it was; the install's record names
# http://localhost:3455, which the update's verification probed to install NEXT; and the update's record says NEXT wrote them.
units_carried() {
  need_hub
  local u=/home/cawco/.config/systemd/user
  local loopback="$u/cawco-dashboard-local.socket"
  echo "== the dashboard's sockets after the update"
  as_user "$hubc" sh -c "cat $u/cawco-dashboard.socket; cat $loopback 2> /dev/null || echo 'no $loopback'"
  [[ "$(as_user "$hubc" grep '^ListenStream=' "$u/cawco-dashboard.socket")" == 'ListenStream=0.0.0.0:3455' ]] \
    || { echo "ASSERTION FAILED: the dashboard's socket does not listen on 0.0.0.0:3455 alone"; return 1; }
  if has_ipv6_loopback "$hubc"; then
    [[ "$(as_user "$hubc" grep '^ListenStream=' "$loopback")" == 'ListenStream=[::1]:3455' ]] \
      || { echo "ASSERTION FAILED: the machine has ::1, and the loopback socket does not name [::1]:3455 alone"; return 1; }
    as_user "$hubc" grep -qx 'Sockets=cawco-dashboard.socket cawco-dashboard-local.socket' "$u/cawco-dashboard.service" \
      || { echo "ASSERTION FAILED: the dashboard's unit names no loopback socket"; return 1; }
  elif as_user "$hubc" test -e "$loopback"; then
    echo "ASSERTION FAILED: the machine has no ::1, and a loopback socket unit is still there"
    return 1
  fi
  wait_until 60 'as_user "$hubc" curl -fsS --max-time 5 http://127.0.0.1:3455/session | grep -q _app/immutable'
  check_hub_dashboard_3455
  local hub_diff
  hub_diff=$(as_user "$hubc" sh -c "diff /tmp/hub-before.service $u/cawco-hub.service || true")
  echo "== the hub's unit, before and after"
  echo "$hub_diff"
  [[ "$(grep -c '^[<>]' <<< "$hub_diff")" == 1 && "$hub_diff" == *"< Environment=CAWCO_DASHBOARD_PORT=3000"* ]] \
    || { echo "ASSERTION FAILED: the hub's unit changed by more than losing its 3000"; return 1; }
  as_user "$hubc" cmp /tmp/agent-before.service "$u/cawco-agent.service" \
    || { echo "ASSERTION FAILED: the agent's unit changed though nothing in it did"; return 1; }
  as_user "$hubc" grep -q '"dashboardUrl":"http://localhost:3455"' /home/cawco/.local/share/cawco/binary/installation.json \
    || { echo "ASSERTION FAILED: the install's record does not name http://localhost:3455"; return 1; }
  [[ "$(apply_record "$hubc" "d => d.some(e => e.kind === 'units' && e.version === '$NEXT' && e.services && e.rewrote.length > 0)")" == true ]] \
    || { echo "ASSERTION FAILED: the update's record has $NEXT rewriting no units: $(apply_record "$hubc" 'd => JSON.stringify(d.filter(e => e.kind === "units"))')"; return 1; }
  [[ "$(apply_record "$hubc" "d => d.some(e => e.kind === 'units' && e.version === '$NEXT' && e.dashboard?.now === 'http://localhost:3455')")" == true ]] \
    || { echo "ASSERTION FAILED: the update's record has $NEXT recording no dashboard at http://localhost:3455: $(apply_record "$hubc" 'd => JSON.stringify(d.filter(e => e.kind === "units"))')"; return 1; }
  echo "the update's record of $NEXT's units: $(apply_record "$hubc" "d => JSON.stringify(d.filter(e => e.kind === 'units' && e.version === '$NEXT'))")"
}
export -f units_before_3455 hub_self_update hub_starts_held held_survives units_carried
rig_hubself() {
  fleet base "$BASE" hub hub
  setup "the hub's own machine updates, with a child held and sessions asked for while it installs" hub_self_update
  setup_done
  check "a session start requested while the hub's own machine installs runs once afterwards, one child, none lost" hub_starts_held 900
  check "a child held by the session keeper survives the update on that keeper, untouched, while the new build's keeper becomes the machine's" held_survives
  check "the update copied the hub's database before it swapped" 'copy_made "$BASE"'
  check "the update moves the hub's machine from 3000 to 3455 from the build it installs, no service install run: the dashboard's socket on 0.0.0.0:3455, its loopback socket on [::1]:3455 alone (none without ::1), 3455 the dashboard and nothing on 3000, the hub's unit loses its 3000 alone, the agent's unit untouched, the install's record names localhost:3455" units_carried
}

# ---------------------------------------------------------------- rollbacks, each on a hub of its own
# Rows of a database on the hub's machine (e2e-db-rows.ts), read or written through the test's runner.
db_rows() { run_script "$hubc" /shared/e2e-db-rows.ts "$@"; }
# The files in the hub's data dir whose names match the extended regex $1, one a line.
data_files() { as_user "$hubc" ls -1 "$DATA" | grep -E "$1" || true; }
# The update's copy of the hub's database was made: its file is there, and apply.log says it made it.
copy_made() {
  as_user "$hubc" test -s "$DB.pre-$1.bak" || { echo "ASSERTION FAILED: no $DB.pre-$1.bak: $(data_files '^cawco\.db\.' | paste -sd ' ')"; return 1; }
  as_user "$hubc" grep -qF "database copy $DB.pre-$1.bak" "$DATA/binary/apply.log" \
    || { echo "ASSERTION FAILED: apply.log says no copy $DB.pre-$1.bak"; return 1; }
}
# Exactly one copy taken before an update is in the hub's data dir, $1's.
one_copy() {
  local copies
  copies=$(data_files '^cawco\.db\.pre-.*\.bak$' | grep -vx 'cawco.db.pre-handmade.bak' | paste -sd ' ')
  [[ $copies == "cawco.db.pre-$1.bak" ]] || { echo "ASSERTION FAILED: the copies before an update are \"$copies\", not cawco.db.pre-$1.bak alone"; return 1; }
}
# The files the update helper never wrote (planted by the migration rig's setup) are where they were.
others_kept() {
  local name
  for name in cawco.db.bak-mine cawco.db.pre-handmade.bak; do
    [[ "$(as_user "$hubc" cat "$DATA/$name")" == "$name" ]] || { echo "ASSERTION FAILED: $DATA/$name, which no update wrote, is gone or changed"; return 1; }
  done
}
rolled_back() {
  need_hub
  use_feed broken
  learn
  put_policy stable true
  wait_until 300 '[[ "$(field $hid failedVersion)" == 0.0.1-test.10 && "$(phase $hid)" == failed-rolled-back ]]'
  [[ "$(build_version $hid)" == $BASE ]]
  [[ -n "$(field $hid error)" ]]
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  # Every update of the hub copies its database, and every rollback puts it back: the database the trial left is
  # moved aside, and the rollback's words name it.
  copy_made "$BASE"
  as_user "$hubc" test -e "$DB.migrated-0.0.1-test.10" || { echo "ASSERTION FAILED: the rollback moved no database aside"; return 1; }
  [[ "$(field $hid error)" == *"what it stored during the trial is in $DB.migrated-0.0.1-test.10"* ]] \
    || { echo "ASSERTION FAILED: the rollback's words do not name $DB.migrated-0.0.1-test.10: $(field $hid error)"; return 1; }
}
# The hub of the build installed, on its own: starts with $1 as its database, on a port no unit uses. Prints what it
# said; its exit status is the hub's.
hub_on() { as_user "$hubc" env CAWCO_DB_PATH="$1" CAWCO_HUB_PORT=43999 CAWCO_NO_MDNS=1 timeout 60 "$DATA/binary/versions/$NEXT/cawco" hub 2>&1; }
# The migration rig's setup: files in the hub's data dir that no update writes (one named like the update's copies
# but for a version no build has), which every check after keeps.
plant_others() {
  as_user "$hubc" sh -c 'for name in cawco.db.bak-mine cawco.db.pre-handmade.bak; do printf %s "$name" > "$1/$name"; done' sh "$DATA"
}
# The hub's own machine updates to NEXT, which confirms: the database was copied first.
confirmed_update_copies() {
  need_hub
  use_feed next
  learn
  install_now_request "$hid"
  wait_until 300 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]] && ! has_file "$hubc" trial.json'
  copy_made "$BASE"
  others_kept
  # Every later check's build is taken up by auto-update.
  put_policy stable true
}
migration_rolled_back() {
  need_hub
  # Data the hub holds before the update: a rule through its API (without -f, so a refusal shows the hub's own words
  # instead of a bare 400), and a row written to its database.
  saved=$(as_user "$hubc" curl -sS -w '\nHTTP %{http_code}' http://127.0.0.1:3456/api/rules -X POST -H 'content-type: application/json' -d @/shared/rule.json)
  echo "saving the rule: $saved"
  [[ "$saved" == *"HTTP 200" ]]
  hub_api /api/rules | grep -q kept-through-rollback
  db_rows write "$DB" e2e-before-row
  # The migrating build adds an applied migration and writes e2e-trial-row as its hub, then fails.
  use_feed migrating
  learn
  wait_until 360 '[[ "$(field $hid failedVersion)" == 0.0.1-test.8 && "$(phase $hid)" == failed-rolled-back ]]'
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  [[ "$(build_version $hid)" == $NEXT ]]
  # The restore, by content: the row from before is in the live database and the trial's is not.
  hub_api /api/rules | grep -q kept-through-rollback
  [[ "$(db_rows has "$DB" e2e-before-row)" == yes ]] || { echo "ASSERTION FAILED: the row written before the update is not in the live database"; return 1; }
  [[ "$(db_rows has "$DB" e2e-trial-row)" == no ]] || { echo "ASSERTION FAILED: the trial's row is in the live database: it was not put back"; return 1; }
  # The trial's row is in the file the rollback's words name.
  local said aside
  said=$(field $hid error)
  echo "the rollback said: $said"
  aside=$(grep -oE "/home/cawco/[^ ;]*\.migrated-0\.0\.1-test\.8" <<< "$said" | head -n 1)
  [[ $aside == "$DB.migrated-0.0.1-test.8" ]] || { echo "ASSERTION FAILED: the rollback's words name no moved-aside database: $said"; return 1; }
  [[ "$(db_rows has "$aside" e2e-trial-row)" == yes ]] || { echo "ASSERTION FAILED: the trial's row is not in $aside"; return 1; }
  # A hub started in the rollback's window, before the copy was back, stopped on the migrated file and wrote why;
  # the start on the copy removed that.
  echo "starts that stopped on the migrated database: $(as_user "$hubc" journalctl --user --no-pager -u cawco-hub.service | grep -c 'was migrated by a newer build of CawCo' || true)"
  ! as_user "$hubc" test -e "$DB.stopped" || { echo "ASSERTION FAILED: $DB.stopped is there though the hub opened its database"; return 1; }
  # Two updates (to NEXT, then this one), one copy: NEXT's. The files no update wrote stay.
  one_copy "$NEXT"
  others_kept
  # The build rolled back to does not open the moved-aside database, which holds a migration it lacks: its hub stops,
  # says why, and leaves why beside the database for `cawco status`.
  as_user "$hubc" sh -c 'rm -rf /tmp/newer && mkdir /tmp/newer && cp "$1" /tmp/newer/cawco.db && for s in -wal -shm; do if [ -e "$1$s" ]; then cp "$1$s" "/tmp/newer/cawco.db$s"; fi; done' sh "$aside"
  local out
  if out=$(hub_on /tmp/newer/cawco.db); then
    echo "ASSERTION FAILED: the hub started on a database a newer build migrated: $out"
    return 1
  fi
  echo "the hub said: $out"
  [[ $out == *"/tmp/newer/cawco.db was migrated by a newer build of CawCo: it holds 1 migration this build lacks"* && $out == *"Install a build that has that migration."* ]] \
    || { echo "ASSERTION FAILED: the hub stopped without its words"; return 1; }
  [[ "$(as_user "$hubc" cat /tmp/newer/cawco.db.stopped)" == *"was migrated by a newer build of CawCo"* ]] \
    || { echo "ASSERTION FAILED: no /tmp/newer/cawco.db.stopped saying why"; return 1; }
  if out=$(as_user "$hubc" env CAWCO_DB_PATH=/tmp/newer/cawco.db "$DATA/binary/versions/$NEXT/cawco" status --hub http://127.0.0.1:43999 2>&1); then
    echo "ASSERTION FAILED: cawco status answered for a hub that is down: $out"
    return 1
  fi
  [[ $out == *"the hub is down: /tmp/newer/cawco.db was migrated by a newer build of CawCo"* ]] \
    || { echo "ASSERTION FAILED: cawco status does not say the hub is down and why: $out"; return 1; }
}
# `cawco service install` and a first install, pointed at a database a newer build migrated (the one the migration
# check left in /tmp/newer), stop before they change anything: the units and the install's record are as they were,
# and the hub runs on.
installs_stop_on_newer() {
  need_hub
  local units=/home/cawco/.config/systemd/user out
  as_user "$hubc" sh -c 'mkdir -p /tmp/before && cp "$1"/cawco-*.service "$2/installation.json" /tmp/before/' sh "$units" "$DATA/binary"
  if out=$(as_user "$hubc" env CAWCO_DB_PATH=/tmp/newer/cawco.db "$DATA/binary/versions/$NEXT/cawco" service install 2>&1); then
    echo "ASSERTION FAILED: service install went on over a newer database: $out"
    return 1
  fi
  [[ $out == *"was migrated by a newer build of CawCo"* ]] || { echo "ASSERTION FAILED: service install stopped without the words: $out"; return 1; }
  if out=$(as_user "$hubc" env CAWCO_DB_PATH=/tmp/newer/cawco.db "$DATA/binary/versions/$NEXT/cawco" binary-install hub 2>&1); then
    echo "ASSERTION FAILED: a first install went on over a newer database: $out"
    return 1
  fi
  [[ $out == *"was migrated by a newer build of CawCo"* ]] || { echo "ASSERTION FAILED: the install stopped without the words: $out"; return 1; }
  as_user "$hubc" sh -c 'for f in /tmp/before/cawco-*.service; do cmp "$f" "$1/${f##*/}" || exit 1; done; cmp /tmp/before/installation.json "$2/installation.json"' sh "$units" "$DATA/binary" \
    || { echo "ASSERTION FAILED: a unit or the install's record changed"; return 1; }
  need_hub
  [[ "$(build_version $hid)" == $NEXT ]]
}
# A build with no migration of its own leaves a row the build before it does not read (agents.build), and fails:
# rolled back, and the hub reads its own rows, from the copy.
reshaped_rolled_back() {
  need_hub
  use_feed reshaped
  learn
  wait_until 360 '[[ "$(field $hid failedVersion)" == 0.0.1-test.9 && "$(phase $hid)" == failed-rolled-back ]]'
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  # GET /api/agents reads every agents.build: the trial's value would be refused here.
  [[ "$(build_version $hid)" == $NEXT ]]
  [[ "$(db_rows has "$DB" e2e-trial-row)" == no ]]
  [[ "$(db_rows has "$DB.migrated-0.0.1-test.9" e2e-trial-row)" == yes ]]
  # One moved-aside database: this rollback's took the place of the one before.
  local asides
  asides=$(data_files '^cawco\.db\.migrated-' | paste -sd ' ')
  [[ $asides == *"cawco.db.migrated-0.0.1-test.9"* && $asides != *"test.8"* ]] \
    || { echo "ASSERTION FAILED: the moved-aside files are \"$asides\", not 0.0.1-test.9's alone"; return 1; }
  one_copy "$NEXT"
  others_kept
}
# A rollback with no room to put the copy beside the database (the filling build fills the data dir as its hub):
# the live database stays at its path and opens, and the rollback says why. Room again, and it is put back.
no_room_to_put_back() {
  need_hub
  use_feed filling
  learn
  wait_until 360 '[[ "$(field $hid error)" == *"database was not put back"* ]]'
  echo "the update said: $(field $hid error)"
  [[ "$(field $hid error)" == *"$DB is unchanged"* ]]
  as_user "$hubc" test -s "$DB" || { echo "ASSERTION FAILED: nothing is at $DB"; return 1; }
  [[ "$(db_rows check "$DB")" == ok ]] || { echo "ASSERTION FAILED: the live database does not open sound"; return 1; }
  ! as_user "$hubc" test -e "$DB.restoring" || { echo "ASSERTION FAILED: the copy that did not fit is left beside the database"; return 1; }
  one_copy "$NEXT"
  others_kept
  as_user "$hubc" rm -f "$DATA/e2e-filler"
  wait_until 360 '! has_file "$hubc" trial.json && [[ "$(phase $hid)" == failed* ]]'
  echo "the update said, once it had room: $(field $hid error)"
  wait_until 120 need_hub
  [[ "$(build_version $hid)" == $NEXT ]]
}
# An update with less room than its copies need is not started: nothing is copied or swapped, and the copy before
# stays.
no_room_to_copy() {
  need_hub
  as_user "$hubc" sh -c 'db=$(stat -c %s "$1"); free=$(df -B1 --output=avail "$2" | tail -n 1 | tr -dc 0-9); fallocate -l $((free - db)) "$2/e2e-filler"' sh "$DB" "$DATA"
  use_feed roomless
  learn
  wait_until 300 '[[ "$(field $hid error)" == *"0.0.1-test.12 was not installed: copying the hub'"'"'s database needs"* ]]'
  echo "the update said: $(field $hid error)"
  [[ "$(build_version $hid)" == $NEXT && "$(current_link "$hubc")" == "versions/$NEXT" ]]
  ! has_file "$hubc" trial.json
  one_copy "$NEXT"
  others_kept
  as_user "$hubc" rm -f "$DATA/e2e-filler"
}
export -f db_rows data_files copy_made one_copy others_kept rolled_back hub_on plant_others confirmed_update_copies migration_rolled_back installs_stop_on_newer reshaped_rolled_back no_room_to_put_back no_room_to_copy
rig_rollback() {
  fleet base "$BASE" hub
  setup_done
  check "a build that cannot start is rolled back and the failure is recorded; the update copied the hub's database and the rollback put it back" rolled_back
}
rig_migration() {
  export SMALL_DATA=256m
  fleet base "$BASE" hub
  setup "files no update writes, in the hub's data dir" plant_others
  setup_done
  check "an update of the hub that confirms copies its database first" confirmed_update_copies
  check "a build with a new migration that fails to start is rolled back: the row from before is in the live database, the trial's is in the file the rollback names, one copy is kept, and the build rolled back to does not open the moved-aside database" migration_rolled_back 900 "an update of the hub that confirms copies its database first"
  check "service install and a first install stop on a database a newer build migrated, changing nothing" installs_stop_on_newer 300 "a build with a new migration that fails to start is rolled back: the row from before is in the live database, the trial's is in the file the rollback names, one copy is kept, and the build rolled back to does not open the moved-aside database"
  check "a build with no new migration that leaves a row its predecessor cannot read is rolled back, and the hub reads its rows from the copy" reshaped_rolled_back 600 "an update of the hub that confirms copies its database first"
  check "a rollback with no room for the copy beside the database leaves the live database at its path, sound, and says why" no_room_to_put_back 900 "an update of the hub that confirms copies its database first"
  check "an update with too little room for its copies is not started, and the copy before stays" no_room_to_copy 600 "an update of the hub that confirms copies its database first"
}

# ---------------------------------------------------------------- handover: a joined machine with sessions on its
# keeper installs a build. The new build's keeper takes a new session at once, the old sessions run on and stay
# answerable, through an agent restart in the middle of the handover too, and when they end the old keeper goes by
# itself. On the way, the hub's own update keeps the build its trial would restore until the trial is confirmed, and
# a session on the new keeper carries only the CAWCO_* its tools read.
env_is_clean() {
  local container=$1 id=$2 pid env extra
  pid=$(child_pids "$container" "$id")
  [[ "$pid" =~ ^[0-9]+$ ]]
  env=$(as_user "$container" cat "/proc/$pid/environ" | tr '\0' '\n')
  echo "$id, pid $pid: $(printf '%s\n' "$env" | grep -oE '^(CAWCO_[A-Z0-9_]*|PI_PACKAGE_DIR)=' | tr -d = | sort | tr '\n' ' ')"
  printf '%s\n' "$env" | grep -qx "CAWCO_INSTANCE_ID=$id"
  ! printf '%s\n' "$env" | grep -q '^PI_PACKAGE_DIR=' || { echo "it carries PI_PACKAGE_DIR"; return 1; }
  extra=$(printf '%s\n' "$env" | grep -oE '^CAWCO_[A-Z0-9_]*' | grep -vxE "$SESSION_CAWCO_ALLOWED|CAWCO_MODEL" || true)
  [[ -z $extra ]] || { echo "it carries $(echo $extra)"; return 1; }
}
handover_on_joined_machine() {
  need_hub
  on_exit 'end_children "$joinerc" handover-'
  local old=$BASE new=$NEXT oldend oldunit oldpid id pid
  oldend=$(current_endpoint "$joinerc")
  oldunit=$(current_unit "$joinerc")
  oldpid=$(keeper_pid "$joinerc")
  [[ "$oldend" == "$(endpoint_of "$old")" && -n "$oldpid" ]]
  # Three sessions running on the joined machine's keeper before its update.
  start_before "$jid" "$joinerc" "$rigdir/handover-before.txt" handover-1 handover-2 handover-3
  # The new build reaches the hub's machine. While the helper decides its trial, the build it would restore is still on
  # disk; once the build is confirmed the trial is gone, the keeper has been handed over to it, and the build before
  # stays as one of the three installed builds the machine keeps (the install order names both).
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  wait_until 400 '[[ "$(current_link "$hubc")" == "versions/$NEXT" ]] && has_file "$hubc" trial.json'
  has_version "$hubc" "$old"
  wait_until 400 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]] && ! has_file "$hubc" trial.json'
  wait_until 120 '[[ "$(keeper_link "$hubc")" == "versions/$NEXT" && "$(current_endpoint "$hubc")" == "$(endpoint_of $NEXT)" ]]'
  wait_until 120 '[[ "$(install_order "$hubc")" == *"'"$old"' $NEXT" ]]'
  has_version "$hubc" "$old"
  # The joined machine looks at what its hub offers now, and installs it with its sessions running.
  learn
  wait_until 120 '[[ "$(field $jid availableVersion)" == $NEXT ]]'
  install_now_request "$jid" > /dev/null
  wait_until 400 '[[ "$(build_version $jid)" == $NEXT && "$(phase $jid)" == installed ]]'
  # The new build's keeper is the joined machine's at once: the keeper link, the machine's endpoint and the update
  # state name it, and the state says the keeper before is handing over with the three sessions it holds.
  [[ "$(keeper_link "$joinerc")" == "versions/$new" ]]
  [[ "$(current_endpoint "$joinerc")" == "$(endpoint_of "$new")" ]]
  wait_until 60 '[[ "$(field $jid sessiondVersion)" == "'"$new"'" && "$(retiring $jid)" == "'"$old"':3" ]]'
  hub_api /api/binary-updates/machines | json "d => JSON.stringify({phase: d.machines['$jid'].phase, sessiondVersion: d.machines['$jid'].sessiondVersion, retiringKeepers: d.machines['$jid'].retiringKeepers})"
  # A new session starts at once, on the new keeper, and carries only the CAWCO_* its tools read.
  start_session "$jid" handover-new
  wait_until 60 'session_running handover-new'
  [[ "$(holder_of "$joinerc" handover-new)" == "$(endpoint_of "$new")" ]]
  env_is_clean "$joinerc" handover-new
  # The old sessions run on: the same processes, still on the keeper before, which is the same process.
  survived "$joinerc" "$rigdir/handover-before.txt"
  while read -r -u 3 id pid; do
    [[ "$(holder_of "$joinerc" "$id")" == "$oldend" ]]
  done 3< "$rigdir/handover-before.txt"
  [[ "$(keeper_pid "$joinerc" "$oldunit")" == "$oldpid" ]]
  # The agent restarts in the middle of the handover: it takes back the sessions on both keepers.
  as_user "$joinerc" systemctl --user restart cawco-agent.service
  wait_until 120 '[[ "$(custody_of $jid)" == available && "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$jid\")?.status")" == online ]]'
  survived "$joinerc" "$rigdir/handover-before.txt"
  wait_until 120 'session_running handover-new'
  [[ "$(holder_of "$joinerc" handover-new)" == "$(endpoint_of "$new")" ]]
  [[ "$(keeper_pid "$joinerc" "$oldunit")" == "$oldpid" ]]
  # An old session answers: stopped through the hub, the keeper before ends it.
  read -r id pid < "$rigdir/handover-before.txt"
  stop_session "$jid" "$id"
  wait_until 60 '! as_user "$joinerc" kill -0 "'"$pid"'" 2> /dev/null'
  wait_until 60 '[[ "$(retiring $jid)" == "'"$old"':2" ]]'
  # A process CawCo did not start, in the keeper before's unit. The other two sessions end: the keeper before is kept,
  # the same process with its unit, its update state names the process, and the machine's Update cell says what keeps
  # it, never "handing over". The process ends: the keeper before then goes by itself, its process, unit and endpoint,
  # and the new keeper's session runs on.
  local planted row
  planted=$(plant_in_unit "$joinerc" "$oldpid")
  [[ -n $planted ]] || { echo "ASSERTION FAILED: no process was planted in $oldunit"; return 1; }
  echo "planted in $oldunit: $planted"
  for pid in $(tail -n +2 "$rigdir/handover-before.txt" | awk '{print $2}'); do
    as_user "$joinerc" kill "$pid"
  done
  wait_until 180 '[[ "$(kept_of $jid "'"$old"'")" == "'"$planted"'" ]]'
  row=$(update_row "$jid")
  echo "update row: $row"
  [[ "$row" == *"is still running: a process CawCo didn't start (sleep, pid $planted) runs inside it"* && "${row,,}" != *"keeper"* && "${row,,}" != *"sessiond"* && "${row,,}" != *"custody"* && "$row" != *"handing over"* ]] || { echo "ASSERTION FAILED: the Update cell does not say what keeps the keeper before"; return 1; }
  [[ "$(keeper_pid "$joinerc" "$oldunit")" == "$oldpid" ]] || { echo "ASSERTION FAILED: the keeper before was stopped with a process CawCo did not start in its unit"; return 1; }
  as_user "$joinerc" test -e "/home/cawco/.config/systemd/user/$oldunit"
  as_user "$joinerc" kill "$planted"
  wait_until 180 '! as_user "$joinerc" kill -0 "'"$oldpid"'" 2> /dev/null'
  wait_until 60 'as_user "$joinerc" test ! -e "/home/cawco/.config/systemd/user/'"$oldunit"'"'
  wait_until 60 'as_user "$joinerc" test ! -e "/run/user/1000/cawco/'"$oldend"'"'
  wait_until 60 '[[ -z "$(retiring $jid)" ]]'
  [[ "$(holder_of "$joinerc" handover-new)" == "$(endpoint_of "$new")" ]]
  session_running handover-new
  [[ "$(phase $jid)" == installed ]]
  # A keeper unit no keeper runs from, as an earlier build's update helper leaves one (`cawco binary-units` for a
  # keeper it then left where it was): written here, nothing started from it. Only the new build's keeper unit is left
  # on the machine: every other keeper's went with its keeper, and a unit no keeper runs from goes once it has been so
  # for its while.
  as_user "$joinerc" sh -c 'printf "[Unit]\nDescription=CawCo sessiond 0.0.0-stray\n[Service]\nExecStart=/bin/false\n" > ~/.config/systemd/user/cawco-sessiond-0.0.0-stray.service && systemctl --user daemon-reload'
  wait_until 90 '[[ "$(as_user "$joinerc" systemctl --user list-unit-files --no-legend "cawco-sessiond*.service" | awk "{print \$1}")" == "$(unit_of "'"$new"'")" ]]'
}
export -f env_is_clean handover_on_joined_machine
rig_handover() {
  # The CAWCO_* a session may carry (env_is_clean), read from core so a renamed one cannot fall out of step: those its
  # tools read (SESSION_CAWCO_ENV), and the keeper's tree mark (CAWCO_ENV.sessiondTree), which sessiond itself puts in
  # each child it starts and reads back to end what the child left running, and no tool reads.
  export SESSION_CAWCO_ALLOWED
  SESSION_CAWCO_ALLOWED=$(cd "$here/../.." && bun -e 'const { SESSION_CAWCO_ENV } = await import("./packages/core/src/session-env.ts"); const { CAWCO_ENV } = await import("./packages/core/src/cawco-env.ts"); console.log([...SESSION_CAWCO_ENV, CAWCO_ENV.sessiondTree].join("|"))')
  [[ -n $SESSION_CAWCO_ALLOWED ]]
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "a joined machine installs a build with sessions on its keeper: the new keeper takes a new session at once (carrying only the CAWCO_* its tools read), the old sessions run on and answer through an agent restart, the old keeper is kept while its unit holds a process CawCo did not start (its update state and Update cell name it) and goes once that ends; the hub's machine keeps the build its trial would restore until the trial is confirmed" handover_on_joined_machine 1200
}

# ---------------------------------------------------------------- sandbox: a delegate workspace's boundary
# A delegate's workspace on the joined machine, opened the product's own way: a session there delegates through the
# hub (`POST /api/work-items`, all `delegate` sends), the hub has the machine cut the clone and start its srt boundary
# (CONTROL_WORKSPACE_CREATE, packages/agent/src/workspace.ts), and the work item's session, the stub harness's held
# `sleep`, starts in it. Every command goes in through the workspace's executor, ~/.cawco/workspaces/<id>/exec, as
# every harness runs its shell commands. srt's host and ripgrep ship inside the build.
export WS_REPO=/home/cawco/test-repo WS_ORIGIN=/home/cawco/test-origin.git
ws_state() { echo "/home/cawco/.cawco/workspaces/$(cat "$rigdir/ws-id")"; }
ws_json() { as_user "$joinerc" sh -c 'cat "$1" 2> /dev/null || true' sh "$(ws_state)/$1" | json "$2"; }
ws_gen() { ws_json boundary.json 'd => d.gen'; }
# Runs one command through the workspace's executor, from its clone, as a harness's shell tool does.
ws_exec() { as_user "$joinerc" sh -c 'cd "$1" && exec "$2" "$3"' sh "$(cat "$rigdir/ws-clone")" "$(ws_state)/exec" "$1"; }
# A boundary generation's sandbox, as its srt host names it: `OUTER INNER IDLE...`.
ws_place() { as_user "$joinerc" cat "$(ws_state)/boundaries/$1/sandbox"; }
ns_of() { as_user "$joinerc" readlink "/proc/$1/ns/pid"; }
# A POST to the hub, answering its body and a last line `HTTP <status>`, so a refusal shows the hub's words.
ws_post() { as_user "$hubc" curl -sS -w '\nHTTP %{http_code}' "http://127.0.0.1:3456$1" -X POST -H 'content-type: application/json' -d "$2"; }
# The delegate's tool call that holds its work item open, a line of a message its stub runs as the session does
# (test-harnesses.ts toolCalls): a declared wait, which the hub's turn-end rule honours in place of the quiet-turn
# reminders (work-items.ts waitingTurn), as a real delegate holds an item open on a command it started. Each message the
# session takes after the wait ended (a busy turn clears a wait at rest, work-items.ts turnState) declares it again.
# Exported: each check runs in a shell of its own, which sees only what is exported.
# tool answer: words (the transcript is matched for wait_item's own words)
export WS_WAIT_LINE='cawco tool wait_item {"minutes":60,"reason":"the end-to-end test holds this item open"}'
# Its standard input as one JSON string.
json_string() { bun -e 'process.stdout.write(JSON.stringify(await Bun.stdin.text()))'; }
# The delegate's work item as the hub has it: its state, and whether it holds a declared wait.
ws_item() { hub_api "/api/work-items/$(cat "$rigdir/ws-item")"; }
ws_item_says() { ws_item | json 'd => `${d.state}, ${d.waitUntil ? `waiting until ${d.waitUntil}: ${d.waitReason}` : "no wait"}${d.error ? `, ${d.error}` : ""}`'; }
ws_item_live() { [[ "$(ws_item | json 'd => `${d.state} ${d.waitUntil ? "waiting" : "-"}`')" == "running waiting" ]]; }
# Every credential a command must not read: a planted key, and the machine's CawCo account credential.
ws_secrets() { printf '%s\n' /home/cawco/.ssh/id_ed25519 "/home/cawco/.cawco/accounts/$(cat "$rigdir/account-id")/claude/.credentials.json"; }
ws_cannot_read() {
  local file rc said
  for file in $(ws_secrets); do
    as_user "$joinerc" test -s "$file"
    rc=0
    said=$(ws_exec "cat '$file'" 2>&1) || rc=$?
    echo "cat $file through the executor: exit $rc: $said"
    [[ $rc != 0 ]] || { echo "ASSERTION FAILED: the command read $file"; return 1; }
    [[ $said != *cawco-test-secret* && $said != *sk-ant-* ]] || { echo "ASSERTION FAILED: the command printed what $file holds"; return 1; }
  done
}
workspace_opens() {
  need_hub
  local answer body id gen outer inner
  # git, from the machine's own package source: a workspace is a git clone of a repository with an origin.
  as_user "$joinerc" sh -c 'sudo apt-get update > /dev/null && sudo apt-get install -y git > /dev/null && git --version'
  as_user "$joinerc" sh -c 'set -e
    rm -rf "$1" "$2"
    git init -q --bare -b main "$2"
    git init -q -b main "$1"
    cd "$1"
    printf "test\n" > README.md
    git add README.md
    git -c user.name=test -c user.email=test@cawco.test commit -qm "A repository to delegate in"
    git remote add origin "$2"
    git push -q origin main' sh "$WS_REPO" "$WS_ORIGIN"
  # The session that delegates, on the joined machine.
  start_session "$jid" wsparent-1 > /dev/null
  wait_until 60 'session_running wsparent-1'
  # Its prompt names the wait the delegate declares in its first turn, which holds its item open (WS_WAIT_LINE).
  answer=$(ws_post /api/work-items "{\"parentInstanceId\":\"wsparent-1\",\"title\":\"Open the workspace boundary\",\"prompt\":$(printf '%s\n%s' "The end-to-end test's workspace." "$WS_WAIT_LINE" | json_string),\"harness\":\"claude\",\"model\":\"default\",\"cwd\":\"$WS_REPO\",\"machineId\":\"$jid\",\"lands\":\"none\"}")
  echo "the hub answered the delegation: $answer"
  [[ "$answer" == *"HTTP 200" ]]
  body=$(sed '$d' <<< "$answer")
  json 'd => d.workspaceId' <<< "$body" > "$rigdir/ws-id"
  json 'd => d.workItemId' <<< "$body" > "$rigdir/ws-item"
  json 'd => d.instanceId' <<< "$body" > "$rigdir/ws-delegate"
  id=$(cat "$rigdir/ws-id")
  [[ -n $id ]]
  # Its boundary: the record names a generation, whose dir holds the srt settings it started with, and the joined
  # machine's keeper holds its srt host under that generation's id.
  gen=$(ws_gen)
  [[ $gen =~ ^[0-9a-f]{8}$ ]] || { echo "the boundary record names no generation: '$gen'"; return 1; }
  ws_json boundary.json 'd => d.path' > "$rigdir/ws-clone"
  as_user "$joinerc" test -d "$(cat "$rigdir/ws-clone")/.git"
  as_user "$joinerc" test -s "$(ws_state)/boundaries/$gen/srt.json"
  as_user "$joinerc" cat "$(ws_state)/boundaries/$gen/srt.json" | json 'd => `srt settings: ${d.filesystem.denyRead.length} read denies, ${d.filesystem.allowWrite.length} writable paths`'
  [[ "$(child_pids "$joinerc" "boundary-$id-$gen")" =~ ^[0-9]+$ ]]
  wait_until 60 'session_running "$(cat "$rigdir/ws-delegate")"'
  # Its first turn declared its wait: the item is live, held open as a delegate holds one on a command it started.
  wait_until 30 ws_item_live || { echo "ASSERTION FAILED: the work item is $(ws_item_says)"; echo "its session said: $(transcript_of "$(cat "$rigdir/ws-delegate")")"; return 1; }
  echo "the work item: $(ws_item_says)"
  # A command through the executor runs in the clone, as the workspace, in the sandbox's own pid namespace.
  [[ "$(ws_exec 'cat README.md')" == test ]]
  [[ "$(ws_exec 'printf %s "$CAWCO_WORKSPACE"')" == "$id" ]]
  read -r outer inner _ <<< "$(ws_place "$gen")"
  [[ "$(ws_exec 'readlink /proc/self/ns/pid')" == "$(ns_of "$inner")" ]]
  [[ "$(ns_of "$inner")" != "$(as_user "$joinerc" readlink /proc/self/ns/pid)" ]]
  # A credential planted in the home dir, which the host reads, and the account's own: neither reads inside.
  as_user "$joinerc" sh -c 'mkdir -p -m 700 "$HOME/.ssh" && umask 077 && printf "%s\n" "$1" > "$HOME/.ssh/id_ed25519"' sh "cawco-test-secret-$RANDOM$RANDOM"
  as_user "$joinerc" grep -q cawco-test-secret /home/cawco/.ssh/id_ed25519
  ws_cannot_read
}
export -f ws_state ws_json ws_gen ws_exec ws_place ns_of ws_post json_string ws_item ws_item_says ws_item_live ws_secrets ws_cannot_read workspace_opens
rig_sandbox() {
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "a delegate workspace on the joined machine opens with its srt boundary, and a command through its executor cannot read a planted credential" workspace_opens 600
}

# The session's transcript as the hub has it.
transcript_of() { hub_api "/api/instances/$1/transcript"; }
export -f transcript_of

echo "rig $RIG: started"
"rig_$RIG"
echo "rig $RIG: done in $((SECONDS - RIG_STARTED))s"
exit $RIG_STATUS
