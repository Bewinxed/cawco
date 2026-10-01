# Fleet-wide denied tools: from compiled constants to fleet config

## 1. Recommended storage: `supervisor_config` key, not a new table

Add a `denied_tools` TEXT column (JSON string-array, nullable) to the existing
`supervisor_config` single-row table. Reasons:

- Denied tools is a scalar fleet-wide policy, not a collection of named rows.
  `mcp_servers`, `skills`, `plugins` are collections — each row is a thing the
  fleet carries. Denied tools is one list. A table whose only row is a JSON array
  is a `supervisor_config` column pretending otherwise.
- `supervisor_config` already holds the one other fleet-wide policy knob
  (supervisor model/enabled). Adding a column keeps the admin surface in one
  place, and the `manage_*` admin tools can expose it through the existing
  `supervisor_config` endpoint without a new verb.
- The hub's `fleetConfig()` builder already reads every table it sends to
  machines. A new column on `supervisor_config` is one more `.get()` in that
  function; a new table is a new import, new drizzle relation, and a new
  migration file for the same one list.

Schema: `denied_tools TEXT` — JSON `string[]` when set, `null` when the operator
has never touched it. `null` means "use the compiled default" during migration;
once the hub has seeded, the column is always a concrete list (possibly empty).

## 2. Resolution order

Final deny list for a spawned session = **union of three layers**, deduplicated:

1. **Fleet baseline** — `supervisor_config.denied_tools`, resolved (see §3).
2. **Delegate-type layer** — `delegate_types.deny_tools` for the resolved type
   (empty for a top-level session that has no type).
3. **Per-spawn overrides** — anything the caller passes in `opts.denyTools`
   (today: nothing uses this, but the plumbing exists in `delegation-actions.ts`).

Union, not intersection: every layer can only add denials, never remove one
another layer set. Removal is expressed by editing the layer that introduced the
name — an operator who wants `Task` back removes it from the fleet baseline in
the dashboard, not by trying to un-deny it in a delegate type.

### Worked examples

**Example A — default fleet, `explore` delegate type.**
Fleet baseline: `["WebSearch", "WebFetch", "Task", "Agent"]` (seeded default).
`explore` type: `denyTools: ["Write", "Edit", "NotebookEdit"]`.
Per-spawn: none.
Result: `["WebSearch", "WebFetch", "Task", "Agent", "Write", "Edit", "NotebookEdit"]`.

**Example B — operator re-enables native subagents fleet-wide.**
Operator edits fleet baseline to `["WebSearch", "WebFetch"]` via dashboard.
`code` delegate type: `denyTools: []` (or absent).
Result: `["WebSearch", "WebFetch"]`. `Task`/`Agent` are available.

## 3. Disconnect behaviour

The agent needs the fleet baseline to spawn a session. Two cases:

- **Never synced** (fresh install, hub unreachable on first boot): the compiled
  constants remain the fallback. `convergeDeniedTools` today applies them at
  daemon start *before* the first sync. This stays: the daemon writes the
  compiled default into `~/.claude/settings.json` on boot exactly as it does
  now, and uses the same list for spawns. No regression possible.
- **Synced at least once** (hub goes away mid-operation): the last-synced fleet
  baseline is in the sidecar (`~/.claude/cawco-fleet.json`) under a new
  `deniedTools` key. The spawn path reads it from there. `settings.json` was
  also converged on the last sync, so the user's own `claude` is consistent.

Cache location: `~/.claude/cawco-fleet.json` (`deniedTools: string[]`),
written by `converge()` alongside `mcp`, `skills`, etc. Same atomic-rename
write path, same stale-is-safe semantics: a stale deny list is more restrictive
than intended at worst, never less — because the only real-world edit is
*removing* a name the seed carried, and a stale cache still carries it.

## 4. Migration

