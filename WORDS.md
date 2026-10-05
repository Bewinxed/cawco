# WORDS.md — Voice, tone, and terminology for Caw&Co ("CawCo")

**UI wordmark:** “Caw&Co”, set in the landing's Nunito Variable face. Product names in sentences, page titles and notices remain “CawCo”.

**Date:** 2026-08-21 · **Status:** confirmed
**Doctorate authority:** `content-design` (design-for-ai 4.2.0) — voice/tone per Podmajersky (2019), error
formula per Yifrah (2017), plain language per Redish (2007), destructive confirmation per Nielsen
#5 (1994) and the microcopy-patterns catalog. **Pairs with DESIGN.md** (visual tokens, LOCKED) and
**JOURNEY.md** (structure). This is the *words* half of the same design: where DESIGN.md pins colour,
type and shape to strict tokens, WORDS.md pins every user-facing string to a voice and a terminology.
Companion to DESIGN.md — the same "calm is a budget" discipline, applied to language instead of hue:
structure register by default, expressive only at the named moments (see §Tone map).

**Reader:** anyone writing or reviewing user-facing copy in this product — page specs, mocks,
component strings, error messages, empty states, button labels, Telegram messages. If a string is not
governed by a row below, it does not ship.

---

## Voice chart

The register is **calm structure** (DESIGN.md §Archetype: Data-Dense Professional). The operator reads
this board the way a departure board reader reads a status — under time pressure, scanning for the one
thing that is different, and trusting that a quiet row means a healthy row, not a dead hub. The voice
has to keep that scan honest: it front-loads facts, refuses to inflate severity, and never makes the
operator work to learn whether something is actually wrong.

"Friendly, helpful, clear" is the named anti-pattern and is rejected here: those adjectives constrain
nothing. What follows instead are **four concrete, differentiating attributes**, each with an in-range
and an out-of-range expression and a consequence for the prose.

### 1. **Precise** — names the exact thing, never a category
The operator's decision hinges on *what* is blocked, on *which* machine, with *what* blast radius.
Vague categories are the fast route to a mis-approval.

| | Expression |
|---|---|
| **In range** | "nixbox stopped answering (timeout). It holds its place — Reconnect to resume." |
| **Out of range** | "Something went wrong with a machine. Please try again." |
| **Prose rule** | Concrete nouns over categories; a number beats a word ("3 sessions" not "a few sessions"); the target of a command is named before its effect is asserted. |

### 2. **Calm** — holds steady where a "friendly" voice would gush and a "snarky" voice would needle
Errors and waiting states are where the operator's anxiety lives. This voice does not escalate the
mood; it lowers it by stating what is true and what the next step is.

| | Expression |
|---|---|
| **In range** | "Closed while disconnected, the needs-you count is suppressed — not shown as zero." |
| **Out of range** | "Uh oh! Looks like the fleet is down. 😅" |
| **Prose rule** | No exclamation marks on error or waiting strings (see §Punctuation). No alarm inflation — "critical" is reserved for a genuine un-recoverable failure, never a routine wait. No empty reassurance; calm comes from information, not from "no worries". |

### 3. **Commanding** — tells the operator what to do, in the imperative
This is a control panel, not a conversation. Every failing state names the action that recovers it,
and every button states the act it commits to.

| | Expression |
|---|---|
| **In range** | "Handoff: check the machine, then Reconnect to resume." / "Delete session" |
| **Out of range** | "The system has encountered an error condition." / "Yes" |
| **Prose rule** | Active voice; the imperative for actions ("Approve", "Deny", "Reconnect", "Start session"); button labels parse as [Verb] + [Object]; no "We" framing that centres the product instead of the operator's problem. |

### 4. **Honest** — states uncertainty and irreversibility plainly, with no softening
A false all-clear is the single worst failure this product can produce (JOURNEY.md §Job, the anxiety
force). Where the product does not know, it says so; where an action cannot be undone, it says so in
the confirm, in the serious register.

