# Compaction benchmark

Written 2026-11-03T00:49:26.136Z. Cuts: 24 (2 chained). Runs: 420 done, 6 stopped. Noise floor: 0.75 (the larger of Nous's 0.3 and the 95th percentile of A0-vs-A0 spread, 0.75).

## 0. Cut points

Seed 1; eligible 256 (+68 chained pairs); drawn 24. Shortfall: 100-300k: 0 chained pairs of 2; 300-600k: 0 chained pairs of 2.

| stratum | value | in the pool | drawn |
|---|---|---|---|
| band | 100-300k | 45 | 8 |
| band | 300-600k | 76 | 8 |
| band | 600k+ | 135 | 8 |
| kind | continued | 8 | 6 |
| kind | moved | 151 | 14 |
| kind | native-midturn | 97 | 4 |
| next message | agent | 140 | 15 |
| next message | person | 74 | 8 |
| next message | resume | 42 | 1 |
| role | delegate | 14 | 0 |
| role | orchestrator | 242 | 24 |
| move | cross-org | 15 | 3 |
| move | same-org | 136 | 11 |

Excluded 2148:

| kind | reason | n |
|---|---|---|
| moved | fewer than 10 turns after the cut | 870 |
| moved | the transcript ends before the move | 229 |
| moved | the session's transcript at the move is not on this host | 228 |
| moved | its directory is not a git repo on this host | 175 |
| moved | context below 100k | 96 |
| native-midturn | fewer than 10 turns after the cut | 83 |
| moved | the next message is cawco's own (ui.system_note) | 70 |
| moved-compacted | the next message is cawco's own (ui.system_note) | 60 |
| moved | another move already cut here | 54 |
| moved-compacted | fewer than 10 turns after the cut | 49 |
| moved | the session went on after the move with no new message | 39 |
| continued | fewer than 10 turns after the cut | 36 |
| native-midturn | its directory is not a git repo on this host | 23 |
| native-midturn | the next message is cawco's own (ui.system_note) | 21 |
| native-midturn | context below 100k | 15 |
| moved | the next message is cawco's own (user.rule) | 12 |
| native | the next message is cawco's own (ui.system_note) | 12 |
| native-midturn | the next message is cawco's own (user.rule) | 12 |
| native-midturn | no turn start before the mid-turn compaction | 10 |
| continued | no turn after the opening | 10 |
| continued | the ended conversation's transcript is not on this host | 9 |
| continued | its directory is not a git repo on this host | 7 |
| native | fewer than 10 turns after the cut | 6 |
| continued | the next message is cawco's own (ui.system_note) | 5 |
| moved-compacted | context below 100k | 3 |
| native | context below 100k | 3 |
| continued | the next message is cawco's own (user.rule) | 3 |
| continued | no instance_conversations row ends at this event | 2 |
| continued | the next conversation's transcript is not on this host | 2 |
| moved | no next message | 1 |
| continued | context below 100k | 1 |
| native-midturn | no CawCo instance for this session | 1 |
| native | no CawCo instance for this session | 1 |

## 1. Decision table

| situation | band | default | setting |
|---|---|---|---|
| warm, same org | all | native at turn end | `compactAtPct` = 99.5 |
| cold / cross-org / no cache | < floor | move whole | `moveWholeUnderK` = 177k-177k: whole cheaper below, summarize above (E6) |
| cold / cross-org / no cache | 100-300k | E1: A4 summarize · Sonnet · full-clipped · CawCo (not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75); among A0 (8 cuts), A1 (8 cuts), A2 (8 cuts), A3 (8 cuts), A4 (8 cuts), A5 (8 cuts) with both readings | `overFloor` = summarize |
| limit gone early | 100-300k | E1: A4 summarize · Sonnet · full-clipped · CawCo (not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75); among A0 (8 cuts), A1 (8 cuts), A2 (8 cuts), A3 (8 cuts), A4 (8 cuts), A5 (8 cuts) with both readings (ahead-of-limit unavailable) | `overFloor` = summarize |
| cold / cross-org / no cache | 300-600k | E1: A4 summarize · Sonnet · full-clipped · CawCo (not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75); among A0 (8 cuts), A1 (8 cuts), A2 (8 cuts), A3 (8 cuts), A4 (8 cuts), A5 (8 cuts) with both readings | `overFloor` = summarize |
| limit gone early | 300-600k | E1: A4 summarize · Sonnet · full-clipped · CawCo (not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75); among A0 (8 cuts), A1 (8 cuts), A2 (8 cuts), A3 (8 cuts), A4 (8 cuts), A5 (8 cuts) with both readings (ahead-of-limit unavailable) | `overFloor` = summarize |
| cold / cross-org / no cache | 600k+ | E1: A3 summarize · Haiku · extract · CawCo (not actionable: quality CI spans 0; |Δ| 0.12 < floor 0.75); among A0 (4 cuts), A1 (6 cuts), A2 (6 cuts), A3 (6 cuts), A4 (6 cuts), A5 (6 cuts) with both readings | `overFloor` = summarize |
| limit gone early | 600k+ | E1: A3 summarize · Haiku · extract · CawCo (not actionable: quality CI spans 0; |Δ| 0.12 < floor 0.75); among A0 (4 cuts), A1 (6 cuts), A2 (6 cuts), A3 (6 cuts), A4 (6 cuts), A5 (6 cuts) with both readings (ahead-of-limit unavailable) | `overFloor` = summarize |
| warm, same org (by cost) | 100-300k | by cost alone (§7b): native /compact (whole $9.96, native /compact $8.10, Sonnet summary $8.27); quality unmeasured | — |
| warm, same org (by cost) | 300-600k | by cost alone (§7b): Sonnet summary (whole $17.42, native /compact $12.98, Sonnet summary $12.67); quality unmeasured | — |
| warm, same org (by cost) | 600k+ | by cost alone (§7b): native /compact (whole $22.91, native /compact $9.95, Sonnet summary $9.95); quality unmeasured | — |
| (E1 = summarize) | E2 model | A3 − A2: quality +0.12 [-0.06, +0.23], cost −$0.1549 [-0.5971, +2.5170]; not actionable: quality CI spans 0; |Δ| 0.12 < floor 0.75; judges disagree on direction | `summarizer.model`; the extract and prompt in `continuation.ts` |
| (E1 = summarize) | E3 input | A4 − A2: quality +0.00 [-0.12, +0.27], cost +$0.0877 [-0.5284, +2.7659]; not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75 | `summarizer.model`; the extract and prompt in `continuation.ts` |
| (E1 = summarize) | E4 shape | A5 − A4: quality +0.00 [-0.20, +0.15], cost −$0.1261 [-2.8840, +0.0364]; not actionable: quality CI spans 0; |Δ| 0.00 < floor 0.75 | `summarizer.model`; the extract and prompt in `continuation.ts` |
| chained | — | E7: A6 Factory anchored merge (chained) | whether the summarizer merges the prior summary (Factory) or restates it |

## 1b. Before a move to another organization: compact on the warm account first (A1 warm), or move whole (A0 cold)

A1 warm: `/compact` priced with its read of the context from the warm cache (the session's own account), then the continued turn and the horizon on the target, cold (another organization shares no cache). A0 cold: the whole context written to the target's cache by the continued turn's first request, then the horizon. Paired per cut; difference A1 warm − A0 cold; 95 % bootstrap CI over cuts.

| band | cuts | A0 cold total K | A1 warm total K | median Δ (A1w − A0c) | CI | A1 cheaper at | quality Δ A1 − A0 Opus | quality Δ A1 − A0 Sonnet | A1 vs A0 pairwise Opus w/t/l |
|---|---|---|---|---|---|---|---|---|---|
| 100-300k | 8 | $49.0138 | $40.8966 | $-8.1172 | [-11.2146, -5.7586] | 8 of 8 | 0.00 [-0.22, +0.25] | -0.12 [-0.28, +0.31] | 9/4/11 |
| 300-600k | 7 | $40.4843 | $26.7137 | $-13.7707 | [-19.3179, -10.8496] | 7 of 7 | 0.12 [-0.38, +0.50] | 0.00 [-0.38, +0.28] | 12/2/10 |
| 600k+ | 3 | $45.7673 | $13.7415 | $-32.0258 | [-93.6419, -18.6610] | 3 of 3 | 0.00 [-0.50, +0.38] | -0.12 [-0.38, +0.31] | 6/1/5 |
| all | 18 | $44.7654 | $31.7874 | $-12.2977 | [-28.0717, -10.5493] | 18 of 18 | 0.00 [-0.21, +0.24] | 0.00 [-0.21, +0.16] | 27/7/26 |

Per cut (context at the cut → A1 warm, A0 cold, Δ): c01 118k → $36.86, $43.76, -6.90, c04 177k → $67.00, $76.73, -9.73, c05 177k → $62.03, $76.42, -14.38, c02 197k → $44.93, $54.26, -9.33, c03 234k → $54.86, $68.93, -14.07, c08 243k → $9.21, $12.40, -3.19, c06 244k → $10.99, $15.58, -4.59, c07 282k → $8.23, $13.17, -4.94, c13 360k → $19.18, $30.01, -10.82, c16 375k → $39.97, $53.86, -13.89, c14 406k → $37.70, $58.66, -20.95, c12 454k → $26.71, $40.48, -13.77, c10 508k → $71.94, $97.31, -25.36, c11 517k → $10.74, $20.11, -9.38, c15 569k → $17.47, $26.81, -9.34, c22 803k → $6.07, $24.73, -18.66, c19 933k → $68.89, $162.53, -93.64, c24 950k → $13.74, $45.77, -32.03

By arithmetic over every drawn cut (§7b): compact warm, then move = native `/compact` reading the context from the warm cache, then the compacted prompt written on the target; move whole = the whole context written on the target. Total over the next 20 real turns, USD.

| band | cuts | move whole (cold) | compact warm, then move | Δ | compact-first cheaper at | Sonnet summary, then move |
|---|---|---|---|---|---|---|
| 100-300k | 8 | $11.86 | $8.10 | -4.24 [-4.82, -2.99] | 8 of 8 | $8.27 |
| 300-600k | 8 | $23.15 | $12.98 | -10.16 [-14.87, -9.87] | 8 of 8 | $12.67 |
| 600k+ | 8 | $30.24 | $9.95 | -19.47 [-27.18, -15.58] | 8 of 8 | $9.95 |
| all | 24 | $21.08 | $9.98 | -10.16 [-16.00, -8.90] | 24 of 24 | $10.05 |

Moving whole was not possible at all at 2 cuts: every A0 run there stopped on "Prompt is too long" (c20 958k, c23 965k); the real sessions compacted there.

## 1c. Judged pairs (both orders, both judges; a win or loss counts only when both orders agree)

Noise: the A0 runs of one cut against each other (§4): 0-5 spread, Opus, 0.25, 0.00, 1.00, 0.25, 0.25, 0.00, 0.50, 0.50, 0.00, 0.00, 0.75, 0.50, 0.00, 0.75, 0.00, 0.00, 0.00, 0.75, 0.25, 0.00, 0.25, 0.25, 0.25, 0.00, 0.75, 0.75, 0.50, 0.00, 0.75, 0.75, 0.25, 0.25, 0.25, 0.00, 0.25, 0.50, 0.00, 0.00, 1.25, 0.75, 1.00, 0.00, 0.25, 0.75, 0.25, 0.25, 0.50, 0.25, 0.75, 0.75; the floor used is 0.75.

| pair | cut | run | Opus (arm-first, control-first) | Opus | Sonnet (arm-first, control-first) | Sonnet | judges agree |
|---|---|---|---|---|---|---|---|
| A1 vs A0 | c01 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c01 | 2 | loss, loss | loss | loss, win | tie | no |
| A1 vs A0 | c01 | 3 | loss, win | tie | loss, loss | loss | no |
| A1 vs A0 | c02 | 1 | win, win | win | win, loss | tie | no |
| A1 vs A0 | c02 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c02 | 3 | win, loss | tie | win, win | win | no |
| A1 vs A0 | c03 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c03 | 2 | loss, loss | loss | win, loss | tie | no |
| A1 vs A0 | c03 | 3 | loss, loss | loss | loss, win | tie | no |
| A1 vs A0 | c04 | 1 | loss, loss | loss | loss, win | tie | no |
| A1 vs A0 | c04 | 2 | win, win | win | loss, loss | loss | no |
| A1 vs A0 | c04 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c05 | 1 | loss, loss | loss | loss, win | tie | no |
| A1 vs A0 | c05 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c05 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c06 | 1 | loss, win | tie | loss, win | tie | yes |
| A1 vs A0 | c06 | 2 | win, loss | tie | loss, loss | loss | no |
| A1 vs A0 | c06 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c07 | 1 | loss, loss | loss | win, loss | tie | no |
| A1 vs A0 | c07 | 2 | loss, loss | loss | win, loss | tie | no |
| A1 vs A0 | c07 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c08 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c08 | 2 | loss, loss | loss | win, loss | tie | no |
| A1 vs A0 | c08 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c09 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c09 | 2 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c09 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c10 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c10 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c10 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c11 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c11 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c11 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c12 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c12 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c12 | 3 | win, win | win | loss, win | tie | no |
| A1 vs A0 | c13 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c13 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c13 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c14 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c14 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c14 | 3 | tie, tie | tie | loss, loss | loss | no |
| A1 vs A0 | c15 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c15 | 2 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c15 | 3 | loss, loss | loss | loss, win | tie | no |
| A1 vs A0 | c16 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c16 | 2 | win, loss | tie | loss, loss | loss | no |
| A1 vs A0 | c16 | 3 | win, win | win | win, loss | tie | no |
| A1 vs A0 | c17 | 1 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c17 | 2 | win, loss | tie | loss, loss | loss | no |
| A1 vs A0 | c17 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c18 | 1 | win, win | win | win, loss | tie | no |
| A1 vs A0 | c18 | 2 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c18 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c19 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c19 | 2 | loss, loss | loss | loss, win | tie | no |
| A1 vs A0 | c19 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c21 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c21 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c21 | 3 | tie, tie | tie | loss, win | tie | yes |
| A1 vs A0 | c22 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c22 | 2 | win, win | win | win, win | win | yes |
| A1 vs A0 | c22 | 3 | win, win | win | win, win | win | yes |
| A1 vs A0 | c24 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c24 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c24 | 3 | win, win | win | win, win | win | yes |
| A1 vs A2 | c01 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c17 | 1 | loss, loss | loss | win, win | win | no |
| A1 vs A2 | c17 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A2 | c17 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A2 | c18 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c18 | 3 | win, win | win | win, win | win | yes |
| A1 vs A2 | c20 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c20 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A2 | c20 | 3 | win, win | win | win, win | win | yes |
| A1 vs A2 | c23 | 1 | win, win | win | win, win | win | yes |
| A1 vs A2 | c23 | 2 | win, win | win | win, win | win | yes |
| A1 vs A2 | c23 | 3 | win, win | win | loss, loss | loss | no |
| A2 vs A0 | c01 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c01 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c01 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c02 | 1 | win, win | win | win, win | win | yes |
| A2 vs A0 | c02 | 2 | loss, loss | loss | win, loss | tie | no |
| A2 vs A0 | c02 | 3 | win, win | win | win, loss | tie | no |
| A2 vs A0 | c03 | 1 | loss, loss | loss | win, loss | tie | no |
| A2 vs A0 | c03 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c03 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c04 | 1 | loss, loss | loss | loss, win | tie | no |
| A2 vs A0 | c04 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c04 | 3 | win, win | win | loss, win | tie | no |
| A2 vs A0 | c05 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c05 | 2 | win, win | win | win, win | win | yes |
| A2 vs A0 | c05 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c06 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c06 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c06 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c07 | 1 | tie, tie | tie | win, loss | tie | yes |
| A2 vs A0 | c07 | 2 | tie, loss | tie | tie, loss | tie | yes |
| A2 vs A0 | c07 | 3 | win, win | win | loss, loss | loss | no |
| A2 vs A0 | c08 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c08 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c08 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c09 | 1 | win, win | win | win, win | win | yes |
| A2 vs A0 | c09 | 2 | win, win | win | win, win | win | yes |
| A2 vs A0 | c09 | 3 | loss, win | tie | loss, win | tie | yes |
| A2 vs A0 | c10 | 1 | win, win | win | win, loss | tie | no |
| A2 vs A0 | c10 | 2 | win, win | win | win, loss | tie | no |
| A2 vs A0 | c10 | 3 | win, win | win | win, win | win | yes |
| A2 vs A0 | c11 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c11 | 2 | loss, loss | loss | loss, win | tie | no |
| A2 vs A0 | c11 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c12 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c12 | 2 | win, loss | tie | loss, loss | loss | no |
| A2 vs A0 | c12 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c13 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c13 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c13 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c14 | 1 | win, win | win | loss, win | tie | no |
| A2 vs A0 | c14 | 2 | loss, loss | loss | win, win | win | no |
| A2 vs A0 | c14 | 3 | win, win | win | win, win | win | yes |
| A2 vs A0 | c15 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c15 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c15 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c16 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c16 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c16 | 3 | loss, loss | loss | loss, win | tie | no |
| A2 vs A0 | c17 | 1 | win, loss | tie | loss, loss | loss | no |
| A2 vs A0 | c17 | 2 | win, win | win | win, loss | tie | no |
| A2 vs A0 | c17 | 3 | win, win | win | loss, loss | loss | no |
| A2 vs A0 | c18 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c18 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c18 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c19 | 1 | loss, loss | loss | win, loss | tie | no |
| A2 vs A0 | c19 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c19 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c21 | 1 | loss, loss | loss | win, win | win | no |
| A2 vs A0 | c21 | 2 | win, win | win | win, win | win | yes |
| A2 vs A0 | c21 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c22 | 1 | win, win | win | win, win | win | yes |
| A2 vs A0 | c22 | 2 | win, win | win | win, win | win | yes |
| A2 vs A0 | c22 | 3 | win, win | win | win, win | win | yes |
| A2 vs A0 | c24 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A2 vs A0 | c24 | 2 | win, win | win | win, win | win | yes |
| A2 vs A0 | c24 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c01 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c01 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c01 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c02 | 1 | win, win | win | win, win | win | yes |
| A3 vs A0 | c02 | 2 | loss, loss | loss | win, loss | tie | no |
| A3 vs A0 | c02 | 3 | loss, loss | loss | win, win | win | no |
| A3 vs A0 | c03 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c03 | 2 | loss, loss | loss | win, loss | tie | no |
| A3 vs A0 | c03 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c04 | 1 | loss, loss | loss | loss, win | tie | no |
| A3 vs A0 | c04 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c04 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c05 | 1 | loss, loss | loss | win, win | win | no |
| A3 vs A0 | c05 | 2 | win, win | win | loss, win | tie | no |
| A3 vs A0 | c05 | 3 | loss, tie | tie | loss, loss | loss | no |
| A3 vs A0 | c06 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c06 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c06 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c07 | 1 | win, tie | tie | win, win | win | no |
| A3 vs A0 | c07 | 2 | win, win | win | win, win | win | yes |
| A3 vs A0 | c07 | 3 | win, loss | tie | win, win | win | no |
| A3 vs A0 | c08 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c08 | 2 | loss, loss | loss | win, loss | tie | no |
| A3 vs A0 | c08 | 3 | loss, loss | loss | win, loss | tie | no |
| A3 vs A0 | c09 | 1 | loss, win | tie | win, win | win | no |
| A3 vs A0 | c09 | 2 | win, loss | tie | win, win | win | no |
| A3 vs A0 | c09 | 3 | win, win | win | win, loss | tie | no |
| A3 vs A0 | c10 | 1 | win, win | win | win, win | win | yes |
| A3 vs A0 | c10 | 2 | win, win | win | win, win | win | yes |
| A3 vs A0 | c10 | 3 | win, win | win | win, loss | tie | no |
| A3 vs A0 | c11 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c11 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c11 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c12 | 1 | win, win | win | win, loss | tie | no |
| A3 vs A0 | c12 | 2 | win, win | win | win, win | win | yes |
| A3 vs A0 | c12 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c13 | 1 | loss, loss | loss | loss, win | tie | no |
| A3 vs A0 | c13 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c13 | 3 | win, win | win | win, win | win | yes |
| A3 vs A0 | c14 | 1 | win, win | win | win, win | win | yes |
| A3 vs A0 | c14 | 2 | loss, loss | loss | loss, win | tie | no |
| A3 vs A0 | c14 | 3 | win, win | win | win, win | win | yes |
| A3 vs A0 | c15 | 1 | loss, loss | loss | loss, win | tie | no |
| A3 vs A0 | c15 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c15 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c16 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c16 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c16 | 3 | loss, win | tie | win, loss | tie | yes |
| A3 vs A0 | c19 | 1 | loss, loss | loss | win, win | win | no |
| A3 vs A0 | c19 | 2 | loss, win | tie | win, win | win | no |
| A3 vs A0 | c19 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c21 | 1 | win, win | win | win, win | win | yes |
| A3 vs A0 | c21 | 2 | win, win | win | win, win | win | yes |
| A3 vs A0 | c21 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c22 | 1 | win, win | win | win, win | win | yes |
| A3 vs A0 | c22 | 2 | win, win | win | win, win | win | yes |
| A3 vs A0 | c22 | 3 | win, win | win | win, win | win | yes |
| A3 vs A0 | c24 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A3 vs A0 | c24 | 2 | win, win | win | win, win | win | yes |
| A3 vs A0 | c24 | 3 | loss, loss | loss | loss, win | tie | no |
| A4 vs A0 | c01 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c01 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c01 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c02 | 1 | loss, loss | loss | win, loss | tie | no |
| A4 vs A0 | c02 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c02 | 3 | loss, loss | loss | win, loss | tie | no |
| A4 vs A0 | c03 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c03 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c03 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c04 | 1 | loss, loss | loss | loss, win | tie | no |
| A4 vs A0 | c04 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c04 | 3 | win, win | win | win, win | win | yes |
| A4 vs A0 | c05 | 1 | loss, loss | loss | win, loss | tie | no |
| A4 vs A0 | c05 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c05 | 3 | loss, win | tie | loss, loss | loss | no |
| A4 vs A0 | c06 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c06 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c06 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c07 | 1 | win, win | win | win, win | win | yes |
| A4 vs A0 | c07 | 2 | tie, tie | tie | loss, loss | loss | no |
| A4 vs A0 | c07 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c08 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c08 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c08 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c09 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c09 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c09 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c10 | 1 | win, win | win | win, loss | tie | no |
| A4 vs A0 | c10 | 2 | loss, win | tie | win, win | win | no |
| A4 vs A0 | c10 | 3 | win, win | win | win, win | win | yes |
| A4 vs A0 | c11 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c11 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c11 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c12 | 1 | loss, loss | loss | loss, win | tie | no |
| A4 vs A0 | c12 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c12 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c13 | 1 | loss, loss | loss | win, win | win | no |
| A4 vs A0 | c13 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c13 | 3 | loss, loss | loss | win, win | win | no |
| A4 vs A0 | c14 | 1 | win, win | win | win, win | win | yes |
| A4 vs A0 | c14 | 2 | loss, win | tie | loss, loss | loss | no |
| A4 vs A0 | c14 | 3 | win, win | win | win, win | win | yes |
| A4 vs A0 | c15 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c15 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c15 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c16 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c16 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c16 | 3 | win, loss | tie | loss, win | tie | yes |
| A4 vs A0 | c19 | 1 | loss, loss | loss | loss, win | tie | no |
| A4 vs A0 | c19 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c19 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c21 | 1 | tie, win | tie | win, win | win | no |
| A4 vs A0 | c21 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c21 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c22 | 1 | win, win | win | win, win | win | yes |
| A4 vs A0 | c22 | 2 | win, win | win | win, win | win | yes |
| A4 vs A0 | c22 | 3 | win, win | win | win, win | win | yes |
| A4 vs A0 | c24 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A4 vs A0 | c24 | 2 | loss, loss | loss | loss, win | tie | no |
| A4 vs A0 | c24 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c01 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c01 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c01 | 3 | win, loss | tie | loss, loss | loss | no |
| A5 vs A0 | c02 | 1 | loss, win | tie | loss, loss | loss | no |
| A5 vs A0 | c02 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c02 | 3 | loss, win | tie | win, loss | tie | yes |
| A5 vs A0 | c03 | 1 | loss, loss | loss | tie, loss | tie | no |
| A5 vs A0 | c03 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c03 | 3 | loss, loss | loss | tie, loss | tie | no |
| A5 vs A0 | c04 | 1 | win, win | win | win, win | win | yes |
| A5 vs A0 | c04 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c04 | 3 | win, win | win | win, win | win | yes |
| A5 vs A0 | c05 | 1 | loss, win | tie | win, win | win | no |
| A5 vs A0 | c05 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c05 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c06 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c06 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c06 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c07 | 1 | win, win | win | win, win | win | yes |
| A5 vs A0 | c07 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c07 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c08 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c08 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c08 | 3 | win, loss | tie | loss, loss | loss | no |
| A5 vs A0 | c09 | 1 | win, win | win | win, win | win | yes |
| A5 vs A0 | c09 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c09 | 3 | loss, win | tie | loss, win | tie | yes |
| A5 vs A0 | c10 | 1 | win, win | win | loss, win | tie | no |
| A5 vs A0 | c10 | 2 | win, win | win | tie, loss | tie | no |
| A5 vs A0 | c10 | 3 | win, win | win | win, win | win | yes |
| A5 vs A0 | c11 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c11 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c11 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c12 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c12 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c12 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c13 | 1 | loss, loss | loss | win, loss | tie | no |
| A5 vs A0 | c13 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c13 | 3 | loss, loss | loss | win, loss | tie | no |
| A5 vs A0 | c14 | 1 | win, win | win | loss, win | tie | no |
| A5 vs A0 | c14 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c14 | 3 | win, win | win | win, win | win | yes |
| A5 vs A0 | c15 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c15 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c15 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c16 | 1 | loss, win | tie | loss, loss | loss | no |
| A5 vs A0 | c16 | 2 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c16 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c19 | 1 | loss, loss | loss | win, win | win | no |
| A5 vs A0 | c19 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c19 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c21 | 1 | win, win | win | win, win | win | yes |
| A5 vs A0 | c21 | 2 | loss, loss | loss | win, win | win | no |
| A5 vs A0 | c21 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c22 | 1 | win, win | win | win, win | win | yes |
| A5 vs A0 | c22 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c22 | 3 | win, win | win | win, win | win | yes |
| A5 vs A0 | c24 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A5 vs A0 | c24 | 2 | win, win | win | win, win | win | yes |
| A5 vs A0 | c24 | 3 | win, win | win | win, win | win | yes |
| A6 vs A0 | c17 | 1 | win, loss | tie | win, win | win | no |
| A6 vs A0 | c17 | 2 | win, win | win | win, loss | tie | no |
| A6 vs A0 | c17 | 3 | loss, loss | loss | loss, win | tie | no |
| A6 vs A0 | c18 | 1 | loss, loss | loss | loss, loss | loss | yes |
| A6 vs A0 | c18 | 2 | loss, loss | loss | win, loss | tie | no |
| A6 vs A0 | c18 | 3 | loss, loss | loss | loss, loss | loss | yes |

| pair | judged pairs | Opus win/tie/loss | Sonnet win/tie/loss | judges agree | both judges say the arm lost |
|---|---|---|---|---|---|
| A1 vs A0 | 66 | 29/8/29 | 29/16/21 | 41 of 66 | 15 |
| A1 vs A2 | 12 | 8/0/4 | 8/0/4 | 10 of 12 | 3 |
| A2 vs A0 | 66 | 19/5/42 | 13/15/38 | 48 of 66 | 34 |
| A3 vs A0 | 60 | 18/7/35 | 22/14/24 | 38 of 60 | 23 |
| A4 vs A0 | 60 | 15/6/39 | 18/9/33 | 45 of 60 | 30 |
| A5 vs A0 | 60 | 21/7/32 | 21/9/30 | 46 of 60 | 26 |
| A6 vs A0 | 6 | 1/1/4 | 1/3/2 | 2 of 6 | 2 |

0-5 (mean of the four dimensions; median over runs) per cut, Opus / Sonnet:

| cut | A0 | A1 | A2 | A3 | A4 | A5 | A6 | A1 − A0 | A2 − A0 | A3 − A0 | A4 − A0 | A5 − A0 | A6 − A0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01 | 3.00 / 2.00 | 2.75 / 2.00 | 1.00 / 1.25 | 1.75 / 1.00 | 1.00 / 1.25 | 1.75 / 1.50 | – / – | -0.25 / +0.00 | -2.00 / -0.75 | -1.25 / -1.00 | -2.00 / -0.75 | -1.25 / -0.50 | – |
| c02 | 3.00 / 2.75 | 3.00 / 2.25 | 3.00 / 2.25 | 3.00 / 1.50 | 3.00 / 2.00 | 3.00 / 2.00 | – / – | +0.00 / -0.50 | +0.00 / -0.50 | +0.00 / -1.25 | +0.00 / -0.75 | +0.00 / -0.75 | – |
| c03 | 2.75 / 1.75 | 3.50 / 1.50 | 1.75 / 1.50 | 2.00 / 1.25 | 1.75 / 1.50 | 1.75 / 1.25 | – / – | +0.75 / -0.25 | -1.00 / -0.25 | -0.75 / -0.50 | -1.00 / -0.25 | -1.00 / -0.50 | – |
| c04 | 3.00 / 1.75 | 3.00 / 2.50 | 2.75 / 2.25 | 2.00 / 2.25 | 2.50 / 2.00 | 2.50 / 2.00 | – / – | +0.00 / +0.75 | -0.25 / +0.50 | -1.00 / +0.50 | -0.50 / +0.25 | -0.50 / +0.25 | – |
| c05 | 3.00 / 2.25 | 3.25 / 1.75 | 2.25 / 1.75 | 2.50 / 1.50 | 2.75 / 1.50 | 3.00 / 2.00 | – / – | +0.25 / -0.50 | -0.75 / -0.50 | -0.50 / -0.75 | -0.25 / -0.75 | +0.00 / -0.25 | – |
| c06 | 3.50 / 2.50 | 3.00 / 2.25 | 2.25 / 1.75 | 2.00 / 1.50 | 2.00 / 2.00 | 2.00 / 2.00 | – / – | -0.50 / -0.25 | -1.25 / -0.75 | -1.50 / -1.00 | -1.50 / -0.50 | -1.50 / -0.50 | – |
| c07 | 2.75 / 1.25 | 2.75 / 1.75 | 3.00 / 2.00 | 2.75 / 2.00 | 3.00 / 2.25 | 2.75 / 1.75 | – / – | +0.00 / +0.50 | +0.25 / +0.75 | +0.00 / +0.75 | +0.25 / +1.00 | +0.00 / +0.50 | – |
| c08 | 3.75 / 2.50 | 3.50 / 2.75 | 2.25 / 2.75 | 2.25 / 2.75 | 3.25 / 2.50 | 2.25 / 2.25 | – / – | -0.25 / +0.25 | -1.50 / +0.25 | -1.50 / +0.25 | -0.50 / +0.00 | -1.50 / -0.25 | – |
| c09 | 3.25 / 2.50 | 3.25 / 2.50 | 3.25 / 2.50 | 3.25 / 3.00 | 3.00 / 2.25 | 3.25 / 2.50 | – / – | +0.00 / +0.00 | +0.00 / +0.00 | +0.00 / +0.50 | -0.25 / -0.25 | +0.00 / +0.00 | – |
| c10 | 2.25 / 1.75 | 3.50 / 2.50 | 2.75 / 2.00 | 3.00 / 2.00 | 3.00 / 2.00 | 3.00 / 2.00 | – / – | +1.25 / +0.75 | +0.50 / +0.25 | +0.75 / +0.25 | +0.75 / +0.25 | +0.75 / +0.25 | – |
| c11 | 5.00 / 3.75 | 4.00 / 2.75 | 2.50 / 2.50 | 2.75 / 3.00 | 3.50 / 3.00 | 2.75 / 2.00 | – / – | -1.00 / -1.00 | -2.50 / -1.25 | -2.25 / -0.75 | -1.50 / -0.75 | -2.25 / -1.75 | – |
| c12 | 3.00 / 2.00 | 3.25 / 2.00 | 2.00 / 1.50 | 2.50 / 1.50 | 2.25 / 1.50 | 2.50 / 1.75 | – / – | +0.25 / +0.00 | -1.00 / -0.50 | -0.50 / -0.50 | -0.75 / -0.50 | -0.50 / -0.25 | – |
| c13 | 2.50 / 2.25 | 2.75 / 2.25 | 1.50 / 1.00 | 1.75 / 1.50 | 2.00 / 1.50 | 1.25 / 0.75 | – / – | +0.25 / +0.00 | -1.00 / -1.25 | -0.75 / -0.75 | -0.50 / -0.75 | -1.25 / -1.50 | – |
| c14 | 2.50 / 2.00 | 3.00 / 2.25 | 3.25 / 2.00 | 3.25 / 2.00 | 2.50 / 1.75 | 3.25 / 1.75 | – / – | +0.50 / +0.25 | +0.75 / +0.00 | +0.75 / +0.00 | +0.00 / -0.25 | +0.75 / -0.25 | – |
| c15 | 4.00 / 2.75 | 3.50 / 2.75 | 3.50 / 1.75 | 3.00 / 1.75 | 3.25 / 2.25 | 3.25 / 1.75 | – / – | -0.50 / +0.00 | -0.50 / -1.00 | -1.00 / -1.00 | -0.75 / -0.50 | -0.75 / -1.00 | – |
| c16 | 3.00 / 1.75 | 2.75 / 1.50 | 1.50 / 1.50 | 1.75 / 1.25 | 1.25 / 1.00 | 1.25 / 1.00 | – / – | -0.25 / -0.25 | -1.50 / -0.25 | -1.25 / -0.50 | -1.75 / -0.75 | -1.75 / -0.75 | – |
| c17 | 2.50 / 1.50 | 1.25 / 1.25 | 1.75 / 1.75 | – / – | – / – | – / – | 1.50 / 1.25 | -1.25 / -0.25 | -0.75 / +0.25 | – | – | – | -1.00 / -0.25 |
| c18 | 3.25 / 1.50 | 2.50 / 1.25 | 2.25 / 1.25 | – / – | – / – | – / – | 2.00 / 1.25 | -0.75 / -0.25 | -1.00 / -0.25 | – | – | – | -1.25 / -0.25 |
| c19 | 3.00 / 2.00 | 2.25 / 2.00 | 2.25 / 1.75 | 2.50 / 2.75 | 2.50 / 2.00 | 2.25 / 1.75 | – / – | -0.75 / +0.00 | -0.75 / -0.25 | -0.50 / +0.75 | -0.50 / +0.00 | -0.75 / -0.25 | – |
| c20 | – / – | 2.75 / 2.50 | 2.25 / 1.75 | 2.00 / 1.00 | 1.50 / 1.25 | 1.25 / 1.00 | – / – | – | – | – | – | – | – |
| c21 | 3.50 / 3.00 | 3.75 / 2.75 | 3.00 / 2.75 | 3.50 / 3.25 | 3.75 / 3.75 | 3.50 / 3.00 | – / – | +0.25 / -0.25 | -0.50 / -0.25 | +0.00 / +0.25 | +0.25 / +0.75 | +0.00 / +0.00 | – |
| c22 | 3.50 / 2.75 | 4.00 / 3.25 | 4.00 / 3.75 | 4.00 / 3.50 | 4.00 / 3.75 | 4.00 / 3.00 | – / – | +0.50 / +0.50 | +0.50 / +1.00 | +0.50 / +0.75 | +0.50 / +1.00 | +0.50 / +0.25 | – |
| c23 | – / – | 3.50 / 3.25 | 3.00 / 2.75 | 3.50 / 3.50 | 3.25 / 2.50 | 3.50 / 3.25 | – / – | – | – | – | – | – | – |
| c24 | 3.00 / 2.75 | 2.75 / 2.25 | 3.00 / 2.00 | 3.00 / 1.50 | 2.50 / 1.75 | 3.00 / 3.00 | – / – | -0.25 / -0.50 | +0.00 / -0.75 | +0.00 / -1.25 | -0.50 / -1.00 | +0.00 / +0.25 | – |

Per dimension, median over every judged run, Opus / Sonnet:

| arm | runs | decision_fidelity | artifact_fidelity | continuation_fidelity | no_repetition |
|---|---|---|---|---|---|
| A0 | 72 | 3.0 / 2.0 | 3.0 / 2.0 | 2.0 / 1.0 | 4.0 / 3.0 |
| A1 | 72 | 3.5 / 2.0 | 3.0 / 3.0 | 2.0 / 2.0 | 4.0 / 3.0 |
| A2 | 72 | 3.0 / 2.0 | 3.0 / 2.0 | 1.0 / 1.0 | 4.0 / 2.0 |
| A3 | 66 | 3.0 / 2.0 | 3.0 / 2.0 | 1.0 / 1.0 | 4.0 / 3.0 |
| A4 | 66 | 3.0 / 2.0 | 3.0 / 2.0 | 1.0 / 1.0 | 4.0 / 2.0 |
| A5 | 66 | 3.0 / 2.0 | 3.0 / 2.0 | 1.0 / 1.0 | 4.0 / 2.0 |
| A6 | 6 | 1.5 / 1.0 | 2.0 / 1.0 | 1.0 / 1.0 | 2.5 / 2.0 |

## 2. Quality per arm (median over runs, then over cuts)

| arm | what | cuts | abs 0-5 Opus | abs 0-5 Sonnet | win/tie/loss vs A0 Opus | win/tie/loss vs A0 Sonnet | asked back | files J | commands J | re-fetches | anchor keys carried | probe score Opus | probe score Sonnet | summary rules 1 / 2 Opus | summary rules 1 / 2 Sonnet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A0 | whole (control) | 22 | 3.00 | 2.12 | — | — | – | 1.00 | 0.00 | 0.0 | 1.00 | 1.85 | 1.84 | – | – |
| A1 | native /compact | 24 | 3.00 | 2.25 | 29/8/29 | 29/16/21 | 0.0 | 1.00 | 0.00 | 0.0 | 0.50 | 1.43 | 1.40 | 1.0 / 2.0 | 2.0 / 2.0 |
| A2 | summarize · Sonnet · extract · CawCo | 24 | 2.38 | 1.88 | 19/5/42 | 13/15/38 | 0.0 | 1.00 | 0.00 | 0.0 | 0.50 | 1.33 | 1.27 | 2.0 / 3.0 | 2.5 / 2.0 |
| A3 | summarize · Haiku · extract · CawCo | 22 | 2.62 | 1.88 | 18/7/35 | 22/14/24 | 0.0 | 1.00 | 0.00 | 0.0 | 0.50 | 1.29 | 1.23 | 1.0 / 3.0 | 2.0 / 2.0 |
| A4 | summarize · Sonnet · full-clipped · CawCo | 22 | 2.62 | 2.00 | 15/6/39 | 18/9/33 | 0.0 | 1.00 | 0.00 | 0.0 | 0.54 | 1.57 | 1.56 | 1.0 / 3.0 | 2.0 / 2.0 |
| A5 | summarize · Sonnet · full-clipped · Claude Code shape | 22 | 2.75 | 2.00 | 21/7/32 | 21/9/30 | 0.0 | 1.00 | 0.00 | 0.0 | 0.50 | 1.52 | 1.52 | 1.0 / 2.0 | 2.0 / 2.0 |
| A6 | Factory anchored merge (chained) | 2 | 1.75 | 1.25 | 1/1/4 | 1/3/2 | 0.0 | 0.00 | 0.00 | 0.0 | 0.29 | 0.46 | 0.50 | 1.5 / 2.0 | 2.5 / 1.5 |

Summary rules: the owner's rules for a compaction summary (2026-10-21), 0-5 each, on the summary the arm carried (A1: Claude Code's; A2-A7: the summariser's): 1, the person's messages carried as meaning, never quoted; 2, only what the next turns need. Median over runs, then over cuts. Secondary: it enters no decision.

Cuts: those with at least one finished run. Files J and commands J are Jaccard similarities with the real turn's edited files and commands; two empty sets count as 1 (neither turn edited a file), and a command matches only verbatim, so commands J is near 0 wherever wording differs. A blank judge column means no judgment was made.

## 2b. Quality and cost by stratum (Opus absolute 0-5; cold total at K)

| arm | stratum | value | cuts | abs 0-5 Opus | total K (USD) |
|---|---|---|---|---|---|
| A0 | next message | agent | 15 | 3.00 | 33.6482 |
| A0 | next message | person | 6 | 3.00 | 53.8645 |
| A0 | next message | resume | 1 | 2.50 | 30.0078 |
| A0 | kind | continued | 5 | 3.00 | 75.7849 |
| A0 | kind | moved | 14 | 3.00 | 30.0078 |
| A0 | kind | native-midturn | 3 | 3.00 | 22.0631 |
| A0 | move | cross-org | 3 | 3.50 | 44.5211 |
| A0 | move | same-org | 11 | 3.00 | 30.0078 |
| A1 | next message | agent | 16 | 3.25 | 22.6370 |
| A1 | next message | person | 7 | 2.75 | 40.4849 |
| A1 | next message | resume | 1 | 2.75 | 20.8928 |
| A1 | kind | continued | 6 | 2.88 | 45.6894 |
| A1 | kind | moved | 14 | 3.25 | 20.8928 |
| A1 | kind | native-midturn | 4 | 2.62 | 20.5367 |
| A1 | move | cross-org | 3 | 3.75 | 34.4317 |
| A1 | move | same-org | 11 | 3.00 | 20.8928 |
| A2 | next message | agent | 16 | 2.38 | 19.3520 |
| A2 | next message | person | 7 | 2.75 | 40.5402 |
| A2 | next message | resume | 1 | 1.50 | 17.1991 |
| A2 | kind | continued | 6 | 2.50 | 45.4464 |
| A2 | kind | moved | 14 | 2.38 | 17.2400 |
| A2 | kind | native-midturn | 4 | 2.62 | 16.2849 |
| A2 | move | cross-org | 3 | 2.50 | 34.7857 |
| A2 | move | same-org | 11 | 2.25 | 17.2400 |
| A3 | next message | agent | 14 | 2.62 | 28.3613 |
| A3 | next message | person | 7 | 2.75 | 39.3382 |
| A3 | next message | resume | 1 | 1.75 | 17.2428 |
| A3 | kind | continued | 6 | 2.75 | 44.9570 |
| A3 | kind | moved | 14 | 2.50 | 17.2428 |
| A3 | kind | native-midturn | 2 | 3.25 | 34.0669 |
| A3 | move | cross-org | 3 | 2.75 | 33.9672 |
| A3 | move | same-org | 11 | 2.50 | 17.2428 |
| A4 | next message | agent | 14 | 2.62 | 27.7761 |
| A4 | next message | person | 7 | 3.00 | 39.1160 |
| A4 | next message | resume | 1 | 2.00 | 17.5428 |
| A4 | kind | continued | 6 | 2.75 | 45.0774 |
| A4 | kind | moved | 14 | 2.62 | 17.5428 |
| A4 | kind | native-midturn | 2 | 2.88 | 35.0624 |
| A4 | move | cross-org | 3 | 3.50 | 34.1507 |
| A4 | move | same-org | 11 | 2.50 | 17.5428 |
| A5 | next message | agent | 14 | 2.88 | 29.1148 |
| A5 | next message | person | 7 | 2.75 | 39.1751 |
| A5 | next message | resume | 1 | 1.25 | 17.3941 |
| A5 | kind | continued | 6 | 2.62 | 45.1878 |
| A5 | kind | moved | 14 | 2.62 | 17.3941 |
| A5 | kind | native-midturn | 2 | 3.25 | 34.8766 |
| A5 | move | cross-org | 3 | 2.75 | 34.0905 |
| A5 | move | same-org | 11 | 2.50 | 17.3941 |
| A6 | next message | agent | 2 | 1.75 | 15.1517 |
| A6 | kind | native-midturn | 2 | 1.75 | 15.1517 |

## 3. Cost per arm, per regime and band (USD; median over runs, then over cuts; product prices, each request on its own)

| arm | band | regime | C_make | C_between | C_turn1 | C_horizon(K) | total K | total K=20 | total K=50 | CI total K vs A0 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0 | 100-300k | cold | 0.0000 | 0.0000 | 2.1575 | 42.8165 | 43.7784 | 10.3709 | 45.6494 | – |
| A0 | 100-300k | warm | 0.0000 | 0.0000 | 0.4839 | 42.8165 | 42.9393 | 8.4734 | 43.8743 | – |
| A0 | 300-600k | cold | 0.0000 | 0.0000 | 4.8244 | 30.8099 | 40.4843 | 25.7889 | 56.8425 | – |
| A0 | 300-600k | warm | 0.0000 | 0.0000 | 1.1492 | 30.8099 | 31.9100 | 19.4577 | 53.8895 | – |
| A0 | 600k+ | cold | 0.0000 | 0.0000 | 7.4492 | 38.4326 | 45.9964 | 26.3115 | 58.8417 | – |
| A0 | 600k+ | warm | 0.0000 | 0.0000 | 0.9106 | 38.4326 | 39.1457 | 19.4608 | 52.0523 | – |
| A0 | chained | cold | 0.0000 | 0.0000 | 6.7797 | 14.1778 | 20.9575 | 19.1592 | – | – |
| A0 | chained | warm | 0.0000 | 0.0000 | 0.7330 | 14.1778 | 14.9109 | 13.1125 | – | – |
| A1 | 100-300k | cold | 1.2282 | 0.0000 | 0.4195 | 39.7452 | 41.4845 | 8.1828 | 35.7577 | [-10.2216, -4.7918] |
| A1 | 100-300k | warm | 0.1856 | 0.0000 | 0.4195 | 39.7452 | 40.9233 | 7.2290 | 34.7132 | [-9.4888, -3.8772] |
| A1 | 300-600k | cold | 2.4373 | 0.0000 | 1.2273 | 24.8665 | 31.8523 | 18.5141 | 37.4875 | [-17.1398, -8.5421] |
| A1 | 300-600k | warm | 0.3344 | 0.0000 | 1.2273 | 24.8665 | 26.7137 | 14.9532 | 35.8414 | [-15.3644, -6.0292] |
| A1 | 600k+ | cold | 4.4605 | 0.0000 | 0.7985 | 24.0313 | 30.3828 | 12.9022 | 24.9718 | [-89.5482, -15.2277] |
| A1 | 600k+ | warm | 0.4413 | 0.0000 | 0.7985 | 24.0313 | 26.0417 | 8.7886 | 20.8681 | [-86.8525, -12.9414] |
| A1 | chained | cold | 4.7428 | 7.4606 | 0.9053 | 7.9296 | 21.2053 | 20.4542 | – | [-3.6266, +2.9818] |
| A1 | chained | warm | 0.6902 | 7.4606 | 0.9053 | 7.9296 | 17.1590 | 16.4079 | – | [-0.8440, +4.2000] |
| A2 | 100-300k | cold | 0.4848 | 0.0000 | 0.2704 | 40.3784 | 41.3357 | 7.7681 | 35.4290 | [-10.0679, -5.1714] |
| A2 | 100-300k | warm | 0.4848 | 0.0000 | 0.2704 | 40.3784 | 41.3357 | 7.7681 | 35.4290 | [-8.4164, -3.2175] |
| A2 | 300-600k | cold | 1.1060 | 0.0000 | 0.2538 | 25.8503 | 29.3607 | 14.7682 | 39.1644 | [-17.8046, -9.4630] |
| A2 | 300-600k | warm | 1.1060 | 0.0000 | 0.2538 | 25.8503 | 29.3607 | 14.7682 | 39.1644 | [-14.0137, -4.2666] |
| A2 | 600k+ | cold | 1.0048 | 0.0000 | 0.2930 | 25.2454 | 26.4339 | 8.7664 | 22.6412 | [-85.8556, -17.9226] |
| A2 | 600k+ | warm | 1.0048 | 0.0000 | 0.2930 | 25.2454 | 26.4339 | 8.7664 | 22.6412 | [-79.0662, -12.2030] |
| A2 | chained | cold | 1.1609 | 6.7459 | 0.2422 | 7.8258 | 16.5059 | 15.7730 | – | [-10.1023, -0.3031] |
| A2 | chained | warm | 1.1609 | 6.7459 | 0.2422 | 7.8258 | 16.5059 | 15.7730 | – | [-2.9935, +4.6815] |
| A3 | 100-300k | cold | 0.4449 | 0.0000 | 0.2742 | 40.4780 | 41.2808 | 7.7330 | 35.4483 | [-8.9873, -0.2066] |
| A3 | 100-300k | warm | 0.4449 | 0.0000 | 0.2742 | 40.4780 | 41.2808 | 7.7330 | 35.4483 | [-7.4695, +2.1321] |
| A3 | 300-600k | cold | 0.8245 | 0.0000 | 0.2446 | 25.5582 | 28.3613 | 14.9934 | 41.0531 | [-17.9611, -10.5860] |
| A3 | 300-600k | warm | 0.8245 | 0.0000 | 0.2446 | 25.5582 | 28.3613 | 14.9934 | 41.0531 | [-14.0322, -5.4420] |
| A3 | 600k+ | cold | 0.6569 | 0.0000 | 0.2676 | 25.3013 | 26.3041 | 8.0552 | 22.0986 | [-87.8644, -18.5971] |
| A3 | 600k+ | warm | 0.6569 | 0.0000 | 0.2676 | 25.3013 | 26.3041 | 8.0552 | 22.0986 | [-81.0750, -12.8775] |
| A4 | 100-300k | cold | 0.5432 | 0.0000 | 0.2333 | 40.3668 | 41.1406 | 8.0240 | 35.4933 | [-9.3534, +0.3497] |
| A4 | 100-300k | warm | 0.5432 | 0.0000 | 0.2333 | 40.3668 | 41.1406 | 8.0240 | 35.4933 | [-7.8570, +2.6642] |
| A4 | 300-600k | cold | 1.0972 | 0.0000 | 0.2249 | 25.3322 | 27.7761 | 15.1044 | 38.9930 | [-18.1373, -10.4706] |
| A4 | 300-600k | warm | 1.0972 | 0.0000 | 0.2249 | 25.3322 | 27.7761 | 15.1044 | 38.9930 | [-14.2290, -5.4243] |
| A4 | 600k+ | cold | 1.5102 | 0.0000 | 0.2605 | 25.4218 | 27.0745 | 9.0651 | 22.6034 | [-87.7643, -17.3129] |
| A4 | 600k+ | warm | 1.5102 | 0.0000 | 0.2605 | 25.4218 | 27.0745 | 9.0651 | 22.6034 | [-80.9749, -11.5933] |
| A5 | 100-300k | cold | 0.5353 | 0.0000 | 0.2068 | 40.2832 | 41.2521 | 7.8967 | 35.6573 | [-9.8706, -4.8469] |
| A5 | 100-300k | warm | 0.5353 | 0.0000 | 0.2068 | 40.2832 | 41.2521 | 7.8967 | 35.6573 | [-8.2418, -2.8273] |
| A5 | 300-600k | cold | 1.0970 | 0.0000 | 0.2217 | 25.7313 | 29.1148 | 14.9527 | 38.0323 | [-18.2509, -10.4059] |
| A5 | 300-600k | warm | 1.0970 | 0.0000 | 0.2217 | 25.7313 | 29.1148 | 14.9527 | 38.0323 | [-14.3713, -5.1596] |
| A5 | 600k+ | cold | 1.4749 | 0.0000 | 0.2651 | 24.8982 | 26.6181 | 9.2876 | 21.7678 | [-89.9884, -17.7845] |
| A5 | 600k+ | warm | 1.4749 | 0.0000 | 0.2651 | 24.8982 | 26.6181 | 9.2876 | 21.7678 | [-83.1990, -12.0649] |
| A6 | chained | cold | 1.2889 | 5.1750 | 0.1879 | 7.8258 | 14.8074 | 14.0752 | – | [-10.5548, -0.8601] |
| A6 | chained | warm | 1.2889 | 5.1750 | 0.1879 | 7.8258 | 14.8074 | 14.0752 | – | [-3.4460, +4.1245] |

Window percent of the cold total at K, where the account's readings measure it:

| cut | arm | run | window % |
|---|---|---|---|
| c01 | A0 | 1 | session 15.335, weekly_all 3.530, weekly_scoped/Fable 0.788 |
| c01 | A0 | 2 | session 15.321, weekly_all 3.527, weekly_scoped/Fable 0.787 |
| c01 | A0 | 3 | session 15.316, weekly_all 3.526, weekly_scoped/Fable 0.787 |
| c01 | A0 | 4 | session 15.315, weekly_all 3.525, weekly_scoped/Fable 0.787 |
| c01 | A0 | 5 | session 15.318, weekly_all 3.526, weekly_scoped/Fable 0.787 |
| c01 | A1 | 1 | session 12.807, weekly_all 2.948, weekly_scoped/Fable 0.658 |
| c01 | A1 | 2 | session 12.653, weekly_all 2.913, weekly_scoped/Fable 0.650 |
| c01 | A1 | 3 | session 12.633, weekly_all 2.908, weekly_scoped/Fable 0.649 |
| c01 | A2 | 1 | session 12.969, weekly_all 2.986, weekly_scoped/Fable 0.666 |
| c01 | A2 | 2 | session 12.933, weekly_all 2.977, weekly_scoped/Fable 0.664 |
| c01 | A2 | 3 | session 12.978, weekly_all 2.988, weekly_scoped/Fable 0.667 |
| c01 | A3 | 1 | session 13.145, weekly_all 3.026, weekly_scoped/Fable 0.675 |
| c01 | A3 | 2 | session 13.052, weekly_all 3.005, weekly_scoped/Fable 0.670 |
| c01 | A3 | 3 | session 12.992, weekly_all 2.991, weekly_scoped/Fable 0.667 |
| c01 | A4 | 1 | session 12.959, weekly_all 2.983, weekly_scoped/Fable 0.666 |
| c01 | A4 | 2 | session 12.814, weekly_all 2.950, weekly_scoped/Fable 0.658 |
| c01 | A4 | 3 | session 12.831, weekly_all 2.954, weekly_scoped/Fable 0.659 |
| c01 | A5 | 1 | session 12.823, weekly_all 2.952, weekly_scoped/Fable 0.659 |
| c01 | A5 | 2 | session 12.796, weekly_all 2.946, weekly_scoped/Fable 0.657 |
| c01 | A5 | 3 | session 12.770, weekly_all 2.940, weekly_scoped/Fable 0.656 |
| c02 | A0 | 1 | session 19.512, weekly_all 4.492, weekly_scoped/Fable 1.002 |
| c02 | A0 | 2 | session 19.570, weekly_all 4.505, weekly_scoped/Fable 1.005 |
| c02 | A0 | 3 | session 19.502, weekly_all 4.489, weekly_scoped/Fable 1.002 |
| c02 | A1 | 1 | session 15.992, weekly_all 3.681, weekly_scoped/Fable 0.821 |
| c02 | A1 | 2 | session 15.873, weekly_all 3.654, weekly_scoped/Fable 0.815 |
| c02 | A1 | 3 | session 15.965, weekly_all 3.675, weekly_scoped/Fable 0.820 |
| c02 | A2 | 1 | session 16.039, weekly_all 3.692, weekly_scoped/Fable 0.824 |
| c02 | A2 | 2 | session 15.902, weekly_all 3.661, weekly_scoped/Fable 0.817 |
| c02 | A2 | 3 | session 16.050, weekly_all 3.695, weekly_scoped/Fable 0.824 |
| c02 | A3 | 1 | session 16.076, weekly_all 3.701, weekly_scoped/Fable 0.826 |
| c02 | A3 | 2 | session 15.784, weekly_all 3.633, weekly_scoped/Fable 0.811 |
| c02 | A3 | 3 | session 15.933, weekly_all 3.668, weekly_scoped/Fable 0.818 |
| c02 | A4 | 1 | session 16.057, weekly_all 3.696, weekly_scoped/Fable 0.825 |
| c02 | A4 | 2 | session 15.982, weekly_all 3.679, weekly_scoped/Fable 0.821 |
| c02 | A4 | 3 | session 15.823, weekly_all 3.642, weekly_scoped/Fable 0.813 |
| c02 | A5 | 1 | session 16.026, weekly_all 3.689, weekly_scoped/Fable 0.823 |
| c02 | A5 | 2 | session 16.143, weekly_all 3.716, weekly_scoped/Fable 0.829 |
| c02 | A5 | 3 | session 16.014, weekly_all 3.686, weekly_scoped/Fable 0.823 |
| c03 | A0 | 1 | session 67.542, weekly_scoped/Fable 0.805 |
| c03 | A0 | 2 | session 67.728, weekly_scoped/Fable 0.807 |
| c03 | A0 | 3 | session 67.852, weekly_scoped/Fable 0.808 |
| c03 | A1 | 1 | session 51.407, weekly_scoped/Fable 0.612 |
| c03 | A1 | 2 | session 51.471, weekly_scoped/Fable 0.613 |
| c03 | A1 | 3 | session 51.560, weekly_scoped/Fable 0.614 |
| c03 | A2 | 1 | session 51.771, weekly_scoped/Fable 0.617 |
| c03 | A2 | 2 | session 52.378, weekly_scoped/Fable 0.624 |
| c03 | A2 | 3 | session 52.042, weekly_scoped/Fable 0.620 |
| c03 | A3 | 1 | session 52.253, weekly_scoped/Fable 0.622 |
| c03 | A3 | 2 | session 52.186, weekly_scoped/Fable 0.622 |
| c03 | A3 | 3 | session 52.035, weekly_scoped/Fable 0.620 |
| c03 | A4 | 1 | session 52.321, weekly_scoped/Fable 0.623 |
| c03 | A4 | 2 | session 51.822, weekly_scoped/Fable 0.617 |
| c03 | A4 | 3 | session 52.132, weekly_scoped/Fable 0.621 |
| c03 | A5 | 1 | session 52.351, weekly_scoped/Fable 0.624 |
| c03 | A5 | 2 | session 52.515, weekly_scoped/Fable 0.626 |
| c03 | A5 | 3 | session 52.202, weekly_scoped/Fable 0.622 |
| c04 | A0 | 1 | session 32.988, weekly_scoped/Fable 0.393 |
| c04 | A0 | 2 | session 32.992, weekly_scoped/Fable 0.393 |
| c04 | A0 | 3 | session 33.304, weekly_scoped/Fable 0.397 |
| c04 | A1 | 1 | session 25.372, weekly_scoped/Fable 0.302 |
| c04 | A1 | 2 | session 25.733, weekly_scoped/Fable 0.307 |
| c04 | A1 | 3 | session 25.396, weekly_scoped/Fable 0.303 |
| c04 | A2 | 1 | session 26.987, weekly_scoped/Fable 0.321 |
| c04 | A2 | 2 | session 27.101, weekly_scoped/Fable 0.323 |
| c04 | A2 | 3 | session 39.288, weekly_scoped/Fable 0.468 |
| c04 | A3 | 1 | session 27.878, weekly_scoped/Fable 0.332 |
| c04 | A3 | 2 | session 38.907, weekly_scoped/Fable 0.463 |
| c04 | A3 | 3 | session 38.116, weekly_scoped/Fable 0.454 |
| c04 | A4 | 1 | session 40.018, weekly_scoped/Fable 0.477 |
| c04 | A4 | 2 | session 42.708, weekly_scoped/Fable 0.509 |
| c04 | A4 | 3 | session 28.461, weekly_scoped/Fable 0.339 |
| c04 | A5 | 1 | session 26.579, weekly_scoped/Fable 0.317 |
| c04 | A5 | 2 | session 27.902, weekly_scoped/Fable 0.332 |
| c04 | A5 | 3 | session 30.229, weekly_scoped/Fable 0.360 |
| c05 | A0 | 1 | session 76.539, weekly_scoped/Fable 2.038 |
| c05 | A0 | 2 | session 76.367, weekly_scoped/Fable 2.034 |
| c05 | A0 | 3 | session 76.301, weekly_scoped/Fable 2.032 |
| c05 | A1 | 1 | session 60.614, weekly_scoped/Fable 1.614 |
| c05 | A1 | 2 | session 60.665, weekly_scoped/Fable 1.616 |
| c05 | A1 | 3 | session 60.649, weekly_scoped/Fable 1.615 |
| c05 | A2 | 1 | session 61.215, weekly_scoped/Fable 1.630 |
| c05 | A2 | 2 | session 63.709, weekly_scoped/Fable 1.697 |
| c05 | A2 | 3 | session 61.722, weekly_scoped/Fable 1.644 |
| c05 | A3 | 1 | session 64.232, weekly_scoped/Fable 1.711 |
| c05 | A3 | 2 | session 61.726, weekly_scoped/Fable 1.644 |
| c05 | A3 | 3 | session 64.212, weekly_scoped/Fable 1.710 |
| c05 | A4 | 1 | session 61.153, weekly_scoped/Fable 1.629 |
| c05 | A4 | 2 | session 62.586, weekly_scoped/Fable 1.667 |
| c05 | A4 | 3 | session 63.320, weekly_scoped/Fable 1.686 |
| c05 | A5 | 1 | session 61.493, weekly_scoped/Fable 1.638 |
| c05 | A5 | 2 | session 62.231, weekly_scoped/Fable 1.657 |
| c05 | A5 | 3 | session 62.173, weekly_scoped/Fable 1.656 |
| c06 | A0 | 1 | session 8.155, weekly_all –, weekly_scoped/Fable 0.089 |
| c06 | A0 | 2 | session 8.193, weekly_all –, weekly_scoped/Fable 0.090 |
| c06 | A0 | 3 | session 8.942, weekly_all –, weekly_scoped/Fable 0.098 |
| c06 | A1 | 1 | session 5.292, weekly_all –, weekly_scoped/Fable 0.058 |
| c06 | A1 | 2 | session 5.593, weekly_all –, weekly_scoped/Fable 0.061 |
| c06 | A1 | 3 | session 5.452, weekly_all –, weekly_scoped/Fable 0.060 |
| c06 | A2 | 1 | session 5.957, weekly_all –, weekly_scoped/Fable 0.065 |
| c06 | A2 | 2 | session 5.445, weekly_all –, weekly_scoped/Fable 0.060 |
| c06 | A2 | 3 | session 5.405, weekly_all –, weekly_scoped/Fable 0.059 |
| c06 | A3 | 1 | session 6.782, weekly_all –, weekly_scoped/Fable 0.074 |
| c06 | A3 | 2 | session 7.656, weekly_all –, weekly_scoped/Fable 0.084 |
| c06 | A3 | 3 | session 5.480, weekly_all –, weekly_scoped/Fable 0.060 |
| c06 | A4 | 1 | session 6.102, weekly_all –, weekly_scoped/Fable 0.067 |
| c06 | A4 | 2 | session 5.973, weekly_all –, weekly_scoped/Fable 0.065 |
| c06 | A4 | 3 | session 5.498, weekly_all –, weekly_scoped/Fable 0.060 |
| c06 | A5 | 1 | session 6.152, weekly_all –, weekly_scoped/Fable 0.067 |
| c06 | A5 | 2 | session 5.910, weekly_all –, weekly_scoped/Fable 0.065 |
| c06 | A5 | 3 | session 6.244, weekly_all –, weekly_scoped/Fable 0.068 |
| c07 | A0 | 1 | session 9.180, weekly_scoped/Fable 0.133 |
| c07 | A0 | 2 | session 9.182, weekly_scoped/Fable 0.133 |
| c07 | A0 | 3 | session 9.485, weekly_scoped/Fable 0.138 |
| c07 | A1 | 1 | session 5.535, weekly_scoped/Fable 0.080 |
| c07 | A1 | 2 | session 5.575, weekly_scoped/Fable 0.081 |
| c07 | A1 | 3 | session 5.536, weekly_scoped/Fable 0.080 |
| c07 | A2 | 1 | session 5.195, weekly_scoped/Fable 0.075 |
| c07 | A2 | 2 | session 5.255, weekly_scoped/Fable 0.076 |
| c07 | A2 | 3 | session 5.308, weekly_scoped/Fable 0.077 |
| c07 | A3 | 1 | session 5.218, weekly_scoped/Fable 0.076 |
| c07 | A3 | 2 | session 5.186, weekly_scoped/Fable 0.075 |
| c07 | A3 | 3 | session 5.201, weekly_scoped/Fable 0.076 |
| c07 | A4 | 1 | session 5.242, weekly_scoped/Fable 0.076 |
| c07 | A4 | 2 | session 5.436, weekly_scoped/Fable 0.079 |
| c07 | A4 | 3 | session 5.236, weekly_scoped/Fable 0.076 |
| c07 | A5 | 1 | session 5.259, weekly_scoped/Fable 0.076 |
| c07 | A5 | 2 | session 5.281, weekly_scoped/Fable 0.077 |
| c07 | A5 | 3 | session 5.277, weekly_scoped/Fable 0.077 |
| c08 | A0 | 1 | session 8.303, weekly_scoped/Fable 0.121 |
| c08 | A0 | 2 | session 8.300, weekly_scoped/Fable 0.121 |
| c08 | A0 | 3 | session 8.301, weekly_scoped/Fable 0.121 |
| c08 | A1 | 1 | session 6.297, weekly_scoped/Fable 0.091 |
| c08 | A1 | 2 | session 6.306, weekly_scoped/Fable 0.092 |
| c08 | A1 | 3 | session 6.327, weekly_scoped/Fable 0.092 |
| c08 | A2 | 1 | session 5.756, weekly_scoped/Fable 0.084 |
| c08 | A2 | 2 | session 5.748, weekly_scoped/Fable 0.084 |
| c08 | A2 | 3 | session 5.758, weekly_scoped/Fable 0.084 |
| c08 | A3 | 1 | session 5.778, weekly_scoped/Fable 0.084 |
| c08 | A3 | 2 | session 5.874, weekly_scoped/Fable 0.085 |
| c08 | A3 | 3 | session 5.791, weekly_scoped/Fable 0.084 |
| c08 | A4 | 1 | session 5.885, weekly_scoped/Fable 0.085 |
| c08 | A4 | 2 | session 5.880, weekly_scoped/Fable 0.085 |
| c08 | A4 | 3 | session 5.882, weekly_scoped/Fable 0.085 |
| c08 | A5 | 1 | session 5.896, weekly_scoped/Fable 0.086 |
| c08 | A5 | 2 | session 5.883, weekly_scoped/Fable 0.085 |
| c08 | A5 | 3 | session 5.871, weekly_scoped/Fable 0.085 |
| c09 | A0 | 1 | session 1.153, weekly_all 0.265, weekly_scoped/Fable 0.059 |
| c09 | A0 | 2 | session 1.180, weekly_all 0.272, weekly_scoped/Fable 0.061 |
| c09 | A0 | 3 | session 1.232, weekly_all 0.284, weekly_scoped/Fable 0.063 |
| c09 | A0 | 4 | session 1.098, weekly_all 0.253, weekly_scoped/Fable 0.056 |
| c09 | A0 | 5 | session 1.453, weekly_all 0.334, weekly_scoped/Fable 0.075 |
| c09 | A1 | 1 | session 0.715, weekly_all 0.165, weekly_scoped/Fable 0.037 |
| c09 | A1 | 2 | session 0.804, weekly_all 0.185, weekly_scoped/Fable 0.041 |
| c09 | A1 | 3 | session 1.833, weekly_all 0.422, weekly_scoped/Fable 0.094 |
| c09 | A2 | 1 | session 0.343, weekly_all 0.079, weekly_scoped/Fable 0.018 |
| c09 | A2 | 2 | session 0.402, weekly_all 0.092, weekly_scoped/Fable 0.021 |
| c09 | A2 | 3 | session 0.534, weekly_all 0.123, weekly_scoped/Fable 0.027 |
| c09 | A3 | 1 | session 0.506, weekly_all 0.116, weekly_scoped/Fable 0.026 |
| c09 | A3 | 2 | session 0.526, weekly_all 0.121, weekly_scoped/Fable 0.027 |
| c09 | A3 | 3 | session 0.328, weekly_all 0.075, weekly_scoped/Fable 0.017 |
| c09 | A4 | 1 | session 0.537, weekly_all 0.124, weekly_scoped/Fable 0.028 |
| c09 | A4 | 2 | session 0.636, weekly_all 0.146, weekly_scoped/Fable 0.033 |
| c09 | A4 | 3 | session 0.489, weekly_all 0.113, weekly_scoped/Fable 0.025 |
| c09 | A5 | 1 | session 0.482, weekly_all 0.111, weekly_scoped/Fable 0.025 |
| c09 | A5 | 2 | session 0.633, weekly_all 0.146, weekly_scoped/Fable 0.033 |
| c09 | A5 | 3 | session 0.555, weekly_all 0.128, weekly_scoped/Fable 0.029 |
| c10 | A0 | 1 | session 32.507, weekly_all 7.483, weekly_scoped/Fable 1.670 |
| c10 | A0 | 2 | session 32.613, weekly_all 7.507, weekly_scoped/Fable 1.675 |
| c10 | A0 | 3 | session 32.616, weekly_all 7.508, weekly_scoped/Fable 1.675 |
| c10 | A1 | 1 | session 23.066, weekly_all 5.310, weekly_scoped/Fable 1.185 |
| c10 | A1 | 2 | session 23.104, weekly_all 5.318, weekly_scoped/Fable 1.187 |
| c10 | A1 | 3 | session 23.079, weekly_all 5.313, weekly_scoped/Fable 1.185 |
| c10 | A2 | 1 | session 22.926, weekly_all 5.278, weekly_scoped/Fable 1.178 |
| c10 | A2 | 2 | session 22.935, weekly_all 5.279, weekly_scoped/Fable 1.178 |
| c10 | A2 | 3 | session 22.967, weekly_all 5.287, weekly_scoped/Fable 1.180 |
| c10 | A3 | 1 | session 23.016, weekly_all 5.298, weekly_scoped/Fable 1.182 |
| c10 | A3 | 2 | session 23.000, weekly_all 5.295, weekly_scoped/Fable 1.181 |
| c10 | A3 | 3 | session 22.985, weekly_all 5.291, weekly_scoped/Fable 1.181 |
| c10 | A4 | 1 | session 23.033, weekly_all 5.302, weekly_scoped/Fable 1.183 |
| c10 | A4 | 2 | session 23.011, weekly_all 5.297, weekly_scoped/Fable 1.182 |
| c10 | A4 | 3 | session 23.058, weekly_all 5.308, weekly_scoped/Fable 1.184 |
| c10 | A5 | 1 | session 23.065, weekly_all 5.309, weekly_scoped/Fable 1.185 |
| c10 | A5 | 2 | session 23.028, weekly_all 5.301, weekly_scoped/Fable 1.183 |
| c10 | A5 | 3 | session 23.132, weekly_all 5.325, weekly_scoped/Fable 1.188 |
| c11 | A0 | 1 | session 17.357, weekly_scoped/Fable 0.381 |
| c11 | A0 | 2 | session 17.355, weekly_scoped/Fable 0.381 |
| c11 | A0 | 3 | session 17.357, weekly_scoped/Fable 0.381 |
| c11 | A1 | 1 | session 9.244, weekly_scoped/Fable 0.203 |
| c11 | A1 | 2 | session 9.183, weekly_scoped/Fable 0.202 |
| c11 | A1 | 3 | session 9.197, weekly_scoped/Fable 0.202 |
| c11 | A2 | 1 | session 11.453, weekly_scoped/Fable 0.251 |
| c11 | A2 | 2 | session 8.525, weekly_scoped/Fable 0.187 |
| c11 | A2 | 3 | session 10.988, weekly_scoped/Fable 0.241 |
| c11 | A3 | 1 | session 9.544, weekly_scoped/Fable 0.209 |
| c11 | A3 | 2 | session 9.764, weekly_scoped/Fable 0.214 |
| c11 | A3 | 3 | session 8.543, weekly_scoped/Fable 0.188 |
| c11 | A4 | 1 | session 8.652, weekly_scoped/Fable 0.190 |
| c11 | A4 | 2 | session 9.742, weekly_scoped/Fable 0.214 |
| c11 | A4 | 3 | session 11.289, weekly_scoped/Fable 0.248 |
| c11 | A5 | 1 | session 9.422, weekly_scoped/Fable 0.207 |
| c11 | A5 | 2 | session 11.167, weekly_scoped/Fable 0.245 |
| c11 | A5 | 3 | session 8.754, weekly_scoped/Fable 0.192 |
| c12 | A0 | 1 | session 14.197, weekly_scoped/Fable 0.206 |
| c12 | A0 | 2 | session 13.727, weekly_scoped/Fable 0.199 |
| c12 | A0 | 3 | session 13.813, weekly_scoped/Fable 0.201 |
| c12 | A1 | 1 | session 7.672, weekly_scoped/Fable 0.111 |
| c12 | A1 | 2 | session 7.693, weekly_scoped/Fable 0.112 |
| c12 | A1 | 3 | session 7.660, weekly_scoped/Fable 0.111 |
| c12 | A2 | 1 | session 8.141, weekly_scoped/Fable 0.118 |
| c12 | A2 | 2 | session 11.146, weekly_scoped/Fable 0.162 |
| c12 | A2 | 3 | session 8.077, weekly_scoped/Fable 0.117 |
| c12 | A3 | 1 | session 7.881, weekly_scoped/Fable 0.114 |
| c12 | A3 | 2 | session 7.681, weekly_scoped/Fable 0.112 |
| c12 | A3 | 3 | session 7.832, weekly_scoped/Fable 0.114 |
| c12 | A4 | 1 | session 7.501, weekly_scoped/Fable 0.109 |
| c12 | A4 | 2 | session 7.525, weekly_scoped/Fable 0.109 |
| c12 | A4 | 3 | session 7.561, weekly_scoped/Fable 0.110 |
| c12 | A5 | 1 | session 8.386, weekly_scoped/Fable 0.122 |
| c12 | A5 | 2 | session 7.746, weekly_scoped/Fable 0.113 |
| c12 | A5 | 3 | session 8.107, weekly_scoped/Fable 0.118 |
| c13 | A0 | 1 | session 32.043, weekly_scoped/Fable 0.382 |
| c13 | A0 | 2 | session 32.204, weekly_scoped/Fable 0.384 |
| c13 | A0 | 3 | session 31.260, weekly_scoped/Fable 0.372 |
| c13 | A1 | 1 | session 21.093, weekly_scoped/Fable 0.251 |
| c13 | A1 | 2 | session 18.829, weekly_scoped/Fable 0.224 |
| c13 | A1 | 3 | session 20.430, weekly_scoped/Fable 0.243 |
| c13 | A2 | 1 | session 17.805, weekly_scoped/Fable 0.212 |
| c13 | A2 | 2 | session 18.037, weekly_scoped/Fable 0.215 |
| c13 | A2 | 3 | session 17.864, weekly_scoped/Fable 0.213 |
| c13 | A3 | 1 | session 17.905, weekly_scoped/Fable 0.213 |
| c13 | A3 | 2 | session 17.984, weekly_scoped/Fable 0.214 |
| c13 | A3 | 3 | session 18.098, weekly_scoped/Fable 0.216 |
| c13 | A4 | 1 | session 17.725, weekly_scoped/Fable 0.211 |
| c13 | A4 | 2 | session 18.173, weekly_scoped/Fable 0.216 |
| c13 | A4 | 3 | session 18.292, weekly_scoped/Fable 0.218 |
| c13 | A5 | 1 | session 17.878, weekly_scoped/Fable 0.213 |
| c13 | A5 | 2 | session 18.111, weekly_scoped/Fable 0.216 |
| c13 | A5 | 3 | session 18.072, weekly_scoped/Fable 0.215 |
| c14 | A0 | 1 | session 60.127, weekly_scoped/Fable 0.716 |
| c14 | A0 | 2 | session 60.091, weekly_scoped/Fable 0.716 |
| c14 | A0 | 3 | session 61.219, weekly_scoped/Fable 0.729 |
| c14 | A1 | 1 | session 35.812, weekly_scoped/Fable 0.427 |
| c14 | A1 | 2 | session 36.231, weekly_scoped/Fable 0.432 |
| c14 | A1 | 3 | session 36.676, weekly_scoped/Fable 0.437 |
| c14 | A2 | 1 | session 38.787, weekly_scoped/Fable 0.462 |
| c14 | A2 | 2 | session 39.768, weekly_scoped/Fable 0.474 |
| c14 | A2 | 3 | session 41.229, weekly_scoped/Fable 0.491 |
| c14 | A3 | 1 | session 41.819, weekly_scoped/Fable 0.498 |
| c14 | A3 | 2 | session 42.217, weekly_scoped/Fable 0.503 |
| c14 | A3 | 3 | session 48.030, weekly_scoped/Fable 0.572 |
| c14 | A4 | 1 | session 39.049, weekly_scoped/Fable 0.465 |
| c14 | A4 | 2 | session 39.640, weekly_scoped/Fable 0.472 |
| c14 | A4 | 3 | session 44.384, weekly_scoped/Fable 0.529 |
| c14 | A5 | 1 | session 38.510, weekly_scoped/Fable 0.459 |
| c14 | A5 | 2 | session 38.085, weekly_scoped/Fable 0.454 |
| c14 | A5 | 3 | session 40.709, weekly_scoped/Fable 0.485 |
| c15 | A0 | 1 | session 13.523, weekly_all –, weekly_scoped/Fable 0.148 |
| c15 | A0 | 2 | session 13.622, weekly_all –, weekly_scoped/Fable 0.149 |
| c15 | A0 | 3 | session 13.906, weekly_all –, weekly_scoped/Fable 0.152 |
| c15 | A1 | 1 | session 7.723, weekly_all –, weekly_scoped/Fable 0.085 |
| c15 | A1 | 2 | session 7.555, weekly_all –, weekly_scoped/Fable 0.083 |
| c15 | A1 | 3 | session 8.430, weekly_all –, weekly_scoped/Fable 0.092 |
| c15 | A2 | 1 | session 7.318, weekly_all –, weekly_scoped/Fable 0.080 |
| c15 | A2 | 2 | session 7.827, weekly_all –, weekly_scoped/Fable 0.086 |
| c15 | A2 | 3 | session 7.587, weekly_all –, weekly_scoped/Fable 0.083 |
| c15 | A3 | 1 | session 7.698, weekly_all –, weekly_scoped/Fable 0.084 |
| c15 | A3 | 2 | session 7.258, weekly_all –, weekly_scoped/Fable 0.079 |
| c15 | A3 | 3 | session 7.449, weekly_all –, weekly_scoped/Fable 0.082 |
| c15 | A4 | 1 | session 7.585, weekly_all –, weekly_scoped/Fable 0.083 |
| c15 | A4 | 2 | session 7.497, weekly_all –, weekly_scoped/Fable 0.082 |
| c15 | A4 | 3 | session 7.603, weekly_all –, weekly_scoped/Fable 0.083 |
| c15 | A5 | 1 | session 7.742, weekly_all –, weekly_scoped/Fable 0.085 |
| c15 | A5 | 2 | session 7.453, weekly_all –, weekly_scoped/Fable 0.082 |
| c15 | A5 | 3 | session 7.520, weekly_all –, weekly_scoped/Fable 0.082 |
| c16 | A0 | 1 | session 21.524, weekly_scoped/Fable 0.472 |
| c16 | A0 | 2 | session 21.033, weekly_scoped/Fable 0.462 |
| c16 | A0 | 3 | session 21.909, weekly_scoped/Fable 0.481 |
| c16 | A1 | 1 | session 12.858, weekly_scoped/Fable 0.282 |
| c16 | A1 | 2 | session 12.830, weekly_scoped/Fable 0.282 |
| c16 | A1 | 3 | session 13.101, weekly_scoped/Fable 0.288 |
| c16 | A2 | 1 | session 14.162, weekly_scoped/Fable 0.311 |
| c16 | A2 | 2 | session 14.869, weekly_scoped/Fable 0.326 |
| c16 | A2 | 3 | session 13.020, weekly_scoped/Fable 0.286 |
| c16 | A3 | 1 | session 20.168, weekly_scoped/Fable 0.443 |
| c16 | A3 | 2 | session 12.938, weekly_scoped/Fable 0.284 |
| c16 | A3 | 3 | session 12.528, weekly_scoped/Fable 0.275 |
| c16 | A4 | 1 | session 12.849, weekly_scoped/Fable 0.282 |
| c16 | A4 | 2 | session 12.956, weekly_scoped/Fable 0.284 |
| c16 | A4 | 3 | session 12.803, weekly_scoped/Fable 0.281 |
| c16 | A5 | 1 | session 13.902, weekly_scoped/Fable 0.305 |
| c16 | A5 | 2 | session 12.972, weekly_scoped/Fable 0.285 |
| c16 | A5 | 3 | session 13.062, weekly_scoped/Fable 0.287 |
| c17 | A0 | 1 | session 11.536, weekly_all –, weekly_scoped/Fable 0.126 |
| c17 | A0 | 2 | session 11.535, weekly_all –, weekly_scoped/Fable 0.126 |
| c17 | A0 | 3 | session 11.537, weekly_all –, weekly_scoped/Fable 0.126 |
| c17 | A1 | 1 | session 4.908, weekly_all –, weekly_scoped/Fable 0.054 |
| c17 | A1 | 2 | session 4.928, weekly_all –, weekly_scoped/Fable 0.054 |
| c17 | A1 | 3 | session 4.978, weekly_all –, weekly_scoped/Fable 0.055 |
| c17 | A2 | 1 | session 3.426, weekly_all –, weekly_scoped/Fable 0.038 |
| c17 | A2 | 2 | session 3.345, weekly_all –, weekly_scoped/Fable 0.037 |
| c17 | A2 | 3 | session 3.310, weekly_all –, weekly_scoped/Fable 0.036 |
| c17 | A6 | 1 | session 3.494, weekly_all –, weekly_scoped/Fable 0.038 |
| c17 | A6 | 2 | session 3.380, weekly_all –, weekly_scoped/Fable 0.037 |
| c17 | A6 | 3 | session 3.430, weekly_all –, weekly_scoped/Fable 0.038 |
| c18 | A0 | 1 | session 10.107, weekly_all –, weekly_scoped/Fable 0.111 |
| c18 | A0 | 2 | session 10.324, weekly_all –, weekly_scoped/Fable 0.113 |
| c18 | A0 | 3 | session 10.197, weekly_all –, weekly_scoped/Fable 0.112 |
| c18 | A1 | 1 | session 6.171, weekly_all –, weekly_scoped/Fable 0.068 |
| c18 | A1 | 2 | session 6.354, weekly_all –, weekly_scoped/Fable 0.070 |
| c18 | A1 | 3 | session 6.117, weekly_all –, weekly_scoped/Fable 0.067 |
| c18 | A2 | 1 | session 4.436, weekly_all –, weekly_scoped/Fable 0.049 |
| c18 | A2 | 2 | session 5.244, weekly_all –, weekly_scoped/Fable 0.057 |
| c18 | A2 | 3 | session 4.487, weekly_all –, weekly_scoped/Fable 0.049 |
| c18 | A6 | 1 | session 4.695, weekly_all –, weekly_scoped/Fable 0.051 |
| c18 | A6 | 2 | session 4.845, weekly_all –, weekly_scoped/Fable 0.053 |
| c18 | A6 | 3 | session 4.888, weekly_all –, weekly_scoped/Fable 0.054 |
| c19 | A0 | 1 | session 60.973, weekly_all 14.036, weekly_scoped/Fable 3.132 |
| c19 | A0 | 2 | session 60.979, weekly_all 14.037, weekly_scoped/Fable 3.132 |
| c19 | A0 | 3 | session 60.966, weekly_all 14.034, weekly_scoped/Fable 3.132 |
| c19 | A0 | 4 | session 61.050, weekly_all 14.054, weekly_scoped/Fable 3.136 |
| c19 | A0 | 5 | session 61.042, weekly_all 14.052, weekly_scoped/Fable 3.135 |
| c19 | A1 | 1 | session 24.557, weekly_all 5.653, weekly_scoped/Fable 1.261 |
| c19 | A1 | 2 | session 24.777, weekly_all 5.704, weekly_scoped/Fable 1.273 |
| c19 | A1 | 3 | session 24.624, weekly_all 5.668, weekly_scoped/Fable 1.265 |
| c19 | A2 | 1 | session 26.802, weekly_all 6.170, weekly_scoped/Fable 1.377 |
| c19 | A2 | 2 | session 25.431, weekly_all 5.854, weekly_scoped/Fable 1.306 |
| c19 | A2 | 3 | session 27.027, weekly_all 6.221, weekly_scoped/Fable 1.388 |
| c19 | A3 | 1 | session 27.127, weekly_all 6.245, weekly_scoped/Fable 1.393 |
| c19 | A3 | 2 | session 26.270, weekly_all 6.047, weekly_scoped/Fable 1.349 |
| c19 | A3 | 3 | session 26.279, weekly_all 6.049, weekly_scoped/Fable 1.350 |
| c19 | A4 | 1 | session 26.168, weekly_all 6.024, weekly_scoped/Fable 1.344 |
| c19 | A4 | 2 | session 25.407, weekly_all 5.849, weekly_scoped/Fable 1.305 |
| c19 | A4 | 3 | session 26.811, weekly_all 6.172, weekly_scoped/Fable 1.377 |
| c19 | A5 | 1 | session 25.573, weekly_all 5.887, weekly_scoped/Fable 1.314 |
| c19 | A5 | 2 | session 25.198, weekly_all 5.800, weekly_scoped/Fable 1.294 |
| c19 | A5 | 3 | session 25.331, weekly_all 5.831, weekly_scoped/Fable 1.301 |
| c20 | A1 | 1 | session 9.090, weekly_all 2.093, weekly_scoped/Fable 0.467 |
| c20 | A1 | 2 | session 9.259, weekly_all 2.131, weekly_scoped/Fable 0.476 |
| c20 | A1 | 3 | session 9.295, weekly_all 2.140, weekly_scoped/Fable 0.477 |
| c20 | A2 | 1 | session 8.618, weekly_all 1.984, weekly_scoped/Fable 0.443 |
| c20 | A2 | 2 | session 9.535, weekly_all 2.195, weekly_scoped/Fable 0.490 |
| c20 | A2 | 3 | session 8.697, weekly_all 2.002, weekly_scoped/Fable 0.447 |
| c20 | A3 | 1 | session 8.663, weekly_all 1.994, weekly_scoped/Fable 0.445 |
| c20 | A3 | 2 | session 9.549, weekly_all 2.198, weekly_scoped/Fable 0.490 |
| c20 | A3 | 3 | session 8.714, weekly_all 2.006, weekly_scoped/Fable 0.448 |
| c20 | A4 | 1 | session 9.470, weekly_all 2.180, weekly_scoped/Fable 0.486 |
| c20 | A4 | 2 | session 8.668, weekly_all 1.995, weekly_scoped/Fable 0.445 |
| c20 | A4 | 3 | session 8.943, weekly_all 2.059, weekly_scoped/Fable 0.459 |
| c20 | A5 | 1 | session 8.648, weekly_all 1.991, weekly_scoped/Fable 0.444 |
| c20 | A5 | 2 | session 8.794, weekly_all 2.024, weekly_scoped/Fable 0.452 |
| c20 | A5 | 3 | session 8.771, weekly_all 2.019, weekly_scoped/Fable 0.451 |
| c21 | A0 | 1 | session 1.203, weekly_all 0.172, weekly_scoped/Fable 0.059 |
| c21 | A0 | 2 | session 1.205, weekly_all 0.173, weekly_scoped/Fable 0.059 |
| c21 | A0 | 3 | session 2.088, weekly_all 0.299, weekly_scoped/Fable 0.102 |
| c21 | A1 | 1 | session 1.021, weekly_all 0.146, weekly_scoped/Fable 0.050 |
| c21 | A1 | 2 | session 0.914, weekly_all 0.131, weekly_scoped/Fable 0.045 |
| c21 | A1 | 3 | session 0.937, weekly_all 0.134, weekly_scoped/Fable 0.046 |
| c21 | A2 | 1 | session 0.402, weekly_all 0.058, weekly_scoped/Fable 0.020 |
| c21 | A2 | 2 | session 0.348, weekly_all 0.050, weekly_scoped/Fable 0.017 |
| c21 | A2 | 3 | session 0.305, weekly_all 0.044, weekly_scoped/Fable 0.015 |
| c21 | A3 | 1 | session 0.336, weekly_all 0.048, weekly_scoped/Fable 0.016 |
| c21 | A3 | 2 | session 0.365, weekly_all 0.052, weekly_scoped/Fable 0.018 |
| c21 | A3 | 3 | session 0.290, weekly_all 0.042, weekly_scoped/Fable 0.014 |
| c21 | A4 | 1 | session 0.552, weekly_all 0.079, weekly_scoped/Fable 0.027 |
| c21 | A4 | 2 | session 0.461, weekly_all 0.066, weekly_scoped/Fable 0.023 |
| c21 | A4 | 3 | session 0.505, weekly_all 0.072, weekly_scoped/Fable 0.025 |
| c21 | A5 | 1 | session 0.632, weekly_all 0.091, weekly_scoped/Fable 0.031 |
| c21 | A5 | 2 | session 0.517, weekly_all 0.074, weekly_scoped/Fable 0.025 |
| c21 | A5 | 3 | session 0.456, weekly_all 0.065, weekly_scoped/Fable 0.022 |
| c22 | A0 | 1 | session 23.348, weekly_scoped/Fable 0.622 |
| c22 | A0 | 2 | session 24.454, weekly_scoped/Fable 0.651 |
| c22 | A0 | 3 | session 23.516, weekly_scoped/Fable 0.626 |
| c22 | A1 | 1 | session 6.985, weekly_scoped/Fable 0.186 |
| c22 | A1 | 2 | session 6.967, weekly_scoped/Fable 0.186 |
| c22 | A1 | 3 | session 7.199, weekly_scoped/Fable 0.192 |
| c22 | A2 | 1 | session 5.878, weekly_scoped/Fable 0.157 |
| c22 | A2 | 2 | session 5.919, weekly_scoped/Fable 0.158 |
| c22 | A2 | 3 | session 6.487, weekly_scoped/Fable 0.173 |
| c22 | A3 | 1 | session 5.646, weekly_scoped/Fable 0.150 |
| c22 | A3 | 2 | session 5.615, weekly_scoped/Fable 0.150 |
| c22 | A3 | 3 | session 5.610, weekly_scoped/Fable 0.149 |
| c22 | A4 | 1 | session 6.324, weekly_scoped/Fable 0.168 |
| c22 | A4 | 2 | session 6.983, weekly_scoped/Fable 0.186 |
| c22 | A4 | 3 | session 6.522, weekly_scoped/Fable 0.174 |
| c22 | A5 | 1 | session 6.170, weekly_scoped/Fable 0.164 |
| c22 | A5 | 2 | session 6.124, weekly_scoped/Fable 0.163 |
| c22 | A5 | 3 | session 8.514, weekly_scoped/Fable 0.227 |
| c23 | A1 | 1 | session 21.628, weekly_all 4.979, weekly_scoped/Fable 1.111 |
| c23 | A1 | 2 | session 21.669, weekly_all 4.988, weekly_scoped/Fable 1.113 |
| c23 | A1 | 3 | session 21.691, weekly_all 4.993, weekly_scoped/Fable 1.114 |
| c23 | A2 | 1 | session 20.387, weekly_all 4.693, weekly_scoped/Fable 1.047 |
| c23 | A2 | 2 | session 20.220, weekly_all 4.655, weekly_scoped/Fable 1.039 |
| c23 | A2 | 3 | session 20.690, weekly_all 4.763, weekly_scoped/Fable 1.063 |
| c23 | A3 | 1 | session 20.237, weekly_all 4.658, weekly_scoped/Fable 1.039 |
| c23 | A3 | 2 | session 20.219, weekly_all 4.654, weekly_scoped/Fable 1.039 |
| c23 | A3 | 3 | session 20.207, weekly_all 4.652, weekly_scoped/Fable 1.038 |
| c23 | A4 | 1 | session 20.508, weekly_all 4.721, weekly_scoped/Fable 1.053 |
| c23 | A4 | 2 | session 20.449, weekly_all 4.707, weekly_scoped/Fable 1.050 |
| c23 | A4 | 3 | session 20.927, weekly_all 4.817, weekly_scoped/Fable 1.075 |
| c23 | A5 | 1 | session 20.446, weekly_all 4.707, weekly_scoped/Fable 1.050 |
| c23 | A5 | 2 | session 21.215, weekly_all 4.884, weekly_scoped/Fable 1.090 |
| c23 | A5 | 3 | session 20.394, weekly_all 4.695, weekly_scoped/Fable 1.048 |
| c24 | A0 | 1 | session 14.972, weekly_all 3.447, weekly_scoped/Fable 0.769 |
| c24 | A0 | 2 | session 14.885, weekly_all 3.427, weekly_scoped/Fable 0.765 |
| c24 | A0 | 3 | session 14.889, weekly_all 3.427, weekly_scoped/Fable 0.765 |
| c24 | A1 | 1 | session 3.760, weekly_all 0.866, weekly_scoped/Fable 0.193 |
| c24 | A1 | 2 | session 3.721, weekly_all 0.857, weekly_scoped/Fable 0.191 |
| c24 | A1 | 3 | session 3.659, weekly_all 0.842, weekly_scoped/Fable 0.188 |
| c24 | A2 | 1 | session 2.965, weekly_all 0.682, weekly_scoped/Fable 0.152 |
| c24 | A2 | 2 | session 2.857, weekly_all 0.658, weekly_scoped/Fable 0.147 |
| c24 | A2 | 3 | session 2.798, weekly_all 0.644, weekly_scoped/Fable 0.144 |
| c24 | A3 | 1 | session 2.867, weekly_all 0.660, weekly_scoped/Fable 0.147 |
| c24 | A3 | 2 | session 2.871, weekly_all 0.661, weekly_scoped/Fable 0.147 |
| c24 | A3 | 3 | session 2.900, weekly_all 0.668, weekly_scoped/Fable 0.149 |
| c24 | A4 | 1 | session 3.074, weekly_all 0.708, weekly_scoped/Fable 0.158 |
| c24 | A4 | 2 | session 3.189, weekly_all 0.734, weekly_scoped/Fable 0.164 |
| c24 | A4 | 3 | session 3.031, weekly_all 0.698, weekly_scoped/Fable 0.156 |
| c24 | A5 | 1 | session 3.024, weekly_all 0.696, weekly_scoped/Fable 0.155 |
| c24 | A5 | 2 | session 3.349, weekly_all 0.771, weekly_scoped/Fable 0.172 |
| c24 | A5 | 3 | session 3.021, weekly_all 0.695, weekly_scoped/Fable 0.155 |

## 4. Noise floor (A0 run 1 against the other A0 runs of the same cut, wherever A0 has repeats)

Floor cuts: c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c21, c22, c24. Absolute spreads (Opus): 0.25, 0.00, 1.00, 0.25, 0.25, 0.00, 0.50, 0.50, 0.00, 0.00, 0.75, 0.50, 0.00, 0.75, 0.00, 0.00, 0.00, 0.75, 0.25, 0.00, 0.25, 0.25, 0.25, 0.00, 0.75, 0.75, 0.50, 0.00, 0.75, 0.75, 0.25, 0.25, 0.25, 0.00, 0.25, 0.50, 0.00, 0.00, 1.25, 0.75, 1.00, 0.00, 0.25, 0.75, 0.25, 0.25, 0.50, 0.25, 0.75, 0.75; 95th percentile 0.75; floor used 0.75.

| cut | run | judge | outcome(s) |
|---|---|---|---|
| c01 | 2 | opus | loss, win |
| c01 | 2 | sonnet | win |
| c01 | 3 | opus | loss |
| c01 | 3 | sonnet | win |
| c01 | 4 | opus | loss, win |
| c01 | 4 | sonnet | loss, win |
| c01 | 5 | opus | win |
| c01 | 5 | sonnet | loss |
| c02 | 2 | opus | loss |
| c02 | 2 | sonnet | loss |
| c02 | 3 | opus | win |
| c02 | 3 | sonnet | loss |
| c03 | 2 | opus | win |
| c03 | 2 | sonnet | win |
| c03 | 3 | opus | win |
| c03 | 3 | sonnet | loss, win |
| c04 | 2 | opus | loss, win |
| c04 | 2 | sonnet | win |
| c04 | 3 | opus | loss |
| c04 | 3 | sonnet | loss, win |
| c05 | 2 | opus | loss |
| c05 | 2 | sonnet | loss |
| c05 | 3 | opus | loss, tie |
| c05 | 3 | sonnet | loss, tie |
| c06 | 2 | opus | loss, win |
| c06 | 2 | sonnet | loss, tie |
| c06 | 3 | opus | loss |
| c06 | 3 | sonnet | loss |
| c07 | 2 | opus | loss, tie |
| c07 | 2 | sonnet | win |
| c07 | 3 | opus | win |
| c07 | 3 | sonnet | loss, win |
| c08 | 2 | opus | tie |
| c08 | 2 | sonnet | loss, win |
| c08 | 3 | opus | loss |
| c08 | 3 | sonnet | loss |
| c09 | 2 | opus | loss |
| c09 | 2 | sonnet | loss |
| c09 | 3 | opus | loss, win |
| c09 | 3 | sonnet | loss, win |
| c09 | 4 | opus | loss |
| c09 | 4 | sonnet | win |
| c09 | 5 | opus | win |
| c09 | 5 | sonnet | loss |
| c10 | 2 | opus | win |
| c10 | 2 | sonnet | loss |
| c10 | 3 | opus | win |
| c10 | 3 | sonnet | win |
| c11 | 2 | opus | win |
| c11 | 2 | sonnet | win |
| c11 | 3 | opus | win |
| c11 | 3 | sonnet | win |
| c12 | 2 | opus | loss |
| c12 | 2 | sonnet | win |
| c12 | 3 | opus | loss, win |
| c12 | 3 | sonnet | loss, win |
| c13 | 2 | opus | win |
| c13 | 2 | sonnet | win |
| c13 | 3 | opus | win |
| c13 | 3 | sonnet | win |
| c14 | 2 | opus | tie |
| c14 | 2 | sonnet | tie |
| c14 | 3 | opus | win |
| c14 | 3 | sonnet | loss |
| c15 | 2 | opus | loss |
| c15 | 2 | sonnet | loss |
| c15 | 3 | opus | loss |
| c15 | 3 | sonnet | loss |
| c16 | 2 | opus | loss |
| c16 | 2 | sonnet | loss |
| c16 | 3 | opus | loss |
| c16 | 3 | sonnet | loss |
| c17 | 2 | opus | loss, win |
| c17 | 2 | sonnet | win |
| c17 | 3 | opus | win |
| c17 | 3 | sonnet | win |
| c18 | 2 | opus | loss, win |
| c18 | 2 | sonnet | loss |
| c18 | 3 | opus | win |
| c18 | 3 | sonnet | loss, win |
| c19 | 2 | opus | loss |
| c19 | 2 | sonnet | loss |
| c19 | 3 | opus | win |
| c19 | 3 | sonnet | win |
| c19 | 4 | opus | loss |
| c19 | 4 | sonnet | loss |
| c19 | 5 | opus | win |
| c19 | 5 | sonnet | win |
| c21 | 2 | opus | loss, tie |
| c21 | 2 | sonnet | loss |
| c21 | 3 | opus | win |
| c21 | 3 | sonnet | win |
| c22 | 2 | opus | loss |
| c22 | 2 | sonnet | loss |
| c22 | 3 | opus | win |
| c22 | 3 | sonnet | win |
| c24 | 2 | opus | loss |
| c24 | 2 | sonnet | loss |
| c24 | 3 | opus | loss |
| c24 | 3 | sonnet | loss |

## 5. Judge disagreements (Opus vs Sonnet)

| cut | arm | run | reading | Opus | Sonnet |
|---|---|---|---|---|---|
| c01 | A0 | 1 | absolute | 3.00 | 1.25 |
| c01 | A0 | 5 | absolute | 3.25 | 2.00 |
| c01 | A1 | 1 | absolute | 3.25 | 2.00 |
| c01 | A1 | 2 | pairwise | loss | tie |
| c01 | A1 | 3 | pairwise | tie | loss |
| c01 | A5 | 2 | absolute | 2.50 | 1.00 |
| c01 | A5 | 3 | pairwise | tie | loss |
| c02 | A1 | 1 | pairwise | win | tie |
| c02 | A1 | 3 | pairwise | tie | win |
| c02 | A2 | 2 | pairwise | loss | tie |
| c02 | A2 | 3 | absolute | 3.75 | 2.25 |
| c02 | A2 | 3 | pairwise | win | tie |
| c02 | A3 | 2 | pairwise | loss | tie |
| c02 | A3 | 3 | absolute | 3.25 | 1.50 |
| c02 | A3 | 3 | pairwise | loss | win |
| c02 | A4 | 1 | pairwise | loss | tie |
| c02 | A4 | 3 | pairwise | loss | tie |
| c02 | A5 | 1 | pairwise | tie | loss |
| c03 | A0 | 1 | absolute | 3.25 | 1.50 |
| c03 | A1 | 1 | absolute | 3.50 | 1.75 |
| c03 | A1 | 2 | absolute | 3.50 | 1.50 |
| c03 | A1 | 2 | pairwise | loss | tie |
| c03 | A1 | 3 | absolute | 2.75 | 1.50 |
| c03 | A1 | 3 | pairwise | loss | tie |
| c03 | A2 | 1 | pairwise | loss | tie |
| c03 | A3 | 2 | pairwise | loss | tie |
| c03 | A5 | 1 | pairwise | loss | tie |
| c03 | A5 | 3 | pairwise | loss | tie |
| c04 | A0 | 1 | absolute | 3.00 | 1.75 |
| c04 | A0 | 3 | absolute | 3.00 | 1.50 |
| c04 | A1 | 1 | pairwise | loss | tie |
| c04 | A1 | 2 | pairwise | win | loss |
| c04 | A1 | 3 | absolute | 4.00 | 2.75 |
| c04 | A2 | 1 | pairwise | loss | tie |
| c04 | A2 | 3 | pairwise | win | tie |
| c04 | A3 | 1 | pairwise | loss | tie |
| c04 | A4 | 1 | pairwise | loss | tie |
| c05 | A0 | 1 | absolute | 3.50 | 2.25 |
| c05 | A1 | 1 | pairwise | loss | tie |
| c05 | A1 | 2 | absolute | 3.25 | 1.75 |
| c05 | A1 | 3 | absolute | 3.25 | 1.50 |
| c05 | A3 | 1 | pairwise | loss | win |
| c05 | A3 | 2 | pairwise | win | tie |
| c05 | A3 | 3 | absolute | 3.00 | 1.75 |
| c05 | A3 | 3 | pairwise | tie | loss |
| c05 | A4 | 1 | absolute | 2.75 | 1.50 |
| c05 | A4 | 1 | pairwise | loss | tie |
| c05 | A4 | 3 | absolute | 3.25 | 1.50 |
| c05 | A4 | 3 | pairwise | tie | loss |
| c05 | A5 | 1 | absolute | 4.00 | 2.25 |
| c05 | A5 | 1 | pairwise | tie | win |
| c06 | A0 | 1 | absolute | 3.50 | 2.25 |
| c06 | A1 | 1 | absolute | 3.50 | 2.25 |
| c06 | A1 | 2 | pairwise | tie | loss |
| c07 | A0 | 1 | absolute | 2.75 | 1.25 |
| c07 | A0 | 2 | absolute | 2.75 | 1.25 |
| c07 | A1 | 1 | pairwise | loss | tie |
| c07 | A1 | 2 | pairwise | loss | tie |
| c07 | A1 | 3 | absolute | 3.00 | 1.75 |
| c07 | A2 | 3 | absolute | 3.00 | 1.75 |
| c07 | A2 | 3 | pairwise | win | loss |
| c07 | A3 | 1 | pairwise | tie | win |
| c07 | A3 | 3 | pairwise | tie | win |
| c07 | A4 | 2 | absolute | 2.75 | 1.25 |
| c07 | A4 | 2 | pairwise | tie | loss |
| c08 | A0 | 1 | absolute | 3.75 | 2.50 |
| c08 | A0 | 2 | absolute | 3.75 | 2.50 |
| c08 | A1 | 2 | pairwise | loss | tie |
| c08 | A3 | 2 | pairwise | loss | tie |
| c08 | A3 | 3 | pairwise | loss | tie |
| c08 | A4 | 3 | absolute | 3.25 | 2.00 |
| c08 | A5 | 1 | absolute | 1.00 | 2.75 |
| c08 | A5 | 3 | pairwise | tie | loss |
| c09 | A0 | 2 | absolute | 3.25 | 2.00 |
| c09 | A1 | 2 | pairwise | loss | win |
| c09 | A3 | 1 | pairwise | tie | win |
| c09 | A3 | 2 | absolute | 3.75 | 2.50 |
| c09 | A3 | 2 | pairwise | tie | win |
| c09 | A3 | 3 | pairwise | win | tie |
| c09 | A4 | 3 | absolute | 3.00 | 1.25 |
| c09 | A5 | 1 | absolute | 3.25 | 1.50 |
| c10 | A2 | 1 | pairwise | win | tie |
| c10 | A2 | 2 | pairwise | win | tie |
| c10 | A2 | 3 | absolute | 3.25 | 2.00 |
| c10 | A3 | 1 | absolute | 3.75 | 2.25 |
| c10 | A3 | 3 | pairwise | win | tie |
| c10 | A4 | 1 | pairwise | win | tie |
| c10 | A4 | 2 | absolute | 3.25 | 2.00 |
| c10 | A4 | 2 | pairwise | tie | win |
| c10 | A5 | 1 | absolute | 3.00 | 1.75 |
| c10 | A5 | 1 | pairwise | win | tie |
| c10 | A5 | 2 | pairwise | win | tie |
| c11 | A0 | 2 | absolute | 5.00 | 3.75 |
| c11 | A1 | 2 | absolute | 4.00 | 2.50 |
| c11 | A2 | 2 | pairwise | loss | tie |
| c12 | A1 | 1 | absolute | 3.25 | 2.00 |
| c12 | A1 | 2 | absolute | 3.25 | 2.00 |
| c12 | A1 | 3 | pairwise | win | tie |
| c12 | A2 | 2 | pairwise | tie | loss |
| c12 | A3 | 1 | pairwise | win | tie |
| c12 | A3 | 2 | absolute | 2.50 | 1.25 |
| c12 | A4 | 1 | pairwise | loss | tie |
| c12 | A5 | 1 | absolute | 3.00 | 1.75 |
| c13 | A3 | 1 | pairwise | loss | tie |
| c13 | A4 | 1 | pairwise | loss | win |
| c13 | A4 | 3 | pairwise | loss | win |
| c13 | A5 | 1 | pairwise | loss | tie |
| c13 | A5 | 3 | pairwise | loss | tie |
| c14 | A1 | 2 | absolute | 3.00 | 1.75 |
| c14 | A1 | 3 | pairwise | tie | loss |
| c14 | A2 | 1 | absolute | 3.25 | 1.75 |
| c14 | A2 | 1 | pairwise | win | tie |
| c14 | A2 | 2 | pairwise | loss | win |
| c14 | A2 | 3 | absolute | 3.25 | 2.00 |
| c14 | A3 | 1 | absolute | 3.25 | 2.00 |
| c14 | A3 | 2 | absolute | 3.25 | 2.00 |
| c14 | A3 | 2 | pairwise | loss | tie |
| c14 | A3 | 3 | absolute | 3.00 | 1.75 |
| c14 | A4 | 1 | absolute | 3.25 | 2.00 |
| c14 | A4 | 2 | pairwise | tie | loss |
| c14 | A5 | 1 | absolute | 2.75 | 1.25 |
| c14 | A5 | 1 | pairwise | win | tie |
| c14 | A5 | 2 | absolute | 3.75 | 2.25 |
| c14 | A5 | 3 | absolute | 3.25 | 1.75 |
| c15 | A0 | 1 | absolute | 4.00 | 2.75 |
| c15 | A1 | 2 | pairwise | loss | win |
| c15 | A1 | 3 | pairwise | loss | tie |
| c15 | A2 | 2 | absolute | 3.50 | 2.25 |
| c15 | A2 | 3 | absolute | 3.50 | 1.75 |
| c15 | A3 | 1 | absolute | 4.25 | 2.75 |
| c15 | A3 | 1 | pairwise | loss | tie |
| c15 | A3 | 3 | absolute | 3.00 | 1.75 |
| c15 | A4 | 1 | absolute | 3.25 | 1.25 |
| c15 | A5 | 1 | absolute | 3.25 | 1.75 |
| c15 | A5 | 2 | absolute | 3.50 | 2.00 |
| c15 | A5 | 3 | absolute | 2.75 | 1.50 |
| c16 | A0 | 1 | absolute | 3.25 | 2.00 |
| c16 | A0 | 2 | absolute | 3.00 | 1.75 |
| c16 | A0 | 3 | absolute | 2.75 | 1.25 |
| c16 | A1 | 2 | absolute | 3.25 | 2.00 |
| c16 | A1 | 2 | pairwise | tie | loss |
| c16 | A1 | 3 | absolute | 2.75 | 1.50 |
| c16 | A1 | 3 | pairwise | win | tie |
| c16 | A2 | 3 | pairwise | loss | tie |
| c16 | A3 | 3 | absolute | 3.00 | 1.50 |
| c16 | A4 | 3 | absolute | 3.25 | 1.25 |
| c16 | A5 | 1 | pairwise | tie | loss |
| c17 | A0 | 1 | absolute | 2.50 | 1.25 |
| c17 | A1 | 1 | pairwise | loss | win |
| c17 | A1 | 2 | pairwise | tie | loss |
| c17 | A2 | 1 | pairwise | tie | loss |
| c17 | A2 | 2 | pairwise | win | tie |
| c17 | A2 | 3 | pairwise | win | loss |
| c17 | A6 | 1 | pairwise | tie | win |
| c17 | A6 | 2 | pairwise | win | tie |
| c17 | A6 | 3 | pairwise | loss | tie |
| c18 | A0 | 2 | absolute | 3.75 | 1.25 |
| c18 | A1 | 1 | absolute | 2.50 | 1.25 |
| c18 | A1 | 1 | pairwise | win | tie |
| c18 | A1 | 2 | pairwise | loss | win |
| c18 | A2 | 1 | absolute | 2.50 | 1.25 |
| c18 | A6 | 1 | absolute | 2.25 | 0.75 |
| c18 | A6 | 2 | absolute | 1.50 | 2.75 |
| c18 | A6 | 2 | pairwise | loss | tie |
| c19 | A0 | 3 | absolute | 3.00 | 1.75 |
| c19 | A0 | 5 | absolute | 3.75 | 2.00 |
| c19 | A1 | 2 | pairwise | loss | tie |
| c19 | A2 | 1 | pairwise | loss | tie |
| c19 | A3 | 1 | pairwise | loss | win |
| c19 | A3 | 2 | pairwise | tie | win |
| c19 | A4 | 1 | pairwise | loss | tie |
| c19 | A5 | 1 | pairwise | loss | win |
| c21 | A2 | 1 | pairwise | loss | win |
| c21 | A4 | 1 | pairwise | tie | win |
| c21 | A5 | 2 | pairwise | loss | win |
| c22 | A0 | 1 | absolute | 3.50 | 2.00 |
| c22 | A5 | 2 | absolute | 4.00 | 2.75 |
| c23 | A2 | 2 | absolute | 3.75 | 2.50 |
| c24 | A0 | 3 | absolute | 3.00 | 1.50 |
| c24 | A2 | 2 | absolute | 3.75 | 2.25 |
| c24 | A3 | 1 | absolute | 3.50 | 1.50 |
| c24 | A3 | 3 | absolute | 2.50 | 1.25 |
| c24 | A3 | 3 | pairwise | loss | tie |
| c24 | A4 | 2 | pairwise | loss | tie |

## 6. E5: warm native compaction, window cost

Boundaries priced: 169 (140 manual, 29 auto). Left out: no summary record after it 233, no instance 5.
Formula: a cache read of preTokens plus the summary record's tokens (the product's estimateTokens), priced with costForUsage at the boundary's time; window % = weightedTokens / tokensPerPercent.

Calibration against the manual compactions whose turn_usage row was measured:

| model | preTokens | summary tokens (est.) | measured: read / write / input / output | measured $ | formula $ | formula ÷ measured | measured window % | formula window % |
|---|---|---|---|---|---|---|---|---|
| claude-opus-5-5 | 939,938 | 3,733 | 937,257 / 0 / 4,492 / 5,425 | 0.3139 | 0.2626 | 0.84 | session 0.103, weekly_all 0.024, weekly_scoped/Fable 0.005 | session 0.093, weekly_all 0.021, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 469,991 | 4,041 | 463,316 / 3,109 / 5,305 / 5,969 | 0.2488 | 0.1748 | 0.70 | session 0.215, weekly_scoped/Fable 0.003 | session 0.170, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 694,967 | 5,938 | 691,315 / 0 / 5,363 / 9,267 | 0.3451 | 0.2578 | 0.75 | session 0.096, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.078, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 403,178 | 6,032 | 391,418 / 5,393 / 7,459 / 9,213 | 0.3193 | 0.2013 | 0.63 | session 0.251, weekly_scoped/Fable 0.003 | session 0.178, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 51,072 | 2,567 | 47,453 / 0 / 5,262 / 3,621 | 0.1030 | 0.0616 | 0.60 | session 0.022, weekly_all 0.003, weekly_scoped/Fable 0.001 | session 0.014, weekly_all 0.002, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 270,640 | 4,044 | 267,243 / 1,573 / 3,719 / 6,368 | 0.1018 | 0.0675 | 0.66 | session 0.162, weekly_scoped/Fable 0.002 | session 0.119, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 229,456 | 3,838 | 225,437 / 1,812 / 3,978 / 6,339 | 0.0984 | 0.0613 | 0.62 | session 0.153, weekly_scoped/Fable 0.002 | session 0.106, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 795,420 | 6,284 | 792,135 / 0 / 5,127 / 8,955 | 0.3580 | 0.2848 | 0.80 | session 0.102, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.088, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 323,140 | 5,327 | 313,930 / 4,256 / 6,343 / 8,587 | 0.2812 | 0.1712 | 0.61 | session 0.217, weekly_scoped/Fable 0.003 | session 0.149, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 253,076 | 2,547 | 250,216 / 1,377 / 3,495 / 3,938 | 0.0748 | 0.0508 | 0.68 | session 0.126, weekly_scoped/Fable 0.002 | session 0.096, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 329,130 | 3,055 | 326,940 / 985 / 3,095 / 5,016 | 0.0915 | 0.0635 | 0.69 | session 0.157, weekly_scoped/Fable 0.002 | session 0.122, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 410,007 | 5,004 | 402,396 / 3,295 / 5,480 / 7,771 | 0.2743 | 0.1821 | 0.66 | session 0.224, weekly_scoped/Fable 0.003 | session 0.167, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 843,363 | 3,979 | 839,595 / 0 / 5,673 / 8,322 | 0.3571 | 0.2483 | 0.70 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.082, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 615,170 | 4,763 | 606,269 / 4,557 / 6,131 / 9,208 | 0.3527 | 0.2183 | 0.62 | session 0.299, weekly_scoped/Fable 0.004 | session 0.215, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 630,775 | 5,257 | 625,241 / 0 / 7,409 / 8,941 | 0.3335 | 0.2313 | 0.69 | session 0.091, weekly_all 0.013, weekly_scoped/Fable 0.004 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 432,036 | 3,972 | 421,049 / 3,796 / 9,067 / 7,040 | 0.2803 | 0.1658 | 0.59 | session 0.230, weekly_scoped/Fable 0.003 | session 0.159, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 876,183 | 5,279 | 867,377 / 0 / 10,580 / 8,507 | 0.3859 | 0.2808 | 0.73 | session 0.111, weekly_all 0.016, weekly_scoped/Fable 0.005 | session 0.090, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 385,215 | 3,756 | 371,831 / 6,634 / 8,652 / 8,030 | 0.3027 | 0.1522 | 0.50 | session 0.238, weekly_scoped/Fable 0.003 | session 0.145, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 791,408 | 4,840 | 783,784 / 0 / 9,212 / 7,589 | 0.3454 | 0.2551 | 0.74 | session 0.099, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.082, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 520,166 | 4,304 | 502,962 / 9,037 / 9,798 / 8,189 | 0.3487 | 0.1901 | 0.55 | session 0.284, weekly_scoped/Fable 0.003 | session 0.186, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 947,858 | 7,299 | 941,822 / 0 / 7,899 / 10,098 | 0.4219 | 0.3356 | 0.80 | session 0.121, weekly_all 0.017, weekly_scoped/Fable 0.006 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 160,364 | 4,781 | 159,921 / 214 / 2,078 / 7,458 | 0.1905 | 0.1277 | 0.67 | session 0.086, weekly_scoped/Fable 0.001 | session 0.062, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 130,425 | 1,317 | 125,951 / 2,127 / 3,492 / 1,900 | 0.0878 | 0.0524 | 0.60 | session 0.044, weekly_scoped/Fable 0.000 | session 0.030, weekly_scoped/Fable 0.000 |
| claude-opus-5-5 | 160,364 | 4,781 | 159,921 / 214 / 2,078 / 7,458 | 0.1905 | 0.1277 | 0.67 | session 0.086, weekly_scoped/Fable 0.001 | session 0.062, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 137,133 | 2,124 | 134,977 / 466 / 2,372 / 3,450 | 0.1078 | 0.0699 | 0.65 | session 0.052, weekly_scoped/Fable 0.001 | session 0.038, weekly_scoped/Fable 0.000 |
| claude-opus-5-5 | 160,364 | 4,781 | 159,921 / 214 / 2,078 / 7,458 | 0.1905 | 0.1277 | 0.67 | session 0.086, weekly_scoped/Fable 0.001 | session 0.062, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 130,425 | 1,317 | 125,951 / 2,127 / 3,492 / 1,900 | 0.0878 | 0.0524 | 0.60 | session 0.044, weekly_scoped/Fable 0.000 | session 0.030, weekly_scoped/Fable 0.000 |
| claude-opus-5-5 | 871,215 | 4,877 | 864,418 / 3,392 / 5,198 / 10,102 | 0.4127 | 0.2718 | 0.66 | session 0.357, weekly_scoped/Fable 0.008 | session 0.272, weekly_scoped/Fable 0.006 |
| claude-opus-5-5 | 864,502 | 5,338 | 860,975 / 0 / 5,604 / 8,000 | 0.3546 | 0.2797 | 0.79 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.090, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 489,661 | 5,046 | 483,584 / 2,955 / 5,154 / 8,125 | 0.2946 | 0.1989 | 0.67 | session 0.247, weekly_scoped/Fable 0.003 | session 0.187, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 916,135 | 6,115 | 916,003 / 0 / 2,197 / 11,488 | 0.4217 | 0.3055 | 0.72 | session 0.120, weekly_all 0.017, weekly_scoped/Fable 0.006 | session 0.097, weekly_all 0.014, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 569,410 | 4,580 | 561,710 / 3,609 / 5,789 / 6,464 | 0.2828 | 0.2055 | 0.73 | session 0.249, weekly_scoped/Fable 0.003 | session 0.202, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 337,747 | 5,072 | 336,995 / 0 / 2,898 / 7,675 | 0.2325 | 0.1690 | 0.73 | session 0.062, weekly_all 0.014, weekly_scoped/Fable 0.003 | session 0.049, weekly_all 0.011, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 627,325 | 6,113 | 619,281 / 3,862 / 6,088 / 8,826 | 0.3440 | 0.2477 | 0.72 | session 0.269, weekly_scoped/Fable 0.007 | session 0.215, weekly_scoped/Fable 0.006 |
| claude-opus-5-5 | 190,621 | 4,506 | 186,709 / 0 / 5,208 / 7,547 | 0.2091 | 0.1282 | 0.61 | session 0.051, weekly_all 0.012, weekly_scoped/Fable 0.003 | session 0.034, weekly_all 0.008, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 754,282 | 6,274 | 750,777 / 0 / 5,740 / 9,434 | 0.3618 | 0.2763 | 0.76 | session 0.105, weekly_all 0.024, weekly_scoped/Fable 0.005 | session 0.088, weekly_all 0.020, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 826,903 | 3,136 | 824,545 / 0 / 4,385 / 4,216 | 0.2668 | 0.2281 | 0.86 | session 0.089, weekly_all 0.020, weekly_scoped/Fable 0.005 | session 0.081, weekly_all 0.019, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 114,145 | 3,000 | 110,690 / 0 / 4,909 / 4,023 | 0.1222 | 0.0828 | 0.68 | session 0.030, weekly_all 0.007, weekly_scoped/Fable 0.002 | session 0.022, weekly_all 0.005, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 582,770 | 4,004 | 582,490 / 253 / 2,001 / 8,736 | 0.3005 | 0.1966 | 0.65 | session 0.224, weekly_scoped/Fable 0.003 | session 0.168, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 547,829 | 4,673 | 543,316 / 0 / 5,366 / 6,759 | 0.2653 | 0.2030 | 0.77 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.062, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 173,082 | 3,698 | 166,602 / 2,872 / 5,071 / 5,067 | 0.1693 | 0.1086 | 0.64 | session 0.128, weekly_scoped/Fable 0.002 | session 0.090, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 584,569 | 6,158 | 580,148 / 0 / 5,863 / 9,215 | 0.3238 | 0.2401 | 0.74 | session 0.087, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 367,384 | 4,101 | 358,552 / 3,987 / 6,200 / 5,852 | 0.2335 | 0.1555 | 0.67 | session 0.193, weekly_scoped/Fable 0.002 | session 0.144, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 275,827 | 4,671 | 270,827 / 2,207 / 4,368 / 6,730 | 0.2173 | 0.1486 | 0.68 | session 0.171, weekly_scoped/Fable 0.002 | session 0.129, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 873,428 | 3,055 | 869,560 / 0 / 5,804 / 5,997 | 0.3171 | 0.2358 | 0.74 | session 0.097, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.081, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 696,976 | 3,993 | 696,523 / 0 / 2,119 / 7,078 | 0.2893 | 0.2193 | 0.76 | session 0.085, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 240,759 | 4,020 | 225,039 / 7,545 / 9,655 / 7,218 | 0.2657 | 0.1286 | 0.48 | session 0.196, weekly_scoped/Fable 0.002 | session 0.111, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 844,478 | 4,199 | 843,832 / 0 / 2,111 / 7,448 | 0.3262 | 0.2529 | 0.78 | session 0.098, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.083, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 492,945 | 4,271 | 491,835 / 433 / 2,188 / 8,577 | 0.2808 | 0.1840 | 0.66 | session 0.239, weekly_scoped/Fable 0.003 | session 0.178, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 540,506 | 4,156 | 539,897 / 0 / 2,194 / 7,516 | 0.2671 | 0.1912 | 0.72 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.059, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 578,558 | 4,383 | 567,268 / 5,178 / 7,238 / 7,734 | 0.3230 | 0.2034 | 0.63 | session 0.275, weekly_scoped/Fable 0.003 | session 0.201, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 473,480 | 4,605 | 466,646 / 0 / 8,298 / 8,466 | 0.2958 | 0.1868 | 0.63 | session 0.077, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.056, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 578,558 | 4,383 | 567,268 / 5,178 / 7,238 / 7,734 | 0.3230 | 0.2034 | 0.63 | session 0.275, weekly_scoped/Fable 0.003 | session 0.201, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 181,180 | 4,050 | 175,409 / 2,356 / 4,500 / 5,819 | 0.1812 | 0.1172 | 0.65 | session 0.136, weekly_scoped/Fable 0.002 | session 0.097, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 424,772 | 4,464 | 421,252 / 0 / 5,020 / 6,550 | 0.2353 | 0.1742 | 0.74 | session 0.063, weekly_all 0.009, weekly_scoped/Fable 0.003 | session 0.051, weekly_all 0.007, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 259,291 | 5,632 | 250,142 / 4,356 / 6,537 / 9,071 | 0.2794 | 0.1645 | 0.59 | session 0.208, weekly_scoped/Fable 0.002 | session 0.137, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 388,503 | 5,725 | 384,378 / 0 / 5,659 / 8,419 | 0.2679 | 0.1922 | 0.72 | session 0.068, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.053, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 763,657 | 4,943 | 759,075 / 0 / 6,168 / 7,958 | 0.3356 | 0.2516 | 0.75 | session 0.096, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 735,289 | 7,331 | 732,009 / 0 / 4,644 / 10,748 | 0.3799 | 0.2937 | 0.77 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.087, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 653,700 | 5,529 | 651,135 / 0 / 4,322 / 8,386 | 0.3152 | 0.2413 | 0.77 | session 0.088, weekly_all 0.013, weekly_scoped/Fable 0.004 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 549,395 | 5,865 | 542,806 / 3,074 / 5,269 / 9,003 | 0.3251 | 0.2272 | 0.70 | session 0.249, weekly_scoped/Fable 0.007 | session 0.194, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 781,181 | 7,717 | 770,786 / 5,003 / 7,273 / 11,927 | 0.4468 | 0.3106 | 0.70 | session 0.323, weekly_scoped/Fable 0.005 | session 0.251, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 399,417 | 4,180 | 396,739 / 0 / 4,545 / 6,040 | 0.2183 | 0.1635 | 0.75 | session 0.059, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.048, weekly_all 0.007, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 542,615 | 5,150 | 542,164 / 270 / 2,119 / 10,228 | 0.3228 | 0.2115 | 0.66 | session 0.232, weekly_scoped/Fable 0.003 | session 0.172, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 283,449 | 5,274 | 278,848 / 2,119 / 4,274 / 8,075 | 0.2450 | 0.1622 | 0.66 | session 0.116, weekly_scoped/Fable 0.001 | session 0.085, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 623,475 | 3,346 | 619,756 / 0 / 5,226 / 5,092 | 0.2467 | 0.1916 | 0.78 | session 0.073, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.063, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 333,602 | 4,343 | 330,815 / 0 / 4,594 / 6,699 | 0.2185 | 0.1536 | 0.70 | session 0.056, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.044, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 276,396 | 5,510 | 267,467 / 4,406 / 5,688 / 8,364 | 0.2656 | 0.1655 | 0.62 | session 0.123, weekly_scoped/Fable 0.001 | session 0.085, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 306,727 | 4,733 | 303,120 / 0 / 5,212 / 7,121 | 0.2239 | 0.1560 | 0.70 | session 0.056, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.043, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 263,018 | 4,564 | 250,347 / 5,736 / 8,121 / 6,735 | 0.2459 | 0.1439 | 0.59 | session 0.187, weekly_scoped/Fable 0.002 | session 0.124, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 954,345 | 3,018 | 949,237 / 2,365 / 4,522 / 4,384 | 0.3074 | 0.2512 | 0.82 | session 0.286, weekly_scoped/Fable 0.008 | session 0.254, weekly_scoped/Fable 0.007 |
| claude-opus-5-5 | 221,635 | 4,327 | 216,039 / 2,510 / 4,690 / 6,181 | 0.1981 | 0.1309 | 0.66 | session 0.152, weekly_scoped/Fable 0.002 | session 0.111, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 182,163 | 6,595 | 176,008 / 2,855 / 5,070 / 9,192 | 0.2536 | 0.1683 | 0.66 | session 0.112, weekly_scoped/Fable 0.001 | session 0.079, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 561,307 | 5,230 | 558,675 / 2,255 / 2,147 / 9,329 | 0.3182 | 0.2169 | 0.68 | session 0.271, weekly_scoped/Fable 0.003 | session 0.208, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 513,026 | 7,238 | 509,454 / 0 / 5,345 / 10,110 | 0.3255 | 0.2474 | 0.76 | session 0.085, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.069, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 687,152 | 5,062 | 685,052 / 0 / 3,802 / 6,936 | 0.2909 | 0.2387 | 0.82 | session 0.085, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.074, weekly_all 0.011, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 282,772 | 4,302 | 274,826 / 3,580 / 5,773 / 6,253 | 0.2210 | 0.1426 | 0.65 | session 0.174, weekly_scoped/Fable 0.002 | session 0.126, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 451,759 | 4,739 | 448,396 / 0 / 4,955 / 7,155 | 0.2526 | 0.1851 | 0.73 | session 0.068, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.054, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 319,344 | 5,059 | 313,063 / 2,810 / 5,003 / 7,227 | 0.2412 | 0.1650 | 0.68 | session 0.192, weekly_scoped/Fable 0.002 | session 0.144, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 69,911 | 5,048 | 63,416 / 0 / 7,583 / 7,514 | 0.1933 | 0.1149 | 0.59 | session 0.041, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.025, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 434,645 | 3,623 | 429,067 / 2,401 / 4,594 / 5,289 | 0.2220 | 0.1594 | 0.72 | session 0.165, weekly_scoped/Fable 0.002 | session 0.132, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 799,790 | 3,859 | 794,031 / 2,672 / 4,814 / 5,389 | 0.2992 | 0.2371 | 0.79 | session 0.289, weekly_scoped/Fable 0.003 | session 0.251, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 961,179 | 6,015 | 952,704 / 3,287 / 3,869 / 11,765 | 0.4578 | 0.3125 | 0.68 | session 0.348, weekly_scoped/Fable 0.005 | session 0.271, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 534,194 | 5,658 | 527,313 / 3,139 / 5,340 / 7,854 | 0.2996 | 0.2200 | 0.73 | session 0.256, weekly_scoped/Fable 0.003 | session 0.206, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 765,667 | 5,518 | 762,099 / 2,723 / 2,901 / 8,630 | 0.3502 | 0.2635 | 0.75 | session 0.306, weekly_scoped/Fable 0.007 | session 0.254, weekly_scoped/Fable 0.006 |
| claude-opus-5-5 | 810,895 | 4,914 | 808,525 / 0 / 4,071 / 7,592 | 0.3298 | 0.2605 | 0.79 | session 0.097, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.084, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 436,418 | 5,125 | 434,196 / 0 / 4,132 / 7,543 | 0.2542 | 0.1898 | 0.75 | session 0.067, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.055, weekly_all 0.008, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 961,365 | 4,674 | 956,892 / 0 / 5,956 / 7,196 | 0.3591 | 0.2858 | 0.80 | session 0.109, weekly_all 0.016, weekly_scoped/Fable 0.005 | session 0.095, weekly_all 0.014, weekly_scoped/Fable 0.005 |
| claude-opus-5-5 | 699,462 | 3,413 | 697,151 / 0 / 4,174 / 5,325 | 0.2626 | 0.2082 | 0.79 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.069, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 608,943 | 4,485 | 606,128 / 0 / 4,565 / 7,139 | 0.2823 | 0.2115 | 0.75 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.066, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 512,088 | 5,268 | 508,189 / 0 / 5,056 / 7,682 | 0.2755 | 0.2078 | 0.75 | session 0.075, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.061, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 320,989 | 4,448 | 314,344 / 2,869 / 5,048 / 6,190 | 0.2212 | 0.1532 | 0.69 | session 0.179, weekly_scoped/Fable 0.002 | session 0.137, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 254,552 | 2,392 | 251,444 / 1,414 / 3,540 / 3,634 | 0.0721 | 0.0494 | 0.68 | session 0.038, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.030, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 223,017 | 2,987 | 220,610 / 1,073 / 3,183 / 5,728 | 0.0884 | 0.0522 | 0.59 | session 0.044, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.029, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 333,051 | 5,065 | 330,765 / 0 / 4,229 / 7,317 | 0.2294 | 0.1679 | 0.73 | session 0.058, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.046, weekly_all 0.007, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 79,764 | 3,798 | 66,669 / 6,111 / 8,247 / 5,576 | 0.1884 | 0.0919 | 0.49 | session 0.123, weekly_scoped/Fable 0.003 | session 0.066, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 887,635 | 5,195 | 882,139 / 0 / 7,146 / 8,719 | 0.3794 | 0.2814 | 0.74 | session 0.110, weekly_all 0.016, weekly_scoped/Fable 0.005 | session 0.091, weekly_all 0.013, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 459,405 | 3,995 | 449,587 / 4,695 / 6,840 / 6,671 | 0.2742 | 0.1718 | 0.63 | session 0.230, weekly_scoped/Fable 0.003 | session 0.166, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 747,799 | 5,739 | 741,201 / 0 / 8,024 / 9,833 | 0.3770 | 0.2643 | 0.70 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.082, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 342,247 | 6,045 | 338,186 / 0 / 5,449 / 8,763 | 0.2647 | 0.1893 | 0.72 | session 0.066, weekly_all 0.009, weekly_scoped/Fable 0.003 | session 0.051, weekly_all 0.007, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 305,253 | 4,105 | 302,959 / 0 / 4,201 / 5,817 | 0.1937 | 0.1432 | 0.74 | session 0.050, weekly_all 0.007, weekly_scoped/Fable 0.002 | session 0.040, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 290,374 | 4,769 | 287,728 / 0 / 4,435 / 7,089 | 0.2171 | 0.1535 | 0.71 | session 0.054, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.042, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 169,431 | 2,432 | 167,633 / 833 / 2,932 / 3,945 | 0.0642 | 0.0413 | 0.64 | session 0.032, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.023, weekly_all 0.003, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 191,180 | 2,451 | 187,815 / 1,613 / 3,737 / 4,076 | 0.0710 | 0.0436 | 0.61 | session 0.036, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.025, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-sonnet-5-5 | 260,672 | 3,168 | 257,630 / 1,459 / 3,597 / 5,105 | 0.0877 | 0.0577 | 0.66 | session 0.045, weekly_all 0.006, weekly_scoped/Fable 0.002 | session 0.033, weekly_all 0.005, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 326,730 | 4,852 | 322,556 / 0 / 6,003 / 7,222 | 0.2330 | 0.1624 | 0.70 | session 0.059, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.045, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 322,416 | 4,302 | 318,385 / 0 / 5,585 / 6,831 | 0.2226 | 0.1505 | 0.68 | session 0.057, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.043, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-sonnet-5-5 | 252,144 | 3,602 | 248,328 / 1,835 / 3,974 / 6,143 | 0.0988 | 0.0612 | 0.62 | session 0.049, weekly_all 0.007, weekly_scoped/Fable 0.002 | session 0.034, weekly_all 0.005, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 715,193 | 4,003 | 712,078 / 0 / 4,911 / 5,972 | 0.2815 | 0.2231 | 0.79 | session 0.084, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.072, weekly_all 0.010, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 165,206 | 2,647 | 163,741 / 0 / 3,229 / 3,830 | 0.1223 | 0.0860 | 0.70 | session 0.031, weekly_all 0.004, weekly_scoped/Fable 0.001 | session 0.024, weekly_all 0.003, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 541,350 | 5,207 | 537,583 / 0 / 5,391 / 7,005 | 0.2692 | 0.2124 | 0.79 | session 0.075, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.063, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 752,004 | 7,013 | 750,745 / 0 / 2,906 / 10,811 | 0.3780 | 0.2907 | 0.77 | session 0.104, weekly_all 0.015, weekly_scoped/Fable 0.005 | session 0.087, weekly_all 0.012, weekly_scoped/Fable 0.004 |
| claude-opus-5-5 | 501,869 | 7,445 | 498,566 / 0 / 4,639 / 12,965 | 0.3776 | 0.2493 | 0.66 | session 0.094, weekly_all 0.014, weekly_scoped/Fable 0.005 | session 0.069, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 595,955 | 4,916 | 593,285 / 0 / 4,447 / 7,430 | 0.2850 | 0.2175 | 0.76 | session 0.080, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.067, weekly_all 0.010, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 160,582 | 3,892 | 158,643 / 0 / 3,465 / 5,249 | 0.1506 | 0.1100 | 0.73 | session 0.036, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.028, weekly_all 0.004, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 242,166 | 5,347 | 238,699 / 0 / 4,713 / 8,042 | 0.2274 | 0.1554 | 0.68 | session 0.054, weekly_all 0.008, weekly_scoped/Fable 0.003 | session 0.040, weekly_all 0.006, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 559,046 | 4,011 | 555,794 / 0 / 4,714 / 5,830 | 0.2466 | 0.1920 | 0.78 | session 0.071, weekly_all 0.010, weekly_scoped/Fable 0.003 | session 0.060, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 465,658 | 3,714 | 462,737 / 0 / 4,887 / 7,864 | 0.2694 | 0.1674 | 0.62 | session 0.072, weekly_all 0.010, weekly_scoped/Fable 0.004 | session 0.052, weekly_all 0.007, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 389,075 | 4,535 | 378,459 / 5,349 / 7,291 / 7,810 | 0.2878 | 0.1685 | 0.59 | session 0.229, weekly_scoped/Fable 0.003 | session 0.155, weekly_scoped/Fable 0.002 |
| claude-opus-5-5 | 496,650 | 5,288 | 488,574 / 0 / 9,892 / 8,716 | 0.3116 | 0.2051 | 0.66 | session 0.081, weekly_all 0.012, weekly_scoped/Fable 0.004 | session 0.060, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 633,984 | 3,679 | 627,742 / 0 / 7,714 / 5,349 | 0.2634 | 0.2004 | 0.76 | session 0.077, weekly_all 0.011, weekly_scoped/Fable 0.004 | session 0.065, weekly_all 0.009, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 368,848 | 3,915 | 356,415 / 5,686 / 7,871 / 6,758 | 0.2664 | 0.1521 | 0.57 | session 0.131, weekly_scoped/Fable 0.001 | session 0.087, weekly_scoped/Fable 0.001 |
| claude-opus-5-5 | 445,248 | 3,692 | 434,218 / 5,393 / 7,318 / 7,559 | 0.2943 | 0.1629 | 0.55 | session 0.232, weekly_scoped/Fable 0.005 | session 0.153, weekly_scoped/Fable 0.003 |
| claude-opus-5-5 | 137,531 | 2,691 | 130,623 / 0 / 8,533 / 4,273 | 0.1457 | 0.0813 | 0.56 | session 0.034, weekly_all 0.005, weekly_scoped/Fable 0.002 | session 0.022, weekly_all 0.003, weekly_scoped/Fable 0.001 |

Over all boundaries (formula):

| model | window | n (manual / auto) | median window % per 100k context | 95th-pct context | window % at it | compactAtPct = 100 − 3× |
|---|---|---|---|---|---|---|
| claude-fable-5-1 | session | 5 (3 / 2) | 0.011 | 947,858 | 0.10 | 99.7 |
| claude-fable-5-1 | weekly_all | 5 (3 / 2) | 0.002 | 947,858 | 0.02 | 99.9 |
| claude-fable-5-1 | weekly_scoped/Fable | 5 (3 / 2) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-opus-4-6 | session | 25 (0 / 25) | 0.017 | 947,858 | 0.16 | 99.5 |
| claude-opus-4-6 | weekly_all | 25 (0 / 25) | 0.004 | 947,858 | 0.04 | 99.9 |
| claude-opus-4-6 | weekly_scoped/Fable | 25 (0 / 25) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-opus-4-8 | session | 2 (0 / 2) | 0.011 | 947,858 | 0.10 | 99.7 |
| claude-opus-4-8 | weekly_all | 2 (0 / 2) | 0.002 | 947,858 | 0.02 | 99.9 |
| claude-opus-4-8 | weekly_scoped/Fable | 2 (0 / 2) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-opus-5-5 | session | 125 (125 / 0) | 0.017 | 947,858 | 0.16 | 99.5 |
| claude-opus-5-5 | weekly_all | 68 (68 / 0) | 0.002 | 947,858 | 0.02 | 100.0 |
| claude-opus-5-5 | weekly_scoped/Fable | 125 (125 / 0) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-sonnet-4-5-20250929 | session | 1 (1 / 0) | 0.019 | 947,858 | 0.18 | 99.5 |
| claude-sonnet-4-5-20250929 | weekly_all | 1 (1 / 0) | 0.004 | 947,858 | 0.04 | 99.9 |
| claude-sonnet-4-5-20250929 | weekly_scoped/Fable | 1 (1 / 0) | 0.001 | 947,858 | 0.01 | 100.0 |
| claude-sonnet-5-5 | session | 11 (11 / 0) | 0.014 | 947,858 | 0.13 | 99.6 |
| claude-sonnet-5-5 | weekly_all | 7 (7 / 0) | 0.002 | 947,858 | 0.02 | 99.9 |
| claude-sonnet-5-5 | weekly_scoped/Fable | 11 (11 / 0) | 0.001 | 947,858 | 0.01 | 100.0 |

compactAtPct default (the lowest across windows): 99.5


## 7. E6: summarize against whole, per band (cold total at K)

| band | summarize arm | cuts | median (summarize − whole) | per cut: context → difference |
|---|---|---|---|---|
| 100-300k | A4 | 8 | $-5.5448 | 118k → -6.4014, 177k → +11.2604, 177k → -12.1866, 197k → -9.1866, 234k → -13.0935, 243k → -3.1026, 244k → -3.4002, 282k → -4.6881 |
| 300-600k | A4 | 7 | $-12.7083 | 360k → -12.4650, 375k → -12.9946, 406k → -17.6324, 454k → -12.7083, 508k → -24.7393, 517k → -7.6472, 569k → -9.6513 |
| 600k+ | A4 | 3 | $-31.9975 | 803k → -17.3129, 933k → -87.7643, 950k → -31.9975 |

## 7b. Cost by arithmetic: whole, native /compact and a Sonnet summary, per situation and band

Per drawn cut, priced request by request with the product's `costForUsage`; the median over the cuts of each band. Total = make + turn 1's first request + the next 20 real turns (fewer where the session had fewer). Session model as drawn (claude-fable-5-1: 3 cuts, claude-opus-5-5: 17 cuts, claude-opus-5-5[1m]: 4 cuts). USD.

Measured inputs:

- native `/compact`: input 5,176.0 and output 7,515.0 tokens (medians of 114 measured manual compactions on Opus); carried after it S_n = 100-300k 49,610 (n=54), 300-600k 51,659 (n=53), 600k+ 59,006 (n=48) tokens (first request after a real boundary);
- Sonnet summary: input = 0.131 × P, output 4,381 tokens (72 finished A2 summaries); the opening turn $0.5323 (72 measured); carried after it S_s = 59,046 tokens;
- turn-1 writes at the 1-hour rate: in the finished A0 runs the 1-hour share of the first request's write was 1.00 (n=66).

| situation | band | cuts | P (median) | whole | native /compact | Sonnet summary | cheapest |
|---|---|---|---|---|---|---|---|
| warm same-org | 100-300k | 8 | 216,155 | $9.96 (make 0.00, t1 0.06, next 9.90) | $8.10 (make 0.22, t1 0.41, next 7.47) | $8.27 (make 0.63, t1 0.03, next 7.61) | native |
| warm same-org | 300-600k | 8 | 481,252 | $17.42 (make 0.00, t1 0.12, next 17.32) | $12.98 (make 0.27, t1 0.46, next 11.86) | $12.67 (make 0.70, t1 0.03, next 11.96) | sonnet |
| warm same-org | 600k+ | 8 | 941,946 | $22.91 (make 0.00, t1 0.20, next 22.67) | $9.95 (make 0.36, t1 0.50, next 9.09) | $9.95 (make 0.82, t1 0.04, next 9.09) | native |
| cold or cross-org | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.27 (make 0.63, t1 0.03, next 7.61) | sonnet |
| cold or cross-org | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.67 (make 0.70, t1 0.03, next 11.96) | sonnet |
| cold or cross-org | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.95 (make 0.82, t1 0.04, next 9.09) | sonnet |
| limit gone early | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.27 (make 0.63, t1 0.03, next 7.61) | sonnet |
| limit gone early | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.67 (make 0.70, t1 0.03, next 11.96) | sonnet |
| limit gone early | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.95 (make 0.82, t1 0.04, next 9.09) | sonnet |

Per cut (situation · method → total): see out/arith.json.


## 8. Stopped runs and judgments

Arms not run (out/not_run.json):

- **A7d**: OpenCode on opencode-go/deepseek-v4-pro was not run: the opencode-go account's key has expired (HTTP 401, api_key_expired, 2026-10-25), and the hub's own reading of that account still answered HTTP 401 on 2026-11-02. The owner, 2026-10-25: skip OpenCode and move on.
- **A7g**: pi on openai-codex was not run: the ChatGPT account (257c55fd) answered "Codex error: The usage limit has been reached" on every probe, gpt-5.6-terra and gpt-6-luna alike: on 2026-10-25 from 04:30 to 09:04 UTC, and again on 2026-11-02 at 17:13 and 19:08 UTC.

By arm and class:

| arm | class | runs |
|---|---|---|
| A0 | turn failed | 6 |

Judgments stopped: 292.

Each:

| cut | arm | run | error |
|---|---|---|---|
| c20 | A0 | 1 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c20 | A0 | 2 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c20 | A0 | 3 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c23 | A0 | 1 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c23 | A0 | 2 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c23 | A0 | 3 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| judge | judge/c13/A2/1/pair-opus-arm-first | – | judge/c13/A2/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/1/pair-opus-control-first | – | judge/c13/A2/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/1/pair-sonnet-arm-first | – | judge/c13/A2/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/1/pair-sonnet-control-first | – | judge/c13/A2/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/2/abs-opus | – | judge/c13/A2/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/2/abs-sonnet | – | judge/c13/A2/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/2/pair-opus-arm-first | – | judge/c13/A2/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/2/pair-opus-control-first | – | judge/c13/A2/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/2/pair-sonnet-arm-first | – | judge/c13/A2/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/2/pair-sonnet-control-first | – | judge/c13/A2/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/3/abs-opus | – | judge/c13/A2/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/3/abs-sonnet | – | judge/c13/A2/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/3/pair-opus-arm-first | – | judge/c13/A2/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/3/pair-sonnet-arm-first | – | judge/c13/A2/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/3/pair-opus-control-first | – | judge/c13/A2/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A2/3/pair-sonnet-control-first | – | judge/c13/A2/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/1/abs-opus | – | judge/c13/A3/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/1/abs-sonnet | – | judge/c13/A3/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/1/pair-opus-arm-first | – | judge/c13/A3/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/1/pair-opus-control-first | – | judge/c13/A3/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/1/pair-sonnet-arm-first | – | judge/c13/A3/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/1/pair-sonnet-control-first | – | judge/c13/A3/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/2/abs-opus | – | judge/c13/A3/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/2/abs-sonnet | – | judge/c13/A3/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/2/pair-opus-arm-first | – | judge/c13/A3/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/2/pair-opus-control-first | – | judge/c13/A3/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/2/pair-sonnet-arm-first | – | judge/c13/A3/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/2/pair-sonnet-control-first | – | judge/c13/A3/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/3/abs-opus | – | judge/c13/A3/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/3/abs-sonnet | – | judge/c13/A3/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/3/pair-opus-arm-first | – | judge/c13/A3/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/3/pair-opus-control-first | – | judge/c13/A3/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/3/pair-sonnet-arm-first | – | judge/c13/A3/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A3/3/pair-sonnet-control-first | – | judge/c13/A3/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/1/abs-opus | – | judge/c13/A4/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/1/abs-sonnet | – | judge/c13/A4/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/1/pair-opus-arm-first | – | judge/c13/A4/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/1/pair-opus-control-first | – | judge/c13/A4/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/1/pair-sonnet-arm-first | – | judge/c13/A4/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/1/pair-sonnet-control-first | – | judge/c13/A4/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/2/abs-opus | – | judge/c13/A4/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/2/abs-sonnet | – | judge/c13/A4/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/2/pair-opus-arm-first | – | judge/c13/A4/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/2/pair-opus-control-first | – | judge/c13/A4/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/2/pair-sonnet-arm-first | – | judge/c13/A4/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/3/abs-opus | – | judge/c13/A4/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/3/abs-sonnet | – | judge/c13/A4/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/2/pair-sonnet-control-first | – | judge/c13/A4/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/3/pair-opus-arm-first | – | judge/c13/A4/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/3/pair-opus-control-first | – | judge/c13/A4/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/3/pair-sonnet-arm-first | – | judge/c13/A4/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/A4/3/pair-sonnet-control-first | – | judge/c13/A4/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/2/pair-opus-arm-first | – | judge/c13/floor/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/2/pair-opus-control-first | – | judge/c13/floor/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/2/pair-sonnet-arm-first | – | judge/c13/floor/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/2/pair-sonnet-control-first | – | judge/c13/floor/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/3/pair-opus-arm-first | – | judge/c13/floor/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/3/pair-sonnet-arm-first | – | judge/c13/floor/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/3/pair-opus-control-first | – | judge/c13/floor/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c13/floor/3/pair-sonnet-control-first | – | judge/c13/floor/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c14/anchors | – | judge/c14/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c15/anchors | – | judge/c15/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c16/anchors | – | judge/c16/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A1/2/rules-opus | – | judge/c17/A1/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A1/1/rules-sonnet | – | judge/c17/A1/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A1/2/rules-sonnet | – | judge/c17/A1/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A1/1/rules-opus | – | judge/c17/A1/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A1/3/rules-opus | – | judge/c17/A1/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A1/3/rules-sonnet | – | judge/c17/A1/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/1/rules-opus | – | judge/c17/A2/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/1/rules-sonnet | – | judge/c17/A2/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/2/rules-opus | – | judge/c17/A2/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/2/rules-sonnet | – | judge/c17/A2/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/3/rules-sonnet | – | judge/c17/A2/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/3/rules-opus | – | judge/c17/A2/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/rules-opus | – | judge/c17/A6/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/rules-sonnet | – | judge/c17/A6/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/rules-sonnet | – | judge/c17/A6/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/rules-opus | – | judge/c17/A6/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/rules-opus | – | judge/c17/A6/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/rules-sonnet | – | judge/c17/A6/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/1/pair-opus-arm-first | – | judge/c17/A2/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/1/pair-opus-control-first | – | judge/c17/A2/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/1/pair-sonnet-arm-first | – | judge/c17/A2/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/1/pair-sonnet-control-first | – | judge/c17/A2/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/2/pair-opus-arm-first | – | judge/c17/A2/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/2/pair-opus-control-first | – | judge/c17/A2/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/2/pair-sonnet-arm-first | – | judge/c17/A2/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/2/pair-sonnet-control-first | – | judge/c17/A2/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/3/pair-opus-arm-first | – | judge/c17/A2/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/3/pair-opus-control-first | – | judge/c17/A2/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/3/pair-sonnet-arm-first | – | judge/c17/A2/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A2/3/pair-sonnet-control-first | – | judge/c17/A2/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/abs-opus | – | judge/c17/A6/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/abs-sonnet | – | judge/c17/A6/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/pair-opus-arm-first | – | judge/c17/A6/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/pair-opus-control-first | – | judge/c17/A6/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/pair-sonnet-arm-first | – | judge/c17/A6/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/1/pair-sonnet-control-first | – | judge/c17/A6/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/abs-sonnet | – | judge/c17/A6/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/abs-opus | – | judge/c17/A6/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/pair-opus-arm-first | – | judge/c17/A6/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/pair-opus-control-first | – | judge/c17/A6/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/pair-sonnet-arm-first | – | judge/c17/A6/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/2/pair-sonnet-control-first | – | judge/c17/A6/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/abs-opus | – | judge/c17/A6/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/abs-sonnet | – | judge/c17/A6/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/pair-opus-control-first | – | judge/c17/A6/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/pair-opus-arm-first | – | judge/c17/A6/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/pair-sonnet-arm-first | – | judge/c17/A6/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c17/A6/3/pair-sonnet-control-first | – | judge/c17/A6/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A1/2/rules-opus | – | judge/c18/A1/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A1/2/rules-sonnet | – | judge/c18/A1/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A1/1/rules-sonnet | – | judge/c18/A1/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A1/1/rules-opus | – | judge/c18/A1/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A1/3/rules-opus | – | judge/c18/A1/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/1/rules-sonnet | – | judge/c18/A2/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/1/rules-opus | – | judge/c18/A2/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A1/3/rules-sonnet | – | judge/c18/A1/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/3/rules-opus | – | judge/c18/A2/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/rules-sonnet | – | judge/c18/A2/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/rules-opus | – | judge/c18/A2/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/3/rules-sonnet | – | judge/c18/A2/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/rules-opus | – | judge/c18/A6/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/rules-sonnet | – | judge/c18/A6/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/1/pair-opus-control-first | – | judge/c18/A2/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/1/pair-opus-arm-first | – | judge/c18/A2/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/1/pair-sonnet-arm-first | – | judge/c18/A2/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/1/pair-sonnet-control-first | – | judge/c18/A2/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/abs-sonnet | – | judge/c18/A2/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/abs-opus | – | judge/c18/A2/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/pair-opus-arm-first | – | judge/c18/A2/2/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/pair-sonnet-arm-first | – | judge/c18/A2/2/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/pair-opus-control-first | – | judge/c18/A2/2/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/2/pair-sonnet-control-first | – | judge/c18/A2/2/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/3/pair-opus-arm-first | – | judge/c18/A2/3/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/3/pair-sonnet-arm-first | – | judge/c18/A2/3/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/3/pair-opus-control-first | – | judge/c18/A2/3/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A2/3/pair-sonnet-control-first | – | judge/c18/A2/3/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/abs-opus | – | judge/c18/A6/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/abs-sonnet | – | judge/c18/A6/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/pair-opus-arm-first | – | judge/c18/A6/1/pair-opus-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/pair-opus-control-first | – | judge/c18/A6/1/pair-opus-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/pair-sonnet-arm-first | – | judge/c18/A6/1/pair-sonnet-arm-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c18/A6/1/pair-sonnet-control-first | – | judge/c18/A6/1/pair-sonnet-control-first: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c19/anchors | – | judge/c19/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A1/1/rules-opus | – | judge/c20/A1/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A1/2/rules-sonnet | – | judge/c20/A1/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A1/2/rules-opus | – | judge/c20/A1/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A1/1/rules-sonnet | – | judge/c20/A1/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A1/3/rules-opus | – | judge/c20/A1/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A1/3/rules-sonnet | – | judge/c20/A1/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A2/1/rules-sonnet | – | judge/c20/A2/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A2/1/rules-opus | – | judge/c20/A2/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A2/3/rules-sonnet | – | judge/c20/A2/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A2/3/rules-opus | – | judge/c20/A2/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A2/2/rules-opus | – | judge/c20/A2/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A2/2/rules-sonnet | – | judge/c20/A2/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/1/rules-sonnet | – | judge/c20/A3/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/2/rules-opus | – | judge/c20/A3/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/2/rules-sonnet | – | judge/c20/A3/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/1/rules-opus | – | judge/c20/A3/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/3/rules-opus | – | judge/c20/A3/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/3/rules-sonnet | – | judge/c20/A3/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/1/rules-sonnet | – | judge/c20/A4/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/1/rules-opus | – | judge/c20/A4/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/2/rules-sonnet | – | judge/c20/A4/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/2/rules-opus | – | judge/c20/A4/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/3/rules-opus | – | judge/c20/A4/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/3/rules-sonnet | – | judge/c20/A4/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/1/rules-sonnet | – | judge/c20/A5/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/1/rules-opus | – | judge/c20/A5/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/2/rules-opus | – | judge/c20/A5/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/2/rules-sonnet | – | judge/c20/A5/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/3/rules-opus | – | judge/c20/A5/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/1/abs-opus | – | judge/c20/A3/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/3/rules-sonnet | – | judge/c20/A5/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/1/abs-sonnet | – | judge/c20/A3/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/2/abs-opus | – | judge/c20/A3/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/2/abs-sonnet | – | judge/c20/A3/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/3/abs-opus | – | judge/c20/A3/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A3/3/abs-sonnet | – | judge/c20/A3/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/1/abs-sonnet | – | judge/c20/A4/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/1/abs-opus | – | judge/c20/A4/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/2/abs-opus | – | judge/c20/A4/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/2/abs-sonnet | – | judge/c20/A4/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/1/abs-opus | – | judge/c20/A5/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/3/abs-sonnet | – | judge/c20/A4/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A4/3/abs-opus | – | judge/c20/A4/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/1/abs-sonnet | – | judge/c20/A5/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/2/abs-opus | – | judge/c20/A5/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/3/abs-opus | – | judge/c20/A5/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/2/abs-sonnet | – | judge/c20/A5/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c20/A5/3/abs-sonnet | – | judge/c20/A5/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c21/anchors | – | judge/c21/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c22/anchors | – | judge/c22/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A1/1/rules-sonnet | – | judge/c23/A1/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A1/2/rules-opus | – | judge/c23/A1/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A1/1/rules-opus | – | judge/c23/A1/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A1/2/rules-sonnet | – | judge/c23/A1/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A1/3/rules-opus | – | judge/c23/A1/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A1/3/rules-sonnet | – | judge/c23/A1/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A2/1/rules-opus | – | judge/c23/A2/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A2/1/rules-sonnet | – | judge/c23/A2/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A2/2/rules-opus | – | judge/c23/A2/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A2/2/rules-sonnet | – | judge/c23/A2/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A2/3/rules-opus | – | judge/c23/A2/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A2/3/rules-sonnet | – | judge/c23/A2/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/1/rules-opus | – | judge/c23/A3/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/1/rules-sonnet | – | judge/c23/A3/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/2/rules-opus | – | judge/c23/A3/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/2/rules-sonnet | – | judge/c23/A3/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/3/rules-opus | – | judge/c23/A3/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/1/rules-opus | – | judge/c23/A4/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/3/rules-sonnet | – | judge/c23/A3/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/1/rules-sonnet | – | judge/c23/A4/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/2/rules-opus | – | judge/c23/A4/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/2/rules-sonnet | – | judge/c23/A4/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/3/rules-sonnet | – | judge/c23/A4/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/3/rules-opus | – | judge/c23/A4/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/1/rules-opus | – | judge/c23/A5/1/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/1/rules-sonnet | – | judge/c23/A5/1/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/2/rules-opus | – | judge/c23/A5/2/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/2/rules-sonnet | – | judge/c23/A5/2/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/3/rules-opus | – | judge/c23/A5/3/rules-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/3/rules-sonnet | – | judge/c23/A5/3/rules-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/1/abs-opus | – | judge/c23/A3/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/1/abs-sonnet | – | judge/c23/A3/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/2/abs-sonnet | – | judge/c23/A3/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/2/abs-opus | – | judge/c23/A3/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/3/abs-opus | – | judge/c23/A3/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A3/3/abs-sonnet | – | judge/c23/A3/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/1/abs-sonnet | – | judge/c23/A4/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/1/abs-opus | – | judge/c23/A4/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/2/abs-opus | – | judge/c23/A4/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/2/abs-sonnet | – | judge/c23/A4/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/3/abs-opus | – | judge/c23/A4/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A4/3/abs-sonnet | – | judge/c23/A4/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/1/abs-opus | – | judge/c23/A5/1/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/1/abs-sonnet | – | judge/c23/A5/1/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/2/abs-sonnet | – | judge/c23/A5/2/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/2/abs-opus | – | judge/c23/A5/2/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/3/abs-opus | – | judge/c23/A5/3/abs-opus: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c23/A5/3/abs-sonnet | – | judge/c23/A5/3/abs-sonnet: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | c24/anchors | – | judge/c24/anchors: You've hit your session limit · resets 1:30am (Asia/Qatar) |
| judge | judge/c01/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2160 (char 2159) |
| judge | judge/c02/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1162 (char 1161) |
| judge | judge/c07/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1937 (char 1936) |
| judge | judge/c08/A0/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2802 (char 2801) |
| judge | judge/c08/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2682 (char 2681) |
| judge | judge/c08/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2669 (char 2668) |
| judge | judge/c09/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1540 (char 1539) |
| judge | judge/c09/A2/1/probe-answers | – | Expecting ':' delimiter: line 1 column 3003 (char 3002) |
| judge | judge/c09/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2420 (char 2419) |
| judge | judge/c10/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1162 (char 1161) |
| judge | judge/c10/A2/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1202 (char 1201) |
| judge | judge/c10/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 972 (char 971) |
| judge | judge/c10/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1487 (char 1486) |
| judge | judge/c12/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1022 (char 1021) |
| judge | judge/c13/A0/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1692 (char 1691) |
| judge | judge/c15/A0/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2267 (char 2266) |
| judge | judge/c15/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 881 (char 880) |
| judge | judge/c16/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1345 (char 1344) |
| judge | judge/c16/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2024 (char 2023) |
| judge | judge/c16/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1185 (char 1184) |
| judge | judge/c19/A2/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1101 (char 1100) |
| judge | judge/c19/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1122 (char 1121) |
| judge | judge/c20/A2/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2384 (char 2383) |
| judge | judge/c20/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1895 (char 1894) |
| judge | judge/c20/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2810 (char 2809) |
| judge | judge/c21/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1431 (char 1430) |
| judge | judge/c22/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1812 (char 1811) |
| judge | judge/c23/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 820 (char 819) |
| judge | judge/c24/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2344 (char 2343) |
| judge | judge/c24/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1630 (char 1629) |
| judge | judge/c24/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2452 (char 2451) |
| judge | judge/c01/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1432 (char 1431) |
| judge | judge/c02/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1162 (char 1161) |
| judge | judge/c08/A0/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2936 (char 2935) |
| judge | judge/c08/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1543 (char 1542) |
| judge | judge/c09/A2/1/probe-answers | – | Expecting ':' delimiter: line 1 column 3001 (char 3000) |
| judge | judge/c10/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1117 (char 1116) |
| judge | judge/c10/A5/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1594 (char 1593) |
| judge | judge/c16/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1618 (char 1617) |
| judge | judge/c18/A0/1/probe-answers | – | Expecting ':' delimiter: line 1 column 932 (char 931) |
| judge | judge/c18/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 703 (char 702) |
| judge | judge/c19/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 954 (char 953) |
| judge | judge/c20/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1682 (char 1681) |
| judge | judge/c21/A3/1/probe-answers | – | Expecting ':' delimiter: line 1 column 1457 (char 1456) |
| judge | judge/c22/A4/1/probe-answers | – | Expecting ':' delimiter: line 1 column 791 (char 790) |
| judge | judge/c23/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 870 (char 869) |
| judge | judge/c24/A1/1/probe-answers | – | Expecting ':' delimiter: line 1 column 2603 (char 2602) |

Cuts with at least one finished run: 24 of 24. A cut is left out of a CI only where fewer than 2 of an arm's runs finished there (B6).

## 9. Recall appendix (the infinite-chat eval, not redone)

# infinite-chat on Claude: every call claude-sonnet-5-5 (effort medium)

Written 2026-10-17 06:44 UTC. Scores are the judge's (claude-sonnet-5-5); answers from another model are left out and listed below. Scope: incremental.

## end: by probe type

| method | recall | artifact | continuation | decision | correction | **all** |
|---|---|---|---|---|---|---|
| tree | 14/22 | 11/20 | 9/26 | 10/18 | 9/22 | **53/108 (49%)** |
| cc-real+C-filed | 2/22 | 9/20 | 26/26 | 8/18 | 4/22 | **49/108 (45%)** |
| tree-B | 17/22 | 10/20 | 11/26 | 9/18 | 14/22 | **61/108 (56%)** |

## end: by where the evidence sits

| method | carried in at 13:49 | 13:49–18:04 | 18:04–20:32 | 20:32–23:18 | 23:19–00:55 | 00:55–02:49 | **all** |
|---|---|---|---|---|---|---|---|
| tree | 0/6 | 14/36 | 7/18 | 8/16 | 10/16 | 14/16 | **53/108 (49%)** |
| cc-real+C-filed | 6/6 | 15/36 | 5/18 | 5/16 | 4/16 | 14/16 | **49/108 (45%)** |
| tree-B | 0/6 | 18/36 | 7/18 | 12/16 | 12/16 | 12/16 | **61/108 (56%)** |

## end: per probe

| probe | type | tree | cc-real+C-filed | tree-B |
|---|---|---|---|---|
| P01 | correction | 0 | 0 | 1 |
| P02 | correction | 2 | 0 | 2 |
| P03 | correction | 1 | 1 | 2 |
| P04 | correction | 2 | 0 | 2 |
| P05 | decision | 1 | 1 | 0 |
| P06 | correction | 0 | 1 | 1 |
| P07 | decision | 0 | 2 | 0 |
| P08 | correction | 1 | 0 | 2 |
| P09 | correction | 1 | 1 | 0 |
| P10 | correction | 2 | 0 | 2 |
| P11 | correction | 0 | 0 | 2 |
| P12 | correction | 0 | 1 | 0 |
| P13 | correction | 0 | 0 | 0 |
| P14 | decision | 1 | 1 | 1 |
| P15 | recall | 1 | 0 | 2 |
| P16 | decision | 1 | 0 | 1 |
| P17 | decision | 2 | 0 | 2 |
| P18 | decision | 0 | 0 | 1 |
| P19 | decision | 2 | 1 | 1 |
| P20 | decision | 2 | 2 | 2 |
| P21 | decision | 1 | 1 | 1 |
| P22 | recall | 0 | 0 | 2 |
| P23 | recall | 2 | 0 | 1 |
| P24 | recall | 2 | 0 | 2 |
| P25 | recall | 0 | 0 | 2 |
| P26 | recall | 2 | 0 | 2 |
| P27 | recall | 2 | 0 | 2 |
| P28 | recall | 1 | 0 | 1 |
| P29 | recall | 0 | 1 | 1 |
| P30 | recall | 2 | 0 | 1 |
| P31 | recall | 2 | 1 | 1 |
| P32 | artifact | 1 | 2 | 1 |
| P33 | artifact | 2 | 0 | 2 |
| P34 | artifact | 2 | 0 | 0 |
| P35 | artifact | 0 | 0 | 2 |
| P36 | artifact | 2 | 2 | 0 |
| P37 | artifact | 0 | 0 | 1 |
| P38 | artifact | 2 | 1 | 1 |
| P39 | artifact | 2 | 2 | 1 |
| P40 | artifact | 0 | 0 | 2 |
| P41 | artifact | 0 | 2 | 0 |
| P42 | continuation | 0 | 2 | 1 |
| P43 | continuation | 0 | 2 | 0 |
| P44 | continuation | 0 | 2 | 1 |
| P45 | continuation | 2 | 2 | 2 |
| P46 | continuation | 2 | 2 | 2 |
| P47 | continuation | 1 | 2 | 2 |
| P48 | continuation | 0 | 2 | 0 |
| P49 | continuation | 0 | 2 | 0 |
| P50 | continuation | 1 | 2 | 0 |
| P51 | continuation | 0 | 2 | 0 |
| P52 | continuation | 2 | 2 | 2 |
| P53 | continuation | 1 | 2 | 1 |
| P54 | continuation | 0 | 2 | 0 |

## Zoom

- tree answers: 54; zoomed on 39 (72%), 1.09 zoom replies a question, 1.98 lines opened a question
- tree score when it zoomed: 28/78; when it didn't: 25/30
- tree-B answers: 54; zoomed on 40 (74%), 1.04 zoom replies a question, 2.22 lines opened a question
- tree-B score when it zoomed: 39/80; when it didn't: 22/28

## Incremental builds: the tree filed as the chat goes

The chat: 571 turns over 12.99 hours. $ is the tokens at list price for claude-sonnet-5-5 ($2.0 input, $2.5 5-minute cache write, $0.1 cache read, $10.0 output per MTok; https://platform.claude.com/docs/en/build-with-claude/prompt-caching); the cost Claude Code reported is beside it.

| design | requests | calls | input | cache write | cache read | output (of it thinking) | $ | $ reported |
|---|---|---|---|---|---|---|---|---|
| A | file | 78 | 156 | 664,175 | 6,360,814 | 58,431 (0) | 2.88 | 2.88 |
| A | merge | 54 | 108 | 459,531 | 6,174,182 | 97,093 (0) | 2.74 | 2.74 |
| A | shorten | 10 | 20 | 68,890 | 1,480,067 | 31,117 (0) | 0.63 | 0.63 |
| A | **all** | 142 | 284 | 1,192,596 | 14,015,063 | 186,641 (0) | 6.25 | 6.25 |
| B | file | 506 | 1,012 | 4,450,320 | 12,742,282 | 286,570 (0) | 15.27 | 15.27 |
| B | fix | 1 | 2 | 3,682 | 28,305 | 160 (0) | 0.01 | 0.01 |
| B | merge | 456 | 912 | 1,501,459 | 12,409,456 | 654,023 (0) | 11.54 | 11.54 |
| B | shorten | 62 | 124 | 343,532 | 1,645,093 | 192,266 (0) | 2.95 | 2.95 |
| B | **all** | 1,025 | 2,050 | 6,298,993 | 26,825,136 | 1,133,019 (0) | 29.76 | 29.76 |

| design | built over | $ build | $ a turn | $ an hour of chat | cache read share of prompt tokens | $ an hour with the chat's pauses, 5-minute cache | same, 1-hour cache | $ an hour beyond the chat's own context |
|---|---|---|---|---|---|---|---|---|
| A | 89 of 571 turns, 2.72 h | 6.25 | 0.0702 | 2.29 | 92% | 2.56 | 2.95 | 1.45 |
| B | 571 of 571 turns, 12.99 h | 29.76 | 0.0521 | 2.29 | 81% | 2.39 | 3.03 | 2.29 |

For comparison, the batch tree's build in this ledger: 0 calls, 0 cache write, 0 cache read, 0 output, $0.00 reported.
In A the last column counts only the lines it writes (output) and its merge, shorten and fix requests: the session is the chat's own context, which the chat carries whether or not it files.

- A: built over the first 89 turns only (--a-turns): 3 rewrites, 8 sessions; not answered or judged
- B: 8,803 nodes (4,970 written by the model, 0 left as "(compaction failed)"), view 257 lines, 97,494 bytes, 17 rewrites

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
| tree-B (view, before any zoom) | 97,170 | 42/54 |
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
| build-B | 1,043 | 1,167 | 2 | 0 | 2,098 | 6,500,882 | 27,448,494 | 1,151,607 (131) | $30.52 | 9,123 |
| build-A | 142 | 3 | 0 | 0 | 284 | 1,192,596 | 14,015,063 | 186,641 (0) | $6.25 | 1,469 |
| answer | 110 | 0 | 0 | 0 | 220 | 217,923 | 5,068,718 | 24,855 (10,542) | $1.30 | 426 |
| judge | 55 | 0 | 0 | 0 | 110,401 | 0 | 0 | 10,086 (0) | $0.32 | 191 |
| **all** | 1,350 | 1,170 | 2 | 0 | 113,003 | 7,911,401 | 46,532,275 | 1,373,189 (10,673) | $38.39 | 11,209 |

