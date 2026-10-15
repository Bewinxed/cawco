# Find and mention: critique and pick

**tldr.** Option 1, *The conversation is the answer*. The two tasks that matter most (T1 get back into a conversation, T2 name one while writing) both end in a session, and Option 1 is the only structure that answers with a ranked session, its recognisers on the row and a one-key check, with no decision before the words and one component for finding and mentioning. Its faults (a late-arriving section, glyph-only state, truncated mention rows, copy that says "conversation", the recall wheel used as an @ menu) are corrections to one surface; Option 2's cost (a scope decision per lookup, two taps on the phone, "This conversation" offered against the TOM) and Option 3's (a 720 px ledger with no ranking and an explicit key for every transcript search) are the structures themselves.

Inputs: `docs/tom/find-and-mention.md`; the three options; `DESIGN.md` and `WORDS.md` for the rules and words the options cite. Nothing under `apps/`, `packages/` or `scripts/` was read. Geometry assumed throughout, my own figures: desk viewport 1055×567, top bar 44 px, so the glass's card is at most 499 px tall; a two-line row 52 px, a one-line row 40 px, the field 44 px, a footer hint 32 px, a section head 28 px, a chip or filter row 36 px, a detail strip 56 px. iPhone 393×852 pt, keyboard with QuickType about 336 pt, so a sheet above the keyboard has about 400 pt for rows; a two-line row at 16 pt is 56 pt, a three-line row 72 pt.

---

## Part 1. Design Critique (interface-craft), each option

### Context (shared)

One person's control room for a fleet of coding agents. The finder is used dozens of times an hour from a MacBook, keyboard first, mid-thought, and from an iPhone with one thumb. The emotional context is hurry plus consequence: he is interrupting himself to fetch something, and landing in the wrong session spends that session's context and money. The bar he carries in is Raycast and Linear's ⌘K on the desk and Spotlight on the phone: words in, the thing out, no mode.

### Option 1: The conversation is the answer

**First impressions.** One field, one list, and the thing he is looking for on the first row with the reason it is there under it. It reads like a finder made for one person's habits rather than a palette with sections. Three things feel off at once. The rows are three different heights (two lines, three with a ↳ reason, four where the age "6d" wraps onto its own line), so the list has no scan rhythm. The state is a bracketed glyph with no word. And the T3 flow shows "No conversations for 'nsenter'" standing above a list of conversations.

**Visual design.**

> **Rows of three heights** — In the typing wireframe the first row is two lines, the second is three because "6d" wrapped, the third is four with its ↳ line. The age is the fact that tells the two "Orchestrate cockpit fleet" rows apart and it sits in three different places. One row recipe: the age right-aligned on the title line on every row; the meta line one line; the ↳ line one line, clipped.

> **Glyph without the word** — Every row opens with `[working]`, `[asleep]`, `[needs]`: a 16 px Solar glyph and nothing else says the state. DESIGN.md's Glyph, Word, Hue Rule reads glyph, then word, then hue, and the option's own table promises "state word read before the title". Two siblings with the same title are told apart by a moon versus a refresh circle. The word goes first on the meta line: "Working · cockpit · yours · linux".

> **Two row recipes in one list** — The doorway ("nothing typed") draws one-line rows with the project and age on the title line; typing redraws them as two-line rows. The same session changes shape when he types a letter. The doorway uses the two-line row.

> **A second arrow vocabulary** — The Go-to row is "[task] → tsk-142 Drift check" and the peek's moments end in "↵". Every other row's leading mark is a kind glyph. The → adds nothing the kind glyph does not say; drop it.

> **Three tones before the slow rows** — "Where it was said" head, then a coverage line with Retry, then rows: 56 px of head on a 499 px card. One head line carries both: "Where "orchestrate fleet" was said · 2 of 3 machines · macbook didn't · Retry".

**Interface design.**

> **Nothing is active while the hub-side list is empty** — For "nsenter" the first section has no rows, so until the machines answer there is no active row and ↵ does nothing. The option says so in its trade-offs. We're missing the chance to make the first "Where it was said" row active the moment it lands, so ↵ always does something.

> **Answers to a query he no longer typed** — Each keystroke asks three machines, each answering within 1.5 s; "orch" can land after "orch fleet". The head never says which words a section answers, and nothing stops an older answer from replacing a newer one. The TOM lets a per-keystroke lookup hit the index; the surface still has to ask on a settle and label the answer.

