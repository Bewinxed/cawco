---
version: 1
slug: "src-lib-cawco-toolmatrix-svelte"
primary_target: "src/lib/cawco/ToolMatrix.svelte"
related_targets: ["src/routes/(app)/config/cli-tools/+page.svelte","src/lib/cawco/tool-signin.svelte.ts"]
---

# Command-line tools

Configure › Command-line tools (`/config/cli-tools`): one ledger per catalog tool (`ToolMatrix.svelte`), a row per machine (`MachineLedger.svelte`). Mode: Operate. The owner arrives to see which machine carries which CLI and put it where it is missing; for a tool with its own sign-in (core `ToolSpec.signin`, the Antigravity CLI today), also which machines have it signed in, and to sign it in.

## Regions

- Ledger head: tool name, homepage link, `n/m installed`, and for a tool with a sign-in `· k signed in` (only above 0), the Required on every machine switch.
- Ledger: Machine | Sign-in (a tool with a sign-in only) | State. State stays the trailing column on every ledger, at one x down the page; Sign-in sits between, beside the machine it is about.
- Phone (a table under 640px): each row a card, the machine on the left across both lines, Sign-in and State stacked at the right edge, State first.

## The Sign-in cell's states

- Not installed (no copy on the machine): empty.
- Signed in: the done tick and "Signed in", quiet ink. No action (the CLI has no sign-out CawCo runs).
- Signed out: the word in muted ink, then Sign in (outline xs), which opens the sign-in popover. Offline: the word alone.
- Unknown: a ghost Unknown badge opening a popover with the CLI's own words, then Sign in beside it. Offline: the badge alone.
- A sign-in under way, its popover put away: "Waiting for the pasted code" and Paste code, which opens the same popover on the same link.
- A refusal or a lapsed link, the popover put away: RowFault under the cell in the refuser's words, Sign in again its way on.
- Signed in just now: in the popover, the drawn tick and the outcome, held `--dur-hold`, then the popover puts itself away; the cell reads Signed in.

## The sign-in popover

NsPopover (one NsPopoverGroup for the page), `--c-signin-pop-w`, holding SigninPanel: Open sign-in link (opened in the press, a blank tab sent to the link once the machine answers), then paste the code, how long the link still works (minutes, ticking), the code field and Done; under them the outcome. A refused code or a lapsed link spends the link: the panel's Open sign-in link starts a new one. A machine that didn't answer keeps the link.

## Work outlives the popover

The flow belongs to machine × tool (`tool-signin.svelte.ts`), not to the popover: put away it parks on the cell; the link and its expiry, and which popover was open, are kept in the tab (TabDraft `cawco:tool-signin`), so a reload reopens it on the same link until it lapses.

## Widths

390, 680, 1440, 2529: the ledger lives in Configure's column; at 680 the table is still a ledger; under 640 of table width it is cards.

## Verdict and backlog (2026-11-05)

Streamline: the ledger served every task but the two sign-in ones; the fact and the act fit as one column. P0: draw the sign-in state; sign in from the dashboard. P1: park and reload; a visible 10-minute life; refusals in the CLI's words with a new link; the signed-in count on the head.

direction: inherits DESIGN.md
