import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

// The Routines page's three blocks' bodies (ViewRoutines.svelte,
// routines/RoutineDetail.svelte, routines/ActionsTable.svelte).

/// The Routines block's ledger, one shape for every row: its state glyph;
/// its name over its schedule in words on your clock; Last run, a status
/// glyph and how long ago; Next run; its ⋯. Last and Next are fixed columns,
/// so every row's times start on one edge. Enabled first, then the soonest
/// next run. A row opens its detail in place (one at a time); on a ledger
/// narrower than `cBlockRoutines` Last and Next fold into the schedule's line.
final class RoutinesLedger: UIView {
    var act: (_ work: @escaping (ProjectTasks) async throws -> Void) -> Void = { _ in }
    var openThread: (String) -> Void = { _ in }

    private let stack = UIStackView()
    private var routines: [Routine] = []
    private var routes: [RoutineRoute] = []
    private var actions: [ApprovedAction] = []
    /// The one routine open.
    private(set) var open: String?
    private var deleting: String?
    private var deletePending = false
    /// The open routine's instruction shown whole (More).
    private var whole = false
    private var narrow: Bool?
    /// Each routine's row by id, one view while the ledger's columns stand:
    /// a refresh changes it in place, so its ⋯ keeps an open menu.
    private var rows: [String: RoutineRow] = [:]
    private var rowsNarrow: Bool?
    private let band = Held<Bool>()
    #if DEBUG
    /// Each routine's ⋯ by id, for the probe.
    var menus: [String: UIButton] { rows.mapValues(\.menu) }
    #endif

    override init(frame: CGRect) {
        super.init(frame: frame)
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        accessibilityLabel = Words.Routines.tab
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RoutinesLedger is built in code")
    }

    func show(routines: [Routine], routes: [RoutineRoute], actions: [ApprovedAction]) {
        self.routines = routines
        self.routes = routes
        self.actions = actions
        render()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // `@container routines-ledger (width < 34rem)`.
        let now = bounds.width < Size.cBlockRoutines
        if bounds.width > 0, now != narrow {
            narrow = now
            render()
        }
    }

    private var columns: [LedgerColumn] {
        let state = LedgerColumn.fixed(nil, said: Words.Routines.columnState, width: Size.cRowLead + Space.space3, trailing: 0)
        let name = LedgerColumn.rest(Words.Routines.columnRoutine)
        let menu = LedgerColumn.fixed(nil, said: Words.Routines.columnActions, width: Size.cBtnHSm + Space.space3 * 2)
        if narrow == true { return [state, name, menu] }
        return [state, name, .fixed(Words.Routines.columnLastRun, width: Size.cRoutineTimeW), .fixed(Words.Routines.columnNextRun, width: Size.cRoutineTimeW), menu]
    }

    /// Enabled first (on above off), then the soonest next run.
    private var sorted: [Routine] {
        routines.sorted { a, b in a.enabled != b.enabled ? a.enabled : a.nextSlot < b.nextSlot }
    }

    /// The ledger as it stands now: each routine's row changed in place, a
    /// row made only for a routine new to it (every row again only when the
    /// columns fold or unfold), the rows moved only when their order changed.
    private func render() {
        let columns = columns
        let isNarrow = narrow == true
        band.hold(isNarrow) { _ in LedgerParts.band(columns) }
        if rowsNarrow != isNarrow {
            rows = [:]
            rowsNarrow = isNarrow
        }
        let sorted = sorted
        let ids = Set(sorted.map(\.id))
        rows = rows.filter { ids.contains($0.key) }
        let minute = Int(Date.now.timeIntervalSince1970 / 60)
        for (index, routine) in sorted.enumerated() {
            let row = rows[routine.id] ?? RoutineRow(columns: columns, narrow: isNarrow) { [weak self] in self?.toggle(routine.id) }
            rows[routine.id] = row
            let isOpen = open == routine.id
            face(row, routine, first: index == 0, open: isOpen)
            row.ask.isHidden = deleting != routine.id
            if deleting == routine.id {
                row.ask.hold(deletePending) { _ in deleteAsk(routine) }
            }
            row.detail.isHidden = !isOpen
            if isOpen {
                let mine = actions.filter { $0.routineId == routine.id }
                row.detail.hold(.init(routine: routine, actions: mine, wide: !isNarrow, minute: minute)) { shown in
                    let detail = RoutineDetailView(routine: shown.routine, actions: shown.actions, wide: shown.wide, whole: whole)
                    detail.openThread = openThread
                    detail.onWhole = { [weak self] whole in self?.whole = whole }
                    return detail
                }
            }
        }
        // The band, then each routine's group in the ledger's order.
        let order: [UIView] = [band] + sorted.compactMap { rows[$0.id]?.group }
        guard stack.arrangedSubviews != order else { return }
        stack.arrangedSubviews.filter { view in !order.contains { $0 === view } }.forEach { $0.removeFromSuperview() }
        for (index, view) in order.enumerated() where stack.arrangedSubviews.firstIndex(of: view) != index {
            stack.insertArrangedSubview(view, at: index)
        }
    }