> **An empty state that contradicts the list under it** — "No conversations for 'nsenter'" + "Search inside conversations instead" is drawn while that search is already running and about to list conversations. The Claim Of Nothing Rule says an empty state renders only once the data is known to be empty; here two sections are read at different speeds and the first claims nothing while the second is still being read.

> **Purpose is one key away** — The TOM's recogniser list for a session is title, *what it is doing or last did*, project, state, when. The row carries four of the five; purpose is in the peek. For two rows with the same title, project and state (two attempts at one task), the row alone does not settle it. Acceptable because → is one key, but say so.

> **A grammar to learn for who-said** — T3 asks for "a way to narrow by who said it", and T6 for his own words. Option 1 answers with words typed into the field ("me", "you said", "today"). The option's own practice is "no grammar to learn". The "Where it was said" head has the room for Anyone · You · Reports · Caw as chips, which is also what the TOM's "a way to narrow" means.

> **The chip is not checkable when titles collide** — The inserted chip is "[⟳ Orchestrate cockpit fleet]", and pressing it "shows the handle". Two sessions share that title; the handle `cockpit#5a167bde` is not a recogniser. T2's success is that he can check the message before sending. When another candidate shared the title, the chip carries the differentiator in its text ("Orchestrate cockpit fleet · linux"), and its press or hover shows the row (state · project · machine · age) with the handle under it.

**Consistency and conventions.**

> **Peek is → on the desk and › on the phone** — On iOS › is the disclosure that pushes a new screen. Here it unfolds in place. A ⌄ that rotates is the in-place disclosure, and the row body opens.

> **The recall wheel as an @ menu** — The mention list stands "in the composer grown upward, as the recall wheel does". The wheel's rows lean 30° back, narrow and blur toward the top, and its keys are its own (↑ opens it, ↓ past the draft closes it, Enter takes the pick into the field unsent). A candidate list needs flat, legible rows and Enter-commits. DESIGN.md already has the recipe for this: "Slash and @ menu: a floating surface above the field and matched to its width, growing from its bottom edge. Groups are ruled with a hairline and headed in uppercase label."

> **"Conversation" in copy** — Every string says conversation: the placeholder, "No conversations for", "Search inside conversations". WORDS.md's term is *session*, and the TOM's constraint is that WORDS.md's terms are "the names everything is called by in copy". The state words are DESIGN.md's too: Working, Needs you, Idle, Sleeping, Stopped, Failed, Unreachable; the options' "Ended" is not one of them.

> **"⌘↵ open beside"** — No TOM action for a session is "open beside"; nothing else in the options defines it. One hint fewer.

**User context.** He is in a hurry and about to act on what he lands in. This option respects that: no question before the words, the differentiators on the row, a check that costs one key and stays in place, a chip he can read back in his own sentence. It makes him feel in control. Uncommon care is present in the coverage line that names the missing machine and offers Retry, and in a chip that serialises readably. Where care is missing: the list can change under a reader who is about to press ↵, because the slow section arrives into the same list he is reading.

**Top opportunities.**
1. One row recipe, fixed height, state word first on the meta line, age always on the title line.
2. Ask machines on a settle, label the section with the words it answers, never let an old answer replace a new one.
3. No empty line until both sections are known empty; the first slow row is active on arrival; ↵ on a moment opens at that moment.
4. Mention uses DESIGN.md's @ menu recipe with the Find row, whole titles, on desk and phone.
5. Who-said as chips in the section head; copy says session.

### Option 2: Six questions, one field

**First impressions.** A six-tab search dialog. The scope row sits directly under the field, so the first thing ⌘K asks is "which question?", before the words. The result shapes are the best of the three for the rarer tasks: Decided's two-line moments with real filters, Said's Copy and Send again, Changed's landed column. What feels off is that the common task pays for the rare ones: the mention popup offers "This conversation", which the TOM says not to offer; the long tail of mentioning hands over to a second surface; and the phone needs two taps to open a session.

**Visual design.**

> **Six chips in 560 px** — 78 px each at 13 px type; they fit on the desk, and on the phone they scroll, so "Waiting" (T4, several times a day) is off-screen to the right in the phone wireframe ("‹Conversations› Said Decided …→").

> **Four bands of chrome before a result** — Decided stacks field (44), scope row (36), filter row (36) and coverage line (28): 144 px before the first row on a 499 px card, with the footer taking 32 more. The option's own trade-off says "about 300 px for rows". Three grouped results fit.

