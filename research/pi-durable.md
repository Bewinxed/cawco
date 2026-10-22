# Pi Durable: facts for the Workflows decision

Researched 2026-10-22. Facts and quotes only; no recommendation. Items marked **[inference]** are mine, not a source's.

Short names for sources:

- **README**: https://github.com/earendil-works/pi/blob/main/packages/durable/README.md
- **POST**: https://earendil.com/posts/pi-durable/
- **SPEC**: https://github.com/earendil-works/pi/blob/main/packages/durable/docs/spec.md
- **CHANGELOG**: https://github.com/earendil-works/pi/blob/main/packages/durable/CHANGELOG.md
- **TALK**: https://piindex.dev/talks/pi-durable/ (Mario Zechner & Armin Ronacher, 2026-10-05)
- **VERCEL-PI**: https://vercel.com/docs/agent-harnesses/pi
- **VERCEL-HARNESSES**: https://vercel.com/docs/agent-harnesses
- **VERCEL-CC**: https://vercel.com/docs/agent-harnesses/claude-code
- **CF**: https://developers.cloudflare.com/agents/harnesses/pi/
- **PI-AGENTS**: https://github.com/mavam/pi-agents (docs under `docs/`, read from raw.githubusercontent.com)
- **PDS**: https://github.com/purboo/pi-durable-subagents, https://pi.dev/packages/pi-durable-subagents
- **TEMPORAL**: https://temporal.io/blog/the-immortal-life-of-pi-running-the-pi-coding-agent-on-temporal

## 0. What it is

Pi Durable is a TypeScript library, not a service or a CLI. You call `Harness.open(storage, { models, registry, env })` inside your own process, and it runs agent conversations over that storage.

- README: "A durable agent harness. Conversations, model turns, tool calls, and your own state are committed to storage before anything is shown. If the process dies mid-turn, reopening the storage picks the work up where it stopped."
- POST: "It does not replace the Pi coding agent. It is a framework for building any agentic application, coding agents included."
- POST: "A harness is storage plus the machinery needed to run one or more conversations with large language models in parallel."
- Model access is only through pi-ai. README: "Built on `@earendil-works/pi-ai` for model access and `@earendil-works/chord` for document state."
- TALK, on why the engine is part of the harness: "that's why we decided for Pi Durable to actually make it a durable workflow engine itself ... it also allows you to build your own tasks that run inside this scheduler and durable scheduler for your own application."

## 1. Version, license, cadence (item 7)

`npm view @earendil-works/pi-durable --json`, run 2026-10-22:

- latest `1.4.0`, published 2026-10-21T22:44:09Z.
- license `MIT`.
- created 2026-09-19. 17 versions in about 33 days: 0.0.1, 0.86.0 to 0.99.2 (Sep 19 to 30), 1.0.0 (Oct 1), 1.0.1 to 1.0.4, 1.1.0 (Oct 7), 1.2.0 (Oct 12), 1.3.0 (Oct 15), 1.4.0 (Oct 21).
- maintainers: mitsuhiko, badlogic, rwachtler.
- The pi repo's latest commit when cloned: 2026-10-22T11:43:08+02:00.

Status and API stability:

- README, top: "> **Experimental.** The API changes without notice between releases."
- POST: "Pi Durable is experimental, and the API might still change."
- CHANGELOG 1.4.0 has a "Breaking Changes" section in a minor release: "`TaskRuntime.sleep()` is removed". Also: "A migrated database cannot be opened by 1.3.0 or earlier, so a deployment cannot roll back past this release." Also: "`defineDoc()` and `defineDocFamily()` require an explicit `checkpointWhen` predicate on every definition; there is no default."
- CF: "`PiHarness` is in beta. Pi Durable is a new, experimental package, and the `PiHarness` API will likely change as Pi Durable matures."
- TALK: "we are actually betting on this for all of our Earendil products going forward."
- TALK, on API maturity: "I have high confidence that this kind of low-level API that we now have is a good primitive pending some plus and minuses."
- TALK: "some sugar on top of it, specifically with regards to state management, is probably a good idea."

## 2. What is durable (item 1)

What is committed (README, Concepts): a Conversation is "a transcript of immutable entries". A Commit is "an atomic write ... can append entries, edit documents, and create tasks together; either all of it is stored or none of it." Built-in documents hold the agent choices (`pi.agent`), the running generation and tools (`pi.live`), the queued submissions (`pi.inbox`) and the spend (`pi.usage`). A Task is "a durable state machine that saves a checkpoint at every step". A Submission is "something you hand to a conversation, either user input or an entry to write, which you can wait for."

Crash behavior:

- POST: "every step of a run is a task that stores a checkpoint before it moves on. If the process dies, a new process opens the same storage, finds the unfinished tasks, and continues each one from its last checkpoint."
- Model request: POST: "A model request that was cut off is sent again; the partial answer stays in the transcript, marked as aborted."
- Tool call: POST: "A tool call that was cut off reruns if it is safe to; otherwise the model is told it was interrupted."
- README: "If the process dies mid-call, the tool reruns on reopen only when it is declared `replay: "safe"`; otherwise the model gets an `interrupted` error result with the output committed so far."
- Submissions: POST: "A `requestId` makes a submission exactly-once, so a client that retries after a crash gets the original submission back instead of asking twice."
- Partial output: README: "Partial answers and tool output are committed at most every 100 ms by default, so a crash loses at most that window."
- Crash loops: README: "Once the count reaches `settings.restartLimit` (default 5 ...) the task is parked", with `harness.retryTask(id)` to run it again.

What does not survive or is not covered:

- The outside world. TALK: "the harness also operates on an external environment ... The only way to make this part durable as well is to have some kind of [idempotency key]". And: "File systems don't work like this unless you have like a snapshotting file system."
- Execution environment. VERCEL-PI: "Pi's `env`, where its tools run, isn't saved with the session."
- Storage durability. README: "SQLite: ... commits survive process crashes; the newest may be lost on power or host failure."
- Code. POST: "Conversations store extension and tool names, never code, so after a restart they pick up whatever the new process installs."
- Tasks whose definition is missing after a restart are blocked, not lost. README: "pending tasks of an extension's `tasks` resume once it is installed."

## 3. Waiting (item 2)

For a run to wait days, there are three mechanisms. None is a signal or external-event primitive.

**Time.** A task can sleep to a timestamp.

- README, "Sleeping and Waking Up": "A task waits for time by ending its phase asleep. The sleep is stored, so the task holds no invocation meanwhile, survives restarts, and resumes at the checkpoint once the Harness clock reaches `until`".
- POST: a background task fits "a reminder that fires tomorrow".
- Sleeping is new in 1.4.0 (2026-10-21): CHANGELOG, "Durable sleeps: a sleeping task holds no invocation, survives restarts, and resumes at its checkpoint once the Harness clock reaches `until`."
- SPEC 5.6: "A sleep cannot be woken early except by an abort."
- The process must be alive, or be woken by the host. README: "A host whose process can be evicted, such as a Cloudflare Durable Object, wakes it itself. With `onWake` ... The host keeps its alarm armed and calls `resume()` when it fires". In a Node process the default timer "keeps a Node.js process alive meanwhile" (README, same section).

**A person or another client.** Input goes into the conversation's inbox.

- README, "Busy Conversations": "Submitting to a busy conversation queues the submission in the conversation's inbox". `whenBusy` is `"steer"`, a follow-up (the default) or `"reject"`. A `write` appends an entry "without asking the model anything".
- An idle conversation is not a blocked task. A new submission starts a new run.
- A tool or hook that blocks on a person can store the answer in a memo so a restart does not ask twice (POST, Approval hook): "After a restart, the hook finds the stored answer instead of asking again." The example's `askInSlack(call)` is user code.
- There is no built-in approval step. CF, Limitations: "**Approvals.** Pi Durable has no approval or permission step for tool calls yet."
- TALK: "tool approvals are largely gone", but also "you could not really suspend the agent at this point in time and say like, hey, we need to figure out if we can go ahead or not and then continue from there."

**Another task or agent.** A task can wait on other tasks with no code running.

- README, "Child Tasks": "`waiting`: the task runs no code while it waits. With `allSettled` it resumes once every task in `on` is done; with `failFast` the first failed child also aborts the others."
- Subagent results come back as messages. README, example 23: "Each message is delivered by a background reporter task that posts the answer back to the parent as a follow-up input once it arrives".
- I found no primitive like "wait for external event X" (a webhook or signal that wakes a sleeping task). Per SPEC 5.6 a sleeping task is only woken by time or abort. An outside event would have to arrive as a `submit()` to a conversation, or be polled by a task that sleeps and rechecks. **[inference]**

## 4. Multi-agent (item 3)

Pi Durable has no subagent primitive. POST: "Pi Durable has no built-in subagents, but they take a few lines of code to build". A subagent is a tool that creates a child conversation owned by the calling tool task:

- README: "A conversation can be **owned** by a task. A subagent tool creates its child inside `api.commit()` with `ownership: { kind: "task", taskId: api.taskId }`, then drives it through `api.conversation(id)`".
- Ownership gives structured cancellation. README: "Aborting the call aborts the child ... The parent is idle only once the child is."
- Background subagents: "A task created with `{ background: true }` is a boundary: work it owns survives the parent's abort and does not keep the parent busy."
- Each conversation has its own agent. POST: "A reviewer next to the main agent can use a cheaper model, read-only tools, and its own checkout."
- Result passing is a transcript entry read from the child. POST (triage example): "The answer is an entry in the subagent's transcript. Read it and take its text." In the background pattern it is a follow-up input posted to the parent.
- Steering and stopping live is built in. POST, "Multiplayer": `thread.submit({ ..., whenBusy: "steer" })` — "The message joins the running work after the current tool calls." `conversation.abort()` stops it.
- README, example 23: "persistent subagents behind one `subagent` tool that spawns, messages (steer or follow-up), waits for, stops, and lists them." These are shipped as example code in `test/examples/`, not as library API.
- Graphs and named agents live in third-party packages built on pi-durable (section 8): PI-AGENTS ("Durable, named agents for Pi: delegate tasks, compose agents into graphs, and watch them work"; "Watch any agent live, talk to it, or stop it").

