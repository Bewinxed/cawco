import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

/// A session whose project is moving to its machine (its row on the board as
/// `moving` from the move's start), before its process exists
/// (move/MoveWait.svelte; design §2, the owner's picks B "Bar + MB"
/// and C: a move nobody said yes to in New session asks for it here, as
/// its first step). Drawn from the hub's job as it stands now and never
/// replayed: a step done before the pane opened is simply done.
///
/// Caw stands in for the wait under the Real Wait Rule: nothing for the
/// first `durWaitGrace`, then his `loading`, the steps under him. An ask is
/// not a wait: it shows at once, with no Caw. A failure keeps him over the
/// steps (the owner's pick), in `needs-you` until his failed phase is drawn.
final class MoveWaitView: UIView {
    typealias Job = Components.Schemas.MoveJob
    typealias Step = Components.Schemas.MoveStep

    enum Phase { case done, active, ahead, failed, stopped, asking }

    var onCancel: () -> Void = {}
    var onRetry: () -> Void = {}
    var onClose: () -> Void = {}
    var onAnswer: (_ moveIt: Bool) -> Void = { _ in }

    private let scroll = UIScrollView()
    private let stack = UIStackView()
    private let cawSlot = UIView()
    private var caw: CawView?
    private let column = UIStackView()
    private let stopped = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// On a phone, what pushes the foot to the bottom of the pane.
    private let give = UIView()
    private let foot = UIStackView()
    /// On a phone the steps start at the top and the foot stands at the bottom (web `.phone`).
    private var compactLayout: [NSLayoutConstraint] = []
    private var regularLayout: [NSLayoutConstraint] = []
    private var rows: [Step: StepRow] = [:]
    private var order: [Step] = []
    private var graceOver = false
    private var grace: Task<Void, Never>?
    private var job: Job?
    private var cawSide: NSLayoutConstraint!

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecess
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        // The safe area is laid out below, so the foot clears the home indicator.
        scroll.contentInsetAdjustmentBehavior = .never
        addSubview(scroll)
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = Space.space5
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        cawSlot.translatesAutoresizingMaskIntoConstraints = false
        cawSide = cawSlot.heightAnchor.constraint(equalToConstant: 128)
        column.axis = .vertical
        column.spacing = 0
        column.translatesAutoresizingMaskIntoConstraints = false
        foot.axis = .horizontal
        foot.translatesAutoresizingMaskIntoConstraints = false
        give.setContentHuggingPriority(.fittingSizeLevel, for: .vertical)
        give.isHidden = true
        stack.addArrangedSubview(cawSlot)
        stack.addArrangedSubview(column)
        stack.addArrangedSubview(stopped)
        stack.addArrangedSubview(give)
        stack.addArrangedSubview(foot)
        stack.setCustomSpacing(Space.space3, after: column)
        // The column is the pane's width up to 560 and never its words': its
        // edge, and every glyph on it, stays put whatever the steps say.
        let wide = column.widthAnchor.constraint(equalTo: stack.widthAnchor)
        wide.priority = .required - 1
        compactLayout = [
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space6),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space4),
        ]
        // Wider, the wait stands in the middle of the pane, its foot under it.
        regularLayout = [
            stack.bottomAnchor.constraint(lessThanOrEqualTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
            stack.centerYAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerYAnchor).withPriority(.defaultLow),
        ]
        NSLayoutConstraint.activate(regularLayout + [
            scroll.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(greaterThanOrEqualTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space6),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space4),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space4),
            scroll.contentLayoutGuide.heightAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor),
            cawSide,
            cawSlot.widthAnchor.constraint(equalTo: cawSlot.heightAnchor),
            column.widthAnchor.constraint(lessThanOrEqualToConstant: 560),
            wide,
            stopped.widthAnchor.constraint(equalTo: column.widthAnchor),
            foot.widthAnchor.constraint(equalTo: column.widthAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("MoveWaitView is built in code") }

    // MARK: The job

    /// Says a machine by its name.
    private var names: (String) -> String = { $0 }

    /// The steps' words as drawn, for a simulator pass's log, after where
    /// the column stands: its edge must not move from one stage to the next.
    var said: String {
        let frame = column.convert(column.bounds, to: self)
        return "column x \(Int(frame.minX)) w \(Int(frame.width)) · "
            + order.compactMap { rows[$0]?.said }.joined(separator: " | ") + (stopped.isHidden ? "" : " | \(stopped.text ?? "")")
    }

    /// Draws `job` as it stands; `names` says a machine by its name.
    func show(_ job: Job, names: @escaping (String) -> String) {
        let first = self.job == nil
        self.job = job
        self.names = names
        let compact = traitCollection.horizontalSizeClass == .compact
        cawSide.constant = compact ? 96 : 128
        if compactLayout.first?.isActive != compact {
            NSLayoutConstraint.deactivate(compact ? regularLayout : compactLayout)
            NSLayoutConstraint.activate(compact ? compactLayout : regularLayout)
        }
        give.isHidden = !compact
        if first {
            // The Real Wait Rule: a move older than the grace is no fresh wait.
            graceOver = job.created.map { Date.now.timeIntervalSince($0) >= Motion.durWaitGrace } ?? false
            if !graceOver {
                grace = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(Motion.durWaitGrace))
                    guard let self, !Task.isCancelled else { return }
                    graceOver = true
                    if let job = self.job { show(job, names: self.names) }
                }
            }
        }
        let asking = job.stage == .approval && job.askId != nil
        let failed = job.stage == .failed
        let waiting = Self.working.contains(job.stage) && !asking
        placeCaw(wanted: graceOver && (waiting || failed), status: failed ? .needsYou : .loading)
        let words = Words(job: job, source: names(job.sourceMachineId), target: names(job.targetMachineId))
        // Every step in order until the session starts; then the ready line alone.
        let steps = job.steps.filter { job.stage != .started || $0 == .start }
        if steps != order {
            column.arrangedSubviews.forEach { $0.removeFromSuperview() }
            rows = [:]
            for step in steps {
                let row = StepRow()
                rows[step] = row
                column.addArrangedSubview(row)
            }
            order = steps
        }
        for (index, step) in steps.enumerated() {
            let phase = Self.phase(of: step, in: job)
            rows[step]?.show(phase: phase, label: words.label(step, phase), last: index == steps.count - 1,
                             details: details(for: step, phase: phase, job: job))
        }
        let shown = asking || job.stage == .cancelled || graceOver
        column.alpha = shown ? 1 : 0
        stopped.isHidden = job.stage != .cancelled
        stopped.text = (["Stopped.", job.kept].compactMap(\.self)).joined(separator: " ")
        showFoot(job, shown: shown, compact: compact)
    }

    /// Caw over the wait, once it is past its grace, and over a failure.
    private func placeCaw(wanted: Bool, status: CawStatus) {
        if wanted, caw == nil {
            let made = CawView(status: status)
            made.translatesAutoresizingMaskIntoConstraints = false
            cawSlot.addSubview(made)
            NSLayoutConstraint.activate([
                made.topAnchor.constraint(equalTo: cawSlot.topAnchor),
                made.bottomAnchor.constraint(equalTo: cawSlot.bottomAnchor),
                made.leadingAnchor.constraint(equalTo: cawSlot.leadingAnchor),
                made.trailingAnchor.constraint(equalTo: cawSlot.trailingAnchor),
            ])
            made.onGone = { [weak self, weak made] in
                made?.removeFromSuperview()
                if self?.caw === made { self?.caw = nil }
            }
            caw = made
        }
        if let caw {
            if wanted, caw.status != status { caw.status = status }
            caw.present = wanted
        }
        cawSlot.isHidden = !wanted && caw == nil
    }

    /// Cancel and Close are one control in one place: bordered, its edge on
    /// the glyph column, the foot's whole width on a phone (design 2g).
    private func showFoot(_ job: Job, shown: Bool, compact: Bool) {
        foot.arrangedSubviews.forEach { $0.removeFromSuperview() }
        foot.isHidden = !shown
        // A Cancel the hub can still act on: not once the session is starting.
        let cancellable = Self.working.contains(job.stage) && job.stage != .start && job.askId == nil
        if cancellable {
            let cancel = NsButton("Cancel", height: compact ? 44 : nil) { [weak self] in self?.onCancel() }
            foot.addArrangedSubview(cancel)
            if !compact { foot.addArrangedSubview(UIView()) }
        } else if job.stage == .cancelled {
            let close = NsButton("Close", height: compact ? 44 : nil) { [weak self] in self?.onClose() }
            foot.addArrangedSubview(close)
            if !compact { foot.addArrangedSubview(UIView()) }
        }
        foot.distribution = compact ? .fillEqually : .fill
    }

    private static let working: Set<Components.Schemas.MoveStage> = [.approval, .snapshot, .clone, .lfs, .install, .start]

    private static func phase(of step: Step, in job: Job) -> Phase {
        if job.stage == .started { return .done }
        // The step it stands at: failed at, stopped at, or working in.
        let raw: String? = switch job.stage {
        case .failed: job.error?.stage.rawValue
        case .cancelled: job.stoppedAt?.rawValue
        default: job.stage.rawValue
        }
        let at = raw.flatMap(Step.init(rawValue:))
        let here = at.flatMap { job.steps.firstIndex(of: $0) } ?? 0
        let index = job.steps.firstIndex(of: step) ?? 0
        if index != here { return index < here ? .done : .ahead }
        switch job.stage {
        case .failed: return .failed
        case .cancelled: return .stopped
        default: return step == .approval && job.askId != nil ? .asking : .active
        }
    }

    // MARK: Under a step

    private func details(for step: Step, phase: Phase, job: Job) -> [UIView] {
        var views: [UIView] = []
        if step == .snapshot, phase != .ahead, let branch = job.snapshot?.branch, !branch.isEmpty {
            views.append(Self.mono(branch))
        }
        if (step == .clone || step == .lfs), phase == .active, let progress = job.progress {
            views.append(Self.bytes(progress.bytes, of: progress.total))
        }
        if step == .lfs, phase == .active, let file = job.lfsFile, (job.lfs?.files ?? 0) > 1 {
            views.append(Self.file(file))
        }
        if step == .install, phase == .active || phase == .failed, let command = job.install?.command {
            views.append(Self.mono(command))
        }
        if phase == .asking, let ask = job.ask {
            views.append(card(ask))
        }
        if phase == .failed, let error = job.error {
            views.append(failure(error, label: Words(job: job, source: "", target: "").failedLabel(step)))
        }
        return views
    }

    private static func mono(_ text: String) -> UIView {
        let label = KitLabel(TypeScale.typeCode, ink: Palette.inkMuted, lines: 0)
        label.text = text
        return label
    }

    private static func share(_ bytes: Double, _ total: Double) -> Double {
        total > 0 ? min(100, (bytes / total * 100).rounded(.down)) : 0
    }

    /// "140 of 340 MB", or "640 MB of 2.1 GB" across units.
    static func partWords(_ bytes: Double, of total: Double) -> String {
        let done = moveSize(bytes)
        let whole = moveSize(total)
        let doneParts = done.split(separator: " ")
        return doneParts.last == whole.split(separator: " ").last ? "\(doneParts[0]) of \(whole)" : "\(done) of \(whole)"
    }

    /// The bar (`brand-solid` on `surface-recess-deep`) and "42% · 140 of 340 MB".
    private static func bytes(_ bytes: Double, of total: Double) -> UIView {
        let percent = share(bytes, total)
        let bar = MoveBar(share: percent / 100)
        let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        meta.tabular = true
        meta.text = "\(Int(percent))% · \(partWords(bytes, of: total))"
        let stack = UIStackView(arrangedSubviews: [bar, meta])
        stack.axis = .vertical
        stack.spacing = Space.space1
        return stack
    }

    /// The large file in flight, when it is one of several: its path cut from the start, its own bar.
    private static func file(_ file: Components.Schemas.MoveJob.LfsFilePayload) -> UIView {
        let path = KitLabel(TypeScale.typeCode, ink: Palette.inkMuted)
        path.lineBreakMode = .byTruncatingHead
        path.text = file.file
        let bar = MoveBar(share: share(file.bytes, file.total) / 100)
        bar.widthAnchor.constraint(equalToConstant: 72).isActive = true
        let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        meta.tabular = true
        meta.text = partWords(file.bytes, of: file.total)
        meta.setContentCompressionResistancePriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [path, bar, meta])
        row.spacing = Space.space2
        row.alignment = .center
        return row
    }

    /// The approval: the permission card's recipe, standing in its step.
    private func card(_ ask: Components.Schemas.MoveAsk) -> UIView {
        let card = UIView()
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        card.boxShadow = Shadow.shadowStat
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        title.text = ask.title
        let words = MoveAskView(ask)
        // The permission card's own buttons: the no at the start, its cross
        // muted; the yes, the action, coral as in New session's step 2.
        let dontMove = PromptCardView.button("Don't move", glyph: .close, kind: .refuse) { [weak self] in self?.onAnswer(false) }
        let moveIt = PromptCardView.button("Move it", glyph: .tick, kind: .primary) { [weak self] in self?.onAnswer(true) }
        let answers = UIStackView(arrangedSubviews: [dontMove, UIView(), moveIt])
        answers.spacing = Space.space8
        answers.alignment = .center
        let inner = UIStackView(arrangedSubviews: [title, words, answers])
        inner.axis = .vertical
        inner.spacing = Space.space3
        inner.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(inner)
        NSLayoutConstraint.activate([
            inner.topAnchor.constraint(equalTo: card.topAnchor, constant: 11),
            inner.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -11),
            inner.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 11),
            inner.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -11),
        ])
        return card
    }

    /// The failed step's Alert, as the web's: the machine's words, the tool's
    /// own last line in mono, and Cancel and Retry, all inside the tint.
    private func failure(_ error: Components.Schemas.MoveError, label: String) -> UIView {
        var under: [UIView] = []
        if let detail = error.detail, !detail.isEmpty {
            let line = KitLabel(TypeScale.typeCode, ink: Palette.statusFailInk, lines: 0)
            line.lineBreakMode = .byCharWrapping
            line.text = detail
            under.append(line)
        }
        if error.stage == .clone {
            let note = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
            note.text = "The partial clone is removed first."
            under.append(note)
        }
        let cancel = NsButton("Cancel", size: .sm) { [weak self] in self?.onCancel() }
        let retry = NsButton("Retry", size: .sm) { [weak self] in self?.onRetry() }
        let actions = UIStackView(arrangedSubviews: [UIView(), cancel, retry])
        actions.spacing = Space.space2
        under.append(actions)
        // The machine's words, unless they only repeat the step's.
        return KitAlert(error.message == label ? "" : error.message, tone: .destructive, glyph: .failed, under: under)
    }
}

