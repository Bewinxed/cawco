---
name: seo-brief
description: Turn an SEO topic into a brief and then a draft article, with its search intent, what already ranks, the outline, internal links, sources and the measure to check four weeks after publishing. Use when researching a keyword or topic, writing a content brief, or drafting or refreshing an article for search.
---

# SEO brief

An article moves through the project's stages: topic → brief (the `seo` type) → draft (the `writer` type) → review (the person) → approved → published → measured four weeks later by a routine. The brief is the contract the draft is checked against.

## Steps

1. **Read the task and the site**: the topic, the audience, the site's existing pages on it, the brand kit and voice from the project folder's `knowledge/` (your brief carries them; Caw reads them with `folder_read`). Done when you know which page on the site this article would compete with or link to.
2. **Read the results**: search the topic with the web tools you have and read the top pages whole. Name the intent (learn, compare, buy, fix), what every top page covers, and what none of them does well. Done when you can say in one line why a reader would pick this article over the current first result.
3. **Write the brief** into the task's output file (else `brief.md`): the primary query and its close variants, the intent, the title and meta description, an outline of headings with one line each, the internal links in and out, the sources to cite with their URLs, the word range, and the measure (the query's position and clicks to check four weeks after publishing). Done when every heading has its line and every source its URL.
4. **Hand it on.** Add the draft's acceptance to the task (`task_update` with `acceptance`: follows the outline, cites the sources, within the word range, links as listed) and move it to the draft stage. Inside a work item, `finish_item` instead. Done when the task is in draft with its acceptance.
5. **Drafting** (the writer): write the article against the brief, check each acceptance line, and move it to review. Publishing is an approved action (`action_propose` with `then_stage: "published"`) once the person has approved it.
