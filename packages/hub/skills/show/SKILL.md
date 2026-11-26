---
name: show
description: "Before anything is opened in the person's panel (artifact_create of any kind): answer what they do there, then pick the primitive. Use when asked to show, mock up, demo or preview something, when asked to use the design graph, when a choice, a judgement or a flow needs the person, and before design-graph, design-explore, screen or decision-page."
---

# Show

The person's panel is where they act. An artifact is opened for one of four things they do, and the hub refuses one that names none or cannot deliver it. Answer the ask before you build; everything after follows from it.

The **design graph** is what `artifact_create` opens for `kind: "component"`: the real component or screen mounted live from a states file, or a design folder the hub keeps and runs (one page, files, or React, Svelte or TypeScript code). The person operates it, views it at phone, tablet, desk and wide width and in either colour scheme, tunes its dials and pins what reads wrong. Every design they judge is on the design graph, a piece or a whole screen, one direction or several: A request to see something, to mock it up, to have an idea shown, or to use the design graph asks for it.

## Steps

1. **Answer the ask.** Write three values:
   - `does`: what they do here. `judge` (use a real thing, live, and pin what reads wrong), `pick` (choose between options that are no design), `try` (run a flow and say whether it works), `draw` (draw or mark up).
   - `ask`: one line, second person, the act and its object in their words: "Judge the three row directions and pin what reads wrong"; "Judge pairing a phone: scan the code, approve it, and pin what reads wrong"; "Try pairing this browser from the QR to the approved state". No file, path, id or state code; nothing like "tap" or "poke".
   - `title`: a few plain words, sentence case, that name it to the person on every surface (the panel head, the artifacts menu, Needs you, chips, pushes): "Task row directions", "Pairing a phone". The `name` stays a slug for tools and URLs and is never shown.
   A go-ahead, a yes or no, or a fact only they know is `ask`, with no artifact. When neither `does` nor `ask` comes (proof of a change, a plan, references, a screen they already picked, today as it stands, a surface with no question), there is no artifact: say it in chat and stop here.
   Done when all three are written, a stranger reading the ask knows what to do, and the title names the thing as the person calls it.
2. **Pick the primitive from `does`.**
   | `does` | Build | Skill |
   | --- | --- | --- |
   | judge | the design on the design graph (`kind: "component"`). Any piece, one that exists or a new one written now in the project's own language and framework: one live story that mounts the screen the piece lives on in the app's shell, the piece in its real place among the screen's real components, its presses answered by mock data, a dial for each situation no press reaches and each value they tune, pins with `file:line`; a rough idea of it is the same thing less arranged, real components quickly placed on that screen. The running app opened at that screen's path shows the piece in its context just as well; in a project the hub opens it as a preview to try. With no project behind it, on a stack with no stage, or for an idea you judge throwaway: a design folder in the form the work needs (`html` one page, or `dir` a folder whose index.html loads its files or code), changed in place by `artifact_update` and hot reloaded in their panel. A document, chart or slide deck to judge is a design folder marked with `content`, its libraries picked by the `choosing-preview-libraries` skill, and shown at its own width. Two or more directions open in one design graph: `directions` names one states file, or one page or folder, per direction, with its name and its line. A pick between values of one look token, font, radius or motion value is directions, each the real components that use it, in that value | `design-graph` (`references/html.md` for a design folder); `design-explore` for directions; `screen` for a whole screen |
   | pick | a decision page, for a choice that is no design (a name, a policy, a scope, a behaviour, a picture that is no UI): one card per question in dependency order, gets and costs, one Recommended with its reason | `decision-page` |
   | try | a preview of the running app, opened at the flow's first screen: `port` with `serve`: `command` starts its server and `cwd` names the app's folder, absolute or from yours; CawCo runs it and starts it again whenever they open it. An app with no server, its files built or static, is `dir`: the folder whose index.html (or the page `path` names) loads the rest; the hub keeps its files, so it outlives your folder, and `artifact_update({ id, dir })` reads them again and reloads their panel | the project's own run |
   | draw | a canvas (`kind: "canvas"`): a diagram of what is not a screen (a data flow, an architecture), or an empty one for their own sketch | none |
   They pick a direction on the design graph itself: Pick is its head's prominent action, and `artifact_read` answers it as `picked`. On a stack with no stage (`design-explore`, "Where the graph runs") a design is a design folder on the design graph, on the project's own CSS. A generated picture is judged on an image canvas.
   The hub refuses a pick on anything but a page, a design in a decision page, a try on a design graph or a program, a drawing on anything but a canvas, a canvas named as a screen or a mockup, a judged preview or HTML page artifact in a project (a design is judged on the design graph, which takes a design folder), two stories that differ only by their width, and a page for judging with more than two desk captures, each with the primitive to use instead.
   Done when the kind and the skill are named.
