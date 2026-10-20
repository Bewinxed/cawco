# Audit of group 01 against DESIGN.md (cutover 682ede287)

**Skills loaded:** `clearshot`, then `interface-craft` (Design Critique frame).
**Method:** I read DESIGN.md whole (977 lines). I opened the 1440 light and 390 dark capture of all 38 entries, 76 images. I did not open 1440 dark or 390 light: neither opened capture showed a theme-specific fault. Every pixel size below is estimated by eye from the 1440×900 and 390×844 captures; nothing was measured. I changed no files and ran no builds. The fetched captures were deleted from my clone afterwards, so it is clean.

## Cross-cutting departures
These repeat across entries. Each entry table cites the code (X1–X12) instead of repeating the detail.

| # | Severity | What I see (typical region) | DESIGN.md line broken |
|---|---|---|---|
| X1 | wrong | **Sticky footer.** On desktop the page card's content is cut hard at y≈842 with no edge fade; half-cut rows or controls show behind the footer. Examples: "May delegate" switch, "Script" textarea, "studio" row, segmented control. The footer buttons float on the frame below the page card (card ends y≈823–842, footer y≈855–888). On 390 the footer's right edge is x≈382 while the card and gutter end at x≈372, and its buttons are about 36px tall. On the hooks editors the footer wraps to a two-line block about 100px tall. | L929 The 44 Touch Rule; L769 and L758 house edge fade (`kit-edge-fade-block`); L633 page padding. |
| X2 | wrong | **Trailing controls wrap on 390.** The count chip, switch and ⋯ on list rows drop to their own line under the text, left-aligned at x≈80, instead of staying on the trailing edge. The ⋯ glyph is about 14px with no 44px hit area. The switch is 32×18. Rows: hooks, rules, skills, memory, delegate types, connections. | L929 The 44 Touch Rule; L633 layout. |
| X3 | polish | **Page head.** The action button (New hook, Add server, Sign in to a service and so on) sits at y≈89 while the title/description pair centres at y≈97. About 8px high. | L633 "actions centred on the pair". |
| X4 | wrong | **Destructive actions drawn neutral.** "Remove account", "Delete everywhere", "Delete hook", "Delete rule" and "Remove key" are grey or ink ghost or outline. They carry no `error-11` text. | L234–L237 `button-destructive`; L729 Destructive. |
| X5 | wrong | **Mono outside the Code role.** Names set in mono at about 20–22px: "explore", "new-subagent", "Name this server", "~/.claude/CLAUDE.md". Mono inputs at about 14px: Skills, Package, Phrase, Matcher, Source. | L171–L176 and L610 Code is 12px; L607 Title is Figtree; L626 and L961 mono is for code, paths and IDs at the code size. |
| X6 | wrong | **Tables are not a ledger.** CLI tools and Updates headers are plain 12px regular, with no `surface-band`, no uppercase and no 0.06em tracking. Rows are about 49px, not 44. There is an outline border plus vertical column rules. The offline row's text looks like 2–3:1 grey. | L370–L381 `ledger-header` and `ledger-row`; L609 Column head; L637 Density; L563 ink-subtle contrast. |
| X7 | wrong | **Control heights.** The "Stop placing new work past [ ]" input is about 28px high; Event, Scope and filter selects are about 30px; inputs are 36px on 390. All are under the 44px touch floor on 390 and mostly under the 36px recipe on desktop. Segmented segments are about 30–32px on 390. | L246–L252 `input` 36px; L929 The 44 Touch Rule. |
| X8 | polish | **Raw markdown backticks** in sentences: "run \`…\` on every machine", "run \`bunx biome check\` on every machine". Reads unfinished. | L604 Body role; WORDS.md copy. |
| X9 | wrong | **Status glyphs at 12px duotone.** Examples: the "Not signed in" triangle, the "1/3 machines" triangle, the installed-version check, the ⓘ in the "Waiting on an answer" chip. The 12px size is only for glyphs beside meta text, but these are status signals. | L846 Session status 16px glyph; L923 Solar Duotone Rule; L924 sizes. |
| X10 | wrong | **Blue used outside status.** A blue-filled checkbox on Models, a blue dot on "Jev goes to TypeSafe…", and a blue check disc on the Updates channel card. Checked controls should be coral. | L578 Reserved Hue Rule; L580 Coral Is Where You Act. |
| X11 | polish | **Card-in-card.** The page card is raised on the recess and then holds further recess wells or bordered panels: provider panels, option cards, "Try it" and "Matches" wells, History and Per machine rows. | L669 Frame Recesses Rule (only the stat well is sanctioned); L253–L258 card. |
| X12 | polish | **Page titles read lighter than 500** ("Accounts", "Rules", "Hooks"). Computed `font-weight` needs confirming. | L607 Title 500; L617. |