> **The strip is the only two-line element** — Conversations rows are one line with four columns, which is good density, and the detail strip at the foot is the one place a second line appears. The eye has to travel from the active row to the card's foot and back to confirm; Option 1's peek keeps the confirmation under the row.

> **A table inside a card** — Changed has a header row and five columns in 560 px; paths truncate on the second column. T8 is weekly, so it is tolerable, but it is a third row recipe in one surface.

**Interface design.**

> **The decision comes before the words** — "nsenter" typed into Conversations (the default) yields "No conversations for 'nsenter' · Try Decided ⌘3". The empty state is the design admitting the first scope was wrong. There is no kind word for T3, so T3 is two steps every time.

> **Hidden scope memory** — The finder "remembers the last scope … then returns to Conversations after an hour". For 59 minutes ⌘K can open in Changed and answer "orch fleet" with nothing. In a hurry he types before he reads the chip row.

> **The strip shows one row's detail** — To tell the two "Orchestrate cockpit fleet" rows apart he must arrow onto each and read the strip, because the row itself carries project, role and age but no machine.

> **Two mention surfaces** — The popup covers the first-word case; More… opens the whole finder "in mention mode". On the phone that is a sheet over the composer. T2's success condition is "He never has to leave what he is writing to look up an id."

**Consistency and conventions.**

> **Tab changes scope** — "⇥ next question". In a combobox, Tab leaves the field (WAI-ARIA combobox: Tab moves focus on). Overloading it breaks the keyboard contract the option claims in its practices.

> **↵ and ⌘↵ swap by mode** — In the finder ↵ opens and ⌘↵ inserts; in mention mode ↵ inserts and ⌘↵ opens. The same two keys mean opposite things depending on how the card was opened.

> **Two taps on the phone** — "a first tap selects and shows the strip; a second opens". iOS convention is one tap. T1 is constant; the tax is paid every time to make the rare close call checkable.

> **"This conversation"** — The TOM's T2 needs say: "Pointing at the conversation he is writing in should not be offered as a target of a hand-off." The popup offers it as its sixth row.

**User context.** He feels quizzed: six questions to choose from before he has typed. The structure respects the rarer tasks and taxes the constant one. Uncommon care is in Said's Copy and Send again and in Changed's landed column.

**Top opportunities.**
1. Always open in Conversations; drop scope memory.
2. One tap opens on the phone; the strip on long-press.
3. Remove "This conversation"; keep More… but return with the chip and no sheet on the phone.
4. ⌘1–6 for scopes, not Tab; one meaning per key across modes.
5. Machine on the row.

### Option 3: The ledger you filter

**First impressions.** An activity feed with a filter box, 720 px wide. It is honest about time and about the cost of a transcript search, and every row carries every recogniser the TOM names, with a state word. With nothing typed it lists commits, routines that ran fine, reports and previews between sessions: things no top-three task asks for at the doorway. The wireframe's own row already wraps "· report unread" onto a second line in 720 px, so the column set is one column too wide.

**Visual design.**

> **Seven columns and a badge** — glyph, title, project, who, state word, age, machine, badge. The age column mixes "2m" and "Oct 9"; the machine column truncates to "mac…"; the badge wraps. It is a table, and the stated decision "one row per thing" is not what the wireframe draws.

> **Day heads cost 28 px each** — Today and Yesterday heads on a 499 px card leave about 367 px for rows: nine one-line rows.

> **720 px over a 1055 px page** — The card covers 68 % of the width. "The page live under it" is a strip 335 px wide. The Stay In Context Rule is kept in letter and lost in effect.

**Interface design.**

> **No ranking, so words do the ranking** — A today's delegate whose purpose contains "orchestrate" sits above yesterday's session titled "Orchestrate cockpit fleet", because time orders and the TOM's title-above-purpose weighting does not apply. He types until the right row is the only one.

> **The transcript search is one key, always** — Honest and cheap on machines. But on the phone it is offered "when the filter words match nothing named"; when "nsenter" also matches a title, there is no way into Said inside on the phone.

> **The doorway is a log** — Commits, routines with "ran · ok", reports. T1 wants sessions, T4 wants what waits, T5 wants a named thing. A routine that ran fine is a row no task asks for; the TOM recognises a routine by "whether its last run went wrong".

