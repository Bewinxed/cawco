import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Forget a project (ForgetProjectDialog.svelte over StopTray.svelte): one
/// dialog that changes shape as the forget goes, never a second one. It
/// grows out of whatever asked for it, the project head's ⋯ or a folder's
/// menu, and first reads what of the project runs.
///
/// With nothing running it is the plain question: Forget, the delete, gone.
/// With sessions running it names each one where the decision is made,
/// nested as the rail nests them (a lead, then its delegates), and asks twice
/// on one button: "Stop 3 and forget", then "Stop 3 mid-turn and forget".
/// A row turns Stopped only when the hub says its machine confirmed the end
/// (`project.stop`), never at the ask, and folds away; a session whose
/// machine is away says "Stops when <machine> is back", and counts once the
/// hub has recorded its stop. The delete runs once every row is counted
/// ("Forgetting…", "Forgotten"). The hub refuses the delete while anything
/// of the project runs, so a failure keeps the project: the row or the line
/// says why, and Try again stops what is left.
final class ForgetProjectDialog: KitDialogController {
    private enum Phase { case reading, unread, none, list, armed, stopping, fail, ending, done }

    private enum State { case running, away, stopping, stopped, failed }

    private final class Row {
        let session: RunningSession
        var state: State
        /// Its machine is away and the hub has recorded its stop for its return.
        var owed = false
        var error: String?
        /// Counted toward the forget: stopped, or owed.
        var counted = false
        let view = ForgetRowView()

        init(_ session: RunningSession) {
            self.session = session
            state = session.offline ? .away : .running
        }
    }

    private let project: ProjectRow
    private let hub: HubConnection
    private let home: HomeModel
    private let forgotten: () -> Void
    private var phase = Phase.reading
    private var rows: [Row] = []
    /// How many were listed when the stop was pressed.
    private var total = 0
    private var refusal: String?
    /// The press that armed it is still settling: no second press carries through.
    private var inert = false
    private var pressedAt = Date.now
    private var unhear: (() -> Void)?
    private var ticker: Timer?
    /// Work for a dialog that has since closed touches nothing.
    private var generation = 0

