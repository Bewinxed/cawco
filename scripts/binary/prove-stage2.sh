#!/bin/bash
# Proof of the binary installer and the app-driven updater, in rootless containers with real systemd: only what the
# installed binary on a real machine can show, each piece in a rig of its own, every rig at once. Usage:
#   bun scripts/binary/build-stage2.ts /ABSOLUTE/BINARIES        # builds (or takes from the proof cache) what this needs
#   bash scripts/binary/prove-stage2.sh /ABSOLUTE/FRESH/OUTPUT /ABSOLUTE/BINARIES
# Needs podman and bun on the host. Each rig is its own podman instance (its own root, runroot, tmp dir, file locks and
# event log; see ISOLATION below) on an internal network with no route out: a release host (a folder served over
# HTTP) and the machines its checks need. Each check prints one line ending in PASS (with its seconds), FAIL or NOT RUN.
# PROOF_ONLY (an extended regex) runs only the rigs whose name, or one of whose checks' names, matches it; PROOF_LIST=1
# says which rigs and checks a run would run and stops. PROOF_RIGS caps how many rigs run at once (default: all).
#   bash scripts/binary/prove-stage2.sh --image-only [OUTPUT]
# builds only the proof's images (host and machine) into the proof cache's store, prints their tags, and exits 0, or
# with the build's error; it needs podman and bun, and no binaries. Its recipes go in OUTPUT (default: image-only in the
# proof cache).
#   bash scripts/binary/prove-stage2.sh --tags-only OUTPUT
# writes the images' recipes into OUTPUT and prints the tags they carry (`NAME=TAG`), building nothing: it needs bun,
# and no podman (proof-cache-prune.sh keeps the images they name).
set -uo pipefail
IMAGE_ONLY=
TAGS_ONLY=
if [[ ${1:-} == --image-only || ${1:-} == --tags-only ]]; then
  IMAGE_ONLY=1
  [[ $1 == --tags-only ]] && TAGS_ONLY=1
  shift
  (( $# <= 1 )) || { echo "usage: $0 --image-only|--tags-only [output]" >&2; exit 2; }
  set -- "${1:-${CAWCO_PROOF_CACHE:-$HOME/.cache/cawco-proof}/image-only}"
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

# The builds (scripts/binary/build-stage2.ts): three of this tree. NIGHTLY is NEXT as the nightly channel publishes
# it: a version in the shape release.ts gives a nightly (`<base>-nightly.<sequence>+<commit:12>`), its sequence and
# commit NEXT's, so its feed's manifest is one releaseTag reads and its binary says the version its manifest names.
export BASE=0.0.1-test.2 NEXT=0.0.1-test.3 NIGHTLY=0.0.1-nightly.30+333333333333
# The proof's own pace for the update's timed steps (packages/core/src/clock.ts, replaced in proof builds by
# scripts/binary/proof-clock.ts): the trial window (180 s), the confirm hold (60 s), the first retry delay (60 s), how
# long a retiring keeper sits empty (20 s), a drain's wait on the work in flight (45 s, agent binary-update.ts
# DRAIN_MS) and the agent's re-read of its Claude accounts' sign-ins (60 s, daemon.ts CLAUDE_LOGIN_CHECK_INTERVAL_MS)
# run this many times faster. The rigs prove each step's order; the lengths are the product's.
PROOF_TIME_SCALE=6
# The stand-ins are as slow and as late as production gets, never faster: what reached the person on 2026-10-16 came
# from slowness the rigs did not have.
#  - A retiring keeper answers each `list` this late (proof-list-pace.ts, set in every machine's service
#    manager beside the pace above): past the agent's 2000 ms wait for a listing (agent keepers.ts LIST_TIMEOUT_MS),
#    as a keeper slow to list did when a reattach gave up on it ("no keeper that answered holds …") and failed an item.
#  - Through an update, the machine's Claude Code answers `--version` and `auth status` this late (claude-late.sh):
#    past the agent's bounds on them (its 5 s wait for the version, claude-version.ts, and 20 s on `auth status`,
#    accounts.ts `authStatusIn`), as a Claude Code on an overloaded host answered them (a timed-out `claude auth
#    status` read as signed out). The stand-in is a new binary to the agent, so its version is read once, late.
#  - The hub restarts while messages are on their way (stage2-sends.ts sends one every 3 s through the hub's own
#    machine's update).
PROOF_RETIRING_LIST_MS=3000
CLAUDE_LATE_S=30
export CLAUDE_LATE_S

# ---------------------------------------------------------------- which rigs run
# A rig is a function rig_<name> below; its checks are its `check "<name>" …` lines.
RIGS=(sshadd admitted spare hubself rollback migration swapkill agentdown keeperheld keeperkilled handover drain retry
  pins workspace wsarchive runaway memory capped slowfleet bare nightlyjoin)
# How many systemd machines each rig boots (its `machines` refuses any other count): what it holds of the host user's
# inotify instances while it runs.
declare -A RIG_MACHINES=([sshadd]=3 [admitted]=2 [spare]=1 [hubself]=1 [rollback]=1 [migration]=1
  [swapkill]=1 [agentdown]=1 [keeperheld]=1 [keeperkilled]=1 [handover]=2 [drain]=2 [retry]=2 [pins]=1 [workspace]=2
  [wsarchive]=2 [runaway]=1 [memory]=1 [capped]=2 [slowfleet]=2 [bare]=2 [nightlyjoin]=2)
# THE HOST USER'S INOTIFY INSTANCES are every rig's to share. The kernel charges an instance to its user in each user
# namespace up to the initial one, and every rootless container's namespace is the host user's, so all machines of
# every rig, and the host user's own processes, draw on one fs.inotify.max_user_instances (384 on obelisk). Run A of
# 2026-10-15 ran out: the agent's watch failed with "EMFILE: too many open files, watch '/home/cawco/.pi/agent'". Each
# machine holds its instances for its whole life, so the orchestrator starts a rig only while the machines running and
# its own fit. INOTIFY_PER_MACHINE is a machine's budget: CawCo's own processes held 5 measured on a scratch fleet
# (hub 0, sessiond 4, agent 1), systemd, journald, logind, dbus and the user's manager more; 32 is our call until the
# boot lines (`boot`: "inotify N") measure it. INOTIFY_RESERVE is room for the host user's processes that start while
# the proof runs. Raising the host's limit (`sudo sysctl -w fs.inotify.max_user_instances=8192`, kept in
# /etc/sysctl.d) lets every rig run at once.
INOTIFY_PER_MACHINE=32
INOTIFY_RESERVE=64
rig_checks() {
  awk -v rig="rig_$1()" '$1 == rig { inside = 1; next } inside && /^}/ { inside = 0 } inside && /^  check "/ { split($0, q, "\""); print q[2] }' "$self"
}
rig_selected() {
  [[ -z ${PROOF_ONLY:-} || $1 =~ $PROOF_ONLY ]] && return 0
  local name
  while IFS= read -r name; do [[ $name =~ $PROOF_ONLY ]] && return 0; done < <(rig_checks "$1")
  return 1
}
if [[ -z ${RIG:-} ]]; then
  SELECTED_RIGS=()
  for rig in "${RIGS[@]}"; do rig_selected "$rig" && SELECTED_RIGS+=("$rig"); done
  (( ${#SELECTED_RIGS[@]} > 0 )) || { echo "PROOF_ONLY matches no rig or check: $PROOF_ONLY" >&2; exit 2; }
  if [[ -n ${PROOF_LIST:-} ]]; then
    for rig in "${SELECTED_RIGS[@]}"; do
      echo "rig $rig:"
      rig_checks "$rig" | sed 's/^/  /'
    done
    exit 0
  fi
fi

# Every podman this proof starts is an instance of its own, sharing nothing with the host's containers or another
# rig, and its images come from the proof cache's store, kept between runs (scripts/binary/podman-instance.sh).
# shellcheck source=base-image.sh
source "$here/base-image.sh"
# shellcheck source=podman-instance.sh
source "$here/podman-instance.sh"

# ================================================================ THE IMAGES' RECIPES
# Written into $out/images, built from there by proof_images (podman-instance.sh) once per recipe.
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
  # dashboard, agent, keepers, update helpers) with the proof's pace for the update's timed steps, and as machines this
  # proof brought up for itself (CAWCO_INSIDE_RUN, core machine-room.ts): a session start in one waits on no reading of
  # the host's memory, which its own rigs move (on 2026-10-19 a run's session starts were held 63 s on the host's
  # memory stall while its 24 machines ran).
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
  # A bare machine (the `bare` image) is the same with none of what a workspace needs: no bubblewrap or socat, and no
  # git, installed or in its package source. A person's fresh server is so until someone installs them.
  local claude_version
  claude_version=$(sdk_claude_version) || return 1
  machine_recipe 'socat bubblewrap ' 'openssl git' '' > "$out/images/machine.Containerfile"
  machine_recipe '' openssl ' && ! command -v git && ! command -v socat && ! command -v bwrap' > "$out/images/bare.Containerfile"
}
# A machine's recipe (see write_images): the tools it has beyond the base ($1, each followed by a space), the packages
# its local package source holds ($2), and the checks that it has none of them installed beyond openssl ($3).
machine_recipe() {
  local tools=$1 debs=$2 absent=$3
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
 && apt-get install -y --no-install-recommends systemd systemd-sysv dbus dbus-user-session curl sudo ${tools}openssh-server openssh-client iproute2 \\
 && apt-get install -y --download-only $debs \\
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
 && printf '[Service]\\nKeyringMode=inherit\\n' > /etc/systemd/system/service.d/proof-keyring.conf \\
 && printf '[Service]\\nTasksMax=infinity\\n' > /etc/systemd/system/user@.service.d/proof-tasks.conf \\
 && printf '[Slice]\\nTasksMax=infinity\\n' > /etc/systemd/system/user-.slice.d/proof-tasks.conf \\
 && printf '[Manager]\\nDefaultTasksMax=49152\\nDefaultEnvironment=CAWCO_PROOF_TIME_SCALE=$PROOF_TIME_SCALE CAWCO_PROOF_RETIRING_LIST_MS=$PROOF_RETIRING_LIST_MS CAWCO_INSIDE_RUN=stage2-proof\\n' > /etc/systemd/user.conf.d/proof.conf
COPY --from=claude --chown=cawco:cawco /home/cawco/.local /home/cawco/.local
RUN HOME=/tmp/claude-check /home/cawco/.local/bin/claude --version | grep -F '$claude_version' \\
 && rm -rf /tmp/claude-check && ! command -v openssl$absent
EOF
}

# ================================================================ THE ORCHESTRATOR (run below, once every
# function it uses is defined)
orchestrate() {
  python3 -c 'import pexpect' 2> /dev/null || { echo "python3 with pexpect is needed to answer the installer's prompts (pip install pexpect)" >&2; exit 2; }
  command -v flock > /dev/null || { echo "flock (util-linux) is needed: one proof at a time builds into the image store" >&2; exit 2; }
  for need in cawco-2 cawco-3 cawco-nightly keys/test-release-private.pem keys/test-release-public.pem; do
    [[ -e "$bins/$need" ]] || { echo "missing $bins/$need: run build-stage2.ts first" >&2; exit 2; }
  done
  free_gb=$(df -BG --output=avail "$out" | tail -n 1 | tr -dc 0-9)
  (( free_gb >= 25 )) || { echo "only ${free_gb}G is free where $out is; the proof needs 25G (each rig's machines are vfs copies of the image; a full disk made podman fail with 'database or disk is full' in an earlier run)" >&2; exit 2; }
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

  # ---------------------------------------------------------------- the images, from the proof cache's store
  # Each built there once per recipe (proof_images), and read by every rig as its additional image store.
  write_images

  # ---------------------------------------------------------------- what every rig reads: fixtures and feeds
  key="$bins/keys/test-release-private.pem"
  schema=$(bun -e "console.log(JSON.parse(await Bun.file('$(realpath "$here/../..")/packages/hub/drizzle/meta/_journal.json').text()).entries.length)")
  fixture() { bun "$here/stage2-fixture.ts" "$@"; }
  # Each feed is published once here, and a rig takes it by hard links (use_feed): no rig tars or signs a build.
  feed() { local name=$1; shift; fixture release "$out/feeds/$name" "$@"; }
  feeds() {
    local pids=() rc=0 pid
    feed base ok stable "$BASE" 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 20 "$schema" & pids+=($!)
    feed next ok stable "$NEXT" 3333333333333333333333333333333333333333 "$bins/cawco-3" "$key" 30 "$schema" & pids+=($!)
    feed broken ok stable 0.0.1-test.10 1010101010101010101010101010101010101010 "$out/shared/broken-cawco" "$key" 31 "$schema" & pids+=($!)
    feed migrating ok stable 0.0.1-test.8 8888888888888888888888888888888888888888 "$out/shared/migrating-cawco" "$key" 32 "$((schema + 1))" & pids+=($!)
    feed swapbroken ok stable 0.0.1-test.6 3434343434343434343434343434343434343434 "$out/shared/broken-cawco" "$key" 34 "$schema" & pids+=($!)
    # The newer build on the nightly channel, beside base's older one on stable: a nightly hub's fleet (nightlyjoin).
    feed nightly ok nightly "$NIGHTLY" 3333333333333333333333333333333333333333 "$bins/cawco-nightly" "$key" 30 "$schema" & pids+=($!)
    feed refusals tampered stable "$BASE" 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 20 "$schema" tamper & pids+=($!)
    feed refusals badsig stable "$BASE" 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 20 "$schema" bad-signature & pids+=($!)
    feed refusals nosig stable "$BASE" 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key" 20 "$schema" no-signature & pids+=($!)
    feed refusals brokeninstall stable "$BASE" 2222222222222222222222222222222222222222 "$out/shared/broken-cawco" "$key" 20 "$schema" & pids+=($!)
    for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
    return $rc
  }
  fixtures() {
    fixture installer "$bins/keys/test-release-public.pem" "$out/shared/installer.sh" &&
      fixture broken-binary "$out/shared/broken-cawco" &&
      fixture broken-binary "$out/shared/migrating-cawco" migrates &&
      bun -e "await Bun.write('$out/shared/workflow.json', JSON.stringify({name: 'kept-through-rollback', program: 'import { z } from \"zod\"; export const inputs=z.object({name:z.string()}); export default async function(w:Workflow<typeof inputs>){await w.checkpoint(\"binary\",w.inputs);return {name:w.inputs.name};}'}))" &&
      machine_helpers "$out/shared" &&
      write_machine_scripts "$out/shared"
  }
  # The helpers the machines run from /shared (run_script), each bundled into one self-contained file under its own
  # name: /shared holds no repo tree, so a relative import left in a raw source has nothing to resolve to (nightly
  # cca90e213: "Cannot find module '../../packages/core/src/bounded' from '/shared/stage2-send.ts'").
  machine_helpers() {
    local dir=$1 helper
    for helper in start-session stop-session send sends during-install hook-calls preview-port; do
      bun build "$here/stage2-$helper.ts" --target=bun --outfile "$dir/stage2-$helper.ts" || return 1
    done
  }
  echo "preparing (images and fixtures at once)"
  proof_images "$out/images" host machine bare > "$out/images/tags" 2> "$out/logs/images.log" &
  images=$!
  step "write the fixtures" "$out/logs/fixtures.log" fixtures
  step "publish every feed the rigs take" "$out/logs/feeds.log" feeds
  wait "$images" || { echo "setup failed at: the images (log: $out/logs/images.log)" >&2; tail -n 20 "$out/logs/images.log" >&2; exit 3; }
  HOST_IMAGE=$(sed -n 's/^host=//p' "$out/images/tags")
  MACHINE_IMAGE=$(sed -n 's/^machine=//p' "$out/images/tags")
  BARE_IMAGE=$(sed -n 's/^bare=//p' "$out/images/tags")
  echo "setup: images and fixtures ($((SECONDS - STARTED))s): $HOST_IMAGE, $MACHINE_IMAGE, $BARE_IMAGE"

  # ---------------------------------------------------------------- the rigs, at once
  export out bins here self schema HOST_IMAGE MACHINE_IMAGE BARE_IMAGE
  cap=${PROOF_RIGS:-${#SELECTED_RIGS[@]}}
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
# Makes a build's session keeper fail to start, or start slowly, without any hook in the product: the build's
# executable is replaced by a stub for one verb. Each build's keeper runs from its own folder in a unit of its own
# (packages/core/src/keepers.ts), so the stub reaches that build's keeper and nothing else.
cat > "$dir/keeper-dropin.sh" <<'EOF'
root="$HOME/.local/share/cawco/binary"
case "$1" in
  break-when-staged|slow-when-staged)
    # A build cannot run one verb because its executable is replaced by a stub that fails for that verb ($3,
    # `sessiond` by default) and runs the real program (kept as a hard link, `cawco.real`) for every other verb.
    # `slow-when-staged` instead holds its `sessiond` verb $3 seconds before running it: a keeper slow to start.
    # Each waits until the agent has put the build on disk (the extracted directory appears whole, by rename) AND
    # says it is installing it: before that the agent runs the staged build itself (`cawco binary-pins`,
    # binary-update.ts #replace), and a file replaced under a process starting from it leaves that process's
    # executable "<path> (deleted)", which its own realpath at load refuses (nightly 2ebcc2a04: binary-pins exited
    # with "ENOENT: no such file or directory, lstat '…/cawco (deleted)'", the attempt failed, and its retry staged
    # the build again, without the stub). From `installing` on, nothing runs the build until the swap: the update
    # helper runs from the build before, and starts a second or so later.
    v="$root/versions/$2"
    state="$root/update-state.json"
    n=0
    until [ -f "$v/cawco" ] && [ -f "$v/release.json" ] && grep -q '"phase":"installing"' "$state" 2> /dev/null &&
      grep -q "\"availableVersion\":\"$2\"" "$state"; do
      n=$((n + 1))
      [ "$n" -lt 30000 ] || exit 1
      sleep 0.02
    done
    [ -f "$v/cawco.real" ] || ln "$v/cawco" "$v/cawco.real"
    if [ "$1" = slow-when-staged ]; then
      printf '#!/bin/sh\n[ "$1" = sessiond ] && sleep %s\nexec "$(dirname "$(readlink -f "$0")")/cawco.real" "$@"\n' "$3" > "$v/cawco.stub"
    else
      printf '#!/bin/sh\n[ "$1" = %s ] && exit 1\nexec "$(dirname "$(readlink -f "$0")")/cawco.real" "$@"\n' "${3:-sessiond}" > "$v/cawco.stub"
    fi
    chmod 700 "$v/cawco.stub"
    mv "$v/cawco.stub" "$v/cawco" ;;
  remove)
    for d in "$root"/versions/*/; do
      if [ -f "${d}cawco.real" ]; then
        mv -f "${d}cawco.real" "${d}cawco"
        restart=1
      fi
    done ;;
esac
systemctl --user daemon-reload
# Services started while a stub was in place run from `cawco.real`, a path that is gone now: a running agent
# could not launch an update helper from it. Restart them (the keeper is not one of them: it runs another build,
# and the checks end its children before this), then wait until the hub answers and its agent holds the keeper.
if [ "${restart:-0}" = 1 ]; then
  systemctl --user restart cawco-hub.service cawco-dashboard.service cawco-agent.service
  cat > /tmp/agent-custody.ts <<'TS'
const rows = (await (await fetch("http://127.0.0.1:3456/api/agents")).json()) as { hostname: string; status: string; custody?: { state?: string } }[];
const row = rows.find((r) => r.hostname === process.env.HOST);
process.exit(row?.status === "online" && row?.custody?.state === "available" ? 0 : 1);
TS
  n=0
  until curl -fsS --max-time 5 http://127.0.0.1:3456/health > /dev/null 2>&1 &&
    HOST="$(hostname)" BUN_BE_BUN=1 "$HOME/.cawco-proof/run" /tmp/agent-custody.ts 2> /dev/null; do
    n=$((n + 1))
    [ "$n" -lt 240 ] || { echo "after the stub was removed the hub or its agent did not come back"; exit 1; }
    sleep 0.5
  done
fi
EOF
# Signs a machine in to the CawCo account $1 the way `claude auth login` in that account's dir leaves it: the dir
# ~/.cawco/accounts/$1/claude holding a credential (Linux keeps it in .credentials.json) and the account's
# oauthAccount in the dir's own .claude.json. The token is fake; the installed Claude Code's `auth status` reads the
# dir as signed in without asking anyone, which is all a proof machine's sessions (a held `sleep`) need.
cat > "$dir/account-dir.sh" <<'EOF'
set -eu
dir="$HOME/.cawco/accounts/$1/claude"
mkdir -p -m 700 "$dir"
umask 077
printf '{"claudeAiOauth":{"accessToken":"sk-ant-oat01-proof-not-a-token","refreshToken":"sk-ant-ort01-proof-not-a-token","expiresAt":4102444800000,"scopes":["user:inference","user:profile"],"subscriptionType":"max"}}\n' > "$dir/.credentials.json"
printf '{"oauthAccount":{"accountUuid":"00000000-0000-4000-8000-000000000001","emailAddress":"proof@cawco.test","organizationUuid":"00000000-0000-4000-8000-000000000002","organizationName":"CawCo proof","organizationRole":"admin"}}\n' > "$dir/.claude.json"
EOF
# The machine's Claude Code as a loaded host's answers: the one its installer placed, answering `--version` and
# `auth status` $1 seconds late (0: at once), then running as itself. The first call puts the stand-in in the
# launcher's place, ~/.local/bin/claude, where the agent finds it on its PATH (auth.ts resolveClaudeExecutable), and
# moves the installer's link aside to ~/.local/bin/.claude-installed; every call sets how late. A late call that is
# ended at its caller's bound (SIGTERM, Bun.spawn's `timeout`) ends its wait with it, as a CLI killed mid-answer does.
# Each late call is a line of ~/.cawco-proof/claude-calls.log: `<epoch ms> start|answered|cut <pid> <args>`.
cat > "$dir/claude-late.sh" <<'EOF'
set -eu
mkdir -p "$HOME/.cawco-proof"
bin="$HOME/.local/bin/claude"
kept="$HOME/.local/bin/.claude-installed"
if [ ! -e "$kept" ]; then
  mv "$bin" "$kept"
  cat > "$bin.new" <<'SH'
#!/bin/sh
late=$(cat "$HOME/.cawco-proof/claude-late" 2> /dev/null || echo 0)
log="$HOME/.cawco-proof/claude-calls.log"
case " $* " in
  *" --version "*|*" auth status "*)
    if [ "${late:-0}" -gt 0 ]; then
      echo "$(date +%s%3N) start $$ $*" >> "$log"
      trap 'echo "$(date +%s%3N) cut $$ $*" >> "$log"; kill "$nap" 2> /dev/null; exit 143' TERM INT
      sleep "$late" &
      nap=$!
      wait "$nap"
      trap - TERM INT
      echo "$(date +%s%3N) answered $$ $*" >> "$log"
    fi ;;
esac
exec "$HOME/.local/bin/.claude-installed" "$@"
SH
  chmod 755 "$bin.new"
  mv "$bin.new" "$bin"
fi
echo "$1" > "$HOME/.cawco-proof/claude-late"
EOF
# What a page a session previews answers (sshadd): one HTTP response naming the machine it runs on, for socat's
# SYSTEM to run per connection.
cat > "$dir/preview-answer.sh" <<'EOF'
printf 'HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\npreview of %s\n' "$(hostname)"
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
  for f in "${w}boundary.json" "$w"retiring-*.json; do
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
  command -v flock > /dev/null || { echo "flock (util-linux) is needed: one proof at a time builds into the image store" >&2; exit 2; }
  trap 'rm -f "$TMPDIR"' EXIT
  write_images || exit 1
  if [[ -n $TAGS_ONLY ]]; then
    for name in host machine bare; do echo "$name=$(proof_image_tag "$out/images" "$name")"; done
    exit 0
  fi
  proof_images "$out/images" host machine bare || { echo "the images failed to build" >&2; exit 1; }
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
# This rig's own podman instance, reading images from the proof cache's store.
P=$(podman_instance "$RIG-$$" "$rigdir/storage" "$PROOF_STORE")
export P
export prefix="cawco-proof-$RIG-$$"
export net="$prefix-net" hubc="$prefix-hub" joinerc="$prefix-joiner" freshc="$prefix-fresh" releasec="$prefix-release"
export sshrootc="$prefix-sshroot" sshuserc="$prefix-sshuser"
subnet="10.231.$((10 + RIG_NUMBER))"
export release_ip=$subnet.2 hub_ip=$subnet.3 joiner_ip=$subnet.4 fresh_ip=$subnet.5 sshroot_ip=$subnet.6 sshuser_ip=$subnet.7
# The hub's first preview port, its port's next (hub config.ts PREVIEW_PORTS, no CAWCO_PREVIEW_PORTS here), and the
# host-mode name its Settings save checks resolves (preview.ts probePattern): the rig's network has no DNS, so the hub
# machine's hosts file answers it as localtest.me's public DNS does, 127.0.0.1 ("The entire domain name
# localtest.me—and all wildcard entries—point to 127.0.0.1", weblogs.asp.net/owscott/introducing-testing-domain-localtest-me).
export preview_first=3457 preview_name="p-3457.localtest.me"
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
  $P rm -f -t 0 "$hubc" "$joinerc" "$freshc" "$sshrootc" "$sshuserc" "$releasec" > /dev/null 2>&1 || true
  $P network rm -f "$net" > /dev/null 2>&1 || true
  podman_instance_gone "$RIG-$$" "$rigdir/storage" || { echo "rig $RIG: its cleanup failed: something it started may still be running"; (( rc != 0 )) || rc=1; }
  exit "$rc"
}
trap rig_done EXIT
trap 'trap "" INT TERM; exit 130' INT
trap 'trap "" INT TERM; exit 143' TERM

# ---------------------------------------------------------------- helpers

# Setup steps stop the rig: a check run against a machine that was never set up proves nothing. The orchestrator
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
  for c in "$hubc" "$joinerc" "$freshc" "$sshrootc" "$sshuserc"; do
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
  for c in "$hubc" "$joinerc" "$freshc" "$sshrootc" "$sshuserc"; do
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
# loop's list meant for something else (the across check's listener tree, rig 06ef5d1ac run 6; survived's list, run-4).
as_user() { user_exec "" "$@"; }
# An executable written as the unprivileged user: standard input, to the path $2 on machine $1. The one command handed
# its caller's stdin.
put_executable() { user_exec -i "$1" sh -c 'cat > "$1" && chmod 755 "$1"' sh "$2"; }
user_exec() {
  local stdin=$1 c=$2
  shift 2
  $P exec ${stdin:+"$stdin"} --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="${FEED_OVERRIDE:-$feed}" "$c" "$@"
}
# The proof's own scripts (/shared/*.ts) run as Bun on machine $1 through PROOF_RUNNER, a hard link to the build the
# machine was installed with, made as it is installed (proof_runner). Never through ~/.local/bin/cawco: from there a
# script is a live process of the build `current` names, and the product keeps on disk every build a live process runs
# (core live-processes.ts `versionsInUse`), so a script that ran through an update held the build before. Nightly
# d0ca43009, handover: the sender started on 0.0.1-test.2 kept it after the hub's machine had moved on, and the wait
# for its removal timed out.
PROOF_RUNNER=/home/cawco/.cawco-proof/run
proof_runner() { as_user "$1" sh -c 'mkdir -p "${1%/*}" && ln -f "$(readlink -f "$HOME/.local/bin/cawco")" "$1"' sh "$PROOF_RUNNER"; }
run_script() { local c=$1; shift; as_user "$c" env BUN_BE_BUN=1 "$PROOF_RUNNER" "$@"; }
need_hub() {
  as_user "$hubc" curl -fsS --max-time 10 http://127.0.0.1:3456/health > /dev/null 2>&1 || { echo "the hub is not answering"; return 1; }
}
hub_api() { as_user "$hubc" curl -fsS "http://127.0.0.1:3456$1" "${@:2}"; }
api_on() { local c=$1; shift; as_user "$c" curl -fsS "http://127.0.0.1:3456$1" "${@:2}"; }
# The host's clock in epoch ms, from bash itself: EPOCHREALTIME is `<seconds>.<microseconds>` (bash(1): "with
# microsecond granularity"). Not `date +%s%3N`: the host's date may be uutils', which ignores the width and prints all
# nine digits (uutils coreutils 0.8.0: `date +%s%3N` gave 1792174810928789424), and a 19-digit time compared with the
# machines' 13-digit stamps read every one of them as before it (nightly 90bdbf7b9: "no late read of the machine's
# account ended after its update began", "0 calls went through the hook … after the update was installed").
now_ms() { local t=${EPOCHREALTIME/[.,]/}; echo $(( 10#$t / 1000 )); }
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
# stage2-during-install.ts); its output goes to the file, ending with a `done` line.
watch_install() {
  local container=$1 hub=$2 machine=$3 prefix=$4 file=$5
  : > "$file"
  run_script "$container" /shared/stage2-during-install.ts "$hub" "$machine" "$prefix" > "$file" 2>&1 &
}
# The ids the watcher recorded as accepted while the machine was installing, one per line.
watched_ids() { sed -n 's/^accepted //p' "$1"; }
# Asks the hub, from inside its own container, to start a session on a machine, the way the dashboard does.
start_session() { run_script "$hubc" /shared/stage2-start-session.ts http://127.0.0.1:3456 "$1" "$2"; }
# Keeps asking until the stop file appears. A start is written down only if the hub accepted it while the machine was
# installing, as the hub itself reported before and after.
start_loop() {
  local machine=$1 prefix=$2 accepted=$3 stop=$4 n=0 before after
  : > "$accepted"
  while [[ ! -e "$stop" ]]; do
    n=$((n + 1))
    before=$(phase "$machine" 2> /dev/null || true)
    if start_session "$machine" "$prefix-$n" > /dev/null 2>&1; then
      after=$(phase "$machine" 2> /dev/null || true)
      if [[ $before == installing && $after == installing ]]; then echo "$prefix-$n" >> "$accepted"; fi
    fi
    sleep 0.5
  done
}
# The machine's session keepers (packages/core/src/keepers.ts): each listens on an endpoint of its own beside the
# machine's, sessiond-<build>.sock, and the machine's endpoint sessiond.sock is a symlink naming the current one,
# which every new start goes to.
keeper_list() { as_user "$1" sh -c 'printf "{\"type\":\"list\"}\n" | socat -t1 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock | head -n 1'; }
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
stop_session() { run_script "$hubc" /shared/stage2-stop-session.ts http://127.0.0.1:3456 "$1" "$2"; }
untouched() { as_user "$1" sh -c 'test ! -e "$HOME/.local/share/cawco" && test ! -e "$HOME/.local/bin/cawco" && echo untouched'; }
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
# Ends every process every keeper on the machine holds.
end_all_sessions() {
  local pid
  for pid in $(keeper_lists "$1" | jsonl "d => d.flatMap(k => k.procs).filter(p => p.alive).map(p => p.pid).join(' ')"); do
    as_user "$1" kill "$pid"
  done
}
keeper_dropin() { as_user "$hubc" sh /shared/keeper-dropin.sh "$@"; }
keeper_link() { as_user "$1" readlink /home/cawco/.local/share/cawco/binary/keeper; }
current_link() { as_user "$1" readlink /home/cawco/.local/share/cawco/binary/current; }
has_file() { as_user "$1" test -e "/home/cawco/.local/share/cawco/binary/$2"; }
has_version() { as_user "$1" test -d "/home/cawco/.local/share/cawco/binary/versions/$2"; }
install_order() { as_user "$1" sh -c 'cat /home/cawco/.local/share/cawco/binary/install-order.json 2> /dev/null || true' | json "d => d.join(' ')"; }
custody_of() { hub_api /api/agents | json "d => d.find(a => a.machineId === '$1')?.custody?.state"; }
apply_log_count() { as_user "$hubc" sh -c "grep -c '$1' /home/cawco/.local/share/cawco/binary/apply.log || true"; }
# The machine has an IPv6 loopback (`::1` on lo), as the installer judges before it names [::1] in the dashboard socket.
has_ipv6_loopback() { as_user "$1" grep -q '^00000000000000000000000000000001 ' /proc/net/if_inet6; }
# A keeper that exits before it answers did not start: the handover gives it up at its first exit, not after systemd
# has started it again every RestartSec= while the handover waited (run-3: build 6's keeper started every 2 s from
# 23:08:31 until the handover gave up at 23:09:16).
started_at_most_twice() {
  local n
  n=$(as_user "$1" sh -c "journalctl --user --no-pager -o cat -u '$2' | grep -c '^Started ' || true")
  echo "$2 was started $n times"
  [[ $n -ge 1 && $n -le 2 ]]
}
# Puts a stub on build $1's verb $2 (sessiond: its keeper cannot start) the moment the update stages it, in the background.
stub_when_staged() { as_user "$hubc" sh -c 'rm -f /tmp/stub.done; sh /shared/keeper-dropin.sh "$1" "$2" "$3" && touch /tmp/stub.done' _ "$@" > /dev/null 2>&1 & }
# No update pass of the machine's is on its way to applying anything: its phase is one a pass ends in. The settings
# answer only once every online machine has been told (hub binary-updates.ts `adopt`), and a pass begun after that
# reads the new policy; one already under way says `installing` to the hub the moment it raises its fence
# (binary-update.ts `#drain` → `#tellHub`), before any helper starts.
settled() { [[ "$(phase "$1")" =~ ^(none|available|installed|failed|failed-rolled-back|waiting-for-channel|waiting-sessions)$ ]]; }
export PROOF_RUNNER
export -f diagnose as_user put_executable user_exec proof_runner run_script need_hub hub_api api_on now_ms json jsonl machine_id build_version phase field retiring kept_of update_row plant_in_unit wait_until use_feed \
  put_policy learn install_now_request spawn_child watch_install watched_ids start_session start_loop keeper_list keeper_lists \
  child_pids children_with children_total holder_of current_endpoint endpoint_of unit_of current_unit session_running \
  start_before survived starts_said accepted_ran_once keeper_pid stop_session untouched on_exit pids_under end_children \
  end_all_sessions keeper_dropin keeper_link current_link has_file has_version install_order custody_of apply_log_count \
  has_ipv6_loopback started_at_most_twice stub_when_staged settled

# ---------------------------------------------------------------- a rig's machines

# boot CONTAINER IP HOSTNAME [linger|nolinger] [EXTRA PODMAN RUN OPTION...]
# Each machine holds 65,536 tasks (see the machine image above), and is a real systemd machine, of the machine image
# or the one BOOT_IMAGE names.
boot() {
  local c=$1 ip=$2 name=$3 linger=${4:-linger} t0=$SECONDS created up
  shift $(( $# < 4 ? $# : 4 ))
  $P run -d --name "$c" --hostname "$name" --systemd=always --pids-limit=65536 --network "$net" --ip "$ip" \
    --mount "type=bind,src=$out/shared,dst=/shared,ro" "$@" "${BOOT_IMAGE:-$MACHINE_IMAGE}" /sbin/init > /dev/null
  created=$((SECONDS - t0))
  wait_until 90 "[[ \$($P exec $c systemctl is-system-running 2>/dev/null) =~ ^(running|degraded)\$ ]]"
  up=$((SECONDS - t0))
  # Each machine's boot in its parts, for the rig's log: the container made and started (its root file system laid
  # down), systemd running in it, and its user's bus; and the inotify instances it holds (INOTIFY_PER_MACHINE).
  if [[ $linger == nolinger ]]; then
    echo "boot $name: container ${created}s, systemd running at ${up}s, inotify $(inotify_on "$c"), load $(cut -d' ' -f1-3 /proc/loadavg)"
    return 0
  fi
  $P exec "$c" loginctl enable-linger cawco
  wait_until 60 "$P exec $c test -S /run/user/1000/bus"
  echo "boot $name: container ${created}s, systemd running at ${up}s, user bus at $((SECONDS - t0))s, inotify $(inotify_on "$c"), load $(cut -d' ' -f1-3 /proc/loadavg)"
}
# The inotify instances every process of a machine holds, read as its root, who reads every process's descriptors.
inotify_on() { $P exec "$1" sh -c "find /proc/[0-9]*/fd -lname 'anon_inode:inotify' 2> /dev/null | wc -l"; }
export -f boot inotify_on
# The network, the release host serving this rig's release folder, and the machines it names (hub, joiner, fresh),
# booted at once. The joined machine opens a delegate workspace in the workspace rig, whose srt boundary is a bwrap
# sandbox with its own pid namespace and a fresh /proc. The kernel refuses that /proc mount in a user namespace while
# the /proc it can see has paths masked or bound read-only over it, which podman does by default ("bwrap: Can't mount
# proc on /newroot/proc: Operation not permitted"; github.com/containers/bubblewrap/issues/505: "The fix was to add
# --security-opt unmask=ALL"). Unmasking only stops hiding those /proc and /sys paths: the container is rootless, so
# its root is the host user and reads nothing that user cannot; it gains no capability, and it sits on the internal
# network with no route out.
machines() {
  local role pids=() rc=0 pid
  # The orchestrator started this rig for the machines RIG_MACHINES names: what it holds of the inotify room.
  (( $# == RIG_MACHINE_COUNT )) || { echo "rig $RIG boots $# machine(s), and RIG_MACHINES names $RIG_MACHINE_COUNT: correct RIG_MACHINES"; return 1; }
  $P network create --internal --subnet "$subnet.0/24" "$net" > /dev/null || return 1
  $P run -d --name "$releasec" --network "$net" --ip "$release_ip" \
    --mount "type=bind,src=$rigdir/release,dst=/srv/release,ro" "$HOST_IMAGE" \
    python3 -m http.server 8000 --directory /srv/release --bind "$release_ip" > /dev/null || return 1
  for role in "$@"; do
    case $role in
      hub) boot "$hubc" "$hub_ip" hub linger --add-host "$preview_name:127.0.0.1" & ;;
      joiner) boot "$joinerc" "$joiner_ip" joiner linger --security-opt unmask=ALL & ;;
      # The joined machine as a bare server is (the bare image): no bubblewrap, socat or git.
      bare) BOOT_IMAGE=$BARE_IMAGE boot "$joinerc" "$joiner_ip" joiner linger --security-opt unmask=ALL & ;;
      fresh) boot "$freshc" "$fresh_ip" fresh nolinger & ;;
      # A machine the hub adds over SSH: its sshd serves root and the user, by key; the installer turns lingering on
      # for root itself, and the user's is on as a person's own machine has it.
      sshroot) boot "$sshrootc" "$sshroot_ip" sshroot nolinger & ;;
      sshuser) boot "$sshuserc" "$sshuser_ip" sshuser linger & ;;
    esac
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
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
  proof_runner "$hubc"
}
join_machine() {
  need_hub
  # The hub's own install.sh, the way the app's Connect a machine hands it out; pexpect types an "n" after each prompt appears.
  as_user "$joinerc" curl -fsS "http://$hub_ip:3456/install.sh" -o /tmp/join.sh
  local rc=0
  python3 "$here/stage2-answer-prompts.py" $P exec -it --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="${FEED_OVERRIDE:-$feed}" "$joinerc" sh /tmp/join.sh > "$rigdir/join.out" || rc=$?
  cat "$rigdir/join.out"
  [[ $rc == 0 ]]
  grep -qE 'prompts answered: [1-9]' "$rigdir/join.out"
  [[ "$(hub_api /api/agents | json 'd => d.filter(a => a.status === "online").length')" == 2 ]]
  proof_runner "$joinerc"
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
  if [[ " $roles " == *" joiner "* || " $roles " == *" bare "* ]]; then
    setup "join the second machine to the hub" join_machine
    export jid
    jid=$(machine_id joiner)
  fi
  [[ -z $signed ]] || setup "sign in $signed to a CawCo account" sign_in $signed
}
export -f check_hub_dashboard_3455 install_hub join_machine signed_in_on new_account sign_in

# ---------------------------------------------------------------- the person's side of an update, its stand-ins slow
# What reached the person through updates on 2026-10-16, which no rig saw while its stand-ins were fast: a message
# sent while the machine updated was refused inside the hub's reconnect window; a reattach gave up on a keeper slow to
# list ("no keeper that answered holds …") and failed an item; a workspace's judge stayed down; a timed-out
# `claude auth status` read the machine's account as signed out. Each is a check of its own, reading what the
# update's check left in $rigdir/outcomes-*, so each says its own verdict whatever the update's check said.
#
# update_outcomes_start CONTAINER MACHINE SESSION [nosends], called by the update's check before the update is asked
# for, on the machine that updates and a session running there (its pid kept): from then the machine's Claude Code
# answers `--version` and `auth status` CLAUDE_LATE_S late (claude-late.sh), what the hub says of the machine's
# sign-in is sampled every second, and,
# unless `nosends`, a message goes to the session every 3 s (stage2-sends.ts), through the update and the hub's own
# restarts, until update_sends_stop. Sampling and sending run on in the background past the check that started them;
# the checks below end them.
# Fails when the hub does not answer. Not a pipe from hub_api: a check's shell has no pipefail (`bash -eEx -c`), and
# `json` reads no input as no value, so a hub that was away read as `none` (nightly d0ca43009: handover's one `none`
# at 19:18:38.920, the hub's helper "the hub does not answer" at 19:18:38.778, its restart in the update).
signin_state() {
  local accounts
  accounts=$(hub_api /api/accounts) || return 1
  json "d => d.signins.find(s => s.accountId === '$1' && s.machineId === '$2')?.state" <<< "$accounts"
}
# `<epoch ms> <state>` every second until the stop file is there; `hub-away` while the hub does not answer.
signin_sampler() {
  local machine=$1 file=$2 stop=$3 aid state
  aid=$(cat "$rigdir/account-id")
  while [[ ! -e $stop ]]; do
    state=$(signin_state "$aid" "$machine" 2> /dev/null) || state=hub-away
    echo "$(now_ms) ${state:-none}" >> "$file"
    sleep 1
  done
}
claude_late() { as_user "$1" sh /shared/claude-late.sh "$2"; }
claude_calls() { as_user "$1" sh -c 'cat "$HOME/.cawco-proof/claude-calls.log" 2> /dev/null || true'; }
# The late `auth status` reads of machine $1's Claude Code that have ended since $2 (epoch ms): answered, or `cut` by
# their caller at its bound.
auth_reads_ended_since() { claude_calls "$1" | awk -v since="$2" '$1 >= since && ($2 == "cut" || $2 == "answered") && / auth status /' | wc -l; }
# When the last late `auth status` read of machine $1's Claude Code ended (epoch ms), 0 before any.
auth_read_last_ended() { claude_calls "$1" | awk '($2 == "cut" || $2 == "answered") && / auth status / { t = $1 } END { print t + 0 }'; }
# Every message a session's turn took on machine $1, whichever agent took it (proof-harnesses.ts `tookTurn`):
# `<epoch ms> <instanceId> <uuid> <words>`. The hub's transcript is no record of it across a hub restart.
turns_on() { as_user "$1" sh -c 'cat "$HOME/.cawco-proof/turns.log" 2> /dev/null || true'; }
# How many turns of session $2 took the words $3, in the turns text $1.
turns_of() { awk -v id="$2" -v words="$3" '$2 == id && $4 == words' <<< "$1" | wc -l; }
# Every one of the words given ($3…) has reached session $2 on machine $1.
all_reached() {
  local c=$1 session=$2 text words
  shift 2
  text=$(turns_on "$c")
  for words in "$@"; do
    (( $(turns_of "$text" "$session" "$words") >= 1 )) || return 1
  done
}
update_outcomes_start() {
  local c=$1 machine=$2 session=$3 sends=${4:-sends}
  [[ -n $c && -n $machine && -n $session ]]
  echo "$session $(child_pids "$c" "$session")" > "$rigdir/outcomes-session.txt"
  [[ "$(cut -d' ' -f2 "$rigdir/outcomes-session.txt")" =~ ^[0-9]+$ ]] || { echo "the session $session holds no one process: $(cat "$rigdir/outcomes-session.txt")"; return 1; }
  echo "$c $machine $session $(now_ms) $sends" > "$rigdir/outcomes-of"
  claude_late "$c" "$CLAUDE_LATE_S"
  rm -f "$rigdir/outcomes-signin.stop"
  : > "$rigdir/outcomes-signin.txt"
  signin_sampler "$machine" "$rigdir/outcomes-signin.txt" "$rigdir/outcomes-signin.stop" < /dev/null > /dev/null 2>&1 &
  [[ $sends != nosends ]] || return 0
  as_user "$hubc" rm -f /tmp/outcomes-sends.stop
  # The file holds the sender's own words and nothing of the check's: its trace (-x) is off in the subshell before the
  # redirection, or every helper line it traced reads as a message the hub did not take (nightly 90bdbf7b9: all 13
  # sends "accepted", and the check failed on "+ [as_user:0] user_exec …").
  ( set +x; run_script "$hubc" /shared/stage2-sends.ts http://127.0.0.1:3456 \
    "$machine" "$session" "$session-midupdate" /tmp/outcomes-sends.stop > "$rigdir/outcomes-sends.txt" 2>&1 ) &
  wait_until 30 'grep -qE "^[0-9]+ " "$rigdir/outcomes-sends.txt"'
}
# No message goes after this; the last one sent has had its answer or its 120 s.
update_sends_stop() {
  [[ -s "$rigdir/outcomes-sends.txt" ]] || return 0
  grep -q '^done ' "$rigdir/outcomes-sends.txt" && return 0
  as_user "$hubc" touch /tmp/outcomes-sends.stop
  wait_until 150 'grep -q "^done " "$rigdir/outcomes-sends.txt"'
}
# Every message sent to the session while its machine updated, the hub restarting among it, was taken by the hub and
# answered once by the session once the machine was back: none refused, none lost, none twice.
update_sends_delivered() {
  local c session sends taken words n missing="" twice="" text untaken
  [[ -s "$rigdir/outcomes-of" ]] || { echo "ASSERTION FAILED: the update's check ended before any message was sent"; return 1; }
  read -r c _ session _ sends < "$rigdir/outcomes-of"
  [[ $sends != nosends ]]
  update_sends_stop
  echo "== the messages sent to $session while its machine updated (<epoch ms> <words> <outcome> <tries>)"
  cat "$rigdir/outcomes-sends.txt"
  untaken=$(grep -vE '^[0-9]+ [^ ]+ accepted [0-9]+$|^done sent=' "$rigdir/outcomes-sends.txt" || true)
  [[ -z $untaken ]] || { echo "ASSERTION FAILED: the hub did not take these messages, sent while the machine updated:"; echo "$untaken"; return 1; }
  taken=$(awk '$3 == "accepted" { print $2 }' "$rigdir/outcomes-sends.txt")
  (( $(wc -w <<< "$taken") >= 3 )) || { echo "ASSERTION FAILED: fewer than 3 messages went while the machine updated"; return 1; }
  # shellcheck disable=SC2086
  if ! wait_until 180 'all_reached "$c" "$session" $taken'; then
    text=$(turns_on "$c")
    for words in $taken; do
      (( $(turns_of "$text" "$session" "$words") >= 1 )) || missing+=" $words"
    done
    echo "ASSERTION FAILED: these messages, taken by the hub while the machine updated, never reached the session:$missing"
    return 1
  fi
  text=$(turns_on "$c")
  for words in $taken; do
    n=$(turns_of "$text" "$session" "$words")
    (( n == 1 )) || twice+=" $words ($n turns)"
  done
  [[ -z $twice ]] || { echo "ASSERTION FAILED: these messages reached the session more than once:$twice"; return 1; }
  echo "$(wc -w <<< "$taken") messages sent while the machine updated, each taken by one turn of the session"
}
# The machine's Claude account read signed in all through its update, though its Claude Code answered `auth status`
# CLAUDE_LATE_S late, past the agent's 20 s bound on it (accounts.ts `authStatusIn`): from before the update until a
# late read of it had ended (cut at the bound, or answered under a longer one) and 15 s past the last read that ended
# (the agent's report follows its reads within 2 s, slow-harness-cli.ts), the hub said signed-in at every sample it
# answered. The 15 s run from the last read, not the first: the agent reads each minute (a sixth of one here, the
# proof's pace), and a fixed wait after the first could end a moment after another read, with no sample of the hub's
# word on it.
update_signin_kept() {
  local c machine since bad last
  [[ -s "$rigdir/outcomes-of" ]] || { echo "ASSERTION FAILED: the update's check ended before the sign-in was watched"; return 1; }
  read -r c machine _ since _ < "$rigdir/outcomes-of"
  on_exit "touch \"\$rigdir/outcomes-signin.stop\"; claude_late $c 0"
  wait_until 300 '(( $(auth_reads_ended_since "$c" "$since") >= 1 ))' \
    || { echo "ASSERTION FAILED: no late read of the machine's account ended after its update began, so none was proven"; claude_calls "$c"; return 1; }
  wait_until 120 'last=$(auth_read_last_ended "$c") && (( $(now_ms) - last >= 15000 ))'
  touch "$rigdir/outcomes-signin.stop"
  echo "== the Claude Code stand-in's late calls (<epoch ms> start|answered|cut <pid> <args>)"
  claude_calls "$c"
  bad=$(awk '$2 != "signed-in" && $2 != "hub-away"' "$rigdir/outcomes-signin.txt")
  echo "the hub's word on the sign-in: $(wc -l < "$rigdir/outcomes-signin.txt") samples since $since, $(awk '$2 == "hub-away"' "$rigdir/outcomes-signin.txt" | wc -l) while the hub was away"
  [[ -z $bad ]] || { echo "ASSERTION FAILED: a read that timed out changed the machine's account: the hub said"; awk '{ print $1, $2 }' <<< "$bad" | uniq -f 1 | head -n 20; return 1; }
  (( $(awk -v t="$last" '$1 > t && $2 == "signed-in"' "$rigdir/outcomes-signin.txt" | wc -l) >= 5 )) \
    || { echo "ASSERTION FAILED: the hub said nothing of the sign-in after the last read that timed out"; return 1; }
}
# The session running on the machine before its update is the same process after it, reattached and running, though
# the keeper holding it, retiring, answers its listing late.
update_session_reattached() {
  local c
  [[ -s "$rigdir/outcomes-of" ]] || { echo "ASSERTION FAILED: the update's check ended before the session was recorded"; return 1; }
  read -r c _ _ _ _ < "$rigdir/outcomes-of"
  need_hub
  cat "$rigdir/outcomes-session.txt"
  survived "$c" "$rigdir/outcomes-session.txt"
}
export -f signin_state signin_sampler claude_late claude_calls auth_reads_ended_since auth_read_last_ended turns_on turns_of all_reached \
  update_outcomes_start update_sends_stop update_sends_delivered update_signin_kept update_session_reattached

# ================================================================ THE RIGS

# A pristine machine installing the hub, and another joining it, is every rig's setup (`fleet`: install_hub,
# join_machine, with their assertions): a nightly whose installer cannot bring up a hub (user units, linger, sudo
# openssl) or whose Connect a machine is broken fails every rig at that step, by name.
# The relay on two computers (the capped rig's first check): the joined machine's agent reaches the hub across the
# rig's network and serves the hub's dashboard on the joined machine's own loopback (agent hub-loopback.ts); the hub's
# own agent, which the hub's register answer names its own computer (`hostsHub`), carries nothing there, where the
# dashboard socket is 3455.
loopback_carried() {
  need_hub
  wait_until 60 'as_user "$joinerc" curl -fsS --max-time 5 http://127.0.0.1:3455/session | grep -q _app/immutable'
  if has_ipv6_loopback "$joinerc"; then
    as_user "$joinerc" curl -fsS --max-time 5 -g 'http://[::1]:3455/session' | grep -q _app/immutable \
      || { echo "ASSERTION FAILED: the joined machine's [::1]:3455 is not the hub's dashboard"; return 1; }
  fi
  local joined own
  joined=$(as_user "$joinerc" sh -c 'journalctl --user --no-pager -o cat -u cawco-agent.service | grep "\[hub loopback\]" || true')
  own=$(as_user "$hubc" sh -c 'journalctl --user --no-pager -o cat -u cawco-agent.service | grep "\[hub loopback\]" || true')
  echo "== the joined machine's agent"; echo "$joined"
  echo "== the hub machine's agent"; echo "$own"
  [[ "$joined" == *"the hub at $hub_ip is served on"*"http://localhost:3455 (its dashboard at :3455)"* ]] \
    || { echo "ASSERTION FAILED: the joined machine's agent says nothing of serving the hub's dashboard at $hub_ip:3455 on localhost:3455"; return 1; }
  [[ "$own" == *"the hub says this is its own computer"* && "$own" != *"is served on"* ]] \
    || { echo "ASSERTION FAILED: the hub machine's agent does not say the hub is its own computer, or serves it"; return 1; }
  # With both agents up, the hub's machine still answers 3455 itself and nothing there took 3000.
  check_hub_dashboard_3455
}
export -f loopback_carried

# ---------------------------------------------------------------- sshadd: Connect a machine › Over SSH, the real way
# The hub adds machines over SSH as the dashboard's dialog does (`POST /api/machines/ssh`, hub join.ts): its own
# connection to the machine, the key it writes there (ssh-tunnels.ts `admit`), the hub's own install.sh fetched
# through its forward, the release from this rig's feed, a real systemd --user install, and the agent joining through
# the forward. One machine is added as root, one as a normal user, each its own container (one machine id each), both
# at once, as the owner added two on 2026-10-22.
# On nightly 4839 a fresh root machine (uwucloud, 2026-10-21) registered with no key and was held for an Admit; after
# the Admit its heartbeats were refused "register first" every 15 s. On 2026-10-22 two machines added over SSH came up
# online and never had their first fleet sync, so every session on them was refused for hours, while this rig stopped
# at "online". So each machine goes on to real work after its add: the fleet's first sync on its disk, a session asked
# for a second after the add said done running, a preview of that session answering through the hub, nothing it asked
# the hub refused, and Install now applied. Each is signed in to a CawCo account before its add (an account dir, and on
# root's machine a Claude Code of root's own), as a person's machine with Claude Code is. Nothing here is a stand-in:
# only the machines are containers, and no address outside the rig's internal network is touched.

# The hub's journal, whole, or since epoch seconds $1.
hub_journal() { as_user "$hubc" sh -c "journalctl --user --no-pager -o cat -u cawco-hub.service ${1:+--since @$1} ${2:+--until @$2} || true"; }
# The hub's SSH key, made for the hub's user, written for root on sshroot and for the user on sshuser.
ssh_trust() {
  as_user "$hubc" sh -c 'mkdir -p -m 700 ~/.ssh && [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N "" -C cawco-proof-hub -f ~/.ssh/id_ed25519'
  local pub
  pub=$(as_user "$hubc" cat /home/cawco/.ssh/id_ed25519.pub)
  [[ -n $pub ]]
  $P exec "$sshrootc" sh -c 'mkdir -p -m 700 /root/.ssh && printf "%s\n" "$1" >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys' sh "$pub"
  $P exec --user cawco "$sshuserc" sh -c 'mkdir -p -m 700 /home/cawco/.ssh && printf "%s\n" "$1" >> /home/cawco/.ssh/authorized_keys && chmod 600 /home/cawco/.ssh/authorized_keys' sh "$pub"
  # Root's Claude Code where the official installer puts a user's (~/.local/bin, which the agent looks in, tools.ts
  # `toolPath`): the image's, installed for the user, so a session can start on the machine added as root too.
  $P exec "$sshrootc" sh -c 'mkdir -p /root/.local/bin && ln -sf "$(readlink -f /home/cawco/.local/bin/claude)" /root/.local/bin/claude && /root/.local/bin/claude --version'
  local c
  for c in "$sshrootc" "$sshuserc"; do
    $P exec "$c" sh -c 'systemctl enable --now ssh.service 2> /dev/null || systemctl start ssh.socket'
  done
  # The hub's user signs in to each by key, as the add will.
  wait_until 60 'as_user "$hubc" ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@$sshroot_ip" true'
  wait_until 60 'as_user "$hubc" ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "cawco@$sshuser_ip" true'
  # Neither machine has CawCo yet.
  if $P exec "$sshrootc" test -e /root/.local/share/cawco; then echo "ASSERTION FAILED: root on sshroot has CawCo before the add"; return 1; fi
  [[ "$(untouched "$sshuserc")" == untouched ]]
}
# A command on SSH machine $1 as the user CawCo is added for there ($2: root, or the user), in that user's session.
as_added() {
  local c=$1 user=$2
  shift 2
  if [[ $user == root ]]; then
    $P exec --user root --workdir /root --env HOME=/root --env XDG_RUNTIME_DIR=/run/user/0 \
      --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus "$c" "$@"
  else
    as_user "$c" "$@"
  fi
}
# The agent's journal on SSH machine $1 for user $2, whole or since epoch seconds $3.
added_agent_journal() { as_added "$1" "$2" sh -c "journalctl --user --no-pager -o cat -u cawco-agent.service ${3:+--since @$3} || true"; }
# Both machines signed in before their adds, as a person's machine with Claude Code is: an account dir of the rig's
# CawCo account (account-dir.sh) in the home of the user CawCo is added for (root's Claude Code is ssh_trust's).
ssh_sign_in_before() {
  need_hub
  local aid
  new_account
  aid=$(cat "$rigdir/account-id")
  as_added "$sshrootc" root sh /shared/account-dir.sh "$aid"
  as_added "$sshuserc" cawco sh /shared/account-dir.sh "$aid"
}
# Runs function $1 for both SSH machines at once, root's (`$sshrootc sshroot root $sshroot_ip /root`) and the user's
# (`$sshuserc sshuser cawco $sshuser_ip /home/cawco`), each in a subshell of its own with the check's -e and trace;
# then says each one's output and exit status, and fails when either failed.
on_both() {
  local fn=$1 root user rc_root=0 rc_user=0
  ( "$fn" "$sshrootc" sshroot root "$sshroot_ip" /root ) > "$rigdir/$fn-sshroot.out" 2>&1 &
  root=$!
  ( "$fn" "$sshuserc" sshuser cawco "$sshuser_ip" /home/cawco ) > "$rigdir/$fn-sshuser.out" 2>&1 &
  user=$!
  wait "$root" || rc_root=$?
  wait "$user" || rc_user=$?
  echo "======== root on sshroot: exit $rc_root"
  cat "$rigdir/$fn-sshroot.out"
  echo "======== the user on sshuser: exit $rc_user"
  cat "$rigdir/$fn-sshuser.out"
  (( rc_root == 0 && rc_user == 0 ))
}
# When the hub last took a frame of machine $2 as its registered connection's, in epoch ms: its row's lastSeenAt, which
# every heartbeat the hub takes moves (db.ts touchAgent), read through the API function $1 (hub_api, or owner_api
# once the hub requires paired devices).
last_seen() { "$1" /api/agents | json "d => { const a = d.find(r => r.machineId === '$2'); return a?.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0; }"; }
# Two heartbeats of machine $2 taken after epoch ms $3, read through $1: its lastSeenAt moved past $3, then past that
# again. Each comes within the agent's beat (15 s); 60 s for each is the ceiling.
two_beats_taken() {
  local api=$1 id=$2 after=$3 first
  wait_until 60 '(( $(last_seen "$api" "$id") > after ))' || { echo "ASSERTION FAILED: the hub took no heartbeat of $id within 60 s"; return 1; }
  first=$(last_seen "$api" "$id")
  wait_until 60 '(( $(last_seen "$api" "$id") > first ))' || { echo "ASSERTION FAILED: the hub took no second heartbeat of $id within 60 s of its first"; return 1; }
  echo "two heartbeats of $id taken, the last at $(last_seen "$api" "$id")"
}
# Asks for a session on machine $2 one second after epoch ms $1, the person's next step once an add says done; what
# the hub answered is kept in $rigdir/ssh-start-$3.txt (`rc <exit> at <epoch ms>`, then its words), for
# ssh_session_ran.
ssh_start_after() {
  local left rc=0 said
  left=$(( $1 + 1000 - $(now_ms) ))
  (( left <= 0 )) || sleep "$(( left / 1000 )).$(printf '%03d' $(( left % 1000 )))"
  said=$(start_session "$2" "sshadd-$3-1" 2>&1) || rc=$?
  printf 'rc %s at %s\n%s\n' "$rc" "$(now_ms)" "$said" > "$rigdir/ssh-start-$3.txt"
}
# What a failed SSH add check is read by: the add's lines, the hub's journal, and on the machine its agent's journal
# and where its key is.
ssh_add_said() {
  local c=$1 user=$2 job=$3
  echo "== the add"; hub_api "/api/machines/ssh/$job" || true; echo
  echo "== the hub's journal (last 120)"; hub_journal | tail -n 120
  echo "== the machine's agent journal and key ($user)"
  if [[ $user == root ]]; then
    $P exec "$c" sh -c 'XDG_RUNTIME_DIR=/run/user/0 journalctl --user --no-pager -o cat -n 80 -u cawco-agent.service; ls -la /root/.config/cawco 2>&1; systemctl --user -M root@ show -p Environment cawco-agent.service 2>&1 | head -c 600' || true
  else
    as_user "$c" sh -c 'journalctl --user --no-pager -o cat -n 80 -u cawco-agent.service; ls -la ~/.config/cawco 2>&1' || true
  fi
}
# Adds `user@ip` (machine container $1, hostname $2, user $3, address $4) over SSH and waits for the add to end; then:
# done, and a second later a session asked for on the machine (ssh_start_after); no Admit asked of anyone (no "waits
# to be admitted", no row), the machine online, its first register proved the add's key (no hold at all), and two of
# its heartbeats taken, none refused.
ssh_add_joins() {
  local c=$1 name=$2 user=$3 ip=$4 since job state id refused rows done_ms
  need_hub
  since=$(date +%s)
  job=$(hub_api /api/machines/ssh -X POST -H 'content-type: application/json' -d "{\"target\":\"$user@$ip\"}" | json 'd => d.id')
  [[ -n $job ]]
  echo "$job" > "$rigdir/ssh-add-$name.job"
  # A second add of the same target while this one runs is refused, naming it, and nothing new starts.
  local again
  again=$(as_user "$hubc" curl -sS -o /dev/null -D - -X POST -H 'content-type: application/json' -d "{\"target\":\"$user@$ip\"}" http://127.0.0.1:3456/api/machines/ssh | tr -d '\r')
  grep -q '^HTTP/[0-9.]* 409' <<< "$again" || { echo "ASSERTION FAILED: a second add of $user@$ip while one ran answered: $(head -n 1 <<< "$again")"; return 1; }
  grep -qi "^x-cawco-ssh-add: $job\$" <<< "$again" || { echo "ASSERTION FAILED: the refusal does not name the running add $job: $again"; return 1; }
  wait_until 900 '[[ "$(hub_api /api/machines/ssh/'"$job"' | json "d => d.state")" != running ]]' || { ssh_add_said "$c" "$user" "$job"; return 1; }
  state=$(hub_api "/api/machines/ssh/$job" | json 'd => d.state')
  [[ $state == done ]] || { echo "ASSERTION FAILED: the SSH add of $user@$ip ended $state"; ssh_add_said "$c" "$user" "$job"; return 1; }
  done_ms=$(now_ms)
  id=$(machine_id "$name")
  [[ -n $id ]] || { echo "ASSERTION FAILED: no machine named $name on the hub"; ssh_add_said "$c" "$user" "$job"; return 1; }
  echo "$id" > "$rigdir/ssh-id-$name"
  ssh_start_after "$done_ms" "$id" "$name"
  if hub_journal "$since" | grep -F "machine $id (" | grep -q "waits to be admitted"; then
    echo "ASSERTION FAILED: the hub held $user@$ip for an Admit"; ssh_add_said "$c" "$user" "$job"; return 1
  fi
  rows=$(hub_api /api/machines/waiting | json 'd => d.length')
  [[ $rows == 0 ]] || { echo "ASSERTION FAILED: $rows machine(s) wait to be admitted: $(hub_api /api/machines/waiting)"; return 1; }
  [[ "$(hub_api "/api/agents/$id" | json 'd => d.status')" == online ]] || { echo "ASSERTION FAILED: $name is not online"; ssh_add_said "$c" "$user" "$job"; return 1; }
  if hub_journal "$since" | grep -F "machine $id (" | grep -q "held, unlisted"; then
    echo "ASSERTION FAILED: $name's agent registered without the add's key and was held for the add (no Admit row, but its first register proved nothing)"
    ssh_add_said "$c" "$user" "$job"; return 1
  fi
  two_beats_taken hub_api "$id" "$done_ms" || { hub_journal "$since" | grep -F "$id" | tail -n 20; return 1; }
  refused=$(hub_journal "$since" | grep -cF "not machine $id's registered one" || true)
  [[ $refused == 0 ]] || { echo "ASSERTION FAILED: $refused of $name's frames were refused \"register first\""; hub_journal "$since" | grep -F "$id" | tail -n 20; return 1; }
  [[ "$(hub_api "/api/agents/$id" | json 'd => d.status')" == online ]]
}
ssh_adds_at_once() {
  need_hub
  date +%s > "$rigdir/ssh-adds-since"
  on_both ssh_add_joins
}
# Whether machine $1's user $2 has heard the fleet's denials: its sidecar $3 holds a deniedTools list.
fleet_denials_known() { [[ "$(as_added "$1" "$2" sh -c 'cat "$1" 2> /dev/null || true' sh "$3" | json 'd => Array.isArray(d.deniedTools)')" == true ]]; }
# The fleet's first sync reached the added machine. Its install recorded the hub it joined as the address its agent
# reaches it by, the add's own (config.json `hubUrl`, cli joined-hub.ts): niftybot and uwucloud, added over SSH on
# 2026-10-22, recorded none, so their agents took themselves for not the machine's own and refused every sync. The
# fleet's sidecar in its Claude dir (~/.claude/cawco-fleet.json, agent denied-tools.ts), which every spawn reads before
# it starts anything, holds the fleet's deniedTools; its agent says it synced from the hub and never that it refused a
# sync; and the hub's row says no sync that did not land (`fleetSyncFault`).
ssh_fleet_synced() {
  local c=$1 name=$2 user=$3 home=$5 sidecar="$5/.claude/cawco-fleet.json" joined reached journal fault
  joined=$(as_added "$c" "$user" sh -c 'cat "$1" 2> /dev/null || true' sh "$home/.config/cawco/config.json" | json 'd => d.hubUrl ?? ""')
  reached=$(hub_api "/api/machines/ssh/$(cat "$rigdir/ssh-add-$name.job")" | json 'd => d.hubUrl')
  [[ -n $reached && $joined == "$reached" ]] \
    || { echo "ASSERTION FAILED: $name's config.json names the hub it joined as \"$joined\", and its agent reaches it at \"$reached\""; return 1; }
  wait_until 120 'fleet_denials_known "$c" "$user" "$sidecar"' || {
    echo "ASSERTION FAILED: $name's $sidecar holds no deniedTools: $(as_added "$c" "$user" sh -c 'cat "$1" 2>&1' sh "$sidecar" | head -c 400)"
    added_agent_journal "$c" "$user" | grep -F "[fleet]" | tail -n 10
    return 1
  }
  journal=$(added_agent_journal "$c" "$user")
  grep -qF "[fleet] sync from the hub" <<< "$journal" || { echo "ASSERTION FAILED: $name's agent never says it synced from the hub"; grep -F "[fleet]" <<< "$journal" | tail -n 20; return 1; }
  if grep -qE "not this machine's agent|sync from the hub refused" <<< "$journal"; then
    echo "ASSERTION FAILED: $name's agent refused the hub's fleet sync"; grep -E "not this machine's agent|sync from the hub refused" <<< "$journal" | tail -n 5; return 1
  fi
  fault=$(hub_api "/api/agents/$(cat "$rigdir/ssh-id-$name")" | json 'd => d.fleetSyncFault ?? ""')
  [[ -z $fault ]] || { echo "ASSERTION FAILED: the hub says $name's fleet sync did not land: $fault"; return 1; }
  echo "$name's agent: $(grep -F "[fleet] sync from the hub" <<< "$journal" | tail -n 1)"
}
# The session asked for a second after the add said done (ssh_start_after) runs: the hub took the start, and its row
# reads running within 90 s (a machine yet to hear the fleet's denials holds a spawn up to 30 s for its first sync,
# agent denied-tools.ts FIRST_SYNC_WAIT_MS, then refuses it).
ssh_session_ran() {
  local c=$1 name=$2 user=$3 id="sshadd-$2-1"
  [[ -s "$rigdir/ssh-start-$name.txt" ]] || { echo "ASSERTION FAILED: the add's check asked for no session on $name"; return 1; }
  echo "== the start a second after the add: $(cat "$rigdir/ssh-start-$name.txt")"
  head -n 1 "$rigdir/ssh-start-$name.txt" | grep -q '^rc 0 ' \
    || { echo "ASSERTION FAILED: the hub refused the session asked for a second after $name's add said done: $(tail -n +2 "$rigdir/ssh-start-$name.txt")"; return 1; }
  wait_until 90 "session_running $id" || {
    echo "ASSERTION FAILED: the session asked for on $name a second after its add said done reads $(hub_api /api/instances | json "d => JSON.stringify(d.find(r => r.id === '$id') ?? null)" | head -c 600)"
    added_agent_journal "$c" "$user" | grep -E "\[fleet\]|Not started|$id" | tail -n 20
    return 1
  }
}
# The session $3's identity as its process on machine $1 (user $2) has it: CAWCO_INSTANCE_ID, CAWCO_SESSION_CREDENTIAL
# and CAWCO_HUB_URL from the environment of the process the session holds, one NAME=value a line.
session_env_on() {
  as_added "$1" "$2" sh -c 'for p in $(pgrep -x sleep); do
    if tr "\0" "\n" < "/proc/$p/environ" 2> /dev/null | grep -qx "CAWCO_INSTANCE_ID=$1"; then
      tr "\0" "\n" < "/proc/$p/environ" | grep -E "^CAWCO_(INSTANCE_ID|SESSION_CREDENTIAL|HUB_URL)="
      exit 0
    fi
  done
  exit 1' sh "$3"
}
# A session's preview on the added machine answers through the hub: a page listens on the machine's loopback (a
# transient unit of its user's, socat answering preview-answer.sh), the session asked for after the add opens a preview
# of its port as a session does, its `artifact_create` tool called through `cawco tool` in the session's own
# environment, and the hub's preview port for that session answers with the page.
export SSH_PREVIEW_PORT=5197
ssh_preview() {
  local c=$1 name=$2 user=$3 home=$5 id="sshadd-$2-1" vars port
  on_exit "as_added $c $user systemctl --user stop cawco-proof-preview.service > /dev/null 2>&1"
  as_added "$c" "$user" systemd-run --user --quiet --unit=cawco-proof-preview socat \
    "TCP-LISTEN:$SSH_PREVIEW_PORT,bind=127.0.0.1,fork,reuseaddr" "SYSTEM:sh /shared/preview-answer.sh"
  wait_until 30 '[[ "$(as_added "$c" "$user" curl -sS --max-time 2 "http://127.0.0.1:$SSH_PREVIEW_PORT/" 2>&1 || true)" == *"preview of $name"* ]]'
  mapfile -t vars < <(session_env_on "$c" "$user" "$id")
  [[ " ${vars[*]} " == *" CAWCO_SESSION_CREDENTIAL="* ]] \
    || { echo "ASSERTION FAILED: the process of session $id on $name carries no credential: ${vars[*]%%=*}"; return 1; }
  # tool answer: words (only that it answered, and what it said, for the log)
  as_added "$c" "$user" env "${vars[@]}" "$home/.local/bin/cawco" tool artifact_create \
    "{\"kind\":\"preview\",\"does\":\"try\",\"ask\":\"Try the page and say whether it answers\",\"name\":\"sshadd-preview\",\"port\":$SSH_PREVIEW_PORT}" \
    > "$rigdir/ssh-preview-$name.open" 2>&1 \
    || { echo "ASSERTION FAILED: the session's artifact_create on $name failed: $(cat "$rigdir/ssh-preview-$name.open")"; return 1; }
  echo "the session's artifact_create answered: $(cat "$rigdir/ssh-preview-$name.open")"
  wait_until 60 'port=$(run_script "$hubc" /shared/stage2-preview-port.ts http://127.0.0.1:3456 "$id" 2> "$rigdir/ssh-preview-$name.err")' \
    || { echo "ASSERTION FAILED: the hub opened no preview port for $id: $(cat "$rigdir/ssh-preview-$name.err")"; return 1; }
  wait_until 60 '[[ "$(as_user "$hubc" curl -sS --max-time 10 "http://127.0.0.1:$port/" 2>&1 || true)" == *"preview of $name"* ]]' || {
    echo "ASSERTION FAILED: the hub's preview port $port for $id answered: $(as_user "$hubc" curl -sS --max-time 10 "http://127.0.0.1:$port/" 2>&1 | head -c 400)"
    added_agent_journal "$c" "$user" | grep -iE "preview|bridge|401" | tail -n 10
    return 1
  }
  echo "the hub's preview port $port for $id answers: preview of $name"
}
# Nothing either added machine asked the hub since the adds began was refused: the hub's journal has no
# `[hub-auth] refused` (the gate's line for every request it refuses, hub-auth.ts), and neither machine's agent
# journal says a call to the hub "answered 401" (what the gate answers a request without the machine's proof).
ssh_no_refusals() {
  need_hub
  local since refused c user said bad=0
  since=$(cat "$rigdir/ssh-adds-since")
  refused=$(hub_journal "$since" | grep -F "[hub-auth] refused" || true)
  [[ -z $refused ]] || { echo "ASSERTION FAILED: the hub refused requests since the adds:"; echo "$refused" | tail -n 20; bad=1; }
  for pair in "$sshrootc root" "$sshuserc cawco"; do
    read -r c user <<< "$pair"
    said=$(added_agent_journal "$c" "$user" "$since" | grep -F "answered 401" || true)
    [[ -z $said ]] || { echo "ASSERTION FAILED: the agent of $user on $c was answered 401:"; echo "$said" | tail -n 20; bad=1; }
  done
  (( bad == 0 ))
}
# Install now on the added machine applies the new build: the machine is offered it, its download from the hub goes
# through the add's forward with the machine's proof, a helper applies it, and nothing it asked the hub meanwhile was
# refused (as ssh_no_refusals reads).
ssh_install_now() {
  local c=$1 name=$2 user=$3 id since said
  id=$(cat "$rigdir/ssh-id-$name")
  since=$(date +%s)
  wait_until 120 '[[ "$(field $id availableVersion)" == $NEXT ]]' \
    || { echo "ASSERTION FAILED: $name was not offered $NEXT: $(hub_api /api/binary-updates/machines | json "d => JSON.stringify(d.machines['$id'] ?? null)")"; return 1; }
  echo "Install now answered: $(install_now_request "$id")"
  wait_until 400 '[[ "$(build_version $id)" == $NEXT && "$(phase $id)" == installed ]]' || {
    echo "ASSERTION FAILED: Install now left $name on $(build_version "$id"), $(phase "$id"): $(field "$id" error)"
    added_agent_journal "$c" "$user" "$since" | grep -E "\[update\]|401" | tail -n 20
    return 1
  }
  said=$(added_agent_journal "$c" "$user" "$since" | grep -F "answered 401" || true)
  [[ -z $said ]] || { echo "ASSERTION FAILED: through its update $name's agent was answered 401:"; echo "$said" | tail -n 10; return 1; }
}
ssh_install_now_both() {
  need_hub
  local since refused
  since=$(date +%s)
  use_feed next
  learn > /dev/null
  on_both ssh_install_now
  refused=$(hub_journal "$since" | grep -F "[hub-auth] refused" || true)
  [[ -z $refused ]] || { echo "ASSERTION FAILED: the hub refused requests through the updates:"; echo "$refused" | tail -n 10; return 1; }
}
export -f hub_journal ssh_trust as_added added_agent_journal ssh_sign_in_before on_both last_seen two_beats_taken \
  ssh_start_after ssh_add_said ssh_add_joins ssh_adds_at_once fleet_denials_known ssh_fleet_synced ssh_session_ran \
  session_env_on ssh_preview ssh_no_refusals ssh_install_now ssh_install_now_both
rig_sshadd() {
  use_feed base
  setup "boot the machines: hub sshroot sshuser" machines hub sshroot sshuser
  setup "install the hub from $BASE" install_hub "$BASE"
  setup "give the hub's SSH key to root on sshroot and the user on sshuser" ssh_trust
  setup "sign root on sshroot and the user on sshuser in to a CawCo account before their adds" ssh_sign_in_before
  setup_done
  check "SSH adds of two fresh machines at once, one as root and one as a normal user, each install CawCo under systemd and join: a second add of either while it runs is refused 409 naming it, no Admit asked or listed, each first register proves its add's key, online, and two of its heartbeats taken with none refused" ssh_adds_at_once 1200
  check "each added machine has had its first fleet sync: its install recorded the hub it joined, the fleet sidecar in its Claude dir holds the fleet's deniedTools, its agent says it synced from the hub and refused none, and the hub's row says no sync that did not land" "on_both ssh_fleet_synced" 300 "SSH adds of two fresh machines at once, one as root and one as a normal user, each install CawCo under systemd and join: a second add of either while it runs is refused 409 naming it, no Admit asked or listed, each first register proves its add's key, online, and two of its heartbeats taken with none refused"
  check "a session asked for a second after each add said done runs" "on_both ssh_session_ran" 300 "SSH adds of two fresh machines at once, one as root and one as a normal user, each install CawCo under systemd and join: a second add of either while it runs is refused 409 naming it, no Admit asked or listed, each first register proves its add's key, online, and two of its heartbeats taken with none refused"
  check "that session's preview on each added machine answers through the hub" "on_both ssh_preview" 300 "a session asked for a second after each add said done runs"
  check "nothing either added machine asked the hub was refused: no [hub-auth] refused in the hub's journal since the adds, no answered 401 in either agent's journal" ssh_no_refusals 120 "SSH adds of two fresh machines at once, one as root and one as a normal user, each install CawCo under systemd and join: a second add of either while it runs is refused 409 naming it, no Admit asked or listed, each first register proves its add's key, online, and two of its heartbeats taken with none refused"
  check "Install now on each added machine applies the new build, its download through the add's forward with the machine's proof, nothing refused" ssh_install_now_both 900 "SSH adds of two fresh machines at once, one as root and one as a normal user, each install CawCo under systemd and join: a second add of either while it runs is refused 409 naming it, no Admit asked or listed, each first register proves its add's key, online, and two of its heartbeats taken with none refused"
}

# ---------------------------------------------------------------- admitted: a machine joins a hub that requires paired
# devices by itself (nightly 4839, uwucloud, 2026-10-21: after its Admit the machine's heartbeats were refused
# "register first" every 15 s). It is held with none of its frames refused "register first"; the person admits it, and
# from then on it is the machine's registered connection: online, and two of its heartbeats taken, none refused. A
# fresh machine runs the hub's own install.sh with no terminal, as the dialog's one command hands it out.
owner_api() { as_user "$hubc" curl -fsS -H "Authorization: Owner $(cat "$rigdir/owner-token")" "http://127.0.0.1:3456$1" "${@:2}"; }
admitted_heartbeats() {
  local id since out rc=0 refused joining admitted_ms waiting
  need_hub
  hub_api /api/auth/pairing -X PUT -H 'content-type: application/json' -d '{"required":true,"kind":"app","name":"stage2 proof"}' | json 'd => d.token' > "$rigdir/owner-token"
  [[ -s "$rigdir/owner-token" ]]
  since=$(date +%s)
  as_user "$joinerc" curl -fsS "http://$hub_ip:3456/install.sh" -o /tmp/join.sh
  out="$rigdir/held-join.out"
  as_user "$joinerc" sh /tmp/join.sh > "$out" 2>&1 &
  joining=$!
  # Its row waits to be admitted: the one row there is (the hub's own machine was admitted as pairing went on).
  wait_until 300 '[[ "$(owner_api /api/machines/waiting | json "d => d.length")" == 1 ]]' || { cat "$out"; hub_journal "$since" | tail -n 60; return 1; }
  waiting=$(owner_api /api/machines/waiting)
  echo "waiting to be admitted: $waiting"
  id=$(json 'd => d[0].machineId' <<< "$waiting")
  [[ -n $id ]]
  refused=$(hub_journal "$since" | grep -cF "not machine $id's registered one" || true)
  [[ $refused == 0 ]] || { echo "ASSERTION FAILED: while held, $refused of the machine's frames were refused \"register first\""; hub_journal "$since" | grep -F "$id" | tail -n 30; return 1; }
  owner_api "/api/machines/waiting/$id/admit" -X POST > /dev/null
  wait "$joining" || rc=$?
  cat "$out"
  [[ $rc == 0 ]] || { echo "ASSERTION FAILED: the join exited $rc"; hub_journal "$since" | tail -n 60; return 1; }
  grep -q 'waiting to be admitted' "$out"
  [[ "$(owner_api "/api/agents/$id" | json 'd => d.status')" == online ]]
  admitted_ms=$(now_ms)
  two_beats_taken owner_api "$id" "$admitted_ms" || { hub_journal "$since" | grep -F "$id" | tail -n 30; return 1; }
  refused=$(hub_journal "$since" | grep -cF "not machine $id's registered one" || true)
  [[ $refused == 0 ]] || { echo "ASSERTION FAILED: after the Admit, $refused of the machine's frames were refused \"register first\""; hub_journal "$since" | grep -F "$id" | tail -n 30; return 1; }
  [[ "$(owner_api "/api/agents/$id" | json 'd => d.status')" == online ]]
}
export -f owner_api admitted_heartbeats
rig_admitted() {
  use_feed base
  setup "boot the machines: hub joiner" machines hub joiner
  setup "install the hub from $BASE" install_hub "$BASE"
  setup_done
  check "a machine that joins a hub requiring paired devices by itself is held with none of its frames refused register first, the person admits it, and it is the machine's registered connection: online, two heartbeats taken, none refused after either" admitted_heartbeats 900
}

# ---------------------------------------------------------------- spare: installs that must stop, on a machine
# nothing is installed on, and that must leave it as it was.
no_linger_no_terminal() {
  as_user "$freshc" true
  rc=0
  result=$(as_user "$freshc" sh /shared/installer.sh 2>&1) || rc=$?
  echo "$result"
  [[ $rc != 0 ]]
  grep -q "sudo loginctl enable-linger cawco" <<< "$result"
  [[ "$(untouched "$freshc")" == untouched ]]
}
fails_after_placing() {
  $P exec "$freshc" loginctl enable-linger cawco
  wait_until 60 "$P exec $freshc test -S /run/user/1000/bus"
  rc=0
  result=$(FEED_OVERRIDE="http://$release_ip:8000/brokeninstall" as_user "$freshc" sh /shared/installer.sh 2>&1) || rc=$?
  echo "$result"
  [[ $rc != 0 ]]
  grep -q "installing CawCo $BASE into" <<< "$result"
  [[ "$(untouched "$freshc")" == untouched ]]
  [[ "$(as_user "$freshc" sh -c 'systemctl --user list-unit-files "cawco-*" --no-legend | wc -l')" == 0 ]]
}
# The installer run against a feed that must be refused (the shell installer's own openssl verification, not the
# binary's verifier stage 1 runs). The machine first has what the installer needs before it verifies anything:
# lingering, and openssl installed with sudo (the installer's own first step on a machine without it, which also
# writes sudo's first-use note into the home directory); then it must be exactly as it was. Everything is written to
# the check's log.
refuse() {
  local feedname=$1 phrase=$2 rc=0 diffrc=0 dir="$rigdir/refuse-$1"
  mkdir -p "$dir"
  $P exec "$freshc" loginctl enable-linger cawco
  wait_until 60 "$P exec $freshc test -S /run/user/1000/bus"
  as_user "$freshc" sh -c 'sudo apt-get update > /dev/null && sudo apt-get install -y openssl > /dev/null && command -v openssl && test -e "$HOME/.sudo_as_admin_successful"'
  listing() { as_user "$freshc" sh -c 'find "$HOME" -xdev -not -path "$HOME/.cache/*" | sort; echo "-- user units:"; systemctl --user list-unit-files "cawco-*" --no-legend || true'; }
  listing > "$dir/before.txt"
  echo "== listing before ($(wc -l < "$dir/before.txt") lines)"
  cat "$dir/before.txt"
  echo "== running the installer on $freshc against the $feedname feed (release host $release_ip:8000/$feedname)"
  FEED_OVERRIDE="http://$release_ip:8000/$feedname" as_user "$freshc" sh /shared/installer.sh > "$dir/installer.txt" 2>&1 || rc=$?
  echo "== the installer's full output"
  cat "$dir/installer.txt"
  echo "== the installer's exit status: $rc"
  listing > "$dir/after.txt"
  echo "== listing after ($(wc -l < "$dir/after.txt") lines)"
  cat "$dir/after.txt"
  echo "== diff before after"
  diff "$dir/before.txt" "$dir/after.txt" || diffrc=$?
  [[ $diffrc == 0 ]] && echo "(no difference)"
  echo "== assertions: exit status not 0 (was $rc); output holds '$phrase'; before and after identical (diff status $diffrc)"
  [[ $rc != 0 ]] || { echo "ASSERTION FAILED: the installer exited 0"; return 1; }
  grep -q "$phrase" "$dir/installer.txt" || { echo "ASSERTION FAILED: the output does not hold: $phrase"; return 1; }
  [[ $diffrc == 0 ]] || { echo "ASSERTION FAILED: the machine changed"; return 1; }
}
export -f no_linger_no_terminal fails_after_placing refuse
rig_spare() {
  use_feed base
  use_feed refusals
  setup "boot the machines: fresh" machines fresh
  setup_done
  check "with lingering off and no terminal the install stops with the command and places nothing" no_linger_no_terminal
  check "an install that fails after placing files leaves nothing behind" fails_after_placing
  check "a tampered archive is refused and nothing changes" "refuse tampered 'does not match the signed checksum'"
  check "a bad signature is refused and nothing changes" "refuse badsig 'does not match CawCo.s release key'"
  check "a missing signature is refused and nothing changes" "refuse nosig 'could not download'"
}

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
    echo "ASSERTION FAILED: the hub's address answers on 3455 before the update, so the update proves nothing"
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
# http://localhost:3455, which the update's verification probed to install NEXT; and the apply log says NEXT wrote them.
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
  (( $(apply_log_count "units $NEXT: units: .*rewrote") >= 1 )) \
    || { echo "ASSERTION FAILED: the apply log says nothing of $NEXT rewriting the units"; return 1; }
  (( $(apply_log_count "units $NEXT: .*the dashboard answers at http://localhost:3455") >= 1 )) \
    || { echo "ASSERTION FAILED: the apply log says nothing of $NEXT recording the dashboard at http://localhost:3455"; return 1; }
  as_user "$hubc" grep "units $NEXT" /home/cawco/.local/share/cawco/binary/apply.log
}
export -f units_before_3455 hub_self_update hub_starts_held held_survives units_carried
rig_hubself() {
  fleet base "$BASE" hub hub
  setup "the hub's own machine updates, with a child held and sessions asked for while it installs" hub_self_update
  setup_done
  check "a session start requested while the hub's own machine installs runs once afterwards, one child, none lost" hub_starts_held 900
  check "a child held by the session keeper survives the update on that keeper, untouched, while the new build's keeper becomes the machine's" held_survives
  check "the update moves the hub's machine from 3000 to 3455 from the build it installs, no service install run: the dashboard's socket on 0.0.0.0:3455, its loopback socket on [::1]:3455 alone (none without ::1), 3455 the dashboard and nothing on 3000, the hub's unit loses its 3000 alone, the agent's unit untouched, the install's record names localhost:3455" units_carried
}

# ---------------------------------------------------------------- rollbacks, each on a hub of its own
rolled_back() {
  need_hub
  use_feed broken
  learn
  put_policy stable true
  wait_until 300 '[[ "$(field $hid failedVersion)" == 0.0.1-test.10 && "$(phase $hid)" == failed-rolled-back ]]'
  [[ "$(build_version $hid)" == $BASE ]]
  [[ -n "$(field $hid error)" ]]
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
}
migration_rolled_back() {
  need_hub
  # Data the hub holds before the update. Without -f, so a refusal shows the hub's own words instead of a bare 400.
  saved=$(as_user "$hubc" curl -sS -w '\nHTTP %{http_code}' http://127.0.0.1:3456/api/workflows -X POST -H 'content-type: application/json' -d @/shared/workflow.json)
  echo "saving the workflow: $saved"
  [[ "$saved" == *"HTTP 201" ]]
  hub_api /api/workflows | grep -q kept-through-rollback
  use_feed migrating
  learn
  put_policy stable true
  wait_until 360 '[[ "$(field $hid failedVersion)" == 0.0.1-test.8 && "$(phase $hid)" == failed-rolled-back ]]'
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  [[ "$(build_version $hid)" == $BASE ]]
  hub_api /api/workflows | grep -q kept-through-rollback
  # The migrated file is moved aside, not deleted, and the copy it was restored from is still there.
  as_user "$hubc" sh -c 'ls ~/.local/share/cawco/cawco.db.migrated-0.0.1-test.8 ~/.local/share/cawco/cawco.db.pre-'"$BASE"'.bak'
}
# A helper killed right after the swap of a build that cannot start, with a stale migration marker a killed hub
# leaves behind (a process id that now belongs to something else): the unit that cannot start keeps being restarted
# through the wrapper, which finds the trial with no helper and starts one from the previous build; that helper rolls
# every unit back when the build is not healthy in time.
swap_kill_recover() {
  need_hub
  local version=0.0.1-test.6
  use_feed swapbroken
  learn
  put_policy stable true
  wait_until 240 '[[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/'"$version"' ]]'
  # The hub is down from the swap until the previous build is restored, so nothing here may call its API before the
  # recovery: the helper is killed first, and the policy is put back once the hub answers again.
  as_user "$hubc" pkill -9 -f "binary-apply $version"
  live=$(keeper_pid "$hubc")
  as_user "$hubc" sh -c "printf '{\"pid\":$live,\"procStart\":\"1\",\"bootId\":\"not-this-boot\"}' > ~/.local/share/cawco/cawco.db.migrating"
  wait_until 420 '[[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/$BASE ]]'
  wait_until 120 'as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q "\"version\":\"$BASE\""'
  wait_until 120 '[[ "$(field $hid failedVersion)" == '"$version"' && "$(phase $hid)" == failed-rolled-back ]]'
  as_user "$hubc" rm -f /home/cawco/.local/share/cawco/cawco.db.migrating
  put_policy stable false
}
# A helper killed after the swap of a build whose agent cannot start (its `up` verb fails; every other verb works),
# while its hub runs: the agent's unit keeps restarting through the wrapper, which starts a helper from the previous
# build; within that helper's window it rolls every unit back, the hub with them.
agent_cannot_start_whole_recovery() {
  need_hub
  on_exit 'end_children "$hubc" keeperlive-9'
  local previous
  previous=$(current_link "$hubc")
  as_user "$hubc" sh -c 'rm -f /tmp/stub-9.done; sh /shared/keeper-dropin.sh break-when-staged "$1" up && touch /tmp/stub-9.done' _ "$NEXT" > /dev/null 2>&1 &
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  wait_until 300 '[[ "$(current_link "$hubc")" == "versions/$NEXT" ]]'
  wait_until 20 'as_user "$hubc" test -e /tmp/stub-9.done'
  as_user "$hubc" pkill -9 -f binary-apply
  wait_until 300 '[[ "$(current_link "$hubc")" == "'"$previous"'" ]]'
  wait_until 60 'as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q "\"version\":\"${previous#versions/}\""'
  wait_until 60 '[[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$hid\")?.status")" == online ]]'
  wait_until 60 '[[ "$(custody_of $hid)" == available ]]'
  wait_until 60 '[[ "$(phase $hid)" == failed-rolled-back && "$(field $hid failedVersion)" == $NEXT ]]'
  as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/trial.json
  as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/apply.lock
  start_session "$hid" keeperlive-9
  wait_until 60 'session_running keeperlive-9'
}
export -f rolled_back migration_rolled_back swap_kill_recover agent_cannot_start_whole_recovery
rig_rollback() {
  fleet base "$BASE" hub
  setup_done
  check "a build that cannot start is rolled back and the failure is recorded" rolled_back
}
rig_migration() {
  fleet base "$BASE" hub
  setup_done
  check "a build with a new migration that fails to start is rolled back and the hub opens its restored database" migration_rolled_back
}
rig_swapkill() {
  fleet base "$BASE" hub
  setup_done
  check "a helper killed right after the swap of a build that cannot start, with a stale migration marker left by a killed hub, is recovered at the next start" swap_kill_recover 900
}
rig_agentdown() {
  fleet base "$BASE" hub hub
  setup_done
  check "a helper killed after the swap of a build whose agent cannot start is put back whole, though its hub runs" agent_cannot_start_whole_recovery 900
}

# ---------------------------------------------------------------- the session keeper, each case on a hub of its own.
# This build's keeper is made unable to start, or slow to start, by a stub on its `sessiond` verb, written by
# /shared/keeper-dropin.sh the moment the update stages the build.
keeper_cannot_start_with_held() {
  need_hub
  on_exit 'as_user "$hubc" pkill -f "keeper-dropin\.sh (break|slow)-when-staged"; keeper_dropin remove > /dev/null 2>&1'
  on_exit 'end_children "$hubc" boundary-k1hold keeperlive-6'
  local before held keeper
  before=$(keeper_link "$hubc")
  # A child the keeper holds through the update, whose new keeper cannot start.
  spawn_child "$hubc" k1hold
  held=$(child_pids "$hubc" boundary-k1hold)
  keeper=$(keeper_pid "$hubc")
  [[ -n "$held" && -n "$keeper" ]]
  # The person's side of the update (update_outcomes_start): a session running before it, its messages through the
  # hub's own restarts (the update's, and the agent's and hub's again once the stub goes), and the sign-in, with the
  # machine's Claude Code answering late.
  start_session "$hid" outcome-1 > /dev/null
  wait_until 60 'session_running outcome-1'
  update_outcomes_start "$hubc" "$hid" outcome-1
  on_exit update_sends_stop
  stub_when_staged break-when-staged "$NEXT" sessiond
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  # The healthy build is not undone: it runs, installed.
  wait_until 400 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]]'
  [[ "$(current_link "$hubc")" == "versions/$NEXT" ]]
  wait_until 60 '[[ "$(field $hid keeperFailedVersion)" == $NEXT ]]'
  # The keeper that could not start left nothing behind, no unit and no endpoint, and was started at most twice.
  as_user "$hubc" test ! -e "/home/cawco/.config/systemd/user/$(unit_of $NEXT)"
  as_user "$hubc" test ! -e "/run/user/1000/cawco/$(endpoint_of $NEXT)"
  started_at_most_twice "$hubc" "$(unit_of $NEXT)"
  # The child and its keeper are as they were, and that keeper is still the machine's.
  [[ "$(keeper_link "$hubc")" == "$before" ]]
  [[ "$(current_endpoint "$hubc")" == "$(endpoint_of "${before#versions/}")" ]]
  [[ "$(child_pids "$hubc" boundary-k1hold)" == "$held" && "$(keeper_pid "$hubc")" == "$keeper" ]]
  [[ "$(holder_of "$hubc" boundary-k1hold)" == "$(current_endpoint "$hubc")" ]]
  wait_until 60 '[[ "$(custody_of $hid)" == available ]]'
  keeper_dropin remove
  # Sessions still start, on the keeper before.
  start_session "$hid" keeperlive-6
  wait_until 60 'session_running keeperlive-6'
  [[ "$(holder_of "$hubc" keeperlive-6)" == "$(endpoint_of "${before#versions/}")" ]]
  # Not handed over to the same build again by itself: its keeper's unit was written once. No later watch tries it
  # again, for the one place a handover starts from returns while the state names this build's keeper as failed
  # (binary-update.ts `#advanceKeeper`: `this.#state.keeperFailedVersion === runtimeVersion` → return), which the
  # wait above read off the hub.
  [[ "$(apply_log_count "keeper $NEXT: units")" == 1 ]]
  [[ "$(keeper_link "$hubc")" == "$before" ]]
  update_sends_stop
}
helper_killed_mid_handover() {
  need_hub
  on_exit 'as_user "$hubc" pkill -f "keeper-dropin\.sh (break|slow)-when-staged"; keeper_dropin remove > /dev/null 2>&1'
  on_exit 'end_children "$hubc" boundary-k2hold keeperlive-7'
  local before held keeper
  before=$(keeper_link "$hubc")
  spawn_child "$hubc" k2hold
  held=$(child_pids "$hubc" boundary-k2hold)
  keeper=$(keeper_pid "$hubc")
  [[ -n "$held" && -n "$keeper" ]]
  # The person's side of the update (update_outcomes_start): a session running before it, which the keeper before
  # holds on through the handover, answering its listing late once it retires; its messages through the hub's own
  # restart; and the sign-in, with the machine's Claude Code answering late.
  start_session "$hid" outcome-1 > /dev/null
  wait_until 60 'session_running outcome-1'
  update_outcomes_start "$hubc" "$hid" outcome-1
  on_exit update_sends_stop
  # The new keeper takes 10 s to start (under the helper's 45 s wait for its welcome, binary-apply.ts HEALTH_MS).
  stub_when_staged slow-when-staged "$NEXT" 10
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  # The helper writes the new keeper's unit, starts it beside the keeper before, and waits for it; it is killed while
  # it waits: once the unit's job runs (the stub's sleep; the unit has no Type=, so it is active from its start),
  # before the keeper answers on its endpoint. Nothing has been switched: the keeper before is the machine's.
  wait_until 400 '[[ "$(as_user "$hubc" systemctl --user is-active "$(unit_of $NEXT)")" == active ]]'
  ! as_user "$hubc" test -S "/run/user/1000/cawco/$(endpoint_of $NEXT)"
  as_user "$hubc" pkill -9 -f binary-apply
  [[ "$(keeper_link "$hubc")" == "$before" ]]
  [[ "$(current_endpoint "$hubc")" == "$(endpoint_of "${before#versions/}")" ]]
  # The trial it left open is decided by a helper the agent starts: the build answers, its keeper is up by then and is
  # handed over to, the build is confirmed, and nothing is left in flight.
  wait_until 400 '[[ "$(keeper_link "$hubc")" == "versions/$NEXT" && "$(current_endpoint "$hubc")" == "$(endpoint_of $NEXT)" ]]'
  wait_until 300 'as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/trial.json'
  as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/apply.lock
  wait_until 120 '[[ "$(phase $hid)" == installed && "$(build_version $hid)" == $NEXT ]]'
  [[ -z "$(field $hid keeperFailedVersion)" ]]
  wait_until 60 '[[ "$(custody_of $hid)" == available ]]'
  # The held child ran through all of it on the keeper before, the same process.
  [[ "$(child_pids "$hubc" boundary-k2hold)" == "$held" ]]
  [[ "$(holder_of "$hubc" boundary-k2hold)" == "$(endpoint_of "${before#versions/}")" ]]
  [[ "$(keeper_pid "$hubc" "$(unit_of "${before#versions/}")")" == "$keeper" ]]
  # A session starts, on the new build's keeper.
  start_session "$hid" keeperlive-7
  wait_until 60 'session_running keeperlive-7'
  [[ "$(holder_of "$hubc" keeperlive-7)" == "$(endpoint_of $NEXT)" ]]
  update_sends_stop
}
export -f keeper_cannot_start_with_held helper_killed_mid_handover
rig_keeperheld() {
  fleet base "$BASE" hub hub
  setup_done
  check "with a child held, a build whose keeper cannot start is not undone, leaves the child and its keeper as they were and nothing of its own keeper behind, sessions still start, and it is not tried again" keeper_cannot_start_with_held 900
  check "a session running on the hub's machine before its update, whose new keeper cannot start, is the same process after it, reattached and running" update_session_reattached 300
  check "every message sent to a session on the hub's machine while it updates, the hub restarting under some, reaches the session once the machine is back, once each" update_sends_delivered 600
  check "the hub's machine's Claude account reads signed in all through its update, though its Claude Code answers auth status past the agent's bound" update_signin_kept 600
}
rig_keeperkilled() {
  fleet base "$BASE" hub hub
  setup_done
  check "a helper killed while the keeper it hands over to is starting leaves the machine whole, and the decider that resumes finishes the handover" helper_killed_mid_handover 900
  check "a session running on the hub's machine before a handover a killed helper left, held on by the retiring keeper that answers its listing late, is the same process after it, reattached and running" update_session_reattached 300
  check "every message sent to a session on the hub's machine while a killed helper's handover is finished, the hub restarting under some, reaches the session once the machine is back, once each" update_sends_delivered 600
  check "the hub's machine's Claude account reads signed in all through its update, though its Claude Code answers auth status past the agent's bound" update_signin_kept 600
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
  extra=$(printf '%s\n' "$env" | grep -oE '^CAWCO_[A-Z0-9_]*' | grep -vxE 'CAWCO_HUB_URL|CAWCO_INSTANCE_ID|CAWCO_SESSION_CREDENTIAL|CAWCO_MODEL' || true)
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
  # The person's side of both updates (update_outcomes_start): from here the joined machine's Claude Code answers
  # late and its sign-in is watched, and a message goes to handover-1 every 3 s, through the hub's own restart and the
  # joined machine's update, until the agent's restart in the middle of the handover has been taken.
  update_outcomes_start "$joinerc" "$jid" handover-1
  on_exit update_sends_stop
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
  update_sends_stop
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
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "a joined machine installs a build with sessions on its keeper: the new keeper takes a new session at once (carrying only the CAWCO_* its tools read), the old sessions run on and answer through an agent restart, the old keeper is kept while its unit holds a process CawCo did not start (its update state and Update cell name it) and goes once that ends; the hub's machine keeps the build its trial would restore until the trial is confirmed" handover_on_joined_machine 1200
  check "every message sent to a session on the joined machine while the hub's machine and then the joined machine update, the hub restarting under some, reaches the session once the machine is back, once each" update_sends_delivered 600
  check "the joined machine's Claude account reads signed in all through its update, though its Claude Code answers auth status past the agent's bound" update_signin_kept 600
}

# ---------------------------------------------------------------- Install now on a joined machine
# The owner's Mac on 2026-10-13: Install now for a joined machine answered `installed`, and the machine then said
# installing, with no helper and nothing applied, until its agent was restarted by hand. The command had landed while
# the machine's own auto-update pass was draining for that build. That sweep runs on macOS only (proven there by
# scripts/binary/probe-helper-jobs-launchd.ts); here the same interleaving runs on the joined machine, and the build
# must apply on that command, its agent restarted only by the update's own helper. Then a download its hub cannot
# supply leaves the machine failed, saying why, never installing, and the same command tries the build again by
# itself once the hub can.
STAGED=/home/cawco/.local/share/cawco/binary/versions/$NEXT/release.json
STRAY_UNIT=/home/cawco/.config/systemd/user/cawco-sessiond-0.0.0-stray.service
export STAGED STRAY_UNIT
# The new build installed on the hub's machine, one update asked for: once the hub runs it, its joined machine looks
# at what its hub offers and is offered it.
hub_installs_first() {
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  wait_until 400 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]]'
  learn
  wait_until 120 '[[ "$(field $jid availableVersion)" == $NEXT ]]'
}
# How many helpers started applying build $2 on machine $1, as its apply.log says: 0 before any helper wrote one.
apply_starts() { as_user "$1" sh -c 'cat /home/cawco/.local/share/cawco/binary/apply.log 2> /dev/null | grep -c "start $1 keeperOnly=false" || true' sh "$2"; }
# A workflow whose one step is a long command, `sleep $1`, on the machine it runs on: work in flight an agent's drain
# waits on. Each is its own workflow, so each command is its own piece of work.
hold_workflow() { printf '{"name":"hold-the-joined-drain-%s","program":"import { z } from \\"zod\\"; export const inputs = z.object({}); export default async function (w: Workflow<typeof inputs>) { await w.exec(\\"sleep %s\\"); return {}; }"}' "$1" "$1"; }
# Saves the hold workflow for `sleep $1` and runs it on the joined machine in directory $2: prints the workflow's id,
# then the run's.
start_hold() {
  local wf run
  wf=$(hub_api /api/workflows -X POST -H 'content-type: application/json' -d "$(hold_workflow "$1")" | json 'd => d.id')
  [[ -n $wf ]]
  run=$(hub_api "/api/workflows/$wf/runs" -X POST -H 'content-type: application/json' -d "{\"inputs\":{},\"workspace\":{\"path\":\"$2\",\"machineId\":\"$jid\"}}" | json 'd => d.runId')
  [[ -n $run ]]
  echo "$wf $run"
}
joiner_command_mid_drain() {
  need_hub
  local held first second since answer
  on_exit 'put_policy stable false > /dev/null; as_user "$joinerc" pkill -f "sleep 60[12]"; as_user "$joinerc" sh -c "rm -f $STRAY_UNIT && systemctl --user daemon-reload"'
  hub_installs_first
  # Work in flight on the joined machine, started before any fence: a workflow's command, run there by its agent.
  held=$(start_hold 601 /home/cawco)
  read -r -a first <<< "$held"
  on_exit "hub_api /api/workflows/${first[0]} -X DELETE > /dev/null"
  on_exit "hub_api /api/workflow-runs/${first[1]}/cancel -X POST > /dev/null"
  wait_until 60 'as_user "$joinerc" pgrep -f "sleep 601" > /dev/null'
  # The person's side of the joined machine's update (update_outcomes_start): a session running before it, which its
  # keeper before holds on, answering its listing late once it retires; and the sign-in, with the machine's Claude
  # Code answering late. No messages: a turn is work the pass could wait on, and this check times the pass's drain.
  start_session "$jid" outcome-1 > /dev/null
  wait_until 60 'session_running outcome-1'
  update_outcomes_start "$joinerc" "$jid" outcome-1 nosends
  # Auto-update on: the joined machine's own pass stages the hub's build and drains on that command (agent
  # binary-update.ts DRAIN_MS: 45 s, a sixth of it at the proof's pace). The command outlasts the drain, so the build
  # waits, staged, for it to end.
  put_policy stable true
  wait_until 200 '[[ "$(phase $jid)" == ready && -n "$(field $jid waitingOn)" ]]'
  as_user "$joinerc" test -s "$STAGED"
  # While it waits, a prune runs: a keeper unit no keeper runs from goes after its while, and what nothing needs goes
  # with it (2026-10-14's run: a retiring keeper's removal mid-drain pruned the staged build, and the helper found no
  # release.json). The staged build is not among what goes.
  as_user "$joinerc" sh -c 'printf "[Unit]\nDescription=CawCo sessiond 0.0.0-stray\n[Service]\nExecStart=/bin/false\n" > "$1" && systemctl --user daemon-reload' sh "$STRAY_UNIT"
  wait_until 90 'as_user "$joinerc" test ! -e "$STRAY_UNIT"'
  as_user "$joinerc" test -s "$STAGED"
  # Fresh work in flight, then the first command ends: the next pass drains on the new one for its DRAIN_MS, saying
  # installing, before it starts any helper. The drain is the window Install now must land in, so from the moment the
  # machine says installing the check asks the machine one thing (no helper has started) and then sends it.
  held=$(start_hold 602 /tmp)
  read -r -a second <<< "$held"
  on_exit "hub_api /api/workflows/${second[0]} -X DELETE > /dev/null"
  on_exit "hub_api /api/workflow-runs/${second[1]}/cancel -X POST > /dev/null"
  wait_until 60 'as_user "$joinerc" pgrep -f "sleep 602" > /dev/null'
  since=$(as_user "$joinerc" date +%s)
  as_user "$joinerc" pkill -f "sleep 601"
  # The next pass now, not at the poll a minute on: the hub's check has every online machine look (a pass like any).
  learn
  wait_until 150 '[[ "$(phase $jid)" == installing ]]'
  as_user "$joinerc" sh -c 'b=/home/cawco/.local/share/cawco/binary; test ! -e "$b/apply.lock" && ! grep -q "start $1 keeperOnly=false" "$b/apply.log" 2> /dev/null' sh "$NEXT" \
    || { echo "ASSERTION FAILED: a helper started applying $NEXT before Install now was sent"; return 1; }
  # Install now lands in that pass's drain.
  answer=$(install_now_request "$jid")
  echo "the joined machine answered: $answer"
  grep -q '"installed":true' <<< "$answer"
  as_user "$joinerc" journalctl --user --no-pager -o cat -u cawco-agent.service --since "@$since" | grep "\[update\]" || true
  as_user "$joinerc" journalctl --user --no-pager -o cat -u cawco-agent.service --since "@$since" | grep -q "arrived during an update pass, which takes it"
  # One helper applies the build at once, from that command, with no agent restart by hand.
  wait_until 60 '[[ "$(apply_starts "$joinerc" "$NEXT")" == 1 ]]'
  wait_until 300 '[[ "$(build_version $jid)" == $NEXT && "$(phase $jid)" == installed ]]'
  [[ "$(apply_starts "$joinerc" "$NEXT")" == 1 ]]
}
# Moves the build's archive ($1) `aside` where the hub gets it, its own copy and the release host's, or `back`.
retry_archive() {
  local cached="/home/cawco/.local/share/cawco/binary-releases/$NEXT/$1" hosted="$rigdir/release/ok/stable/$1"
  if [[ $2 == aside ]]; then
    as_user "$hubc" mv "$cached" "$cached.aside"
    mv "$hosted" "$hosted.aside"
    return
  fi
  as_user "$hubc" sh -c 'test ! -e "$1.aside" || mv "$1.aside" "$1"' sh "$cached"
  [[ ! -e "$hosted.aside" ]] || mv "$hosted.aside" "$hosted"
}
agent_pid() { as_user "$1" systemctl --user show -p MainPID --value cawco-agent.service; }
joiner_install_retries() {
  need_hub
  local archive agent answer
  hub_installs_first
  # The hub cannot supply the build: the copy it fetched for its own machine, and the release host's, are aside.
  archive=$(hub_api /api/binary-updates/release | json "d => d.manifest.artifacts.find(a => a.target === 'linux-x64')?.archive")
  [[ -n $archive ]]
  on_exit "retry_archive '$archive' back"
  retry_archive "$archive" aside
  agent=$(agent_pid "$joinerc")
  answer=$(install_now_request "$jid")
  echo "the joined machine answered: $answer"
  grep -q '"installed":false' <<< "$answer"
  # It says failed, and why, at once: it is never installing with nothing applying it.
  wait_until 45 '[[ "$(phase $jid)" == failed ]]'
  echo "its error: $(field $jid error)"
  [[ "$(field $jid error)" == *"could not supply the build"* ]]
  [[ "$(agent_pid "$joinerc")" == "$agent" ]]
  # The archive is back: the command tries the build again by itself once its delay has passed, and one helper
  # applies it, with no agent restart by hand.
  retry_archive "$archive" back
  wait_until 300 '[[ "$(build_version $jid)" == $NEXT && "$(phase $jid)" == installed ]]'
  [[ "$(apply_starts "$joinerc" "$NEXT")" == 1 ]]
}
export -f hub_installs_first apply_starts hold_workflow start_hold joiner_command_mid_drain retry_archive agent_pid joiner_install_retries
rig_drain() {
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "Install now sent while a joined machine's own auto-update pass drains for the build applies on that command: one helper, at once, with no agent restart by hand, and a prune while the build waits staged leaves it" joiner_command_mid_drain 900
  check "a session running on the joined machine before its update, held on by the retiring keeper that answers its listing late, is the same process after it, reattached and running" update_session_reattached 300
  check "the joined machine's Claude account reads signed in all through its update, though its Claude Code answers auth status past the agent's bound" update_signin_kept 600
}
rig_retry() {
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "an install commanded on a joined machine whose hub cannot supply the build says failed and why, then applies it by itself once the hub can, with no agent restart by hand" joiner_install_retries 900
}

# ---------------------------------------------------------------- pins: the harness a build pins goes on before it,
# the way the machine already has it (packages/agent/src/binary-update.ts #putOnPins, which runs the staged build's
# own `cawco binary-pins`). The hub's machine has OpenCode as a bun global, laid out as `bun install -g --trust
# @opencode/cli` lays it out (~/.bun/bin/opencode2 into ~/.bun/install/global/node_modules/@opencode/cli): a stub that
# says the version ~/opencode-version holds, one release below what this tree pins. ~/.bun/bin/bun is a stand-in: each
# `install -g` it is asked for is a line of ~/bun-calls.log, with how many swaps apply.log held then; it fails while
# ~/bun-fails is there, and otherwise puts the version it was asked for in ~/opencode-version.
plant_bun_opencode() {
  local stub="$rigdir/opencode-stub" bun="$rigdir/bun-stand-in"
  cat > "$stub" << 'EOF'
#!/bin/sh
if [ "$1" = --version ]; then echo "opencode v$(cat "$HOME/opencode-version")"; exit 0; fi
echo "the proof's OpenCode does not serve" >&2
exit 1
EOF
  cat > "$bun" << 'EOF'
#!/bin/sh
if [ "$1" = install ] && [ "$2" = -g ]; then
  swaps=$(grep -c " swap " "$HOME/.local/share/cawco/binary/apply.log" 2> /dev/null || true)
  echo "bun $* swaps=${swaps:-0}" >> "$HOME/bun-calls.log"
  if [ -e "$HOME/bun-fails" ]; then echo "error: GET https://registry.npmjs.org/@opencode%2fcli - 503" >&2; exit 1; fi
  for arg in "$@"; do case "$arg" in @opencode/cli@*) echo "${arg#@opencode/cli@}" > "$HOME/opencode-version";; esac; done
  exit 0
fi
echo "the proof's bun runs installs only" >&2
exit 1
EOF
  as_user "$hubc" sh -c 'mkdir -p ~/.bun/bin ~/.bun/install/global/node_modules/@opencode/cli/bin && echo "$1" > ~/opencode-version && echo "{}" > ~/.bun/install/global/bun.lock' sh "$OLD_PIN"
  put_executable "$hubc" /home/cawco/.bun/install/global/node_modules/@opencode/cli/bin/opencode.exe < "$stub"
  put_executable "$hubc" /home/cawco/.bun/bin/bun < "$bun"
  as_user "$hubc" ln -s ../install/global/node_modules/@opencode/cli/bin/opencode.exe /home/cawco/.bun/bin/opencode2
  [[ "$(as_user "$hubc" /home/cawco/.bun/bin/opencode2 --version)" == "opencode v$OLD_PIN" ]]
}
# The hub's word on the machine's OpenCode: `<state> <method> <version>`.
opencode_row() { hub_api /api/agents | json "d => { const t = d.find(a => a.machineId === '$hid')?.tools?.opencode; return t ? [t.state, t.method, t.version].join(' ') : '' }"; }
pins_refused() {
  need_hub
  local agent
  as_user "$hubc" touch /home/cawco/bun-fails
  agent=$(agent_pid "$hubc")
  use_feed next
  learn
  install_now_request "$hid"
  wait_until 400 '[[ "$(phase $hid)" == failed && -n "$(field $hid error)" ]]'
  echo "its error: $(field $hid error)"
  as_user "$hubc" cat /home/cawco/bun-calls.log
  # One sentence, naming the tool, the build and bun, and bun's own words.
  [[ "$(field $hid error)" == "OpenCode $PIN, which $NEXT runs, did not go on with bun: error: GET https://registry.npmjs.org/@opencode%2fcli - 503" ]]
  as_user "$hubc" grep -q "^bun install -g --trust @opencode/cli@$PIN swaps=" /home/cawco/bun-calls.log
  # Nothing was applied: the build before runs on, its agent never restarted, and OpenCode is where it was.
  [[ "$(build_version $hid)" == $BASE ]]
  [[ "$(apply_starts "$hubc" "$NEXT")" == 0 ]]
  [[ "$(agent_pid "$hubc")" == "$agent" ]]
  [[ "$(as_user "$hubc" cat /home/cawco/opencode-version)" == "$OLD_PIN" ]]
}
pins_first() {
  need_hub
  local before
  before=$(as_user "$hubc" sh -c 'grep -c " swap " ~/.local/share/cawco/binary/apply.log 2> /dev/null || true')
  # bun works now: the command that failed stands, and tries the build again by itself after its delay.
  as_user "$hubc" rm -f /home/cawco/bun-fails
  wait_until 400 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]]'
  as_user "$hubc" cat /home/cawco/bun-calls.log
  # The last bun install, the one that worked, was the pin's, and ran before the swap to the build: apply.log held
  # no more swaps then than before the update, and holds one more now.
  [[ "$(as_user "$hubc" tail -n 1 /home/cawco/bun-calls.log)" == "bun install -g --trust @opencode/cli@$PIN swaps=${before:-0}" ]]
  [[ "$(as_user "$hubc" sh -c 'grep -c " swap " ~/.local/share/cawco/binary/apply.log')" == $(( ${before:-0} + 1 )) ]]
  [[ "$(as_user "$hubc" cat /home/cawco/opencode-version)" == "$PIN" ]]
  # The build's agent reads OpenCode installed with bun at the pin, no restart beyond the update's own; and once the
  # build is confirmed, what the pin replaced is no longer kept to put back.
  wait_until 120 '[[ "$(opencode_row)" == "installed bun $PIN" ]]'
  wait_until 180 'as_user "$hubc" test ! -e /home/cawco/.local/share/cawco/binary/pins-before.json'
}
export -f plant_bun_opencode opencode_row pins_refused pins_first
rig_pins() {
  export PIN OLD_PIN
  PIN=$(cd "$here/../.." && bun -e 'console.log((await import("./packages/core/src/tools.ts")).OPENCODE_VERSION)')
  OLD_PIN=$(bun -e "const p = '$PIN'.split('.').map(Number); p[p.length - 1] -= 1; console.log(p.join('.'))")
  fleet base "$BASE" hub
  setup "OpenCode on the hub's machine as a bun global one release below the pin, bun a stand-in" plant_bun_opencode
  setup_done
  check "an update to a build pinning a newer OpenCode, whose bun install fails, says why in one sentence and leaves the build before running" pins_refused 900
  check "with bun working the same update puts the pin on with bun before the swap, then applies, and the hub reads OpenCode installed with bun" pins_first 900 "an update to a build pinning a newer OpenCode, whose bun install fails, says why in one sentence and leaves the build before running"
}

# ---------------------------------------------------------------- a delegate workspace's boundary across an update
# A delegate's workspace on the joined machine, opened the product's own way: a session there delegates through the
# hub (`POST /api/work-items`, all `delegate` sends), the hub has the machine cut the clone and start its srt boundary
# (CONTROL_WORKSPACE_CREATE, packages/agent/src/workspace.ts), and the work item's session, the proof harness's held
# `sleep`, starts in it. Every command goes in through the workspace's executor, ~/.cawco/workspaces/<id>/exec, as
# every harness runs its shell commands. Then the machine updates with the workspace open and a dev server's listener
# running in it: the boundary is kept as it is while its work listens on a port, so the delegate's next command still
# reaches its server (each generation has a network of its own; 5be5bfbb, 2026-10-15). Once the listener stops, the
# boundary is handed over to a new generation on the new build's keeper, and the older one closes once nothing runs in
# it (boundary.ts replaceOlder, handOver, closeIdle). srt's host and ripgrep ship inside the build.
export WS_REPO=/home/cawco/proof-repo WS_ORIGIN=/home/cawco/proof-origin.git
ws_state() { echo "/home/cawco/.cawco/workspaces/$(cat "$rigdir/ws-id")"; }
ws_json() { as_user "$joinerc" sh -c 'cat "$1" 2> /dev/null || true' sh "$(ws_state)/$1" | json "$2"; }
ws_gen() { ws_json boundary.json 'd => d.gen'; }
# Runs one command through the workspace's executor, from its clone, as a harness's shell tool does.
ws_exec() { as_user "$joinerc" sh -c 'cd "$1" && exec "$2" "$3"' sh "$(cat "$rigdir/ws-clone")" "$(ws_state)/exec" "$1"; }
# A boundary generation's sandbox, as its srt host names it: `OUTER INNER IDLE...`.
ws_place() { as_user "$joinerc" cat "$(ws_state)/boundaries/$1/sandbox"; }
# Generation $1 still runs the sandbox whose init is $2. Its srt host starts the sandbox again, with everything in it
# gone, when a path it guards is renamed or unlinked on the host, which drops that path's bind inside
# (boundary-host.ts `guard`, then its loop), and the agent says the host's line naming the path ("[workspace] <id>:
# its boundary <pid> says: cawco: <path> was changed on the host, … so the sandbox <init> was stopped …",
# boundary.ts `watchHost`). If it has, says so with those lines.
ws_same_sandbox() {
  local now
  read -r _ now _ <<< "$(ws_place "$1")"
  [[ $now == "$2" ]] && return 0
  echo "ASSERTION FAILED: generation $1's srt host started its sandbox again after the handover, ending everything in it (its init was $2, now ${now:-none}); what its host said:"
  as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$(cat "$rigdir/ws-id"): its boundary .* says: " || echo "(the agent's log has no line of it)"
  return 1
}
ns_of() { as_user "$joinerc" readlink "/proc/$1/ns/pid"; }
# A listener a workspace command leaves behind as a dev server does: `setsid -f`, its own session, reparented to the
# sandbox's init once the command's shell ends. It answers each connection with an HTTP response whose body is the
# word it was started with ($1), so a preview reaches it as it reaches a dev server, and an answer names the
# listener that gave it. Its script lies in the workspace's scratch dir (socat's address syntax takes no `:` or `,`
# in a SYSTEM command).
WS_LISTENER_PORT=5199
ws_listener_start() {
  ws_exec "printf '%s\n' \"printf 'HTTP/1.0 200 OK\\\\r\\\\nContent-Type: text/plain\\\\r\\\\nConnection: close\\\\r\\\\n\\\\r\\\\n%s\\\\n' $1\" > \"\$TMPDIR/answer-$1.sh\" && setsid -f socat TCP-LISTEN:$WS_LISTENER_PORT,fork,reuseaddr SYSTEM:\"sh \$TMPDIR/answer-$1.sh\" < /dev/null > /dev/null 2>&1"
}
# The listener ws_listener_start $1 started: the oldest socat naming its answer script. Each connection it takes runs
# in a fork of it under the same command line, newer than it, and a connection to another listener (the older
# generation's, answering its preview) runs under that one's script: the newest match on the port alone was such a fork
# at times, outside the sandbox the check looked in (rig b5fda3adb: "the listener 3971 does not descend from the new
# sandbox's init 3560" while 3971 itself ran in that sandbox's cgroup).
ws_listener_pid() { as_user "$joinerc" pgrep -o -f "socat TCP-LISTEN:$WS_LISTENER_PORT,.*answer-$1\\.sh"; }
# What a command through the executor reads from the listener's port on its own loopback, as the delegate's own next
# curl reaches its dev server: each connection the listener takes answers at once, so socat needs to send nothing.
ws_exec_reach() { ws_exec "socat -T 5 - TCP:127.0.0.1:$WS_LISTENER_PORT < /dev/null" 2>&1 || true; }
# A listener is read only the way the owner reaches it: through the hub's preview of its port (ws_preview_says,
# ws_preview_by_host), the agent's bridge joining the sandbox's network. The rig never joins that network itself.
# (Nightly ee52c2d6f's `nsenter --target <init> --user --net` from a shell here, "reassociate to namespace 'ns/net'
# failed: Operation not permitted", was Ubuntu 24.04's nsenter entering the init's user namespace, not the one that
# owns its network, before the network: preview-bridge.ts's JOIN.)
#
# Why a preview gave no listener's answer, read from outside without joining anything: the listeners running, the TCP
# ports listened on in the network of the sandbox whose init is $1 (its /proc/<pid>/net/tcp, state 0A), and what the
# joined machine's agent said of previews.
ws_listener_why() {
  local hex ports=""
  echo "listeners running: $(as_user "$joinerc" pgrep -af "socat TCP-LISTEN:$WS_LISTENER_PORT" | tr '\n' ';')"
  for hex in $(as_user "$joinerc" cat "/proc/$1/net/tcp" | awk 'NR > 1 && $4 == "0A" { split($2, a, ":"); print a[2] }'); do
    ports+="$((16#$hex)) "
  done
  echo "ports listened on in $1's network: ${ports:-none}"
  echo "the joined machine's agent on previews:"
  as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep -iE "preview|bridge|the way into workspace" | tail -n 8 || true
}
# The delegate's identity as its shell has it: CAWCO_INSTANCE_ID and CAWCO_SESSION_CREDENTIAL from the environment of
# the process its session holds, which the proof harness starts with the env the Claude harness gives a real session
# (scripts/binary/proof-harnesses.ts, claude.ts `sessionEnv`), one NAME=value per line.
ws_session_env() {
  local pid
  pid=$(child_pids "$joinerc" "$(cat "$rigdir/ws-delegate")")
  [[ $pid =~ ^[0-9]+$ ]] || { echo "the delegate's session holds no one process: '$pid'" >&2; return 1; }
  as_user "$joinerc" cat "/proc/$pid/environ" | tr '\0' '\n' | grep -E '^CAWCO_(INSTANCE_ID|SESSION_CREDENTIAL)='
}
# One command through the workspace's executor from the delegate's shell, as its harness's shell tool runs one: the
# session's identity in the caller's environment, which the executor hands the command (boundary.ts execScript).
ws_exec_as_session() {
  local vars
  mapfile -t vars < <(ws_session_env)
  [[ " ${vars[*]} " == *" CAWCO_SESSION_CREDENTIAL="* && " ${vars[*]} " == *" CAWCO_INSTANCE_ID=$(cat "$rigdir/ws-delegate") "* ]] || { echo "ASSERTION FAILED: the delegate's process carries not both its id and its credential: ${vars[*]%%=*}" >&2; return 1; }
  as_user "$joinerc" env "${vars[@]}" sh -c 'cd "$1" && exec "$2" "$3"' sh "$(cat "$rigdir/ws-clone")" "$(ws_state)/exec" "$1"
}
# The workspace preview's server, as a delegate names it: the command CawCo's stage runs and keeps up on its port
# (artifact_create's `serve`, agent stage.ts `ensureServed`), never a shell of the delegate's. It answers each
# connection with `served` and the pid namespace it runs in, so an answer names the boundary generation the stage
# started it in. Its answer script lies in the workspace's scratch dir, written once by a command (ws_served_script);
# socat's EXEC runs it with no shell, so the command has no quote and no space in its address.
WS_SERVED_PORT=5198
WS_SERVED_ANSWER='printf '"'"'HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nserved %s\n'"'"' "$(readlink /proc/self/ns/pid)"'
ws_served_script() { ws_exec "printf '%s\n' '#!/bin/sh' $(printf %q "$WS_SERVED_ANSWER") > \"\$TMPDIR/served.sh\" && chmod +x \"\$TMPDIR/served.sh\""; }
# The served listener's own process: the socat whose argv carries the expanded port (its executor's and its shell's
# carry `$PORT` unexpanded), the oldest of its forks.
ws_served_pid() { as_user "$joinerc" pgrep -o -f "^socat TCP-LISTEN:$WS_SERVED_PORT,"; }
# The workspace's preview of its server, opened as the delegate opens one: its `artifact_create` tool, called from its
# shell through the workspace's tool door (`cawco tool`, packages/cli/src/tools.ts), naming what serves the port. Its
# answer is kept in $rigdir/ws-preview-open: its record (`--record`, the hub's record as one line of JSON, core
# tool-answer.ts), whose id closes it. The hub's preview port for it is read as the dashboard learns it.
ws_preview_open() { ws_exec_as_session "/home/cawco/.local/bin/cawco tool artifact_create --record '{\"kind\":\"preview\",\"does\":\"try\",\"ask\":\"Try the served page and say whether it answers\",\"name\":\"proof-served\",\"port\":$WS_SERVED_PORT,\"serve\":{\"command\":\"socat TCP-LISTEN:\$PORT,fork,reuseaddr EXEC:\$TMPDIR/served.sh\"}}'" > "$rigdir/ws-preview-open"; cat "$rigdir/ws-preview-open"; }
# The delegate removes that preview (artifact_delete): its server's last artifact, so the stage stops it.
ws_preview_close() {
  local id
  id=$(grep -E '^[{]' "$rigdir/ws-preview-open" | tail -n 1 | json '(d) => d.id')
  [[ $id =~ ^[0-9a-f-]{36}$ ]] || { echo "the preview's create answered no record with an id: $(cat "$rigdir/ws-preview-open")"; return 1; }
  # tool answer: words (it only has to succeed)
  ws_exec_as_session "/home/cawco/.local/bin/cawco tool artifact_delete '{\"id\":\"$id\"}'"
}
ws_preview_port() { run_script "$hubc" /shared/stage2-preview-port.ts http://127.0.0.1:3456 "$(cat "$rigdir/ws-delegate")"; }
# What the preview answers, through the hub's preview listener, the joined machine's agent and its bridge.
ws_preview_says() { as_user "$hubc" curl -sS --max-time 10 "http://127.0.0.1:$(cat "$rigdir/ws-preview-port")/" 2>&1 || true; }
# Host mode, the owner's: one listener on the preview range's first port routes each request by its Host, a name of
# the fleet's pattern (preview.ts sessionOfHost), behind the lock (preview-access.ts). Set as Settings › Previews and
# Caw's admin_previews_write set it (PUT /api/preview-settings), localtest.me names (every one is 127.0.0.1 in public
# DNS; the save checks one of them resolves, which the hub machine's hosts file answers here: $preview_name), on https
# as host mode takes them (a proxy in front serves TLS; here curl reaches the listener's plain port); $1 host or port.
ws_preview_mode() {
  local first body
  first=$(hub_api /api/preview-settings | json 'd => d.ports.split(/\D+/)[0]')
  [[ $first == "$preview_first" ]] || { echo "the hub's first preview port is $first, and the hub machine's hosts file names $preview_name: correct preview_first"; return 1; }
  body="{\"mode\":\"$1\"}"
  [[ $1 == port ]] || body="{\"mode\":\"host\",\"pattern\":\"https://p-{port}.localtest.me:$first\"}"
  as_user "$hubc" curl -sS -w '\nHTTP %{http_code}' -X PUT http://127.0.0.1:3456/api/preview-settings -H 'content-type: application/json' -d "$body"
}
# The preview's host-mode name (`p-<port>.localtest.me:<listener port>`), as the hub gives a client its origin.
ws_preview_host() { ws_post "/api/instances/$(cat "$rigdir/ws-delegate")/preview-address" '{}' | sed '$d' | json 'd => d.host'; }
# One request to the preview's host-mode name ($1), with the pass cookie $2 or none: its body, then `HTTP <status>`.
ws_preview_by_host() {
  local host=$1 cookie=${2:-}
  as_user "$hubc" curl -sS --max-time 10 -w '\nHTTP %{http_code}' -H "Host: $host" ${cookie:+-H "Cookie: $cookie"} "http://127.0.0.1:${host##*:}/" 2>&1 || true
}
# Enters the preview's host-mode name ($1) as the app's web view does: a ticket from the hub's API
# (POST /api/preview-ticket), spent at /__cawco/enter, whose 302 sets the pass. Prints the pass cookie (`name=value`).
ws_preview_enter() {
  local host=$1 ticket headers
  ticket=$(ws_post "/api/preview-ticket" '{}' | sed '$d' | json 'd => d.ticket')
  [[ -n $ticket ]] || { echo "no ticket from the hub" >&2; return 1; }
  headers=$(as_user "$hubc" curl -sS --max-time 10 -D - -o /dev/null -H "Host: $host" "http://127.0.0.1:${host##*:}/__cawco/enter?ticket=$ticket&next=/" | tr -d '\r')
  [[ $(head -1 <<< "$headers") == *" 302"* ]] || { echo "the entry answered: $headers" >&2; return 1; }
  grep -i '^set-cookie: __Secure-cawco-pass=' <<< "$headers" | sed 's/^[^:]*: *//; s/;.*//'
}
# Every process that descends from the sandbox init $1, by each one's parent: the tree boundary.ts inTree judges.
ws_tree() { as_user "$joinerc" ps -e -o pid=,ppid= | awk -v root="$1" '{ parent[$1] = $2 } END { tree[root] = 1; do { grew = 0; for (p in parent) if (!(p in tree) && (parent[p] in tree)) { tree[p] = 1; grew = 1 } } while (grew); for (p in tree) print p }'; }
# The process $1 and each of its parents up to the machine's init: pid, parent, start, pid namespace, cgroup and
# command line (its first 200 characters, on one line), read on the joined machine in one pass.
ws_ancestry() {
  as_user "$joinerc" sh -c 'p=$1
while [ "${p:-0}" -gt 1 ]; do
  printf "%s ns=%s cgroup=%s: %s\n" "$(ps -o pid=,ppid=,lstart= -p "$p")" "$(readlink "/proc/$p/ns/pid")" "$(tail -n 1 "/proc/$p/cgroup")" "$(tr "\0\n" "  " < "/proc/$p/cmdline" | cut -c1-200)"
  p=$(ps -o ppid= -p "$p" | tr -d " ")
done' sh "$1" 2>&1
}
# The listener $1 descends from the sandbox init $2 (ws_tree). The tree is read whole into a variable, with its own
# exit status, before anything else runs: nothing reads it from a pipe. `ws_tree | grep -qx "$(ws_listener_pid …)"`
# did, and the substitution ran in the pipe's reading end, so its as_user, then a `podman exec -i`, took that pipe as its
# stdin and read from it at once (podman #24370: "As soon as podman exec is launched it spawns a goroutine that reads
# data from stdin"), leaving grep part of the tree or none, at times: rig ee79a01ea's "the listener 3971 does not
# descend from the new sandbox's init 3560", and 06ef5d1ac run 6's "the listener 4126 does not descend from the new
# sandbox's init 4003", each with the listener in that sandbox. A listener outside the tree is said with its parents.
ws_descends() {
  local tree rc=0
  tree=$(ws_tree "$2") || rc=$?
  (( rc == 0 )) || { echo "ASSERTION FAILED: the joined machine's process table could not be read (exit $rc)"; return 1; }
  grep -qx "$1" <<< "$tree" && return 0
  echo "ASSERTION FAILED: the listener $1 does not descend from the sandbox's init $2, whose tree is $(tr '\n' ' ' <<< "$tree"); the listener and its parents:"
  ws_ancestry "$1"
  return 1
}
# A POST to the hub, answering its body and a last line `HTTP <status>`, so a refusal shows the hub's words.
ws_post() { as_user "$hubc" curl -sS -w '\nHTTP %{http_code}' "http://127.0.0.1:3456$1" -X POST -H 'content-type: application/json' -d "$2"; }
# The delegate's tool call that holds its work item open, a line of a message its stub runs as the session does
# (proof-harnesses.ts toolCalls): a declared wait, which the hub's turn-end rule honours in place of the quiet-turn
# reminders (work-items.ts waitingTurn), as a real delegate holds an item open on a command it started. Each message the
# session takes after the wait ended (a busy turn clears a wait at rest, work-items.ts turnState) declares it again.
# Exported: each check runs in a shell of its own, which sees only what is exported.
# tool answer: words (the transcript is matched for wait_item's own words)
export WS_WAIT_LINE='cawco tool wait_item {"minutes":60,"reason":"the stage 2 proof holds this item open across an update"}'
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
    [[ $said != *cawco-proof-secret* && $said != *sk-ant-* ]] || { echo "ASSERTION FAILED: the command printed what $file holds"; return 1; }
  done
}
# Hands a shell call to the workspace's hook every second, as a work item's claude session does before each Bash
# call, and runs the command the hook rewrote it to (stage2-hook-calls.ts), until ws_hook_calls_stop; one line per
# call in $rigdir/ws-hook-calls.txt.
ws_hook_calls_start() {
  as_user "$joinerc" rm -f /tmp/ws-hook-calls.stop
  # The caller's own words only: the check's trace is off in the subshell (see update_outcomes_start's sender).
  local state clone
  state=$(ws_state)
  clone=$(cat "$rigdir/ws-clone")
  ( set +x; run_script "$joinerc" /shared/stage2-hook-calls.ts "$state" "$clone" /tmp/ws-hook-calls.stop > "$rigdir/ws-hook-calls.txt" 2>&1 ) &
  wait_until 30 'grep -q " ran$" "$rigdir/ws-hook-calls.txt"'
}
ws_hook_calls_stop() {
  as_user "$joinerc" touch /tmp/ws-hook-calls.stop
  wait_until 30 'grep -q "^done " "$rigdir/ws-hook-calls.txt"'
}
# Every call the hook was handed was answered by a live judge and ran, and calls fell in the window between the new
# build's agent starting and its deciding the workspace's boundary, whose work listens on a port, stays as it is
# rather than being handed over: the agent's first journal line and its "is kept as it is while its work listens on"
# line for this workspace (boundary.ts replaceOlder).
ws_hook_calls_answered() {
  local window from to inside
  window=$(as_user "$joinerc" journalctl --user --no-pager -o json -u cawco-agent.service | jsonl "d => { const said = (e) => typeof e.MESSAGE === 'string' ? e.MESSAGE : ''; const h = d.filter(e => said(e).includes('$(cat "$rigdir/ws-id"): its boundary ') && said(e).includes(' is kept as it is while its work listens on $WS_LISTENER_PORT')).at(-1); if (!h) return; const first = d.find(e => e._PID === h._PID); const ms = (e) => Math.floor(Number(e.__REALTIME_TIMESTAMP) / 1000); return ms(first) + ' ' + ms(h); }")
  read -r from to <<< "$window"
  [[ ${from:-} =~ ^[0-9]+$ && ${to:-} =~ ^[0-9]+$ ]] || { echo "ASSERTION FAILED: the agent's journal does not say it keeps the workspace's boundary while its listener runs"; return 1; }
  inside=$(awk -v from="$from" -v to="$to" '$1 ~ /^[0-9]+$/ && $1 >= from && $1 <= to' "$rigdir/ws-hook-calls.txt" | wc -l)
  echo "the new build's agent started at $from ms and kept the boundary as it is at $to ms; $inside calls went through the hook between them"
  (( inside >= 1 )) || { echo "ASSERTION FAILED: no call went through the hook between the agent's start and its keeping the boundary"; return 1; }
  ws_hook_calls_clean
}
# No call the hook was handed so far was refused or failed to run: every line but the last is `<ms> ran`.
ws_hook_calls_clean() {
  local bad
  bad=$(grep -vE '^[0-9]+ ran$|^done calls=' "$rigdir/ws-hook-calls.txt" || true)
  [[ -z $bad ]] || { echo "ASSERTION FAILED: calls through the workspace's hook were refused or did not run:"; echo "$bad"; return 1; }
}
# The calls through the hook since $1 (epoch ms).
ws_hook_calls_after() { awk -v t="$1" '$1 ~ /^[0-9]+$/ && $1 > t' "$rigdir/ws-hook-calls.txt" | wc -l; }
# The workspace's judge answers after the update, as before it: the calls begun before the joined machine's update
# (ws_hook_calls_start, one a second) go on through it, through the boundary kept as it is while its listener runs,
# the older keeper retiring and answering its listing late, and the boundary's handover to the new build's form once
# the listener stops, and every one was answered by a live judge and ran, at least 20 of them after the update was
# installed. The calls end here.
ws_judge_answers_after_update() {
  local installed
  [[ -s "$rigdir/ws-installed-at" ]] || { echo "ASSERTION FAILED: the update's check ended before the joined machine had installed it, with its hook calls running"; return 1; }
  installed=$(cat "$rigdir/ws-installed-at")
  wait_until 120 '(( $(ws_hook_calls_after "$installed") >= 20 ))' \
    || { echo "ASSERTION FAILED: $(ws_hook_calls_after "$installed") calls went through the hook in the 120 s after the update was installed, one a second asked"; tail -n 20 "$rigdir/ws-hook-calls.txt"; return 1; }
  ws_hook_calls_stop
  echo "$(ws_hook_calls_after "$installed") calls went through the hook after the update was installed; $(tail -n 1 "$rigdir/ws-hook-calls.txt")"
  ws_hook_calls_clean
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
    printf "proof\n" > README.md
    git add README.md
    git -c user.name=proof -c user.email=proof@cawco.test commit -qm "A repository to delegate in"
    git remote add origin "$2"
    git push -q origin main' sh "$WS_REPO" "$WS_ORIGIN"
  # The session that delegates, on the joined machine.
  start_session "$jid" wsparent-1 > /dev/null
  wait_until 60 'session_running wsparent-1'
  # Its prompt names the wait the delegate declares in its first turn, which holds its item open (WS_WAIT_LINE).
  answer=$(ws_post /api/work-items "{\"parentInstanceId\":\"wsparent-1\",\"title\":\"Prove the workspace boundary\",\"prompt\":$(printf '%s\n%s' "The stage 2 proof's workspace." "$WS_WAIT_LINE" | json_string),\"harness\":\"claude\",\"model\":\"stub\",\"cwd\":\"$WS_REPO\",\"machineId\":\"$jid\",\"lands\":\"none\",\"checks\":[{\"name\":\"Run true\",\"command\":\"true\"}]}")
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
  [[ "$(ws_exec 'cat README.md')" == proof ]]
  [[ "$(ws_exec 'printf %s "$CAWCO_WORKSPACE"')" == "$id" ]]
  read -r outer inner _ <<< "$(ws_place "$gen")"
  [[ "$(ws_exec 'readlink /proc/self/ns/pid')" == "$(ns_of "$inner")" ]]
  [[ "$(ns_of "$inner")" != "$(as_user "$joinerc" readlink /proc/self/ns/pid)" ]]
  # A credential planted in the home dir, which the host reads, and the account's own: neither reads inside.
  as_user "$joinerc" sh -c 'mkdir -p -m 700 "$HOME/.ssh" && umask 077 && printf "%s\n" "$1" > "$HOME/.ssh/id_ed25519"' sh "cawco-proof-secret-$RANDOM$RANDOM"
  as_user "$joinerc" grep -q cawco-proof-secret /home/cawco/.ssh/id_ed25519
  ws_cannot_read
}
workspace_across_update() {
  need_hub
  local id gen old_inner old_ns job listener new new_inner answer token
  id=$(cat "$rigdir/ws-id")
  gen=$(ws_gen)
  read -r _ old_inner _ <<< "$(ws_place "$gen")"
  old_ns=$(ns_of "$old_inner")
  # A job one command leaves running in the workspace: the command ends, the job runs on in the sandbox.
  ws_exec 'nohup sleep 2999 > /dev/null 2>&1 &'
  wait_until 30 '[[ "$(as_user "$joinerc" pgrep -fx "sleep 2999" | wc -l)" == 1 ]]'
  job=$(as_user "$joinerc" pgrep -fx 'sleep 2999')
  [[ "$(ns_of "$job")" == "$old_ns" ]]
  # And a listener one command leaves behind with `setsid -f`, as a delegate starts the dev server a preview shows.
  ws_listener_start gen-old
  wait_until 30 '[[ "$(ws_listener_pid gen-old)" =~ ^[0-9]+$ ]]' || { echo "ASSERTION FAILED: no listener runs after the command that started it ended"; ws_listener_why "$old_inner"; return 1; }
  listener=$(ws_listener_pid gen-old)
  ws_descends "$listener" "$old_inner" || return 1
  # The delegate shows its server as a preview that names what serves it: CawCo's stage runs it in this generation, and
  # the owner reaches it through the hub, the joined machine's agent and its bridge into the sandbox's network.
  ws_served_script
  ws_preview_open
  [[ "$(ws_served_pid)" =~ ^[0-9]+$ ]] || { echo "ASSERTION FAILED: no served listener runs once its preview was made: $(cat "$rigdir/ws-preview-open")"; return 1; }
  ws_descends "$(ws_served_pid)" "$old_inner" || return 1
  wait_until 60 'ws_preview_port > "$rigdir/ws-preview-port" 2> "$rigdir/ws-preview-port.err"' || { cat "$rigdir/ws-preview-port.err"; return 1; }
  echo "the preview is served on the hub's port $(cat "$rigdir/ws-preview-port")"
  wait_until 60 '[[ "$(ws_preview_says)" == *"served '"$old_ns"'"* ]]' || { echo "the preview answered: $(ws_preview_says)"; ws_listener_why "$old_inner"; return 1; }
  # The delegate's work item is live going into the update.
  ws_item_live || { echo "ASSERTION FAILED: before the update the work item is $(ws_item_says)"; return 1; }
  echo "before the update the work item is $(ws_item_says)"
  # The person's side of both updates (update_outcomes_start): the session that delegated, running before them; a
  # message to it every 3 s through the hub's own restart and the joined machine's update, until the delegate has
  # answered after it; and the joined machine's sign-in, its Claude Code answering late.
  update_outcomes_start "$joinerc" "$jid" wsparent-1
  on_exit update_sends_stop
  # The new build reaches the hub's machine, then the joined machine, which installs it with the workspace open.
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  wait_until 400 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]]'
  learn
  wait_until 120 '[[ "$(field $jid availableVersion)" == $NEXT ]]'
  # From before the install, a shell call goes through the workspace's hook every second: the window between the
  # agent restarting and the new build's keeper taking the machine among them. The calls go on past this check, until
  # the judge's own check after it (ws_judge_answers_after_update) ends them.
  ws_hook_calls_start
  install_now_request "$jid" > /dev/null
  wait_until 400 '[[ "$(build_version $jid)" == $NEXT && "$(phase $jid)" == installed ]]'
  now_ms > "$rigdir/ws-installed-at"
  # The job ran through the update: the same process, in the sandbox it started in.
  as_user "$joinerc" kill -0 "$job"
  [[ "$(ns_of "$job")" == "$old_ns" ]]
  # The new build's agent finds the boundary of the older build's form with its work listening on the port, and keeps
  # it as it is: handing it over would put every next command in a new network where nothing listens. (The preview's
  # served server listens in it too once the stage starts it again, so the ports it names may be both.)
  wait_until 180 'as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep -q "'"$id"': its boundary .* is kept as it is while its work listens on .*'"$WS_LISTENER_PORT"'"' || { echo "ASSERTION FAILED: the new build's agent did not say it keeps the boundary while its listener runs"; as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$id" | tail -n 8; return 1; }
  as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$id: its boundary .* is kept as it is while its work listens on .*$WS_LISTENER_PORT" | tail -n 1
  # Through all of it, no call the hook was handed was refused.
  ws_hook_calls_answered
  # The generation is the one it had, its srt host still held, nothing retiring beside it, and the next command runs in
  # its sandbox, reading no credential.
  [[ "$(ws_gen)" == "$gen" ]] || { echo "ASSERTION FAILED: the boundary was handed over to $(ws_gen) while its listener ran"; return 1; }
  [[ "$(child_pids "$joinerc" "boundary-$id-$gen")" =~ ^[0-9]+$ ]]
  ! as_user "$joinerc" test -e "$(ws_state)/retiring-$gen.json" || { echo "ASSERTION FAILED: generation $gen is retiring while its listener runs"; return 1; }
  [[ "$(ws_exec 'readlink /proc/self/ns/pid')" == "$old_ns" ]] || { echo "ASSERTION FAILED: the next command ran outside the sandbox its listener runs in"; return 1; }
  answer=$(ws_exec_reach)
  [[ "$answer" == *gen-old* ]] || { echo "ASSERTION FAILED: the next command reached no listener on its port: $answer"; ws_listener_why "$old_inner"; return 1; }
  [[ "$(ws_exec 'cat README.md')" == proof ]]
  ws_cannot_read
  # The update failed nothing: both machines are on the new build, and the delegate's work item is still running, its
  # session attached and answering. A message reaches it and is answered, and its turn declares its wait again.
  ws_item_live || { echo "ASSERTION FAILED: after the update the work item is $(ws_item_says)"; return 1; }
  echo "after the update the work item is $(ws_item_says)"
  session_running "$(cat "$rigdir/ws-delegate")" || { echo "ASSERTION FAILED: after the update the delegate's session is $(hub_api /api/instances | json "d => d.find(r => r.id === '$(cat "$rigdir/ws-delegate")')?.status")"; return 1; }
  token="ws-after-update-$RANDOM$RANDOM"
  send_message "$jid" "$(cat "$rigdir/ws-delegate")" "$(printf '%s\n%s' "$token" "$WS_WAIT_LINE")"
  wait_until 60 '[[ "$(transcript_of "$(cat "$rigdir/ws-delegate")")" == *"proof answered: '"$token"'"*"wait_item: Prove the workspace boundary is waiting until"* ]]' || { echo "ASSERTION FAILED: the delegate did not answer after the update: $(transcript_of "$(cat "$rigdir/ws-delegate")" | tail -c 2000)"; return 1; }
  echo "the delegate answered $token after the update"
  ws_item_live || { echo "ASSERTION FAILED: after its answer the work item is $(ws_item_says)"; return 1; }
  echo "after its answer the work item is $(ws_item_says)"
  update_sends_stop
  # The listener ran through the update. The preview, started again by the hub at the new agent's register, answers
  # from its server, which the new agent's stage keeps or starts again at the preview's first request, in the
  # generation kept for the listener (the session's port is read again, as a dashboard learns it after the hub's own
  # restart).
  as_user "$joinerc" kill -0 "$listener"
  wait_until 60 'ws_preview_port > "$rigdir/ws-preview-port" 2> "$rigdir/ws-preview-port.err"' || { cat "$rigdir/ws-preview-port.err"; return 1; }
  wait_until 90 '[[ "$(ws_preview_says)" == *"served '"$old_ns"'"* ]]' || { echo "the preview answered: $(ws_preview_says)"; ws_listener_why "$old_inner"; return 1; }
  echo "after the update the preview's server is $(ws_served_pid), in $old_ns"
  # With the job gone, the listener alone keeps the boundary as it is: through four of the agent's looks at it
  # (boundary.ts STALE_LOOK_MS, 5 s), its generation, its sandbox and the listener's answer stay, nothing retires, and
  # the next command still reaches the listener.
  as_user "$joinerc" kill "$job"
  sleep 20
  [[ "$(ws_gen)" == "$gen" ]] || { echo "ASSERTION FAILED: the boundary was handed over to $(ws_gen) while the setsid listener ran in it"; return 1; }
  ! as_user "$joinerc" test -e "$(ws_state)/retiring-$gen.json" || { echo "ASSERTION FAILED: generation $gen is retiring while the setsid listener runs in it"; return 1; }
  as_user "$joinerc" kill -0 "$old_inner"
  as_user "$joinerc" kill -0 "$listener"
  answer=$(ws_exec_reach)
  [[ "$answer" == *gen-old* ]] || { echo "ASSERTION FAILED: with the job gone the next command reached no listener: $answer"; ws_listener_why "$old_inner"; return 1; }
  wait_until 60 '[[ "$(ws_preview_says)" == *"served '"$old_ns"'"* ]]' || { echo "the preview answered: $(ws_preview_says)"; ws_listener_why "$old_inner"; return 1; }
  # The same in host mode, the owner's: a request without a pass gets the lock's 401 page; one with the pass a
  # ticket bought reaches the listener in the generation kept for it.
  answer=$(ws_preview_mode host)
  echo "the hub answered host mode: $answer"
  [[ "$answer" == *"HTTP 200" ]]
  on_exit 'ws_preview_mode port > /dev/null'
  ws_preview_host > "$rigdir/ws-preview-host"
  [[ "$(cat "$rigdir/ws-preview-host")" == p-*.localtest.me:* ]] || { echo "the preview's host-mode name: '$(cat "$rigdir/ws-preview-host")'"; return 1; }
  answer=$(ws_preview_by_host "$(cat "$rigdir/ws-preview-host")")
  [[ "$answer" == *"HTTP 401" && "$answer" == *cawco-preview-locked* ]] || { echo "ASSERTION FAILED: a request without a pass got: $answer"; return 1; }
  ws_preview_enter "$(cat "$rigdir/ws-preview-host")" > "$rigdir/ws-preview-pass"
  [[ "$(cat "$rigdir/ws-preview-pass")" == __Secure-cawco-pass=* ]] || { echo "the entry set no pass: '$(cat "$rigdir/ws-preview-pass")'"; return 1; }
  wait_until 60 '[[ "$(ws_preview_by_host "$(cat "$rigdir/ws-preview-host")" "$(cat "$rigdir/ws-preview-pass")")" == *"served '"$old_ns"'"*"HTTP 200" ]]' || { echo "host mode answered: $(ws_preview_by_host "$(cat "$rigdir/ws-preview-host")" "$(cat "$rigdir/ws-preview-pass")")"; return 1; }
  # The preview goes first, its server with it: a boundary is kept while any of its work listens, the served server's
  # too, and the stage stops a server once its last artifact goes.
  ws_preview_close
  wait_until 30 '[[ -z "$(ws_served_pid)" ]]' || { echo "ASSERTION FAILED: the served listener $(ws_served_pid) runs on after its preview was removed"; return 1; }
  # The listener stops, as a delegate stops its dev server: at the agent's next look the boundary is handed over to a
  # generation of the new build's form, held by the new build's keeper, and the older one, nothing left running in
  # it, closes: its sandbox, its srt host, its record and its files go.
  as_user "$joinerc" pkill -f "socat TCP-LISTEN:$WS_LISTENER_PORT,.*answer-gen-old\\.sh"
  wait_until 60 '[[ -n "$(ws_gen)" && "$(ws_gen)" != "'"$gen"'" ]]' || { echo "ASSERTION FAILED: the boundary was not handed over once its listener stopped"; as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$id" | tail -n 8; return 1; }
  new=$(ws_gen)
  echo "generation $gen is handed over to $new"
  as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$id: its boundary .* is handed over to"
  as_user "$joinerc" test -s "$(ws_state)/boundaries/$new/srt.json"
  wait_until 60 '[[ "$(holder_of "$joinerc" "boundary-'"$id"'-'"$new"'")" == "$(endpoint_of $NEXT)" ]]'
  wait_until 120 '[[ -z "$(child_pids "$joinerc" "boundary-'"$id"'-'"$gen"'")" ]] && ! as_user "$joinerc" test -e "$(ws_state)/retiring-'"$gen"'.json" && ! as_user "$joinerc" test -e "$(ws_state)/boundaries/'"$gen"'"'
  ! as_user "$joinerc" kill -0 "$old_inner" 2> /dev/null
  ! as_user "$joinerc" kill -0 "$listener" 2> /dev/null
  as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$id: its older boundary .* has nothing left running in it and is closed"
  # The next command runs in the new generation's sandbox, and still reads no credential.
  read -r _ new_inner _ <<< "$(ws_place "$new")"
  [[ "$(ws_exec 'readlink /proc/self/ns/pid')" == "$(ns_of "$new_inner")" ]]
  [[ "$(ns_of "$new_inner")" != "$old_ns" ]]
  [[ "$(ws_exec 'cat README.md')" == proof ]]
  ws_cannot_read
  # The delegate starts its server again, on the same port, in the new generation.
  ws_listener_start gen-new
  wait_until 30 '[[ "$(ws_listener_pid gen-new)" =~ ^[0-9]+$ ]]' || { echo "ASSERTION FAILED: no second listener runs after the command that started it ended"; ws_listener_why "$new_inner"; return 1; }
  ws_same_sandbox "$new" "$new_inner"
  ws_descends "$(ws_listener_pid gen-new)" "$new_inner" || return 1
  answer=$(ws_exec_reach)
  [[ "$answer" == *gen-new* ]] || { echo "ASSERTION FAILED: the next command reached no listener in the new generation: $answer"; ws_listener_why "$new_inner"; return 1; }
  # The delegate shows its server again, and the stage runs it in the new generation. The session's preview reaches it
  # there: in host mode with the same pass, then by port once the fleet is back in port mode.
  ws_preview_open
  [[ "$(ws_served_pid)" =~ ^[0-9]+$ ]] || { echo "ASSERTION FAILED: no served listener runs once its preview was made again: $(cat "$rigdir/ws-preview-open")"; return 1; }
  ws_descends "$(ws_served_pid)" "$new_inner" || return 1
  wait_until 60 '[[ "$(ws_preview_by_host "$(cat "$rigdir/ws-preview-host")" "$(cat "$rigdir/ws-preview-pass")")" == *"served '"$(ns_of "$new_inner")"'"*"HTTP 200" ]]' || { echo "host mode answered: $(ws_preview_by_host "$(cat "$rigdir/ws-preview-host")" "$(cat "$rigdir/ws-preview-pass")")"; ws_listener_why "$new_inner"; return 1; }
  [[ "$(ws_preview_by_host "$(cat "$rigdir/ws-preview-host")")" == *"HTTP 401" ]] || { echo "ASSERTION FAILED: host mode answered a request without a pass"; return 1; }
  answer=$(ws_preview_mode port)
  echo "the hub answered port mode: $answer"
  [[ "$answer" == *"HTTP 200" ]]
  # The session's port is read again, as a dashboard learns it: host mode bars the range's first port to sessions, so
  # a session that kept it moved to another as host mode began, and keeps that one (packages/hub/src/preview.ts
  # `barred`, `portFor`).
  wait_until 60 'ws_preview_port > "$rigdir/ws-preview-port" 2> "$rigdir/ws-preview-port.err"' || { cat "$rigdir/ws-preview-port.err"; return 1; }
  echo "back in port mode the preview is served on the hub's port $(cat "$rigdir/ws-preview-port")"
  wait_until 60 '[[ "$(ws_preview_says)" == *"served '"$(ns_of "$new_inner")"'"* ]]' || { echo "the preview answered: $(ws_preview_says)"; ws_listener_why "$new_inner"; return 1; }
  # The current one is untouched: the same generation, running the sandbox it started with.
  [[ "$(ws_gen)" == "$new" ]]
  ws_same_sandbox "$new" "$new_inner"
  [[ "$(child_pids "$joinerc" "boundary-$id-$new")" =~ ^[0-9]+$ ]]
  [[ "$(ws_exec 'readlink /proc/self/ns/pid')" == "$(ns_of "$new_inner")" ]]
}
# The archive's workspace, a rig of its own (wsarchive): opened, then both machines update with it open and nothing
# running in it, so the delegate's next command runs and its boundary is handed over to a generation of the new
# build's form, held by the new build's keeper. There the delegate starts its server again (a `setsid -f` listener)
# and shows it as a preview the stage serves, answering by port: what the archive ends is a post-update generation's,
# as an owner's workspace is once the fleet has updated under it.
workspace_updated_serving() {
  need_hub
  local id gen new new_inner
  id=$(cat "$rigdir/ws-id")
  gen=$(ws_gen)
  use_feed next
  learn
  install_now_request "$hid" > /dev/null
  wait_until 400 '[[ "$(build_version $hid)" == $NEXT && "$(phase $hid)" == installed ]]'
  learn
  wait_until 120 '[[ "$(field $jid availableVersion)" == $NEXT ]]'
  install_now_request "$jid" > /dev/null
  wait_until 400 '[[ "$(build_version $jid)" == $NEXT && "$(phase $jid)" == installed ]]'
  [[ "$(ws_exec 'cat README.md')" == proof ]]
  wait_until 120 '[[ -n "$(ws_gen)" && "$(ws_gen)" != "'"$gen"'" ]]' || { echo "ASSERTION FAILED: the boundary was not handed over to the new build's form after the update"; as_user "$joinerc" journalctl --user --no-pager -u cawco-agent.service | grep "$id" | tail -n 8; return 1; }
  new=$(ws_gen)
  echo "generation $gen is handed over to $new"
  wait_until 60 '[[ "$(holder_of "$joinerc" "boundary-'"$id"'-'"$new"'")" == "$(endpoint_of $NEXT)" ]]'
  read -r _ new_inner _ <<< "$(ws_place "$new")"
  [[ "$(ws_exec 'readlink /proc/self/ns/pid')" == "$(ns_of "$new_inner")" ]]
  ws_listener_start gen-new
  wait_until 30 '[[ "$(ws_listener_pid gen-new)" =~ ^[0-9]+$ ]]' || { echo "ASSERTION FAILED: no listener runs after the command that started it ended"; ws_listener_why "$new_inner"; return 1; }
  ws_descends "$(ws_listener_pid gen-new)" "$new_inner" || return 1
  ws_served_script
  ws_preview_open
  [[ "$(ws_served_pid)" =~ ^[0-9]+$ ]] || { echo "ASSERTION FAILED: no served listener runs once its preview was made: $(cat "$rigdir/ws-preview-open")"; return 1; }
  ws_descends "$(ws_served_pid)" "$new_inner" || return 1
  wait_until 60 'ws_preview_port > "$rigdir/ws-preview-port" 2> "$rigdir/ws-preview-port.err"' || { cat "$rigdir/ws-preview-port.err"; return 1; }
  wait_until 60 '[[ "$(ws_preview_says)" == *"served '"$(ns_of "$new_inner")"'"* ]]' || { echo "the preview answered: $(ws_preview_says)"; ws_listener_why "$new_inner"; return 1; }
  ws_item_live || { echo "ASSERTION FAILED: after the update the work item is $(ws_item_says)"; return 1; }
}
# Archiving the workspace ends everything its boundary started: a `setsid -f` listener and every other process that
# descends from its sandbox's init, with the sandbox itself (boundary.ts closeBoundary).
workspace_archive_ends_all() {
  need_hub
  local id gen inner listener served tree answer left pid
  id=$(cat "$rigdir/ws-id")
  gen=$(ws_gen)
  read -r _ inner _ <<< "$(ws_place "$gen")"
  # The `setsid -f` listener started in this post-update generation, and the preview's server the stage runs there,
  # answering its preview by port (workspace_updated_serving).
  wait_until 60 '[[ "$(ws_preview_says)" == *"served '"$(ns_of "$inner")"'"* ]]' || { echo "the preview answered: $(ws_preview_says)"; ws_listener_why "$inner"; return 1; }
  listener=$(ws_listener_pid gen-new)
  served=$(ws_served_pid)
  tree=$(ws_tree "$inner")
  grep -qx "$listener" <<< "$tree" || { echo "ASSERTION FAILED: the listener $listener does not descend from the sandbox's init $inner"; return 1; }
  grep -qx "$served" <<< "$tree" || { echo "ASSERTION FAILED: the preview's served listener $served does not descend from the sandbox's init $inner"; return 1; }
  echo "the sandbox's tree before the archive: $(tr '\n' ' ' <<< "$tree")"
  # The delegate's work item is live (its declared wait holds it open), and a workspace with a live work item refuses
  # its archive before it ends anything (work-items.ts archive: "has a live work item: … Stop it before archiving the
  # workspace.", 409). The item ends as a leaf ends one it cannot do, finish_item with `blocked`; then the archive runs.
  ws_item_live || { echo "ASSERTION FAILED: before the archive the work item is $(ws_item_says)"; return 1; }
  answer=$(ws_post "/api/workspaces/$id/archive" '{"discard":true}')
  echo "the hub answered the archive with the item live: $answer"
  [[ "$answer" == *"has a live work item"*"Stop it before archiving the workspace."*"HTTP 409" ]]
  as_user "$joinerc" kill -0 "$inner"
  answer=$(ws_post /api/work-items/finish "{\"instanceId\":\"$(cat "$rigdir/ws-delegate")\",\"headline\":\"The stage 2 proof ends its workspace.\",\"summary\":\"Ended by the proof before it archives the workspace.\",\"blocked\":{\"command\":\"prove-stage2.sh workspace_archive_ends_all\",\"error\":\"the proof archives this workspace\"}}")
  echo "the hub answered the finish: $answer"
  [[ "$answer" == *"HTTP 200" ]]
  wait_until 60 '[[ "$(ws_item | json "d => [\"starting\", \"running\"].includes(d.state) ? \"live\" : \"ended\"")" == ended ]]' || { echo "the work item is still $(ws_item_says)"; return 1; }
  echo "the work item before the archive: $(ws_item_says)"
  answer=$(ws_post "/api/workspaces/$id/archive" '{"discard":true}')
  echo "the hub answered the archive: $answer"
  [[ "$answer" == *"HTTP 200" ]]
  wait_until 60 '! as_user "$joinerc" kill -0 "'"$inner"'" 2> /dev/null'
  left=""
  for pid in $tree; do
    if as_user "$joinerc" kill -0 "$pid" 2> /dev/null; then
      left+=" $pid"
    fi
  done
  [[ -z $left ]] || { echo "ASSERTION FAILED: these processes of the archived workspace's sandbox still run:$left"; return 1; }
  # The stage started no server again for the archived workspace's preview.
  [[ -z "$(ws_served_pid)" ]] || { echo "ASSERTION FAILED: a served listener $(ws_served_pid) runs after the archive"; return 1; }
  wait_until 60 '[[ -z "$(child_pids "$joinerc" "boundary-'"$id"'-'"$gen"'")" ]] && ! as_user "$joinerc" test -e "$(ws_state)"'
}
export -f ws_state ws_json ws_gen ws_exec ws_session_env ws_exec_as_session ws_place ws_same_sandbox ns_of ws_listener_start ws_listener_pid ws_exec_reach ws_listener_why ws_served_script ws_served_pid ws_preview_open ws_preview_close ws_preview_port ws_preview_says ws_preview_mode ws_preview_host ws_preview_by_host ws_preview_enter ws_tree ws_ancestry ws_descends ws_post json_string ws_item ws_item_says ws_item_live ws_secrets ws_cannot_read ws_hook_calls_start ws_hook_calls_stop ws_hook_calls_answered ws_hook_calls_clean ws_hook_calls_after ws_judge_answers_after_update workspace_opens workspace_across_update workspace_updated_serving workspace_archive_ends_all
export WS_LISTENER_PORT WS_SERVED_PORT WS_SERVED_ANSWER
rig_workspace() {
  # Check names are written out in full: the rig's check list (rig_checks) reads them from
  # this text, so a name held in a variable is listed as its own literal "$name" and never run.
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "a delegate workspace on the joined machine opens with its srt boundary, and a command through its executor cannot read a planted credential" workspace_opens 600
  check "a workspace open across an update keeps its job and a setsid listener running in the generation they started in, kept as it is while the listener runs: its next command reaches the listener, and the preview's served server, kept or started again by the stage, answers by port and by host behind the lock; once the preview and the listener stop the next command runs in the new build's boundary and the old one closes, and the preview made again is served in the new generation in both modes" workspace_across_update 900 "a delegate workspace on the joined machine opens with its srt boundary, and a command through its executor cannot read a planted credential"
  check "the workspace's judge answers every call its hook is handed from before the joined machine's update until well after it, through the boundary kept, its keeper retiring and the handover to a new generation" ws_judge_answers_after_update 300
  check "the session that delegated, running on the joined machine before both updates and held on by its retiring keeper that answers its listing late, is the same process after them, reattached and running" update_session_reattached 300
  check "every message sent to the session that delegated while the hub's machine and then the joined machine update, the hub restarting under some, reaches the session once the machine is back, once each" update_sends_delivered 600
  check "the joined machine's Claude account reads signed in all through its update with a workspace open, though its Claude Code answers auth status past the agent's bound" update_signin_kept 600
}
# The workspace's archive on a workspace of its own, which updates on its own: the archive ends a post-update
# generation's processes, and the across check's long update no longer waits on it (workspace_updated_serving).
rig_wsarchive() {
  fleet base "$BASE" "hub joiner" "hub joiner"
  setup_done
  check "a delegate workspace on the joined machine opens with its srt boundary, and a command through its executor cannot read a planted credential" workspace_opens 600
  check "with the workspace open both machines update; its next command runs and its boundary is handed over to the new build's form, where its server and the preview the stage serves start again" workspace_updated_serving 900 "a delegate workspace on the joined machine opens with its srt boundary, and a command through its executor cannot read a planted credential"
  check "archiving a workspace ends a setsid listener, its preview's served server and every other process its sandbox started" workspace_archive_ends_all 300 "with the workspace open both machines update; its next command runs and its boundary is handed over to the new build's form, where its server and the preview the stage serves start again"
}

# ---------------------------------------------------------------- one session's runaway is its own
# No single session can take a machine down: each child the keeper starts runs in a cgroup of its own, under
# pids.max 8192 (cgroup.ts CHILD_TASKS) and, when the hub sets one, a memory limit (/api/session-limits). A runaway is
# refused or killed inside its own child; the keeper says so (`proc.limit`), and the agent says it on the session,
# where the hub keeps it. The kernel's cgroup v2 document (Documentation/admin-guide/cgroup-v2.rst, PID): "it is not
# possible to violate a cgroup PID policy through fork() or clone()", and pids.peak is "The maximum value that the
# number of processes in the cgroup and its descendants has ever reached". The limit held is read off pids.peak, never
# pids.current: a refused fork adds to the counter, then checks it, then takes it back (kernel/cgroup/pids.c
# pids_try_charge: `new = atomic64_add_return(…); if (new > limit) goto revert`), so a group held at its limit by a
# runaway that keeps forking reads pids.max + 1 for an instant, holding no such task (the nightly of 2026-10-15 read
# 8193 so). pids.peak moves only with a charge that stands, a fork's or a migration's (pids_update_watermark), so it
# is the most the group ever held, over its whole life; pids.events max counts the refusals.
# The task limit the capped rig sets on every keeper's unit (TasksMax=, an administrator's drop-in).
export KEEPER_TASKS=200
# Asks the keeper to start a child (container, procId, command, JSON args) and prints its ack for it. The keeper acks a
# spawn only once the child has started or been refused, after a process-table read; socat's shut-none keeps the
# request side open, and -t5 waits up to 5s for the ack.
keeper_spawn() {
  as_user "$1" sh -c 'printf "%s\n" "$1" | socat -t5 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock,shut-none | grep -m1 "\"type\":\"ack\""' sh \
    "{\"type\":\"spawn\",\"commandId\":\"$2-$(date +%s%N)\",\"procId\":\"$2\",\"spec\":{\"command\":\"$3\",\"args\":$4}}"
}
# A process's cgroup, as /proc says it, under the container's /sys/fs/cgroup.
cgroup_of() { as_user "$1" sed -n 's/^0:://p' "/proc/$2/cgroup"; }
# A counter in a flat-keyed cgroup file (pids.events, memory.events), 0 when absent.
counter_on() { as_user "$1" sh -c 'sed -n "s/^$2 //p" "$1" 2> /dev/null' sh "$2" "$3" | awk '{ n = $1 } END { print n + 0 }'; }
transcript_of() { hub_api "/api/instances/$1/transcript"; }
send_message() { run_script "$hubc" /shared/stage2-send.ts http://127.0.0.1:3456 "$1" "$2" "$3"; }
put_session_limits() { hub_api /api/session-limits -X PUT -H 'content-type: application/json' -d "$1"; }
# The hub machine's agent's word that it holds the hub's session limits, since a moment (unix seconds).
agent_said_limits() { as_user "$hubc" journalctl --user --no-pager -o cat -u cawco-agent.service --since "@$1" | grep -F "[sessiond] session limits from the hub: $2" || true; }
# A child's own cgroup, by the pid the keeper holds under its id.
group_of() { echo "/sys/fs/cgroup$(cgroup_of "$hubc" "$(child_pids "$hubc" "$1")")"; }
# The runaway's end, whatever ended its check: its process group, which everything it forked is in, is killed. The
# machine's sh is dash, whose kill takes no `--`, so the group is the one argument after the signal.
runaway_gone() { as_user "$hubc" sh -c 'kill -KILL -"$(cat /tmp/limit-runaway.pid)" 2> /dev/null; rm -f /tmp/limit-runaway.pid' || true; }
runaway_stays_its_own() {
  need_hub
  local a=limit-tasks-a b=limit-tasks-b ack group children current peak pool token
  on_exit 'end_children "$hubc" limit-tasks-a limit-tasks-b'
  on_exit runaway_gone
  start_session "$hid" "$a" > /dev/null
  wait_until 60 "session_running $a"
  # The session's process becomes a command that starts processes without end, under the session's id, as a harness's
  # tool runs inside the session's own cgroup. Bounded so the proof can never be the runaway: at most 20,000 children,
  # for at most 90 s, each asleep for 300 s; a refused fork waits 10 ms and tries again.
  ack=$(keeper_spawn "$hubc" "$a" /usr/bin/perl '["-e","my ($n, $end) = (0, time + 90); while ($n < 20000 && time < $end) { my $p = fork(); if (!defined $p) { select(undef, undef, undef, 0.01); next } if ($p == 0) { sleep 300; exit 0 } $n++ } sleep 300"]')
  echo "the runaway: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  as_user "$hubc" sh -c 'echo "$1" > /tmp/limit-runaway.pid' sh "$(child_pids "$hubc" "$a")"
  group=$(group_of "$a")
  echo "its cgroup: $group"
  [[ $group == */cawco-sessiond-*.service/children/"$a"-* ]]
  [[ "$(as_user "$hubc" cat "$group/pids.max")" == 8192 ]]
  # It stops at its own limit: the kernel refused its forks there.
  wait_until 120 '(( $(counter_on "$hubc" "'"$group"'/pids.events" max) > 0 ))' \
    || { echo "its pids.current $(as_user "$hubc" cat "$group/pids.current")"; return 1; }
  peak=$(as_user "$hubc" cat "$group/pids.peak")
  echo "its pids.peak $peak; its tasks now $(as_user "$hubc" sh -c 'wc -l < "$1/cgroup.threads"' sh "$group") (pids.current $(as_user "$hubc" cat "$group/pids.current")); pids.events max $(counter_on "$hubc" "$group/pids.events" max)"
  (( peak <= 8192 ))
  # The machine's: all the keeper's children together stay far below their pool's cap.
  children=$(dirname "$group")
  current=$(as_user "$hubc" cat "$children/pids.current")
  pool=$(as_user "$hubc" cat "$children/pids.max")
  echo "all children: pids.current $current, pids.max $pool"
  (( current <= 8192 + 512 ))
  [[ $pool == max ]] || (( current * 2 < pool ))
  # Another session still starts, and answers a turn: its message reaches its process through the keeper, and its
  # answer reaches the hub.
  start_session "$hid" "$b" > /dev/null
  wait_until 60 "session_running $b"
  token="limit-proof-$RANDOM$RANDOM"
  send_message "$hid" "$b" "$token"
  wait_until 60 '[[ "$(transcript_of '"$b"')" == *"proof answered: '"$token"'"* ]]'
  # The hub shows the limit on the first session, in the words the agent said it in.
  wait_until 60 '[[ "$(transcript_of '"$a"')" == *"This session hit its limit of 8,192 processes: something it ran keeps starting processes."* ]]'
  # Once the session ends, its cgroup goes with it.
  stop_session "$hid" "$a" > /dev/null
  wait_until 120 '! as_user "$hubc" test -e "'"$group"'"'
  stop_session "$hid" "$b" > /dev/null
  wait_until 60 '[[ -z "$(child_pids "$hubc" '"$b"')" ]]'
}
memory_limit_stays_its_own() {
  need_hub
  local m=limit-mem-a n=limit-mem-b since ack holder group max expected others
  on_exit 'put_session_limits "{\"memoryPercent\":null,\"cpuPercent\":null}" > /dev/null 2>&1'
  on_exit 'end_children "$hubc" limit-mem-a limit-mem-b'
  # Set on the hub: each session's process may use 1% of its machine's RAM. The machine's agent takes it on its next
  # heartbeat (every 15 s), and every process the keeper starts from then runs under it.
  since=$(as_user "$hubc" date +%s)
  put_session_limits '{"memoryPercent":1,"cpuPercent":null}'
  [[ "$(hub_api /api/session-limits | json 'd => `${d.memoryPercent}/${d.cpuPercent}`')" == 1/null ]]
  wait_until 60 '[[ -n "$(agent_said_limits "'"$since"'" "memory 1% of this machine")" ]]'
  start_session "$hid" "$m" > /dev/null
  wait_until 60 "session_running $m"
  # The session's process becomes one that hands a child more memory than its limit, bounded at the limit plus
  # 256 MiB, and waits on it: the limit is read off the group a process of this session runs in now.
  max=$(as_user "$hubc" cat "$(group_of "$m")/memory.max")
  expected=$(( $(as_user "$hubc" awk '/^MemTotal:/ { print $2 }' /proc/meminfo) * 1024 / 100 ))
  echo "memory.max $max; 1% of the machine's MemTotal is $expected"
  [[ $max =~ ^[0-9]+$ ]]
  (( max - expected <= expected / 100 && expected - max <= expected / 100 ))
  ack=$(keeper_spawn "$hubc" "$m" /usr/bin/perl '["-e","my $n = $ARGV[0] + 268435456; my $p = fork(); if (defined $p && $p == 0) { my $s = q(x) x $n; sleep 300; exit 0 } sleep 300","'"$max"'"]')
  echo "the allocation: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  holder=$(child_pids "$hubc" "$m")
  group=$(group_of "$m")
  echo "its cgroup: $group, memory.max $(as_user "$hubc" cat "$group/memory.max")"
  # The kernel killed for memory in that group, and only there: the process holding it is alive, and every other
  # child's group reads no kill.
  wait_until 60 '(( $(counter_on "$hubc" "'"$group"'/memory.events" oom_kill) > 0 ))'
  echo "memory.events: $(as_user "$hubc" cat "$group/memory.events" | tr '\n' ' ')"
  as_user "$hubc" kill -0 "$holder"
  others=$(as_user "$hubc" sh -c 'for g in "$1"/*/; do g=${g%/}; [ "$g" = "$2" ] || sed -n "s/^oom_kill //p" "$g/memory.events" 2> /dev/null; done' sh "$(dirname "$group")" "$group" | awk '{ n += $1 } END { print n + 0 }')
  echo "oom_kill in every other child's group: $others"
  [[ $others == 0 ]]
  # The hub shows it on the session.
  wait_until 60 '[[ "$(transcript_of '"$m"')" == *"This session hit its memory limit of"* ]]'
  stop_session "$hid" "$m" > /dev/null
  wait_until 120 '! as_user "$hubc" test -e "'"$group"'"'
  # Cleared on the hub, the next session runs with no memory limit.
  since=$(as_user "$hubc" date +%s)
  put_session_limits '{"memoryPercent":null,"cpuPercent":null}'
  [[ "$(hub_api /api/session-limits | json 'd => `${d.memoryPercent}/${d.cpuPercent}`')" == null/null ]]
  wait_until 60 '[[ -n "$(agent_said_limits "'"$since"'" "memory unlimited")" ]]'
  start_session "$hid" "$n" > /dev/null
  wait_until 60 "session_running $n"
  [[ "$(as_user "$hubc" cat "$(group_of "$n")/memory.max")" == max ]]
  stop_session "$hid" "$n" > /dev/null
  wait_until 60 '[[ -z "$(child_pids "$hubc" '"$n"')" ]]'
}
# A keeper's unit delegates the pids, memory and cpu controllers (Delegate=pids memory cpu, DelegateSubgroup=keeper):
# systemd starts the keeper in …/cawco-sessiond-<build>.service/keeper, and the keeper puts every child in a cgroup of
# its own, …/children/<procId>-<serial>, under pids.max 8192, all of them under …/children, whose pids.max is the
# tightest task limit above it less the 64 tasks it keeps for itself (packages/sessiond/src/cgroup.ts). The limit is
# set before the keeper starts: TasksMax on the keepers' units, in an administrator's drop-in for every unit named
# cawco-sessiond-*, not on the user's whole tree (one there is shared with the hub, the agent and the dashboard).
# Every cap is read off the cgroup files the kernel enforces, never off the keeper's start-up sentence (nightly
# 90bdbf7b9: the keeper placed its children under pids.max 136 and gave itself cpu.weight 1000, and the check failed
# on a sentence that had grown a clause).
# A cgroup file on machine $1, `absent` when the file is not there (its controller is off for that group).
cgroup_file() { as_user "$1" sh -c 'cat "$1" 2> /dev/null || echo absent' sh "$2"; }
# The keeper's restart is over: a keeper process other than $2 holds the unit, and answers a listing. It places its
# children before it listens (sessiond main.ts: placeChildren, then server.listen), so an answer means they are placed.
keeper_restarted() {
  local now
  now=$(keeper_pid "$1")
  [[ $now =~ ^[0-9]+$ && $now != 0 && $now != "$2" ]] && [[ "$(keeper_list "$1")" == *'"procs"'* ]]
}
keeper_children_capped_on() {
  local c=$1 before top group max limit keeper pid own forker ack peak events weight
  on_exit "end_children $c cg-"
  echo "======== $c"
  $P exec "$c" sh -c "mkdir -p /etc/systemd/user/cawco-sessiond-.service.d && printf '[Service]\nTasksMax=%s\n' $KEEPER_TASKS > /etc/systemd/user/cawco-sessiond-.service.d/proof-tasks.conf"
  as_user "$c" systemctl --user daemon-reload
  end_all_sessions "$c"
  before=$(keeper_pid "$c")
  as_user "$c" systemctl --user restart "$(current_unit "$c")"
  wait_until 60 'keeper_restarted "$c" "$before"'
  # 1. The keeper runs in its unit's delegated cgroup, in the leaf `keeper`; the unit's own pids.max is the TasksMax
  # set above, and `children` beside the keeper holds every child under that less the 64 tasks it keeps for itself.
  keeper=$(keeper_pid "$c")
  echo "keeper $keeper is in $(cgroup_of "$c" "$keeper")"
  [[ "$(cgroup_of "$c" "$keeper")" == */cawco-sessiond-*.service/keeper ]] || { echo "FAIL: the keeper runs outside its unit's leaf"; return 1; }
  top="/sys/fs/cgroup$(dirname "$(cgroup_of "$c" "$keeper")")"
  group="$top/children"
  limit=$(cgroup_file "$c" "$top/pids.max")
  max=$(cgroup_file "$c" "$group/pids.max")
  echo "unit $top: pids.max $limit, cgroup.controllers $(cgroup_file "$c" "$top/cgroup.controllers"), cgroup.subtree_control $(cgroup_file "$c" "$top/cgroup.subtree_control")"
  echo "children $group: pids.max $max, cgroup.subtree_control $(cgroup_file "$c" "$group/cgroup.subtree_control")"
  [[ $limit == "$KEEPER_TASKS" ]] || { echo "FAIL: the keeper's unit holds pids.max $limit, not the TasksMax $KEEPER_TASKS set on it"; return 1; }
  [[ $max == $((KEEPER_TASKS - 64)) ]] || { echo "FAIL: the children are capped at pids.max $max, not $((KEEPER_TASKS - 64)) ($KEEPER_TASKS less the keeper's 64)"; return 1; }
  [[ " $(cgroup_file "$c" "$top/cgroup.subtree_control") " == *" pids "* && " $(cgroup_file "$c" "$group/cgroup.subtree_control") " == *" pids "* ]] \
    || { echo "FAIL: the pids controller is not on for the children's groups"; return 1; }
  # 2. The keeper ahead of the children for CPU: the unit delegates cpu (Delegate=pids memory cpu), the controller is
  # on in it, and the keeper's leaf weighs 1000 against the children's 100 (cgroup.ts KEEPER_CPU_WEIGHT).
  [[ " $(cgroup_file "$c" "$top/cgroup.controllers") " == *" cpu "* ]] || { echo "FAIL: the keeper's unit does not delegate cpu"; return 1; }
  [[ " $(cgroup_file "$c" "$top/cgroup.subtree_control") " == *" cpu "* ]] || { echo "FAIL: the cpu controller is not on in the keeper's unit"; return 1; }
  weight="$(cgroup_file "$c" "$top/keeper/cpu.weight") $(cgroup_file "$c" "$group/cpu.weight")"
  echo "cpu.weight: keeper, children: $weight"
  [[ $weight == "1000 100" ]] || { echo "FAIL: the keeper and the children weigh $weight for CPU, not 1000 against 100"; return 1; }
  # 3. Memory: the unit delegates it, so a limit the hub sets can apply, and with none set (this rig sets none) nothing
  # caps the keeper or the children by memory: memory.max is absent (the controller off for them) or max.
  [[ " $(cgroup_file "$c" "$top/cgroup.controllers") " == *" memory "* ]] || { echo "FAIL: the keeper's unit does not delegate memory"; return 1; }
  echo "memory.max: keeper $(cgroup_file "$c" "$top/keeper/memory.max"), children $(cgroup_file "$c" "$group/memory.max")"
  [[ "$(cgroup_file "$c" "$top/keeper/memory.max")" =~ ^(absent|max)$ && "$(cgroup_file "$c" "$group/memory.max")" =~ ^(absent|max)$ ]] \
    || { echo "FAIL: the keeper or the children hold a memory limit the hub never set"; return 1; }
  # 4. A child it starts is in a cgroup of its own in children, under its own pids.max and no memory.max; children
  # holds no process of its own.
  ack=$(keeper_spawn "$c" cg-child sleep '["3000"]')
  echo "spawn cg-child: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  pid=$(child_pids "$c" cg-child)
  own="/sys/fs/cgroup$(cgroup_of "$c" "$pid")"
  echo "child $pid is in $own"
  [[ $own == "$group"/cg-child-* ]]
  echo "its pids.max $(cgroup_file "$c" "$own/pids.max"), memory.max $(cgroup_file "$c" "$own/memory.max")"
  [[ "$(cgroup_file "$c" "$own/pids.max")" == 8192 ]]
  [[ "$(cgroup_file "$c" "$own/memory.max")" =~ ^(absent|max)$ ]]
  [[ -z "$(as_user "$c" cat "$group/cgroup.procs")" ]]
  # 5. A child that forks without end stops at the cap: the kernel refused its forks there. A forker that never gives
  # up: dash exits at its first refused fork and bash after a few retries, and the keeper then reaps the tree,
  # emptying the group before the next spawn is tried. perl's fork() answers undef at the cap and the loop goes on.
  ack=$(keeper_spawn "$c" cg-forker /usr/bin/perl '["-e","while (1) { my $p = fork(); if (defined $p && $p == 0) { sleep 600; exit 0 } select(undef, undef, undef, 0.01) unless defined $p }"]')
  echo "spawn cg-forker: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  forker=$(child_pids "$c" cg-forker)
  echo "forker: $forker"
  [[ $forker =~ ^[0-9]+$ ]] && (( forker > 1 ))
  wait_until 60 '(( $(counter_on "$c" "'"$group"'/pids.events" max) > 0 ))'
  # The most the children ever held, pids.peak, never pids.current, which a refused fork lifts past the cap for an
  # instant (see "one session's runaway is its own" above).
  peak=$(as_user "$c" cat "$group/pids.peak")
  events=$(as_user "$c" cat "$group/pids.events")
  echo "children's pids.peak $peak (pids.current $(as_user "$c" cat "$group/pids.current")), pids.max $max; pids.events: $events"
  (( peak <= max ))
  # The keeper still answers, is the same process, and refuses a further child in a sentence.
  keeper_list "$c" | json 'd => `the keeper answers list: ${d.procs.filter(p => p.alive).length} live children`'
  [[ "$(keeper_pid "$c")" == "$keeper" ]]
  ack=$(keeper_spawn "$c" cg-refused sleep '["3000"]')
  echo "spawn cg-refused: $ack"
  [[ $ack == *'"stage":"failed"'* && $ack == *'"reason":"process-limit: '* ]]
  # Once the forker and all it started are gone, a child starts again. The group kill goes through the machine's `sh`
  # (dash), whose builtin reads `-KILL "-$forker"` as the group, never through `podman exec kill`: that runs noble's
  # procps `kill` (4.0.4-4ubuntu3), which reads `-629` after a signal as options and signals `-9`, the last digit
  # (`kill(-9, SIGKILL) = -1 ESRCH`), and exits 0, so the forker lived on (nightly be51be0a3, pids.current 136).
  as_user "$c" sh -c 'kill -KILL "-$1"' sh "$forker"
  wait_until 60 '(( $(as_user "$c" cat "$group/pids.current") <= 2 ))'
  ack=$(keeper_spawn "$c" cg-after sleep '["3000"]')
  echo "spawn cg-after: $ack"
  [[ $ack == *'"stage":"applied"'* ]]
  [[ "$(keeper_pid "$c")" == "$keeper" ]]
  end_all_sessions "$c"
}
keeper_children_capped() {
  need_hub
  keeper_children_capped_on "$hubc"
  keeper_children_capped_on "$joinerc"
}
export -f cgroup_file keeper_restarted keeper_spawn cgroup_of counter_on transcript_of send_message put_session_limits agent_said_limits group_of runaway_gone runaway_stays_its_own memory_limit_stays_its_own keeper_children_capped_on keeper_children_capped
rig_runaway() {
  fleet base "$BASE" hub hub
  setup_done
  check "a session whose command starts processes without end stops at its own limit of 8,192, the hub says so on it, another session still starts and answers, and its cgroup goes when it ends" runaway_stays_its_own 600
}
rig_memory() {
  fleet base "$BASE" hub hub
  setup_done
  check "with a session memory limit set on the hub, a session that allocates past it loses only the process that did, the hub says so on it, and once the limit is cleared a new session runs with no memory limit" memory_limit_stays_its_own 600
}
rig_capped() {
  fleet base "$BASE" "hub joiner"
  setup_done
  check "the joined machine's localhost:3455 is the hub's dashboard, carried by its agent; the hub's own agent carries nothing, and the hub's machine answers 3455 alone, nothing on 3000" loopback_carried 300
  check "the keeper's children run each in a cgroup of its own in its delegated cgroup, all of them capped below the keeper's reserve" keeper_children_capped 600
}

# ---------------------------------------------------------------- slowfleet: a machine joins a fleet that has things
# for it to fetch, and no way out to fetch them. On 2026-10-22 two machines came up online and every session on them
# was refused for hours: a machine spawns nothing until a fleet sync has written the fleet's denied tools (agent
# denied-tools.ts, which holds a spawn 30 s for the first sync and then refuses it), and its first sync could not get
# there. Here the hub holds two MCP servers run with npx and a plugin before the machine joins, and the rig's network is
# internal (the setup looks at the npm registry from the machine and is refused). The machine is signed in before it
# joins, as a person's machine with Claude Code is. A session asked for 5 s after the machine is online runs, and
# within 120 s of its join the machine's row shows its first sync's outcome: a report the sync made after the join,
# naming each of the fleet's servers and its plugin with a state, or the hub's sentence that it did not land
# (`fleetSyncFault`).
export SLOW_MCP="proof-everything proof-memory" SLOW_PLUGIN=commit-commands@claude-plugins-official
# The fleet's rows before anyone joins: each server run as `npx -y <package>`, as the fleet's catalog adds one, and a
# plugin of Claude Code's own marketplace, saved through the hub's API as the dashboard saves them.
slow_fleet_rows() {
  need_hub
  local answer
  answer=$(as_user "$hubc" curl -sS --max-time 300 -w '\nHTTP %{http_code}' -X PUT -H 'content-type: application/json' \
    -d '{"config":{"command":"npx","args":["-y","@modelcontextprotocol/server-everything"]}}' http://127.0.0.1:3456/api/fleet/mcp/proof-everything)
  echo "proof-everything: $answer"
  [[ $answer == *"HTTP 200" ]]
  answer=$(as_user "$hubc" curl -sS --max-time 300 -w '\nHTTP %{http_code}' -X PUT -H 'content-type: application/json' \
    -d '{"config":{"command":"npx","args":["-y","@modelcontextprotocol/server-memory"]}}' http://127.0.0.1:3456/api/fleet/mcp/proof-memory)
  echo "proof-memory: $answer"
  [[ $answer == *"HTTP 200" ]]
  answer=$(as_user "$hubc" curl -sS --max-time 60 -w '\nHTTP %{http_code}' -X PUT -H 'content-type: application/json' -d '{}' \
    "http://127.0.0.1:3456/api/fleet/plugins/$SLOW_PLUGIN")
  echo "$SLOW_PLUGIN: $answer"
  [[ $answer == *"HTTP 200" ]]
}
# The joiner has no route out: the npm registry does not answer it.
no_route_out() {
  if as_user "$joinerc" curl -sS --max-time 5 -o /dev/null https://registry.npmjs.org/; then
    echo "ASSERTION FAILED: the joined machine reaches registry.npmjs.org, so this rig has a route out"
    return 1
  fi
  echo "the joined machine has no route out"
}
# The joiner signed in before it joins: an account dir of the rig's CawCo account, which its agent reads as it first
# registers.
slow_sign_in_before() {
  need_hub
  new_account
  as_user "$joinerc" sh /shared/account-dir.sh "$(cat "$rigdir/account-id")"
}
slow_fleet_join_starts() {
  need_hub
  local online_ms id left
  now_ms > "$rigdir/slow-join-started"
  join_machine
  online_ms=$(now_ms)
  echo "$online_ms" > "$rigdir/slow-online-ms"
  id=$(machine_id joiner)
  [[ -n $id ]]
  left=$(( online_ms + 5000 - $(now_ms) ))
  (( left <= 0 )) || sleep "$(( left / 1000 )).$(printf '%03d' $(( left % 1000 )))"
  start_session "$id" slowfleet-1 || { echo "ASSERTION FAILED: the hub refused the session asked for 5 s after the machine was online"; return 1; }
  wait_until 60 'session_running slowfleet-1' || {
    echo "ASSERTION FAILED: the session asked for 5 s after the machine was online reads $(hub_api /api/instances | json "d => JSON.stringify(d.find(r => r.id === 'slowfleet-1') ?? null)" | head -c 600)"
    as_user "$joinerc" sh -c 'journalctl --user --no-pager -o cat -u cawco-agent.service | grep -E "\[fleet\]|Not started|slowfleet-1" | tail -n 20'
    return 1
  }
}
# What the machine's row says of its sync: `fault <the hub's sentence>` when one did not land, else
# `<at> <server>:<state>... <plugin>:<state>` from its report, empty while it has neither.
slow_fleet_report() {
  hub_api /api/agents | json "d => { const a = d.find(r => r.hostname === 'joiner'); if (a?.fleetSyncFault) return 'fault ' + a.fleetSyncFault; const f = a?.fleet; if (!f) return ''; return [f.at, ...'$SLOW_MCP'.split(' ').map(n => n + ':' + (f.mcp?.[n]?.state ?? 'none')), '$SLOW_PLUGIN:' + (f.plugins?.['$SLOW_PLUGIN']?.state ?? 'none')].join(' '); }"
}
# A sync's outcome on the row: the hub's sentence that it did not land, or a report made after the join naming every row.
slow_fleet_said() {
  [[ $1 == "fault "* ]] && return 0
  [[ -n $1 && $1 != *":none"* ]] && (( ${1%% *} >= $2 ))
}
slow_fleet_outcome() {
  need_hub
  local joined left report
  joined=$(cat "$rigdir/slow-join-started")
  left=$(( 120 - ($(now_ms) - $(cat "$rigdir/slow-online-ms")) / 1000 ))
  (( left > 0 )) || left=1
  wait_until "$left" 'report=$(slow_fleet_report) && slow_fleet_said "$report" "$joined"' || {
    echo "ASSERTION FAILED: 120 s after the join the machine's row shows no sync outcome naming every server and the plugin: '$(slow_fleet_report)'"
    as_user "$joinerc" sh -c 'journalctl --user --no-pager -o cat -u cawco-agent.service | grep -F "[fleet" | tail -n 20'
    hub_journal | grep -F "[fleet" | tail -n 10
    return 1
  }
  echo "the machine's row: $report"
}
export -f slow_fleet_rows no_route_out slow_sign_in_before slow_fleet_join_starts slow_fleet_report slow_fleet_said slow_fleet_outcome
rig_slowfleet() {
  use_feed base
  setup "boot the machines: hub joiner" machines hub joiner
  setup "install the hub from $BASE" install_hub "$BASE"
  setup "the hub's fleet holds two MCP servers run with npx and a plugin" slow_fleet_rows
  setup "the joined machine has no route out" no_route_out
  setup "sign the machine in to a CawCo account before it joins" slow_sign_in_before
  setup_done
  check "a machine joins a fleet holding two npx MCP servers and a plugin with no route out, and a session asked for 5 s after it is online runs" slow_fleet_join_starts 600
  check "within 120 s of the join the joined machine's row shows its first sync's outcome: a report naming each of the fleet's MCP servers and its plugin, or why it did not land" slow_fleet_outcome 180
}

# ---------------------------------------------------------------- bare: a machine with none of what a workspace needs
# (the bare image: no bubblewrap, socat or git), as a person's fresh server is, joined and signed in. A delegate from
# its home folder either works (its session runs, and a command through its workspace's executor runs when it has
# one), or is refused in words that name what to install (agent boundary.ts names each host tool it lacks with its
# package): never a refusal that leaves the person to work out the fix.
bare_delegate_from_home() {
  need_hub
  local answer body item delegate words
  start_session "$jid" bareparent-1 > /dev/null
  wait_until 60 'session_running bareparent-1'
  answer=$(ws_post /api/work-items "{\"parentInstanceId\":\"bareparent-1\",\"title\":\"Delegate from home on a bare machine\",\"prompt\":\"The stage 2 proof's bare machine.\",\"harness\":\"claude\",\"model\":\"stub\",\"cwd\":\"/home/cawco\",\"machineId\":\"$jid\",\"lands\":\"none\",\"checks\":[{\"name\":\"Run true\",\"command\":\"true\"}]}")
  echo "the hub answered the delegation: $answer"
  if [[ $answer == *"HTTP 200" ]]; then
    body=$(sed '$d' <<< "$answer")
    item=$(json 'd => d.workItemId' <<< "$body")
    delegate=$(json 'd => d.instanceId' <<< "$body")
    [[ -n $item && -n $delegate ]]
    wait_until 120 'session_running "$delegate" || [[ -n "$(hub_api "/api/work-items/$item" | json "d => [\"starting\", \"running\"].includes(d.state) ? \"\" : d.state")" ]]'
    if session_running "$delegate"; then
      echo "the delegate runs on the bare machine: $(hub_api "/api/work-items/$item" | json 'd => d.state')"
      json 'd => d.workspaceId ?? ""' <<< "$body" > "$rigdir/ws-id"
      [[ -s "$rigdir/ws-id" ]] || return 0
      ws_json boundary.json 'd => d.path' > "$rigdir/ws-clone"
      [[ "$(ws_exec 'echo ran')" == ran ]] || { echo "ASSERTION FAILED: a command through the delegate's workspace did not run"; return 1; }
      return 0
    fi
    words=$(hub_api "/api/work-items/$item" | json 'd => `${d.state}: ${d.error ?? ""}`')
  else
    words=$(sed '$d' <<< "$answer")
  fi
  echo "the delegation was refused: $words"
  [[ $words =~ [Ii]nstall && $words =~ (git|bubblewrap|socat) ]] \
    || { echo "ASSERTION FAILED: the refusal names nothing to install (git, bubblewrap or socat): $words"; return 1; }
}
export -f bare_delegate_from_home
rig_bare() {
  fleet base "$BASE" "hub bare" "hub joiner"
  setup_done
  check "on a machine with no bubblewrap, socat or git a delegate from its home folder works, or is refused in words naming what to install" bare_delegate_from_home 300
}

# ---------------------------------------------------------------- nightlyjoin: a machine added by the dialog's command
# route (`POST /api/installs` with route `command`: the line `curl …/install.sh?code=… | sh`) to a hub on the nightly
# channel, while an older build is the newest stable, installs the hub's build. The installer takes the channel
# CAWCO_CHANNEL names, stable when unset (core install-script.ts), and the hub's /install.sh names the fleet's channel
# and build only for an SSH add (hub join.ts), so the command route installed the older stable beside a nightly hub.
command_route_installs_hubs_build() {
  need_hub
  local answer command rc=0 id hub_version
  answer=$(ws_post /api/installs "{\"route\":\"command\",\"address\":\"http://$hub_ip:3456\"}")
  echo "the hub answered the command route: $answer"
  [[ $answer == *"HTTP 200" ]]
  command=$(sed '$d' <<< "$answer" | json 'd => d.install.command')
  [[ $command == "curl -fsSL http://$hub_ip:3456/install.sh?code="*" | sh" ]] || { echo "ASSERTION FAILED: the command route's line is '$command'"; return 1; }
  as_user "$joinerc" sh -c "$command" > "$rigdir/command-join.out" 2>&1 || rc=$?
  cat "$rigdir/command-join.out"
  [[ $rc == 0 ]] || { echo "ASSERTION FAILED: the command route's line exited $rc"; return 1; }
  wait_until 120 '[[ "$(hub_api /api/agents | json "d => d.find(a => a.hostname === \"joiner\")?.status")" == online ]]'
  id=$(machine_id joiner)
  hub_version=$(hub_api /health | json 'd => d.build?.version')
  [[ $hub_version == "$NIGHTLY" ]]
  [[ "$(build_version "$id")" == "$hub_version" ]] \
    || { echo "ASSERTION FAILED: the command route installed $(build_version "$id") on the joined machine, not the hub's $hub_version (the fleet's channel is nightly; $BASE is the newest stable)"; return 1; }
}
export -f command_route_installs_hubs_build
rig_nightlyjoin() {
  use_feed base
  use_feed nightly
  setup "boot the machines: hub joiner" machines hub joiner
  setup "install the hub from $NIGHTLY on the nightly channel" install_hub "$NIGHTLY" nightly
  setup "the fleet's channel is nightly" put_policy nightly false
  setup_done
  check "a machine added by the command route to a nightly hub, an older build the newest stable, installs the hub's build" command_route_installs_hubs_build 600
}

echo "rig $RIG: started"
"rig_$RIG"
echo "rig $RIG: done in $((SECONDS - RIG_STARTED))s"
exit $RIG_STATUS