    private enum Lead { case on, event, paused, expiring }

    /// The lead glyph: whether it runs, and how; never how its last run went.
    private func lead(_ routine: Routine) -> Lead {
        if !routine.enabled { return .paused }
        if routine.expiresAt != nil, !routine.keep { return .expiring }
        return routes.contains { $0.route.routineId == routine.id } ? .event : .on
    }

    /// A route's event in words: its service, its kinds, and what it filters on.
    static func event(_ route: EventRoute) -> String {
        [
            "\(route.source) \(route.kinds.isEmpty ? Words.Routines.events : route.kinds.joined(separator: ", "))",
            route.label,
            route.branch.map { Words.Routines.onBranch(branch: $0) },
            route.author.map { Words.Routines.byAuthor(author: $0) },
            route.regex,
        ].compactMap(\.self).filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// A routine's row as it stands now: its lead, its name over its
    /// schedule's line (on a narrow ledger, Last and Next folded in), Last,
    /// Next and its ⋯'s menu.
    private func face(_ row: RoutineRow, _ routine: Routine, first: Bool, open: Bool) {
        let state = lead(routine)
        let (glyph, said, ink): (Glyph, String, UIColor) = switch state {
        case .on: (.clock, Words.Routines.leadOn, Palette.inkMuted)
        case .event: (.hook, Words.Routines.leadEvent, Palette.inkMuted)
        case .paused: (.pause, Words.Routines.leadPaused, Palette.inkSubtle)
        case .expiring: (.hourglass, Words.Routines.leadExpiring, Palette.statusAttnGlyph)
        }
        row.mark.glyph = glyph
        row.mark.tintColor = ink
        row.mark.accessibilityLabel = said

        row.name.ink = open ? Palette.inkStrong : routine.enabled ? Palette.inkRow : Palette.inkMuted
        row.name.text = routine.name
        let schedule = RoutineSchedule.schedule(routine.cron, zone: routine.timeZone, next: routine.nextSlot)
        let last = lastOf(routine)
        let next = nextOf(routine)
        var line = AttributedString(schedule.words, attributes: TypeScale.typeMeta.container(color: Palette.inkMuted))
        if state == .expiring, let expires = routine.expiresAt {
            let days = max(1, Int(((expires - Date.now.timeIntervalSince1970 * 1000) / 86_400_000).rounded()))
            line += AttributedString(" · \(Words.Routines.offIn(days: days))", attributes: TypeScale.typeMeta.container(color: Palette.statusAttnInk))
        }
        if narrow == true {
            line += AttributedString(" · \(Words.Routines.lastShort) \(last.text) · \(Words.Routines.nextShort) \(next.text)",
                                     attributes: TypeScale.typeMeta.container(color: last.status == .failed ? Palette.statusFailInk : Palette.inkMuted))
        }
        row.sub.attributedText = NSAttributedString(line)
        let events = routes.filter { $0.route.routineId == routine.id }.map { Words.Routines.alsoWhen(event: Self.event($0.route)) }
        LedgerParts.tip(row.sub, ([schedule.local, Words.Routines.next(exact: RoutineSchedule.exact(routine.nextSlot))] + events).compactMap(\.self).joined(separator: " · "))

        row.last.show(last.status, text: last.text, said: last.said, title: last.title)
        row.next.text = next.text
        row.next.ink = routine.enabled ? Palette.inkMuted : Palette.inkSubtle
        LedgerParts.tip(row.next, next.title)

        row.menu.accessibilityLabel = Words.Blocks.more(title: routine.name)
        row.menu.menu = menuOf(routine)
        row.opener.accessibilityLabel = [routine.name, schedule.words, last.said, last.text, next.text].compactMap(\.self).joined(separator: ", ")
        row.opener.accessibilityValue = open ? "expanded" : "collapsed"
        row.hairline?.isHidden = first
        row.group.backgroundColor = open ? Palette.surfaceWell : .clear
    }

    /// Opening one folds the other.
    private func toggle(_ id: String) {
        open = open == id ? nil : id
        whole = false
        render()
    }

    /// The Last run cell: its status, the time it says, the whole of it for a pointer.
    private func lastOf(_ routine: Routine) -> (status: RunStatusView.Status, text: String, title: String?, said: String?) {
        guard let run = routine.runs.first else { return (.neutral, Words.Routines.never, Words.Routines.notRunYet, nil) }
        let at = RoutineSchedule.exact(run.startedAt)
        if ProjectRoutines.going(routine) { return (.running, Words.Routines.running, Words.Routines.runningSince(at: at), nil) }
        if run.state == .queued { return (.neutral, Words.Routines.queued, at, nil) }
        let ago = RoutineSchedule.since(run.endedAt ?? run.startedAt)
        let (word, status): (String, RunStatusView.Status) = if run.state == .skipped {
            (Words.Routines.skipped, .neutral)
        } else if run.outcome == .failed {
            (Words.Routines.failed, .failed)
        } else if run.outcome == .cancelled {
            (Words.Routines.stopped, .neutral)
        } else if run.outcome == .silent {
            (Words.Routines.silent, .done)
        } else {
            (Words.Routines.delivered, .done)
        }
        return (status, ago, Words.Routines.wordAt(word: word, at: at), word)
    }

    /// The Next run cell.
    private func nextOf(_ routine: Routine) -> (text: String, title: String?) {
        guard routine.enabled else { return (Words.Routines.paused, routine.disabledReason) }
        return (RoutineSchedule.when(routine.nextSlot), RoutineSchedule.exact(routine.nextSlot))
    }

    private func menuOf(_ routine: Routine) -> UIMenu {
        let busy = ProjectRoutines.going(routine) || ProjectRoutines.queued(routine)
        var items: [UIMenuElement] = [
            UIAction(title: Words.Routines.runNow, image: Glyph.loopOn.image, attributes: busy ? .disabled : []) { [weak self] _ in
                self?.act { try await $0.runRoutineNow(routine.id) }
            },
            UIAction(title: routine.enabled ? Words.Routines.pause : Words.Routines.resume,
                     image: (routine.enabled ? Glyph.loopHeld : Glyph.loopOn).image) { [weak self] _ in
                self?.act { try await $0.updateRoutine(routine.id, enabled: !routine.enabled) }
            },
        ]
        if routine.expiresAt != nil, !routine.keep {
            items.append(UIAction(title: Words.Routines.keep, image: Glyph.pin.image) { [weak self] _ in
                self?.act { try await $0.updateRoutine(routine.id, keep: true) }
            })
        }
        items.append(UIAction(title: Words.Routines.remove, image: Glyph.trash.image, attributes: .destructive) { [weak self] _ in
            self?.deleting = routine.id
            self?.render()
        })
        return UIMenu(children: items)
    }

    /// Delete asked in the row's place: what goes and what stays, then Delete routine and Cancel.
    private func deleteAsk(_ routine: Routine) -> UIView {
        let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong, lines: 0)
        words.text = Words.Routines.removeAsk(name: routine.name)
        let confirm = KitButton.make(deletePending ? Words.Routines.removing : Words.Routines.removeConfirm, variant: .destructive, height: .xs) { [weak self] in
            guard let self, !deletePending else { return }
            deletePending = true
            render()
            act { [weak self] api in
                defer { Task { @MainActor in self?.deletePending = false; self?.deleting = nil; self?.render() } }
                try await api.deleteRoutine(routine.id)
            }
        }
        confirm.configuration?.showsActivityIndicator = deletePending
        let cancel = KitButton.make(Words.Routines.cancel, variant: .ghost, height: .xs) { [weak self] in
            self?.deleting = nil
            self?.render()
        }
        let row = WrapLayout([words, confirm, cancel], gap: Space.space2, rowGap: Space.space1, centred: true)
        row.accessibilityLabel = Words.Routines.removeLabel(name: routine.name)
        let box = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: box.topAnchor),
            row.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -Space.space2),
            row.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space3),
        ])
        return box
    }
}

