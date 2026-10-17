# type-roles: what this branch changed, site by site, for phase 2

T is ac7b79de8, the base of record. A "site" is a `font: var(--type-*)` (or `outline:`/`background:`) declaration in a component `<style>` at T. "Head" is this branch's head. Paths are under apps/dashboard/src.

## Commits
- **ed26d7d94:** `type-<role>` is the `font` shorthand. Extras: kpi keeps tabular-nums; title tracking and code ligatures come out of their roles.
- **f0e6dcf29:** the token check (`build-tokens.ts --check`, in `bun run lint`) holds every `font` shorthand utility before every font longhand utility (scripts/role-order.ts).
- **d1bc87e3c:** every site fix (changes.md), tailwind-merge conflicts for the shorthand classes (lib/utils.ts), app.css `font-inherit`/`font-mono-meta` sorted with the roles, and `text-size-inherit`.
- **The head commit:** self-named theme keys go in `@theme inline reference` (shadow-tile.md), plus these lists.

## Files
- **changes.md:** every component line d1bc87e3c changed, at head file:line, with the class tokens taken out (−) and put in (+), the raw lines, and the T site(s) whose element it is. On a merge conflict, make the same token swap on the set's form of that element.
- **site-map.tsv:** all 577 role sites. Verdict, T site, role, the subject class, and the element(s) at head with their full class string. Footer tally: ok 545, css 15, unmapped 11, partial 5, missing 1; the notes below settle all 17.
- **nonok-sites.txt:** the sites that weren't ok before d1bc87e3c, with their T font declarations in order and their classes then.
- **role-extras.md:** the per-role extras table, and the 16 extras sites with head lines.
- **shorthand-inventory.md:** the other resetting shorthands, static and computed.
- **outline-sites.md:** all 43 outline sites, with what differs at rest and at `:focus-visible`.
- **background-sites.md:** every background site that differs or wasn't rendered.
- **computed-pass.tsv:** the raw rows.
- **shadow-tile.md:** the `--x: var(--x)` cycle and its fix.
- **proof/:** the Chromium, compile and check outputs these files quote.

## The 17 site-map rows the map can't settle on its own (read by hand)
- **unmapped 11, all right at head.** Ledger `:global(tr… th/td)` rules whose cells are kit `Table.Head`/`Table.Cell` components:
  - routines/ActionsTable.svelte:148/:157 → th :93 :97 :102 :107 (`type-label tracking-caps`), td :123 (`type-meta … num`)
  - routines/RoutineDetail.svelte:286/:296 → th :186–:198, td :215 (`type-meta … num`)
  - tasks/TaskTable.svelte:365/:378 → th :236 :238 :241 :274, td :313
  - usage/ProjectSpend.svelte:630/:643 → th :477 :481 …, td :503 …
  - views/ViewRoutines.svelte:1097 → td :726 :737
  - views/openui/ViewTable.svelte:118/:127 → th :67 (`type-label` added in d1bc87e3c), td :81
- **partial 5, right at head.** A shared slot name gave extra candidates; the element carrying the role is the site's:
  - home/UpdateCard.svelte:415 → :335
  - tasks/TaskFields.svelte:236 → :89 (`type-body`); the `type-code` input at :143 is :247's
  - tasks/TaskReview.svelte:576 → the "Open" anchor :348 (`type-label`)
  - views/ViewRoutines.svelte:1178 → :749 and :1055
  - accounts/AccountListRow.svelte:115 → the problem line :59 (`type-meta`)
- **missing 1, not a site.** home/NeedsCard.svelte:1044 `.peers > :global(.refusal)` never matched at T: ErrorText puts the class on an inner `<button>`, not on a child of `.peers`.
- **css 15, exact.** The declaration is still in a residual `<style>`: StrategyFigure, MentionField chips, ProjectDetails, ViewCalendar's library DOM, ViewRoutines' band, sonner.

## Not remapped here (phase 2, from these lists)
K2 is adding the outline-reset and background-shorthand utilities. The 13 `outline: none` sites in shorthand-inventory.md are left as `outline-none`.
