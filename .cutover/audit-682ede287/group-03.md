The workspace is clean (`git status --porcelain` returns 0 lines). I removed the capture checkout I made under `.cutover/`.

## Method
- Skills loaded: `clearshot`, `interface-craft`.
- Read DESIGN.md whole (976 lines) and the MANIFEST lines for group-03.
- Opened each entry's 1440 light and 390 dark capture. I did not open 1440 dark or 390 light: the first two showed no theme- or width-specific problem that needed them.
- Boxes are approximate x/y in the capture's own pixels. Shell captures are 1440×900. Page-only and crop captures are about 1212×856, or smaller for card crops. Phone captures are 390 wide.
- Contrast and sizes are by eye. "Looks" marks anything I could not measure.
- **Two things in the brief don't match the DESIGN.md I was given.**
  - It has no "solid-mark rule". L923 (The Solar Duotone Rule) says every icon is duotone, and a status glyph keeps its hue at 0.5 and holds 3:1. I checked status marks for size under 16px and for icons that draw solid. A "Review"/"Needs you" hand glyph at about 10px is flagged under L846 and L924.
  - It says "not a 4px grid" (L469, L635). I did not flag spacing against 4px. I checked sibling consistency and the ladder 4/7/11/14/18/21/25/32.

## Shared findings (repeat across many captures)
| ID | Sev | Where | What I see | DESIGN.md |
|---|---|---|---|---|
| S1 | wrong | Every desk capture with the rail: x16–170, y168–188 | The Working and Finished tab labels are cut to "Worki…" and "Finish…" next to their count badges. | L752 Work tab count; L623 Truncate Inside Rule |
| S2 | polish | Every phone session capture: x325–345, y18–34 | The "+" new-tab button sits on the clipped title of the next tab. | L689 Stack |
| S3 | wrong | Every desk project board/task capture: x755–933, y128–888 | The Review column is squeezed to about 125px between the Ready/Working columns and the side panel and the Archived rail. Its card "Audit the push pro…" is clipped with no ellipsis. | L623 |
| S4 | wrong | Copy glyph in session-tab-menu (x17–30, y256–270), session-diff header (x670–684, y96–110) and sheet-inspect (copy and trash, x1290–1405, y115–130) | The glyph draws as a solid near-black block with no second duotone layer. | L923 Solar Duotone Rule; L972 |
| S5 | wrong | Project board, week, week-page and pipeline captures | The Review column or row is washed in coral or pink, with a coral label and (pipeline) a coral bar. Needs-you is status, and its hue is spark yellow. | L552; L580 Coral Is Where You Act ("never a status"); L959 |
| S6 | polish | Same captures | Stage subtitles ("to do", "active", "needs you", "done", "dropped") are set in JetBrains Mono, which is the Code role. Column heads are not in the Column head role (uppercase, 13px, 0.06em). | L610 Code; L619; L609 |

## session-behind
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x14–150, y236–260 | The tool-row verb "Read" is cut to "R.." while the muted path "/home/bewinxed/.ca…" stays. | L623; L860 Tool rows |
| wrong | phone-dark | x196–228, y443–462 | The subagent's ask is cut to "Au…" while "claude-probe" and the pill stay. | L623 |
| wrong | phone-dark | x112–288, y566–612 | The "Not caught up · Try again" tag sits over transcript text, which shows through its edge. | L862 Floating tags |
| polish | desk-light | x250–500, y727–777 | The attachment chips stand on the transcript with the code block running under them. The chip's ✕ overlaps the end of "chip-notes.txt". | L741 Field shell |

## session-canvas (desk only)
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x585–1075, y380–440 | The refusal is plain centred dark-red text. It is not a band in the error formula, and there is no Show details. | L891; L883 |
| S1 | desk-light | | | |

## session-compacted
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x237–245, y282–290 | At rest the "Compacted" divider shows a small solid triangle after the word. The chevron should be Solar linear and should arrive only under the pointer or focus. | L858; L923 |
| S2 | phone-dark | | | |