3. **Build it with that skill.** One design is one frame: the graph draws a screen at each of its widths and in each scheme at their press, and marked content at the panel's width alone. Read a screen yourself at every one of those widths and in both schemes before you open it (`artifact_read` with `state.width` and `state.scheme`); that reading is yours and adds no frame. Every word on it is theirs: states named as the product talks, no size or id captions, no legend, nothing decided or rejected left on it. The panel is 600px wide beside the transcript and 390px on a phone, and draws what it opens edge to edge, with no margin of its own; a design graph and a decision page read at both by themselves. A page of your own carries its own room: a page margin of 24px on every side (16px under 480px) and a text column of at most 70ch, so nothing it draws meets the panel's edge.
4. **Open it** with `artifact_create({ kind, name, title, does, ask, … })`. Something you open only to check for yourself (every state, a probe) takes `reading: true`: it stays in your own panel, never reaches the person, and is deleted when your work item ends. Read the answer: `opened: false` says `why`; a design graph answers each frame, fix every one not `drawn`; a refusal names what to change. With directions, the ask names what to judge and to pick ("Judge the three row directions, pick one, and pin what reads wrong"). A pick they make (directions, a decision page's cards) also names `pick`, quick or enlarged, as `artifact_create`'s `pick` judges it.
5. **End your turn.** The ask stands in the panel's head until they act. Started by another session, yours went to that session's panel unopened and reaches the person only when that session shows it: your report says what of it needs them, and names the directions when there are several. Their pins arrive by themselves a few seconds after they write them, and `comment_read` gives each pin's `file:line` (none on a design folder) and state; once every question is answered (a pick, a note, a value, a pin on a decision-page card you answered and resolved) their picks reach you by themselves, no Send, read with `artifact_read`. A pin that only asks something is answered in its thread and left open; the person resolves it. At the start of a turn after a compaction, read `open_items`: every question you and your delegates put to them, open or answered. Act on each answered one, then close it with `question_close` (`taken`, with what they decided in plain words; `withdrawn` when it no longer applies). A new round, yours or another session's of your delegation tree, lands on the artifact that stands: `artifact_update` with the new `ask`, or `artifact_create` with its kind and name, whoever made it, so one screen keeps one artifact.

## Before you open it

| Refused or wrong | Instead |
| --- | --- |
| No one line a stranger could act on | Write the ask first; no ask, no artifact |
| Two or more designs to choose between, on a decision page or as one artifact each | One design graph whose `directions` name one states file each; their pick made on the graph, read as `artifact_read`'s `picked` |
| One design under a yes or no ("Build this?", "Looks right now?") | The design on its design graph for them to pin; the go-ahead through `ask` |
| A piece meant to carry into the build, drawn as HTML or as boxes on a canvas, on a stack that has a stage | Its real components on the screen it lives on, in a live story on the design graph |
| A throwaway idea, or a design on a stack with no stage, opened as a page or a canvas | A design folder on the design graph: `kind: "component"` with `html` or `dir` |
| A whole screen opened as a preview to be judged | The screen's live story on the design graph, where they switch its widths; a preview is the running app, for a flow they try |
| A list of states for them to step through; every state, width and scheme stacked down one page; a second frame for another width or scheme | One live story: they reach each state by using it and each width from the graph's View. A states file of every state is your own reading |
| A pick between values of one shared token, font or motion value shown as a whole-screen specimen, an edit to the board, or "pin whatever reads wrong" | Directions on the design graph, each the components that use the value, its `line` saying where the person sees it (`design-explore`, A look value) |
| A value along a scale of one piece offered as separate designs (three densities, three radii) | One `number` or `select` dial on the live story, bounded to the range that holds |
| A choice about how the screens of a flow look, drawn as a diagram on a decision page | Directions on the design graph |
| A delegate's design graph opened as it came | Read it first (`artifact_read` with `state`, and its fixture's file): it opens on one live story of the screen the piece lives on, its `parts` name the product components the piece ships in, and its fixture answers each event the piece sends. One that opens on a list of states, draws the piece by hand, or shows it without its screen goes back to the delegate |
| Captures of a desk page shown in the panel | The real component on the design graph |
| Today beside each proposal, a legend, a size caption | Nothing on it that is not a question or a thing to judge |
| An artifact to prove a change | Build, lint and type-check, in your words |
| Listing the options in chat | They are on the page or the graph; your message is one line on what to look at |

## Who builds it

What they asked to see is a live story on the design graph: build it yourself where your role builds, or brief an effort-type delegate (`medium`; `low` where the components exist and only the story is new). A whole screen designed from its journey is the `screen` skill's. Their pins on a design that exists go to the session that drew it.

## Briefing a delegate

A brief for something the person will judge names the outcome, and the skills name the tool:

- the piece, the screen it lives on, and the one task they do in it, in plain words ("on the session screen, they open the account list on a session stopped at its limit and pick another account");
- what they reach by pressing, in order, and the situations no press reaches, which become its dials;
- the product components it ships in, by name from the map, changed in place in the delegate's workspace, and the mock data's shape (how many accounts, the longest email);
- for a call the server lacks, that the mock stands at the store function the component calls and the report names it;
- what comes back: one design graph (its directions as one states file each), handed up unopened, and a report that lists anything in it no product component draws.

The delegate reads every state, width and scheme for itself before it hands up, so a brief leaves out counts of states, widths, colour schemes and "frames".