/// One routine's place in the ledger: its row (the whole row its opener,
/// its ⋯ above it), then its delete ask and its detail, each shown while it
/// is asked or open. Made once per routine; the ledger changes its words in
/// place.
@MainActor
private final class RoutineRow {
    let group = UIStackView()
    let mark = GlyphView(.clock, size: Size.iconMd)
    let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
    let sub = UILabel()
    let last = RunStatusView()
    let next = LedgerParts.meta(nil)
    let menu = KitButton.make("", glyph: .more, variant: .ghost, height: .sm) {}
    let opener = UIControl()
    let hairline: UIView?
    let ask = Held<Bool>()
    let detail = Held<DetailShown>()

    struct DetailShown: Equatable {
        let routine: Routine
        let actions: [ApprovedAction]
        let wide: Bool
        /// Its runs say "ago".
        let minute: Int
    }

    init(columns: [LedgerColumn], narrow: Bool, toggle: @escaping () -> Void) {
        mark.isAccessibilityElement = true
        let leadBox = UIView()
        leadBox.addSubview(mark)
        NSLayoutConstraint.activate([
            leadBox.widthAnchor.constraint(equalToConstant: Size.cRowLead),
            leadBox.heightAnchor.constraint(equalToConstant: Size.iconMd),
            mark.centerXAnchor.constraint(equalTo: leadBox.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: leadBox.centerYAnchor),
        ])
        name.lineBreakMode = .byTruncatingTail
        sub.lineBreakMode = .byTruncatingTail
        sub.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let names = UIStackView(arrangedSubviews: [name, sub])
        names.axis = .vertical
        names.spacing = 0
        menu.showsMenuAsPrimaryAction = true

        let views: [UIView] = narrow ? [leadBox, names, menu] : [leadBox, names, last, next, menu]
        let box = LedgerParts.row(columns, views, first: false)
        hairline = box.subviews.first { $0 is Hairline }
        // The whole row is the opener, its ⋯ above it.
        opener.translatesAutoresizingMaskIntoConstraints = false
        opener.isAccessibilityElement = true
        opener.accessibilityTraits = .button
        opener.addAction(UIAction { _ in toggle() }, for: .touchUpInside)
        opener.addAction(UIAction { [weak opener] _ in opener?.backgroundColor = Palette.surfaceFill }, for: .touchDown)
        opener.addAction(UIAction { [weak opener] _ in opener?.backgroundColor = .clear }, for: [.touchUpInside, .touchUpOutside, .touchCancel])
        box.insertSubview(opener, at: 0)
        NSLayoutConstraint.activate([
            opener.topAnchor.constraint(equalTo: box.topAnchor),
            opener.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            opener.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            opener.trailingAnchor.constraint(equalTo: box.trailingAnchor),
        ])
        for view in views where view !== menu { view.isUserInteractionEnabled = false }

        group.axis = .vertical
        for part in [box, ask, detail] { group.addArrangedSubview(part) }
    }
}

