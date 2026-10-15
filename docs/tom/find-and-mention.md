# Task & Object Model: finding things across the fleet, and pointing a message at one

Two moments share one need. In the first, the owner stops what he is doing to go and get something: a conversation, a conclusion, a thing he must review. In the second, he is in the middle of writing to one agent and needs to name another thing so that agent can act on it. Both depend on the same question being answered well: *which thing in the fleet does he mean, given the words he remembers it by?*

## Product context

CawCo is one person's control room for a fleet of AI coding agents running on his own machines: a Linux box, a MacBook, and an iPhone app that reaches the same hub. In a day he drives an orchestrator conversation that sends out dozens of delegates, talks to each project's lead (Caw) in threads, and collects tasks, routines, previews, decisions and reports along the way. Most conversations finish their job and go to sleep, but they are not dead. He wakes them later to continue, to send them fixes, or to ask what they concluded. After weeks this is hundreds of conversations, and he does not remember any of them by id. He remembers them by what they were for ("the fleet orchestration one"), by something he said in them, by what came out of them (a preview, a decision, a commit), and by roughly when. He works mostly at a MacBook in Chrome, keyboard first, many times an hour, often mid-thought and in a hurry. He also checks in from the iPhone with one thumb, typing two or three words at most. A lookup that returns the wrong thing is worse than one that returns nothing. He acts on what he lands in, and a message sent to the wrong conversation spends that conversation's context and money on work it was never meant to do.

## User tasks