| | Expression |
|---|---|
| **In range** | "No published price for `hemingw15` yet — the total cannot account for it." / "This cannot be undone." |
| **Out of range** | "We couldn't find that." / "Are you sure you want to do this?" |
| **Prose rule** | Distinguish "no machine has reported" from "reported zero" (they answer opposite questions). Destructive confirmation names the specific consequence and permanence; never a bare "Yes, delete". No blame framing (see §Error formula). |

### Punctuation rules

- **Exclamation marks appear only on a genuine user success** and even then sparingly — the product's
  successes are mostly silent state confirmations, so `Success!` is a banned string outright.
  **Never** inside an error-, warning-, or failure-severity string (Yifrah 2017: the user is already
  stressed).
- **Full stop** at the end of a complete sentence that stands alone. No full stop on a label, a
  button, a chip, a single-line status word, or a hero number.
- **Ellipsis** (`…`) marks an in-progress action ("Syncing…", "Message the agent…") — never
  uncertainty, never a trailing-off thought.
- **Colon and dash** for structure: an error leads with the heading (what happened) then a short
  explanatory sentence — no heading grammar games.

### Contraction rules

- **Contractions are allowed and preferred** in body copy, empty states, and confirmations when they
  keep a line scannable: "doesn't", "can't", "this is the agent's". They read as direct, not
  sloppy, at this register.
- **Avoid "we"** as an agent of the sentence (see §Error formula) and **avoid "I"** for the product;
  when a harness identity is needed, name it ("Claude Code", "the agent").
- **Never contract** a term where precision matters: "cannot be undone" stays two words, and the word
  "not" is never elided into a way that hides a negation in a destructive confirm.

### Humor rules

- **No humor in error, warning, destructive-confirm, or permission-approval copy.** Those registers
  are reserved (see §Tone map). A joke beside a grant the operator is about to make reads as a nudge
  to click it, and a joke beside a failed run reads as dismissal of real cost.
- **The voice is not humorous at baseline either.** This is a calm ledger, not a personality brand.
  Any wit is confined to genuinely neutral, low-stakes, non-action copy (for example an idle assistant
  suggestion) and must never be at the product's or the operator's expense. When in doubt, cut it:
  restraint is the register.

---

## Tone map

Voice is stable; tone shifts with the emotional moment (Podmajersky 2019). The seven moment types,
mapped to what each needs the words to do and how far the voice is allowed to move from baseline.

| Moment type | Tone direction | What the words must do | Reference examples |
|---|---|---|---|
| **First-run / empty** | Welcoming, guiding, low-pressure | State the benefit of the surface and name the single next action; never "No sessions yet." (a dead end) — a first-use empty carries the benefit + a primary action. | "Your sessions will appear here. Start one to see your fleet in one board. → Start session" ; "Nothing is watching yet. Seed a ready-made rule below. → [three one-click templates]" |
| **Success / completion** | Warm, brief, effect-first | Claim the *effect*, not the operation; state what changed. Not celebration. | "`{rule}` is live on every session." ; "Approved — the session resumes." |
| **Error** | Calm, precise, solution-oriented | Follow the error formula: what happened → why → how to fix → what happens next. No "We", no blame, no dead end, no `!`. | "nixbox stopped answering (timeout). The run is paused and holds its place. Handoff: check the machine, then Reconnect to resume." |
| **Destructive confirm** | Serious, specific, no humor or softening | Name the exact consequence and permanence; the confirm button is [Verb]+[Object]. Never "Yes, delete" alone. | "Delete this session? Its transcript and permissions are removed from the fleet. This cannot be undone." → [Cancel] [Delete session] |
| **Waiting / streaming** | Steady, determinate, honest | Show what is countable, never a bare "something is happening"; say what the wait means and that it holds state. | "11 / 17 steps" ; "Running — the caret in place; output streams below the turn." |
| **Permission / approval** | Neutral, honest, no nudge | Give the operator the fact they need to decide safely: the target, its blast radius, what is *not* widened; never subtley push the grant. The register is calm and the grant is not made more attractive. | "This deletes the SvelteKit build cache… recreated by the next build; nothing outside `apps/dashboard` is touched." ; "Approving covers this one command. It does not widen what the agent may run later." |
| **Routine** | Quiet, minimal, structure register | Say as little as the operator needs; a healthy state is stated once and then silent. No personality, no exclamation, no self-congratulation. | "2 of 3 machines online" ; "Showing 8 of 24" ; a status word: `working` / `idle` / `done` / `needs you` / `error`. |

