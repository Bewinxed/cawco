import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoTranscript
import Observation
import OSLog
import UIKit

/// The delegate tray (DelegateTray.svelte): one compact chip per delegate
/// this session has working, in a row standing on the composer, so the reader
/// scrolled far from a delegate's card still sees what it is doing. A chip
/// enters the first time its card leaves the view (DelegateTrayState), shows
/// what the delegate is doing in words and one mark, opens the house hover
/// panel with the detail on hover or press, and leaves on its own once the
/// work is done. Failed work stays until it is dismissed, on every screen at
/// once.
///
/// It keeps the tray's one row (`cTrayRow`) from its first layout, chips or
/// none, with the chips standing on its foot: a chip arriving late fills room
/// already there.
@MainActor
final class DelegateTrayView: UIView {
    /// How long a finished chip stays on screen, counted only while it is seen.
    private static let hold = 6.0
    /// How long a new delegate's card has to come on screen before its chip simply appears.
    private static let settle = 1.5
    /// The seen time a finished chip holds its check before it may fly: the pulse, then a beat.
    private static let liftAfter = 1.0
    /// A chip's floor and the gap after it, for the overflow count; the "+N" chip and its gap.
    private static let chipFloor = 120.0
    private static let chipCeiling = 224.0
    private static let gap = Space.space2
    private static let more = 59.0
    private static let tick = 0.25

    enum Tone: String { case starting, running, asked, needs, done, cancelled, failed }

    struct Chip: Equatable {
        var item: WorkItem
        var tone: Tone
        var entry: DelegateTrayState.Entry
        /// The pending question: the delegate's own (needs you), or the one it put to this session.
        var question: String
        var questions: Int

        static func == (a: Chip, b: Chip) -> Bool {
            a.item.id == b.item.id && a.item.title == b.item.title && a.tone == b.tone && a.question == b.question
                && a.questions == b.questions && a.item.endedAt == b.item.endedAt
        }
    }

    private let hub: HubConnection
    private let state = DelegateTrayState.shared
    /// Opens a delegate in its own view.
    var onOpen: (String) -> Void = { _ in }
    /// The view the panel stands in: the composer's host, above the row.
    weak var panelHost: UIView?
    /// A swipe is carrying the conversation: the chips wait.
    var held = false {
        didSet { row.isUserInteractionEnabled = !held }
    }

    /// The session whose own delegates the tray shows.
    var parentId: String? {
        didSet {
            guard parentId != oldValue else { return }
            adopt()
        }
    }

    private let row = UIView()
    private var chipViews: [String: TrayChipView] = [:]
    private var order: [String] = []
    private var chips: [Chip] = []
    private var shown: [Chip] = []
    /// The chips that did not fit at the floor: they stand behind "+N".
    private var folded: [Chip] = []
    private var moreChip: TrayChipView?

    /// Delegates that existed before this tray: their chips are simply there.
    private var mountedAt = Date().timeIntervalSince1970 * 1000
    /// When the tray first heard of each item, and how long each finished chip has been on screen.
    private var known: [String: Double] = [:]
    private var shownFor: [String: Double] = [:]
    private var said: [String: Tone] = [:]
    private var politeQueue: [String] = []
    private var flush: Task<Void, Never>?
    private var beat: Timer?

    private let panel = HoverPanel(side: .above)
    private let ground = PanelGround()
    private var openKey: String?
    private var pinned = false
    private var hovering = false
    private var dwell: Task<Void, Never>?
    private var closing: Task<Void, Never>?
    private var coarse: Bool { traitCollection.userInterfaceIdiom != .mac }
    private var chipHeight: Double { coarse ? Size.cTrayChipCoarse : Size.cTrayChip }
    private var foot: Double { coarse ? Size.cTrayGapCoarse : Size.cTrayGap }

