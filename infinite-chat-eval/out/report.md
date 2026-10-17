# infinite-chat on Claude: every call claude-sonnet-5-5 (effort medium)

Written 2026-10-17 05:55 UTC. Scores are the judge's (claude-sonnet-5-5); answers from another model are left out and listed below. Scope: incremental.

## end: by probe type

| method | recall | artifact | continuation | decision | correction | **all** |
|---|---|---|---|---|---|---|
| tree | – | – | – | – | – | – |
| cc-real+C-filed | – | – | – | – | – | – |
| tree-B | – | – | – | – | – | – |

## end: by where the evidence sits

| method | carried in at 13:49 | 13:49–18:04 | 18:04–20:32 | 20:32–23:18 | 23:19–00:55 | 00:55–02:49 | **all** |
|---|---|---|---|---|---|---|---|
| tree | – | – | – | – | – | – | – |
| cc-real+C-filed | – | – | – | – | – | – | – |
| tree-B | – | – | – | – | – | – | – |

## end: per probe

| probe | type | tree | cc-real+C-filed | tree-B |
|---|---|---|---|---|

## Zoom

- tree answers: 54; zoomed on 39 (72%), 1.09 zoom replies a question, 1.98 lines opened a question
- tree score when it zoomed: 0/0; when it didn't: 0/0

## Incremental builds: the tree filed as the chat goes

The chat: 571 turns over 12.99 hours. $ is the tokens at list price for claude-sonnet-5-5 ($2.0 input, $2.5 5-minute cache write, $0.1 cache read, $10.0 output per MTok; https://platform.claude.com/docs/en/build-with-claude/prompt-caching); the cost Claude Code reported is beside it.

| design | requests | calls | input | cache write | cache read | output (of it thinking) | $ | $ reported |
|---|---|---|---|---|---|---|---|---|
| A | file | 78 | 156 | 664,175 | 6,360,814 | 58,431 (0) | 2.88 | 2.88 |
| A | merge | 54 | 108 | 459,531 | 6,174,182 | 97,093 (0) | 2.74 | 2.74 |
| A | shorten | 10 | 20 | 68,890 | 1,480,067 | 31,117 (0) | 0.63 | 0.63 |
| A | **all** | 142 | 284 | 1,192,596 | 14,015,063 | 186,641 (0) | 6.25 | 6.25 |
| B | file | 369 | 738 | 3,225,416 | 9,088,105 | 205,515 (0) | 11.03 | 11.03 |
| B | fix | 1 | 2 | 3,682 | 28,305 | 160 (0) | 0.01 | 0.01 |
| B | merge | 318 | 636 | 1,076,725 | 8,577,920 | 478,448 (0) | 8.34 | 8.34 |
| B | shorten | 43 | 86 | 215,350 | 1,147,026 | 133,814 (0) | 1.99 | 1.99 |
| B | **all** | 731 | 1,462 | 4,521,173 | 18,841,356 | 817,937 (0) | 21.37 | 21.37 |

| design | built over | $ build | $ a turn | $ an hour of chat | cache read share of prompt tokens | $ an hour with the chat's pauses, 5-minute cache | same, 1-hour cache | $ an hour beyond the chat's own context |
|---|---|---|---|---|---|---|---|---|
| A | 89 of 571 turns, 2.72 h | 6.25 | 0.0702 | 2.29 | 92% | 2.56 | 2.95 | 1.45 |
| B | 423 of 571 turns, 9.53 h | 21.37 | 0.0505 | 2.24 | 81% | 2.32 | 2.97 | 2.24 |

For comparison, the batch tree's build in this ledger: 0 calls, 0 cache write, 0 cache read, 0 output, $0.00 reported.
In A the last column counts only the lines it writes (output) and its merge, shorten and fix requests: the session is the chat's own context, which the chat carries whether or not it files.

- A: built over the first 89 turns only (--a-turns): 3 rewrites, 8 sessions; not answered or judged
- B: built over the first 423 turns only (--a-turns): 12 rewrites, 0 sessions; not answered or judged

## Does the key fact exist in what is carried (no judge)

| carried text | chars | probes whose key string is present |
|---|---|---|
| cawco | 49,530 | 24/54 |
| cc | 12,077 | 12/54 |
| factory | 16,536 | 18/54 |
| cc-real | 8,621 | 11/54 |
| cc+C-existing | 13,069 | 12/54 |
| cc+C-filed | 16,947 | 30/54 |
| cc-real+C-existing | 9,613 | 11/54 |
| cc-real+C-filed | 13,491 | 29/54 |
| tree (view, before any zoom) | 67,022 | 36/54 |
| real-cawco-2319 | 49,389 | 11/34 |
| replay-cawco-2319 | 46,630 | 13/34 |
| real-native-0055 | 15,908 | 12/45 |
| replay-cc-0055 | 12,855 | 10/45 |
| C-filed records alone | 4,868 | 26/54 |

## The tree

- 8,900 nodes (5,001 written by the model), view 173 lines, 67,207 bytes, levels {'0': 48, '1': 17, '2': 18, '3': 19, '4': 18, '5': 17, '6': 19, '7': 17}
- view mean 92,684 B, max 127,996 B; cached share of view bytes per message 99.0%; 19 batch rewrites

Tree nodes left as "(compaction failed)" (a line the model's answer left out after the fix rounds): 0

## Answered by another model (left out of the scores)

- none
- tree nodes from another model: 0

## Tokens and cost, from the ledger (`out/ledger.jsonl`)

| phase | calls ok | failed attempts | of them refused | off-model | input | cache write | cache read | output (of it thinking) | cost reported | call-seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| build-B | 749 | 1,166 | 1 | 0 | 1,504 | 4,713,634 | 19,400,147 | 835,506 (0) | $22.08 | 6,691 |
| build-A | 142 | 3 | 0 | 0 | 284 | 1,192,596 | 14,015,063 | 186,641 (0) | $6.25 | 1,469 |
| **all** | 891 | 1,169 | 1 | 0 | 1,788 | 5,906,230 | 33,415,210 | 1,022,147 (0) | $28.33 | 8,160 |
