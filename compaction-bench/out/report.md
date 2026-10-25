# Compaction benchmark

Written 2026-10-25T11:01:36.026Z. Cuts: 24 (2 chained). Runs: 57 done, 9 stopped. Noise floor: 0.75 (the larger of Nous's 0.3 and the 95th percentile of A0-vs-A0 spread, 0.75).

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
| cold / cross-org / no cache | < floor | move whole | `moveWholeUnderK` = below 118k: whole was dearer than a summary at every one of 24 cuts from 118k to 965k (§7b, cost alone; contexts under 100k were not drawn) |
| cold / cross-org / no cache | 100-300k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $11.86, native /compact $9.37, Sonnet summary $8.39) | `overFloor` = summarize (cost alone; quality unmeasured) |
| limit gone early | 100-300k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $11.86, native /compact $9.37, Sonnet summary $8.39) (ahead-of-limit unavailable) | `overFloor` = summarize (cost alone; quality unmeasured) |
| cold / cross-org / no cache | 300-600k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $23.15, native /compact $16.01, Sonnet summary $12.77) | `overFloor` = summarize (cost alone; quality unmeasured) |
| limit gone early | 300-600k | undecided on quality (no arm has both a quality and a cost reading here); by cost alone (§7b): Sonnet summary (whole $23.15, native /compact $16.01, Sonnet summary $12.77) (ahead-of-limit unavailable) | `overFloor` = summarize (cost alone; quality unmeasured) |
| cold / cross-org / no cache | 600k+ | E1: A2 summarize · Sonnet · extract · CawCo; among A1 (2 cuts), A2 (2 cuts) with both readings | `overFloor` = summarize |
| limit gone early | 600k+ | E1: A2 summarize · Sonnet · extract · CawCo; among A1 (2 cuts), A2 (2 cuts) with both readings (ahead-of-limit unavailable) | `overFloor` = summarize |
| warm, same org (by cost) | 100-300k | by cost alone (§7b): native /compact (whole $9.96, native /compact $8.10, Sonnet summary $8.39); quality unmeasured | — |
| warm, same org (by cost) | 300-600k | by cost alone (§7b): Sonnet summary (whole $17.42, native /compact $12.98, Sonnet summary $12.77); quality unmeasured | — |
| warm, same org (by cost) | 600k+ | by cost alone (§7b): native /compact (whole $22.91, native /compact $9.95, Sonnet summary $9.99); quality unmeasured | — |
| (E1 = summarize) | E2 model | A3 − A2: quality – –, cost −$0.5411 [-0.9523, -0.1298]; not actionable: fewer than 2 shared cuts; no quality judgment | `summarizer.model`; the extract and prompt in `continuation.ts` |
| (E1 = summarize) | E3 input | A4 − A2: quality – –, cost +$0.4569 [+0.2733, +0.6406]; not actionable: fewer than 2 shared cuts; no quality judgment | `summarizer.model`; the extract and prompt in `continuation.ts` |
| (E1 = summarize) | E4 shape | A5 − A4: quality – –, cost −$0.3183 [-0.4564, -0.1802]; not actionable: fewer than 2 shared cuts; no quality judgment | `summarizer.model`; the extract and prompt in `continuation.ts` |
| chained | — | undecided: the Factory merge (A6) has no quality reading | whether the summarizer merges the prior summary (Factory) or restates it |

## 1b. Before a move to another organization: compact on the warm account first (A1 warm), or move whole (A0 cold)

