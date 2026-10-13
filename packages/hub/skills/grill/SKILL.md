---
name: grill
description: Interview the person, or a brief, until the work has a spec. Use before planning anything bigger than one task, when a request is vague, when the person says "grill me" or asks you to stress-test a plan or idea, or when a task has no acceptance criteria.
---

# Grill

Interview until there is a **spec**: what gets built, every decision behind it, and how each part is proven done. Hold the decisions as a **design tree**: each decision opens the ones that hang off it. The **frontier** is every open decision whose prerequisites are settled.

Facts are yours to find; decisions are the person's. Look up anything the code, the project's files (AGENTS.md, DESIGN.md, `stages.md`, earlier specs) or `task_read` can answer before you ask. A sweep too wide to read yourself goes to a `delegate` with the question; ask the rest of the frontier while it runs.

## Steps

1. **Read what exists.** The request, the task (`task_read` with its `id`), the files it touches, the project's words. Done when every question you are about to ask is one no file answers.
2. **Ask one question at a time**, the most upstream decision on the frontier first, your recommended answer first:

   ```
   **<Decision>**: <the question, and the options when there are some>

   Recommended: <your answer, and the one fact behind it>
   ```

   Wait for the answer. Each answer moves the frontier; recompute it before the next question. When the person names a term two ways, or one way that clashes with the project's words, ask which they mean and use that word from then on. Done when the frontier is empty: every branch visited, nothing assumed in silence.
   - **Grilling a brief** (no person in the conversation, such as a delegate's brief or a task file): answer each question yourself from the sources, and list the ones no source settles as open questions for whoever sent it.
3. **Read the spec back** in a few lines and get the person's yes. Done when they confirm it is what they mean.
4. **Write the spec where the project keeps specs**: the folder its earlier specs are in; Caw, with no files of his own, writes `specs/<name>.md` with `folder_write`; a session outside any project keeps it with `todo_write({ spec })`. It holds the problem in the person's words, each decision with its reason, what is out of scope, and how each part is proven (a command and its expected output, or what to check in the running product). Done when the file is written and its path is in your answer.
5. **Offer `to-tasks`** to turn the spec into tasks. Work that fits one task needs no more than its spec; say so instead.