## Per-entry findings

### config-accounts-key-sent
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x730–1397, y129–377 | A "302.AI" panel sits inside the Add account card. Two identical rows "obelisk-of-light … Key sent" read as a duplicate. "Send key" is a lone small primary at 50% opacity. | L669 (X11); L536 |
| wrong | phone-dark | x58–347, y295–397 | The two stepper marks to the left of "Sign in" are about 14px disc glyphs. | L923–L924 (X9) |
| wrong | phone-dark | x189–347, y442–478 | Back and Continue are about 36px high. Cancel (y72–107) is about 36px. | L929 (X1, X7) |

### config-accounts-new
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x189–347, y795–830 | The footer overlays the list. A row ("abliteration.ai") is cut mid-row at y≈783 with no fade or separator. "Back" is disabled while "Continue" is an enabled coral button with no provider chosen. Footer buttons are about 36px. | L929, L758 edge fade (X1) |
| wrong | desk-light | x496–1422, y129–895 | No Back/Continue footer is visible on desktop, but it is visible on 390. The same step differs by width. The provider list runs off the bottom with no card foot. | L633 |
| polish | desk-light | x752–1375, y150–188 | The search field is about 36px with no search glyph. The "Sign in / API keys" group labels are 12px muted. | L601 Meta; L246–L252 |

### config-accounts-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x553–731, y280–292 and y390–402 | The "Not signed in on any machine" triangle is a 12px olive/dark-yellow duotone glyph. | L846, L923 (X9) |
| wrong | phone-dark | x280–340, y132–148 | "Routing" link and chevron hit about 24px high. Row chevrons are about 14px. | L929 |
| polish | desk-light | x521–1397, y120–420 | The Probe/Second rows are 44px pitch; the Spare and Copilot rows are about 56px because of the second line. Group heads ("Claude" / "GitHub Copilot") have no band. | L637 Density; L370 |
| polish | desk-light | x1265–1396, y73–107 | X3 (button high relative to the pair). | L633 |

### config-accounts-routing
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–1397, y171–650 | Option card, then recess well, then bars: three nested surfaces. The two cards in each row have different content heights (the Pinned card has an extra "At the limit → the policy below" row), so the 2×2 grid has uneven bottoms. | L669 (X11); L820 Channel cards: equal height |
| wrong | desk-light | x521–1397, y696–842 | The form is cut mid-line at y≈842 (the "Cancel it after the…" input is half visible) behind the footer. Cancel and "Save routing" sit outside the card. | X1 |
| polish | phone-dark | x196–382, y797–832 | Cancel and "Save routing" right edge at x≈382, outside the 372 card edge. "Save routing" disabled is dark red on dark and hard to read (50% opacity is allowed, but the label is faint). | L729 Disabled; X1 |
| wrong | phone-dark | x43–224, y121–159 | The strategy segmented control is about 32px tall, under 44. | L929 (X7) |