## 5. Multiple surfaces and humans (item 4)

POST, "Multiplayer": "Everything a UI needs is committed state, so any number of clients can attach to any conversation in the harness. A client gets the current view first ... After that it only gets what changes. A client that joins late or reconnects starts from the current view. Any client can steer a running conversation or queue a follow-up."

- The API is `conversation.viewState()`, `watch()` ("delivers the exact operations of every commit, small enough to send over a socket") and `watchEvents()` (coding-agent style events).
- Inputs can carry an author. README: an input can carry `entry: { kind: "chat.mention", data: { author: "ann", ... } }`.
- Per-conversation tool sets: "the Slack thread from earlier ... may search but not deploy" (POST).
- It is an API, not a server. There is no built-in transport, identity or permissions layer. README: "One process owns a storage at a time; there is no cross-process locking." POST: "other clients attach to that process."
- A third-party review says the same, not an official statement. https://stackness.dev/blog/what-is-a-durable-agent-harness-pi-durable-pi-1-0-and-the-slot-it-takes-in-an-agent-stack lists "Several people on one run: In the API, with no transport or auth".
- Cloudflare's wrapper adds clients. CF: "`PiHarness` does not choose how clients reach a session. It gives you each session's event stream, and you send it over WebSockets, HTTP, or RPC." CF lists an event-replay limit: "Event streams always start from a snapshot. There is no cursor to resume a stream from."
- On Vercel, a second client takes over the session instead of sharing it. VERCEL-PI table: "Steering | Steering from another request takes the session over". Reconnect: "The stream resends the response in progress from its start."

## 6. Storage and bring-your-own (item 5)

README, "Storage" table:

| Backend | Notes (README) |
| --- | --- |
| Memory | "Nothing is persisted." |
| IndexedDB | "Browser-only storage in one IndexedDB database." |
| SQLite (`openNodeSqliteStorage`) | "One database file. WAL mode with `synchronous = NORMAL`" |
| JSONL (`openNodeJsonlStorage`) | "Append-only files ... Keeps the whole history in memory too ... use SQLite for long-running agents." |
| Cloudflare Durable Object | "The SQLite storage of one SQLite-backed Durable Object" |

- A host can supply its own backend. POST: "The storage interface is small and easy to implement on top of whatever you have, like a key-value store or Postgres." README: "Custom backends can run the shared conformance suite" via `registerStorageConformance`. SPEC section 10 is the storage contract.
- SQLite tables can be namespaced to share a database with host tables. README: "pass `{ prefix: "pi_" }`" and "To share the database with host tables, create an adapter and use it for both Pi and all host queries".
- Application state can sit beside the transcript. POST: "Documents are typed JSON stored next to the transcript and changed in the same atomic commits".
- Vercel has implemented a custom backend: VERCEL-PI: "`durable-harness/pi-durable` ... runs Pi 1.0's `Harness` ... on a storage in the log, so each of Pi's commits is an event in the log." It is self-hostable on a Workflow SDK "World", for example Postgres.
- Single-writer limit, from a competitor: TEMPORAL: "Pi Durable's built-in persistent backends have one process owning storage at a time, with no cross-process locking ... Recovering on another machine requires access to the surviving storage and a new process to reopen it."

## 7. Harness scope (item 6): own agent loop only

Pi Durable runs its own agent loop. It does not drive Claude Code or OpenCode as steps.

