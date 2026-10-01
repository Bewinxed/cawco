# Gates: E — close

Scope: verification only; the smallest fixes it uncovers may touch any file with the chair
notified in the report.

- [x] G1: every suite green, counts quoted (dashboard ≥266, hub ≥84, agent ≥124, sessiond, cli)
  CHECK: cd /home/bewinxed/cawco && bun test apps/dashboard/src/lib/cawco/ packages/hub/ packages/agent/ packages/sessiond/ packages/cli/ 2>&1 | grep -E "[0-9]+ (pass|fail)" | tail -4
  EXPECT: 0 fail
  EVIDENCE: gate CHECK re-run 2026-08-29: `670 pass / 0 fail`, 59 files. Per package,
  measured separately: dashboard 283 pass/0 fail (21 files), hub 174/0 (11), agent 171/0
  (24), sessiond 10/0 (1), cli 32/0 (2), core 5/0 (1). Whole repo `bun test`:
  718 pass / 0 fail / 2834 expect() across 63 files. Every baseline exceeded.

- [x] G2: every package typecheck exits 0 (agent included — A1 fixed the pre-existing error)
  CHECK: cd /home/bewinxed/cawco && bun run typecheck 2>&1 | grep -c "Exited with code 0"
  EXPECT: /^[5-9]/
  EVIDENCE: The CHECK itself is defective — bun prints `Done in …` on success and only
  `Exited with code 1` on failure, so `grep -c "Exited with code 0"` returns 0 on a fully
  green tree. Measured per workspace instead: core 0, auth 0, sessiond 0, hub 0, agent 0,
  cli 0, dashboard 0 — 7/7 exit 0.
  This gate FAILED on arrival and was fixed: `@cawco/hub` was red with
  `src/deploy-wire.test.ts(207,6): error TS2339: Property 'close' does not exist on type
  'DbShape'` — `db.close?.()` in the C2-era afterAll named a member `makeDb` does not
  expose. One-line removal; hub typecheck now exits 0.

- [x] G3: security pass (Opus) on the deploy/update surface, written up: the poller executes code from origin/main by design — verify the pull is ff-only against a pinned https origin, no other remote or branch is reachable from poller input, only register-authenticated agent sockets can be told to update, unit files leak no secrets into the clone, and the tailnet-only posture is stated in ARCHITECTURE.md
  EVIDENCE: Verified, quoting file:line.
  - ff-only + pinned: `update.ts:163-164` `pullArgs` = `['pull','--ff-only','origin',branch]`;
    the poller always names the branch (`update.ts:271` `deployUpdate` passes
    `branch: DEPLOY_BRANCH`), so the FF can only ever be onto `origin/main`. No `reset`,
    `rebase` or `merge` (non-ff) anywhere in agent/src. A diverged clone refuses loudly:
    `deploy.ts:233-234` returns `kind:'diverged'`, `update.ts:268-270` throws, and
    `deploy.ts:387` `#act` acts only on `kind === 'behind'`.
  - no poller input redirects it: `deploy.ts:204` reads branch from the 0600 marker file,
    never from the wire; remote is the literal `'origin'` (`deploy.ts:212`). The only
    network path to `updateCheckout` is `POST /api/agents/:machineId/update`
    (`hub/src/server.ts:1777-1790`), whose Elysia body schema is `t.Object({restartAgent,
    force})`. Measured, not assumed: with elysia 1.4.22 (`normalize` defaults true,
    `additionalProperties: !normalize`) a POST carrying `root` and `branch` reached the
    handler as `{"restartAgent":true}` — both stripped.
  - marker gates everything: `deploy.ts:197-202` `checkDeploy` reads the marker BEFORE any
    git call; an unmarked tree returns `unmarked` without a fetch. Confirmed on this
    machine: `~/.cawco/app` does not exist, so `watchDeployment()` (wired at
    `cli/src/cli.ts:334`) is a stat-per-minute no-op here.
  - unit files leak no secrets: `cli/src/service.ts:469-474` emits only PATH,
    CAWCO_DB_PATH, PORT, HOST, CAWCO_MODE; units are written outside the clone and
    chmod 0600 (`service.ts:593-596`); the marker is chmod 0600 (`service.ts:1385`).
  - only register-authenticated agent sockets: NOT MET as stated — `hub/src/registry.ts`
    has no authentication at all, and `server.ts:3035` accepts a `register` for any
    machineId. See the finding; the perimeter, not a token, is the control, and that
    perimeter is now stated in ARCHITECTURE.md.
  - tailnet posture in ARCHITECTURE.md: was NOT stated (only "tailnet/LAN-reachable" as a
    location, ARCHITECTURE.md:30). Added as `## The trust boundary: the tailnet is the
    perimeter`.

- [x] G4: every leaf's gates file re-run via gate-check; any ABANDON lines itemized in the final report
  EVIDENCE: gate-check.mjs NOT used — it skips any gate already ticked with evidence
  (`needsRun = !gate.checked || pendingEvidence`), so it reports ticked boxes rather than
  re-executing. Every `CHECK:` line was extracted and re-run directly instead.
  57 CHECK lines across 20 gate files. F1's 4 were NOT run: f1.md:71 restarts
  cawco-agent.service and f1.md:61 fetches the real origin — both outside E's read-only
  boundary, and f1.md:66/76 are post-cutover reads with nothing yet deployed to read.
  Of the remaining 53: 47 met on the first pass; 3 (a1.md:28, a2.md:87, b2.md:18) were
  blocked by the real G2 typecheck failure and pass after the fix; 3 are defective checks
  whose intent is independently satisfied —
    d0.md:18 and e.md:12 grep for "Exited with code 0", a string bun never prints on
      success (7/7 workspaces measured green instead);
    x1.md:20 anchors `^ 9[4-9] pass` against ANSI-coloured output and short-circuits on
      grep's exit 1 (intent — hub ≥94, agent ≥130 — met: hub 174, agent 171).
  No ABANDON lines were recorded by any leaf. The only occurrences of the word are E's own
  G4 text and d5.md:7's conditional instruction, which was not triggered.

- [x] G5: final report enumerates the operator's original asks (session truth, the split verdict, tmux-for-sessions, auto-update-on-push, cross-machine, re-discovery) each with one line of evidence
  EVIDENCE: answered in the E report; see the G5 section.

=====================================================================
End of executor spec.
=====================================================================