> **The @ list is seven kinds** — conversations, threads, machines, tasks, artifacts, decisions, commits, Today first. For the daily T2 he reads kind glyphs to skip commits and tasks (T7 is weekly).

**Consistency and conventions.**

> **Two list directions** — Desk: Today at the top, the past runs down. Phone: Today nearest the thumb, the past runs up. The same ledger reads top-down on one client and bottom-up on the other.

> **The Waiting chip flips the sort** — "oldest first" inside a list whose rule is newest first.

> **720 px against the glass's other cards** — The machines popover and Caw's panel hang from the same glass at narrower widths; the glass tweens, as DESIGN.md allows, but one card at nearly twice the width changes what "the glass's card" means.

**User context.** Calm for someone browsing the day; this user is typing mid-thought. He feels like he is scanning a log to find a door. Uncommon care: the foot row that names the step ("⌘↵ search inside conversations for 'nsenter'") and the badges that make T4 visible on the rows themselves.

**Top opportunities.**
1. Drop a column (machine into the details) so a row is one line.
2. Rank matched rows by title match, then time, inside the day groups.
3. Doorway shows sessions, threads and badged things only.
4. Said inside reachable on the phone from the field's line whenever words are typed.
5. One list direction on both clients.

---

## Part 2. Traceability: T1, T2, T3 walked through each option

Desk is Chrome at 1055×567; phone is the iPhone app. Heights are from the assumptions above.

### Option 1

| Task | Can't finish | Decides without the information he needs | Element no task justifies | Stated decision the wireframe doesn't reflect |
|---|---|---|---|---|
| T1 desk | No. ⌘K, "orch fleet", ↵; → for the peek. Three rows plus the slow section plus a peek fit in 499 px (44 + 174 + 56 + 132 = 406). | The state is a glyph only; purpose is in the peek. Two siblings with one title are told apart by machine and age, which the wireframe places at three heights. | "⌘↵ open beside". | "State is glyph, word, then hue": no word drawn. "Every row shows the five recognisers": purpose is not on the row. The doorway's one-line rows versus the typed two-line rows. |
| T1 phone | No. Field above the keyboard; seven two-line rows fit. | Phone rows drop the project ("Orchestrate cockpit fleet · macbook · 6d"); fine for the siblings, not for a same-title pair on two projects. | › used for an in-place unfold. | "A tap on › unfolds the peek" against iOS's › = push. |
| T2 desk | No. "@orch cockpit fleet" narrows through spaces; ↵ inserts. | Mention rows show glyph, title, machine, age: no project, no yours/delegate, no state word. Chip press shows the handle, not the row. | — | "The @ list is the same component, same rows": the Mention wireframe draws one-line rows, not the Find rows. The recall wheel's shape, where DESIGN.md has an @ menu recipe. |
| T2 phone | No. | Rows are "[asleep] Orchestrate… 6d": the title is cut at 12 characters and the machine is gone, so the asleep macbook sibling and the working linux one differ by age alone. | — | Same as desk. |
| T3 desk | No, but ↵ before the machines answer does nothing (no active row), and an answer to "nse" can land after "nsenter". | "No conversations for 'nsenter'" stands above arriving conversations; nothing says which words a section answers. Narrowing by who-said is a typed word he has to know. | "Search inside conversations instead", offered while that search already ran. | "The head shows the chips they became, each removable" is stated and never drawn. |
| T3 phone | No. | The moments stand at the top of the sheet, farthest from the thumb; Retry is up there too. One reach; acceptable. | — | — |

### Option 2

| Task | Can't finish | Decides without the information he needs | Element no task justifies | Stated decision the wireframe doesn't reflect |
|---|---|---|---|---|
| T1 desk | No, when the finder opens in Conversations. For up to an hour it can open in the last scope and answer "orch fleet" with nothing. | Rows have no machine; the strip shows it for the active row only, so the siblings are told apart by arrowing onto each. | Tab as "next question" (takes a key the combobox needs). | "⌘↵ put in message" is in the footer with no composer on the page named. |
| T1 phone | No, in two taps (first selects, second opens). | The chip row takes 44 pt from the rows. | — | "T1 keystrokes after the words: ↵" (side-by-side) is not true on the phone. |
| T2 desk | No for the first-word case. The long tail leaves the composer for the finder. | Popup rows: "· linux · 2m", no project or role. | "This conversation": the TOM says not to offer it. | — |
| T2 phone | The long tail opens a sheet over the composer: he leaves what he is writing (T2 success condition). | Same rows. | Same. | — |
| T3 desk | No, in two steps every time: Tab or ⌘3, then the words, or the words first and a redirect. | The filters are real controls: he has the information. 323 px for rows: three grouped results visible. | — | — |
| T3 phone | No. The Decided chip is the third of six, on screen. | Chips + filters + field = 124 pt above the keyboard; about 276 pt for rows, two grouped results. | — | — |

