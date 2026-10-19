Boundary: what a workspace's commands can reach.

- A workspace writes only its own clone, $TMPDIR and the package cache (since 2026-10-09, from n-20261009-090000-c9d0e1, used 2026-10-19)
- No namespace starts inside a workspace boundary (since 2026-10-09, from n-20261009-090000-c9d0e1, used 2026-10-18)
- Public hosts are reachable; the owner's machines are not (since 2026-10-09, from n-20261009-090000-c9d0e1, used 2026-10-15)
