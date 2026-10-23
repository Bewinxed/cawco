# Probe kit

Every UI and fleet proof runs here, read from the engine, not the picture
(the fleet's rule 7): state and geometry first (`geom.ts`), motion by seeking
the clock (`anim.ts`), regressions by pixel diff against an approved baseline
(`diff.ts`), ink (`ink.ts`) only for what drawing alone decides.

```sh
bun scripts/probe-kit/run.ts web [spec…] [--approve <spec>[:<entry>,…]] [--review]   # specs/web/
bun scripts/probe-kit/run.ts <spec>…                                                       # specs/<spec>.ts, each in order
```

Each assertion prints `PASS <spec>: …` or `FAIL <spec>: …`; the run ends with
one line over every spec it ran, `ALL PASS (N specs, …)` or `N FAILED: <spec>, …`,
and exits 0 only when every assertion passed. A spec
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
| `j3-spawn` | 4, spawn | the dialog starts a session in the project, streaming; Full Send from its card relaunches the machine's process in that mode; with a second session it started, each message written while moving between the two (its card, Back, its tab) is on the hub under the conversation on screen, and shows there |
| `j4-caw-asks` | Caw asks | two asks at once: “1 of 2” answered by click, “2 of 2” by its number key; Caw's next turn carries both answers |
| `j5-task-review` | task review | a task needing a Mac waits, never fails, while none is free (apple-gate's protection), then lands through the gate's build on the Mac; approve; send back, and the next attempt is given your words |
| `j6-decisions` | decisions | picks kept on the hub; I'm done picking sends the page in place and tells its writer |
| `j7-comments` | previews and comments | a comment on the session's page reaches the session on Send, with the line it was written on |
| `j8-routines` | routines | create by hand: the form's schedule read back by the hub, the routine listed as filled, its test run started once; run now: one more run, its delegate given the instruction; pause: off on the hub, Paused on its row |
| `j9-jump` | Jump | a word of what was said finds the moment; it opens the conversation at the machine's own record of that line, in view |
| `j10-rules` | 5, rules | a template is live on the next session; an edit's words go out next; delete, then undo |
| `j11-plugin-update` | plugin update | a running session's hook runs the new version after Fetch again; the hook never fails through the swap, and the plugin is written once (plugin-swap's protection) |

J4, J5 and J8 start Caw's session or delegates, which run inside workspace
boundaries: those journeys run only where a boundary can start (the host,
outside every workspace), as `apple-gate` and `caw-asks` do.

## Motion on every engine, and a hand

`readMotion(page, action, within, { fractions, read })` (kit.ts) reads the
enter or exit `action` starts inside `within` on a held clock, on any engine:
each run held at its start, sought to each fraction with `read` taken there,
then let go to play out (`ended`). Chromium holds it through the DevTools
Animation domain (`anim.ts` `Clock`); WebKit and Firefox, which Playwright
gives none, hold it in the page: a MutationObserver catches a transition's
write before any frame and sets its `playbackRate` to 0, `Element.animate`
is wrapped so a Web Animation starts at 0, and once every run has started
they are paused, sought and played on. A spec never waits frames for a run to
begin or polls `getAnimations()` for one to end: on a slow frame the whole
motion is over before the poll sees it.

A read begins on a still surface: before the action, `readMotion` waits
until nothing inside `within` has run for two frames (`stillWithin`), so the
last motion there (a menu's exit WebKit started 173ms late) is never held as
the action's, and a run made before the read is never its own. A read of
boxes (an overflow sweep) waits on `stillWithin` too, and on the boxes it
reads standing for three frames: WebKit has told a transition finished while
its box still moved.

`handOn(page)` is a finger and a resting mouse cursor: raw touch through CDP
on Chromium, PointerEvents made in the page elsewhere (Playwright drives no
touch drag in WebKit), the finger's capture kept by the hand. A boundary
event it sends never names its own target as its related target: WebKit
delivers such a `pointerout` to no listener.

`PROBE_ENGINE=webkit` (or `firefox`) runs every page a spec does not pin to
an engine on that engine.

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

A capture that differs from its approved baseline FAILs the run.
`--review` also writes the owner's review page into a folder outside the
repository, `$XDG_CACHE_HOME/cawco/probe-review/<specs>-<head>` (`~/.cache`
when unset), or the folder `PROBE_REVIEW_DIR=<dir>` names; the run prints it.
A review run is build output, never source: nothing of it is committed. It
holds the new captures as candidate baselines under `<dir>/candidates/`, apart
from the approved set, and one page grouped by surface, each capture as its
approved baseline, its new capture and the crop of what changed, with one
Approve or Reject per surface (`review.ts`, `scripts/probe-review/README.md`).
The orchestrator opens it with `artifact_create(kind: "preview", dir: <dir>)`; the page's
`artifact_read` answer, saved as JSON, goes to
`bun scripts/probe-kit/approve-review.ts <dir> <picks.json>`, which moves only
the approved surfaces' candidates over the approved baselines.

## The style snapshot and the hub tape

```sh
bun scripts/probe-kit/run.ts style-snapshot [--surfaces=a,b] [--approve]   # computed styles, boxes, overflow, forced states
bun scripts/probe-kit/run.ts web surfaces [--surfaces=a,b] [--approve surfaces]   # the same surfaces' pixels
bun scripts/probe-kit/run.ts style-snapshot --coverage [--surfaces=a,b]     # style-snapshot-coverage.json: the states that render each .svelte file
bun scripts/probe-kit/run.ts style-snapshot --record                        # the hub tape, again (on the host)
bun scripts/probe-kit/run.ts style-snapshot --record --without-delegate     # in a workspace: no delegate
```

The scene's delegate needs a workspace of its own, which only the host can
make (a workspace has no user namespaces), and pairing a machine needs an
address the hub lists for it, which a workspace's machine (loopback alone)
has none of. A tape recorded in a workspace (`--without-delegate`) holds
neither, and every walk over it leaves out the states that stand on them
(`hostOnly: "delegate" | "join"` in the catalogue), each said once in a
`NOTE`: `session/delegate: host only, not in this tape: it holds no delegate
(recorded --without-delegate)`. The tape the repository keeps is
a host's.

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

Every spec that walks the surfaces (`walkTapes`) FAILs a state the
catalogue lists and the walk does not open: `<surface>/<state> · <pass>:
opens`, with what stopped it. A tape that falls behind the scene or the
hub's answers shows there, never as a skipped state. A state left out on
purpose is left out by the catalogue itself, with its reason: its `widths`,
`hostOnly`, or a sheet tape not recorded here.

## A spec that delegates runs on the host

A scratch fleet whose spec delegates cuts workspaces, and every workspace runs
inside a boundary made of user namespaces. Inside a delegate's own workspace
no namespace can be made (`bwrap: No permissions to create a new namespace`,
`podman info`: `cannot clone: Operation not permitted`), and on macOS
Seatbelt does not nest (`sandbox-exec: sandbox_apply: Operation not
permitted`, exit 71), so such a spec fails there however it is written.

Such a spec says so: its `host` field names why it starts boundaries
(`host: "it delegates, so its fleet cuts workspaces"`). Run inside a
workspace (`CAWCO_WORKSPACE` set), it is not run; the run prints
`HOST <spec>: runs on the host …` with its command, lists it under `NOT RUN
HERE`, and exits 3 when nothing failed. A spec that starts a boundary in one
leg only and words that leg's refusal (comment-delivery) carries no `host`.

The other way round, a spec that reads what a workspace's boundary gives a
command (its proxy, its tool door) says so in its `workspace` field
(boundary-proxy). Run outside every workspace (`CAWCO_WORKSPACE` unset), it is
not run; the run prints `WORKSPACE <spec>: runs inside a workspace's boundary
…` with its command, lists it under `NOT RUN HERE`, and exits 3 when nothing
failed.

Such a spec runs outside every boundary: from the shell of a session the
person started, on a checkout of the delegate's commit. A delegate that
writes one lists it under "Not run:" in its finish_item report, with the
exact command, for that session to run.

Every other spec (a web spec on the built dashboard, a fleet spec that
spawns sessions without delegating) runs inside a workspace, and its
delegate quotes the run's output in its report.

**macOS Safari can't be launched from a workspace** (found by the top-strip
leaf, 20038062). `open -g -a Safari` fails with LaunchServices -10820, and
MobileBuildMCP `launch_mac_app` is refused as a write to
/Applications/Safari.app. A macOS Safari sample runs from a session started
outside every workspace on the Mac, with the screen unlocked.

An iOS Simulator booted from a workspace (`xcrun simctl boot`) runs Safari
as one booted outside it does: on iOS 27.2 both loaded example.com, its web
process launched and the page painted.

The iOS 26.3 simulator runtime (23D8133) is not a Safari probe's runtime on
a macOS 27 host: its JavaScriptCore crashes the web process (SIGBUS,
`KERN_PROTECTION_FAILURE`) a second or two into JS-heavy pages, the
dashboard and public sites alike (react.dev and figma.com 2 of 2 loads),
while 26.0, 18.5 and 27.2 load the same pages clean. Older runtimes on
macOS 27 crash the same way
(https://blog.rinsuki.net/articles/old-ios-simulators-on-xcode-27/). A page
that never painted there, and a Safari that started no load after it, was
this crash. `ios-safari-load` runs on the newest runtime and on 26.0.

## A spec with its own git and HOME

A spec that stands up its own git repositories, doors or forge sign-ins
under a HOME of its own says so with `ownHome` (its reason), and `run.ts`
runs it in a process of its own: a scratch HOME set as that process starts,
and none of an enclosing workspace's git or gh settings (`GIT_CONFIG_*`,
`CAWCO_GIT_*`, `GIT_SSH_COMMAND`, `GIT_LFS_SKIP_PUSH`, `GIT_TEMPLATE_DIR`,
`GH_CONFIG_DIR`, kit.ts `ENCLOSING_GIT_ENV`). Bun's `os.homedir()` reads HOME
once, as the process starts, so a HOME a spec sets later moves nothing
CawCo's paths read; and a workspace's `pushInsteadOf` would send the spec's
own setup pushes through that workspace's git door. So `git-door` and
`forge-adapters` run as `bun scripts/probe-kit/run.ts <spec>` alike inside a
workspace and on the host, with no wrapper.

## Files a delegate cannot read

Logs, journal excerpts and transcripts a spec's delegate needs go in the
`delegate` call's `inputs` (absolute paths on the parent's machine): they are
copied into the delegate's `$TMPDIR/inputs/` before its first turn. Credential
stores, secret files and the host's logs are refused; 64 MiB in all. What the
hub already holds goes by name, with no file written for it (core
handed-input.ts): `{ report }`, `{ artifact }`, `{ pins }`, `{ find }`,
`{ attachment }`, `{ assets }`, `{ text, name }`, `{ blob, name }`
(`handed-inputs` proves each).
