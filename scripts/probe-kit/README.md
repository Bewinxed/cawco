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

Planned, by name (`suite.ts` `PLANNED`): Caw ask and answer, task review
(a task needing a Mac waits, never fails), decisions, previews and comments,
routines, Jump, rules, and a plugin update reaching a running machine.

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
a capture by its name (`--approve tab-strip:rest-light,rest-dark`), a leg by
its name as a slug (`--approve project-bar:phone-390` for "phone 390"). An
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

## A spec that delegates is a `host` check

A scratch fleet whose spec delegates cuts workspaces, and every workspace runs
inside a boundary made of user namespaces. Inside a delegate's own workspace
no namespace can be made (`bwrap: No permissions to create a new namespace`,
`podman info`: `cannot clone: Operation not permitted`), so such a spec fails
there however it is written.

Declare it as a `host` check when you delegate the work:

```json
{ "name": "Host checks probe", "command": "bun scripts/probe-kit/run.ts host-checks", "host": true }
```

In a task file, write the check as `host: bun scripts/probe-kit/run.ts host-checks`.

The hub runs a `host` check outside every boundary, as the agent's user, in a
fresh checkout of the item's last commit with its dependencies installed, on
the workspace's machine (or the check's `machine`), and removes the checkout
when the run ends. Its report says `on the host`. It runs the delegate's
committed code unsandboxed, so only a session outside every boundary declares
one; the delegate cannot add or change it. A host refused for want of disk
space (`CAWCO_MIN_FREE_GB`, 10 GB unless set) fails the check with that
sentence.

Every other spec (a web spec on the built dashboard, a fleet spec that
spawns sessions without delegating) runs inside a workspace as an ordinary
check.

## Files a delegate cannot read

Logs, journal excerpts and transcripts a spec's delegate needs go in the
`delegate` call's `inputs` (absolute paths on the parent's machine): they are
copied into the delegate's `$TMPDIR/inputs/` before its first turn. Credential
stores, secret files and the host's logs are refused; 64 MiB in all.
