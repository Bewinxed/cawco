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

## Rendered checks

Every preview spec and every live UI spec that reads a rendered screen
measures it with `rendered-checks.ts` (overflow, contrast, coral use, bar
layout, insets and the rest in the table below), the same way everywhere,
so a screenshot review is left with what a person must judge:

```ts
const checks = new RenderedChecks(kit, engine, { scope: '[data-slot="stage"]' });
await checks.at(page, "state name"); // at each state, once the spec has settled it
checks.report();                      // one PASS/FAIL line per rule over every state
```

Any page, from the command line, once per width (under 640 a phone's touch
screen), in the scheme the page follows from the OS (`--scheme`, light when
not given), exiting 1 on any finding. It reads once the page has drawn:
something in the scope to read and no element coming or going for a quiet
second, up to 30s (`untilDrawn`; a dev route vite is still compiling holds
3 elements at `load`), and says so when the bound runs out. A read whose
scope drew nothing fails every rule, there and in a spec's report
(`specs/web/drawn-wait`):

```sh
bun scripts/probe-kit/rendered-checks.ts <url> --width 1540x800 --width 390x844 [--scope <selector>] [--scheme light|dark]
```

| Rule | Read by | What it reads |
| --- | --- | --- |
| `overflow` | `journeys/scan.ts` + impeccable `text-occlusion` | text past the screen, out of its control or box; a control out of the row, card or panel it is laid out in (`specs/web/scan-control-box`); text under a control or an opaque box; what is hidden (a 1px box, `sr-only`'s `clip-path: inset(50%)`) is not read, and words an open layer covers (a popover, menu or dialog over the page) are named (`specs/web/rendered-reads`, where impeccable runs) |
| `coral` | own code | per view (a spec's `views`, else the scope; and each `data-specimen`), controls and worded chips whose fill, edge or (a control's) ink is a coral token from tokens.css: at most one; a checked checkbox, switch or radio, a chosen record (`data-chosen`), an identity tile, a mark out of the accessibility tree (`data-mark`, `aria-hidden`: a comment's pin, the reader's own mark), a found word (`<mark>`, a search's hit) and a region's one coral hairline side (the vermillion section rule: Files, Caw's panel) are named, not counted; a bare link is link ink (`specs/web/rendered-reads`) |
| `glyph` | own code | a control whose only content is a glyph sits on no fill, edge or shadow, nor does a wrapper holding it alone; its svg holds no solid disc, tile or rounded shape spanning 70% of its viewBox (`marks` adds standalone status glyphs) |
| `bar-ground` | own code | toolbars, the bar and foot data-slots, and a `header` that does not scroll with its content (one that does, in flow under a scroller, or one under another bar of its surface, a sheet's relay head, heads a group of it: a list's section, a card) paint nothing; a folder-tab shelf (DESIGN.md, Shapes, Folder tabs), a group's capsule and a foot's lone top hairline (DESIGN.md, Borders are graded) are named (`specs/web/rendered-reads`) |
| `bar-room` | own code | a head bar (as `bar-ground` reads one, named or holding a glass group of the bar kit; not a foot, a group inside a bar, or one standing in its own scroller) floats over its content: the topmost of the scrollers in the surface it heads (a box that scrolls, or a page in a frame; not one in a layer or a panel of its own inside it, a landmark with a heading above the scroller or a bar at its top, in flow or floating over it) across half its width or more starts above its foot, so what scrolls passes under it; one starting at or under the foot claims a row, a page in a frame there (another document's layout is not the host's to inset) and a folder-tab shelf over the sheet its chosen tab opens (DESIGN.md, Shapes, Folder tabs) named (DESIGN.md, The Title Bars Follow Liquid Glass Rule; `specs/web/rendered-checks-reads`) |
| `head` | own code | a bar's (as `bar-ground` reads one) title and controls on one row (centres within 4px), no second line in the bar, the title not repeated by the next heading (`specs/web/rendered-reads`) |
| `back-close` | own code | no control's words say Back or Close |
| `hidden-cue` | own code + ink | a scroller cut at an edge (an element of it past that edge: a pseudo's overflow alone, a `touch-hit` area, hides nothing) has a mask there that draws (the band drawn with the mask, without it, and without the scroller), or an item peeking 16px, or stands under an edge effect, hit there or blurring it without taking presses (HeadFade); a box that clips without scrolling hides no words past its edge, but inside a control that opens a layer, whole items dropped and none cut (the usage strip) are named (`specs/web/rendered-reads`) |
| `contrast` | own code + impeccable `low-contrast` | each text run on the ground under it, its boxes' fills and the filled svg shapes drawn before it under its middle (a folder tab's sheet), 4.5:1 (3:1 from 24px); the lowest is printed (`specs/web/rendered-reads`) |
| `settled` | own code | no finite animation running, fonts loaded |
| `made-up` | own code | no `PROBE-`, `JOURNEY-`, `/tmp/`, `.cawco/tmp`, `probe-kit`, `Lorem`, `Test item`, lone “Body”; `allowedText` slots hold only their source's words |
| `tight-inset` | own code | words on an edged, rounded surface of 160×48 or more stand 8px or more from its sides (The Row Grid Rule: the text column and the trailing edge `space-3` in); sideways only, since a text rect is the line's box and not its ink |
| `tight-control` | own code | a drawn button stands `space-2` (7px) or more under the field, line or card above it (Spacing ladder); items of one list and a layer over the page are their own, and a fixed strip that takes no press and is hidden from the reader (the screen's edges) stands above nothing |
| `uneven-inset` | own code | a drawn row its children fill (to its padding at both ends: a strip with room after its last item is a layout) keeps one inset at both ends, a ghost control read by its ink: the smaller not under 55% of a larger of 16px or more (The Row Grid Rule: the trailing edge, drawn in ink; `specs/web/rendered-reads`; a kit Button with a rest icon and a longer pending wording kept that width with its resting content at its start, `specs/web/button-pending-inset`) |
| `fat-row` | own code | a list's one-line rows (its children of its commonest kind) stand under 3.4 lines or 48px tall, a row that draws nothing less the margins its children keep inside it, read when two or more of three or more break it (Density; `specs/web/rendered-reads`) |
| `loose-list` | own code | a list's alike rows, where two stand next to each other, stand no further apart than their height and 24px (Density; `specs/web/rendered-reads`) |
| `empty-pane` | own code | a landmark or pane of 120px or more holds a word, mark, control (an editor's `contenteditable` too) or drawn block (The Empty Starts Work, The Claim Of Nothing); a short list over free space is a layout (`specs/web/rendered-reads`) |
| `clipped-glyph` | own code | an svg draws inside its viewBox, past half its stroke, and no box that clips without scrolling cuts it (The Solar Duotone Rule) |
| `mixed-icons` | own code | no outlined mark beside a filled one in a bar, nav or list; an open stroke (chevron, arrow, Close, Plus, Tick, Minus) is a glyph, a ring (circles on one centre, stroked: a task ring, a spinner) a figure, and a shape at opacity 0 is not drawn (The Solar Duotone Rule; `specs/web/rendered-reads`) |
| `small-text` | own code | under a 600px screen, words drawn at 10px or more, through any scale; one or two letters are a mark |
| `text-overlap` | own code | no two drawn text runs cross by 2px sideways and a third of the shorter's height, a reader's or not (an `aria-hidden` ruler's figures too); a run wrapping is one run; a layer over the page and a pinned bar over what scrolls under it are their own plane |
| `anchor-drift` | own code, over reads | an open popover, menu or listbox whose height changed between two reads of one page holds its top or its foot (The Nothing Jumps Rule); one read says so as unread |
| `decoration-spill` | own code | what draws past or on a box's edge (its outline at `outline-offset` from the border edge, a hard box-shadow of blur under 1px by its spread and offsets, a dashed or dotted border, an absolutely placed `::before`/`::after` that draws) stays within 0.5px of the box it marks (a pseudo's own element, when that draws) and of the nearest box that clips it and the nearest rounded box that draws, measured round their corners; a box that itself runs past that box, or is scrolled under its edge, is `overflow`'s and the scroll's; a pseudo flush outside its own box (an edge fade, a joint) carries the box on and is named; what draws through a clip-path or mask is unread (The One Ring Rule: inset on anything flush or clipped; `specs/web/drawn-contour`) |
| `nested-radius` | own code | a wash (an element's or an absolute pseudo's fill or gradient) that nearly fills a rounded box (along one axis within its corner radius of both ends; a chip or a dot near one corner keeps its own) and whose corner stands within that radius of the box's corner, the box drawing or clipping, is as round as the outer radius less the mean inset, within 1.5px or a quarter of it, plus half the two insets' difference; a clip that rounds it counts as its corner (The Concentric Rule; `specs/web/drawn-contour`) |
| `state-shape` | own code + DevTools `CSS.forcePseudoState` | each control in a bar and each rounded one, with hover, active and focus-visible forced on it in turn (Chromium; transitions held off; another browser forces nothing and says so) and at rest when drawn selected (`aria-pressed`, `aria-expanded`, `aria-current`, `aria-selected`, `data-state` on or open): the fill or ring that state paints anew (its own, a placed pseudo's, a child's half its size or more) takes the control's radius less its inset where a child or a pseudo draws it, and, inside the glass it stands in (the nearest box over it that draws, rounded, and not scrolling it past its corners), the glass's radius less its inset, across a capsule or at a corner, on the corners facing a capsule's ends, and under half that on those facing a neighbour (another item of the glass on that side; a segment, capsule as its thumb is, excepted), within 1.5px or a tenth (a quarter at a corner) (The Concentric Rule; `specs/web/state-shape`) |
| `glyph-place` | own code | a control in a bar's capsule of glass whose only content is one glyph and at most a count: the glyph's centre within 1px of the control's on each axis (its fill's start and end insets around it alike), and the count, a badge on the glyph's top trailing corner taking no room: its leading edge at or past the glyph's centre, so a wide count grows toward the trailing side, over at most a fifth of its own glyph's ink and no more of a neighbour's than a one-figure count standing there (its shapes sampled every half pixel) (The Earned Count Rule; HIG, Tab bars; `specs/web/glyph-place`) |
| `baseline` | own code | in a flex row set on first baselines (`items-baseline`), each item that is or holds a control stands its first words' baseline within 1px of the first other item's words on its line (a text run's baseline: its line box's top plus the font's ascent share of its height); a kit Button's empty icon slot once lifted its label about 5px (`specs/web/button-baseline`) |

A sheet of specimens (a bench) says what a view is on the page: each
specimen standing for a screen of its own carries `data-specimen`, and the
per-view rules (`coral`) read each as a view of its own. An element counts
in the nearest view that holds it, the specimen itself included (a button
can be one); what stands outside every specimen is the scope's, or a spec's
`views`. A product screen carries none: there the screen is the view
(`specs/web/rendered-reads`).

Cut by the crop is `overflow` and `hidden-cue`, and spills its slot is
`overflow`. An entrance or an exit is not read here: a read comes after the
settle, when the move is over, so a spec holds one on the clock with `anim.ts`.

Impeccable runs as `impeccable detect --json --cdp <port>` on the page as it
stands: every kit Chromium carries a DevTools port (`devtoolsPort(page)`),
and the launcher is `$IMPECCABLE`, else the impeccable skill's in the first
of the fleet's skill layers that holds it (core `paths/fleet.ts` `userSkillLayers`:
the user layer's skills, pi's, each vendored plugin's), which a workspace's
boundary reads too. It reads Chromium only; on WebKit the report says so and
the kit's own contrast and overflow reads stand alone. With no launcher it is
not run here, said as a NOTE naming every layer it looked in, the way a host
spec is not run in a workspace. Its findings outside the rendered checks
(line length, nested cards…) print as a NOTE, never a failure. A Chromium
read where its launcher ran and failed fails.

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
steps everywhere. After every step the page is held to four rules
(`journeys/scan.ts`: nothing spills, no control runs out of its row, card
or panel, no control covers text, no clamped row of a flex column squeezed
below its lines) and to no
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

## A spec in a process of its own

A spec that sets a variable a module reads once as it loads (the hub's
config reads `CAWCO_PREVIEW_PORTS` and `CAWCO_DB_PATH` into constants) says
so with `ownProcess` (its reason), and `run.ts` starts it in a fresh
process: in the run's shared one, a spec before it has loaded that module
already, and the variable it sets moves nothing. A spec that builds a hub
in its process (`packages/hub/scripts/hub-in-process.ts`, which throws when
the hub's modules were loaded on another database) is one: `account-refused`,
`typed-causes`, `host-lfs`; `preview-query` is another.

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

## No spec sees the session that started the run

Started from a session's shell, `run.ts` runs again in a process without
that session's variables (`caller-env.ts`): CawCo's (`CAWCO_HUB_URL`,
`CAWCO_INSTANCE_ID`, `CAWCO_SESSION_CREDENTIAL`, `CAWCO_TOOL_SOCKET`) and
Claude Code's (`CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_CONFIG_DIR`). A run
on the host has none of them, so a spec reads the same either way. A spec
that needs a hub names its own: `git-door` and `landing-faults` set
`CAWCO_HUB_URL` to one nothing reaches, and the door `gitDoorEnv` gives is
theirs. A `workspace` spec keeps the session's variables, in a process of
its own, because its subject is that session's boundary.

## Files a delegate cannot read

Logs, journal excerpts and transcripts a spec's delegate needs go in the
`delegate` call's `inputs` (absolute paths on the parent's machine): they are
copied into the delegate's `$TMPDIR/inputs/` before its first turn. Credential
stores, secret files and the host's logs are refused; 64 MiB in all. What the
hub already holds goes by name, with no file written for it (core
handed-input.ts): `{ report }`, `{ artifact }`, `{ pins }`, `{ find }`,
`{ attachment }`, `{ assets }`, `{ text, name }`, `{ blob, name }`
(`handed-inputs` proves each).
