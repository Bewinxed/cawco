# Gates: Leaf A — core wire types

Scope: packages/core/src/stream.ts with the frozen contract's types, exported from index.ts. Nothing else.

- [x] G1: All contract types + STREAM_V1 exist verbatim-compatible in stream.ts
  CHECK: cd /home/bewinxed/cawco && grep -cE "STREAM_V1|SessionStreamEvent|StreamSubscribe|StreamBacklog|StreamReset|StreamDelta|CommandEnvelope|CommandAck" packages/core/src/stream.ts
  EXPECT: /^([8-9]|[1-9][0-9])/
  EVIDENCE: 13

- [x] G2: Exported from the package root
  CHECK: cd /home/bewinxed/cawco && grep -c "stream" packages/core/src/index.ts
  EXPECT: /^[1-9]/
  EVIDENCE: 5

- [x] G3: Workspace typecheck clean, all six packages
  CHECK: cd /home/bewinxed/cawco && bun run typecheck 2>&1 | grep -c "Exited with code 0"
  EXPECT: 6
  EVIDENCE: 6

- [x] G4: Existing suites unbroken (agent and dashboard, run separately)
  CHECK: cd /home/bewinxed/cawco && bun test packages/agent 2>&1 | grep -E "^ [0-9]+ fail" | tail -1
  EXPECT: 0 fail
  EVIDENCE: 0 fail

- [x] G5: Dashboard suite unbroken
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib 2>&1 | grep -E "^ [0-9]+ fail" | tail -1
  EXPECT: 0 fail
  EVIDENCE: 0 fail