    private let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.foreground, lines: 0)
    private let line = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground, lines: 0)
    private let list = UIStackView()
    private var confirm: UIButton!
    private var cancel: UIButton!

    init(project: ProjectRow, hub: HubConnection, home: HomeModel, forgotten: @escaping () -> Void) {
        self.project = project
        self.hub = hub
        self.home = home
        self.forgotten = forgotten
        super.init(width: .md, closable: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ForgetProjectDialog is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        titleLabel.text = "Forget \(project.name)?"
        titleLabel.accessibilityTraits = .header
        line.wrap = .pretty
        let header = UIStackView(arrangedSubviews: [titleLabel, line])
        header.axis = .vertical
        header.spacing = 6
        list.axis = .vertical
        list.spacing = Space.space1
        confirm = UIButton(configuration: Self.destructive("Forget"), primaryAction: UIAction { [weak self] _ in self?.press() })
        confirm.houseStyle()
        confirm.translatesAutoresizingMaskIntoConstraints = false
        confirm.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnH).isActive = true
        cancel = KitButton.make("Cancel", variant: .outline) { [weak self] in self?.leave() }
        body.addArrangedSubview(header)
        body.addArrangedSubview(list)
        body.addArrangedSubview(KitDialogController.footer([cancel, confirm]))
        render()
        read()
    }

    override func requestClose() {
        guard phase != .ending else { return }
        leave()
    }

    // MARK: Reading what runs

    private func read() {
        phase = .reading
        render()
        let mine = generation
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let sessions = try await ProjectStops(hub: hub, projectId: project.id).running()
                guard mine == generation else { return }
                rows = sessions.map(Row.init)
                phase = rows.isEmpty ? .none : .list
                refusal = nil
            } catch {
                guard mine == generation else { return }
                refusal = error.localizedDescription
                phase = .unread
            }
            morph { self.render() }
        }
    }

    // MARK: The two presses

    private func press() {
        guard !inert else { return }
        switch phase {
        case .list:
            phase = .armed
            // A double tap never carries through the morph into the stop.
            inert = true
            DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durPanel) { [weak self] in self?.inert = false }
            morph { render() }
        case .armed:
            total = rows.count
            stop(rows.map(\.session.id))
        case .fail:
            retry()
        case .none:
            finish()
        case .unread:
            read()
        case .reading, .stopping, .ending, .done:
            break
        }
    }

    /// Stops `ids` in one request; each row turns as the hub reports it.
    private func stop(_ ids: [String]) {
        phase = .stopping
        refusal = nil
        pressedAt = .now
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.renderRows() }
        }
        for row in rows where ids.contains(row.session.id) && row.state != .away {
            row.state = .stopping
            row.error = nil
        }
        if unhear == nil {
            unhear = hub.onProjectStop { [weak self] frame in
                guard let self, frame.projectId == project.id else { return }
                heard(frame.instanceId, frame.outcome, frame.error)
            }
        }
        morph { render() }
        let mine = generation
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await ProjectStops(hub: hub, projectId: project.id).stop(ids)
            } catch {
                guard mine == generation else { return }
                for id in ids { heard(id, .failed, error.localizedDescription) }
            }
        }
    }

    /// The failed rows again; a refused delete reads what still runs and stops it.
    private func retry() {
        let failed = rows.filter { $0.state == .failed }.map(\.session.id)
        if !failed.isEmpty {
            stop(failed)
            return
        }
        let mine = generation
        Task { @MainActor [weak self] in
            guard let self else { return }
            let again: [RunningSession]
            do {
                again = try await ProjectStops(hub: hub, projectId: project.id).running()
            } catch {
                guard mine == generation else { return }
                refusal = error.localizedDescription
                morph { self.render() }
                return
            }
            guard mine == generation else { return }
            let known = Set(rows.map(\.session.id))
            let fresh = again.filter { !known.contains($0.id) }
            rows += fresh.map(Row.init)
            guard !again.isEmpty else {
                finish()
                return
            }
            total += fresh.count
            stop(again.map(\.id))
        }
    }

    // MARK: Each stop, as the hub reports it

    private func heard(_ id: String, _ outcome: OpenEnums.ProjectStopFrameOutcome, _ error: String?) {
        guard let row = rows.first(where: { $0.session.id == id }), row.state != .stopped else { return }
        switch outcome {
        case .deferred:
            // Its machine is away: the stop is recorded for its return. Counted now; it stays.
            row.state = .away
            row.owed = true
            row.error = nil
            row.counted = true
        case .failed:
            guard row.state == .stopping else { return }
            row.state = .failed
            row.error = error
        case .stopped:
            row.state = .stopped
            row.error = nil
            row.counted = true
        case .unrecognized:
            return
        }
        if phase == .stopping, !rows.contains(where: { $0.state == .stopping }), rows.contains(where: { $0.state == .failed }) {
            phase = .fail
        }
        morph { render() }
        // A stopped row's word turns first; then it folds away, a lead after its delegates.
        if outcome == .stopped {
            DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durFade) { [weak self] in self?.foldStopped() }
        }
        if rows.allSatisfy(\.counted) {
            DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durControl) { [weak self] in self?.finish() }
        }
    }

    private func foldStopped() {
        morph {
            for row in rows where row.state == .stopped {
                let delegatesLeft = rows.contains { $0.session.parentId == row.session.id && $0.state != .stopped }
                if !delegatesLeft {
                    row.view.alpha = 0
                    row.view.isHidden = true
                }
            }
        }
    }

    // MARK: The end

    private func finish() {
        guard phase != .ending, phase != .done else { return }
        ticker?.invalidate()
        phase = .ending
        holdsOpen = true
        morph { render() }
        let mine = generation
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await hub.deleteProject(id: project.id)
            } catch {
                guard mine == generation else { return }
                holdsOpen = false
                refusal = error.localizedDescription
                phase = rows.isEmpty ? .none : .fail
                morph { self.render() }
                UIAccessibility.post(notification: .announcement, argument: refusal)
                return
            }
            guard mine == generation else { return }
            phase = .done
            holdsOpen = false
            morph { self.render() }
            forgotten()
            if rows.isEmpty {
                close()
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durHold) { [weak self] in self?.close() }
            }
        }
    }

    /// Closes the dialog; a sweep left part-way says what it left.
    private func leave() {
        if phase == .stopping || phase == .fail {
            let stopped = rows.filter { $0.state == .stopped }.count
            Toast.show("Stopped \(stopped) of \(total); \(project.name) kept.", in: presentingViewController?.view)
        }
        close()
    }

    private func close() {
        generation += 1
        ticker?.invalidate()
        ticker = nil
        unhear?()
        unhear = nil
        dismiss(animated: true)
    }

    // MARK: What it says

    private func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? one : many }

    /// What the stops did: "Stopped 2 sessions. 1 stops when obelisk is back."
    private var doneLine: String {
        let stopped = rows.filter { $0.state == .stopped }.count
        let ended = "Stopped \(stopped) \(plural(stopped, "session", "sessions"))."
        let away = rows.filter { $0.state == .away }
        guard !away.isEmpty else { return ended }
        let machines = Array(Set(away.map { hub.fleet.machineName($0.session.machineId) }))
        let back = machines.count == 1 ? "when \(machines[0]) is back" : "when their machines are back"
        let later = "\(away.count) \(plural(away.count, "stops", "stop")) \(back)."
        return stopped > 0 ? "\(ended) \(later)" : later
    }

    private func render() {
        let n = phase == .list ? rows.count : total
        switch phase {
        case .reading:
            line.text = "Reading what runs in \(project.name)…"
        case .unread, .fail where refusal != nil:
            line.text = refusal
        case .none:
            line.text = refusal ?? "The grouping is removed. The checkout and its sessions stay on disk."
        case .list:
            line.text = "\(n) running \(plural(n, "session stops", "sessions stop")) first. The checkout and its sessions stay on disk."
        case .armed, .stopping:
            line.text = "Transcripts and the checkout stay on disk."
        case .fail:
            line.text = "\(project.name) is kept until every session is stopped."
        case .ending, .done:
            line.text = rows.isEmpty ? "The grouping is removed. The checkout and its sessions stay on disk." : doneLine
        }
        line.ink = (phase == .unread || refusal != nil) && phase != .ending && phase != .done ? Palette.statusFailInk : Palette.mutedForeground

        let left = total - rows.filter { $0.state == .stopped || ($0.owed && $0.state == .away) }.count
        let (label, pending): (String, Bool) = switch phase {
        case .reading: ("Forget", false)
        case .unread, .fail: ("Try again", false)
        case .none: ("Forget", false)
        case .list: ("Stop \(n) and forget", false)
        case .armed: ("Stop \(n) mid-turn and forget", false)
        case .stopping: ("Stopping \(max(left, 1))…", true)
        case .ending: ("Forgetting…", true)
        case .done: ("Forgotten", false)
        }
        confirm.configuration = Self.destructive(label, pending: pending, done: phase == .done)
        confirm.isEnabled = phase != .reading && !pending && phase != .done
        confirm.accessibilityLabel = label
        let cancelWord = phase == .stopping ? "Stop waiting" : ([.fail, .ending, .done, .unread].contains(phase) ? "Close" : "Cancel")
        KitButton.setTitle(cancelWord, of: cancel, variant: .outline, height: .standard)
        cancel.isEnabled = phase != .ending
        renderRows()
    }

    private func renderRows() {
        if phase == .reading {
            if list.arrangedSubviews.isEmpty {
                for _ in 0 ..< 2 { list.addArrangedSubview(SkeletonView(height: Size.cBtnHSm)) }
            }
            return
        }
        if list.arrangedSubviews.contains(where: { $0 is SkeletonView }) {
            list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        }
        let depth = Dictionary(uniqueKeysWithValues: rows.map { ($0.session.id, $0.session.parentId) })
        func level(_ id: String) -> Int {
            var at = 0, next = depth[id] ?? nil
            while let parent = next, at < 8 { at += 1; next = depth[parent] ?? nil }
            return at
        }
        let waited = Int(Date.now.timeIntervalSince(pressedAt))
        for row in rows {
            if row.view.superview == nil { list.addArrangedSubview(row.view) }
            let fleetRow = hub.fleet.byId[row.session.id]
            let title = row.session.title ?? fleetRow?.title ?? "untitled session"
            let status: (word: String, glyph: Glyph?, tint: UIColor) = switch row.state {
            case .stopping: ("Stopping…", nil, Palette.inkMuted)
            case .stopped: ("Stopped", .pause, Palette.inkMuted)
            case .failed: ("Couldn't stop", .failed, Palette.statusFailInk)
            case .away: ("Stops when \(hub.fleet.machineName(row.session.machineId)) is back", .away, Palette.inkMuted)
            case .running:
                switch home.activity(row.session.id) {
                case .blocked: ("Needs you", .attention, Palette.statusAttnGlyph)
                case .working: ("Working", .working, Palette.statusLiveGlyph)
                case .idle: ("Idle", .pause, Palette.inkMuted)
                }
            }
            row.view.configure(id: row.session.id, cwd: row.session.cwd, title: title, level: level(row.session.id),
                               mark: HomeViewController.status(fleetRow, home: home), word: status.word, glyph: status.glyph,
                               tint: status.tint, trail: row.state == .stopping && waited >= 5 ? "\(waited)s" : "",
                               error: row.state == .failed ? row.error : nil)
        }
    }

    /// The destructive confirm (button.svelte `destructive`): the error edge and ink on no fill.
    private static func destructive(_ title: String, pending: Bool = false, done: Bool = false) -> UIButton.Configuration {
        var config = UIButton.Configuration.plain()
        config.attributedTitle = AttributedString(title, attributes: TypeScale.typeButton.container(color: Palette.error11, tracking: -0.01))
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
        config.background.cornerRadius = Radius.radiusMd
        config.background.backgroundColor = .clear
        config.background.strokeColor = Palette.error9
        config.background.strokeWidth = 1
        config.imagePadding = 8
        config.showsActivityIndicator = pending
        config.activityIndicatorColorTransformer = UIConfigurationColorTransformer { _ in Palette.error11 }
        if done {
            config.image = Glyph.check.image.resized(to: Size.iconMd)
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.error11 }
        }
        return config
    }
}