### Option 3

| Task | Can't finish | Decides without the information he needs | Element no task justifies | Stated decision the wireframe doesn't reflect |
|---|---|---|---|---|
| T1 desk | No for today's sessions (the working one is pinned; ⌘K ↵ opens it). A September one needs words until it is the only row. | He has everything on the row: state word, role, age, machine. The best row of the three. | Commits and "ran · ok" routines at the doorway. | "One row per thing": the badge wraps to a second line. "The page live under it": 335 px of it. |
| T1 phone | No. | Phone rows drop the machine; the list runs the opposite way to the desk's. | — | "Columns tell siblings apart": on the phone they collapse to two lines without the machine. |
| T2 desk | No. | Desk mention rows show age and machine only. Commits, tasks and decisions stand between sessions in the daily list. | Commits in the @ list (T7 is weekly). | — |
| T2 phone | No. | Same. | Same. | — |
| T3 desk | No: ⌘↵ every time. Honest, one key. | Filters are controls; coverage at the head. | — | — |
| T3 phone | Yes, when the words also match a title: Said inside is offered only "when the filter words match nothing named". | — | — | — |

---

## Part 3. The pick

Option 1. T1 and T2 are the work, both end in a session, and Option 1 alone answers them with a ranked session whose differentiators are on the row, a one-key check that stays in place, and one component with one ranking for finding and mentioning, so a pick made mid-sentence is as safe as one made deliberately. Option 2 puts a scope decision before the words, makes T3 two steps, takes two taps on the phone and offers the one target the TOM says not to offer; Option 3 fills the doorway and the @ list with things no top task asks for, drops relevance for time, covers two thirds of the page, and strands T3 on the phone. Every fault in Option 1 is a correction to a row, a head line, a timing or a word; none is the structure.

---

## Part 4. Findings on Option 1

Each: tag, what, where, task affected.

