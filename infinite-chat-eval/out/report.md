# infinite-chat on Claude: every call claude-sonnet-5-5 (effort medium)

Written 2026-10-16 14:58 UTC. Scores are the judge's (claude-sonnet-5-5); answers from another model are left out and listed below. Scope: full.

## end: by probe type

| method | recall | artifact | continuation | decision | correction | **all** |
|---|---|---|---|---|---|---|
| cawco | 2/22 | 6/20 | 13/26 | 8/18 | 9/22 | **38/108 (35%)** |
| cc | 0/22 | 3/20 | 7/26 | 3/18 | 4/22 | **17/108 (16%)** |
| factory | 3/22 | 8/20 | 10/26 | 7/18 | 1/22 | **29/108 (27%)** |
| cc-real | 0/22 | 3/20 | 7/26 | 4/18 | 3/22 | **17/108 (16%)** |
| cc+C-existing | 1/22 | 2/20 | 7/26 | 5/18 | 3/22 | **18/108 (17%)** |
| cc+C-filed | 3/22 | 9/20 | 26/26 | 7/18 | 5/22 | **50/108 (46%)** |
| cc-real+C-existing | 0/22 | 3/20 | 7/26 | 4/18 | 3/22 | **17/108 (16%)** |
| cc-real+C-filed | 3/22 | 9/20 | 26/26 | 8/18 | 5/22 | **51/108 (47%)** |
| tree | 15/22 | 13/20 | 9/26 | 12/18 | 11/22 | **60/108 (56%)** |
| tree-nozoom | 12/22 | 12/20 | 11/26 | 10/18 | 9/22 | **54/108 (50%)** |

## end: by where the evidence sits

| method | carried in at 13:49 | 13:49–18:04 | 18:04–20:32 | 20:32–23:18 | 23:19–00:55 | 00:55–02:49 | **all** |
|---|---|---|---|---|---|---|---|
| cawco | 0/6 | 6/36 | 4/18 | 4/16 | 8/16 | 16/16 | **38/108 (35%)** |
| cc | 0/6 | 0/36 | 0/18 | 1/16 | 4/16 | 12/16 | **17/108 (16%)** |
| factory | 0/6 | 6/36 | 1/18 | 3/16 | 4/16 | 15/16 | **29/108 (27%)** |
| cc-real | 0/6 | 1/36 | 1/18 | 1/16 | 3/16 | 11/16 | **17/108 (16%)** |
| cc+C-existing | 0/6 | 1/36 | 2/18 | 1/16 | 2/16 | 12/16 | **18/108 (17%)** |
| cc+C-filed | 6/6 | 15/36 | 5/18 | 5/16 | 5/16 | 14/16 | **50/108 (46%)** |
| cc-real+C-existing | 0/6 | 1/36 | 1/18 | 1/16 | 3/16 | 11/16 | **17/108 (16%)** |
| cc-real+C-filed | 6/6 | 16/36 | 5/18 | 5/16 | 5/16 | 14/16 | **51/108 (47%)** |
| tree | 0/6 | 20/36 | 7/18 | 7/16 | 11/16 | 15/16 | **60/108 (56%)** |
| tree-nozoom | 0/6 | 14/36 | 6/18 | 6/16 | 13/16 | 15/16 | **54/108 (50%)** |

## end: per probe

| probe | type | cawco | cc | factory | cc-real | cc+C-existing | cc+C-filed | cc-real+C-existing | cc-real+C-filed | tree | tree-nozoom |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 | correction | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| P02 | correction | 2 | 1 | 0 | 1 | 1 | 2 | 1 | 1 | 2 | 2 |
| P03 | correction | 2 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| P04 | correction | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P05 | decision | 1 | 0 | 1 | 1 | 0 | 0 | 1 | 1 | 1 | 1 |
| P06 | correction | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 1 | 1 |
| P07 | decision | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P08 | correction | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 2 |
| P09 | correction | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 2 | 0 |
| P10 | correction | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| P11 | correction | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P12 | correction | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| P13 | correction | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P14 | decision | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| P15 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| P16 | decision | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| P17 | decision | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P18 | decision | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| P19 | decision | 2 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 |
| P20 | decision | 2 | 1 | 2 | 1 | 1 | 2 | 1 | 2 | 2 | 2 |
| P21 | decision | 2 | 1 | 2 | 0 | 2 | 1 | 0 | 1 | 2 | 1 |
| P22 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P23 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P24 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P25 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P26 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| P27 | recall | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 1 |
| P28 | recall | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 2 |
| P29 | recall | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 |
| P30 | recall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P31 | recall | 0 | 0 | 1 | 0 | 1 | 2 | 0 | 2 | 2 | 2 |
| P32 | artifact | 2 | 0 | 2 | 0 | 0 | 2 | 0 | 2 | 1 | 1 |
| P33 | artifact | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P34 | artifact | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| P35 | artifact | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P36 | artifact | 0 | 0 | 2 | 0 | 0 | 2 | 0 | 2 | 2 | 1 |
| P37 | artifact | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| P38 | artifact | 2 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 2 | 2 |
| P39 | artifact | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 2 | 2 | 2 |
| P40 | artifact | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| P41 | artifact | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P42 | continuation | 0 | 0 | 1 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P43 | continuation | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P44 | continuation | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P45 | continuation | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| P46 | continuation | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| P47 | continuation | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 1 | 2 |
| P48 | continuation | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P49 | continuation | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P50 | continuation | 1 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 1 | 1 |
| P51 | continuation | 2 | 0 | 1 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| P52 | continuation | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 |
| P53 | continuation | 2 | 1 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 2 |
| P54 | continuation | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |

## cuts: by probe type