### T1. Get back into a conversation I know exists, by what it is about
- **Trigger:** He wants to read where it stands, continue it, or give it more work. Usually it is a conversation he started or the orchestrator started today, sometimes one from last week that is asleep.
- **Frequency:** constant (dozens of times a day) (inferred from the daily volume of delegates and his habit of naming sessions by purpose)
- **Success:** One lookup takes him into the right conversation, and before he commits he can tell it is the right one and not a sibling with a similar name.
- **Needs:**
  - To see: its title in the words it was given (his own rename, or the name it gave itself), what it is doing or last did in plain words, its project, whether it is working, waiting on him, asleep or ended, and when it last moved. Who started it (him, the orchestrator, a project's Caw) and which machine it is on come second.
  - To decide: which of several close matches he means. Recency, live state and parentage tell them apart; ids do not.
  - Matching has to work on any words from the title in any order, typed as a phrase with spaces, and on the purpose as well as the title.
  - A conversation that is running now, or that he touched today, should come before one from September whose transcript happens to contain the same words.
  - Asleep conversations count as findable; he continues them as often as running ones.

### T2. Name another conversation, thread or machine while writing a message, so the agent can act on it
- **Trigger:** He is writing to one agent and wants it to hand something to, ask, or report to a specific other one. His own words: "pass the fixes to the orchestrate cockpit fleet session".
- **Frequency:** daily, several times a day (inferred)
- **Success:** What he inserts stands for exactly the conversation he meant. When the receiving agent acts on it (hands off, messages it, wakes it), it reaches that conversation and no other, running or asleep. He never has to leave what he is writing to look up an id.
- **Needs:**
  - To see, while choosing: the same recognisers as T1 (title, purpose, project, live state, recency), so a choice made while writing is as safe as one made deliberately.
  - Typing several words of a title, with spaces, has to keep narrowing the choices instead of abandoning the lookup.
  - Every conversation he could mean is a candidate: running and asleep, his orchestrator, delegates and Caw threads. The candidates cannot be limited to whatever happens to be loaded on this device, or cut down before his words are applied.
  - To decide: between two candidates with the same name. The choice has to make the difference plain (machine, age, state, parent).
  - What lands in his message has to be something the receiving agent and the hub can resolve to one target without guessing. What is inserted should stay readable to him, so he can check the message before sending.
  - It has to work wherever he writes: an ordinary session, a Caw thread, and the iPhone app.
  - Pointing at the conversation he is writing in should not be offered as a target of a hand-off. Whether it is ever useful is unresolved (see Open questions).

### T3. Find where something was decided, concluded or reported
- **Trigger:** He needs to act on, repeat or check a conclusion: what a delegate found about nsenter, where the boundary-quiet fix was agreed, which session decided the shape of a feature.
- **Frequency:** daily (inferred from the ten-query check the orchestrator ran over one day's work)
- **Success:** He lands on the conversation and the moment in it where the conclusion stands, and the result told him enough to pick it out before he opened it.
- **Needs:**
  - Results gathered per conversation, each carrying that conversation's title, project and what it was for, with the matching moment underneath. A run of near-identical lines from one conversation is one result, not ten.
  - Weight given to what matters: his own requests, his decisions, a delegate's final report, the orchestrator's summaries. Tool chatter, file listings, and a delegate's working notes in a scratch folder count for less.
  - Recency counts: today's conclusion beats an older one with the same words.
  - A short excerpt showing why it matched, and a way to go straight to that point in the conversation.
  - A way to narrow by who said it (me, an agent, Caw, a delegate's report) and by project or time.
  - When one machine could not answer, he has to be told its results are missing, so a short answer is never mistaken for a complete one.
  - Nothing he pasted as a secret (a key, a token, a password) may come back as a match or appear in an excerpt.

### T4. See what is waiting for me to look at
- **Trigger:** After a run of delegate work he asks what still needs his eyes: "what other previews do i need to look at" (four times in one day), "uh what about the tasks view dude".
- **Frequency:** several times a day (taken from the owner's repeated asks)
- **Success:** A complete set of what awaits him: previews and other artifacts he has not opened, decisions with picks still to make, proposals to approve, tasks in a stage that waits on him, reports he has not read. Each comes with where it came from, and he can work through it without asking an agent to list it for him.
- **Needs:**
  - To see: what kind of thing each is, its name, which conversation or project produced it, how long it has been waiting, and whether he has already seen it.
  - To decide: which to open first. He sorts by age or by project.
  - The kind words he uses ("previews", "tasks", "decisions") should work as a way of asking.
  - It can never claim nothing is waiting unless that is known to be true. Missing data from a machine is said out loud, as everywhere else in CawCo.

### T5. Go to a specific thing by its kind and name
- **Trigger:** He knows the thing: a project, a task (`tsk-142` or its title), a routine, a machine, a Caw thread, a rule, a preview, a decision. He wants to be at it now.
- **Frequency:** daily
- **Success:** He is there in one step.
- **Needs:**
  - Matching on name, id, or a kind word plus a name ("task drift check", "preview landing").
  - For a machine, the obvious next acts (start a session there, see what runs there) are close at hand.
  - The same reach on the iPhone as at the desk.

### T6. Find something I said before
- **Trigger:** He wants to reuse or quote a request he wrote earlier: a brief, a rule he dictated, a correction he gave an agent.
- **Frequency:** daily (inferred)
- **Success:** His own message comes back, and he can copy it, send it again, or open the conversation it is in.
- **Needs:**
  - Limiting to his own words, which today's "me" filter attempts. Anything injected into the conversation under his role (hook output, reminders, delegate reports arriving as user turns) must not count as his.
  - Recency first.
  - Within one conversation, the composer's own history of what he sent there already covers part of this. Across conversations nothing does yet.

### T7. Point a message at a task, artifact, decision, file or commit
- **Trigger:** While writing, he wants the agent to work from a specific task, preview, decision, file or commit without pasting it.
- **Frequency:** weekly (inferred; not in the owner's words)
- **Success:** The agent receives an unambiguous reference it can open.
- **Needs:** The same choosing as T2, across these other kinds, with each kind told apart at a glance.

### T8. Find which conversation touched a file or landed a commit
- **Trigger:** A change on main looks wrong, or he wants the conversation behind a file's recent change in order to continue it or ask it why.
- **Frequency:** weekly (inferred; recorded as a surviving cross-session question in JOURNEY.md's assistant kill test)
- **Success:** He gets the conversation(s) that changed the file or produced the commit, with when and why, and can open them.
- **Needs:** To match on a path or part of one, a commit message, or a short sha. For each match he needs the conversation, its brief, its workspace and branch, whether the change has reached main, and when.

## Objects

The owner thinks in these nouns. The old code is organised by its data sources: a named list grown from what the browser holds, a full-text index of transcript lines per machine, and a candidate list for `@`. None of those is a noun he uses. Every result, wherever it comes from, should be one of the objects below.

### Conversation (canonical term: session)
- **Recognised by:** its title (his rename, or the one it set for itself); what it was asked to do or is doing; its project; who started it; roughly when; whether it is still going. Almost never by id, directory or machine.
- **Key attributes:** title; purpose (its opening brief, latest report headline, current plan step); project; role (his own orchestrator, a delegate, an attempt at a task, a spin-off, a Caw thread); parent and children; live state (working, needs you, idle, asleep, ended); last activity; machine; harness and model (rarely wanted); the handle the hub resolves (`<dir>#<id8>`).
- **Actions:** open; continue or wake; send a message; name it in another message; hand it work; stop; rename.
- **Relationships:** belongs to a project; has a parent conversation and delegates; holds messages, reports and decisions; produced artifacts, file changes and commits; runs on a machine; may be an attempt at a task.

### Thread (a conversation with a project's Caw)
- **Recognised by:** its title, its project, recency. Caw's own underlying session is never what he means: the thread is.
- **Key attributes:** title; project; whether Caw is working on it; last activity.
- **Actions:** open; write in it; name it from elsewhere.
- **Relationships:** belongs to one project; work it started hangs under it; tasks, decisions and proposals come out of it.

### Message
- **Recognised by:** who said it and the gist; which conversation it was in; when.
- **Key attributes:** author kind (him; an agent's prose; an agent's thinking; tool calls; text injected under his role, such as hooks, reminders, a delegate's report delivered as a turn); conversation; time; whether it is a request, a decision, a conclusion or noise.
- **Actions:** go to it in place; copy it; send it again.
- **Relationships:** belongs to one conversation. Some messages are reports or decisions in their own right (below).

### Report
- **Recognised by:** its headline ("search rework passed", "blocked on X"), which delegate sent it, for which item, when.
- **Key attributes:** headline; outcome (done, failed, blocked); sender; receiving conversation; read or not.
- **Actions:** read it; open the sender; continue the sender.
- **Relationships:** sent by a delegate to its parent about one work item; often names commits, previews or decisions.

### Decision
- **Recognised by:** the question it settles, its project, who wrote it (Caw or a session), whether he has made his picks.
- **Key attributes:** title; options; his picks and notes; state (waiting on him, picked, turned into tasks); origin.
- **Actions:** open; make picks; find where its outcome went.
- **Relationships:** belongs to a project or a conversation's artifacts; produces tasks.

### Artifact: preview, HTML artifact, canvas
- **Recognised by:** what it shows ("the jump wireframe", "landing preview"), which conversation made it, whether he has looked at it.
- **Key attributes:** name; kind; maker; project; seen or unseen; open pins and comments; age.
- **Actions:** open; comment; mark as seen; keep it with the project.
- **Relationships:** made by one conversation; may be kept in a project; may carry a decision.

### Task
- **Recognised by:** its title, its id (`tsk-142`), its project, its stage, whether it waits on him.
- **Key attributes:** title; id; stage and its kind; to-dos left; attempts and their state; age.
- **Actions:** open; move its stage; start an attempt; name it in a message.
- **Relationships:** belongs to a project; has attempts, which are conversations; may come from a decision.

### Routine
- **Recognised by:** its name, what it does, when it runs next, whether its last run went wrong.
- **Key attributes:** name; schedule or trigger; last run outcome; next run; project.
- **Actions:** open; run now; open its last run.
- **Relationships:** belongs to a project; each run is a conversation.

### Project
- **Recognised by:** its name.
- **Key attributes:** name; places (checkouts on machines); whether Caw is on; what is live in it; what waits on him in it.
- **Actions:** open; start a session in it; narrow any lookup to it.
- **Relationships:** holds threads, tasks, routines, decisions, kept artifacts and the conversations run in its places.

### Machine
- **Recognised by:** its hostname.
- **Key attributes:** online or not; what runs on it.
- **Actions:** open what runs on it; start a session on it; name it in a message.
- **Relationships:** hosts conversations and their transcripts. Its transcripts can be searched only while it answers.

### File change and commit
- **Recognised by:** the path or part of it; the commit message; a short sha; the branch; whether it has landed on main.
- **Key attributes:** path; commit message; sha; branch and workspace; landed or not; when; the conversation that made it.
- **Actions:** open the conversation behind it; see the change.
- **Relationships:** made in a workspace by one conversation for one work item or task.

### Kinds of thing he looks for, and what he recognises each by

| Kind | Recognised by |
|---|---|
| Conversation (session, delegate, attempt, spin-off) | title, purpose, project, who started it, when, still going or not |
| His orchestrator | that it is his and what it orchestrates ("orchestrate cockpit fleet") |
| Caw thread | title, project, recency |
| Message | who said it, the gist, when |
| Report | headline, sender, outcome |
| Decision | the question, project, picked or not |
| Preview, HTML artifact, canvas | what it shows, who made it, seen or not |
| Task | title, `tsk-` id, stage, waiting on him or not |
| Routine | name, what it does, last outcome, next run |
| Project | name |
| Machine | hostname, online |
| File change | path, the conversation that made it |
| Commit | message, short sha, landed on main or not |
| Rule (rare) | what it watches for |

## Constraints

- **Two clients, one reach.** The web dashboard in desktop Chrome (keyboard first, ⌘K already opens the jump surface) and the native iPhone app (UIKit, one thumb, text never under 16 pt) must find the same things and resolve the same references. Today the iPhone's jump surface is a port of the web's and its composer has no `@` at all.
- **The design system is fixed.** DESIGN.md tokens only (the source is `design/tokens/cawco.tokens.json`), Solar bold-duotone icons, no indigo. WORDS.md's terms are the names everything is called by in copy (session, delegate, thread, task, routine, artifact, preview, decision, report, machine, project), and so is its no-results formula, which echoes the query verbatim.
- **Where the data lives.** Transcripts stay on the machine that ran them. Each machine keeps its own full-text index (SQLite FTS5, BM25, porter stemming), and the hub asks every machine and waits at most 1.5 s for each (`SEARCH_ANSWER_MS`). Titles, roles, parents, live state, projects, tasks, routines, artifacts and work items live at the hub, not in those indexes. Finding a conversation by its title or purpose is therefore a hub-side lookup, not a transcript search.
- **Partial answers are named.** A machine that did not answer is said to be missing. A result set never claims to be complete or empty when it is not (PRODUCT.md, derived liveness).
- **Secrets.** Single owner on a private tailnet, but what he pasted as a secret must not come back as a match or excerpt. The hub already hides secrets in permission requests before they leave it, so the same expectation applies here.
- **Resolving a name.** A conversation named in a message reaches its target only when the receiving agent passes it to the hub's hand-off tools. Whatever the `@` choice inserts has to be resolvable there unambiguously, or that resolver changes with it.
- **Caw's own lead session is never a target.** His threads stand for him in every list.
- **Cost of keeping the index fresh.** A search brings a machine's index up to date if its last sync is over 10 s old. The background sync every 10 minutes was tuned for disk writes, with measurements recorded in `packages/agent/src/search/index.ts`. A per-keystroke lookup works within that.
- **Accessibility.** Every result is reachable and choosable by keyboard and announced by assistive technology. Coarse-pointer targets are 44 pt (PRODUCT.md).

### What today's code does (evidence for the rework, not a model to keep)

**Jump (web `JumpPalette.svelte`, `jump-index.ts`, `jump-search.svelte.ts`; iOS `Shell/JumpPalette.swift` mirrors it):**
- Two unrelated mechanisms are stacked.
- The first is named rows built in the browser from what it holds: projects, Caw threads, online machines, running sessions, and each machine's stored catalog of past sessions, excluding Caw's lead sessions. They are matched by prefix, then substring, then a loose in-order character match over title plus detail. They are capped per group (8 projects, 8 threads, 8 machines, 10 running, 16 recent) and carry no recency or state weighting.
- The second is transcript hits from `GET /api/search`. It returns single messages: harness, message id, session id, role, timestamp, cwd, model, score and an excerpt. It carries no conversation title, project or purpose. The browser keeps the first hit per conversation, ten conversations at most, and names each by looking its session id up in the catalog it holds, falling back to the folder leaf or the first eight characters of the id.
- An `@me` or `@agent` word narrows the transcript hits by role.

**The index (`packages/jsonl-parser/src/fts5.ts`, `text.ts`):**
- One document per user or assistant record. Indexed: user text, the agent's prose, its thinking (on by default), and tool names. Tool results are not indexed, but text injected under the user role is, so "me" is not only the owner.
- The query is every word as a quoted prefix term, all required.
- Each machine orders by FTS5's plain `rank`. The hub then merges across machines by a different score that weights tool names three times. So the order within one machine and the order across machines come from different scorings.
- Nothing favours recency, the owner's words or conclusions, and nothing redacts secrets.

**`@` while writing (`transcript/Composer.svelte`, candidates in `SessionPane.svelte` 669–710):**
- The `@` choices open only at the start of a word and close on the first space, so a title cannot be typed past its first word.
- Candidates, in order: every Caw thread (inserted as `@thread#<id8>`); then the sessions the browser holds that lists would show, minus the one being written in, cut to the first 40 in whatever order the browser holds them before the typed text is applied (inserted as `@<folder leaf>#<id8>`); then every machine regardless of state (inserted as `@<hostname>`).
- Matching is a plain substring on the inserted handle or the label, at most 100 rows.
- In a Caw thread the candidate list is empty, so `@` offers nothing there.
- `peer.ts` (`matchPeers`, `mentionAt`, `targetsFrom`) is an older addressing helper that nothing imports.

**Where a sent `@handle` resolves (`packages/hub/src/delegation-actions.ts`, `labels.ts`):**
- The hub does not read `@` in a sent message. The text reaches the receiving agent as written, and the reference resolves only when that agent passes it to `handoff` or a sibling tool.
- That resolver drops a leading `@` and tries, in order: the full instance id; a short id of six or more characters (taking what follows `#`); then the folder name, exact first and otherwise containing.
- It searches running and asleep sessions, prefers the caller's own parent when it answers to the name, and refuses an ambiguous name, listing up to 12 candidates by id.
- It never matches a title. A session whose launch folder is unknown is named by its title instead of a folder.
- So `@cockpit#5a167bde` resolves through its short id. A bare title cannot resolve, and `@thread#<id8>` carries a thread id, not a session id, so it is not clear it resolves at all.

## Open questions

1. **Should `@` reach beyond conversations, threads and machines** to tasks, artifacts, decisions, files and commits (T7)? The owner's ask concerned sessions. T7's frequency is a guess.
2. **What should a reference look like once inserted?** Today it is a machine handle (`cockpit#5a167bde`). He might prefer to read the title in his own message while the agent receives the resolvable id. Which one the receiving agent should see is unresolved.
3. **Does a thread reference resolve today?** `@thread#<id8>` looks like it names nothing the hand-off resolver accepts. Unverified live.
4. **Is naming the conversation you are writing in ever useful** (for example, "report back to me here")? Today it is excluded.
5. **Are T1 and T3 one surface or two?** The words he types do not say whether he wants a conversation (T1) or a moment inside one (T3). Both are guesses about one query box. The ranking says T1 comes first.
6. **What counts as "seen"** for a preview or report in T4: opened once, commented on, or explicitly marked? Nothing records it today as far as this reading found.
7. **How far back does he search?** Months of transcripts on three machines, or mostly this week? Assumed: mostly the last few days, but September must stay reachable.
8. **Which secrets need hiding:** only what matches known key and token shapes, or anything he marks? Assumed: known shapes, at index time.
9. **Does the iPhone need T3 and T8 at all,** or only T1, T2, T4 and T5? Assumed all, with T1 and T4 first.
10. **Is `@` from Telegram in scope?** Not mentioned. Assumed no.

---

**Tasks ranked by frequency × consequence**

| Rank | Task | Frequency | Consequence of failure |
|---|---|---|---|
| 1 | T1. Get back into a conversation by what it is about | constant | High: acting in the wrong conversation spends its context and money, and he loses minutes hunting |
| 2 | T2. Name another conversation while writing | daily, many | High: fixes handed to the wrong session, or the lookup comes up empty and he stops to find an id |
| 3 | T3. Find where something was decided or concluded | daily | High: re-deciding, or acting on a stale conclusion |
| 4 | T4. See what is waiting for me to look at | several a day | Medium-high: an unreviewed preview or unmade decision blocks work he is waiting on |
| 5 | T5. Go to a thing by kind and name | daily | Medium: slower navigation |
| 6 | T6. Find something I said before | daily | Low-medium: retyping a brief |
| 7 | T8. Find which conversation touched a file or landed a commit | weekly | Medium: a bad change has no owner to ask |
| 8 | T7. Point a message at a task, artifact, decision, file or commit | weekly | Medium: pasting by hand instead |

The top of the ranking is what this work is for. The owner gives a few words he remembers a conversation by, and gets back that one conversation, live state and all, whether he is opening it or naming it in a message.
