# Find and mention: three structures

Source: `docs/tom/find-and-mention.md` (the TOM). Design law: `DESIGN.md`, tokens in `design/tokens/cawco.tokens.json`, copy in `WORDS.md`. I have not seen the current implementation and did not open it.

The TOM's ranking puts getting back into a conversation (T1) and naming one while writing (T2) first, then finding where something was decided (T3), then seeing what waits (T4). Everything below is organised around that order. Three structures follow, then the test I ran on each.

## Practices I brought, and why these

- **Recognition over recall.** He remembers conversations by title, purpose, project, state and roughly when, never by id (TOM, Objects). Every row in every option shows those five, and never an id unless two rows are otherwise identical.
- **Confirm before consequence.** Acting in the wrong conversation spends its context and money (T1, T2). So every option gives a way to check a match before committing that costs one keystroke, not a page.
- **Two speeds, made honest.** Titles, state, projects and tasks live at the hub and answer at once; transcripts live on machines and answer in up to 1.5 s each, or not at all (Constraints). Each option handles the gap differently, but none hides it: a transcript answer always carries its machine coverage (Nielsen, visibility of system status; PRODUCT.md's derived liveness).
- **One box, no grammar to learn.** Kind words he already uses ("task drift check", "preview landing", "previews") work as typed (T4, T5). No option requires a prefix syntax.
- **Thumb zone on the phone.** The field and the best match sit nearest the thumb, above the keyboard (my own call, modelled on iOS's home-screen Spotlight, which puts its field above the keyboard). Rows are 44 pt, text 16 pt (Constraints).
- **The mention is a chip, not a handle.** Notion- and Linear-style: readable to him, resolvable by the hub, typed with spaces (T2).
- **Keyboard combobox pattern** (WAI-ARIA combobox + listbox): the field keeps focus, arrows move the active row, Enter commits, Escape leaves. Every row is announced with its kind and state word (Constraints, accessibility; The Glyph, Word, Hue Rule).

## Shared ground: engine decisions every option takes

These are decided by the TOM, not by the structure, so all three options share them. Each lists the alternative rejected.

1. **A result is an object from the TOM.** Never a transcript line, a data source or an id. (Rejected: today's single-message hits named by folder leaf.)
2. **Matching on any words in any order, typed with spaces,** over title, purpose and project for conversations and threads; name, id and kind word for tasks, routines, projects, machines, artifacts, decisions; path, message and short sha for file changes and commits. (Rejected: prefix-only matching that abandons the lookup at the first space.)
3. **Ranking inputs:** word match (title above purpose above project), then recency, then live state (working and needs-you above idle today above asleep above ended), then parentage (his orchestrator and today's delegates of it). Hub-side, so instant. (Rejected: FTS rank alone, which has no notion of today.)
4. **Moments are gathered per conversation,** one result per conversation, near-identical lines folded, weighted toward his requests, his decisions, a delegate's final report and the orchestrator's summaries, and away from tool chatter and scratch notes. Each carries an excerpt and opens the conversation at that moment. (Rejected: a flat list of lines.)
5. **Coverage is always said.** Any answer that asked machines carries "N of M machines answered · <name> didn't · Retry" at the head of that answer, in place, never as a toast. An answer with a machine missing never shows an empty state; it shows the coverage line and whatever came back. (Rejected: silently merging what answered.)
6. **No hub, no finding.** If the hub does not answer, the field stays, with "Can't reach the hub. Nothing can be found until it's back. Retry" under it. No device-local fallback (fallbacks are owner-authorised only). (Rejected: a browser-held list that would silently differ from the fleet.)
7. **Secrets never match and never appear.** Known key and token shapes are removed at index time and drawn as `••••` in any excerpt. Engine-level; no option can show them.
8. **Caw's lead session is never a result or a target.** Threads stand for him everywhere.
9. **The inserted reference is a chip.** It shows the kind glyph and the title in his words; it carries the resolvable handle (`<dir>#<id8>` for a conversation, the thread's own id for a thread, the hostname for a machine, `tsk-142` for a task, the artifact's or decision's id, a path or sha). In the sent text it serialises as `@Orchestrate cockpit fleet <cockpit#5a167bde>`, readable to him in the transcript and resolvable by the hub. Pressing the chip shows the handle. The hand-off resolver must accept this form and a thread's id (Open Q2 and Q3 answered this way; both change the resolver). (Rejected: a bare handle, unreadable; a bare title, unresolvable.)
10. **The no-results line follows WORDS.md:** "No conversations for 'orchestrate fleat'", query verbatim, plus one alternative action. It appears only once the hub has answered (The Claim Of Nothing Rule).
11. **Surfaces follow DESIGN.md:** on the desk the finder hangs from the top bar's glass as the glass's card (non-modal, page live under it, ⌘K opens it at once with no slide, Escape returns focus). In the composer, the candidates stand in the composer grown upward out of its pill, as the recall wheel does, or in the slash/@ menu recipe where an option says so. Kind glyphs are Solar bold-duotone at 16 px; the session's state is glyph, word, then hue.

Kind glyphs (Solar duotone; the table is a suggestion, the rule is one glyph per kind everywhere):

| Kind | Glyph | State word read before the title |
|---|---|---|
| Conversation | the session's status glyph (refresh-circle, hand-shake, pause-circle, moon-sleep, close-circle) | Working / Needs you / Idle / Sleeping / Ended |
| Thread | chat-round-dots | Caw working / idle |
| Task | checklist-minimalistic | its stage, "waits on you" where it does |
| Routine | calendar | last run outcome |
| Project | folder, in the project's hue | — |
| Machine | server | online / offline |
| Preview / page / canvas | window-frame / document-text / pen-new-square | unseen / seen |
| Decision | list-check | picks to make / picked |
| Report | document | unread / read |
| File change / commit | code-square / git-branch (linear) | landed / not landed |

---

### Option 1: The conversation is the answer

**Organizing principle.** Every result is a conversation (a session or a thread). Whatever matched (its title, its purpose, a thing someone said in it, a file it changed, a report it sent) is shown *under* the conversation as the reason it is here, not as a result of its own. The structure is optimised for T1 and T2, where the answer is always a conversation, and for T3, T6 and T8, whose results the TOM already asks to be gathered per conversation. It sacrifices breadth for the other kinds: tasks, projects, machines, routines, artifacts and decisions are reached through one "Go to" row at the top, never as a group competing with conversations. What is waiting (T4) is not a search result at all; it is a list the finder opens onto.

**Finding and mentioning are one structure.** The @ popup in the composer shows the same rows, ranked the same way, drawn the same way, with one difference: Enter inserts a chip instead of opening.

#### Screen inventory

| Screen | Job |
|---|---|
| **Find** (desk: the glass's card; phone: a sheet with the field above the keyboard) | T1, T3, T5, T6, T8. One field, one list of conversations, a Go-to row for other kinds. |
| **Find, nothing typed** | The doorway: "Waiting for you · N" first, then today's conversations by last activity. |
| **Peek** (a row unfolded in place) | Confirm before committing: purpose, last report, the matching moments, children. T1's "tell it is the right one", T3's "land on the moment". |
| **Waiting for you** (the card's contents replaced in place) | T4. Everything that waits, by kind, sortable by age or project, with coverage. |
| **Mention** (the composer grown upward) | T2, T7. The same rows; Enter inserts a chip. |

#### Structure decisions

| Decision | Principle or evidence | Alternative rejected |
|---|---|---|
| One list, conversations only; no kind groups | T1 is constant and T2 daily; both want a conversation. The TOM: "every result, wherever it comes from, should be one of the objects below", and T3 asks for results "gathered per conversation". Grouping by kind spends the first screenful on groups he rarely wants. | A palette with Projects / Threads / Sessions / Tasks / Moments sections (the default; see the test at the end). |
| The reason it matched is a line under the row ("↳ you: '…pass the fixes to the orchestrate…'") | Recognition: he recognises a conversation by what was said in it as much as by its title (Objects, Conversation). Showing why keeps a transcript hit honest without making the line a result. | A separate "Moments" result kind. |
| Two sections in the one list: conversations that match by what they are (instant), then "Where it was said" (arrives as machines answer) with its coverage line | Two speeds made honest; the hub answers in milliseconds, machines in up to 1.5 s. Keeping them in one list keeps one unit; splitting them in time keeps the fast answer from waiting on the slow one. | Holding the whole list until every machine answers (he would wait 1.5 s for his own orchestrator), or one merged list where slow rows push fast ones around. |
| Peek on → unfolds the row in place: purpose, last report, up to 3 matching moments (each a jump target), delegates and their states | T1 success: "before he commits he can tell it is the right one and not a sibling". T3 success: lands on the moment. In place because of The Stay In Context Rule and the fold recipe. | A preview pane beside the list (no room at 1055 px wide beside a 520 px card; and on the phone it would be a second screen). |
| Other kinds appear as one Go-to row at the top, only when a kind word or a strong name match says so ("task drift" → "→ tsk-142 Drift check"); several matches fold behind it ("3 previews match 'land' ▸") | T5 is "I know the thing; one step". One row answers it without crowding T1. Kind words as he says them (T4, T5 needs). | Mixing tasks and projects into the ranked list (a project named "cockpit" would outrank every cockpit conversation). |
| Waiting for you is the first row when nothing is typed, and typing a kind word ("previews") opens it filtered | T4 is "several times a day" and has no query; it is a list, not a search. Putting it at the doorway means ⌘K ↵ answers "what do I need to look at". | A Waiting section inside the results (it would appear under every query), or a separate page (The Stay In Context Rule: he asked from here). |
| The @ list is the same component, same ranking, same rows | T2 needs "the same recognisers as T1, so a choice made while writing is as safe as one made deliberately", and every candidate, not what the device holds. One component means one ranking to trust. | A smaller, differently ranked popup (two rankings to learn; today's failure). |
| @ keeps narrowing through spaces; it closes on Escape, on a pick, or after a whole word that matches nothing | T2: "Typing several words of a title, with spaces, has to keep narrowing the choices instead of abandoning the lookup." | Closing on the first space (today). |
| The conversation he is writing in is not a candidate | TOM T2: not offered as a hand-off target; Open Q4 unresolved. | Offering it (Option 2 does, as a stance). |
| Phone: the field above the keyboard, best match nearest it | Thumb zone; he types two or three words with one thumb. | Field at the top (the thumb crosses the screen between typing and picking). |

#### Traceability

| TOM item | Where |
|---|---|
| T1 | Find → rows → peek → ↵ |
| T2 | Mention (composer) → chip |
| T3 | Find → "Where it was said" → peek → moment ↵ |
| T4 | Find, nothing typed → "Waiting for you" → list |
| T5 | Find → Go-to row |
| T6 | Find with "me" or "you said" as a word → "Where it was said" narrowed to his own words → peek shows the message with Copy and Send again |
| T7 | Mention with a kind word ("@task drift", "@preview landing") → Go-to row → chip |
| T8 | Find with a path, part of one, a commit message or a sha → rows whose reason line reads "changed src/x.ts · ws-4f2a · landed on main Oct 3" |
| Machine's next acts (T5) | Go-to row for a machine opens its row's actions: Start a session here, See what runs here |
| Narrow by who said, project, time (T3) | Words in the field ("me", a project's name, "today", "this week") act as narrowing; the "Where it was said" head shows the chips they became, each removable |

Left off this surface: nothing from the TOM. Reports are reached as a reason line under their sender and as rows in Waiting for you (unread).

#### Flow

**T1. Get back into a conversation.** ⌘K. The card stands at once; the field has focus; the doorway shows Waiting for you · 6, then today's conversations. He types "orch fleet". Rows reflow in place as he types: "Orchestrate cockpit fleet · Working · cockpit · yours · 2m · linux" on top, under it "Orchestrate cockpit fleet · Sleeping · cockpit · yours · 6d · macbook", under that "Fleet watch nudges · Needs you · delegate of Orchestrate cockpit fleet · 41m" with "↳ purpose: …orchestrate the fleet watch". The two with the same title are told apart by state, age and machine on their own lines. He presses → on the top row: it unfolds to "Coordinating the find and mention rework · last: report 'options delivered' 9m · 3 delegates, 1 needs you". ↵ opens it. Two to four keystrokes after the words.

**T2. Name a conversation while writing.** He types "pass the fixes to the @orch". At "@" the composer grows upward out of its pill and the same rows stand in it, the best on the line above the field. He keeps typing "orch cockpit fleet"; the rows narrow through the spaces. ↑ once to the asleep one if that is the one; ↵. The chip "[moon] Orchestrate cockpit fleet" lands where "@orch cockpit fleet" was; the caret is after it; the shape folds back into the pill. He finishes the sentence and sends. The transcript shows the chip; the agent receives `@Orchestrate cockpit fleet <cockpit#5a167bde>` and hands off to that session and no other.

**T3. Find where something was decided.** ⌘K, "nsenter". No conversation is named for it, so the first section says "No conversations for 'nsenter'" with "Searching 3 machines…" under it. Within a second the "Where it was said" head arrives: "2 of 3 machines answered · macbook didn't · Retry". Under it "Boundary quiet fix · Sleeping · anbar · delegate · Oct 3" with "↳ report: 'nsenter needs CAP_SYS_ADMIN inside the namespace…'", then "Orchestrate cockpit fleet · Working" with "↳ you: 'decision: no nsenter, boundary-quiet instead'". → on the first unfolds its three matching moments. ↵ on the report line opens Boundary quiet fix scrolled to that report, highlighted.

**T4. See what is waiting.** ⌘K ↵ (the first row is Waiting for you). The card's contents change in place to the list: 6 rows across previews, decisions, tasks, a report and a proposal, oldest first. He presses "Project" to regroup. ↵ on "Landing preview · unseen · anbar · from Landing preview polish · 3h" opens the preview. Escape back to the list: that row now reads "seen" in muted ink and sits where it was.

#### Wireframes

**Desk, Find, typing** (the card hangs from the glass, right-aligned, 520 px wide (`c-find-w`, new token), at most the viewport less the bar and 24 px tall; page live under it):

```
┌ top bar ─────────────────────────────────────────────[⌕ Jump ⌘K][3 machines][Caw]─┐
│                                            ┌──────────────────────────────────────┐ │
│  (page, live)                              │ [⌕] orchestrate fleet            [✕] │ │
│                                            ├──────────────────────────────────────┤ │
│                                            │ [working] Orchestrate cockpit fleet  │ │
│                                            │           cockpit · yours · linux 2m │ │
│                                            │ [asleep]  Orchestrate cockpit fleet  │ │
│                                            │           cockpit · yours · macbook  │ │
│                                            │                                  6d  │ │
│                                            │ [needs]   Fleet watch nudges     41m │ │
│                                            │           delegate of Orchestrate…   │ │
│                                            │           ↳ purpose: "…orchestrate   │ │
│                                            │             the fleet watch…"        │ │
│                                            ├─ Where it was said ──────────────────┤ │
│                                            │ 2 of 3 machines answered · macbook   │ │
│                                            │ didn't · [Retry]                     │ │
│                                            │ [asleep]  Boundary quiet fix   Oct 3 │ │
│                                            │           anbar · delegate           │ │
│                                            │           ↳ you: "…the orchestrate   │ │
│                                            │             fleet session owns…"     │ │
│                                            ├──────────────────────────────────────┤ │
│                                            │ ↵ open  → peek  ⌘↵ open beside       │ │
│                                            └──────────────────────────────────────┘ │
```

**Desk, a row peeked** (→ unfolds it; the rows under it make room on the fold recipe):

```
│ [working] Orchestrate cockpit fleet                   2m │
│           cockpit · yours · linux                        │
│   ┌ purpose   Coordinating the find and mention rework   │
│   │ last      report · "options delivered" · 9m          │
│   │ said      you · 2m · "pass the fixes to…"         ↵  │
│   │           report · 3h · "boundary quiet fix…"     ↵  │
│   │ delegates 3 · 1 needs you                            │
│   └ ↵ open · ⌘↵ open beside · ← fold                     │
│ [asleep]  Orchestrate cockpit fleet                   6d │
```

**Desk, nothing typed** (the doorway):

```
│ [⌕] Find a conversation, or a task, preview, decision…   │
├──────────────────────────────────────────────────────────┤
│ [hand]    Waiting for you · 6                          › │
├─ Today ──────────────────────────────────────────────────┤
│ [working] Orchestrate cockpit fleet   cockpit · yours 2m │
│ [needs]   Fleet watch nudges          cockpit · deleg 41m│
│ [asleep]  Landing preview polish      anbar · deleg   3h │
│ [idle]    Landing copy (thread)       anbar · Caw     4h │
│ …as many as the card holds, by last activity             │
```

**Desk, Waiting for you** (the card's contents replaced in place; ← or Escape returns):

```
│ [←] Waiting for you · 6                sort [Age][Project]│
├──────────────────────────────────────────────────────────┤
│ [preview]  Landing preview          unseen             3h│
│            anbar · from Landing preview polish           │
│ [decision] Find and mention shape   2 picks to make    1h│
│            cockpit · Caw                                 │
│ [task]     tsk-142 Drift check      waits on you       5h│
│            cockpit · Review                              │
│ [report]   "search rework passed"   unread            20m│
│            cockpit · from Search rework                  │
│ [proposal] AGENTS.md: deploy days   approve            1d│
│            anbar · memory curator                        │
│ [preview]  Jump wireframe           unseen             2d│
│            cockpit · from Find options                   │
├──────────────────────────────────────────────────────────┤
│ all 3 machines answered                                  │
```

**Desk, a Go-to row** (typing "task drift"):

```
│ [⌕] task drift                                           │
├──────────────────────────────────────────────────────────┤
│ [task] → tsk-142 Drift check · cockpit · waits on you  ↵ │
├──────────────────────────────────────────────────────────┤
│ [asleep]  Drift check, attempt 2          cockpit     1d │
│           attempt at tsk-142                             │
```

**Desk, Mention** (the composer grown upward; the transcript stays where it is):

```
│  (transcript)                                              │
│        ╭──────────────────────────────────────────────╮    │
│        │ [asleep]  Orchestrate cockpit fleet  macbook 6d│   │
│        │ [working] Orchestrate cockpit fleet  linux   2m│ ← on the line: the pick
│        ├──────────────────────────────────────────────┤    │
│        │ pass the fixes to the @orch cockpit fleet▌   │    │
│        │ [Attach]                               [Send]│    │
│        ╰──────────────────────────────────────────────╯    │
```

After ↵: `pass the fixes to the [⟳ Orchestrate cockpit fleet]▌`

**Phone, Find** (a sheet from the glass; the field above the keyboard; the best match nearest it):

```
┌────────────────────────────────┐
│ ▔▔▔▔                           │
│                                │
│ ─ Where it was said ───────────│
│ 2 of 3 machines · macbook      │
│ didn't · Retry                 │
│ [asleep] Boundary quiet fix    │
│   you: "…orchestrate fleet…" ›│
│ ───────────────────────────────│
│ [needs] Fleet watch nudges     │
│   delegate · 41m             › │
│ [asleep] Orchestrate cockpit   │
│   fleet · macbook · 6d       › │
│ [working] Orchestrate cockpit  │
│   fleet · linux · 2m         › │
├────────────────────────────────┤
│ [⌕] orchestrate fleet      [✕] │
├────────────────────────────────┤
│           keyboard             │
└────────────────────────────────┘
```

A tap on the row opens; a tap on › unfolds the peek under it (the same fold). Nothing typed: "Waiting for you · 6" sits on the field's line, today's conversations above it.

**Phone, Mention** (the composer grown upward, as the recall wheel):

```
│ (transcript)                   │
│ ╭────────────────────────────╮ │
│ │ [asleep] Orchestrate…  6d  │ │
│ │ [working] Orchestrate… 2m  │ │ ← on the line
│ ├────────────────────────────┤ │
│ │ pass fixes to @orch cock▌  │ │
│ ╰────────────────────────────╯ │
│           keyboard             │
```

A tap on a row inserts the chip. Swipe down on the shape or a backspace through the "@" puts it away.

#### States

| Screen | Empty | Loading | Error | Partial | Success |
|---|---|---|---|---|---|
| Find, typing | "No conversations for 'orchestrate fleat'" + "Search inside conversations instead" where no transcript answer came; shown only after the hub answered | Hub lookups under 100 ms show nothing; past `--dur-wait-grace` skeleton rows at row height. "Where it was said" head reads "Searching 3 machines…" with the loop until each answers | "Can't reach the hub. Nothing can be found until it's back. Retry" under the field; rows gone | "Where it was said · 2 of 3 machines answered · macbook didn't · Retry"; rows that came back stand | Rows; the first active; footer hints |
| Peek | A conversation with no report and no moments shows purpose and delegates only | Moments it needs from a machine show "Asking macbook…" in their lines | A machine that cannot answer: "macbook didn't answer · Retry" in the moments slot | As error, with what came | Purpose, last, moments, delegates |
| Waiting for you | "Nothing waits for you" only when every machine answered; the empty recipe with one action, "Open today's conversations" | Skeleton rows until the hub answers | Hub down: as Find | "2 of 3 machines answered · macbook didn't": the list stands with the line at its head and never says "nothing waits" | Rows by kind; seen rows in muted ink |
| Mention | "No conversations for 'orchestrate fleat'" on the line; one more word and it closes, the text stays plain | Candidates come from the hub; under 100 ms nothing shows; past the grace a skeleton row on the line | Hub down: "Can't reach the hub" on the line; the "@" stays text | n/a (candidates are hub-side; no machines are asked) | The chip |

#### Trade-offs

- Tasks, projects, machines, routines, artifacts and decisions are one row deep behind a kind word; Option 2 gives them a scope of their own with their own columns, Option 3 lists them beside conversations.
- Narrowing a transcript answer by who said it or when is done with words in the field, not controls; Option 2 and Option 3 give it controls.
- "Where it was said" arrives after the first rows; a reader who presses ↵ fast gets the hub-side answer, which for T3 is often none. The section head says it is coming.
- The @ list is the full ranked list; Option 2's five-row popup is smaller and faster to scan when the first word already names the conversation.

---

### Option 2: Six questions, one field

**Organizing principle.** The words he types do not say whether he wants a conversation, a moment inside one, something he said, a change on main, what is waiting, or a thing by name (Open Q5). This option makes him say it, once, with a scope he picks before or while typing, and pays him back with a result shape built for that question. Six scopes, named as questions in his words: **Conversations**, **Said**, **Decided**, **Changed**, **Waiting**, **Go to**. It is optimised for T3, T4, T6 and T8, each of which gets columns and filters no mixed list can give, and it sacrifices one decision per lookup. T1 keeps its primacy by being the scope the finder opens in.

**Finding and mentioning are two structures sharing one engine.** The @ popup is a deliberately small inline list (conversations, threads, machines, five rows) for the common case where the first word names it; a "More…" row hands over to the full finder in a mention mode.

#### Screen inventory

| Screen | Job |
|---|---|
| **Finder** (desk: the glass's card, 560 px; phone: a sheet, field and scope chips above the keyboard) | The field, the scope row, the scope's results, a detail strip for the active row. |
| **Conversations** scope | T1. Ranked conversations and threads; the detail strip shows purpose, parent, last report. |
| **Said** scope | T6. His own messages, newest first, with Copy, Send again, Open. |
| **Decided** scope | T3. Moments weighted to decisions and reports, per conversation, with who-said, project and time filters. |
| **Changed** scope | T8. File changes and commits with conversation, workspace, landed, when. |
| **Waiting** scope | T4. Everything that waits, by kind, sort by age or project. No field needed. |
| **Go to** scope | T5. Things by kind and name; a machine's next acts inline. |
| **Mention popup** (slash/@ recipe above the field) | T2. Five rows plus This conversation and More…. |
| **Finder, mention mode** | T2 overflow and T7. Any scope's row inserted as a chip with ⌘↵ or ↵. |

#### Structure decisions

| Decision | Principle or evidence | Alternative rejected |
|---|---|---|
| Scopes are questions, not kinds | T3, T4, T6, T8 are each a different question with a different answer shape (a moment with an excerpt; a thing waiting with its age; his own message with Copy; a commit with landed-or-not). Kind tabs (Sessions, Tasks, Files) would put a decision and the moment it was made in different tabs. | Kind tabs (the default). |
| Opens in Conversations; remembers the last scope per client for the session of use, then returns to Conversations after an hour | T1 is constant. Returning keeps ⌘K-type-↵ meaning "open the conversation" when he comes back cold. | Always opening in the last scope (a stale Changed scope would answer "orch fleet" with nothing). |
| Kind words still switch scope ("previews" → Waiting filtered to previews; "task drift" → Go to; "me brief" → Said) | T4 and T5 needs: his kind words work as asked. The scope row shows the switch, so he learns the chips. | Requiring the chip. |
| The detail strip at the card's foot shows the active row's purpose, parent and last report | T1 "tell it is the right one" without unfolding anything; the list keeps its density. | Peek in place (Option 1) or a side pane (no room). |
| Decided weights his requests, his decisions, reports and summaries; Said is his own words only, injected turns excluded | T3 and T6 needs, verbatim. The "me" filter today counts hooks and reports as his. | One "Moments" scope with a who-said filter (T6's Copy and Send again would clutter decisions). |
| Changed has columns: path or sha, conversation, workspace and branch, landed, when | T8 needs these five for each match; a mixed row cannot hold them. | A reason line under a conversation (Option 1). |
| Waiting is a scope, reachable with ⌘5, by its chip, or by typing a kind word | T4 has no query; a scope with no field is honest about that. It stays inside the finder so it is one ⌘K away. | A separate page; the doorway row (Option 1). |
| The @ popup shows five rows: conversations, threads and machines ranked as the finder ranks them, then This conversation, then More… ⌘K | T2 is daily and usually the first word names it; five rows read in one glance above the field. More… opens the full finder for the long tail. This conversation is offered as the last row, a stance on Open Q4 ("report back here" is an addressing need). | The whole finder in the composer (Option 1); excluding the current conversation (Options 1 and 3). |
| Mention mode: the finder opened from More… (or ⌘⇧M with a composer on the page) makes ↵ insert a chip and ⌘↵ open | T7: tasks, previews, decisions, files and commits are chips from Go to and Changed. One finder, one more mode. | A separate picker per kind. |
| Phone: scope chips as one scrolling row above the field, above the keyboard | Thumb zone; the chips are the only control, 44 pt tall. | Scopes as a top segmented control. |

#### Traceability

| TOM item | Where |
|---|---|
| T1 | Conversations |
| T2 | Mention popup; More… → mention mode |
| T3 | Decided (filters: who said, project, time; coverage at the head) |
| T4 | Waiting |
| T5 | Go to; a machine row's inline acts |
| T6 | Said |
| T7 | Mention mode in Go to and Changed |
| T8 | Changed |
| Narrow by project or time (T3) | Decided's filter row; also words in the field |

Left off this surface: nothing. Reports are rows in Decided (as moments) and in Waiting (unread).

#### Flow

**T1.** ⌘K. The finder stands in Conversations. He types "orch fleet". Rows: the working one, the asleep one, the delegate. The detail strip under the list follows the active row: "Coordinating the find and mention rework · linux · last: report 'options delivered' 9m · 3 delegates". ↵ opens. If the second is the one, ↓ changes the strip to "…macbook · last moved Oct 9 · ended its brief", and ↵.

**T2.** "pass the fixes to the @orch cockpit fleet". The popup stands above the field, five rows, narrowing through spaces. ↵ on the first inserts the chip. If it is not there, ↓ to More… ↵: the finder opens in Conversations in mention mode with the typed words already in its field; ↵ inserts the chip and returns him to the composer, caret after it.

**T3.** ⌘K, Tab to Decided (or ⌘3), "nsenter". The head reads "Searching 3 machines…", then "2 of 3 machines answered · macbook didn't · Retry". Results: "Boundary quiet fix · anbar · delegate · Oct 3" with two lines under it, "report: 'nsenter needs CAP_SYS_ADMIN…'" and "you: 'so nsenter is out…'". He narrows with the who-said filter to Reports. ↵ on the report line opens the conversation at that report.

**T4.** ⌘K ⌘5 (or he types "previews"). Waiting: rows grouped by kind with counts. Sort by Project. ↵ on a preview opens it. Escape back; the row reads seen.

#### Wireframes

**Desk, Conversations** (560 px, `c-find-w`):

```
┌──────────────────────────────────────────────────────────────┐
│ [⌕] orchestrate fleet                                    [✕] │
│ [Conversations] [Said] [Decided] [Changed] [Waiting] [Go to] │
├──────────────────────────────────────────────────────────────┤
│ [working] Orchestrate cockpit fleet    cockpit  yours     2m │
│ [asleep]  Orchestrate cockpit fleet    cockpit  yours     6d │
│ [needs]   Fleet watch nudges           cockpit  delegate 41m │
│ [idle]    Fleet board polish (thread)  cockpit  Caw       1d │
├──────────────────────────────────────────────────────────────┤
│ ▸ Coordinating the find and mention rework · linux · parent  │
│   none · last: report "options delivered" 9m · 3 delegates   │
├──────────────────────────────────────────────────────────────┤
│ ↵ open   ⌘↵ put in message   ⇥ next question                 │
└──────────────────────────────────────────────────────────────┘
```

**Desk, Decided:**

```
│ [⌕] nsenter                                              [✕] │
│ [Conversations] [Said] [Decided] [Changed] [Waiting] [Go to] │
│ [Anyone ▾] [Any project ▾] [Any time ▾]                      │
│ 2 of 3 machines answered · macbook didn't · [Retry]          │
├──────────────────────────────────────────────────────────────┤
│ Boundary quiet fix · anbar · delegate · Oct 3 · asleep       │
│   report  "nsenter needs CAP_SYS_ADMIN inside the ns…"     ↵ │
│   you     "so nsenter is out; use the boundary's own…"     ↵ │
│ Orchestrate cockpit fleet · cockpit · yours · Oct 3 · working│
│   you     "decision: no nsenter, boundary-quiet instead"   ↵ │
```

**Desk, Said:**

```
│ [⌕] brief for the landing                                [✕] │
│ [Conversations] [Said] [Decided] [Changed] [Waiting] [Go to] │
├──────────────────────────────────────────────────────────────┤
│ you · 2d · Landing preview polish · anbar                    │
│   "Brief for the landing: keep the hero at 48px, Nunito…"    │
│                               [Copy] [Send again] [Open]     │
│ you · 9d · Orchestrate cockpit fleet · cockpit               │
│   "brief for the landing delegate: two variants…"            │
│                               [Copy] [Send again] [Open]     │
```

**Desk, Changed:**

```
│ [⌕] jump-index                                           [✕] │
│ [Conversations] [Said] [Decided] [Changed] [Waiting] [Go to] │
├──────────────────────────────────────────────────────────────┤
│ path / commit            conversation        workspace landed│
│ src/lib/jump-index.ts    Search rework       ws-4f2a   no  3h│
│ 5a16bde "jump: rank…"    Search rework       ws-4f2a   no  3h│
│ src/lib/jump-index.ts    Jump palette fix    main      yes 9d│
```

**Desk, Waiting:**

```
│ [⌕]                                                      [✕] │
│ [Conversations] [Said] [Decided] [Changed] [Waiting] [Go to] │
│ 6 waiting · sort [Age][Project] · all 3 machines answered    │
├─ Previews · 2 ───────────────────────────────────────────────┤
│ [preview]  Landing preview     unseen  anbar · Landing… 3h   │
│ [preview]  Jump wireframe      unseen  cockpit · Find…  2d   │
├─ Decisions · 1 ──────────────────────────────────────────────┤
│ [decision] Find and mention shape  2 picks  cockpit · Caw 1h │
├─ Tasks · 1 ──────────────────────────────────────────────────┤
│ [task]     tsk-142 Drift check   waits on you  cockpit   5h  │
├─ Reports · 1 · Proposals · 1 ────────────────────────────────┤
```

**Desk, Go to:**

```
│ [⌕] mac                                                  [✕] │
│ [Conversations] [Said] [Decided] [Changed] [Waiting] [Go to] │
├──────────────────────────────────────────────────────────────┤
│ [machine] macbook · online · 4 running                       │
│           [Start a session here] [See what runs here]        │
│ [project] macos-shell                                        │
│ [routine] mac nightly build · last run failed · next 02:00   │
```

**Desk, Mention popup** (the slash/@ recipe: above the field, matched to its width, growing from its bottom edge):

```
│ ┌────────────────────────────────────────────────────────┐   │
│ │ [working] Orchestrate cockpit fleet · linux · 2m       │   │
│ │ [asleep]  Orchestrate cockpit fleet · macbook · 6d     │   │
│ │ [thread]  Landing copy · anbar · 1h                    │   │
│ │ [machine] macbook · online                             │   │
│ │ [here]    This conversation                            │   │
│ │ More… ⌘K                                               │   │
│ └────────────────────────────────────────────────────────┘   │
│ ╭────────────────────────────────────────────────────────╮   │
│ │ pass the fixes to the @orch cockpit▌         [Send]    │   │
│ ╰────────────────────────────────────────────────────────╯   │
```

**Phone, Finder** (scope chips above the field, both above the keyboard):

```
┌────────────────────────────────┐
│ ▔▔▔▔                           │
│                                │
│ [idle]    Fleet board polish   │
│   thread · cockpit · 1d        │
│ [needs]   Fleet watch nudges   │
│   delegate · cockpit · 41m     │
│ [asleep]  Orchestrate cockpit  │
│   fleet · macbook · 6d         │
│ [working] Orchestrate cockpit  │
│   fleet · linux · 2m           │
│ ▸ Coordinating the find and    │
│   mention rework · last 9m     │
├────────────────────────────────┤
│ ‹Conversations› Said Decided …→│
│ [⌕] orchestrate fleet      [✕] │
├────────────────────────────────┤
│           keyboard             │
└────────────────────────────────┘
```

The detail strip follows the row under the thumb's last tap (a first tap selects and shows the strip; a second opens), so a close call is checkable on the phone too. Waiting on the phone: the chip, or "previews" typed.

**Phone, Mention popup:** the same five rows plus This conversation and More…, standing in the composer grown upward (the recall wheel's shape); More… opens the finder sheet in mention mode and returns to the composer with the chip.

#### States

| Screen | Empty | Loading | Error | Partial | Success |
|---|---|---|---|---|---|
| Conversations, Go to | "No conversations for 'x'" / "Nothing called 'x'" + "Try Decided ⌘3", after the hub answers | Skeleton rows past the grace | Hub down: the shared line under the field; chips disabled | n/a (hub-side) | Rows + detail strip |
| Decided, Said | "No decisions for 'x'" / "Nothing you said matches 'x'" only once every machine answered | Head: "Searching 3 machines…" with the loop; rows arrive per machine on the reflow | A machine that errs: named in the head with Retry | Head names the missing machine; rows stand; never an empty state | Grouped moments |
| Changed | "No changes for 'x'" after the hub answers | Skeleton | Hub down | Hub-side records; n/a | Table rows |
| Waiting | "Nothing waits for you" only with every machine answered, the empty recipe | Skeleton | Hub down | Head: "2 of 3 machines answered"; the list never claims nothing | Grouped rows |
| Mention popup | "No conversations for 'x'" on one row; one more word and it closes | Nothing under 100 ms; a skeleton row past the grace | "Can't reach the hub" on one row | n/a | The chip |

#### Trade-offs

- One more decision per lookup when the words alone do not pick the scope; Option 1 and Option 3 never ask.
- Two surfaces for mentioning (the popup and mention mode): the long tail costs a hand-over.
- The detail strip is one row's detail at a time; Option 1's peek shows the matching moments too, in place.
- The phone's chip row takes 44 pt from the results; on a 567 px desk window the scope row and the filter row leave about 300 px for rows.

---

### Option 3: The ledger you filter

**Organizing principle.** Most of what he looks for moved today or this week (Open Q7, the TOM's assumption), and he recognises it by when as much as by what. So the finder is not a search box with an empty list behind it; it is a ledger of everything in the fleet that has moved, newest first, grouped by day, one row per thing, every kind side by side with its kind glyph, and typing *filters* it in place. There is no relevance ranking to trust or distrust: the order is time, the filter is his words, the columns tell siblings apart. Searching inside conversations is a deliberate second step, taken with one key, that turns the ledger into a moments view and back. It is optimised for T1, T4 and T5 (all three are "find the row and open it"), and for honesty about speed (the slow search is a step he takes, not a section that arrives). It sacrifices the one-box magic for T3 and the chance that a September conversation stands above today's.

**Finding and mentioning are one structure.** The @ popup is the ledger, narrowed to referenceable kinds, in the composer grown upward.

#### Screen inventory

| Screen | Job |
|---|---|
| **Ledger** (desk: the glass's card grown to 720 px; phone: a sheet, field above the keyboard) | T1, T4, T5, T8. Everything that moved, by day; typing filters; filters for project, kind, state, waiting. |
| **Details** (a row unfolded in place) | Purpose, last report, delegates, for a conversation; the task's stage and attempts; the preview's maker and pins. Confirm before commit. |
| **Said inside** (the card's contents replaced in place) | T3, T6. The transcript search run on the current filter words, grouped per conversation, with who-said, project and time filters and coverage. |
| **Mention** (the composer grown upward) | T2, T7. The ledger narrowed to what a message can name; Enter inserts a chip. |

#### Structure decisions

| Decision | Principle or evidence | Alternative rejected |
|---|---|---|
| The unit is any thing that moved, one row per thing, every kind in one ledger | T4 and T5 are about things of many kinds; T1 is about conversations; a ledger of things by time holds all three without groups. The Quiet Ledger is the product's own metaphor (DESIGN.md, Creative North Star). | Conversations only (Option 1), or kind groups. |
| Order is time, grouped Today / Yesterday / This week / Earlier; no relevance ranking | T1: "a conversation that is running now, or that he touched today, should come before one from September". Time does that with no scoring to explain. Working and needs-you rows pin to the head of Today. | Relevance ranking (Options 1 and 2). |
| Typing filters the ledger in place (hub-side, instant); rows that stay slide, rows that leave fold (The Nothing Jumps Rule) | Recognition: he sees the rows he half-remembers reorder under his words rather than a new list appear. | Replacing the list with results. |
| Columns: kind glyph and state, title, project, who started it (yours, delegate, Caw, attempt, routine), state word, age, machine; waiting badges at the row's end ("unseen", "2 picks", "unread", "waits on you") | The TOM's recognisers for a conversation, drawn as columns because the ledger has the width; the Show Don't Tell Rule. Badges make T4 visible on the rows themselves. | Two-line rows (the phone has them; the desk does not need them at 720 px). |
| The Waiting chip narrows to rows carrying a badge, sorted oldest first; "previews" typed does the same for previews | T4 as a filter on the ledger, not a place: what waits is a property of things, and he sees it in context. | A separate Waiting list (Options 1 and 2). |
| Searching inside conversations is one explicit row at the card's foot ("⌘↵ search inside conversations for 'nsenter'") that swaps the card to Said inside and back | Two speeds, made honest: the slow, partial answer is a step he takes, with its coverage at its head, never a section that arrives late under a fast list. | Auto-running the transcript search on every keystroke (a per-keystroke load on three machines for a result he wanted one time in ten). |
| Said inside has filter chips (Anyone, You, Agents, Caw, Reports), a project and a time control, and the coverage line; rows per conversation with excerpts | T3 and T6 needs, with controls. "You" excludes injected turns. | Words in the field only (Option 1). |
| File changes and commits are ledger rows of their own kind, with path or sha, workspace and branch, landed | T8: a commit that landed on main today is a thing that moved today; filtering by path finds it where it stands. | A reason line (Option 1) or a scope (Option 2). |
| The @ popup is the ledger narrowed to conversations, threads, machines, tasks, artifacts, decisions, commits; Today first | T2 and T7 in one shape he already knows; Today first because most hand-offs are to today's delegates. | A five-row popup (Option 2). |
| Desk width 720 px (`c-find-w`), the glass's card tweening its leading edge out as the glass's cards do | A ledger needs columns; 380 px cannot hold them. The Stay In Context Rule keeps it over the page, not on a page of its own. | A Find page. |

#### Traceability

| TOM item | Where |
|---|---|
| T1 | Ledger → filter → ↵ (→ for details) |
| T2 | Mention |
| T3 | Ledger → ⌘↵ Said inside → Reports chip → ↵ at the moment |
| T4 | Ledger → Waiting chip, or a kind word |
| T5 | Ledger → kind glyph rows; a machine's row unfolds Start a session here, See what runs here |
| T6 | Said inside → You chip → Copy, Send again, Open on each |
| T7 | Mention with a kind word |
| T8 | Ledger rows of kind change / commit; filter by path or sha |

Left off this surface: nothing. Reports are rows (kind report, badge unread) and moments in Said inside.

#### Flow

**T1.** ⌘K. The ledger stands, Today on top: his orchestrator (working) and the delegate that needs him pinned first, then today's by last moved. He types "orch fleet"; rows that do not match fold away, the three that do slide up. The columns read: working · 2m · linux; sleeping · Oct 9 · macbook; needs you · delegate · 41m. ↵ on the first. If he is unsure, → unfolds "Coordinating the find and mention rework · last: report 'options delivered' 9m · 3 delegates".

**T2.** "pass the fixes to the @orch". The composer grows; the ledger's Today rows stand in it, narrowing as he types "cockpit fleet". ↵ inserts the chip. A September conversation: he keeps typing until it is the only row, or scrolls the shape down to Earlier.

**T3.** ⌘K, "nsenter". The ledger narrows to nothing named for it: "No conversations for 'nsenter'" with the foot row "⌘↵ search inside conversations for 'nsenter'" now the only row. ⌘↵. The card swaps to Said inside: head "Searching 3 machines…", then "2 of 3 machines answered · macbook didn't · Retry"; rows per conversation with excerpts; he presses Reports; ↵ on the report line opens Boundary quiet fix at that report. ← returns to the ledger with "nsenter" still in the field.

**T4.** ⌘K, Waiting chip (or he types "previews"). The ledger narrows to the six rows with badges, oldest first: a preview unseen 2d, a proposal 1d, a task that waits on him 5h, a preview 3h, a decision 1h, a report 20m. ↵ on one opens it; back, its badge is gone and the row has slid to its place by time.

#### Wireframes

**Desk, Ledger** (720 px, right-aligned under the glass; the page live under it):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [⌕] orch fleet          [All projects ▾] [Any kind ▾] [Any state ▾] [Waiting]│
├─ Today ─────────────────────────────────────────────────────────────────────┤
│ [working] Orchestrate cockpit fleet   cockpit  yours     working    2m linux│
│ [needs]   Fleet watch nudges          cockpit  delegate  needs you 41m linux│
│                                                            · report unread  │
├─ Earlier ───────────────────────────────────────────────────────────────────┤
│ [asleep]  Orchestrate cockpit fleet   cockpit  yours     sleeping Oct 9 mac…│
├─────────────────────────────────────────────────────────────────────────────┤
│ ↵ open · → details · ⌘↵ search inside conversations for "orch fleet"        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Desk, Ledger, nothing typed** (every kind, by day; working and needs-you pinned first in Today):

```
│ [⌕] Filter the fleet…    [All projects ▾] [Any kind ▾] [Any state ▾] [Waiting]│
├─ Today ─────────────────────────────────────────────────────────────────────┤
│ [working] Orchestrate cockpit fleet   cockpit  yours     working    2m linux│
│ [needs]   Fleet watch nudges          cockpit  delegate  needs you 41m linux│
│ [report]  "search rework passed"      cockpit  delegate  unread    20m      │
│ [commit]  5a16bde jump: rank by…      cockpit  ws-4f2a   not landed 1h     │
│ [decision] Find and mention shape     cockpit  Caw       2 picks    1h      │
│ [preview] Landing preview             anbar    delegate  unseen     3h mac… │
│ [asleep]  Landing preview polish      anbar    delegate  sleeping   3h mac… │
├─ Yesterday ─────────────────────────────────────────────────────────────────┤
│ [task]    tsk-142 Drift check         cockpit  Review    waits on you 1d    │
│ [thread]  Landing copy                anbar    Caw       idle       1d      │
│ [routine] nightly tokens build        cockpit  routine   ran · ok   1d      │
├─ This week ─────────────────────────────────────────────────────────────────┤
│ …                                                                           │
```

**Desk, a row's details** (→ unfolds in place):

```
│ [working] Orchestrate cockpit fleet   cockpit  yours     working    2m linux│
│   purpose   Coordinating the find and mention rework                        │
│   last      report · "options delivered" · 9m                               │
│   delegates Search rework (working) · Find options (asleep) · Fleet watch   │
│             nudges (needs you)                                              │
│   ↵ open · ⌘↵ open beside · ← fold                                          │
```

**Desk, Said inside** (the card's contents replaced; ← returns to the ledger):

```
│ [←] Said inside · "nsenter"   [Anyone][You][Agents][Caw][Reports]  [Any project ▾] [Any time ▾] │
│ 2 of 3 machines answered · macbook didn't · [Retry]                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ [asleep] Boundary quiet fix · anbar · delegate · Oct 3                      │
│   report  "nsenter needs CAP_SYS_ADMIN inside the namespace…"             ↵ │
│   you     "so nsenter is out; use the boundary's own…"                    ↵ │
│ [working] Orchestrate cockpit fleet · cockpit · yours · Oct 3               │
│   you     "decision: no nsenter, boundary-quiet instead"                  ↵ │
```

With You chosen, each line gains [Copy] [Send again] at its end (T6).

**Desk, Mention** (the composer grown upward; the ledger's Today first):

```
│        ╭──────────────────────────────────────────────────╮    │
│        │ [asleep]  Orchestrate cockpit fleet   Oct 9  mac │    │
│        │ ─ Today ─────────────────────────────────────────│    │
│        │ [needs]   Fleet watch nudges          41m  linux │    │
│        │ [working] Orchestrate cockpit fleet   2m   linux │ ← on the line
│        ├──────────────────────────────────────────────────┤    │
│        │ pass the fixes to the @orch▌                     │    │
│        │ [Attach]                                   [Send]│    │
│        ╰──────────────────────────────────────────────────╯    │
```

**Phone, Ledger** (two-line rows, day heads sticky, field above the keyboard; chips in one scrolling row):

```
┌────────────────────────────────┐
│ ▔▔▔▔                           │
│ ─ Yesterday ───────────────────│
│ [task] tsk-142 Drift check     │
│   cockpit · waits on you · 1d  │
│ ─ Today ───────────────────────│
│ [preview] Landing preview      │
│   anbar · unseen · 3h       ›  │
│ [report] "search rework passed"│
│   cockpit · unread · 20m    ›  │
│ [needs] Fleet watch nudges     │
│   delegate · 41m · linux    ›  │
│ [working] Orchestrate cockpit  │
│   fleet · yours · 2m        ›  │
├────────────────────────────────┤
│ All projects · Any kind · Waiting│
│ [⌕] Filter the fleet…      [✕] │
├────────────────────────────────┤
│           keyboard             │
└────────────────────────────────┘
```

Today stands nearest the thumb and the list runs upward into the past. A tap opens; › unfolds details. When the filter words match nothing named, the field's line offers "Search inside conversations ↵", and Said inside replaces the list, with ← at its head.

**Phone, Mention:** the same two-line rows in the composer grown upward, Today nearest the field.

#### States

| Screen | Empty | Loading | Error | Partial | Success |
|---|---|---|---|---|---|
| Ledger, nothing typed | "Nothing has moved yet" only with the hub live and every machine answered; the empty recipe offering "Start a session" | Skeleton rows at row height past the grace; day heads stand | Hub down: the shared line; chips disabled | A machine offline: its rows stand as the hub last knew them with its name muted and "offline" in the machine column; no claim of completeness | Rows by day |
| Ledger, filtered | "No conversations for 'nsenter'" with the foot row as the one action, after the hub answers | Instant (hub-side); a skeleton only past the grace | Hub down | n/a | The rows that match |
| Details | A conversation with nothing yet: purpose only | "Asking macbook…" where a line needs a machine | "macbook didn't answer · Retry" in that line | As error | Purpose, last, delegates |
| Said inside | "Nothing said for 'nsenter'" only once every machine answered | Head "Searching 3 machines…"; rows arrive per machine on the reflow | A machine named in the head with Retry | Head names the missing machine; rows stand | Grouped moments |
| Mention | "No conversations for 'x'" on the line; one more word closes it | As the ledger | "Can't reach the hub" on the line | n/a | The chip |

#### Trade-offs

- No relevance ranking: a September conversation is under Earlier until the words make it the only row. Options 1 and 2 can lift it.
- The transcript search costs one extra key (⌘↵) every time; Option 1 runs it for him.
- The ledger with nothing typed is dense: dozens of today's delegates and their reports and commits. It is a ledger, so that is its nature, but a reader who wants calm will type first.
- 720 px on the desk covers most of the page under it at 1055 px wide; Options 1 and 2 leave more of the page visible.
- On the phone the columns collapse to two lines, so machine and who-started-it share a line with the age; the desk's glance becomes a read.

---

## The test: is this the design I would have produced for any app with this many fields?

I drafted, reread, and replaced.

- **Option 1's first draft** was a command palette with kind sections (Projects, Threads, Sessions, Tasks, Moments), each capped, recents when empty. Yes, that is the default for any app with these fields, and it is what the TOM says exists today. Replaced with conversation-as-the-only-unit and the reason-it-matched line, which the TOM's own ranking and object model argue for and no generic palette does.
- **Option 2's first draft** had kind tabs (Sessions, Messages, Tasks, Files). Also the default. Replaced with questions as scopes, each with its own result shape, because T3, T4, T6 and T8 are different questions, not different kinds, and because Said with Copy and Send again, Changed with a landed column, and Waiting with no field at all are shapes a kind tab would never give.
- **Option 3's first draft** was a two-pane finder (list left, preview right), Spotlight's shape. It fits neither the 1055×567 window nor the phone, and it is a default on the desk. Replaced with the ledger-you-filter, which takes the product's own metaphor and the TOM's recency assumption as the structure, and makes the slow search an explicit step.

## Side by side

| | Option 1: The conversation is the answer | Option 2: Six questions, one field | Option 3: The ledger you filter |
|---|---|---|---|
| Unit of result | a conversation, with why it matched under it | the question's own shape | any thing that moved, by time |
| T1 keystrokes after the words | ↵ (→ ↵ to check) | ↵ (strip shows the check) | ↵ (→ ↵ to check) |
| T3 | arrives under the list, then peek | Decided scope, filters | ⌘↵ into Said inside, filters |
| T4 | the doorway row → a list | the Waiting scope | the Waiting chip on the ledger |
| T5 | one Go-to row | the Go to scope | rows of that kind |
| Mention | the same list in the composer | a five-row popup + mention mode | the ledger in the composer |
| Honesty about speed | a section that arrives with coverage | a scope that searches with coverage | a step he takes with coverage |
| Decisions per lookup | none | one (scope), often made by the kind word | none (optionally a chip) |
| Desk width | 520 px | 560 px | 720 px |
| Phone | field above the keyboard, best match nearest | chips above the field | Today nearest the thumb, past runs up |

If asked to lean: Option 1 for the ranking the TOM gives (T1 and T2 are the work), Option 2 if T3 and T8 turn out to be daily with filters, Option 3 if the week's work is what he reaches for and the ledger's density reads as calm to him. The pick is the owner's.