// MARK: Words

/// What each step says (move/MoveWait.svelte `running`, `finished`, `labelOf`).
private struct Words {
    let job: Components.Schemas.MoveJob
    let source: String
    let target: String

    private var big: [Components.Schemas.MoveLargeFile] { job.ask?.bigFiles ?? [] }

    private func plural(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }

    func running(_ step: Components.Schemas.MoveStep) -> String {
        switch step {
        case .approval: job.ask?.gitInit == true ? "Initialising the repository" : "Moving \(plural(big.count, "file")) to large files"
        case .snapshot: "Snapshotting your work on \(source)"
        case .clone: job.fromHub ? "Cloning from the hub" : "Fetching from \(job.sourceName)"
        case .lfs: "Downloading large files"
        case .install: "Installing dependencies"
        case .start: "Starting the session on \(target)"
        }
    }

    func finished(_ step: Components.Schemas.MoveStep) -> String {
        switch step {
        case .approval:
            if job.ask?.gitInit == true {
                return "Initialised · 1 commit" + (big.isEmpty ? "" : " · \(plural(big.count, "large file"))")
            }
            return "Moved \(plural(big.count, "file")) to large files · \(moveSize(big.reduce(0) { $0 + $1.bytes }))"
        case .snapshot:
            if let files = job.snapshot?.files, files > 0 {
                return "Snapshot of your work on \(source) · \(plural(Int(files), "file"))"
            }
            return "Snapshot of your work on \(source)"
        case .clone:
            // A folder that was no repository had no history to size.
            let size = job.bytes > 0 && job.ask?.gitInit != true ? " · \(moveSize(job.bytes))" : ""
            return (job.fromHub ? "Cloned" : "Fetched") + size
        case .lfs:
            guard let lfs = job.lfs else { return "Large files" }
            return "Large files · \(moveSize(lfs.bytes)) · \(plural(Int(lfs.files), "file"))"
        case .install:
            return "Dependencies installed"
        case .start:
            guard let moved = job.moved else { return "Ready on \(target)" }
            // A branch breaks before it, never at its slashes: "cawco/move/gearbox" is one word.
            return [moved, job.stayed].compactMap(\.self).joined(separator: " · ")
                .replacingOccurrences(of: "/", with: "/\u{2060}")
        }
    }

