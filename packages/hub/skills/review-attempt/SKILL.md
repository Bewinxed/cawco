---
name: review-attempt
description: Review an attempt at a code task against the task's acceptance criteria and checks, line by line, and record the verdict on the task. Use when reviewing a delegate's work, a branch or a pull request for a task, or when a task in a code project moves to review.
---

# Review attempt

A review answers one question per acceptance line: does the change make it true? The task file is the contract (`task_read({ id })`: description, `acceptance`, `checks`, to-dos); the diff is the evidence. Your verdict goes on the task; the person or the lead makes the move.

## Steps

1. **Read the contract and the change**: the task, then the attempt's commits (`git log` and `git diff` from the base branch to its branch or workspace). Done when you can say which files each acceptance line touches.
2. **Run the checks**: every command in `checks`, plus the build, the lint and the type-check the repository uses. Done when each has its exit code and the tail of its output.
3. **Judge each acceptance line**: met, not met or unproven, each with its evidence (a `file:line`, a command's output, or what the running product shows). Then read the diff for what the lines don't name: code paths left half-changed, an old path kept beside the new one, files changed outside the task's `owns`. Done when every line has a verdict and evidence.
4. **Record it** with `task_comment`: the verdict per line, the checks' results, and each defect as `file:line` with what is wrong and what would fix it. Inside a work item, `finish_item` with the same summary. Done when the comment is on the task.
5. **Say what moves next**: all lines met and checks green, it is ready to land; anything else goes back to working with the defects as its new to-dos (`todo_write` with `add`). Leave the move to the person or the lead.
