# Per-site changes f0e6dcf29..d1bc87e3c

Each entry: the line at the new head, the class tokens taken out and put in, and the T site(s) (`font: var(--type-*)` at ac7b79de8) whose element it is. Re-apply on a conflict by making the same token swap on the set's form of that element.

- app.css:2333  −[]  +[/* shorthand utility files itself (`--tw-sort` own marker) where the type roles do before every font longhand utility so one beside it wins (scripts/role-order.ts holds it).]
    + /* A `font` shorthand utility files itself (`--tw-sort`, Tailwind's own
    + marker) where the type roles do, before every font longhand utility, so
    + one beside it wins (scripts/role-order.ts holds it). */
- app.css:2337  −[]  +[--tw-sort: vertical-align;]
    + --tw-sort: vertical-align;
- app.css:2343  −[]  +[@utility text-size-inherit font-size: inherit;]
    + @utility text-size-inherit {
    + font-size: inherit;
    + }
- app.css:2433  −[]  +[--tw-sort: vertical-align;]
    + --tw-sort: vertical-align;
- lib/cawco/MachinesEmpty.svelte:81  −[]  +[tracking-title]
    T: lib/cawco/MachinesEmpty.svelte:150 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/MachinesEmpty.svelte:123  −[]  +[tracking-title]
    T: lib/cawco/MachinesEmpty.svelte:150 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/PairingScreen.svelte:67  −[]  +[tracking-title]
    T: lib/cawco/PairingScreen.svelte:117 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/PairingScreen.svelte:82  −[text-size-kpi leading-none font-medium]  +[type-kpi]
    T: lib/cawco/PairingScreen.svelte:137 type-kpi (ok)
    - class="num m-0 rounded-well bg-surface-recess px-space-5 py-space-3 font-(family-name:--font-mono) text-size-kpi leading-none font-medium text-ink-stat select-all"
    + class="num m-0 rounded-well bg-surface-recess px-space-5 py-space-3 type-kpi font-(family-name:--font-mono) text-ink-stat select-all"
- lib/cawco/PairingScreen.svelte:98  −[]  +[tracking-title]
    T: lib/cawco/PairingScreen.svelte:117 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/PairingScreen.svelte:114  −[]  +[tracking-title]
    T: lib/cawco/PairingScreen.svelte:117 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/PairingScreen.svelte:129  −[]  +[tracking-title]
    T: lib/cawco/PairingScreen.svelte:117 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/PairingScreen.svelte:141  −[]  +[tracking-title]
    T: lib/cawco/PairingScreen.svelte:117 type-title (ok)
    - class="m-0 type-title text-center text-balance text-ink-strong"
    + class="m-0 type-title tracking-title text-center text-balance text-ink-strong"
- lib/cawco/TreeMark.svelte:206  −[font-body text-size-meta font-normal]  +[type-meta]
    T: lib/cawco/TreeMark.svelte:383 type-meta (ok)
    - class="num inline-grid place-items-center w-(--num-w) h-(--num-h) font-body text-size-meta font-normal leading-none contain-layout contain-size"
    + class="num inline-grid place-items-center w-(--num-w) h-(--num-h) type-meta leading-none contain-layout contain-size"
- lib/cawco/UsageMeter.svelte:536  −[font-body text-size-meta font-normal]  +[type-meta]
    T: lib/cawco/UsageMeter.svelte:1061 type-meta (ok)
    - class="absolute start-(--slot-at) top-0 grid h-icon-md min-w-(--mark-min) place-items-center font-body text-size-meta leading-(--more-lh) font-normal num text-ink-muted transition-[inset-inline-start] dur-reveal ease-in-out motion-reduce:transition-none"
    + class="absolute start-(--slot-at) top-0 grid h-icon-md min-w-(--mark-min) place-items-center type-meta leading-(--more-lh) num text-ink-muted transition-[inset-inline-start] dur-reveal ease-in-out motion-reduce:transition-none"
- lib/cawco/accounts/AccountSetup.svelte:499  −[]  +[tracking-title]
    T: lib/cawco/accounts/AccountSetup.svelte:907 type-title (ok)
    - class="type-title mb-space-5 text-balance text-ink-strong"
    + class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
- lib/cawco/accounts/AccountSetup.svelte:513  −[]  +[tracking-title]
    T: lib/cawco/accounts/AccountSetup.svelte:907 type-title (ok)
    - class="type-title mb-space-5 text-balance text-ink-strong"
    + class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
- lib/cawco/accounts/AccountSetup.svelte:663  −[]  +[tracking-title]
    T: lib/cawco/accounts/AccountSetup.svelte:907 type-title (ok)
    - class="mark-line type-title mb-space-5 flex items-center gap-space-3 text-balance text-ink-strong"
    + class="mark-line type-title tracking-title mb-space-5 flex items-center gap-space-3 text-balance text-ink-strong"
- lib/cawco/accounts/AccountSetup.svelte:881  −[]  +[tracking-title]
    T: lib/cawco/accounts/AccountSetup.svelte:907 type-title (ok)
    - <h2 class="type-title mb-space-5 text-balance text-ink-strong">
    + <h2
    + class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
    + >
- lib/cawco/accounts/AccountSetup.svelte:943  −[]  +[tracking-title]
    T: lib/cawco/accounts/AccountSetup.svelte:907 type-title (ok)
    - <h2 class="type-title mb-space-5 text-balance text-ink-strong">
    + <h2
    + class="type-title tracking-title mb-space-5 text-balance text-ink-strong"
    + >
- lib/cawco/accounts/DevicePanel.svelte:97  −[]  +[liga-none]
    T: lib/cawco/accounts/DevicePanel.svelte:162 type-code (ok)
    - class="type-code flex select-all gap-space-3 tracking-(--code-track) text-ink-strong"
    + class="type-code liga-none flex select-all gap-space-3 tracking-(--code-track) text-ink-strong"
- lib/cawco/accounts/RoutingEditor.svelte:151  −[]  +[tracking-title]
    T: lib/cawco/accounts/RoutingEditor.svelte:213 type-title (ok)
    - <h1 data-slot="title" class="type-title text-ink-strong">{title}</h1>
    + <h1 data-slot="title" class="type-title tracking-title text-ink-strong">
    + {title}
    + </h1>
- lib/cawco/config/ConfigRail.svelte:118  −[font-body text-size-meta font-normal]  +[type-meta]
    T: lib/cawco/config/ConfigRail.svelte:237 type-meta (ok)
    - class="flex-none min-w-space-5 h-space-5 px-(--fault-pad) rounded-xs bg-status-attn-bg font-body text-size-meta font-normal leading-(--fault-h) text-center text-status-attn-ink num"
    + class="flex-none min-w-space-5 h-space-5 px-(--fault-pad) rounded-xs bg-status-attn-bg type-meta leading-(--fault-h) text-center text-status-attn-ink num"
- lib/cawco/config/SectionFrame.svelte:117  −[]  +[tracking-title]
    T: lib/cawco/config/SectionFrame.svelte:216 type-title (ok)
    - <h1 data-slot="title" class="type-title text-ink-strong">{title}</h1>
    + <h1 data-slot="title" class="type-title tracking-title text-ink-strong">
    + {title}
    + </h1>
- lib/cawco/config/TitleInput.svelte:41  −[]  +[tracking-title]
    T: lib/cawco/config/TitleInput.svelte:63 type-title (ok)
    - class="type-title w-full min-w-0 rounded-xs border-none border-current bg-transparent px-0 py-space-row text-ink-strong placeholder:text-ink-subtle data-mono:font-(family-name:--font-mono) disabled:text-ink-strong disabled:opacity-100"
    + class="type-title tracking-title w-full min-w-0 rounded-xs border-none border-current bg-transparent px-0 py-space-row text-ink-strong placeholder:text-ink-subtle data-mono:font-(family-name:--font-mono) disabled:text-ink-strong disabled:opacity-100"
- lib/cawco/config/editors/MemoryEditor.svelte:517  −[text-size-title leading-ui font-medium]  +[type-title]
    T: lib/cawco/config/editors/MemoryEditor.svelte:841 type-title (ok)
    - class="text-size-title leading-ui font-medium font-(family-name:--font-mono) tracking-title wrap-anywhere text-ink-strong"
    + class="type-title font-(family-name:--font-mono) tracking-title wrap-anywhere text-ink-strong"
- lib/cawco/config/editors/SubagentEditor.svelte:164  −[text-size-title leading-ui font-medium]  +[type-title]
    T: lib/cawco/config/editors/SubagentEditor.svelte:197 type-title (ok)
    - class="text-size-title leading-ui font-medium font-(family-name:--font-mono) wrap-anywhere text-ink-strong"
    + class="type-title font-(family-name:--font-mono) wrap-anywhere text-ink-strong"
- lib/cawco/find/FindPeek.svelte:60  −[font-body text-size-meta font-normal]  +[type-meta]
    T: lib/cawco/find/FindPeek.svelte:143 type-meta (ok); lib/cawco/find/FindPeek.svelte:224 type-label (ok)
    - class="group/peek grid grid-cols-(--peek-cols) gap-x-space-3 gap-y-space-row ms-(--peek-ms) mt-0 mb-space-2 py-space-1 pr-0 pl-space-3 border-s border-s-border-control font-body text-size-meta font-normal leading-(--peek-lh) data-phone:text-size-label data-phone:leading-(--peek-lh-phone)"
    + class="group/peek grid grid-cols-(--peek-cols) gap-x-space-3 gap-y-space-row ms-(--peek-ms) mt-0 mb-space-2 py-space-1 pr-0 pl-space-3 border-s border-s-border-control type-meta leading-(--peek-lh) data-phone:type-label data-phone:font-normal data-phone:leading-(--peek-lh-phone)"
- lib/cawco/find/FindRow.svelte:102  −[font-body text-size-label font-medium]  +[type-label group-data-phone/row:type-body group-data-phone/row:leading-(--line-1) group-data-phone/row:font-medium]
    T: lib/cawco/find/FindRow.svelte:197 type-label (ok); lib/cawco/find/FindRow.svelte:277 type-body (ok)
    - class="row-start-1 col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-body text-size-label font-medium leading-(--line-1) text-ink-row group-data-phone/row:text-(length:--title-fs-phone) group-data-phone/row:whitespace-normal group-data-phone/row:line-clamp-3"
    + class="row-start-1 col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label leading-(--line-1) text-ink-row group-data-phone/row:type-body group-data-phone/row:text-(length:--title-fs-phone) group-data-phone/row:leading-(--line-1) group-data-phone/row:font-medium group-data-phone/row:whitespace-normal group-data-phone/row:line-clamp-3"
- lib/cawco/find/FindRow.svelte:108  −[font-body text-size-meta font-normal]  +[type-meta]
    T: lib/cawco/find/FindRow.svelte:210 type-meta (ok)
    - class="num row-start-1 col-start-3 font-body text-size-meta font-normal leading-(--line-1) text-ink-muted group-data-phone/row:self-start"
    + class="num row-start-1 col-start-3 type-meta leading-(--line-1) text-ink-muted group-data-phone/row:self-start"
- lib/cawco/find/FindRow.svelte:114  −[font-body text-size-meta font-normal group-data-phone/row:text-size-label]  +[type-meta group-data-phone/row:type-label group-data-phone/row:font-normal group-data-phone/row:leading-(--line-meta)]
    T: lib/cawco/find/FindRow.svelte:224 type-meta (ok)
    - class="row-start-2 col-start-2 col-end-4 line-clamp-2 font-body text-size-meta font-normal leading-(--line-meta) text-ink-muted group-data-phone/row:text-size-label"
    + class="row-start-2 col-start-2 col-end-4 line-clamp-2 type-meta leading-(--line-meta) text-ink-muted group-data-phone/row:type-label group-data-phone/row:font-normal group-data-phone/row:leading-(--line-meta)"
- lib/cawco/find/FindRow.svelte:129  −[font-body text-size-meta font-normal group-data-phone/row:text-size-label]  +[type-meta group-data-phone/row:type-label group-data-phone/row:font-normal]
    T: lib/cawco/find/FindRow.svelte:251 type-meta (ok); lib/cawco/find/FindRow.svelte:298 type-label (ok)
    - class="row-start-3 col-start-2 col-end-4 flex min-w-0 font-body text-size-meta font-normal leading-(--line-reason) text-ink-subtle group-data-phone/row:text-size-label group-data-phone/row:leading-(--line-meta)"
    + class="row-start-3 col-start-2 col-end-4 flex min-w-0 type-meta leading-(--line-reason) text-ink-subtle group-data-phone/row:type-label group-data-phone/row:font-normal group-data-phone/row:leading-(--line-meta)"
- lib/cawco/find/Finder.svelte:714  −[font-body font-medium text-(length:--caps-fs)]  +[type-caps]
    T: lib/cawco/find/Finder.svelte:982 type-caps (ok)
    - class="flex-none h-(--head-h) px-space-3 font-body font-medium text-(length:--caps-fs) leading-(--head-h) uppercase tracking-caps text-ink-muted truncate"
    + class="flex-none h-(--head-h) px-space-3 type-caps leading-(--head-h) uppercase tracking-caps text-ink-muted truncate"
- lib/cawco/find/Finder.svelte:883  −[11px]  +[]
    - <!-- literal: 44px, 52px, 16px, 36px, 28px, 11px, 24px, 32px, 9px, 12px, 2px, 15px, 20px, 0.25em, 0.35em, 40px, 54px, 8px -->
    + <!-- literal: 44px, 52px, 16px, 36px, 28px, 24px, 32px, 9px, 12px, 2px, 15px, 20px, 0.25em, 0.35em, 40px, 54px, 8px -->
- lib/cawco/find/Finder.svelte:896  −[11px]  +[]
    - style:--caps-fs="11px"
- lib/cawco/find/MentionField.svelte:711  −[font-body font-normal]  +[type-body]
    T: lib/cawco/find/MentionField.svelte:757 type-body (ok)
    - "relative min-h-(--editor-min-h) max-h-(--editor-max-h) overflow-y-auto py-space-2 font-body font-normal text-(length:--editor-fs) leading-ui text-ink-strong caret-brand-solid whitespace-pre-wrap wrap-anywhere no-scrollbar",
    + "relative min-h-(--editor-min-h) max-h-(--editor-max-h) overflow-y-auto py-space-2 type-body text-(length:--editor-fs) leading-ui text-ink-strong caret-brand-solid whitespace-pre-wrap wrap-anywhere no-scrollbar",
- lib/cawco/find/MentionField.svelte:769  −[font-(family-name:--font-mono) text-size-code font-normal leading-code]  +[type-code]
    T: lib/cawco/find/MentionField.svelte:844 type-code (ok)
    - <span
    - class="font-(family-name:--font-mono) text-size-code font-normal leading-code opacity-80"
    - >{tip.handle}</span
    - >
    + <span class="type-code opacity-80">{tip.handle}</span>
- lib/cawco/find/MentionMenu.svelte:112  −[font-body text-label]  +[type-label]
    T: lib/cawco/find/MentionMenu.svelte:156 type-label (ok)
    - class="m-0 px-space-3 py-space-2 font-body text-label font-normal text-ink-muted group-data-phone/menu:text-(length:--line-fs) group-data-phone/menu:leading-(--line-lh)"
    + class="m-0 px-space-3 py-space-2 type-label font-normal text-ink-muted group-data-phone/menu:text-(length:--line-fs) group-data-phone/menu:leading-(--line-lh)"
- lib/cawco/find/MentionMenu.svelte:124  −[font-body text-label]  +[type-label]
    T: lib/cawco/find/MentionMenu.svelte:156 type-label (ok)
    - class="m-0 px-space-3 py-space-2 font-body text-label font-normal text-ink-muted group-data-phone/menu:text-(length:--line-fs) group-data-phone/menu:leading-(--line-lh)"
    + class="m-0 px-space-3 py-space-2 type-label font-normal text-ink-muted group-data-phone/menu:text-(length:--line-fs) group-data-phone/menu:leading-(--line-lh)"
- lib/cawco/find/MentionMenu.svelte:146  −[font-body text-label]  +[type-label]
    T: lib/cawco/find/MentionMenu.svelte:156 type-label (ok)
    - class="m-0 px-space-3 py-space-2 font-body text-label font-normal text-ink-muted group-data-phone/menu:text-(length:--line-fs) group-data-phone/menu:leading-(--line-lh)"
    + class="m-0 px-space-3 py-space-2 type-label font-normal text-ink-muted group-data-phone/menu:text-(length:--line-fs) group-data-phone/menu:leading-(--line-lh)"
- lib/cawco/plan/PlanPane.svelte:226  −[text-body]  +[type-body]
    T: lib/cawco/plan/PlanPane.svelte:375 type-body (ok)
    - class="m-0 text-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
    + class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
- lib/cawco/plan/PlanPane.svelte:236  −[text-body]  +[type-body]
    T: lib/cawco/plan/PlanPane.svelte:375 type-body (ok)
    - class="m-0 text-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
    + class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
- lib/cawco/plan/PlanPane.svelte:246  −[text-body]  +[type-body]
    T: lib/cawco/plan/PlanPane.svelte:375 type-body (ok)
    - class="m-0 text-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
    + class="m-0 type-body font-medium text-ink-strong not-first:mbs-space-3 not-first:pbs-space-4 not-first:border-bs not-first:border-bs-border-hairline"
- lib/cawco/spawn/LocationSection.svelte:525  −[text-size-meta leading-(--lh) font-normal 1.35]  +[type-meta]
    T: lib/cawco/spawn/LocationSection.svelte:686 type-meta (ok)
    - class="min-w-0 font-(family-name:--font-mono) text-size-meta leading-(--lh) font-normal text-pretty text-ink-strong"
    - style:--lh="1.35">{dir.trim() || "~"}</span
    + class="min-w-0 type-meta font-(family-name:--font-mono) text-pretty text-ink-strong"
    + >{dir.trim() || "~"}</span
- lib/cawco/spawn/ModelSection.svelte:495  −[text-size-meta leading-meta font-normal]  +[type-meta]
    T: lib/cawco/spawn/ModelSection.svelte:743 type-meta (ok)
    - class="block truncate font-(family-name:--font-mono) text-size-meta leading-meta font-normal text-ink-muted"
    + class="block truncate type-meta font-(family-name:--font-mono) text-ink-muted"
- lib/cawco/spawn/NewSessionDialog.svelte:1856  −[]  +[tracking-title]
    T: lib/cawco/spawn/NewSessionDialog.svelte:2232 type-title (ok)
    - <h2 data-slot="title" class="type-title m-0 truncate text-ink-strong">
    + <h2
    + data-slot="title"
    + class="type-title tracking-title m-0 truncate text-ink-strong"
    + >
- lib/cawco/tasks/BulkBar.svelte:292  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/BulkBar.svelte:420 type-meta (ok)
    - class="flex-none text-meta font-(family-name:--font-mono) liga-none text-ink-muted"
    + class="flex-none type-meta font-(family-name:--font-mono) liga-none text-ink-muted"
- lib/cawco/tasks/PostCard.svelte:92  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/PostCard.svelte:191 type-meta (ok)
    - class="grid size-(--mark) flex-none place-items-center rounded-(--mark-r) bg-surface-fill text-meta font-medium text-ink-strong"
    + class="grid size-(--mark) flex-none place-items-center rounded-(--mark-r) bg-surface-fill type-meta font-medium text-ink-strong"
- lib/cawco/tasks/TaskActivity.svelte:210  −[font-body leading-label font-medium]  +[type-label text-size-inherit]
    T: lib/cawco/tasks/TaskActivity.svelte:380 type-label (ok)
    - class="font-body leading-label font-medium text-ink-strong"
    - >{each.who}</span
    + class="type-label text-size-inherit text-ink-strong">{each.who}</span
- lib/cawco/tasks/TaskActivity.svelte:238  −[font-body leading-label font-medium]  +[type-label text-size-inherit]
    T: lib/cawco/tasks/TaskActivity.svelte:380 type-label (ok)
    - class="font-body leading-label font-medium text-ink-strong"
    - >{each.who}</span
    + class="type-label text-size-inherit text-ink-strong">{each.who}</span
- lib/cawco/tasks/TaskCard.svelte:126  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TaskCard.svelte:232 type-meta (ok)
    - class="text-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
    + class="type-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
- lib/cawco/tasks/TaskColumn.svelte:115  −[]  +[liga-none]
    T: lib/cawco/tasks/TaskColumn.svelte:266 type-code (ok)
    - class="flex-none type-code whitespace-nowrap text-ink-subtle group-kind-you/col:text-status-attn-ink"
    + class="flex-none type-code liga-none whitespace-nowrap text-ink-subtle group-kind-you/col:text-status-attn-ink"
- lib/cawco/tasks/TaskFields.svelte:78  −[]  +[liga-none]
    T: lib/cawco/tasks/TaskFields.svelte:186 type-code (ok)
    - <dt class="type-code wrap-anywhere pt-space-1 text-ink-muted">{key}</dt>
    + <dt class="type-code liga-none wrap-anywhere pt-space-1 text-ink-muted">
    + {key}
    + </dt>
- lib/cawco/tasks/TaskNeeds.svelte:201  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TaskNeeds.svelte:352 type-meta (ok)
    - class="max-h-(--args-max) m-0 py-space-2 px-space-3 overflow-auto border border-border-well rounded-sm bg-surface-well text-meta font-mono liga-none whitespace-pre-wrap wrap-anywhere"
    + class="max-h-(--args-max) m-0 py-space-2 px-space-3 overflow-auto border border-border-well rounded-sm bg-surface-well type-meta font-mono liga-none whitespace-pre-wrap wrap-anywhere"
- lib/cawco/tasks/TaskNeeds.svelte:322  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TaskNeeds.svelte:398 type-meta (ok)
    - class="flex-none text-meta font-mono liga-none text-ink-muted"
    + class="flex-none type-meta font-mono liga-none text-ink-muted"
- lib/cawco/tasks/TaskPane.svelte:479  −[]  +[tracking-title]
    T: lib/cawco/tasks/TaskPane.svelte:798 type-title (ok)
    - <h2 data-slot="title" class="m-0 type-title">
    + <h2 data-slot="title" class="m-0 type-title tracking-title">
- lib/cawco/tasks/TaskPane.svelte:742  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TaskPane.svelte:737 type-meta (ok)
    - <span class="ms-auto text-meta font-mono liga-none text-ink-subtle"
    + <span class="ms-auto type-meta font-mono liga-none text-ink-subtle"
- lib/cawco/tasks/TaskRelations.svelte:75  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TaskRelations.svelte:240 type-meta (ok)
    - <span class="flex-none text-meta font-mono liga-none text-ink-muted"
    + <span class="flex-none type-meta font-mono liga-none text-ink-muted"
- lib/cawco/tasks/TaskRelations.svelte:167  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TaskRelations.svelte:240 type-meta (ok)
    - class="flex-none text-meta font-mono liga-none text-ink-muted"
    + class="flex-none type-meta font-mono liga-none text-ink-muted"
- lib/cawco/tasks/TaskTable.svelte:343  −[]  +[liga-none]
    T: lib/cawco/tasks/TaskTable.svelte:459 type-code (ok)
    - <span data-slot="id" class="type-code text-ink-subtle"
    + <span data-slot="id" class="type-code liga-none text-ink-subtle"
- lib/cawco/tasks/TodoList.svelte:231  −[text-meta]  +[type-meta]
    T: lib/cawco/tasks/TodoList.svelte:310 type-meta (ok)
    - class="flex-none text-meta font-mono liga-none text-ink-muted"
    + class="flex-none type-meta font-mono liga-none text-ink-muted"
- lib/cawco/transcript/Peer.svelte:125  −[font-body text-size-label font-medium]  +[type-label]
    T: lib/cawco/transcript/Peer.svelte:184 type-label (ok)
    - class="relative min-h-(--label-min) m-0 font-body text-size-label font-medium leading-ui text-ink-muted rail-line"
    + class="relative min-h-(--label-min) m-0 type-label leading-ui text-ink-muted rail-line"
- lib/cawco/usage/LimitsBlock.svelte:115  −[font-body text-meta]  +[type-meta]
    T: lib/cawco/usage/LimitsBlock.svelte:462 type-meta (ok)
    - <span class="font-body text-meta font-medium text-ink-muted"
    + <span class="type-meta font-medium text-ink-muted"
- lib/cawco/usage/ProjectSpend.svelte:601  −[]  +[liga-none]
    T: lib/cawco/usage/ProjectSpend.svelte:675 type-code (ok)
    - class="type-code ms-space-2 text-ink-subtle"
    + class="type-code liga-none ms-space-2 text-ink-subtle"
- lib/cawco/usage/SessionsChip.svelte:177  −[font-body text-meta]  +[type-meta]
    T: lib/cawco/usage/SessionsChip.svelte:246 type-meta (ok)
    - class="pressable touch-hit h-icon-md min-w-icon-md flex-none cursor-pointer overflow-visible px-space-1 font-body text-ink-row text-meta leading-none num"
    + class="pressable touch-hit h-icon-md min-w-icon-md flex-none cursor-pointer overflow-visible px-space-1 text-ink-row type-meta leading-none num"
- lib/cawco/usage/SessionsChip.svelte:208  −[font-body text-meta]  +[type-meta]
    T: lib/cawco/usage/SessionsChip.svelte:266 type-meta (ok)
    - class="px-space-3 pt-space-2 pb-space-1 font-body text-ink-strong text-meta font-medium"
    + class="px-space-3 pt-space-2 pb-space-1 text-ink-strong type-meta font-medium"
- lib/cawco/views/ViewMade.svelte:72  −[text-meta]  +[type-meta]
    T: lib/cawco/views/ViewMade.svelte:125 type-meta (ok)
    - class="text-meta font-mono liga-none text-ink-muted">{task.id}</span
    + class="type-meta font-mono liga-none text-ink-muted">{task.id}</span
- lib/cawco/views/ViewPipeline.svelte:68  −[]  +[liga-none]
    T: lib/cawco/views/ViewPipeline.svelte:131 type-code (ok)
    - <span data-slot="kind" class="type-code text-ink-subtle max-phone:hidden"
    + <span
    + data-slot="kind"
    + class="type-code liga-none text-ink-subtle max-phone:hidden"
- lib/cawco/views/ViewRoutines.svelte:1011  −[]  +[liga-none]
    T: lib/cawco/views/ViewRoutines.svelte:1178 type-meta (partial); lib/cawco/views/ViewRoutines.svelte:1187 type-code (ok)
    - class="block truncate type-code text-ink-muted"
    + class="block truncate type-code liga-none text-ink-muted"
- lib/cawco/views/ViewRoutines.svelte:1058  −[]  +[liga-none]
    T: lib/cawco/views/ViewRoutines.svelte:1187 type-code (ok)
    - >{#if poll.tool}<span data-slot="code" class="type-code"
    - >{poll.tool}</span
    + >{#if poll.tool}<span
    + data-slot="code"
    + class="type-code liga-none">{poll.tool}</span
- lib/cawco/views/openui/ViewTable.svelte:67  −[]  +[type-label]
    - class="h-c-toolbar-ctl px-space-3 tracking-caps text-ink-muted uppercase"
    + class="h-c-toolbar-ctl px-space-3 type-label tracking-caps text-ink-muted uppercase"
- lib/utils.ts:17  −[]  +[/** a shorthand class resets: every font longhand group and the other shorthands. const fontResets type-role font-shorthand font-family font-features font-size font-stretch font-style font-weight fvn-normal fvn-ordinal fvn-slashed-zero fvn-figure fvn-spacing fvn-fraction leading as const;]
    + /** What a `font` shorthand class resets: every font longhand group, and the other shorthands. */
    + const fontResets = [
    + "type-role",
    + "font-shorthand",
    + "font-family",
    + "font-features",
    + "font-size",
    + "font-stretch",
    + "font-style",
    + "font-weight",
    + "fvn-normal",
    + "fvn-ordinal",
    + "fvn-slashed-zero",
    + "fvn-figure",
    + "fvn-spacing",
    + "fvn-fraction",
    + "leading",
    + ] as const;
- lib/utils.ts:135  −[]  +[// shorthand class (a type role resets every // font longhand so it replaces an earlier class that set one as a // later declaration did (`type-meta` on a drops its // leading-none`). longhand class after it is kept: it // sorts after the shorthand and wins (scripts/role-order.ts). conflictingClassGroups: type-role : ...fontResets font-shorthand : ...fontResets]
    + // A `font` shorthand class (a type role, `font-inherit`) resets every
    + // font longhand, so it replaces an earlier class that set one, as a
    + // later `font:` declaration did (`type-meta` on a Badge drops its
    + // `text-label leading-none`). A longhand class after it is kept: it
    + // sorts after the shorthand and wins (scripts/role-order.ts).
    + conflictingClassGroups: {
    + "type-role": [...fontResets],
    + "font-shorthand": [...fontResets],
    + },
