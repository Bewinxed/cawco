Deploy: how the hub and its previews go out.

- Preview ports are picked outside the kernel's ephemeral range (ruling 2026-10-19)
  Why: a bind refused for its address said so
- A start republishes every runtime file whose bytes changed since the last start, so a dashboard reload after an update reads the new bundle, the agent's sessions keep their old one until they restart, and a stale service worker never serves the previous build's chunks to anyone (since 2026-10-17, from n-20261017-100000-a7b8c9 n-20261017-110000-b8c9d0, used 2026-10-19)
- The scratch hub listens on 127.0.0.1 only (since 2026-10-03, from n-20261003-090000-d4e5f6, used 2026-10-18)
- Releases are cut from main every Tuesday (since 2026-10-03, from n-20261003-090000-d4e5f6, used 2026-10-16)

## Conflict

- Previews bind on the hub's address only (since 2026-10-03, from n-20261003-090000-d4e5f6, used 2026-10-13)
- Previews bind on the machine's tailnet address (since 2026-10-11, from n-20261011-090000-e5f6a7 n-20261017-090000-f6a7b8, used 2026-10-16)

## Formerly

- The scratch hub's ports came from the ephemeral range (since 2026-10-02, until 2026-10-19, from n-20261003-090000-d4e5f6, replaced by n-20261019-100000-a1b2c3)