## session-composer-grown
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x14–185, y236–260 | The tool-row verb is cut to "R..". | L623 |
| S2 | phone-dark | | | |

## session-delegate
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x812–953, y705–733 | The "Create project" button looks about 28px tall, not `sm` 30px. | L241; L724 |
| wrong | phone-dark | x12–378, y643–723 | The "Make it a project?" bar floats over the report card and covers its text ("Commits:" and below). | L862; L905 |
| polish | phone-dark | x155–205, y683–710 | "Not now" has no visible 44px area. | L929 |
| S2 | phone-dark | | | |

## session-diff
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | whole image | The capture is the rail sheet open over a dimmed page, not the diff. The phone diff is not evidenced. | L812 |
| S4 | desk-light | x670–684, y96–110 | The head's copy glyph is a solid black square. | L923 |
| polish | desk-light | x1145–1300, y86–118 | The Unified/Split segmented control's glyphs look about 12px. | L796 |

## session-live
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x924–958, y800–834 | The Stop glyph is a tiny half-filled gradient square. | L866 |
| S2 | phone-dark | | | |

## session-live-thinking
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | both | x32–245, y98–148 | While live the row is a static "Thinking ⌄" with one bullet. There is no live indicator (the two 20px marks and the cycling words). | L849; L857 |
| S2 | phone-dark | | | |

## session-mention
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | both | rows x517–700, y598–805 (desk) | The meta line has a stray double space before "· yours · obelisk-of-light" on every row. | L602 |
| S1, S2 | | | | |

## session-move-ask
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x327–341, y317–331 | The hand-shake status glyph at the head is about 12px. | L846; L924 |
| polish | both | x361–415, y478–496 (desk) | "Details ›" is a small ghost at about 12px type. | L929 |

## session-permission
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | Approve x257–373, Deny x853–955, y697–727 (desk); x22–139 and x266–368, y671–701 (phone) | Approve is about 117px wide and Deny about 102px. Both labels are left-aligned with empty space after them. | L901 The Peer Rule (same size) |
| polish | both | x258–274, y601–620 (desk) | The shield glyph at the card head draws as a half-black solid shield, not duotone. | L923 |
| S2 | phone-dark | | | |

## session-plan
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x916–1070, y103–160 | The plan step marks (tick, filled dot, ring) are about 10px. | L848; L846 |
| wrong | phone-dark | x0–390, y0–676 | The page behind the plan drawer is blurred and darkened far beyond the scrim (2px blur at 72%). | L664 |
| polish | desk-light | x783–869, y802–828 | The "Plan 1/3" tag's ring glyph looks 12px. | L848 |
| S1 | desk-light | | | |

## session-question
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | both | "Other" row x258–954, y764–794 (desk); x22–368, y760–788 (phone) | The "Other" option is about 28–30px tall and the others about 43px. | L905 |
| polish | both | Answer x258–378, y806–834 | The Answer button looks about 28px tall. | L724 |
| polish | desk-light | x258–276, y558–576 | The "?" head glyph is a solid grey disc with a white mark. | L923 |

## session-recall
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x518–1150, y550–840 | The grown shape is a tall empty raised blob with one row on the field's line. It reads unfinished. | L870; L873 |
| polish | desk-light | x1148–1152, y848–876 | A stray 1px coral vertical line sits left of the Send button. | L873 |
| polish | phone-dark | x24–366, y432–840 | The shape is a flat panel with no visible top-edge fade into the transcript. | L873 |
| S1, S2 | | | | |

## session-rest
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x130–260, y582–610 | The "Jump to latest" tag has no solid fill. Transcript text shows through it. | L862 |
| polish | desk-light | x770–901, y658–687 | The tag sits mid-column, about 150px above the composer, on the code block's corner. | L862 |
| S1, S2 | | | | |

