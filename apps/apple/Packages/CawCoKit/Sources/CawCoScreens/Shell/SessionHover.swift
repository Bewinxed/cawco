import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

/// The rail's session card (SessionHover.svelte): resting the pointer on a
/// session row (Working, Finished, a project's sessions) opens the house
/// hover panel beside the rail, level with the row, with what the row cannot
/// show: the session's live tail, and the question it is waiting on or why
/// it failed. Moving to the next row glides the one card there.
///
/// Rows opt in by adopting `HoverSessionRow`. The tray's timings: it opens
/// after a 350ms rest, and closes 300ms after the pointer leaves both the
/// row and the card, so crossing the 4pt gap to the card keeps it. A pointer
/// only; touch has no hover.
@MainActor
final class SessionHover: NSObject {
    private let hub: HubConnection
    private let home: HomeModel
    private weak var rail: UIView?
    private let host: () -> UIView?
    private let panel = HoverPanel(side: .right)
    private var openId: String?
    private var dwell: Task<Void, Never>?
    private var closing: Task<Void, Never>?
    /// The session whose tail is being followed, and the ones let go, each kept 2s more.
    private var watched: String?
    private var releases: [String: Task<Void, Never>] = [:]

    private static let openAfter = 0.35
    private static let closeAfter = 0.3

