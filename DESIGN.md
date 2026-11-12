
# Design

## Flow
- A flow happens where the person's attention already is, and the thing they acted on shows its own result.
- Ask beside the thing the question is about, with the rest of the page live. Block the page only when acting elsewhere would make the open question wrong.
- Ceremony matches consequence: a light action just happens; a consequential one first states what it will really do, naming each thing it reaches.
- Work that outlives its surface belongs to the work: a reload restores it at the same step, dismissing parks it in one persistent place that shows progress and then the outcome, one press reopens it, and only its own Stop or Cancel ends it.
- A failure leaves the person where they were, with what they had, told what happened to which thing, and able to go on.
- A press that starts in a text field belongs to the field, whatever surrounds it.

## State
- Show the system's state as it changes; a thing is done when the system says so.
- Claim empty only once the data is known to be empty.
- Running work shows a live mark and names what is running.
- Live marks breathe in step; finished things are still.

## Facts and empty states
- A fact with a shape is drawn: a schedule as times on a line, a budget as a meter, outcomes as marks. Words are for what has no shape.
- An empty state's one action starts the work that would fill it, with the agent already asking and the words editable. Where that cannot start, it says why and offers the way by hand.

## Colour, focus and type
- Colour appears only where it means something: the act, status, identity, focus, and data past a threshold.
- Coral is the act: one per view, on the act the view is for. It also marks what is selected, focused or checked. Advice wears a badge; status wears a status hue.
- Crimson, yellow, olive and blue mean status. Identity hues tell things apart and mean nothing else.
- Status reads by glyph, then word, then hue.
- The focus ring means focus. A text field shows focus by its caret and its frame's edge, with no ring.
- The option chip is the one control that picks an answer. A setting that cannot change where it is shown is the same chip, sunk.
- A count shows only above zero, unless zero is itself the reading.
- Text takes its role from what it does: label, body or metadata. Emphasis is one step of weight or ink.
- Every screen is drawn and checked in both schemes, at desk and phone width.

## Motion
- What exists on both sides of a change travels between them.
- In a changing list, rows that stay slide, rows that leave close, and rows that arrive are uncovered, in one frame.
- A text swap leaves its neighbours where they are.
- Under a press, a compact control shrinks; anything wide, grouped or that opens something tints and holds still; a link dims.
- Sound and touch accompany the person's own gesture, and nothing else.
- Each kind of motion has a house helper: use it.

## Alignment
- Everything in a composition shares an edge or an axis with its neighbours.
- Text that is read starts on one left edge: anything longer than a title and two lines, or standing over cards, rows, chips or a field, takes the edge of what is under it.
- A short block alone in open room may be centred, as one block.
- A mark sits nearer its text than anything else. A picture is centred over what is drawn under it; a small glyph starts on its text's edge; in a row the mark sits in the row's lead column.
- A block follows its surface: on the page's edge where the page reads from one, centred only in room with no edge of its own.
- A row carries at most four kinds of text: its name, the thing itself, quieter facts about it, and an unread fact at full ink. The name gives way first when room runs short.
- A page's name is its bar's title. A bar's trailing group runs: actions on the view, More, the prominent action, Close.
- The only card inside a card is the stat tile's well.

## Permissions
- Approve and Deny are peers: the same size, type and fill, at opposite ends of their row, told apart by glyph, word and place.
- A standing grant stands apart from the answer, after a sentence saying what it would allow, as the most salient control on the card.
- The card shows who asks, what will happen to what, and the change itself, all open.

## Words
- Name the thing itself and give the number: "nixbox stopped answering (timeout)", "3 sessions".
- Say what is acted on before what happens to it.
- The product is never "we" or "I"; name the harness or the agent.
- Say when something is not known, and when an action cannot be undone.
- A button that grants says Approve.
- An error says what happened, what is safe and the next step, with its code in parentheses.
- A place the person emptied says so and names the next action.

## Skills
- Any motion: `animate`.
- Any string the product shows: `clean-copy`, then `interfaces:better-writing`.
- How text renders: `interfaces:better-typography`.
- Focus, hit areas, reduced motion, or a state shown by colour: `interfaces:better-accessibility`. On a text field the caret replaces its ring.
- Hover, press feedback, exits, nested corners: `interfaces:better-ui`.
- A bar that heads a surface: `apple-hig-toolbars`.
- A phone or a finger: `mobile-native`.

## Where the rest is
- Tokens: `design/tokens/`, built into `apps/dashboard/src/lib/tokens/tokens.css` by `bun run tokens`.
- Components: `apps/dashboard/src/lib/components/ui`.
- Checks: `bun run check`.
