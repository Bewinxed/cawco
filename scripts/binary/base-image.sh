# Sourced by prove-stage1.sh and prove-stage2.sh: the one base image both
# container proofs build on, pinned, and seeded into a proof's fresh store from
# the host's own podman store. A proof run reaches Docker Hub only when the
# host does not hold this image (a registry outage failed nightly 67aeea6c
# with "pinging container registry registry-1.docker.io … TLS handshake timeout").
#
# docker.io/library/ubuntu:24.04 as the release host pulled it (created
# 2026-09-18 21:20:38 UTC): podman's own manifest digest for it (`.Digest`;
# its other repo digest, sha256:a853f94d…, is the multi-arch index) and its image id.
BASE_IMAGE=docker.io/library/ubuntu@sha256:f610ab94648195aa356059f5b41d6085c9d4d903c072430cdd1af7bdb646106b
BASE_IMAGE_ID=69f919497cada9a8611f3de61df902d9f94bf20f84552ef5bd93125c38608ef9
# The name it carries inside a proof's store (the stage-2 Containerfiles name it literally).
BASE_LOCAL=localhost/cawco-proof-ubuntu:24.04

# The host's podman under the user's own configuration, not the proof's.
host_podman() { env -u XDG_CONFIG_HOME -u XDG_CACHE_HOME -u REGISTRY_AUTH_FILE podman "$@"; }

# Usage: seed_base_image /scratch/archive.tar podman --root FRESH …
# Pulls into the host store only when the host lacks the pinned image, checks
# the host copy is those bytes, then saves it and loads it into the proof's store.
seed_base_image() {
  local archive=$1 id
  shift
  { host_podman image exists "$BASE_IMAGE" || host_podman pull "$BASE_IMAGE"; } &&
    id=$(host_podman image inspect --format '{{.Id}}' "$BASE_IMAGE") &&
    { [[ $id == "$BASE_IMAGE_ID" ]] || { echo "the host's $BASE_IMAGE has image id $id, not the pinned $BASE_IMAGE_ID" >&2; false; }; } &&
    rm -f "$archive" &&
    host_podman save --format docker-archive -o "$archive" "$BASE_IMAGE_ID" &&
    "$@" load -i "$archive" &&
    "$@" tag "$BASE_IMAGE_ID" "$BASE_LOCAL" &&
    rm -f "$archive"
}