/// A routine opened in place under its row (RoutineDetail.svelte): only
/// what the row does not say. Its instruction as the markdown it is written
/// in, four lines at most until More; its newest five runs as a ledger
/// (When, Outcome, Took, Result, the result a way into the run's thread);
/// and the actions its runs proposed.
final class RoutineDetailView: UIView {
    var openThread: (String) -> Void = { _ in }
    /// More or Less pressed: the instruction shown whole or not.
    var onWhole: (Bool) -> Void = { _ in }
    private let routine: Routine
    private let instruction = MarkdownDocumentView(message: true)
    private var clamp: NSLayoutConstraint!
    private var more: UIButton?
    private var whole: Bool

    init(routine: Routine, actions: [ApprovedAction], wide: Bool, whole: Bool) {
        self.routine = routine
        self.whole = whole
        super.init(frame: .zero)
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = Space.space4
        column.alignment = .fill
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        // On a ledger 400pt wide or more, on the row's name column.
        let start = wide ? Size.cRowLead + Space.space3 * 2 : Space.space3
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space4),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: start),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
        ])

        // The instruction: four lines until More.
        instruction.setSource(routine.prompt)
        instruction.clipsToBounds = true
        clamp = instruction.heightAnchor.constraint(lessThanOrEqualToConstant: TypeScale.typeBody.font.lineHeight * 4)
        clamp.isActive = !whole
        let wrap = UIStackView(arrangedSubviews: [instruction])
        wrap.axis = .vertical
        wrap.alignment = .leading
        wrap.spacing = Space.space1
        let more = KitButton.make(whole ? Words.Routines.less : Words.Routines.more, variant: .ghost, height: .xs) { [weak self] in self?.flip() }
        more.isHidden = true
        wrap.addArrangedSubview(more)
        self.more = more
        column.addArrangedSubview(wrap)
        instruction.widthAnchor.constraint(equalTo: wrap.widthAnchor).isActive = true

        let recent = Array(routine.runs.prefix(5))
        if !recent.isEmpty {
            column.addArrangedSubview(section(Words.Routines.recentRuns, runs(recent, narrow: !wide)))
        }
        if !actions.isEmpty {
            column.addArrangedSubview(section(Words.Routines.columnActions, ActionsLedger(actions, routineNames: nil)))
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RoutineDetailView is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // It runs past four lines: More shows the rest.
        let natural = instruction.systemLayoutSizeFitting(CGSize(width: instruction.bounds.width, height: 0),
                                                          withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        let long = natural > TypeScale.typeBody.font.lineHeight * 4 + 1
        if more?.isHidden == long { more?.isHidden = !long }
    }

    private func flip() {
        whole.toggle()
        onWhole(whole)
        clamp.isActive = !whole
        if let more { KitButton.setTitle(whole ? Words.Routines.less : Words.Routines.more, of: more, variant: .ghost, height: .xs) }
        superview?.setNeedsLayout()
    }

    private func section(_ title: String, _ body: UIView) -> UIView {
        let head = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        head.text = title
        head.accessibilityTraits = .header
        // The routines table's band and rows on the well: a hairline edge, radius-sm, raised.
        let ledger = UIView()
        ledger.backgroundColor = Palette.surfaceRaised
        ledger.layer.cornerRadius = Radius.radiusSm
        ledger.layer.cornerCurve = .continuous
        ledger.layer.borderWidth = 1
        ledger.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        ledger.clipsToBounds = true
        body.translatesAutoresizingMaskIntoConstraints = false
        ledger.addSubview(body)
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: ledger.topAnchor),
            body.bottomAnchor.constraint(equalTo: ledger.bottomAnchor),
            body.leadingAnchor.constraint(equalTo: ledger.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: ledger.trailingAnchor),
        ])
        let stack = UIStackView(arrangedSubviews: [head, ledger])
        stack.axis = .vertical
        stack.spacing = Space.space2
        return stack
    }

    /// When, Outcome, Took (not on a phone, where it gives its room to the result), Result.
    private func runs(_ recent: [RoutineRun], narrow: Bool) -> UIView {
        let columns: [LedgerColumn] = narrow
            ? [.fixed(Words.Routines.columnWhen, width: 72), .fixed(Words.Routines.columnOutcome, width: 128), .rest(Words.Routines.columnResult)]
            : [.fixed(Words.Routines.columnWhen, width: 96), .fixed(Words.Routines.columnOutcome, width: 176),
               .fixed(Words.Routines.columnTook, width: 80), .rest(Words.Routines.columnResult)]
        let stack = UIStackView(arrangedSubviews: [LedgerParts.band(columns)])
        stack.axis = .vertical
        for run in recent {
            let when = LedgerParts.meta(RoutineSchedule.since(run.startedAt))
            LedgerParts.tip(when, RoutineSchedule.exact(run.startedAt))
            let (status, word) = outcome(run)
            let outcome = RunStatusView()
            outcome.show(status, text: word)
            let took = LedgerParts.meta(RoutineSchedule.took(run))
            let failed = status == .failed
            let resultWords = run.state == .skipped || run.outcome == .failed ? (run.reason ?? "") : (run.output ?? run.reason ?? "")
            let thread = run.threadId ?? routine.threadId
            let result: UIView
            if let thread {
                let link = UIButton(configuration: .plain())
                link.configuration?.contentInsets = .zero
                link.configuration?.attributedTitle = AttributedString(resultWords.isEmpty ? Words.Routines.readRun : resultWords,
                                                                       attributes: TypeScale.typeMeta.container(color: failed ? Palette.statusFailInk : Palette.inkRow))
                link.configuration?.titleLineBreakMode = .byTruncatingTail
                link.contentHorizontalAlignment = .leading
                link.accessibilityTraits = .link
                link.addAction(UIAction { [weak self] _ in self?.openThread(thread) }, for: .primaryActionTriggered)
                result = link
            } else {
                result = LedgerParts.meta(resultWords, ink: failed ? Palette.statusFailInk : Palette.inkRow)
            }
            LedgerParts.tip(result, resultWords)
            let cells: [UIView] = narrow ? [when, outcome, result] : [when, outcome, took, result]
            // Each run on its own line, the hairline over every one (the band stands first).
            stack.addArrangedSubview(LedgerParts.row(columns, cells, first: false))
        }
        return stack
    }

    /// A run's outcome, in the page's status vocabulary.
    private func outcome(_ run: RoutineRun) -> (RunStatusView.Status, String) {
        switch run.state {
        case .running, .starting: return (.running, Words.Routines.running)
        case .queued: return (.neutral, Words.Routines.queued)
        case .skipped: return (.neutral, Words.Routines.skipped)
        default: break
        }
        switch run.outcome {
        case .failed?: return (.failed, Words.Routines.failed)
        case .cancelled?: return (.neutral, Words.Routines.stopped)
        case .silent?: return (.done, Words.Routines.silent)
        default: return (.done, Words.Routines.delivered)
        }
    }
}