### config-accounts-second
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x704–767, y433–462 | "Stop placing new work past [ ] % of the week" input is 28px high with no placeholder. | L246–L252 (X7) |
| wrong | desk-light | x515–645, y860–880 | "Remove account" is a neutral ghost, not destructive. | X4 |
| wrong | desk-light | x1223–1418, y855–888 | Footer outside the card. The card ends at y≈823 here, but at y≈893 on list pages, so the card height jumps between screens. | X1 |
| polish | desk-light | x521–763, y313–340 | Looks swatches are 26px with a thick selected ring; 25px on 390. The hues are the sanctioned account hues, but the target is under 44 on touch. | L929 |
| polish | both | x521–620, y185–230 | Two identical "obelisk-of-light" machine rows. | — |
| wrong | phone-dark | x316–340, y85–95 | ⋯ glyph about 14px with no 44px area. | X2 |

### config-accounts-sign-in
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1051–1389, y209–335 | The popover covers the second machine row and part of the Looks block with no neck or hang. The button words "Sign in" and "Open sign-in link" look tight, with collapsed word spacing. | L766 `kit-pop`; L625 Mark Line |
| wrong | phone-dark | x23–358, y216–344 | The popover spans the page card width (x8–373), wider than the card inset, and the "Done" button is about 26px high. The "Code" field is about 28px high. | L929, L246–L252 (X7) |
| wrong | both | — | Same footer and ⋯ findings as accounts-second. | X1, X2, X4 |

### config-cli-tools-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–1397, y143–375 | The table has a plain "Machine" header, no band and no uppercase. Rows are about 49px. Vertical rules plus an outline border. Version strings "2.0.29" are about 14px mono in olive green (`data-ok` is for threshold readings). | X6; L559 data colour |
| wrong | desk-light | x521–748, y327–374 | The offline "studio / Unknown / Install" row is grey at roughly 2–3:1. | L563 `ink-subtle` 4.5:1 |
| wrong | desk-light | x771–782, y246–258 | The installed check is about 12px. | X9 |
| **blocking** | phone-dark | x201–347, y141–373 | The table overflows the card: "Required on every…" is cut at x≈347 with no ellipsis, and "Reinstal" is clipped. The Antigravity column is entirely off-screen with no scroll cue or fade. The ledger stays a table below 640px. | L623 Truncate Inside; L639 under 640 each row becomes a card |
| wrong | phone-dark | x300–347, y240–260 | Install and Reinstall ghost buttons are about 28px high. | L929 |

### config-connections-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1230–1396, y73–107 | X3. | L633 |
| wrong | desk-light | x592–658, y151–171 | The "Signed in" olive pill is a solid mid-olive fill with dark text, not the `status-done` tint. It reads heavier than the badge recipe. | L291–L297 `status-pill-done`; L750 |
| wrong | phone-dark | x80–170, y268–288 | The "cawco" chip and ⋯ drop under the text, left-aligned. | X2 |
| polish | phone-dark | x43–66, y218–246 | The link tile is invisible on dark: no tile edge, shadow or night ring, while the light tile has one. | L673 Night Ring Rule |

### config-delegate-types-editor
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x554–640, y73–99 | "explore" is mono at about 20px, in a title slot. | X5 |
| wrong | desk-light | x521–1397, y715–815 | The Skills and "Tools denied" inputs use mono at about 14px. | X5 |
| wrong | desk-light | x521–1397, y820–842 | The "May delegate" switch row is cut by the footer. | X1 |
| wrong | phone-dark | x43–347, y640–705 | The effort segmented control wraps to two rows ("max" alone). Segments are about 32px. | L796 Segmented (one row); L929 (X7) |
| polish | phone-dark | x43–347, y310–372 | The Description textarea clips a third line mid-glyph. | L740 |
| polish | desk-light | x554–1202, y108–171 | The callout stops at x≈1202 and has no glyph. It indents to the title column rather than the page column. | L832 Alert |