    /// `rail`: the view whose session rows open the card; `host`: the view it stands in.
    init(hub: HubConnection, home: HomeModel, rail: UIView, host: @escaping () -> UIView?) {
        self.hub = hub
        self.home = home
        self.rail = rail
        self.host = host
        super.init()
        panel.room = 360
        panel.onHold = { [weak self] in self?.hold() }
        panel.onRelease = { [weak self] in self?.release() }
        let hover = UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:)))
        hover.cancelsTouchesInView = false
        rail.addGestureRecognizer(hover)
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        guard let rail else { return }
        switch hover.state {
        case .began, .changed:
            over(row(at: hover.location(in: rail), in: rail))
        default:
            release()
        }
    }

    /// The session row under the pointer, if one is.
    private func row(at point: CGPoint, in rail: UIView) -> (any HoverSessionRow)? {
        var view = rail.hitTest(point, with: nil)
        while let here = view, here !== rail {
            if let row = here as? any HoverSessionRow, row.hoverSessionId != nil { return row }
            view = here.superview
        }
        return nil
    }

    private func over(_ row: (any HoverSessionRow)?) {
        guard let row, let id = row.hoverSessionId else {
            if openId != nil { release() } else { dwell?.cancel() }
            return
        }
        if id == openId {
            hold()
            return
        }
        guard id != pendingId else { return }
        // The row under the pointer starts reading its tail now, while the open
        // delay runs, so the card mostly opens (or glides) onto a tail already in.
        watch(tailId(of: id))
        dwell?.cancel()
        hold()
        if openId != nil {
            open(row, id)
        } else {
            pendingId = id
            dwell = Task { @MainActor [weak self, weak row] in
                try? await Task.sleep(for: .seconds(Self.openAfter))
                guard !Task.isCancelled, let self, let row else { return }
                pendingId = nil
                open(row, id)
            }
        }
    }

    /// The row whose open delay is running.
    private var pendingId: String?

    private func hold() {
        closing?.cancel()
    }

    private func release() {
        dwell?.cancel()
        pendingId = nil
        closing?.cancel()
        closing = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(Self.closeAfter))
            guard !Task.isCancelled else { return }
            self?.close()
        }
    }

    private func close() {
        dwell?.cancel()
        closing?.cancel()
        pendingId = nil
        openId = nil
        panel.hide()
        watch(nil)
    }

    private func open(_ row: any HoverSessionRow, _ id: String) {
        guard let host = host(), let rail, row.window != nil else { return }
        let box = row.convert(row.bounds, to: host)
        let edge = rail.convert(rail.bounds, to: host).maxX
        let place = HoverPanel.Place(
            x: (edge + 4).rounded(),
            y: min(max(8, box.minY), host.bounds.height - 160).rounded(),
            origin: (box.height / 2).rounded()
        )
        openId = id
        let tailed = tailId(of: id)
        let pending = tailed.flatMap { hub.sessions.transcripts[$0] }.map(\.loading) ?? false
        panel.show(id, content: card(id), at: place, in: host, pending: pending)
        if pending { settleWhenRead(tailed) }
    }

    /// The panel keeps its size until the tail it moved to has been read.
    private func settleWhenRead(_ id: String?) {
        guard let id else { return }
        withObservationTracking {
            _ = hub.sessions.transcripts[id]?.loading
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, self.openId != nil else { return }
                if self.hub.sessions.transcripts[id]?.loading == true { self.settleWhenRead(id) } else { self.panel.settle() }
            }
        }
    }

    // MARK: Watching

    /// The session whose tail a card draws: its own, or for a workflow run its running step's.
    private func tailId(of id: String) -> String? {
        guard let runId = BoardRun.runId(of: id) else { return id }
        return hub.workflowRuns.details[runId]?.run?.steps.first { $0.status == "running" && $0.instanceId != nil }?.instanceId
    }

    /// Follows `id`'s stream, and lets the last one go 2s later, so a pointer
    /// that wanders off and back does not drop the stream and fetch it again.
    private func watch(_ id: String?) {
        guard id != watched else { return }
        if let old = watched {
            releases[old] = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled, let self else { return }
                releases[old] = nil
                hub.sessions.unwatchDelegate(old)
            }
        }
        watched = id
        guard let id else { return }
        if let release = releases.removeValue(forKey: id) {
            release.cancel()
        } else {
            hub.sessions.watchDelegate(id)
        }
    }

    // MARK: The card

    private enum Tone { case live, needs, done, failed, idle }

    private func tone(_ id: String) -> Tone {
        let row = hub.fleet.byId[id]
        if row?.isFailed == true { return .failed }
        if hub.needs.blocked(id) || (BoardRun.runId(of: id) != nil && home.activity(id) == .blocked) { return .needs }
        if home.activity(id) == .working { return .live }
        return row?.status == .stopped ? .done : .idle
    }

    /// The row the tail ends on: the question waiting, or the failure.
    private func note(_ id: String, _ tone: Tone) -> TailNote? {
        switch tone {
        case .needs:
            return hub.needs.parked[id]?.first.map {
                let text = Self.detail($0)
                return TailNote(key: "ask:\(text)", kind: .ask, text: text)
            }
        case .failed:
            let why = hub.fleet.byId[id]?.lastError
            return TailNote(key: "fail", kind: .fail, text: why.flatMap { $0.isEmpty ? nil : $0 } ?? "It failed without saying why.")
        default:
            return nil
        }
    }

    /// present.ts `askDetailOf`: the questions, else the diff under its file,
    /// else the command, else the input as it came.
    private static func detail(_ ask: ParkedAsk) -> String {
        let questions = ask.questions
        if !questions.isEmpty {
            return questions.enumerated().map { index, question in
                (["Q\(index + 1): \(question.question)"] + question.options.map { "- \($0.label)" }).joined(separator: "\n")
            }.joined(separator: "\n")
        }
        let fields = Dictionary(ask.fields.map { ($0.key, $0.value) }, uniquingKeysWith: { first, _ in first })
        if let diff = fields["diff"] {
            let path = fields["filepath"] ?? fields["filePath"] ?? fields["path"]
            return (path.map { "\($0)\n\n" } ?? "") + diff
        }
        if let command = ask.command { return command }
        return ask.fields.map { "\($0.key): \($0.value)" }.joined(separator: "\n")
    }

    private func card(_ id: String) -> UIView {
        let row = hub.fleet.byId[id]
        let tone = tone(id)
        let mark = SessionMarkView(tile: 17)
        mark.configure(id: id, place: row.map { $0.cwd.isEmpty ? id : $0.cwd } ?? id, status: .idle)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = row.map(hub.fleet.title) ?? "Session"
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [mark, title, state(tone)])
        head.spacing = Space.space2
        head.alignment = .center
        head.widthAnchor.constraint(greaterThanOrEqualToConstant: 240).isActive = true
        let column = CardColumn(arrangedSubviews: [head])
        column.axis = .vertical
        column.spacing = Space.space2
        // The tail grows as its lines arrive: the panel follows it.
        column.onLayout = { [weak self] in self?.panel.contentChanged() }
        let tail = { [hub] (instanceId: String, note: TailNote?) -> UIView in
            let view = DelegateTailView(hub: hub, instanceId: instanceId)
            view.note = note
            return view
        }
        if let runId = BoardRun.runId(of: id) {
            // A run's card: its steps under it, then the live tail of the one running.
            if let run = hub.workflowRuns.details[runId]?.run {
                let steps = RunStepsView()
                steps.anchor = mark
                steps.configure(RunModel(run, name: title.text ?? "Workflow"), going: true, live: false, interactive: false) { _ in }
                column.addArrangedSubview(steps)
            }
            if let step = tailId(of: id) {
                column.addArrangedSubview(tail(step, nil))
            } else if tone == .failed {
                column.addArrangedSubview(tail("", note(id, tone)))
            }
        } else {
            column.addArrangedSubview(tail(id, note(id, tone)))
        }
        return column
    }

    /// The card's column: it says when what it holds changed size.
    private final class CardColumn: UIStackView {
        var onLayout: () -> Void = {}
        private var fitted = CGSize.zero

        override func layoutSubviews() {
            super.layoutSubviews()
            let fit = systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            guard fit != fitted else { return }
            let first = fitted == .zero
            fitted = fit
            if !first { DispatchQueue.main.async { [weak self] in self?.onLayout() } }
        }
    }

    /// What it is doing, as a 16pt glyph in its status's ink; working, the live dot.
    private func state(_ tone: Tone) -> UIView {
        let box = UIView()
        box.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([box.widthAnchor.constraint(equalToConstant: 16), box.heightAnchor.constraint(equalToConstant: 16)])
        box.isAccessibilityElement = true
        let inner: UIView?
        switch tone {
        case .live:
            let dot = UIView()
            dot.backgroundColor = Palette.statusLiveGlyph
            dot.layer.cornerRadius = 2.5
            dot.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 5), dot.heightAnchor.constraint(equalToConstant: 5)])
            inner = dot
            box.accessibilityLabel = "Working"
        case .needs:
            inner = GlyphView(.ask, size: 16, tint: Palette.statusAttnInk)
            box.accessibilityLabel = "Needs you"
        case .done:
            inner = GlyphView(.passed, size: 16, tint: Palette.statusDoneInk)
            box.accessibilityLabel = "Finished"
        case .failed:
            inner = GlyphView(.warning, size: 16, tint: Palette.statusFailInk)
            box.accessibilityLabel = "Failed"
        case .idle:
            inner = nil
            box.accessibilityLabel = "Idle"
        }
        if let inner {
            box.addSubview(inner)
            NSLayoutConstraint.activate([inner.centerXAnchor.constraint(equalTo: box.centerXAnchor), inner.centerYAnchor.constraint(equalTo: box.centerYAnchor)])
        }
        return box
    }
}