/// One running session in Forget's list: its mark, its title, and what it is
/// doing before and through its stop; under it, why it could not be stopped.
private final class ForgetRowView: UIView {
    private let mark = SessionMarkView(tile: 20)
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.foreground)
    private let glyph = GlyphView(.pause, size: Size.iconSm, tint: Palette.inkMuted)
    private let spinner = KitSpinner(side: Size.iconSm)
    private let word = MorphLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let trail = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
    private let error = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var indent: NSLayoutConstraint!

    init() {
        super.init(frame: .zero)
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        trail.tabular = true
        let stat = UIStackView(arrangedSubviews: [glyph, spinner, word])
        stat.spacing = Space.space1
        stat.alignment = .center
        stat.setContentCompressionResistancePriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [mark, title, UIView(), stat, trail])
        line.spacing = Space.space2
        line.alignment = .center
        line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        error.isHidden = true
        let rows = UIStackView(arrangedSubviews: [line, error])
        rows.axis = .vertical
        rows.spacing = 2
        rows.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rows)
        indent = rows.leadingAnchor.constraint(equalTo: leadingAnchor)
        NSLayoutConstraint.activate([
            indent,
            rows.topAnchor.constraint(equalTo: topAnchor),
            rows.bottomAnchor.constraint(equalTo: bottomAnchor),
            rows.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ForgetRowView is built in code")
    }

    func configure(id: String, cwd: String, title text: String, level: Int, mark status: MarkStatus, word said: String,
                   glyph shown: Glyph?, tint: UIColor, trail waited: String, error why: String?) {
        // `kit-nest`: a delegate stands in from its lead.
        indent.constant = Double(level) * Space.space5
        mark.configure(id: id, place: cwd, status: status)
        title.text = text
        glyph.isHidden = shown == nil
        spinner.isHidden = shown != nil
        if let shown { glyph.glyph = shown }
        glyph.tintColor = tint
        word.text = said
        trail.text = waited
        trail.isHidden = waited.isEmpty
        error.text = why
        error.isHidden = why == nil
        accessibilityLabel = [said, text, why].compactMap(\.self).joined(separator: ", ")
    }
}