### config-delegate-types-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x558–600, y178–436 | Type names in mono at about 14px, for IDs, between Label and Code size with no named role. | X5 |
| polish | desk-light | x1226–1396, y73–107 | X3. | L633 |
| wrong | phone-dark | x88–102, y270–648 | The ⋯ button drops under each description line, left of centre, and is about 14px. | X2 |

### config-devices-rest
Clean aside from X3/X12 and X7 on the switch (32×18): no entry-specific departures found.

### config-hooks-editor
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x568–996, y121–136 | Raw backticks in the callout ("run \`…\`"). | X8 |
| wrong | desk-light | x521–683, y280–309 | The "Event PostToolUse" select is about 30px high. | X7 |
| wrong | desk-light | x533–1385, y437–570 | A matcher well nests inside the section card, with a second raised input inside it. | X11 |
| wrong | desk-light | x521–1397, y740–842 | The "Script" textarea is cut at the footer. The footer runs to y≈888 with "studio, obelisk-of-light, obelisk-of-light" (a duplicated machine name). | X1 |
| wrong | phone-dark | x220–382, y797–832 | The footer wraps to two lines (meta + Cancel, then the full "Create on 3 machines" primary). About 100px of viewport is taken. | X1, L929 |
| polish | phone-dark | x76–304, y103–152 | The callout stops at x≈304, 43px short of the content edge. | L832 |

### config-hooks-hook
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x538–608, y463–478 | The "Exact match" label is olive-green ink on the recess. | L559; L580 |
| polish | desk-light | x554–1202, y108–170 | Same backtick finding. | X8 |
| wrong | desk-light | x1185–1417, y855–888 | The footer packs "2/3 machines" meta, machine names, Cancel and "Write to 3 machines". | X1 |
| wrong | phone-dark | x316–340, y85–95 | The ⋯ glyph is about 14px. | X2 |
| polish | phone-dark | x55–335, y535–745 | A well nests inside the section. | X11 |

### config-hooks-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1281–1396, y73–107 | X3. | L633 |
| wrong | phone-dark | x80–250, y263–287 | The "2/3 machines" chip, switch and ⋯ drop under the text. | X2 |
| polish | desk-light | x558–1222, y172–187 | The sentence in the row is cut with an ellipsis, which is correct, but it includes raw backticks. | X8 |

### config-mcp-editor
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x554–745, y73–99 | The placeholder title "Name this server" is mono at about 20px. | X5 |
| polish | phone-dark | x43–347, y321–357 | The Package input text runs into the edge ("…/server") with no ellipsis. | L623 |
| wrong | phone-dark | x205–382, y797–832 | The footer is outside the card. The card ends at y≈723, so a band about 70px high above the footer reads unfinished. | X1 |
| wrong | desk-light | x521–764, y496–525 | The scope select is about 30px high. | X7 |

### config-mcp-oauth-return
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x253–292, y12–29 | The top-bar title reads "Oauth" (a raw route name), not "OAuth", and the page has no Configure rail. | L633; WORDS.md |
| wrong | desk-light | x249–268, y88–104 | The failure mark is a grey ~18px triangle. A failed state should be hue plus glyph plus word, in the fail hue. | L590 Glyph, Word, Hue |
| polish | both | x249–405, y205–239 / x22–177, y203–236 | "Back to MCP servers" is about 34px high. | L929 |
| polish | desk-light | x249–780, y90–240 | Error state is left-aligned on the page column, which matches the empty recipe, but the mark is under the 20px recipe size. | L835 Empty |

### config-mcp-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1276–1396, y73–107 | X3. | L633 |
| wrong | desk-light | x1240–1360, y209–227 | "Signed in for the fleet" is the switch's label and sits to its right, but it reads as a status. | L590 |
| wrong | phone-dark | x80–385, y293–312 | The ⋯ button is clipped by the card edge at x≈378. The cluster wraps under the text. | X2 |
| polish | phone-dark | x43–347, y187–217 | "Sync all" sm outline sits on its own row, about 30px. | L929 |

