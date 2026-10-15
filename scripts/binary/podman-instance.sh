# Sourced by prove-stage1.sh and prove-stage2.sh (after base-image.sh): every podman the container proofs start is
# an instance of its own, and the images they run come from one store kept between runs.
#
# ISOLATION. An instance shares nothing with the host's containers or with another instance. podman v5.7.0,
# libpod/runtime.go: with the default lock type every rootless podman of one user shares one lock segment
# (:250-260, `/libpod_rootless_lock_<uid>`), and an instance whose tmp dir has no `alive` file (:541, :605) runs a
# refresh in which "Containers, pods, and volumes must also reacquire their locks" (:836-840), in that shared
# segment: run with a fresh tmp dir, a proof's store took locks the host's own containers held. `lock_type = "file"`
# keeps the locks in `<tmp_dir>/locks` (:236-238), the instance's own. containers.conf(5): "If the CONTAINERS_CONF
# environment variable is set, all system and user config files are ignored and only the specified config file will
# be loaded"; `tmp_dir` is per-boot state and "Must be a tmpfs" (so it goes under XDG_RUNTIME_DIR);
# `events_logger = "file"` writes to `events_logfile_path`. A rootless instance has its own network namespace and
# ipam under its runroot (containers/common libnetwork/network/interface.go:68-72: "For rootless we have our own
# network namespace per libpod instances"). No instance ever runs `podman system reset`: its storage is removed as
# files, from inside its own user namespace (`podman_instance_gone`).
#
# THE IMAGE STORE, `$PROOF_STORE`, kept between runs: each image built once per Containerfile (its hash, with the
# base image's id, names its tag), one writer at a time (flock), and read by every instance as an additional image
# store (containers-storage.conf(5) `additionalimagestores`; containers/storage types/options.go:458-459 passes each
# as `<driver>.imagestore`, which the vfs driver reads as a read-only home, drivers/vfs/driver.go:54-55).
PROOF_CACHE=${CAWCO_PROOF_CACHE:-$HOME/.cache/cawco-proof}
PROOF_STORE=$PROOF_CACHE/images

# The run dir (tmp dir and runroot, on the user's tmpfs) of the instance named NAME.
podman_instance_run() { echo "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cawco-proof-$1"; }

# podman_instance NAME ROOT [IMAGE_STORE]: writes the instance's config files beside ROOT and prints its command.
podman_instance() {
  local name=$1 root=$2 images=${3:-} run
  run=$(podman_instance_run "$name")
  mkdir -p "$run/tmp" "$run/run" "$root"
  cat > "$root.containers.conf" <<CONF
[containers]
# No kernel keyring per container: each holds one against kernel.keys.maxkeys (200 by default), and a host whose own
# containers held most of them failed every boot with "crun: create keyring …: Disk quota exceeded".
keyring = false
[engine]
lock_type = "file"
tmp_dir = "$run/tmp"
events_logger = "file"
events_logfile_path = "$root.events.log"
CONF
  cat > "$root.storage.conf" <<CONF
[storage]
driver = "vfs"
graphroot = "$root"
runroot = "$run/run"
[storage.options]
additionalimagestores = [$([[ -n $images ]] && printf '"%s"' "$images")]
CONF
  printf '{"auths":{}}\n' > "$root.auth.json"
  echo "env CONTAINERS_CONF=$root.containers.conf CONTAINERS_STORAGE_CONF=$root.storage.conf REGISTRY_AUTH_FILE=$root.auth.json podman --root $root --runroot $run/run --tmpdir $run/tmp --storage-driver vfs"
}

# The instance's run dir and config files, its storage kept (the image store's instance).
podman_instance_closed() {
  local name=$1 root=$2
  rm -rf "$(podman_instance_run "$name")" "$root.containers.conf" "$root.storage.conf" "$root.auth.json" 2> /dev/null || true
}

# The instance gone whole: its storage, written by mapped user ids, removed from inside its own user namespace (its
# command P), then its run dir and config files.
podman_instance_gone() {
  local name=$1 root=$2 p=$3
  $p unshare rm -rf "$root" > /dev/null 2>&1 || true
  podman_instance_closed "$name" "$root"
}

# THE IMAGE STORE OPENS WITH ONE RUN ROOT. libpod keeps its database at `<static dir>/db.sql`, the store's own
# (podman v5.7.0 libpod/sqlite_state.go:59-63, :84), records the static dir, tmp dir, graph root, run root, graph driver
# and volume path the first instance opened it with, and refuses every later one whose own differ ("database %s %q
# does not match our %s %q", ValidateDBConfig, :308-437). So the instance that builds into the store is always the
# one named here, its run root and tmp dir the same paths every time; one writer at a time holds it (flock). A rig
# or stage 1 never opens this database: each reads the store as an additional image store (containers/storage), and
# its own libpod database is in its own graph root.
PROOF_STORE_INSTANCE=images

# The store's libpod database, when it records another instance's paths (a store first opened under a per-run name,
# before PROOF_STORE_INSTANCE), goes: it holds no image (those are containers/storage's, beside it) and, the builds'
# containers each removed as their build ends, no container either, which is checked first.
proof_store_database() {
  # The instance's static dir is the store itself (podman_instance), so its database is the store's own db.sql.
  local db="$PROOF_STORE/db.sql" run
  [[ -f $db ]] || return 0
  run=$(podman_instance_run "$PROOF_STORE_INSTANCE")
  bun -e '
    import { Database } from "bun:sqlite";
    const [db, runRoot, tmpDir] = process.argv.slice(-3);
    const handle = new Database(db, { readonly: true });
    const config = handle.query("SELECT RunRoot, TmpDir FROM DBConfig").get();
    const containers = handle.query("SELECT count(*) AS n FROM ContainerConfig").get().n;
    if (!config || (config.RunRoot === runRoot && config.TmpDir === tmpDir)) process.exit(0);
    if (containers > 0) {
      console.error(`${db} records the run root ${config.RunRoot} and ${containers} container(s): it is not reset; remove the store to rebuild it`);
      process.exit(2);
    }
    console.error(`${db} records the run root ${config.RunRoot} and tmp dir ${config.TmpDir}, not ${runRoot} and ${tmpDir}: it is reset (no container in it; the images stay)`);
    process.exit(1);
  ' "$db" "$run/run" "$run/tmp"
  case $? in
    0) return 0 ;;
    1) rm -f "$db" "$db-wal" "$db-shm" ;;
    *) return 1 ;;
  esac
}

# proof_images CONTEXT NAME...: each image whose recipe is CONTEXT/NAME.Containerfile, in the image store, built
# there unless it is already; prints `NAME=TAG` for each.
proof_images() {
  local context=$1
  shift
  mkdir -p "$PROOF_CACHE"
  (
    flock 8
    local p name tag
    proof_store_database >&2 || exit 1
    p=$(podman_instance "$PROOF_STORE_INSTANCE" "$PROOF_STORE")
    trap 'podman_instance_closed "$PROOF_STORE_INSTANCE" "$PROOF_STORE"' EXIT
    $p image exists "$BASE_LOCAL" || seed_base_image "$context/base-image.tar" $p >&2 || exit 1
    for name in "$@"; do
      tag="localhost/cawco-proof-$name:$(cat "$context/$name.Containerfile" <(echo "$BASE_IMAGE_ID") | sha256sum | cut -c1-16)"
      $p image exists "$tag" || $p build --pull=never -t "$tag" -f "$context/$name.Containerfile" "$context" >&2 || exit 1
      echo "$name=$tag"
    done
  ) 8> "$PROOF_CACHE/images.lock"
}
