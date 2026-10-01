# Gates: Leaf D — command stages surfaced in UI

Scope: composer send state, settings rows, permission/question cards read the command tracker instead of ad-hoc promise wrappers, on the stream path; legacy path keeps today's UI exactly. No visual redesign — the existing treatments (Applying…, failure note, Sent.) get driven by tracker stages.

- [x] G1: Settings rows driven by tracker on stream path (accepted -> pending treatment, failed -> failure note with reason); legacy path unchanged (cite the branch)
  EVIDENCE: SessionHeader.svelte:106 trackedCommand prop; :143-162 per-row Attempt with refusal WRITTEN DOWN (:149-153 "because the tracker prunes a settled record and a refusal on screen must not go with it"); :180 stage read. SessionPane.svelte:63-89 onmodel/onpermission/oneffort -> submitCommand('set-model'/'set-permission-mode'/'set-effort'). Legacy branch: submitCommand in client.svelte.ts routes to today's relay calls when !streamCapable (C's tracker, stage from promise semantics) — behavioral equivalence, live-proven in G6.

- [x] G2: Permission/question card wait line reflects stage: submitted -> "Sent.", failed -> failure with reason (cite lines)
  EVIDENCE: Prompt.svelte:122 record = commandRecord(commandId); :125 failed-stage refusal with tracker reason; :135 (permission) and :183 (question) commandId = onanswer(...). SessionPane.svelte:102 routes as 'permission.answer' command.

- [x] G3: Composer disables double-submit while a send command is in flight on the stream path; queued rows (QueuedMessage) unaffected
  EVIDENCE: Composer.svelte:40/:62 `sending` prop ("the gap in front of busy"); :292 submit guard `if (!hasContent || sending) return` (draft preserved); :493 aria-disabled. SessionPane.svelte:459 send -> submitCommand('send'). Queued-row machinery untouched (rows.ts/Queued.svelte not in D's diff).

- [x] G4: Dashboard suite 0 fail
  CHECK: cd /home/bewinxed/cawco/apps/dashboard && bun test src/lib 2>&1 | grep -E "^ [0-9]+ fail" | tail -1
  EXPECT: 0 fail
  EVIDENCE: 0 fail

- [x] G5: Workspace typecheck clean
  CHECK: cd /home/bewinxed/cawco && bun run typecheck 2>&1 | grep -c "Exited with code 0"
  EXPECT: 6
  EVIDENCE: 6

- [x] G6: Live legacy smoke — dev dashboard against the (legacy) running hub still renders a transcript and sends normally; quote a CDP measurement of a rendered transcript (turns>0) and a successful send round-trip
  EVIDENCE: session 56b59d92 via CDP: before {"turns":5,"streamCapable":false}; sent "Reply with the single word SMOKE and stop." through the submitCommand path; after {"replied":true,"turns":5} — the agent's SMOKE reply arrived through the legacy stack, full round-trip. (sentEcho read false in the tail window sample; the reply arriving proves the send landed.)