### config-memory-delete-ask
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| **blocking** | desk-light and phone-dark | whole page | The capture shows the plain list. There is no AskHere tile, no Cancel/destructive pair and no "Delete everywhere" button, so the named state was not reached. The recipe can't be audited. | L805 Asking in the page |
| polish | desk-light | x521–1397, y195–245 | The list row's help line says "The fleet keeps no memory yet — write one, or adopt a machine's copy" as plain meta. | L835 Empty |

### config-memory-editor
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x554–778, y110–132 | "~/.claude/CLAUDE.md" is mono at about 22px. | X5 |
| wrong | desk-light | x521–1397, y221–541 | The Contents area is a borderless recess slab (320px) with rendered markdown at a 32px inset. It has no raised fill and no control edge, so it reads as a viewer, not a field. | L246–L252, L740 Textarea |
| wrong | desk-light | x515–658, y860–880 | "Delete everywhere" is a neutral ghost. | X4 |
| wrong | desk-light | x521–1397, y820–842 | The "studio" row is cut mid-glyph by the footer. | X1 |
| polish | phone-dark | x76–283, y110–175 | The meta line wraps (hash on its own line). | L601 |
| wrong | phone-dark | x258–336, y650–680 | "Compare" is about 30px high. | L929 |

### config-memory-editor-no-machine
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–855, y755–768 | "No machines yet" is in red/coral ink as a plain sentence. Coral is not a status. | L580; L590 |
| wrong | desk-light | x521–1397, y221–541 | The empty "Please enter…" textarea is a recess slab with no edge. | L246–L252 |
| polish | desk-light | x521–855, y737–770 | Empty state has no action to start the work (adopt, register a machine, ask Caw). | L839 Empty Starts Work |
| wrong | both | — | Mono title, X4 and footer findings as memory-editor. | X5, X1 |

### config-memory-filtered
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x521–777, y142–178 | The focused filter field takes a coral border plus ring, which looks like a border colour change. | L969 Don't: draw focus as a border-colour change; L927 One Ring Rule |
| polish | phone-dark | x43–299, y187–223 | The field is 36px high and 256px wide, not full width. | X7, L929 |
| polish | desk-light | x521–688, y215–229 | The no-result line is plain meta text. | L835 Empty |

### config-memory-new
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1014–1397, y113–284 | The popover floats over the head and list with no hang or neck. Mono input at about 14px. | X5; L766 |
| wrong | desk-light | x558–1397, y325–372 | The "This machine edited its own copy" alert is a full-width saturated spark-yellow slab, about 47px high. The alert recipe is a compact tinted row. | L832 Alert |
| wrong | desk-light | x1255–1360, y283–302 | The "1/3 machines" chip is a crimson pill with a 12px triangle. | X9 |
| wrong | phone-dark | x80–347, y280–300 | The "1/3 machines" chip and ⋯ drop under the text. | X2 |
| polish | phone-dark | x208–222, y405–417 | ⋯ about 14px. | L929 |

### config-memory-reading
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x521–1397, y142–314 | Skeleton rows are about 56px tall, but the real rows on memory-rest are about 70px. The skeleton does not match the layout it stands for. | L836 Skeleton (exact size) |
| polish | desk-light | x440–462, y265–540 | Rail counts show an em dash while loading. | L720 Earned Count |

### config-memory-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x558–1397, y325–372 | Same spark-yellow alert slab as memory-new. | L832 |
| wrong | desk-light | x1255–1360, y283–302 | Same crimson chip with a 12px triangle. | X9 |
| wrong | phone-dark | x80–347, y297–420 | The chip and ⋯ drop under the text. | X2 |
| polish | desk-light | x558–948, y205–310 | Row pitch about 70px, not 44px. Path in mono about 14px. | L637; X5 |