    func failedLabel(_ step: Components.Schemas.MoveStep) -> String {
        step == .start ? "Ready on \(target), but the session didn't start" : "\(running(step)) failed"
    }

    func label(_ step: Components.Schemas.MoveStep, _ phase: MoveWaitView.Phase) -> String {
        switch phase {
        case .done: return finished(step)
        case .ahead:
            if step == .start { return "Ready on \(target)" }
            if step == .lfs, let lfs = job.lfs { return "Downloading large files · \(moveSize(lfs.bytes))" }
            return running(step)
        case .failed: return failedLabel(step)
        case .stopped: return "\(running(step)), stopped"
        case .asking:
            return job.ask?.gitInit == true
                ? "\(job.projectName) isn't a git repository yet"
                : "\(job.projectName) has \(plural(big.count, "big file")) to send separately"
        case .active: return running(step)
        }
    }
}

// MARK: One step

/// One step of the column (the thinking-steps recipe): its glyph in a 16pt
/// cell with the hairline connector under it, its label, and what stands
/// under the label. The glyph cross-fades when the step's phase changes.
private final class StepRow: UIView {
    private let cell = UIView()
    private let connector = UIView()
    private let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
    private let under = UIStackView()
    private var phase: MoveWaitView.Phase?

    /// The step as drawn: its phase and its words, and how many things stand under it.
    var said: String { "\(phase.map { "\($0)" } ?? "-") \(label.text ?? "")\(under.arrangedSubviews.isEmpty ? "" : " +\(under.arrangedSubviews.count)")" }

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        cell.translatesAutoresizingMaskIntoConstraints = false
        connector.translatesAutoresizingMaskIntoConstraints = false
        connector.backgroundColor = Palette.borderHairline
        label.wrap = .pretty
        under.axis = .vertical
        under.spacing = Space.space1
        let copy = UIStackView(arrangedSubviews: [label, under])
        copy.axis = .vertical
        copy.spacing = Space.space1
        copy.translatesAutoresizingMaskIntoConstraints = false
        addSubview(cell)
        addSubview(connector)
        addSubview(copy)
        NSLayoutConstraint.activate([
            cell.topAnchor.constraint(equalTo: topAnchor, constant: 2),
            cell.leadingAnchor.constraint(equalTo: leadingAnchor),
            cell.widthAnchor.constraint(equalToConstant: 16),
            cell.heightAnchor.constraint(equalToConstant: 16),
            connector.topAnchor.constraint(equalTo: cell.bottomAnchor, constant: 2),
            connector.bottomAnchor.constraint(equalTo: bottomAnchor),
            connector.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
            connector.widthAnchor.constraint(equalToConstant: 1),
            copy.topAnchor.constraint(equalTo: topAnchor),
            copy.leadingAnchor.constraint(equalTo: cell.trailingAnchor, constant: Space.space2),
            copy.trailingAnchor.constraint(equalTo: trailingAnchor),
            copy.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("StepRow is built in code") }

    func show(phase next: MoveWaitView.Phase, label text: String, last: Bool, details: [UIView]) {
        label.text = text
        label.ink = next == .ahead ? Palette.inkMuted : Palette.inkStrong
        connector.isHidden = last
        under.arrangedSubviews.forEach { $0.removeFromSuperview() }
        details.forEach { under.addArrangedSubview($0) }
        under.isHidden = details.isEmpty
        guard next != phase else { return }
        phase = next
        let glyph: UIView = switch next {
        case .done: GlyphView(.passed, size: 16, tint: Palette.statusDoneGlyph)
        case .active: KitSpinner(side: 16, tint: Palette.inkStrong)
        case .ahead: Self.dot()
        case .failed: GlyphView(.failed, size: 16, tint: Palette.statusFailGlyph)
        case .stopped: GlyphView(.stop, size: 16, tint: Palette.inkMuted)
        case .asking: GlyphView(.attention, size: 16, tint: Palette.statusAttnGlyph)
        }
        let old = cell.subviews
        glyph.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(glyph)
        NSLayoutConstraint.activate([
            glyph.centerXAnchor.constraint(equalTo: cell.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        guard window != nil, !UIAccessibility.isReduceMotionEnabled, !old.isEmpty else {
            old.forEach { $0.removeFromSuperview() }
            return
        }
        glyph.alpha = 0
        let fade = Motion.easeOut.animator(Motion.durControl) {
            glyph.alpha = 1
            old.forEach { $0.alpha = 0 }
        }
        fade.addCompletion { _ in old.forEach { $0.removeFromSuperview() } }
        fade.startAnimation()
    }

    /// A step still to come: a muted dot.
    private static func dot() -> UIView {
        let dot = UIView()
        dot.backgroundColor = Palette.inkSubtle
        dot.layer.cornerRadius = 2
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 4), dot.heightAnchor.constraint(equalToConstant: 4)])
        return dot
    }
}

/// The move's progress bar: `brand-solid` on `surface-recess-deep`, 6pt, round.
private final class MoveBar: UIView {
    private let fill = UIView()
    private let share: Double

    init(share: Double) {
        self.share = max(0, min(1, share))
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRecessDeep
        layer.cornerRadius = 3
        clipsToBounds = true
        fill.backgroundColor = Palette.brandSolid
        addSubview(fill)
        heightAnchor.constraint(equalToConstant: 6).isActive = true
        isAccessibilityElement = true
        accessibilityTraits = .updatesFrequently
        accessibilityValue = "\(Int(self.share * 100)) percent"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("MoveBar is built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        fill.frame = CGRect(x: 0, y: 0, width: bounds.width * share, height: bounds.height)
    }
}

private extension NSLayoutConstraint {
    func withPriority(_ priority: UILayoutPriority) -> NSLayoutConstraint {
        self.priority = priority
        return self
    }
}
