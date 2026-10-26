# Probe kit

Every UI and fleet proof runs here, read from the engine, not the picture:
state and geometry first (`geom.ts`), motion by seeking the clock
(`anim.ts`), ink (`ink.ts`) only for what drawing alone decides. A proof
holds what it reads to what is correct, never to a stored picture or style
dump of an earlier run.

```sh
bun scripts/probe-kit/run.ts web [spec…]   # specs/web/
bun scripts/probe-kit/run.ts <spec>…       # specs/<spec>.ts, each in order
```

Each assertion prints `PASS <spec>: …` or `FAIL <spec>: …`; the run ends with
one line over every spec it ran, `ALL PASS (N specs, …)` or `N FAILED: <spec>, …`,
and exits 0 only when every assertion passed. A spec
that needs a hub gets a scratch fleet (`kit.fleet`, `scripts/scratch-fleet.ts`):
a real hub, agent and sessiond with their own HOME, against a mock model.
Its teardown ends every process whose environment still names one of its
folders (its HOME, runtime dir, sandbox), however far it forked away: a
session's MCP server's daemon included (`fleet-leaves-nothing`).

## One machine, so many runs at once

A run takes one of the machine's heavy-work slots (`slot.ts`, core
`heavy-slots.ts`) before its first dashboard build, dev or preview server,
browser or scratch fleet, and holds it until its process ends, however it
ends: the slot is a `flock(2)` on a file in
`~/.cawco/workspace-cache/heavy-slots/`, which every workspace and the host
share, and the kernel frees it when its holder dies (a SIGKILL included).
The pool is the machine's one: a work item's merge checks, a stage clone's
install and every `bun run check` take from it too. A machine has one slot
per 6 cores and per 16 GiB, whichever is fewer (8 on obelisk: 48 cores,
188 GiB); `heavy-slots.ts` says why. A run past the slots waits in line, in
the order it came, and says what it waits on:

```
… waiting for a heavy-work slot: 8 of 8 held by composer-canvas@399853c2 (4m02s), …; 2 run(s) ahead in line (1m10s so far)
… heavy-work slot 3 of 8 taken by decision-embed@7f626068 after waiting 6m14s
… it and what it starts run at nice 10 or more
```