/// The Event sources block's ledger: each route that sends a service's
/// events to a routine (its routine's name over its event in code), then
/// each source read on a schedule (what it reads over its tool and how
/// often), with when it last delivered or read.
final class SourcesLedger: UIView {
    init(routes: [RoutineRoute], polls: [RoutinePoll], routines: [Routine]) {
        super.init(frame: .zero)
        let columns: [LedgerColumn] = [
            .fixed(nil, said: Words.Routines.columnService, width: Size.cRowLead + Space.space3, trailing: 0),
            .rest(Words.Routines.columnSource),
            .fixed(Words.Routines.columnLastRead, width: Size.cRoutineTimeW),
        ]
        let stack = UIStackView(arrangedSubviews: [LedgerParts.band(columns)])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        var first = true
        for route in routes {
            let last = RunStatusView()
            if let at = route.route.lastDeliveryAt {
                last.show(.done, text: RoutineSchedule.since(at), said: Words.Routines.delivered, title: RoutineSchedule.exact(at))
            } else {
                last.show(.neutral, text: Words.Routines.noEvents)
            }
            let name = routines.first { $0.id == route.route.routineId }?.name ?? route.route.routineId
            stack.addArrangedSubview(LedgerParts.row(columns, [LedgerParts.mark(route.service), Self.names(name, code: RoutinesLedger.event(route.route), rest: nil), last], first: first))
            first = false
        }
        for poll in polls {
            let last = RunStatusView()
            if let at = poll.polledAt {
                if let failure = poll.failure {
                    last.show(.failed, text: RoutineSchedule.since(at), said: Words.Routines.failed, title: Words.Routines.wordAt(word: failure, at: RoutineSchedule.exact(at)))
                } else {
                    last.show(.done, text: RoutineSchedule.since(at), said: Words.Routines.read, title: RoutineSchedule.exact(at))
                }
            } else {
                last.show(.neutral, text: Words.Routines.notReadYet)
            }
            stack.addArrangedSubview(LedgerParts.row(columns, [LedgerParts.mark(poll.service), Self.names(poll.what, code: poll.tool, rest: RoutineSchedule.every(poll.everyS)), last], first: first))
            first = false
        }
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        accessibilityLabel = Words.Routines.sources
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SourcesLedger is built in code")
    }

