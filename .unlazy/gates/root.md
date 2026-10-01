# Gates: Root — Ledger Protocol integration

Scope: the whole build, verified by the driver after all leaves.

- [x] R1: Every leaf's gates fully met (driver re-ran gate-check per leaf)
  CHECK: node /home/bewinxed/.claude/skills/unlazy/scripts/gate-check.mjs --status /home/bewinxed/cawco/.unlazy/gates/a-core.md /home/bewinxed/cawco/.unlazy/gates/b-hub.md /home/bewinxed/cawco/.unlazy/gates/c-store.md /home/bewinxed/cawco/.unlazy/gates/d-ui.md /home/bewinxed/cawco/.unlazy/gates/e-e2e.md 2>&1 | tail -5
  EXPECT: /ALL MET/
  EVIDENCE: /home/bewinxed/cawco/.unlazy/gates/e-e2e.md: 4 gates | ALL MET (27 met)

- [x] R2: Workspace typecheck 6/6, production build clean
  CHECK: cd /home/bewinxed/cawco && bun run typecheck 2>&1 | grep -c "Exited with code 0" && cd apps/dashboard && bun run build 2>&1 | grep -c "✓ built"
  EXPECT: /6[\s\S]*[1-9]/
  EVIDENCE: 6 | 2

- [x] R3: Live legacy smoke on the dev stack (running hub is legacy): transcript renders, send works — no regression while the fleet stays un-restarted
  EVIDENCE: d-ui G6, driver-run via CDP on session 56b59d92: before {"turns":5}, sent through the new submitCommand path, {"replied":true} — a real agent reply through the legacy stack. NOTE: the dev hub (bun --watch) has hot-reloaded the stream code, so the DEV stack is already stream-capable end-to-end for new connections; the un-restarted DAEMON keeps the legacy daemon-side behavior, which is the compat case this gate covers.

- [x] R4: Committed in coherent commits (core protocol, hub, store, ui, e2e or grouped sensibly), pushed
  CHECK: cd /home/bewinxed/cawco && git status --short | grep -cv ".unlazy" ; true
  EXPECT: /^0/
  EVIDENCE: 0
  <!-- Scoped (driver, stated not silent): .unlazy/ is the build's own ledger
       scaffolding, untracked by design; product tree cleanliness is the gate. -->


- [x] R5: Restart-gated items enumerated for the operator in the final report (live stream cutover, plus the already-pending daemon items: timestamps, delegate-ask, queue frames)
  EVIDENCE: Enumerated in the final report: (1) daemon restart gates — real history timestamps, answerable delegate asks, message_queued/dequeued frames, and existing live sessions keep their old harness objects until re-spawned; (2) hub restart NOT required for the dev stack (bun --watch hot-reloaded it; GET /api/queues live-verified earlier) but IS required for any production hub process; (3) protocol v2 note: no stream.unsubscribe — closed tabs stream until socket close (bounded, by design of the frozen contract).