    init(hub: HubConnection) {
        self.hub = hub
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        row.alpha = 0
        panel.onHold = { [weak self] in self?.closing?.cancel() }
        panel.onRelease = { [weak self] in self?.rootLeft() }
        ground.onOutside = { [weak self] in self?.close() }
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        accessibilityLabel = "Delegates"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DelegateTrayView is built in code")
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: max(Size.cTrayRow, chipHeight + foot))
    }

    /// Only the chips take a touch: the row has no surface of its own.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self || hit === row ? nil : hit
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        beat?.invalidate()
        beat = nil
        guard window != nil else {
            close()
            return
        }
        beat = Timer.scheduledTimer(withTimeInterval: Self.tick, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.onBeat() }
        }
        take()
    }

    // MARK: The chips

    private func adopt() {
        close()
        mountedAt = Date().timeIntervalSince1970 * 1000
        known = [:]
        shownFor = [:]
        said = [:]
        chipViews.values.forEach { $0.removeFromSuperview() }
        chipViews = [:]
        moreChip?.removeFromSuperview()
        moreChip = nil
        order = []
        chips = []
        row.alpha = 0
        if let parentId { hub.workItems.load(parent: parentId) }
        take()
    }

    private var items: [WorkItem] { parentId.map { hub.workItems.of(parent: $0) } ?? [] }

    private func chip(_ item: WorkItem) -> Chip {
        let pending = hub.needs.parked[item.instanceId] ?? []
        let own = pending.filter { $0.routedTo == nil }
        let routed = pending.filter { $0.routedTo == "parent" }
        let tone: Tone = switch item.state {
        case .failed: .failed
        case .cancelled: .cancelled
        case .done: .done
        default: !own.isEmpty ? .needs : !routed.isEmpty ? .asked : item.state == .starting ? .starting : .running
        }
        let question = own.first.map(\.detail) ?? routed.first.map(\.short) ?? ""
        return Chip(item: item, tone: tone, entry: state.entered[item.instanceId] ?? .none, question: question, questions: own.count)
    }

    /// Reads the chips under observation and draws what changed; asks again when they move.
    private func take() {
        guard window != nil else { return }
        let next = withObservationTracking {
            items.filter { state.entered[$0.instanceId] != nil && !state.left.contains($0.id) && $0.dismissedAt == nil }.map(chip)
        } onChange: { [weak self] in
            Task { @MainActor in self?.take() }
        }
        guard next != chips || chipViews.isEmpty != next.isEmpty else { return }
        chips = next
        announce()
        setNeedsLayout()
    }

    private func candidate(_ item: WorkItem, _ now: Double) -> Bool {
        guard item.dismissedAt == nil else { return false }
        if item.state == .starting || item.state == .running || item.state == .failed { return true }
        return item.endedAt.map { now - $0 < Self.hold * 1000 } ?? false
    }

    private func onBeat() {
        let now = Date().timeIntervalSince1970 * 1000
        admitWaiting(now)
        holdFinished(now)
    }

    /// A delegate whose card has had its chance to be on screen and is not:
    /// its chip comes in by itself, faded in if it started while the tray was
    /// here, simply there if it was already running when the screen opened.
    private func admitWaiting(_ now: Double) {
        for item in items {
            known[item.id] = known[item.id] ?? now
            let waiting = state.entered[item.instanceId] == nil && !state.left.contains(item.id) && candidate(item, now)
                && now - (known[item.id] ?? now) >= Self.settle * 1000
            if waiting, !state.cardVisible(item.instanceId) {
                state.admit(item.instanceId, item.createdAt < mountedAt ? .none : .fade)
            }
        }
    }

    /// Counts a finished chip's time on screen; paused while it is not being
    /// seen, or is being read. One that finished while the tray watched, once
    /// its check has had its beat, flies to its report if that row is in
    /// view; otherwise it stays out its hold and goes.
    private func holdFinished(_ now: Double) {
        let paused = UIApplication.shared.applicationState != .active || hovering || openKey != nil
        for chip in chips where chip.tone == .done || chip.tone == .cancelled {
            let item = chip.item
            // At load, one that finished moments ago shows for what is left.
            let start = chip.entry == .none ? item.endedAt.map { max(0, now - $0) } ?? 0 : 0
            let sofar = shownFor[item.id] ?? start
            let next = paused ? sofar : sofar + Self.tick * 1000
            shownFor[item.id] = next
            let lands = chip.tone == .done && next >= Self.liftAfter * 1000 && openKey != item.id && (item.endedAt ?? 0) > mountedAt
            if lands, let target = reportInView(item) {
                fly(item, to: target)
            } else if next >= Self.hold * 1000 {
                state.leave(item.id)
            }
        }
    }

    // MARK: The flight home

    /// The delegate's newest report in this session's transcript.
    private func report(of item: WorkItem) -> String? {
        guard let parentId, let transcript = hub.sessions.transcripts[parentId] else { return nil }
        return DelegateTrayState.report(of: item.instanceId, in: transcript.blocks)
    }

    /// The report's row, when it is drawn inside its transcript's view, above the composer.
    private func reportInView(_ item: WorkItem) -> UIView? {
        guard let parentId, let id = report(of: item), let target = state.reportRow[parentId]?(id),
              let window, target.window === window else { return nil }
        let box = target.convert(target.bounds, to: window)
        let top = convert(bounds, to: window).minY
        return box.height > 0 && box.minY + min(box.height, 28) <= top ? target : nil
    }

    /// The chip lifts off and lands on its report's label line: a copy flies
    /// (translate and scale on one clock) while the chip's slot closes, then
    /// fades as the row, held clear while it flew, fades in.
    private func fly(_ item: WorkItem, to target: UIView) {
        guard let chip = chipViews[item.id], let window, !UIAccessibility.isReduceMotionEnabled,
              let copy = chip.snapshotView(afterScreenUpdates: false) else {
            state.leave(item.id)
            target.alpha = 0
            Motion.easeOut.animator(Motion.durMenu) { target.alpha = 1 }.startAnimation()
            return
        }
        let from = chip.convert(chip.bounds, to: window)
        let to = target.convert(target.bounds, to: window)
        copy.frame = from
        copy.isUserInteractionEnabled = false
        window.addSubview(copy)
        chip.isHidden = true
        target.alpha = 0
        state.leave(item.id)
        let line = min(to.height, 26)
        let scale = min(1, line / from.height)
        // A flight and a half: the chip travels further than a row moves.
        let flight = UIViewPropertyAnimator(duration: Motion.durPanel * 1.5, timingParameters: Motion.easeInOut.parameters)
        flight.addAnimations {
            copy.transform = CGAffineTransform(scaleX: scale, y: scale)
            copy.frame.origin = CGPoint(x: to.minX, y: to.minY + (line - from.height * scale) / 2)
        }
        flight.addCompletion { _ in
            let landing = Motion.easeOut.animator(Motion.durMenu) {
                target.alpha = 1
                copy.alpha = 0
            }
            landing.addCompletion { _ in copy.removeFromSuperview() }
            landing.startAnimation()
        }
        flight.startAnimation()
    }

    // MARK: Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        row.frame = CGRect(x: 0, y: bounds.height - foot - chipHeight, width: bounds.width, height: chipHeight)
        fit()
        syncGround()
    }

    /// What does not fit at the floor goes into "+N", so the row never passes the composer's edge.
    private func fit() {
        let total = chips.count
        var count = total
        if bounds.width > 0 {
            count = 1
            for n in stride(from: total, through: 1, by: -1) {
                let over = total - n > 0 ? Self.more : 0
                if Double(n) * Self.chipFloor + Double(n - 1) * Self.gap + over <= bounds.width {
                    count = n
                    break
                }
            }
        }
        shown = Array(chips.prefix(count))
        folded = Array(chips.dropFirst(count))
        render()
    }

    private func render() {
        let keys = shown.map(\.item.id)
        let quiet = chips.allSatisfy { $0.entry == .none }
        for (key, view) in chipViews where !keys.contains(key) {
            chipViews[key] = nil
            if view.isHidden {
                view.removeFromSuperview()
            } else {
                Motion.easeOut.animator(Motion.durControl) { view.alpha = 0 }.also { $0.addCompletion { _ in view.removeFromSuperview() } }.startAnimation()
            }
            if openKey == key { close() }
        }
        var arrivals: [TrayChipView] = []
        for chip in shown {
            let id = chip.item.id
            let view = chipViews[id] ?? {
                let made = TrayChipView(height: chipHeight)
                made.addAction(UIAction { [weak self] _ in self?.pressed(id) }, for: .touchUpInside)
                made.onHover = { [weak self] over in if over { self?.chipEntered(id) } }
                row.addSubview(made)
                chipViews[id] = made
                arrivals.append(made)
                return made
            }()
            view.configure(chip, watched: (chip.item.endedAt ?? 0) > mountedAt, words: Self.stateWords(chip))
        }
        if folded.isEmpty {
            if let moreChip {
                self.moreChip = nil
                Motion.easeOut.animator(Motion.durControl) { moreChip.alpha = 0 }.also { $0.addCompletion { _ in moreChip.removeFromSuperview() } }.startAnimation()
                if openKey == "more" { close() }
            }
        } else {
            let view = moreChip ?? {
                let made = TrayChipView(height: chipHeight)
                made.addAction(UIAction { [weak self] _ in self?.pressed("more") }, for: .touchUpInside)
                made.onHover = { [weak self] over in if over { self?.chipEntered("more") } }
                row.addSubview(made)
                moreChip = made
                arrivals.append(made)
                return made
            }()
            view.configureMore(folded.count, needs: folded.contains { $0.tone == .needs })
        }
        place(keys, arrivals: arrivals)
        // The row comes and goes in the room kept for it: opacity only, so nothing standing on it moves.
        let visible: CGFloat = chips.isEmpty ? 0 : 1
        if row.alpha != visible {
            if quiet || window == nil {
                row.alpha = visible
            } else {
                Motion.easeOut.animator(Motion.durControl) { self.row.alpha = visible }.startAnimation()
            }
        }
        if let openKey, openKey != "more", let chip = chips.first(where: { $0.item.id == openKey }) { refreshPanel(chip) }
    }

    /// Chips share the row: each as wide as its words, between its floor and
    /// its ceiling, shrinking toward the floor together when the row is full.
    private func place(_ keys: [String], arrivals: [TrayChipView]) {
        let views = keys.compactMap { chipViews[$0] }
        let moreWidth = moreChip == nil ? 0 : 52.0
        let room = bounds.width - (moreChip == nil ? 0 : moreWidth + Self.gap) - Double(max(0, views.count - 1)) * Self.gap
        let widths = Self.flex(views.map(\.naturalWidth), room: room)
        var x = 0.0
        let moved = { [self] in
            for (view, width) in zip(views, widths) {
                view.frame = CGRect(x: x, y: 0, width: width, height: chipHeight)
                x += width + Self.gap
            }
            moreChip?.frame = CGRect(x: x, y: 0, width: moreWidth, height: chipHeight)
        }
        let settled = views.filter { !arrivals.contains($0) }
        if window == nil || UIAccessibility.isReduceMotionEnabled || settled.isEmpty || order == keys && arrivals.isEmpty {
            moved()
        } else {
            // The chips already standing travel to their new places (`reflow`).
            UIView.performWithoutAnimation {
                var at = 0.0
                for (view, width) in zip(views, widths) {
                    if arrivals.contains(view) { view.frame = CGRect(x: at, y: 0, width: width, height: chipHeight) }
                    at += width + Self.gap
                }
            }
            UIViewPropertyAnimator(duration: Motion.durPanel, timingParameters: Motion.easeDrawer.parameters).also { $0.addAnimations(moved) }.startAnimation()
        }
        order = keys
        for view in arrivals {
            guard let chip = view.chip else {
                Reflow.pop(view)
                continue
            }
            switch chip.entry {
            case .none: break
            case .fade: Reflow.pop(view)
            case .fly: land(view, chip.item.instanceId)
            }
        }
    }

    /// The chips' widths as the row's flexbox resolves them (`flex: 0 1 auto`,
    /// `min-inline-size: 120px`, `max-inline-size: 224px`): each at its
    /// content's width when the row has room, and when it has not, each
    /// giving up room in proportion to its content's width, one that reaches
    /// its floor or ceiling held there while the rest share what is left.
    static func flex(_ bases: [Double], room: Double) -> [Double] {
        var widths = bases
        var frozen = Array(repeating: false, count: bases.count)
        // Nothing grows: a chip whose content fits keeps it, within its bounds.
        if bases.reduce(0, +) <= room {
            return bases.map { min(chipCeiling, max(chipFloor, $0)) }
        }
        while true {
            let loose = bases.indices.filter { !frozen[$0] }
            guard !loose.isEmpty else { break }
            let held = bases.indices.filter { frozen[$0] }.reduce(0.0) { $0 + widths[$1] }
            let free = room - held - loose.reduce(0.0) { $0 + bases[$1] }
            let weight = loose.reduce(0.0) { $0 + bases[$1] }
            for index in loose {
                widths[index] = bases[index] + (weight > 0 ? free * bases[index] / weight : 0)
            }
            // CSS flexbox, "fix min/max violations": with no net violation every
            // chip is settled; otherwise the ones clamped the way the total is
            // off are held, and the rest share again.
            let clamped = widths.map { min(chipCeiling, max(chipFloor, $0)) }
            let drift = loose.reduce(0.0) { $0 + clamped[$1] - widths[$1] }
            for index in loose {
                let moved = clamped[index] - widths[index]
                if abs(drift) < 0.01 || (drift > 0 && moved > 0) || (drift < 0 && moved < 0) {
                    widths[index] = clamped[index]
                    frozen[index] = true
                }
            }
        }
        return widths
    }

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Tray")

    /// The mark flew in from its card; the chip's surface and words come in after it.
    private func land(_ view: TrayChipView, _ instanceId: String) {
        guard let window, let from = state.takeDeparture(instanceId), !UIAccessibility.isReduceMotionEnabled else {
            Reflow.pop(view)
            return
        }
        layoutIfNeeded()
        let to = view.mark.convert(view.mark.bounds, to: window)
        Self.log.info("chip \(instanceId, privacy: .public) flies from \(from.debugDescription, privacy: .public) to \(to.debugDescription, privacy: .public)")
        view.arrive(after: Motion.durControl)
        view.mark.transform = CGAffineTransform(translationX: from.minX - to.minX, y: from.minY - to.minY)
            .scaledBy(x: from.width / max(1, to.width), y: from.height / max(1, to.height))
        UIViewPropertyAnimator(duration: Motion.durPanel, timingParameters: Motion.easeDrawer.parameters)
            .also { $0.addAnimations { view.mark.transform = .identity } }.startAnimation()
    }

    // MARK: Words

    static func stateWords(_ chip: Chip) -> String {
        switch chip.tone {
        case .needs: "needs you, \(questionWords(chip.questions))"
        case .asked: "running, asked this session a question"
        default: chip.tone.rawValue
        }
    }

    static func questionWords(_ count: Int) -> String {
        count == 1 ? "1 question" : "\(count) questions"
    }

    private static func span(_ from: Double, _ to: Double) -> String {
        let minutes = Int((to - from) / 60000)
        if minutes < 1 { return "<1m" }
        return minutes < 60 ? "\(minutes)m" : "\(minutes / 60)h \(minutes % 60)m"
    }

    /// What a chip's change says: polite news, or an urgent question. A
    /// burst is said once, every change in it in one sentence.
    private func announce() {
        guard let parentId else { return }
        var urgent = ""
        for chip in chips {
            let was = said[chip.item.id]
            said[chip.item.id] = chip.tone
            if was == chip.tone || (was == nil && chip.entry == .none) { continue }
            if chip.tone == .needs {
                urgent = "\(chip.item.title) has a question"
                continue
            }
            let phrase: String?
            if was == nil {
                phrase = "started"
            } else {
                phrase = switch chip.tone {
                case .done: "finished"
                case .failed: "failed"
                case .cancelled: "was cancelled"
                default: nil
                }
            }
            if let phrase { politeQueue.append("\(chip.item.title) \(phrase)") }
        }
        if !urgent.isEmpty {
            state.news[parentId] = .init(polite: state.news[parentId]?.polite ?? "", assertive: urgent, at: Date())
            UIAccessibility.post(notification: .announcement, argument: NSAttributedString(string: urgent, attributes: [.accessibilitySpeechAnnouncementPriority: UIAccessibilityPriority.high]))
        }
        guard !politeQueue.isEmpty, flush == nil else { return }
        flush = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard let self, !Task.isCancelled else { return }
            let polite = politeQueue.joined(separator: ". ") + "."
            state.news[parentId] = .init(polite: polite, assertive: "", at: Date())
            UIAccessibility.post(notification: .announcement, argument: polite)
            politeQueue = []
            flush = nil
        }
    }

    // MARK: The panel

    private func frame(of key: String) -> CGRect? {
        (key == "more" ? moreChip : chipViews[key])?.frame
    }

    /// The panel's ground: the composer's host above the row, as wide as the
    /// row, so the panel stands at its chip and stays inside the row's edges.
    private func syncGround() {
        guard let host = panelHost, window != nil else { return }
        if ground.superview !== host { host.addSubview(ground) }
        let box = row.convert(row.bounds, to: host)
        ground.frame = CGRect(x: box.minX, y: 0, width: box.width, height: box.minY)
    }

    private func open(_ key: String, pin: Bool) {
        dwell?.cancel()
        closing?.cancel()
        guard let chip = frame(of: key), panelHost != nil else { return }
        syncGround()
        panel.room = min(320, ground.bounds.height - 16)
        let place = HoverPanel.Place(x: max(0, chip.minX), y: ground.bounds.height, origin: chip.width / 2, span: row.bounds.width)
        openKey = key
        pinned = pin || pinned
        ground.catches = pinned
        panel.show(key, content: content(key), at: place, in: ground)
        for (id, view) in chipViews { view.accessibilityValue = id == key ? "Expanded" : "Collapsed" }
    }

    private func close() {
        dwell?.cancel()
        closing?.cancel()
        guard openKey != nil else { return }
        openKey = nil
        pinned = false
        ground.catches = false
        panel.hide()
        for view in chipViews.values { view.accessibilityValue = "Collapsed" }
    }

    private func refreshPanel(_ chip: Chip) {
        guard panelChip != chip, let frame = frame(of: chip.item.id) else { return }
        let place = HoverPanel.Place(x: max(0, frame.minX), y: ground.bounds.height, origin: frame.width / 2, span: row.bounds.width)
        panel.show(chip.item.id, content: content(chip.item.id), at: place, in: ground)
    }

    private var panelChip: Chip?

    private func chipEntered(_ key: String) {
        guard !coarse else { return }
        closing?.cancel()
        dwell?.cancel()
        if openKey != nil, !pinned {
            if openKey != key { open(key, pin: false) }
        } else if openKey == nil {
            dwell = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                self?.open(key, pin: false)
            }
        }
    }

    private func pressed(_ key: String) {
        // A finished chip whose report is in the transcript takes the reader there.
        if let parentId, let done = chips.first(where: { $0.item.id == key && $0.tone == .done }), let report = report(of: done.item) {
            close()
            state.reveal[parentId] = report
            return
        }
        if openKey == key, pinned { close() } else { open(key, pin: true) }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        switch hover.state {
        case .began, .changed:
            hovering = true
            closing?.cancel()
        default:
            rootLeft()
        }
    }

    private func rootLeft() {
        hovering = false
        dwell?.cancel()
        guard !coarse, !pinned, openKey != nil else { return }
        closing = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            self?.close()
        }
    }

    private func content(_ key: String) -> UIView {
        if key == "more" {
            panelChip = nil
            let list = UIStackView()
            list.axis = .vertical
            list.spacing = 2
            for chip in folded {
                let row = TrayPanelRow(chip, coarse: coarse)
                row.addAction(UIAction { [weak self] _ in
                    self?.close()
                    self?.onOpen(chip.item.instanceId)
                }, for: .touchUpInside)
                list.addArrangedSubview(row)
            }
            return list
        }
        guard let chip = chips.first(where: { $0.item.id == key }) else { return UIView() }
        panelChip = chip
        let item = chip.item
        let mark = SessionMarkView(tile: 17)
        mark.configure(id: item.instanceId, place: item.instanceId, status: .idle)
        // `.ptitle` restates the size and weight only: its line is the body's (1.45).
        let title = KitLabel(TypeScale.typeLabel.with(leading: TypeScale.typeBody.leading), ink: Palette.inkStrong)
        title.text = item.title
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let glyph = TraySlot()
        glyph.show(chip.tone, panel: true, animated: false)
        glyph.isAccessibilityElement = true
        glyph.accessibilityLabel = Self.stateWords(chip)
        let elapsed = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        elapsed.tabular = true
        elapsed.text = Self.span(item.createdAt, item.endedAt ?? Date().timeIntervalSince1970 * 1000)
        elapsed.setContentHuggingPriority(.required, for: .horizontal)
        elapsed.setContentCompressionResistancePriority(.required, for: .horizontal)
        let jump = KitGhostButton(.external, label: "Open \(item.title) in its own view", side: 26)
        jump.addAction(UIAction { [weak self] _ in
            self?.close()
            self?.onOpen(item.instanceId)
        }, for: .primaryActionTriggered)
        // `.jump { margin-block: -5px }`: its 26pt box reaches past the head's line and adds nothing to its height.
        let jumpRoom = UIView()
        jump.translatesAutoresizingMaskIntoConstraints = false
        jumpRoom.addSubview(jump)
        NSLayoutConstraint.activate([
            jumpRoom.widthAnchor.constraint(equalToConstant: 26),
            jumpRoom.heightAnchor.constraint(equalToConstant: 16),
            jump.centerXAnchor.constraint(equalTo: jumpRoom.centerXAnchor),
            jump.centerYAnchor.constraint(equalTo: jumpRoom.centerYAnchor),
        ])
        let head = UIStackView(arrangedSubviews: [mark, title, glyph, elapsed, jumpRoom])
        head.spacing = Space.space2
        head.alignment = .center
        let tail = DelegateTailView(hub: hub, instanceId: item.instanceId)
        tail.note = Self.note(chip)
        let column = TrayPanelColumn(arrangedSubviews: [head, tail])
        column.axis = .vertical
        column.spacing = Space.space2
        column.onLayout = { [weak self] in self?.panel.contentChanged() }
        head.widthAnchor.constraint(greaterThanOrEqualToConstant: 240).isActive = true
        if chip.tone == .needs || chip.tone == .failed {
            let act = chip.tone == .needs
                ? KitButton.make("Open question", variant: .outline, height: .sm) { [weak self] in
                    self?.close()
                    self?.onOpen(item.instanceId)
                }
                : KitButton.make("Dismiss", variant: .ghost, height: .sm) { [weak self] in self?.dismiss(item) }
            let acts = UIStackView(arrangedSubviews: [act, UIView()])
            column.addArrangedSubview(acts)
            column.setCustomSpacing(Space.space3, after: tail)
        }
        return column
    }

    /// The row the tail ends on: the question waiting, or the failure.
    private static func note(_ chip: Chip) -> TailNote? {
        switch chip.tone {
        case .needs: TailNote(key: "needs:\(chip.question)", kind: .ask, text: chip.question)
        case .asked: TailNote(key: "asked:\(chip.question)", kind: .asked, text: chip.question)
        case .failed: TailNote(key: "fail", kind: .fail, text: chip.item.firstLines.error.isEmpty ? "It failed without saying why." : chip.item.firstLines.error)
        default: nil
        }
    }

    private func dismiss(_ item: WorkItem) {
        Task { @MainActor [weak self, hub] in
            do { try await hub.workItems.dismiss(item.id) } catch { Toast.error(error.localizedDescription, in: self?.window) }
        }
    }
}