### config-models-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–847, y657–746 | Five stacked plain-text facts ("Same error 3 times in 10 turns"…) should be drawn. | L507 Show Don't Tell |
| wrong | desk-light | x521–540, y431–446 | The "Held, ends …46e0" checkbox is blue-filled. | X10 |
| wrong | desk-light | x521–530, y340–352 | A blue dot marks "Jev goes to TypeSafe directly…". | X10 |
| polish | desk-light | x1251–1396 and x1322–1396 | "Connect OpenRouter" and "Save key" are both coral primaries on one page. "Save key" is enabled with the field empty. "Remove key" is neutral. | L536 one action colour; X4 |
| wrong | phone-dark | x43–347, y473–509 | The placeholder "Paste a new key to replace the held one" is clipped at the right edge with no ellipsis. | L623 |
| wrong | phone-dark | x43–75, y543–561 | The switch is 32×18. | L929 |

### config-phone-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–1087, y180–218 | The empty state is two lines of plain meta ("Your devices will appear here…"). It has no 20px mark, no title and no action. | L835 Empty; L839 Empty Starts Work |
| polish | both | x1288–1397, y142–172 / x238–347, y160–190 | "Send test push" outline sm is about 30px. | L929 |

### config-previews-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–1100, y142–320 | Four paragraphs of meta explain a one-select setting. | L507 Show Don't Tell |
| polish | desk-light | x521–905, y245–280 | The select is about 36px. "Save" disabled is about 28px, smaller than sm 30px. | L241–L245 `button-sm` |
| polish | phone-dark | x43–340, y160–225 | The first paragraph leaves an orphan ("is saved."). | L629 pretty wrapping |

### config-rules-editor
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x521–553, y417–462 | "Case sensitive" and "Whole words only" switches are on a tight 26px pitch, with the "What it says" segmented control right under them and no label. | L625 |
| wrong | desk-light | x521–982, y826–842 | The "Send it" segmented control is cut by the footer. | X1 |
| polish | desk-light | x533–1385, y549–613 | The "Try it" well holds a mono input at about 14px. | X5, X11 |
| polish | phone-dark | x55–335, y640–705 | The Try-it textarea clips a line mid-glyph. | L740 |

### config-rules-index
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x521–706, y142–172 | The "Waiting on an answer (1)" filter chip is a rounded rectangle about 28px high, not a pill, with a 12px grey ⓘ. | L417–L422 `filter-chip-active`; X9 |
| polish | desk-light | x1328–1394, y209–227 | The switch is 32×18. | L929 |
| polish | phone-dark | x0–390, y55–844 | On 390 this capture is the Configure section list (stack root), not the Rules index. The desk image is pixel-identical to rules-rest. | — |
| polish | phone-dark | x18–60, y60–70 | Section heads (Automation, Agents…) are 13px muted, not uppercase. | L609 Column head |

### config-rules-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x80–150, y317–335 | The switch and ⋯ drop under the text. | X2 |
| wrong | desk-light | x521–706, y142–172 | The same non-pill filter chip. | L417 |
| polish | desk-light | x658–722, y200–218 | The "1 waiting" badge is about 20px with a spark-yellow fill, which fits attn. | — |

### config-rules-rule
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x515–607, y860–880 | "Delete rule" is a neutral ghost. | X4 |
| wrong | desk-light | x521–982, y826–842 | The segmented control is cut by the footer. | X1 |
| polish | desk-light | x533–1385, y549–613 | The "Try it" sample text is the generic "I've fixed the parser…" string, unrelated to the TODO rule. | — |
| polish | phone-dark | x55–335, y655–720 | The textarea clips a line. | L740 |

### config-skills-fetch
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x1018–1397, y113–417 | The popover floats below the head and covers the "CawCo installs a skill's files…" text and the machines row. | L766 |
| wrong | desk-light | x1031–1383, y149–184 | The Source field is mono at about 14px with a coral ring that reads as a border colour change. | X5; L969 |
| wrong | phone-dark | x31–358, y208–240 | The Source input text is clipped ("pbakaus/impecca") with no ellipsis. | L623 |
| wrong | phone-dark | x269–358, y427–462 | "Fetch skill" disabled is about 35px. | L929 |