A1 warm: `/compact` priced with its read of the context from the warm cache (the session's own account), then the continued turn and the horizon on the target, cold (another organization shares no cache). A0 cold: the whole context written to the target's cache by the continued turn's first request, then the horizon. Paired per cut; difference A1 warm − A0 cold; 95 % bootstrap CI over cuts.

| band | cuts | A0 cold total K | A1 warm total K | median Δ (A1w − A0c) | CI | A1 cheaper at | quality Δ A1 − A0 Opus | quality Δ A1 − A0 Sonnet | A1 vs A0 pairwise Opus w/t/l |
|---|---|---|---|---|---|---|---|---|---|
| 100-300k | 0 | – | – | – | – | 0 of 0 | – – | – – | 1/0/0 |
| 300-600k | 0 | – | – | – | – | 0 of 0 | – – | – – | 0/0/0 |
| 600k+ | 0 | – | – | – | – | 0 of 0 | – – | – – | 0/0/0 |
| all | 0 | – | – | – | – | 0 of 0 | – – | – – | 1/0/0 |

Per cut (context at the cut → A1 warm, A0 cold, Δ): –

By arithmetic over every drawn cut (§7b): compact warm, then move = native `/compact` reading the context from the warm cache, then the compacted prompt written on the target; move whole = the whole context written on the target. Total over the next 20 real turns, USD.

| band | cuts | move whole (cold) | compact warm, then move | Δ | compact-first cheaper at | Sonnet summary, then move |
|---|---|---|---|---|---|---|
| 100-300k | 8 | $11.86 | $8.10 | -4.24 [-4.82, -2.99] | 8 of 8 | $8.39 |
| 300-600k | 8 | $23.15 | $12.98 | -10.16 [-14.87, -9.87] | 8 of 8 | $12.77 |
| 600k+ | 8 | $30.24 | $9.95 | -19.47 [-27.18, -15.58] | 8 of 8 | $9.99 |
| all | 24 | $21.08 | $9.98 | -10.16 [-16.00, -8.90] | 24 of 24 | $10.06 |

Moving whole was not possible at all at 2 cuts: every A0 run there stopped on "Prompt is too long" (c20 958k, c23 965k); the real sessions compacted there.

## 1c. Judged pairs (both orders, both judges; a win or loss counts only when both orders agree)

Noise: the A0 runs of one cut against each other (§4): 0-5 spread, Opus, 0.00, 0.00, 1.25, 0.75; the floor used is 0.75.

| pair | cut | run | Opus (arm-first, control-first) | Opus | Sonnet (arm-first, control-first) | Sonnet | judges agree |
|---|---|---|---|---|---|---|---|
| A1 vs A0 | c01 | 1 | win, win | win | win, win | win | yes |
| A1 vs A0 | c17 | 1 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c17 | 2 | win, loss | tie | loss, loss | loss | no |
| A1 vs A0 | c17 | 3 | loss, loss | loss | loss, loss | loss | yes |
| A1 vs A0 | c18 | 1 | win, win | win | win, loss | tie | no |
| A1 vs A0 | c18 | 2 | loss, loss | loss | win, win | win | no |
| A1 vs A0 | c18 | 3 | win, win | win | win, win | win | yes |
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

| pair | judged pairs | Opus win/tie/loss | Sonnet win/tie/loss | judges agree | both judges say the arm lost |
|---|---|---|---|---|---|
| A1 vs A0 | 7 | 3/1/3 | 4/1/2 | 3 of 7 | 1 |
| A1 vs A2 | 12 | 8/0/4 | 8/0/4 | 10 of 12 | 3 |

0-5 (mean of the four dimensions; median over runs) per cut, Opus / Sonnet:

| cut | A0 | A1 | A2 | A1 − A0 | A2 − A0 |
|---|---|---|---|---|---|
| c01 | 3.00 / 1.25 | 3.25 / 2.00 | 1.00 / 0.75 | +0.25 / +0.75 | -2.00 / -0.50 |
| c17 | 2.50 / 1.50 | 1.25 / 1.25 | 1.75 / 1.75 | -1.25 / -0.25 | -0.75 / +0.25 |
| c18 | 3.25 / 1.50 | 2.50 / 1.25 | 2.38 / 1.25 | -0.75 / -0.25 | -0.88 / -0.25 |
| c20 | – / – | 2.75 / 2.50 | 2.25 / 1.75 | – | – |
| c23 | – / – | 3.50 / 3.25 | 3.00 / 2.75 | – | – |

Per dimension, median over every judged run, Opus / Sonnet:

| arm | runs | decision_fidelity | artifact_fidelity | continuation_fidelity | no_repetition |
|---|---|---|---|---|---|
| A0 | 7 | 3.0 / 2.0 | 3.0 / 2.0 | 1.0 / 1.0 | 4.0 / 2.0 |
| A1 | 13 | 3.0 / 2.0 | 3.0 / 2.0 | 2.0 / 2.0 | 3.0 / 3.0 |
| A2 | 12 | 2.0 / 2.0 | 2.5 / 1.5 | 2.0 / 1.5 | 3.0 / 2.5 |

## 2. Quality per arm (median over runs, then over cuts)

| arm | what | cuts | abs 0-5 Opus | abs 0-5 Sonnet | win/tie/loss vs A0 Opus | win/tie/loss vs A0 Sonnet | asked back | files J | commands J | re-fetches | anchor keys carried | probe score Opus | probe score Sonnet | summary rules 1 / 2 Opus | summary rules 1 / 2 Sonnet |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A0 | whole (control) | 3 | 2.88 | 1.50 | — | — | – | 0.00 | 0.00 | 0.0 | 1.00 | – | – | – | – |
| A1 | native /compact | 5 | 2.62 | 1.88 | 3/1/3 | 4/1/2 | 0.0 | 0.00 | 0.00 | 0.0 | 0.36 | – | – | – | – |
| A2 | summarize · Sonnet · extract · CawCo | 5 | 2.31 | 1.75 | 0/0/0 | 0/0/0 | – | 0.00 | 0.00 | 0.0 | 0.29 | – | – | – | – |
| A3 | summarize · Haiku · extract · CawCo | 3 | – | – | 0/0/0 | 0/0/0 | – | 1.00 | 0.00 | 0.0 | 0.09 | – | – | – | – |
| A4 | summarize · Sonnet · full-clipped · CawCo | 3 | – | – | 0/0/0 | 0/0/0 | – | 1.00 | 0.00 | 0.0 | 0.36 | – | – | – | – |
| A5 | summarize · Sonnet · full-clipped · Claude Code shape | 3 | – | – | 0/0/0 | 0/0/0 | – | 1.00 | 0.00 | 0.0 | 0.36 | – | – | – | – |
| A6 | Factory anchored merge (chained) | 2 | – | – | 0/0/0 | 0/0/0 | – | 0.00 | 0.00 | 0.0 | 0.46 | – | – | – | – |

Summary rules: the owner's rules for a compaction summary (2026-10-21), 0-5 each, on the summary the arm carried (A1: Claude Code's; A2-A7: the summariser's): 1, the person's messages carried as meaning, never quoted; 2, only what the next turns need. Median over runs, then over cuts. Secondary: it enters no decision.

Cuts: those with at least one finished run. Files J and commands J are Jaccard similarities with the real turn's edited files and commands; two empty sets count as 1 (neither turn edited a file), and a command matches only verbatim, so commands J is near 0 wherever wording differs. A blank judge column means no judgment was made.

## 2b. Quality and cost by stratum (Opus absolute 0-5; cold total at K)

| arm | stratum | value | cuts | abs 0-5 Opus | total K (USD) |
|---|---|---|---|---|---|
| A0 | next message | agent | 2 | 2.88 | 20.8591 |
| A0 | kind | native-midturn | 2 | 2.88 | 20.8591 |
| A1 | next message | agent | 3 | 2.50 | 22.6370 |
| A1 | next message | person | 1 | 2.75 | 30.3828 |
| A1 | kind | continued | 1 | 2.75 | 30.3828 |
| A1 | kind | native-midturn | 3 | 2.50 | 22.6370 |
| A2 | next message | agent | 3 | 2.38 | 23.3527 |
| A2 | next message | person | 1 | 2.25 | 26.4339 |
| A2 | kind | continued | 1 | 2.25 | 26.4339 |
| A2 | kind | native-midturn | 3 | 2.38 | 23.3527 |
| A3 | next message | agent | 1 | – | 55.1294 |
| A3 | next message | person | 1 | – | 26.3041 |
| A3 | kind | continued | 1 | – | 26.3041 |
| A3 | kind | native-midturn | 1 | – | 55.1294 |
| A4 | next message | agent | 1 | – | 56.3550 |
| A4 | next message | person | 1 | – | 27.0745 |
| A4 | kind | continued | 1 | – | 27.0745 |
| A4 | kind | native-midturn | 1 | – | 56.3550 |
| A5 | next message | agent | 1 | – | 56.1748 |
| A5 | next message | person | 1 | – | 26.6181 |
| A5 | kind | continued | 1 | – | 26.6181 |
| A5 | kind | native-midturn | 1 | – | 56.1748 |
| A6 | next message | agent | 1 | – | 11.5083 |
| A6 | kind | native-midturn | 1 | – | 11.5083 |

## 3. Cost per arm, per regime and band (USD; median over runs, then over cuts; product prices, each request on its own)

| arm | band | regime | C_make | C_between | C_turn1 | C_horizon(K) | total K | total K=20 | total K=50 | CI total K vs A0 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0 | 100-300k | cold | 0.0000 | 0.0000 | 0.7795 | 42.9006 | 43.6801 | 7.1328 | 31.7704 | – |
| A0 | 100-300k | warm | 0.0000 | 0.0000 | 0.1181 | 42.9006 | 43.0187 | 6.4714 | 31.1090 | – |
| A0 | chained | cold | 0.0000 | 0.0000 | 6.7797 | 14.1778 | 20.9575 | 19.1592 | – | – |
| A0 | chained | warm | 0.0000 | 0.0000 | 0.7330 | 14.1778 | 14.9109 | 13.1125 | – | – |
| A1 | 100-300k | cold | 0.6052 | 0.0000 | 0.3928 | 36.6155 | 37.6135 | 5.7401 | 27.1024 | – |
| A1 | 100-300k | warm | 0.2401 | 0.0000 | 0.3928 | 36.6155 | 37.2484 | 5.3750 | 26.7373 | – |
| A1 | 600k+ | cold | 4.6673 | 0.0000 | 0.9117 | 40.0907 | 45.9194 | 19.4159 | 28.6264 | – |
| A1 | 600k+ | warm | 0.4556 | 0.0000 | 0.9117 | 40.0907 | 41.6921 | 15.1886 | 24.5128 | – |
| A1 | chained | cold | 4.7428 | 7.4606 | 0.9053 | 7.9296 | 21.2053 | 20.4542 | – | [-3.6266, +2.9818] |
| A1 | chained | warm | 0.6902 | 7.4606 | 0.9053 | 7.9296 | 17.1590 | 16.4079 | – | [-0.8440, +4.2000] |
| A2 | 100-300k | cold | 0.4297 | 0.0000 | 0.1084 | 37.1969 | 37.7350 | 5.4293 | 27.0946 | – |
| A2 | 100-300k | warm | 0.4297 | 0.0000 | 0.1084 | 37.1969 | 37.7350 | 5.4293 | 27.0946 | – |
| A2 | 600k+ | cold | 1.1110 | 0.0000 | 0.2358 | 40.6331 | 42.1907 | 15.6030 | 23.9750 | – |
| A2 | 600k+ | warm | 1.1110 | 0.0000 | 0.2358 | 40.6331 | 42.1907 | 15.6030 | 23.9750 | – |
| A2 | chained | cold | 1.0878 | 5.6258 | 0.2114 | 6.9875 | 13.9741 | 12.6742 | – | [-10.1023, +3.6975] |
| A2 | chained | warm | 1.0878 | 5.6258 | 0.2114 | 6.9875 | 13.9741 | 12.6742 | – | [-2.9935, +8.6821] |
| A3 | 100-300k | cold | 0.4044 | 0.0000 | 0.2621 | 37.4710 | 38.1376 | 5.6280 | 27.4361 | – |
| A3 | 100-300k | warm | 0.4044 | 0.0000 | 0.2621 | 37.4710 | 38.1376 | 5.6280 | 27.4361 | – |
| A3 | 600k+ | cold | 0.7332 | 0.0000 | 0.2640 | 40.5679 | 41.8374 | 15.1263 | 23.1641 | – |
| A3 | 600k+ | warm | 0.7332 | 0.0000 | 0.2640 | 40.5679 | 41.8374 | 15.1263 | 23.1641 | – |
| A4 | 100-300k | cold | 0.4289 | 0.0000 | 0.1441 | 37.1389 | 37.7120 | 5.4494 | 27.0844 | – |
| A4 | 100-300k | warm | 0.4289 | 0.0000 | 0.1441 | 37.1389 | 37.7120 | 5.4494 | 27.0844 | – |
| A4 | 600k+ | cold | 1.5490 | 0.0000 | 0.1961 | 40.5019 | 42.3038 | 15.8786 | 24.2631 | – |
| A4 | 600k+ | warm | 1.5490 | 0.0000 | 0.1961 | 40.5019 | 42.3038 | 15.8786 | 24.2631 | – |
| A5 | 100-300k | cold | 0.3653 | 0.0000 | 0.0821 | 36.8895 | 37.3369 | 5.2599 | 26.7649 | – |
| A5 | 100-300k | warm | 0.3653 | 0.0000 | 0.0821 | 36.8895 | 37.3369 | 5.2599 | 26.7649 | – |
| A5 | 600k+ | cold | 1.4413 | 0.0000 | 0.2752 | 39.7444 | 41.3898 | 16.1126 | 24.1462 | – |
| A5 | 600k+ | warm | 1.4413 | 0.0000 | 0.2752 | 39.7444 | 41.3898 | 16.1126 | 24.1462 | – |
| A6 | chained | cold | 1.1983 | 3.6263 | 0.1396 | 6.9843 | 11.9796 | 10.6828 | – | – |
| A6 | chained | warm | 1.1983 | 3.6263 | 0.1396 | 6.9843 | 11.9796 | 10.6828 | – | – |

Window percent of the cold total at K, where the account's readings measure it:

| cut | arm | run | window % |
|---|---|---|---|
| c01 | A0 | 1 | session 15.335, weekly_all 3.530, weekly_scoped/Fable 0.788 |
| c01 | A1 | 1 | session 12.807, weekly_all 2.948, weekly_scoped/Fable 0.658 |
| c01 | A2 | 1 | session 12.969, weekly_all 2.986, weekly_scoped/Fable 0.666 |
| c01 | A3 | 1 | session 13.145, weekly_all 3.026, weekly_scoped/Fable 0.675 |
| c01 | A4 | 1 | session 12.959, weekly_all 2.983, weekly_scoped/Fable 0.666 |
| c01 | A5 | 1 | session 12.823, weekly_all 2.952, weekly_scoped/Fable 0.659 |
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
| c18 | A2 | 3 | session 4.487, weekly_all –, weekly_scoped/Fable 0.049 |
| c18 | A6 | 1 | session 4.695, weekly_all –, weekly_scoped/Fable 0.051 |
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

## 4. Noise floor (A0 run 1 against the other A0 runs of the same cut, wherever A0 has repeats)

Floor cuts: c17, c18. Absolute spreads (Opus): 0.00, 0.00, 1.25, 0.75; 95th percentile 0.75; floor used 0.75.

| cut | run | judge | outcome(s) |
|---|---|---|---|
| c17 | 2 | opus | loss, win |
| c17 | 2 | sonnet | win |
| c17 | 3 | opus | win |
| c17 | 3 | sonnet | win |
| c18 | 2 | opus | loss, win |
| c18 | 2 | sonnet | loss |
| c18 | 3 | opus | win |
| c18 | 3 | sonnet | loss, win |

## 5. Judge disagreements (Opus vs Sonnet)

| cut | arm | run | reading | Opus | Sonnet |
|---|---|---|---|---|---|
| c01 | A0 | 1 | absolute | 3.00 | 1.25 |
| c01 | A1 | 1 | absolute | 3.25 | 2.00 |
| c17 | A0 | 1 | absolute | 2.50 | 1.25 |
| c17 | A1 | 1 | pairwise | loss | win |
| c17 | A1 | 2 | pairwise | tie | loss |
| c18 | A0 | 2 | absolute | 3.75 | 1.25 |
| c18 | A1 | 1 | absolute | 2.50 | 1.25 |
| c18 | A1 | 1 | pairwise | win | tie |
| c18 | A1 | 2 | pairwise | loss | win |
| c18 | A2 | 1 | absolute | 2.50 | 1.25 |
| c23 | A2 | 2 | absolute | 3.75 | 2.50 |

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
| 100-300k | A2 | 0 | – | – |
| 300-600k | A2 | 0 | – | – |
| 600k+ | A2 | 0 | – | – |

## 7b. Cost by arithmetic: whole, native /compact and a Sonnet summary, per situation and band

Per drawn cut, priced request by request with the product's `costForUsage`; the median over the cuts of each band. Total = make + turn 1's first request + the next 20 real turns (fewer where the session had fewer). Session model as drawn (claude-fable-5-1: 3 cuts, claude-opus-5-5: 17 cuts, claude-opus-5-5[1m]: 4 cuts). USD.

Measured inputs:

- native `/compact`: input 5,176.0 and output 7,515.0 tokens (medians of 114 measured manual compactions on Opus); carried after it S_n = 100-300k 49,610 (n=54), 300-600k 51,659 (n=53), 600k+ 59,006 (n=48) tokens (first request after a real boundary);
- Sonnet summary: input = 0.083 × P, output 5,068 tokens (12 finished A2 summaries); the opening turn $0.5314 (12 measured); carried after it S_s = 68,651 tokens;
- turn-1 writes at the 1-hour rate: in the finished A0 runs the 1-hour share of the first request's write was 1.00 (n=7).

| situation | band | cuts | P (median) | whole | native /compact | Sonnet summary | cheapest |
|---|---|---|---|---|---|---|---|
| warm same-org | 100-300k | 8 | 216,155 | $9.96 (make 0.00, t1 0.06, next 9.90) | $8.10 (make 0.22, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | native |
| warm same-org | 300-600k | 8 | 481,252 | $17.42 (make 0.00, t1 0.12, next 17.32) | $12.98 (make 0.27, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| warm same-org | 600k+ | 8 | 941,946 | $22.91 (make 0.00, t1 0.20, next 22.67) | $9.95 (make 0.36, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | native |
| cold or cross-org | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | sonnet |
| cold or cross-org | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| cold or cross-org | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | sonnet |
| limit gone early | 100-300k | 8 | 216,155 | $11.86 (make 0.00, t1 1.93, next 9.90) | $9.37 (make 1.37, t1 0.41, next 7.47) | $8.39 (make 0.62, t1 0.03, next 7.74) | sonnet |
| limit gone early | 300-600k | 8 | 481,252 | $23.15 (make 0.00, t1 4.18, next 17.32) | $16.01 (make 2.77, t1 0.46, next 11.86) | $12.77 (make 0.66, t1 0.04, next 12.09) | sonnet |
| limit gone early | 600k+ | 8 | 941,946 | $30.24 (make 0.00, t1 7.56, next 22.67) | $14.47 (make 4.88, t1 0.50, next 9.09) | $9.99 (make 0.74, t1 0.04, next 9.21) | sonnet |

Per cut (situation · method → total): see out/arith.json.


## 8. Stopped runs and judgments

Arms not run (out/not_run.json):

- **A7d**: OpenCode on opencode-go/deepseek-v4-pro was not run: the opencode-go key (the one ending 4DEY) has expired (HTTP 401, api_key_expired: "This API key has expired. Create a new API key in OpenCode Console and replace it in your client or secret store."). The owner, 2026-10-25: "stop pausing the compact benchmark on opencode, move on!"
- **A7g**: pi on openai-codex/gpt-5.6-terra was not run: the ChatGPT account answered "Codex error: The usage limit has been reached" from the first smoke (04:30 UTC) to the last probe (09:04 UTC) on 2026-10-25, and the run was stopped before it cleared.
- **main run**: stopped by the owner at about 13:00 local (10:00 UTC) on 2026-10-25, after 55 finished runs on 5 of the 22 single cuts and both chained pairs (plus c18 A2/A6, left to finish): "the cost side is arithmetic". No judge model call was made, so no quality judgment exists; the cost of every situation and band is in §7b (arith.py), from the DB's and transcripts' token counts and the product's prices.

By arm and class:

| arm | class | runs |
|---|---|---|
| A0 | turn failed | 6 |
| A2 | turn failed | 1 |
| A6 | turn failed | 2 |

Judgments stopped: 0.

Each:

| cut | arm | run | error |
|---|---|---|---|
| c18 | A2 | 2 | turn failed (exit 1, errors ['rate_limit']): You've hit your session limit · resets 4:30pm (Asia/Qatar) |
| c18 | A6 | 2 | turn failed (exit 1, errors ['rate_limit']): You've hit your session limit · resets 4:50pm (Asia/Qatar) |
| c18 | A6 | 3 | turn failed (exit 1, errors ['rate_limit']): You've hit your session limit · resets 4:50pm (Asia/Qatar) |
| c20 | A0 | 1 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c20 | A0 | 2 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c20 | A0 | 3 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c23 | A0 | 1 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c23 | A0 | 2 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |
| c23 | A0 | 3 | turn failed (exit 1, errors ['invalid_request']): Prompt is too long |

Cuts with at least one finished run: 5 of 24. A cut is left out of a CI only where fewer than 2 of an arm's runs finished there (B6).

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