/// The ground the tray's panel stands in: only the panel takes a touch, and
/// while a panel is pinned a press anywhere else closes it and goes on to
/// what it pressed.
private final class PanelGround: UIView {
    var onOutside: () -> Void = {}
    var catches = false

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        guard hit === self || hit == nil else { return hit }
        if catches, event?.type == .touches { DispatchQueue.main.async { [weak self] in self?.onOutside() } }
        return nil
    }

    /// The panel stands above the row; a press beside the ground is outside too.
    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        catches ? true : bounds.contains(point)
    }
}

/// The panel's column: it says when what it holds changed size.
private final class TrayPanelColumn: UIStackView {
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

/// One hidden delegate in the "+N" panel: its mark, its title, and its state in words.
private final class TrayPanelRow: UIControl {
    init(_ chip: DelegateTrayView.Chip, coarse: Bool) {
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let mark = SessionMarkView(tile: 17)
        mark.configure(id: chip.item.instanceId, place: chip.item.instanceId, status: .idle)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = chip.item.title
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        words.text = DelegateTrayView.stateWords(chip)
        words.setContentHuggingPriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [mark, title, words])
        line.spacing = Space.space2
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: coarse ? 44 : 30),
            line.leadingAnchor.constraint(equalTo: leadingAnchor),
            line.trailingAnchor.constraint(equalTo: trailingAnchor),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .link
        accessibilityLabel = "\(chip.item.title), \(DelegateTrayView.stateWords(chip))"
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TrayPanelRow is built in code")
    }

    /// The row's wash reaches a step past its words on each side (`margin-inline: -space-2`).
    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        backgroundColor = hover.state == .began || hover.state == .changed ? Palette.surfaceHover : .clear
    }
}