1. **must-fix** — Copy uses WORDS.md's nouns and DESIGN.md's state words. "session" for "conversation" in every string (placeholder "Find a session, or a task, preview, decision…", "No sessions for 'x'", "Where 'x' was said"); state words Working / Needs you / Idle / Sleeping / Stopped / Failed / Unreachable, never "Ended" or "asleep". Where: every Find and Mention string. T1, T2, T3.
2. **must-fix** — One row recipe, fixed height, on every surface. Line 1: status glyph, title, age right-aligned. Line 2: state word · project · yours / delegate of X / Caw / attempt at tsk-N · machine. Line 3 (↳), one line clipped, only when the match came from purpose or a moment. The doorway, the Go-to fold, Waiting and Mention all draw this row. Where: Find typing, Find doorway, Mention, desk and phone. T1, T2.
3. **must-fix** — Mention rows are the Find rows, whole. No truncation to "Orchestrate…"; on the phone a long title wraps to a second line rather than clipping, so the row is three lines there. Where: Mention, desk and phone. T2.
4. **must-fix** — Mention stands in DESIGN.md's slash/@ menu recipe: a floating surface above the field, matched to its width, growing from its bottom edge, flat rows, one hairline-ruled group. Not the recall wheel's grown shape, whose rows lean, narrow and blur and whose ↑, ↓-past-draft and Enter-unsent semantics collide with a candidate list. The same recipe above the phone's composer. Where: Mention. T2.
5. **must-fix** — "Where it was said" asks machines once typing has settled (my own call: 250 ms after the last keystroke, under the 1 s wait grace), its head names the words it answers, an older answer never replaces a newer one, and arrivals reflow on the Nothing Jumps Rule. Hub-side rows keep answering per keystroke. Where: Find, the second section. T3.
6. **must-fix** — The Claim Of Nothing holds across both sections. The hub-side section, when empty, draws no line. The one no-results line, "No sessions for 'nsenter'" with one action, appears only once the hub has answered and every machine has answered or been named missing. With a machine missing and nothing back, the section head stands with its coverage and Retry and no "No sessions" line. Where: Find, states. T3.
7. **must-fix** — The active row and the ↵ target. When the hub-side section is empty, the first "Where it was said" row becomes active the moment it lands. ↵ on a row whose ↳ line is a moment opens the session scrolled to that moment, highlighted; ↵ on a title or purpose match opens at its latest. The footer says which: "↵ open at that line". Where: Find. T3, T1.
8. **must-fix** — Who-said as chips, not words. The "Where it was said" head carries Anyone · You · Reports · Caw (You excludes injected turns). Project and time words typed in the field become removable chips in the same head, as the option states and never draws. "me" typed still works as a shortcut to You. Where: Find, the section head, desk and phone. T3, T6.
9. **must-fix** — The chip is checkable when titles collide. Hover or press on an inserted chip shows the row (state word · project · machine · age) with the handle under it, not the handle alone. Where: the composer and the transcript. T2.
10. **must-fix** — The chip itself tells same-titled siblings apart, without a hover. When the chosen session shares its title with another candidate in the list, the chip carries the fact that told them apart on the row, the state word and machine: "[⟳ Orchestrate cockpit fleet · linux]", and the sent text carries it too: `@Orchestrate cockpit fleet · linux <cockpit#5a167bde>`. A title no other candidate shares inserts as the bare title. He reads the difference in his own sentence, so a wrong first-ranked sibling is caught by reading, not by a pointer. Where: Mention, the chip and its serialisation. T2.
11. **applied in the wireframes** — "⌘↵ open beside" dropped; no TOM action. Footer reads "↵ open · → peek · esc". T1.
12. **applied in the wireframes** — Phone peek disclosure is a rotating ⌄ at the row's trailing end (44 pt target); the row body opens. › is iOS's push. T1 phone.
13. **applied in the wireframes** — The Go-to row leads with the kind glyph, not "→" (see the Go-to frame below). T5.
14. **decided: stays in the peek** — Purpose on every title-matched row would make every row three lines and cut the visible rows from eight to six on the 499 px card; the TOM's second recogniser stays one key away (→) and on the ↳ line whenever it is what matched. T1.
15. **applied in the wireframes** — Where Mention lives is stated: the session composer, the Caw thread composer, and the iPhone composer (which today has no @). T2.
16. **applied in the wireframes** — When Waiting is 0 the doorway's first row is today's first session, so ⌘K ↵ opens it. T1, T4.

---

## Part 5. Revised wireframes, Option 1 with every must-fix applied

Glyphs stand in for Solar duotone: ⟳ Working (refresh-circle), ✋ Needs you (hand-shake), ☾ Sleeping (moon-sleep), ⏸ Idle, ⊗ Stopped. Uppercase heads are DESIGN.md's label role.

### Desk, Find, typing "orchestrate fleet" (the glass's card, right-aligned, 520 px, page live under it)

```
┌ top bar ─────────────────────────────────────[⌕ Jump ⌘K][3 machines][Caw]─┐
│                                   ┌────────────────────────────────────────┐│
│  (page, live)                     │ [⌕] orchestrate fleet              [✕] ││
│                                   ├────────────────────────────────────────┤│
│                                   │ ⟳ Orchestrate cockpit fleet         2m ││ ← active
│                                   │   Working · cockpit · yours · linux    ││
│                                   │ ☾ Orchestrate cockpit fleet         6d ││
│                                   │   Sleeping · cockpit · yours · macbook ││
│                                   │ ✋ Fleet watch nudges               41m ││
│                                   │   Needs you · cockpit · delegate of    ││
│                                   │   Orchestrate cockpit fleet · linux    ││
│                                   │   ↳ purpose "…orchestrate the fleet…"  ││
│                                   ├─ WHERE "ORCHESTRATE FLEET" WAS SAID ───┤│
│                                   │ [Anyone][You][Reports][Caw]            ││
│                                   │ 2 of 3 machines · macbook didn't·Retry ││
│                                   │ ☾ Boundary quiet fix             Oct 3 ││
│                                   │   Sleeping · anbar · delegate · linux  ││
│                                   │   ↳ you "…the orchestrate fleet sessi…"││
│                                   ├────────────────────────────────────────┤│
│                                   │ ↵ open   → peek   esc                  ││
│                                   └────────────────────────────────────────┘│
```