    /// The name in label type over its line in meta: code first (the code face), then the rest after ` · `.
    static func names(_ name: String, code: String?, rest: String?) -> UIView {
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
        title.text = name
        title.lineBreakMode = .byTruncatingTail
        var line = AttributedString()
        if let code {
            line += AttributedString(code, attributes: TypeScale.typeCode.with(points: TypeScale.typeMeta.points).container(color: Palette.inkMuted))
        }
        if let rest {
            line += AttributedString((code == nil ? "" : " · ") + rest, attributes: TypeScale.typeMeta.container(color: Palette.inkMuted))
        }
        let sub = UILabel()
        sub.attributedText = NSAttributedString(line)
        sub.lineBreakMode = .byTruncatingTail
        sub.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let stack = UIStackView(arrangedSubviews: [title, sub])
        stack.axis = .vertical
        return stack
    }
}

/// Actions sessions proposed and what came of them (ActionsTable.svelte):
/// the service's mark; the action in its proposer's words, with where it
/// came from unless it stands in a routine's own detail; its status in the
/// page's glyph vocabulary; when.
final class ActionsLedger: UIView {
    init(_ actions: [ApprovedAction], routineNames: [String: String]?) {
        super.init(frame: .zero)
        let columns: [LedgerColumn] = [
            .fixed(nil, said: Words.Routines.columnService, width: Size.cRowLead + Space.space3, trailing: 0),
            .rest(Words.Routines.columnAction),
            .fixed(Words.Routines.columnStatus, width: Size.cRoutineTimeW),
            .fixed(Words.Routines.columnWhen, width: 96),
        ]
        let stack = UIStackView(arrangedSubviews: [LedgerParts.band(columns)])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        for (index, action) in actions.enumerated() {
            let said = Self.status(action)
            let from = routineNames.flatMap { names in action.routineId.flatMap { names[$0] } ?? action.proposerTitle }
            let what = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
            what.text = action.reason
            what.lineBreakMode = .byTruncatingTail
            LedgerParts.tip(what, "\(action.service) · \(action.tool)")
            let column = UIStackView(arrangedSubviews: [what])
            column.axis = .vertical
            if let from { column.addArrangedSubview(LedgerParts.meta(Words.Routines.from(who: from))) }
            let status = RunStatusView()
            status.show(said.status, text: said.word)
            let when = LedgerParts.meta(said.at.map { RoutineSchedule.since($0) })
            LedgerParts.tip(when, said.at.map { RoutineSchedule.exact($0) })
            stack.addArrangedSubview(LedgerParts.row(columns, [LedgerParts.mark(action.service), column, status, when], first: index == 0))
        }
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        accessibilityLabel = Words.Routines.actions
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ActionsLedger is built in code")
    }

    /// An approved action waits on you: proposed, or failed or unknown until you put it away (`waitsOnYou`).
    static func waitsOnYou(_ action: ApprovedAction) -> Bool {
        action.state == .proposed || ((action.state == .failed || action.state == .unknown) && action.checkedAt == nil)
    }

    /// An approved action's status, its word, and when (`actionOf`).
    static func status(_ action: ApprovedAction) -> (status: RunStatusView.Status, word: String, at: Double?) {
        let ended = action.endedAt ?? action.createdAt
        return switch action.state {
        case .proposed: (.waiting, Words.Routines.actionWaiting, nil)
        case .approved: (.done, Words.Routines.actionApproved, action.approvedAt)
        case .running: (.running, Words.Routines.actionRunning, action.startedAt)
        case .done: (.done, Words.Routines.actionRan, ended)
        case .failed: (.failed, Words.Routines.actionFailed, ended)
        case .unknown: (.waiting, Words.Routines.actionUnknown, ended)
        case .denied: (.neutral, Words.Routines.actionDenied, ended)
        default: (.neutral, Words.Routines.actionCancelled, ended)
        }
    }
}