1. Hub migration adds `denied_tools TEXT` to `supervisor_config`. The migration
   seeds the column with `'["WebSearch","WebFetch","Task","Agent"]'` — the exact
   current compiled constants. Any existing hub gets the same policy it enforced
   before, with no operator action.
2. The daemon's boot-time `convergeDeniedTools()` changes from reading compiled
   constants to reading the sidecar's `deniedTools` (falling back to the
   compiled constants when the key is absent — which is every existing sidecar
   before its first sync post-upgrade).
3. `FleetConfig` gains `deniedTools?: string[]`. The hub's `fleetConfig()`
   reads the column and includes it. An older daemon that does not understand
   the field ignores it (same forward-compat as `hooks`, `skills`), and its
   compiled constants are the same list — behaviour-neutral.
4. The compiled constants stay as the never-synced fallback, not deleted.

## 5. Change list

| File | Change |
|---|---|
| `packages/hub/src/db/schema.ts` | Add `deniedTools` TEXT column to `supervisorConfig` |
| `packages/hub/drizzle/NNNN_*.sql` | Migration: add column, seed with the four names |
| `packages/hub/src/db/index.ts` | `fleetConfig()` reads `supervisorConfig.deniedTools`, includes in return |
| `packages/core/src/fleet.ts` | `FleetConfig` gains `deniedTools?: string[]` |
| `packages/core/src/index.ts` | No change — `SpawnPayload.denyTools` already exists |
| `packages/agent/src/fleet.ts` | `converge()` writes `deniedTools` into sidecar; new `syncDeniedTools()` converges `~/.claude/settings.json` from the synced list |
| `packages/agent/src/fleet.ts` | `Sidecar` type gains `deniedTools?: string[]`; `readSidecar` returns it |
| `packages/agent/src/denied-tools.ts` | `convergeDeniedTools()` reads sidecar's `deniedTools` first, falls back to compiled constants. Export a `resolvedDenyList()` that returns the single resolved value for both consumers |
| `packages/agent/src/harnesses/claude.ts` | Replace `[...DENIED_WEB_TOOLS, ...DENIED_NATIVE_SUBAGENT_TOOLS]` with call to `resolvedDenyList()` |
| `packages/agent/src/daemon.ts` | Boot-time converge unchanged in shape — `convergeDeniedTools` still called, but it now reads the sidecar |
| `packages/hub/src/admin-tools.ts` | `manage_supervisor_config` (or a new `manage_denied_tools` action on an existing verb) exposes read/write of the column |
| `packages/hub/src/server.ts` | Dashboard API for reading/writing the fleet baseline (follows existing supervisor_config endpoints) |

## 6. Risks

1. **Operator empties the list and loses routing control.** If the operator
   removes `Task`/`Agent` from the fleet baseline and also has no `denyTools`
   on their delegate types, sessions can spawn native subagents that bypass
   fleet routing. This is the intended meaning of removing them — but the
   dashboard should show a warning when the list is edited to no longer
   contain `Task` or `Agent`, explaining that fleet routing can be bypassed.
2. **Stale sidecar after a downgrade.** A daemon that predates this change
   ignores `deniedTools` in `FleetConfig` and uses compiled constants — safe,
   because the compiled constants are the seed value. A daemon that has the
   change, running against an old hub that sends no `deniedTools` in
   `FleetConfig`, falls back to the sidecar (which was either populated by a
   prior sync or absent, triggering the compiled-constant fallback). Both
   directions are behaviour-neutral.
3. **Race between settings.json converge and fleet sync.** Already exists
   today: `convergeDeniedTools` runs at boot, fleet sync runs on register.
   After this change both write denied tools into `settings.json` from the
   same resolved source, so the race is idempotent rather than contradictory.
4. **Operator locks out all tools.** The schema accepts any string, so an
   operator could deny `Read`, `Bash`, etc. The admin endpoint should
   validate that the list contains only known tool names and warn (not block)
   on names that would deny core tools.