---

## Terminology table

One concept, one term, everywhere. These are the canonical, load-bearing words of the product.

**Why it exists:** the codebase and the mocks let `session`, `run`, `agent`, `subagent`, and
`delegate` drift toward synonymy, and they are **not** the same concept. `delegate` and `subagent`
are distinct in the code (`DelegateBranch.svelte`: *"A delegate is a full fleet instance"* vs
`SubagentBranch.svelte`: *"One subagent's whole run, folded out of the main transcript"*). Mixing them
under a tree that is labeled "subagent / delegate" is exactly the conflation this table exists to end:
a delegate is a *separate settlement* a parent spawned (a whole `session`), and a subagent is a
*child task* folded into the parent's own transcript. Every string must pick the word for the concept
it actually means.

| Concept | Canonical term | Means | Banned as a name for it |
|---|---|---|---|
| One working instance of an AI coding agent on a repo + machine + task (the unit the board lists, `session/[id]`) | **session** | The entity with its own transcript, permissions, and cost. | "run" (when meaning the entity); "agent" (when meaning the entity); "delegate" (when it is not a spawned separate session) |
| A single execution/attempt of a session's active work (bounded by the current turn) | **run** | What streams and can be paused, interrupted, or stopped; the thing with determinate step count. | "session" (when meaning the execution); "job" |
| The AI coding agent that performs the work (the harness identity) | **agent** | Claude Code, OpenCode, or pi — the actor named in the transcript. | "session" (when meaning the actor); "model" |
| A child task an agent spawns inside its own session, folded into the parent transcript as a branch | **subagent** | The collapsed "branch" in the transcript; its tag under the parent turn. | "delegate" (a delegate is a *separate* fleet session, not an in-session child); "branch" as the user-facing label in prose (the word *branch* stays, the label is *subagent*) |
| A separate fleet session spawned by a parent session (a full fleet instance, hub-named `<checkout>#<short id>`) | **delegate** | A whole other session handed a task; reported back to the parent. | "subagent" (a subagent is a child task inside one session); "handoff" as the noun for the entity (allowed as the verb/event) |
| A host running the cawco daemon | **machine** | The roster rows, the offline states, the select-at-spawn type. | "host" in user-facing copy (fine as a network term in the code) |
| The connected collective of machines the operator supervises | **fleet** | The board, the global-nav entry, "the fleet is down". | "cluster", "network" (ambiguous) |
| A standing instruction the hub enforces on every session: what to watch for and what to answer | **rule** | The Rules surface and its rows. | "policy", "permission set" |
| One released version of CawCo | **build** | What a machine runs and what an update installs. | "release" in Configure copy (the release host is a service, not the thing a machine runs) |
| Which builds a fleet follows: Stable (tagged releases) or Nightly (every build of main) | **channel** | The Updates section's two cards. | "track", "stream", "ring" |
| No session working on that machine | **idle** | When a ready build installs by itself. | "free", "quiet" |
| Daily cost against a limit | **spend** (the number) / **budget** (the limit) | The Usage surface's total and threshold. | "cost" when the operator-facing term for the whole surface is Spend/Usage |

**Banned-synonym quick list** (for the gate and for writers): `run` ≡ entity, `session` ≡ execution,
`agent` ≡ entity, `delegate` ≡ in-session child, `subagent` ≡ separate session, "We" as error subject.
The compound noun **"delegate rows"** is legitimate: it names the subset of the board that *are*
delegated sessions (spanning `DelegateRow.svelte`), not a misuse of the term.

---

## Error formula

Adopted verbatim from the doctrine (Yifrah 2017) and the Phase-7 plan constraints:

> **What happened → why (if not obvious) → how to fix it → what happens next**

"**What happened**" and "**how to fix it**" are **always** present. Never a dead end.

- **No "We"** as the subject of an error — the operator's problem is not a product confession. "The
  login on nixbox expired" not "We couldn't read your limits from nixbox".
- **No blame framing** — never "you entered", "you tried", "the run failed because you…".
- **A technical code alone is banned as the sole message.** These errors are mostly *machine-state*
  (hub unreachable, keychain locked, machine offline), which tempts `HTTP 429` / `ETIMEDOUT` / a raw
  upstream string. A code may appear in parentheses as a support reference *after* the plain-language
  what-happened + how-to-fix.
- **Zero `!`** on error/warning/failure severity.
- **State what is safe.** If data or a run was preserved before the error, say so — it lowers the
  operator's anxiety ("the run is paused and holds its place").
- **Inline, near the problem**: an error on a field sits at that field; a machine error sits at that
  machine's rows; a fleet error sits in the connection band that already carries the retry countdown.

**Examples that satisfy it:**

- Machine offline: **"nixbox stopped answering (timeout). The run is paused and holds its place.
  Handoff: check the machine, then Reconnect to resume."**
- Tool errored: **"A tool call failed and cannot be retried as-is. Handoff: the agent re-plans or you
  Redirect it."**
- Agent contested: **"The agent's last turn does not match the intent you asked for. Handoff: the
  transcript marks it contested, and you Redirect it in the composer."**
- Low confidence: **"The agent is under-confident about a step it is about to take. Handoff: it stops
  and asks a question before proceeding."**
- Keychain locked: **"The keychain on nixbox is locked, so I can't sign or decrypt. Handoff: unlock it
  on the machine, then Reconnect."**
- Hub unreachable (connection band): **"Hub unreachable — retrying in 12s. Reconnect now."** (the
  countdown makes it determinate; the board holds its last good rows, so the false zero never renders)

---

## Empty-state formulas

Two formulas, applied by type (Redish; NN/g; microcopy-patterns catalog):

- **First-use empty** → **[benefit of what goes here] + [primary action]** (+ optional what-it-looks-
  like). Never "No sessions yet."
- **No-results empty** → **"No [noun] for '[query]'"** + alternative action — **echoing the query
  verbatim** (so a typo is visible and correctable).
- **User-cleared empty** → acknowledge completion + next action; never reverts to first-use copy.
- **Error empty** → state what should be here + reason + retry action.

The two most load-bearing: an empty fleet board must first assert the connection is live before it may
claim zero (Nielsen #1); and **first-use must be visually and verbally distinct from user-cleared** —
"no machine has joined" and "all clear, nothing running" are opposite answers to the operator's
question. Both appear in the page specs' Empty states and in `mocks/wordcheck.mjs`.

---

## Button-label rule

Every button parses as **[Verb] + [Object]** and stays comprehensible with surrounding text hidden
(Yifrah; Nielsen #2). The destructive confirm's verb is the specific act ("Delete session"), never
"Yes" alone. A button is not "Submit" (mechanism), not "OK" (ambiguous), not "Click here" (pointer).
Allowlisted imperative verbs for the gate: *Start, Create, Add, Save, Cancel, Delete, Remove,
Approve, Deny, Allow, Deny, Reconnect, Retry, Export, Filter, Manage, Open, Stop, Interrupt, Send,
Attach, Refresh, Install, Fetch, Restore, Redirect, Skip, Switch, Check, Configure*. "Continue" is acceptable only where the
next step is already visible in context (microcopy-patterns catalog).

**Composer exception (recorded):** the transcript composer's `<textarea>` carries `aria-label="Message
the agent"` and a placeholder, with no persistent visible label. This matches the messaging
convention (a chat box needs no visual label) and the doctrine's own allowance ("Send — acceptable in
a messaging context"). It is the one form field exempted from the persistent-label rule, recorded so a
reviewer does not "fix" it into clutter.
