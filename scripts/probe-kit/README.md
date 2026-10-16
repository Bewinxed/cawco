# Probe kit

Every UI and fleet proof runs here, read from the engine, not the picture
(the fleet's rule 7): state and geometry first (`geom.ts`), motion by seeking
the clock (`anim.ts`), regressions by pixel diff against an approved baseline
(`diff.ts`), ink (`ink.ts`) only for what drawing alone decides.

```sh
bun scripts/probe-kit/run.ts web [spec…] [--approve <spec>[:<entry>,…]] [--review <dir>]   # specs/web/
bun scripts/probe-kit/run.ts <spec>                                                        # specs/<spec>.ts
```

Each assertion prints `PASS <spec>: …` or `FAIL <spec>: …`; the run ends with
`ALL PASS` or `N FAILED` and exits 0 only when every assertion passed. A spec
that needs a hub gets a scratch fleet (`kit.fleet`, `scripts/scratch-fleet.ts`):
a real hub, agent and sessiond with their own HOME, against a mock model.

## User journeys

```sh
bun scripts/probe-kit/run.ts journeys [name…] [--engine chromium|webkit|firefox] [--size phone|tablet|desk]
```

One suite of user journeys (`journeys/`) proves the product works for the
person: each a flow from JOURNEY.md done start to finish on a scratch fleet,
asserting the outcome the flow promises on the hub or the machine and on what
the page says, never that a control exists. Every journey runs on Chromium,
WebKit and Firefox at 390×844 and 768×1024 (touch) and 1440×900, with normal
data and stretched (titles three times longer, twice as many items), the same
steps everywhere. After every step the page is held to two rules
(`journeys/scan.ts`: nothing spills, no control covers text) and to no
console error. Locators are roles, labels and the person's words only.

It prints one line per journey × engine × size × data, `PASS`, or `FAIL` with
the first failing step and what it measured; a failed step leaves the page's
accessibility tree in `$TMPDIR/probe-kit/<journey>/<leg>/`. It runs once per
nightly release, not per change.

| Journey | Flow | Asserts |
| --- | --- | --- |
| `j1-check-in` | 1, check-in and wind-down | needs-you reads one and leads to the ask; zero once answered; never a zero while the hub is down |
| `j2-triage` | 2 and 3, triage | approve runs the command and the turn goes on; deny runs nothing; an answer from another device shows on the open page |
| `j3-spawn` | 4, spawn | the dialog starts a session in the project, streaming; Full Send from its card relaunches the machine's process in that mode |
| `j4-caw-asks` | Caw asks | two asks at once: “1 of 2” answered by click, “2 of 2” by its number key; Caw's next turn carries both answers |
| `j5-task-review` | task review | a task needing a Mac waits, never fails, while none is free (apple-gate's protection), then lands through the gate's build on the Mac; approve; send back, and the next attempt is given your words |
| `j6-decisions` | decisions | picks kept on the hub; I'm done picking sends the page in place and tells its writer |
| `j7-comments` | previews and comments | a pin on the session's page reaches the session by itself, with the line it was pinned on |
| `j8-routines` | routines | run now: one more run, its delegate given the instruction; pause: off on the hub, Paused on its row |
| `j9-jump` | Jump | a word of what was said finds the moment; it opens the conversation at the machine's own record of that line, in view |
| `j10-rules` | 5, rules | a template is live on the next session; an edit's words go out next; delete, then undo |
| `j11-plugin-update` | plugin update | a running session's hook runs the new version after Fetch again; the hook never fails through the swap, and the plugin is written once (plugin-swap's protection) |

J4, J5 and J8 start Caw's session or delegates, which run inside workspace
boundaries: those journeys run only where a boundary can start (the host,
outside every workspace), as `apple-gate` and `caw-asks` do.

## A pinned WebKit

WebKit pages run on the build this playwright-core expects, or the one
`PROBE_WEBKIT` names (its `pw_run.sh`). A spec that reads a bug a phone's
Safari still has and a newer build has fixed names that build instead:
`kit.page(view, { engine: "webkit", webkit: PINNED_WEBKIT })`. That is
WebKit 2359, which hangs its web process on a transitioned blur as the
owner's iPhone Safari does (`safari-long-ask`, `safari-blurs`); it is
read from Playwright's browser cache, installed with
`bunx playwright-core@1.63.0 install webkit`.

## Approving a baseline

Only after the owner has approved what it shows. `--approve <spec>` writes
every baseline the spec keeps from this run. `--approve <spec>:<entry>,…`
writes the entries named and leaves every other one as it is, to the byte:
a capture by its name (`--approve <spec>:rest-light,rest-dark`), a leg by
its name as a slug (`--approve <spec>:phone-390` for "phone 390"). An
entry the spec doesn't write fails the run. `PROBE_BASELINES=<dir>` reads and
writes the baselines under `<dir>/web/<spec>/` instead of `baselines/`: a
scratch copy, to prove an approve on.

## Showing the owner what changed

`--review <dir>` (say `.probe-review/<spec>`) writes the owner's review page
when a capture differs from its baseline: one phone page, one decision per
surface, "Approved look" or "New look" on the same cropped pictures
(`review.ts`, `scripts/probe-review/README.md`). The run prints the
`--approve` command each "New look" pick runs; the manifest carries it too.
Open the folder with `artifact_create(kind: "preview", dir)`.

## The style snapshot and the hub tape

```sh
bun scripts/probe-kit/run.ts style-snapshot [--surfaces=a,b] [--approve]   # computed styles, boxes, overflow, forced states
bun scripts/probe-kit/run.ts web surfaces [--surfaces=a,b] [--approve surfaces]   # the same surfaces' pixels
bun scripts/probe-kit/run.ts style-snapshot --coverage                      # style-snapshot-coverage.json
bun scripts/probe-kit/run.ts style-snapshot --record                        # the hub tape, again
```

`style-snapshot` reads every element of every surface (`surfaces/catalogue.ts`)
at desk 1440, tablet 820 and phone 390, light and dark, and the desk once
with reduced motion: its computed style, its box to 0.5px, its
`::before`/`::after`, its look under `:hover` and `:focus-visible` (forced
through CDP), and whether it spills or stands outside what holds it. Each
element is keyed by its DOM path from the surface's root, never a class.
`PASS style-snapshot: 0 differences`, or one `FAIL` line per difference.

Both read a hub on tape (`hub-tape.ts`, `fixtures/style-snapshot/hub-tape.json.gz`):
a scratch fleet's hub (`surfaces/scene.ts`) recorded once and answered back
byte for byte, with the page's clock held at the recording's moment. No
fleet stands up, so both run inside any workspace, and two runs read the
same. A request the tape never saw is answered 404 and named in a `NOTE`.
Record again (`--record`) when the scene or the dashboard's reads change,
then approve again.

## A spec that delegates runs on the host

A scratch fleet whose spec delegates cuts workspaces, and every workspace runs
inside a boundary made of user namespaces. Inside a delegate's own workspace
no namespace can be made (`bwrap: No permissions to create a new namespace`,
`podman info`: `cannot clone: Operation not permitted`), so such a spec fails
there however it is written.

Such a spec runs outside every boundary: from the shell of a session the
person started, on a checkout of the delegate's commit. A delegate that
writes one lists it under "Not run:" in its finish_item report, with the
exact command, for that session to run.

Every other spec (a web spec on the built dashboard, a fleet spec that
spawns sessions without delegating) runs inside a workspace, and its
delegate quotes the run's output in its report.

## Files a delegate cannot read

Logs, journal excerpts and transcripts a spec's delegate needs go in the
`delegate` call's `inputs` (absolute paths on the parent's machine): they are
copied into the delegate's `$TMPDIR/inputs/` before its first turn. Credential
stores, secret files and the host's logs are refused; 64 MiB in all.
