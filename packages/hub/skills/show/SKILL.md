---
name: show
description: "Before anything is opened in the person's panel (artifact_create of any kind): answer what they do there, then pick the primitive. Use when asked to show, mock up, demo or preview something, when asked to use the design graph, when a choice, a judgement or a flow needs the person, and before design-graph, design-explore, screen or decision-page."
---

# Show

The person's panel is where they act. An artifact is opened for one of four things they do, and the hub refuses one that names none or cannot deliver it. Answer the ask before you build; everything after follows from it.

The **design graph** is what `artifact_create` opens for `kind: "component"`: the real component or screen mounted live from a states file. The person operates it, views it at phone, tablet, desk and wide width and in either colour scheme, tunes its dials and pins what reads wrong. Every design they judge is on the design graph, a piece or a whole screen, one direction or several: A request to see something, to mock it up, to have an idea shown, or to use the design graph asks for it.

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
   | judge | the design on the design graph (`kind: "component"`): one live story that mounts the real piece, or the whole screen in the app's shell, its presses answered by mock data, a dial for each situation no press reaches and each value he tunes, pins with `file:line`. A rough idea is the same thing less arranged: real components, quickly placed. Two or more directions open in one design graph: `directions` names one states file per direction, with its name and its line | `design-graph`; `design-explore` for directions; `screen` for a whole screen |
   | pick | a decision page, for a choice that is no design (a name, a policy, a scope, a behaviour drawn as a diagram, a picture that is no UI): one card per question in dependency order, gets and costs, one Recommended with its reason | `decision-page` |
   | try | a preview of the running app, opened at the flow's first screen: `port` with `serve` in a workspace, or `dir` | the project's own run |
   | draw | a canvas (`kind: "canvas"`): a diagram of what is not a screen (a data flow, an architecture), or an empty one for their own sketch | none |
   They pick a direction on the design graph itself: Pick is its head's prominent action, and `artifact_read` answers it as `picked`. On a stack with no stage (`design-explore`, "Where the graph runs") a design is judged as an HTML page on the project's own CSS. A generated picture is judged on an image canvas.
   The hub refuses a pick on anything but a page, a design in a decision page, a try on a design graph or a program, a drawing on anything but a canvas, a canvas named as a screen or a mockup, a judged preview or HTML page in a project whose designs open on the design graph, two stories that differ only by their width, and a page for judging with more than two desk captures, each with the primitive to use instead.
   Done when the kind and the skill are named.
3. **Build it with that skill.** One design is one frame: the graph draws it at each of its widths and in each scheme at their press. Read it yourself at every one of those widths and in both schemes before you open it (`artifact_read` with `state.width` and `state.scheme`); that reading is yours and adds no frame. Every word on it is theirs: states named as the product talks, no size or id captions, no legend, nothing decided or rejected left on it. The panel is 600px wide beside the transcript and 390px on a phone, and draws what it opens edge to edge, with no margin of its own; a design graph and a decision page read at both by themselves. A page of your own carries its own room: a page margin of 24px on every side (16px under 480px) and a text column of at most 70ch, so nothing it draws meets the panel's edge.
4. **Open it** with `artifact_create({ kind, name, title, does, ask, … })`. Read the answer: `opened: false` says `why`; a design graph answers each frame, fix every one not `drawn`; a refusal names what to change. With directions, the ask names what to judge and to pick ("Judge the three row directions, pick one, and pin what reads wrong").
5. **End your turn.** The ask stands in the panel's head until they act. Started by another session, yours went to that session's panel unopened and reaches the person only when that session shows it: your report says what of it needs them, and names the directions when there are several. Their pins arrive by themselves a few seconds after they write them, and `comment_read` gives each pin's `file:line` and state; once every question is answered (a pick, a note, a value, a pin on a decision-page card you answered and resolved) their picks reach you by themselves, no Send, read with `artifact_read`. A pin that only asks something is answered in its thread and left open; the person resolves it. At the start of a turn after a compaction, read `open_items`: every question you and your delegates put to them, open or answered. Act on each answered one, then close it with `question_close` (`taken`, with what they decided in plain words; `withdrawn` when it no longer applies). A new round is `artifact_update` with the new `ask`, never a second artifact of the same thing.

## Before you open it

| Refused or wrong | Instead |
| --- | --- |
| No one line a stranger could act on | Write the ask first; no ask, no artifact |
| Two or more designs to choose between, on a decision page or as one artifact each | One design graph whose `directions` name one states file each; their pick made on the graph, read as `artifact_read`'s `picked` |
| One design under a yes or no ("Build this?", "Looks right now?") | The design on its design graph for them to pin; the go-ahead through `ask` |
| A design drawn as HTML, or as boxes on a canvas, on a stack that has a stage | Its real components in a live story on the design graph |
| A whole screen opened as a preview to be judged | The screen's live story on the design graph, where they switch its widths; a preview is the running app, for a flow they try |
| A list of states for him to step through; every state, width and scheme stacked down one page; a second frame for another width or scheme | One live story: he reaches each state by using it and each width from the graph's View. A states file of every state is your own reading |
| A value along a scale offered as separate designs (three densities, three radii) | One `number` or `select` dial on the live story, bounded to the range that holds |
| A behaviour or flow choice told only in words | A decision card whose options each draw the states and the moves between them as a `Diagram`, each edge labelled by what the person does; where the flow is how screens look, directions on the design graph |
| A delegate's design graph opened as it came | Read it first (`artifact_read` with `state`, and its fixture's file): it opens on one live story, its `parts` name the product components the piece ships in, and its fixture answers each event the piece sends. One that opens on a list of states, or draws the piece by hand, goes back to the delegate |
| Captures of a desk page shown in the panel | The real component on the design graph |
| Today beside each proposal, a legend, a size caption | Nothing on it that is not a question or a thing to judge |
| An artifact to prove a change | Build, lint and type-check, in your words |
| Listing the options in chat | They are on the page or the graph; your message is one line on what to look at |

## Who builds it

What they asked to see is a live story on the design graph: build it yourself where your role builds, or brief an effort-type delegate (`medium`; `low` where the components exist and only the story is new). A `design` run is for a screen designed whole from its task (`shape-first`, `design-pipeline`). Their pins on a design that exists go to the session that drew it.

## Briefing a delegate

A brief for something the person will judge names the outcome, and the skills name the tool:

- the piece, and the one task he does in it, in plain words ("he opens the account list on a session stopped at its limit and picks another account");
- what he reaches by pressing, in order, and the situations no press reaches, which become its dials;
- the product components it ships in, by name from the map, changed in place in the delegate's workspace, and the mock data's shape (how many accounts, the longest email);
- for a call the server lacks, that the mock stands at the store function the component calls and the report names it;
- what comes back: one design graph (its directions as one states file each), handed up unopened, and a report that lists anything in it no product component draws.

The delegate reads every state, width and scheme for itself before it hands up, so a brief leaves out counts of states, widths, colour schemes and "frames".