/// A chip's or a panel head's one mark of state (`.slot`, `.pstate`): a
/// spinner starting, the live dot running, the ask glyph with a question, a
/// check done, a triangle failed, a stop cancelled. A check or a triangle
/// taking the dot's place is drawn in from its leading edge over `durPop` as
/// it grows from 0.6; anything else cross-fades over `durControl`.
final class TraySlot: UIView {
    private var kind = ""
    private var shown: UIView?

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 16), heightAnchor.constraint(equalToConstant: 16)])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TraySlot is built in code")
    }

    func show(_ tone: DelegateTrayView.Tone, panel: Bool, animated: Bool) {
        let next = tone == .asked || tone == .needs ? "ask" : tone.rawValue
        guard next != kind else { return }
        kind = next
        let made: UIView
        switch tone {
        case .starting:
            let spinner = SpinnerView(frame: CGRect(x: 0, y: 0, width: 16, height: 16))
            spinner.tintColor = Palette.inkMuted
            spinner.isAccessibilityElement = false
            made = spinner
        case .running:
            let dot = UIView(frame: CGRect(x: 5.5, y: 5.5, width: 5, height: 5))
            dot.backgroundColor = Palette.statusLiveGlyph
            dot.layer.cornerRadius = 2.5
            let box = UIView(frame: CGRect(x: 0, y: 0, width: 16, height: 16))
            box.addSubview(dot)
            made = box
        case .asked: made = GlyphView(.ask, size: 16, tint: Palette.inkMuted)
        // A chip's own ink carries the question; in the panel it is the attention ink.
        case .needs: made = GlyphView(.ask, size: 16, tint: Palette.statusAttnInk)
        case .done: made = GlyphView(.passed, size: 16, tint: Palette.statusDoneInk)
        case .failed: made = GlyphView(.warning, size: 16, tint: Palette.statusFailInk)
        case .cancelled: made = GlyphView(.stop, size: 16, tint: Palette.inkMuted)
        }
        made.translatesAutoresizingMaskIntoConstraints = true
        made.frame = CGRect(x: 0, y: 0, width: 16, height: 16)
        let old = shown
        shown = made
        addSubview(made)
        guard animated, window != nil else {
            old?.removeFromSuperview()
            return
        }
        Motion.easeOut.animator(Motion.durControl) { old?.alpha = 0 }.also { $0.addCompletion { _ in old?.removeFromSuperview() } }.startAnimation()
        let ends = (tone == .done || tone == .failed) && !UIAccessibility.isReduceMotionEnabled
        if ends {
            let reveal = CALayer()
            reveal.backgroundColor = UIColor.black.cgColor
            reveal.anchorPoint = CGPoint(x: 0, y: 0.5)
            reveal.frame = CGRect(x: 0, y: 0, width: 16, height: 16)
            made.layer.mask = reveal
            let wipe = CABasicAnimation(keyPath: "bounds.size.width")
            wipe.fromValue = 0
            wipe.toValue = 16
            wipe.duration = Motion.durPop
            wipe.timingFunction = CAMediaTimingFunction(name: .easeOut)
            reveal.add(wipe, forKey: "wipe")
            made.transform = CGAffineTransform(scaleX: 0.6, y: 0.6)
            Motion.easeOut.animator(Motion.durPop) { made.transform = .identity }.also { $0.addCompletion { _ in made.layer.mask = nil } }.startAnimation()
        } else {
            made.alpha = 0
            Motion.easeOut.animator(Motion.durControl) { made.alpha = 1 }.startAnimation()
        }
    }
}

