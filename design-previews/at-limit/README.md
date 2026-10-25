# At its limit: design preview

The owner, on how a session waiting at its account's limit reads today: the
transcript's account line "is a fucking wall of text, unreadable and useless
text spam"; the red failure mark on its tab: "reaching limits is not a
failure state". The 10-22 protection stays (commit 51ad8bff4: a session sat
at one account's limit unnoticed while another had room): the wait is
noticed in seconds, and a move to an account with room is one press away.

The design (Fable's report b9646fd6, every word its own) is built on this
branch in the real components; this page draws it beside today's, from the
hub's own records. Nothing here lands on main until he picks.

```sh
python3 -m http.server -d design-previews/at-limit 8080   # any static server on this folder
bun scripts/probe-kit/run.ts at-limit-preview              # the proof (Chromium + WebKit)
bun design-previews/at-limit/capture/capture.ts            # remake parts.js, house.css, today.css, fonts/
bun design-previews/at-limit/capture/shots.ts [prefix…]    # remake captures/ and its manifest.json (only the shots named by a prefix)
```

One state is on screen, the switcher beside it; every state is a link
(`?__state=<key>&scheme=day|night`):

| Group | States (`__state`) |
| --- | --- |
| Today | `today-tab`, `today-home`, `today-rail`, `today-line`, `today-tray` |
| Surfaces | `tab`; `home-moves`, `home-resets`, `home-fits`; `rail`; `phone-row`; `line-rest`, `line-hover`, `line-pressed`, `line-phone-rest`, `line-phone-pressed`, `line-after`; `tray` |
| Fork A | `forka-dot`, `forka-nodot` |
| Fork B | `forkb-button`, `forkb-words` |
| Day / Night | `scheme=day`, `scheme=night` on any state |

What it is made of:

- `capture/records.json`: the hub's real records, read with GETs on the
  owner's hub at 08:16 UTC on 2026-10-25 (`/api/accounts`,
  `/api/usage/limits`, `/api/instances`, and the held session's transcript
  row): his seven Claude accounts, their sign-ins and benches, the held
  session "Fix three failing workspace specs" (`stalled` as the hub sent
  it), its parent and the sessions busy just before it, and its
  `system.account_move` row. Trimmed to the Claude accounts; nothing added.
- `capture/seed.js`: the client's stores seeded from those records, one
  pass each: `moves` (the hold as it was: moves to Petralab at 08:30),
  `resets` (its own account's 5-hour reset, 09:00, from /api/usage/limits),
  `fits` (as `resets`, with the one account that was not benched,
  bewinxed@petralab.ai's Organization, able to take it with the 29% its line
  recorded it had left, and so waiting because its own reset is near,
  `soon`) and `after` (past 08:30, carried on). The clock is
  held at the line's own timestamp, 08:00:01 UTC.
- `capture/Stage.svelte`: every surface drawn by its real component
  (PaneTabs, SessionRow at both sizes, AccountMoveDivider at rest and
  pressed open, DelegateTray) among its real neighbours. `capture.ts` runs
  it on this checkout and on origin/main (checked out into `$TMPDIR`), so
  Today is main's own components on the same records.
- `parts.js`, `house.css`, `today.css`, `fonts/`: written by `capture.ts`.
  Generated; never edited by hand. The forks are cut from the design's own
  parts: Fork A's "no dot" is the tree mark as TreeMark draws a status with
  no dot; Fork B's "words" is the second line without its text button.
- `index.html`, `preview.css`, `preview.js`: the page and its frames. A
  hovered state holds its frame as hovered (`data-hover`), answered with
  the house's own two declarations for `group-hover/move`.
- `captures/`: the decision page's shots, DPR 1, the surface alone, each
  captioned and marked Desk or Phone in `manifest.json`.

A phone frame on a desk window keeps the desk's media rules; open the page
at 390 wide (or read `captures/*-phone.png`, taken on a 390 × 844 touch
screen) to see a phone's.