| method | recall | artifact | continuation | decision | correction | **all** |
|---|---|---|---|---|---|---|
| real-cawco-2319 | 5/16 | 3/12 | 4/14 | 2/10 | 6/16 | **20/68 (29%)** |
| replay-cawco-2319 | 5/16 | 5/12 | 8/14 | 2/10 | 6/16 | **26/68 (38%)** |
| real-native-0055 | 4/22 | 4/16 | 1/18 | 3/12 | 8/22 | **20/90 (22%)** |
| replay-cc-0055 | 1/22 | 1/16 | 3/18 | 2/12 | 7/22 | **14/90 (16%)** |

## cuts: by where the evidence sits

| method | carried in at 13:49 | 13:49–18:04 | 18:04–20:32 | 20:32–23:18 | 23:19–00:55 | 00:55–02:49 | **all** |
|---|---|---|---|---|---|---|---|
| real-cawco-2319 | 0/6 | 6/34 | 2/16 | 12/12 | – | – | **20/68 (29%)** |
| replay-cawco-2319 | 1/6 | 11/34 | 4/16 | 10/12 | – | – | **26/68 (38%)** |
| real-native-0055 | 0/6 | 2/36 | 1/16 | 3/16 | 14/16 | – | **20/90 (22%)** |
| replay-cc-0055 | 0/6 | 1/36 | 1/16 | 0/16 | 12/16 | – | **14/90 (16%)** |

## cuts: per probe

| probe | type | real-cawco-2319 | replay-cawco-2319 | real-native-0055 | replay-cc-0055 |
|---|---|---|---|---|---|
| P01 | correction | 1 | 1 | 0 | 1 |
| P02 | correction | · | · | 2 | 2 |
| P03 | correction | · | · | 2 | 2 |
| P04 | correction | · | · | 2 | 2 |
| P05 | decision | · | · | 2 | 2 |
| P06 | correction | 0 | 0 | 0 | 0 |
| P07 | decision | 0 | 0 | 0 | 0 |
| P08 | correction | 1 | 2 | 0 | 0 |
| P09 | correction | 0 | 0 | 0 | 0 |
| P10 | correction | 2 | 0 | 0 | 0 |
| P11 | correction | 2 | 2 | 0 | 0 |
| P12 | correction | 0 | 0 | 1 | 0 |
| P13 | correction | 0 | 1 | 1 | 0 |
| P14 | decision | 2 | 2 | 1 | 0 |
| P15 | recall | 2 | 2 | 1 | 0 |
| P16 | decision | 0 | 0 | 0 | 0 |
| P17 | decision | 0 | 0 | 0 | 0 |
| P18 | decision | 0 | 0 | 0 | 0 |
| P22 | recall | 0 | 0 | 0 | 0 |
| P23 | recall | 0 | 0 | 0 | 0 |
| P24 | recall | · | · | 1 | 0 |
| P25 | recall | 0 | 0 | 0 | 0 |
| P26 | recall | 1 | 0 | 0 | 0 |
| P27 | recall | 2 | 2 | 0 | 0 |
| P28 | recall | · | · | 1 | 1 |
| P29 | recall | 0 | 1 | 0 | 0 |
| P30 | recall | 0 | 0 | 0 | 0 |
| P31 | recall | · | · | 1 | 0 |
| P32 | artifact | 0 | 2 | 0 | 0 |
| P33 | artifact | · | · | 2 | 0 |
| P34 | artifact | 0 | 0 | 0 | 0 |
| P35 | artifact | 0 | 0 | 0 | 0 |
| P36 | artifact | 2 | 2 | 0 | 0 |
| P37 | artifact | · | · | 2 | 1 |
| P40 | artifact | 1 | 0 | 0 | 0 |
| P41 | artifact | 0 | 1 | 0 | 0 |
| P42 | continuation | · | · | 0 | 0 |
| P43 | continuation | 2 | 2 | 0 | 0 |
| P44 | continuation | 1 | 2 | 0 | 0 |
| P47 | continuation | · | · | 1 | 2 |
| P48 | continuation | 0 | 0 | 0 | 0 |
| P49 | continuation | 0 | 0 | 0 | 0 |
| P50 | continuation | 1 | 2 | 0 | 1 |
| P51 | continuation | 0 | 2 | 0 | 0 |
| P54 | continuation | 0 | 0 | 0 | 0 |

## Zoom

- tree answers: 54; zoomed on 39 (72%), 1.09 zoom replies a question, 1.98 lines opened a question
- score when it zoomed: 33/78; when it didn't: 27/30

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

## Refusals (kept: they are the model's own outcome)

- none
- tree nodes left as "(compaction failed)" after the fix rounds: 0

## Answered by another model (left out of the scores)

- none
- tree nodes from another model: 0

## Tokens and cost, from the ledger (`out/ledger.jsonl`)

| phase | calls ok | of them refused | failed attempts | off-model | input | cache write | cache read | output (of it thinking) | cost reported | call-seconds |
|---|---|---|---|---|---|---|---|---|---|---|
| build | 753 | 1 | 3 | 0 | 782,185 | 14,299,834 | 1,105,090 | 1,215,556 (1,100) | $71.03 | 9,150 |
| probe | 6 | 0 | 0 | 0 | 84,838 | 0 | 0 | 15,488 (0) | $0.32 | 98 |
| answer | 757 | 0 | 0 | 0 | 1,514 | 1,002,028 | 10,349,002 | 207,412 (53,647) | $5.62 | 4,336 |
| judge | 207 | 0 | 0 | 0 | 379,894 | 0 | 0 | 36,906 (0) | $1.13 | 909 |
| **all** | 1,723 | 1 | 3 | 0 | 1,248,431 | 15,301,862 | 11,454,092 | 1,475,362 (54,747) | $78.10 | 14,492 |