/// A chip (`.chip`): the attachment chip's surface (raised, on a hairline,
/// the tile's shadow) at `--radius-sm`, its mark, its title and what it has
/// to say, and its slot. It asks in the attention ink on its wash, and has
/// failed in the failure ink on its wash. It scales to the press scale under
/// the finger.
final class TrayChipView: UIControl {
    let mark = SessionMarkView(tile: 17)
    private let surface = UIView()
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let note = KitLabel(TypeScale.typeLabel.with(weight: .regular), ink: Palette.inkStrong)
    private let slot = TraySlot()
    private let words = UIStackView()
    private let line = UIStackView()
    private let count = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private(set) var chip: DelegateTrayView.Chip?
    var onHover: (Bool) -> Void = { _ in }
    private var over = false
    private var pulsed = false

    init(height: Double) {
        super.init(frame: .zero)
        surface.isUserInteractionEnabled = false
        surface.layer.cornerRadius = Radius.radiusSm
        surface.layer.cornerCurve = .continuous
        surface.layer.borderWidth = 1
        surface.boxShadow = Shadow.shadowTile
        addSubview(surface)
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        note.setContentHuggingPriority(.required, for: .horizontal)
        note.setContentCompressionResistancePriority(.required, for: .horizontal)
        words.addArrangedSubview(title)
        words.addArrangedSubview(note)
        words.spacing = Size.cPillGap
        words.alignment = .firstBaseline
        for part in [mark, words, slot] as [UIView] { line.addArrangedSubview(part) }
        line.spacing = Size.cPillGap
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        count.tabular = true
        count.textAlignment = .center
        count.isHidden = true
        addSubview(count)
        NSLayoutConstraint.activate([
            line.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            line.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
            // The "+N" fills the chip: a kit label lays out by constraints, so a frame alone leaves it ambiguous.
            count.leadingAnchor.constraint(equalTo: leadingAnchor),
            count.trailingAnchor.constraint(equalTo: trailingAnchor),
            count.topAnchor.constraint(equalTo: topAnchor),
            count.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityValue = "Collapsed"
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TrayChipView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TrayChipView is built in code")
    }

    /// The chip at the width its words ask for.
    var naturalWidth: Double {
        line.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width + Space.space2 * 2
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        surface.frame = bounds
    }

    /// `.touch-hit`: a finger's 44pt down the chip, and to the midpoint of the gap beside it.
    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        guard traitCollection.userInterfaceIdiom != .mac else { return bounds.contains(point) }
        return bounds.insetBy(dx: -Space.space2 / 2, dy: min(0, (bounds.height - 44) / 2)).contains(point)
    }

    func configure(_ next: DelegateTrayView.Chip, watched: Bool, words stateWords: String) {
        let was = chip
        chip = next
        line.isHidden = false
        count.isHidden = true
        mark.configure(id: next.item.instanceId, place: next.item.instanceId, status: .idle)
        title.text = next.item.title
        switch next.tone {
        case .needs: note.text = DelegateTrayView.questionWords(next.questions)
        case .failed, .cancelled: note.text = next.tone.rawValue
        default: note.text = nil
        }
        note.isHidden = note.text == nil
        slot.show(next.tone, panel: false, animated: was != nil)
        accessibilityLabel = "\(next.item.title), \(stateWords)"
        paint()
        // Finished while watched: one soft pulse of the success tint.
        if next.tone == .done, watched, !pulsed, window != nil {
            pulsed = true
            let rest = surface.backgroundColor
            UIView.animateKeyframes(withDuration: Motion.durFade * 2, delay: 0, options: [.calculationModeCubic]) {
                UIView.addKeyframe(withRelativeStartTime: 0, relativeDuration: 0.35) { self.surface.backgroundColor = Palette.statusDoneBg }
                UIView.addKeyframe(withRelativeStartTime: 0.35, relativeDuration: 0.65) { self.surface.backgroundColor = rest }
            }
        }
    }

    func configureMore(_ hidden: Int, needs: Bool) {
        chip = nil
        line.isHidden = true
        count.isHidden = false
        count.text = "+\(hidden)"
        accessibilityLabel = "\(hidden) more delegates"
        moreNeeds = needs
        paint()
    }

    private var moreNeeds = false

    /// The surface and the words come in after the mark that flew in.
    func arrive(after delay: TimeInterval) {
        for part in [surface, words, slot] as [UIView] {
            part.alpha = 0
            UIView.animate(withDuration: Motion.durMenu, delay: delay, options: [.curveEaseOut]) { part.alpha = 1 }
        }
    }

    private func paint() {
        let tone = chip?.tone
        let needs = tone == .needs || (chip == nil && moreNeeds)
        let failed = tone == .failed
        let ink = needs ? Palette.statusAttnInk : failed ? Palette.statusFailInk : Palette.inkStrong
        title.ink = ink
        count.ink = ink
        note.ink = tone == .cancelled ? Palette.inkMuted : ink
        surface.backgroundColor = needs ? Palette.statusAttnBg : failed ? Palette.statusFailBg : over ? Palette.surfaceHover : Palette.surfaceRaised
        surface.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let now = hover.state == .began || hover.state == .changed
        guard now != over else { return }
        over = now
        paint()
        onHover(now)
    }

    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue, !UIAccessibility.isReduceMotionEnabled else { return }
            let scale = isHighlighted ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) { self.transform = CGAffineTransform(scaleX: scale, y: scale) }.startAnimation()
        }
    }
}

private extension UIViewPropertyAnimator {
    func also(_ configure: (UIViewPropertyAnimator) -> Void) -> UIViewPropertyAnimator {
        configure(self)
        return self
    }
}