## session-run-block
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x44–58, y98–112 | The "Chip audit" row's lead mark is a near-white 12px disc on paper. It is invisible. | L923 |
| wrong | phone-dark | x30–45, y150–165 | The same lead mark is near-black on the dark ground. | L923 |
| polish | phone-dark | x155–205, y683–710 | "Not now" has no visible 44px area. | L929 |
| S2 | phone-dark | | | |

## session-session-card
Crops of the card, 416×268 and 366×300.
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | context bar x70–165, y170–176 (desk crop) | The context bar fill at 1% is coral by day and red-brown at night. Coral is the action, and 1% is a healthy reading. | L580; L559; L790 |
| polish | desk-light | x217–253, y14–46 | The copy-link button's coral keyboard ring touches the title (about 2px gap). | L927 |
| polish | desk-light | x18–318, y92–152 | The four setting chips have uneven widths and gaps of 4–7px. | L699 |

## session-skill-tool
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x44–58, y96–112 | The skill glyph is a neutral grey bolt. Tool families take a hue (`tool-skill`). | L575; L860 |
| polish | desk-light | x66–456, y96–140 | The argument "Measure the chip row at 390px." shows twice, in the row and in the body line under it. | clean-copy |
| wrong | phone-dark | x52–86, y150–165 | The verb "Ran skill" is cut to "Ran …" while the muted mono argument stays. | L623 |
| S2 | phone-dark | | | |

## session-tab-menu
Crops 244×286 and 222×382.
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | both | x16–90, y110–230 (desk) | Items with no icon start their label at x16 and items with an icon at x42, so the menu has two label columns. | L791 |
| S4 | both | x17–30, y256–270 | The Copy link glyph is a solid black block. | L923 |

## session-thinking
I found nothing that departs from DESIGN.md beyond S2.

## session-tools-open
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x130–260, y583–611 | The "Jump to latest" tag is transparent and the code text runs through it. | L862 |
| polish | desk-light | x543–673, y615–643 | The tag sits mid-transcript, not on the composer. | L862 |
| S2 | phone-dark | | | |

## sheet-inspect
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x80–390, y60–830 | The inspector is a full-height right-hand panel 80px in from the left. DESIGN.md calls for a bottom sheet over the page's foot, edge to edge, at most 60% of the well, with the page above live. The page behind is cut ("Outlin", "rest", "Loud ›"). | L882 |
| S4 | desk-light | x1290–1405, y115–130 | The copy and trash glyphs are solid black. | L923 |
| polish | desk-light | x40–98, y440–477 | The second frame's label is coral-tinted while the first frame is outlined in coral. The coral does not say what it means. | L580 |

The Times serif component in the frames is the probe fixture, not product chrome.

## suggesting-chip
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x250–391, y716–746 | The suggestion chip is a coral-wash pill with a "Tab" keycap. | L407; L973 |
| polish | phone-dark | x14–122, y678–708 | The same chip is a brown block with no keycap. | L407 |
| wrong | phone-dark | x52–86, y150–165 | The verb "Ran skill" is cut to "Ran …". | L623 |

## task-failed
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| S3, S5, S6 | desk-light | x755–880, y128–888 | The Review column wash, the squeezed column and the mono subtitles. | |
| wrong | desk-light | x395–457, y284–304 | The "Failed" pill on the card carries a 10px solid dot. A board pill has no glyph. | L751; L924 |
| polish | desk-light | x985–1059, y842–870 | "Try again" is a coral button about 28px tall. | L724 |
| polish | phone-dark | x22–40, y50–65 | The "‹ cawco" back link is about 28px high on a phone. | L929 |

## task-open
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| S3, S5, S6 | desk-light | | | |
| wrong | both | under Description, Acceptance criteria, To-dos, Labels, Fields (x985–1411, y407, 485, 558, 705, 783) | Each section is separated by a 1px vermillion rule. It is faint by day and clear red on the dark phone. Vermillion is Caw's panel and Files' section rule only. | L709; L758; L580; L959 |
| polish | phone-dark | x300–370, y126–142 | The labels "tray ui" drop to their own row, right-aligned, with no chip fill on dark. | L750 |
| polish | both | x985–1373, y633–662 | The "Add a to-do" field is about 29px tall on desk. | L246 |

