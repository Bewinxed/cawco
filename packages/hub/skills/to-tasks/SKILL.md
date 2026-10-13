---
name: to-tasks
description: Turn a spec, a decision page's picks or the conversation into CawCo tasks, each a vertical slice with blocking edges, acceptance criteria and checks. Use when a spec is agreed, when the person says "make tasks", "break this down" or "file these", or when work must outlive this conversation.
---

# To tasks

A **task** here is a vertical slice: one narrow path through every layer it touches, provable on its own, small enough for one fresh session. Its `after` edges name the tasks that must land first; a task with none can start now. The hub owns the rest (who runs it, the queue, landing), so a task carries only what a fresh session needs to do it and prove it.

## Steps

1. **Read the source whole**: the spec file, the decision page (`artifact_read` with its `id`), or the conversation. Read the project's stages and delegate types with `task_read` (no `id`) and `list_delegate_types`. Done when you can name every part of the spec and where each lives in the code or the project's files.
2. **Cut slices.** Prefactoring that makes the change easy comes first, as its own slice. A wide mechanical change (a rename across hundreds of files) is the one exception to vertical slicing: expand (add the new form beside the old), migrate in batches, contract (delete the old), each step a task `after` the one before. Done when every part of the spec is in exactly one slice.
3. **Give each slice its fields:**
   - `title`: one line, verb first, in the project's words.
   - `description`: the behaviour it makes work, as the person would see it, and where it sits (the spec's path, what lands before it, what waits on it).
   - `acceptance`: a markdown list of what is true when it is done; each line is checkable.
   - `checks`: shell commands that must pass in its workspace (`bun run typecheck`, a lint, a probe). A slice with nothing a command can prove says in `acceptance` what to check by hand.
   - `todos`: the steps inside the slice, one line each. A step that needs its own edge is a slice instead.
   - `after` (tasks it waits for), `parent` (the task it is part of), `related` (no effect on order), `found_in` (the task whose work turned it up).
   - `type`: the delegate type that should run it, when the project has one for this work. `owns`: globs of the files it changes, so overlapping work queues instead of colliding. `lands`: only when it differs from the project's default. `labels`: short and few.

   Done when every slice has acceptance and either checks or a line on what to check by hand.
4. **Show the breakdown** as a numbered list (title, waits for, what it delivers) and ask whether the size and edges are right. Done when the person approves it. A brief that says "file them" counts as approval.
5. **File them, blockers first,** with `task_create`, so each `after` names a real id (`tsk-12`). An edge you find later goes on with `task_link`. Done when every task is filed and its id is in your answer.
   - **Without `task_create`** (a delegate's toolset): send the approved breakdown, fields and all, to your parent with `handoff`; it files them.

Starting the work is the dispatcher's job, or `task_start` when the person asks for one now.
