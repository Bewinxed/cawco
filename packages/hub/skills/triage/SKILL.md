---
name: triage
description: Triage a project's tasks into needs-info, ready-for-agent, ready-for-human or won't do, one batch per wake. Use when tasks arrive without acceptance criteria, when the person asks what is ready, what needs them or to triage, or when a lead wakes with untriaged tasks.
---

# Triage

Every task gets one of four **states**. A state is a label on the task plus the stage it sits in. The stage does the work: the dispatcher starts any task in a stage of kind `todo` whose `after` tasks are done, and Needs you shows every task in a stage of kind `you`. So a task that is not ready for an agent must leave its `todo` stage.

| State | Label | Stage | Before it moves there |
|---|---|---|---|
| needs-info | `needs-info` | the first stage of kind `you` | a comment saying what is established and the exact questions still open |
| ready-for-agent | `ready-for-agent` | the first stage of kind `todo` | a description, `acceptance` as a list, `checks` (or a line on what to check by hand), and a `type` if the project has one for this work |
| ready-for-human | `ready-for-human` | the first stage of kind `you` | the same fields as ready-for-agent, plus a comment on why no agent can do it (a judgement call, an outside account, a manual test) |
| won't do | none | the first stage of kind `dropped` | the reason, given with the move: already built (name where), duplicate (`task_link` with `duplicate_of`), or out of scope |

Read the project's stage names and kinds with `task_read` (no `id`): each stage is listed as `name (kind, …)`.

## One batch per wake

1. **Gather the batch**: every task in a `todo` or `you` stage with no state label, plus every `needs-info` task with a comment newer than its triage notes. Read each with `task_read({ id })`. Done when the batch is listed; an empty batch ends the run with nothing written.
2. **Decide each task's state.** Search the code and the board for the behaviour it asks for, by concept and not only by its words, so an already-built or duplicate task is caught. For a bug, confirm the claim from the code path or a reproduction before calling it ready. A task that needs a real interview gets needs-info, with the questions `grill` would ask first. Done when each task has a state and the reason for it.
3. **Write it.** `task_update` adds the fields the state needs (`acceptance`, `checks`, `type`, `labels`; `labels` replaces the whole list, so send the task's other labels with the one state label); `task_comment` writes the notes; then `task_update({ id, stage, reason })` moves it. When the project's moves refuse a move, the refusal names the moves you can make: leave the stage, set the label, and list the refused move in your summary so the person makes it. Done when every task in the batch carries its label and sits in its stage, or is listed as refused.
4. **Report once**: one line per task (id, state, why) and the refused moves, in your thread reply, your report, or `send_to_user`. Done when the summary is sent.

The person overrides any state at any time. When they name a state for a task, apply it and fill in only what that state requires.

Comments use this shape for needs-info:

```
Established so far:
- …
Still needed from you:
- <a specific question with the options>
```