## task-review
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| S3, S5, S6 | desk-light | | | |
| polish | both | x985–1411, y457–818 (desk) | The preview well is a bordered box on a bordered panel. | L669 |
| polish | both | x986–1108, y842–870 | The "Approve → Done" coral button is about 28px tall. | L724 |

## task-review-opening
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | both | x1004–1158, y475–486 (desk) | The skeleton is a single short bar in a 360px well, not at the real layout's size. | L836 |
| polish | desk-light | same | The skeleton's fill is almost invisible against the well by day. | L836 |
| S3, S5, S6 | desk-light | | | |

## task-rich
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | phone-dark | x300–370, y126–142 | The labels "ui phone" float right on their own row with no chip fill. | L750 |
| S3, S5, S6 | desk-light | | | |

## task-rich-details
Same departures as task-open: the vermillion section rules under Description, Acceptance criteria and To-dos (wrong, L709, L580), the 28px "Add a to-do" field, and the right-aligned label row on the phone.

## usage-popover-open
Crops 380×233 and 390×345.
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | phone-dark | x16, x28, x30, x34 | Left edges differ across the sheet: title x16, sign-in line x28, "Open usage" x30, Claude row and bar x34. | L812 |
| polish | both | x358–365, y44–52 (desk) | The relay bar's blue end marker: I could not tell whether it is the `ink-strong` stop tick or a band. | L772 |

## usage-project
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | five tiles x253–1419, y113–226 (desk); x18–372, y105–440 (phone) | The stat tiles have no recessed well. They are 113px tall with the label over the figure directly on the raised card. | L746; L259 |
| polish | desk-light | x253–343, y66–95 | The project select is filled with the coral wash, like a selected nav row. | L539 |
| polish | both | x977–1021, y183–211 | The "Set" buttons are about 28px tall. | L724 |
| wrong | phone-dark | x18–372, y459–738 | The rows become cards, but the column heads WAKES, SPENT and LAST vanish. | L639 |
| polish | both | page head | The page has no head. "Usage" appears only in the top bar. | L633 |

## usage-rest
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x477–535, y443–473 | The time "back in 4h 56m" breaks across two lines and "56m" orphans. | L778 ("It never wraps") |
| wrong | desk-light | x358–508, y342–400 | "until it's back · 5-hour at its limit" wraps to three lines beside the dial. | L777 |
| polish | desk-light | x289–533, y507–610 | The "Running" rows are 22px pills on a 26px pitch. | L781 |
| polish | desk-light | x729–735, y764–774 | The bar for "Fit the badge" is a 1px black tick. | L790 |
| polish | phone-dark | x18–144, y660–695 | "Export CSV" drops under the filter, left-aligned. | L633 |
| polish | both | page head | No page head. | L633 |

## views-canvas
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x1124–1190, y816–830 | A "Svelte Flow" attribution is printed in the corner of the canvas. | unfinished |
| wrong | phone-dark | x105–285, y786–800 | The floating bottom bar covers the zoom controls. Only their top edge shows. | L645 |
| wrong | phone-dark | x18–370, y170–370 | The edges run orthogonally round the nodes and cross. Arrowheads sit on nodes. The tsk-3 and tsk-6 nodes are clipped at the right edge. | L884 |
| polish | phone-dark | x25–60, y85–120 | The Caw mascot sits alone on a row at the left. | L547 |
| polish | phone-dark | x337–371, y744–778 | The coral "+" is a 34px button. | L929 |

## views-decision-page
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| blocking | phone-dark | x11–379, y737–785 | The project's bottom bar (Decisions select, Needs you, coral "+") covers the composer. "Add a note…" and "I'm done picking" are not reachable. | L643; L629 |
| polish | both | x33–437, y160–245 | The page content is the artifact's Times fixture. | n/a |