### config-skills-remove-ask
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| **blocking** | desk-light and phone-dark | whole page | The capture shows the empty skills page ("No skills fetched yet"). There is no skill row and no remove ask. The named state was not reached. | L805 |
| polish | desk-light | x521–1090, y215–265 | The four empty sections are plain meta text, with no mark, no title and no start action. | L835, L839 |

### config-skills-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | phone-dark | x80–250, y316–336 | The "2/3 machines" chip, switch and ⋯ drop under the text. | X2 |
| polish | desk-light | x521–1397, y215–330 | The row's help paragraph hangs 40px below the row, so it reads as a separate group. | L637 |
| polish | desk-light | x558–770, y226–260 | Row meta "machine:scratch-fleet · 170 B · 2c1d571" is plain meta, not mono. | L610 |

### config-spend-rest
Clean aside from the shared X3/X7/X12 (select sizing, title weight). No entry-specific departures found.

### config-subagents-editor
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x554–698, y73–97 | "new-subagent" is mono at about 20px. | X5 |
| polish | desk-light | x521–1397, y223–543 | The textarea is a bordered white field holding about 14px mono. | X5 |
| wrong | desk-light | x1206–1418, y855–888 | The footer is outside the card. The card ends at y≈823. | X1 |

### config-subagents-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| polish | desk-light | x521–540, y165–182 | The empty-state mark is about 16px in a tile, not the 20px mark. | L835 |
| polish | desk-light | x521–930, y165–245 | The empty state has no start-the-work action. The head's "Add subagent" is the only action, and "Push to machines" is disabled. | L839 |
| polish | phone-dark | x43–167, y150–186 | "Push to machines" disabled is about 36px. | L929 |

### config-updates-rest
| Sev | Capture | Region | What | DESIGN.md |
|---|---|---|---|---|
| wrong | desk-light | x536–552, y366–382 | The tick on the chosen channel card is a blue disc. | X10 |
| wrong | desk-light | x521–1397, y548–731 | The machines table has a plain header, vertical rules, rows about 49px, and the studio row is grey-on-grey. | X6 |
| polish | desk-light | x829–887, y600–668 | Version "610865b" is mono at about 14px. | X5 |
| polish | desk-light | x253–471, y865–893 | The selected "Updates" rail row is half-clipped at the rail's foot. | L645 |
| wrong | phone-dark | x43–347, y608–806 | The mobile table is a bordered card with hairline rows ("Runs from source") and no column labels. | L669 (X11) |
| polish | phone-dark | x216–347, y529–559 | "Check for updates" is about 30px. | L929 |

## Entries found clean
- **config-devices-rest:** no entry-specific departures.
- **config-spend-rest:** no entry-specific departures.

Every other entry has at least one finding above.

## Not run / unverified
- Pixel sizes, colours and contrast are estimated by eye from the captures. No measurement tool, computed style or contrast calculator was used. The "under 4.5:1" and "x px" claims are visual estimates.
- 1440 dark and 390 light captures were not opened, because no theme- or width-specific fault showed in the two opened per entry. Dark-specific contrast was only judged on the 390 dark captures.
- Page-title weight (X12) needs a computed-style check to confirm.
- I did not use MANIFEST's "against main baseline" column (the pixel-diff counts) as a finding.

One-line suggestions: (1) fix the two missing ask states (memory-delete-ask, skills-remove-ask) before the AskHere recipe is audited at all; (2) fix the sticky footer, the wrapped trailing cluster and the destructive-button styling once in the shared kit, since X1, X2 and X4 account for most rows.

Nothing pushed: this item lands none.

Commits:
````
(none)
````

Diffstat:
````
(no changes)
````