- README: "A built-in generation task calls the model and appends the answer." Model access is "Built on `@earendil-works/pi-ai`". The loop is pi's: `pi.generation` and `pi.tool` tasks (README, Concepts).
- POST: "It shares not only code with the Pi coding agent, like pi-ai, but also its principles".
- A repo-wide grep of `packages/durable/src` and the README for `claude` and `opencode` finds only one hit. It is the OpenCode attribution header in `HarnessOptions.identity`. There is no adapter for another harness.
- A tool can run any program. `bash` is a built-in tool, and `env.exec([...argv])` runs a program without a shell. A tool could therefore spawn `claude -p` or `opencode` as a replay-unsafe tool call and report its output. Pi Durable would then treat that as an opaque effect: it would not see inside that agent's turns, steering or transcript, and a crash would report "interrupted" to the model rather than resume the inner session. **[inference from README tools and replay rules]**
- Pi Durable can run custom non-agent tasks. README, "Child Tasks" and POST "Tasks": `defineTask` with phases, checkpoints, sleeps, child tasks and abort handlers. This is general durable-workflow machinery, independent of models. A workflow whose steps are "run a CLI" is expressible as tasks. **[inference]**
- The Vercel `durable-harness` package is a different thing and covers other harnesses. VERCEL-HARNESSES lists "Claude Code (experimental) | `durable-harness/claude-code` | A Vercel Sandbox" and Codex, OpenCode, fx and eve. VERCEL-CC: "Your function only drives it: the Claude Agent SDK sends the CLI its messages and reads what it streams back." Its recovery rule for Claude Code is different from Pi's: "Claude Code, Codex, and OpenCode tell the model it is safe to repeat. Other interrupted calls come back to the model as possibly run." It pins one SDK version. It is Vercel's product (`vercel-labs/durable-harness`), not part of pi-durable.
- Third-party stack comparison (https://stackness.dev/blog/what-is-a-durable-agent-harness-pi-durable-pi-1-0-and-the-slot-it-takes-in-an-agent-stack): "Claude Code and OpenAI Codex cloud sessions keep running with the laptop closed but do not document mid-run recovery."

## 8. Packages built on it

**pi-agents** (third-party, author mavam, MIT, 0.38.0 published 2026-10-22; https://pi.dev/packages/pi-agents?name=earendil-works). It is a Pi extension, not a standalone engine.

- Architecture (docs/architecture.md): "Agents run inside your Pi process on pi-durable, using your Pi logins and models."
- "a thin bridge from Pi to pi-durable" (README diagram).
- Agents are Pi conversations in a Pi process, with Pi's built-in tools only. README caution: "Agents can't use MCP servers ... or tools from other extensions ... They work with Pi's built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, and `codemode`."
- Graphs (docs/graphs.md): "Within that group, `after` edges form a dependency graph". "Edges carry final messages; there are no references, schemas, loops, or conditions." Limits: "One call starts at most 12 agents. Each agent may spawn at most 24 children over its entire lifetime", nesting "at most three levels deep".
- Results pass as one final message: "Only the agents nothing waits for contribute to the group's result, sent as one message to Pi or to the agent that spawned it."
- Live control (docs/usage.md): `agent_send` "prompt, steer, queue a follow-up, or interrupt its work first"; `agent_stop`; `agent_wait`; "Esc | Interrupt a working agent". Agents "survive crashes and restarts."
- Durability scope (docs/architecture.md): "Agents belong to the Pi session that started them. Quitting, crashing, or switching sessions pauses them. Resume the original session ... to continue interrupted work". Also: "Pending results aren't lost, but can arrive more than once after a crash if Pi hadn't saved them".
- Messaging (docs/messaging.md): "Agents can't message the parent, agents in another Pi session, or agents outside their reach."
- Terminal UI (panel, `/agents`, `/messages`) is part of the package.

**pi-durable-subagents** (third-party, author purboo, MIT, 1.2.0, updated 2026-10-19; https://pi.dev/packages/pi-durable-subagents). It does **not** use `@earendil-works/pi-durable`.

- README and package.json contain no reference to `@earendil-works/pi-durable`.
- It uses an "orchestrator" and "real subagent pi processes" with its own journals: "It runs a three-step writer → reviewer → integrator workflow through the real product (a real pi main session, the orchestrator, real subagent pi processes and a scripted model)."
- It needs "pi 1.0.x and Node.js 22.19 or later".
- Waiting for a person: "A subagent waits for an answer for a long time | It releases its model slot and memory, then resumes exactly once when you answer."
- Shell steps and wakes: `subagents({ command: ["npm", "test"] })`, and "`run --wake caller -- …`".
- Workflow scripts: `subagents({ workflow: "./batch.js", args, usageBudget })`.
- Not supported: "external CLI agents, missions, schedules, intercom, `acceptance` policies (use `gate`), and nested subagents."
- A different package of the same name exists: https://pi.dev/packages/@xian0x5a/pi-durable-subagents ("Durable Pi agents that collaborate asynchronously under explicit Owner and Spawner supervision", transcripts as durable authority, humans answer via `ask_user` in the TUI). I did not read it beyond the pi.dev search excerpt.

## 9. Hosting integrations

**Vercel** (VERCEL-PI):

- Two variants. "`durable-harness/pi-durable` (recommended) runs Pi 1.0's `Harness` ... `durable-harness/pi` runs Pi's agent loop, `Agent` from `@earendil-works/pi-agent-core`".
- "Each step waits for the log, so turns are slower."
- Takeover: "A request that opens a session takes it over."
- Tool environment: "Give Pi's tools a workspace, not your function ... Use `virtualEnv()` ... or `sandboxEnv()`, the session's Vercel Sandbox."
- Crash recovery uses Vercel Queues: "the queue redelivers the turn once its message lease runs out, and the turn resumes from the log."
- VERCEL-HARNESSES labels only Claude Code and Codex "(experimental)"; the Pi page itself does not repeat the experimental label.

**Cloudflare** (CF):

- "this page shows how to run Pi Durable in a Cloudflare Durable Object with `PiHarness` from the Agents SDK". Beta.
- Wake-up is a heartbeat job: "the job's heartbeat alarm fires every 30 seconds. A crashed object restarts on the next heartbeat."
- Limits, from its Limitations list: no approvals; "Pi Durable cannot delete a conversation yet."; "one model request that streams for more than 15 minutes can be cut off."
- Session handle API: `submit`, `prompt`, `steer`, `abort`, `reset`, `setModel`, `messages`, `events`, `sessions.fork`.

## 10. Comparisons in the sources' own words (item 8)

**Temporal** (the Pi Durable authors, TALK):

- On replay: "In temporal or Absurd, you kind of pretend you're writing a box standard JavaScript program. And it just will magically pick up from where you left off". "You have to replay ... it requires a journal of everything and it reruns the entire code ... One of the biggest criticisms of Temporal is that versioning is just terrible."
- What Pi Durable does instead: "Pi Durable gives you a tree of tasks. And each task is self-contained."
- Why an external engine does not suffice for them: "durable workflow engines are great, but unless the agent harness actually really supports them well, that's not enough." And: "for durability to work, everything that needs to be durable in one step needs to be atomically persisted. And if you have this outside of the agent ... that really doesn't quite work."
- On engine size: "the workflow scheduler is like 1,200 lines of code that you can actually read and understand."
- Premise argument: "agents are writing their own code ... the trade-off now is less to make it friendly for a programmer by abstracting it away, but to make it a lot more explicit ... There is a lot less hidden magic in durable than there is in temporal or Absurd."
- Temporal's side (TEMPORAL, a vendor blog): "If you work at Temporal, that list reads like our own docs." The difference it names: "who takes over when the host fails ... Automatic failover across our Worker fleet is what we wanted Temporal to provide." It built `pi-temporal`, a fork of Pi where Temporal drives execution, and also points to a "Temporal Agent Harness" that "includes recovery within a turn and tool approvals that can pause for a human decision."
- Third-party table (https://redreamality.com/blog/pi-durable-agent-harness-durable-execution/, a blog, not an official source): long waits and signals are "timers + platform alarms" for Pi Durable versus "strong (Signals)" for Temporal. "For 'wait three days for approval, then fulfill,' this layer often fits better than an agent harness."

**Effect** (TALK, which is the engine CawCo's workflows use today): "Effect.js are out-of-the-box ... exactly zero for durable execution." "There's Effect.js workflow ... They call tasks activities and it's basically the same thing, except you also inherit all of Effect.js and we didn't want to make that."

**Inngest and Vercel Workflow:** no source from Earendil, Vercel or Cloudflare compares Pi Durable with either one in its own words. The only mention of Inngest is the third-party redreamality table, where the claim is that "Restate, DBOS, and Inngest memoize finished steps ... you still decide how agent turns, tool failures, and forks map onto steps." Vercel's relationship is as a host: Pi Durable's storage is implemented on the Workflow SDK's "World", and VERCEL-PI says "If the app also uses the Workflow SDK, wrap both".

**Claude Code's own workflows:** no source compares them. The closest is the third-party stackness table on durability of cloud sessions, quoted in section 7.

## 11. Spec deep read: tasks, ownership, abort, tools, storage, outside waits

SPEC section numbers below, from `packages/durable/docs/spec.md` at pi commit `db774055e3ec` (2026-10-22). Sections 5 and 7 were read whole, plus 2 (records, `HarnessOptions`, public surface), 4, 6 (first half), 10, 10.1 and 13. Unread parts are in section 12.

### 11.1 What a task's checkpoint holds

- A task is `TaskRecord { id, conversationId, kind, version, input, owner?, background, abortRequested, abortReason?, abandonOnRestart?, startedAt?, endedAt?, restarts?, state, memos? }` (SPEC 5.1). `state.checkpoint` is the task's own typed state `S`, and every `S` has a `phase` string; the phases map is "exhaustive and phase-narrowed".
- Quote (5.1): "each durable checkpoint is a full replacement". `runtime.commit()` "replaces the task's state in the same commit, so the checkpoint or outcome is atomic with the callback's entries, documents, and child tasks".
- State machine: `pending | running | waiting (checkpoint, on, policy) | sleeping (checkpoint, until) | completing (outcome) | terminal (outcome)`. Outcomes: `completed | failed | aborted | orphaned | faulted`.
- Memos are separate from the checkpoint (5.2): "small first-writer-wins values stored in the live task envelope ... Memos survive checkpoints and disappear in the terminal replacement. Bulk progress belongs in a document."
- Progress is enforced (5.1, rule 6): a phase that returns without changing the checkpoint is a fault: "Checkpoint unchanged: write terminal `faulted` because no durable progress was made."
- The terminal record "is the durable result receipt" (5.3): it can carry a small `result` or an entry ID; the checkpoint and memos are dropped; documents scoped to the task are retired.
- Effect sandwich (5.2): "Reopening in an intent phase means the effect may have happened. The phase handler retries safely, polls an external handle, or records interruption."
- Versioning (5.4): a task definition has `version` and an optional `migrate(input, checkpoint, fromVersion)`. A missing, too-old or failing definition leaves the task "blocked" (`missing_task`, `task_too_old`, `migration_failed`), never terminalized. "The Harness never terminalizes a task merely because registry code is missing or incompatible."
- Crash-loop guard (5.4): `restarts` counts crash cut-offs; at `settings.restartLimit` (default 5) the task is parked until `retryTask(id)`.

### 11.2 How abort and cancellation propagate

- Protocol (5.4): "commit abortRequested / signal and join active run invocation / wait until ordinary owned work is no longer live / start a fresh abort invocation / abort handler commits terminal outcome".
- Direction (5.5): "**Abort flows down**": a live owner's cancellation intent (its abort mark, or a held non-`completed` outcome) marks its ordinary owned work. "**Abort order is bottom-up.** An abort invocation of a task starts only once its ordinary owned work is no longer live, so an abort handler sees final outcomes below it."
- Finish rule (5.5): "**Owned work does not outlive its owner's finish.**" A task that commits terminal while owned work is live is stored as `completing` and becomes `terminal` only when that work has drained. "A terminal receipt guarantees that the task's ordinary owned work drained; background work below it may continue." (5.4)
- The abort handler decides the outcome (5.1 example): "The abort handler decides the outcome; returning without one faults the task." An abort handler cannot sleep, cannot return `waiting` and cannot create owned children (5.5, 5.6).
- A task whose code is missing is settled `orphaned`, not `aborted` (5.4): "`aborted` means the task's own abort handler ran and decided the outcome, while `orphaned` means no task code ran, so external effects the task started may remain uncleaned."
- Who can abort what (2.2 and 5.4):
  - `Harness.abortTask(id)` returns `"marked" | "terminal"` and "does not await terminal settlement"; `waitForTask()` observes the receipt.
  - `Conversation.abort()` "withdraws queued input submissions, marks non-background tasks selected by ordinary ownership traversal ... Passive writes and background subtrees survive." `{ background: true }` crosses background boundaries.
  - Cancelling a Context only cancels the wait: "Cancelling one caller's `Context` only cancels that call or wait; it does not durably abort shared work".
  - Cancelled conversations under the cascade have their queued inputs set `unanswered` with reason `aborted`; queued writes stay. The cascade "starts below the cancelled task, so that task's own conversation keeps its queue."
  - `close()` is not an abort: "Close writes no task outcome; it writes the tasks it stopped back as `pending`". "A host that must durably cancel everything aborts each live task that `inspect()` lists."
- `failFast` joins (5.5): the first task in `on` that ends or is held non-`completed` gives every other live task in `on` an abort mark; the waiting task itself "resumes once all of `on` is terminal and reads their outcomes with `runtime.outcomes()`".
- Restart abandonment (5.4): a task created with `abandonOnRestart` gets an abort mark with `abortReason: "restart"` when a later process starts scheduling. Tools that are not replay-safe get this automatically for their nested calls and child tasks.
- Limits stated in the spec: "forced termination of non-cooperative extension code inside one process" is a non-goal (13). "A tool that ignores its abort signal keeps the session busy until it returns" is the same limit stated on Cloudflare's page (CF, Limitations).

### 11.3 Who owns a child conversation

- Types (2): `ConversationOwnership = { kind: "ownerless" } | { kind: "task", taskId }`. A `ConversationRecord` has `parent? { conversationId, at }` for history and `owner? { conversationId, taskId }` for ownership.
- Quote (2): "Conversation history parenting and task ownership are separate: `parent` controls inherited entries and historical documents. `owner` records task attribution and connects scopes for subtree abort and idle traversal. It is not an access-control capability."
- Ownership is explicit and immutable. "Creation always supplies `ConversationOwnership` explicitly." (2). "Owner edges are immutable." (5.5). "Host callers must choose ownerless or task ownership; neither the Harness nor a conversation handle infers ownership from call context." (2.2)
- A tool creates a child in its commit (7.3): "One transaction creates or forks the child; the owner edge is its durable record, so a replay-safe rerun finds the child with `scanConversations({ ownerTaskId })` before creating one."
- A new task-owned child starts as a copy of the owner's stored agent (2.2): "A new task-owned conversation gets a copy of the stored `pi.agent` of the owner task's conversation, every field, `instructions` included. A later change to the owner does not reach the child." A new ownerless conversation gets `{}`.
- The owner must be live (5.5): "`createTask` with task ownership and `createConversation` with task ownership reject an owner that is `completing`, `terminal`, or abort-marked".
- Conversations outlive their owners (5.5): "Conversations stay usable after their owner finished: new runs started there, for example to interrogate a finished subagent, are ordinary work of that conversation ... and not part of any finish." "A terminal owner never cascades."
- Foreground pattern: the child is owned by the tool call's own task, so aborting the call aborts the child (7.3).
- Background pattern (7.3): a background conversation-owned "anchor" task `A` is created that "completes at once"; the child conversation `C` is owned by `A`. "Its record keeps `background`, so the parent's ordinary abort and idle traversal stop at it, while `Conversation.abort(context, { background: true })` still reaches `C`'s work through it, and `Harness.waitForIdle()` does not wait for it."
- Idle is judged by traversal (2.2): "Harness idle applies the same traversal from every ownerless conversation root". "Conversation idle means no live non-background task selected from that conversation."
- Usage: "A tool that runs an owned conversation must not report that conversation's spend again: the child's own `pi.usage` already counts it" (7.3).

### 11.4 How a host supplies tools and storage

**Tools** (SPEC 7.1, 7.3):

- Tools come only through an application-owned registry of extensions, "process-local, may outlive a Harness, and is not persisted". An extension bundles `tools`, `sections`, `hooks`, `wraps` and `tasks`; `registry.install(extension)` installs or replaces by name "in one publication".
- The Harness reads the registry through `RegistryReader<Tool> { snapshot(), subscribe() }`, which `HarnessOptions.registry` takes (2.2). A host can supply its own reader instead of `createRegistry()`, but "a host `RegistryReader` whose `snapshot()` throws" fails the Session (10.1).
- Conversations store names only: "It stores only what someone chose for the conversation: extension and tool names, never code" (2.2).
- A tool is `defineTool({ name, description, parameters (TypeBox), replay?: "safe" | "unsafe", executionMode?, structuredOutputSchema?, callers?, outputLimits?, execute(args, api, context) })`. Omitted `replay` is `unsafe`. `execute` gets `api` with `commit`, `memo`, `createTask`, `waitForTask`, `conversation`, `executeTool`, `env`, `output`, `details`, `now`.
- Execution environment (2.2): `HarnessOptions.env(target { conversationId, cwd, read }, context)` builds a conversation's environment at each use. An application keeping "more than a directory per conversation keeps that in its own document and reads it through `target.read`" (the spec's example picks a container per conversation).
- Replay on reopen (7.3): "a tool reruns only when both its stored intent policy and the current declaration ... say `safe`. A current `unsafe` declaration may veto a stored-safe replay".
- Models come from the host too: `HarnessOptions.models` is the pi-ai `Models` object, or a function returning the current one (2.2).
- Hosts can also add their own durable tasks (`extension.tasks`), hooks on the built-in tasks (`beforeRequest`, `afterResponse`, `onYield`, `afterTools`, `beforeTool`, `afterTool`, `beforeCompact`) and application documents (`defineDoc`, `conversationCreated` hook).

**Storage** (SPEC 10, 4, 10.1):

- A backend implements `Storage`: `commit(writes[], context) → Seq` (atomic), `mintId()`, scan and lookup methods for conversations, entries, tasks, submissions and documents, and `close()`. Writes are typed records plus `document.create | copy | change | retire`.
- Contract details: "Each backend still makes one admitted batch atomic." "Allocate from the one global numeric namespace, above every ID minted or stored before, also across reopen". The Session owns the mutation line, "so storage implementations do not add a second caller-facing commit mutex".
- Failure rule (10.1): "**A storage error ends the Session.** ... Neither the Session nor the Harness retries anything: a Storage retries its own transient failures inside the method."
- Conformance (10): "The semantic conformance suite covers memory, SQLite, and JSONL." A host runs it against its own backend with `registerStorageConformance` (README).
- Single writer (2.2, 7.5): "Old and new Harness instances must never own the same Session concurrently: open the new one after the old one's `close()` resolved".
- `Session.commit(tx => ...)` is public: a host app can write entries, documents, tasks and submissions through the same atomic commit path (4).

### 11.5 Can a step wait on something outside pi other than by a `submit()`?

The spec settles the model as follows. A task waits on time or on other tasks; neither is an external event. External input reaches a running process through submissions, document writes and host-created tasks. No primitive resolves a parked task from outside.

What a parked task can wait on:

- `waiting`: "a task in `on`" being terminal. Tasks the waiting task does not own need `policy: "allSettled"` (5.5). `on` can name any live or finished task.
- `sleeping`: the clock reaching `until` (5.6). "A sleep cannot be woken early except by an abort."
- Only tasks change their own state: 5.1, "`Tx` has no task replacement operation. A task changes only its own state, through its runtime." "Other code stops a task with `abortTask()` and reads its result with `waitForTask()`." There is no "complete this task from outside", no signal and no external resume token.

What a running invocation can do (holds the process, rerun from the top after a crash):

- Await any promise in a phase handler or a tool's `execute()`: "External model, process, tool, network, and human effects run outside [the mutation line]." (4). A tool that blocks on a person is a replay-unsafe, or replay-safe-with-memo, tool. For a decision it must keep stable across a rerun, "Random values, timestamps, mutable document/configuration reads, or other derived inputs that must remain stable are first captured in a durable memo, checkpoint, or task input." (7.3)
- Observe documents. `TaskRuntime`, `ToolExecutionApi` and `Session` all extend `DocumentObserver` (`documentState`, `snapshot`), and a hook or tool can read committed documents. The spec lists "observe documents for which it has a token/reference" among what a tool may do (7.3). Watches acquired through the runtime "stop when the invocation ends" (5.1).
- A host can therefore write an external pick or event into a document (or an entry, or a new task) with `harness.commit()`, and a task invocation that is alive and observing it sees it. A task that has ended its phase `sleeping` or `waiting` has no invocation and is not woken by that write. **[inference from 5.1, 5.6]**

What an outside system can do to reach a Harness (2.2, 6):

- `Conversation.submit({ type: "input" | "write", ... })`: an input starts or joins a run (`steer`, follow-up, `reject`); a write appends an entry without asking the model. Both are idempotent by `requestId`.
- `Harness.commit()` to write documents, create tasks, append entries.
- `Harness.abortTask()` and `Conversation.abort()` as cancellation signals.
- `wake()` plus `resume()` after the host's own alarm fires; this is the host's job for any process that can be evicted (5.6).

Consequence for a "wait for a person's pick on a page, or another system's event" step. **[inference]**

- Durable and process-free: a task that sleeps and re-checks a document on each wake, or a host-side dispatcher that creates a new task or submits an input when the event arrives.
- Process-held: a tool or phase that awaits a promise or a document watch while the process lives.
- Not provided: an engine-level "park until signal X" that holds no process and wakes on an outside call.

### 11.6 The two packages named pi-durable-subagents (kept explicit)

| | `pi-durable-subagents` (npm, 1.2.0) | `@xian0x5a/pi-durable-subagents` |
| --- | --- | --- |
| Source | https://github.com/purboo/pi-durable-subagents, https://pi.dev/packages/pi-durable-subagents | https://pi.dev/packages/@xian0x5a/pi-durable-subagents, https://github.com/xian0x5a/pi-durable-subagents |
| Description | "Subagents for pi that never lose work and never do it twice. Crash-safe workflows, automatic recovery, and a live view just like the main agent." | "Durable Pi agents that collaborate asynchronously under explicit Owner and Spawner supervision." |
| Built on `@earendil-works/pi-durable`? | No. Its README and `package.json` do not mention it. It runs its own orchestrator and journals with real `pi` subprocesses ("real subagent pi processes"). | Not established. Its pi.dev excerpt says "Pi transcripts are the durable authority for identity, Messages, Requests, Deliveries, and committed results" and "Scheduling queues, Holds, live Run state ... are volatile". Pi 0.99.0 or newer. I did not read its README whole. |
| Waiting for a person | Its README table row for a long wait reads: "It releases its model slot and memory, then resumes exactly once when you answer." | `ask_user` in the TUI blocks one free-form answer; headless runs escalate to a supervisor instead. |
| Author | purboo | xian0x5a |

Neither is from Earendil. Neither is `pi-agents`, which is a third package (mavam) and the only one of the three documented to run on `@earendil-works/pi-durable` ("Agents run inside your Pi process on pi-durable", docs/architecture.md).

## 12. Sources I could not read or read only in part

- `https://cdn.jsdelivr.net/npm/pi-agents@0.38.0/docs/{usage,graphs,messaging,architecture}.md`, the links on the pi.dev page. All four returned `Target returned 404 Not Found` ("Couldn't find the requested file /docs/usage.md in pi-agents."). I read the same files from `raw.githubusercontent.com/mavam/pi-agents/main/docs/`. I did not read `profiles.md`, `configuration.md`, `hooks.md` or `design.md` of pi-agents.
- SPEC (`docs/spec.md`, 303,145 characters), updated in the second pass: read whole were sections 5 (Tasks, 5.1 to 5.6) and 7 (Extensions, hooks, tools, system prompt, reload, code mode), plus section 2 (records, 2.1, 2.2 except lines 520 to 670 of the file, the `Conversation` interface), 4, 6 (first half), 10, 10.1 and 13. Not read: 3 (Documents), 6 (second half), 8 (built-in tasks), 9 (document observation and views), 11 (backends), 12 (API footguns), the `Conversation` interface block in 2.2. A shell hook blocked my reading of CRW's saved copy (`Blocked: memory and fleet config are written through CawCo's tools, never by editing files under ~/.claude ...`), so I read a shallow `git clone` of `earendil-works/pi` at `db774055e3ec` in scratch instead.
- The README was read whole (68,793 characters, in slices).
- `test/examples/*` and `packages/coding-agent/src/experimental/{durable,vacation}`: only the header of example 23 read. Claims about examples come from the README's example table and prose.
- `https://www.npmjs.com/package/pi-durable-subagents`: CRW returned 105,430 characters, which I did not slice. I used the pi.dev search excerpt and the cloned repo's `README.md` instead; I read the install, comparison, table and "Not supported" parts and did not read all ~1,300 lines of it.
- `@xian0x5a/pi-durable-subagents`: read only the pi.dev search excerpt.
- `https://vercel.com/docs/agent-harnesses/{opencode,tools,security,self-hosting}`: not read.
- Cloudflare's `/agents/harnesses/pi/extensions/` and the Pi 1.0 post (https://earendil.com/posts/pi-1-0/): not read.
- No Hacker News thread was read; the Temporal post links one (https://news.ycombinator.com/item?id=49926686), and I only have its one-line quote from that post.
- Third-party blogs (stackness.dev, redreamality.com) are read as Exa excerpts only, not whole pages.