A wait past an hour fails the run with who held every slot. Whatever a
holder starts (a fleet, an `ownHome` spec's process, a probe script) runs
under its slot and takes none of its own, at nice 10, so the person's own
sessions win the CPU. `heavy-slots` proves that more merge checks and
`bun run check` runs than slots wait their turn, and `probe-slots` the
line itself.

Every browser the kit launches runs under a memory cap (`browser-cap.ts`):
once its process tree holds more than 6 GiB resident, the tree is killed
and the spec fails, naming the spec, its `--leg`, the pages open and the
cap. A spec that launches a browser itself wraps the launch in `capped`.
`probe-slots` and `browser-cap` prove both.

Leave the dashboard's source alone while a run is going: a spec that serves
it with the dev server (`/motion/` benches, canvas-design's panel) hot-reloads
every edit into its open pages, which reloads them mid-read and fails legs
the edit never touched.

## House rules

Every preview spec and every live UI spec that reads a rendered screen
holds it to the house rules with `house-rules.ts`, the same way everywhere,
so a screenshot review is left with what a person must judge:

```ts
const house = new HouseRules(kit, engine, { scope: '[data-slot="stage"]' });
await house.at(page, "state name"); // at each state, once the spec has settled it
house.report();                      // one PASS/FAIL line per rule over every state
```

`settle(page)` (fonts in, then kit.ts `settle`: one-shot runs landed,
loops paused at their start) gets a page ready for a read; a page still
moving in the surface is the `settled` rule's finding.

| Rule | Read by | What it reads |
| --- | --- | --- |
| `overflow` | `journeys/scan.ts` + impeccable `text-occlusion` | text past the screen, out of its control or box; a control out of the row, card or panel it is laid out in (`specs/web/scan-control-box`); text under a control or an opaque box |
| `coral` | own code | per view (`views`), controls and worded chips whose fill, edge or (a control's) ink is a coral token from tokens.css: at most one; a checked checkbox, switch or radio is named, not counted; a bare link is link ink |
| `glyph` | own code | a control whose only content is a glyph sits on no fill, edge or shadow, nor does a wrapper holding it alone; its svg holds no solid disc, tile or rounded shape spanning 70% of its viewBox (`marks` adds standalone status glyphs) |
| `bar-ground` | own code | `header`, toolbars, the bar and foot data-slots paint nothing; a folder-tab shelf (DESIGN.md:665) and a group's capsule are named |
| `head` | own code | a bar's title and controls on one row (centres within 4px), no second line in the bar, the title not repeated by the next heading |
| `back-close` | own code | no control's words say Back or Close |
| `hidden-cue` | own code + ink | a scroller cut at an edge has a mask there that draws (the band drawn with the mask, without it, and without the scroller), or an item peeking 16px |
| `contrast` | own code + impeccable `low-contrast` | each text run on the ground under it, 4.5:1 (3:1 from 24px); the lowest is printed |
| `settled` | own code | no finite animation running, fonts loaded |
| `made-up` | own code | no `PROBE-`, `JOURNEY-`, `/tmp/`, `.cawco/tmp`, `probe-kit`, `Lorem`, `Test item`, lone “Body”; `allowedText` slots hold only their source's words |

Impeccable runs as `impeccable detect --json --cdp <port>` on the page as it
stands: every kit Chromium carries a DevTools port (`devtoolsPort(page)`),
and the launcher is `$IMPECCABLE`, else the impeccable skill's. It reads
Chromium only; on WebKit the report says so and the kit's own contrast and
overflow reads stand alone. Its findings outside the house rules (line
length, nested cards…) print as a NOTE, never a failure. A Chromium read
where it could not run fails.

Exempt only with a reason, which the report prints: `exempt: { rule: "why" }`
drops a rule for the spec; `except: [{ rule, selector, reason }]` (or
`text` for a sweep line) excuses findings one element at a time;
`noImpeccable: "why"` keeps impeccable off a read whose side effects the
spec's later legs would see (it scrolls what it measures: thinking-traffic's
transcript lost its pin to the foot). A rule that
fails for real on main is fixed, not exempted.

## User journeys

```sh
bun scripts/probe-kit/run.ts journeys [name…] [--engine chromium|webkit|firefox] [--size phone|tablet|desk]
```

`--engine` and `--size` each take one, or several by commas
(`--engine chromium,webkit --size phone,desk`).

One suite of user journeys (`journeys/`) proves the product works for the
person: each a flow from JOURNEY.md done start to finish on a scratch fleet,
asserting the outcome the flow promises on the hub or the machine and on what
the page says, never that a control exists. Every journey runs on Chromium,
WebKit and Firefox at 390×844 and 768×1024 (touch) and 1440×900, with normal
data and stretched (titles three times longer, twice as many items), the same
steps everywhere. After every step the page is held to three rules
(`journeys/scan.ts`: nothing spills, no control runs out of its row, card
or panel, no control covers text) and to no
console error. Locators are roles, labels and the person's words only.

It prints one line per journey × engine × size × data, `PASS`, or `FAIL` with
the first failing step and what it measured; a failed step leaves the page's
accessibility tree in `$TMPDIR/probe-kit/<journey>/<leg>/`. It runs once per
nightly release, not per change.

| Journey | Flow | Asserts |
| --- | --- | --- |
| `j7-comments` | previews and comments | a comment on the session's page reaches the session by itself, with the line it was written on |

A journey names its group as a spec does (`Journey.group`, groups.ts);
`bun run check` refuses one in a group the owner cut. The journeys of the
cut groups (j1–j6, j8–j12) were cut with them on 2026-10-26.

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
motion is over before the poll sees it. Each caught run's Animation and its
`finished` promise are kept as the clock catches it, before any seek, so a
run that fills nothing (a CSS transition, a `fill: backwards` run shorter
than the moment) is followed to its end though it leaves `getAnimations()`
once sought past it, and a run the page cancels after it finished is read by
the promise that settled, never the new one that would not.

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

## WebKit

WebKit pages run on the build this playwright-core expects, or the one
`PROBE_WEBKIT` names (its `pw_run.sh`). Playwright's WebKit is not the
Safari on the owner's iPhone (iPhone18,2, iOS 27.0): what a spec reads in
it is that build's behaviour, and a spec says so rather than claiming his
phone does the same.

Every WebKit page styles as Safari does where the build alone differs: the
kit removes Tailwind v4's `@layer properties` fallback from each style sheet
as it loads (kit.ts `safariParity`). Playwright's WebKit lacks
`margin-trim: inline` and so applies it (about 105 custom properties on
every element), real Safari 27 does not; with it a full restyle took 344 ms
against 134 ms. Every WebKit style and layout number reads Safari's cost.

## A trace's selector statistics

`PROBE_TRACE_SELECTORS=<folder>` has every `traceMain` trace (Chromium) take
Blink's selector statistics too and writes each trace whole to the folder,
for DevTools' Performance panel or a reading of its own: each rule's match
attempts, matches and time under each style pass, and the selectors behind
each invalidation. A diagnosis only: counting every match slows each pass
several times over, so its timed assertions fail.

## A browser leaves nothing behind

Every browser the kit or a spec launches runs with `launchEnv()`
(`browser-leftovers.ts`) as its environment, which tags it. Once a spec's
own browsers have closed, and once the run's shared ones have, the kit
checks that no process carrying the tag is left (`… leaves no process of its
own behind`), a `chrome_crashpad_handler` above all: Crashpad starts it
through a `setsid()` and a double fork, so it is no part of the browser's
process tree. A spec that launches a browser itself passes `launchEnv(env)`.
The kit's Chromium pages run the headless shell, which starts no crash
reporter; full Chromium (`channel: "chromium"`, a hand-spawned
`chromium.executablePath()`) always starts one, and no switch stops it
without breaking its renderers.

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

## A spec with its own git and HOME

A spec that stands up its own git repositories, doors or forge sign-ins
under a HOME of its own says so with `ownHome` (its reason), and `run.ts`
runs it in a process of its own: a scratch HOME set as that process starts,
and none of an enclosing workspace's git or gh settings (`GIT_CONFIG_*`,
`CAWCO_GIT_*`, `GIT_SSH_COMMAND`, `GIT_LFS_SKIP_PUSH`, `GIT_TEMPLATE_DIR`,
`GH_CONFIG_DIR`, kit.ts `ENCLOSING_GIT_ENV`). Bun's `os.homedir()` reads HOME
once, as the process starts, so a HOME a spec sets later moves nothing
CawCo's paths read; and a workspace's `pushInsteadOf` would send the spec's
own setup pushes through that workspace's git door. So `git-door` runs as
`bun scripts/probe-kit/run.ts git-door` alike inside a
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
