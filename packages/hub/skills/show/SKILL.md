---
name: show
description: Before anything is opened in the person's panel (artifact_create of any kind): answer what they do there, then pick the primitive. Use when asked to show, preview, demo or mock up something, when a choice, a judgement or a flow needs the person, and before design-explore, component-canvas, screen or decision-page.
---

# Show

The person's panel is where they act, never where they look. An artifact is opened for one of four things they do, and the hub refuses one that names none or cannot deliver it. Answer the ask before you build; everything after follows from it.

## Steps

1. **Answer the ask.** Write two values:
   - `does`: what they do here. `pick` (choose between options), `judge` (look at a real thing in its states and pin what reads wrong), `try` (run a flow and say whether it works), `draw` (draw or mark up).
   - `ask`: one line, second person, the act and its object in their words: "Pick the head for the phone project page"; "Judge the six pairing states: pin anything that reads wrong"; "Try pairing this browser from the QR to the approved state". No file, path, id or state code; nothing like "tap" or "poke".
   When neither value comes (proof of a change, a plan, references, a screen they already picked, today as it stands, a surface with no question), there is no artifact: say it in chat and stop here.
   Done when both values are written and a stranger reading the ask knows what to do.
2. **Pick the primitive from `does`.**
   | `does` | Build | Skill |
   | --- | --- | --- |
   | pick | a decision page: one card per question in dependency order, options drawn live, gets and costs, one Recommended with its reason | `decision-page` |
   | judge | a component canvas of the real component's states, one frame each, pins with `file:line`; a preview at its `path` when the whole surface is judged; an image or diagram canvas for a picture or a structure; an HTML page only where the stack has no stage | `component-canvas` (`design-explore` for directions), `screen` for a whole screen |
   | try | a preview opened at the flow's first screen: `port` with `serve` in a workspace, or `dir` | `screen`, or the project's own run |
   | draw | a canvas, empty or with elements | none |
   A pick on a canvas or preview, a try on a program, a drawing on anything but a canvas, and a page or folder for judging with more than two desk captures are refused by the hub with the primitive to use instead.
   Done when the kind and the skill are named.
3. **Build it with that skill.** Every word on it is theirs: states named as the product talks, no size or id captions, no legend, nothing decided or rejected left on it. The panel is 600px wide beside the transcript and 390px on a phone; a component canvas and a decision page read at both by themselves, a page of your own must.
4. **Open it** with `artifact_create({ kind, name, does, ask, … })`. Read the answer: `opened: false` says `why`; a component answers each frame, fix every one not `drawn`; a refusal names what to change.
5. **End your turn.** The ask stands in the panel's head until they act. Their picks come through `artifact_read`, their pins through `comment_read` with each pin's `file:line` and state; a Send tells you the artifact has new responses. A new round is `artifact_update` with the new `ask`, never a second artifact of the same thing.

## Before you open it

| Refused or wrong | Instead |
| --- | --- |
| No one line a stranger could act on | Write the ask first; no ask, no artifact |
| A pick on a component canvas or a preview | A decision page whose options embed the story |
| Every state, width and scheme stacked down one page | One frame per state on a component canvas; one card per question on a decision page |
| Captures of a desk page shown in the panel | The real component on the canvas, or the preview at its path |
| Today beside each proposal, a legend, a size caption | Nothing on it that is not a question or a thing to judge |
| A preview to prove a change | Build, lint, type-check and the probe, in your words |
| Listing the options in chat | They are on the page; your message is one line on what to look at |
