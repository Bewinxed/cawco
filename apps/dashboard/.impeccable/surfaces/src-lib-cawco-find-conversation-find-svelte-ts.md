---
version: 1
slug: "src-lib-cawco-find-conversation-find-svelte-ts"
primary_target: "src/lib/cawco/find/conversation-find.svelte.ts"
related_targets: []
---

# Find in a conversation

Mode: Operate. The person comes back to a conversation for something said in it (an error a test printed, a decision, a report) and presses Command-F, or Find in Attach's menu.

## Regions
- **The composer, grown** (find/FindLine.svelte in transcript/Composer.svelte): the find field on the pill's top, the place ("3 of 9"), Previous, Next, Close, every control at the pill's contour (Attach's and Send's); the message being written stays under it, untouched. The words open with the caret at their end, never chosen in the selection's coral, which would read as a match.
- **The places** (find/FindPlaces.svelte in find/FindLayer.svelte): whose words to keep (All, You, the agent, Tools, Delegates, each with its count), then every place a row (Jump's FindRow), oldest first, the one stepped to chosen, each named and timed as the transcript names and times the turn it points at (a call's sentence and what it acted on, Reasoning, Report from …, the turn's clock time). They rise out of the composer as its layer at every width, desk included: one thing with the find field, opened and folded from the place count; at a phone's width (or a narrow panel's) the rows wrap and a pick folds the list. The side panel holds no find (his pick, pin 2 on the pitch: "the panel" is the composer's own).
- **The conversation** (transcript/Transcript.svelte): each step seeks the record with the words as its terms (open-at `seekInto`), so the words land in the band above the composer and find's layer, their fold opened; the words are marked by the CSS Custom Highlight API (find/find-marks.ts): every place washed, the one stepped to on coral.

## States
- Finding: places listed, one stepped to.
- Asking: the hub not answered and nothing loaded holds the words: skeleton rows, no zero claimed.
- Nothing found: "No matches for …" with Find in every session (Jump with the words).
- Machine not answering: the places in the messages loaded, the machine named, Retry. Machine needing an update (its agent older than the places read): the same, saying so, no Retry. Refused: the hub's sentence, Retry.
- Live turn: one more place at the foot, breathing, "Writing…"; the count grows; the conversation does not move.
- Closed at the place found: the place keeps its wash until the reader moves on (a wheel, a touch, a scroll key); Back to where you were stands in Jump to latest's place; the caret goes back to the message.

## Keys
Command-F opens find in the conversation the keyboard is in, else the tab in front, else the one conversation on screen; again closes it; in the field with its words not chosen, chooses them. Enter and Shift-Enter step; Escape closes (in the field or the message). Keys land at once (DESIGN.md, Flow: ceremony matches consequence).

## Widths
390, 680, 1440 and 2529: the composer's layer at each, the composer standing on the transcript's column.

## The engine
`GET /api/find/places?session=&q=` (hub find-places.ts) asks the conversation's machine (`transcriptPlaces`, jsonl-parser fts5.ts `places`): an FTS5 phrase over what was said, thought and what tools returned, oldest first, sidechains out; a tool's output is named by its result's own record, which the transcript keeps on the call it answered (`resultRecord`), so a place opens at its very call among calls run side by side; secrets named while Hide secrets is on.

## Direction contract
direction: inherits DESIGN.md
