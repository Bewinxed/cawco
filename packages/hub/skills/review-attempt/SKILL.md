---
name: review-attempt
description: Review an attempt at a code task against the task's acceptance criteria and checks, line by line, and record the verdict on the task. Use when reviewing a delegate's work, a branch or a pull request for a task, or when a task in a code project moves to review.
---

# Review attempt

A review answers one question per acceptance line: does the change make it true? The task file is the contract (`task_read({ id })`: description, `acceptance`, `checks`, to-dos); the diff is the evidence. Your verdict goes on the task. When the project's review stage runs you, your verdict is the task's move; otherwise the person or the project's conversation makes it.

## Steps

1. **Read the contract and the change**: the task, then the attempt's commits (`git log` and `git diff` from the base branch to its branch or workspace). Judge from the thing itself (the diff, the running page, the frames at its URL), with **a fresh eye**: the builder's plan, report and reasons stay unread until your findings are formed. Done when you can say which files each acceptance line touches.
2. **Run the checks**: every command in `checks`, plus the build, the lint and the type-check the repository uses. Done when each has its exit code and the tail of its output.
3. **Judge each acceptance line**: met, not met or unproven, each with its evidence (a `file:line`, a command's output, or the frame of the running product it comes from, quoted). Then read the diff for what the lines don't name: code paths left half-changed, an old path kept beside the new one, files changed outside the task's `owns`. Done when every line has a verdict and evidence.
4. **Record it.** As the task's reviewer, in a work item that runs in the project's review stage: call `task_result` with `summary` (your review in a few sentences) and `verdict`, one line per acceptance line by its place from 1, each with its `evidence`:
   - `met`: the evidence that shows it.
   - `unmet`: what is missing, said so the next attempt can act on it as a to-do.
   - `owner`: whether it holds is the owner's to say by the project's Who decides (a Look, Behaviour or Scope question). Put that question on a decision card first (the `decision-page` skill) and name it in `card` as `<page>#<card>`. An Approach, Rules or Tools question is not his: judge it yourself.

   Then `finish_item` with the same summary; it refuses until the verdict is in. In any other review, record it with `task_comment`: the verdict per line, the checks' results, and each defect as `file:line` with what is wrong and what would fix it, then `finish_item` with the same summary inside a work item. Done when the verdict or the comment is on the task.
5. **The move.** When the project's review stage runs you, the verdict is the move, and the hub makes it as you finish: every line met closes the task with its lines ticked; any `owner` line sends it to the owner's stage, waiting on its card; otherwise any `unmet` line sends it back to working, each unmet line a to-do, and starts its next attempt. Move nothing yourself. In any other review, say what moves next: all lines met and checks green, it is ready to land; anything else goes back to working with the defects as its new to-dos (`todo_write` with `add`), and the person or the project's conversation moves it.