## views-decisions
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x25–308, y83–191 | One decision card at the head of an empty 860px page. | L835 |
| polish | phone-dark | x25–60, y85–120 | The mascot floats alone at the left. | L547 |

## views-made
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | x25–405, y84–438 (desk) | Three nested bordered levels: a task column, a file card, a message card. | L669 |
| wrong | both | x338–346, y98–110 | The "Review" glyph is about 10px. | L846 |
| polish | phone-dark | x25–365, y178–490 | Card bodies end in a bottom fade with no ellipsis. | L623 |

## views-pipeline
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong (S5) | both | x25–1190, y180–222 (desk); x18–372, y229–273 (phone) | The Review row has a coral wash, coral label and a coral bar (x314–475, y197–204). | L552; L580 |
| wrong | both | x37–47, y194–206 | The "Review" glyph is about 10px. | L846 |
| polish (S6) | both | x207–270 | Stage subtitles are in mono. | L610 |
| polish | both | y282 | The Dropped row is separated by a dashed rule. | L683 |
| polish | desk-light | x314–316, y150–153 | The empty bars draw as 1–2px ticks. | L790 |

## views-routines
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| blocking | phone-dark | x18–372, y183–263 | The Routines header band stops at x≈197, and the row is "Weekly di… / Mondays a…" cut to about 65px. About 170px to the right is empty. | L639; L645 |
| wrong | phone-dark | x18–372, y455–535 | The Approved actions rows are cut to "The chi… / From Po…" with the WHEN column empty. | L639 |
| wrong | desk-light | x617–1190, y121–174 | The Event sources empty state is a plain 12px sentence in a box. It has no 20px mark, title or action. | L835; L839 |
| wrong | desk-light | x372–382, y303–315; x178–188, y226–238 | The "Waiting on you" glyph and the Approved actions count glyph are about 10px. | L846 |
| polish | desk-light | x41–59, y166–184 | The hourglass is a solid amber glyph at 16px with no duotone layer. | L923 |
| polish | desk-light | x25–599, y152–199 and y286–333 | Rows are 47–48px, not 44px. | L377 |

## views-table
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | x466–482, y349–361 | The "Review" glyph is about 10px. | L846 |
| polish | desk-light | x25–1190, y84–115 | The header band starts straight under the page head with no group gap. | L633 |
| polish | phone-dark | x137–150, y160–178 | The progress ring in the card is 12px. | L848 |

## views-week
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | x25–1191, y160–250 | The stat tiles are 90px tall but have no recessed well. | L746 |
| S5, S6 | both | x528–766, y601–857 | The Review column wash and mono subtitles. | |
| wrong | desk-light | x538–552, y613–627 | The "Review" glyph is about 10px. | L846 |

## views-week-page
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x14–1426, y50–140 | The stat tiles have no recessed well. | L746 |
| S5, S6 | both | x583–857, y491–900 | The Review column wash and mono subtitles. | |
| polish | both | x14–1426 | Page padding is 14px, not the 25 / 21px page padding. | L633 |

## workflows-editor
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | x300–930, y227–520 | The code has no syntax colour. All text is near-black or grey, keywords look bold, and strings are not olive. | L561; L617 |
| polish | desk-light | x254–1414, y216–824 | The code well sits inside a raised card with its own border. | L669 |
| S1 | desk-light | | | |

## workflows-program
Same view as workflows-editor. The code has no syntax colour, and the code card sits inside a raised card.

