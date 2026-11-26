---
version: 1
slug: "src-lib-cawco-toolmatrix-svelte"
primary_target: "src/lib/cawco/ToolMatrix.svelte"
related_targets: ["src/routes/(app)/config/cli-tools/+page.svelte"]
---

# Command-line tools

Configure › Command-line tools (`/config/cli-tools`): one ledger per catalog tool (`ToolMatrix.svelte`), a row per machine (`MachineLedger.svelte`). Mode: Operate. The owner arrives to see which machine carries which CLI and put it where it is missing. No CLI is signed in here: Antigravity signs in per account, in Configure › Accounts (tsk-340).

## Regions

- Ledger head: tool name, homepage link, `n/m installed` (and `· k can't run`, only above 0), the Required on every machine switch.
- Ledger: Machine | Version | State. State stays the trailing column on every ledger, at one x down the page.
- Phone (a table under 640px): each row a card, the machine on the left, State at the right edge.

## Widths

390, 680, 1440, 2529: the ledger lives in Configure's column; at 680 the table is still a ledger; under 640 of table width it is cards.

direction: inherits DESIGN.md

## Review round 2 (2026-11-05)

- Phone card: the State cell lends its parts to the card's grid (Table.Cell `inCard="lends"`): the state at the card's end, an install refusal across the card from the machine's name.

## The sign-in column, removed (2026-11-26)

The Antigravity CLI's machine-level sign-in column, its popover and its parked flows are gone (tsk-340, cutover): Antigravity signs in per account.