Height: 44 + 52 + 52 + 70 + 28 + 36 + 28 + 70 + 32 = 412 px of 499. The "delegate of …" meta line wraps to a second meta line only when the parent's title does not fit; clipping the parent's title is the alternative and loses the recogniser.

### Desk, Find, "nsenter": the hub-side section is empty

Before the machines answer (no empty line; the head says what is happening):

```
│ [⌕] nsenter                                            [✕] │
├─ WHERE "NSENTER" WAS SAID ─────────────────────────────────┤
│ [Anyone][You][Reports][Caw]      Searching 3 machines… ◌   │
│ (plain surface; skeleton rows at row height after 1 s)     │
├────────────────────────────────────────────────────────────┤
│ esc                                                        │
```

After they answer (the first row active on arrival):

```
│ [⌕] nsenter                                            [✕] │
├─ WHERE "NSENTER" WAS SAID ─────────────────────────────────┤
│ [Anyone][You][Reports][Caw]                                │
│ 2 of 3 machines · macbook didn't · Retry                   │
│ ☾ Boundary quiet fix                                 Oct 3 │ ← active
│   Sleeping · anbar · delegate of Orchestrate cockpit fleet │
│   ↳ report "nsenter needs CAP_SYS_ADMIN inside the ns…"    │
│ ⟳ Orchestrate cockpit fleet                             2m │
│   Working · cockpit · yours · linux                        │
│   ↳ you "decision: no nsenter, boundary-quiet instead"     │
├────────────────────────────────────────────────────────────┤
│ ↵ open at that line   → peek   esc                         │
```

With "today" or "anbar" typed as well, the head gains a removable chip: `[Anyone][You][Reports][Caw] · [anbar ✕] [today ✕]`.

Every source empty, every machine answered:

```
│ [⌕] nsenter                                            [✕] │
├────────────────────────────────────────────────────────────┤
│ No sessions for "nsenter"                                  │
│ Open today's sessions                                      │
```

A machine missing and nothing back: the section head with "2 of 3 machines · macbook didn't · Retry" stands alone; no "No sessions" line.

### Desk, a row peeked (→; unchanged in structure, state word added)

```
│ ⟳ Orchestrate cockpit fleet                             2m │
│   Working · cockpit · yours · linux                        │
│   ┌ purpose   Coordinating the find and mention rework     │
│   │ last      report "options delivered" · 9m              │
│   │ said      you · 2m · "pass the fixes to…"           ↵  │
│   │           report · 3h · "boundary quiet fix…"       ↵  │
│   │ delegates 3 · 1 needs you                              │
│   └ ↵ open · ← fold                                        │
│ ☾ Orchestrate cockpit fleet                             6d │
```

### Desk, Find, nothing typed (the doorway, on the same row recipe)

```
│ [⌕] Find a session, or a task, preview, decision…          │
├────────────────────────────────────────────────────────────┤
│ ✋ Waiting for you · 6                                    › │
├─ TODAY ────────────────────────────────────────────────────┤
│ ⟳ Orchestrate cockpit fleet                             2m │
│   Working · cockpit · yours · linux                        │
│ ✋ Fleet watch nudges                                   41m │
│   Needs you · cockpit · delegate of Orchestrate… · linux   │
│ ☾ Landing preview polish                                3h │
│   Sleeping · anbar · delegate of Orchestrate… · macbook    │
│ ⏸ Landing copy                                          4h │
│   Idle · anbar · Caw thread                                │
```

Six rows fit under the Waiting row. When Waiting is 0 the row is absent and the first Today row is active (consider 15).

### Desk, Mention (DESIGN.md's @ menu: a floating surface above the field, its width, growing from its bottom edge)

```
│  (transcript, where it was)                                  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ⟳ Orchestrate cockpit fleet                           2m │ │ ← active
│ │   Working · cockpit · yours · linux                      │ │
│ │ ☾ Orchestrate cockpit fleet                           6d │ │
│ │   Sleeping · cockpit · yours · macbook                   │ │
│ │ ✋ Fleet watch nudges                                 41m │ │
│ │   Needs you · cockpit · delegate of Orchestrate… · linux │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ╭──────────────────────────────────────────────────────────╮ │
│ │ pass the fixes to the @orch cockpit fleet▌               │ │
│ │ [Attach]                                           [Send]│ │
│ ╰──────────────────────────────────────────────────────────╯ │
```

