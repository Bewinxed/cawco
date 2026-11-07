---
version: 1
slug: "src-lib-cawco-find-conversation-find-svelte-ts"
primary_target: "src/lib/cawco/find/conversation-find.svelte.ts"
related_targets: []
---

# Find in a conversation

Mode: Operate. The person comes back to a conversation for something said in it (an error a test printed, a decision, a report) and presses Command-F, or Find in Attach's menu.

## Regions
- **The composer, grown** (find/FindLine.svelte in transcript/Composer.svelte): the find field on the pill's top, the place ("3 of 9"), Previous, Next, Close; the message being written stays under it, untouched.
- **The places** (find/FindPlaces.svelte): whose words to keep (All, You, the agent, Tools, Delegates, each with its count), then every place a row (Jump's FindRow), oldest first, the one stepped to chosen. On a desk the side panel's Find tab (side/SideSplit.svelte), in front while find is open, handing the front back as it closes; narrow (a phone, Caw's panel, a desk pane under the drawer line) the composer's layer (find/FindLayer.svelte), opened and folded from the place count, a pick folding it.
- **The conversation** (transcript/Transcript.svelte): each step seeks the record with the words as its terms (open-at `seekInto`), so the words land in the band above the composer and find's layer, their fold opened; the words are marked by the CSS Custom Highlight API (find/find-marks.ts): every place washed, the one stepped to on coral.

## States
- Finding: places listed, one stepped to.
- Asking: the hub not answered and nothing loaded holds the words: skeleton rows, no zero claimed.
- Nothing found: "No matches for …" with Find in every session (Jump with the words).
- Machine not answering: the places in the messages loaded, the machine named, Retry. Refused: the hub's sentence, Retry.
- Live turn: one more place at the foot, breathing, "Writing…"; the count grows; the conversation does not move.
- Closed at the place found: the place keeps its wash until the reader moves on (a wheel, a touch, a scroll key); Back to where you were stands in Jump to latest's place; the caret goes back to the message.

## Keys
Command-F opens find in the conversation the keyboard is in, else the tab in front, else the one conversation on screen; again closes it; in the field with its words not chosen, chooses them. Enter and Shift-Enter step; Escape closes (in the field or the message). Keys land at once (The Frequency Rule).

## Widths
390 (phone: the layer), 680, 1440 (side panel), 2529 (side panel at the reader's width).

## The engine
`GET /api/find/places?session=&q=` (hub find-places.ts) asks the conversation's machine (`transcriptPlaces`, jsonl-parser fts5.ts `places`): an FTS5 phrase over what was said, thought and what tools returned, oldest first, sidechains out, a tool's output named by the record that called it; secrets named while Hide secrets is on.

## Direction contract
direction: inherits DESIGN.md