## workflows-graph
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x639–901, y470–600 | Node boxes overlap. "Audit the chip row" runs over "Overflows?" by about 10px, and the edge loops cross nodes. | L884 |
| wrong | both | x1013–1078, y879–891 (desk); x322–388, y822–836 (phone) | A "Svelte Flow" attribution is printed over the canvas. | unfinished |
| wrong | desk-light | x1095–1426, y413–620 | The settings use native `<select>` controls with the browser chevron, not the kit Select trigger. | L742 |
| polish | desk-light | x1095–1426, y230–320 | The textarea shows the browser's resize grip. | L740 |
| polish | desk-light | x239 vs x247 | Palette section heads start at x239 but the rows start at x247. | L601 |
| S1 | desk-light | | | |

## workflows-graph-branch
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1095–1195, y181–197 | The head reads "branch inspector" in lowercase next to "Step inspector". | WORDS.md |
| wrong | both | native selects | Native `<select>`. | L742 |
| wrong | phone-dark | x107–383, y8–835 | The inspector sheet has no Close control. The foot is cut off with no edge fade. | L809–812 |
| S1 | desk-light | | | |

## workflows-graph-step
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| blocking | desk-light | x1102–1166, y480–514 | The chosen harness chip "claude" has near-white text on a light-grey fill. It looks around 1.3:1 and is illegible. On the dark phone the same chip reads. | L933 contrast; L407 |
| wrong | both | native selects (Run on, Effort) | Native `<select>`. | L742 |
| polish | both | x1095–1425, y853–895 | The Prompt field is set in mono. A prompt is a sentence, not code. | L610; L619 |
| S1 | desk-light | | | |

## workflows-launch
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | both | Project x495–945, y350–385; Machine x495–945, y421–457; Supervisor x488–952, y577–613 | Native `<select>` controls with the browser chevron. The focused one carries a 2px coral ring on the native control. | L742 |
| polish | desk-light | x488–952, y287–537 | The "Workspace" group is a recess well inside the raised body, with its label 8px from the top edge. | L669; L803 |
| S1 | desk-light | | | |

## workflows-rest
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x260–856, y140–331 | The table is 600px in a 1170px card, with the right half empty. | L637 |
| polish | desk-light | x462–522, y212–236 | The "done" pill has a 10px glyph. | L751; L846 |
| wrong | phone-dark | x24–366, y150–360 | The row cards split into "5m ago · 2 runs" with an "Actions" word link and no button. Each row is two separate blocks 112px apart. | L639 |
| S1 | desk-light | | | |

## workflows-run
| Sev | File | Region | What I see | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x270–285, y117–132 | The lead mark of "Chip audit" is near-white and invisible. | L923 |
| wrong | phone-dark | x30–45, y127–142 | The same lead mark is near-black on dark. | L923 |
| S1 | desk-light | | | |

## Clean entries (beyond S1 and S2)
session-thinking, session-memory-tool, session-live (only the Stop glyph is flagged), session-compacted (desk), session-tab-menu (desk, apart from S4), workflows-program (same as workflows-editor), usage-popover-open (beyond left-edge nits), session-session-card (beyond the coral context bar).

## Not run
- No build, lint or type-check. This is a read-only visual audit.
- No measured contrast. I read everything by eye from the PNGs.
- I did not open 1440 dark or 390 light for any entry, so theme-specific problems there could still exist.
- I did not run the live app or compute the ink of any glyph.
- `bench-new-session-rest` and `new-session-permission` matched my substring search only. They are not in group-03 and I did not review them.

Nothing pushed: this item lands none.

Commits:
````
(none)
````

Diffstat:
````
(no changes)
````

Findings:
1. Supplied DESIGN.md has no solid-mark rule: The brief mentions a new solid-mark rule for status marks. The DESIGN.md at inputs/DESIGN.md has none: L923 still says every product icon is Solar duotone and a status glyph keeps its hue at 0.5 and holds 3:1. I checked status marks for size under 16px and for icons that draw solid, and did not check them against a solid-mark rule. If the rule exists, DESIGN.md needs updating or I need a newer copy.
2. Several screens lack a page head: Usage and the standalone workflow run page have no title-over-description page head. The project views have one, but it is cut to a different shape on phones (mascot alone on a row, Ask Caw and Spin off hidden).
