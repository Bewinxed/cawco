# A2UI v0.9.1, vendored

From https://github.com/a2ui-project/a2ui at `ae466ff020844b0b859ffc0cf5097b5ef37fb601`
(`specification/v0_9_1`), Apache-2.0 (LICENSE). Unchanged:

- `v0_9_1/json/`: the protocol's schemas. `server_to_client.json` and
  `common_types.json` validate every view a project's Caw drafts, with CawCo's
  catalog (`packages/core/src/a2ui-catalog.ts`, built by `../a2ui.ts`) in
  place of `catalog.json`, as the spec prescribes for a client catalog.
- `v0_9_1/catalogs/basic/`: the basic catalog, which the spec's fixtures are
  written against.
- `v0_9_1/test/cases/`: the spec's own fixtures, CawCo's conformance check
  (`bun run a2ui:check` in packages/hub, run by the root `typecheck`).
- `v0_9_1/docs/a2ui_protocol.md`: the protocol, for reference.

Update by copying the same paths from a newer commit and re-running the check.