Up to five rows; ↑↓ move, ↵ inserts, Escape leaves the text plain, a whole word with no match closes it. After ↵, because another candidate shared the title: `pass the fixes to the [⟳ Orchestrate cockpit fleet · linux]▌`; had the title been unique: `[⟳ Orchestrate cockpit fleet]`. Hover or press on the chip: a tooltip "Working · cockpit · yours · linux · 2m" with `cockpit#5a167bde` under it. Sent: `@Orchestrate cockpit fleet · linux <cockpit#5a167bde>`. The one it is written in is never a row. The same menu, the same rows and the same chip stand in a Caw thread's composer and in the iPhone app's composer (which today has no @).

### Desk, a Go-to row (typing "task drift"; the kind glyph leads, no arrow)

```
│ [⌕] task drift                                         [✕] │
├────────────────────────────────────────────────────────────┤
│ ☑ tsk-142 Drift check                                   5h │ ← active
│   Waits on you · cockpit · Review                          │
├────────────────────────────────────────────────────────────┤
│ ☾ Drift check, attempt 2                                1d │
│   Sleeping · cockpit · attempt at tsk-142 · linux          │
├────────────────────────────────────────────────────────────┤
│ ↵ open   → peek   esc                                      │
```

Several things of one kind fold behind one row ("▭ 3 previews match "land" ▸") on the same recipe; a machine's row peeks to "Start a session here · See what runs here".

### Phone, Find (sheet from the glass; field above the keyboard; best match nearest it)

```
┌────────────────────────────────┐
│ ▔▔▔▔                           │
│ ─ WHERE "ORCHESTRATE FLEET"    │
│   WAS SAID ─────────────────── │
│ [Anyone][You][Reports][Caw]    │
│ 2 of 3 machines · macbook      │
│ didn't · Retry                 │
│ ☾ Boundary quiet fix     Oct 3 │
│   Sleeping · anbar · delegate  │
│   ↳ you "…orchestrate fleet…" ⌄│
│ ────────────────────────────── │
│ ✋ Fleet watch nudges       41m │
│   Needs you · cockpit ·        │
│   delegate · linux            ⌄│
│ ☾ Orchestrate cockpit fleet 6d │
│   Sleeping · cockpit · macbook⌄│
│ ⟳ Orchestrate cockpit fleet 2m │
│   Working · cockpit · linux   ⌄│
├────────────────────────────────┤
│ [⌕] orchestrate fleet      [✕] │
├────────────────────────────────┤
│           keyboard             │
└────────────────────────────────┘
```

Rows 56 pt (72 when a title wraps), text 16 pt, the ⌄ a 44 pt target that unfolds the peek in place; the row body opens. Nothing typed: "Waiting for you · 6" is the row nearest the field, Today's sessions above it.

### Phone, Mention (the @ menu above the composer)

```
│ (transcript)                   │
│ ┌────────────────────────────┐ │
│ │ ☾ Orchestrate cockpit   6d │ │
│ │   fleet                    │ │
│ │   Sleeping · cockpit ·     │ │
│ │   macbook                  │ │
│ │ ⟳ Orchestrate cockpit   2m │ │ ← active
│ │   fleet                    │ │
│ │   Working · cockpit · linux│ │
│ └────────────────────────────┘ │
│ ╭────────────────────────────╮ │
│ │ pass fixes to @orch cock▌  │ │
│ ╰────────────────────────────╯ │
│           keyboard             │
```

A tap inserts the chip, with " · linux" or " · macbook" appended when the other row shared the title; a tap on the chip shows its row and handle; swipe down on the menu or backspace through the "@" puts it away.

### What changed in the states

- Find, typing: no empty line while any source is unread; the one no-results line only when every source has answered; a missing machine is a coverage head, never an empty state.
- Find, the second section: requested on settle; the head names its words; stale answers dropped; first row active on arrival when the first section is empty.
- Mention: rows are the Find rows in the @ menu recipe; a chip for a shared title carries the state word and machine in its text and in the sent form; "Can't reach the hub" and "No sessions for 'x'" stand as one row in the menu, text stays plain.

---

## Biggest remaining risk

The ranking weights (title above purpose above project, then recency, state, parentage) are the TOM's, and no wireframe can show whether they put the session he meant first on his real fleet of hundreds of sleeping delegates; that is settled only by the build's live check, the owner's own ten queries from the TOM run on the deployed finder with the expected session named for each.
